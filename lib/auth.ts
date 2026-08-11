const SESSION_COOKIE = "micosm_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const TEMPORARY_INVITE_CODE = "abcd123";
const PASSWORD_ITERATIONS = 210_000;

export type AuthUser = {
  id: string;
  publicId: string;
  phone: string;
  displayName: string;
  signature: string;
  avatarKey: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  role: UserRole;
};

export type AdminRole = "super_admin" | "admin" | "moderator" | "support" | "operator";
export type UserRole = "player" | AdminRole;

export function isAdminRole(role: string): role is AdminRole {
  return ["super_admin", "admin", "moderator", "support", "operator"].includes(role);
}

export type AuthUserRow = {
  id: string;
  public_id: string | null;
  phone: string;
  display_name: string;
  username_key: string | null;
  password_hash: string | null;
  password_salt: string | null;
  signature: string | null;
  avatar_key: string | null;
  role: string | null;
};

type D1Statement = {
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
  bind(...values: unknown[]): D1Statement;
};

type D1 = { prepare(query: string): D1Statement };

export function normalizeUsernameKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

export function cleanDisplayName(value: unknown) {
  if (typeof value !== "string") return "";
  return Array.from(value.normalize("NFKC").trim().replace(/\s+/g, " ")).slice(0, 16).join("");
}

export function cleanSignature(value: unknown) {
  if (typeof value !== "string") return "";
  return Array.from(value.trim().replace(/\s+/g, " ")).slice(0, 60).join("");
}

export function normalizePhone(value: unknown) {
  if (typeof value !== "string") return "";
  let phone = value.replace(/\D/g, "");
  if (phone.length === 13 && phone.startsWith("86")) phone = phone.slice(2);
  return /^1[3-9]\d{9}$/.test(phone) ? phone : "";
}

export function inviteCodeIsValid(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase() === TEMPORARY_INVITE_CODE;
}

export function passwordIsValid(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 64;
}

export function avatarUrlForKey(key: string | null) {
  return key ? `/api/avatar/${encodeURIComponent(key)}` : null;
}

export async function publicUserIdForInternalId(id: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`micosm-user:${id}`)));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = 0n;
  for (const byte of digest.slice(0, 7)) value = (value << 8n) | BigInt(byte);
  let suffix = "";
  for (let index = 0; index < 10; index += 1) {
    suffix = alphabet[Number(value & 31n)] + suffix;
    value >>= 5n;
  }
  return `MG-${suffix}`;
}

export function authUserFromRow(row: AuthUserRow): AuthUser {
  return {
    id: row.id,
    publicId: row.public_id ?? "",
    phone: row.phone,
    displayName: row.display_name,
    signature: row.signature ?? "",
    avatarKey: row.avatar_key,
    avatarUrl: avatarUrlForKey(row.avatar_key),
    hasPassword: Boolean(row.password_hash && row.password_salt),
    role: row.role && isAdminRole(row.role) ? row.role : "player",
  };
}

export async function ensureAuthSchema(d1: D1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    public_id TEXT,
    phone TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    username_key TEXT,
    password_hash TEXT,
    password_salt TEXT,
    signature TEXT NOT NULL DEFAULT '',
    avatar_key TEXT,
    role TEXT NOT NULL DEFAULT 'player',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  const columns = await d1.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const additions = [
    ["public_id", "ALTER TABLE users ADD COLUMN public_id TEXT"],
    ["username_key", "ALTER TABLE users ADD COLUMN username_key TEXT"],
    ["password_hash", "ALTER TABLE users ADD COLUMN password_hash TEXT"],
    ["password_salt", "ALTER TABLE users ADD COLUMN password_salt TEXT"],
    ["signature", "ALTER TABLE users ADD COLUMN signature TEXT NOT NULL DEFAULT ''"],
    ["avatar_key", "ALTER TABLE users ADD COLUMN avatar_key TEXT"],
    ["role", "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'"],
  ] as const;
  for (const [name, sql] of additions) if (!names.has(name)) await d1.prepare(sql).run();

  const missingPublicIds = await d1.prepare("SELECT id FROM users WHERE public_id IS NULL OR public_id = ''").all<{ id: string }>();
  for (const row of missingPublicIds.results) {
    await d1.prepare("UPDATE users SET public_id = ? WHERE id = ? AND (public_id IS NULL OR public_id = '')")
      .bind(await publicUserIdForInternalId(row.id), row.id).run();
  }
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique ON users(public_id)").run();

  const pending = await d1.prepare("SELECT id, display_name FROM users WHERE username_key IS NULL").all<{ id: string; display_name: string }>();
  if (pending.results.length) {
    const existing = await d1.prepare("SELECT username_key FROM users WHERE username_key IS NOT NULL").all<{ username_key: string }>();
    const used = new Set(existing.results.map((row) => row.username_key));
    for (const row of pending.results) {
      const original = cleanDisplayName(row.display_name) || "棋手";
      let displayName = original;
      let usernameKey = normalizeUsernameKey(displayName);
      let suffix = 2;
      while (used.has(usernameKey)) {
        const tail = ` ${suffix}`;
        displayName = `${Array.from(original).slice(0, Math.max(1, 16 - tail.length)).join("")}${tail}`;
        usernameKey = normalizeUsernameKey(displayName);
        suffix += 1;
      }
      used.add(usernameKey);
      await d1.prepare("UPDATE users SET display_name = ?, username_key = ? WHERE id = ?").bind(displayName, usernameKey, row.id).run();
    }
  }
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS users_username_key_unique ON users(username_key)").run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  return new Uint8Array(hex.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

async function derivePassword(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

export async function createPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derivePassword(password, salt), salt: bytesToHex(salt) };
}

export async function verifyPassword(password: string, expectedHash: string, salt: string) {
  const actual = await derivePassword(password, hexToBytes(salt));
  if (actual.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return difference === 0;
}

async function hashToken(token: string) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export async function getSessionUser(request: Request, d1: D1): Promise<AuthUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const row = await d1.prepare(`SELECT u.id, u.public_id, u.phone, u.display_name, u.username_key, u.password_hash, u.password_salt, u.signature, u.avatar_key, u.role
    FROM user_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(tokenHash, Date.now()).first<AuthUserRow>();
  return row ? authUserFromRow(row) : null;
}

export async function createSession(d1: D1, userId: string, requestUrl: string) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  const tokenHash = await hashToken(token);
  const now = Date.now();
  await d1.prepare("INSERT INTO user_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, now + SESSION_MAX_AGE * 1000, now).run();
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export async function deleteSession(request: Request, d1: D1) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await d1.prepare("DELETE FROM user_sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
}

export function clearSessionCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function maskedPhone(phone: string) {
  return `${phone.slice(0, 3)} **** ${phone.slice(-4)}`;
}
