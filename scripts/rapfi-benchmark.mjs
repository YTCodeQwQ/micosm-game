import { RAPFI_TACTICAL_CASES, benchmarkMoveMatches } from "./rapfi-benchmark-cases.mjs";

const origin = (process.env.RAPFI_SERVICE_ORIGIN || "http://127.0.0.1:3211").replace(/\/$/, "");
const token = process.env.RAPFI_SERVICE_TOKEN?.trim() || process.env.AI_SERVICE_TOKEN?.trim();
const budgetSeconds = Math.max(0.5, Math.min(10, Number(process.env.RAPFI_BENCHMARK_SECONDS) || 2));
const headers = { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };

const healthResponse = await fetch(`${origin}/health`, { headers, signal: AbortSignal.timeout(5_000) });
const health = await healthResponse.json();
if (!healthResponse.ok || health.ready !== true) throw new Error(`Rapfi service is not ready: ${health.detail || healthResponse.status}`);

const results = [];
for (const testCase of RAPFI_TACTICAL_CASES) {
  const startedAt = performance.now();
  const response = await fetch(`${origin}/move`, {
    method: "POST",
    headers,
    body: JSON.stringify({ state: testCase.state, maxSeconds: budgetSeconds }),
    signal: AbortSignal.timeout((budgetSeconds + 8) * 1_000),
  });
  const body = await response.json();
  const passed = response.ok && benchmarkMoveMatches(testCase, body.action);
  results.push({
    id: testCase.id,
    title: testCase.title,
    passed,
    expected: testCase.expected,
    selected: body.action ?? null,
    totalMs: Math.round(performance.now() - startedAt),
    timing: body.timing ?? null,
    error: response.ok ? null : body.error ?? `HTTP ${response.status}`,
  });
}

const passed = results.filter((result) => result.passed).length;
const report = {
  generatedAt: new Date().toISOString(),
  engine: health.engine,
  version: health.version,
  model: health.model,
  modelHash: health.modelHash,
  workers: health.workers,
  threadsPerWorker: health.threadsPerWorker,
  budgetSeconds,
  summary: { passed, total: results.length, releaseGatePassed: passed === results.length },
  results,
};

console.log(JSON.stringify(report, null, 2));
if (!report.summary.releaseGatePassed) process.exitCode = 1;
