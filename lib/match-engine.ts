import { makeBoard as makeRenjuBoard, wrapBoard as wrapRenjuBoard, type ForbiddenKind } from "./vendor/renjukit-board.js";

export type MatchGame = "go" | "gomoku" | "reversi";
export type MatchPlayer = "black" | "white";
export type MatchStone = MatchPlayer | null;
export type MatchPoint = [number, number];
export type MatchWinner = MatchPlayer | "draw" | null;
export type ColorPreference = MatchPlayer | "random";
export type AiDifficulty = "easy" | "normal" | "hard" | "master";
export type MatchAi = { player: MatchPlayer; difficulty: AiDifficulty; engine: "builtin" | "katago" | "rapfi" };
export type MatchMove =
  | { type: "play"; row: number; col: number; player: MatchPlayer }
  | { type: "pass"; player: MatchPlayer }
  | { type: "resumeGo"; player: MatchPlayer };
export type UndoRequest = { requester: MatchPlayer };
export type RematchRequest = { requester: MatchPlayer };
export type MatchSnapshot = Omit<MatchState, "undoRequest" | "undoSnapshot" | "rematchRequest">;
export type MatchClock = { blackMs: number; whiteMs: number; activeSince: number | null };
export type GoScoring = { dead: MatchPoint[]; confirmations: MatchPlayer[] };
export type SpectatorPolicy = "off" | "friends" | "public";

export const RANK_TURN_MS: Record<"go" | "gomoku", number> = {
  go: 60 * 1000,
  gomoku: 30 * 1000,
};

export type MatchState = {
  game: MatchGame;
  size: number;
  board: MatchStone[][];
  turn: MatchPlayer;
  status: "waiting" | "playing" | "scoring" | "ended";
  winner: MatchWinner;
  notice: string;
  lastMove: MatchPoint | null;
  captures?: { black: number; white: number };
  passes?: number;
  history?: string[];
  moves?: MatchMove[];
  finalScore?: { black: number; white: number };
  lastPlayer?: MatchPlayer | null;
  undoRequest?: UndoRequest | null;
  undoSnapshot?: MatchSnapshot | null;
  rematchRequest?: RematchRequest | null;
  hostColorPreference?: ColorPreference;
  departedPlayer?: MatchPlayer | null;
  resignedPlayer?: MatchPlayer | null;
  timedOutPlayer?: MatchPlayer | null;
  clock?: MatchClock;
  clockConfigMs?: number;
  goScoring?: GoScoring | null;
  gomokuForbidden?: boolean;
  ai?: MatchAi;
  spectatorConsents?: MatchPlayer[];
};

export type MatchAction =
  | { type: "play"; row: number; col: number }
  | { type: "pass" }
  | { type: "markDead"; row: number; col: number }
  | { type: "confirmScore" }
  | { type: "resumeGo" }
  | { type: "resign" }
  | { type: "reset" }
  | { type: "requestUndo" }
  | { type: "cancelUndo" }
  | { type: "respondUndo"; accept: boolean }
  | { type: "requestRematch" }
  | { type: "cancelRematch" }
  | { type: "respondRematch"; accept: boolean };

export class MatchRuleError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const orthogonal: MatchPoint[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const allDirections: MatchPoint[] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1],
  [0, 1], [1, -1], [1, 0], [1, 1],
];

function makeBoard(size: number): MatchStone[][] {
  return Array.from({ length: size }, () => Array<MatchStone>(size).fill(null));
}

function copyBoard(board: MatchStone[][]) {
  return board.map((row) => [...row]);
}

function opponent(player: MatchPlayer): MatchPlayer {
  return player === "black" ? "white" : "black";
}

function playerName(player: MatchPlayer) {
  return player === "black" ? "黑方" : "白方";
}

function inside(board: MatchStone[][], row: number, col: number) {
  return row >= 0 && col >= 0 && row < board.length && col < board.length;
}

