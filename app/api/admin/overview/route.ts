import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission } from "../../../../lib/admin";
import { ensureAppSchema } from "../../../../lib/database-migrations";

type CountRow = { count: number };

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

async function count(d1: ReturnType<typeof getD1>, sql: string, ...values: unknown[]) {
  const row = await d1.prepare(sql).bind(...values).first<CountRow>();
  return Number(row?.count ?? 0);
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "overview.read");
  if (auth.response || !auth.user || !auth.role) return auth.response ?? Response.json({ error: { code: "admin_required", message: "需要管理员权限" } }, { status: 403 });
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  const [users, newUsers, activeUsers, liveRooms, completedMatches, messages, openReports, activeSanctions, rankedQueue] = await Promise.all([
    count(d1, "SELECT COUNT(*) AS count FROM users"),
    count(d1, "SELECT COUNT(*) AS count FROM users WHERE created_at >= ?", dayAgo),
    count(d1, "SELECT COUNT(*) AS count FROM user_presence WHERE last_seen >= ?", fiveMinutesAgo),
    count(d1, "SELECT COUNT(*) AS count FROM game_rooms WHERE json_extract(state, '$.status') IN ('waiting', 'playing', 'scoring')"),
    count(d1, "SELECT COUNT(*) AS count FROM match_records WHERE ended_at >= ?", dayAgo),
    count(d1, "SELECT COUNT(*) AS count FROM chat_messages WHERE created_at >= ? AND deleted_at IS NULL", dayAgo),
    count(d1, "SELECT (SELECT COUNT(*) FROM chat_reports WHERE status = 'open') + (SELECT COUNT(*) FROM discussion_reports WHERE status = 'open') AS count"),
    count(d1, "SELECT COUNT(*) AS count FROM user_sanctions WHERE COALESCE(muted_until, 0) > ? OR COALESCE(banned_until, 0) > ?", now, now),
    count(d1, "SELECT COUNT(*) AS count FROM ranked_queue"),
  ]);
  const audit = await d1.prepare(`SELECT a.id, a.module, a.action, a.target_type, a.target_id, a.reason, a.created_at,
      u.display_name AS admin_name
    FROM admin_audit_log a LEFT JOIN users u ON u.id = a.admin_user_id
    ORDER BY a.created_at DESC LIMIT 8`).all<{
      id: string; module: string; action: string; target_type: string | null; target_id: string | null;
      reason: string; created_at: number; admin_name: string | null;
    }>();
  return Response.json({
    actor: { id: auth.user.id, publicId: auth.user.publicId, displayName: auth.user.displayName, role: auth.role, permissions: auth.permissions },
    stats: { users, newUsers, activeUsers, liveRooms, completedMatches, messages, openReports, activeSanctions, rankedQueue },
    recentAudit: audit.results.map((row) => ({
      id: row.id, module: row.module, action: row.action, targetType: row.target_type, targetId: row.target_id,
      reason: row.reason, createdAt: row.created_at, adminName: row.admin_name ?? "系统",
    })),
    generatedAt: now,
  });
}
