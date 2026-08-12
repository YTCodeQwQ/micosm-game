import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db";
import { configuredAdminIds, requireAdminPermission, writeAdminAudit } from "../../../../../lib/admin";
import { ensureAppSchema } from "../../../../../lib/database-migrations";
import { notifyPlatform } from "../../../../../lib/platform-realtime";
import {
  closeRankSeasonQueue, publicRankSeason, resolveRankSeason, type RankSeasonRow,
} from "../../../../../lib/rank";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

function fail(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function seasonCode(now = new Date()) {
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `S${date}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

function normalizedSeasonInput(payload: Record<string, unknown>, existing?: RankSeasonRow) {
  const name = String(payload.name ?? existing?.name ?? "").normalize("NFKC").trim().slice(0, 30);
  const summary = String(payload.summary ?? existing?.summary ?? "").normalize("NFKC").trim().slice(0, 180);
  const startsAt = Number(payload.startsAt ?? existing?.starts_at ?? Date.now());
  const endsAt = Number(payload.endsAt ?? existing?.ends_at ?? Date.now() + 90 * 24 * 60 * 60 * 1000);
  const carryPercent = Number(payload.carryPercent ?? existing?.carry_percent ?? 0);
  const goEnabled = payload.goEnabled === undefined ? Boolean(existing?.go_enabled ?? true) : payload.goEnabled === true;
  const gomokuEnabled = payload.gomokuEnabled === undefined ? Boolean(existing?.gomoku_enabled ?? true) : payload.gomokuEnabled === true;
  if (name.length < 2) throw new Error("赛季名称需要 2 至 30 个字符");
  if (!Number.isSafeInteger(startsAt) || !Number.isSafeInteger(endsAt) || endsAt <= startsAt) throw new Error("赛季结束时间必须晚于开始时间");
  if (endsAt - startsAt < 24 * 60 * 60 * 1000) throw new Error("赛季至少需要持续 24 小时");
  if (!Number.isInteger(carryPercent) || carryPercent < 0 || carryPercent > 100) throw new Error("积分继承比例需要设置为 0 至 100");
  if (!goEnabled && !gomokuEnabled) throw new Error("至少需要开放一种排位棋类");
  return { name, summary, startsAt, endsAt, carryPercent, goEnabled, gomokuEnabled };
}

type SeasonSummaryRow = RankSeasonRow & {
  match_count: number;
  active_match_count: number;
  queued_count: number;
  standing_count: number;
};

async function seasonList(d1: D1Database) {
  await resolveRankSeason(d1);
  const rows = await d1.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM rank_matches rm WHERE rm.season_id = s.id) AS match_count,
      (SELECT COUNT(*) FROM rank_matches rm WHERE rm.season_id = s.id AND rm.status IN ('active', 'settling')) AS active_match_count,
      (SELECT COUNT(*) FROM ranked_queue rq WHERE rq.season_id = s.id) AS queued_count,
      (SELECT COUNT(*) FROM rank_season_standings rss WHERE rss.season_id = s.id) AS standing_count
    FROM rank_seasons s
    ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'closing' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
      COALESCE(s.activated_at, s.starts_at) DESC`).all<SeasonSummaryRow>();
  return rows.results.map((row) => ({
    ...publicRankSeason(row),
    counts: {
      matches: Number(row.match_count ?? 0),
      activeMatches: Number(row.active_match_count ?? 0),
      queued: Number(row.queued_count ?? 0),
      standings: Number(row.standing_count ?? 0),
    },
  }));
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "ranking.read");
  if (auth.response) return auth.response;
  const seasons = await seasonList(d1);
  return Response.json({ seasons, current: seasons.find((season) => ["active", "closing"].includes(season.status)) ?? null, canManage: auth.role === "super_admin" });
}

