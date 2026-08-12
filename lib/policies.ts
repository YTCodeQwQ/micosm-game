export const POLICY_KINDS = ["user_agreement", "privacy", "community_rules", "report_appeal"] as const;
export type PolicyKind = typeof POLICY_KINDS[number];

type PolicyStatement = {
  bind(...values: unknown[]): PolicyStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};
export type PolicyD1 = { prepare(query: string): PolicyStatement };

export const POLICY_LABELS: Record<PolicyKind, string> = {
  user_agreement: "用户协议",
  privacy: "隐私政策",
  community_rules: "社区规则",
  report_appeal: "举报与申诉说明",
};

export function policyKind(value: unknown): PolicyKind | null {
  return typeof value === "string" && POLICY_KINDS.includes(value as PolicyKind) ? value as PolicyKind : null;
}

export async function ensurePolicySchema(d1: PolicyD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS policy_documents (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    version INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    material INTEGER NOT NULL DEFAULT 0,
    published_by TEXT,
    published_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(kind, version)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS policy_documents_public_idx ON policy_documents(kind, status, published_at DESC)").run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS policy_acceptances (
    user_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    accepted_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, document_id)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS policy_acceptances_user_idx ON policy_acceptances(user_id, accepted_at DESC)").run();

  const now = Date.now();
  const defaults: Array<[PolicyKind, string, string, string]> = [
    ["user_agreement", "Micosm Game 测试版用户协议", "说明账号、对局和社区服务的基本使用约定。", "使用 Micosm Game 即表示你同意遵守平台规则，不利用服务破坏公平对局、攻击系统或侵害他人权益。测试期间功能可能调整，重要变更会通过公告与版本化协议说明。"],
    ["privacy", "Micosm Game 测试版隐私政策", "说明测试阶段会保存哪些账号与对局数据。", "平台会保存账号标识、手机号、头像、个性签名、好友关系、聊天内容、对局记录和必要的安全日志，用于登录、联机、社区治理与故障排查。密钥、密码明文和短信验证码不会写入公开日志。"],
    ["community_rules", "星海社区交流规则", "友善讨论棋局，拒绝骚扰、刷屏与作弊。", "请围绕棋类、复盘和平台体验进行友善交流。禁止辱骂骚扰、刷屏广告、恶意引战、发布违法内容、传播作弊工具或冒充他人。违规内容可被删除，账号可能受到警告、禁言或封禁。"],
    ["report_appeal", "举报与申诉说明", "举报会进入审核队列，处罚允许通过客服申诉。", "举报时请说明具体内容和原因。审核员会结合上下文处理，结果可能包括忽略、删除、警告、禁言或封禁。对处罚有异议时可提供账号 ID、相关时间和理由申请复核。"],
  ];
  for (const [kind, title, summary, body] of defaults) {
    await d1.prepare(`INSERT OR IGNORE INTO policy_documents (id, kind, version, title, summary, body, status, material, published_at, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?, ?, 'published', 0, ?, ?, ?)`).bind(`policy-${kind}-v1`, kind, title, summary, body, now, now, now).run();
  }
}
