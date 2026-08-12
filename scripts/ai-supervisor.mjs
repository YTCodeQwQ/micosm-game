import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const available = {
  katago: resolve(root, "scripts/katago-service.mjs"),
  rapfi: resolve(root, "scripts/rapfi-service.mjs"),
};
const requested = (process.env.AI_SUPERVISOR_SERVICES || "katago,rapfi").split(",").map((value) => value.trim()).filter((value) => value in available);
const children = new Map();
let stopping = false;

function log(level, event, detail = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), level, service: "ai-supervisor", event, ...detail }));
}

function start(name, failures = 0) {
  if (stopping) return;
  const startedAt = Date.now();
  const child = spawn(process.execPath, [available[name]], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.set(name, child);
  log("info", "child_started", { child: name, pid: child.pid });
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (stopping) return;
    const stable = Date.now() - startedAt > 5 * 60_000;
    const nextFailures = stable ? 1 : failures + 1;
    const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(nextFailures - 1, 5));
    log("error", "child_exited", { child: name, code, signal, restartInMs: delayMs });
    setTimeout(() => start(name, nextFailures), delayMs).unref();
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log("info", "shutdown", { signal });
  for (const child of children.values()) child.kill(signal);
  setTimeout(() => process.exit(0), 2_500).unref();
}

if (!requested.length) throw new Error("AI_SUPERVISOR_SERVICES does not contain katago or rapfi");
for (const name of requested) start(name);
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
