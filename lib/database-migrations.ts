import { ensureAuthSchema } from "./auth";
import { ensureAdminSchema } from "./admin";
import { ensureChatSchema } from "./chat";
import { ensureCommunitySchema } from "./community";
import { ensureFriendSchema } from "./friends";
import { ensureMatchDiagnosticsSchema } from "./match-diagnostics";
import { ensureMatchHistorySchema } from "./match-history";
import { ensureModerationSchema } from "./moderation";
import { ensureOperationsSchema } from "./operations";
import { ensureNotificationSchema } from "./notifications";
import { ensurePolicySchema } from "./policies";
import { ensureRankSchema } from "./rank";
import { ensureRateLimitSchema } from "./rate-limit";
import { ensureSavedGameSchema } from "./saved-games";
import { ensureBetaSchema } from "./beta";

type AppStatement = {
  bind(...values: unknown[]): AppStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
};

export type AppD1 = { prepare(query: string): AppStatement };

const migrations = new WeakMap<object, Promise<void>>();

async function ensureMatchSchema(d1: AppD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS game_rooms (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    black_player TEXT NOT NULL,
    white_player TEXT,
    black_name TEXT,
    white_name TEXT,
    black_avatar TEXT,
    white_avatar TEXT,
    black_signature TEXT,
    white_signature TEXT,
    host_user_id TEXT,
    guest_user_id TEXT,
    black_user_id TEXT,
    white_user_id TEXT,
    mode TEXT NOT NULL DEFAULT 'private',
    board_size INTEGER NOT NULL DEFAULT 0,
    spectator_policy TEXT NOT NULL DEFAULT 'off',
    state TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  const columns = await d1.prepare("PRAGMA table_info(game_rooms)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const additions = [
    ["black_name", "ALTER TABLE game_rooms ADD COLUMN black_name TEXT"],
    ["white_name", "ALTER TABLE game_rooms ADD COLUMN white_name TEXT"],
    ["black_avatar", "ALTER TABLE game_rooms ADD COLUMN black_avatar TEXT"],
    ["white_avatar", "ALTER TABLE game_rooms ADD COLUMN white_avatar TEXT"],
    ["black_signature", "ALTER TABLE game_rooms ADD COLUMN black_signature TEXT"],
    ["white_signature", "ALTER TABLE game_rooms ADD COLUMN white_signature TEXT"],
    ["host_user_id", "ALTER TABLE game_rooms ADD COLUMN host_user_id TEXT"],
    ["guest_user_id", "ALTER TABLE game_rooms ADD COLUMN guest_user_id TEXT"],
    ["black_user_id", "ALTER TABLE game_rooms ADD COLUMN black_user_id TEXT"],
    ["white_user_id", "ALTER TABLE game_rooms ADD COLUMN white_user_id TEXT"],
    ["mode", "ALTER TABLE game_rooms ADD COLUMN mode TEXT NOT NULL DEFAULT 'private'"],
    ["board_size", "ALTER TABLE game_rooms ADD COLUMN board_size INTEGER NOT NULL DEFAULT 0"],
    ["spectator_policy", "ALTER TABLE game_rooms ADD COLUMN spectator_policy TEXT NOT NULL DEFAULT 'off'"],
  ] as const;
  for (const [name, sql] of additions) if (!names.has(name)) await d1.prepare(sql).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS game_rooms_lobby_idx ON game_rooms(mode, spectator_policy, updated_at)").run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS matchmaking_queue (
    queue_key TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS game_room_presence (
    room_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    last_seen INTEGER NOT NULL,
    UNIQUE(room_id, player_id)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS game_room_presence_seen_idx ON game_room_presence(room_id, last_seen)").run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS game_room_spectators (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS game_room_spectators_seen_idx ON game_room_spectators(room_id, last_seen)").run();
}

async function migrate(d1: AppD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`).run();

  await ensureAuthSchema(d1);
  await ensureMatchSchema(d1);
  await ensureFriendSchema(d1);
  await ensureChatSchema(d1);
  await ensureRankSchema(d1);
  await ensureMatchHistorySchema(d1);
  await ensureMatchDiagnosticsSchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (1, 'complete_game_baseline', ?)").bind(Date.now()).run();

  await ensureRateLimitSchema(d1);
  await ensureModerationSchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (2, 'security_and_moderation', ?)").bind(Date.now()).run();

  await ensureAdminSchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (3, 'admin_console_foundation', ?)").bind(Date.now()).run();

  await ensureSavedGameSchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (4, 'saved_game_library', ?)").bind(Date.now()).run();

  await ensureCommunitySchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (5, 'community_and_announcements', ?)").bind(Date.now()).run();

  await ensureRankSchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (6, 'admin_game_operations', ?)").bind(Date.now()).run();

  await ensurePolicySchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (7, 'versioned_policies', ?)").bind(Date.now()).run();

  await ensureOperationsSchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (8, 'operations_console', ?)").bind(Date.now()).run();

  await ensureNotificationSchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (9, 'persistent_notifications', ?)").bind(Date.now()).run();

  await ensureRankSchema(d1);
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (10, 'managed_rank_seasons', ?)").bind(Date.now()).run();

  await ensureBetaSchema(d1);
  await d1.prepare("UPDATE rank_seasons SET name = '星海内测季', summary = '当前为内测赛季，排位数据可能在正式上线前重置。', updated_at = ? WHERE code = 'S0' AND name = '公测赛季'").bind(Date.now()).run();
  await d1.prepare("INSERT OR IGNORE INTO app_schema_migrations (version, name, applied_at) VALUES (11, 'beta_program_and_feedback', ?)").bind(Date.now()).run();

  await d1.prepare("PRAGMA optimize").run();
}

export async function ensureAppSchema(d1: AppD1) {
  let running = migrations.get(d1 as object);
  if (!running) {
    running = migrate(d1).catch((error) => {
      migrations.delete(d1 as object);
      throw error;
    });
    migrations.set(d1 as object, running);
  }
  await running;
}
