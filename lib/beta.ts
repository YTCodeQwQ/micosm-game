export type BetaFeedbackCategory = "bug" | "experience" | "rules" | "ai" | "other";
export type BetaFeedbackStatus = "open" | "reviewing" | "resolved" | "closed";

type BetaStatement = {
  bind(...values: unknown[]): BetaStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

export type BetaD1 = { prepare(query: string): BetaStatement };

export type BetaInviteRow = {
  id: string;
  code: string;
  label: string;
  max_uses: number;
  uses: number;
  enabled: number;
  expires_at: number | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
};

export type BetaFeedbackRow = {
  id: string;
  user_id: string;
  category: BetaFeedbackCategory;
  title: string;
  body: string;
  page_context: string;
  status: BetaFeedbackStatus;
  admin_note: string;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
  updated_at: number;
};

export const FEEDBACK_CATEGORIES: Record<BetaFeedbackCategory, string> = {
  bug: "问题故障",
  experience: "体验建议",
  rules: "棋类规则",
  ai: "人机对战",
  other: "其他反馈",
};

export function isFeedbackCategory(value: unknown): value is BetaFeedbackCategory {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FEEDBACK_CATEGORIES, value);
}

export function isFeedbackStatus(value: unknown): value is BetaFeedbackStatus {
  return ["open", "reviewing", "resolved", "closed"].includes(String(value));
}

export function normalizeBetaInviteCode(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24) : "";
}

export function generateBetaInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `MG${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

export async function ensureBetaSchema(d1: BetaD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS beta_settings (
    id TEXT PRIMARY KEY,
    program_name TEXT NOT NULL,
    notice TEXT NOT NULL,
    updated_by TEXT,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS beta_invites (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 0,
    uses INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS beta_invites_active_idx ON beta_invites(enabled, expires_at, created_at DESC)").run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS beta_invite_claims (
    id TEXT PRIMARY KEY,
    invite_id TEXT NOT NULL,
    user_id TEXT NOT NULL UNIQUE,
    claimed_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS beta_invite_claims_invite_idx ON beta_invite_claims(invite_id, claimed_at DESC)").run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS beta_feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    page_context TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    admin_note TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT,
    reviewed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS beta_feedback_status_idx ON beta_feedback(status, created_at DESC)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS beta_feedback_user_idx ON beta_feedback(user_id, created_at DESC)").run();

  const now = Date.now();
  await d1.prepare(`INSERT OR IGNORE INTO beta_settings (id, program_name, notice, updated_at)
    VALUES ('current', 'Micosm Game 星海内测', '当前为内测环境，排位与账号数据可能在正式上线前重置。', ?)`)
    .bind(now).run();
  await d1.prepare(`INSERT OR IGNORE INTO beta_invites
    (id, code, label, max_uses, uses, enabled, expires_at, created_by, created_at, updated_at)
    VALUES ('legacy-abcd123', 'ABCD123', '早期内测兼容码', 0, 0, 1, NULL, NULL, ?, ?)`)
    .bind(now, now).run();
}

export async function betaSettings(d1: BetaD1) {
  return d1.prepare("SELECT program_name, notice, updated_by, updated_at FROM beta_settings WHERE id = 'current'")
    .first<{ program_name: string; notice: string; updated_by: string | null; updated_at: number }>();
}

export async function updateBetaSettings(d1: BetaD1, input: { programName: string; notice: string; adminUserId: string }) {
  const programName = input.programName.normalize("NFKC").trim().slice(0, 40);
  const notice = input.notice.normalize("NFKC").trim().slice(0, 180);
  if (programName.length < 2) throw new Error("内测计划名称需要 2 至 40 个字符");
  if (notice.length < 6) throw new Error("内测说明需要 6 至 180 个字符");
  await d1.prepare(`INSERT INTO beta_settings (id, program_name, notice, updated_by, updated_at)
    VALUES ('current', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET program_name = excluded.program_name, notice = excluded.notice, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(programName, notice, input.adminUserId, Date.now()).run();
  return { programName, notice };
}

export async function reserveBetaInvite(d1: BetaD1, value: unknown, userId: string) {
  const code = normalizeBetaInviteCode(value);
  if (!code) return { ok: false as const, code: "invalid_invite", message: "请输入有效的邀请码" };
  const invite = await d1.prepare("SELECT * FROM beta_invites WHERE code = ?").bind(code).first<BetaInviteRow>();
  const now = Date.now();
  if (!invite || !invite.enabled) return { ok: false as const, code: "invalid_invite", message: "邀请码不存在或已停用" };
  if (invite.expires_at && invite.expires_at <= now) return { ok: false as const, code: "invite_expired", message: "这个邀请码已过期" };
  if (invite.max_uses > 0 && invite.uses >= invite.max_uses) return { ok: false as const, code: "invite_exhausted", message: "这个邀请码的名额已经用完" };

  const update = await d1.prepare(`UPDATE beta_invites SET uses = uses + 1, updated_at = ?
    WHERE id = ? AND enabled = 1 AND (expires_at IS NULL OR expires_at > ?) AND (max_uses = 0 OR uses < max_uses)`)
    .bind(now, invite.id, now).run();
  if (Number(update.meta?.changes ?? 0) !== 1) return { ok: false as const, code: "invite_exhausted", message: "这个邀请码的名额刚刚用完，请更换邀请码" };
  try {
    const claimId = crypto.randomUUID();
    await d1.prepare("INSERT INTO beta_invite_claims (id, invite_id, user_id, claimed_at) VALUES (?, ?, ?, ?)")
      .bind(claimId, invite.id, userId, now).run();
    return { ok: true as const, claimId, inviteId: invite.id, userId };
  } catch (error) {
    await d1.prepare("UPDATE beta_invites SET uses = MAX(0, uses - 1), updated_at = ? WHERE id = ?").bind(Date.now(), invite.id).run();
    throw error;
  }
}

export async function releaseBetaInvite(d1: BetaD1, reservation: { claimId: string; inviteId: string }) {
  const removed = await d1.prepare("DELETE FROM beta_invite_claims WHERE id = ? AND invite_id = ?").bind(reservation.claimId, reservation.inviteId).run();
  if (Number(removed.meta?.changes ?? 0) > 0) {
    await d1.prepare("UPDATE beta_invites SET uses = MAX(0, uses - 1), updated_at = ? WHERE id = ?").bind(Date.now(), reservation.inviteId).run();
  }
}
