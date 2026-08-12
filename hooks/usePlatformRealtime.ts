"use client";

import { useEffect, useState } from "react";

type RealtimeUser = { id: string; role: "player" | "super_admin" | "admin" | "moderator" | "support" | "operator" } | null;

export function usePlatformRealtime(user: RealtimeUser) {
  const [friendsRevision, setFriendsRevision] = useState(0);
  const [chatRevision, setChatRevision] = useState(0);
  const [communityRevision, setCommunityRevision] = useState(0);
  const [lobbyRevision, setLobbyRevision] = useState(0);
  const [notificationRevision, setNotificationRevision] = useState(0);
  const userId = user?.id;
  const role = user?.role;

  useEffect(() => {
    if (!userId) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let pingTimer = 0;
    let attempts = 0;
    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/platform-realtime`);
      socket.addEventListener("open", () => {
        attempts = 0;
        window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send("ping"); }, 20_000);
      });
      socket.addEventListener("message", (event) => {
        if (event.data === "pong") return;
        try {
          const update = JSON.parse(String(event.data)) as { type?: string };
          if (update.type === "friends_updated" || update.type === "presence_updated") setFriendsRevision((value) => value + 1);
          if (update.type === "chat_updated") setChatRevision((value) => value + 1);
          if (update.type === "community_updated") setCommunityRevision((value) => value + 1);
          if (update.type === "lobby_updated") setLobbyRevision((value) => value + 1);
          if (update.type === "notifications_updated") setNotificationRevision((value) => value + 1);
          if (update.type === "moderation_updated" && role !== "player") setChatRevision((value) => value + 1);
          if (update.type === "account_restricted") window.location.reload();
        } catch {
          // Ignore non-JSON heartbeat responses from older workers.
        }
      });
      socket.addEventListener("close", () => {
        window.clearInterval(pingTimer);
        if (disposed) return;
        attempts += 1;
        reconnectTimer = window.setTimeout(connect, Math.min(15_000, 750 * 2 ** Math.min(attempts, 4)));
      });
    };
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pingTimer);
      socket?.close(1000, "page closed");
    };
  }, [role, userId]);

  return { friendsRevision, chatRevision, communityRevision, lobbyRevision, notificationRevision };
}
