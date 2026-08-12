import { env } from "cloudflare:workers";
import { getD1, getRoomHub } from "../../../db";
import { avatarUrlForKey, ensureAuthSchema, getSessionUser, type AuthUser } from "../../../lib/auth";
import { chooseBuiltInAiAction } from "../../../lib/ai-engine";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { ensureFriendSchema } from "../../../lib/friends";
import { ensureMatchDiagnosticsSchema, findActionReceipt, normalizeActionId, recordMatchEvent, requestIdFor, saveActionReceipt } from "../../../lib/match-diagnostics";
import { archiveFinishedMatch, ensureMatchHistorySchema } from "../../../lib/match-history";
import { activeSanction } from "../../../lib/moderation";
import { featureEnabled } from "../../../lib/operations";
import { createNotification } from "../../../lib/notifications";
import { notifyPlatform } from "../../../lib/platform-realtime";
import { ensureRankSchema, rankChange, rankSeasonForGame } from "../../../lib/rank";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { logEvent } from "../../../lib/observability";
import { activateMatch, applyMatchAction, createMatchState, MatchRuleError, projectMatchClock, startConfiguredMatchClock, startRankedClock, type AiDifficulty, type ColorPreference, type MatchAction, type MatchClockConfig, type MatchClockMode, type MatchGame, type MatchPlayer, type MatchState, type SpectatorPolicy } from "../../../lib/match-engine";

type RoomMode = "private" | "matchmaking" | "ranked" | "ai";
type RoomRow = {
  id: string;
  game: MatchGame;
  black_player: string;
  white_player: string | null;
  black_name: string | null;
  white_name: string | null;
  black_avatar: string | null;
  white_avatar: string | null;
  black_signature: string | null;
  white_signature: string | null;
  host_user_id: string | null;
  guest_user_id: string | null;
  black_user_id: string | null;
  white_user_id: string | null;
  mode: RoomMode | null;
  board_size: number | null;
  spectator_policy: SpectatorPolicy | null;
  state: string;
  version: number;
  created_at: number;
  updated_at: number;
};

type QueueRow = RoomRow & { queue_key: string };
type RankedQueueRow = RoomRow & { queue_user_id: string; queue_rating: number; queue_created_at: number; queue_player_id: string; queue_updated_at: number; queue_season_id: string | null };
type D1 = ReturnType<typeof getD1>;
const ROOM_DISCONNECT_MS = 30_000;
const RANK_SETTLEMENT_STALE_MS = 60_000;
const AI_DIFFICULTIES: AiDifficulty[] = ["easy", "normal", "hard", "master"];

function aiServiceOrigin() {
  const configured = (env as unknown as { AI_SERVICE_ORIGIN?: string }).AI_SERVICE_ORIGIN?.trim();
  return (configured || "http://127.0.0.1:3210").replace(/\/$/, "");
}

function aiServiceHeaders() {
  const token = (env as unknown as { AI_SERVICE_TOKEN?: string }).AI_SERVICE_TOKEN?.trim();
  return token ? { "content-type": "application/json", authorization: `Bearer ${token}` } : { "content-type": "application/json" };
}

function rapfiServiceOrigin() {
  const configured = (env as unknown as { RAPFI_SERVICE_ORIGIN?: string }).RAPFI_SERVICE_ORIGIN?.trim();
  return (configured || "http://127.0.0.1:3211").replace(/\/$/, "");
}

function rapfiServiceHeaders() {
  const values = env as unknown as { RAPFI_SERVICE_TOKEN?: string; AI_SERVICE_TOKEN?: string };
  const token = values.RAPFI_SERVICE_TOKEN?.trim() || values.AI_SERVICE_TOKEN?.trim();
  return token ? { "content-type": "application/json", authorization: `Bearer ${token}` } : { "content-type": "application/json" };
}

function kataGoVisits() {
  const configured = Number((env as unknown as { AI_KATAGO_VISITS?: string }).AI_KATAGO_VISITS);
  return Number.isFinite(configured) ? Math.max(50, Math.min(5000, Math.round(configured))) : 3200;
}

function kataGoSeconds() {
  const configured = Number((env as unknown as { AI_KATAGO_SECONDS?: string }).AI_KATAGO_SECONDS);
  return Number.isFinite(configured) ? Math.max(2, Math.min(60, configured)) : 12;
}

async function kataGoAction(state: MatchState): Promise<MatchAction> {
  const response = await fetch(`${aiServiceOrigin()}/move`, {
    method: "POST",
    headers: aiServiceHeaders(),
    body: JSON.stringify({ state, visits: kataGoVisits(), maxSeconds: kataGoSeconds() }),
    signal: AbortSignal.timeout(90_000),
  });
  const data = await response.json() as { action?: MatchAction; error?: string };
  if (!response.ok || !data.action) throw new MatchRuleError("katago_unavailable", data.error ?? "KataGo GPU 引擎暂时不可用");
  return data.action;
}

async function ensureKataGoReady() {
  try {
    const response = await fetch(`${aiServiceOrigin()}/health`, { headers: aiServiceHeaders(), signal: AbortSignal.timeout(2_500) });
    const data = await response.json() as { ready?: boolean };
    return response.ok && data.ready === true;
  } catch {
    return false;
  }
}

function rapfiSeconds() {
  const configured = Number((env as unknown as { AI_RAPFI_SECONDS?: string }).AI_RAPFI_SECONDS);
  return Number.isFinite(configured) ? Math.max(0.5, Math.min(30, configured)) : 2.5;
}

async function rapfiAction(state: MatchState): Promise<MatchAction> {
  const maxSeconds = rapfiSeconds();
  const response = await fetch(`${rapfiServiceOrigin()}/move`, {
    method: "POST",
    headers: rapfiServiceHeaders(),
    body: JSON.stringify({ state, maxSeconds }),
    signal: AbortSignal.timeout((maxSeconds + 8) * 1_000),
  });
  const data = await response.json() as { action?: MatchAction; error?: string };
  if (!response.ok || !data.action) throw new MatchRuleError("rapfi_unavailable", data.error ?? "Rapfi NNUE 引擎暂时不可用");
  return data.action;
}

async function ensureRapfiReady() {
  try {
    const response = await fetch(`${rapfiServiceOrigin()}/health`, { headers: rapfiServiceHeaders(), signal: AbortSignal.timeout(2_500) });
    const data = await response.json() as { ready?: boolean };
    return response.ok && data.ready === true;
  } catch {
    return false;
  }
}

async function notifyRoom(roomId: string, version?: number, type = "room_updated") {
  try {
    const namespace = getRoomHub();
    const hub = namespace.get(namespace.idFromName(roomId));
    await hub.fetch("https://room-hub/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, roomId, version }),
    });
  } catch {
    // D1 remains authoritative; clients retain a low-frequency recovery fetch.
  }
  await notifyPlatform({ type: "lobby_updated" });
}

