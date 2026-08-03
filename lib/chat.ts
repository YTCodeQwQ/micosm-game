import type { FriendD1 } from "./friends";

export const WORLD_MESSAGE_LIMIT = 200;
export const WORLD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function cleanChatMessage(value: unknown) {
  if (typeof value !== "string") return "";
  return Array.from(value.normalize("NFKC").trim().replace(/\s+/g, " ")).slice(0, WORLD_MESSAGE_LIMIT).join("");
}

export async function ensureChatSchema(d1: FriendD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    hall TEXT NOT NULL DEFAULT 'main',
    sender_id TEXT NOT NULL,
    recipient_id TEXT,
    body TEXT NOT NULL DEFAULT '',
    room_id TEXT,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`).run();
  const columns = await d1.prepare("PRAGMA table_info(chat_messages)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "hall")) await d1.prepare("ALTER TABLE chat_messages ADD COLUMN hall TEXT NOT NULL DEFAULT 'main'").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS chat_messages_world_idx ON chat_messages(channel, created_at)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS chat_messages_hall_idx ON chat_messages(channel, hall, created_at)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS chat_messages_direct_idx ON chat_messages(sender_id, recipient_id, created_at)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS chat_reads (
    user_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    peer_id TEXT NOT NULL DEFAULT '',
    last_read_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, channel, peer_id)
  )`).run();
  await d1.prepare(`INSERT OR IGNORE INTO chat_reads (user_id, channel, peer_id, last_read_at)
    SELECT user_id, channel, 'main', last_read_at FROM chat_reads WHERE channel = 'world' AND peer_id = ''`).run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS chat_reports (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS chat_reports_unique ON chat_reports(message_id, reporter_id)").run();
}