function boardKey(board: MatchStone[][]) {
  return board.map((row) => row.map((stone) => stone?.[0] ?? ".").join("")).join("/");
}

function makeReversiBoard() {
  const board = makeBoard(8);
  board[3][3] = "white";
  board[3][4] = "black";
  board[4][3] = "black";
  board[4][4] = "white";
  return board;
}

export function createMatchState(game: MatchGame, requestedSize?: number, hostColorPreference: ColorPreference = "black", gomokuForbidden = false): MatchState {
  if (game === "go") {
    const size = [9, 13, 19].includes(requestedSize ?? 19) ? requestedSize ?? 19 : 19;
    const board = makeBoard(size);
    return { game, size, board, turn: "black", status: "waiting", winner: null, notice: "等待另一位玩家加入", lastMove: null, captures: { black: 0, white: 0 }, passes: 0, history: [boardKey(board)], moves: [], hostColorPreference };
  }
  if (game === "gomoku") {
    return { game, size: 15, board: makeBoard(15), turn: "black", status: "waiting", winner: null, notice: "等待另一位玩家加入", lastMove: null, moves: [], hostColorPreference, gomokuForbidden };
  }
  return { game, size: 8, board: makeReversiBoard(), turn: "black", status: "waiting", winner: null, notice: "等待白方加入", lastMove: null, moves: [], hostColorPreference: "black" };
}

export function activateMatch(state: MatchState) {
  return { ...state, status: "playing" as const, notice: "黑方行动" };
}

export function startMatchClock(state: MatchState, duration: number, now = Date.now()): MatchState {
  return {
    ...state,
    clock: { blackMs: duration, whiteMs: duration, activeSince: now },
    clockConfigMs: duration,
    timedOutPlayer: null,
  };
}

export function startRankedClock(state: MatchState, now = Date.now()): MatchState {
  if (state.game === "reversi") return state;
  return startMatchClock(state, RANK_TURN_MS[state.game], now);
}

export function projectMatchClock(state: MatchState, now = Date.now()): MatchState {
  if (state.status !== "playing" || !state.clock || state.clock.activeSince === null) return state;
  const elapsed = Math.max(0, now - state.clock.activeSince);
  const key = state.turn === "black" ? "blackMs" : "whiteMs";
  const remaining = Math.max(0, state.clock[key] - elapsed);
  const clock = { ...state.clock, [key]: remaining, activeSince: now } as MatchClock;
  if (remaining > 0) return { ...state, clock };
  const winner = opponent(state.turn);
  return {
    ...state,
    status: "ended",
    winner,
    timedOutPlayer: state.turn,
    undoRequest: null,
    clock: { ...clock, activeSince: null },
    notice: `${playerName(state.turn)}本手用时耗尽，${playerName(winner)}获胜`,
  };
}

