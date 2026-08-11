import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function configuredPath(value, fallback) {
  const selected = value?.trim() || fallback;
  return isAbsolute(selected) ? selected : resolve(root, selected);
}

const defaultExecutable = process.platform === "win32" ? ".tools/katago/engine/katago.exe" : ".tools/katago/engine/katago";
const executable = configuredPath(process.env.KATAGO_EXE, defaultExecutable);
const model = configuredPath(process.env.KATAGO_MODEL, ".tools/katago/kata1-b28c512.bin.gz");
const config = configuredPath(process.env.KATAGO_CONFIG, ".tools/katago/engine/default_gtp.cfg");
const port = Math.max(1, Math.min(65535, Number(process.env.KATAGO_SERVICE_PORT) || 3210));
const host = process.env.KATAGO_SERVICE_HOST?.trim() || "127.0.0.1";
const serviceToken = process.env.KATAGO_SERVICE_TOKEN?.trim() || "";
const modelLabel = process.env.KATAGO_MODEL_LABEL?.trim() || "b28c512";
const maxQueue = Math.max(1, Math.min(32, Number(process.env.KATAGO_MAX_QUEUE) || 6));

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
if (!loopbackHosts.has(host.toLowerCase()) && !serviceToken) {
  throw new Error("KATAGO_SERVICE_TOKEN is required when KataGo listens outside localhost");
}

const startedAt = Date.now();
const metrics = { requests: 0, successes: 0, failures: 0, totalDurationMs: 0, queued: 0, active: 0 };
function log(level, event, detail = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, service: "katago", event, ...detail }));
}

for (const [label, path] of [["KataGo", executable], ["模型", model], ["配置", config]]) {
  if (!existsSync(path)) throw new Error(`${label}文件不存在：${path}`);
}

let ready = false;
let closed = false;
let lastEngineLog = "正在加载神经网络";
let commandId = 0;
let stdoutBuffer = "";
let responseLines = [];
const pending = new Map();
let queue = Promise.resolve();

const engine = spawn(executable, ["gtp", "-model", model, "-config", config], {
  cwd: dirname(executable),
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: false,
});

engine.stderr.setEncoding("utf8");
engine.stderr.on("data", (chunk) => {
  const lines = String(chunk).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length) {
    lastEngineLog = lines.at(-1);
    log("info", "engine_log", { detail: lines.at(-1) });
  }
});

engine.stdout.setEncoding("utf8");
engine.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  const lines = stdoutBuffer.split(/\r?\n/);
  stdoutBuffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.trim()) {
      responseLines.push(line);
      continue;
    }
    if (!responseLines.length) continue;
    const first = responseLines[0];
    const match = first.match(/^([=?])(\d+)\s?(.*)$/);
    const current = match ? pending.get(Number(match[2])) : null;
    if (match && current) {
      pending.delete(Number(match[2]));
      const body = [match[3], ...responseLines.slice(1)].filter(Boolean).join("\n").trim();
      if (match[1] === "=") current.resolve(body);
      else current.reject(new Error(body || "KataGo 拒绝了命令"));
    }
    responseLines = [];
  }
});

engine.on("error", (error) => {
  closed = true;
  lastEngineLog = error.message;
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
});

engine.on("exit", (code) => {
  closed = true;
  ready = false;
  const error = new Error(`KataGo 已退出，代码 ${code ?? "未知"}`);
  lastEngineLog = error.message;
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
});

function sendCommand(command, timeoutMs = 120_000) {
  if (closed) return Promise.reject(new Error(lastEngineLog));
  commandId += 1;
  const id = commandId;
  return new Promise((resolveCommand, rejectCommand) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      rejectCommand(new Error(`KataGo 命令超时：${command}`));
    }, timeoutMs);
    pending.set(id, {
      resolve(value) { clearTimeout(timeout); resolveCommand(value); },
      reject(error) { clearTimeout(timeout); rejectCommand(error); },
    });
    engine.stdin.write(`${id} ${command}\n`);
  });
}

function gtpPoint(row, col, size) {
  const columns = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
  return `${columns[col]}${size - row}`;
}

