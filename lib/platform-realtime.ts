import { getPlatformHub } from "../db";

export type PlatformRealtimeEvent = {
  type: "chat_updated" | "community_updated" | "friends_updated" | "presence_updated" | "lobby_updated" | "moderation_updated" | "account_restricted";
  userIds?: string[];
  hall?: string;
  channel?: string;
};

export async function notifyPlatform(event: PlatformRealtimeEvent) {
  try {
    const namespace = getPlatformHub();
    const hub = namespace.get(namespace.idFromName("micosm-platform"));
    await hub.fetch("https://platform-hub/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch {
    // The database remains authoritative and clients retain low-frequency recovery polling.
  }
}