export function applyMatchAction(state: MatchState, player: MatchPlayer, action: MatchAction): MatchState {
  if (action.type === "reset") {
    const reset = activateMatch(createMatchState(state.game, state.size, state.hostColorPreference, state.gomokuForbidden));
    return state.clockConfigMs ? startMatchClock(reset, state.clockConfigMs) : reset;
  }
  if (action.type === "requestUndo") return requestUndo(state, player);
  if (action.type === "cancelUndo") return cancelUndo(state, player);
  if (action.type === "respondUndo") return respondUndo(state, player, action.accept);
  if (action.type === "requestRematch") return requestRematch(state, player);
  if (action.type === "cancelRematch") return cancelRematch(state, player);
  if (action.type === "respondRematch") return respondRematch(state, player, action.accept);
  if (action.type === "resign") {
    if (state.status === "waiting") throw new MatchRuleError("waiting_for_opponent", "等待另一位玩家加入房间");
    if (state.status === "ended") throw new MatchRuleError("match_ended", "本局已经结束");
    const winner = opponent(player);
    return {
      ...state,
      status: "ended",
      winner,
      resignedPlayer: player,
      undoRequest: null,
      clock: state.clock ? { ...state.clock, activeSince: null } : undefined,
      notice: `${playerName(player)}认输，${playerName(winner)}获胜`,
    };
  }
  if (state.status === "waiting") throw new MatchRuleError("waiting_for_opponent", "等待另一位玩家加入房间");
  if (state.status === "ended") throw new MatchRuleError("match_ended", "本局已经结束");
  if (state.status === "scoring") {
    if (state.game !== "go") throw new MatchRuleError("invalid_scoring_state", "当前棋局无法数子");
    if (action.type === "markDead") return markDeadGroup(state, player, action.row, action.col);
    if (action.type === "confirmScore") return confirmGoScore(state, player);
    if (action.type === "resumeGo") {
      const next = resumeGo(state, player);
      return { ...next, moves: [...(state.moves ?? []), { type: "resumeGo", player }] };
    }
    throw new MatchRuleError("scoring_in_progress", "正在数子，请先确认结果或继续对局");
  }
  if (action.type === "markDead" || action.type === "confirmScore" || action.type === "resumeGo") {
    throw new MatchRuleError("not_scoring", "双方停一手后才能进入数子");
  }
  if (state.undoRequest) throw new MatchRuleError("undo_pending", "请先处理当前悔棋请求");
  if (state.turn !== player) throw new MatchRuleError("not_your_turn", "还没轮到你落子");
  const snapshot = createSnapshot(state);
  let next: MatchState;
  if (action.type === "pass") {
    if (state.game !== "go") throw new MatchRuleError("pass_not_allowed", "当前游戏不能停一手");
    next = passGo(state);
  } else {
    if (!inside(state.board, action.row, action.col)) throw new MatchRuleError("outside_board", "落子位置超出棋盘");
    if (state.board[action.row][action.col]) throw new MatchRuleError("occupied", "这个位置已经有棋子");
    if (state.game === "go") next = playGo(state, action.row, action.col);
    else if (state.game === "gomoku") next = playGomoku(state, action.row, action.col);
    else next = playReversi(state, action.row, action.col);
  }
  return {
    ...next,
    moves: [
      ...(state.moves ?? []),
      action.type === "pass"
        ? { type: "pass", player }
        : { type: "play", row: action.row, col: action.col, player },
    ],
    lastPlayer: player,
    undoRequest: null,
    undoSnapshot: snapshot,
    clock: next.clock && next.clockConfigMs
      ? next.status === "playing"
        ? { blackMs: next.clockConfigMs, whiteMs: next.clockConfigMs, activeSince: Date.now() }
        : { ...next.clock, activeSince: null }
      : undefined,
  };
}

function createSnapshot(state: MatchState): MatchSnapshot {
  const snapshot: MatchState = {
    ...state,
    board: copyBoard(state.board),
    captures: state.captures ? { ...state.captures } : undefined,
    history: state.history ? [...state.history] : undefined,
    moves: state.moves ? state.moves.map((move) => ({ ...move })) : undefined,
    finalScore: state.finalScore ? { ...state.finalScore } : undefined,
    goScoring: state.goScoring ? { dead: state.goScoring.dead.map((point) => [...point] as MatchPoint), confirmations: [...state.goScoring.confirmations] } : undefined,
  };
  delete snapshot.undoRequest;
  delete snapshot.undoSnapshot;
  delete snapshot.rematchRequest;
  return snapshot;
}

function requestUndo(state: MatchState, player: MatchPlayer): MatchState {
  if (state.status === "waiting") throw new MatchRuleError("waiting_for_opponent", "等待另一位玩家加入房间");
  if (state.undoRequest) throw new MatchRuleError("undo_pending", "已经有一个悔棋请求等待处理");
  if (!state.undoSnapshot || !state.lastPlayer) throw new MatchRuleError("nothing_to_undo", "当前没有可以撤销的落子");
  if (state.lastPlayer !== player) throw new MatchRuleError("undo_not_yours", "只能由刚刚落子的一方发起悔棋");
  return { ...state, undoRequest: { requester: player }, notice: `${playerName(player)}申请悔棋` };
}

