import { getD1 } from "../../../db";
import { avatarUrlForKey, ensureAuthSchema, getSessionUser } from "../../../lib/auth";
import { ensureRankSchema, rankLabel, rankProgress } from "../../../lib/rank";

type RankGame = "go" | "gomoku";
type ProfileRow = {
  game: RankGame;
  rating: number;
  peak_rating: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  matches: number;
};

function publicProfile(row: ProfileRow) {
  return {
    game: row.game,
    rating: row.rating,
    peakRating: row.peak_rating,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    streak: row.streak,
    matches: row.matches,
    label: rankLabel(row.rating),
    progress: rankProgress(row.rating),
  };
}

export async function GET(request: Request) {
  try {
    const d1 = getD1();
    await ensureAuthSchema(d1);
    await ensureRankSchema(d1);
    const user = await getSessionUser(request, d1);
    if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
    const game = new URL(request.url).searchParams.get("game") === "gomoku" ? "gomoku" : "go";
    const now = Date.now();
    for (const rankGame of ["go", "gomoku"] as const) {
      await d1.prepare("INSERT OR IGNORE INTO rank_profiles (user_id, game, rating, peak_rating, wins, losses, draws, streak, matches, updated_at) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, ?)")
        .bind(user.id, rankGame, now).run();
    }
    const profiles = await d1.prepare("SELECT game, rating, peak_rating, wins, losses, draws, streak, matches FROM rank_profiles WHERE user_id = ? ORDER BY game")
      .bind(user.id).all<ProfileRow>();
    const leaderboard = await d1.prepare(`SELECT rp.user_id, rp.rating, rp.wins, rp.losses, rp.matches, u.public_id, u.display_name, u.signature, u.avatar_key
      FROM rank_profiles rp JOIN users u ON u.id = rp.user_id
      WHERE rp.game = ? AND rp.matches > 0
      ORDER BY rp.rating DESC, rp.wins DESC, rp.updated_at ASC LIMIT 50`).bind(game).all<{ user_id: string; rating: number; wins: number; losses: number; matches: number; public_id: string | null; display_name: string; signature: string | null; avatar_key: string | null }>();
    const current = profiles.results.find((profile) => profile.game === game) as ProfileRow;
    const position = await d1.prepare("SELECT COUNT(*) AS count FROM rank_profiles WHERE game = ? AND matches > 0 AND (rating > ? OR (rating = ? AND wins > ?))")
      .bind(game, current.rating, current.rating, current.wins).first<{ count: number }>();
    return Response.json({
      profiles: Object.fromEntries(profiles.results.map((profile) => [profile.game, publicProfile(profile)])),
      position: current.matches ? (position?.count ?? 0) + 1 : null,
      leaderboard: leaderboard.results.map((row, index) => ({
        position: index + 1,
        userId: row.user_id,
        publicId: row.public_id ?? "",
        displayName: row.display_name,
        signature: row.signature ?? "",
        avatarUrl: avatarUrlForKey(row.avatar_key),
        rating: row.rating,
        label: rankLabel(row.rating),
        wins: row.wins,
        losses: row.losses,
        matches: row.matches,
        isMe: row.user_id === user.id,
      })),
    });
  } catch (error) {
    return Response.json({ error: { code: "server_error", message: error instanceof Error ? error.message : "排位数据暂时不可用" } }, { status: 500 });
  }
}
