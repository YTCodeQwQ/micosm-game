/// <reference types="@cloudflare/workers-types/latest" />

import { DurableObject } from "cloudflare:workers";
import { getSessionUser } from "../lib/auth";

type RoomHubEnv = { DB: D1Database };
type SocketAttachment = { roomId: string; userId: string; spectator: boolean };

export class GameRoomHub extends DurableObject<RoomHubEnv> {
  constructor(ctx: DurableObjectState, env: RoomHubEnv) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/notify")) {
      const event = await request.json();
      this.broadcast(event);
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "需要 WebSocket 连接" }, { status: 426 });
    }
    const roomId = url.searchParams.get("roomId")?.trim().toUpperCase();
    if (!roomId) return Response.json({ error: "缺少房间号" }, { status: 400 });
    const user = await getSessionUser(request, this.env.DB);
    if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
    const room = await this.env.DB.prepare("SELECT mode, spectator_policy, host_user_id, guest_user_id, black_user_id, white_user_id FROM game_rooms WHERE id = ?")
      .bind(roomId).first<{ mode: string; spectator_policy: string | null; host_user_id: string | null; guest_user_id: string | null; black_user_id: string | null; white_user_id: string | null }>();
    if (!room) return Response.json({ error: "房间不存在" }, { status: 404 });
    const participant = [room.host_user_id, room.guest_user_id, room.black_user_id, room.white_user_id].includes(user.id);
    let spectator = false;
    if (!participant) {
      if (["ranked", "ai"].includes(room.mode) || !["public", "friends"].includes(room.spectator_policy ?? "off")) {
        return Response.json({ error: "这个房间没有开放观战" }, { status: 403 });
      }
      if (room.spectator_policy === "friends") {
        const playerIds = [...new Set([room.host_user_id, room.guest_user_id, room.black_user_id, room.white_user_id].filter((id): id is string => Boolean(id)))];
        let friend = false;
        for (const playerUserId of playerIds) {
          const [low, high] = user.id < playerUserId ? [user.id, playerUserId] : [playerUserId, user.id];
          const relation = await this.env.DB.prepare("SELECT status FROM friendships WHERE user_low = ? AND user_high = ?")
            .bind(low, high).first<{ status: string }>();
          if (relation?.status === "accepted") { friend = true; break; }
        }
        if (!friend) return Response.json({ error: "只有对局双方的好友可以观战" }, { status: 403 });
      }
      spectator = true;
      const now = Date.now();
      await this.env.DB.prepare(`INSERT INTO game_room_spectators (room_id, user_id, last_seen) VALUES (?, ?, ?)
        ON CONFLICT(room_id, user_id) DO UPDATE SET last_seen = excluded.last_seen`).bind(roomId, user.id, now).run();
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [roomId, `user:${user.id}`]);
    server.serializeAttachment({ roomId, userId: user.id, spectator } satisfies SocketAttachment);
    server.send(JSON.stringify({ type: "connected", roomId, spectator }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    if (message === "ping") {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.spectator) {
        const now = Date.now();
        void this.env.DB.prepare(`INSERT INTO game_room_spectators (room_id, user_id, last_seen) VALUES (?, ?, ?)
          ON CONFLICT(room_id, user_id) DO UPDATE SET last_seen = excluded.last_seen`).bind(attachment.roomId, attachment.userId, now).run();
      }
      socket.send("pong");
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment?.spectator) {
      void this.env.DB.prepare("DELETE FROM game_room_spectators WHERE room_id = ? AND user_id = ?")
        .bind(attachment.roomId, attachment.userId).run();
    }
    socket.close(code, reason);
  }

  webSocketError(socket: WebSocket) {
    socket.close(1011, "WebSocket error");
  }

  private broadcast(event: unknown) {
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "Broadcast failed");
      }
    }
  }
}