function cancelUndo(state: MatchState, player: MatchPlayer): MatchState {
  if (!state.undoRequest) throw new MatchRuleError("no_undo_request", "当前没有待处理的悔棋请求");
  if (state.undoRequest.requester !== player) throw new MatchRuleError("undo_not_requester", "只有发起方可以取消悔棋");
  return { ...state, undoRequest: null, notice: `${playerName(player)}取消了悔棋` };
}

function respondUndo(state: MatchState, player: MatchPlayer, accept: boolean): MatchState {
  const request = state.undoRequest;
  if (!request) throw new MatchRuleError("no_undo_request", "当前没有待处理的悔棋请求");
  if (request.requester === player) throw new MatchRuleError("undo_self_response", "需要等待对手处理悔棋请求");
  if (!accept) return { ...state, undoRequest: null, notice: `${playerName(player)}拒绝了悔棋` };
  if (!state.undoSnapshot) throw new MatchRuleError("nothing_to_undo", "上一手棋局快照已经失效");
  const restoredClock = state.undoSnapshot.clock && state.undoSnapshot.clockConfigMs
    ? { blackMs: state.undoSnapshot.clockConfigMs, whiteMs: state.undoSnapshot.clockConfigMs, activeSince: Date.now() }
    : undefined;
  return { ...state.undoSnapshot, undoRequest: null, undoSnapshot: null, lastPlayer: null, clock: restoredClock, notice: "双方同意，已撤销上一手" };
}

function requestRematch(state: MatchState, player: MatchPlayer): MatchState {
  if (state.status !== "ended") throw new MatchRuleError("match_not_ended", "本局结束后才能发起再战");
  if (state.departedPlayer) throw new MatchRuleError("opponent_departed", "对手已经离开，无法发起再战");
  if (state.rematchRequest) throw new MatchRuleError("rematch_pending", "再战请求正在等待处理");
  return { ...state, rematchRequest: { requester: player }, notice: `${playerName(player)}发起再战` };
}

function cancelRematch(state: MatchState, player: MatchPlayer): MatchState {
  if (!state.rematchRequest) throw new MatchRuleError("no_rematch_request", "当前没有待处理的再战请求");
  if (state.rematchRequest.requester !== player) throw new MatchRuleError("rematch_not_requester", "只有发起方可以取消再战");
  return { ...state, rematchRequest: null, notice: `${playerName(player)}取消了再战请求` };
}

function respondRematch(state: MatchState, player: MatchPlayer, accept: boolean): MatchState {
  const request = state.rematchRequest;
  if (!request) throw new MatchRuleError("no_rematch_request", "当前没有待处理的再战请求");
  if (request.requester === player) throw new MatchRuleError("rematch_self_response", "需要等待对手处理再战请求");
  if (!accept) return { ...state, rematchRequest: null, notice: `${playerName(player)}拒绝了再战` };
  const reset = activateMatch(createMatchState(state.game, state.size, state.hostColorPreference, state.gomokuForbidden));
  return state.clockConfigMs ? startMatchClock(reset, state.clockConfigMs) : reset;
}

