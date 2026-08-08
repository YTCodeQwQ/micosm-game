import { getD1 } from "../../../db";
import { avatarUrlForKey, getSessionUser } from "../../../lib/auth";
import { ensureAppSchema } from "../../../lib/database-migrations";
import type { MatchGame, MatchState, SpectatorPolicy } from "../../../lib/match-engine";

type LobbyRoomRow = {
  id: string;
  game: MatchGame;
  mode: "private" | "matchmaking";
  spectator_policy: SpectatorPolicy;
  black_name: string | null;
  white_name: string | null;
  black_avatar: string | null;
  white_avatar: string | null;
  host_user_id: string | null;
  guest_user_id: string | null;
  black_user_id: string | null;
  white_user_id: string | null;
  white_player: string | null;
  state: string;
  version: number;
  updated_at: number;
  spectator_count: number;
};

function relatedUserIds(row: LobbyRoomRow, viewerId: string) {
  return [...new Set([row.host_user_id, row.guest_user_id, row.black_user_id, row.white_user_id]
    .filter((id): id is string => Boolean(id && id !== viewerId)))];
}

export async function GET(request: Request) {
  try {
    const d1 = getD1();
    await ensureAppSchema(d1);
    const user = await getSessionUser(request, d1);
    if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });

    const table = await d1.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_rooms'").first<{ name: string }>();
    if (!table) return Response.json({ rooms: [], counts: { main: 0, go: 0, gomoku: 0, reversi: 0 } });
    const roomColumns = await d1.prepare("PRAGMA table_info(game_rooms)").all<{ name: string }>();
    if (!roomColumns.results.some((column) => column.name === "spectator_policy")) {
      await d1.prepare("ALTER TABLE game_rooms ADD COLUMN spectator_policy TEXT NOT NULL DEFAULT 'off'").run();
    }
    await d1.prepare("CREATE INDEX IF NOT EXISTS game_rooms_lobby_idx ON game_rooms(mode, spectator_policy, updated_at)").run();
    await d1.prepare(`CREATE TABLE IF NOT EXISTS game_room_spectators (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (room_id, user_id)
    )`).run();
    await d1.prepare("CREATE INDEX IF NOT EXISTS game_room_spectators_seen_idx ON game_room_spectators(room_id, last_seen)").run();
    const hallValue = new URL(request.url).searchParams.get("hall") ?? "main";
    const hall = ["go", "gomoku", "reversi"].includes(hallValue) ? hallValue as MatchGame : "main";
    const now = Date.now();
    await d1.prepare("DELETE FROM game_room_spectators WHERE last_seen < ?").bind(now - 60_000).run();

    const rows = await d1.prepare(`SELECT r.id, r.game, r.mode, r.spectator_policy, r.black_name, r.white_name,
        r.black_avatar, r.white_avatar, r.host_user_id, r.guest_user_id, r.black_user_id, r.white_user_id,
        r.white_player, r.state, r.version, r.updated_at,
        (SELECT COUNT(*) FROM game_room_spectators s WHERE s.room_id = r.id AND s.last_seen >= ?) AS spectator_count
      FROM game_rooms r
      WHERE r.mode IN ('private', 'matchmaking') AND r.spectator_policy IN ('public', 'friends')
        AND r.updated_at >= ?
      ORDER BY CASE WHEN r.white_player IS NULL THEN 0 ELSE 1 END, r.updated_at DESC
      LIMIT 80`).bind(now - 60_000, now - 6 * 60 * 60 * 1000).all<LobbyRoomRow>();

    const friendshipRows = await d1.prepare("SELECT user_low, user_high FROM friendships WHERE status = 'accepted' AND (user_low = ? OR user_high = ?)")
      .bind(user.id, user.id).all<{ user_low: string; user_high: string }>();
    const friendIds = new Set(friendshipRows.results.map((row) => row.user_low === user.id ? row.user_high : row.user_low));
    const visible = rows.results.filter((row) => row.spectator_policy === "public"
      || [row.host_user_id, row.guest_user_id, row.black_user_id, row.white_user_id].includes(user.id)
      || relatedUserIds(row, user.id).some((id) => friendIds.has(id)));
    const live = visible.flatMap((row) => {
      try {
        const state = JSON.parse(row.state) as MatchState;
        if (!["waiting", "playing", "scoring"].includes(state.status)) return [];
        return [{
          id: row.id,
          game: row.game,
          mode: row.mode,
          spectatorPolicy: row.spectator_policy,
          status: state.status,
          turn: state.turn,
          moveCount: state.moves?.length ?? 0,
          boardSize: state.size,
          board: state.board,
          lastMove: state.lastMove,
          players: { black: row.black_name, white: row.white_name },
          profiles: {
            black: { avatarUrl: avatarUrlForKey(row.black_avatar) },
            white: { avatarUrl: avatarUrlForKey(row.white_avatar) },
          },
          joinable: row.mode === "private" && !row.white_player && row.host_user_id !== user.id,
          spectatable: Boolean(row.white_player) && ["playing", "scoring"].includes(state.status),
          spectatorCount: row.spectator_count,
          updatedAt: row.updated_at,
        }];
      } catch {
        return [];
      }
    });
    const counts = {
      main: live.length,
      go: live.filter((room) => room.game === "go").length,
      gomoku: live.filter((room) => room.game === "gomoku").length,
      reversi: live.filter((room) => room.game === "reversi").length,
    };
    return Response.json({ rooms: hall === "main" ? live : live.filter((room) => room.game === hall), counts });
  } catch (error) {
    return Response.json({ error: { code: "server_error", message: error instanceof Error ? error.message : "大厅暂时不可用" } }, { status: 500 });
  }
}
