import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission } from "../../../../lib/admin";
import { ensureAppSchema } from "../../../../lib/database-migrations";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

function config(engine: "katago" | "rapfi") {
  const values = env as unknown as {
    AI_SERVICE_ORIGIN?: string; AI_SERVICE_TOKEN?: string; RAPFI_SERVICE_ORIGIN?: string; RAPFI_SERVICE_TOKEN?: string;
  };
  if (engine === "rapfi") return {
    origin: (values.RAPFI_SERVICE_ORIGIN?.trim() || "http://127.0.0.1:3211").replace(/\/$/, ""),
    token: values.RAPFI_SERVICE_TOKEN?.trim() || values.AI_SERVICE_TOKEN?.trim(),
  };
  return { origin: (values.AI_SERVICE_ORIGIN?.trim() || "http://127.0.0.1:3210").replace(/\/$/, ""), token: values.AI_SERVICE_TOKEN?.trim() };
}

async function health(engine: "katago" | "rapfi") {
  const service = config(engine);
  const startedAt = Date.now();
  try {
    const response = await fetch(`${service.origin}/health`, {
      headers: service.token ? { authorization: `Bearer ${service.token}` } : undefined,
      signal: AbortSignal.timeout(3_000),
    });
    const data = await response.json() as Record<string, unknown>;
    return { ...data, engine, reachable: true, ready: response.ok && data.ready === true, responseMs: Date.now() - startedAt };
  } catch (error) {
    return { engine, reachable: false, ready: false, responseMs: Date.now() - startedAt, detail: error instanceof Error ? error.message : "unavailable" };
  }
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "ai.read");
  if (auth.response) return auth.response;
  const [katago, rapfi] = await Promise.all([health("katago"), health("rapfi")]);
  return Response.json({ engines: [katago, rapfi], generatedAt: Date.now() });
}
