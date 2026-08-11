import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../lib/admin";
import { avatarUrlForKey } from "../../../../lib/auth";
import { ensureAppSchema } from "../../../../lib/database-migrations";
import { notifyPlatform } from "../../../../lib/platform-realtime";

type ReportRow = {
  id: string;
  message_id: string;
  reason: string;
  created_at: number;
  status: string;
  resolution: string | null;
  body: string | null;
  deleted_at: number | null;
  sender_id: string | null;
  sender_name: string | null;
  sender_avatar: string | null;
  reporter_name: string;
};

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

function error(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(request: Request) {
  try {
    const d1 = getD1();
    await ensureAppSchema(d1);
    const auth = await requireAdminPermission(request, d1, adminIds(), "reports.read");
    if (auth.response) return auth.response;
    const reports = await d1.prepare(`SELECT r.id, r.message_id, r.reason, r.created_at, r.status, r.resolution,
        m.body, m.deleted_at, m.sender_id, sender.display_name AS sender_name, sender.avatar_key AS sender_avatar,
        reporter.display_name AS reporter_name
      FROM chat_reports r
      LEFT JOIN chat_messages m ON m.id = r.message_id
      LEFT JOIN users sender ON sender.id = m.sender_id
      JOIN users reporter ON reporter.id = r.reporter_id
      ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 100`).all<ReportRow>();
    const sanctions = await d1.prepare(`SELECT s.user_id, s.muted_until, s.banned_until, s.reason, s.updated_at,
        u.public_id, u.display_name, u.avatar_key
      FROM user_sanctions s JOIN users u ON u.id = s.user_id
      WHERE COALESCE(s.muted_until, 0) > ? OR COALESCE(s.banned_until, 0) > ?
      ORDER BY s.updated_at DESC LIMIT 100`).bind(Date.now(), Date.now()).all<{
        user_id: string; muted_until: number | null; banned_until: number | null; reason: string; updated_at: number;
        public_id: string | null; display_name: string; avatar_key: string | null;
      }>();
    return Response.json({
      reports: reports.results.map((row) => ({
        id: row.id,
        messageId: row.message_id,
        reason: row.reason,
        createdAt: row.created_at,
        status: row.status,
        resolution: row.resolution,
        message: row.body ?? "消息已不存在",
        deleted: Boolean(row.deleted_at || !row.body),
        targetUserId: row.sender_id,
        senderName: row.sender_name ?? "未知用户",
        senderAvatarUrl: avatarUrlForKey(row.sender_avatar),
        reporterName: row.reporter_name,
      })),
      sanctions: sanctions.results.map((row) => ({
        userId: row.user_id,
        publicId: row.public_id ?? "",
        displayName: row.display_name,
        avatarUrl: avatarUrlForKey(row.avatar_key),
        mutedUntil: row.muted_until,
        bannedUntil: row.banned_until,
        reason: row.reason,
        updatedAt: row.updated_at,
      })),
    });
  } catch (caught) {
    return error("server_error", caught instanceof Error ? caught.message : "管理数据暂时不可用", 500);
  }
}

export async function POST(request: Request) {
  try {
    const d1 = getD1();
    await ensureAppSchema(d1);
    const auth = await requireAdminPermission(request, d1, adminIds(), "reports.write");
    if (auth.response || !auth.user) return auth.response ?? error("auth_required", "请先登录", 401);
    const payload = await request.json() as {
      action?: "dismiss" | "delete_message" | "mute" | "ban" | "unmute" | "unban";
      reportId?: string;
      messageId?: string;
      targetUserId?: string;
      reason?: string;
      durationMinutes?: number;
    };
    const action = payload.action;
    if (!action || !["dismiss", "delete_message", "mute", "ban", "unmute", "unban"].includes(action)) {
      return error("invalid_action", "无法识别这个管理操作", 400);
    }
    const now = Date.now();
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 120) : "";
    if (!reason) return error("reason_required", "请输入操作理由", 400);
    let targetUserId = payload.targetUserId?.trim() || null;
    let messageId = payload.messageId?.trim() || null;
    if (payload.reportId) {
      const report = await d1.prepare(`SELECT r.message_id, m.sender_id FROM chat_reports r
        LEFT JOIN chat_messages m ON m.id = r.message_id WHERE r.id = ?`).bind(payload.reportId).first<{ message_id: string; sender_id: string | null }>();
      if (!report) return error("report_not_found", "举报记录不存在", 404);
      messageId ??= report.message_id;
      targetUserId ??= report.sender_id;
    }
    if (targetUserId === auth.user.id && ["mute", "ban"].includes(action)) return error("cannot_sanction_self", "不能限制自己的账号", 400);

    let durationMs: number | null = null;
    if (action === "dismiss") {
      if (!payload.reportId) return error("missing_report", "缺少举报记录", 400);
      await d1.prepare("UPDATE chat_reports SET status = 'dismissed', reviewed_by = ?, reviewed_at = ?, resolution = ? WHERE id = ?")
        .bind(auth.user.id, now, reason || "dismissed", payload.reportId).run();
    } else if (action === "delete_message") {
      if (!messageId) return error("missing_message", "缺少消息记录", 400);
      await d1.prepare("UPDATE chat_messages SET deleted_at = COALESCE(deleted_at, ?) WHERE id = ?").bind(now, messageId).run();
      await d1.prepare("UPDATE chat_reports SET status = 'resolved', reviewed_by = ?, reviewed_at = ?, resolution = ? WHERE message_id = ? AND status = 'open'")
        .bind(auth.user.id, now, reason || "message_deleted", messageId).run();
    } else if (action === "mute" || action === "ban") {
      if (!targetUserId) return error("missing_user", "缺少目标用户", 400);
      const durationMinutes = Math.max(1, Math.min(43_200, Math.round(Number(payload.durationMinutes) || (action === "mute" ? 10 : 1_440))));
      durationMs = durationMinutes * 60_000;
      const mutedUntil = action === "mute" ? now + durationMs : null;
      const bannedUntil = action === "ban" ? now + durationMs : null;
      await d1.prepare(`INSERT INTO user_sanctions (user_id, muted_until, banned_until, reason, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          muted_until = CASE WHEN excluded.muted_until IS NULL THEN user_sanctions.muted_until ELSE excluded.muted_until END,
          banned_until = CASE WHEN excluded.banned_until IS NULL THEN user_sanctions.banned_until ELSE excluded.banned_until END,
          reason = excluded.reason, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
        .bind(targetUserId, mutedUntil, bannedUntil, reason, auth.user.id, now).run();
      if (action === "ban") await d1.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(targetUserId).run();
      if (payload.reportId) await d1.prepare("UPDATE chat_reports SET status = 'resolved', reviewed_by = ?, reviewed_at = ?, resolution = ? WHERE id = ?")
        .bind(auth.user.id, now, action, payload.reportId).run();
    } else {
      if (!targetUserId) return error("missing_user", "缺少目标用户", 400);
      const column = action === "unmute" ? "muted_until" : "banned_until";
      await d1.prepare(`UPDATE user_sanctions SET ${column} = NULL, reason = ?, updated_by = ?, updated_at = ? WHERE user_id = ?`)
        .bind(reason, auth.user.id, now, targetUserId).run();
    }

    await d1.prepare(`INSERT INTO moderation_actions (id, admin_user_id, target_user_id, message_id, action, reason, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), auth.user.id, targetUserId, messageId, action, reason, durationMs, now).run();
    await writeAdminAudit(d1, {
      requestId: request.headers.get("x-request-id") ?? undefined,
      adminUserId: auth.user.id,
      adminRole: auth.role,
      module: "moderation",
      action,
      targetType: targetUserId ? "user" : messageId ? "message" : "report",
      targetId: targetUserId ?? messageId ?? payload.reportId ?? null,
      reason,
      after: { reportId: payload.reportId ?? null, durationMs },
    });
    await notifyPlatform({ type: "moderation_updated" });
    if (action === "delete_message") await notifyPlatform({ type: "chat_updated" });
    if (action === "ban" && targetUserId) await notifyPlatform({ type: "account_restricted", userIds: [targetUserId] });
    if (targetUserId) await notifyPlatform({ type: "friends_updated", userIds: [targetUserId] });
    return Response.json({ ok: true });
  } catch (caught) {
    return error("server_error", caught instanceof Error ? caught.message : "管理操作失败", 500);
  }
}
