import { env } from "cloudflare:workers";
import { getD1 } from "../../../../db";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../lib/admin";
import { ensureAppSchema } from "../../../../lib/database-migrations";
import { notifyPlatform } from "../../../../lib/platform-realtime";
import { publicRankSeason, rankLabel, resolveRankSeason } from "../../../../lib/rank";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "ranking.read");
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const game = url.searchParams.get("game") === "gomoku" ? "gomoku" : "go";
  const season = await resolveRankSeason(d1);
  const query = url.searchParams.get("q")?.normalize("NFKC").trim().slice(0, 40) ?? "";
  const search = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const profiles = await d1.prepare(`SELECT rp.user_id, rp.rating, rp.peak_rating, rp.wins, rp.losses, rp.draws, rp.streak, rp.matches, rp.updated_at,
      u.public_id, u.display_name
    FROM rank_profiles rp JOIN users u ON u.id = rp.user_id
    WHERE rp.game = ? AND (? = '' OR u.display_name LIKE ? ESCAPE '\\' OR u.public_id LIKE ? ESCAPE '\\')
    ORDER BY rp.rating DESC, rp.wins DESC LIMIT 80`).bind(game, query, search, search)
    .all<{ user_id: string; rating: number; peak_rating: number; wins: number; losses: number; draws: number; streak: number; matches: number; updated_at: number; public_id: string | null; display_name: string }>();
  const matches = await d1.prepare(`SELECT rm.*, bu.display_name AS black_name, wu.display_name AS white_name
    FROM rank_matches rm JOIN users bu ON bu.id = rm.black_user_id JOIN users wu ON wu.id = rm.white_user_id
    WHERE rm.game = ? AND (? = '' OR rm.season_id = ?) AND (? = '' OR rm.room_id LIKE ? ESCAPE '\\' OR bu.display_name LIKE ? ESCAPE '\\' OR wu.display_name LIKE ? ESCAPE '\\')
    ORDER BY COALESCE(rm.settled_at, rm.created_at) DESC LIMIT 60`).bind(game, season?.id ?? "", season?.id ?? "", query, search, search, search)
    .all<{ room_id: string; game: string; black_user_id: string; white_user_id: string; black_name: string; white_name: string; black_rating_before: number; white_rating_before: number; black_delta: number | null; white_delta: number | null; black_rating_after: number | null; white_rating_after: number | null; result: string | null; status: string; created_at: number; settled_at: number | null }>();
  const corrections = await d1.prepare(`SELECT rc.*, u.display_name AS admin_name FROM rank_corrections rc JOIN users u ON u.id = rc.admin_user_id
    WHERE rc.game = ? ORDER BY rc.created_at DESC LIMIT 30`).bind(game)
    .all<{ id: string; room_id: string; black_delta: number; white_delta: number; reason: string; admin_name: string; created_at: number }>();
  return Response.json({
    game,
    season: season ? publicRankSeason(season) : null,
    profiles: profiles.results.map((row, index) => ({ position: index + 1, userId: row.user_id, publicId: row.public_id ?? "", displayName: row.display_name, rating: row.rating, peakRating: row.peak_rating, label: rankLabel(row.rating), wins: row.wins, losses: row.losses, draws: row.draws, streak: row.streak, matches: row.matches, updatedAt: row.updated_at })),
    matches: matches.results.map((row) => ({ roomId: row.room_id, game: row.game, players: { black: row.black_name, white: row.white_name }, ratings: { blackBefore: row.black_rating_before, whiteBefore: row.white_rating_before, blackDelta: row.black_delta, whiteDelta: row.white_delta, blackAfter: row.black_rating_after, whiteAfter: row.white_rating_after }, result: row.result, status: row.status, createdAt: row.created_at, settledAt: row.settled_at })),
    corrections: corrections.results.map((row) => ({ id: row.id, roomId: row.room_id, blackDelta: row.black_delta, whiteDelta: row.white_delta, reason: row.reason, adminName: row.admin_name, createdAt: row.created_at })),
  });
}

