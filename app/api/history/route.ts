import { getD1 } from "../../../db";
import { avatarUrlForKey, ensureAuthSchema, getSessionUser } from "../../../lib/auth";
import { ensureMatchHistorySchema } from "../../../lib/match-history";
import type { MatchGame, MatchPlayer, MatchState, MatchWinner } from "../../../lib/match-engine";

type HistoryRow = {
  id: string;
  room_id: string;
  game: MatchGame;
  mode: "private" | "matchmaking" | "ranked" | "ai";
  board_size: number;
  black_user_id: string | null;
  white_user_id: string | null;
  black_name: string;
  white_name: string;
  black_avatar: string | null;
  white_avatar: string | null;
  winner: MatchWinner;
  reason: "win" | "draw" | "score" | "resign" | "departure" | "timeout";
  state: string;
  started_at: number;
  ended_at: number;
};

function publicRecord(row: HistoryRow, userId: string, includeState = false) {
  const role: MatchPlayer = row.black_user_id === userId ? "black" : "white";
  const opponentRole: MatchPlayer = role === "black" ? "white" : "black";
  const state = JSON.parse(row.state) as MatchState;
  const result = row.winner === "draw" ? "draw" : row.winner === role ? "win" : "loss";
  return {
    id: row.id,
    roomId: row.room_id,
    game: row.game,
    mode: row.mode,
    boardSize: row.board_size,
    role,
    opponent: {
      name: opponentRole === "black" ? row.black_name : row.white_name,
      avatarUrl: avatarUrlForKey(opponentRole === "black" ? row.black_avatar : row.white_avatar),
    },
    players: { black: row.black_name, white: row.white_name },
    winner: row.winner,
    result,
    reason: row.reason,
    moveCount: state.moves?.filter((move) => move.type !== "resumeGo").length ?? 0,
    finalScore: state.finalScore ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    ...(includeState ? { state } : {}),
  };
}

export async function GET(request: Request) {
  try {
    const d1 = getD1();
    await ensureAuthSchema(d1);
    await ensureMatchHistorySchema(d1);
    const user = await getSessionUser(request, d1);
    if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (id) {
      const row = await d1.prepare("SELECT * FROM match_records WHERE id = ? AND (black_user_id = ? OR white_user_id = ?)")
        .bind(id, user.id, user.id).first<HistoryRow>();
      if (!row) return Response.json({ error: { code: "record_not_found", message: "没有找到这盘棋" } }, { status: 404 });
      return Response.json({ record: publicRecord(row, user.id, true) });
    }
    const rows = await d1.prepare(`SELECT * FROM match_records
      WHERE black_user_id = ? OR white_user_id = ?
      ORDER BY ended_at DESC LIMIT 60`).bind(user.id, user.id).all<HistoryRow>();
    return Response.json({ records: rows.results.map((row) => publicRecord(row, user.id)) });
  } catch (error) {
    return Response.json({ error: { code: "server_error", message: error instanceof Error ? error.message : "对局记录暂时不可用" } }, { status: 500 });
  }
}
