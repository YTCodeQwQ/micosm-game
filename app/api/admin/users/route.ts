import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../lib/admin";
import { avatarUrlForKey, isAdminRole, maskedPhone } from "../../../../lib/auth";
import { ensureAppSchema } from "../../../../lib/database-migrations";
import { notifyPlatform } from "../../../../lib/platform-realtime";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

type UserRow = {
  id: string; public_id: string | null; phone: string; display_name: string; signature: string | null; avatar_key: string | null;
  role: string; created_at: number; updated_at: number; muted_until: number | null; banned_until: number | null; sanction_reason: string | null;
  session_count: number; go_rating: number | null; gomoku_rating: number | null;
};

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "users.read");
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.normalize("NFKC").trim().slice(0, 40) ?? "";
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 30));
  const search = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const rows = await d1.prepare(`SELECT u.id, u.public_id, u.phone, u.display_name, u.signature, u.avatar_key,
      COALESCE(ar.role, u.role, 'player') AS role, u.created_at, u.updated_at,
      s.muted_until, s.banned_until, s.reason AS sanction_reason,
      (SELECT COUNT(*) FROM user_sessions us WHERE us.user_id = u.id AND us.expires_at > ?) AS session_count,
      (SELECT rating FROM rank_profiles rp WHERE rp.user_id = u.id AND rp.game = 'go') AS go_rating,
      (SELECT rating FROM rank_profiles rp WHERE rp.user_id = u.id AND rp.game = 'gomoku') AS gomoku_rating
    FROM users u
    LEFT JOIN admin_roles ar ON ar.user_id = u.id
    LEFT JOIN user_sanctions s ON s.user_id = u.id
    WHERE (? = '' OR u.display_name LIKE ? ESCAPE '\\' OR u.public_id LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')
    ORDER BY CASE WHEN ? <> '' AND u.public_id = ? THEN 0 ELSE 1 END, u.updated_at DESC LIMIT ?`)
    .bind(Date.now(), query, search, search, search, query, query.toUpperCase(), limit).all<UserRow>();
  return Response.json({
    users: rows.results.map((row) => ({
      id: row.id,
      publicId: row.public_id ?? "",
      displayName: row.display_name,
      phone: maskedPhone(row.phone),
      signature: row.signature ?? "",
      avatarUrl: avatarUrlForKey(row.avatar_key),
      role: isAdminRole(row.role) ? row.role : "player",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sessionCount: Number(row.session_count ?? 0),
      sanction: { mutedUntil: row.muted_until, bannedUntil: row.banned_until, reason: row.sanction_reason ?? "" },
      ranks: { go: Number(row.go_rating ?? 0), gomoku: Number(row.gomoku_rating ?? 0) },
    })),
    query,
  });
}

export async function POST(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const payload = await request.json() as { action?: "revoke_sessions" | "set_role"; userId?: string; role?: string; reason?: string };
  const permission = payload.action === "set_role" ? "roles.write" : "users.sessions";
  const auth = await requireAdminPermission(request, d1, adminIds(), permission);
  if (auth.response || !auth.user || !auth.role) return auth.response ?? fail("admin_required", "需要管理员权限", 403);
  const userId = payload.userId?.trim();
  const reason = payload.reason?.trim().slice(0, 240) ?? "";
  if (!userId) return fail("missing_user", "缺少目标用户", 400);
  if (!reason) return fail("reason_required", "请填写操作原因", 400);
  const target = await d1.prepare("SELECT id, public_id, display_name, role FROM users WHERE id = ?").bind(userId)
    .first<{ id: string; public_id: string | null; display_name: string; role: string }>();
  if (!target) return fail("user_not_found", "没有找到这个用户", 404);

  if (payload.action === "revoke_sessions") {
    await d1.prepare("DELETE FROM user_sessions WHERE user_id = ?").bind(userId).run();
    await writeAdminAudit(d1, {
      requestId: request.headers.get("x-request-id") ?? undefined,
      adminUserId: auth.user.id, adminRole: auth.role, module: "users", action: "revoke_sessions",
      targetType: "user", targetId: userId, reason, before: { displayName: target.display_name }, after: { sessions: 0 },
    });
    await notifyPlatform({ type: "account_restricted", userIds: [userId] });
    return Response.json({ ok: true });
  }

  if (payload.action !== "set_role") return fail("invalid_action", "无法识别这个管理操作", 400);
  const role = payload.role?.trim() ?? "";
  if (role !== "player" && !isAdminRole(role)) return fail("invalid_role", "无法识别这个权限角色", 400);
  if (userId === auth.user.id && role !== "super_admin") return fail("cannot_demote_self", "不能降低自己的超级管理员权限", 400);
  const now = Date.now();
  if (role === "player") {
    await d1.prepare("DELETE FROM admin_roles WHERE user_id = ?").bind(userId).run();
  } else {
    await d1.prepare(`INSERT INTO admin_roles (user_id, role, assigned_by, reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, assigned_by = excluded.assigned_by, reason = excluded.reason, updated_at = excluded.updated_at`)
      .bind(userId, role, auth.user.id, reason, now, now).run();
  }
  await d1.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").bind(role, now, userId).run();
  await writeAdminAudit(d1, {
    requestId: request.headers.get("x-request-id") ?? undefined,
    adminUserId: auth.user.id, adminRole: auth.role, module: "roles", action: "set_role",
    targetType: "user", targetId: userId, reason, before: { role: target.role }, after: { role },
  });
  return Response.json({ ok: true });
}
