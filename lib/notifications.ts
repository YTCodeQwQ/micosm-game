type NotificationStatement = {
  bind(...values: unknown[]): NotificationStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

export type NotificationD1 = { prepare(query: string): NotificationStatement };

export type NotificationKind = "friend_request" | "friend_accepted" | "game_invite" | "invite_declined" | "direct_message" | "community_reply" | "match_result" | "system";

export async function ensureNotificationSchema(d1: NotificationD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS user_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    actor_user_id TEXT,
    entity_type TEXT,
    entity_id TEXT,
    dedupe_key TEXT,
    read_at INTEGER,
    created_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON user_notifications(user_id, created_at DESC)").run();
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_dedupe_unique ON user_notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL").run();
}

export async function createNotification(d1: NotificationD1, input: {
  userId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
}) {
  if (!input.userId || input.userId === input.actorUserId) return false;
  const result = await d1.prepare(`INSERT OR IGNORE INTO user_notifications (
    id, user_id, kind, title, message, actor_user_id, entity_type, entity_id, dedupe_key, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), input.userId, input.kind, input.title.slice(0, 80), input.message.slice(0, 300), input.actorUserId ?? null, input.entityType ?? null, input.entityId ?? null, input.dedupeKey ?? null, Date.now()).run();
  if (result.meta?.changes) {
    await d1.prepare(`DELETE FROM user_notifications WHERE user_id = ? AND id NOT IN (
      SELECT id FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 120
    )`).bind(input.userId, input.userId).run();
  }
  return Boolean(result.meta?.changes);
}
