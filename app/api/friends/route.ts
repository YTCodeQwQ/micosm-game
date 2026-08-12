import { getD1 } from "../../../db";
import { avatarUrlForKey, getSessionUser, normalizeUsernameKey } from "../../../lib/auth";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { friendPair, GAME_INVITE_TTL_MS, ONLINE_WINDOW_MS } from "../../../lib/friends";
import { notifyPlatform } from "../../../lib/platform-realtime";
import { createNotification } from "../../../lib/notifications";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";

type PersonRow = {
  id: string;
  public_id: string | null;
  display_name: string;
  signature: string | null;
  avatar_key: string | null;
  last_seen: number | null;
};

type RelationshipRow = PersonRow & {
  user_low: string;
  user_high: string;
  requested_by: string;
  status: "pending" | "accepted" | "blocked";
  updated_at: number;
};

type InviteRow = PersonRow & {
  invite_id: string;
  room_id: string;
  game: string;
  expires_at: number;
  created_at: number;
};

function publicPerson(row: PersonRow, now: number) {
  return {
    id: row.id,
    publicId: row.public_id ?? "",
    displayName: row.display_name,
    signature: row.signature ?? "",
    avatarUrl: avatarUrlForKey(row.avatar_key),
    online: Boolean(row.last_seen && row.last_seen >= now - ONLINE_WINDOW_MS),
  };
}

async function prepare(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return { d1, user: null };
  const now = Date.now();
  await d1.prepare("INSERT INTO user_presence (user_id, last_seen) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET last_seen = excluded.last_seen")
    .bind(user.id, now).run();
  await d1.prepare("UPDATE game_invites SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expires_at <= ?").bind(now, now).run();
  return { d1, user };
}

