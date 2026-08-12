import { ensureAuthSchema, getSessionUser, isAdminRole, type AdminRole, type AuthUser } from "./auth.ts";

type AdminStatement = {
  bind(...values: unknown[]): AdminStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

export type AdminD1 = { prepare(query: string): AdminStatement };

export type AdminPermission =
  | "overview.read"
  | "users.read"
  | "users.sanction"
  | "users.sessions"
  | "reports.read"
  | "reports.write"
  | "matches.read"
  | "ranking.read"
  | "ranking.write"
  | "ranking.seasons.write"
  | "ai.read"
  | "ai.write"
  | "announcements.write"
  | "community.write"
  | "policies.read"
  | "policies.write"
  | "audit.read"
  | "roles.write"
  | "operations.read"
  | "operations.write"
  | "beta.manage";

const ALL_PERMISSIONS: AdminPermission[] = [
  "overview.read", "users.read", "users.sanction", "users.sessions", "reports.read", "reports.write",
  "matches.read", "ranking.read", "ranking.write", "ranking.seasons.write", "ai.read", "ai.write", "announcements.write", "community.write",
  "policies.read", "policies.write", "audit.read", "roles.write", "operations.read", "operations.write", "beta.manage",
];

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((permission) => permission !== "roles.write" && permission !== "ranking.seasons.write" && permission !== "beta.manage" && !permission.startsWith("operations.")),
  moderator: ["overview.read", "users.read", "users.sanction", "reports.read", "reports.write", "matches.read", "community.write"],
  support: ["overview.read", "users.read", "users.sessions", "matches.read", "ranking.read", "policies.read"],
  operator: ["overview.read", "ai.read", "ai.write", "audit.read", "operations.read", "operations.write"],
};

export function permissionsForRole(role: AdminRole) {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleHasPermission(role: AdminRole, permission: AdminPermission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function configuredAdminIds(value?: string) {
  return new Set((value ?? "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean));
}

export async function ensureAdminSchema(d1: AdminD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS admin_roles (
    user_id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    assigned_by TEXT,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS admin_roles_role_idx ON admin_roles(role, updated_at DESC)").run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_log (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    admin_user_id TEXT NOT NULL,
    admin_role TEXT NOT NULL,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    reason TEXT NOT NULL DEFAULT '',
    before_json TEXT,
    after_json TEXT,
    created_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_log(created_at DESC)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON admin_audit_log(target_type, target_id, created_at DESC)").run();
  const now = Date.now();
  await d1.prepare(`INSERT OR IGNORE INTO admin_roles (user_id, role, assigned_by, reason, created_at, updated_at)
    SELECT id, role, NULL, 'legacy_admin_migration', ?, ? FROM users
    WHERE role IN ('super_admin', 'admin', 'moderator', 'support', 'operator')`).bind(now, now).run();
}

async function resolvedAdminRole(d1: AdminD1, user: AuthUser, bootstrapIds: Set<string>) {
  if (bootstrapIds.has(user.publicId.toUpperCase())) {
    const now = Date.now();
    await d1.prepare(`INSERT INTO admin_roles (user_id, role, assigned_by, reason, created_at, updated_at)
      VALUES (?, 'super_admin', ?, 'environment_bootstrap', ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET role = 'super_admin', reason = excluded.reason, updated_at = excluded.updated_at`)
      .bind(user.id, user.id, now, now).run();
    if (user.role !== "super_admin") await d1.prepare("UPDATE users SET role = 'super_admin', updated_at = ? WHERE id = ?").bind(now, user.id).run();
    return "super_admin" as const;
  }
  const row = await d1.prepare("SELECT role FROM admin_roles WHERE user_id = ?").bind(user.id).first<{ role: string }>();
  if (row?.role && isAdminRole(row.role)) return row.role;
  return isAdminRole(user.role) ? user.role : null;
}

export async function resolveConfiguredAdmin(d1: AdminD1, user: AuthUser, bootstrapIds: Set<string>) {
  await ensureAdminSchema(d1);
  const role = await resolvedAdminRole(d1, user, bootstrapIds);
  return role ? { ...user, role } : user;
}

function accessError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function requireAdminPermission(request: Request, d1: AdminD1, bootstrapIds: Set<string>, permission: AdminPermission) {
  await ensureAuthSchema(d1);
  await ensureAdminSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return { user: null, role: null, permissions: [], response: accessError("auth_required", "请先登录", 401) };
  const role = await resolvedAdminRole(d1, user, bootstrapIds);
  if (!role || !roleHasPermission(role, permission)) {
    return { user: null, role, permissions: role ? permissionsForRole(role) : [], response: accessError("admin_permission_required", "当前账号没有这项管理权限", 403) };
  }
  return { user: { ...user, role }, role, permissions: permissionsForRole(role), response: null };
}

export async function writeAdminAudit(d1: AdminD1, input: {
  requestId?: string;
  adminUserId: string;
  adminRole: AdminRole;
  module: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string;
  before?: unknown;
  after?: unknown;
}) {
  const requestId = input.requestId?.trim() || crypto.randomUUID();
  await d1.prepare(`INSERT INTO admin_audit_log
    (id, request_id, admin_user_id, admin_role, module, action, target_type, target_id, reason, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(), requestId, input.adminUserId, input.adminRole, input.module, input.action,
      input.targetType ?? null, input.targetId ?? null, input.reason?.trim().slice(0, 240) ?? "",
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after), Date.now(),
    ).run();
  return requestId;
}