function groupAt(board: MatchStone[][], row: number, col: number) {
  const color = board[row][col];
  const stones: MatchPoint[] = [];
  const liberties = new Set<string>();
  if (!color) return { stones, liberties };
  const seen = new Set<string>();
  const stack: MatchPoint[] = [[row, col]];
  while (stack.length) {
    const [currentRow, currentCol] = stack.pop() as MatchPoint;
    const key = `${currentRow}-${currentCol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stones.push([currentRow, currentCol]);
    for (const [dr, dc] of orthogonal) {
      const nextRow = currentRow + dr;
      const nextCol = currentCol + dc;
      if (!inside(board, nextRow, nextCol)) continue;
      const neighbor = board[nextRow][nextCol];
      if (!neighbor) liberties.add(`${nextRow}-${nextCol}`);
      else if (neighbor === color && !seen.has(`${nextRow}-${nextCol}`)) stack.push([nextRow, nextCol]);
    }
  }
  return { stones, liberties };
}

function playGo(state: MatchState, row: number, col: number): MatchState {
  const board = copyBoard(state.board);
  const player = state.turn;
  const rival = opponent(player);
  board[row][col] = player;
  let captured = 0;
  for (const [dr, dc] of orthogonal) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (!inside(board, nextRow, nextCol) || board[nextRow][nextCol] !== rival) continue;
    const group = groupAt(board, nextRow, nextCol);
    if (group.liberties.size === 0) {
      group.stones.forEach(([stoneRow, stoneCol]) => { board[stoneRow][stoneCol] = null; });
      captured += group.stones.length;
    }
  }
  if (groupAt(board, row, col).liberties.size === 0) throw new MatchRuleError("suicide", "这里是禁入点，不能自杀落子");
  const key = boardKey(board);
  const history = state.history ?? [];
  if (history.includes(key)) throw new MatchRuleError("superko", "全局同形禁着，不能让棋盘回到之前出现过的局面");
  const captures = { ...(state.captures ?? { black: 0, white: 0 }) };
  captures[player] += captured;
  return { ...state, board, turn: rival, captures, passes: 0, history: [...history, key], lastMove: [row, col] as MatchPoint, notice: captured ? `${playerName(player)}提 ${captured} 子` : `${playerName(rival)}行动` };
}

function passGo(state: MatchState): MatchState {
  if ((state.passes ?? 0) === 1) {
    return { ...state, status: "scoring" as const, passes: 2, goScoring: { dead: [], confirmations: [] }, notice: "双方已停一手，请标记死子并确认数目" };
  }
  const rival = opponent(state.turn);
  return { ...state, turn: rival, passes: 1, history: [...(state.history ?? []), boardKey(state.board)], notice: `${playerName(state.turn)}停一手，${playerName(rival)}行动` };
}

function markDeadGroup(state: MatchState, player: MatchPlayer, row: number, col: number): MatchState {
  if (!inside(state.board, row, col)) throw new MatchRuleError("outside_board", "选择位置超出棋盘");
  if (!state.board[row][col]) throw new MatchRuleError("empty_group", "请点选要标记的棋子");
  const scoring = state.goScoring ?? { dead: [], confirmations: [] };
  const group = groupAt(state.board, row, col).stones;
  const dead = new Set(scoring.dead.map(([r, c]) => `${r}-${c}`));
  const removing = group.every(([r, c]) => dead.has(`${r}-${c}`));
  group.forEach(([r, c]) => removing ? dead.delete(`${r}-${c}`) : dead.add(`${r}-${c}`));
  const nextDead = [...dead].map((key) => key.split("-").map(Number) as MatchPoint);
  return { ...state, goScoring: { dead: nextDead, confirmations: [] }, notice: `${playerName(player)}调整了死子标记，请双方重新确认` };
}

function confirmGoScore(state: MatchState, player: MatchPlayer): MatchState {
  const scoring = state.goScoring ?? { dead: [], confirmations: [] };
  if (scoring.confirmations.includes(player)) throw new MatchRuleError("score_already_confirmed", "你已经确认过当前数子结果");
  const confirmations = [...scoring.confirmations, player];
  if (confirmations.length < 2) {
    return { ...state, goScoring: { ...scoring, confirmations }, notice: `${playerName(player)}已确认，等待对手确认数目` };
  }
  const board = copyBoard(state.board);
  scoring.dead.forEach(([row, col]) => { board[row][col] = null; });
  const finalScore = scoreGo(board);
  const winner: MatchWinner = finalScore.black === finalScore.white ? "draw" : finalScore.black > finalScore.white ? "black" : "white";
  return {
    ...state,
    status: "ended",
    winner,
    finalScore,
    goScoring: { dead: scoring.dead, confirmations },
    notice: winner === "draw" ? "双方确认，本局平局" : `双方确认数目，${playerName(winner)}获胜`,
  };
}

function resumeGo(state: MatchState, player: MatchPlayer): MatchState {
  const turn = opponent(state.turn);
  return {
    ...state,
    status: "playing",
    turn,
    passes: 0,
    goScoring: null,
    clock: state.clock && state.clockConfigMs
      ? { blackMs: state.clockConfigMs, whiteMs: state.clockConfigMs, activeSince: Date.now() }
      : undefined,
    notice: `${playerName(player)}要求继续对局，${playerName(turn)}行动`,
  };
}

function scoreGo(board: MatchStone[][]) {
  let black = 0;
  let white = 6.5;
  const seen = new Set<string>();
  board.forEach((line, row) => line.forEach((stone, col) => {
    if (stone === "black") black += 1;
    if (stone === "white") white += 1;
    if (stone || seen.has(`${row}-${col}`)) return;
    const region: MatchPoint[] = [];
    const borders = new Set<MatchPlayer>();
    const stack: MatchPoint[] = [[row, col]];
    while (stack.length) {
      const [r, c] = stack.pop() as MatchPoint;
      const key = `${r}-${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      region.push([r, c]);
      for (const [dr, dc] of orthogonal) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inside(board, nr, nc)) continue;
        const neighbor = board[nr][nc];
        if (neighbor) borders.add(neighbor);
        else if (!seen.has(`${nr}-${nc}`)) stack.push([nr, nc]);
      }
    }
    if (borders.size === 1) {
      if (borders.has("black")) black += region.length;
      else if (borders.has("white")) white += region.length;
    }
  }));
  return { black, white };
}

