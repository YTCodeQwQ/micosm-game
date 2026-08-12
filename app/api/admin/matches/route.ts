import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission } from "../../../../lib/admin";
import { ensureAppSchema } from "../../../../lib/database-migrations";
import type { MatchState } from "../../../../lib/match-engine";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

function safeJson<T>(value: string | null, fallback: T): T {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

type RecordRow = {
  id: string; room_id: string; game: string; mode: string; board_size: number;
  black_user_id: string | null; white_user_id: string | null; black_name: string; white_name: string;
  winner: string; reason: string; state: string; started_at: number; ended_at: number;
  rank_status: string | null;
};

function publicRecord(row: RecordRow, includeState = false) {
  const state = safeJson<MatchState>(row.state, {} as MatchState);
  return {
    id: row.id, roomId: row.room_id, game: row.game, mode: row.mode, boardSize: row.board_size,
    players: { black: row.black_name, white: row.white_name }, winner: row.winner, reason: row.reason,
    moveCount: state.moves?.filter((move) => move.type !== "resumeGo").length ?? 0,
    finalScore: state.finalScore ?? null, startedAt: row.started_at, endedAt: row.ended_at,
    rankStatus: row.rank_status,
    ...(includeState ? { state } : {}),
  };
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "matches.read");
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim().slice(0, 100) ?? "";

  if (id) {
    const record = await d1.prepare(`SELECT mr.*, rm.status AS rank_status FROM match_records mr
      LEFT JOIN rank_matches rm ON rm.room_id = mr.room_id
      WHERE mr.id = ? OR mr.room_id = ? ORDER BY mr.ended_at DESC LIMIT 1`).bind(id, id).first<RecordRow>();
    const roomId = record?.room_id ?? id;
    const events = await d1.prepare(`SELECT event_type, actor_player_id, room_version, details, request_id, created_at
      FROM match_events WHERE room_id = ? ORDER BY created_at ASC LIMIT 300`).bind(roomId)
      .all<{ event_type: string; actor_player_id: string | null; room_version: number | null; details: string; request_id: string; created_at: number }>();
    if (record) {
      return Response.json({
        kind: "record",
        match: publicRecord(record, true),
        events: events.results.map((event) => ({ type: event.event_type, actorPlayerId: event.actor_player_id, roomVersion: event.room_version, details: safeJson(event.details, {}), requestId: event.request_id, createdAt: event.created_at })),
      });
    }
    const live = await d1.prepare(`SELECT id, game, mode, board_size, black_name, white_name, state, version, spectator_policy, created_at, updated_at,
      (SELECT COUNT(*) FROM game_room_spectators s WHERE s.room_id = game_rooms.id AND s.last_seen > ?) AS spectator_count
      FROM game_rooms WHERE id = ?`).bind(Date.now() - 45_000, id)
      .first<{ id: string; game: string; mode: string; board_size: number; black_name: string | null; white_name: string | null; state: string; version: number; spectator_policy: string; created_at: number; updated_at: number; spectator_count: number }>();
    if (!live) return Response.json({ error: { code: "match_not_found", message: "没有找到这盘棋" } }, { status: 404 });
    return Response.json({
      kind: "live",
      match: { roomId: live.id, game: live.game, mode: live.mode, boardSize: live.board_size, players: { black: live.black_name ?? "黑方", white: live.white_name ?? "等待加入" }, state: safeJson(live.state, {}), version: live.version, spectatorPolicy: live.spectator_policy, spectatorCount: Number(live.spectator_count ?? 0), startedAt: live.created_at, updatedAt: live.updated_at },
      events: events.results.map((event) => ({ type: event.event_type, actorPlayerId: event.actor_player_id, roomVersion: event.room_version, details: safeJson(event.details, {}), requestId: event.request_id, createdAt: event.created_at })),
    });
  }

  const query = url.searchParams.get("q")?.normalize("NFKC").trim().slice(0, 60) ?? "";
  const game = ["go", "gomoku", "reversi"].includes(url.searchParams.get("game") ?? "") ? url.searchParams.get("game")! : "";
  const mode = ["private", "matchmaking", "ranked", "ai"].includes(url.searchParams.get("mode") ?? "") ? url.searchParams.get("mode")! : "";
  const search = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const records = await d1.prepare(`SELECT mr.*, rm.status AS rank_status FROM match_records mr
    LEFT JOIN rank_matches rm ON rm.room_id = mr.room_id
    LEFT JOIN users bu ON bu.id = mr.black_user_id LEFT JOIN users wu ON wu.id = mr.white_user_id
    WHERE (? = '' OR mr.room_id LIKE ? ESCAPE '\\' OR mr.black_name LIKE ? ESCAPE '\\' OR mr.white_name LIKE ? ESCAPE '\\' OR bu.public_id LIKE ? ESCAPE '\\' OR wu.public_id LIKE ? ESCAPE '\\')
      AND (? = '' OR mr.game = ?) AND (? = '' OR mr.mode = ?)
    ORDER BY mr.ended_at DESC LIMIT 80`).bind(query, search, search, search, search, search, game, game, mode, mode).all<RecordRow>();
  const liveRooms = await d1.prepare(`SELECT id, game, mode, board_size, black_name, white_name, state, updated_at,
    (SELECT COUNT(*) FROM game_room_spectators s WHERE s.room_id = game_rooms.id AND s.last_seen > ?) AS spectator_count
    FROM game_rooms WHERE (? = '' OR id LIKE ? ESCAPE '\\' OR black_name LIKE ? ESCAPE '\\' OR white_name LIKE ? ESCAPE '\\')
      AND (? = '' OR game = ?) AND (? = '' OR mode = ?) ORDER BY updated_at DESC LIMIT 30`)
    .bind(Date.now() - 45_000, query, search, search, search, game, game, mode, mode)
    .all<{ id: string; game: string; mode: string; board_size: number; black_name: string | null; white_name: string | null; state: string; updated_at: number; spectator_count: number }>();
  return Response.json({
    records: records.results.map((row) => publicRecord(row)),
    liveRooms: liveRooms.results.map((row) => { const state = safeJson<MatchState>(row.state, {} as MatchState); return { roomId: row.id, game: row.game, mode: row.mode, boardSize: row.board_size, players: { black: row.black_name ?? "黑方", white: row.white_name ?? "等待加入" }, status: state.status ?? "waiting", moveCount: state.moves?.length ?? 0, spectatorCount: Number(row.spectator_count ?? 0), updatedAt: row.updated_at }; }),
  });
}
