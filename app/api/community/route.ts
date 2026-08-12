import { getD1 } from "../../../db";
import { avatarUrlForKey, getSessionUser, normalizeUsernameKey } from "../../../lib/auth";
import {
  cleanCommentBody,
  cleanPostBody,
  cleanPostTitle,
  discussionCategory,
  extractDiscussionMentions,
  postAttachment,
  type AnnouncementRow,
  type DiscussionPostRow,
  type DiscussionReaction,
} from "../../../lib/community";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { activeSanction } from "../../../lib/moderation";
import { notifyPlatform } from "../../../lib/platform-realtime";
import { createNotification } from "../../../lib/notifications";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  created_at: number;
  display_name: string;
  public_id: string;
  signature: string | null;
  avatar_key: string | null;
};

function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function notifyMentions(d1: ReturnType<typeof getD1>, input: {
  actorId: string;
  actorName: string;
  content: string;
  postId: string;
  sourceId: string;
  excluded?: string[];
}) {
  const tokens = extractDiscussionMentions(input.content);
  if (!tokens.length) return [];
  const placeholders = tokens.map(() => "?").join(", ");
  const usernameKeys = tokens.map(normalizeUsernameKey);
  const publicIds = tokens.map((token) => token.toUpperCase());
  const users = await d1.prepare(`SELECT id FROM users WHERE username_key IN (${placeholders}) OR UPPER(public_id) IN (${placeholders})`)
    .bind(...usernameKeys, ...publicIds).all<{ id: string }>();
  const excluded = new Set([input.actorId, ...(input.excluded ?? [])]);
  const notified: string[] = [];
  for (const target of users.results) {
    if (excluded.has(target.id)) continue;
    const created = await createNotification(d1, {
      userId: target.id,
      kind: "community_reply",
      title: "有人在讨论中提到了你",
      message: `${input.actorName}：${input.content}`,
      actorUserId: input.actorId,
      entityType: "discussion_post",
      entityId: input.postId,
      dedupeKey: `community-mention:${input.sourceId}:${target.id}`,
    });
    if (created) notified.push(target.id);
  }
  return notified;
}

async function prepare(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  return { d1, user };
}

function attachmentSummary(value: string | null, includeFile = false) {
  const file = postAttachment(value);
  if (!file) return null;
  return {
    game: file.record.game,
    boardSize: file.record.boardSize,
    players: file.record.players,
    winner: file.record.winner,
    reason: file.record.reason,
    moveCount: file.record.state.moves?.filter((move) => move.type !== "resumeGo").length ?? 0,
    ...(includeFile ? { file } : {}),
  };
}

function discussionPost(row: DiscussionPostRow, viewerId: string, includeAttachment = false) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    pinned: Boolean(row.pinned),
    featured: Boolean(row.featured),
    locked: Boolean(row.locked),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isMine: row.user_id === viewerId,
    author: {
      id: row.user_id,
      publicId: row.public_id,
      displayName: row.display_name,
      signature: row.signature ?? "",
      avatarUrl: avatarUrlForKey(row.avatar_key),
    },
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    liked: Boolean(row.liked),
    favorited: Boolean(row.favorited),
    attachment: attachmentSummary(row.attachment_json, includeAttachment),
  };
}

function publicAnnouncement(row: AnnouncementRow) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    category: row.category,
    priority: row.priority,
    publishedAt: row.published_at,
    expiresAt: row.expires_at,
  };
}

const POST_SELECT = `SELECT p.*, u.display_name, u.public_id, u.signature, u.avatar_key,
  (SELECT COUNT(*) FROM discussion_reactions r WHERE r.post_id = p.id AND r.kind = 'like') AS likes,
  (SELECT COUNT(*) FROM discussion_comments c WHERE c.post_id = p.id AND c.status = 'visible') AS comments,
  EXISTS(SELECT 1 FROM discussion_reactions r WHERE r.post_id = p.id AND r.user_id = ? AND r.kind = 'like') AS liked,
  EXISTS(SELECT 1 FROM discussion_reactions r WHERE r.post_id = p.id AND r.user_id = ? AND r.kind = 'favorite') AS favorited
  FROM discussion_posts p JOIN users u ON u.id = p.user_id`;

