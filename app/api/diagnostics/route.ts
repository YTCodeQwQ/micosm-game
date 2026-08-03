import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { ensureAuthSchema, getSessionUser } from "../../../lib/auth";
import { ensureMatchDiagnosticsSchema, type MatchEventRow } from "../../../lib/match-diagnostics";

function diagnosticsEnabled() {
  const configured = (env as unknown as { DIAGNOSTICS_ENABLED?: string }).DIAGNOSTICS_ENABLED;
  return process.env.NODE_ENV !== "production" || configured === "true";
}

export async function GET(request: Request) {
  if (!diagnosticsEnabled()) return Response.json({ error: { code: "not_found", message: "页面不存在" } }, { status: 404 });

  const d1 = getD1();
  await ensureAuthSchema(d1);
  await ensureMatchDiagnosticsSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });

  const roomId = new URL(request.url).searchParams.get("roomId")?.trim().toUpperCase();
  let rows: { results: MatchEventRow[] };
  if (roomId) {
    const room = await d1.prepare("SELECT id FROM game_rooms WHERE id = ? AND (host_user_id = ? OR guest_user_id = ? OR black_user_id = ? OR white_user_id = ?)")
      .bind(roomId, user.id, user.id, user.id, user.id).first<{ id: string }>();
    if (!room) return Response.json({ error: { code: "room_not_found", message: "没有找到可查看的对局" } }, { status: 404 });
    rows = await d1.prepare("SELECT * FROM match_events WHERE room_id = ? ORDER BY created_at DESC LIMIT 100").bind(roomId).all<MatchEventRow>();
  } else {
    rows = await d1.prepare(`SELECT * FROM match_events
      WHERE actor_user_id = ? OR room_id IN (
        SELECT id FROM game_rooms WHERE host_user_id = ? OR guest_user_id = ? OR black_user_id = ? OR white_user_id = ?
      ) ORDER BY created_at DESC LIMIT 100`).bind(user.id, user.id, user.id, user.id, user.id).all<MatchEventRow>();
  }

  return Response.json({
    events: rows.results.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      requestId: row.request_id,
      type: row.event_type,
      roomVersion: row.room_version,
      details: JSON.parse(row.details || "{}") as Record<string, unknown>,
      createdAt: row.created_at,
    })),
  });
}
