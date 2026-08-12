# Rank Season Operations

Last reviewed: 2026-08-12

This runbook defines how Micosm Game ranking seasons are operated. A new season
must be created and managed from `/admin`; routine season changes must not
require an application release or source-code edit.

## Authority

- Only `super_admin` has `ranking.seasons.write`.
- `admin` may inspect ranking data and perform an audited correction during the
  current season, but cannot create, activate, close or delete seasons.
- Every state transition and draft deletion requires a reason and is written to
  `admin_audit_log`; draft creation and ordinary field edits are also audited.
- Closed-season standings and settlements are immutable.

## Season Fields

- Name and generated unique code.
- Player-facing summary.
- Start and end timestamps.
- Independent Go and Gomoku availability; at least one must remain enabled.
- Rating carry-over from the previous season: 0, 25, 50, 75 or 100 percent in
  the UI. The API accepts any whole percentage from 0 through 100.

Carry-over applies only to the current rating. Wins, losses, draws, streak,
match count and season peak are reset when the new season is activated.

## Lifecycle

1. `draft`: editable and invisible to matchmaking. Multiple drafts may exist.
2. `active`: the only state that accepts new ranked queue entries. At most one
   season can be active or closing at a time.
3. `closing`: new entries are rejected and waiting queues are cleared. Matches
   already in progress continue and settle into this season.
4. `closed`: standings are snapshotted per game and cannot be changed.

When an active season reaches its configured end timestamp, the server changes
it to `closing` on the next ranking request and clears its waiting queue. A
super administrator still performs finalization after active matches reach zero.

## Standard Changeover

1. Create and review the next season draft before the current season ends.
2. Confirm its name, player-facing summary, timestamps, games and carry-over.
3. Stop entry for the current season. Do not terminate active matches.
4. Wait until the admin panel reports zero in-flight ranked matches.
5. Finalize the current season. This writes `rank_season_standings`.
6. Activate the prepared draft. This applies rating carry-over and resets
   season statistics.
7. Verify `/api/rank?game=go` and `/api/rank?game=gomoku` show the new season and
   that only enabled games allow matchmaking.

## Failure Handling

- If active matches remain, finalization must return a conflict and the admin
  button remains disabled.
- If a current season already exists, activating another draft must fail.
- Disabling one game during an active season clears only that game's queue.
- A closed season is never reopened. Create a new draft to correct scheduling
  or naming mistakes after closure.
- Never use direct SQL to reset ratings, skip `closing`, or rewrite standings.
  Restore from a verified backup only through the deployment runbook.

## Release Verification

- `/api/health` includes migration `10` named `managed_rank_seasons`.
- A player sees the season name, code, dates and game availability on the rank
  page.
- A non-super administrator receives `403` for season writes.
- Ranked queues and `rank_matches` contain the correct `season_id`.
- Closing rejects new rank matchmaking but existing games can finish.
- Finalization creates one standings snapshot row per ranked player and game.
