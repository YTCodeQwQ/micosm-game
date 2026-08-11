import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission } from "../../../../lib/admin";
import { ensureAppSchema } from "../../../../lib/database-migrations";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "audit.read");
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const moduleFilter = url.searchParams.get("module")?.trim().slice(0, 32) ?? "";
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 50));
  const rows = await d1.prepare(`SELECT a.id, a.request_id, a.admin_role, a.module, a.action, a.target_type, a.target_id,
      a.reason, a.before_json, a.after_json, a.created_at, u.display_name AS admin_name, u.public_id AS admin_public_id
    FROM admin_audit_log a LEFT JOIN users u ON u.id = a.admin_user_id
    WHERE (? = '' OR a.module = ?) ORDER BY a.created_at DESC LIMIT ?`)
    .bind(moduleFilter, moduleFilter, limit).all<{
      id: string; request_id: string; admin_role: string; module: string; action: string; target_type: string | null;
      target_id: string | null; reason: string; before_json: string | null; after_json: string | null; created_at: number;
      admin_name: string | null; admin_public_id: string | null;
    }>();
  return Response.json({
    entries: rows.results.map((row) => ({
      id: row.id, requestId: row.request_id, adminRole: row.admin_role, module: row.module, action: row.action,
      targetType: row.target_type, targetId: row.target_id, reason: row.reason,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: row.after_json ? JSON.parse(row.after_json) : null,
      createdAt: row.created_at, adminName: row.admin_name ?? "系统", adminPublicId: row.admin_public_id ?? "",
    })),
  });
}
