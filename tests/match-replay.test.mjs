import assert from "node:assert/strict";
import test from "node:test";

import { activateMatch, applyMatchAction, createMatchState } from "../lib/match-engine.ts";
import { buildReplayFrames } from "../lib/match-replay.ts";

test("admin replay reconstructs an ordinary live board exactly", () => {
  let state = activateMatch(createMatchState("go", 9));
  state = applyMatchAction(state, "black", { type: "play", row: 4, col: 4 });
  state = applyMatchAction(state, "white", { type: "play", row: 3, col: 4 });

  const frames = buildReplayFrames(state);
  assert.deepEqual(frames.at(-1).board, state.board);
  assert.equal(frames.length, 3);
});

test("admin replay falls back to the authoritative snapshot for partial history", () => {
  let state = activateMatch(createMatchState("gomoku", 15));
  state = applyMatchAction(state, "black", { type: "play", row: 7, col: 7 });
  const partial = { ...state, moves: [] };

  const frames = buildReplayFrames(partial);
  assert.deepEqual(frames.at(-1).board, state.board);
  assert.equal(frames.length, 2);
});

test("admin replay preserves the standard Reversi opening", () => {
  const state = activateMatch(createMatchState("reversi", 8));
  const frames = buildReplayFrames(state);
  assert.deepEqual(frames.at(-1).board, state.board);
});
