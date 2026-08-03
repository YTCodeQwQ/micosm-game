import assert from "node:assert/strict";
import test from "node:test";

import {
  activateMatch,
  applyMatchAction,
  createMatchState,
  projectMatchClock,
  RANK_TURN_MS,
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