function playGomoku(state: MatchState, row: number, col: number): MatchState {
  const board = copyBoard(state.board);
  const player = state.turn;
  if (state.gomokuForbidden && player === "black") {
    const blacks: MatchPoint[] = [];
    const whites: MatchPoint[] = [];
    state.board.forEach((line, boardRow) => line.forEach((stone, boardCol) => {
      if (stone === "black") blacks.push([boardCol, boardRow]);
      if (stone === "white") whites.push([boardCol, boardRow]);
    }));
    const forbidden = wrapRenjuBoard(makeRenjuBoard(blacks, whites)).forbidden([col, row]) ?? detectRenjuForbidden(state.board, row, col);
    if (forbidden) throw forbiddenMoveError(forbidden);
  }
  board[row][col] = player;
  if (hasFive(board, row, col, player)) return { ...state, board, status: "ended" as const, winner: player, lastMove: [row, col] as MatchPoint, notice: `${playerName(player)}获胜` };
  const full = board.flat().every(Boolean);
  if (full) return { ...state, board, status: "ended" as const, winner: "draw" as const, lastMove: [row, col] as MatchPoint, notice: "本局平局" };
  const rival = opponent(player);
  return { ...state, board, turn: rival, lastMove: [row, col] as MatchPoint, notice: `${playerName(rival)}行动` };
}

function forbiddenMoveError(kind: ForbiddenKind) {
  const labels: Record<ForbiddenKind, string> = { overline: "长连", doubleThree: "三三", doubleFour: "四四" };
  return new MatchRuleError("gomoku_forbidden", `这里是${labels[kind]}禁手，黑方不能落子`);
}

