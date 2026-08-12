import { getD1 } from "../../../db";
import { getSessionUser } from "../../../lib/auth";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { POLICY_LABELS, type PolicyKind } from "../../../lib/policies";

type PolicyRow = { id: string; kind: PolicyKind; version: number; title: string; summary: string; body: string; material: number; published_at: number | null };

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  const rows = await d1.prepare(`SELECT id, kind, version, title, summary, body, material, published_at FROM policy_documents
    WHERE status = 'published' ORDER BY kind ASC, version DESC`).all<PolicyRow>();
  const latest = new Map<PolicyKind, PolicyRow>();
  for (const row of rows.results) if (!latest.has(row.kind)) latest.set(row.kind, row);
  const accepted = user ? await d1.prepare("SELECT document_id, accepted_at FROM policy_acceptances WHERE user_id = ?").bind(user.id).all<{ document_id: string; accepted_at: number }>() : { results: [] };
  const acceptedAt = new Map(accepted.results.map((row) => [row.document_id, row.accepted_at]));
  return Response.json({ policies: [...latest.values()].map((row) => ({ id: row.id, kind: row.kind, label: POLICY_LABELS[row.kind], version: row.version, title: row.title, summary: row.summary, body: row.body, material: Boolean(row.material), publishedAt: row.published_at, acceptedAt: acceptedAt.get(row.id) ?? null })), signedIn: Boolean(user) });
}

export async function POST(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
  const payload = await request.json() as { documentId?: string };
  const documentId = payload.documentId?.trim().slice(0, 100) ?? "";
  const policy = documentId ? await d1.prepare("SELECT id FROM policy_documents WHERE id = ? AND status = 'published'").bind(documentId).first<{ id: string }>() : null;
  if (!policy) return Response.json({ error: { code: "policy_not_found", message: "这份规则已经更新，请刷新后重试" } }, { status: 404 });
  const now = Date.now();
  await d1.prepare("INSERT INTO policy_acceptances (user_id, document_id, accepted_at) VALUES (?, ?, ?) ON CONFLICT(user_id, document_id) DO UPDATE SET accepted_at = excluded.accepted_at").bind(user.id, documentId, now).run();
  return Response.json({ accepted: true, acceptedAt: now });
}
