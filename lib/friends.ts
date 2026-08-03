export type FriendD1Statement = {
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
  bind(...values: unknown[]): FriendD1Statement;
};

export type FriendD1 = { prepare(query: string): FriendD1Statement };

export const ONLINE_WINDOW_MS = 45_000;
export const GAME_INVITE_TTL_MS = 120_000;

export function friendPair(first: string, second: string) {
  return first < second ? [first, second] as const : [second, first] as const;
}

export async function ensureFriendSchema(d1: FriendD1) {
  const roomsTable = await d1.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_rooms'").first<{ name: string }>();
  if (roomsTable) {
    const roomColumns = await d1.prepare("PRAGMA table_info(game_rooms)").all<{ name: string }>();
    const columnNames = new Set(roomColumns.results.map((column) => column.name));
    if (!columnNames.has("host_user_id")) await d1.prepare("ALTER TABLE game_rooms ADD COLUMN host_user_id TEXT").run();
    if (!columnNames.has("guest_user_id")) await d1.prepare("ALTER TABLE game_rooms ADD COLUMN guest_user_id TEXT").run();
  }

  await d1.prepare(`CREATE TABLE IF NOT EXISTS friendships (
    user_low TEXT NOT NULL,
    user_high TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_low, user_high)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS friendships_status_idx ON friendships(status, updated_at)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS user_presence (
    user_id TEXT PRIMARY KEY,
    last_seen INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS user_presence_seen_idx ON user_presence(last_seen)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS game_invites (
    id TEXT PRIMARY KEY,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    game TEXT NOT NULL,
    status TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS game_invites_invitee_idx ON game_invites(invitee_id, status, expires_at)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS game_invites_room_idx ON game_invites(room_id, status)").run();
}
