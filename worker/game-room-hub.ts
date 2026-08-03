/// <reference types="@cloudflare/workers-types/latest" />

import { DurableObject } from "cloudflare:workers";
import { getSessionUser } from "../lib/auth";

type RoomHubEnv = { DB: D1Database };
type SocketAttachment = { roomId: string; userId: string };

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
    const room = await this.env.DB.prepare("SELECT host_user_id, black_user_id, white_user_id FROM game_rooms WHERE id = ?")
      .bind(roomId).first<{ host_user_id: string | null; black_user_id: string | null; white_user_id: string | null }>();
    if (!room) return Response.json({ error: "房间不存在" }, { status: 404 });
    if (![room.host_user_id, room.black_user_id, room.white_user_id].includes(user.id)) {
      return Response.json({ error: "你不是这个房间的玩家" }, { status: 403 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [roomId, `user:${user.id}`]);
    server.serializeAttachment({ roomId, userId: user.id } satisfies SocketAttachment);
    server.send(JSON.stringify({ type: "connected", roomId }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    if (message === "ping") socket.send("pong");
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) {
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
