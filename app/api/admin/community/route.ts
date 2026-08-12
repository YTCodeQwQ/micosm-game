import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../lib/admin";
import { ensureAppSchema } from "../../../../lib/database-migrations";
import { createNotification } from "../../../../lib/notifications";
import { notifyPlatform } from "../../../../lib/platform-realtime";

type ManagedPostRow = {
  id: string;
  user_id: string;
  category: string;
  title: string;
  body: string;
  status: string;
  pinned: number;
  featured: number;
  locked: number;
  created_at: number;
  updated_at: number;
  display_name: string;
  public_id: string;
  likes: number;
  comments: number;
};

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function clean(value: unknown, limit: number) {
  if (typeof value !== "string") return "";
  return Array.from(value.normalize("NFKC").trim()).slice(0, limit).join("");
}

function publicPost(row: ManagedPostRow) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    excerpt: Array.from(row.body).slice(0, 180).join(""),
    status: row.status,
    pinned: Boolean(row.pinned),
    featured: Boolean(row.featured),
    locked: Boolean(row.locked),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: { id: row.user_id, displayName: row.display_name, publicId: row.public_id },
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
  };
}

const SELECT_POSTS = `SELECT p.*, u.display_name, u.public_id,
  (SELECT COUNT(*) FROM discussion_reactions r WHERE r.post_id = p.id AND r.kind = 'like') AS likes,
  (SELECT COUNT(*) FROM discussion_comments c WHERE c.post_id = p.id AND c.status = 'visible') AS comments
  FROM discussion_posts p JOIN users u ON u.id = p.user_id`;

export async function GET(request: Request) {
  try {
    const d1 = getD1();
    await ensureAppSchema(d1);
    const auth = await requireAdminPermission(request, d1, adminIds(), "community.write");
    if (auth.response) return auth.response;
    const url = new URL(request.url);
    const query = clean(url.searchParams.get("q"), 40);
    const values: unknown[] = [];
    const clauses = ["p.status IN ('visible', 'hidden')"];
    if (query) {
      clauses.push("(p.title LIKE ? OR p.body LIKE ? OR u.display_name LIKE ? OR u.public_id LIKE ?)");
      const pattern = `%${query}%`;
      values.push(pattern, pattern, pattern, pattern);
    }
    const rows = await d1.prepare(`${SELECT_POSTS} WHERE ${clauses.join(" AND ")} ORDER BY p.pinned DESC, p.updated_at DESC LIMIT 100`)
      .bind(...values).all<ManagedPostRow>();
    return Response.json({ posts: rows.results.map(publicPost) });
  } catch (error) {
    return fail("server_error", error instanceof Error ? error.message : "讨论管理暂时不可用", 500);
  }
}

export async function POST(request: Request) {
  try {
    const d1 = getD1();
    await ensureAppSchema(d1);
    const auth = await requireAdminPermission(request, d1, adminIds(), "community.write");
    if (auth.response || !auth.user || !auth.role) return auth.response ?? fail("admin_required", "需要内容管理权限", 403);
    const payload = await request.json() as { action?: "pin" | "feature" | "lock" | "hide" | "restore"; postId?: string; enabled?: boolean; reason?: string };
    const reason = clean(payload.reason, 240);
    if (reason.length < 2) return fail("reason_required", "请填写操作原因", 400);
    const before = await d1.prepare(`${SELECT_POSTS} WHERE p.id = ?`).bind(payload.postId ?? "").first<ManagedPostRow>();
    if (!before || before.status === "deleted") return fail("post_not_found", "帖子已经不存在", 404);
    const now = Date.now();
    let actionLabel = "";

    if (payload.action === "pin") {
      await d1.prepare("UPDATE discussion_posts SET pinned = ?, updated_at = ? WHERE id = ?").bind(payload.enabled ? 1 : 0, now, before.id).run();
      actionLabel = payload.enabled ? "置顶" : "取消置顶";
    } else if (payload.action === "feature") {
      await d1.prepare("UPDATE discussion_posts SET featured = ?, updated_at = ? WHERE id = ?").bind(payload.enabled ? 1 : 0, now, before.id).run();
      actionLabel = payload.enabled ? "设为精华" : "取消精华";
    } else if (payload.action === "lock") {
      await d1.prepare("UPDATE discussion_posts SET locked = ?, updated_at = ? WHERE id = ?").bind(payload.enabled ? 1 : 0, now, before.id).run();
      actionLabel = payload.enabled ? "锁定评论" : "恢复评论";
    } else if (payload.action === "hide") {
      await d1.prepare("UPDATE discussion_posts SET status = 'hidden', updated_at = ? WHERE id = ?").bind(now, before.id).run();
      actionLabel = "隐藏";
    } else if (payload.action === "restore") {
      await d1.prepare("UPDATE discussion_posts SET status = 'visible', updated_at = ? WHERE id = ?").bind(now, before.id).run();
      actionLabel = "恢复显示";
    } else {
      return fail("invalid_action", "无法识别这个内容操作", 400);
    }

    const after = await d1.prepare(`${SELECT_POSTS} WHERE p.id = ?`).bind(before.id).first<ManagedPostRow>();
    await writeAdminAudit(d1, {
      adminUserId: auth.user.id,
      adminRole: auth.role,
      module: "community",
      action: payload.action,
      targetType: "discussion_post",
      targetId: before.id,
      reason,
      before: publicPost(before),
      after: after ? publicPost(after) : undefined,
    });
    const notified = await createNotification(d1, {
      userId: before.user_id,
      kind: "system",
      title: `你的帖子已${actionLabel}`,
      message: `《${before.title}》状态已调整。原因：${reason}`,
      actorUserId: auth.user.id,
      entityType: "discussion_post",
      entityId: before.id,
      dedupeKey: `community-admin:${before.id}:${payload.action}:${now}`,
    });
    await notifyPlatform({ type: "community_updated" });
    if (notified) await notifyPlatform({ type: "notifications_updated", userIds: [before.user_id] });
    return Response.json({ updated: true, post: after ? publicPost(after) : null });
  } catch (error) {
    return fail("server_error", error instanceof Error ? error.message : "讨论管理操作失败", 500);
  }
}
