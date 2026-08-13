import { getD1, getRoomHub } from "../../../db";
import { avatarUrlForKey, getSessionUser } from "../../../lib/auth";
import { cleanChatMessage, WORLD_RETENTION_MS } from "../../../lib/chat";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { friendPair } from "../../../lib/friends";
import { activeSanction } from "../../../lib/moderation";
import { featureEnabled, featureUnavailable } from "../../../lib/operations";
import { createNotification } from "../../../lib/notifications";
import { notifyPlatform } from "../../../lib/platform-realtime";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";

type MessageRow = {
  id: string;
  channel: "world" | "direct" | "match";
  hall: "main" | "go" | "gomoku" | "reversi";
  sender_id: string;
  recipient_id: string | null;
  body: string;
  room_id: string | null;
  created_at: number;
  display_name: string;
  signature: string | null;
  avatar_key: string | null;
  match_role?: "black" | "white" | null;
};

type RoomState = { game: string; open: boolean };

async function prepare(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  return { d1, user };
}

async function areFriends(d1: ReturnType<typeof getD1>, first: string, second: string) {
  const [low, high] = friendPair(first, second);
  const row = await d1.prepare("SELECT status FROM friendships WHERE user_low = ? AND user_high = ?").bind(low, high).first<{ status: string }>();
  return row?.status === "accepted";
}

async function matchChatAccess(d1: ReturnType<typeof getD1>, roomId: string, userId: string) {
  const room = await d1.prepare("SELECT id, black_user_id, white_user_id FROM game_rooms WHERE id = ?")
    .bind(roomId).first<{ id: string; black_user_id: string | null; white_user_id: string | null }>();
  if (!room) return null;
  if (room.black_user_id === userId) return { room, role: "black" as const };
  if (room.white_user_id === userId) return { room, role: "white" as const };
  const spectator = await d1.prepare("SELECT user_id FROM game_room_spectators WHERE room_id = ? AND user_id = ? AND last_seen > ?")
    .bind(roomId, userId, Date.now() - 90_000).first<{ user_id: string }>();
  return spectator ? { room, role: null } : null;
}

async function notifyMatchChat(roomId: string) {
  try {
    const namespace = getRoomHub();
    const hub = namespace.get(namespace.idFromName(roomId));
    await hub.fetch("https://room-hub/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "chat_updated", roomId }),
    });
  } catch {
    // Open chat panels retain a short recovery poll.
  }
}

async function hydrateMessages(d1: ReturnType<typeof getD1>, rows: MessageRow[], viewerId: string) {
  const roomStates = new Map<string, RoomState>();
  const roomsTable = await d1.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_rooms'").first<{ name: string }>();
  if (roomsTable) {
    for (const roomId of new Set(rows.map((row) => row.room_id).filter((id): id is string => Boolean(id)))) {
      const room = await d1.prepare("SELECT game, mode, white_player, guest_user_id FROM game_rooms WHERE id = ?").bind(roomId).first<{ game: string; mode: string; white_player: string | null; guest_user_id: string | null }>();
      roomStates.set(roomId, { game: room?.game ?? "", open: Boolean(room && room.mode === "private" && !room.white_player && !room.guest_user_id) });
    }
  }
  return rows.map((row) => ({
    id: row.id,
    channel: row.channel,
    hall: row.hall,
    body: row.body,
    createdAt: row.created_at,
    isMine: row.sender_id === viewerId,
    sender: {
      id: row.sender_id,
      displayName: row.display_name,
      signature: row.signature ?? "",
      avatarUrl: avatarUrlForKey(row.avatar_key),
    },
    matchRole: row.match_role ?? null,
    room: row.room_id ? { id: row.room_id, game: roomStates.get(row.room_id)?.game ?? "", open: roomStates.get(row.room_id)?.open ?? false } : null,
  }));
}

