const SIZE = 15;

function position(id, title, aiPlayer, moves, expected, gomokuForbidden = false) {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  const recorded = moves.map(([player, row, col]) => {
    board[row][col] = player;
    return { type: "play", player, row, col };
  });
  return {
    id,
    title,
    expected,
    state: {
      game: "gomoku",
      size: SIZE,
      board,
      turn: aiPlayer,
      status: "playing",
      winner: null,
      notice: "benchmark",
      lastMove: recorded.length ? [recorded.at(-1).row, recorded.at(-1).col] : null,
      moves: recorded,
      gomokuForbidden,
      ai: { player: aiPlayer, difficulty: "master", engine: "rapfi" },
    },
  };
}

export const RAPFI_TACTICAL_CASES = [
  position("freestyle-black-win-1", "Black completes five immediately", "black", [
    ["black", 7, 5], ["white", 0, 0], ["black", 7, 6], ["white", 0, 2],
    ["black", 7, 7], ["white", 0, 4], ["black", 7, 8],
  ], [[7, 4], [7, 9]]),
  position("freestyle-white-win-1", "White completes five immediately", "white", [
    ["black", 0, 0], ["white", 7, 5], ["black", 0, 2], ["white", 7, 6],
    ["black", 0, 4], ["white", 7, 7], ["black", 1, 0], ["white", 7, 8], ["black", 1, 2],
  ], [[7, 4], [7, 9]]),
  position("freestyle-black-block-1", "Black blocks White's edge four", "black", [
    ["black", 0, 5], ["white", 7, 0], ["black", 1, 5], ["white", 7, 1],
    ["black", 2, 5], ["white", 7, 2], ["black", 3, 7], ["white", 7, 3],
  ], [[7, 4]]),
  position("freestyle-white-block-1", "White blocks Black's edge four", "white", [
    ["black", 7, 0], ["white", 0, 5], ["black", 7, 1], ["white", 1, 5],
    ["black", 7, 2], ["white", 2, 5], ["black", 7, 3],
  ], [[7, 4]]),
  position("renju-black-win-1", "Renju Black takes a legal exact five", "black", [
    ["black", 8, 5], ["white", 0, 0], ["black", 8, 6], ["white", 0, 2],
    ["black", 8, 7], ["white", 0, 4], ["black", 8, 8],
  ], [[8, 4], [8, 9]], true),
  position("renju-white-block-1", "Renju White blocks Black's edge four", "white", [
    ["black", 9, 0], ["white", 0, 5], ["black", 9, 1], ["white", 1, 5],
    ["black", 9, 2], ["white", 2, 5], ["black", 9, 3],
  ], [[9, 4]], true),
];

export function benchmarkMoveMatches(testCase, action) {
  return action?.type === "play" && testCase.expected.some(([row, col]) => action.row === row && action.col === col);
}
