import assert from "node:assert/strict";
import test from "node:test";

import {
  activateMatch,
  applyMatchAction,
  createMatchState,
  projectMatchClock,
  RANK_TURN_MS,
  startConfiguredMatchClock,
  startMatchClock,
  startRankedClock,
} from "../lib/match-engine.ts";

test("uses separate per-turn limits for ranked Go and Gomoku", () => {
  assert.equal(RANK_TURN_MS.go, 60 * 1000);
  assert.equal(RANK_TURN_MS.gomoku, 30 * 1000);
});

test("counts down continuously and resets the full limit after every move", () => {
  const started = startRankedClock(activateMatch(createMatchState("gomoku")), 1_000);
  const beforeMove = projectMatchClock(started, 2_250);
  const afterMove = applyMatchAction(beforeMove, "black", { type: "play", row: 7, col: 7 });
  const projected = projectMatchClock(afterMove, afterMove.clock.activeSince + 1_750);

  assert.equal(projected.turn, "white");
  assert.equal(projected.clock?.blackMs, RANK_TURN_MS.gomoku);
  assert.equal(projected.clock?.whiteMs, RANK_TURN_MS.gomoku - 1_750);
});

test("ends the match when the active player's time expires", () => {
  const started = startRankedClock(activateMatch(createMatchState("gomoku")), 10_000);
  const timedOut = projectMatchClock(started, 10_000 + RANK_TURN_MS.gomoku + 1);

  assert.equal(timedOut.status, "ended");
  assert.equal(timedOut.winner, "white");
  assert.equal(timedOut.timedOutPlayer, "black");
  assert.equal(timedOut.clock?.blackMs, 0);
  assert.equal(timedOut.clock?.activeSince, null);
  assert.match(timedOut.notice, /用时耗尽/);
});

test("supports a custom private-room per-turn duration", () => {
  const duration = 37 * 1000;
  const started = startMatchClock(activateMatch(createMatchState("reversi")), duration, 5_000);
  const projected = projectMatchClock(started, 15_000);
  const reset = applyMatchAction(projected, "black", { type: "reset" });

  assert.equal(projected.clock?.blackMs, duration - 10_000);
  assert.equal(projected.clock?.whiteMs, duration);
  assert.equal(reset.clockConfigMs, duration);
  assert.equal(reset.clock?.blackMs, duration);
  assert.equal(reset.clock?.whiteMs, duration);
});

test("keeps each player's remaining time in total-time rooms", () => {
  const started = startConfiguredMatchClock(
    activateMatch(createMatchState("gomoku")),
    { mode: "total", initialMs: 10 * 60_000 },
    1_000,
  );
  const beforeMove = projectMatchClock(started, 31_000);
  const afterMove = applyMatchAction(beforeMove, "black", { type: "play", row: 7, col: 7 });
  const projected = projectMatchClock(afterMove, afterMove.clock.activeSince + 12_000);

  assert.equal(projected.clock?.blackMs, 9.5 * 60_000);
  assert.equal(projected.clock?.whiteMs, 9.8 * 60_000);
  assert.equal(projected.clockConfig?.mode, "total");
});

test("enters Go byo-yomi, consumes periods, and resets the active period after a move", () => {
  const started = startConfiguredMatchClock(
    activateMatch(createMatchState("go", 9)),
    { mode: "byoyomi", initialMs: 60_000, byoYomiMs: 10_000, periods: 3 },
    5_000,
  );
  const inByoyomi = projectMatchClock(started, 5_000 + 60_000 + 14_000);

  assert.equal(inByoyomi.clock?.blackInByoyomi, true);
  assert.equal(inByoyomi.clock?.blackPeriods, 2);
  assert.equal(inByoyomi.clock?.blackMs, 6_000);

  const afterMove = applyMatchAction(inByoyomi, "black", { type: "play", row: 4, col: 4 });
  assert.equal(afterMove.clock?.blackMs, 10_000);
  assert.equal(afterMove.clock?.blackPeriods, 2);
  assert.equal(afterMove.turn, "white");
});

test("ends a byo-yomi game after the final period expires", () => {
  const started = startConfiguredMatchClock(
    activateMatch(createMatchState("go", 9)),
    { mode: "byoyomi", initialMs: 1_000, byoYomiMs: 2_000, periods: 2 },
    10_000,
  );
  const timedOut = projectMatchClock(started, 15_001);

  assert.equal(timedOut.status, "ended");
  assert.equal(timedOut.winner, "white");
  assert.equal(timedOut.clock?.blackPeriods, 0);
  assert.equal(timedOut.clock?.blackMs, 0);
});