export async function GET(request: Request) {
  try {
    const { d1, user } = await prepare(request);
    if (!user) return fail("auth_required", "请先登录", 401);
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "feed";
    const now = Date.now();

    if (view === "announcements") {
      const rows = await d1.prepare(`SELECT * FROM community_announcements
        WHERE status = 'published' AND published_at <= ? AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY CASE priority WHEN 'critical' THEN 3 WHEN 'important' THEN 2 ELSE 1 END DESC, published_at DESC LIMIT 30`)
        .bind(now, now).all<AnnouncementRow>();
      return Response.json({ announcements: rows.results.map(publicAnnouncement) });
    }

    if (view === "post") {
      const id = url.searchParams.get("id")?.trim() ?? "";
      const row = await d1.prepare(`${POST_SELECT} WHERE p.id = ? AND p.status = 'visible'`)
        .bind(user.id, user.id, id).first<DiscussionPostRow>();
      if (!row) return fail("post_not_found", "没有找到这篇帖子", 404);
      const comments = await d1.prepare(`SELECT c.id, c.post_id, c.user_id, c.parent_id, c.body, c.created_at,
          u.display_name, u.public_id, u.signature, u.avatar_key
        FROM discussion_comments c JOIN users u ON u.id = c.user_id
        WHERE c.post_id = ? AND c.status = 'visible' ORDER BY c.created_at ASC LIMIT 300`)
        .bind(id).all<CommentRow>();
      return Response.json({
        post: discussionPost(row, user.id, true),
        comments: comments.results.map((comment) => ({
          id: comment.id,
          postId: comment.post_id,
          parentId: comment.parent_id,
          body: comment.body,
          createdAt: comment.created_at,
          isMine: comment.user_id === user.id,
          author: {
            id: comment.user_id,
            publicId: comment.public_id,
            displayName: comment.display_name,
            signature: comment.signature ?? "",
            avatarUrl: avatarUrlForKey(comment.avatar_key),
          },
        })),
      });
    }

    const category = url.searchParams.get("category");
    const favoritesOnly = url.searchParams.get("favorites") === "1";
    const sort = url.searchParams.get("sort") === "hot" ? "hot" : "latest";
    const search = Array.from((url.searchParams.get("q") ?? "").normalize("NFKC").trim()).slice(0, 40).join("");
    const clauses = ["p.status = 'visible'"];
    const values: unknown[] = [user.id, user.id];
    if (category && category !== "all") {
      clauses.push("p.category = ?");
      values.push(discussionCategory(category));
    }
    if (favoritesOnly) {
      clauses.push("EXISTS(SELECT 1 FROM discussion_reactions fr WHERE fr.post_id = p.id AND fr.user_id = ? AND fr.kind = 'favorite')");
      values.push(user.id);
    }
    if (search) {
      clauses.push("(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\' OR u.public_id LIKE ? ESCAPE '\\')");
      const pattern = `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      values.push(pattern, pattern, pattern, pattern);
    }
    const order = sort === "hot"
      ? "p.pinned DESC, (likes * 3 + comments * 2) DESC, p.updated_at DESC"
      : "p.pinned DESC, p.updated_at DESC";
    const rows = await d1.prepare(`${POST_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT 50`)
      .bind(...values).all<DiscussionPostRow>();
    const announcements = await d1.prepare(`SELECT * FROM community_announcements
      WHERE status = 'published' AND published_at <= ? AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY CASE priority WHEN 'critical' THEN 3 WHEN 'important' THEN 2 ELSE 1 END DESC, published_at DESC LIMIT 3`)
      .bind(now, now).all<AnnouncementRow>();
    return Response.json({ posts: rows.results.map((row) => discussionPost(row, user.id)), announcements: announcements.results.map(publicAnnouncement) });
  } catch (error) {
    return fail("server_error", error instanceof Error ? error.message : "社区暂时不可用", 500);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      type?: string;
      postId?: string;
      commentId?: string;
      parentId?: string | null;
      title?: string;
      body?: string;
      category?: string;
      savedGameId?: string | null;
      kind?: DiscussionReaction;
      targetType?: "post" | "comment";
      targetId?: string;
    };
    const { d1, user } = await prepare(request);
    if (!user) return fail("auth_required", "请先登录", 401);
    const sanction = await activeSanction(d1, user.id);
    if (sanction.banned) return fail("account_banned", "账号已被暂停使用", 403);
    const now = Date.now();

    if (payload.type === "createPost") {
      if (sanction.muted) return fail("community_muted", "你暂时无法发布内容", 403);
      const limit = await consumeRateLimit(d1, { scope: "discussion_post", actor: user.id, limit: 5, windowMs: 60 * 60_000 });
      if (!limit.allowed) return rateLimitResponse(limit, "发帖次数过多，请稍后再试");
      const title = cleanPostTitle(payload.title);
      const body = cleanPostBody(payload.body);
      if (title.length < 4) return fail("title_too_short", "标题至少需要 4 个字", 400);
      if (body.length < 8) return fail("body_too_short", "正文至少需要 8 个字", 400);
      let attachmentJson: string | null = null;
      if (payload.savedGameId) {
        const saved = await d1.prepare("SELECT file_json FROM saved_game_records WHERE id = ? AND user_id = ?")
          .bind(payload.savedGameId, user.id).first<{ file_json: string }>();
        if (!saved) return fail("saved_game_not_found", "没有找到选择的云端棋谱", 404);
        attachmentJson = JSON.stringify(postAttachment(saved.file_json));
      }
      const id = crypto.randomUUID();
      await d1.prepare(`INSERT INTO discussion_posts (
          id, user_id, category, title, body, attachment_json, status, pinned, featured, locked, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'visible', 0, 0, 0, ?, ?)`)
        .bind(id, user.id, discussionCategory(payload.category), title, body, attachmentJson, now, now).run();
      const mentioned = await notifyMentions(d1, { actorId: user.id, actorName: user.displayName, content: `${title}\n${body}`, postId: id, sourceId: id });
      await notifyPlatform({ type: "community_updated" });
      if (mentioned.length) await notifyPlatform({ type: "notifications_updated", userIds: mentioned });
      return Response.json({ created: true, id }, { status: 201 });
    }

    if (payload.type === "comment") {
      if (sanction.muted) return fail("community_muted", "你暂时无法发表评论", 403);
      const limit = await consumeRateLimit(d1, { scope: "discussion_comment", actor: user.id, limit: 25, windowMs: 10 * 60_000 });
      if (!limit.allowed) return rateLimitResponse(limit, "评论发送太频繁，请稍后再试");
      const body = cleanCommentBody(payload.body);
      if (!body) return fail("empty_comment", "评论不能为空", 400);
      const post = await d1.prepare("SELECT id, user_id, title, locked FROM discussion_posts WHERE id = ? AND status = 'visible'").bind(payload.postId ?? "").first<{ id: string; user_id: string; title: string; locked: number }>();
      if (!post) return fail("post_not_found", "帖子已经不存在", 404);
      if (post.locked) return fail("post_locked", "这篇帖子已经停止评论", 409);
      let parentId: string | null = null;
      let notificationTarget = post.user_id;
      if (payload.parentId) {
        const parent = await d1.prepare("SELECT id, user_id FROM discussion_comments WHERE id = ? AND post_id = ? AND status = 'visible'").bind(payload.parentId, post.id).first<{ id: string; user_id: string }>();
        if (!parent) return fail("parent_not_found", "回复的评论已经不存在", 404);
        parentId = parent.id;
        notificationTarget = parent.user_id;
      }
      const id = crypto.randomUUID();
      await d1.prepare("INSERT INTO discussion_comments (id, post_id, user_id, parent_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'visible', ?, ?)")
        .bind(id, post.id, user.id, parentId, body, now, now).run();
      await d1.prepare("UPDATE discussion_posts SET updated_at = ? WHERE id = ?").bind(now, post.id).run();
      const created = await createNotification(d1, { userId: notificationTarget, kind: "community_reply", title: parentId ? "有人回复了你的评论" : "你的帖子有新评论", message: `${user.displayName}：${body}`, actorUserId: user.id, entityType: "discussion_post", entityId: post.id, dedupeKey: `community-reply:${id}` });
      const mentioned = await notifyMentions(d1, { actorId: user.id, actorName: user.displayName, content: body, postId: post.id, sourceId: id, excluded: [notificationTarget] });
      await notifyPlatform({ type: "community_updated" });
      const notificationUsers = [...new Set([...(created ? [notificationTarget] : []), ...mentioned])];
      if (notificationUsers.length) await notifyPlatform({ type: "notifications_updated", userIds: notificationUsers });
      return Response.json({ created: true, id }, { status: 201 });
    }

    if (payload.type === "toggleReaction") {
      const kind: DiscussionReaction = payload.kind === "favorite" ? "favorite" : "like";
      const post = await d1.prepare("SELECT id FROM discussion_posts WHERE id = ? AND status = 'visible'").bind(payload.postId ?? "").first<{ id: string }>();
      if (!post) return fail("post_not_found", "帖子已经不存在", 404);
      const existing = await d1.prepare("SELECT kind FROM discussion_reactions WHERE post_id = ? AND user_id = ? AND kind = ?")
        .bind(post.id, user.id, kind).first<{ kind: string }>();
      if (existing) await d1.prepare("DELETE FROM discussion_reactions WHERE post_id = ? AND user_id = ? AND kind = ?").bind(post.id, user.id, kind).run();
      else await d1.prepare("INSERT INTO discussion_reactions (post_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)").bind(post.id, user.id, kind, now).run();
      await notifyPlatform({ type: "community_updated" });
      return Response.json({ active: !existing });
    }

    if (payload.type === "report") {
      const limit = await consumeRateLimit(d1, { scope: "discussion_report", actor: user.id, limit: 10, windowMs: 60 * 60_000 });
      if (!limit.allowed) return rateLimitResponse(limit, "举报次数过多，请稍后再试");
      const targetType = payload.targetType === "comment" ? "comment" : "post";
      const targetId = payload.targetId?.trim() ?? "";
      const table = targetType === "comment" ? "discussion_comments" : "discussion_posts";
      const target = await d1.prepare(`SELECT user_id FROM ${table} WHERE id = ? AND status = 'visible'`).bind(targetId).first<{ user_id: string }>();
      if (!target || target.user_id === user.id) return fail("cannot_report", "无法举报这项内容", 400);
      await d1.prepare("INSERT OR IGNORE INTO discussion_reports (id, target_type, target_id, reporter_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'inappropriate', 'open', ?)")
        .bind(crypto.randomUUID(), targetType, targetId, user.id, now).run();
      await notifyPlatform({ type: "moderation_updated" });
      return Response.json({ reported: true });
    }

    if (payload.type === "deletePost") {
      const result = await d1.prepare("UPDATE discussion_posts SET status = 'deleted', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'visible'")
        .bind(now, payload.postId ?? "", user.id).run();
      if (!result.meta?.changes) return fail("post_not_found", "帖子已经不存在", 404);
      await notifyPlatform({ type: "community_updated" });
      return Response.json({ deleted: true });
    }

    if (payload.type === "deleteComment") {
      const result = await d1.prepare("UPDATE discussion_comments SET status = 'deleted', updated_at = ? WHERE id = ? AND user_id = ? AND status = 'visible'")
        .bind(now, payload.commentId ?? "", user.id).run();
      if (!result.meta?.changes) return fail("comment_not_found", "评论已经不存在", 404);
      await notifyPlatform({ type: "community_updated" });
      return Response.json({ deleted: true });
    }

    return fail("invalid_action", "无法识别这个社区操作", 400);
  } catch (error) {
    return fail("server_error", error instanceof Error ? error.message : "社区操作失败", 500);
  }
}
