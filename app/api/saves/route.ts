import { getD1 } from "../../../db";
import { ensureAuthSchema, getSessionUser } from "../../../lib/auth";
import { createMicosmGameFile, GameRecordFormatError, parseMicosmGameFile, type GameRecordMode, type GameRecordReason, type MicosmGameFile } from "../../../lib/game-record";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { defaultGameRecordTitle, ensureSavedGameSchema, MAX_CLOUD_SAVED_GAMES, pruneSavedGames, savedGameValues, type SavedGameRow } from "../../../lib/saved-games";
import type { MatchGame, MatchPlayer, MatchState, MatchWinner } from "../../../lib/match-engine";

type HistoryRow = {
  id: string;
  game: MatchGame;
  mode: GameRecordMode;
  board_size: number;
  black_user_id: string | null;
  white_user_id: string | null;
  black_name: string;
  white_name: string;
  winner: MatchWinner;
  reason: GameRecordReason;
  state: string;
  started_at: number;
  ended_at: number;
};

function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function savedRecord(row: SavedGameRow, includeFile = false) {
  const file = parseMicosmGameFile(JSON.parse(row.file_json));
  const record = file.record;
  const role = record.viewerRole;
  const opponentRole: MatchPlayer = role === "black" ? "white" : "black";
  return {
    id: row.id,
    sourceRecordId: row.source_record_id,
    title: row.title,
    game: record.game,
    mode: record.mode,
    boardSize: record.boardSize,
    role,
    opponent: { name: record.players[opponentRole], avatarUrl: null },
    players: record.players,
    winner: record.winner,
    result: record.winner === "draw" ? "draw" : record.winner === role ? "win" : "loss",
    reason: record.reason,
    moveCount: record.state.moves?.filter((move) => move.type !== "resumeGo").length ?? 0,
    finalScore: record.state.finalScore ?? null,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    savedAt: row.updated_at,
    ...(includeFile ? { state: record.state, file } : {}),
  };
}

async function saveFile(d1: ReturnType<typeof getD1>, userId: string, file: MicosmGameFile, sourceRecordId: string | null) {
  const values = savedGameValues(file);
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1.prepare(`INSERT INTO saved_game_records (
      id, user_id, source_record_id, title, game, mode, board_size, black_name, white_name,
      winner, reason, viewer_role, file_json, started_at, ended_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, source_record_id) DO UPDATE SET
      title = excluded.title, game = excluded.game, mode = excluded.mode, board_size = excluded.board_size,
      black_name = excluded.black_name, white_name = excluded.white_name, winner = excluded.winner,
      reason = excluded.reason, viewer_role = excluded.viewer_role, file_json = excluded.file_json,
      started_at = excluded.started_at, ended_at = excluded.ended_at, updated_at = excluded.updated_at`)
    .bind(
      id, userId, sourceRecordId, values.title, values.game, values.mode, values.boardSize,
      values.blackName, values.whiteName, values.winner, values.reason, values.viewerRole,
      values.fileJson, values.startedAt, values.endedAt, now, now,
    ).run();
  const row = sourceRecordId
    ? await d1.prepare("SELECT * FROM saved_game_records WHERE user_id = ? AND source_record_id = ?").bind(userId, sourceRecordId).first<SavedGameRow>()
    : await d1.prepare("SELECT * FROM saved_game_records WHERE id = ? AND user_id = ?").bind(id, userId).first<SavedGameRow>();
  if (!row) throw new Error("保存棋谱失败");
  const prunedIds = await pruneSavedGames(d1, userId);
  return { row, prunedIds };
}

export async function GET(request: Request) {
  try {
    const d1 = getD1();
    await ensureAuthSchema(d1);
    await ensureSavedGameSchema(d1);
    const user = await getSessionUser(request, d1);
    if (!user) return fail("auth_required", "请先登录", 401);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (id) {
      const row = await d1.prepare("SELECT * FROM saved_game_records WHERE id = ? AND user_id = ?").bind(id, user.id).first<SavedGameRow>();
      if (!row) return fail("saved_game_not_found", "没有找到这份云端棋谱", 404);
      return Response.json({ record: savedRecord(row, true) });
    }
    const rows = await d1.prepare(`SELECT * FROM saved_game_records WHERE user_id = ?
      ORDER BY updated_at DESC, created_at DESC LIMIT ?`).bind(user.id, MAX_CLOUD_SAVED_GAMES).all<SavedGameRow>();
    return Response.json({ records: rows.results.map((row) => savedRecord(row)), limit: MAX_CLOUD_SAVED_GAMES });
  } catch (error) {
    return fail("server_error", error instanceof Error ? error.message : "云端棋谱暂时不可用", 500);
  }
}

export async function POST(request: Request) {
  try {
    const d1 = getD1();
    await ensureAppSchema(d1);
    const user = await getSessionUser(request, d1);
    if (!user) return fail("auth_required", "请先登录", 401);
    const payload = await request.json() as { type?: "archive" | "import"; recordId?: string; file?: unknown };
    let file: MicosmGameFile;
    let sourceRecordId: string | null = null;
    if (payload.type === "archive") {
      sourceRecordId = payload.recordId?.trim() || null;
      if (!sourceRecordId) return fail("record_required", "请选择需要保存的对局", 400);
      const row = await d1.prepare("SELECT * FROM match_records WHERE id = ? AND (black_user_id = ? OR white_user_id = ?)")
        .bind(sourceRecordId, user.id, user.id).first<HistoryRow>();
      if (!row) return fail("record_not_found", "没有找到这盘对局", 404);
      const viewerRole: MatchPlayer = row.black_user_id === user.id ? "black" : "white";
      const state = JSON.parse(row.state) as MatchState;
      file = createMicosmGameFile({
        title: defaultGameRecordTitle({ game: row.game, players: { black: row.black_name, white: row.white_name } }),
        game: row.game,
        mode: row.mode,
        boardSize: row.board_size,
        viewerRole,
        players: { black: row.black_name, white: row.white_name },
        winner: row.winner,
        reason: row.reason,
        state,
        startedAt: row.started_at,
        endedAt: row.ended_at,
      });
    } else if (payload.type === "import") {
      file = parseMicosmGameFile(payload.file);
    } else {
      return fail("invalid_save_type", "无法识别这个保存方式", 400);
    }

    const { row, prunedIds } = await saveFile(d1, user.id, file, sourceRecordId);
    return Response.json({ record: savedRecord(row), pruned: prunedIds.length, limit: MAX_CLOUD_SAVED_GAMES }, { status: 201 });
  } catch (error) {
    if (error instanceof GameRecordFormatError) return fail("invalid_game_file", error.message, 400);
    return fail("server_error", error instanceof Error ? error.message : "保存棋谱失败", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const d1 = getD1();
    await ensureAuthSchema(d1);
    await ensureSavedGameSchema(d1);
    const user = await getSessionUser(request, d1);
    if (!user) return fail("auth_required", "请先登录", 401);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return fail("saved_game_required", "请选择需要删除的棋谱", 400);
    const result = await d1.prepare("DELETE FROM saved_game_records WHERE id = ? AND user_id = ?").bind(id, user.id).run() as { meta?: { changes?: number } };
    if (!result.meta?.changes) return fail("saved_game_not_found", "没有找到这份云端棋谱", 404);
    return Response.json({ ok: true });
  } catch (error) {
    return fail("server_error", error instanceof Error ? error.message : "删除棋谱失败", 500);
  }
}