async function ensureSchema() {
  const d1 = getD1();
  await ensureAppSchema(d1);
  await d1.prepare(`CREATE TABLE IF NOT EXISTS game_rooms (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    black_player TEXT NOT NULL,
    white_player TEXT,
    black_name TEXT,
    white_name TEXT,
    black_avatar TEXT,
    white_avatar TEXT,
    black_signature TEXT,
    white_signature TEXT,
    host_user_id TEXT,
    guest_user_id TEXT,
    black_user_id TEXT,
    white_user_id TEXT,
    mode TEXT NOT NULL DEFAULT 'private',
    board_size INTEGER NOT NULL DEFAULT 0,
    spectator_policy TEXT NOT NULL DEFAULT 'off',
    state TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();

  const columns = await d1.prepare("PRAGMA table_info(game_rooms)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const additions = [
    ["black_name", "ALTER TABLE game_rooms ADD COLUMN black_name TEXT"],
    ["white_name", "ALTER TABLE game_rooms ADD COLUMN white_name TEXT"],
    ["black_avatar", "ALTER TABLE game_rooms ADD COLUMN black_avatar TEXT"],
    ["white_avatar", "ALTER TABLE game_rooms ADD COLUMN white_avatar TEXT"],
    ["black_signature", "ALTER TABLE game_rooms ADD COLUMN black_signature TEXT"],
    ["white_signature", "ALTER TABLE game_rooms ADD COLUMN white_signature TEXT"],
    ["host_user_id", "ALTER TABLE game_rooms ADD COLUMN host_user_id TEXT"],
    ["guest_user_id", "ALTER TABLE game_rooms ADD COLUMN guest_user_id TEXT"],
    ["black_user_id", "ALTER TABLE game_rooms ADD COLUMN black_user_id TEXT"],
    ["white_user_id", "ALTER TABLE game_rooms ADD COLUMN white_user_id TEXT"],
    ["mode", "ALTER TABLE game_rooms ADD COLUMN mode TEXT NOT NULL DEFAULT 'private'"],
    ["board_size", "ALTER TABLE game_rooms ADD COLUMN board_size INTEGER NOT NULL DEFAULT 0"],
    ["spectator_policy", "ALTER TABLE game_rooms ADD COLUMN spectator_policy TEXT NOT NULL DEFAULT 'off'"],
  ] as const;
  for (const [name, sql] of additions) {
    if (!names.has(name)) await d1.prepare(sql).run();
  }

  await d1.prepare(`CREATE TABLE IF NOT EXISTS matchmaking_queue (
    queue_key TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`).run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS game_room_presence (
    room_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    last_seen INTEGER NOT NULL,
    UNIQUE(room_id, player_id)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS game_room_presence_seen_idx ON game_room_presence(room_id, last_seen)").run();
  await d1.prepare(`CREATE TABLE IF NOT EXISTS game_room_spectators (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS game_room_spectators_seen_idx ON game_room_spectators(room_id, last_seen)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS game_rooms_lobby_idx ON game_rooms(mode, spectator_policy, updated_at)").run();
  await d1.prepare("PRAGMA optimize").run();
  await ensureAuthSchema(d1);
  if (!names.has("black_user_id") || !names.has("white_user_id")) {
    await d1.prepare(`UPDATE game_rooms SET
      black_user_id = CASE
        WHEN white_player IS NULL THEN host_user_id
        ELSE COALESCE((SELECT id FROM users WHERE display_name = black_name LIMIT 1), black_user_id)
      END,
      white_user_id = CASE
        WHEN white_player IS NULL THEN NULL
        ELSE COALESCE((SELECT id FROM users WHERE display_name = white_name LIMIT 1), white_user_id)
      END
      WHERE black_user_id IS NULL OR (white_player IS NOT NULL AND white_user_id IS NULL)`).run();
  }
  await ensureFriendSchema(d1);
  await ensureRankSchema(d1);
  await ensureMatchHistorySchema(d1);
  await ensureMatchDiagnosticsSchema(d1);
  return d1;
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function normalizedSize(game: MatchGame, requested?: number) {
  if (game === "go") return [9, 13, 19].includes(requested ?? 19) ? requested ?? 19 : 19;
  return game === "gomoku" ? 15 : 8;
}

function parseState(row: RoomRow) {
  return JSON.parse(row.state) as MatchState;
}

function roleFor(row: RoomRow, playerId: string | null, state = parseState(row)): MatchPlayer | null {
  if (!row.white_player && playerId === row.black_player) {
    const preference = state.hostColorPreference ?? "black";
    return preference === "random" ? null : preference;
  }
  if (playerId === row.black_player) return "black";
  if (playerId && playerId === row.white_player) return "white";
  return null;
}

function playerIdForUser(row: RoomRow, userId: string) {
  if (!row.white_player) return row.host_user_id === userId ? row.black_player : null;
  if (row.black_user_id === userId) return row.black_player;
  if (row.white_user_id === userId) return row.white_player;
  return null;
}

async function usersAreFriends(d1: D1, firstUserId: string, secondUserId: string) {
  const [low, high] = firstUserId < secondUserId ? [firstUserId, secondUserId] : [secondUserId, firstUserId];
  const friendship = await d1.prepare("SELECT status FROM friendships WHERE user_low = ? AND user_high = ?")
    .bind(low, high).first<{ status: string }>();
  return friendship?.status === "accepted";
}

async function canSpectateRoom(d1: D1, row: RoomRow, userId: string) {
  if (["ranked", "ai"].includes(row.mode ?? "private")) return false;
  const policy = row.spectator_policy ?? "off";
  if (policy === "public") return true;
  if (policy !== "friends") return false;
  const playerUserIds = [row.host_user_id, row.guest_user_id, row.black_user_id, row.white_user_id]
    .filter((id): id is string => Boolean(id && id !== userId));
  for (const playerUserId of new Set(playerUserIds)) {
    if (await usersAreFriends(d1, userId, playerUserId)) return true;
  }
  return false;
}

async function heartbeatSpectator(d1: D1, roomId: string, userId: string) {
  const now = Date.now();
  await d1.prepare(`INSERT INTO game_room_spectators (room_id, user_id, last_seen) VALUES (?, ?, ?)
    ON CONFLICT(room_id, user_id) DO UPDATE SET last_seen = excluded.last_seen`).bind(roomId, userId, now).run();
  await d1.prepare("DELETE FROM game_room_spectators WHERE last_seen < ?").bind(now - 60_000).run();
}

function publicRoom(row: RoomRow, playerId: string | null) {
  const storedState = parseState(row);
  const state = storedState.clock ? projectMatchClock(storedState) : storedState;
  const waiting = !row.white_player;
  const preference = state.hostColorPreference ?? "black";
  const rolePending = waiting && playerId === row.black_player && preference === "random";
  const hostName = row.black_name ?? "玩家";
  const players = waiting
    ? preference === "white" ? { black: null, white: hostName } : preference === "black" ? { black: hostName, white: null } : { black: null, white: null }
    : { black: row.black_name, white: row.white_name };
  const hostProfile = { avatarUrl: avatarUrlForKey(row.black_avatar), signature: row.black_signature ?? "" };
  const profiles = waiting
    ? preference === "white" ? { black: null, white: hostProfile } : preference === "black" ? { black: hostProfile, white: null } : { black: null, white: null }
    : {
        black: { avatarUrl: avatarUrlForKey(row.black_avatar), signature: row.black_signature ?? "" },
        white: { avatarUrl: avatarUrlForKey(row.white_avatar), signature: row.white_signature ?? "" },
      };
  return {
    id: row.id,
    game: row.game,
    mode: row.mode ?? "private",
    spectatorPolicy: row.mode === "ranked" || row.mode === "ai" ? "off" : row.spectator_policy ?? "off",
    role: roleFor(row, playerId, state),
    rolePending,
    opponentReady: Boolean(row.white_player),
    players,
    profiles,
    version: row.version,
    state,
  };
}

function errorResponse(error: unknown, requestId: string) {
  const headers = { "x-micosm-request-id": requestId };
  if (error instanceof MatchRuleError) return Response.json({ error: { code: error.code, message: error.message, requestId } }, { status: 409, headers });
  const message = error instanceof Error ? error.message : "服务器暂时无法处理请求";
  return Response.json({ error: { code: "server_error", message, requestId } }, { status: 500, headers });
}

function jsonError(code: string, message: string, status: number, requestId: string) {
  return Response.json({ error: { code, message, requestId } }, { status, headers: { "x-micosm-request-id": requestId } });
}

async function recordRequestError(requestId: string, method: "GET" | "POST", error: unknown) {
  logEvent("error", "match_request_failed", { requestId, method, error: error instanceof Error ? error.message : String(error) });
  try {
    await recordMatchEvent(getD1(), { requestId, type: "request_error", details: { method, message: error instanceof Error ? error.message : String(error) } });
  } catch {
    // The original error response remains available even when D1 itself is unavailable.
  }
}

async function createWaitingRoom(d1: D1, game: MatchGame, size: number, preference: ColorPreference, player: AuthUser, mode: RoomMode, clockConfig?: MatchClockConfig, forbiddenMoves = false, spectatorPolicy: SpectatorPolicy = "off") {
  const playerId = crypto.randomUUID();
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = roomCode();
    const baseState = createMatchState(game, size, preference, game === "gomoku" && (mode === "ranked" || mode === "matchmaking" || forbiddenMoves));
    const state = mode === "private" && clockConfig ? { ...baseState, clockConfig } : baseState;
    try {
      await d1.prepare("INSERT INTO game_rooms (id, game, black_player, black_name, black_avatar, black_signature, host_user_id, black_user_id, mode, board_size, spectator_policy, state, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)")
        .bind(id, game, playerId, player.displayName, player.avatarKey, player.signature, player.id, player.id, mode, state.size, mode === "private" ? spectatorPolicy : "off", JSON.stringify(state), now, now).run();
      await d1.prepare("INSERT INTO game_room_presence (room_id, player_id, last_seen) VALUES (?, ?, ?)").bind(id, playerId, now).run();
      const row = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>();
      return { row: row as RoomRow, playerId };
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error("无法创建房间");
}

function otherPlayer(player: MatchPlayer): MatchPlayer {
  return player === "black" ? "white" : "black";
}

function aiDisplayName(game: MatchGame, difficulty: AiDifficulty) {
  if (game === "go" && difficulty === "master") return "KataGo · 星神";
  if (game === "gomoku" && difficulty === "master") return "Rapfi · 星神";
  return difficulty === "easy" ? "星芽" : difficulty === "normal" ? "白石铃音" : difficulty === "hard" ? "藤原澪" : "无垠棋手";
}

function aiSignature(game: MatchGame, difficulty: AiDifficulty) {
  if (game === "go" && difficulty === "master") return "b28 神经网络 · RTX GPU 搜索";
  if (game === "gomoku" && difficulty === "master") return "mix9svq NNUE · 专业级连珠搜索";
  return difficulty === "easy" ? "刚学会看棋盘，请多指教" : difficulty === "normal" ? "稳健练习型棋手" : difficulty === "hard" ? "高段深度搜索" : "极限深度搜索";
}

async function createAiRoom(d1: D1, game: MatchGame, size: number, preference: ColorPreference, player: AuthUser, difficulty: AiDifficulty, forbiddenMoves = false) {
  const playerId = crypto.randomUUID();
  const aiPlayerId = crypto.randomUUID();
  const randomByte = crypto.getRandomValues(new Uint8Array(1))[0];
  const userIsBlack = preference === "black" || (preference === "random" && randomByte % 2 === 0);
  const userRole: MatchPlayer = userIsBlack ? "black" : "white";
  const aiRole = otherPlayer(userRole);
  const engine = game === "go" && difficulty === "master" ? "katago" : game === "gomoku" && difficulty === "master" ? "rapfi" : "builtin";
  const base = activateMatch(createMatchState(game, size, "black", game === "gomoku" && forbiddenMoves));
  const state: MatchState = { ...base, ai: { player: aiRole, difficulty, engine }, notice: aiRole === "black" ? "AI 正在思考第一手" : "轮到你落子" };
  const id = roomCode();
  const now = Date.now();
  const aiName = aiDisplayName(game, difficulty);
  const aiBio = aiSignature(game, difficulty);
  const blackPlayer = userIsBlack ? playerId : aiPlayerId;
  const whitePlayer = userIsBlack ? aiPlayerId : playerId;
  const blackName = userIsBlack ? player.displayName : aiName;
  const whiteName = userIsBlack ? aiName : player.displayName;
  const blackAvatar = userIsBlack ? player.avatarKey : null;
  const whiteAvatar = userIsBlack ? null : player.avatarKey;
  const blackSignature = userIsBlack ? player.signature : aiBio;
  const whiteSignature = userIsBlack ? aiBio : player.signature;
  const blackUserId = userIsBlack ? player.id : null;
  const whiteUserId = userIsBlack ? null : player.id;
  await d1.prepare(`INSERT INTO game_rooms (
    id, game, black_player, white_player, black_name, white_name, black_avatar, white_avatar,
    black_signature, white_signature, host_user_id, guest_user_id, black_user_id, white_user_id,
    mode, board_size, state, version, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'ai', ?, ?, 0, ?, ?)`).bind(
    id, game, blackPlayer, whitePlayer, blackName, whiteName, blackAvatar, whiteAvatar,
    blackSignature, whiteSignature, player.id, blackUserId, whiteUserId, state.size, JSON.stringify(state), now, now,
  ).run();
  await d1.prepare("INSERT INTO game_room_presence (room_id, player_id, last_seen) VALUES (?, ?, ?)").bind(id, playerId, now).run();
  const row = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>();
  return { row: row as RoomRow, playerId };
}

function resetAiState(state: MatchState) {
  if (!state.ai) throw new MatchRuleError("ai_state_missing", "AI 对局配置已经失效");
  const reset = activateMatch(createMatchState(state.game, state.size, "black", state.gomokuForbidden));
  return { ...reset, ai: state.ai, notice: state.ai.player === "black" ? "AI 正在思考第一手" : "轮到你落子" };
}

function undoAiRound(state: MatchState) {
  if (!state.ai) throw new MatchRuleError("ai_state_missing", "AI 对局配置已经失效");
  const moves = state.moves ?? [];
  const keep = Math.max(0, moves.length - 2);
  if (keep === moves.length) throw new MatchRuleError("nothing_to_undo", "当前没有可以撤销的回合");
  let replay = resetAiState(state);
  for (const move of moves.slice(0, keep)) {
    const action: MatchAction = move.type === "play"
      ? { type: "play", row: move.row, col: move.col }
      : move.type === "pass" ? { type: "pass" } : { type: "resumeGo" };
    replay = { ...applyMatchAction(replay, move.player, action), ai: state.ai };
  }
  return { ...replay, notice: "已撤销上一回合，轮到你重新落子" };
}

async function advanceAi(state: MatchState) {
  const ai = state.ai;
  if (!ai) throw new MatchRuleError("ai_state_missing", "AI 对局配置已经失效");
  if (state.status === "scoring") {
    const human = otherPlayer(ai.player);
    const confirmations = state.goScoring?.confirmations ?? [];
    if (confirmations.includes(human) && !confirmations.includes(ai.player)) return { ...applyMatchAction(state, ai.player, { type: "confirmScore" }), ai };
    return state;
  }
  if (state.status !== "playing" || state.turn !== ai.player) return state;
  const action = ai.engine === "katago"
    ? await kataGoAction(state)
    : ai.engine === "rapfi"
      ? await rapfiAction(state)
      : chooseBuiltInAiAction(state, ai.difficulty);
  return { ...applyMatchAction(state, ai.player, action), ai };
}

async function claimWaitingRoom(d1: D1, row: RoomRow, guest: AuthUser) {
  if (row.host_user_id === guest.id) return null;
  const playerId = crypto.randomUUID();
  const waitingState = parseState(row);
  const preference = waitingState.hostColorPreference ?? "black";
  const hostIsBlack = preference === "black" || (preference === "random" && crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0);
  const blackPlayer = hostIsBlack ? row.black_player : playerId;
  const whitePlayer = hostIsBlack ? playerId : row.black_player;
  const hostName = row.black_name ?? "玩家1";
  const blackName = hostIsBlack ? hostName : guest.displayName;
  const whiteName = hostIsBlack ? guest.displayName : hostName;
  const blackAvatar = hostIsBlack ? row.black_avatar : guest.avatarKey;
  const whiteAvatar = hostIsBlack ? guest.avatarKey : row.black_avatar;
  const blackSignature = hostIsBlack ? row.black_signature : guest.signature;
  const whiteSignature = hostIsBlack ? guest.signature : row.black_signature;
  const blackUserId = hostIsBlack ? row.host_user_id : guest.id;
  const whiteUserId = hostIsBlack ? guest.id : row.host_user_id;
  const now = Date.now();
  const activeState = activateMatch(waitingState);
  const state = (row.mode ?? "private") === "ranked"
    ? startRankedClock(activeState, now)
    : waitingState.clockConfig
      ? startConfiguredMatchClock(activeState, waitingState.clockConfig, now)
      : waitingState.clockConfigMs
        ? startConfiguredMatchClock(activeState, { mode: "per_move", initialMs: waitingState.clockConfigMs }, now)
      : activeState;
  const result = await d1.prepare("UPDATE game_rooms SET black_player = ?, white_player = ?, black_name = ?, white_name = ?, black_avatar = ?, white_avatar = ?, black_signature = ?, white_signature = ?, guest_user_id = ?, black_user_id = ?, white_user_id = ?, state = ?, version = version + 1, updated_at = ? WHERE id = ? AND white_player IS NULL")
    .bind(blackPlayer, whitePlayer, blackName, whiteName, blackAvatar, whiteAvatar, blackSignature, whiteSignature, guest.id, blackUserId, whiteUserId, JSON.stringify(state), now, row.id).run();
  if (!result.meta.changes) return null;
  await d1.prepare("INSERT INTO game_room_presence (room_id, player_id, last_seen) VALUES (?, ?, ?) ON CONFLICT(room_id, player_id) DO UPDATE SET last_seen = excluded.last_seen")
    .bind(row.id, row.black_player, Date.now()).run();
  await d1.prepare("INSERT INTO game_room_presence (room_id, player_id, last_seen) VALUES (?, ?, ?) ON CONFLICT(room_id, player_id) DO UPDATE SET last_seen = excluded.last_seen")
    .bind(row.id, playerId, Date.now()).run();
  const updated = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(row.id).first<RoomRow>();
  await notifyRoom(row.id, updated?.version);
  return { row: updated as RoomRow, playerId, hostIsBlack };
}

type RankMatchRow = {
  room_id: string;
  black_user_id: string;
  white_user_id: string;
  black_rating_before: number;
  white_rating_before: number;
  black_delta: number | null;
  white_delta: number | null;
  black_rating_after: number | null;
  white_rating_after: number | null;
  status: string;
};

async function rankProfile(d1: D1, userId: string, game: "go" | "gomoku") {
  const now = Date.now();
  await d1.prepare("INSERT OR IGNORE INTO rank_profiles (user_id, game, rating, peak_rating, wins, losses, draws, streak, matches, updated_at) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, ?)").bind(userId, game, now).run();
  return await d1.prepare("SELECT rating, streak FROM rank_profiles WHERE user_id = ? AND game = ?").bind(userId, game).first<{ rating: number; streak: number }>() as { rating: number; streak: number };
}

async function createRankMatch(d1: D1, waitingRoom: RoomRow, joinedRoom: RoomRow, guest: AuthUser, hostIsBlack: boolean, seasonId: string) {
  if (!waitingRoom.host_user_id || (joinedRoom.game !== "go" && joinedRoom.game !== "gomoku")) throw new Error("排位房间身份无效");
  const hostProfile = await rankProfile(d1, waitingRoom.host_user_id, joinedRoom.game);
  const guestProfile = await rankProfile(d1, guest.id, joinedRoom.game);
  const blackUserId = hostIsBlack ? waitingRoom.host_user_id : guest.id;
  const whiteUserId = hostIsBlack ? guest.id : waitingRoom.host_user_id;
  const blackRating = hostIsBlack ? hostProfile.rating : guestProfile.rating;
  const whiteRating = hostIsBlack ? guestProfile.rating : hostProfile.rating;
  await d1.prepare("INSERT INTO rank_matches (room_id, season_id, game, black_user_id, white_user_id, black_rating_before, white_rating_before, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)")
    .bind(joinedRoom.id, seasonId, joinedRoom.game, blackUserId, whiteUserId, blackRating, whiteRating, Date.now()).run();
}

async function settleRankedMatch(d1: D1, row: RoomRow, state: MatchState) {
  if ((row.mode ?? "private") !== "ranked" || state.status !== "ended" || !state.winner) return;
  const match = await d1.prepare("SELECT room_id, black_user_id, white_user_id, black_rating_before, white_rating_before, black_delta, white_delta, black_rating_after, white_rating_after, status FROM rank_matches WHERE room_id = ?")
    .bind(row.id).first<RankMatchRow>();
  if (!match || match.status === "settled") return;
  const claimTime = Date.now();
  const claimed = await d1.prepare(`UPDATE rank_matches
    SET status = 'settling', settled_at = ?
    WHERE room_id = ? AND (
      status = 'active' OR
      (status = 'settling' AND (settled_at IS NULL OR settled_at < ?))
    )`).bind(claimTime, row.id, claimTime - RANK_SETTLEMENT_STALE_MS).run();
  if (!claimed.meta.changes) return;
  try {
    const game = row.game as "go" | "gomoku";
    const blackProfile = await rankProfile(d1, match.black_user_id, game);
    const whiteProfile = await rankProfile(d1, match.white_user_id, game);
    const draw = state.winner === "draw";
    const blackWon = state.winner === "black";
    const blackDelta = draw ? 0 : rankChange(match.black_rating_before, match.white_rating_before, blackWon, blackProfile.streak);
    const whiteDelta = draw ? 0 : rankChange(match.white_rating_before, match.black_rating_before, !blackWon, whiteProfile.streak);
    const blackAfter = Math.max(0, match.black_rating_before + blackDelta);
    const whiteAfter = Math.max(0, match.white_rating_before + whiteDelta);
    const now = Date.now();
    await d1.batch([
      d1.prepare("UPDATE rank_profiles SET rating = ?, peak_rating = MAX(peak_rating, ?), wins = wins + ?, losses = losses + ?, draws = draws + ?, streak = ?, matches = matches + 1, updated_at = ? WHERE user_id = ? AND game = ?")
        .bind(blackAfter, blackAfter, !draw && blackWon ? 1 : 0, !draw && !blackWon ? 1 : 0, draw ? 1 : 0, draw ? 0 : blackWon ? blackProfile.streak + 1 : 0, now, match.black_user_id, game),
      d1.prepare("UPDATE rank_profiles SET rating = ?, peak_rating = MAX(peak_rating, ?), wins = wins + ?, losses = losses + ?, draws = draws + ?, streak = ?, matches = matches + 1, updated_at = ? WHERE user_id = ? AND game = ?")
        .bind(whiteAfter, whiteAfter, !draw && !blackWon ? 1 : 0, !draw && blackWon ? 1 : 0, draw ? 1 : 0, draw ? 0 : !blackWon ? whiteProfile.streak + 1 : 0, now, match.white_user_id, game),
      d1.prepare("UPDATE rank_matches SET black_delta = ?, white_delta = ?, black_rating_after = ?, white_rating_after = ?, result = ?, status = 'settled', settled_at = ? WHERE room_id = ? AND status = 'settling' AND settled_at = ?")
        .bind(blackDelta, whiteDelta, blackAfter, whiteAfter, state.winner, now, row.id, claimTime),
    ]);
  } catch (error) {
    await d1.prepare("UPDATE rank_matches SET status = 'active', settled_at = NULL WHERE room_id = ? AND status = 'settling' AND settled_at = ?")
      .bind(row.id, claimTime).run();
    throw error;
  }
}

async function settleAndArchiveMatch(d1: D1, row: RoomRow, state: MatchState, diagnostic?: { requestId: string; actorUserId?: string | null; actorPlayerId?: string | null }) {
  await settleRankedMatch(d1, row, state);
  await archiveFinishedMatch(d1, row, state);
  if (state.status === "ended" && state.winner) {
    const recipients = [[row.black_user_id, "black"], [row.white_user_id, "white"]] as const;
    const notified: string[] = [];
    for (const [userId, role] of recipients) {
      if (!userId) continue;
      const won = state.winner === role;
      const drew = state.winner === "draw";
      const created = await createNotification(d1, { userId, kind: "match_result", title: drew ? "对局和棋" : won ? "对局获胜" : "对局结束", message: `${row.game === "go" ? "围棋" : row.game === "gomoku" ? "五子棋" : "黑白棋"}${row.mode === "ranked" ? "排位" : "对局"}已结束，${drew ? "双方和棋" : won ? "你获得了胜利" : "胜负已分"}。`, entityType: "match", entityId: row.id, dedupeKey: `match-result:${row.id}:${userId}` });
      if (created) notified.push(userId);
    }
    if (notified.length) await notifyPlatform({ type: "notifications_updated", userIds: notified });
  }
  if (state.status === "ended" && state.winner && diagnostic) {
    await recordMatchEvent(d1, { roomId: row.id, requestId: diagnostic.requestId, type: "match_archived", actorUserId: diagnostic.actorUserId, actorPlayerId: diagnostic.actorPlayerId, roomVersion: row.version, details: { winner: state.winner } });
    if ((row.mode ?? "private") === "ranked") {
      await recordMatchEvent(d1, { roomId: row.id, requestId: diagnostic.requestId, type: "rank_settled", actorUserId: diagnostic.actorUserId, actorPlayerId: diagnostic.actorPlayerId, roomVersion: row.version, details: { winner: state.winner } });
    }
  }
}

async function publicRoomWithRank(d1: D1, row: RoomRow, playerId: string | null, userId: string) {
  const room = publicRoom(row, playerId);
  if ((row.mode ?? "private") !== "ranked") return room;
  const match = await d1.prepare("SELECT black_user_id, white_user_id, black_delta, white_delta, black_rating_after, white_rating_after, status FROM rank_matches WHERE room_id = ?")
    .bind(row.id).first<RankMatchRow>();
  if (!match || match.status !== "settled") return { ...room, rankResult: null };
  const isBlack = match.black_user_id === userId;
  return {
    ...room,
    rankResult: {
      delta: isBlack ? match.black_delta ?? 0 : match.white_delta ?? 0,
      rating: isBlack ? match.black_rating_after ?? 0 : match.white_rating_after ?? 0,
    },
  };
}

async function resolveMatchTimeout(d1: D1, row: RoomRow, requestId?: string) {
  const storedState = parseState(row);
  if (storedState.status !== "playing" || !storedState.clock) return row;
  const next = projectMatchClock(storedState);
  if (next.status === "playing") return row;
  const result = await d1.prepare("UPDATE game_rooms SET state = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
    .bind(JSON.stringify(next), Date.now(), row.id, row.version).run();
  if (!result.meta.changes) {
    return await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(row.id).first<RoomRow>() as RoomRow;
  }
  const updated = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(row.id).first<RoomRow>() as RoomRow;
  if (requestId) await recordMatchEvent(d1, { roomId: row.id, requestId, type: "match_timeout", roomVersion: updated.version, details: { winner: next.winner } });
  await settleAndArchiveMatch(d1, updated, next, requestId ? { requestId } : undefined);
  await notifyRoom(row.id, updated.version);
  return updated;
}

async function heartbeatAndResolveDeparture(d1: D1, row: RoomRow, playerId: string | null, requestId?: string) {
  const role = roleFor(row, playerId);
  if (!role || !playerId) return row;
  const now = Date.now();
  await d1.prepare(`INSERT INTO game_room_presence (room_id, player_id, last_seen) VALUES (?, ?, ?)
    ON CONFLICT(room_id, player_id) DO UPDATE SET last_seen = CASE WHEN last_seen < ? THEN excluded.last_seen ELSE last_seen END`)
    .bind(row.id, playerId, now, now - 5_000).run();
  const state = parseState(row);
  if ((row.mode ?? "private") === "ai") return row;
  if (!row.white_player || state.status !== "playing") return row;
  const opponentRole: MatchPlayer = role === "black" ? "white" : "black";
  const opponentId = opponentRole === "black" ? row.black_player : row.white_player;
  if (!opponentId) return row;
  const presence = await d1.prepare("SELECT last_seen FROM game_room_presence WHERE room_id = ? AND player_id = ?")
    .bind(row.id, opponentId).first<{ last_seen: number }>();
  if (presence && presence.last_seen >= now - ROOM_DISCONNECT_MS) return row;
  const next: MatchState = {
    ...state,
    status: "ended",
    winner: role,
    departedPlayer: opponentRole,
    undoRequest: null,
    notice: `${opponentRole === "black" ? "黑方" : "白方"}失去连接，${role === "black" ? "黑方" : "白方"}获胜`,
  };
  const result = await d1.prepare("UPDATE game_rooms SET state = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
    .bind(JSON.stringify(next), now, row.id, row.version).run();
  if (!result.meta.changes) return await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(row.id).first<RoomRow>() as RoomRow;
  const updated = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(row.id).first<RoomRow>() as RoomRow;
  if (requestId) await recordMatchEvent(d1, { roomId: row.id, requestId, type: "match_departure", actorPlayerId: playerId, roomVersion: updated.version, details: { departedPlayer: opponentRole, winner: role } });
  await settleAndArchiveMatch(d1, updated, next, requestId ? { requestId, actorPlayerId: playerId } : undefined);
  await notifyRoom(row.id, updated.version);
  return updated;
}

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("roomId")?.trim().toUpperCase();
    if (!id) return jsonError("missing_room", "请输入邀请码", 400, requestId);
    const d1 = await ensureSchema();
    const sessionUser = await getSessionUser(request, d1);
    if (!sessionUser) return jsonError("auth_required", "请先登录", 401, requestId);
    const sanction = await activeSanction(d1, sessionUser.id);
    if (sanction.banned) return jsonError("account_banned", "账号已被暂停使用", 403, requestId);
    let row = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>();
    if (!row) return jsonError("room_not_found", "没有找到这个对局", 404, requestId);
    const authenticatedPlayerId = playerIdForUser(row, sessionUser.id);
    if (!authenticatedPlayerId) {
      if (!await featureEnabled(d1, "spectating_enabled")) return jsonError("spectating_disabled", "观战系统暂时关闭", 503, requestId);
      if (!await canSpectateRoom(d1, row, sessionUser.id)) return jsonError("spectating_forbidden", "这个房间没有开放观战", 403, requestId);
      await heartbeatSpectator(d1, row.id, sessionUser.id);
    }
    row = await resolveMatchTimeout(d1, row, requestId);
    row = await heartbeatAndResolveDeparture(d1, row, authenticatedPlayerId, requestId);
    if (["matchmaking", "ranked"].includes(row.mode ?? "private") && !row.white_player && authenticatedPlayerId === row.black_player && row.updated_at < Date.now() - 5000) {
      const now = Date.now();
      await d1.prepare("UPDATE game_rooms SET updated_at = ? WHERE id = ? AND white_player IS NULL").bind(now, id).run();
      if (row.mode === "ranked") await d1.prepare("UPDATE ranked_queue SET updated_at = ? WHERE room_id = ?").bind(now, id).run();
    }
    return Response.json({ room: await publicRoomWithRank(d1, row, authenticatedPlayerId, sessionUser.id) });
  } catch (error) {
    await recordRequestError(requestId, "GET", error);
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const payload = await request.json() as { type?: string; game?: MatchGame; size?: number; colorPreference?: ColorPreference; aiDifficulty?: AiDifficulty; clockMode?: MatchClockMode; turnSeconds?: number; clockMinutes?: number; totalMinutes?: number; byoYomiSeconds?: number; byoYomiPeriods?: number; forbiddenMoves?: boolean; spectatorPolicy?: SpectatorPolicy; enabled?: boolean; roomId?: string; playerId?: string; actionId?: string; action?: MatchAction };
    const d1 = await ensureSchema();
    const sessionUser = await getSessionUser(request, d1);
    if (!sessionUser) return jsonError("auth_required", "请先登录", 401, requestId);
    const sanction = await activeSanction(d1, sessionUser.id);
    if (sanction.banned) return jsonError("account_banned", "账号已被暂停使用", 403, requestId);
    const createsNewBusiness = ["createAI", "rankmake", "create", "matchmake", "join"].includes(payload.type ?? "");
    if (createsNewBusiness && await featureEnabled(d1, "maintenance_mode")) return jsonError("maintenance_mode", "平台正在维护，暂时不能创建或加入新对局", 503, requestId);
    const expensiveTypes = new Set(["createAI", "rankmake", "create", "matchmake", "join"]);
    const rate = await consumeRateLimit(d1, {
      scope: payload.type === "aiMove" ? "match_ai" : expensiveTypes.has(payload.type ?? "") ? "match_create" : "match_action",
      actor: sessionUser.id,
      limit: payload.type === "aiMove" ? 30 : expensiveTypes.has(payload.type ?? "") ? 15 : 180,
      windowMs: 60_000,
    });
    if (!rate.allowed) return rateLimitResponse(rate, payload.type === "aiMove" ? "AI 请求太频繁，请稍后再试" : "对局操作太频繁，请稍后再试");

    if (payload.type === "createAI") {
      if (!payload.game || !["go", "gomoku", "reversi"].includes(payload.game)) return jsonError("invalid_game", "当前游戏暂不支持人机对战", 400, requestId);
      const difficulty = AI_DIFFICULTIES.includes(payload.aiDifficulty ?? "normal") ? payload.aiDifficulty ?? "normal" : "normal";
      if (difficulty === "master" && payload.game === "go" && !await featureEnabled(d1, "ai_go_master_enabled")) return jsonError("ai_master_disabled", "KataGo 最高难度暂时关闭", 503, requestId);
      if (difficulty === "master" && payload.game === "gomoku" && !await featureEnabled(d1, "ai_gomoku_master_enabled")) return jsonError("ai_master_disabled", "Rapfi 最高难度暂时关闭", 503, requestId);
      const preference: ColorPreference = ["black", "white", "random"].includes(payload.colorPreference ?? "black") ? payload.colorPreference ?? "black" : "black";
      if (payload.game === "go" && difficulty === "master" && !(await ensureKataGoReady())) {
        return jsonError("katago_unavailable", "最高难度需要先启动本机 KataGo GPU 服务", 503, requestId);
      }
      if (payload.game === "gomoku" && difficulty === "master" && !(await ensureRapfiReady())) {
        return jsonError("rapfi_unavailable", "最高难度需要先启动本机 Rapfi NNUE 服务", 503, requestId);
      }
      const created = await createAiRoom(d1, payload.game, normalizedSize(payload.game, payload.size), preference, sessionUser, difficulty, payload.forbiddenMoves === true);
      await recordMatchEvent(d1, { roomId: created.row.id, requestId, type: "room_created", actorUserId: sessionUser.id, actorPlayerId: created.playerId, roomVersion: created.row.version, details: { game: payload.game, mode: "ai", difficulty } });
      return Response.json({ room: publicRoom(created.row, created.playerId), playerId: created.playerId }, { status: 201 });
    }

    if (payload.type === "rankmake") {
      if (!payload.game || !["go", "gomoku"].includes(payload.game)) return jsonError("ranked_game_unavailable", "当前游戏不参与排位", 400, requestId);
      const game = payload.game as "go" | "gomoku";
      if (!await featureEnabled(d1, game === "go" ? "ranked_go_enabled" : "ranked_gomoku_enabled")) return jsonError("ranked_disabled", `${game === "go" ? "围棋" : "五子棋"}排位暂时关闭`, 503, requestId);
      const seasonState = await rankSeasonForGame(d1, game);
      if (!seasonState.playable || !seasonState.season) return jsonError("ranked_season_unavailable", seasonState.reason || "当前没有可参加的排位赛季", 409, requestId);
      const seasonId = seasonState.season.id;
      const size = game === "go" ? 19 : 15;
      const activeMatch = await d1.prepare("SELECT room_id FROM rank_matches WHERE status IN ('active', 'settling') AND (black_user_id = ? OR white_user_id = ?) LIMIT 1").bind(sessionUser.id, sessionUser.id).first<{ room_id: string }>();
      if (activeMatch) return jsonError("ranked_match_active", "你已经有一场进行中的排位对局", 409, requestId);
      const existing = await d1.prepare("SELECT q.user_id AS queue_user_id, q.rating AS queue_rating, q.created_at AS queue_created_at, q.player_id AS queue_player_id, q.updated_at AS queue_updated_at, q.season_id AS queue_season_id, r.* FROM ranked_queue q JOIN game_rooms r ON r.id = q.room_id WHERE q.user_id = ?")
        .bind(sessionUser.id).first<RankedQueueRow>();
      if (existing && existing.queue_season_id === seasonId && existing.game === game && existing.queue_updated_at >= Date.now() - 20_000) return Response.json({ room: await publicRoomWithRank(d1, existing, existing.queue_player_id, sessionUser.id), playerId: existing.queue_player_id });
      if (existing) {
        await d1.prepare("DELETE FROM ranked_queue WHERE user_id = ?").bind(sessionUser.id).run();
        await d1.prepare("DELETE FROM game_rooms WHERE id = ? AND white_player IS NULL").bind(existing.id).run();
      }

      const profile = await rankProfile(d1, sessionUser.id, game);
      const now = Date.now();
      const candidates = await d1.prepare(`SELECT q.user_id AS queue_user_id, q.rating AS queue_rating, q.created_at AS queue_created_at, q.player_id AS queue_player_id, q.updated_at AS queue_updated_at, r.*
        FROM ranked_queue q JOIN game_rooms r ON r.id = q.room_id
        WHERE q.season_id = ? AND q.game = ? AND q.board_size = ? AND q.user_id != ?
        ORDER BY ABS(q.rating - ?) ASC, q.created_at ASC LIMIT 20`).bind(seasonId, game, size, sessionUser.id, profile.rating).all<RankedQueueRow>();
      for (const queued of candidates.results) {
        if (queued.queue_updated_at < now - 20_000) {
          await d1.prepare("DELETE FROM ranked_queue WHERE user_id = ? AND room_id = ?").bind(queued.queue_user_id, queued.id).run();
          await d1.prepare("DELETE FROM game_rooms WHERE id = ? AND white_player IS NULL").bind(queued.id).run();
          continue;
        }
        const searchWindow = Math.min(400, 100 + Math.floor((now - queued.queue_created_at) / 10_000) * 50);
        if (Math.abs(queued.queue_rating - profile.rating) > searchWindow) continue;
        const joined = await claimWaitingRoom(d1, queued, sessionUser);
        if (!joined) continue;
        await d1.prepare("DELETE FROM ranked_queue WHERE user_id = ? AND room_id = ?").bind(queued.queue_user_id, queued.id).run();
        await createRankMatch(d1, queued, joined.row, sessionUser, joined.hostIsBlack, seasonId);
        await recordMatchEvent(d1, { roomId: joined.row.id, requestId, type: "room_joined", actorUserId: sessionUser.id, actorPlayerId: joined.playerId, roomVersion: joined.row.version, details: { game, mode: "ranked" } });
        return Response.json({ room: await publicRoomWithRank(d1, joined.row, joined.playerId, sessionUser.id), playerId: joined.playerId });
      }

      const created = await createWaitingRoom(d1, game, size, "random", sessionUser, "ranked");
      await d1.prepare("INSERT INTO ranked_queue (user_id, room_id, player_id, season_id, game, board_size, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(sessionUser.id, created.row.id, created.playerId, seasonId, game, size, profile.rating, now, now).run();
      await recordMatchEvent(d1, { roomId: created.row.id, requestId, type: "room_created", actorUserId: sessionUser.id, actorPlayerId: created.playerId, roomVersion: created.row.version, details: { game, mode: "ranked" } });
      return Response.json({ room: await publicRoomWithRank(d1, created.row, created.playerId, sessionUser.id), playerId: created.playerId }, { status: 201 });
    }

    if (payload.type === "create" || payload.type === "matchmake") {
      if (!payload.game || !["go", "gomoku", "reversi"].includes(payload.game)) return jsonError("invalid_game", "当前游戏不支持双人对局", 400, requestId);
      const size = normalizedSize(payload.game, payload.size);
      if (payload.type === "matchmake" && !await featureEnabled(d1, "public_matchmaking_enabled")) return jsonError("matchmaking_disabled", "快速匹配暂时关闭", 503, requestId);

      if (payload.type === "create") {
        const colorPreference: ColorPreference = payload.game === "reversi" ? "black" : ["black", "white", "random"].includes(payload.colorPreference ?? "black") ? payload.colorPreference ?? "black" : "black";
        const requestedClock = payload.clockMode !== undefined || payload.turnSeconds !== undefined || payload.clockMinutes !== undefined;
        const clockMode: MatchClockMode = payload.clockMode ?? "per_move";
        let clockConfig: MatchClockConfig | undefined;
        if (requestedClock && clockMode === "per_move") {
          const turnSeconds = payload.turnSeconds ?? (payload.clockMinutes ? payload.clockMinutes * 60 : undefined);
          if (!Number.isInteger(turnSeconds) || (turnSeconds ?? 0) < 5 || (turnSeconds ?? 0) > 600) {
            return jsonError("invalid_clock", "每手用时需要设置为 5 至 600 秒", 400, requestId);
          }
          clockConfig = { mode: "per_move", initialMs: (turnSeconds as number) * 1000 };
        } else if (requestedClock && clockMode === "total") {
          const totalMinutes = payload.totalMinutes ?? 20;
          if (!Number.isInteger(totalMinutes) || totalMinutes < 1 || totalMinutes > 180) {
            return jsonError("invalid_clock", "双方总用时需要设置为 1 至 180 分钟", 400, requestId);
          }
          clockConfig = { mode: "total", initialMs: totalMinutes * 60_000 };
        } else if (requestedClock && clockMode === "byoyomi") {
          if (payload.game !== "go") return jsonError("invalid_clock_mode", "读秒规则仅适用于围棋", 400, requestId);
          const totalMinutes = payload.totalMinutes ?? 20;
          const byoYomiSeconds = payload.byoYomiSeconds ?? 30;
          const periods = payload.byoYomiPeriods ?? 3;
          if (!Number.isInteger(totalMinutes) || totalMinutes < 1 || totalMinutes > 180 || !Number.isInteger(byoYomiSeconds) || byoYomiSeconds < 10 || byoYomiSeconds > 120 || !Number.isInteger(periods) || periods < 1 || periods > 10) {
            return jsonError("invalid_clock", "读秒需要设置 1 至 180 分钟主时间、10 至 120 秒和 1 至 10 次读秒", 400, requestId);
          }
          clockConfig = { mode: "byoyomi", initialMs: totalMinutes * 60_000, byoYomiMs: byoYomiSeconds * 1000, periods };
        }
        const spectatorEnabled = await featureEnabled(d1, "spectating_enabled");
        const spectatorPolicy: SpectatorPolicy = spectatorEnabled && ["off", "friends", "public"].includes(payload.spectatorPolicy ?? "off") ? payload.spectatorPolicy ?? "off" : "off";
        const created = await createWaitingRoom(d1, payload.game, size, colorPreference, sessionUser, "private", clockConfig, payload.forbiddenMoves === true, spectatorPolicy);
        await recordMatchEvent(d1, { roomId: created.row.id, requestId, type: "room_created", actorUserId: sessionUser.id, actorPlayerId: created.playerId, roomVersion: created.row.version, details: { game: payload.game, mode: "private", clockConfig: clockConfig ?? null } });
        return Response.json({ room: publicRoom(created.row, created.playerId), playerId: created.playerId }, { status: 201 });
      }

      const queueKey = `${payload.game}:${size}`;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const queued = await d1.prepare("SELECT q.queue_key, r.* FROM matchmaking_queue q JOIN game_rooms r ON r.id = q.room_id WHERE q.queue_key = ?").bind(queueKey).first<QueueRow>();
        if (queued) {
          if (queued.updated_at < Date.now() - 15000) {
            await d1.prepare("DELETE FROM matchmaking_queue WHERE queue_key = ? AND room_id = ?").bind(queueKey, queued.id).run();
            await d1.prepare("DELETE FROM game_rooms WHERE id = ? AND white_player IS NULL").bind(queued.id).run();
            continue;
          }
          if (queued.host_user_id === sessionUser.id) {
            return Response.json({ room: publicRoom(queued, queued.black_player), playerId: queued.black_player });
          }
          const joined = await claimWaitingRoom(d1, queued, sessionUser);
          await d1.prepare("DELETE FROM matchmaking_queue WHERE queue_key = ? AND room_id = ?").bind(queueKey, queued.id).run();
          if (joined) {
            await recordMatchEvent(d1, { roomId: joined.row.id, requestId, type: "room_joined", actorUserId: sessionUser.id, actorPlayerId: joined.playerId, roomVersion: joined.row.version, details: { game: payload.game, mode: "matchmaking" } });
            return Response.json({ room: publicRoom(joined.row, joined.playerId), playerId: joined.playerId });
          }
          continue;
        }

        const created = await createWaitingRoom(d1, payload.game, size, "random", sessionUser, "matchmaking");
        const queuedResult = await d1.prepare("INSERT OR IGNORE INTO matchmaking_queue (queue_key, room_id, created_at) VALUES (?, ?, ?)").bind(queueKey, created.row.id, Date.now()).run();
        if (queuedResult.meta.changes) {
          await recordMatchEvent(d1, { roomId: created.row.id, requestId, type: "room_created", actorUserId: sessionUser.id, actorPlayerId: created.playerId, roomVersion: created.row.version, details: { game: payload.game, mode: "matchmaking" } });
          return Response.json({ room: publicRoom(created.row, created.playerId), playerId: created.playerId }, { status: 201 });
        }
        await d1.prepare("DELETE FROM game_rooms WHERE id = ? AND white_player IS NULL").bind(created.row.id).run();
      }
      return jsonError("matchmaking_busy", "匹配队列正在更新，请再试一次", 409, requestId);
    }

    const id = payload.roomId?.trim().toUpperCase();
    if (!id) return jsonError("missing_room", "请输入邀请码", 400, requestId);
    let row = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>();
    if (!row) return jsonError("room_not_found", "没有找到这个对局", 404, requestId);

    if (payload.type === "join") {
      if (row.host_user_id === sessionUser.id) return jsonError("cannot_join_own_room", "不能加入自己创建的房间，请使用另一个账号测试", 409, requestId);
      if ((row.mode ?? "private") !== "private") return jsonError("not_private_room", "这个对局不能通过邀请码加入", 409, requestId);
      if (row.white_player) return jsonError("room_full", "这个房间已经满员", 409, requestId);
      const joined = await claimWaitingRoom(d1, row, sessionUser);
      if (!joined) return jsonError("room_full", "这个房间刚刚被其他玩家加入", 409, requestId);
      const now = Date.now();
      await d1.prepare("UPDATE game_invites SET status = CASE WHEN invitee_id = ? THEN 'accepted' ELSE 'cancelled' END, updated_at = ? WHERE room_id = ? AND status = 'pending'")
        .bind(sessionUser.id, now, id).run();
      await recordMatchEvent(d1, { roomId: id, requestId, type: "room_joined", actorUserId: sessionUser.id, actorPlayerId: joined.playerId, roomVersion: joined.row.version, details: { game: joined.row.game, mode: "private" } });
      return Response.json({ room: publicRoom(joined.row, joined.playerId), playerId: joined.playerId });
    }

    row = await resolveMatchTimeout(d1, row, requestId);

    if (payload.type === "spectatorConsent") {
      if (!await featureEnabled(d1, "spectating_enabled")) return jsonError("spectating_disabled", "观战系统暂时关闭", 503, requestId);
      if ((row.mode ?? "private") !== "matchmaking") return jsonError("spectator_consent_unavailable", "只有快速匹配需要双方确认观战", 409, requestId);
      const authenticatedPlayerId = playerIdForUser(row, sessionUser.id) ?? "";
      const role = roleFor(row, authenticatedPlayerId);
      if (!role || !row.white_player) return jsonError("not_a_player", "你不是这个匹配对局的玩家", 403, requestId);
      const state = parseState(row);
      const consentSet = new Set(state.spectatorConsents ?? []);
      if (payload.enabled === false) consentSet.delete(role);
      else consentSet.add(role);
      const spectatorConsents = [...consentSet] as MatchPlayer[];
      const policy: SpectatorPolicy = spectatorConsents.includes("black") && spectatorConsents.includes("white") ? "public" : "off";
      const next = { ...state, spectatorConsents, notice: policy === "public" ? "双方已同意开放观战" : payload.enabled === false ? `${role === "black" ? "黑方" : "白方"}关闭了观战同意` : `${role === "black" ? "黑方" : "白方"}同意开放观战` };
      const result = await d1.prepare("UPDATE game_rooms SET spectator_policy = ?, state = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
        .bind(policy, JSON.stringify(next), Date.now(), id, row.version).run();
      if (!result.meta.changes) return jsonError("version_conflict", "房间状态刚刚更新，请重试", 409, requestId);
      const updated = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>() as RoomRow;
      await notifyRoom(id, updated.version);
      return Response.json({ room: publicRoom(updated, authenticatedPlayerId) });
    }

    if (payload.type === "cancelMatchmaking") {
      const authenticatedPlayerId = playerIdForUser(row, sessionUser.id);
      const playerRole = roleFor(row, authenticatedPlayerId);
      const ownsWaitingRoom = !row.white_player && row.black_player === authenticatedPlayerId;
      if ((row.mode ?? "private") === "ranked") {
        if (!ownsWaitingRoom || !row.host_user_id || row.host_user_id !== sessionUser.id) return jsonError("cannot_cancel", "无法取消这个排位匹配", 403, requestId);
        await d1.prepare("DELETE FROM ranked_queue WHERE room_id = ? AND user_id = ?").bind(id, sessionUser.id).run();
        await d1.prepare("DELETE FROM game_rooms WHERE id = ? AND white_player IS NULL").bind(id).run();
        return Response.json({ cancelled: true });
      }
      if ((row.mode ?? "private") !== "matchmaking" || (!playerRole && !ownsWaitingRoom)) return jsonError("cannot_cancel", "无法取消这个匹配", 403, requestId);
      if (row.white_player) return Response.json({ room: publicRoom(row, authenticatedPlayerId), cancelled: false });
      await d1.prepare("DELETE FROM matchmaking_queue WHERE room_id = ?").bind(id).run();
      const result = await d1.prepare("DELETE FROM game_rooms WHERE id = ? AND black_player = ? AND white_player IS NULL").bind(id, authenticatedPlayerId).run();
      if (result.meta.changes) return Response.json({ cancelled: true });
      const updated = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>();
      return Response.json({ room: updated ? publicRoom(updated, authenticatedPlayerId) : null, cancelled: !updated });
    }

    if (payload.type === "leave") {
      const playerId = playerIdForUser(row, sessionUser.id) ?? "";
      if ((row.mode ?? "private") === "ai") {
        if (!playerId) return jsonError("not_a_player", "你不是这个人机对局的玩家", 403, requestId);
        const role = roleFor(row, playerId);
        const current = parseState(row);
        if (role && ["playing", "scoring"].includes(current.status)) {
          const next = applyMatchAction(current, role, { type: "resign" });
          const now = Date.now();
          await archiveFinishedMatch(d1, { ...row, version: row.version + 1, updated_at: now }, next);
        }
        await recordMatchEvent(d1, { roomId: id, requestId, type: "room_left", actorUserId: sessionUser.id, actorPlayerId: playerId, roomVersion: row.version, details: { mode: "ai" } });
        await d1.prepare("DELETE FROM game_room_presence WHERE room_id = ?").bind(id).run();
        await d1.prepare("DELETE FROM game_rooms WHERE id = ?").bind(id).run();
        return Response.json({ left: true });
      }
      if (!row.white_player && row.black_player === playerId) {
        await recordMatchEvent(d1, { roomId: id, requestId, type: "room_closed", actorUserId: sessionUser.id, actorPlayerId: playerId, roomVersion: row.version, details: { reason: "host_left_waiting_room" } });
        await notifyRoom(id, row.version, "room_closed");
        await d1.prepare("DELETE FROM matchmaking_queue WHERE room_id = ?").bind(id).run();
        await d1.prepare("DELETE FROM ranked_queue WHERE room_id = ?").bind(id).run();
        await d1.prepare("UPDATE game_invites SET status = 'cancelled', updated_at = ? WHERE room_id = ? AND status = 'pending'").bind(Date.now(), id).run();
        await d1.prepare("DELETE FROM game_rooms WHERE id = ? AND black_player = ? AND white_player IS NULL").bind(id, playerId).run();
        return Response.json({ left: true });
      }
      const role = roleFor(row, playerId);
      if (!role) return jsonError("not_a_player", "你不是这个对局的玩家", 403, requestId);
      const state = parseState(row);
      if (state.status === "ended") return Response.json({ left: true });
      const winner: MatchPlayer = role === "black" ? "white" : "black";
      const next: MatchState = { ...state, status: "ended", winner, departedPlayer: role, undoRequest: null, notice: `${role === "black" ? "黑方" : "白方"}逃跑，${winner === "black" ? "黑方" : "白方"}获胜` };
      const result = await d1.prepare("UPDATE game_rooms SET state = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(JSON.stringify(next), Date.now(), id, row.version).run();
      if (!result.meta.changes) return jsonError("version_conflict", "房间状态刚刚更新，请重试", 409, requestId);
      const updated = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>() as RoomRow;
      await recordMatchEvent(d1, { roomId: id, requestId, type: "room_left", actorUserId: sessionUser.id, actorPlayerId: playerId, roomVersion: updated.version, details: { reason: "departure", winner } });
      await settleAndArchiveMatch(d1, updated, next, { requestId, actorUserId: sessionUser.id, actorPlayerId: playerId });
      await notifyRoom(id, updated.version);
      return Response.json({ left: true });
    }

    if (payload.type === "aiMove") {
      if ((row.mode ?? "private") !== "ai") return jsonError("not_ai_room", "当前不是人机对局", 409, requestId);
      const playerId = playerIdForUser(row, sessionUser.id) ?? "";
      if (!playerId || !roleFor(row, playerId)) return jsonError("not_a_player", "你不是这个人机对局的玩家", 403, requestId);
      const current = parseState(row);
      const next = await advanceAi(current);
      if (next === current) return Response.json({ room: publicRoom(row, playerId) });
      const result = await d1.prepare("UPDATE game_rooms SET state = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(JSON.stringify(next), Date.now(), id, row.version).run();
      if (!result.meta.changes) return jsonError("version_conflict", "棋局刚刚更新，AI 将重新计算", 409, requestId);
      const updated = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>() as RoomRow;
      await settleAndArchiveMatch(d1, updated, next, { requestId, actorUserId: sessionUser.id, actorPlayerId: playerId });
      return Response.json({ room: publicRoom(updated, playerId) });
    }

    if (payload.type === "action") {
      const playerId = playerIdForUser(row, sessionUser.id) ?? "";
      const role = roleFor(row, playerId);
      if (!role) return jsonError("not_a_player", "你不是这个对局的玩家", 403, requestId);
      if (!row.white_player) return jsonError("waiting_for_opponent", "等待另一位玩家加入", 409, requestId);
      if (!payload.action) return jsonError("missing_action", "缺少棋局操作", 400, requestId);
      if ((row.mode ?? "private") === "ranked" && !["play", "pass", "markDead", "confirmScore", "resumeGo", "resign"].includes(payload.action.type)) return jsonError("ranked_action_forbidden", "排位对局不能悔棋或重开", 409, requestId);
      const actionId = normalizeActionId(payload.actionId);
      if (actionId) {
        const receipt = await findActionReceipt(d1, actionId, id, sessionUser.id);
        if (receipt) {
          if (!receipt.matchesRequest) return jsonError("action_id_conflict", "操作编号已经被使用，请重试", 409, requestId);
          const current = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>();
          if (!current) return jsonError("room_not_found", "没有找到这个对局", 404, requestId);
          return Response.json({ room: await publicRoomWithRank(d1, current, playerId, sessionUser.id), duplicate: true });
        }
      }
      const storedState = parseState(row);
      const currentState = storedState.clock ? projectMatchClock(storedState) : storedState;
      let next: MatchState;
      if ((row.mode ?? "private") === "ai" && payload.action.type === "requestUndo") next = undoAiRound(currentState);
      else if ((row.mode ?? "private") === "ai" && ["requestRematch", "reset"].includes(payload.action.type)) next = resetAiState(currentState);
      else if ((row.mode ?? "private") === "ai" && ["cancelUndo", "respondUndo", "cancelRematch", "respondRematch"].includes(payload.action.type)) {
        return jsonError("ai_action_unavailable", "人机对局不需要等待对手确认", 409, requestId);
      } else next = applyMatchAction(currentState, role, payload.action);
      const result = await d1.prepare("UPDATE game_rooms SET state = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(JSON.stringify(next), Date.now(), id, row.version).run();
      if (!result.meta.changes) return jsonError("version_conflict", "棋局刚刚更新，请重试这一步", 409, requestId);
      const updated = await d1.prepare("SELECT * FROM game_rooms WHERE id = ?").bind(id).first<RoomRow>();
      if (actionId && updated) {
        try {
          await saveActionReceipt(d1, actionId, id, sessionUser.id, updated.version);
        } catch (error) {
          await recordMatchEvent(d1, { roomId: id, requestId, type: "request_error", actorUserId: sessionUser.id, actorPlayerId: playerId, roomVersion: updated.version, details: { stage: "save_action_receipt", message: error instanceof Error ? error.message : String(error) } });
        }
      }
      await recordMatchEvent(d1, {
        roomId: id,
        requestId,
        type: "match_action",
        actorUserId: sessionUser.id,
        actorPlayerId: playerId,
        roomVersion: updated?.version,
        details: { action: payload.action.type, actionId },
      });
      await settleAndArchiveMatch(d1, updated as RoomRow, next, { requestId, actorUserId: sessionUser.id, actorPlayerId: playerId });
      await notifyRoom(id, updated?.version);
      return Response.json({ room: await publicRoomWithRank(d1, updated as RoomRow, playerId, sessionUser.id) });
    }

    return jsonError("invalid_request", "无法识别这个请求", 400, requestId);
  } catch (error) {
    await recordRequestError(requestId, "POST", error);
    return errorResponse(error, requestId);
  }
}
