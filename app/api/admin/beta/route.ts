import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import {
  betaSettings, FEEDBACK_CATEGORIES, generateBetaInviteCode, isFeedbackStatus, normalizeBetaInviteCode,
  updateBetaSettings, type BetaFeedbackRow, type BetaInviteRow,
} from "../../../../lib/beta";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../lib/admin";
import { ensureAppSchema } from "../../../../lib/database-migrations";
import { createNotification } from "../../../../lib/notifications";
import { featureEnabled, setFeatureFlag } from "../../../../lib/operations";
import { currentRankSeason, publicRankSeason } from "../../../../lib/rank";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function publicInvite(row: BetaInviteRow) {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    maxUses: row.max_uses,
    uses: row.uses,
    enabled: Boolean(row.enabled),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type FeedbackAdminRow = BetaFeedbackRow & { display_name: string; public_id: string; avatar_key: string | null };

function publicFeedback(row: FeedbackAdminRow) {
  return {
    id: row.id,
    category: row.category,
    categoryLabel: FEEDBACK_CATEGORIES[row.category] ?? FEEDBACK_CATEGORIES.other,
    title: row.title,
    body: row.body,
    pageContext: row.page_context,
    status: row.status,
    adminNote: row.admin_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: { displayName: row.display_name, publicId: row.public_id, avatarUrl: row.avatar_key ? `/api/avatar/${encodeURIComponent(row.avatar_key)}` : null },
  };
}

async function dashboard(d1: D1Database) {
  const [settings, betaMode, feedbackEnabled, season, invites, feedback] = await Promise.all([
    betaSettings(d1),
    featureEnabled(d1, "beta_mode"),
    featureEnabled(d1, "feedback_enabled"),
    currentRankSeason(d1),
    d1.prepare("SELECT * FROM beta_invites ORDER BY enabled DESC, created_at DESC LIMIT 100").all<BetaInviteRow>(),
    d1.prepare(`SELECT f.*, u.display_name, u.public_id, u.avatar_key
      FROM beta_feedback f JOIN users u ON u.id = f.user_id
      ORDER BY CASE f.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END, f.created_at DESC LIMIT 120`).all<FeedbackAdminRow>(),
  ]);
  return {
    generatedAt: Date.now(),
    settings: {
      betaMode,
      feedbackEnabled,
      programName: settings?.program_name ?? "Micosm Game 星海内测",
      notice: settings?.notice ?? "当前为内测环境。",
      updatedAt: settings?.updated_at ?? 0,
    },
    season: season ? publicRankSeason(season) : null,
    invites: invites.results.map(publicInvite),
    feedback: feedback.results.map(publicFeedback),
  };
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "beta.manage");
  if (auth.response) return auth.response;
  return Response.json(await dashboard(d1));
}

