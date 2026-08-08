/// <reference types="@cloudflare/workers-types/latest" />

import { DurableObject } from "cloudflare:workers";
import { ensureAuthSchema, getSessionUser } from "../lib/auth";
import { ensureFriendSchema } from "../lib/friends";

type PlatformHubEnv = { DB: D1Database };
type SocketAttachment = { userId: string };
type PlatformEvent = { type?: string; userIds?: string[]; [key: string]: unknown };

export class PlatformHub extends DurableObject<PlatformHubEnv> {
  constructor(ctx: DurableObjectState, env: PlatformHubEnv) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/notify")) {
      const event = await request.json() as PlatformEvent;
      this.broadcast(event);
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "需要 WebSocket 连接" }, { status: 426 });
    }

    await ensureAuthSchema(this.env.DB);
    await ensureFriendSchema(this.env.DB);
    const user = await getSessionUser(request, this.env.DB);
    if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, [`user:${user.id}`]);
    server.serializeAttachment({ userId: user.id } satisfies SocketAttachment);
    await this.touchPresence(user.id);
    server.send(JSON.stringify({ type: "connected" }));
    this.broadcast({ type: "presence_updated", userIds: [] });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message !== "ping") return;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment) void this.touchPresence(attachment.userId);
    socket.send("pong");
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment) void this.markOfflineWhenLastSocket(attachment.userId);
    socket.close(code, reason);
  }

  webSocketError(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment) void this.markOfflineWhenLastSocket(attachment.userId);
    socket.close(1011, "WebSocket error");
  }

  private async touchPresence(userId: string) {
    await this.env.DB.prepare(`INSERT INTO user_presence (user_id, last_seen) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_seen = excluded.last_seen`).bind(userId, Date.now()).run();
  }

  private async markOfflineWhenLastSocket(userId: string) {
    const stillConnected = this.ctx.getWebSockets(`user:${userId}`).some((socket) => socket.readyState === WebSocket.OPEN);
    if (stillConnected) return;
    await this.env.DB.prepare("DELETE FROM user_presence WHERE user_id = ?").bind(userId).run();
    this.broadcast({ type: "presence_updated", userIds: [] });
  }

  private broadcast(event: PlatformEvent) {
    const audience = Array.isArray(event.userIds) ? new Set(event.userIds) : null;
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (audience?.size && (!attachment || !audience.has(attachment.userId))) continue;
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "Broadcast failed");
      }
    }
  }
}
