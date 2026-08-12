import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../lib/admin";
import { ensureAppSchema } from "../../../../lib/database-migrations";
import { isFeatureFlagKey, listFeatureFlags, setFeatureFlag } from "../../../../lib/operations";
import { notifyPlatform } from "../../../../lib/platform-realtime";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

async function count(d1: ReturnType<typeof getD1>, sql: string, ...values: unknown[]) {
  const row = await d1.prepare(sql).bind(...values).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "operations.read");
  if (auth.response) return auth.response;
  const now = Date.now();
  const started = performance.now();
  const schema = await d1.prepare("SELECT MAX(version) AS version FROM app_schema_migrations").first<{ version: number | null }>();
  const databaseLatencyMs = Math.max(0, Math.round(performance.now() - started));
  const [liveRooms, matchmakingQueue, rankedQueue, activeUsers, recentErrors, flags] = await Promise.all([
    count(d1, "SELECT COUNT(*) AS count FROM game_rooms WHERE json_extract(state, '$.status') IN ('waiting', 'playing', 'scoring')"),
    count(d1, "SELECT COUNT(*) AS count FROM matchmaking_queue"),
    count(d1, "SELECT COUNT(*) AS count FROM ranked_queue"),
    count(d1, "SELECT COUNT(*) AS count FROM user_presence WHERE last_seen >= ?", now - 5 * 60_000),
    count(d1, "SELECT COUNT(*) AS count FROM match_events WHERE event_type = 'request_error' AND created_at >= ?", now - 60 * 60_000),
    listFeatureFlags(d1),
  ]);
  return Response.json({
    generatedAt: now,
    health: { database: "healthy", databaseLatencyMs, schemaVersion: Number(schema?.version ?? 0), liveRooms, matchmakingQueue, rankedQueue, activeUsers, recentErrors },
    flags,
  });
}

export async function POST(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "operations.write");
  if (auth.response || !auth.user || !auth.role) return auth.response ?? Response.json({ error: { code: "admin_required", message: "需要运维权限" } }, { status: 403 });
  const payload = await request.json() as { key?: string; enabled?: boolean; reason?: string };
  const reason = payload.reason?.trim() ?? "";
  if (!isFeatureFlagKey(payload.key) || typeof payload.enabled !== "boolean") return Response.json({ error: { code: "invalid_flag", message: "无法识别这个功能开关" } }, { status: 400 });
  if (reason.length < 4) return Response.json({ error: { code: "reason_required", message: "请填写至少 4 个字的操作原因" } }, { status: 400 });
  const before = (await listFeatureFlags(d1)).find((flag) => flag.key === payload.key);
  await setFeatureFlag(d1, payload.key, payload.enabled, auth.user.id, reason);
  await writeAdminAudit(d1, {
    requestId: request.headers.get("x-request-id") ?? undefined,
    adminUserId: auth.user.id,
    adminRole: auth.role,
    module: "operations",
    action: "set_feature_flag",
    targetType: "feature_flag",
    targetId: payload.key,
    reason,
    before: { enabled: before?.enabled },
    after: { enabled: payload.enabled },
  });
  await notifyPlatform({ type: "operations_updated" });
  return Response.json({ updated: true, flags: await listFeatureFlags(d1) });
}
