import assert from "node:assert/strict";
import test from "node:test";

import { RAPFI_TACTICAL_CASES, benchmarkMoveMatches } from "../scripts/rapfi-benchmark-cases.mjs";

test("Rapfi tactical release cases keep valid ordered positions", () => {
  assert.equal(RAPFI_TACTICAL_CASES.length >= 6, true);
  for (const testCase of RAPFI_TACTICAL_CASES) {
    const moves = testCase.state.moves;
    moves.forEach((move, index) => {
      assert.equal(move.player, index % 2 === 0 ? "black" : "white", `${testCase.id} move order`);
      assert.equal(testCase.state.board[move.row][move.col], move.player, `${testCase.id} board history`);
    });
    for (const [row, col] of testCase.expected) {
      assert.equal(testCase.state.board[row][col], null, `${testCase.id} expected point must be empty`);
      assert.equal(benchmarkMoveMatches(testCase, { type: "play", row, col }), true);
    }
  }
});

test("Rapfi tactical matcher rejects unrelated and non-play actions", () => {
  const testCase = RAPFI_TACTICAL_CASES[0];
  assert.equal(benchmarkMoveMatches(testCase, { type: "play", row: 14, col: 14 }), false);
  assert.equal(benchmarkMoveMatches(testCase, { type: "pass" }), false);
});
