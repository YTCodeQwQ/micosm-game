import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configuredProjectPath, defaultRapfiExecutable } from "./runtime-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

const executable = configuredProjectPath(root, process.env.RAPFI_EXE, defaultRapfiExecutable());
const port = boundedInteger(process.env.RAPFI_SERVICE_PORT, 3211, 1, 65535);
const host = process.env.RAPFI_SERVICE_HOST?.trim() || "127.0.0.1";
const serviceToken = process.env.RAPFI_SERVICE_TOKEN?.trim() || process.env.AI_SERVICE_TOKEN?.trim() || "";
const cpuCount = Math.max(1, availableParallelism());
const workerCount = boundedInteger(process.env.RAPFI_WORKERS, Math.min(2, cpuCount), 1, 4);
const threadsPerWorker = boundedInteger(process.env.RAPFI_THREADS, Math.max(1, Math.min(4, Math.floor(cpuCount / workerCount))), 1, 16);
const memoryMb = boundedInteger(process.env.RAPFI_MEMORY_MB, 256, 64, 2048);
const maxQueue = boundedInteger(process.env.RAPFI_MAX_QUEUE, 8, 1, 32);
const engineDirectory = dirname(executable);
const baseConfig = resolve(engineDirectory, "config.toml");
const runtimeConfig = resolve(engineDirectory, ".micosm-rapfi-runtime.toml");
const weightFiles = [
  "mix9svqfreestyle_bsmix.bin.lz4",
  "mix9svqstandard_bs15.bin.lz4",
  "mix9svqrenju_bs15_black.bin.lz4",
  "mix9svqrenju_bs15_white.bin.lz4",
];
const requiredAssets = ["config.toml", ...weightFiles];

if (!existsSync(executable)) throw new Error(`Rapfi executable not found: ${executable}`);
for (const asset of requiredAssets) {
  const assetPath = resolve(engineDirectory, asset);
  if (!existsSync(assetPath)) throw new Error(`Rapfi asset not found: ${assetPath}`);
}

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
if (!loopbackHosts.has(host.toLowerCase()) && !serviceToken) {
  throw new Error("RAPFI_SERVICE_TOKEN is required when Rapfi listens outside localhost");
}

function createRuntimeConfig() {
  const ttSizeKb = Math.max(16, memoryMb - 64) * 1024;
  const source = readFileSync(baseConfig, "utf8")
    .replace(/default_thread_num\s*=\s*\d+/, `default_thread_num = ${threadsPerWorker}`)
    .replace(/default_tt_size_kb\s*=\s*\d+/, `default_tt_size_kb = ${ttSizeKb}`);
  if (!existsSync(runtimeConfig) || readFileSync(runtimeConfig, "utf8") !== source) writeFileSync(runtimeConfig, source, "utf8");
}

function modelSetHash() {
  const hash = createHash("sha256");
  for (const file of weightFiles) hash.update(readFileSync(resolve(engineDirectory, file)));
  return hash.digest("hex").slice(0, 16);
}

createRuntimeConfig();
const modelHash = modelSetHash();
const startedAt = Date.now();
const timings = [];
const metrics = {
  requests: 0,
  successes: 0,
  failures: 0,
  queued: 0,
  active: 0,
  totalQueueMs: 0,
  totalSearchMs: 0,
};
let lastDetail = "Starting Rapfi workers";

function log(level, event, detail = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, service: "rapfi", event, ...detail }));
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)];
}

function timingSummary() {
  const recent = timings.slice(-200);
  return {
    samples: recent.length,
    p50Ms: percentile(recent, 0.5),
    p95Ms: percentile(recent, 0.95),
    averageQueueMs: metrics.successes ? Math.round(metrics.totalQueueMs / metrics.successes) : 0,
    averageSearchMs: metrics.successes ? Math.round(metrics.totalSearchMs / metrics.successes) : 0,
  };
}