export async function GET(request: Request) {
  try {
    const { d1, user } = await prepare(request);
    if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
    const now = Date.now();
    if (payload.type !== "offline") {
      const rate = await consumeRateLimit(d1, { scope: "friends_action", actor: user.id, limit: 30, windowMs: 60_000 });
      if (!rate.allowed) return rateLimitResponse(rate, "好友操作太频繁，请稍后再试");
    }
    const rawQuery = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    const query = normalizeUsernameKey(rawQuery);

    if (query) {
      const candidates = await d1.prepare(`SELECT u.id, u.public_id, u.display_name, u.signature, u.avatar_key, p.last_seen
        FROM users u LEFT JOIN user_presence p ON p.user_id = u.id
        WHERE u.id != ? AND (u.username_key LIKE ? OR UPPER(u.public_id) = ?)
        ORDER BY CASE WHEN UPPER(u.public_id) = ? THEN 0 WHEN u.username_key = ? THEN 1 ELSE 2 END, u.display_name LIMIT 12`)
        .bind(user.id, `%${query}%`, rawQuery.toUpperCase(), rawQuery.toUpperCase(), query).all<PersonRow>();
      const results = [];
      for (const row of candidates.results) {
        const [low, high] = friendPair(user.id, row.id);
        const relation = await d1.prepare("SELECT requested_by, status FROM friendships WHERE user_low = ? AND user_high = ?")
          .bind(low, high).first<{ requested_by: string; status: "pending" | "accepted" | "blocked" }>();
        const relationship = !relation ? "none"
          : relation.status === "accepted" ? "friend"
            : relation.status === "blocked" ? relation.requested_by === user.id ? "blocked" : "blocked_by_other"
              : relation.requested_by === user.id ? "outgoing" : "incoming";
        results.push({ ...publicPerson(row, now), relationship });
      }
      return Response.json({ results });
    }

    const relationships = await d1.prepare(`SELECT f.user_low, f.user_high, f.requested_by, f.status, f.updated_at,
        u.id, u.public_id, u.display_name, u.signature, u.avatar_key, p.last_seen
      FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_low = ? THEN f.user_high ELSE f.user_low END
      LEFT JOIN user_presence p ON p.user_id = u.id
      WHERE f.user_low = ? OR f.user_high = ?
      ORDER BY f.updated_at DESC`).bind(user.id, user.id, user.id).all<RelationshipRow>();

    const friends = relationships.results.filter((row) => row.status === "accepted").map((row) => publicPerson(row, now));
    const incomingRequests = relationships.results.filter((row) => row.status === "pending" && row.requested_by !== user.id).map((row) => publicPerson(row, now));
    const outgoingRequests = relationships.results.filter((row) => row.status === "pending" && row.requested_by === user.id).map((row) => publicPerson(row, now));
    const blocked = relationships.results.filter((row) => row.status === "blocked" && row.requested_by === user.id).map((row) => publicPerson(row, now));

    const invites = await d1.prepare(`SELECT gi.id AS invite_id, gi.room_id, gi.game, gi.expires_at, gi.created_at,
        u.id, u.public_id, u.display_name, u.signature, u.avatar_key, p.last_seen
      FROM game_invites gi
      JOIN users u ON u.id = gi.inviter_id
      LEFT JOIN user_presence p ON p.user_id = u.id
      WHERE gi.invitee_id = ? AND gi.status = 'pending' AND gi.expires_at > ?
      ORDER BY gi.created_at DESC`).bind(user.id, now).all<InviteRow>();

    const roomsTable = await d1.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_rooms'").first<{ name: string }>();
    const recentRows = roomsTable
      ? await d1.prepare(`SELECT u.id, u.public_id, u.display_name, u.signature, u.avatar_key, p.last_seen, MAX(r.updated_at) AS last_played
          FROM game_rooms r
          JOIN users u ON u.id = CASE WHEN r.host_user_id = ? THEN r.guest_user_id ELSE r.host_user_id END
          LEFT JOIN user_presence p ON p.user_id = u.id
          WHERE (r.host_user_id = ? OR r.guest_user_id = ?) AND r.host_user_id IS NOT NULL AND r.guest_user_id IS NOT NULL
          GROUP BY u.id, u.public_id, u.display_name, u.signature, u.avatar_key, p.last_seen
          ORDER BY last_played DESC LIMIT 8`).bind(user.id, user.id, user.id).all<PersonRow>()
      : { results: [] as PersonRow[] };
    const hiddenIds = new Set(relationships.results.filter((row) => row.status === "accepted" || row.status === "blocked").map((row) => row.id));
    const recent = recentRows.results.filter((row) => !hiddenIds.has(row.id)).map((row) => publicPerson(row, now));

    return Response.json({
      friends,
      incomingRequests,
      outgoingRequests,
      blocked,
      recent,
      gameInvites: invites.results.map((row) => ({ ...publicPerson(row, now), inviteId: row.invite_id, roomId: row.room_id, game: row.game, expiresAt: row.expires_at })),
    });
  } catch (error) {
    return Response.json({ error: { code: "server_error", message: error instanceof Error ? error.message : "好友列表暂时不可用" } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { type?: string; targetUserId?: string; inviteId?: string; roomId?: string; accept?: boolean };
    const { d1, user } = await prepare(request);
    if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
    const now = Date.now();

    if (payload.type === "offline") {
      await d1.prepare("DELETE FROM user_presence WHERE user_id = ?").bind(user.id).run();
      await notifyPlatform({ type: "presence_updated" });
      return Response.json({ ok: true });
    }

    if (payload.type === "respondGameInvite") {
      const invite = await d1.prepare("SELECT id, room_id, inviter_id, invitee_id, status, expires_at FROM game_invites WHERE id = ?")
        .bind(payload.inviteId ?? "").first<{ id: string; room_id: string; inviter_id: string; invitee_id: string; status: string; expires_at: number }>();
      if (!invite || invite.invitee_id !== user.id || invite.status !== "pending" || invite.expires_at <= now) return Response.json({ error: { code: "invite_expired", message: "这个对局邀请已经失效" } }, { status: 409 });
      if (!payload.accept) {
        await d1.prepare("UPDATE game_invites SET status = 'declined', updated_at = ? WHERE id = ? AND status = 'pending'").bind(now, invite.id).run();
        await createNotification(d1, { userId: invite.inviter_id, kind: "invite_declined", title: "对局邀请被拒绝", message: `${user.displayName} 拒绝了你的对局邀请。`, actorUserId: user.id, entityType: "game_invite", entityId: invite.id, dedupeKey: `invite-declined:${invite.id}` });
        await notifyPlatform({ type: "friends_updated", userIds: [user.id, invite.inviter_id] });
        await notifyPlatform({ type: "notifications_updated", userIds: [invite.inviter_id] });
        return Response.json({ declined: true });
      }
      const room = await d1.prepare("SELECT id FROM game_rooms WHERE id = ? AND mode = 'private' AND white_player IS NULL").bind(invite.room_id).first<{ id: string }>();
      if (!room) return Response.json({ error: { code: "room_unavailable", message: "邀请的房间已经不可加入" } }, { status: 409 });
      await notifyPlatform({ type: "friends_updated", userIds: [user.id, invite.inviter_id] });
      return Response.json({ roomId: invite.room_id });
    }

    const targetId = payload.targetUserId ?? "";
    if (!targetId || targetId === user.id) return Response.json({ error: { code: "invalid_target", message: "无法对这个用户执行操作" } }, { status: 400 });
    const target = await d1.prepare("SELECT id FROM users WHERE id = ?").bind(targetId).first<{ id: string }>();
    if (!target) return Response.json({ error: { code: "user_not_found", message: "没有找到这个用户" } }, { status: 404 });
    const [low, high] = friendPair(user.id, targetId);
    const relation = await d1.prepare("SELECT requested_by, status FROM friendships WHERE user_low = ? AND user_high = ?")
      .bind(low, high).first<{ requested_by: string; status: "pending" | "accepted" | "blocked" }>();

    if (payload.type === "sendRequest") {
      if (relation?.status === "blocked") return Response.json({ error: { code: "blocked", message: "当前无法添加该用户" } }, { status: 403 });
      if (relation?.status === "accepted") return Response.json({ accepted: true });
      if (relation?.status === "pending" && relation.requested_by !== user.id) {
        await d1.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE user_low = ? AND user_high = ?").bind(now, low, high).run();
        await createNotification(d1, { userId: targetId, kind: "friend_accepted", title: "好友申请已通过", message: `${user.displayName} 已成为你的好友。`, actorUserId: user.id, entityType: "user", entityId: user.id, dedupeKey: `friend-accepted:${low}:${high}` });
        await notifyPlatform({ type: "friends_updated", userIds: [user.id, targetId] });
        await notifyPlatform({ type: "notifications_updated", userIds: [targetId] });
        return Response.json({ accepted: true });
      }
      await d1.prepare("INSERT INTO friendships (user_low, user_high, requested_by, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?) ON CONFLICT(user_low, user_high) DO UPDATE SET requested_by = excluded.requested_by, status = 'pending', updated_at = excluded.updated_at")
        .bind(low, high, user.id, now, now).run();
      await createNotification(d1, { userId: targetId, kind: "friend_request", title: "新的好友申请", message: `${user.displayName} 想添加你为好友。`, actorUserId: user.id, entityType: "user", entityId: user.id, dedupeKey: `friend-request:${low}:${high}:${now}` });
      await notifyPlatform({ type: "friends_updated", userIds: [user.id, targetId] });
      await notifyPlatform({ type: "notifications_updated", userIds: [targetId] });
      return Response.json({ requested: true });
    }

    if (payload.type === "acceptRequest" || payload.type === "rejectRequest") {
      if (!relation || relation.status !== "pending" || relation.requested_by === user.id) return Response.json({ error: { code: "request_unavailable", message: "好友申请已经失效" } }, { status: 409 });
      if (payload.type === "acceptRequest") {
        await d1.prepare("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE user_low = ? AND user_high = ?").bind(now, low, high).run();
        await createNotification(d1, { userId: targetId, kind: "friend_accepted", title: "好友申请已通过", message: `${user.displayName} 已成为你的好友。`, actorUserId: user.id, entityType: "user", entityId: user.id, dedupeKey: `friend-accepted:${low}:${high}` });
        await notifyPlatform({ type: "notifications_updated", userIds: [targetId] });
      }
      else await d1.prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ?").bind(low, high).run();
      await notifyPlatform({ type: "friends_updated", userIds: [user.id, targetId] });
      return Response.json({ accepted: payload.type === "acceptRequest" });
    }

    if (payload.type === "cancelRequest") {
      await d1.prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ? AND status = 'pending' AND requested_by = ?").bind(low, high, user.id).run();
      await notifyPlatform({ type: "friends_updated", userIds: [user.id, targetId] });
      return Response.json({ cancelled: true });
    }

    if (payload.type === "removeFriend") {
      await d1.prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ? AND status = 'accepted'").bind(low, high).run();
      await notifyPlatform({ type: "friends_updated", userIds: [user.id, targetId] });
      return Response.json({ removed: true });
    }

    if (payload.type === "blockUser") {
      await d1.prepare("INSERT INTO friendships (user_low, user_high, requested_by, status, created_at, updated_at) VALUES (?, ?, ?, 'blocked', ?, ?) ON CONFLICT(user_low, user_high) DO UPDATE SET requested_by = excluded.requested_by, status = 'blocked', updated_at = excluded.updated_at")
        .bind(low, high, user.id, now, now).run();
      await d1.prepare("UPDATE game_invites SET status = 'cancelled', updated_at = ? WHERE status = 'pending' AND ((inviter_id = ? AND invitee_id = ?) OR (inviter_id = ? AND invitee_id = ?))")
        .bind(now, user.id, targetId, targetId, user.id).run();
      await notifyPlatform({ type: "friends_updated", userIds: [user.id, targetId] });
      return Response.json({ blocked: true });
    }

    if (payload.type === "unblockUser") {
      await d1.prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ? AND status = 'blocked' AND requested_by = ?").bind(low, high, user.id).run();
      await notifyPlatform({ type: "friends_updated", userIds: [user.id, targetId] });
      return Response.json({ unblocked: true });
    }

    if (payload.type === "sendGameInvite") {
      if (!relation || relation.status !== "accepted") return Response.json({ error: { code: "not_friends", message: "只能邀请好友加入对局" } }, { status: 403 });
      const presence = await d1.prepare("SELECT last_seen FROM user_presence WHERE user_id = ?").bind(targetId).first<{ last_seen: number }>();
      if (!presence || presence.last_seen < now - ONLINE_WINDOW_MS) return Response.json({ error: { code: "friend_offline", message: "好友当前不在线" } }, { status: 409 });
      const roomId = payload.roomId?.trim().toUpperCase() ?? "";
      const room = await d1.prepare("SELECT id, game FROM game_rooms WHERE id = ? AND host_user_id = ? AND mode = 'private' AND guest_user_id IS NULL AND white_player IS NULL")
        .bind(roomId, user.id).first<{ id: string; game: string }>();
      if (!room) return Response.json({ error: { code: "room_unavailable", message: "请先创建一个等待中的好友房间" } }, { status: 409 });
      await d1.prepare("UPDATE game_invites SET status = 'cancelled', updated_at = ? WHERE inviter_id = ? AND invitee_id = ? AND status = 'pending'").bind(now, user.id, targetId).run();
      const inviteId = crypto.randomUUID();
      await d1.prepare("INSERT INTO game_invites (id, inviter_id, invitee_id, room_id, game, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)")
        .bind(inviteId, user.id, targetId, room.id, room.game, now + GAME_INVITE_TTL_MS, now, now).run();
      await createNotification(d1, { userId: targetId, kind: "game_invite", title: "好友邀请你对局", message: `${user.displayName} 邀请你加入${room.game === "go" ? "围棋" : room.game === "gomoku" ? "五子棋" : "黑白棋"}房间。`, actorUserId: user.id, entityType: "game_invite", entityId: inviteId, dedupeKey: `game-invite:${inviteId}` });
      await notifyPlatform({ type: "friends_updated", userIds: [user.id, targetId] });
      await notifyPlatform({ type: "notifications_updated", userIds: [targetId] });
      return Response.json({ invited: true, inviteId });
    }

    return Response.json({ error: { code: "invalid_request", message: "无法识别这个好友操作" } }, { status: 400 });
  } catch (error) {
    return Response.json({ error: { code: "server_error", message: error instanceof Error ? error.message : "好友操作失败" } }, { status: 500 });
  }
}
