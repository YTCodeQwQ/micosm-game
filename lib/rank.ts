import type { FriendD1 } from "./friends";

export const RANK_NAMES = ["尘星", "微光", "星轨", "月环", "曜辰", "星穹", "天幕", "无垠"] as const;
const WIN_POINTS = [36, 33, 30, 27, 24, 22, 20, 18] as const;
const LOSS_POINTS = [0, 6, 10, 13, 16, 18, 20, 22] as const;

export type RankGame = "go" | "gomoku";
export type RankSeasonStatus = "draft" | "active" | "closing" | "closed";
export type RankSeasonRow = {
  id: string;
  code: string;
  name: string;
  summary: string;
  status: RankSeasonStatus;
  starts_at: number;
  ends_at: number;
  go_enabled: number;
  gomoku_enabled: number;
  carry_percent: number;
  created_by: string | null;
  activated_by: string | null;
  closed_by: string | null;
  created_at: number;
  updated_at: number;
  activated_at: number | null;
  closed_at: number | null;
};

export type PublicRankSeason = {
  id: string;
  code: string;
  name: string;
  summary: string;
  status: RankSeasonStatus;
  startsAt: number;
  endsAt: number;
  goEnabled: boolean;
  gomokuEnabled: boolean;
  carryPercent: number;
  activatedAt: number | null;
  closedAt: number | null;
};

export const LEGACY_RANK_SEASON_ID = "season-public-beta";

