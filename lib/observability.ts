export function logEvent(level: "info" | "warn" | "error", event: string, details: Record<string, unknown> = {}) {
  const record = { time: new Date().toISOString(), level, service: "micosm-web", event, ...details };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export async function timed<T>(event: string, task: () => Promise<T>, details: Record<string, unknown> = {}) {
  const startedAt = Date.now();
  try {
    const value = await task();
    logEvent("info", event, { ...details, durationMs: Date.now() - startedAt, outcome: "success" });
    return value;
  } catch (error) {
    logEvent("error", event, { ...details, durationMs: Date.now() - startedAt, outcome: "failure", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