function detectRenjuForbidden(source: MatchStone[][], row: number, col: number): ForbiddenKind | undefined {
  const board = copyBoard(source);
  board[row][col] = "black";
  const directions: MatchPoint[] = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const lineLength = (dr: number, dc: number) => {
    let count = 1;
    for (const sign of [-1, 1]) {
      let step = 1;
      while (board[row + dr * step * sign]?.[col + dc * step * sign] === "black") { count += 1; step += 1; }
    }
    return count;
  };
  const winningPoints = (dr: number, dc: number) => {
    let wins = 0;
    for (let offset = -5; offset <= 5; offset += 1) {
      const targetRow = row + dr * offset;
      const targetCol = col + dc * offset;
      if (!inside(board, targetRow, targetCol) || board[targetRow][targetCol]) continue;
      board[targetRow][targetCol] = "black";
      if (lineLength(dr, dc) === 5) wins += 1;
      board[targetRow][targetCol] = null;
    }
    return wins;
  };

  const lengths = directions.map(([dr, dc]) => lineLength(dr, dc));
  if (lengths.some((length) => length > 5)) return "overline";
  if (lengths.some((length) => length === 5)) return undefined;
  if (directions.filter(([dr, dc]) => winningPoints(dr, dc) > 0).length >= 2) return "doubleFour";

  let openThrees = 0;
  for (const [dr, dc] of directions) {
    let createsOpenFour = false;
    for (let offset = -4; offset <= 4 && !createsOpenFour; offset += 1) {
      const targetRow = row + dr * offset;
      const targetCol = col + dc * offset;
      if (!inside(board, targetRow, targetCol) || board[targetRow][targetCol]) continue;
      board[targetRow][targetCol] = "black";
      createsOpenFour = lineLength(dr, dc) < 5 && winningPoints(dr, dc) >= 2;
      board[targetRow][targetCol] = null;
    }
    if (createsOpenFour) openThrees += 1;
  }
  return openThrees >= 2 ? "doubleThree" : undefined;
}

function hasFive(board: MatchStone[][], row: number, col: number, player: MatchPlayer) {
  for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]] as MatchPoint[]) {
    let count = 1;
    for (const direction of [-1, 1]) {
      let step = 1;
      while (board[row + dr * step * direction]?.[col + dc * step * direction] === player) { count += 1; step += 1; }
    }
    if (count >= 5) return true;
  }
  return false;
}

function reversiFlips(board: MatchStone[][], row: number, col: number, player: MatchPlayer) {
  if (board[row][col]) return [] as MatchPoint[];
  const rival = opponent(player);
  const flips: MatchPoint[] = [];
  for (const [dr, dc] of allDirections) {
    const path: MatchPoint[] = [];
    let nextRow = row + dr;
    let nextCol = col + dc;
    while (inside(board, nextRow, nextCol) && board[nextRow][nextCol] === rival) { path.push([nextRow, nextCol]); nextRow += dr; nextCol += dc; }
    if (path.length && inside(board, nextRow, nextCol) && board[nextRow][nextCol] === player) flips.push(...path);
  }
  return flips;
}

function hasReversiMove(board: MatchStone[][], player: MatchPlayer) {
  return board.some((line, row) => line.some((_, col) => reversiFlips(board, row, col, player).length > 0));
}

function playReversi(state: MatchState, row: number, col: number): MatchState {
  const flips = reversiFlips(state.board, row, col, state.turn);
  if (!flips.length) throw new MatchRuleError("illegal_reversi", "这里不能形成夹击，无法落子");
  const board = copyBoard(state.board);
  const player = state.turn;
  board[row][col] = player;
  flips.forEach(([flipRow, flipCol]) => { board[flipRow][flipCol] = player; });
  const rival = opponent(player);
  if (hasReversiMove(board, rival)) return { ...state, board, turn: rival, lastMove: [row, col] as MatchPoint, notice: `${playerName(rival)}行动` };
  if (hasReversiMove(board, player)) return { ...state, board, lastMove: [row, col] as MatchPoint, notice: `${playerName(rival)}无棋可下，${playerName(player)}继续` };
  const score = board.flat().reduce((result, stone) => { if (stone) result[stone] += 1; return result; }, { black: 0, white: 0 });
  const winner: MatchWinner = score.black === score.white ? "draw" : score.black > score.white ? "black" : "white";
  return { ...state, board, status: "ended", winner, finalScore: score, lastMove: [row, col], notice: winner === "draw" ? "本局平局" : `${playerName(winner)}获胜` };
}
