import type { FriendD1 } from "./friends";

export const RANK_NAMES = ["尘星", "微光", "星轨", "月环", "曜辰", "星穹", "天幕", "无垠"] as const;
const WIN_POINTS = [36, 33, 30, 27, 24, 22, 20, 18] as const;
const LOSS_POINTS = [0, 6, 10, 13, 16, 18, 20, 22] as const;

export function rankIndex(rating: number) {
  return Math.min(RANK_NAMES.length - 1, Math.max(0, Math.floor(rating / 100)));
}

export function rankLabel(rating: number) {
  const safeRating = Math.max(0, Math.floor(rating));
  const index = rankIndex(safeRating);
  if (index < RANK_NAMES.length - 1) return RANK_NAMES[index];
  return `无垠 ${Math.floor((safeRating - 700) / 20) + 1}星`;
}

export function rankProgress(rating: number) {
  const safeRating = Math.max(0, Math.floor(rating));
  if (safeRating >= 700) return { current: (safeRating - 700) % 20, required: 20 };
  return { current: safeRating % 100, required: 100 };
}

export function rankChange(ownRating: number, opponentRating: number, won: boolean, streak = 0) {
  const index = rankIndex(ownRating);
  const differenceAdjustment = Math.max(-6, Math.min(10, Math.round((opponentRating - ownRating) / 50)));
  if (won) return Math.max(12, WIN_POINTS[index] + differenceAdjustment + Math.min(3, Math.max(0, streak)) * 2);
  return -Math.max(0, LOSS_POINTS[index] - differenceAdjustment);
}

export async function ensureRankSchema(d1: FriendD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS rank_profiles (
    user_id TEXT NOT NULL,
    game TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 0,
    peak_rating INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    matches INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, game)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS rank_profiles_leaderboard_idx ON rank_profiles(game, rating, wins)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS ranked_queue (
    user_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    game TEXT NOT NULL,
    board_size INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS ranked_queue_match_idx ON ranked_queue(game, board_size, rating, created_at)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS rank_matches (
    room_id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    black_user_id TEXT NOT NULL,
    white_user_id TEXT NOT NULL,
    black_rating_before INTEGER NOT NULL,
    white_rating_before INTEGER NOT NULL,
    black_delta INTEGER,
    white_delta INTEGER,
    black_rating_after INTEGER,
    white_rating_after INTEGER,
    result TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    settled_at INTEGER
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS rank_matches_players_idx ON rank_matches(black_user_id, white_user_id, status)").run();
}
