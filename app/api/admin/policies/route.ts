import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../lib/admin";
import { ensureAppSchema } from "../../../../lib/database-migrations";
import { notifyPlatform } from "../../../../lib/platform-realtime";
import { POLICY_LABELS, policyKind, type PolicyKind } from "../../../../lib/policies";

function adminIds() { return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS); }
function fail(code: string, message: string, status: number) { return Response.json({ error: { code, message } }, { status }); }
type PolicyRow = { id: string; kind: PolicyKind; version: number; title: string; summary: string; body: string; status: string; material: number; published_by: string | null; published_at: number | null; created_at: number; updated_at: number; publisher_name: string | null };

export async function GET(request: Request) {
  const d1 = getD1(); await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "policies.read"); if (auth.response) return auth.response;
  const rows = await d1.prepare(`SELECT p.*, u.display_name AS publisher_name FROM policy_documents p LEFT JOIN users u ON u.id = p.published_by ORDER BY p.kind ASC, p.version DESC`).all<PolicyRow>();
  return Response.json({ policies: rows.results.map((row) => ({ id: row.id, kind: row.kind, label: POLICY_LABELS[row.kind], version: row.version, title: row.title, summary: row.summary, body: row.body, status: row.status, material: Boolean(row.material), publisherName: row.publisher_name, publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at })) });
}

export async function POST(request: Request) {
  const d1 = getD1(); await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "policies.write");
  if (auth.response || !auth.user || !auth.role) return auth.response ?? fail("admin_required", "需要管理员权限", 403);
  const payload = await request.json() as { action?: string; id?: string; kind?: string; title?: string; summary?: string; body?: string; material?: boolean; reason?: string };
  const reason = payload.reason?.trim().slice(0, 240) ?? "";
  if (!reason) return fail("reason_required", "请填写操作说明", 400);
  const now = Date.now();

  if (payload.action === "save") {
    const kind = policyKind(payload.kind); if (!kind) return fail("invalid_kind", "请选择规则类型", 400);
    const title = payload.title?.normalize("NFKC").trim().slice(0, 100) ?? "";
    const summary = payload.summary?.normalize("NFKC").trim().slice(0, 240) ?? "";
    const body = payload.body?.normalize("NFKC").trim().slice(0, 20_000) ?? "";
    if (title.length < 4 || body.length < 20) return fail("policy_too_short", "标题至少 4 个字，正文至少 20 个字", 400);
    const existing = payload.id ? await d1.prepare("SELECT id, kind, version, status, title, summary, body, material FROM policy_documents WHERE id = ?").bind(payload.id).first<{ id: string; kind: PolicyKind; version: number; status: string; title: string; summary: string; body: string; material: number }>() : null;
    if (existing && existing.status !== "draft") return fail("published_policy_locked", "已发布版本不能直接修改，请创建新版本", 409);
    if (existing) {
      await d1.prepare("UPDATE policy_documents SET title = ?, summary = ?, body = ?, material = ?, updated_at = ? WHERE id = ?").bind(title, summary, body, payload.material ? 1 : 0, now, existing.id).run();
      await writeAdminAudit(d1, { adminUserId: auth.user.id, adminRole: auth.role, module: "policies", action: "save_draft", targetType: "policy", targetId: existing.id, reason, before: existing, after: { title, summary, material: Boolean(payload.material) } });
      return Response.json({ ok: true, id: existing.id });
    }
    const latest = await d1.prepare("SELECT MAX(version) AS version FROM policy_documents WHERE kind = ?").bind(kind).first<{ version: number | null }>();
    const id = crypto.randomUUID(); const version = Number(latest?.version ?? 0) + 1;
    await d1.prepare(`INSERT INTO policy_documents (id, kind, version, title, summary, body, status, material, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`)
      .bind(id, kind, version, title, summary, body, payload.material ? 1 : 0, now, now).run();
    await writeAdminAudit(d1, { adminUserId: auth.user.id, adminRole: auth.role, module: "policies", action: "create_draft", targetType: "policy", targetId: id, reason, after: { kind, version, title, material: Boolean(payload.material) } });
    return Response.json({ ok: true, id, version });
  }

  const id = payload.id?.trim() ?? "";
  const target = id ? await d1.prepare("SELECT id, kind, version, status, title, material FROM policy_documents WHERE id = ?").bind(id).first<{ id: string; kind: PolicyKind; version: number; status: string; title: string; material: number }>() : null;
  if (!target) return fail("policy_not_found", "没有找到这个规则版本", 404);
  if (payload.action === "publish") {
    if (target.status !== "draft") return fail("policy_not_draft", "只有草稿可以发布", 409);
    await d1.prepare("UPDATE policy_documents SET status = 'withdrawn', updated_at = ? WHERE kind = ? AND status = 'published'").bind(now, target.kind).run();
    await d1.prepare("UPDATE policy_documents SET status = 'published', published_by = ?, published_at = ?, updated_at = ? WHERE id = ?").bind(auth.user.id, now, now, id).run();
    await writeAdminAudit(d1, { adminUserId: auth.user.id, adminRole: auth.role, module: "policies", action: "publish", targetType: "policy", targetId: id, reason, before: target, after: { status: "published" } });
    await notifyPlatform({ type: "community_updated" });
    return Response.json({ ok: true });
  }
  if (payload.action === "withdraw") {
    if (target.status !== "published") return fail("policy_not_published", "这份规则当前没有发布", 409);
    await d1.prepare("UPDATE policy_documents SET status = 'withdrawn', updated_at = ? WHERE id = ?").bind(now, id).run();
    await writeAdminAudit(d1, { adminUserId: auth.user.id, adminRole: auth.role, module: "policies", action: "withdraw", targetType: "policy", targetId: id, reason, before: target, after: { status: "withdrawn" } });
    await notifyPlatform({ type: "community_updated" });
    return Response.json({ ok: true });
  }
  return fail("invalid_action", "无法识别这个规则操作", 400);
}
