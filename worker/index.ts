/// <reference types="@cloudflare/workers-types/latest" />

/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { GameRoomHub } from "./game-room-hub";
import { PlatformHub } from "./platform-hub";

export { GameRoomHub, PlatformHub };

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ROOM_HUB: DurableObjectNamespace<GameRoomHub>;
  PLATFORM_HUB: DurableObjectNamespace<PlatformHub>;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/realtime") {
      const roomId = url.searchParams.get("roomId")?.trim().toUpperCase();
      if (!roomId) return Response.json({ error: "缺少房间号" }, { status: 400 });
      const roomHub = env.ROOM_HUB.get(env.ROOM_HUB.idFromName(roomId));
      return roomHub.fetch(request);
    }

    if (url.pathname === "/api/platform-realtime") {
      const platformHub = env.PLATFORM_HUB.get(env.PLATFORM_HUB.idFromName("micosm-platform"));
      return platformHub.fetch(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
