import type { MatchGame, MatchPlayer, MatchState, MatchWinner } from "./match-engine.ts";

export const MICOSM_GAME_FILE_FORMAT = "micosm-game-record" as const;
export const MICOSM_GAME_FILE_VERSION = 1 as const;
export const MICOSM_GAME_FILE_EXTENSION = ".micosm";
export const MICOSM_GAME_FILE_MIME = "application/vnd.micosm.game+json";
export const MAX_GAME_FILE_BYTES = 512 * 1024;

export type GameRecordMode = "private" | "matchmaking" | "ranked" | "ai";
export type GameRecordReason = "win" | "draw" | "score" | "resign" | "departure" | "timeout";

export type GameRecordSnapshot = {
  title: string;
  game: MatchGame;
  mode: GameRecordMode;
  boardSize: number;
  viewerRole: MatchPlayer;
  players: { black: string; white: string };
  winner: MatchWinner;
  reason: GameRecordReason;
  state: MatchState;
  startedAt: number;
  endedAt: number;
};

export type MicosmGameFile = {
  format: typeof MICOSM_GAME_FILE_FORMAT;
  version: typeof MICOSM_GAME_FILE_VERSION;
  exportedAt: number;
  record: GameRecordSnapshot;
};

export class GameRecordFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameRecordFormatError";
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GameRecordFormatError("棋谱结构不完整");
  return value as Record<string, unknown>;
}

function textValue(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new GameRecordFormatError(`${label}格式错误`);
  const text = value.normalize("NFKC").trim().slice(0, maxLength);
  if (!text) throw new GameRecordFormatError(`${label}不能为空`);
  return text;
}

function timeValue(value: unknown, label: string) {
  const time = Number(value);
  if (!Number.isSafeInteger(time) || time < 0 || time > 8_640_000_000_000_000) throw new GameRecordFormatError(`${label}格式错误`);
  return time;
}

function boardSizeForGame(game: MatchGame, value: unknown) {
  const size = Number(value);
  const valid = game === "go" ? [9, 13, 19].includes(size) : game === "gomoku" ? size === 15 : size === 8;
  if (!valid) throw new GameRecordFormatError("棋盘尺寸不受支持");
  return size;
}

function validateState(value: unknown, game: MatchGame, size: number, winner: MatchWinner) {
  const state = objectValue(value);
  if (state.game !== game || Number(state.size) !== size) throw new GameRecordFormatError("棋谱与棋盘信息不一致");
  if (state.status !== "ended" || state.winner !== winner) throw new GameRecordFormatError("只能导入已经结束的完整棋局");
  if (!Array.isArray(state.board) || state.board.length !== size) throw new GameRecordFormatError("棋盘数据不完整");
  for (const row of state.board) {
    if (!Array.isArray(row) || row.length !== size || row.some((stone) => stone !== null && stone !== "black" && stone !== "white")) {
      throw new GameRecordFormatError("棋盘数据包含无效棋子");
    }
  }
  if (!Array.isArray(state.moves) || state.moves.length > 4096) throw new GameRecordFormatError("落子记录不完整或过长");
  for (const rawMove of state.moves) {
    const move = objectValue(rawMove);
    if (move.player !== "black" && move.player !== "white") throw new GameRecordFormatError("落子方信息错误");
    if (move.type !== "play" && move.type !== "pass" && move.type !== "resumeGo") throw new GameRecordFormatError("棋谱包含未知操作");
    if (move.type === "play") {
      if (!Number.isInteger(move.row) || !Number.isInteger(move.col) || Number(move.row) < 0 || Number(move.col) < 0 || Number(move.row) >= size || Number(move.col) >= size) {
        throw new GameRecordFormatError("落子坐标超出棋盘");
      }
    }
  }
  return JSON.parse(JSON.stringify(state)) as MatchState;
}

export function parseMicosmGameFile(value: unknown): MicosmGameFile {
  let byteLength = 0;
  try {
    byteLength = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    throw new GameRecordFormatError("棋谱文件无法读取");
  }
  if (byteLength > MAX_GAME_FILE_BYTES) throw new GameRecordFormatError("棋谱文件超过 512 KB");

  const file = objectValue(value);
  if (file.format !== MICOSM_GAME_FILE_FORMAT) throw new GameRecordFormatError("这不是 Micosm 棋谱文件");
  if (file.version !== MICOSM_GAME_FILE_VERSION) throw new GameRecordFormatError("这个棋谱版本暂不支持");
  const record = objectValue(file.record);
  const game = record.game;
  if (game !== "go" && game !== "gomoku" && game !== "reversi") throw new GameRecordFormatError("棋种不受支持");
  const mode = record.mode;
  if (mode !== "private" && mode !== "matchmaking" && mode !== "ranked" && mode !== "ai") throw new GameRecordFormatError("对局模式不受支持");
  const viewerRole = record.viewerRole;
  if (viewerRole !== "black" && viewerRole !== "white") throw new GameRecordFormatError("执色信息错误");
  const winner = record.winner;
  if (winner !== "black" && winner !== "white" && winner !== "draw") throw new GameRecordFormatError("胜负信息错误");
  const reason = record.reason;
  if (reason !== "win" && reason !== "draw" && reason !== "score" && reason !== "resign" && reason !== "departure" && reason !== "timeout") {
    throw new GameRecordFormatError("终局方式不受支持");
  }
  const boardSize = boardSizeForGame(game, record.boardSize);
  const players = objectValue(record.players);
  const startedAt = timeValue(record.startedAt, "开始时间");
  const endedAt = timeValue(record.endedAt, "结束时间");
  if (endedAt < startedAt) throw new GameRecordFormatError("棋谱时间顺序错误");

  return {
    format: MICOSM_GAME_FILE_FORMAT,
    version: MICOSM_GAME_FILE_VERSION,
    exportedAt: timeValue(file.exportedAt, "导出时间"),
    record: {
      title: textValue(record.title, "棋谱标题", 80),
      game,
      mode,
      boardSize,
      viewerRole,
      players: {
        black: textValue(players.black, "黑方名称", 24),
        white: textValue(players.white, "白方名称", 24),
      },
      winner,
      reason,
      state: validateState(record.state, game, boardSize, winner),
      startedAt,
      endedAt,
    },
  };
}

export function createMicosmGameFile(record: GameRecordSnapshot, exportedAt = Date.now()) {
  return parseMicosmGameFile({ format: MICOSM_GAME_FILE_FORMAT, version: MICOSM_GAME_FILE_VERSION, exportedAt, record });
}

export function gameRecordFilename(file: MicosmGameFile) {
  const game = file.record.game === "go" ? "go" : file.record.game === "gomoku" ? "gomoku" : "reversi";
  const date = new Date(file.record.endedAt).toISOString().slice(0, 10).replaceAll("-", "");
  return `micosm-${game}-${date}${MICOSM_GAME_FILE_EXTENSION}`;
}
