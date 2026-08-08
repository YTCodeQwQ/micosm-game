import { ensureAuthSchema, getSessionUser, type AuthUser } from "./auth";

type ModerationStatement = {
  bind(...values: unknown[]): ModerationStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

export type ModerationD1 = { prepare(query: string): ModerationStatement };

export async function ensureModerationSchema(d1: ModerationD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS user_sanctions (
    user_id TEXT PRIMARY KEY,
    muted_until INTEGER,
    banned_until INTEGER,
    reason TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS user_sanctions_expiry_idx ON user_sanctions(muted_until, banned_until)").run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS moderation_actions (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL,
    target_user_id TEXT,
    message_id TEXT,
    action TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER,
    created_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS moderation_actions_created_idx ON moderation_actions(created_at DESC)").run();

  const reportsTable = await d1.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_reports'").first<{ name: string }>();
  if (reportsTable) {
    const columns = await d1.prepare("PRAGMA table_info(chat_reports)").all<{ name: string }>();
    const names = new Set(columns.results.map((column) => column.name));
    const additions = [
      ["status", "ALTER TABLE chat_reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open'"],
      ["reviewed_by", "ALTER TABLE chat_reports ADD COLUMN reviewed_by TEXT"],
      ["reviewed_at", "ALTER TABLE chat_reports ADD COLUMN reviewed_at INTEGER"],
      ["resolution", "ALTER TABLE chat_reports ADD COLUMN resolution TEXT"],
    ] as const;
    for (const [name, sql] of additions) if (!names.has(name)) await d1.prepare(sql).run();
    await d1.prepare("CREATE INDEX IF NOT EXISTS chat_reports_status_idx ON chat_reports(status, created_at DESC)").run();
  }
}

export function configuredAdminIds(value?: string) {
  return new Set((value ?? "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean));
}

export async function resolveConfiguredAdmin(d1: ModerationD1, user: AuthUser, configuredIds: Set<string>) {
  if (user.role === "admin" || !configuredIds.has(user.publicId.toUpperCase())) return user;
  await d1.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").bind(Date.now(), user.id).run();
  return { ...user, role: "admin" as const };
}

export async function requireAdmin(request: Request, d1: ModerationD1, configuredIds: Set<string>) {
  await ensureAuthSchema(d1);
  await ensureModerationSchema(d1);
  const sessionUser = await getSessionUser(request, d1);
  if (!sessionUser) return { user: null, response: Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 }) };
  const user = await resolveConfiguredAdmin(d1, sessionUser, configuredIds);
  if (user.role !== "admin") return { user: null, response: Response.json({ error: { code: "admin_required", message: "需要管理员权限" } }, { status: 403 }) };
  return { user, response: null };
}

export async function activeSanction(d1: ModerationD1, userId: string) {
  await ensureModerationSchema(d1);
  const now = Date.now();
  const row = await d1.prepare("SELECT muted_until, banned_until, reason FROM user_sanctions WHERE user_id = ?")
    .bind(userId).first<{ muted_until: number | null; banned_until: number | null; reason: string }>();
  return {
    muted: Boolean(row?.muted_until && row.muted_until > now),
    banned: Boolean(row?.banned_until && row.banned_until > now),
    mutedUntil: row?.muted_until ?? null,
    bannedUntil: row?.banned_until ?? null,
    reason: row?.reason ?? "",
  };
}
