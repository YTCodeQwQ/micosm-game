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

const defaultExecutable = process.platform === "win32"
  ? ".tools/rapfi/engine/pbrain-rapfi-windows-avx2.exe"
  : ".tools/rapfi/engine/pbrain-rapfi-linux-clang-avx2";
const executable = configuredPath(process.env.RAPFI_EXE, defaultExecutable);
const port = Math.max(1, Math.min(65535, Number(process.env.RAPFI_SERVICE_PORT) || 3211));
const host = process.env.RAPFI_SERVICE_HOST?.trim() || "0.0.0.0";
const serviceToken = process.env.RAPFI_SERVICE_TOKEN?.trim() || process.env.AI_SERVICE_TOKEN?.trim() || "";
const engineDirectory = dirname(executable);
const requiredAssets = ["config.toml", "mix9svqfreestyle_bsmix.bin.lz4", "mix9svqrenju_bs15_black.bin.lz4", "mix9svqrenju_bs15_white.bin.lz4"];

if (!existsSync(executable)) throw new Error(`Rapfi 程序不存在：${executable}`);
for (const asset of requiredAssets) {
  const path = resolve(engineDirectory, asset);
  if (!existsSync(path)) throw new Error(`Rapfi 权重或配置不存在：${path}`);
}

let ready = true;
let busy = false;
let lastDetail = "Rapfi NNUE 已就绪";
let queue = Promise.resolve();

function json(response, status = 200) {
  return new Response(JSON.stringify(response), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
}

function rapfiMove(state, maxSeconds) {
  if (!state || state.game !== "gomoku" || state.status !== "playing" || state.turn !== state.ai?.player) {
    return Promise.reject(new Error("Rapfi 仅处理轮到电脑的五子棋对局"));
  }
  const seconds = Math.max(1, Math.min(30, Number(maxSeconds) || 5));
  const timeoutMs = Math.round(seconds * 1000);
  const rule = state.gomokuForbidden ? 4 : 0;
  return new Promise((resolveMove, rejectMove) => {
    busy = true;
    lastDetail = `Rapfi 正在计算 · ${state.gomokuForbidden ? "Renju 禁手" : "自由五子棋"}`;
    const engine = spawn(executable, [], { cwd: engineDirectory, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let settled = false;
    const finish = (error, action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      busy = false;
      if (action) {
        lastDetail = `Rapfi NNUE 已落子 · ${state.gomokuForbidden ? "Renju" : "Freestyle"}`;
        resolveMove(action);
      } else {
        lastDetail = error?.message || "Rapfi 计算失败";
        rejectMove(error || new Error(lastDetail));
      }
      try { engine.stdin.write("END\n"); } catch {}
      setTimeout(() => { if (!engine.killed) engine.kill(); }, 100).unref();
    };
    const timer = setTimeout(() => finish(new Error("Rapfi 计算超时")), timeoutMs + 5_000);
    engine.stdout.setEncoding("utf8");
    engine.stdout.on("data", (chunk) => {
      output += chunk;
      const lines = output.split(/\r?\n/);
      output = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        const move = line.match(/^(\d+),(\d+)$/);
        if (!move) continue;
        const col = Number(move[1]);
        const row = Number(move[2]);
        if (row < 0 || col < 0 || row >= state.size || col >= state.size) return finish(new Error(`Rapfi 返回越界坐标：${line}`));
        return finish(null, { type: "play", row, col });
      }
    });
    engine.stderr.setEncoding("utf8");
    engine.stderr.on("data", (chunk) => { lastDetail = String(chunk).trim().split(/\r?\n/).filter(Boolean).at(-1) || lastDetail; });
    engine.on("error", (error) => finish(error));
    engine.on("exit", (code) => { if (!settled) finish(new Error(`Rapfi 提前退出，代码 ${code ?? "未知"}`)); });

    const board = [];
    for (let row = 0; row < state.size; row += 1) {
      for (let col = 0; col < state.size; col += 1) {
        const stone = state.board[row][col];
        if (stone) board.push(`${col},${row},${stone === state.ai.player ? 1 : 2}`);
      }
    }
    engine.stdin.write([
      `START ${state.size}`,
      `INFO timeout_turn ${timeoutMs}`,
      `INFO time_left ${timeoutMs}`,
      `INFO rule ${rule}`,
      "BOARD",
      ...board,
      "DONE",
      "",
    ].join("\n"));
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  if (serviceToken && request.headers.authorization !== `Bearer ${serviceToken}`) {
    response.writeHead(401, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/health") {
    const result = json({ ready, busy, engine: "Rapfi", model: "mix9svq NNUE", detail: lastDetail }, ready ? 200 : 503);
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
      if (raw.length > 2_000_000) throw new Error("请求内容过大");
    }
    const payload = JSON.parse(raw);
    const task = queue.then(() => rapfiMove(payload.state, payload.maxSeconds));
    queue = task.catch(() => undefined);
    const action = await task;
    const result = json({ action, engine: "Rapfi", model: "mix9svq NNUE" });
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(await result.text());
  } catch (error) {
    const result = json({ error: error instanceof Error ? error.message : "Rapfi 暂时不可用" }, 503);
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(await result.text());
  }
});

server.listen(port, host, () => {
  console.log(`Micosm Rapfi service: http://${host}:${port}`);
  console.log("Rapfi mix9svq NNUE 已就绪，支持自由五子棋与 Renju 禁手。");
});

function shutdown() {
  ready = false;
  server.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