export async function POST(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "beta.manage");
  if (auth.response || !auth.user || !auth.role) return auth.response ?? fail("super_admin_required", "需要超级管理员权限", 403);
  const payload = await request.json() as Record<string, unknown>;
  const action = String(payload.action ?? "");
  const reason = String(payload.reason ?? "").normalize("NFKC").trim().slice(0, 240);
  const requestId = request.headers.get("x-request-id") ?? undefined;

  try {
    if (action === "update_program") {
      if (!reason) return fail("reason_required", "请填写调整内测环境的原因", 400);
      const before = await betaSettings(d1);
      const after = await updateBetaSettings(d1, { programName: String(payload.programName ?? ""), notice: String(payload.notice ?? ""), adminUserId: auth.user.id });
      await writeAdminAudit(d1, { requestId, adminUserId: auth.user.id, adminRole: auth.role, module: "beta", action, targetType: "beta_program", targetId: "current", reason, before, after });
    } else if (action === "set_flag") {
      const key = String(payload.key ?? "");
      if (!reason) return fail("reason_required", "请填写切换开关的原因", 400);
      if (!['beta_mode', 'feedback_enabled'].includes(key) || typeof payload.enabled !== "boolean") return fail("invalid_flag", "无法识别这个内测开关", 400);
      const before = await featureEnabled(d1, key as "beta_mode" | "feedback_enabled");
      await setFeatureFlag(d1, key as "beta_mode" | "feedback_enabled", payload.enabled, auth.user.id, reason);
      await writeAdminAudit(d1, { requestId, adminUserId: auth.user.id, adminRole: auth.role, module: "beta", action, targetType: "feature_flag", targetId: key, reason, before: { enabled: before }, after: { enabled: payload.enabled } });
    } else if (action === "create_invite") {
      const label = String(payload.label ?? "").normalize("NFKC").trim().slice(0, 30);
      const maxUses = Number(payload.maxUses ?? 1);
      const expiresAt = payload.expiresAt === null || payload.expiresAt === "" ? null : Number(payload.expiresAt);
      if (label.length < 2) return fail("label_required", "请填写邀请码用途", 400);
      if (!Number.isInteger(maxUses) || maxUses < 0 || maxUses > 10000) return fail("invalid_limit", "使用次数需要设置为 0 至 10000，0 代表不限次数", 400);
      if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) return fail("invalid_expiry", "邀请码过期时间需要晚于现在", 400);
      let code = "";
      for (let index = 0; index < 5; index += 1) {
        const candidate = normalizeBetaInviteCode(generateBetaInviteCode());
        const exists = await d1.prepare("SELECT id FROM beta_invites WHERE code = ?").bind(candidate).first<{ id: string }>();
        if (!exists) { code = candidate; break; }
      }
      if (!code) throw new Error("生成邀请码失败，请重试");
      const id = crypto.randomUUID();
      const now = Date.now();
      await d1.prepare(`INSERT INTO beta_invites
        (id, code, label, max_uses, uses, enabled, expires_at, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?)`)
        .bind(id, code, label, maxUses, expiresAt, auth.user.id, now, now).run();
      await writeAdminAudit(d1, { requestId, adminUserId: auth.user.id, adminRole: auth.role, module: "beta", action, targetType: "beta_invite", targetId: id, reason: reason || label, after: { code, label, maxUses, expiresAt } });
    } else if (action === "update_invite") {
      const inviteId = String(payload.inviteId ?? "").trim();
      const invite = await d1.prepare("SELECT * FROM beta_invites WHERE id = ?").bind(inviteId).first<BetaInviteRow>();
      if (!invite) return fail("invite_not_found", "没有找到这个邀请码", 404);
      if (typeof payload.enabled !== "boolean") return fail("invalid_state", "请指定邀请码状态", 400);
      if (!reason) return fail("reason_required", "请填写调整邀请码的原因", 400);
      await d1.prepare("UPDATE beta_invites SET enabled = ?, updated_at = ? WHERE id = ?").bind(payload.enabled ? 1 : 0, Date.now(), invite.id).run();
      await writeAdminAudit(d1, { requestId, adminUserId: auth.user.id, adminRole: auth.role, module: "beta", action, targetType: "beta_invite", targetId: invite.id, reason, before: publicInvite(invite), after: { enabled: payload.enabled } });
    } else if (action === "update_feedback") {
      const feedbackId = String(payload.feedbackId ?? "").trim();
      const status = String(payload.status ?? "");
      const adminNote = String(payload.adminNote ?? "").normalize("NFKC").trim().slice(0, 500);
      if (!isFeedbackStatus(status)) return fail("invalid_status", "无法识别这个反馈状态", 400);
      const before = await d1.prepare("SELECT * FROM beta_feedback WHERE id = ?").bind(feedbackId).first<BetaFeedbackRow>();
      if (!before) return fail("feedback_not_found", "没有找到这条反馈", 404);
      const now = Date.now();
      await d1.prepare("UPDATE beta_feedback SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?")
        .bind(status, adminNote, auth.user.id, now, now, feedbackId).run();
      await writeAdminAudit(d1, { requestId, adminUserId: auth.user.id, adminRole: auth.role, module: "beta", action, targetType: "beta_feedback", targetId: feedbackId, reason: reason || adminNote || `状态调整为 ${status}`, before: { status: before.status, adminNote: before.admin_note }, after: { status, adminNote } });
      await createNotification(d1, { userId: before.user_id, kind: "system", title: "内测反馈有新进展", message: adminNote || (status === "resolved" ? "你提交的问题已处理完成，感谢帮助我们改进。" : status === "reviewing" ? "你的反馈正在处理中。" : "你的反馈状态已更新。"), entityType: "beta_feedback", entityId: feedbackId, dedupeKey: `beta-feedback:${feedbackId}:${status}:${now}` });
    } else {
      return fail("invalid_action", "无法识别这个内测管理操作", 400);
    }
    return Response.json({ ok: true, ...(await dashboard(d1)) });
  } catch (error) {
    return fail("beta_operation_failed", error instanceof Error ? error.message : "内测管理操作失败", 400);
  }
}
