import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { clientAddress, consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { logEvent } from "../../../lib/observability";

type ServiceStatus = { ready?: boolean; engine?: string; model?: string };

async function checkService(origin: string, token?: string) {
  try {
    const response = await fetch(`${origin.replace(/\/$/, "")}/health`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(2_500),
    });
    const data = await response.json() as ServiceStatus;
    return { ok: response.ok && data.ready === true, engine: data.engine, model: data.model };
  } catch {
    return { ok: false };
  }
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const d1 = getD1();
    await ensureAppSchema(d1);
    const rate = await consumeRateLimit(d1, { scope: "health", actor: clientAddress(request), limit: 30, windowMs: 60_000 });
    if (!rate.allowed) return rateLimitResponse(rate);
    const database = await d1.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    const versions = await d1.prepare("SELECT version, name, applied_at FROM app_schema_migrations ORDER BY version").all<{ version: number; name: string; applied_at: number }>();
    const values = env as unknown as {
      HEALTH_CHECK_AI?: string;
      AI_SERVICE_ORIGIN?: string;
      RAPFI_SERVICE_ORIGIN?: string;
      AI_SERVICE_TOKEN?: string;
      RAPFI_SERVICE_TOKEN?: string;
    };
    const deep = new URL(request.url).searchParams.get("deep") === "1" || values.HEALTH_CHECK_AI === "true";
    const ai = deep ? {
      katago: await checkService(values.AI_SERVICE_ORIGIN?.trim() || "http://127.0.0.1:3210", values.AI_SERVICE_TOKEN?.trim()),
      rapfi: await checkService(values.RAPFI_SERVICE_ORIGIN?.trim() || "http://127.0.0.1:3211", values.RAPFI_SERVICE_TOKEN?.trim() || values.AI_SERVICE_TOKEN?.trim()),
    } : undefined;
    const ok = database?.ok === 1 && (!deep || Boolean(ai?.katago.ok && ai?.rapfi.ok));
    return Response.json({
      ok,
      database: { ok: database?.ok === 1, schema: versions.results },
      realtime: { roomHub: true, platformHub: true },
      ai,
      durationMs: Date.now() - startedAt,
    }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch (error) {
    logEvent("error", "health_check_failed", { error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt });
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "health_check_failed", durationMs: Date.now() - startedAt }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
