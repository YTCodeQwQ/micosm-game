import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../lib/admin";
import { ensureCommunitySchema, type AnnouncementRow } from "../../../../lib/community";
import { ensureAppSchema } from "../../../../lib/database-migrations";
import { notifyPlatform } from "../../../../lib/platform-realtime";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

function clean(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return Array.from(value.normalize("NFKC").replace(/\r\n?/g, "\n").trim()).slice(0, limit).join("");
}

function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function announcement(row: AnnouncementRow) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    priority: row.priority,
    status: row.status,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "announcements.write");
  if (auth.response) return auth.response;
  await ensureCommunitySchema(d1);
  const rows = await d1.prepare("SELECT * FROM community_announcements ORDER BY updated_at DESC LIMIT 100").all<AnnouncementRow>();
  return Response.json({ announcements: rows.results.map(announcement) });
}

export async function POST(request: Request) {
  try {
    const d1 = getD1();
    await ensureAppSchema(d1);
    const auth = await requireAdminPermission(request, d1, adminIds(), "announcements.write");
    if (auth.response || !auth.user || !auth.role) return auth.response ?? fail("admin_required", "需要管理员权限", 403);
    const payload = await request.json() as {
      action?: "create" | "update" | "withdraw";
      id?: string;
      title?: string;
      summary?: string;
      body?: string;
      category?: string;
      priority?: string;
      status?: string;
      publishedAt?: number;
      expiresAt?: number | null;
      reason?: string;
    };
    const now = Date.now();
    const reason = clean(payload.reason, 240);

    if (payload.action === "withdraw") {
      const before = await d1.prepare("SELECT * FROM community_announcements WHERE id = ?").bind(payload.id ?? "").first<AnnouncementRow>();
      if (!before) return fail("announcement_not_found", "公告已经不存在", 404);
      await d1.prepare("UPDATE community_announcements SET status = 'withdrawn', updated_at = ? WHERE id = ?").bind(now, before.id).run();
      await writeAdminAudit(d1, { adminUserId: auth.user.id, adminRole: auth.role, module: "announcements", action: "withdraw", targetType: "announcement", targetId: before.id, reason, before: announcement(before), after: { status: "withdrawn" } });
      await notifyPlatform({ type: "community_updated" });
      return Response.json({ withdrawn: true });
    }

    if (payload.action !== "create" && payload.action !== "update") return fail("invalid_action", "无法识别这个公告操作", 400);
    const title = clean(payload.title, 80).replace(/\s+/g, " ");
    const summary = clean(payload.summary, 160).replace(/\s+/g, " ");
    const body = clean(payload.body, 5000);
    if (title.length < 4 || body.length < 8) return fail("announcement_incomplete", "请填写完整的公告标题和正文", 400);
    const category = ["update", "maintenance", "event", "rules", "community"].includes(payload.category ?? "") ? payload.category : "community";
    const priority = ["normal", "important", "critical"].includes(payload.priority ?? "") ? payload.priority : "normal";
    const status = payload.status === "draft" ? "draft" : "published";
    const publishedAt = Number.isSafeInteger(payload.publishedAt) ? Number(payload.publishedAt) : now;
    const expiresAt = Number.isSafeInteger(payload.expiresAt) && Number(payload.expiresAt) > publishedAt ? Number(payload.expiresAt) : null;

    if (payload.action === "create") {
      const id = crypto.randomUUID();
      await d1.prepare(`INSERT INTO community_announcements (
          id, title, summary, body, category, priority, status, published_at, expires_at, author_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, title, summary, body, category, priority, status, publishedAt, expiresAt, auth.user.id, now, now).run();
      await writeAdminAudit(d1, { adminUserId: auth.user.id, adminRole: auth.role, module: "announcements", action: "create", targetType: "announcement", targetId: id, reason, after: { title, category, priority, status, publishedAt, expiresAt } });
      await notifyPlatform({ type: "community_updated" });
      return Response.json({ created: true, id }, { status: 201 });
    }

    const before = await d1.prepare("SELECT * FROM community_announcements WHERE id = ?").bind(payload.id ?? "").first<AnnouncementRow>();
    if (!before) return fail("announcement_not_found", "公告已经不存在", 404);
    await d1.prepare(`UPDATE community_announcements SET title = ?, summary = ?, body = ?, category = ?, priority = ?,
      status = ?, published_at = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
      .bind(title, summary, body, category, priority, status, publishedAt, expiresAt, now, before.id).run();
    await writeAdminAudit(d1, { adminUserId: auth.user.id, adminRole: auth.role, module: "announcements", action: "update", targetType: "announcement", targetId: before.id, reason, before: announcement(before), after: { title, category, priority, status, publishedAt, expiresAt } });
    await notifyPlatform({ type: "community_updated" });
    return Response.json({ updated: true, id: before.id });
  } catch (error) {
    return fail("server_error", error instanceof Error ? error.message : "公告操作失败", 500);
  }
}