export async function POST(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "ranking.write");
  if (auth.response || !auth.user || !auth.role) return auth.response ?? fail("admin_required", "需要管理员权限", 403);
  const payload = await request.json() as { action?: string; roomId?: string; reason?: string };
  const roomId = payload.roomId?.trim().slice(0, 80) ?? "";
  const reason = payload.reason?.trim().slice(0, 240) ?? "";
  if (payload.action !== "reverse_settlement") return fail("invalid_action", "无法识别这个排位操作", 400);
  if (!roomId) return fail("missing_room", "缺少排位房间号", 400);
  if (!reason) return fail("reason_required", "请填写纠错原因", 400);
  const row = await d1.prepare("SELECT * FROM rank_matches WHERE room_id = ?").bind(roomId).first<{
    room_id: string; season_id: string | null; game: string; black_user_id: string; white_user_id: string; black_delta: number | null; white_delta: number | null; result: string | null; status: string;
  }>();
  if (!row) return fail("rank_match_not_found", "没有找到这场排位结算", 404);
  const season = row.season_id ? await d1.prepare("SELECT status FROM rank_seasons WHERE id = ?").bind(row.season_id).first<{ status: string }>() : null;
  if (!season || !["active", "closing"].includes(season.status)) return fail("season_immutable", "已封存赛季不能再撤销结算，以免影响后续赛季积分", 409);
  if (row.status !== "settled" || row.black_delta === null || row.white_delta === null) return fail("settlement_not_reversible", "这场结算已经撤销或尚未完成", 409);
  const exists = await d1.prepare("SELECT id FROM rank_corrections WHERE room_id = ?").bind(roomId).first<{ id: string }>();
  if (exists) return fail("settlement_already_reversed", "这场结算已经撤销", 409);
  const now = Date.now();
  const blackWon = row.result === "black";
  const whiteWon = row.result === "white";
  const draw = row.result === "draw";
  await d1.prepare(`UPDATE rank_profiles SET rating = MAX(0, rating - ?), wins = MAX(0, wins - ?), losses = MAX(0, losses - ?), draws = MAX(0, draws - ?), matches = MAX(0, matches - 1), streak = 0, updated_at = ? WHERE user_id = ? AND game = ?`)
    .bind(row.black_delta, blackWon ? 1 : 0, whiteWon ? 1 : 0, draw ? 1 : 0, now, row.black_user_id, row.game).run();
  await d1.prepare(`UPDATE rank_profiles SET rating = MAX(0, rating - ?), wins = MAX(0, wins - ?), losses = MAX(0, losses - ?), draws = MAX(0, draws - ?), matches = MAX(0, matches - 1), streak = 0, updated_at = ? WHERE user_id = ? AND game = ?`)
    .bind(row.white_delta, whiteWon ? 1 : 0, blackWon ? 1 : 0, draw ? 1 : 0, now, row.white_user_id, row.game).run();
  await d1.prepare("UPDATE rank_matches SET status = 'reversed' WHERE room_id = ? AND status = 'settled'").bind(roomId).run();
  await d1.prepare(`INSERT INTO rank_corrections (id, room_id, game, black_user_id, white_user_id, black_delta, white_delta, reason, admin_user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), roomId, row.game, row.black_user_id, row.white_user_id, -row.black_delta, -row.white_delta, reason, auth.user.id, now).run();
  await writeAdminAudit(d1, { requestId: request.headers.get("x-request-id") ?? undefined, adminUserId: auth.user.id, adminRole: auth.role, module: "ranking", action: "reverse_settlement", targetType: "room", targetId: roomId, reason, before: { status: row.status, blackDelta: row.black_delta, whiteDelta: row.white_delta }, after: { status: "reversed", blackDelta: -row.black_delta, whiteDelta: -row.white_delta } });
  await notifyPlatform({ type: "lobby_updated", userIds: [row.black_user_id, row.white_user_id] });
  return Response.json({ ok: true, roomId });
}