export function publicRankSeason(row: RankSeasonRow): PublicRankSeason {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    summary: row.summary,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    goEnabled: Boolean(row.go_enabled),
    gomokuEnabled: Boolean(row.gomoku_enabled),
    carryPercent: row.carry_percent,
    activatedAt: row.activated_at,
    closedAt: row.closed_at,
  };
}

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
  await d1.prepare(`CREATE TABLE IF NOT EXISTS rank_seasons (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    go_enabled INTEGER NOT NULL DEFAULT 1,
    gomoku_enabled INTEGER NOT NULL DEFAULT 1,
    carry_percent INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    activated_by TEXT,
    closed_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    activated_at INTEGER,
    closed_at INTEGER
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS rank_seasons_status_idx ON rank_seasons(status, starts_at DESC)").run();
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS rank_seasons_one_current_idx ON rank_seasons((1)) WHERE status IN ('active', 'closing')").run();

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
  const queueColumns = await d1.prepare("PRAGMA table_info(ranked_queue)").all<{ name: string }>();
  if (!queueColumns.results.some((column) => column.name === "season_id")) await d1.prepare("ALTER TABLE ranked_queue ADD COLUMN season_id TEXT").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS ranked_queue_season_match_idx ON ranked_queue(season_id, game, board_size, rating, created_at)").run();

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
  const matchColumns = await d1.prepare("PRAGMA table_info(rank_matches)").all<{ name: string }>();
  if (!matchColumns.results.some((column) => column.name === "season_id")) await d1.prepare("ALTER TABLE rank_matches ADD COLUMN season_id TEXT").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS rank_matches_players_idx ON rank_matches(black_user_id, white_user_id, status)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS rank_matches_season_idx ON rank_matches(season_id, game, status, created_at DESC)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS rank_corrections (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    game TEXT NOT NULL,
    black_user_id TEXT NOT NULL,
    white_user_id TEXT NOT NULL,
    black_delta INTEGER NOT NULL,
    white_delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    admin_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS rank_corrections_room_unique ON rank_corrections(room_id)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS rank_corrections_created_idx ON rank_corrections(created_at DESC)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS rank_season_standings (
    season_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    game TEXT NOT NULL,
    position INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    peak_rating INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    draws INTEGER NOT NULL,
    streak INTEGER NOT NULL,
    matches INTEGER NOT NULL,
    snapshot_at INTEGER NOT NULL,
    PRIMARY KEY (season_id, user_id, game)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS rank_season_standings_board_idx ON rank_season_standings(season_id, game, position)").run();

  const now = Date.now();
  const firstSeasonEnd = now + 90 * 24 * 60 * 60 * 1000;
  await d1.prepare(`INSERT INTO rank_seasons
    (id, code, name, summary, status, starts_at, ends_at, go_enabled, gomoku_enabled, carry_percent, created_by, activated_by, closed_by, created_at, updated_at, activated_at, closed_at)
    SELECT ?, 'S0', '星海内测季', '当前为内测赛季，排位数据可能在正式上线前重置。', 'active', ?, ?, 1, 1, 100, NULL, NULL, NULL, ?, ?, ?, NULL
    WHERE NOT EXISTS (SELECT 1 FROM rank_seasons)`)
    .bind(LEGACY_RANK_SEASON_ID, now, firstSeasonEnd, now, now, now).run();
  await d1.prepare("UPDATE ranked_queue SET season_id = ? WHERE season_id IS NULL OR season_id = ''").bind(LEGACY_RANK_SEASON_ID).run();
  await d1.prepare("UPDATE rank_matches SET season_id = ? WHERE season_id IS NULL OR season_id = ''").bind(LEGACY_RANK_SEASON_ID).run();
}

export async function currentRankSeason(d1: FriendD1) {
  return await d1.prepare("SELECT * FROM rank_seasons WHERE status IN ('active', 'closing') ORDER BY activated_at DESC LIMIT 1").first<RankSeasonRow>();
}

export async function latestRankSeason(d1: FriendD1) {
  return await d1.prepare("SELECT * FROM rank_seasons ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'closing' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END, COALESCE(activated_at, starts_at) DESC LIMIT 1").first<RankSeasonRow>();
}

async function clearSeasonQueue(d1: FriendD1, seasonId: string, game?: RankGame) {
  const gameClause = game ? " AND game = ?" : "";
  const roomIds = await d1.prepare(`SELECT room_id FROM ranked_queue WHERE season_id = ?${gameClause}`)
    .bind(...(game ? [seasonId, game] : [seasonId])).all<{ room_id: string }>();
  for (const row of roomIds.results) {
    await d1.prepare("DELETE FROM game_rooms WHERE id = ? AND mode = 'ranked' AND white_player IS NULL").bind(row.room_id).run();
  }
  await d1.prepare(`DELETE FROM ranked_queue WHERE season_id = ?${gameClause}`)
    .bind(...(game ? [seasonId, game] : [seasonId])).run();
}

export async function resolveRankSeason(d1: FriendD1) {
  let season = await currentRankSeason(d1);
  const now = Date.now();
  if (season?.status === "active" && season.ends_at <= now) {
    const result = await d1.prepare("UPDATE rank_seasons SET status = 'closing', updated_at = ? WHERE id = ? AND status = 'active'")
      .bind(now, season.id).run();
    if (result.meta.changes) await clearSeasonQueue(d1, season.id);
    season = await currentRankSeason(d1);
  }
  return season ?? await latestRankSeason(d1);
}

export async function rankSeasonForGame(d1: FriendD1, game: RankGame) {
  const season = await resolveRankSeason(d1);
  const now = Date.now();
  const enabled = season ? game === "go" ? Boolean(season.go_enabled) : Boolean(season.gomoku_enabled) : false;
  const playable = Boolean(season && season.status === "active" && season.starts_at <= now && season.ends_at > now && enabled);
  const reason = !season
    ? "当前没有排位赛季"
    : season.status === "draft"
      ? "新赛季尚未激活"
      : season.status === "closing"
        ? "本赛季已停止报名，正在等待在途对局结束"
        : season.status === "closed"
          ? "本赛季已经结束"
          : season.starts_at > now
            ? "本赛季尚未开始"
            : !enabled
              ? `${game === "go" ? "围棋" : "五子棋"}未在本赛季开放`
              : "排位暂不可用";
  return { season, playable, reason: playable ? "" : reason };
}

export async function closeRankSeasonQueue(d1: FriendD1, seasonId: string, game?: RankGame) {
  await clearSeasonQueue(d1, seasonId, game);
}
