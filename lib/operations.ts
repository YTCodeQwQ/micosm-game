export type FeatureFlagKey =
  | "maintenance_mode"
  | "registration_enabled"
  | "beta_mode"
  | "feedback_enabled"
  | "public_matchmaking_enabled"
  | "ranked_go_enabled"
  | "ranked_gomoku_enabled"
  | "world_chat_writable"
  | "spectating_enabled"
  | "ai_go_master_enabled"
  | "ai_gomoku_master_enabled";

export type FeatureFlagDefinition = {
  key: FeatureFlagKey;
  label: string;
  description: string;
  category: "platform" | "games" | "community" | "ai";
  defaultEnabled: boolean;
  risk: "normal" | "high";
};

type OperationStatement = {
  bind(...values: unknown[]): OperationStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

export type OperationD1 = { prepare(query: string): OperationStatement };

export const FEATURE_FLAGS: FeatureFlagDefinition[] = [
  { key: "maintenance_mode", label: "维护模式", description: "暂停创建新业务，保留登录、现有棋局和管理后台。", category: "platform", defaultEnabled: false, risk: "high" },
  { key: "registration_enabled", label: "开放注册", description: "允许新玩家创建账号，关闭后仍可正常登录。", category: "platform", defaultEnabled: true, risk: "high" },
  { key: "beta_mode", label: "内测环境", description: "在玩家端显示内测身份、数据重置提示和内测赛季信息。", category: "platform", defaultEnabled: true, risk: "normal" },
  { key: "feedback_enabled", label: "内测反馈", description: "允许玩家从个人中心提交问题与体验建议。", category: "community", defaultEnabled: true, risk: "normal" },
  { key: "public_matchmaking_enabled", label: "快速匹配", description: "允许玩家进入随机匹配队列。", category: "games", defaultEnabled: true, risk: "normal" },
  { key: "ranked_go_enabled", label: "围棋排位", description: "开放围棋排位队列和结算。", category: "games", defaultEnabled: true, risk: "normal" },
  { key: "ranked_gomoku_enabled", label: "五子棋排位", description: "开放带禁手规则的五子棋排位。", category: "games", defaultEnabled: true, risk: "normal" },
  { key: "world_chat_writable", label: "世界频道发言", description: "关闭后世界频道只读，私聊不受影响。", category: "community", defaultEnabled: true, risk: "normal" },
  { key: "spectating_enabled", label: "观战系统", description: "控制所有非排位棋局的观战入口。", category: "games", defaultEnabled: true, risk: "normal" },
  { key: "ai_go_master_enabled", label: "KataGo 最高难度", description: "允许创建围棋最高难度人机对局。", category: "ai", defaultEnabled: true, risk: "normal" },
  { key: "ai_gomoku_master_enabled", label: "Rapfi 最高难度", description: "允许创建五子棋最高难度人机对局。", category: "ai", defaultEnabled: true, risk: "normal" },
];

const definitions = new Map(FEATURE_FLAGS.map((flag) => [flag.key, flag]));

export function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return typeof value === "string" && definitions.has(value as FeatureFlagKey);
}

export async function ensureOperationsSchema(d1: OperationD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS feature_flags (
    key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL,
    updated_by TEXT,
    reason TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  )`).run();
  const now = Date.now();
  for (const flag of FEATURE_FLAGS) {
    await d1.prepare("INSERT OR IGNORE INTO feature_flags (key, enabled, reason, updated_at) VALUES (?, ?, 'system_default', ?)")
      .bind(flag.key, flag.defaultEnabled ? 1 : 0, now).run();
  }
}

export async function featureEnabled(d1: OperationD1, key: FeatureFlagKey) {
  const row = await d1.prepare("SELECT enabled FROM feature_flags WHERE key = ?").bind(key).first<{ enabled: number }>();
  return row ? Boolean(row.enabled) : definitions.get(key)?.defaultEnabled ?? false;
}

export async function listFeatureFlags(d1: OperationD1) {
  const rows = await d1.prepare("SELECT key, enabled, updated_by, reason, updated_at FROM feature_flags ORDER BY key").all<{ key: string; enabled: number; updated_by: string | null; reason: string; updated_at: number }>();
  const stored = new Map(rows.results.map((row) => [row.key, row]));
  return FEATURE_FLAGS.map((definition) => {
    const row = stored.get(definition.key);
    return {
      ...definition,
      enabled: row ? Boolean(row.enabled) : definition.defaultEnabled,
      updatedBy: row?.updated_by ?? null,
      reason: row?.reason ?? "system_default",
      updatedAt: row?.updated_at ?? 0,
    };
  });
}

export async function setFeatureFlag(d1: OperationD1, key: FeatureFlagKey, enabled: boolean, adminUserId: string, reason: string) {
  await d1.prepare(`INSERT INTO feature_flags (key, enabled, updated_by, reason, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, updated_by = excluded.updated_by, reason = excluded.reason, updated_at = excluded.updated_at`)
    .bind(key, enabled ? 1 : 0, adminUserId, reason, Date.now()).run();
}

export function featureUnavailable(message: string, code = "feature_unavailable") {
  return Response.json({ error: { code, message } }, { status: 503 });
}
