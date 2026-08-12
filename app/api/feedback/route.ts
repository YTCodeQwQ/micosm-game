import { getD1 } from "../../../db";
import { FEEDBACK_CATEGORIES, isFeedbackCategory, type BetaFeedbackRow } from "../../../lib/beta";
import { getSessionUser } from "../../../lib/auth";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { featureEnabled, featureUnavailable } from "../../../lib/operations";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";

function publicFeedback(row: BetaFeedbackRow) {
  return {
    id: row.id,
    category: row.category,
    categoryLabel: FEEDBACK_CATEGORIES[row.category] ?? FEEDBACK_CATEGORIES.other,
    title: row.title,
    body: row.body,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
  const rows = await d1.prepare("SELECT * FROM beta_feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").bind(user.id).all<BetaFeedbackRow>();
  return Response.json({ enabled: await featureEnabled(d1, "feedback_enabled"), feedback: rows.results.map(publicFeedback) });
}

export async function POST(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
  if (!await featureEnabled(d1, "feedback_enabled")) return featureUnavailable("内测反馈入口暂时关闭", "feedback_closed");
  const limit = await consumeRateLimit(d1, { scope: "beta_feedback_user", actor: user.id, limit: 8, windowMs: 24 * 60 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit, "今天提交的反馈较多，请明天再试");
  const payload = await request.json() as Record<string, unknown>;
  const category = isFeedbackCategory(payload.category) ? payload.category : "other";
  const title = String(payload.title ?? "").normalize("NFKC").trim().slice(0, 50);
  const body = String(payload.body ?? "").normalize("NFKC").trim().slice(0, 1500);
  const pageContext = String(payload.pageContext ?? "").normalize("NFKC").trim().slice(0, 120);
  if (title.length < 2) return Response.json({ error: { code: "title_required", message: "请简要描述反馈主题" } }, { status: 400 });
  if (body.length < 6) return Response.json({ error: { code: "body_required", message: "请多写一点具体情况，方便我们复现" } }, { status: 400 });
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1.prepare(`INSERT INTO beta_feedback
    (id, user_id, category, title, body, page_context, status, admin_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', '', ?, ?)`)
    .bind(id, user.id, category, title, body, pageContext, now, now).run();
  const row = await d1.prepare("SELECT * FROM beta_feedback WHERE id = ?").bind(id).first<BetaFeedbackRow>();
  return Response.json({ feedback: row ? publicFeedback(row) : null }, { status: 201 });
}
