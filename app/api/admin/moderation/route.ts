import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../lib/admin";
import { avatarUrlForKey } from "../../../../lib/auth";
import { ensureCommunitySchema } from "../../../../lib/community";
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

type DiscussionReportRow = {
  id: string;
  target_type: "post" | "comment";
  target_id: string;
  reason: string;
  created_at: number;
  status: string;
  resolution: string | null;
  title: string | null;
  body: string | null;
  content_status: string | null;
  sender_id: string | null;
  sender_name: string | null;
  sender_avatar: string | null;
  reporter_name: string;
};

type ModerationHistoryRow = {
  id: string;
  action: string;
  reason: string;
  duration_ms: number | null;
  created_at: number;
  target_user_id: string | null;
  target_name: string | null;
  target_public_id: string | null;
  admin_name: string;
};

const PERMANENT_SANCTION_UNTIL = 253_402_300_799_000;
const SANCTION_CATEGORIES = new Set(["spam", "harassment", "cheating", "abuse", "account", "other"]);
const SANCTION_CATEGORY_LABELS: Record<string, string> = {
  spam: "垃圾信息",
  harassment: "骚扰攻击",
  cheating: "作弊破坏",
  abuse: "违规内容",
  account: "账号风险",
  other: "其他原因",
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
    await ensureCommunitySchema(d1);
    const reports = await d1.prepare(`SELECT r.id, r.message_id, r.reason, r.created_at, r.status, r.resolution,
        m.body, m.deleted_at, m.sender_id, sender.display_name AS sender_name, sender.avatar_key AS sender_avatar,
        reporter.display_name AS reporter_name
      FROM chat_reports r
      LEFT JOIN chat_messages m ON m.id = r.message_id
      LEFT JOIN users sender ON sender.id = m.sender_id
      JOIN users reporter ON reporter.id = r.reporter_id
      ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 100`).all<ReportRow>();
    const discussionReports = await d1.prepare(`SELECT r.id, r.target_type, r.target_id, r.reason, r.created_at, r.status, r.resolution,
        p.title, COALESCE(p.body, c.body) AS body, COALESCE(p.status, c.status) AS content_status,
        COALESCE(p.user_id, c.user_id) AS sender_id, sender.display_name AS sender_name,
        sender.avatar_key AS sender_avatar, reporter.display_name AS reporter_name
      FROM discussion_reports r
      LEFT JOIN discussion_posts p ON r.target_type = 'post' AND p.id = r.target_id
      LEFT JOIN discussion_comments c ON r.target_type = 'comment' AND c.id = r.target_id
      LEFT JOIN users sender ON sender.id = COALESCE(p.user_id, c.user_id)
      JOIN users reporter ON reporter.id = r.reporter_id
      ORDER BY CASE WHEN r.status = 'open' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 100`).all<DiscussionReportRow>();
    const sanctions = await d1.prepare(`SELECT s.user_id, s.muted_until, s.banned_until, s.reason, s.updated_at,
        u.public_id, u.display_name, u.avatar_key
      FROM user_sanctions s JOIN users u ON u.id = s.user_id
      WHERE COALESCE(s.muted_until, 0) > ? OR COALESCE(s.banned_until, 0) > ?
      ORDER BY s.updated_at DESC LIMIT 100`).bind(Date.now(), Date.now()).all<{
        user_id: string; muted_until: number | null; banned_until: number | null; reason: string; updated_at: number;
         public_id: string | null; display_name: string; avatar_key: string | null;
       }>();
    const history = await d1.prepare(`SELECT a.id, a.action, a.reason, a.duration_ms, a.created_at, a.target_user_id,
        target.display_name AS target_name, target.public_id AS target_public_id, admin.display_name AS admin_name
      FROM moderation_actions a
      JOIN users admin ON admin.id = a.admin_user_id
      LEFT JOIN users target ON target.id = a.target_user_id
      WHERE a.action IN ('mute', 'ban', 'unmute', 'unban')
      ORDER BY a.created_at DESC LIMIT 80`).all<ModerationHistoryRow>();
    return Response.json({
      reports: [...reports.results.map((row) => ({
        id: row.id,
        messageId: row.message_id,
        source: "chat" as const,
        targetType: "message" as const,
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
      })), ...discussionReports.results.map((row) => ({
        id: row.id,
        messageId: row.target_id,
        source: "community" as const,
        targetType: row.target_type,
        reason: row.reason,
        createdAt: row.created_at,
        status: row.status,
        resolution: row.resolution,
        message: row.body ? `${row.target_type === "post" ? `【帖子】${row.title ?? "无标题"}\n` : "【评论】"}${row.body}` : "内容已不存在",
        deleted: row.content_status !== "visible",
        targetUserId: row.sender_id,
        senderName: row.sender_name ?? "未知用户",
        senderAvatarUrl: avatarUrlForKey(row.sender_avatar),
        reporterName: row.reporter_name,
      }))].sort((left, right) => left.status === right.status ? right.createdAt - left.createdAt : left.status === "open" ? -1 : 1).slice(0, 100),
      sanctions: sanctions.results.map((row) => ({
        userId: row.user_id,
        publicId: row.public_id ?? "",
        displayName: row.display_name,
        avatarUrl: avatarUrlForKey(row.avatar_key),
        mutedUntil: row.muted_until,
        bannedUntil: row.banned_until,
        mutePermanent: row.muted_until === PERMANENT_SANCTION_UNTIL,
        banPermanent: row.banned_until === PERMANENT_SANCTION_UNTIL,
        reason: row.reason,
        updatedAt: row.updated_at,
      })),
      history: history.results.map((row) => ({
        id: row.id,
        action: row.action,
        reason: row.reason,
        durationMs: row.duration_ms,
        createdAt: row.created_at,
        targetUserId: row.target_user_id,
        targetName: row.target_name ?? "未知用户",
        targetPublicId: row.target_public_id ?? "",
        adminName: row.admin_name,
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
    const payload = await request.json() as {
      action?: "dismiss" | "delete_message" | "mute" | "ban" | "unmute" | "unban";
      reportId?: string;
      messageId?: string;
      targetUserId?: string;
      reason?: string;
      durationMinutes?: number;
      permanent?: boolean;
      category?: string;
      internalNote?: string;
    };
    const action = payload.action;
    if (!action || !["dismiss", "delete_message", "mute", "ban", "unmute", "unban"].includes(action)) {
      return error("invalid_action", "无法识别这个管理操作", 400);
    }
    const sanctionAction = ["mute", "ban", "unmute", "unban"].includes(action);
    const auth = await requireAdminPermission(request, d1, adminIds(), sanctionAction ? "users.sanction" : "reports.write");
    if (auth.response || !auth.user) return auth.response ?? error("auth_required", "请先登录", 401);
    await ensureCommunitySchema(d1);
    const now = Date.now();
    const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 160) : "";
    if (!reason) return error("reason_required", "请输入操作理由", 400);
    const category = typeof payload.category === "string" && SANCTION_CATEGORIES.has(payload.category) ? payload.category : "";
    const internalNote = typeof payload.internalNote === "string" ? payload.internalNote.trim().slice(0, 240) : "";
    let targetUserId = payload.targetUserId?.trim() || null;
    let messageId = payload.messageId?.trim() || null;
    let reportSource: "chat" | "community" = "chat";
    let discussionTargetType: "post" | "comment" | null = null;
    if (payload.reportId) {
      const report = await d1.prepare(`SELECT r.message_id, m.sender_id FROM chat_reports r
        LEFT JOIN chat_messages m ON m.id = r.message_id WHERE r.id = ?`).bind(payload.reportId).first<{ message_id: string; sender_id: string | null }>();
      if (report) {
        messageId ??= report.message_id;
        targetUserId ??= report.sender_id;
      } else {
        const communityReport = await d1.prepare(`SELECT r.target_id, r.target_type, COALESCE(p.user_id, c.user_id) AS sender_id
          FROM discussion_reports r
          LEFT JOIN discussion_posts p ON r.target_type = 'post' AND p.id = r.target_id
          LEFT JOIN discussion_comments c ON r.target_type = 'comment' AND c.id = r.target_id
          WHERE r.id = ?`).bind(payload.reportId).first<{ target_id: string; target_type: "post" | "comment"; sender_id: string | null }>();
        if (!communityReport) return error("report_not_found", "举报记录不存在", 404);
        reportSource = "community";
        discussionTargetType = communityReport.target_type;
        messageId ??= communityReport.target_id;
        targetUserId ??= communityReport.sender_id;
      }
    }
    if (targetUserId === auth.user.id && ["mute", "ban"].includes(action)) return error("cannot_sanction_self", "不能限制自己的账号", 400);

    let durationMs: number | null = null;
    if (action === "dismiss") {
      if (!payload.reportId) return error("missing_report", "缺少举报记录", 400);
      const table = reportSource === "community" ? "discussion_reports" : "chat_reports";
      await d1.prepare(`UPDATE ${table} SET status = 'dismissed', reviewed_by = ?, reviewed_at = ?, resolution = ? WHERE id = ?`)
        .bind(auth.user.id, now, reason || "dismissed", payload.reportId).run();
    } else if (action === "delete_message") {
      if (!messageId) return error("missing_message", "缺少消息记录", 400);
      if (reportSource === "community" && discussionTargetType) {
        const contentTable = discussionTargetType === "post" ? "discussion_posts" : "discussion_comments";
        await d1.prepare(`UPDATE ${contentTable} SET status = 'hidden', updated_at = ? WHERE id = ?`).bind(now, messageId).run();
        await d1.prepare("UPDATE discussion_reports SET status = 'resolved', reviewed_by = ?, reviewed_at = ?, resolution = ? WHERE target_type = ? AND target_id = ? AND status = 'open'")
          .bind(auth.user.id, now, reason || "content_hidden", discussionTargetType, messageId).run();
      } else {
        await d1.prepare("UPDATE chat_messages SET deleted_at = COALESCE(deleted_at, ?) WHERE id = ?").bind(now, messageId).run();
        await d1.prepare("UPDATE chat_reports SET status = 'resolved', reviewed_by = ?, reviewed_at = ?, resolution = ? WHERE message_id = ? AND status = 'open'")
          .bind(auth.user.id, now, reason || "message_deleted", messageId).run();
      }
    } else if (action === "mute" || action === "ban") {
      if (!targetUserId) return error("missing_user", "缺少目标用户", 400);
      const permanent = action === "ban" && payload.permanent === true;
      const maxDurationMinutes = action === "mute" ? 43_200 : 525_600;
      const durationMinutes = Math.max(1, Math.min(maxDurationMinutes, Math.round(Number(payload.durationMinutes) || (action === "mute" ? 10 : 1_440))));
      durationMs = permanent ? null : durationMinutes * 60_000;
      const expiresAt = permanent ? PERMANENT_SANCTION_UNTIL : now + durationMinutes * 60_000;
      const mutedUntil = action === "mute" ? expiresAt : null;
      const bannedUntil = action === "ban" ? expiresAt : null;
      const sanctionReason = category ? `[${SANCTION_CATEGORY_LABELS[category]}] ${reason}` : reason;
      await d1.prepare(`INSERT INTO user_sanctions (user_id, muted_until, banned_until, reason, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          muted_until = CASE WHEN excluded.muted_until IS NULL THEN user_sanctions.muted_until ELSE excluded.muted_until END,
          banned_until = CASE WHEN excluded.banned_until IS NULL THEN user_sanctions.banned_until ELSE excluded.banned_until END,
          reason = excluded.reason, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
        .bind(targetUserId, mutedUntil, bannedUntil, sanctionReason, auth.user.id, now).run();
      if (action === "ban") await d1.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(targetUserId).run();
      if (payload.reportId) {
        const table = reportSource === "community" ? "discussion_reports" : "chat_reports";
        await d1.prepare(`UPDATE ${table} SET status = 'resolved', reviewed_by = ?, reviewed_at = ?, resolution = ? WHERE id = ?`)
          .bind(auth.user.id, now, action, payload.reportId).run();
      }
    } else {
      if (!targetUserId) return error("missing_user", "缺少目标用户", 400);
      const column = action === "unmute" ? "muted_until" : "banned_until";
      await d1.prepare(`UPDATE user_sanctions SET ${column} = NULL, reason = ?, updated_by = ?, updated_at = ? WHERE user_id = ?`)
        .bind(reason, auth.user.id, now, targetUserId).run();
    }

    const auditReason = [category ? `[${SANCTION_CATEGORY_LABELS[category]}] ${reason}` : reason, internalNote ? `内部备注：${internalNote}` : ""].filter(Boolean).join(" · ");
    await d1.prepare(`INSERT INTO moderation_actions (id, admin_user_id, target_user_id, message_id, action, reason, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), auth.user.id, targetUserId, messageId, action, auditReason, durationMs, now).run();
    await writeAdminAudit(d1, {
      requestId: request.headers.get("x-request-id") ?? undefined,
      adminUserId: auth.user.id,
      adminRole: auth.role,
      module: "moderation",
      action,
      targetType: targetUserId ? "user" : messageId ? "message" : "report",
      targetId: targetUserId ?? messageId ?? payload.reportId ?? null,
      reason: auditReason,
      after: { reportId: payload.reportId ?? null, durationMs, permanent: payload.permanent === true, category: category || null },
    });
    await notifyPlatform({ type: "moderation_updated" });
    if (action === "delete_message") await notifyPlatform({ type: reportSource === "community" ? "community_updated" : "chat_updated" });
    if (action === "ban" && targetUserId) await notifyPlatform({ type: "account_restricted", userIds: [targetUserId] });
    if (targetUserId) await notifyPlatform({ type: "friends_updated", userIds: [targetUserId] });
    return Response.json({ ok: true });
  } catch (caught) {
    return error("server_error", caught instanceof Error ? caught.message : "管理操作失败", 500);
  }
}
