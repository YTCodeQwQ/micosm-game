import type { MatchState } from "./match-engine";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
};

export type MatchHistoryD1 = { prepare(query: string): D1Statement };

export type ArchivableRoom = {
  id: string;
  game: string;
  mode: string | null;
  board_size: number | null;
  black_user_id: string | null;
  white_user_id: string | null;
  black_name: string | null;
  white_name: string | null;
  black_avatar: string | null;
  white_avatar: string | null;
  version: number;
  created_at: number;
  updated_at: number;
};

export async function ensureMatchHistorySchema(d1: MatchHistoryD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS match_records (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    room_version INTEGER NOT NULL,
    game TEXT NOT NULL,
    mode TEXT NOT NULL,
    board_size INTEGER NOT NULL,
    black_user_id TEXT,
    white_user_id TEXT,
    black_name TEXT NOT NULL,
    white_name TEXT NOT NULL,
    black_avatar TEXT,
    white_avatar TEXT,
    winner TEXT NOT NULL,
    reason TEXT NOT NULL,
    state TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    UNIQUE(room_id, room_version)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS match_records_black_history_idx ON match_records(black_user_id, ended_at DESC)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS match_records_white_history_idx ON match_records(white_user_id, ended_at DESC)").run();
}

export function matchEndReason(state: MatchState) {
  if (state.resignedPlayer) return "resign";
  if (state.departedPlayer) return "departure";
  if (state.timedOutPlayer) return "timeout";
  if (state.winner === "draw") return "draw";
  if (state.game === "go" && state.finalScore) return "score";
  return "win";
}

export async function archiveFinishedMatch(d1: MatchHistoryD1, room: ArchivableRoom, state: MatchState) {
  if (state.status !== "ended" || !state.winner) return;
  const id = `${room.id}:${room.version}`;
  await d1.prepare(`INSERT OR IGNORE INTO match_records (
    id, room_id, room_version, game, mode, board_size,
    black_user_id, white_user_id, black_name, white_name, black_avatar, white_avatar,
    winner, reason, state, started_at, ended_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    id,
    room.id,
    room.version,
    room.game,
    room.mode ?? "private",
    room.board_size ?? state.size,
    room.black_user_id,
    room.white_user_id,
    room.black_name ?? "黑方",
    room.white_name ?? "白方",
    room.black_avatar,
    room.white_avatar,
    state.winner,
    matchEndReason(state),
    JSON.stringify(state),
    room.created_at,
    room.updated_at,
  ).run();
}
