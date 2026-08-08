type RateLimitStatement = {
  bind(...values: unknown[]): RateLimitStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};

export type RateLimitD1 = { prepare(query: string): RateLimitStatement };

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const schemaPromises = new WeakMap<object, Promise<void>>();

export async function ensureRateLimitSchema(d1: RateLimitD1) {
  let schemaPromise = schemaPromises.get(d1 as object);
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await d1.prepare(`CREATE TABLE IF NOT EXISTS api_rate_limits (
        bucket_key TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        hits INTEGER NOT NULL,
        reset_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`).run();
      await d1.prepare("CREATE INDEX IF NOT EXISTS api_rate_limits_reset_idx ON api_rate_limits(reset_at)").run();
    })().catch((error) => {
      schemaPromises.delete(d1 as object);
      throw error;
    });
    schemaPromises.set(d1 as object, schemaPromise);
  }
  await schemaPromise;
}

async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function clientAddress(request: Request) {
  const forwarded = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("true-client-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]
    ?? "local";
  return forwarded.trim().slice(0, 128) || "unknown";
}

export async function rateLimitKey(scope: string, actor: string) {
  return `${scope}:${await digest(`${scope}:${actor}`)}`;
}

export async function consumeRateLimit(d1: RateLimitD1, options: {
  scope: string;
  actor: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  await ensureRateLimitSchema(d1);
  const now = Date.now();
  const freshResetAt = now + options.windowMs;
  const bucketKey = await rateLimitKey(options.scope, options.actor);
  const row = await d1.prepare(`INSERT INTO api_rate_limits (bucket_key, scope, hits, reset_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET
        hits = CASE WHEN api_rate_limits.reset_at <= ? THEN 1 ELSE api_rate_limits.hits + 1 END,
        reset_at = CASE WHEN api_rate_limits.reset_at <= ? THEN excluded.reset_at ELSE api_rate_limits.reset_at END,
        updated_at = excluded.updated_at
      RETURNING hits, reset_at`)
    .bind(bucketKey, options.scope, freshResetAt, now, now, now)
    .first<{ hits: number; reset_at: number }>();
  const hits = row?.hits ?? options.limit + 1;
  const resetAt = row?.reset_at ?? freshResetAt;
  if (Math.floor(now / 60_000) % 30 === 0) {
    void d1.prepare("DELETE FROM api_rate_limits WHERE reset_at < ?").bind(now - 24 * 60 * 60 * 1000).run();
  }
  return {
    allowed: hits <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - hits),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

export function rateLimitResponse(result: RateLimitResult, message = "操作太频繁，请稍后再试") {
  return Response.json({ error: { code: "rate_limited", message }, retryAfter: result.retryAfterSeconds }, {
    status: 429,
    headers: {
      "retry-after": String(result.retryAfterSeconds),
      "x-ratelimit-limit": String(result.limit),
      "x-ratelimit-remaining": String(result.remaining),
      "x-ratelimit-reset": String(Math.ceil(result.resetAt / 1000)),
    },
  });
}