export async function GET(request: Request) {
  try {
    const { d1, user } = await prepare(request);
    if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    const channel = url.searchParams.get("channel");
    const hall = ["main", "go", "gomoku", "reversi"].includes(url.searchParams.get("hall") ?? "main") ? url.searchParams.get("hall") ?? "main" : "main";

    if (view === "overview") {
      const worldUnread = await d1.prepare(`SELECT COUNT(*) AS count FROM chat_messages m
        WHERE m.channel = 'world' AND m.deleted_at IS NULL AND m.sender_id != ?
        AND m.created_at > COALESCE((SELECT r.last_read_at FROM chat_reads r WHERE r.user_id = ? AND r.channel = 'world' AND r.peer_id = COALESCE(m.hall, 'main')), 0)
        AND NOT EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'blocked' AND ((f.user_low = ? AND f.user_high = m.sender_id) OR (f.user_high = ? AND f.user_low = m.sender_id)))`)
        .bind(user.id, user.id, user.id, user.id).first<{ count: number }>();
      const directUnreads = await d1.prepare(`SELECT m.sender_id AS user_id, COUNT(*) AS count FROM chat_messages m
        WHERE m.channel = 'direct' AND m.recipient_id = ? AND m.deleted_at IS NULL
        AND m.created_at > COALESCE((SELECT r.last_read_at FROM chat_reads r WHERE r.user_id = ? AND r.channel = 'direct' AND r.peer_id = m.sender_id), 0)
        AND EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND ((f.user_low = ? AND f.user_high = m.sender_id) OR (f.user_high = ? AND f.user_low = m.sender_id)))
        GROUP BY m.sender_id`).bind(user.id, user.id, user.id, user.id).all<{ user_id: string; count: number }>();
      return Response.json({ worldUnread: worldUnread?.count ?? 0, directUnreads: Object.fromEntries(directUnreads.results.map((row) => [row.user_id, row.count])) });
    }

    let rows: MessageRow[] = [];
    if (channel === "world") {
      const result = await d1.prepare(`SELECT m.id, m.channel, COALESCE(m.hall, 'main') AS hall, m.sender_id, m.recipient_id, m.body, m.room_id, m.created_at,
          u.display_name, u.signature, u.avatar_key
        FROM chat_messages m JOIN users u ON u.id = m.sender_id
        WHERE m.channel = 'world' AND COALESCE(m.hall, 'main') = ? AND m.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'blocked' AND ((f.user_low = ? AND f.user_high = m.sender_id) OR (f.user_high = ? AND f.user_low = m.sender_id)))
        ORDER BY m.created_at DESC LIMIT 80`).bind(hall, user.id, user.id).all<MessageRow>();
      rows = result.results.reverse();
    } else if (channel === "direct") {
      const peerId = url.searchParams.get("userId") ?? "";
      if (!peerId || !await areFriends(d1, user.id, peerId)) return Response.json({ error: { code: "not_friends", message: "只能与好友私聊" } }, { status: 403 });
      const result = await d1.prepare(`SELECT m.id, m.channel, COALESCE(m.hall, 'main') AS hall, m.sender_id, m.recipient_id, m.body, m.room_id, m.created_at,
          u.display_name, u.signature, u.avatar_key
        FROM chat_messages m JOIN users u ON u.id = m.sender_id
        WHERE m.channel = 'direct' AND m.deleted_at IS NULL
        AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
        ORDER BY m.created_at DESC LIMIT 80`).bind(user.id, peerId, peerId, user.id).all<MessageRow>();
      rows = result.results.reverse();
    } else if (channel === "match") {
      const roomId = (url.searchParams.get("roomId") ?? "").trim().toUpperCase();
      if (!roomId || !await matchChatAccess(d1, roomId, user.id)) return Response.json({ error: { code: "match_chat_forbidden", message: "你不在这场对局中" } }, { status: 403 });
      const result = await d1.prepare(`SELECT m.id, m.channel, COALESCE(m.hall, 'main') AS hall, m.sender_id, m.recipient_id, m.body, m.room_id, m.created_at,
          u.display_name, u.signature, u.avatar_key,
          CASE WHEN r.black_user_id = m.sender_id THEN 'black' WHEN r.white_user_id = m.sender_id THEN 'white' ELSE NULL END AS match_role
        FROM chat_messages m JOIN users u ON u.id = m.sender_id JOIN game_rooms r ON r.id = m.room_id
        WHERE m.channel = 'match' AND m.room_id = ? AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC LIMIT 120`).bind(roomId).all<MessageRow>();
      rows = result.results.reverse();
    } else {
      return Response.json({ error: { code: "invalid_channel", message: "请选择聊天频道" } }, { status: 400 });
    }
    return Response.json({ messages: await hydrateMessages(d1, rows, user.id) });
  } catch (error) {
    return Response.json({ error: { code: "server_error", message: error instanceof Error ? error.message : "聊天暂时不可用" } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { type?: string; channel?: "world" | "direct" | "match"; hall?: "main" | "go" | "gomoku" | "reversi"; targetUserId?: string; body?: string; roomId?: string; messageId?: string };
    const { d1, user } = await prepare(request);
    if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
    const now = Date.now();
    const sanction = await activeSanction(d1, user.id);
    if (sanction.banned) return Response.json({ error: { code: "account_banned", message: "账号已被暂停使用" } }, { status: 403 });

    if (payload.type === "markRead") {
      const peerId = payload.channel === "direct" ? payload.targetUserId ?? "" : ["main", "go", "gomoku", "reversi"].includes(payload.hall ?? "main") ? payload.hall ?? "main" : "main";
      if (!payload.channel || (payload.channel === "direct" && !peerId)) return Response.json({ error: { code: "invalid_channel", message: "无法标记这个频道" } }, { status: 400 });
      await d1.prepare("INSERT INTO chat_reads (user_id, channel, peer_id, last_read_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, channel, peer_id) DO UPDATE SET last_read_at = excluded.last_read_at")
        .bind(user.id, payload.channel, peerId, now).run();
      return Response.json({ read: true });
    }

    if (payload.type === "delete") {
      const target = await d1.prepare("SELECT channel, room_id FROM chat_messages WHERE id = ? AND sender_id = ? AND deleted_at IS NULL").bind(payload.messageId ?? "", user.id).first<{ channel: string; room_id: string | null }>();
      const result = await d1.prepare("UPDATE chat_messages SET deleted_at = ? WHERE id = ? AND sender_id = ? AND deleted_at IS NULL").bind(now, payload.messageId ?? "", user.id).run();
      if (!result.meta.changes) return Response.json({ error: { code: "message_unavailable", message: "消息已经不存在" } }, { status: 404 });
      if (target?.channel === "match" && target.room_id) await notifyMatchChat(target.room_id);
      else await notifyPlatform({ type: "chat_updated" });
      return Response.json({ deleted: true });
    }

    if (payload.type === "report") {
      const reportLimit = await consumeRateLimit(d1, { scope: "chat_report", actor: user.id, limit: 10, windowMs: 60 * 60_000 });
      if (!reportLimit.allowed) return rateLimitResponse(reportLimit, "举报次数过多，请稍后再试");
      const message = await d1.prepare("SELECT id, sender_id, channel, room_id FROM chat_messages WHERE id = ? AND deleted_at IS NULL").bind(payload.messageId ?? "").first<{ id: string; sender_id: string; channel: string; room_id: string | null }>();
      if (!message || !["world", "match"].includes(message.channel) || message.sender_id === user.id) return Response.json({ error: { code: "cannot_report", message: "无法举报这条消息" } }, { status: 400 });
      if (message.channel === "match" && (!message.room_id || !await matchChatAccess(d1, message.room_id, user.id))) {
        return Response.json({ error: { code: "match_chat_forbidden", message: "你不在这场对局中" } }, { status: 403 });
      }
      await d1.prepare("INSERT OR IGNORE INTO chat_reports (id, message_id, reporter_id, reason, created_at, status) VALUES (?, ?, ?, 'inappropriate', ?, 'open')").bind(crypto.randomUUID(), message.id, user.id, now).run();
      await notifyPlatform({ type: "moderation_updated" });
      return Response.json({ reported: true });
    }

    if (payload.type !== "send" || !payload.channel) return Response.json({ error: { code: "invalid_request", message: "无法识别这个聊天操作" } }, { status: 400 });
    if (payload.channel === "world" && !await featureEnabled(d1, "world_chat_writable")) return featureUnavailable("世界频道当前为只读状态", "world_chat_read_only");
    if (payload.channel === "world" && await featureEnabled(d1, "maintenance_mode")) return featureUnavailable("平台维护期间世界频道暂时只读", "maintenance_mode");
    if (sanction.muted) return Response.json({ error: { code: "chat_muted", message: "你暂时无法发送消息" }, mutedUntil: sanction.mutedUntil }, { status: 403 });
    const sendLimit = await consumeRateLimit(d1, {
      scope: payload.channel === "world" ? "chat_world" : payload.channel === "match" ? "chat_match" : "chat_direct",
      actor: user.id,
      limit: payload.channel === "world" ? 12 : payload.channel === "match" ? 30 : 45,
      windowMs: 60_000,
    });
    if (!sendLimit.allowed) return rateLimitResponse(sendLimit, "消息发送太频繁，请稍后再试");
    const body = cleanChatMessage(payload.body);
    const hall = payload.channel === "world" && ["main", "go", "gomoku", "reversi"].includes(payload.hall ?? "main") ? payload.hall ?? "main" : "main";
    const targetId = payload.channel === "direct" ? payload.targetUserId ?? "" : "";
    if (payload.channel === "direct" && (!targetId || !await areFriends(d1, user.id, targetId))) return Response.json({ error: { code: "not_friends", message: "只能与好友私聊" } }, { status: 403 });

    let roomId: string | null = null;
    if (payload.channel === "match") {
      roomId = payload.roomId?.trim().toUpperCase() ?? "";
      if (!roomId || !await matchChatAccess(d1, roomId, user.id)) return Response.json({ error: { code: "match_chat_forbidden", message: "你不在这场对局中" } }, { status: 403 });
    } else if (payload.roomId) {
      const room = await d1.prepare("SELECT id FROM game_rooms WHERE id = ? AND host_user_id = ? AND mode = 'private' AND guest_user_id IS NULL AND white_player IS NULL")
        .bind(payload.roomId.trim().toUpperCase(), user.id).first<{ id: string }>();
      if (!room) return Response.json({ error: { code: "room_unavailable", message: "请先创建一个等待中的好友房间" } }, { status: 409 });
      roomId = room.id;
    }
    if (!body && !roomId) return Response.json({ error: { code: "empty_message", message: "消息不能为空" } }, { status: 400 });

    const latest = payload.channel === "world"
      ? await d1.prepare("SELECT created_at FROM chat_messages WHERE sender_id = ? AND channel = 'world' AND hall = ? ORDER BY created_at DESC LIMIT 1").bind(user.id, hall).first<{ created_at: number }>()
      : payload.channel === "match"
        ? await d1.prepare("SELECT created_at FROM chat_messages WHERE sender_id = ? AND channel = 'match' AND room_id = ? ORDER BY created_at DESC LIMIT 1").bind(user.id, roomId).first<{ created_at: number }>()
        : await d1.prepare("SELECT created_at FROM chat_messages WHERE sender_id = ? AND recipient_id = ? AND channel = 'direct' ORDER BY created_at DESC LIMIT 1").bind(user.id, targetId).first<{ created_at: number }>();
    const minimumInterval = payload.channel === "world" ? 2500 : payload.channel === "match" ? 700 : 700;
    if (latest && now - latest.created_at < minimumInterval) return Response.json({ error: { code: "rate_limited", message: "发送得太快了，请稍等" } }, { status: 429 });
    if (payload.channel === "world" && roomId) {
      const latestInvite = await d1.prepare("SELECT created_at FROM chat_messages WHERE sender_id = ? AND channel = 'world' AND room_id IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(user.id).first<{ created_at: number }>();
      if (latestInvite && now - latestInvite.created_at < 30_000) return Response.json({ error: { code: "invite_rate_limited", message: "世界频道房间邀请每 30 秒可发送一次" } }, { status: 429 });
    }

    const id = crypto.randomUUID();
    await d1.prepare("INSERT INTO chat_messages (id, channel, hall, sender_id, recipient_id, body, room_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, payload.channel, hall, user.id, targetId || null, body, roomId, now).run();
    if (payload.channel === "direct") {
      await createNotification(d1, { userId: targetId, kind: "direct_message", title: `${user.displayName} 发来私信`, message: body || "发送了一个房间邀请。", actorUserId: user.id, entityType: "direct_chat", entityId: user.id, dedupeKey: `direct-message:${id}` });
      await notifyPlatform({ type: "notifications_updated", userIds: [targetId] });
    }
    if (payload.channel === "match" && roomId) {
      await d1.prepare(`DELETE FROM chat_messages WHERE channel = 'match' AND room_id = ? AND id NOT IN (
        SELECT id FROM chat_messages WHERE channel = 'match' AND room_id = ? ORDER BY created_at DESC LIMIT 200
      )`).bind(roomId, roomId).run();
      await notifyMatchChat(roomId);
      return Response.json({ sent: true, id });
    }
    await d1.prepare("DELETE FROM chat_messages WHERE channel = 'world' AND created_at < ?").bind(now - WORLD_RETENTION_MS).run();
    await notifyPlatform({ type: "chat_updated", channel: payload.channel, hall, userIds: payload.channel === "direct" ? [user.id, targetId] : undefined });
    return Response.json({ sent: true, id });
  } catch (error) {
    return Response.json({ error: { code: "server_error", message: error instanceof Error ? error.message : "聊天操作失败" } }, { status: 500 });
  }
}
