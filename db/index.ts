/// <reference types="@cloudflare/workers-types/latest" />

import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

const bindings = env as unknown as { DB?: D1Database; AVATARS?: R2Bucket; ROOM_HUB?: DurableObjectNamespace };

export function getDb() {
  if (!bindings.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(bindings.DB, { schema });
}

export function getD1() {
  if (!bindings.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return bindings.DB;
}

export function getAvatarBucket() {
  if (!bindings.AVATARS) throw new Error("Cloudflare R2 binding `AVATARS` is unavailable.");
  return bindings.AVATARS;
}

export function getRoomHub() {
  const roomHub = bindings.ROOM_HUB;
  if (!roomHub) throw new Error("Cloudflare Durable Object binding `ROOM_HUB` is unavailable.");
  return roomHub;
}
