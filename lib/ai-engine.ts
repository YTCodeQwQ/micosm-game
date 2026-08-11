import { applyMatchAction, type AiDifficulty, type MatchAction, type MatchPlayer, type MatchPoint, type MatchState, type MatchStone } from "./match-engine.ts";

type Candidate = { action: MatchAction; next: MatchState; score: number };
type RandomSource = () => number;

const directions: MatchPoint[] = [[1, 0], [0, 1], [1, 1], [1, -1]];
const neighbors: MatchPoint[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const reversiWeights = [
  [120, -28, 18, 8, 8, 18, -28, 120],
  [-28, -45, -6, -5, -5, -6, -45, -28],
  [18, -6, 11, 4, 4, 11, -6, 18],
  [8, -5, 4, 2, 2, 4, -5, 8],
  [8, -5, 4, 2, 2, 4, -5, 8],
  [18, -6, 11, 4, 4, 11, -6, 18],
  [-28, -45, -6, -5, -5, -6, -45, -28],
  [120, -28, 18, 8, 8, 18, -28, 120],
];

function rival(player: MatchPlayer): MatchPlayer {
  return player === "black" ? "white" : "black";
}

function inside(size: number, row: number, col: number) {
  return row >= 0 && col >= 0 && row < size && col < size;
}

function legalCandidate(state: MatchState, action: MatchAction): Candidate | null {
  try {
    return { action, next: applyMatchAction(state, state.turn, action), score: 0 };
  } catch {
    return null;
  }
}

function shuffledBest(candidates: Candidate[], random: RandomSource, breadth: number) {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const pool = sorted.slice(0, Math.max(1, Math.min(breadth, sorted.length)));
  return pool[Math.floor(random() * pool.length)] ?? sorted[0];
}

function gomokuCandidatePoints(state: MatchState) {
  const occupied: MatchPoint[] = [];
  state.board.forEach((line, row) => line.forEach((stone, col) => { if (stone) occupied.push([row, col]); }));
  if (!occupied.length) {
    const center = Math.floor(state.size / 2);
    return [[center, center]] as MatchPoint[];
  }
  const points = new Map<string, MatchPoint>();
  for (const [row, col] of occupied) {
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const nextRow = row + dr;
        const nextCol = col + dc;
        if (!inside(state.size, nextRow, nextCol) || state.board[nextRow][nextCol]) continue;
        points.set(`${nextRow}:${nextCol}`, [nextRow, nextCol]);
      }
    }
  }
  return [...points.values()];
}

function lineLength(board: MatchStone[][], row: number, col: number, player: MatchPlayer, dr: number, dc: number) {
  let count = 1;
  for (const sign of [-1, 1]) {
    let step = 1;
    while (board[row + dr * step * sign]?.[col + dc * step * sign] === player) {
      count += 1;
      step += 1;
    }
  }
  return count;
}

function gomokuPointScore(board: MatchStone[][], row: number, col: number, player: MatchPlayer) {
  let score = 0;
  for (const [dr, dc] of directions) {
    const own = lineLength(board, row, col, player, dr, dc);
    const opponent = lineLength(board, row, col, rival(player), dr, dc) - 1;
    score += own >= 5 ? 1_000_000 : own === 4 ? 32_000 : own === 3 ? 2_200 : own === 2 ? 170 : 16;
    score += opponent >= 4 ? 120_000 : opponent === 3 ? 7_500 : opponent === 2 ? 420 : 0;
  }
  const center = (board.length - 1) / 2;
  return score - (Math.abs(row - center) + Math.abs(col - center)) * 2;
}

function gomokuCandidates(state: MatchState) {
  const player = state.turn;
  return gomokuCandidatePoints(state).flatMap(([row, col]) => {
    const candidate = legalCandidate(state, { type: "play", row, col });
    if (!candidate) return [];
    candidate.score = candidate.next.winner === player ? 10_000_000 : gomokuPointScore(candidate.next.board, row, col, player);
    return [candidate];
  });
}

function opponentImmediateWin(state: MatchState) {
  return gomokuCandidates(state).some((candidate) => candidate.next.winner === state.turn);
}

