import assert from "node:assert/strict";
import test from "node:test";

import { activateMatch, applyMatchAction, createMatchState, MatchRuleError } from "../lib/match-engine.ts";

test("Go rejects a move that recreates any earlier board position", () => {
  const state = activateMatch(createMatchState("go", 9));
  const candidate = state.board.map((row) => [...row]);
  candidate[4][4] = "black";
  state.history = [state.history[0], candidate.map((row) => row.map((stone) => stone?.[0] ?? ".").join("")).join("/")];

  assert.throws(
    () => applyMatchAction(state, "black", { type: "play", row: 4, col: 4 }),
    (error) => error instanceof MatchRuleError && error.code === "superko",
  );
});

test("Go enters scoring after two passes and requires both confirmations", () => {
  const started = activateMatch(createMatchState("go", 9));
  started.board[4][4] = "black";
  let state = applyMatchAction(started, "black", { type: "pass" });
  state = applyMatchAction(state, "white", { type: "pass" });

  assert.equal(state.status, "scoring");
  state = applyMatchAction(state, "black", { type: "markDead", row: 4, col: 4 });
  assert.deepEqual(state.goScoring?.dead, [[4, 4]]);
  state = applyMatchAction(state, "black", { type: "confirmScore" });
  assert.equal(state.status, "scoring");
  state = applyMatchAction(state, "white", { type: "confirmScore" });
  assert.equal(state.status, "ended");
  assert.equal(state.winner, "white");
});

test("Go players can resume from scoring", () => {
  let state = activateMatch(createMatchState("go", 9));
  state = applyMatchAction(state, "black", { type: "pass" });
  state = applyMatchAction(state, "white", { type: "pass" });
  state = applyMatchAction(state, "black", { type: "resumeGo" });

  assert.equal(state.status, "playing");
  assert.equal(state.turn, "black");
  assert.equal(state.passes, 0);
});

test("Renju rules reject black overlines, double-threes, and double-fours", () => {
  const overline = activateMatch(createMatchState("gomoku", 15, "black", true));
  [3, 4, 5, 6, 7].forEach((col) => { overline.board[7][col] = "black"; });
  assert.throws(
    () => applyMatchAction(overline, "black", { type: "play", row: 7, col: 8 }),
    (error) => error instanceof MatchRuleError && error.code === "gomoku_forbidden" && /长连/.test(error.message),
  );

  const doubleThree = activateMatch(createMatchState("gomoku", 15, "black", true));
  [[7, 6], [7, 8], [6, 7], [8, 7]].forEach(([row, col]) => { doubleThree.board[row][col] = "black"; });
  assert.throws(
    () => applyMatchAction(doubleThree, "black", { type: "play", row: 7, col: 7 }),
    (error) => error instanceof MatchRuleError && error.code === "gomoku_forbidden" && /三三/.test(error.message),
  );

  const doubleFour = activateMatch(createMatchState("gomoku", 15, "black", true));
  [[7, 5], [7, 6], [7, 8], [5, 7], [6, 7], [8, 7]].forEach(([row, col]) => { doubleFour.board[row][col] = "black"; });
  assert.throws(
    () => applyMatchAction(doubleFour, "black", { type: "play", row: 7, col: 7 }),
    (error) => error instanceof MatchRuleError && error.code === "gomoku_forbidden" && /四四/.test(error.message),
  );
});

test("Gomoku without forbidden moves still allows an overline win", () => {
  const state = activateMatch(createMatchState("gomoku", 15, "black", false));
  [3, 4, 5, 6, 7].forEach((col) => { state.board[7][col] = "black"; });
  const ended = applyMatchAction(state, "black", { type: "play", row: 7, col: 8 });
  assert.equal(ended.status, "ended");
  assert.equal(ended.winner, "black");
});

test("match states keep a replayable move timeline and undo removes the reverted move", () => {
  let gomoku = activateMatch(createMatchState("gomoku", 15));
  gomoku = applyMatchAction(gomoku, "black", { type: "play", row: 7, col: 7 });
  gomoku = applyMatchAction(gomoku, "white", { type: "play", row: 7, col: 8 });
  assert.deepEqual(gomoku.moves, [
    { type: "play", row: 7, col: 7, player: "black" },
    { type: "play", row: 7, col: 8, player: "white" },
  ]);

  gomoku = applyMatchAction(gomoku, "white", { type: "requestUndo" });
  gomoku = applyMatchAction(gomoku, "black", { type: "respondUndo", accept: true });
  assert.equal(gomoku.moves?.length, 1);
  assert.equal(gomoku.board[7][8], null);

  let go = activateMatch(createMatchState("go", 9));
  go = applyMatchAction(go, "black", { type: "pass" });
  go = applyMatchAction(go, "white", { type: "pass" });
  go = applyMatchAction(go, "black", { type: "resumeGo" });
  assert.deepEqual(go.moves?.map((move) => move.type), ["pass", "pass", "resumeGo"]);
});

test("undo rejection is preserved as an explicit opponent-facing notice", () => {
  let state = activateMatch(createMatchState("gomoku", 15));
  state = applyMatchAction(state, "black", { type: "play", row: 7, col: 7 });
  state = applyMatchAction(state, "black", { type: "requestUndo" });
  state = applyMatchAction(state, "white", { type: "respondUndo", accept: false });

  assert.equal(state.undoRequest, null);
  assert.match(state.notice, /白方拒绝了悔棋/);
});

test("rematch starts only after the opponent accepts", () => {
  let state = activateMatch(createMatchState("gomoku", 15));
  state.board[7][3] = "black";
  state.board[7][4] = "black";
  state.board[7][5] = "black";
  state.board[7][6] = "black";
  state = applyMatchAction(state, "black", { type: "play", row: 7, col: 7 });
  state = applyMatchAction(state, "black", { type: "requestRematch" });

  assert.equal(state.status, "ended");
  assert.equal(state.rematchRequest?.requester, "black");

  state = applyMatchAction(state, "white", { type: "respondRematch", accept: true });
  assert.equal(state.status, "playing");
  assert.equal(state.board.flat().filter(Boolean).length, 0);
  assert.equal(state.rematchRequest, undefined);
});

test("resigning ends an active match and records the conceding player", () => {
  let state = activateMatch(createMatchState("gomoku", 15));
  state = applyMatchAction(state, "black", { type: "play", row: 7, col: 7 });
  state = applyMatchAction(state, "white", { type: "resign" });

  assert.equal(state.status, "ended");
  assert.equal(state.winner, "black");
  assert.equal(state.resignedPlayer, "white");
  assert.equal(state.clock?.activeSince ?? null, null);
  assert.match(state.notice, /认输/);
});

test("players can resign during Go scoring but not before or after a match", () => {
  let state = activateMatch(createMatchState("go", 9));
  state = applyMatchAction(state, "black", { type: "pass" });
  state = applyMatchAction(state, "white", { type: "pass" });
  state = applyMatchAction(state, "black", { type: "resign" });

  assert.equal(state.status, "ended");
  assert.equal(state.winner, "white");
  assert.equal(state.resignedPlayer, "black");

  assert.throws(
    () => applyMatchAction(createMatchState("go", 9), "black", { type: "resign" }),
    (error) => error instanceof MatchRuleError && error.code === "waiting_for_opponent",
  );
  assert.throws(
    () => applyMatchAction(state, "white", { type: "resign" }),
    (error) => error instanceof MatchRuleError && error.code === "match_ended",
  );
});
