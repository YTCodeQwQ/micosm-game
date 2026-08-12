import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { getSessionUser } from "../../../lib/auth";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { featureEnabled, featureUnavailable } from "../../../lib/operations";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";

function serviceConfig(engine: "katago" | "rapfi") {
  const values = env as unknown as {
    AI_SERVICE_ORIGIN?: string;
    AI_SERVICE_TOKEN?: string;
    RAPFI_SERVICE_ORIGIN?: string;
    RAPFI_SERVICE_TOKEN?: string;
  };
  if (engine === "rapfi") return {
    origin: (values.RAPFI_SERVICE_ORIGIN?.trim() || "http://127.0.0.1:3211").replace(/\/$/, ""),
    token: values.RAPFI_SERVICE_TOKEN?.trim() || values.AI_SERVICE_TOKEN?.trim(),
  };
  return {
    origin: (values.AI_SERVICE_ORIGIN?.trim() || "http://127.0.0.1:3210").replace(/\/$/, ""),
    token: values.AI_SERVICE_TOKEN?.trim(),
  };
}

function aiServiceHeaders(token?: string) {
  return token ? { authorization: `Bearer ${token}` } : undefined;
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
  const rate = await consumeRateLimit(d1, { scope: "ai_health", actor: user.id, limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return rateLimitResponse(rate, "AI 状态检查太频繁，请稍后再试");
  const engine = new URL(request.url).searchParams.get("engine") === "rapfi" ? "rapfi" : "katago";
  const flag = engine === "rapfi" ? "ai_gomoku_master_enabled" : "ai_go_master_enabled";
  if (!await featureEnabled(d1, flag)) return featureUnavailable(`${engine === "rapfi" ? "Rapfi" : "KataGo"} 最高难度暂时关闭`, "ai_master_disabled");
  const service = serviceConfig(engine);
  const fallbackName = engine === "rapfi" ? "Rapfi" : "KataGo";
  try {
    const response = await fetch(`${service.origin}/health`, { headers: aiServiceHeaders(service.token), signal: AbortSignal.timeout(2_500) });
    const status = await response.json() as { ready?: boolean; engine?: string; model?: string; detail?: string };
    const ready = response.ok && status.ready === true;
    return Response.json({
      ready,
      engine: status.engine ?? fallbackName,
      model: status.model,
      detail: ready ? `${status.model ?? fallbackName} 神经网络已加载` : status.detail,
    }, { status: response.ok ? 200 : 503 });
  } catch {
    return Response.json({ ready: false, engine: fallbackName, detail: engine === "rapfi" ? "本机 Rapfi 引擎尚未启动" : "本机 GPU 引擎尚未启动" }, { status: 503 });
  }
}