function chooseGomoku(state: MatchState, difficulty: AiDifficulty, random: RandomSource) {
  const candidates = gomokuCandidates(state);
  if (!candidates.length) return null;
  const win = candidates.find((candidate) => candidate.next.winner === state.turn);
  if (win) return win.action;

  const rivalState = { ...state, turn: rival(state.turn) };
  const rivalWin = gomokuCandidates(rivalState).find((candidate) => candidate.next.winner === rivalState.turn);
  if (rivalWin && rivalWin.action.type === "play") {
    const block = candidates.find((candidate) => candidate.action.type === "play" && candidate.action.row === rivalWin.action.row && candidate.action.col === rivalWin.action.col);
    if (block) return block.action;
  }
  if (difficulty === "easy") return shuffledBest(candidates, random, Math.min(14, candidates.length))?.action ?? null;
  if (difficulty === "normal") return shuffledBest(candidates, random, 5)?.action ?? null;

  const breadth = difficulty === "master" ? 12 : 8;
  const search = [...candidates].sort((a, b) => b.score - a.score).slice(0, breadth);
  for (const candidate of search) {
    if (candidate.next.status === "ended") continue;
    const replies = gomokuCandidates(candidate.next).sort((a, b) => b.score - a.score).slice(0, breadth);
    const worstReply = replies[0];
    candidate.score -= worstReply?.score ? worstReply.score * .86 : 0;
    if (difficulty === "master") {
      candidate.score += replies.slice(0, 5).reduce((value, reply) => {
        if (reply.next.status === "ended") return value - 500_000;
        return value + (opponentImmediateWin(reply.next) ? 30_000 : 0);
      }, 0);
    }
  }
  return shuffledBest(search, random, difficulty === "master" ? 1 : 2)?.action ?? null;
}

function reversiCandidates(state: MatchState) {
  const beforeCount = state.board.flat().filter((stone) => stone === state.turn).length;
  const candidates: Candidate[] = [];
  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      if (state.board[row][col]) continue;
      const candidate = legalCandidate(state, { type: "play", row, col });
      if (!candidate) continue;
      const afterCount = candidate.next.board.flat().filter((stone) => stone === state.turn).length;
      candidate.score = reversiWeights[row][col] + (afterCount - beforeCount) * 4;
      candidates.push(candidate);
    }
  }
  return candidates;
}

function reversiEvaluation(state: MatchState, player: MatchPlayer) {
  let value = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if (state.board[row][col] === player) value += reversiWeights[row][col];
      else if (state.board[row][col] === rival(player)) value -= reversiWeights[row][col];
    }
  }
  const score = state.board.flat().reduce((total, stone) => total + (stone === player ? 1 : stone === rival(player) ? -1 : 0), 0);
  const mobilityState = state.turn === player ? state : { ...state, turn: player };
  const rivalMobilityState = state.turn === rival(player) ? state : { ...state, turn: rival(player) };
  return value + score * 3 + (reversiCandidates(mobilityState).length - reversiCandidates(rivalMobilityState).length) * 7;
}