function boardPoint(point, size) {
  const normalized = point.trim().toUpperCase();
  if (normalized === "PASS") return { type: "pass" };
  if (normalized === "RESIGN") return { type: "pass" };
  const match = normalized.match(/^([A-HJ-Z])(\d+)$/);
  if (!match) throw new Error(`KataGo 返回了未知坐标：${point}`);
  const columns = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
  const col = columns.indexOf(match[1]);
  const row = size - Number(match[2]);
  if (row < 0 || col < 0 || row >= size || col >= size) throw new Error(`KataGo 返回了越界坐标：${point}`);
  return { type: "play", row, col };
}

async function generateMove(state, visits, maxSeconds) {
  if (!ready) throw new Error("KataGo 神经网络仍在加载");
  if (!state || state.game !== "go" || state.status !== "playing") throw new Error("KataGo 仅处理进行中的围棋对局");
  const size = Number(state.size);
  await sendCommand(`boardsize ${size}`);
  await sendCommand("clear_board");
  await sendCommand("komi 7.5");
  await sendCommand("kata-set-rules chinese");
  await sendCommand(`kata-set-param maxVisits ${Math.max(50, Math.min(5000, visits))}`);
  await sendCommand(`kata-set-param maxTime ${Math.max(2, Math.min(60, maxSeconds))}`);
  await sendCommand("kata-set-param allowResignation false");
  for (const move of state.moves ?? []) {
    if (move.type === "resumeGo") continue;
    const color = move.player === "black" ? "B" : "W";
    const point = move.type === "pass" ? "pass" : gtpPoint(move.row, move.col, size);
    await sendCommand(`play ${color} ${point}`);
  }
  const color = state.turn === "black" ? "B" : "W";
  return boardPoint(await sendCommand(`genmove ${color}`), size);
}

function json(response, status = 200) {
  return new Response(JSON.stringify(response), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (serviceToken && request.headers.authorization !== `Bearer ${serviceToken}`) {
    response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") {
    const payload = JSON.stringify({ ready, engine: "KataGo", model: modelLabel, detail: lastEngineLog, uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000), metrics });
    response.writeHead(ready ? 200 : 503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(payload);
    return;
  }
  if (request.method !== "POST" || url.pathname !== "/move") {
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  try {
    if (metrics.queued >= maxQueue) {
      const result = json({ error: "KataGo 请求队列已满", retryAfter: 3 }, 429);
      response.writeHead(result.status, { ...Object.fromEntries(result.headers.entries()), "retry-after": "3" });
      response.end(await result.text());
      return;
    }
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 2_000_000) throw new Error("请求内容过大");
    }
    const payload = JSON.parse(raw);
    metrics.requests += 1;
    metrics.queued += 1;
    const task = queue.then(async () => {
      metrics.queued -= 1;
      metrics.active = 1;
      const started = Date.now();
      try {
        const action = await generateMove(payload.state, Number(payload.visits) || 1600, Number(payload.maxSeconds) || 12);
        metrics.successes += 1;
        return action;
      } catch (error) {
        metrics.failures += 1;
        throw error;
      } finally {
        metrics.active = 0;
        metrics.totalDurationMs += Date.now() - started;
      }
    });
    queue = task.catch(() => undefined);
    const action = await task;
    const result = json({ action, engine: "KataGo", model: modelLabel });
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(await result.text());
  } catch (error) {
    log("error", "move_failed", { detail: error instanceof Error ? error.message : String(error) });
    const result = json({ error: error instanceof Error ? error.message : "KataGo 暂时不可用" }, 503);
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(await result.text());
  }
});

server.listen(port, host, () => {
  log("info", "service_started", { host, port, maxQueue, protected: Boolean(serviceToken) });
  log("info", "engine_loading", { detail: "首次落子会进行显卡调优" });
});

sendCommand("version", 15 * 60_000).then((version) => {
  ready = true;
  lastEngineLog = `KataGo ${version} · ${modelLabel} 已就绪`;
  log("info", "engine_ready", { detail: lastEngineLog });
}).catch((error) => {
  lastEngineLog = error instanceof Error ? error.message : String(error);
  log("error", "engine_start_failed", { detail: lastEngineLog });
});

function shutdown() {
  ready = false;
  server.close();
  if (!closed) {
    engine.stdin.write("quit\n");
    setTimeout(() => { if (!closed) engine.kill(); }, 1500).unref();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
