import assert from "node:assert/strict";
import test from "node:test";

import { activateMatch, applyMatchAction, createMatchState } from "../lib/match-engine.ts";
import { createMicosmGameFile, gameRecordFilename, GameRecordFormatError, parseMicosmGameFile } from "../lib/game-record.ts";

function finishedGomoku() {
  let state = activateMatch(createMatchState("gomoku", 15, "black", false));
  const moves = [
    ["black", 7, 7], ["white", 0, 0],
    ["black", 7, 8], ["white", 0, 1],
    ["black", 7, 9], ["white", 0, 2],
    ["black", 7, 10], ["white", 0, 3],
    ["black", 7, 11],
  ];
  for (const [player, row, col] of moves) state = applyMatchAction(state, player, { type: "play", row, col });
  return state;
}

test("Micosm game files round-trip a complete replay", () => {
  const state = finishedGomoku();
  const file = createMicosmGameFile({
    title: "测试棋谱",
    game: "gomoku",
    mode: "private",
    boardSize: 15,
    viewerRole: "black",
    players: { black: "黑方", white: "白方" },
    winner: "black",
    reason: "win",
    state,
    startedAt: 100,
    endedAt: 200,
  }, 300);
  const parsed = parseMicosmGameFile(JSON.parse(JSON.stringify(file)));
  assert.equal(parsed.format, "micosm-game-record");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.record.state.moves.length, 9);
  assert.equal(parsed.record.state.board[7][11], "black");
  assert.equal(gameRecordFilename(parsed), "micosm-gomoku-19700101.micosm");
});

test("Micosm game files reject unsupported and tampered records", () => {
  assert.throws(() => parseMicosmGameFile({ format: "other", version: 1 }), GameRecordFormatError);
  const state = finishedGomoku();
  const file = createMicosmGameFile({
    title: "测试棋谱",
    game: "gomoku",
    mode: "private",
    boardSize: 15,
    viewerRole: "black",
    players: { black: "黑方", white: "白方" },
    winner: "black",
    reason: "win",
    state,
    startedAt: 100,
    endedAt: 200,
  });
  const tampered = structuredClone(file);
  tampered.record.state.board[0][0] = "red";
  assert.throws(() => parseMicosmGameFile(tampered), /无效棋子/);
  const unfinished = structuredClone(file);
  unfinished.record.state.status = "playing";
  assert.throws(() => parseMicosmGameFile(unfinished), /已经结束/);
});
