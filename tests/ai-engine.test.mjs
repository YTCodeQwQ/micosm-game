import assert from "node:assert/strict";
import test from "node:test";
import { chooseBuiltInAiAction } from "../lib/ai-engine.ts";
import { activateMatch, applyMatchAction, createMatchState } from "../lib/match-engine.ts";

const fixedRandom = () => 0;

test("Gomoku AI opens in the center", () => {
  const state = activateMatch(createMatchState("gomoku", 15));
  const action = chooseBuiltInAiAction(state, "hard", fixedRandom);
  assert.deepEqual(action, { type: "play", row: 7, col: 7 });
});

test("Gomoku AI finishes an immediate five", () => {
  const state = activateMatch(createMatchState("gomoku", 15));
  state.board[7][3] = "black";
  state.board[7][4] = "black";
  state.board[7][5] = "black";
  state.board[7][6] = "black";
  state.turn = "black";
  const action = chooseBuiltInAiAction(state, "normal", fixedRandom);
  assert.equal(action.type, "play");
  const next = applyMatchAction(state, "black", action);
  assert.equal(next.winner, "black");
});

test("Gomoku AI blocks the opponent's immediate win", () => {
  const state = activateMatch(createMatchState("gomoku", 15));
  state.board[5][4] = "black";
  state.board[5][5] = "black";
  state.board[5][6] = "black";
  state.board[5][7] = "black";
  state.turn = "white";
  const action = chooseBuiltInAiAction(state, "hard", fixedRandom);
  assert.equal(action.type, "play");
  assert.equal(action.row, 5);
  assert.ok(action.col === 3 || action.col === 8);
});

test("Reversi AI always returns a legal move", () => {
  const state = activateMatch(createMatchState("reversi"));
  const action = chooseBuiltInAiAction(state, "master", fixedRandom);
  assert.equal(action.type, "play");
  const next = applyMatchAction(state, "black", action);
  assert.equal(next.turn, "white");
  assert.equal(next.board.flat().filter(Boolean).length, 5);
});

test("Go AI returns a legal move on every supported board size", () => {
  for (const size of [9, 13, 19]) {
    const state = activateMatch(createMatchState("go", size));
    const action = chooseBuiltInAiAction(state, "hard", fixedRandom);
    assert.equal(action.type, "play");
    const next = applyMatchAction(state, "black", action);
    assert.equal(next.board.flat().filter(Boolean).length, 1);
  }
});

test("Go AI passes when no legal point remains", () => {
  const state = activateMatch(createMatchState("go", 9));
  state.board = state.board.map((row) => row.map(() => "black"));
  state.turn = "white";

  const action = chooseBuiltInAiAction(state, "normal", fixedRandom);
  assert.deepEqual(action, { type: "pass" });

  const next = applyMatchAction(state, "white", action);
  assert.equal(next.passes, 1);
  assert.equal(next.turn, "black");
});