export async function POST(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const auth = await requireAdminPermission(request, d1, adminIds(), "ranking.seasons.write");
  if (auth.response || !auth.user || !auth.role) return auth.response ?? fail("super_admin_required", "需要超级管理员权限", 403);
  const payload = await request.json() as Record<string, unknown>;
  const action = String(payload.action ?? "");
  const seasonId = String(payload.seasonId ?? "").trim().slice(0, 80);
  const reason = String(payload.reason ?? "").normalize("NFKC").trim().slice(0, 240);
  const now = Date.now();

  try {
    if (action === "create") {
      const input = normalizedSeasonInput(payload);
      const id = crypto.randomUUID();
      const code = seasonCode();
      await d1.prepare(`INSERT INTO rank_seasons
        (id, code, name, summary, status, starts_at, ends_at, go_enabled, gomoku_enabled, carry_percent, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, code, input.name, input.summary, input.startsAt, input.endsAt, input.goEnabled ? 1 : 0, input.gomokuEnabled ? 1 : 0, input.carryPercent, auth.user.id, now, now).run();
      await writeAdminAudit(d1, { requestId: request.headers.get("x-request-id") ?? undefined, adminUserId: auth.user.id, adminRole: auth.role, module: "ranking", action: "season_create", targetType: "rank_season", targetId: id, reason, after: { code, ...input } });
      return Response.json({ ok: true, seasonId: id, seasons: await seasonList(d1) }, { status: 201 });
    }

    if (!seasonId) return fail("season_required", "请选择需要管理的赛季", 400);
    const season = await d1.prepare("SELECT * FROM rank_seasons WHERE id = ?").bind(seasonId).first<RankSeasonRow>();
    if (!season) return fail("season_not_found", "没有找到这个排位赛季", 404);

    if (action === "update") {
      if (season.status === "closed") return fail("season_immutable", "已封存赛季不能再修改", 409);
      const input = normalizedSeasonInput(payload, season);
      if (season.status !== "draft" && input.startsAt !== season.starts_at) return fail("season_started", "赛季开始后不能修改开始时间", 409);
      if (season.status === "closing" && input.endsAt !== season.ends_at) return fail("season_closing", "停止报名后不能再修改结束时间", 409);
      const carryPercent = season.status === "draft" ? input.carryPercent : season.carry_percent;
      await d1.prepare(`UPDATE rank_seasons SET name = ?, summary = ?, starts_at = ?, ends_at = ?, go_enabled = ?, gomoku_enabled = ?, carry_percent = ?, updated_at = ? WHERE id = ? AND status != 'closed'`)
        .bind(input.name, input.summary, input.startsAt, input.endsAt, input.goEnabled ? 1 : 0, input.gomokuEnabled ? 1 : 0, carryPercent, now, season.id).run();
      if (season.status === "active" && season.go_enabled && !input.goEnabled) await closeRankSeasonQueue(d1, season.id, "go");
      if (season.status === "active" && season.gomoku_enabled && !input.gomokuEnabled) await closeRankSeasonQueue(d1, season.id, "gomoku");
      await writeAdminAudit(d1, { requestId: request.headers.get("x-request-id") ?? undefined, adminUserId: auth.user.id, adminRole: auth.role, module: "ranking", action: "season_update", targetType: "rank_season", targetId: season.id, reason, before: publicRankSeason(season), after: { ...input, carryPercent } });
    } else if (action === "activate") {
      if (!reason) return fail("reason_required", "请填写激活赛季的原因", 400);
      if (season.status !== "draft") return fail("season_not_draft", "只有草稿赛季可以激活", 409);
      if (season.ends_at <= now) return fail("season_expired", "赛季结束时间已经过去，请先修改时间", 409);
      const current = await d1.prepare("SELECT id, name FROM rank_seasons WHERE status IN ('active', 'closing') LIMIT 1").first<{ id: string; name: string }>();
      if (current) return fail("season_current_exists", `请先封存当前赛季“${current.name}”`, 409);
      await d1.batch([
        d1.prepare("UPDATE rank_seasons SET status = 'active', activated_by = ?, activated_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'").bind(auth.user.id, now, now, season.id),
        d1.prepare(`UPDATE rank_profiles SET
          rating = CAST(ROUND(rating * ? / 100.0) AS INTEGER),
          peak_rating = CAST(ROUND(rating * ? / 100.0) AS INTEGER),
          wins = 0, losses = 0, draws = 0, streak = 0, matches = 0, updated_at = ?`)
          .bind(season.carry_percent, season.carry_percent, now),
        d1.prepare("DELETE FROM ranked_queue"),
        d1.prepare("DELETE FROM game_rooms WHERE mode = 'ranked' AND white_player IS NULL"),
      ]);
      await writeAdminAudit(d1, { requestId: request.headers.get("x-request-id") ?? undefined, adminUserId: auth.user.id, adminRole: auth.role, module: "ranking", action: "season_activate", targetType: "rank_season", targetId: season.id, reason, before: { status: season.status }, after: { status: "active", carryPercent: season.carry_percent } });
    } else if (action === "begin_close") {
      if (!reason) return fail("reason_required", "请填写停止报名的原因", 400);
      if (season.status !== "active") return fail("season_not_active", "只有进行中的赛季可以停止报名", 409);
      await d1.prepare("UPDATE rank_seasons SET status = 'closing', updated_at = ? WHERE id = ? AND status = 'active'").bind(now, season.id).run();
      await closeRankSeasonQueue(d1, season.id);
      await writeAdminAudit(d1, { requestId: request.headers.get("x-request-id") ?? undefined, adminUserId: auth.user.id, adminRole: auth.role, module: "ranking", action: "season_stop_entry", targetType: "rank_season", targetId: season.id, reason, before: { status: season.status }, after: { status: "closing" } });
    } else if (action === "finalize") {
      if (!reason) return fail("reason_required", "请填写封存赛季的原因", 400);
      if (season.status !== "closing") return fail("season_not_closing", "赛季需要先停止报名", 409);
      const pending = await d1.prepare("SELECT COUNT(*) AS count FROM rank_matches WHERE season_id = ? AND status IN ('active', 'settling')").bind(season.id).first<{ count: number }>();
      if ((pending?.count ?? 0) > 0) return fail("season_matches_active", `还有 ${pending?.count ?? 0} 场排位尚未结算`, 409);
      await d1.batch([
        d1.prepare(`INSERT INTO rank_season_standings
          (season_id, user_id, game, position, rating, peak_rating, wins, losses, draws, streak, matches, snapshot_at)
          SELECT ?, user_id, game,
            ROW_NUMBER() OVER (PARTITION BY game ORDER BY rating DESC, wins DESC, updated_at ASC),
            rating, peak_rating, wins, losses, draws, streak, matches, ?
          FROM rank_profiles
          WHERE matches > 0 AND ((game = 'go' AND ? = 1) OR (game = 'gomoku' AND ? = 1))`)
          .bind(season.id, now, season.go_enabled ? 1 : 0, season.gomoku_enabled ? 1 : 0),
        d1.prepare("UPDATE rank_seasons SET status = 'closed', closed_by = ?, closed_at = ?, updated_at = ? WHERE id = ? AND status = 'closing'").bind(auth.user.id, now, now, season.id),
      ]);
      await writeAdminAudit(d1, { requestId: request.headers.get("x-request-id") ?? undefined, adminUserId: auth.user.id, adminRole: auth.role, module: "ranking", action: "season_finalize", targetType: "rank_season", targetId: season.id, reason, before: { status: season.status }, after: { status: "closed", snapshotAt: now } });
    } else if (action === "delete") {
      if (!reason) return fail("reason_required", "请填写删除草稿的原因", 400);
      if (season.status !== "draft") return fail("season_not_draft", "只有未激活的草稿赛季可以删除", 409);
      const used = await d1.prepare("SELECT COUNT(*) AS count FROM rank_matches WHERE season_id = ?").bind(season.id).first<{ count: number }>();
      if ((used?.count ?? 0) > 0) return fail("season_has_matches", "这个赛季已有排位记录，不能删除", 409);
      await d1.prepare("DELETE FROM rank_seasons WHERE id = ? AND status = 'draft'").bind(season.id).run();
      await writeAdminAudit(d1, { requestId: request.headers.get("x-request-id") ?? undefined, adminUserId: auth.user.id, adminRole: auth.role, module: "ranking", action: "season_delete", targetType: "rank_season", targetId: season.id, reason, before: publicRankSeason(season), after: null });
    } else {
      return fail("invalid_action", "无法识别这个赛季操作", 400);
    }

    await notifyPlatform({ type: "lobby_updated" });
    return Response.json({ ok: true, seasonId: season.id, seasons: await seasonList(d1) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "赛季操作失败";
    if (message.includes("rank_seasons_one_current_idx")) return fail("season_current_exists", "已经存在进行中或正在收尾的赛季", 409);
    return fail("season_operation_failed", message, 400);
  }
}