function reversiSearch(state: MatchState, root: MatchPlayer, depth: number, alpha: number, beta: number): number {
  if (state.status === "ended" || depth <= 0) {
    if (state.winner === root) return 1_000_000;
    if (state.winner && state.winner !== "draw") return -1_000_000;
    return reversiEvaluation(state, root);
  }
  const candidates = reversiCandidates(state).sort((a, b) => b.score - a.score);
  if (!candidates.length) return reversiEvaluation(state, root);
  const maximize = state.turn === root;
  let value = maximize ? -Infinity : Infinity;
  for (const candidate of candidates) {
    const result = reversiSearch(candidate.next, root, depth - 1, alpha, beta);
    if (maximize) {
      value = Math.max(value, result);
      alpha = Math.max(alpha, value);
    } else {
      value = Math.min(value, result);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }
  return value;
}

function chooseReversi(state: MatchState, difficulty: AiDifficulty, random: RandomSource) {
  const candidates = reversiCandidates(state);
  if (!candidates.length) return null;
  if (difficulty === "easy") return shuffledBest(candidates, random, candidates.length)?.action ?? null;
  if (difficulty === "normal") return shuffledBest(candidates, random, 4)?.action ?? null;
  const depth = difficulty === "master" ? 5 : 3;
  for (const candidate of candidates) candidate.score = reversiSearch(candidate.next, state.turn, depth - 1, -Infinity, Infinity);
  return shuffledBest(candidates, random, difficulty === "master" ? 1 : 2)?.action ?? null;
}

function groupLiberties(board: MatchStone[][], startRow: number, startCol: number) {
  const color = board[startRow]?.[startCol];
  if (!color) return 0;
  const seen = new Set<string>();
  const liberties = new Set<string>();
  const stack: MatchPoint[] = [[startRow, startCol]];
  while (stack.length) {
    const [row, col] = stack.pop() as MatchPoint;
    const key = `${row}:${col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [dr, dc] of neighbors) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      const stone = board[nextRow]?.[nextCol];
      if (!stone) {
        if (inside(board.length, nextRow, nextCol)) liberties.add(`${nextRow}:${nextCol}`);
      } else if (stone === color) stack.push([nextRow, nextCol]);
    }
  }
  return liberties.size;
}

function goRegionBorders(board: MatchStone[][], startRow: number, startCol: number) {
  const borders = new Set<MatchPlayer>();
  const seen = new Set<string>();
  const stack: MatchPoint[] = [[startRow, startCol]];
  while (stack.length) {
    const [row, col] = stack.pop() as MatchPoint;
    const key = `${row}:${col}`;
    if (seen.has(key) || board[row]?.[col]) continue;
    seen.add(key);
    for (const [dr, dc] of neighbors) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (!inside(board.length, nextRow, nextCol)) continue;
      const stone = board[nextRow][nextCol];
      if (stone) borders.add(stone);
      else if (!seen.has(`${nextRow}:${nextCol}`)) stack.push([nextRow, nextCol]);
    }
  }
  return borders;
}

function goCandidates(state: MatchState) {
  const player = state.turn;
  const beforeCaptures = state.captures?.[player] ?? 0;
  const occupied = state.board.flat().filter(Boolean).length;
  const candidates: Candidate[] = [];
  for (let row = 0; row < state.size; row += 1) {
    for (let col = 0; col < state.size; col += 1) {
      if (state.board[row][col]) continue;
      const candidate = legalCandidate(state, { type: "play", row, col });
      if (!candidate) continue;
      const captures = (candidate.next.captures?.[player] ?? 0) - beforeCaptures;
      const liberties = groupLiberties(candidate.next.board, row, col);
      let adjacentEnemy = 0;
      let adjacentOwn = 0;
      for (const [dr, dc] of neighbors) {
        const stone = state.board[row + dr]?.[col + dc];
        if (stone === player) adjacentOwn += 1;
        if (stone === rival(player)) adjacentEnemy += 1;
      }
      const center = (state.size - 1) / 2;
      const centerDistance = Math.abs(row - center) + Math.abs(col - center);
      const openingShape = occupied < state.size * 1.25 ? Math.min(8, centerDistance) * 2 : 0;
      candidate.score = captures * 1_000 + liberties * 18 + adjacentEnemy * 28 + adjacentOwn * 11 + openingShape;
      if (liberties === 1 && captures === 0) candidate.score -= 280;
      candidates.push(candidate);
    }
  }
  return candidates;
}

function chooseGo(state: MatchState, difficulty: AiDifficulty, random: RandomSource) {
  const candidates = goCandidates(state);
  if (!candidates.length) return { type: "pass" } as MatchAction;
  const beforeCaptures = state.captures?.[state.turn] ?? 0;
  const endgameCandidates = (state.passes ?? 0) > 0
    ? candidates.filter((candidate) => {
      if (candidate.action.type !== "play") return false;
      const captures = (candidate.next.captures?.[state.turn] ?? 0) - beforeCaptures;
      if (captures > 0) return true;
      return goRegionBorders(state.board, candidate.action.row, candidate.action.col).size !== 1;
    })
    : candidates;
  if (!endgameCandidates.length) return { type: "pass" } as MatchAction;
  if (difficulty === "easy") return shuffledBest(endgameCandidates, random, Math.min(30, endgameCandidates.length))?.action ?? null;
  if (difficulty === "normal") return shuffledBest(endgameCandidates, random, 10)?.action ?? null;
  return shuffledBest(endgameCandidates, random, difficulty === "master" ? 1 : 3)?.action ?? null;
}

export function chooseBuiltInAiAction(state: MatchState, difficulty: AiDifficulty, random: RandomSource = Math.random): MatchAction {
  if (state.status !== "playing") throw new Error("AI 只能在进行中的棋局落子");
  const action = state.game === "gomoku"
    ? chooseGomoku(state, difficulty, random)
    : state.game === "reversi"
      ? chooseReversi(state, difficulty, random)
      : chooseGo(state, difficulty, random);
  if (!action) throw new Error("AI 没有找到合法落子");
  return action;
}
