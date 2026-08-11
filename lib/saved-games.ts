import type { GameRecordSnapshot, MicosmGameFile } from "./game-record.ts";

type SavedGameStatement = {
  bind(...values: unknown[]): SavedGameStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

export type SavedGameD1 = { prepare(query: string): SavedGameStatement };

export type SavedGameRow = {
  id: string;
  user_id: string;
  source_record_id: string | null;
  title: string;
  game: string;
  mode: string;
  board_size: number;
  black_name: string;
  white_name: string;
  winner: string;
  reason: string;
  viewer_role: string;
  file_json: string;
  started_at: number;
  ended_at: number;
  created_at: number;
  updated_at: number;
};

export const MAX_CLOUD_SAVED_GAMES = 10;

export async function ensureSavedGameSchema(d1: SavedGameD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS saved_game_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    source_record_id TEXT,
    title TEXT NOT NULL,
    game TEXT NOT NULL,
    mode TEXT NOT NULL,
    board_size INTEGER NOT NULL,
    black_name TEXT NOT NULL,
    white_name TEXT NOT NULL,
    winner TEXT NOT NULL,
    reason TEXT NOT NULL,
    viewer_role TEXT NOT NULL,
    file_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS saved_game_records_user_recent_idx ON saved_game_records(user_id, updated_at DESC)").run();
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS saved_game_records_user_source_unique ON saved_game_records(user_id, source_record_id)").run();
}

export function defaultGameRecordTitle(record: Pick<GameRecordSnapshot, "game" | "players">) {
  const game = record.game === "go" ? "围棋" : record.game === "gomoku" ? "五子棋" : "黑白棋";
  return `${game} · ${record.players.black} 对 ${record.players.white}`.slice(0, 80);
}

export async function pruneSavedGames(d1: SavedGameD1, userId: string) {
  const excess = await d1.prepare(`SELECT id FROM saved_game_records WHERE user_id = ?
    ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT -1 OFFSET ?`).bind(userId, MAX_CLOUD_SAVED_GAMES).all<{ id: string }>();
  for (const row of excess.results) await d1.prepare("DELETE FROM saved_game_records WHERE id = ? AND user_id = ?").bind(row.id, userId).run();
  return excess.results.map((row) => row.id);
}

export function savedGameValues(file: MicosmGameFile) {
  const record = file.record;
  return {
    title: record.title,
    game: record.game,
    mode: record.mode,
    boardSize: record.boardSize,
    blackName: record.players.black,
    whiteName: record.players.white,
    winner: record.winner,
    reason: record.reason,
    viewerRole: record.viewerRole,
    fileJson: JSON.stringify(file),
    startedAt: record.startedAt,
    endedAt: record.endedAt,
  };
}
