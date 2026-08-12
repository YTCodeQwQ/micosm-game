import { getD1 } from "../../../db";
import { betaSettings } from "../../../lib/beta";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { featureEnabled } from "../../../lib/operations";
import { currentRankSeason, publicRankSeason } from "../../../lib/rank";

export async function GET() {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const [settings, betaMode, feedbackEnabled, season] = await Promise.all([
    betaSettings(d1),
    featureEnabled(d1, "beta_mode"),
    featureEnabled(d1, "feedback_enabled"),
    currentRankSeason(d1),
  ]);
  return Response.json({
    betaMode,
    feedbackEnabled,
    programName: settings?.program_name ?? "Micosm Game 星海内测",
    notice: settings?.notice ?? "当前为内测环境。",
    season: season ? publicRankSeason(season) : null,
  });
}
