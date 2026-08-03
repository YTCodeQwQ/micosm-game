type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

export type DiagnosticsD1 = {
  prepare(query: string): D1Statement;
};

export type MatchEventType =
  | "room_created"
  | "room_joined"
  | "room_left"
  | "room_closed"
  | "match_action"
  | "match_timeout"
  | "match_departure"
  | "match_archived"
  | "rank_settled"
  | "request_error";

export type MatchEventRow = {
  id: string;
  room_id: string | null;
  request_id: string;
  event_type: MatchEventType;
  actor_user_id: string | null;
  actor_player_id: string | null;
  room_version: number | null;
  details: string;
  created_at: number;
};

export async function ensureMatchDiagnosticsSchema(d1: DiagnosticsD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS match_events (
    id TEXT PRIMARY KEY,
    room_id TEXT,
    request_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_user_id TEXT,
    actor_player_id TEXT,
    room_version INTEGER,
    details TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS match_events_room_created_idx ON match_events(room_id, created_at DESC)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS match_events_request_idx ON match_events(request_id)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS match_action_receipts (
    action_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    resulting_version INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS match_action_receipts_room_idx ON match_action_receipts(room_id, created_at DESC)").run();
}

export function newRequestId(prefix = "REQ") {
  const date = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `${prefix}-${date}-${random}`;
}

export function requestIdFor(request: Request) {
  const supplied = request.headers.get("x-micosm-request-id")?.trim();
  return supplied && /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : newRequestId();
}

export function normalizeActionId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value) ? value : null;
}

export async function recordMatchEvent(d1: DiagnosticsD1, event: {
  roomId?: string | null;
  requestId: string;
  type: MatchEventType;
  actorUserId?: string | null;
  actorPlayerId?: string | null;
  roomVersion?: number | null;
  details?: Record<string, unknown>;
}) {
  try {
    await d1.prepare(`INSERT INTO match_events (
      id, room_id, request_id, event_type, actor_user_id, actor_player_id, room_version, details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(),
      event.roomId ?? null,
      event.requestId,
      event.type,
      event.actorUserId ?? null,
      event.actorPlayerId ?? null,
      event.roomVersion ?? null,
      JSON.stringify(event.details ?? {}),
      Date.now(),
    ).run();
  } catch {
    // Diagnostics must never interrupt a live match.
  }
}

export async function findActionReceipt(d1: DiagnosticsD1, actionId: string, roomId: string, actorUserId: string) {
  const receipt = await d1.prepare("SELECT room_id, actor_user_id, resulting_version FROM match_action_receipts WHERE action_id = ?")
    .bind(actionId).first<{ room_id: string; actor_user_id: string; resulting_version: number }>();
  if (!receipt) return null;
  return { ...receipt, matchesRequest: receipt.room_id === roomId && receipt.actor_user_id === actorUserId };
}

export async function saveActionReceipt(d1: DiagnosticsD1, actionId: string, roomId: string, actorUserId: string, resultingVersion: number) {
  await d1.prepare("INSERT OR IGNORE INTO match_action_receipts (action_id, room_id, actor_user_id, resulting_version, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(actionId, roomId, actorUserId, resultingVersion, Date.now()).run();
}