function json(response, status = 200) {
  return new Response(JSON.stringify(response), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function boardLines(state) {
  const occupied = state.board.flat().filter(Boolean).length;
  const orderedMoves = Array.isArray(state.moves)
    ? state.moves.filter((move) => move?.type === "play" && state.board[move.row]?.[move.col] === move.player)
    : [];
  const points = orderedMoves.length === occupied
    ? orderedMoves.map((move) => ({ row: move.row, col: move.col, player: move.player }))
    : state.board.flatMap((line, row) => line.flatMap((stone, col) => stone ? [{ row, col, player: stone }] : []));
  return points.map((point) => `${point.col},${point.row},${point.player === state.ai.player ? 1 : 2}`);
}

class RapfiWorker {
  constructor(id) {
    this.id = id;
    this.process = null;
    this.ready = false;
    this.busy = false;
    this.boardSize = 0;
    this.stdoutBuffer = "";
    this.waiters = [];
    this.startupMs = 0;
  }

  async start() {
    if (this.process && this.ready) return;
    const workerStartedAt = Date.now();
    const engine = spawn(executable, ["--config", runtimeConfig, "--force-utf8"], {
      cwd: engineDirectory,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.process = engine;
    this.ready = false;
    this.stdoutBuffer = "";
    engine.stdout.setEncoding("utf8");
    engine.stderr.setEncoding("utf8");
    engine.stdout.on("data", (chunk) => this.consumeStdout(chunk));
    engine.stderr.on("data", (chunk) => {
      const detail = String(chunk).trim().split(/\r?\n/).filter(Boolean).at(-1);
      if (detail) lastDetail = detail;
    });
    engine.on("error", (error) => {
      if (this.process === engine) this.failWaiters(error);
    });
    engine.on("exit", (code, signal) => {
      const error = new Error(`Rapfi worker ${this.id} exited (${code ?? signal ?? "unknown"})`);
      if (this.process !== engine) return;
      this.ready = false;
      this.process = null;
      this.failWaiters(error);
    });
    await this.command(`START 15\n`, (line) => /^OK\b/i.test(line), 45_000);
    this.boardSize = 15;
    this.ready = true;
    this.startupMs = Date.now() - workerStartedAt;
    lastDetail = `Worker pool ready (${workerCount} workers, ${threadsPerWorker} threads each)`;
    log("info", "worker_ready", { workerId: this.id, startupMs: this.startupMs });
  }

  consumeStdout(chunk) {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n|\r/);
    this.stdoutBuffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const index = this.waiters.findIndex((waiter) => waiter.match(line));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(line);
      } else if (/^(MESSAGE|DEBUG|ERROR|UNKNOWN)\b/i.test(line)) {
        lastDetail = line.slice(0, 240);
      }
    }
  }

  failWaiters(error) {
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  command(payload, match, timeoutMs) {
    if (!this.process?.stdin.writable) return Promise.reject(new Error(`Rapfi worker ${this.id} is not writable`));
    return new Promise((resolveLine, rejectLine) => {
      const waiter = {
        match,
        resolve: resolveLine,
        reject: rejectLine,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          rejectLine(new Error(`Rapfi worker ${this.id} timed out`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
      this.process.stdin.write(payload);
    });
  }

  async restart() {
    this.ready = false;
    const engine = this.process;
    this.process = null;
    if (engine && !engine.killed) {
      try { engine.stdin.write("END\n"); } catch {}
      setTimeout(() => { if (!engine.killed) engine.kill(); }, 500).unref();
    }
    await this.start();
  }

  async move(state, maxSeconds) {
    if (!state || state.game !== "gomoku" || state.status !== "playing" || state.turn !== state.ai?.player) {
      throw new Error("Rapfi only accepts a Gomoku position when it is the AI turn");
    }
    const seconds = Math.max(0.5, Math.min(30, Number(maxSeconds) || 2.5));
    const timeoutMs = Math.round(seconds * 1000);
    const rule = state.gomokuForbidden ? 4 : 0;
    try {
      if (!this.ready) await this.start();
      if (this.boardSize === state.size) {
        await this.command("RESTART\n", (line) => /^OK\b/i.test(line), 5_000);
      } else {
        await this.command(`START ${state.size}\n`, (line) => /^OK\b/i.test(line), 10_000);
        this.boardSize = state.size;
      }
      const position = boardLines(state);
      const searchStartedAt = Date.now();
      const line = await this.command([
        `INFO timeout_turn ${timeoutMs}`,
        "INFO timeout_match 0",
        "INFO time_left 2147483647",
        `INFO max_memory ${memoryMb * 1024 * 1024}`,
        `INFO rule ${rule}`,
        "BOARD",
        ...position,
        "DONE",
        "",
      ].join("\n"), (output) => /^\d+,\d+$/.test(output), timeoutMs + 3_000);
      const [col, row] = line.split(",").map(Number);
      if (row < 0 || col < 0 || row >= state.size || col >= state.size || state.board[row][col] !== null) {
        throw new Error(`Rapfi returned an illegal coordinate: ${line}`);
      }
      return { action: { type: "play", row, col }, searchMs: Date.now() - searchStartedAt };
    } catch (error) {
      try { await this.restart(); } catch (restartError) {
        log("error", "worker_restart_failed", { workerId: this.id, detail: restartError instanceof Error ? restartError.message : String(restartError) });
      }
      throw error;
    }
  }

  stop() {
    this.ready = false;
    if (!this.process || this.process.killed) return;
    try { this.process.stdin.write("END\n"); } catch {}
    setTimeout(() => { if (this.process && !this.process.killed) this.process.kill(); }, 500).unref();
  }
}

const workers = Array.from({ length: workerCount }, (_, index) => new RapfiWorker(index + 1));
const pending = [];

function dispatch() {
  while (pending.length) {
    const worker = workers.find((candidate) => candidate.ready && !candidate.busy);
    if (!worker) break;
    const task = pending.shift();
    metrics.queued = pending.length;
    metrics.active += 1;
    worker.busy = true;
    const queueMs = Date.now() - task.queuedAt;
    worker.move(task.state, task.maxSeconds).then(({ action, searchMs }) => {
      metrics.successes += 1;
      metrics.totalQueueMs += queueMs;
      metrics.totalSearchMs += searchMs;
      timings.push(queueMs + searchMs);
      if (timings.length > 200) timings.shift();
      task.resolve({ action, queueMs, searchMs, startupMs: worker.startupMs, workerId: worker.id });
    }).catch((error) => {
      metrics.failures += 1;
      task.reject(error);
    }).finally(() => {
      worker.busy = false;
      metrics.active -= 1;
      dispatch();
    });
  }
}

function requestMove(state, maxSeconds) {
  if (pending.length + metrics.active >= maxQueue + workerCount) return Promise.reject(Object.assign(new Error("Rapfi request queue is full"), { status: 429 }));
  metrics.requests += 1;
  return new Promise((resolveMove, rejectMove) => {
    pending.push({ state, maxSeconds, queuedAt: Date.now(), resolve: resolveMove, reject: rejectMove });
    metrics.queued = pending.length;
    dispatch();
  });
}

await Promise.all(workers.map((worker) => worker.start()));

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (serviceToken && request.headers.authorization !== `Bearer ${serviceToken}`) {
    response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") {
    const ready = workers.every((worker) => worker.ready);
    const result = json({
      ready,
      busy: metrics.active > 0,
      engine: "Rapfi",
      version: "0.43.01",
      model: "mix9svq NNUE",
      modelHash,
      detail: lastDetail,
      workers: workerCount,
      threadsPerWorker,
      memoryMbPerWorker: memoryMb,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      metrics: { ...metrics, latency: timingSummary() },
    }, ready ? 200 : 503);
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(await result.text());
    return;
  }
  if (request.method !== "POST" || url.pathname !== "/move") {
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  try {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 2_000_000) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    }
    const payload = JSON.parse(raw);
    const result = await requestMove(payload.state, payload.maxSeconds);
    const body = json({
      action: result.action,
      engine: "Rapfi",
      version: "0.43.01",
      model: "mix9svq NNUE",
      modelHash,
      timing: { queueMs: result.queueMs, searchMs: result.searchMs, startupMs: result.startupMs },
      workerId: result.workerId,
    });
    response.writeHead(body.status, Object.fromEntries(body.headers.entries()));
    response.end(await body.text());
  } catch (error) {
    const status = Number(error?.status) || 503;
    log("error", "move_failed", { detail: error instanceof Error ? error.message : String(error), status });
    const result = json({ error: error instanceof Error ? error.message : "Rapfi is temporarily unavailable" }, status);
    response.writeHead(result.status, status === 429 ? { ...Object.fromEntries(result.headers.entries()), "retry-after": "2" } : Object.fromEntries(result.headers.entries()));
    response.end(await result.text());
  }
});

server.listen(port, host, () => {
  log("info", "service_started", {
    host,
    port,
    workers: workerCount,
    threadsPerWorker,
    memoryMbPerWorker: memoryMb,
    maxQueue,
    modelHash,
    protected: Boolean(serviceToken),
  });
});

function shutdown() {
  server.close();
  for (const worker of workers) worker.stop();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
