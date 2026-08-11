"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Bell,
  Bot,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  Clock3,
  Copy,
  Download,
  Gamepad2,
  Flag,
  Globe2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  Moon,
  MessageCircle,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ScanLine,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Star,
  Smartphone,
  Sparkles,
  Sun,
  Trophy,
  Trash2,
  Undo2,
  UserRound,
  Users,
  Volume2,
  Waypoints,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { activateMatch, applyMatchAction, createMatchState, scoreGoPosition, type AiDifficulty, type ColorPreference, type MatchAction, type MatchGame, type MatchState as RemoteMatchState, type SpectatorPolicy } from "../lib/match-engine";
import { RANK_NAMES, rankLabel } from "../lib/rank";
import { STORY_SEASON_ONE, STORY_SEASON_TITLE } from "../lib/story-season-one";
import { ModerationPanel } from "../components/ModerationPanel";
import { usePlatformRealtime } from "../hooks/usePlatformRealtime";
import { useMobileApp } from "../hooks/useMobileApp";

const STORY_MODE_ENABLED = false;

type GameId = "gomoku" | "go" | "reversi";
type Player = "black" | "white";
type Stone = Player | null;
type Point = [number, number];
type RoomView = {
  id: string;
  game: MatchGame;
  mode: "private" | "matchmaking" | "ranked" | "ai";
  spectatorPolicy: SpectatorPolicy;
  role: Player | null;
  rolePending: boolean;
  opponentReady: boolean;
  players: { black: string | null; white: string | null };
  profiles: { black: PlayerProfile | null; white: PlayerProfile | null };
  version: number;
  state: RemoteMatchState;
  rankResult?: { delta: number; rating: number } | null;
};
type MatchOutcome = {
  key: string;
  title: string;
  detail: string;
  kind: "result" | "departure";
  mode: RoomView["mode"];
  game: MatchGame;
  won: boolean;
};
type ReviewFrame = {
  board: Stone[][];
  turn: Player;
  lastMove: Point | null;
  actor: Player | null;
  moveNumber: number;
  description: string;
  insight?: { title: string; detail: string; tone: "info" | "good" | "warning"; points?: Point[] };
};
type MatchReview = { frames: ReviewFrame[]; index: number; outcome: MatchOutcome };
type ConfirmIntent = "leave" | "reset" | "resign" | null;
type ConnectionState = "idle" | "online" | "reconnecting";
type ToastTone = "info" | "success" | "warning";
type PlayerProfile = { avatarUrl: string | null; signature: string };
type AuthUser = PlayerProfile & { id: string; publicId: string; phone: string; displayName: string; avatarKey: string | null; hasPassword: boolean; role: "player" | "admin" };
type GamePreferences = {
  appearance: "light" | "dark";
  soundEnabled: boolean;
  motionEnabled: boolean;
  showMoveHints: boolean;
  showLastMove: boolean;
  confirmRestart: boolean;
};
type AppNotification = { id: number; message: string };
type FriendPerson = PlayerProfile & { id: string; publicId: string; displayName: string; online: boolean };
type FriendSearchResult = FriendPerson & { relationship: "none" | "friend" | "incoming" | "outgoing" | "blocked" | "blocked_by_other" };
type GameInvite = FriendPerson & { inviteId: string; roomId: string; game: GameId; expiresAt: number };
type FriendsData = {
  friends: FriendPerson[];
  incomingRequests: FriendPerson[];
  outgoingRequests: FriendPerson[];
  blocked: FriendPerson[];
  recent: FriendPerson[];
  gameInvites: GameInvite[];
};
type FriendTab = "friends" | "requests" | "blocked";
type FriendConfirm = { type: "removeFriend" | "blockUser"; person: FriendPerson } | null;
type ChatChannel = "world" | "direct";
type LobbyHall = "main" | GameId;
type ChatMessage = {
  id: string;
  channel: ChatChannel;
  hall: LobbyHall;
  body: string;
  createdAt: number;
  isMine: boolean;
  sender: { id: string; displayName: string; signature: string; avatarUrl: string | null };
  room: { id: string; game: string; open: boolean } | null;
};
type LobbyRoom = {
  id: string;
  game: GameId;
  mode: "private" | "matchmaking";
  spectatorPolicy: SpectatorPolicy;
  status: RemoteMatchState["status"];
  turn: Player;
  moveCount: number;
  boardSize: number;
  board: Stone[][];
  lastMove: Point | null;
  players: { black: string | null; white: string | null };
  profiles: { black: { avatarUrl: string | null }; white: { avatarUrl: string | null } };
  joinable: boolean;
  spectatable: boolean;
  spectatorCount: number;
  updatedAt: number;
};
type LobbyCounts = Record<LobbyHall, number>;
type ChatOverview = { worldUnread: number; directUnreads: Record<string, number> };
type RankGame = "go" | "gomoku";
type RankProfile = {
  game: RankGame;
  rating: number;
  peakRating: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  matches: number;
  label: string;
  progress: { current: number; required: number };
};
type RankLeaderboardEntry = { position: number; userId: string; publicId: string; displayName: string; signature: string; avatarUrl: string | null; rating: number; label: string; wins: number; losses: number; matches: number; isMe: boolean };
type RankData = { profiles: Record<RankGame, RankProfile>; position: number | null; leaderboard: RankLeaderboardEntry[] };
type HistoryRecord = {
  id: string;
  roomId: string;
  game: MatchGame;
  mode: RoomView["mode"];
  boardSize: number;
  role: Player;
  opponent: { name: string; avatarUrl: string | null };
  players: { black: string; white: string };
  winner: Player | "draw";
  result: "win" | "loss" | "draw";
  reason: "win" | "draw" | "score" | "resign" | "departure" | "timeout";
  moveCount: number;
  finalScore: { black: number; white: number } | null;
  startedAt: number;
  endedAt: number;
};
type HistoryRecordDetail = HistoryRecord & { state: RemoteMatchState };
type HistoryReview = { record: HistoryRecordDetail; frames: ReviewFrame[]; index: number };

const RANK_EMBLEMS = [
  "/ranks/dust-star.webp",
  "/ranks/faint-glow.webp",
  "/ranks/star-track.webp",
  "/ranks/moon-ring.webp",
  "/ranks/radiant-star.webp",
  "/ranks/star-vault.webp",
  "/ranks/sky-veil.webp",
  "/ranks/boundless.webp",
];
const RANK_MOTTO = [
  "第一粒尘星，也会拥有自己的轨迹",
  "微光虽小，已经足以照见下一手",
  "棋路相连，星轨从这里开始延伸",
  "月影成环，学会读懂局面的留白",
  "曜光落子，主动掌握棋局的节奏",
  "群星成穹，每一步都自有回响",
  "越过天幕，胜负只在一念之间",
  "无垠之后，仍有新的星辰可抵达",
];

const defaultPreferences: GamePreferences = {
  appearance: "light",
  soundEnabled: true,
  motionEnabled: true,
  showMoveHints: true,
  showLastMove: true,
  confirmRestart: true,
};

const emptyFriendsData: FriendsData = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blocked: [],
  recent: [],
  gameInvites: [],
};

const gameCatalog: Array<{
  id: GameId;
  title: string;
  subtitle: string;
  badge: string;
  color: string;
}> = [
  { id: "go", title: "围棋", subtitle: "9 / 13 / 19 路", badge: "双人", color: "violet" },
  { id: "gomoku", title: "五子棋", subtitle: "15 路标准棋盘", badge: "双人", color: "amber" },
  { id: "reversi", title: "黑白棋", subtitle: "8 × 8 标准棋盘", badge: "双人", color: "green" },
];

const aiDifficultyOptions: Array<{ id: AiDifficulty; name: string; title: string; detail: string }> = [
  { id: "easy", name: "星芽", title: "入门", detail: "会看基本落点，适合熟悉规则" },
  { id: "normal", name: "微光", title: "标准", detail: "能攻能守，适合日常练习" },
  { id: "hard", name: "曜辰", title: "高手", detail: "更深搜索，失误会被及时惩罚" },
  { id: "master", name: "无垠", title: "极限", detail: "启用独立神经网络棋力引擎" },
];

const reversiDirections: Point[] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1],
  [0, 1], [1, -1], [1, 0], [1, 1],
];

function makeBoard(size: number): Stone[][] {
  return Array.from({ length: size }, () => Array<Stone>(size).fill(null));
}

function makeReversiBoard(): Stone[][] {
  const board = makeBoard(8);
  board[3][3] = "white";
  board[3][4] = "black";
  board[4][3] = "black";
  board[4][4] = "white";
  return board;
}

function createClientRequestId() {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues === "function") {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function formatMatchClock(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function roomCodeFromScan(value: string) {
  let candidate = value.trim().toUpperCase();
  try {
    candidate = new URL(value).searchParams.get("room")?.trim().toUpperCase() ?? candidate;
  } catch {
    // Raw six-character invitation codes are accepted too.
  }
  return /^[A-HJ-NP-Z2-9]{6}$/.test(candidate) ? candidate : "";
}

async function qrPhotoCanvas(file: File) {
  const maxEdge = 2560;
  let source: CanvasImageSource;
  let width = 0;
  let height = 0;
  let release: (() => void) | undefined;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    release = () => bitmap.close();
  } catch {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("照片加载失败"));
        image.src = objectUrl;
      });
      source = image;
      width = image.naturalWidth;
      height = image.naturalHeight;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  if (!width || !height) {
    release?.();
    throw new Error("无法读取照片尺寸，请重新拍摄二维码");
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    release?.();
    throw new Error("当前浏览器无法处理照片，请改用邀请码");
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  release?.();
  return canvas;
}

function qrScanErrorMessage(error: unknown) {
  const message = error instanceof Error ? String(error.message ?? "") : String(error ?? "");
  if (message.includes("照片") || message.includes("浏览器")) return message;
  if (message.includes("Dimensions")) return "照片还没有加载完成，请重新拍摄二维码";
  return "没有识别到有效的房间二维码，请对准二维码后重新拍摄";
}

function otherPlayer(player: Player): Player {
  return player === "black" ? "white" : "black";
}

function playerName(player: Player) {
  return player === "black" ? "黑方" : "白方";
}

function inBoard(board: unknown[][], row: number, col: number) {
  return row >= 0 && col >= 0 && row < board.length && col < board.length;
}

function getReversiFlips(board: Stone[][], row: number, col: number, player: Player) {
  if (board[row][col]) return [] as Point[];
  const rival = otherPlayer(player);
  const flips: Point[] = [];
  for (const [dr, dc] of reversiDirections) {
    const path: Point[] = [];
    let nextRow = row + dr;
    let nextCol = col + dc;
    while (inBoard(board, nextRow, nextCol) && board[nextRow][nextCol] === rival) {
      path.push([nextRow, nextCol]);
      nextRow += dr;
      nextCol += dc;
    }
    if (path.length && inBoard(board, nextRow, nextCol) && board[nextRow][nextCol] === player) {
      flips.push(...path);
    }
  }
  return flips;
}

function stoneScore(board: Stone[][]) {
  return board.flat().reduce((score, stone) => {
    if (stone === "black") score.black += 1;
    if (stone === "white") score.white += 1;
    return score;
  }, { black: 0, white: 0 });
}

function starPoints(size: number, game: "go" | "gomoku") {
  if (game === "gomoku") return new Set(["3-3", "3-11", "7-7", "11-3", "11-11"]);
  const positions = size === 19 ? [3, 9, 15] : size === 13 ? [3, 6, 9] : [2, 4, 6];
  return new Set(positions.flatMap((row) => positions.map((col) => `${row}-${col}`)));
}

function copyReviewBoard(board: Stone[][]) {
  return board.map((row) => [...row]);
}

function hasPoint(points: Point[], row: number, col: number) {
  return points.some(([pointRow, pointCol]) => pointRow === row && pointCol === col);
}

function gomokuCompletesFive(board: Stone[][], row: number, col: number, player: Player) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
  return directions.some(([dr, dc]) => {
    let count = 1;
    for (const sign of [-1, 1] as const) {
      let nextRow = row + dr * sign;
      let nextCol = col + dc * sign;
      while (inBoard(board, nextRow, nextCol) && board[nextRow][nextCol] === player) {
        count += 1;
        nextRow += dr * sign;
        nextCol += dc * sign;
      }
    }
    return count >= 5;
  });
}

function gomokuWinningPoints(board: Stone[][], player: Player, forbidden: boolean) {
  const points: Point[] = [];
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board.length; col += 1) {
      if (board[row][col]) continue;
      board[row][col] = player;
      const completesFive = gomokuCompletesFive(board, row, col, player);
      board[row][col] = null;
      if (!completesFive) continue;

      if (!forbidden || player === "white") {
        points.push([row, col]);
        continue;
      }

      const base = activateMatch(createMatchState("gomoku", board.length, "black", true));
      try {
        const next = applyMatchAction({ ...base, board: copyReviewBoard(board), turn: player }, player, { type: "play", row, col });
        if (next.status === "ended" && next.winner === player) points.push([row, col]);
      } catch {
        // Forbidden Renju points are intentionally absent from tactical hints.
      }
    }
  }
  return points;
}

function gomokuForcingMoves(board: Stone[][], player: Player, forbidden: boolean) {
  const points: Point[] = [];
  const occupied = board.flat().filter(Boolean).length;
  if (occupied < 4) return points;
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board.length; col += 1) {
      if (board[row][col]) continue;
      let nearby = false;
      for (let dr = -2; dr <= 2 && !nearby; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          if (inBoard(board, row + dr, col + dc) && board[row + dr][col + dc]) { nearby = true; break; }
        }
      }
      if (!nearby) continue;
      const base = activateMatch(createMatchState("gomoku", 15, "black", forbidden));
      try {
        const next = applyMatchAction({ ...base, board: copyReviewBoard(board), turn: player }, player, { type: "play", row, col });
        if (next.status !== "ended" && gomokuWinningPoints(next.board, player, forbidden).length >= 2) points.push([row, col]);
      } catch {
        // Ignore illegal candidates while searching for forcing continuations.
      }
    }
  }
  return points;
}

function buildReviewFrames(state: RemoteMatchState): ReviewFrame[] {
  const finalFrame: ReviewFrame = {
    board: copyReviewBoard(state.board),
    turn: state.turn,
    lastMove: state.lastMove,
    actor: state.lastPlayer ?? null,
    moveNumber: state.moves?.filter((move) => move.type !== "resumeGo").length ?? 0,
    description: "终局",
  };
  if (!state.moves?.length) return [finalFrame];

  try {
    let replayState: RemoteMatchState = activateMatch(createMatchState(state.game, state.size, "black", Boolean(state.gomokuForbidden)));
    let moveNumber = 0;
    const frames: ReviewFrame[] = [{
      board: copyReviewBoard(replayState.board),
      turn: replayState.turn,
      lastMove: null,
      actor: null,
      moveNumber: 0,
      description: "开局",
    }];
    for (const move of state.moves) {
      let insight: ReviewFrame["insight"];
      const beforeCaptures = replayState.captures ? { ...replayState.captures } : null;
      if (state.game === "gomoku" && move.type === "play") {
        const ownWins = gomokuWinningPoints(replayState.board, move.player, Boolean(state.gomokuForbidden));
        const rivalWins = gomokuWinningPoints(replayState.board, otherPlayer(move.player), Boolean(state.gomokuForbidden));
        if (ownWins.length) {
          insight = hasPoint(ownWins, move.row, move.col)
            ? { title: "抓住直接胜机", detail: `${playerName(move.player)}在可立即连五的位置完成终结。`, tone: "good", points: ownWins }
            : { title: "错失直接胜机", detail: `${playerName(move.player)}原本有 ${ownWins.length} 个立即获胜点，但这一手没有选择它们。`, tone: "warning", points: ownWins };
        } else if (rivalWins.length) {
          insight = hasPoint(rivalWins, move.row, move.col)
            ? { title: rivalWins.length === 1 ? "找到唯一防守" : "化解直接杀棋", detail: `如果不占据这里，${playerName(otherPlayer(move.player))}下一手即可连五。`, tone: "good", points: rivalWins }
            : { title: "漏掉直接威胁", detail: `${playerName(otherPlayer(move.player))}仍保留立即获胜点。`, tone: "warning", points: rivalWins };
        }
      }
      const reversiFlipCount = state.game === "reversi" && move.type === "play" ? getReversiFlips(replayState.board, move.row, move.col, move.player).length : 0;
      const action: MatchAction = move.type === "play"
        ? { type: "play", row: move.row, col: move.col }
        : move.type === "pass" ? { type: "pass" } : { type: "resumeGo" };
      replayState = applyMatchAction(replayState, move.player, action);
      if (move.type !== "resumeGo") moveNumber += 1;
      if (!insight && replayState.status === "ended" && replayState.winner) {
        insight = { title: replayState.winner === "draw" ? "棋局收束为和棋" : "完成终局", detail: replayState.notice, tone: replayState.winner === move.player ? "good" : "info" };
      }
      if (!insight && state.game === "gomoku" && move.type === "play") {
        const nextWins = gomokuWinningPoints(replayState.board, replayState.turn, Boolean(state.gomokuForbidden));
        const actorThreats = gomokuWinningPoints(replayState.board, move.player, Boolean(state.gomokuForbidden));
        if (nextWins.length) {
          insight = { title: `${playerName(replayState.turn)}出现直接胜点`, detail: `下一手有 ${nextWins.length} 个可以立即连五的位置。`, tone: "warning", points: nextWins };
        } else if (actorThreats.length >= 2) {
          insight = { title: "形成双重胜点", detail: `${playerName(move.player)}同时留下 ${actorThreats.length} 个连五点，对手无法全部封住。`, tone: "good", points: actorThreats };
        } else if (actorThreats.length === 1) {
          insight = { title: "形成冲四威胁", detail: `下一方必须占据标记位置，阻止${playerName(move.player)}连五。`, tone: "info", points: actorThreats };
        } else {
          const forcing = gomokuForcingMoves(replayState.board, move.player, Boolean(state.gomokuForbidden));
          if (forcing.length) insight = { title: "保留强制进攻", detail: `${playerName(move.player)}下一轮有 ${forcing.length} 个可以制造双重胜点的延展位置。`, tone: "info", points: forcing.slice(0, 6) };
        }
      }
      if (!insight && state.game === "go" && beforeCaptures && replayState.captures) {
        const captured = replayState.captures[move.player] - beforeCaptures[move.player];
        if (captured > 0) insight = { title: `提取 ${captured} 子`, detail: `${playerName(move.player)}通过收紧气点吃掉了对方棋块。`, tone: "good" };
      }
      if (!insight && reversiFlipCount > 0) {
        insight = { title: `翻转 ${reversiFlipCount} 子`, detail: reversiFlipCount >= 4 ? "这一手获得了较大的即时棋子收益。" : "这一手完成了局部交换。", tone: reversiFlipCount >= 4 ? "good" : "info" };
      }
      frames.push({
        board: copyReviewBoard(replayState.board),
        turn: replayState.turn,
        lastMove: replayState.lastMove,
        actor: move.player,
        moveNumber,
        description: move.type === "play" ? `${playerName(move.player)}落子` : move.type === "pass" ? `${playerName(move.player)}停一手` : "继续对局",
        insight,
      });
    }
    return frames;
  } catch {
    return [finalFrame];
  }
}

export default function HomePage() {
  const [mainView, setMainView] = useState<"games" | "ranked" | "story" | "history">("games");
  const [activeGame, setActiveGame] = useState<GameId>("go");
  const [rankedGame, setRankedGame] = useState<RankGame>("go");
  const [rankData, setRankData] = useState<RankData | null>(null);
  const [rankBusy, setRankBusy] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyReview, setHistoryReview] = useState<HistoryReview | null>(null);
  const [boardScale, setBoardScale] = useState(100);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"signIn" | "register">("signIn");
  const [authError, setAuthError] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
  const [authInviteCode, setAuthInviteCode] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [friendPanelOpen, setFriendPanelOpen] = useState(false);
  const [friendTab, setFriendTab] = useState<FriendTab>("friends");
  const [friendsData, setFriendsData] = useState<FriendsData>(emptyFriendsData);
  const [friendSearch, setFriendSearch] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState<FriendSearchResult[]>([]);
  const [friendBusy, setFriendBusy] = useState("");
  const [friendConfirm, setFriendConfirm] = useState<FriendConfirm>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatChannel, setChatChannel] = useState<ChatChannel>("world");
  const [chatPeer, setChatPeer] = useState<FriendPerson | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatOverview, setChatOverview] = useState<ChatOverview>({ worldUnread: 0, directUnreads: {} });
  const [lobbyHall, setLobbyHall] = useState<LobbyHall>("main");
  const [lobbyRooms, setLobbyRooms] = useState<LobbyRoom[]>([]);
  const [lobbyCounts, setLobbyCounts] = useState<LobbyCounts>({ main: 0, go: 0, gomoku: 0, reversi: 0 });
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const [libraryMenuOpen, setLibraryMenuOpen] = useState(false);
  const [mobileMatchMenuOpen, setMobileMatchMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSetupOpen, setAiSetupOpen] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("normal");
  const [aiColor, setAiColor] = useState<ColorPreference>("black");
  const [aiThinking, setAiThinking] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiRetryNonce, setAiRetryNonce] = useState(0);
  const [aiEngineStatus, setAiEngineStatus] = useState<{ ready: boolean; detail?: string } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileSignature, setProfileSignature] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<File | null>(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = useState<string | null>(null);
  const [profileRemoveAvatar, setProfileRemoveAvatar] = useState(false);
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [scannedRoomCode, setScannedRoomCode] = useState("");
  const [roomInviteUrl, setRoomInviteUrl] = useState("");
  const [roomQrDataUrl, setRoomQrDataUrl] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerImageBusy, setScannerImageBusy] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);
  const [colorPreference, setColorPreference] = useState<ColorPreference>("black");
  const [privateClockEnabled, setPrivateClockEnabled] = useState(false);
  const [privateTurnSeconds, setPrivateTurnSeconds] = useState(60);
  const [privateForbiddenEnabled, setPrivateForbiddenEnabled] = useState(false);
  const [privateSpectatorPolicy, setPrivateSpectatorPolicy] = useState<SpectatorPolicy>("off");
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [actionBusy, setActionBusy] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [confirmIntent, setConfirmIntent] = useState<ConfirmIntent>(null);
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);
  const [boardFeedback, setBoardFeedback] = useState<"move" | "invalid" | null>(null);
  const [pendingMove, setPendingMove] = useState<Point | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<GamePreferences>(defaultPreferences);
  const [outcome, setOutcome] = useState<MatchOutcome | null>(null);
  const [review, setReview] = useState<MatchReview | null>(null);
  const dismissedOutcome = useRef("");
  const completedRemoteMatch = useRef("");
  const pollFailures = useRef(0);
  const toastSequence = useRef(0);
  const previousUndoRequest = useRef<RemoteMatchState["undoRequest"]>(null);
  const previousRematchRequest = useRef<RemoteMatchState["rematchRequest"]>(null);
  const timeoutProbe = useRef("");
  const scannedJoinAttempt = useRef("");
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerCaptureRef = useRef<HTMLInputElement | null>(null);
  const scannerControls = useRef<{ stop: () => void } | null>(null);
  const aiRequest = useRef("");
  const announcedAiPass = useRef("");
  const seenGameInvites = useRef(new Set<string>());
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const mobileChatEndRef = useRef<HTMLDivElement | null>(null);
  const [favorites, setFavorites] = useState<GameId[]>(["go", "gomoku"]);
  const [completed, setCompleted] = useState(0);
  const [ready, setReady] = useState(false);

  const [goSize, setGoSize] = useState(19);
  const [goBoard, setGoBoard] = useState(() => makeBoard(19));

  const [gomokuBoard, setGomokuBoard] = useState(() => makeBoard(15));

  const [reversiBoard, setReversiBoard] = useState(makeReversiBoard);

  const currentRoomId = room?.id;
  const { friendsRevision, chatRevision, lobbyRevision } = usePlatformRealtime(authUser ? { id: authUser.id, role: authUser.role } : null);
  const { dismissInstallGuide, installGuide, installMobileApp, isFullscreen, isStandalone, toggleBrowserFullscreen } = useMobileApp(showToast);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("micosm-progress");
        if (saved) {
          const data = JSON.parse(saved) as { favorites?: GameId[]; completed?: number };
          setFavorites((data.favorites ?? ["go", "gomoku"]).filter((id) => gameCatalog.some((game) => game.id === id)));
          setCompleted(data.completed ?? 0);
        }
        const savedName = window.localStorage.getItem("micosm-player-name");
        if (savedName) setDisplayName(savedName);
        const savedSettings = window.localStorage.getItem("micosm-settings");
        if (savedSettings) {
          const settings = JSON.parse(savedSettings) as Partial<GamePreferences> & { boardScale?: number };
          setPreferences({
            ...defaultPreferences,
            ...settings,
            appearance: settings.appearance === "dark" ? "dark" : "light",
          });
          if (typeof settings.boardScale === "number") setBoardScale(Math.min(130, Math.max(70, settings.boardScale)));
        }
      } catch {
        // Local progress is optional.
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/auth", { cache: "no-store" });
          if (!response.ok) return;
          const data = await response.json() as { user: AuthUser };
          if (disposed) return;
          setAuthUser(data.user);
          setDisplayName(data.user.displayName);
          window.localStorage.setItem("micosm-player-name", data.user.displayName);
        } catch {
          // The sign-in form remains available when session lookup is offline.
        } finally {
          if (!disposed) setAuthReady(true);
        }
      })();
    }, 0);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const code = new URL(window.location.href).searchParams.get("room")?.trim().toUpperCase() ?? "";
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return;
      setJoinCode(code);
      setScannedRoomCode(code);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!room || room.mode !== "private" || room.opponentReady) return;
    let disposed = false;
    const inviteUrl = new URL(window.location.href);
    const lanOrigin = import.meta.env.VITE_LAN_ORIGIN?.trim();
    if (lanOrigin && ["localhost", "127.0.0.1"].includes(inviteUrl.hostname)) {
      const localNetworkUrl = new URL(lanOrigin);
      inviteUrl.protocol = localNetworkUrl.protocol;
      inviteUrl.host = localNetworkUrl.host;
    }
    inviteUrl.search = "";
    inviteUrl.hash = "";
    inviteUrl.searchParams.set("room", room.id);
    void import("qrcode")
      .then(({ toDataURL }) => {
        if (!disposed) setRoomInviteUrl(inviteUrl.toString());
        return toDataURL(inviteUrl.toString(), {
          width: 480,
          margin: 4,
          errorCorrectionLevel: "H",
          color: { dark: "#000000", light: "#ffffff" },
        });
      })
      .then((dataUrl) => { if (!disposed) setRoomQrDataUrl(dataUrl); })
      .catch(() => { if (!disposed) setRoomQrDataUrl(""); });
    return () => { disposed = true; };
  }, [room]);

  useEffect(() => {
    if (!authReady || !authUser || !scannedRoomCode) return;
    if (room?.id === scannedRoomCode) {
      const timer = window.setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("room");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        setScannedRoomCode("");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (room || scannedJoinAttempt.current === scannedRoomCode) return;
    scannedJoinAttempt.current = scannedRoomCode;
    let disposed = false;
    let requestStarted = false;
    let requestTimeout = 0;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      requestStarted = true;
      setRoomBusy(true);
      requestTimeout = window.setTimeout(() => controller.abort(), 10_000);
      void fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "join", roomId: scannedRoomCode }),
        signal: controller.signal,
      }).then(async (response) => {
        const data = await response.json() as { room?: RoomView; playerId?: string; error?: { message?: string } };
        if (!response.ok || !data.room || !data.playerId) throw new Error(data.error?.message ?? "扫码加入房间失败");
        if (disposed) return;
        setRoom(data.room);
        setPlayerId(data.playerId);
        setActiveGame(data.room.game);
        setMainView("games");
        if (data.room.game === "go") setGoSize(data.room.state.size);
        setConnectionState("online");
        window.sessionStorage.setItem("micosm-room", JSON.stringify({ roomId: data.room.id, playerId: data.playerId }));
        const url = new URL(window.location.href);
        url.searchParams.delete("room");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        setScannedRoomCode("");
        setJoinCode("");
      }).catch((error) => {
        if (disposed) return;
        toastSequence.current += 1;
        const timedOut = error instanceof DOMException && error.name === "AbortError";
        const message = timedOut ? "加入房间超时，请确认双方在同一局域网后重试" : error instanceof Error ? error.message : "扫码加入房间失败";
        setToast({ id: toastSequence.current, message, tone: "warning" });
        scannedJoinAttempt.current = "";
        setScannedRoomCode("");
      }).finally(() => {
        window.clearTimeout(requestTimeout);
        if (!disposed) setRoomBusy(false);
      });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearTimeout(requestTimeout);
      controller.abort();
      if (requestStarted) setRoomBusy(false);
    };
  }, [authReady, authUser, room, scannedRoomCode]);

  useEffect(() => {
    if (!scannerOpen) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      void import("@zxing/browser").then(async ({ BrowserQRCodeReader }) => {
        const video = scannerVideoRef.current;
        if (!video || disposed) return;
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 180, delayBetweenScanSuccess: 700 });
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          video,
          (result, _error, scanControls) => {
            if (!result || disposed) return;
            const code = roomCodeFromScan(result.getText());
            if (!code) {
              setScannerError("没有识别到有效的 Micosm 房间二维码");
              return;
            }
            scanControls.stop();
            scannerControls.current = null;
            scannedJoinAttempt.current = "";
            setJoinCode(code);
            setScannedRoomCode(code);
            setScannerOpen(false);
            setScannerError("");
          },
        );
        if (disposed) controls.stop();
        else scannerControls.current = controls;
      }).catch((error) => {
        if (disposed) return;
        const insecure = !window.isSecureContext;
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        setScannerError(insecure ? "摄像头扫码需要 HTTPS 安全连接" : denied ? "摄像头权限被拒绝，请在浏览器设置中允许后重试" : "无法启动摄像头，请检查权限或改用邀请码");
      });
    }, 0);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      scannerControls.current?.stop();
      scannerControls.current = null;
    };
  }, [scannerOpen]);

  useEffect(() => {
    if (!authUser) return;
    let disposed = false;
    const pollFriends = async () => {
      try {
        const response = await fetch("/api/friends", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as FriendsData;
        if (disposed) return;
        for (const invite of data.gameInvites) {
          if (!seenGameInvites.current.has(invite.inviteId)) {
            seenGameInvites.current.add(invite.inviteId);
          }
        }
        setFriendsData(data);
      } catch {
        // Presence polling recovers automatically.
      }
    };
    void pollFriends();
    const timer = window.setInterval(pollFriends, 45_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [authUser, friendsRevision]);

  useEffect(() => {
    if (!authUser || mainView !== "ranked") return;
    let disposed = false;
    const loadRank = async () => {
      try {
        const response = await fetch(`/api/rank?game=${rankedGame}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as RankData;
        if (!disposed) setRankData(data);
      } catch {
        // Rank data retries when the view or game changes.
      }
    };
    void loadRank();
    return () => { disposed = true; };
  }, [authUser, mainView, rankedGame]);

  useEffect(() => {
    if (!authUser || mainView !== "history") return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      setHistoryBusy(true);
      setHistoryError("");
      void fetch("/api/history", { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json() as { records?: HistoryRecord[]; error?: { message?: string } };
          if (!response.ok || !data.records) throw new Error(data.error?.message ?? "读取对局记录失败");
          if (!disposed) setHistoryRecords(data.records);
        })
        .catch((error) => { if (!disposed) setHistoryError(error instanceof Error ? error.message : "读取对局记录失败"); })
        .finally(() => { if (!disposed) setHistoryBusy(false); });
    }, 0);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [authUser, mainView]);

  useEffect(() => {
    if (!authUser) return;
    let disposed = false;
    const pollOverview = async () => {
      try {
        const response = await fetch("/api/chat?view=overview", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as ChatOverview;
        if (!disposed) setChatOverview(data);
      } catch {
        // Unread counts recover on the next poll.
      }
    };
    void pollOverview();
    const timer = window.setInterval(pollOverview, 30_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [authUser, chatRevision]);

  useEffect(() => {
    if (!chatOpen || (chatChannel === "direct" && !chatPeer)) return;
    let disposed = false;
    const pollMessages = async () => {
      try {
        const query = chatChannel === "world" ? `channel=world&hall=${encodeURIComponent(lobbyHall)}` : `channel=direct&userId=${encodeURIComponent(chatPeer?.id ?? "")}`;
        const response = await fetch(`/api/chat?${query}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { messages: ChatMessage[] };
        if (disposed) return;
        setChatMessages(data.messages);
        await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "markRead", channel: chatChannel, hall: lobbyHall, targetUserId: chatPeer?.id }),
        });
        setChatOverview((current) => chatChannel === "world"
          ? { ...current, worldUnread: 0 }
          : { ...current, directUnreads: { ...current.directUnreads, [chatPeer?.id ?? ""]: 0 } });
      } catch {
        // Open conversations retry automatically.
      }
    };
    void pollMessages();
    const timer = window.setInterval(pollMessages, 30_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [chatChannel, chatOpen, chatPeer, chatRevision, lobbyHall]);

  useEffect(() => {
    if (!chatOpen || chatChannel !== "world" || !authUser) return;
    let disposed = false;
    const refreshLobby = async () => {
      setLobbyBusy(true);
      try {
        const response = await fetch(`/api/lobby?hall=${encodeURIComponent(lobbyHall)}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { rooms: LobbyRoom[]; counts: LobbyCounts };
        if (!disposed) {
          setLobbyRooms(data.rooms);
          setLobbyCounts(data.counts);
        }
      } finally {
        if (!disposed) setLobbyBusy(false);
      }
    };
    void refreshLobby();
    const timer = window.setInterval(refreshLobby, 30_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [authUser, chatChannel, chatOpen, lobbyHall, lobbyRevision]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
    mobileChatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages]);

  useEffect(() => {
    if (ready) window.localStorage.setItem("micosm-progress", JSON.stringify({ favorites, completed }));
  }, [completed, favorites, ready]);

  useEffect(() => {
    document.body.dataset.theme = preferences.appearance;
    return () => { delete document.body.dataset.theme; };
  }, [preferences.appearance]);

  useEffect(() => {
    if (ready) window.localStorage.setItem("micosm-settings", JSON.stringify({ ...preferences, boardScale }));
  }, [boardScale, preferences, ready]);

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      try {
        const saved = window.sessionStorage.getItem("micosm-room");
        if (!saved) return;
        const session = JSON.parse(saved) as { roomId?: string; playerId?: string; spectating?: boolean };
        if (session.roomId && (session.playerId || session.spectating)) {
          void (async () => {
            try {
              const response = await fetch(`/api/match?roomId=${encodeURIComponent(session.roomId as string)}${session.spectating ? "&spectate=1" : `&playerId=${encodeURIComponent(session.playerId as string)}`}`, { cache: "no-store" });
              if (!response.ok) throw new Error("房间已失效");
              const data = await response.json() as { room: RoomView };
              if (!data.room.role && !data.room.rolePending && !session.spectating) throw new Error("玩家身份已失效");
              if (disposed) return;
              setRoom(data.room);
              setPlayerId(session.playerId ?? "");
              if (data.room.role && data.room.players[data.room.role]) setDisplayName(data.room.players[data.room.role] as string);
              setActiveGame(data.room.game);
              if (data.room.game === "go") setGoSize(data.room.state.size);
              setConnectionState("online");
            } catch (error) {
              window.sessionStorage.removeItem("micosm-room");
              if (!disposed) {
                toastSequence.current += 1;
                setToast({ id: toastSequence.current, message: error instanceof Error ? error.message : "无法恢复房间" });
              }
            }
          })();
        }
      } catch {
        window.sessionStorage.removeItem("micosm-room");
      }
    }, 0);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!currentRoomId || (!playerId && room?.role !== null)) return;
    const roomId = currentRoomId;
    const token = playerId;
    const spectating = !token;
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let pingTimer = 0;
    const refreshRoom = async () => {
      try {
        const response = await fetch(`/api/match?roomId=${encodeURIComponent(roomId)}${spectating ? "&spectate=1" : `&playerId=${encodeURIComponent(token)}`}`, { cache: "no-store" });
        if (!response.ok) {
          if (spectating && response.status === 403) {
            window.sessionStorage.removeItem("micosm-room");
            if (!disposed) {
              setRoom(null);
              setPlayerId("");
              setConnectionState("idle");
              showToast("这场对局已关闭观战，已返回大厅", "warning");
            }
            return;
          }
          throw new Error("room_unavailable");
        }
        const data = await response.json() as { room: RoomView };
        if (disposed) return;
        pollFailures.current = 0;
        setConnectionState("online");
        setRoom((current) => current?.id === data.room.id
          && current.version === data.room.version
          && current.profiles
          && Boolean(current.rankResult) === Boolean(data.room.rankResult)
          && !data.room.state.clock
          ? current
          : data.room);
      } catch {
        pollFailures.current += 1;
        if (!disposed && pollFailures.current >= 2) setConnectionState("reconnecting");
      }
    };
    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/realtime?roomId=${encodeURIComponent(roomId)}`);
      socket.addEventListener("open", () => {
        pollFailures.current = 0;
        setConnectionState("online");
        void refreshRoom();
        window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send("ping"); }, 20_000);
      });
      socket.addEventListener("message", (event) => {
        if (event.data === "pong") return;
        try {
          const message = JSON.parse(String(event.data)) as { type?: string };
          if (["room_updated", "room_closed", "connected"].includes(message.type ?? "")) void refreshRoom();
        } catch {
          // Ignore non-protocol messages and keep the recovery fetch active.
        }
      });
      socket.addEventListener("close", () => {
        window.clearInterval(pingTimer);
        if (disposed) return;
        setConnectionState("reconnecting");
        reconnectTimer = window.setTimeout(connect, 1_500);
      });
      socket.addEventListener("error", () => socket?.close());
    };
    void refreshRoom();
    connect();
    const recoveryTimer = window.setInterval(refreshRoom, 10_000);
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pingTimer);
      window.clearInterval(recoveryTimer);
      socket?.close(1000, "Room changed");
    };
  }, [currentRoomId, playerId, room?.role]);

  useEffect(() => {
    const ai = room?.state.ai;
    if (!room || room.mode !== "ai" || !ai || !playerId || review) return;
    const aiTurn = room.state.status === "playing" && room.state.turn === ai.player;
    const confirmations = room.state.goScoring?.confirmations ?? [];
    const aiScoreConfirmation = room.state.status === "scoring"
      && confirmations.includes(otherPlayer(ai.player))
      && !confirmations.includes(ai.player);
    if (!aiTurn && !aiScoreConfirmation) return;
    const requestKey = `${room.id}:${room.version}:${room.state.status}:${room.state.turn}`;
    if (aiRequest.current === requestKey) return;
    aiRequest.current = requestKey;
    const timer = window.setTimeout(() => {
      setAiError("");
      setAiThinking(true);
      void fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "aiMove", roomId: room.id, playerId }),
      }).then(async (response) => {
        const data = await response.json() as { room?: RoomView; error?: { message?: string } };
        if (!response.ok || !data.room) throw new Error(data.error?.message ?? "AI 思考失败");
        setRoom((current) => current?.id === data.room?.id ? data.room : current);
        setAiError("");
        setConnectionState("online");
      }).catch((error) => {
        const message = error instanceof Error ? error.message : "AI 思考失败";
        setAiError(message);
        showToast(`${message}，可以重新计算`, "warning");
      }).finally(() => {
        if (aiRequest.current === requestKey) aiRequest.current = "";
        setAiThinking(false);
      });
    }, ai.engine === "builtin" ? 520 : 220);
    return () => window.clearTimeout(timer);
  }, [aiRetryNonce, playerId, review, room]);

  useEffect(() => {
    if (room?.mode !== "ai" || room.state.game !== "go" || room.state.status !== "playing" || room.state.passes !== 1 || room.state.turn !== room.role) return;
    const key = `${room.id}:${room.version}`;
    if (announcedAiPass.current === key) return;
    announcedAiPass.current = key;
    const timer = window.setTimeout(() => showToast("电脑已停一手。你可以继续落子，或点击“结束并数子”判定胜负。", "info"), 0);
    return () => window.clearTimeout(timer);
  }, [room]);

  useEffect(() => {
    if (room?.state.status !== "playing" || !room.state.clock) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [room?.id, room?.state.status, room?.state.clock]);

  useEffect(() => {
    const current = room?.state.undoRequest ?? null;
    const previous = previousUndoRequest.current;
    previousUndoRequest.current = current;
    if (!room?.role || !previous || current || previous.requester !== room.role || !room.state.notice.includes("拒绝了悔棋")) return;
    const timer = window.setTimeout(() => {
      toastSequence.current += 1;
      const message = "对方拒绝了你的悔棋请求。";
      setToast({ id: toastSequence.current, message, tone: "warning" });
      setNotifications((items) => [{ id: toastSequence.current, message }, ...items].slice(0, 12));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [room?.id, room?.role, room?.state.notice, room?.state.undoRequest, room?.version]);

  useEffect(() => {
    const current = room?.state.rematchRequest ?? null;
    const previous = previousRematchRequest.current;
    previousRematchRequest.current = current;
    if (!room?.role || !previous || current || previous.requester !== room.role || !room.state.notice.includes("拒绝了再战")) return;
    const timer = window.setTimeout(() => showToast("对方拒绝了你的再战请求。", "warning"), 0);
    return () => window.clearTimeout(timer);
  }, [room?.id, room?.role, room?.state.notice, room?.state.rematchRequest, room?.version]);

  useEffect(() => {
    if (room?.state.status !== "playing" || !outcome) return;
    const timer = window.setTimeout(() => {
      setOutcome(null);
      setReview(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [outcome, room?.state.status]);

  useEffect(() => {
    if (!currentRoomId || !playerId || room?.state.status === "ended") return;
    const payload = JSON.stringify({ type: "leave", roomId: currentRoomId, playerId });
    let sent = false;
    const leaveOnClose = (event?: Event) => {
      if ((event instanceof PageTransitionEvent && event.persisted) || sent) return;
      sent = true;
      try {
        const accepted = navigator.sendBeacon("/api/match", new Blob([payload], { type: "application/json" }));
        if (accepted) return;
      } catch {
        // keepalive fetch is the fallback for browsers without a usable beacon.
      }
      void fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", leaveOnClose);
    window.addEventListener("beforeunload", leaveOnClose);
    return () => {
      window.removeEventListener("pagehide", leaveOnClose);
      window.removeEventListener("beforeunload", leaveOnClose);
    };
  }, [currentRoomId, playerId, room?.state.status]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (friendConfirm) setFriendConfirm(null);
      else if (confirmIntent) setConfirmIntent(null);
      else if (review) {
        setOutcome(review.outcome);
        setReview(null);
      }
      else if (outcome) return;
      else if (aiSetupOpen) setAiSetupOpen(false);
      else if (settingsOpen) setSettingsOpen(false);
      else if (profileOpen) setProfileOpen(false);
      else if (chatOpen) setChatOpen(false);
      else if (notificationOpen) setNotificationOpen(false);
      else if (friendPanelOpen) setFriendPanelOpen(false);
      else if (libraryMenuOpen) setLibraryMenuOpen(false);
      else if (accountOpen) setAccountOpen(false);
      else if (moderationOpen) setModerationOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accountOpen, aiSetupOpen, chatOpen, confirmIntent, friendConfirm, friendPanelOpen, libraryMenuOpen, moderationOpen, notificationOpen, outcome, profileOpen, review, settingsOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!boardFeedback) return;
    const timer = window.setTimeout(() => setBoardFeedback(null), boardFeedback === "invalid" ? 520 : 360);
    return () => window.clearTimeout(timer);
  }, [boardFeedback]);

  useEffect(() => {
    if (!room || room.state.status !== "ended" || !room.role) return;
    const key = `${room.id}-${room.version}`;
    if (dismissedOutcome.current === key) return;
    const timer = window.setTimeout(() => {
      const rankSummary = room.mode === "ranked" && room.rankResult
        ? ` 排位 ${room.rankResult.delta >= 0 ? "+" : ""}${room.rankResult.delta}，当前 ${rankLabel(room.rankResult.rating)}。`
        : "";
      if (room.state.departedPlayer) {
        if (room.state.departedPlayer === room.role) return;
        const departedName = room.players[room.state.departedPlayer] ?? "对手";
        setOutcome({ key, title: "对方已逃跑，你获胜了", detail: `${departedName} 已退出对局，本局判你获胜。${rankSummary}`, kind: "departure", mode: room.mode, game: room.game, won: true });
        if (completedRemoteMatch.current !== key) {
          completedRemoteMatch.current = key;
          setCompleted((value) => value + 1);
        }
        return;
      }
      if (!room.state.winner) return;
      const title = room.state.resignedPlayer
        ? room.state.resignedPlayer === room.role ? "你已认输" : "对方认输，你获胜了"
        : room.state.timedOutPlayer
          ? room.state.timedOutPlayer === room.role ? "你已超时" : "对方超时，你获胜了"
        : room.state.winner === "draw" ? "本局平局" : room.state.winner === room.role ? "你获胜了" : "你输了";
      const detail = room.state.game === "go" && room.state.finalScore
        ? `黑 ${room.state.finalScore.black} · 白 ${room.state.finalScore.white}`
        : room.state.notice;
      setOutcome({ key, title, detail: `${detail}${rankSummary}`, kind: "result", mode: room.mode, game: room.game, won: room.state.winner === room.role });
      if (completedRemoteMatch.current !== key) {
        completedRemoteMatch.current = key;
        setCompleted((value) => value + 1);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [room]);

  const activeMeta = gameCatalog.find((game) => game.id === activeGame) ?? gameCatalog[0];
  const boardStyle = { "--board-max": `${Math.round(680 * boardScale / 100)}px` } as CSSProperties;
  const remoteState = room?.game === activeGame ? room.state : null;
  const reviewFrame = review?.frames[review.index] ?? null;
  const visibleGoBoard = reviewFrame && activeGame === "go" ? reviewFrame.board : remoteState?.game === "go" ? remoteState.board : goBoard;
  const visibleGomokuBoard = reviewFrame && activeGame === "gomoku" ? reviewFrame.board : remoteState?.game === "gomoku" ? remoteState.board : gomokuBoard;
  const visibleReversiBoard = reviewFrame && activeGame === "reversi" ? reviewFrame.board : remoteState?.game === "reversi" ? remoteState.board : reversiBoard;
  const visibleTurn = reviewFrame?.turn ?? remoteState?.turn ?? "black";
  const liveClock = (color: Player) => {
    const clock = remoteState?.clock;
    if (!clock) return undefined;
    const base = color === "black" ? clock.blackMs : clock.whiteMs;
    const elapsed = remoteState.status === "playing" && remoteState.turn === color && clock.activeSince
      ? Math.max(0, clockNow - clock.activeSince)
      : 0;
    return Math.max(0, base - elapsed);
  };
  const blackClockMs = liveClock("black");
  const whiteClockMs = liveClock("white");
  useEffect(() => {
    if (!room || room.state.status !== "playing" || !room.state.clock || !playerId) return;
    const activeRemaining = room.state.turn === "black" ? blackClockMs : whiteClockMs;
    if (activeRemaining === undefined || activeRemaining > 0) return;
    const key = `${room.id}-${room.version}-${room.state.turn}`;
    if (timeoutProbe.current === key) return;
    timeoutProbe.current = key;
    void fetch(`/api/match?roomId=${encodeURIComponent(room.id)}&playerId=${encodeURIComponent(playerId)}`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { room: RoomView } : null)
      .then((data) => { if (data?.room) setRoom(data.room); })
      .catch(() => undefined);
  }, [blackClockMs, playerId, room, whiteClockMs]);
  const reversiScore = useMemo(() => stoneScore(visibleReversiBoard), [visibleReversiBoard]);
  function showToast(message: string, requestedTone?: ToastTone) {
    toastSequence.current += 1;
    const tone = requestedTone
      ?? (/禁手|非法|无法|不能|不可|失败|错误|超时|请先|拒绝|连接|轮到|等待另一位/.test(message) ? "warning"
        : /成功|已匹配|已发送|已复制|已保存|已添加|已接受|获胜/.test(message) ? "success" : "info");
    const notification = { id: toastSequence.current, message };
    setToast({ id: notification.id, message, tone });
    setNotifications((current) => [notification, ...current].slice(0, 12));
  }

  async function refreshRankData(game: RankGame = rankedGame) {
    if (!authUser) return;
    try {
      const response = await fetch(`/api/rank?game=${game}`, { cache: "no-store" });
      const data = await response.json() as RankData & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "排位数据暂时不可用");
      setRankData(data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "排位数据暂时不可用");
    }
  }

  async function startRanked() {
    if (!authUser) return showToast("请先登录");
    if (room) return showToast("请先退出当前房间");
    if (rankBusy) return;
    setRankBusy(true);
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "rankmake", game: rankedGame }),
      });
      const data = await response.json() as { room?: RoomView; playerId?: string; error?: { message?: string } };
      if (!response.ok || !data.room || !data.playerId) throw new Error(data.error?.message ?? "开始排位失败");
      adoptRoom(data.room, data.playerId);
      setAiError("");
      if (data.room.opponentReady) showToast("已匹配到实力相近的对手");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "开始排位失败");
    } finally {
      setRankBusy(false);
    }
  }

  function openRankedLobby() {
    if (room) return showToast("请先退出当前房间再进入排位");
    setMainView("ranked");
    setLibraryMenuOpen(false);
  }

  function openStoryMode() {
    if (!STORY_MODE_ENABLED) return;
    if (room) return showToast("请先结束当前对局再进入剧情");
    setMainView("story");
    setLibraryMenuOpen(false);
    setChatOpen(false);
    setFriendPanelOpen(false);
    setNotificationOpen(false);
    setAccountOpen(false);
  }

  function returnToRankedLobby() {
    const game = (room?.game ?? outcome?.game) === "gomoku" ? "gomoku" : "go";
    dismissResult();
    clearRoom();
    setRankedGame(game);
    setMainView("ranked");
    void refreshRankData(game);
  }

  function playMoveSound() {
    if (!preferences.soundEnabled) return;
    try {
      const context = new AudioContext();
      const play = () => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(460, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(250, context.currentTime + 0.07);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.08);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.085);
        oscillator.addEventListener("ended", () => void context.close(), { once: true });
      };
      if (context.state === "suspended") void context.resume().then(play).catch(() => void context.close());
      else play();
    } catch {
      // Sound is an optional enhancement.
    }
  }

  function updatePreference<K extends keyof GamePreferences>(key: K, value: GamePreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  function openSettings() {
    setSettingsOpen(true);
    setLibraryMenuOpen(false);
    setNotificationOpen(false);
    setAccountOpen(false);
    setChatOpen(false);
  }

  function toggleFavorite() {
    const isFavorite = favorites.includes(activeGame);
    setFavorites((current) => isFavorite ? current.filter((game) => game !== activeGame) : [...current, activeGame]);
    setLibraryMenuOpen(false);
    showToast(isFavorite ? `已取消收藏${activeMeta.title}` : `已收藏${activeMeta.title}`);
  }

  function invitePlayers() {
    if (!room) return showToast("先创建好友房间，再邀请玩家");
    if (room.mode !== "private") return showToast("匹配对局无需邀请码");
    void copyInviteCode();
  }

  async function refreshFriends() {
    try {
      const response = await fetch("/api/friends", { cache: "no-store" });
      if (!response.ok) return;
      setFriendsData(await response.json() as FriendsData);
    } catch {
      // The next presence poll will retry.
    }
  }

  async function searchFriends() {
    const query = friendSearch.trim();
    if (!query) return setFriendSearchResults([]);
    setFriendBusy("search");
    try {
      const response = await fetch(`/api/friends?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const data = await response.json() as { results?: FriendSearchResult[]; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "搜索失败");
      setFriendSearchResults(data.results ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "搜索失败");
    } finally {
      setFriendBusy("");
    }
  }

  async function friendAction(type: string, targetUserId: string, successMessage: string) {
    setFriendBusy(`${type}:${targetUserId}`);
    try {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, targetUserId }),
      });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "好友操作失败");
      showToast(successMessage);
      await refreshFriends();
      if (friendSearch.trim()) await searchFriends();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "好友操作失败");
    } finally {
      setFriendBusy("");
    }
  }

  async function inviteFriend(friend: FriendPerson) {
    if (!friend.online) return showToast("好友当前不在线");
    if (room && (room.mode !== "private" || room.opponentReady || room.state.status !== "waiting")) return showToast("请先结束或退出当前对局");
    setFriendBusy(`invite:${friend.id}`);
    try {
      const targetRoom = room ?? await createRoom();
      if (!targetRoom) return;
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "sendGameInvite", targetUserId: friend.id, roomId: targetRoom.id }),
      });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "发送对局邀请失败");
      showToast(`已邀请 ${friend.displayName} 加入${activeMeta.title}`);
      setFriendPanelOpen(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "发送对局邀请失败");
    } finally {
      setFriendBusy("");
    }
  }

  async function respondGameInvite(invite: GameInvite, accept: boolean) {
    if (accept && room) return showToast("请先退出当前房间再接受邀请");
    setFriendBusy(`gameInvite:${invite.inviteId}`);
    try {
      const response = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "respondGameInvite", inviteId: invite.inviteId, accept }),
      });
      const data = await response.json() as { roomId?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "处理邀请失败");
      if (accept && data.roomId) await joinRoom(data.roomId);
      else showToast("已拒绝对局邀请");
      await refreshFriends();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "处理邀请失败");
      await refreshFriends();
    } finally {
      setFriendBusy("");
    }
  }

  function openChat(channel: ChatChannel = "world", peer: FriendPerson | null = null) {
    setChatChannel(channel);
    setChatPeer(peer);
    setChatOpen(true);
    setFriendPanelOpen(false);
    setNotificationOpen(false);
    setAccountOpen(false);
    setLibraryMenuOpen(false);
  }

  async function refreshCurrentChat() {
    if (chatChannel === "direct" && !chatPeer) return;
    const query = chatChannel === "world" ? `channel=world&hall=${encodeURIComponent(lobbyHall)}` : `channel=direct&userId=${encodeURIComponent(chatPeer?.id ?? "")}`;
    const response = await fetch(`/api/chat?${query}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { messages: ChatMessage[] };
    setChatMessages(data.messages);
  }

  async function sendChatMessage() {
    const body = chatText.trim();
    if (!body || chatBusy || (chatChannel === "direct" && !chatPeer)) return;
    setChatBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "send", channel: chatChannel, hall: lobbyHall, targetUserId: chatPeer?.id, body }),
      });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "消息发送失败");
      setChatText("");
      await refreshCurrentChat();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "消息发送失败");
    } finally {
      setChatBusy(false);
    }
  }

  async function sendChatRoomInvite() {
    if (chatBusy || (chatChannel === "direct" && !chatPeer)) return;
    if (room && (room.mode !== "private" || room.opponentReady || room.state.status !== "waiting")) return showToast("请先结束或退出当前对局");
    setChatBusy(true);
    try {
      const targetRoom = room ?? await createRoom();
      if (!targetRoom) return;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "send", channel: chatChannel, hall: lobbyHall, targetUserId: chatPeer?.id, roomId: targetRoom.id }),
      });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "房间邀请发送失败");
      showToast(chatChannel === "world" ? "房间邀请已发送到世界频道" : `已在私聊中邀请 ${chatPeer?.displayName}`);
      await refreshCurrentChat();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "房间邀请发送失败");
    } finally {
      setChatBusy(false);
    }
  }

  async function chatMessageAction(type: "delete" | "report", messageId: string) {
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, messageId }) });
      const data = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "操作失败");
      showToast(type === "delete" ? "消息已删除" : "已提交举报");
      await refreshCurrentChat();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败");
    }
  }

  async function joinChatRoom(message: ChatMessage) {
    if (!message.room?.open) return showToast("这个房间已经无法加入");
    if (room) return showToast("请先退出当前房间");
    await joinRoom(message.room.id);
    setChatOpen(false);
  }

  async function submitAuth() {
    if (authBusy) return;
    setAuthError("");
    if (authMode === "register" && authPassword !== authPasswordConfirm) {
      setAuthError("两次输入的密码不一致");
      return;
    }
    setAuthBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: authMode, phone: authPhone, displayName, password: authPassword, inviteCode: authInviteCode }),
      });
      const data = await response.json() as { user?: AuthUser; error?: { message?: string } };
      if (!response.ok || !data.user) throw new Error(data.error?.message ?? "登录失败");
      setAuthUser(data.user);
      setDisplayName(data.user.displayName);
      setAuthInviteCode("");
      setAuthPassword("");
      setAuthPasswordConfirm("");
      window.localStorage.setItem("micosm-player-name", data.user.displayName);
      showToast("登录成功");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : authMode === "signIn" ? "登录失败" : "注册失败");
    } finally {
      setAuthBusy(false);
    }
  }

  function openProfileEditor() {
    if (!authUser) return;
    setProfileName(authUser.displayName);
    setProfileSignature(authUser.signature);
    setProfileAvatar(null);
    setProfileAvatarPreview(authUser.avatarUrl);
    setProfileRemoveAvatar(false);
    setProfileCurrentPassword("");
    setProfileNewPassword("");
    setAccountOpen(false);
    setProfileOpen(true);
  }

  function openHistoryView() {
    if (room) return showToast("请先结束或退出当前房间");
    setAccountOpen(false);
    setHistoryReview(null);
    setMainView("history");
  }

  async function openHistoryRecord(id: string) {
    if (historyBusy) return;
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const response = await fetch(`/api/history?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json() as { record?: HistoryRecordDetail; error?: { message?: string } };
      if (!response.ok || !data.record) throw new Error(data.error?.message ?? "读取棋谱失败");
      const frames = buildReviewFrames(data.record.state);
      setHistoryReview({ record: data.record, frames, index: frames.length - 1 });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "读取棋谱失败");
    } finally {
      setHistoryBusy(false);
    }
  }

  function chooseAvatar(file: File | undefined) {
    if (!file) return;
    setProfileAvatar(file);
    setProfileRemoveAvatar(false);
    const reader = new FileReader();
    reader.addEventListener("load", () => setProfileAvatarPreview(typeof reader.result === "string" ? reader.result : null), { once: true });
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    if (!authUser || authBusy) return;
    setAuthBusy(true);
    try {
      const form = new FormData();
      form.set("displayName", profileName);
      form.set("signature", profileSignature);
      form.set("removeAvatar", String(profileRemoveAvatar));
      form.set("currentPassword", profileCurrentPassword);
      form.set("newPassword", profileNewPassword);
      if (profileAvatar) form.set("avatar", profileAvatar);
      const response = await fetch("/api/profile", { method: "POST", body: form });
      const data = await response.json() as { user?: AuthUser; error?: { message?: string } };
      if (!response.ok || !data.user) throw new Error(data.error?.message ?? "保存资料失败");
      setAuthUser(data.user);
      setDisplayName(data.user.displayName);
      window.localStorage.setItem("micosm-player-name", data.user.displayName);
      setProfileOpen(false);
      showToast("个人资料已保存");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存资料失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "offline" }) }).catch(() => undefined);
    if (room && playerId) {
      await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "leave", roomId: room.id, playerId }),
      }).catch(() => undefined);
    }
    await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "signOut" }) }).catch(() => undefined);
    clearRoom();
    setAuthUser(null);
    setFriendPanelOpen(false);
    setFriendsData(emptyFriendsData);
    setChatOpen(false);
    setChatMessages([]);
    setChatOverview({ worldUnread: 0, directUnreads: {} });
    setAccountOpen(false);
    setAuthPhone("");
    showToast("已退出账号");
  }

  function adoptRoom(nextRoom: RoomView, token = "") {
    setRoom(nextRoom);
    setPendingMove(null);
    setPlayerId(token);
    setActiveGame(nextRoom.game);
    setMainView("games");
    if (nextRoom.game === "go") setGoSize(nextRoom.state.size);
    pollFailures.current = 0;
    setConnectionState("online");
    window.localStorage.setItem("micosm-player-name", displayName.trim());
    window.sessionStorage.setItem("micosm-room", JSON.stringify({ roomId: nextRoom.id, playerId: token, spectating: !token }));
  }

  async function openLobbyRoom(target: LobbyRoom) {
    if (room) return showToast("请先退出当前房间");
    if (target.joinable) {
      await joinRoom(target.id);
      setChatOpen(false);
      return;
    }
    if (!target.spectatable) return showToast("这盘棋暂时不能观战");
    setLobbyBusy(true);
    try {
      const response = await fetch(`/api/match?roomId=${encodeURIComponent(target.id)}&spectate=1`, { cache: "no-store" });
      const data = await response.json() as { room?: RoomView; error?: { message?: string } };
      if (!response.ok || !data.room) throw new Error(data.error?.message ?? "无法进入观战");
      adoptRoom(data.room);
      setChatOpen(false);
      showToast("已进入观战", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法进入观战", "warning");
    } finally {
      setLobbyBusy(false);
    }
  }

  function getPlayerName() {
    if (!authUser) showToast("请先登录");
    return authUser?.displayName ?? "";
  }

  async function createRoom() {
    const playerName = getPlayerName();
    if (!playerName) return;
    setRoomBusy(true);
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "create", game: activeGame, size: activeGame === "go" ? goSize : undefined, colorPreference: activeGame === "go" || activeGame === "gomoku" ? colorPreference : "black", turnSeconds: privateClockEnabled ? privateTurnSeconds : undefined, forbiddenMoves: activeGame === "gomoku" ? privateForbiddenEnabled : undefined, spectatorPolicy: privateSpectatorPolicy }),
      });
      const data = await response.json() as { room?: RoomView; playerId?: string; error?: { message?: string } };
      if (!response.ok || !data.room || !data.playerId) throw new Error(data.error?.message ?? "创建房间失败");
      adoptRoom(data.room, data.playerId);
      return data.room;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "创建房间失败");
      return null;
    } finally {
      setRoomBusy(false);
    }
  }

  async function refreshAiEngineStatus() {
    setAiEngineStatus(null);
    const engine = activeGame === "gomoku" ? "rapfi" : "katago";
    try {
      const response = await fetch(`/api/ai?engine=${engine}`, { cache: "no-store" });
      const data = await response.json() as { ready?: boolean; detail?: string };
      setAiEngineStatus({ ready: response.ok && data.ready === true, detail: data.detail });
    } catch {
      setAiEngineStatus({ ready: false, detail: activeGame === "gomoku" ? "本机 Rapfi 引擎尚未启动" : "本机 GPU 引擎尚未启动" });
    }
  }

  function openAiSetup() {
    if (!getPlayerName()) return;
    if (room) return showToast("请先退出当前房间");
    setAiSetupOpen(true);
    if (activeGame === "go" || activeGame === "gomoku") void refreshAiEngineStatus();
  }

  async function startAiMatch() {
    if (!getPlayerName() || roomBusy) return;
    setRoomBusy(true);
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "createAI",
          game: activeGame,
          size: activeGame === "go" ? goSize : undefined,
          colorPreference: activeGame === "reversi" ? "black" : aiColor,
          aiDifficulty,
          forbiddenMoves: activeGame === "gomoku" ? privateForbiddenEnabled : undefined,
        }),
      });
      const data = await response.json() as { room?: RoomView; playerId?: string; error?: { message?: string } };
      if (!response.ok || !data.room || !data.playerId) throw new Error(data.error?.message ?? "创建人机对局失败");
      adoptRoom(data.room, data.playerId);
      setAiSetupOpen(false);
      showToast(`已开始${data.room.state.ai?.difficulty === "master" ? "最高难度" : "人机"}对局`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "创建人机对局失败", "warning");
      if ((activeGame === "go" || activeGame === "gomoku") && aiDifficulty === "master") void refreshAiEngineStatus();
    } finally {
      setRoomBusy(false);
    }
  }

  async function joinRoom(roomCode?: string) {
    const code = (roomCode ?? joinCode).trim().toUpperCase();
    if (!code) return showToast("请输入邀请码");
    const playerName = getPlayerName();
    if (!playerName) return;
    setRoomBusy(true);
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "join", roomId: code }),
      });
      const data = await response.json() as { room?: RoomView; playerId?: string; error?: { message?: string } };
      if (!response.ok || !data.room || !data.playerId) throw new Error(data.error?.message ?? "加入房间失败");
      adoptRoom(data.room, data.playerId);
      setJoinCode("");
      setFriendPanelOpen(false);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "加入房间失败");
      return false;
    } finally {
      setRoomBusy(false);
    }
  }

  async function startMatchmaking() {
    const playerName = getPlayerName();
    if (!playerName) return;
    setRoomBusy(true);
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "matchmake", game: activeGame, size: activeGame === "go" ? goSize : undefined }),
      });
      const data = await response.json() as { room?: RoomView; playerId?: string; error?: { message?: string } };
      if (!response.ok || !data.room || !data.playerId) throw new Error(data.error?.message ?? "开始匹配失败");
      adoptRoom(data.room, data.playerId);
      if (data.room.opponentReady) showToast("已匹配到对手");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "开始匹配失败");
    } finally {
      setRoomBusy(false);
    }
  }

  async function submitMatchAction(action: MatchAction) {
    if (!room || !playerId) return showToast("先创建或加入一个房间");
    if (actionBusy) return;
    if (room.mode === "ai" && aiThinking && ["play", "pass", "requestUndo", "reset"].includes(action.type)) return showToast("电脑正在思考，请稍等");
    if (connectionState === "reconnecting") return showToast("正在重新连接，请稍等");
    setActionBusy(true);
    try {
      const actionId = createClientRequestId();
      const send = () => fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json", "x-micosm-request-id": actionId },
        body: JSON.stringify({ type: "action", actionId, roomId: room.id, playerId, action }),
      });
      let response: Response;
      try {
        response = await send();
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        response = await send();
      }
      const data = await response.json() as { room?: RoomView; error?: { message?: string; requestId?: string } };
      if (!response.ok || !data.room) {
        const suffix = data.error?.requestId ? `（错误编号 ${data.error.requestId}）` : "";
        throw new Error(`${data.error?.message ?? "这一步无法执行"}${suffix}`);
      }
      setRoom(data.room);
      setConnectionState("online");
      if (action.type === "play") {
        playMoveSound();
        setBoardFeedback("move");
      }
      if (action.type === "play" || action.type === "markDead") setPendingMove(null);
      if (action.type === "respondRematch" && action.accept) {
        setOutcome(null);
        setReview(null);
      }
    } catch (error) {
      if (action.type === "play") setBoardFeedback("invalid");
      showToast(error instanceof Error ? error.message : "这一步无法执行", "warning");
    } finally {
      setActionBusy(false);
    }
  }

  async function toggleMatchmakingSpectators() {
    if (!room || room.mode !== "matchmaking" || !room.role || actionBusy) return;
    const enabled = !(room.state.spectatorConsents ?? []).includes(room.role);
    setActionBusy(true);
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "spectatorConsent", roomId: room.id, playerId, enabled }),
      });
      const data = await response.json() as { room?: RoomView; error?: { message?: string } };
      if (!response.ok || !data.room) throw new Error(data.error?.message ?? "无法更新观战设置");
      setRoom(data.room);
      showToast(data.room.spectatorPolicy === "public" ? "双方已同意，观战已开放" : enabled ? "已同意开放观战，等待对手确认" : "已撤回观战同意");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法更新观战设置", "warning");
    } finally {
      setActionBusy(false);
    }
  }

  function clearRoom() {
    setRoom(null);
    setPendingMove(null);
    setMobileMatchMenuOpen(false);
    setPlayerId("");
    setAiThinking(false);
    setAiError("");
    setOutcome(null);
    setReview(null);
    setConfirmIntent(null);
    setConnectionState("idle");
    window.sessionStorage.removeItem("micosm-room");
  }

  async function leaveRoom() {
    const leavingRoom = room;
    const token = playerId;
    setConfirmIntent(null);
    if (!leavingRoom || !token) return clearRoom();
    setRoomBusy(true);
    try {
      await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "leave", roomId: leavingRoom.id, playerId: token }),
      });
    } finally {
      clearRoom();
      setRoomBusy(false);
    }
  }

  async function cancelMatchmaking() {
    if (!room || !["matchmaking", "ranked"].includes(room.mode) || !playerId) return;
    const wasRanked = room.mode === "ranked";
    setRoomBusy(true);
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "cancelMatchmaking", roomId: room.id, playerId }),
      });
      const data = await response.json() as { cancelled?: boolean; room?: RoomView | null; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "取消匹配失败");
      if (data.room?.opponentReady) {
        setRoom(data.room);
        showToast("已匹配到对手，无法取消");
      } else {
        clearRoom();
        if (wasRanked) {
          setMainView("ranked");
          void refreshRankData(rankedGame);
        }
        showToast(wasRanked ? "已取消排位匹配" : "已取消匹配");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "取消匹配失败");
    } finally {
      setRoomBusy(false);
    }
  }

  function selectGame(game: GameId) {
    if (room && room.game !== game) return showToast("请先退出当前房间再切换游戏");
    setPendingMove(null);
    setActiveGame(game);
  }

  async function copyInviteCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.id);
      showToast("邀请码已复制");
    } catch {
      showToast(`邀请码：${room.id}`);
    }
  }

  async function copyInviteLink() {
    if (!roomInviteUrl) return showToast("邀请链接正在生成");
    try {
      await navigator.clipboard.writeText(roomInviteUrl);
      showToast("房间链接已复制");
    } catch {
      showToast(roomInviteUrl);
    }
  }

  async function scanQrImage(file: File | undefined) {
    if (!file || scannerImageBusy) return;
    setScannerImageBusy(true);
    setScannerError("");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const canvas = await qrPhotoCanvas(file);
      const result = new BrowserQRCodeReader().decodeFromCanvas(canvas);
      const code = roomCodeFromScan(result.getText());
      if (!code) throw new Error("没有识别到有效的 Micosm 房间二维码");
      scannerControls.current?.stop();
      scannerControls.current = null;
      scannedJoinAttempt.current = "";
      setJoinCode(code);
      setScannedRoomCode(code);
      setScannerOpen(false);
    } catch (error) {
      setScannerOpen(true);
      setScannerError(qrScanErrorMessage(error));
    } finally {
      setScannerImageBusy(false);
    }
  }

  function openRoomScanner() {
    setScannerError("");
    if (!window.isSecureContext) {
      scannerCaptureRef.current?.click();
      return;
    }
    setScannerOpen(true);
  }

  function changeGoSize(size: number) {
    if (room) return showToast("房间进行中不能切换棋盘路数");
    resetGo(size);
  }

  function dismissResult() {
    if (outcome) dismissedOutcome.current = outcome.key;
    setOutcome(null);
  }

  function startReview() {
    if (!room || !outcome) return;
    const frames = buildReviewFrames(room.state);
    dismissedOutcome.current = outcome.key;
    setReview({ frames, index: frames.length - 1, outcome });
    setOutcome(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function moveReviewTo(index: number) {
    setReview((current) => current ? { ...current, index: Math.max(0, Math.min(current.frames.length - 1, index)) } : current);
  }

  function closeReview() {
    if (!review) return;
    setOutcome(review.outcome);
    setReview(null);
  }

  function returnFromResult() {
    if (outcome?.mode === "ranked" || review?.outcome.mode === "ranked") return returnToRankedLobby();
    clearRoom();
    setMainView("games");
  }

  function rematch() {
    if (room?.mode === "ranked") return showToast("排位结算后需要重新匹配");
    void submitMatchAction({ type: "requestRematch" });
  }

  function resetGo(size = goSize) {
    setGoSize(size);
    setGoBoard(makeBoard(size));
  }

  function resetGomoku() {
    setGomokuBoard(makeBoard(15));
  }

  function resetReversi() {
    setReversiBoard(makeReversiBoard());
  }

  function resetActiveGame() {
    if (review) return showToast("请先结束复盘");
    if (room?.state.status === "waiting") return showToast("等待另一位玩家加入后再开始");
    if (room?.mode === "ranked") return showToast("排位对局不能重开");
    if (room) {
      if (preferences.confirmRestart) return setConfirmIntent("reset");
      return void submitMatchAction({ type: "reset" });
    }
    if (activeGame === "go") resetGo();
    if (activeGame === "gomoku") resetGomoku();
    if (activeGame === "reversi") resetReversi();
  }

  const gameStatus = !remoteState
    ? "创建或加入房间"
    : reviewFrame
      ? reviewFrame.moveNumber === 0 ? "复盘 · 开局" : `复盘 · 第 ${reviewFrame.moveNumber} 手`
    : connectionState === "reconnecting"
      ? "正在重新连接"
      : room?.mode === "ai" && remoteState.game === "go" && remoteState.status === "playing" && remoteState.passes === 1 && remoteState.turn === room.role
        ? "电脑已停一手"
      : room?.mode === "ai" && aiError
        ? "电脑计算失败"
      : room?.mode === "ai" && aiThinking
        ? "电脑正在思考"
      : remoteState.undoRequest
        ? remoteState.undoRequest.requester === room?.role ? "等待对手同意悔棋" : "对手申请悔棋"
        : remoteState.status === "waiting"
          ? "等待对手加入"
          : remoteState.status === "scoring"
            ? "标记死子并确认数目"
          : remoteState.status === "ended"
            ? remoteState.notice
            : room?.role === remoteState.turn ? "轮到你了" : room?.mode === "ai" ? "电脑正在思考" : "等待对手落子";
  const boardStoneCount = activeGame === "go"
    ? visibleGoBoard.flat().filter(Boolean).length
    : activeGame === "gomoku"
      ? visibleGomokuBoard.flat().filter(Boolean).length
      : Math.max(0, visibleReversiBoard.flat().filter(Boolean).length - 4);
  const moveCount = remoteState?.moves?.filter((move) => move.type !== "resumeGo").length ?? (remoteState?.history ? Math.max(0, remoteState.history.length - 1) : boardStoneCount);
  const activeBoardSize = remoteState?.size ?? (activeGame === "go" ? goSize : activeGame === "gomoku" ? 15 : 8);
  const matchPhase = activeGame === "go"
    ? moveCount < activeBoardSize ? "序盘" : moveCount < activeBoardSize ** 2 * .45 ? "中盘" : "终盘"
    : activeGame === "gomoku"
      ? moveCount < 12 ? "序盘" : moveCount < 35 ? "中盘" : "终盘"
      : moveCount < 16 ? "序盘" : moveCount < 42 ? "中盘" : "终盘";
  const matchNarration = !remoteState || remoteState.status === "waiting"
    ? "棋桌已经备好，等另一颗星抵达这里。"
    : remoteState.status === "scoring"
      ? "终局数子阶段，点选有争议的整块棋子，再由双方确认。"
    : remoteState.status === "ended"
      ? "这一局已经写进棋社记录，记住最让你犹豫的那一手。"
      : connectionState === "reconnecting"
        ? "星讯正在重新连接，棋局会留在原处。"
        : room?.mode === "ai" && aiError
          ? "这次计算没有成功，点击重新计算即可继续当前棋局。"
        : room?.mode === "ai" && room.role !== visibleTurn
          ? room.state.ai?.engine === "katago"
            ? "神经网络正在读取全盘变化，最高难度可能需要一些时间。"
            : room.state.ai?.engine === "rapfi"
              ? "Rapfi 正在搜索连续进攻、禁手与防守变化。"
              : "电脑正在计算下一手，你可以先观察它留下的薄弱处。"
        : room?.role === visibleTurn
          ? matchPhase === "序盘" ? "星图刚刚展开，先抢下能够延展的方向。" : matchPhase === "中盘" ? "棋形开始交叠，先读清对手下一手的意图。" : "胜负正在收束，确认每一处变化再落子。"
          : "现在轮到对手，让视线越过最后一手看看全局。";
  const myDisplayName = room?.role ? room.players[room.role] ?? displayName.trim() : displayName.trim();
  const opponentRole = room?.role ? otherPlayer(room.role) : null;
  const opponentDisplayName = opponentRole ? room?.players[opponentRole] : null;
  const roomRole = room?.rolePending ? `${displayName.trim() || "你"} · 随机待定` : room?.role ? `${myDisplayName || "你"} · ${playerName(room.role)}` : "观战";
  const blackLabel = room?.players.black ? `${room.players.black} · 黑方` : "黑方";
  const whiteLabel = room?.players.white ? `${room.players.white} · 白方` : "白方";
  const goCapturesVisible = remoteState?.game === "go" ? remoteState.captures ?? { black: 0, white: 0 } : { black: 0, white: 0 };
  const goScoreVisible = remoteState?.game === "go"
    ? remoteState.finalScore
      ?? remoteState.goScoring?.score
      ?? (remoteState.status === "scoring" ? scoreGoPosition(remoteState.board, remoteState.goScoring?.dead ?? []) : null)
    : null;
  const matchEnded = remoteState?.status === "ended";
  const undoRequest = remoteState?.undoRequest ?? null;
  const rematchRequest = remoteState?.rematchRequest ?? null;
  const canRequestUndo = Boolean(room && remoteState?.status === "playing" && !undoRequest && !aiThinking && (room.mode === "ai" ? remoteState.turn === room.role && remoteState.moves.length >= 2 : remoteState.lastPlayer === room.role));
  const isMyTurn = Boolean(!review && room?.role && remoteState?.status === "playing" && visibleTurn === room.role);
  const canChooseMove = Boolean(!review && room?.role && (
    isMyTurn || (remoteState?.game === "go" && remoteState.status === "scoring")
  ));
  const canFinishGoAgainstAi = Boolean(room?.mode === "ai" && room.role && remoteState?.game === "go" && remoteState.status === "playing" && remoteState.passes === 1 && remoteState.turn === room.role);
  const canConfirmAiGoScore = Boolean(room?.mode === "ai" && room.role && remoteState?.game === "go" && remoteState.status === "scoring" && !remoteState.goScoring?.confirmations.includes(room.role));
  const showMoveControls = Boolean(room?.role && !review && remoteState && remoteState.status !== "ended");
  const pendingGameInvite = friendsData.gameInvites[0] ?? null;
  const friendBadge = friendsData.incomingRequests.length + friendsData.gameInvites.length;
  const chatBadge = chatOverview.worldUnread + Object.values(chatOverview.directUnreads).reduce((sum, count) => sum + count, 0);

  function isPendingMoveLegal(point: Point | null) {
    if (!point || !remoteState || !room?.role || !canChooseMove) return false;
    const [row, col] = point;
    if (row < 0 || col < 0 || row >= activeBoardSize || col >= activeBoardSize) return false;
    if (remoteState.game === "go" && remoteState.status === "scoring") return Boolean(visibleGoBoard[row]?.[col]);
    if (remoteState.game === "go") return !visibleGoBoard[row]?.[col];
    if (remoteState.game === "gomoku") return !visibleGomokuBoard[row]?.[col];
    return !visibleReversiBoard[row]?.[col] && getReversiFlips(visibleReversiBoard, row, col, room.role).length > 0;
  }

  function selectRoomPoint(row: number, col: number) {
    if (review || !room?.role || !remoteState) return;
    setPendingMove([row, col]);
  }

  function confirmRoomPoint(point: Point | null = pendingMove) {
    if (review || !room?.role || !remoteState) return;
    if (!canChooseMove) return showToast(remoteState.status === "playing" ? "现在还没有轮到你" : "当前阶段不能落子");
    if (!point) return showToast("请先选择一个落点");
    const [row, col] = point;
    if (!isPendingMoveLegal(point)) {
      if (remoteState.game === "go" && remoteState.status === "scoring") return showToast("请选择棋盘上的棋子来标记死子");
      if ((remoteState.game === "go" ? visibleGoBoard : remoteState.game === "gomoku" ? visibleGomokuBoard : visibleReversiBoard)[row]?.[col]) return showToast("这个位置已经有棋子了");
      if (remoteState.game === "reversi") return showToast("这个位置不能落子");
    }
    void submitMatchAction(remoteState.game === "go" && remoteState.status === "scoring" ? { type: "markDead", row, col } : { type: "play", row, col });
  }

  function movePendingPoint(rowDelta: number, colDelta: number) {
    if (!remoteState || !room?.role || actionBusy) return;
    const lastMove = remoteState.lastMove;
    const origin = pendingMove ?? lastMove ?? [Math.floor(activeBoardSize / 2), Math.floor(activeBoardSize / 2)];
    const nextRow = Math.max(0, Math.min(activeBoardSize - 1, origin[0] + rowDelta));
    const nextCol = Math.max(0, Math.min(activeBoardSize - 1, origin[1] + colDelta));
    setPendingMove([nextRow, nextCol]);
  }

  return (
    <main className={`micosm-app ${preferences.motionEnabled ? "" : "motion-muted"} ${room && mainView === "games" ? "match-session-active" : ""} ${review ? "review-session-active" : ""} ${!room && (chatOpen || friendPanelOpen || accountOpen) ? "mobile-page-open" : ""} ${!room && chatOpen && chatChannel === "world" ? "mobile-world-page-open" : ""} ${!room && friendPanelOpen ? "mobile-friends-page-open" : ""} ${!room && accountOpen ? "mobile-account-page-open" : ""}`}>
      <header className="glass topbar">
        <div className="brand">
          <span className="brand-icon"><Image src="/micosm-logo.webp" alt="" width={34} height={34} priority unoptimized /></span>
          <div><strong>Micosm Game</strong><small>Board & Logic</small></div>
        </div>
        <nav className="main-nav" aria-label="主导航">
          <button className={mainView === "games" ? "active" : ""} onClick={() => setMainView("games")} type="button"><Play size={17} fill={mainView === "games" ? "currentColor" : "none"} />游戏</button>
          <button className={mainView === "ranked" ? "active" : ""} onClick={openRankedLobby} type="button"><Trophy size={17} />排位</button>
          {STORY_MODE_ENABLED && <button className={mainView === "story" ? "active" : ""} onClick={openStoryMode} type="button"><BookOpen size={17} />剧情</button>}
        </nav>
        <div className="header-actions">
          <span className="notification-trigger">
            <IconButton label="聊天" onClick={() => { if (chatOpen) setChatOpen(false); else openChat("world"); }}><MessageCircle size={18} /></IconButton>
            {chatBadge > 0 && <b>{Math.min(chatBadge, 9)}</b>}
          </span>
          <span className="notification-trigger">
            <IconButton label="好友" onClick={() => { setFriendPanelOpen((open) => !open); setChatOpen(false); setNotificationOpen(false); setAccountOpen(false); setLibraryMenuOpen(false); }}><Users size={18} /></IconButton>
            {friendBadge > 0 && <b>{Math.min(friendBadge, 9)}</b>}
          </span>
          <span className="notification-trigger">
            <IconButton label="通知" onClick={() => { setNotificationOpen((open) => !open); setChatOpen(false); setAccountOpen(false); setLibraryMenuOpen(false); }}><Bell size={18} /></IconButton>
            {notifications.length > 0 && <b>{Math.min(notifications.length, 9)}</b>}
          </span>
          <IconButton label={preferences.appearance === "dark" ? "切换明亮外观" : "切换夜间外观"} onClick={() => updatePreference("appearance", preferences.appearance === "dark" ? "light" : "dark")}>{preferences.appearance === "dark" ? <Sun size={18} /> : <Moon size={18} />}</IconButton>
          <span className="mobile-display-trigger"><IconButton label={isFullscreen ? "退出全屏" : "进入全屏"} onClick={() => void toggleBrowserFullscreen()}>{isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</IconButton></span>
          <button aria-expanded={accountOpen} className="profile" onClick={() => { setAccountOpen((open) => !open); setChatOpen(false); setNotificationOpen(false); setLibraryMenuOpen(false); }} type="button" aria-label="个人中心"><UserAvatar name={authUser?.displayName ?? displayName} src={authUser?.avatarUrl} /></button>
        </div>
      </header>

      <nav className="mobile-primary-nav" aria-label="手机主导航">
        <button className={mainView === "games" && !chatOpen && !friendPanelOpen && !accountOpen ? "active" : ""} onClick={() => { setMainView("games"); setChatOpen(false); setFriendPanelOpen(false); setAccountOpen(false); }} type="button"><Play size={20} fill="currentColor" /><span>游戏</span></button>
        <button className={chatOpen && chatChannel === "world" ? "active" : ""} onClick={() => { setMainView("games"); setFriendPanelOpen(false); setAccountOpen(false); openChat("world"); }} type="button"><Globe2 size={20} /><span>大厅</span>{chatOverview.worldUnread > 0 && <b>{Math.min(chatOverview.worldUnread, 9)}</b>}</button>
        <button className={friendPanelOpen || (chatOpen && chatChannel === "direct") ? "active" : ""} onClick={() => { setChatOpen(false); setAccountOpen(false); setFriendPanelOpen(true); }} type="button"><Users size={20} /><span>好友</span>{friendBadge > 0 && <b>{Math.min(friendBadge, 9)}</b>}</button>
        <button className={accountOpen ? "active" : ""} onClick={() => { setChatOpen(false); setFriendPanelOpen(false); setAccountOpen(true); }} type="button"><UserRound size={20} /><span>我的</span></button>
      </nav>

      {chatOpen && chatChannel === "world" && (
        <MobileWorldChannel
          activeGame={activeGame}
          busy={chatBusy}
          currentUserId={authUser?.id ?? ""}
          endRef={mobileChatEndRef}
          hall={lobbyHall}
          lobbyBusy={lobbyBusy}
          lobbyCounts={lobbyCounts}
          lobbyRooms={lobbyRooms}
          messages={chatMessages}
          onDelete={(messageId) => void chatMessageAction("delete", messageId)}
          onDirect={() => { setChatChannel("direct"); setChatPeer(null); setChatMessages([]); }}
          onHallChange={(hall) => { setLobbyHall(hall); setChatMessages([]); }}
          onInvite={() => void sendChatRoomInvite()}
          onJoin={(message) => void joinChatRoom(message)}
          onLobbyRoom={(target) => void openLobbyRoom(target)}
          onReport={(messageId) => void chatMessageAction("report", messageId)}
          onSend={() => void sendChatMessage()}
          onTextChange={setChatText}
          overview={chatOverview}
          text={chatText}
        />
      )}

      {chatOpen && (
        <ChatPanel
          activeGame={activeGame}
          busy={chatBusy}
          channel={chatChannel}
          currentUserId={authUser?.id ?? ""}
          endRef={chatEndRef}
          friends={friendsData.friends}
          hall={lobbyHall}
          lobbyBusy={lobbyBusy}
          lobbyCounts={lobbyCounts}
          lobbyRooms={lobbyRooms}
          messages={chatMessages}
          onChannelChange={(channel) => { setChatChannel(channel); setChatMessages([]); if (channel === "world") setChatPeer(null); }}
          onClose={() => setChatOpen(false)}
          onDelete={(messageId) => void chatMessageAction("delete", messageId)}
          onInvite={() => void sendChatRoomInvite()}
          onJoin={(message) => void joinChatRoom(message)}
          onLobbyRoom={(target) => void openLobbyRoom(target)}
          onHallChange={(hall) => { setLobbyHall(hall); setChatMessages([]); }}
          onPeerChange={(peer) => { setChatPeer(peer); setChatMessages([]); }}
          onReport={(messageId) => void chatMessageAction("report", messageId)}
          onSend={() => void sendChatMessage()}
          onTextChange={setChatText}
          overview={chatOverview}
          peer={chatPeer}
          text={chatText}
        />
      )}

      {friendPanelOpen && (
        <FriendPanel
          busy={friendBusy}
          data={friendsData}
          onAction={(type, targetUserId, message) => void friendAction(type, targetUserId, message)}
          onClose={() => setFriendPanelOpen(false)}
          onChat={(friend) => openChat("direct", friend)}
          onConfirm={setFriendConfirm}
          onInvite={(friend) => void inviteFriend(friend)}
          onSearch={() => void searchFriends()}
          onSearchChange={setFriendSearch}
          onTabChange={setFriendTab}
          search={friendSearch}
          searchResults={friendSearchResults}
          tab={friendTab}
        />
      )}

      {notificationOpen && (
        <aside aria-label="通知中心" className="notification-popover">
          <header><div><small>NOTIFICATIONS</small><strong>通知</strong></div>{notifications.length > 0 && <button aria-label="清空通知" onClick={() => setNotifications([])} title="清空通知" type="button"><Trash2 size={16} /></button>}</header>
          {notifications.length === 0 ? (
            <div className="notification-empty"><Bell size={20} /><span>暂无新通知</span></div>
          ) : (
            <div className="notification-list">{notifications.map((item) => <div key={item.id}><span><Check size={13} /></span><p>{item.message}</p></div>)}</div>
          )}
        </aside>
      )}

      {accountOpen && authUser && (
        <aside aria-label="账号菜单" className="account-popover">
          <header className="mobile-account-header"><small>PLAYER PROFILE</small><h2>我的</h2></header>
          <div className="account-summary">
            <UserAvatar name={authUser.displayName} src={authUser.avatarUrl} />
            <div><strong>{authUser.displayName}</strong><small>{authUser.publicId}</small><p>{authUser.signature || authUser.phone}</p></div>
            <ShieldCheck size={17} />
          </div>
          <button onClick={openProfileEditor} type="button"><Pencil size={16} />编辑个人资料</button>
          <button onClick={openHistoryView} type="button"><Clock3 size={16} />对局记录</button>
          <button onClick={openSettings} type="button"><Settings2 size={16} />游戏设置</button>
          {authUser.role === "admin" && <button onClick={() => { setModerationOpen(true); setAccountOpen(false); }} type="button"><ShieldAlert size={16} />频道管理</button>}
          <button className="mobile-app-action" onClick={() => void toggleBrowserFullscreen()} type="button">{isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{isFullscreen ? "退出浏览器全屏" : "进入浏览器全屏"}</button>
          <button className="mobile-app-action" disabled={isStandalone} onClick={() => void installMobileApp()} type="button">{isStandalone ? <Check size={16} /> : <Download size={16} />}{isStandalone ? "已从手机桌面启动" : "添加到手机桌面"}</button>
          {installGuide && <div className="mobile-install-guide" role="status"><Smartphone size={18} /><p>{installGuide}</p><button aria-label="关闭添加说明" onClick={dismissInstallGuide} type="button"><X size={15} /></button></div>}
          <button onClick={() => void signOut()} type="button"><LogOut size={16} />退出账号</button>
        </aside>
      )}

      <div className="app-primary-content">
      {mainView === "games" ? room ? (
      <div className="app-grid">
        <aside className="glass game-library match-library" aria-label="当前对局">
          <div className="panel-title"><div><small>NOW PLAYING</small><h1>{activeMeta.title}</h1></div><div className="library-menu-anchor"><IconButton label="更多" onClick={() => { setLibraryMenuOpen((open) => !open); setChatOpen(false); setNotificationOpen(false); setAccountOpen(false); }}><MoreHorizontal size={19} /></IconButton>{libraryMenuOpen && <aside className="library-popover"><button onClick={toggleFavorite} type="button"><Star fill={favorites.includes(activeGame) ? "currentColor" : "none"} size={16} />{favorites.includes(activeGame) ? `取消收藏${activeMeta.title}` : `收藏${activeMeta.title}`}</button><button onClick={openSettings} type="button"><Settings2 size={16} />游戏设置</button></aside>}</div></div>
          <div className="game-menu">
            {gameCatalog.filter((game) => game.id === activeGame).map((game) => (
              <button
                className={`game-menu-item ${activeGame === game.id ? "active" : ""}`}
                key={game.id}
                onClick={() => selectGame(game.id)}
                type="button"
              >
                <span className={`game-glyph ${game.color}`}>
                  {game.id === "go" ? <CircleDot size={22} /> : <Gamepad2 size={21} />}
                </span>
                <span className="game-menu-copy"><strong>{game.title}</strong><small>{game.subtitle}</small></span>
                <span className="game-badge">{game.badge}</span>
              </button>
            ))}
          </div>
          <div className="match-story-note" aria-live="polite"><span>{matchPhase} · 第 {moveCount + 1} 手</span><p>{matchNarration}</p><strong>藤原澪 · 棋社部长</strong></div>
          <div className="library-stats">
            <div><span>已完成</span><strong>{completed}</strong></div>
            <div><span>棋盘</span><strong>{activeGame === "go" ? `${goSize}路` : activeGame === "gomoku" ? "15路" : "8×8"}</strong></div>
          </div>
          <button className="settings-row" onClick={openSettings} type="button"><Settings2 size={18} />游戏设置</button>
        </aside>

        <section className="glass play-surface" aria-label="棋盘区">
          <header className="play-header">
            <div className="play-heading"><span className="overline">{activeMeta.badge} · 标准规则</span><h2>{activeMeta.title}</h2>{room && <small><Waypoints size={12} />{matchPhase} · {moveCount > 0 ? `已落 ${moveCount} 手` : "等待首手"}</small>}</div>
            <div className="play-tools">
              {room && (
                <div className="room-chip" title={room.mode === "private" ? "复制邀请码" : room.mode === "ranked" ? "排位对局" : room.mode === "ai" ? "人机对战" : "匹配对局"}>
                  {room.mode === "private" ? (
                    <button onClick={copyInviteCode} type="button"><KeyRound size={14} />{room.id}<span>{room.rolePending ? "?" : room.role === "black" ? "黑" : room.role === "white" ? "白" : "观"}</span></button>
                  ) : (
                    <span className="room-chip-label">{room.mode === "ranked" ? <Trophy size={14} /> : room.mode === "ai" ? <Bot size={14} /> : <Search size={14} />}{room.mode === "ranked" ? "排位对局" : room.mode === "ai" ? `人机 · ${aiDifficultyOptions.find((option) => option.id === room.state.ai?.difficulty)?.name ?? "电脑"}` : "匹配对局"}<i>{room.rolePending ? "?" : room.role === "black" ? "黑" : room.role === "white" ? "白" : "观"}</i></span>
                  )}
                  <button aria-label={room.mode !== "private" && !room.opponentReady ? "取消匹配" : "退出房间"} onClick={() => { if (room.mode !== "private" && !room.opponentReady) void cancelMatchmaking(); else setConfirmIntent("leave"); }} title={room.mode !== "private" && !room.opponentReady ? "取消匹配" : "退出房间"} type="button"><X size={15} /></button>
                </div>
              )}
              <label className="zoom-control">
                <ZoomOut size={14} aria-hidden="true" />
                <input
                  aria-label="棋盘视觉大小"
                  max="130"
                  min="60"
                  onChange={(event) => setBoardScale(Number(event.target.value))}
                  step="5"
                  type="range"
                  value={boardScale}
                />
                <span>{boardScale}%</span>
                <ZoomIn size={14} aria-hidden="true" />
              </label>
              {activeGame === "go" && (
                <div className="size-control" aria-label="棋盘尺寸">
                  {[9, 13, 19].map((size) => <button className={goSize === size ? "active" : ""} key={size} onClick={() => changeGoSize(size)} type="button">{size}</button>)}
                </div>
              )}
              <IconButton label="重新开始" onClick={resetActiveGame}><RotateCcw size={18} /></IconButton>
            </div>
          </header>

          <div className="match-scene-ribbon" aria-hidden="true">
            <Image alt="" fill sizes="70vw" src="/micosm-match-table-desktop.webp" unoptimized />
            <div><span>CELESTIAL MATCH</span><strong>{matchNarration}</strong></div>
          </div>

          {remoteState?.clock && (
            <div className="rank-clock-strip" aria-label="本手倒计时">
              <div className={remoteState.status === "playing" && visibleTurn === "black" ? "is-active" : ""}>
                <span className="mini-stone black" /><b>{room?.role === "black" ? "我 · 黑方" : room?.players.black ?? "黑方"}</b>
                <time className={(blackClockMs ?? 0) <= 60_000 ? "is-low" : ""}>{formatMatchClock(blackClockMs ?? remoteState.clock.blackMs)}</time>
              </div>
              <Clock3 size={15} aria-hidden="true" />
              <div className={remoteState.status === "playing" && visibleTurn === "white" ? "is-active" : ""}>
                <time className={(whiteClockMs ?? 0) <= 60_000 ? "is-low" : ""}>{formatMatchClock(whiteClockMs ?? remoteState.clock.whiteMs)}</time>
                <b>{room?.role === "white" ? "我 · 白方" : room?.players.white ?? "白方"}</b><span className="mini-stone white" />
              </div>
            </div>
          )}

          {room && (
            <div className="mobile-match-players" aria-label="双方玩家">
              <MatchPlayerCard active={remoteState?.status === "playing" && visibleTurn === "black"} clockMs={blackClockMs} color="black" isMe={room.role === "black"} name={room.players.black} profile={room.profiles?.black} />
              <span className="mobile-versus">VS</span>
              <MatchPlayerCard active={remoteState?.status === "playing" && visibleTurn === "white"} clockMs={whiteClockMs} color="white" isMe={room.role === "white"} name={room.players.white} profile={room.profiles?.white} />
            </div>
          )}

          {review && reviewFrame && (
            <div className="review-controls" aria-label="复盘控制">
              <div className="review-summary">
                <small>MATCH REVIEW</small>
                <strong>{reviewFrame.moveNumber === 0 ? "开局局面" : `第 ${reviewFrame.moveNumber} 手 · ${reviewFrame.description}`}</strong>
                <span>{review.index + 1} / {review.frames.length} 个局面</span>
              </div>
              <div className="review-timeline">
                <button aria-label="跳到开局" disabled={review.index === 0} onClick={() => moveReviewTo(0)} title="跳到开局" type="button"><ChevronsLeft size={18} /></button>
                <button aria-label="上一手" disabled={review.index === 0} onClick={() => moveReviewTo(review.index - 1)} title="上一手" type="button"><ChevronLeft size={19} /></button>
                <div className="review-progress" aria-hidden="true"><i style={{ width: `${review.frames.length <= 1 ? 100 : review.index / (review.frames.length - 1) * 100}%` }} /></div>
                <button aria-label="下一手" disabled={review.index === review.frames.length - 1} onClick={() => moveReviewTo(review.index + 1)} title="下一手" type="button"><ChevronRight size={19} /></button>
                <button aria-label="跳到终局" disabled={review.index === review.frames.length - 1} onClick={() => moveReviewTo(review.frames.length - 1)} title="跳到终局" type="button"><ChevronsRight size={18} /></button>
              </div>
              <button className="review-close" onClick={closeReview} type="button"><X size={16} />返回结算</button>
            </div>
          )}

          {review && reviewFrame?.insight && <div className={`review-insight-strip ${reviewFrame.insight.tone}`}><Sparkles size={16} /><strong>{reviewFrame.insight.title}</strong><span>{reviewFrame.insight.detail}</span></div>}

          <div aria-busy={actionBusy} className={`board-viewport turn-${visibleTurn} ${isMyTurn ? "is-my-turn" : "is-opponent-turn"} ${boardFeedback ? `feedback-${boardFeedback}` : ""} ${actionBusy ? "is-submitting" : ""} ${review ? "is-reviewing" : ""}`} style={boardStyle}>
            {activeGame === "go" && (
              <IntersectionBoard
                board={visibleGoBoard}
                game="go"
                lastMove={preferences.showLastMove ? reviewFrame?.lastMove ?? (remoteState?.game === "go" ? remoteState.lastMove : null) : null}
                deadPoints={!review && remoteState?.game === "go" ? remoteState.goScoring?.dead ?? [] : []}
                onConfirm={confirmRoomPoint}
                onPlay={selectRoomPoint}
                selectedPoint={review ? null : pendingMove}
                size={remoteState?.game === "go" ? remoteState.size : goSize}
              />
            )}
            {activeGame === "gomoku" && (
              <IntersectionBoard
                board={visibleGomokuBoard}
                game="gomoku"
                lastMove={preferences.showLastMove ? reviewFrame?.lastMove ?? (remoteState?.game === "gomoku" ? remoteState.lastMove : null) : null}
                analysisPoints={reviewFrame?.insight?.points}
                onConfirm={confirmRoomPoint}
                onPlay={selectRoomPoint}
                selectedPoint={review ? null : pendingMove}
                size={15}
              />
            )}
            {activeGame === "reversi" && (
              <div className="reversi-board standard-board" aria-label="8 乘 8 黑白棋棋盘">
                {visibleReversiBoard.map((row, rowIndex) => row.map((stone, colIndex) => {
                  const canAct = !review && remoteState?.status === "playing" && room?.role === visibleTurn;
                  const legal = Boolean(preferences.showMoveHints && canAct && getReversiFlips(visibleReversiBoard, rowIndex, colIndex, visibleTurn).length > 0);
                  const reversiLastMove = reviewFrame?.lastMove ?? (remoteState?.game === "reversi" ? remoteState.lastMove : null);
                  const isLast = preferences.showLastMove && reversiLastMove?.[0] === rowIndex && reversiLastMove?.[1] === colIndex;
                  const isSelected = !review && pendingMove?.[0] === rowIndex && pendingMove?.[1] === colIndex;
                  return <button aria-label={`${rowIndex + 1}-${colIndex + 1}${stone ? playerName(stone) : legal ? "可落子" : "空位"}`} className={`${stone ? `stone ${stone}` : ""} ${legal ? "legal" : ""} ${isLast ? "last" : ""} ${isSelected ? "selected-point" : ""}`} key={`${rowIndex}-${colIndex}`} onClick={() => selectRoomPoint(rowIndex, colIndex)} onDoubleClick={() => confirmRoomPoint([rowIndex, colIndex])} type="button" />;
                }))}
              </div>
            )}
            {!room && (
              <div className="room-gate" role="dialog" aria-label="双人房间">
                <div className="room-gate-icon"><Users size={24} /></div>
                <h3>开始双人对局</h3>
                <div className="player-identity">
                  <UserAvatar name={authUser?.displayName ?? "M"} src={authUser?.avatarUrl} />
                  <div><small>当前玩家</small><strong>{authUser?.displayName ?? "未登录"}</strong><p>{authUser?.signature || "未设置个性签名"}</p></div>
                  <ShieldCheck size={17} />
                </div>
                <button className="matchmaking-button" disabled={roomBusy || !displayName.trim()} onClick={startMatchmaking} type="button">
                  {roomBusy ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}开始匹配<span>随机执色</span>
                </button>
                <div className="room-divider"><span>好友对局</span></div>
                {(activeGame === "go" || activeGame === "gomoku") && (
                  <div className="color-preference">
                    <span>房主执色</span>
                    <div className="color-segments" aria-label="房主执色选择">
                      <button className={colorPreference === "black" ? "active" : ""} onClick={() => setColorPreference("black")} type="button"><i className="choice-stone black" />执黑</button>
                      <button className={colorPreference === "white" ? "active" : ""} onClick={() => setColorPreference("white")} type="button"><i className="choice-stone white" />执白</button>
                      <button className={colorPreference === "random" ? "active" : ""} onClick={() => setColorPreference("random")} type="button">随机</button>
                    </div>
                  </div>
                )}
                <button className="create-room-button" disabled={roomBusy || !displayName.trim()} onClick={createRoom} type="button">
                  {roomBusy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}创建好友房间
                </button>
                <form className="join-form" onSubmit={(event) => { event.preventDefault(); void joinRoom(); }}>
                  <input aria-label="邀请码" autoCapitalize="characters" maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6))} placeholder="输入 6 位邀请码" spellCheck={false} value={joinCode} />
                  <button aria-label="加入好友房间" disabled={roomBusy || !displayName.trim() || joinCode.length !== 6} title="加入好友房间" type="submit"><LogIn size={18} /></button>
                </form>
              </div>
            )}

            {room && !room.opponentReady && (
              <div className={`waiting-room ${room.mode === "private" ? "has-qr" : ""}`} role="status">
                <LoaderCircle className="spin" size={24} />
                <h3>{room.mode === "ranked" ? "正在匹配实力相近的对手" : room.mode === "matchmaking" ? "正在匹配对手" : "等待好友加入"}</h3>
                <p>{room.mode === "ranked" ? `${activeGame === "go" ? "19 路围棋" : "15 路五子棋"} · 随机执色 · 匹配范围会逐步扩大` : room.mode === "matchmaking" ? "同游戏与同棋盘尺寸 · 随机执色" : "把下面的 6 位邀请码发给好友"}</p>
                {room.mode !== "private" ? (
                  <button disabled={roomBusy} onClick={cancelMatchmaking} type="button"><X size={16} />取消匹配</button>
                ) : (
                  <div className="waiting-room-invite">
                    <div className="room-qr-code" data-invite-url={roomInviteUrl}>
                      {roomQrDataUrl ? <Image alt={`加入房间 ${room.id} 的二维码`} height={280} src={roomQrDataUrl} unoptimized width={280} /> : <LoaderCircle className="spin" size={24} />}
                      <span><QrCode size={13} />手机扫码加入</span>
                    </div>
                    <div className="room-invite-copy">
                      <small>房间邀请码</small>
                      <button onClick={copyInviteCode} type="button"><Copy size={16} />{room.id}</button>
                      <button className="copy-room-link" onClick={copyInviteLink} type="button"><Waypoints size={15} />复制房间链接</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {showMoveControls && (
            <div className={`move-confirm-bar ${canChooseMove ? "is-actionable" : "is-waiting"}`}>
              <div className={`move-selection-copy ${canFinishGoAgainstAi || canConfirmAiGoScore ? "has-go-action" : ""}`}>
                <CircleDot size={18} />
                <span><strong>{remoteState?.status === "scoring" ? goScoreVisible ? `暂计 黑 ${goScoreVisible.black} · 白 ${goScoreVisible.white}` : "终局数子" : pendingMove ? `第 ${pendingMove[0] + 1} 行 · 第 ${pendingMove[1] + 1} 列` : canFinishGoAgainstAi ? "电脑已停一手" : "选择落点"}</strong><small>{remoteState?.status === "scoring" ? "可点选棋子标记死子，双方确认后按当前结果判定胜负" : canFinishGoAgainstAi ? "继续落子，或结束对局进入数子" : canChooseMove ? pendingMove ? isPendingMoveLegal(pendingMove) ? "位置可落子，确认后提交" : "当前位置不可落子" : "单击选择，双击可直接落子" : "等待对手落子后再确认"}</small></span>
                {canFinishGoAgainstAi && <button className="go-end-action" disabled={actionBusy} onClick={() => void submitMatchAction({ type: "pass" })} type="button"><Flag size={14} />结束并数子</button>}
                {canConfirmAiGoScore && <button className="go-end-action confirm-score" disabled={actionBusy} onClick={() => void submitMatchAction({ type: "confirmScore" })} type="button"><Check size={14} />确认结果</button>}
              </div>
              <div className="mobile-direction-control">
                <small>移动落点</small>
                <div className="mobile-direction-pad" aria-label="移动落点">
                  <button aria-label="向上移动" className="move-up" disabled={actionBusy} onClick={() => movePendingPoint(-1, 0)} type="button"><ChevronUp size={22} /></button>
                  <button aria-label="向左移动" className="move-left" disabled={actionBusy} onClick={() => movePendingPoint(0, -1)} type="button"><ChevronLeft size={22} /></button>
                  <span className="move-center" aria-hidden="true"><CircleDot size={15} /></span>
                  <button aria-label="向右移动" className="move-right" disabled={actionBusy} onClick={() => movePendingPoint(0, 1)} type="button"><ChevronRight size={22} /></button>
                  <button aria-label="向下移动" className="move-down" disabled={actionBusy} onClick={() => movePendingPoint(1, 0)} type="button"><ChevronDown size={22} /></button>
                </div>
              </div>
              <button className="confirm-move-button" disabled={actionBusy || !isPendingMoveLegal(pendingMove)} onClick={() => confirmRoomPoint()} type="button"><Check size={18} />{remoteState?.status === "scoring" ? "确认标记" : "确认落子"}</button>
            </div>
          )}

          {mobileMatchMenuOpen && <button aria-label="关闭对局操作" className="mobile-action-scrim" onClick={() => setMobileMatchMenuOpen(false)} type="button" />}
          <footer className={`play-footer ${isMyTurn ? "is-my-turn" : ""} ${mobileMatchMenuOpen ? "has-mobile-menu" : ""}`}>
            <div className="status-pill"><span className={`mini-stone ${visibleTurn}`} /><span><strong>{gameStatus}</strong>{remoteState && ["playing", "scoring"].includes(remoteState.status) && <small>{remoteState.notice}</small>}</span></div>
            <div className={`footer-actions ${mobileMatchMenuOpen ? "is-open" : ""}`}>
              <button aria-label="打开对局操作" className="mobile-match-menu-trigger" onClick={() => setMobileMatchMenuOpen(true)} title="对局操作" type="button"><MoreHorizontal size={20} /></button>
              <div className="mobile-actions-head"><span><small>MATCH ACTIONS</small><strong>对局操作</strong></span><button aria-label="关闭对局操作" onClick={() => setMobileMatchMenuOpen(false)} type="button"><X size={18} /></button></div>
              {review ? <button className="secondary-action" onClick={closeReview} type="button"><X size={16} />结束复盘</button> : room && !room.role ? <button className="secondary-action" onClick={clearRoom} type="button"><ChevronLeft size={16} />退出观战</button> : <>
              {room && <span className={`connection-state ${connectionState}`}>{connectionState === "reconnecting" ? <WifiOff size={14} /> : <Wifi size={14} />}{connectionState === "reconnecting" ? "重连中" : "已连接"}</span>}
              {room?.mode === "matchmaking" && room.role && <button className={`secondary-action spectator-consent-action ${room.spectatorPolicy === "public" ? "is-open" : ""}`} disabled={actionBusy} onClick={() => { setMobileMatchMenuOpen(false); void toggleMatchmakingSpectators(); }} type="button"><Users size={16} />{room.spectatorPolicy === "public" ? "观战已开放" : (room.state.spectatorConsents ?? []).includes(room.role) ? "已同意观战" : "同意开放观战"}</button>}
              {room?.mode === "ai" && aiError && <button className="secondary-action ai-retry-action" disabled={aiThinking} onClick={() => setAiRetryNonce((value) => value + 1)} type="button"><RotateCcw size={16} />重新计算</button>}
              <button className="secondary-action" disabled={room?.mode === "ranked" || !canRequestUndo || actionBusy} onClick={() => { setMobileMatchMenuOpen(false); void submitMatchAction({ type: "requestUndo" }); }} title={room?.mode === "ranked" ? "排位对局不能悔棋" : canRequestUndo ? room?.mode === "ai" ? "撤销双方上一轮落子" : "申请撤销刚刚的一手" : room?.mode === "ai" ? "电脑落子后可以悔棋" : "只能撤销自己刚刚落下的一手"} type="button"><Undo2 size={16} />悔棋</button>
              <button className="secondary-action resign-action" disabled={!room?.opponentReady || matchEnded || actionBusy} onClick={() => { setMobileMatchMenuOpen(false); setConfirmIntent("resign"); }} title="认输并结束本局" type="button"><Flag size={16} />认输</button>
              <button className="secondary-action mobile-reset-action" disabled={room?.mode === "ranked" || matchEnded || actionBusy} onClick={() => { setMobileMatchMenuOpen(false); resetActiveGame(); }} type="button"><RotateCcw size={16} />重新开始</button>
              {activeGame === "go" && remoteState?.status === "scoring" ? <>
                <button className="secondary-action" disabled={actionBusy} onClick={() => { setMobileMatchMenuOpen(false); void submitMatchAction({ type: "resumeGo" }); }} type="button"><Play size={16} />继续对局</button>
                <button className="secondary-action score-confirm-action" disabled={actionBusy || remoteState.goScoring?.confirmations.includes(room?.role ?? "black")} onClick={() => { setMobileMatchMenuOpen(false); void submitMatchAction({ type: "confirmScore" }); }} type="button"><Check size={16} />{remoteState.goScoring?.confirmations.includes(room?.role ?? "black") ? "已确认" : "确认数子"}</button>
              </> : activeGame === "go" && <button className="secondary-action" disabled={!room || !room.opponentReady || matchEnded || actionBusy} onClick={() => { setMobileMatchMenuOpen(false); void submitMatchAction({ type: "pass" }); }} type="button"><Pause size={16} />停一手</button>}
              </>}
            </div>
          </footer>
        </section>

        <aside className="glass info-panel" aria-label="对局信息">
          <div className="panel-title"><div><small>MATCH</small><h2>对局信息</h2></div>{room?.mode === "ai" ? <span className="ai-panel-badge"><Bot size={17} /></span> : room && !room.role ? <span className="ai-panel-badge"><Users size={17} /></span> : <IconButton label="邀请玩家" onClick={invitePlayers}><Users size={18} /></IconButton>}</div>

          <section className="turn-card">
            <span className="info-label">当前状态</span>
            <div className="turn-row"><span className={`large-stone ${visibleTurn}`} /><div><strong>{gameStatus}</strong><small>{room ? roomRole : activeMeta.subtitle}</small></div></div>
          </section>

          <section className="match-players" aria-label="对局玩家">
            <MatchPlayerCard active={remoteState?.status === "playing" && visibleTurn === "black"} clockMs={blackClockMs} color="black" isMe={room?.role === "black"} name={room?.players.black} profile={room?.profiles?.black} />
            <MatchPlayerCard active={remoteState?.status === "playing" && visibleTurn === "white"} clockMs={whiteClockMs} color="white" isMe={room?.role === "white"} name={room?.players.white} profile={room?.profiles?.white} />
          </section>

          <section className="score-block">
            <span className="info-label">比分</span>
            {activeGame === "go" && <><ScoreRow color="black" label={`${blackLabel}提子`} value={goCapturesVisible.black} /><ScoreRow color="white" label={`${whiteLabel}提子`} value={goCapturesVisible.white} />{goScoreVisible && <><ScoreRow label={`${blackLabel}${matchEnded ? "数子" : "暂计"}`} value={goScoreVisible.black} /><ScoreRow label={`${whiteLabel}${matchEnded ? "数子" : "暂计"}`} value={goScoreVisible.white} /></>}</>}
            {activeGame === "reversi" && <><ScoreRow color="black" label={blackLabel} value={reversiScore.black} /><ScoreRow color="white" label={whiteLabel} value={reversiScore.white} /></>}
            {activeGame === "gomoku" && <><ScoreRow color="black" label={blackLabel} value={visibleGomokuBoard.flat().filter((stone) => stone === "black").length} /><ScoreRow color="white" label={whiteLabel} value={visibleGomokuBoard.flat().filter((stone) => stone === "white").length} /></>}
          </section>

          <section className="rule-block">
            <span className="info-label">规则</span>
            <p>{activeGame === "go" && "中国数子法，黑贴 3 又 3/4 子（等效白加 7.5 点）；全局同形禁着，双停后双方标记死子并确认。"}{activeGame === "gomoku" && `黑方先行，率先连成五子获胜。${remoteState?.gomokuForbidden ? "本局启用三三、四四与长连禁手。" : "本局不启用禁手。"}`}{activeGame === "reversi" && "夹住对手棋子并翻转，终局棋子较多者获胜。"}</p>
          </section>

          <div className="focus-note"><Sparkles size={18} /><div><strong>{room ? room.mode === "ranked" ? "排位对局" : room.mode === "matchmaking" ? "服务器匹配" : room.mode === "ai" ? `人机 · ${aiDifficultyOptions.find((option) => option.id === room.state.ai?.difficulty)?.title ?? "标准"}` : `邀请码 ${room.id}` : "多人模式"}</strong><p>{room ? `${roomRole} · ${room.opponentReady ? opponentDisplayName ? `${room.mode === "ai" ? "电脑棋手" : "对手"} ${opponentDisplayName}` : "双方已连接" : "等待对手"}` : "可以随机匹配，也可以邀请好友。"}</p></div></div>
          <button className="primary-action" disabled={room?.mode === "ranked" || Boolean(room && !room.role)} onClick={resetActiveGame} title={room?.mode === "ranked" ? "排位对局不能重开" : room && !room.role ? "观战模式不能操作棋局" : "重新开始"} type="button"><RotateCcw size={17} />{room && !room.role ? "观战中" : room?.mode === "ranked" ? "排位进行中" : "重新开始"}</button>
        </aside>
      </div>
      ) : (
        <>
          <div className="desktop-home-shell">
            <ClubLobby
              activeGame={activeGame}
              authUser={authUser}
              busy={roomBusy}
              colorPreference={colorPreference}
              completed={completed}
              favoriteCount={favorites.length}
              goSize={goSize}
              joinCode={joinCode}
              privateClockEnabled={privateClockEnabled}
              privateTurnSeconds={privateTurnSeconds}
              privateForbiddenEnabled={privateForbiddenEnabled}
              privateSpectatorPolicy={privateSpectatorPolicy}
              onColorChange={setColorPreference}
              onClockEnabledChange={setPrivateClockEnabled}
              onTurnSecondsChange={setPrivateTurnSeconds}
              onForbiddenEnabledChange={setPrivateForbiddenEnabled}
              onSpectatorPolicyChange={setPrivateSpectatorPolicy}
              onCreate={() => void createRoom()}
              onGameChange={selectGame}
              onGoSizeChange={changeGoSize}
              onJoin={() => void joinRoom()}
              onJoinCodeChange={setJoinCode}
              onAI={openAiSetup}
              onMatch={() => void startMatchmaking()}
              onRanked={openRankedLobby}
              onScan={openRoomScanner}
              onlineFriends={friendsData.friends.filter((friend) => friend.online).length}
            />
          </div>
          <MobileGameHome
            activeGame={activeGame}
            authUser={authUser}
            busy={roomBusy}
            colorPreference={colorPreference}
            completed={completed}
            favoriteCount={favorites.length}
            goSize={goSize}
            joinCode={joinCode}
            privateClockEnabled={privateClockEnabled}
            privateTurnSeconds={privateTurnSeconds}
            privateForbiddenEnabled={privateForbiddenEnabled}
            privateSpectatorPolicy={privateSpectatorPolicy}
            onColorChange={setColorPreference}
            onClockEnabledChange={setPrivateClockEnabled}
            onTurnSecondsChange={setPrivateTurnSeconds}
            onForbiddenEnabledChange={setPrivateForbiddenEnabled}
            onSpectatorPolicyChange={setPrivateSpectatorPolicy}
            onCreate={() => void createRoom()}
            onGameChange={selectGame}
            onGoSizeChange={changeGoSize}
            onJoin={() => void joinRoom()}
            onJoinCodeChange={setJoinCode}
            onAI={openAiSetup}
            onMatch={() => void startMatchmaking()}
            onRanked={openRankedLobby}
            onScan={openRoomScanner}
            onStory={openStoryMode}
            onlineFriends={friendsData.friends.filter((friend) => friend.online).length}
          />
        </>
      ) : mainView === "history" ? (
        <HistoryCenter
          busy={historyBusy}
          error={historyError}
          onBack={() => { setHistoryReview(null); setMainView("games"); }}
          onCloseReview={() => setHistoryReview(null)}
          onMoveReview={(index) => setHistoryReview((current) => current ? { ...current, index: Math.max(0, Math.min(current.frames.length - 1, index)) } : current)}
          onOpen={(id) => void openHistoryRecord(id)}
          records={historyRecords}
          review={historyReview}
        />
      ) : mainView === "ranked" ? (
        <RankedLobby
          busy={rankBusy}
          data={rankData}
          game={rankedGame}
          onGameChange={setRankedGame}
          onStart={() => void startRanked()}
          user={authUser}
        />
      ) : (
        <StoryMode user={authUser} />
      )}
      </div>

      {(!authReady || !authUser) && (
        <div className="auth-backdrop">
          <section aria-labelledby="auth-title" aria-modal="true" className="auth-dialog" role="dialog">
            {!authReady ? (
              <LoaderCircle aria-label="正在检查登录状态" className="spin" size={26} />
            ) : (
              <>
                <span className="auth-logo"><Image src="/micosm-logo.webp" alt="" height={44} width={44} unoptimized /></span>
                <h2 id="auth-title">进入 Micosm Game</h2>
                <p>{authMode === "signIn" ? "登录你的棋手账号" : "创建唯一的棋手身份"}</p>
                <div className="auth-mode" aria-label="登录方式">
                  <button className={authMode === "signIn" ? "active" : ""} onClick={() => { setAuthMode("signIn"); setAuthError(""); }} type="button">登录</button>
                  <button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }} type="button">注册</button>
                </div>
                <form onSubmit={(event) => { event.preventDefault(); void submitAuth(); }}>
                  {authError && <div aria-live="assertive" className="auth-error" role="alert"><AlertTriangle size={16} /><span>{authError}</span></div>}
                  {authMode === "register" && <label><span><UserRound size={14} />用户名</span><input autoComplete="nickname" maxLength={16} onChange={(event) => { setDisplayName(event.target.value); setAuthError(""); }} placeholder="全局唯一用户名" value={displayName} /></label>}
                  <label><span><Smartphone size={14} />手机号</span><input autoComplete="tel" inputMode="numeric" maxLength={18} onChange={(event) => { setAuthPhone(event.target.value.replace(/[^\d +]/g, "")); setAuthError(""); }} placeholder="中国大陆手机号" value={authPhone} /></label>
                  <label><span><LockKeyhole size={14} />密码</span><input autoComplete={authMode === "signIn" ? "current-password" : "new-password"} maxLength={64} minLength={8} onChange={(event) => { setAuthPassword(event.target.value); setAuthError(""); }} placeholder="8 至 64 个字符" type="password" value={authPassword} /></label>
                  {authMode === "register" && <label><span><ShieldCheck size={14} />确认密码</span><input autoComplete="new-password" maxLength={64} minLength={8} onChange={(event) => { setAuthPasswordConfirm(event.target.value); setAuthError(""); }} placeholder="再次输入密码" type="password" value={authPasswordConfirm} /></label>}
                  {authMode === "register" && <label><span><KeyRound size={14} />邀请码</span><input autoComplete="one-time-code" maxLength={16} onChange={(event) => { setAuthInviteCode(event.target.value); setAuthError(""); }} placeholder="输入邀请码" type="password" value={authInviteCode} /></label>}
                  <div className="sms-reserved" aria-label="手机验证码预留入口">
                    <input disabled placeholder="短信验证码" />
                    <button disabled title="短信服务暂未接入" type="button">获取验证码</button>
                  </div>
                  <button className="auth-submit" disabled={authBusy || !authPhone.trim() || authPassword.length < 8 || (authMode === "register" && (!displayName.trim() || !authInviteCode.trim() || authPassword !== authPasswordConfirm))} type="submit">{authBusy ? <LoaderCircle className="spin" size={17} /> : <LogIn size={17} />}{authMode === "signIn" ? "登录" : "注册并登录"}</button>
                </form>
              </>
            )}
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSettingsOpen(false); }}>
          <section aria-labelledby="settings-title" aria-modal="true" className="settings-dialog" role="dialog">
            <header><div><span>SETTINGS</span><h2 id="settings-title">游戏设置</h2></div><button aria-label="关闭设置" onClick={() => setSettingsOpen(false)} type="button"><X size={18} /></button></header>
            <div className="settings-group">
              <span className="settings-label">外观</span>
              <div className="appearance-control" aria-label="外观模式">
                <button className={preferences.appearance === "light" ? "active" : ""} onClick={() => updatePreference("appearance", "light")} type="button"><Sun size={16} />明亮</button>
                <button className={preferences.appearance === "dark" ? "active" : ""} onClick={() => updatePreference("appearance", "dark")} type="button"><Moon size={16} />夜间</button>
              </div>
            </div>
            <div className="settings-group">
              <label className="settings-scale"><span><ZoomIn size={17} />棋盘大小<strong>{boardScale}%</strong></span><input aria-label="棋盘大小" max="130" min="70" onChange={(event) => setBoardScale(Number(event.target.value))} step="5" type="range" value={boardScale} /></label>
            </div>
            <div className="settings-toggles">
              <SettingToggle checked={preferences.soundEnabled} icon={<Volume2 size={17} />} label="落子音效" onChange={(value) => updatePreference("soundEnabled", value)} />
              <SettingToggle checked={preferences.motionEnabled} icon={<Sparkles size={17} />} label="动态氛围" onChange={(value) => updatePreference("motionEnabled", value)} />
              <SettingToggle checked={preferences.showMoveHints} icon={<Sparkles size={17} />} label="可落子提示" onChange={(value) => updatePreference("showMoveHints", value)} />
              <SettingToggle checked={preferences.showLastMove} icon={<CircleDot size={17} />} label="最后一手标记" onChange={(value) => updatePreference("showLastMove", value)} />
              <SettingToggle checked={preferences.confirmRestart} icon={<RotateCcw size={17} />} label="重开前确认" onChange={(value) => updatePreference("confirmRestart", value)} />
            </div>
            <footer><button onClick={() => { setPreferences(defaultPreferences); setBoardScale(100); showToast("游戏设置已恢复默认"); }} type="button"><RotateCcw size={16} />恢复默认</button><button onClick={() => setSettingsOpen(false)} type="button"><Check size={16} />完成</button></footer>
          </section>
        </div>
      )}

      {aiSetupOpen && (
        <div className="auth-backdrop ai-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setAiSetupOpen(false); }}>
          <section aria-labelledby="ai-setup-title" aria-modal="true" className="settings-dialog ai-setup-dialog" role="dialog">
            <header><div><span>SOLO MATCH</span><h2 id="ai-setup-title">挑战电脑棋手</h2></div><button aria-label="关闭人机设置" onClick={() => setAiSetupOpen(false)} type="button"><X size={18} /></button></header>
            <div className="ai-game-summary"><span><Bot size={22} /></span><div><strong>{activeMeta.title} · {activeGame === "go" ? `${goSize} 路` : activeMeta.subtitle}</strong><p>选择对手强度和你的执色，开局后可悔棋、再战和复盘。</p></div></div>
            <div className="ai-setup-section">
              <span className="settings-label">对手难度</span>
              <div className="ai-difficulty-grid">
                {aiDifficultyOptions.map((option) => (
                  <button className={aiDifficulty === option.id ? "active" : ""} key={option.id} onClick={() => setAiDifficulty(option.id)} type="button">
                    <span>{option.name}</span><strong>{option.title}</strong><small>{option.id === "master" ? activeGame === "go" ? "KataGo GPU 神经网络" : activeGame === "gomoku" ? "Rapfi NNUE 专业引擎" : "当前棋种的最高搜索强度" : option.detail}</small>{aiDifficulty === option.id && <Check size={15} />}
                  </button>
                ))}
              </div>
            </div>
            {(activeGame === "go" || activeGame === "gomoku") && <div className="ai-setup-section"><span className="settings-label">我的执色</span><div className="ai-color-control"><button className={aiColor === "black" ? "active" : ""} onClick={() => setAiColor("black")} type="button"><i className="choice-stone black" />黑方</button><button className={aiColor === "white" ? "active" : ""} onClick={() => setAiColor("white")} type="button"><i className="choice-stone white" />白方</button><button className={aiColor === "random" ? "active" : ""} onClick={() => setAiColor("random")} type="button"><Sparkles size={14} />随机</button></div></div>}
            {activeGame === "gomoku" && <label className="ai-forbidden-toggle"><span><ShieldCheck size={17} /><span><strong>启用禁手</strong><small>限制黑方三三、四四与长连</small></span></span><input checked={privateForbiddenEnabled} onChange={(event) => setPrivateForbiddenEnabled(event.target.checked)} type="checkbox" /></label>}
            {(activeGame === "go" || activeGame === "gomoku") && aiDifficulty === "master" && <div className={`ai-engine-state ${aiEngineStatus?.ready ? "ready" : aiEngineStatus ? "offline" : "loading"}`}><span>{aiEngineStatus ? aiEngineStatus.ready ? <Check size={17} /> : <AlertTriangle size={17} /> : <LoaderCircle className="spin" size={17} />}</span><div><strong>{aiEngineStatus?.ready ? activeGame === "gomoku" ? "Rapfi NNUE 已就绪" : "KataGo GPU 已就绪" : aiEngineStatus ? activeGame === "gomoku" ? "Rapfi NNUE 未连接" : "KataGo GPU 未连接" : "正在检测本机引擎"}</strong><small>{aiEngineStatus?.detail || "正在读取神经网络状态"}</small></div>{aiEngineStatus && !aiEngineStatus.ready && <button onClick={() => void refreshAiEngineStatus()} type="button">重试</button>}</div>}
            <footer><button onClick={() => setAiSetupOpen(false)} type="button">取消</button><button disabled={roomBusy || ((activeGame === "go" || activeGame === "gomoku") && aiDifficulty === "master" && aiEngineStatus?.ready !== true)} onClick={() => void startAiMatch()} type="button">{roomBusy ? <LoaderCircle className="spin" size={16} /> : <Play fill="currentColor" size={16} />}开始挑战</button></footer>
          </section>
        </div>
      )}

      <input
        accept="image/*"
        capture="environment"
        className="scanner-capture-input"
        disabled={scannerImageBusy}
        onChange={(event) => { void scanQrImage(event.target.files?.[0]); event.target.value = ""; }}
        ref={scannerCaptureRef}
        type="file"
      />

      {scannerOpen && (
        <div className="scanner-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setScannerOpen(false); }}>
          <section aria-labelledby="scanner-title" aria-modal="true" className="scanner-dialog" role="dialog">
            <header><div><span>SCAN ROOM</span><h2 id="scanner-title">扫描房间二维码</h2></div><button aria-label="关闭扫码" onClick={() => setScannerOpen(false)} type="button"><X size={18} /></button></header>
            <div className="scanner-camera">
              <video autoPlay muted playsInline ref={scannerVideoRef} />
              <i aria-hidden="true"><span /></i>
              {!scannerError && <div><ScanLine size={20} /><span>对准房间二维码</span></div>}
            </div>
            {scannerError && <p className="scanner-error"><AlertTriangle size={15} />{scannerError}</p>}
            <div className="scanner-fallback-actions">
              <label className="scanner-photo-action"><Camera size={16} />{scannerImageBusy ? "识别中" : "拍照识别"}<input accept="image/*" capture="environment" disabled={scannerImageBusy} onChange={(event) => { void scanQrImage(event.target.files?.[0]); event.target.value = ""; }} type="file" /></label>
              <button className="scanner-close-action" onClick={() => setScannerOpen(false)} type="button">改用邀请码</button>
            </div>
          </section>
        </div>
      )}

      {profileOpen && authUser && (
        <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setProfileOpen(false); }}>
          <section aria-labelledby="profile-title" aria-modal="true" className="profile-dialog" role="dialog">
            <header><div><span>PROFILE</span><h2 id="profile-title">编辑个人资料</h2></div><button aria-label="关闭" onClick={() => setProfileOpen(false)} type="button"><X size={18} /></button></header>
            <form onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
              <div className="avatar-editor">
                <UserAvatar name={profileName} src={profileAvatarPreview} />
                <label><Camera size={16} />更换头像<input accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => chooseAvatar(event.target.files?.[0])} type="file" /></label>
                {profileAvatarPreview && <button aria-label="移除头像" onClick={() => { setProfileAvatar(null); setProfileAvatarPreview(null); setProfileRemoveAvatar(true); }} title="移除头像" type="button"><Trash2 size={16} /></button>}
              </div>
              <div className="profile-public-id"><span>棋手 ID</span><strong>{authUser.publicId}</strong><button aria-label="复制棋手 ID" onClick={() => void navigator.clipboard.writeText(authUser.publicId).then(() => showToast("棋手 ID 已复制"))} title="复制棋手 ID" type="button"><Copy size={15} /></button></div>
              <label><span>用户名</span><input autoComplete="nickname" maxLength={16} onChange={(event) => setProfileName(event.target.value)} value={profileName} /></label>
              <label><span>个性签名</span><textarea maxLength={60} onChange={(event) => setProfileSignature(event.target.value)} placeholder="写一句介绍自己" rows={3} value={profileSignature} /><small>{Array.from(profileSignature).length}/60</small></label>
              <div className="profile-passwords">
                <span>{authUser.hasPassword ? "修改密码（可选）" : "设置登录密码"}</span>
                {authUser.hasPassword && <input autoComplete="current-password" onChange={(event) => setProfileCurrentPassword(event.target.value)} placeholder="当前密码" type="password" value={profileCurrentPassword} />}
                <input autoComplete="new-password" maxLength={64} minLength={8} onChange={(event) => setProfileNewPassword(event.target.value)} placeholder={authUser.hasPassword ? "新密码，留空则不修改" : "设置 8 至 64 位密码"} type="password" value={profileNewPassword} />
              </div>
              <div className="profile-actions"><button onClick={() => setProfileOpen(false)} type="button">取消</button><button disabled={authBusy || !profileName.trim()} type="submit">{authBusy ? <LoaderCircle className="spin" size={16} /> : null}保存资料</button></div>
            </form>
          </section>
        </div>
      )}

      {moderationOpen && authUser?.role === "admin" && <ModerationPanel onClose={() => setModerationOpen(false)} onNotice={(message) => showToast(message, "success")} />}

      {toast && <div className={`game-toast ${toast.tone}`} key={toast.id} role="status">{toast.tone === "success" ? <Check size={17} /> : toast.tone === "warning" ? <AlertTriangle size={17} /> : <Sparkles size={17} />}{toast.message}</div>}

      {pendingGameInvite && (
        <aside aria-labelledby="game-invite-title" aria-live="assertive" className="friend-invite-popover" role="dialog">
          <div className="friend-invite-head">
            <UserAvatar name={pendingGameInvite.displayName} src={pendingGameInvite.avatarUrl} />
            <div><h3 id="game-invite-title">{pendingGameInvite.displayName} 邀请你对局</h3><p>{gameCatalog.find((game) => game.id === pendingGameInvite.game)?.title ?? "棋类对局"}</p></div>
          </div>
          <div className="undo-actions">
            <button disabled={friendBusy === `gameInvite:${pendingGameInvite.inviteId}`} onClick={() => void respondGameInvite(pendingGameInvite, false)} type="button">拒绝</button>
            <button disabled={Boolean(room) || friendBusy === `gameInvite:${pendingGameInvite.inviteId}`} onClick={() => void respondGameInvite(pendingGameInvite, true)} title={room ? "请先退出当前房间" : "接受并自动进入房间"} type="button">接受邀请</button>
          </div>
        </aside>
      )}

      {undoRequest && room && (
        <aside aria-labelledby="undo-title" aria-live="polite" className="undo-popover" role="dialog">
          <div className="undo-popover-head">
            <span className="undo-popover-icon">{undoRequest.requester === room.role ? <LoaderCircle className="spin" size={18} /> : <Undo2 size={18} />}</span>
            <div><h3 id="undo-title">{undoRequest.requester === room.role ? "悔棋请求已发送" : "对手申请悔棋"}</h3><p>{undoRequest.requester === room.role ? "等待对手处理" : "是否撤销对手刚刚的一手？"}</p></div>
          </div>
            {undoRequest.requester === room.role ? (
              <button className="undo-cancel" disabled={actionBusy} onClick={() => void submitMatchAction({ type: "cancelUndo" })} type="button">取消申请</button>
            ) : (
              <div className="undo-actions">
                <button disabled={actionBusy} onClick={() => void submitMatchAction({ type: "respondUndo", accept: false })} type="button">拒绝</button>
                <button disabled={actionBusy} onClick={() => void submitMatchAction({ type: "respondUndo", accept: true })} type="button">同意悔棋</button>
              </div>
            )}
        </aside>
      )}

      {outcome && (
        <div className="result-backdrop" role="presentation">
          <section aria-labelledby="result-title" aria-modal="true" className={`result-dialog match-result-dialog ${outcome.won ? "is-victory" : "is-defeat"}`} role="dialog">
            <div className="result-hero">
              <div className={`result-mark ${outcome.won ? "win" : ""}`}><Trophy size={30} /></div>
              <div className="result-heading">
                <span>{outcome.mode === "ranked" ? "RANKED MATCH" : outcome.mode === "matchmaking" ? "QUICK MATCH" : outcome.mode === "ai" ? "AI CHALLENGE" : "FRIEND MATCH"}</span>
                <h2 id="result-title">{outcome.title}</h2>
                <p>{outcome.detail}</p>
              </div>
            </div>
            <div className="result-stats" aria-label="对局摘要">
              <div><small>棋种</small><strong>{outcome.game === "go" ? "围棋" : outcome.game === "gomoku" ? "五子棋" : "黑白棋"}</strong></div>
              <div><small>执色</small><strong>{room?.role ? playerName(room.role) : "观战"}</strong></div>
              <div><small>手数</small><strong>{room?.state.moves?.filter((move) => move.type !== "resumeGo").length ?? moveCount} 手</strong></div>
            </div>
            <div className="result-note"><Sparkles size={17} /><span>终局棋盘已保留，可以逐手回看这盘棋的每一次选择。</span></div>
            <div className="result-cta">
              <button className="review-action" onClick={startReview} type="button"><RotateCcw size={17} />查看复盘</button>
              <button className="result-primary-action" onClick={returnFromResult} type="button">{outcome.mode === "ranked" ? <><Trophy size={16} />返回排位</> : <><Play size={16} />返回游戏大厅</>}</button>
            </div>
            {outcome.mode !== "ranked" && outcome.kind === "result" && (
              <div className="rematch-panel">
                {!rematchRequest ? (
                  <button className="rematch-action" disabled={actionBusy} onClick={rematch} type="button"><RotateCcw size={15} />{outcome.mode === "ai" ? "再次挑战" : "向对手发起再战"}</button>
                ) : rematchRequest.requester === room?.role ? (
                  <div className="rematch-waiting"><LoaderCircle className="spin" size={16} /><span>已发出再战请求</span><button disabled={actionBusy} onClick={() => void submitMatchAction({ type: "cancelRematch" })} type="button">取消</button></div>
                ) : (
                  <div className="rematch-response"><strong>对手邀请你再战</strong><div><button disabled={actionBusy} onClick={() => void submitMatchAction({ type: "respondRematch", accept: false })} type="button">拒绝</button><button disabled={actionBusy} onClick={() => void submitMatchAction({ type: "respondRematch", accept: true })} type="button">接受再战</button></div></div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {confirmIntent && (
        <div className="result-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirmIntent(null); }}>
          <section aria-labelledby="confirm-title" aria-modal="true" className="result-dialog confirm-dialog" role="dialog">
            <div className="result-mark warning"><AlertTriangle size={27} /></div>
            <h2 id="confirm-title">{confirmIntent === "leave" ? "退出当前房间？" : confirmIntent === "resign" ? "确认认输？" : "重新开始本局？"}</h2>
            <p>{confirmIntent === "leave" ? room?.mode === "ai" ? "本次挑战会结束，仍可在大厅重新选择难度。" : "对手会收到离开提示，本局将立即结束。" : confirmIntent === "resign" ? "本局会立即结束并记入双方对局记录，结果不可撤销。" : "棋盘将立即清空，双方回到黑方先行。"}</p>
            <div className="result-actions">
              <button onClick={() => setConfirmIntent(null)} type="button">取消</button>
              <button className="danger-action" disabled={roomBusy} onClick={() => { if (confirmIntent === "leave") void leaveRoom(); else if (confirmIntent === "resign") { setConfirmIntent(null); void submitMatchAction({ type: "resign" }); } else { setConfirmIntent(null); void submitMatchAction({ type: "reset" }); } }} type="button">{confirmIntent === "leave" ? "确认退出" : confirmIntent === "resign" ? "确认认输" : "确认重开"}</button>
            </div>
          </section>
        </div>
      )}

      {friendConfirm && (
        <div className="result-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setFriendConfirm(null); }}>
          <section aria-labelledby="friend-confirm-title" aria-modal="true" className="result-dialog confirm-dialog" role="dialog">
            <div className="result-mark warning"><Users size={27} /></div>
            <h2 id="friend-confirm-title">{friendConfirm.type === "blockUser" ? `屏蔽 ${friendConfirm.person.displayName}？` : `删除好友 ${friendConfirm.person.displayName}？`}</h2>
            <p>{friendConfirm.type === "blockUser" ? "对方将无法搜索、添加或邀请你。" : "删除后需要重新发送好友申请。"}</p>
            <div className="result-actions">
              <button onClick={() => setFriendConfirm(null)} type="button">取消</button>
              <button className="danger-action" disabled={Boolean(friendBusy)} onClick={() => { const current = friendConfirm; setFriendConfirm(null); void friendAction(current.type, current.person.id, current.type === "blockUser" ? "已屏蔽该用户" : "好友已删除"); }} type="button">确认</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function UserAvatar({ name, src }: { name: string; src?: string | null }) {
  return <span className="user-avatar">{src ? <Image alt={`${name}的头像`} height={64} src={src} unoptimized width={64} /> : <b>{Array.from(name.trim())[0]?.toUpperCase() ?? "M"}</b>}</span>;
}

function MatchPlayerCard({ active, clockMs, color, isMe, name, profile }: { active?: boolean; clockMs?: number; color: Player; isMe: boolean; name?: string | null; profile?: PlayerProfile | null }) {
  const displayName = name ?? "等待对手";
  return (
    <div className={`match-player ${color} ${name ? "ready" : "waiting"} ${active ? "is-active" : ""} ${isMe ? "is-me" : "is-opponent"}`}>
      <UserAvatar name={displayName} src={profile?.avatarUrl} />
      <div><strong>{displayName}{name && <em>{isMe ? "我" : "对手"}</em>}</strong><p>{profile?.signature || (name ? "未设置个性签名" : "尚未加入对局")}</p>{clockMs !== undefined && <time className={clockMs <= 60_000 ? "is-low" : ""}><Clock3 size={11} />{formatMatchClock(clockMs)}</time>}</div>
      <span>{active && <i />} {color === "black" ? "黑" : "白"}</span>
    </div>
  );
}

function RankEmblemArt({ index, eager = false }: { index: number; eager?: boolean }) {
  return <Image alt="" aria-hidden="true" className="rank-emblem-art" height={384} loading={eager ? "eager" : "lazy"} src={RANK_EMBLEMS[index] ?? RANK_EMBLEMS[0]} unoptimized width={384} />;
}

function ResponsiveArtwork({ alt, desktop, mobile }: { alt: string; desktop: string; mobile: string }) {
  return (
    <picture className="responsive-art">
      <source media="(max-width: 600px)" srcSet={mobile} />
      <img alt={alt} decoding="async" src={desktop} />
    </picture>
  );
}

type ClubLobbyProps = {
  activeGame: GameId;
  authUser: AuthUser | null;
  busy: boolean;
  colorPreference: ColorPreference;
  completed: number;
  favoriteCount: number;
  goSize: number;
  joinCode: string;
  privateClockEnabled: boolean;
  privateTurnSeconds: number;
  privateForbiddenEnabled: boolean;
  privateSpectatorPolicy: SpectatorPolicy;
  onClockEnabledChange: (enabled: boolean) => void;
  onTurnSecondsChange: (seconds: number) => void;
  onForbiddenEnabledChange: (enabled: boolean) => void;
  onSpectatorPolicyChange: (policy: SpectatorPolicy) => void;
  onColorChange: (preference: ColorPreference) => void;
  onCreate: () => void;
  onGameChange: (game: GameId) => void;
  onGoSizeChange: (size: number) => void;
  onJoin: () => void;
  onJoinCodeChange: (code: string) => void;
  onAI: () => void;
  onMatch: () => void;
  onRanked: () => void;
  onScan: () => void;
  onStory?: () => void;
  onlineFriends: number;
};

function MobileGameHome({ activeGame, authUser, busy, colorPreference, completed, favoriteCount, goSize, joinCode, onAI, onClockEnabledChange, onTurnSecondsChange, onColorChange, onCreate, onForbiddenEnabledChange, onGameChange, onGoSizeChange, onJoin, onJoinCodeChange, onMatch, onRanked, onScan, onSpectatorPolicyChange, onStory, onlineFriends, privateClockEnabled, privateTurnSeconds, privateForbiddenEnabled, privateSpectatorPolicy }: ClubLobbyProps) {
  const selected = gameCatalog.find((game) => game.id === activeGame) ?? gameCatalog[0];
  const gameArtwork: Record<GameId, string> = {
    go: "/micosm-go-scene.webp",
    gomoku: "/micosm-gomoku-scene.webp",
    reversi: "/micosm-reversi-scene.webp",
  };
  return (
    <div className="mobile-game-home">
      <section className="mobile-home-hero" aria-label="星海棋社">
        <Image alt="星海棋社的日常棋室" fill priority sizes="100vw" src="/micosm-club-lobby-mobile.webp" unoptimized />
        <div className="mobile-home-hero-shade" />
        <div className="mobile-home-welcome">
          <small>CELESTIAL CLUB</small>
          <h1>欢迎回来，{authUser?.displayName ?? "棋手"}</h1>
          <p>{authUser?.signature || "今天也来下一盘吧。"}</p>
          <div><span><i />{onlineFriends} 位好友在线</span><span>{completed} 场对局</span></div>
        </div>
        <div className="mobile-home-profile"><UserAvatar name={authUser?.displayName ?? "M"} src={authUser?.avatarUrl} /></div>
      </section>

      <section className="mobile-game-pick" aria-labelledby="mobile-play-title">
        <header><div><small>CHOOSE A BOARD</small><h2 id="mobile-play-title">今天下什么？</h2></div><span>{favoriteCount} 个收藏</span></header>
        <div className="mobile-game-carousel">
          {gameCatalog.map((game) => (
            <button className={activeGame === game.id ? "active" : ""} key={game.id} onClick={() => onGameChange(game.id)} type="button">
              <span><Image alt={`${game.title}棋室`} fill sizes="42vw" src={gameArtwork[game.id]} unoptimized /></span>
              <strong>{game.title}</strong>
              <small>{game.id === "go" ? `${goSize} 路棋盘` : game.subtitle}</small>
              {activeGame === game.id && <i><Check size={13} /></i>}
            </button>
          ))}
        </div>
        {activeGame === "go" && <div className="mobile-size-picker" aria-label="围棋棋盘规格"><span>棋盘规格</span>{[9, 13, 19].map((size) => <button className={goSize === size ? "active" : ""} key={size} onClick={() => onGoSizeChange(size)} type="button">{size} 路</button>)}</div>}
      </section>

      <section className="mobile-play-actions" aria-label="开始对局">
        <button className="mobile-quick-match" disabled={busy || !authUser} onClick={onMatch} type="button"><span><Search size={22} /></span><div><strong>快速匹配</strong><small>{selected.title} · 随机执色</small></div><ChevronRight size={20} /></button>
        <div>
          <button disabled={busy || !authUser} onClick={onAI} type="button"><Bot size={19} /><span><strong>人机对战</strong><small>四档难度</small></span></button>
          <button className="rank" disabled={busy || !authUser || activeGame === "reversi"} onClick={onRanked} type="button"><Trophy size={19} /><span><strong>星轨排位</strong><small>{activeGame === "reversi" ? "黑白棋不参与" : "冲击新段位"}</small></span></button>
        </div>
      </section>

      {STORY_MODE_ENABLED && <button className="mobile-story-banner" onClick={onStory} type="button">
        <span><Image alt="藤原澪与白石铃音" fill sizes="100vw" src="/micosm-match-table-mobile.webp" unoptimized /></span>
        <div><small>STORY MODE</small><strong>棋社日常</strong><p>在棋局与相遇之间，继续星海棋社的故事。</p></div>
        <BookOpen size={20} />
      </button>}

      <details className="mobile-room-studio">
        <summary><span><Users size={19} /></span><div><strong>和好友下一盘</strong><small>创建房间、扫码或输入邀请码</small></div><ChevronDown size={18} /></summary>
        <div className="mobile-room-settings">
          {(activeGame === "go" || activeGame === "gomoku") && <div className="mobile-setting-row"><span>房主执色</span><div>{(["black", "white", "random"] as ColorPreference[]).map((color) => <button className={colorPreference === color ? "active" : ""} key={color} onClick={() => onColorChange(color)} type="button">{color === "black" ? "黑" : color === "white" ? "白" : "随机"}</button>)}</div></div>}
          <label className="mobile-toggle-row"><span><Clock3 size={16} /><b>每手计时</b><small>{privateClockEnabled ? `${privateTurnSeconds} 秒` : "关闭"}</small></span><input checked={privateClockEnabled} onChange={(event) => onClockEnabledChange(event.target.checked)} type="checkbox" /></label>
          {privateClockEnabled && <label className="mobile-number-row"><span>每手时间</span><input aria-label="好友房每手用时" inputMode="numeric" max="600" min="5" onChange={(event) => onTurnSecondsChange(Math.min(600, Math.max(5, Number(event.target.value) || 5)))} step="5" type="number" value={privateTurnSeconds} /><b>秒</b></label>}
          {activeGame === "gomoku" && <label className="mobile-toggle-row"><span><ShieldCheck size={16} /><b>禁手规则</b><small>三三、四四与长连</small></span><input checked={privateForbiddenEnabled} onChange={(event) => onForbiddenEnabledChange(event.target.checked)} type="checkbox" /></label>}
          <div className="mobile-setting-row"><span>观战权限</span><div>{(["off", "friends", "public"] as SpectatorPolicy[]).map((policy) => <button className={privateSpectatorPolicy === policy ? "active" : ""} key={policy} onClick={() => onSpectatorPolicyChange(policy)} type="button">{policy === "off" ? "关闭" : policy === "friends" ? "好友" : "公开"}</button>)}</div></div>
          <button className="mobile-create-room" disabled={busy || !authUser} onClick={onCreate} type="button"><Plus size={18} />创建{selected.title}房间</button>
          <form className="mobile-join-room" onSubmit={(event) => { event.preventDefault(); onJoin(); }}>
            <input aria-label="邀请码" autoCapitalize="characters" maxLength={6} onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6))} placeholder="输入 6 位邀请码" spellCheck={false} value={joinCode} />
            <button aria-label="扫描房间二维码" disabled={busy || !authUser} onClick={onScan} type="button"><ScanLine size={18} /></button>
            <button aria-label="加入房间" disabled={busy || !authUser || joinCode.length !== 6} type="submit"><LogIn size={18} /></button>
          </form>
        </div>
      </details>
    </div>
  );
}

function ClubLobby({ activeGame, authUser, busy, colorPreference, completed, favoriteCount, goSize, joinCode, onAI, onClockEnabledChange, onTurnSecondsChange, onColorChange, onCreate, onForbiddenEnabledChange, onGameChange, onGoSizeChange, onJoin, onJoinCodeChange, onMatch, onRanked, onScan, onSpectatorPolicyChange, onlineFriends, privateClockEnabled, privateTurnSeconds, privateForbiddenEnabled, privateSpectatorPolicy }: ClubLobbyProps) {
  const selected = gameCatalog.find((game) => game.id === activeGame) ?? gameCatalog[0];
  const gameArtwork: Record<GameId, string> = {
    go: "/micosm-go-scene.webp",
    gomoku: "/micosm-gomoku-scene.webp",
    reversi: "/micosm-reversi-scene.webp",
  };
  return (
    <div className="club-lobby-shell">
      <section className="club-hero" aria-labelledby="club-title">
        <ResponsiveArtwork alt="Micosm 星海棋社的两位棋手正在棋室等待新成员" desktop="/micosm-club-lobby-desktop.webp" mobile="/micosm-club-lobby-mobile.webp" />
        <div className="club-hero-shade" />
        <div className="club-story-content">
          <span className="club-chapter"><Sparkles size={15} />序章 · 星海棋社的新成员</span>
          <h1 id="club-title">Micosm Game</h1>
          <p className="club-dialogue">“终于来了。从今天起，你的每一手棋，都会成为星轨的一部分。”</p>
          <div className="club-speaker"><span>藤原澪</span><small>围棋部部长 · 曜辰</small></div>
          <button className="club-rank-cta" onClick={onRanked} type="button"><span><Trophy size={20} /></span><div><strong>踏上星轨排位</strong><small>围棋与五子棋 · 从尘星走向无垠</small></div><b>进入</b></button>
          <div className="club-season-progress"><span>本季旅程</span><strong>{completed} 场对局</strong><i><b style={{ width: `${Math.min(100, completed * 8)}%` }} /></i></div>
        </div>
        <div className="club-scene-label"><span>01</span><div><strong>星海棋室</strong><small>CELESTIAL CLUB ROOM</small></div></div>
      </section>

      <aside className="glass lobby-console" aria-label="开始对局">
        <header><div><span>PLAY</span><h2>今天下什么？</h2></div><span className="lobby-online"><i />{onlineFriends} 位好友在线</span></header>
        <div className="lobby-player">
          <UserAvatar name={authUser?.displayName ?? "M"} src={authUser?.avatarUrl} />
          <div><strong>{authUser?.displayName ?? "新棋手"}</strong><p>{authUser?.signature || "在棋盘上留下属于你的星轨"}</p></div>
          <ShieldCheck size={18} />
        </div>

        <div className="lobby-game-list" aria-label="选择游戏">
          {gameCatalog.map((game) => (
            <button className={activeGame === game.id ? `active ${game.color}` : game.color} key={game.id} onClick={() => onGameChange(game.id)} type="button">
              <span className={`lobby-game-art ${game.id}`}><Image alt={`${game.title}棋室场景`} height={512} loading="lazy" src={gameArtwork[game.id]} unoptimized width={512} /></span>
              <div><strong>{game.title}</strong><small>{game.subtitle}</small></div>
              {activeGame === game.id && <Check size={16} />}
            </button>
          ))}
        </div>

        {activeGame === "go" && <div className="lobby-board-size"><span>棋盘规格</span><div>{[9, 13, 19].map((size) => <button className={goSize === size ? "active" : ""} key={size} onClick={() => onGoSizeChange(size)} type="button">{size} 路</button>)}</div></div>}

        <button className="lobby-match-button" disabled={busy || !authUser} onClick={onMatch} type="button">
          {busy ? <LoaderCircle className="spin" size={20} /> : <Play fill="currentColor" size={19} />}
          <span><strong>快速匹配</strong><small>{selected.title} · 随机执色{activeGame === "gomoku" ? " · 标准禁手" : ""}</small></span>
          <Search size={18} />
        </button>
        <button className="lobby-ai-button" disabled={busy || !authUser} onClick={onAI} type="button">
          <span className="lobby-ai-icon"><Bot size={20} /></span>
          <span><strong>人机对战</strong><small>四档难度 · 自选执色 · 支持复盘</small></span>
          <ChevronRight size={18} />
        </button>

        <div className="lobby-room-divider"><span>与好友对局</span></div>
        {(activeGame === "go" || activeGame === "gomoku") && (
          <div className="lobby-color-row">
            <span>房主执色</span>
            <div>
              <button className={colorPreference === "black" ? "active" : ""} onClick={() => onColorChange("black")} type="button"><i className="choice-stone black" />黑</button>
              <button className={colorPreference === "white" ? "active" : ""} onClick={() => onColorChange("white")} type="button"><i className="choice-stone white" />白</button>
              <button className={colorPreference === "random" ? "active" : ""} onClick={() => onColorChange("random")} type="button"><Sparkles size={13} />随机</button>
            </div>
          </div>
        )}
        <div className={`lobby-clock-row ${privateClockEnabled ? "is-enabled" : ""}`}>
          <div><Clock3 size={15} /><span>好友房计时</span></div>
          <label className="lobby-clock-switch">
            <input aria-label="开启好友房计时" checked={privateClockEnabled} onChange={(event) => onClockEnabledChange(event.target.checked)} type="checkbox" />
            <i />
          </label>
          {privateClockEnabled && (
            <label className="lobby-clock-minutes">
              <input aria-label="每手用时（秒）" inputMode="numeric" max="600" min="5" onChange={(event) => onTurnSecondsChange(Math.min(600, Math.max(5, Number(event.target.value) || 5)))} step="5" type="number" value={privateTurnSeconds} />
              <span>秒/手</span>
            </label>
          )}
        </div>
        {activeGame === "gomoku" && (
          <div className={`lobby-clock-row lobby-forbidden-row ${privateForbiddenEnabled ? "is-enabled" : ""}`}>
            <div><ShieldCheck size={15} /><span>禁手规则</span></div>
            <label className="lobby-clock-switch">
              <input aria-label="开启五子棋禁手" checked={privateForbiddenEnabled} onChange={(event) => onForbiddenEnabledChange(event.target.checked)} type="checkbox" />
              <i />
            </label>
            <small>限制黑方三三、四四与长连</small>
          </div>
        )}
        <div className="lobby-spectator-row">
          <span><Users size={15} />房间观战</span>
          <div aria-label="好友房观战权限">
            <button className={privateSpectatorPolicy === "off" ? "active" : ""} onClick={() => onSpectatorPolicyChange("off")} type="button">关闭</button>
            <button className={privateSpectatorPolicy === "friends" ? "active" : ""} onClick={() => onSpectatorPolicyChange("friends")} type="button">仅好友</button>
            <button className={privateSpectatorPolicy === "public" ? "active" : ""} onClick={() => onSpectatorPolicyChange("public")} type="button">公开</button>
          </div>
        </div>
        <div className="lobby-room-actions">
          <button disabled={busy || !authUser} onClick={onCreate} type="button"><Plus size={17} />创建房间</button>
          <form onSubmit={(event) => { event.preventDefault(); onJoin(); }}>
            <input aria-label="邀请码" autoCapitalize="characters" maxLength={6} onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6))} placeholder="输入邀请码" spellCheck={false} value={joinCode} />
            <button aria-label="扫描房间二维码" disabled={busy || !authUser} onClick={onScan} title="扫描房间二维码" type="button"><ScanLine size={17} /></button>
            <button aria-label="加入房间" disabled={busy || !authUser || joinCode.length !== 6} title="加入房间" type="submit"><LogIn size={17} /></button>
          </form>
        </div>
        <footer><span><Gamepad2 size={15} />{completed} 场完成</span><span><Star size={15} />{favoriteCount} 个收藏</span><span><Users size={15} />{onlineFriends} 人在线</span></footer>
      </aside>
    </div>
  );
}

function historyGameName(game: MatchGame) {
  return game === "go" ? "围棋" : game === "gomoku" ? "五子棋" : "黑白棋";
}

function historyModeName(mode: RoomView["mode"]) {
  return mode === "ranked" ? "排位" : mode === "matchmaking" ? "匹配" : mode === "ai" ? "人机" : "好友房";
}

function historyReasonName(reason: HistoryRecord["reason"]) {
  return reason === "resign" ? "认输结束" : reason === "departure" ? "对手离线" : reason === "timeout" ? "本手超时" : reason === "score" ? "双方数子" : reason === "draw" ? "和棋" : "正常终局";
}

function HistoryCenter({ busy, error, onBack, onCloseReview, onMoveReview, onOpen, records, review }: {
  busy: boolean;
  error: string;
  onBack: () => void;
  onCloseReview: () => void;
  onMoveReview: (index: number) => void;
  onOpen: (id: string) => void;
  records: HistoryRecord[];
  review: HistoryReview | null;
}) {
  if (review) {
    const frame = review.frames[review.index];
    const record = review.record;
    return (
      <section className="history-shell history-review-shell" aria-label="历史棋局复盘">
        <header className="history-header">
          <button className="history-back" onClick={onCloseReview} type="button"><ChevronLeft size={18} />对局记录</button>
          <div><small>ARCHIVED MATCH</small><h1>{historyGameName(record.game)}复盘</h1><p>{record.players.black} 对 {record.players.white} · {record.moveCount} 手</p></div>
          <span className={`history-result ${record.result}`}>{record.result === "win" ? "胜" : record.result === "loss" ? "负" : "和"}</span>
        </header>
        <div className="history-review-layout">
          <div className="history-board-stage">
            {record.game === "reversi" ? (
              <div className="reversi-board standard-board history-reversi" aria-label="黑白棋复盘棋盘">
                {frame.board.map((row, rowIndex) => row.map((stone, colIndex) => {
                  const isLast = frame.lastMove?.[0] === rowIndex && frame.lastMove?.[1] === colIndex;
                  return <button aria-label={`${rowIndex + 1}-${colIndex + 1}${stone ? playerName(stone) : "空位"}`} className={`${stone ? `stone ${stone}` : ""} ${isLast ? "last" : ""}`} key={`${rowIndex}-${colIndex}`} type="button" />;
                }))}
              </div>
            ) : (
              <IntersectionBoard analysisPoints={frame.insight?.points} board={frame.board} game={record.game} lastMove={frame.lastMove} onPlay={() => undefined} size={record.boardSize} />
            )}
          </div>
          <aside className="history-review-info">
            <div className="history-review-turn"><span>{frame.moveNumber === 0 ? "开局" : `第 ${frame.moveNumber} 手`}</span><strong>{frame.description}</strong><small>{review.index + 1} / {review.frames.length}</small></div>
            <div className={`history-insight ${frame.insight?.tone ?? "info"}`}><Sparkles size={18} /><div><strong>{frame.insight?.title ?? "局面记录"}</strong><p>{frame.insight?.detail ?? "移动时间线，查看每一手之后的棋盘变化。"}</p></div></div>
            <div className="history-match-meta">
              <div><span>模式</span><strong>{historyModeName(record.mode)}</strong></div>
              <div><span>我的执色</span><strong>{playerName(record.role)}</strong></div>
              <div><span>终局方式</span><strong>{historyReasonName(record.reason)}</strong></div>
              <div><span>结束时间</span><strong>{new Date(record.endedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</strong></div>
            </div>
          </aside>
        </div>
        <div className="history-timeline">
          <button aria-label="跳到开局" disabled={review.index === 0} onClick={() => onMoveReview(0)} type="button"><ChevronsLeft size={18} /></button>
          <button aria-label="上一手" disabled={review.index === 0} onClick={() => onMoveReview(review.index - 1)} type="button"><ChevronLeft size={19} /></button>
          <div><i style={{ width: `${review.frames.length <= 1 ? 100 : review.index / (review.frames.length - 1) * 100}%` }} /></div>
          <button aria-label="下一手" disabled={review.index === review.frames.length - 1} onClick={() => onMoveReview(review.index + 1)} type="button"><ChevronRight size={19} /></button>
          <button aria-label="跳到终局" disabled={review.index === review.frames.length - 1} onClick={() => onMoveReview(review.frames.length - 1)} type="button"><ChevronsRight size={18} /></button>
        </div>
      </section>
    );
  }

  return (
    <section className="history-shell" aria-label="对局记录">
      <header className="history-header">
        <button className="history-back" onClick={onBack} type="button"><ChevronLeft size={18} />游戏大厅</button>
        <div><small>MATCH ARCHIVE</small><h1>对局记录</h1><p>保存每一次胜负，也保存当时没有看见的那条棋路。</p></div>
        <span className="history-count">{records.length} 局</span>
      </header>
      {error && <div className="history-error"><AlertTriangle size={17} />{error}</div>}
      {busy && records.length === 0 ? (
        <div className="history-empty"><LoaderCircle className="spin" size={24} /><strong>正在整理棋谱</strong></div>
      ) : records.length === 0 ? (
        <div className="history-empty"><Clock3 size={28} /><strong>还没有已保存的棋局</strong><p>完成下一局后，棋谱会自动出现在这里。</p></div>
      ) : (
        <div className="history-list">
          {records.map((record) => (
            <button className="history-row" disabled={busy} key={record.id} onClick={() => onOpen(record.id)} type="button">
              <span className={`history-result ${record.result}`}>{record.result === "win" ? "胜" : record.result === "loss" ? "负" : "和"}</span>
              <UserAvatar name={record.opponent.name} src={record.opponent.avatarUrl} />
              <span className="history-row-main"><small>{historyModeName(record.mode)} · {historyGameName(record.game)}</small><strong>对 {record.opponent.name}</strong><p>{playerName(record.role)} · {record.moveCount} 手 · {historyReasonName(record.reason)}</p></span>
              <time>{new Date(record.endedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}<small>{new Date(record.endedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</small></time>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function StoryMode({ user }: { user: AuthUser | null }) {
  const [screen, setScreen] = useState<"chapters" | "player">("chapters");
  const [chapterIndex, setChapterIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);
  const [chapterEnd, setChapterEnd] = useState(false);
  const [started, setStarted] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const chapter = STORY_SEASON_ONE[chapterIndex];
  const line = chapter.lines[lineIndex];
  const visible = line?.visible ?? ["mio", "suzune"];
  const seasonFinished = completed.length === STORY_SEASON_ONE.length;
  const progressPercent = Math.round(completed.length / STORY_SEASON_ONE.length * 100);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.localStorage.getItem("micosm-story-season-one");
        if (raw) {
          const saved = JSON.parse(raw) as { chapter?: number; line?: number; completed?: number[]; started?: boolean };
          const nextChapter = Math.max(0, Math.min(STORY_SEASON_ONE.length - 1, Number(saved.chapter) || 0));
          const nextLine = Math.max(0, Math.min(STORY_SEASON_ONE[nextChapter].lines.length - 1, Number(saved.line) || 0));
          setChapterIndex(nextChapter);
          setLineIndex(nextLine);
          setCompleted(Array.isArray(saved.completed) ? saved.completed.filter((index) => Number.isInteger(index) && index >= 0 && index < STORY_SEASON_ONE.length) : []);
          setStarted(Boolean(saved.started));
        }
      } catch {
        window.localStorage.removeItem("micosm-story-season-one");
      }
      setProgressReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!progressReady) return;
    window.localStorage.setItem("micosm-story-season-one", JSON.stringify({ chapter: chapterIndex, line: lineIndex, completed, started }));
  }, [chapterIndex, completed, lineIndex, progressReady, started]);

  useEffect(() => {
    if (screen !== "player") return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setChapterEnd(false);
        setLineIndex((current) => Math.max(0, current - 1));
      }
      if ((event.key === "Enter" || event.key === " " || event.key === "ArrowRight") && !chapterEnd) {
        event.preventDefault();
        advanceLine();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  function chapterUnlocked(index: number) {
    return index === 0 || completed.includes(index - 1);
  }

  function startChapter(index: number, atLine = 0) {
    if (!chapterUnlocked(index)) return;
    setChapterIndex(index);
    setLineIndex(Math.max(0, Math.min(STORY_SEASON_ONE[index].lines.length - 1, atLine)));
    setChapterEnd(false);
    setStarted(true);
    setScreen("player");
  }

  function continueStory() {
    if (!started) return startChapter(0);
    if (completed.includes(chapterIndex)) {
      const nextIndex = Math.min(chapterIndex + 1, STORY_SEASON_ONE.length - 1);
      return startChapter(nextIndex, completed.includes(nextIndex) ? 0 : 0);
    }
    startChapter(chapterIndex, lineIndex);
  }

  function advanceLine() {
    if (lineIndex < chapter.lines.length - 1) {
      setLineIndex((current) => current + 1);
      return;
    }
    setCompleted((current) => current.includes(chapterIndex) ? current : [...current, chapterIndex].sort((a, b) => a - b));
    setChapterEnd(true);
  }

  function replayChapter() {
    setLineIndex(0);
    setChapterEnd(false);
  }

  const speakerName = line?.speaker === "mio"
    ? "藤原澪"
    : line?.speaker === "suzune"
      ? "白石铃音"
      : line?.speaker === "player"
        ? user?.displayName ?? "你"
        : "";

  if (screen === "chapters") {
    return (
      <div className="story-index">
        <section className="story-season-hero" aria-labelledby="story-season-title">
          <Image alt="藤原澪与白石铃音在星海棋社等待新成员" fill priority sizes="(max-width: 700px) 100vw, 58vw" src="/micosm-club-lobby-desktop.webp" unoptimized />
          <div className="story-season-shade" />
          <div className="story-season-copy">
            <span><Sparkles size={14} />SEASON 01 · 已更新完结</span>
            <h1 id="story-season-title">{STORY_SEASON_TITLE}</h1>
            <p>从一颗被留下的棋子开始，和藤原澪、白石铃音一起度过星海棋社的新学期。</p>
            <button onClick={continueStory} type="button">{seasonFinished ? <RotateCcw size={18} /> : <Play fill="currentColor" size={18} />}{!started ? "开始第一话" : seasonFinished ? "重温最终话" : "继续阅读"}<ChevronRight size={17} /></button>
          </div>
          <div className="story-season-progress" aria-label={`第一季进度 ${progressPercent}%`}>
            <span><i style={{ width: `${progressPercent}%` }} /></span>
            <strong>{completed.length} / {STORY_SEASON_ONE.length}</strong>
          </div>
        </section>

        <section className="story-chapter-browser" aria-labelledby="story-chapters-title">
          <header>
            <div><span>STORY ARCHIVE</span><h2 id="story-chapters-title">第一季章节</h2></div>
            <p>{seasonFinished ? "第一季已完成，所有章节都可以随时重温。" : "完成当前章节后，下一段日常会自动解锁。"}</p>
          </header>
          <div className="story-chapter-list">
            {STORY_SEASON_ONE.map((item, index) => {
              const unlocked = chapterUnlocked(index);
              const done = completed.includes(index);
              return (
                <button className={`${done ? "is-complete" : ""} ${chapterIndex === index && started ? "is-current" : ""}`} disabled={!unlocked} key={item.id} onClick={() => startChapter(index)} type="button">
                  <span className="story-chapter-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="story-chapter-copy"><small>{item.episode} · {item.location}</small><strong>{item.title}</strong><em>{item.summary}</em></span>
                  <span className="story-chapter-state">{done ? <Check size={17} /> : unlocked ? <Play size={16} /> : <LockKeyhole size={16} />}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  return (
    <section className="story-player" aria-label={`${chapter.episode} ${chapter.title}`}>
      <Image alt="" className="story-background" fill priority sizes="100vw" src={chapter.background} unoptimized />
      <div className="story-scene-shade" />
      <header className="story-player-header">
        <button aria-label="返回章节列表" onClick={() => setScreen("chapters")} title="返回章节列表" type="button"><ChevronLeft size={19} /></button>
        <div><span>{chapter.episode} · {chapter.location}</span><strong>{chapter.title}</strong></div>
        <button aria-label="从本话开头重看" onClick={replayChapter} title="从本话开头重看" type="button"><RotateCcw size={17} /></button>
      </header>

      <div aria-hidden="true" className="story-cast">
        {visible.includes("mio") && <Image alt="" className={`story-character story-character-mio ${line.focus && !["mio", "both"].includes(line.focus) ? "is-muted" : ""}`} height={1736} priority src="/story/fujiwara-mio.png" width={906} unoptimized />}
        {visible.includes("suzune") && <Image alt="" className={`story-character story-character-suzune ${line.focus && !["suzune", "both"].includes(line.focus) ? "is-muted" : ""}`} height={1720} priority src="/story/shiraishi-suzune.png" width={914} unoptimized />}
      </div>

      <div className={`story-dialogue speaker-${line.speaker}`} aria-live="polite">
        <header>
          <div>{speakerName ? <strong>{speakerName}</strong> : <strong>星海棋社</strong>}<span>{line.speaker === "narrator" ? "SCENE" : line.speaker === "player" ? "PLAYER" : "CLUB MEMBER"}</span></div>
          {line.cue && <small><Volume2 size={13} />{line.cue}</small>}
        </header>
        <p>{line.text}</p>
        <footer>
          <span><i>{lineIndex + 1}</i> / {chapter.lines.length}</span>
          <div>
            <button aria-label="上一句" disabled={lineIndex === 0} onClick={() => { setChapterEnd(false); setLineIndex((current) => Math.max(0, current - 1)); }} title="上一句" type="button"><ChevronLeft size={17} /></button>
            <button className="story-next" onClick={advanceLine} type="button">{lineIndex === chapter.lines.length - 1 ? "读完本话" : "继续"}<ChevronRight size={18} /></button>
          </div>
        </footer>
      </div>

      <div className="story-line-progress" aria-hidden="true"><i style={{ width: `${(lineIndex + 1) / chapter.lines.length * 100}%` }} /></div>

      {chapterEnd && (
        <div className="story-chapter-end" role="dialog" aria-modal="true" aria-label="章节完成">
          <span><Sparkles size={22} /></span>
          <small>{chapterIndex === STORY_SEASON_ONE.length - 1 ? "SEASON COMPLETE" : "CHAPTER COMPLETE"}</small>
          <h2>{chapterIndex === STORY_SEASON_ONE.length - 1 ? "第一季 · 完" : `${chapter.episode}完成`}</h2>
          <p>{chapterIndex === STORY_SEASON_ONE.length - 1 ? "春日的故事暂时写到这里，棋社的下一手仍在等待。" : STORY_SEASON_ONE[chapterIndex + 1].subtitle}</p>
          <div>
            <button onClick={() => setScreen("chapters")} type="button"><BookOpen size={16} />章节列表</button>
            {chapterIndex < STORY_SEASON_ONE.length - 1 ? <button onClick={() => startChapter(chapterIndex + 1)} type="button">下一话<ChevronRight size={17} /></button> : <button onClick={() => setScreen("chapters")} type="button">返回第一季<ChevronRight size={17} /></button>}
          </div>
        </div>
      )}
    </section>
  );
}

function RankedLobby({ busy, data, game, onGameChange, onStart, user }: {
  busy: boolean;
  data: RankData | null;
  game: RankGame;
  onGameChange: (game: RankGame) => void;
  onStart: () => void;
  user: AuthUser | null;
}) {
  const profile = data?.profiles[game] ?? null;
  const rating = profile?.rating ?? 0;
  const tierIndex = Math.min(RANK_NAMES.length - 1, Math.floor(rating / 100));
  const progress = profile ? Math.round(profile.progress.current / profile.progress.required * 100) : 0;
  const winRate = profile?.matches ? Math.round(profile.wins / profile.matches * 100) : 0;
  const baseWin = [36, 33, 30, 27, 24, 22, 20, 18][tierIndex];
  const leaderboard = data?.leaderboard ?? [];

  return (
    <div className="ranked-lobby">
      <section className="glass rank-overview" aria-labelledby="ranked-title">
        <header className="ranked-heading">
          <div><span>RANKED</span><h1 id="ranked-title">排位</h1><p>围棋与五子棋独立段位，随机执色公平开局。</p></div>
          <div className="rank-game-tabs" aria-label="排位游戏">
            <button className={game === "go" ? "active" : ""} onClick={() => onGameChange("go")} type="button"><CircleDot size={17} />围棋</button>
            <button className={game === "gomoku" ? "active" : ""} onClick={() => onGameChange("gomoku")} type="button"><Gamepad2 size={17} />五子棋</button>
          </div>
        </header>

        <div className="rank-character-scene">
          <ResponsiveArtwork alt="棋社部长藤原澪站在星台邀请玩家参加排位" desktop="/micosm-rank-captain-desktop.webp" mobile="/micosm-rank-captain-mobile.webp" />
          <div><span>第二章 · 星轨试炼</span><strong>“让我看看，你的棋能走到多远。”</strong><small>藤原澪 · 棋社部长</small></div>
        </div>

        <div className="rank-player">
          <UserAvatar name={user?.displayName ?? "M"} src={user?.avatarUrl} />
          <div><strong>{user?.displayName ?? "棋手"}</strong><p>{user?.signature || "未设置个性签名"}</p></div>
          <span>{game === "go" ? "19 路" : "15 路"}</span>
        </div>

        <button className="rank-start" disabled={busy || !profile} onClick={onStart} type="button">
          {busy ? <LoaderCircle className="spin" size={19} /> : <Search size={19} />}开始{game === "go" ? "围棋" : "五子棋"}排位
          <span>随机执色</span>
        </button>

        <div className={`rank-emblem tier-${tierIndex}`} aria-label={`当前段位 ${profile?.label ?? "尘星"}`} title={RANK_MOTTO[tierIndex]}>
          <span><RankEmblemArt eager index={tierIndex} /></span>
        </div>
        <div className="rank-current">
          <small>当前段位</small>
          <h2>{profile?.label ?? "尘星"}</h2>
          <p><strong>{rating}</strong> 星分 · 胜利基础 +{baseWin}</p>
        </div>
        <div className="rank-progress" aria-label={`段位进度 ${progress}%`}>
          <span><i style={{ width: `${progress}%` }} /></span>
          <small>{profile ? `${profile.progress.current} / ${profile.progress.required}` : "正在读取"}</small>
        </div>
        <div className="rank-stats">
          <div><span>胜率</span><strong>{winRate}%</strong></div>
          <div><span>战绩</span><strong>{profile ? `${profile.wins}胜 ${profile.losses}负` : "--"}</strong></div>
          <div><span>连胜</span><strong>{profile?.streak ?? 0}</strong></div>
          <div><span>排名</span><strong>{data?.position ? `#${data.position}` : "未上榜"}</strong></div>
        </div>
      </section>

      <section className="glass rank-path" aria-labelledby="rank-path-title">
        <header><div><span>PATH</span><h2 id="rank-path-title">段位路线</h2></div><small>低段胜利加分更高</small></header>
        <div className="rank-tier-list">
          {RANK_NAMES.map((name, index) => {
            const reached = index <= tierIndex;
            const isCurrent = index === tierIndex;
            return (
              <div className={`${reached ? "reached" : ""} ${isCurrent ? "current" : ""}`} key={name}>
                <span className={`tier-gem tier-${index}`} title={RANK_MOTTO[index]}><RankEmblemArt index={index} /></span>
                <div><strong>{name}</strong><small>{index === RANK_NAMES.length - 1 ? "700+ · 之后累计 N 星" : `${index * 100} - ${index * 100 + 99} 星分`} · {RANK_MOTTO[index]}</small></div>
                {isCurrent && <b>当前</b>}
              </div>
            );
          })}
        </div>
        <div className="rank-rules">
          <p><ShieldCheck size={16} />排位匹配按星分寻找对手，等待越久范围逐步扩大。</p>
          <p><Trophy size={16} />胜负即时结算；尘星失败不扣分，无垠后每 20 星分升 1 星。</p>
          <p><Gamepad2 size={16} />黑白棋不参与排位，仍可在游戏大厅休闲匹配。</p>
        </div>
      </section>

      <aside className="glass rank-board" aria-labelledby="rank-board-title">
        <header><div><span>LEADERBOARD</span><h2 id="rank-board-title">{game === "go" ? "围棋" : "五子棋"}榜</h2></div><small>前 50 名</small></header>
        <div className="rank-board-list">
          {leaderboard.length === 0 ? (
            <div className="rank-empty"><Trophy size={23} /><strong>等待首场排位</strong><p>完成一局后即可进入榜单。</p></div>
          ) : leaderboard.map((entry) => (
            <div className={entry.isMe ? "is-me" : ""} key={entry.userId}>
              <b>{entry.position}</b>
              <UserAvatar name={entry.displayName} src={entry.avatarUrl} />
              <span className="leaderboard-rank-art" title={entry.label}><RankEmblemArt index={Math.min(RANK_NAMES.length - 1, Math.floor(entry.rating / 100))} /></span>
              <span><strong>{entry.displayName}</strong><small>{entry.label} · {entry.wins}胜</small></span>
              <em>{entry.rating}</em>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function LobbyMiniBoard({ room }: { room: LobbyRoom }) {
  const stones = room.board.flatMap((row, rowIndex) => row.flatMap((stone, columnIndex) => stone ? [{ stone, row: rowIndex, column: columnIndex }] : []));
  const isReversi = room.game === "reversi";
  const denominator = Math.max(1, isReversi ? room.boardSize : room.boardSize - 1);
  const position = (index: number) => `${(index + (isReversi ? 0.5 : 0)) / denominator * 100}%`;
  const boardStyle = { "--mini-grid-size": isReversi ? room.boardSize : room.boardSize - 1 } as CSSProperties;
  return (
    <div className={`lobby-mini-board ${room.game}`} aria-hidden="true" style={boardStyle}>
      {stones.map((stone) => <i className={stone.stone} key={`${stone.row}-${stone.column}`} style={{ left: position(stone.column), top: position(stone.row) }} />)}
      {room.lastMove && <b style={{ left: position(room.lastMove[1]), top: position(room.lastMove[0]) }} />}
    </div>
  );
}

function LobbyRoomCard({ onOpen, room }: { onOpen: () => void; room: LobbyRoom }) {
  const gameName = historyGameName(room.game);
  const action = room.joinable ? "加入" : room.spectatable ? "观战" : "等待";
  return (
    <article className="lobby-room-card">
      <LobbyMiniBoard room={room} />
      <div className="lobby-room-card-body">
        <header><span>{gameName}</span><i>{room.mode === "matchmaking" ? "快速匹配" : room.spectatorPolicy === "friends" ? "好友可见" : "公开房"}</i></header>
        <div className="lobby-room-players">
          <span><UserAvatar name={room.players.black ?? "黑"} src={room.profiles.black.avatarUrl} /><strong>{room.players.black ?? "等待黑方"}</strong></span>
          <em>VS</em>
          <span><UserAvatar name={room.players.white ?? "白"} src={room.profiles.white.avatarUrl} /><strong>{room.players.white ?? "等待白方"}</strong></span>
        </div>
        <footer><span><i className={`mini-stone ${room.turn}`} />{room.status === "waiting" ? "等待加入" : `${room.moveCount} 手`}</span><span><Users size={13} />{room.spectatorCount}</span><button disabled={!room.joinable && !room.spectatable} onClick={onOpen} type="button">{action}<ChevronRight size={14} /></button></footer>
      </div>
    </article>
  );
}

function MobileWorldChannel({ activeGame, busy, currentUserId, endRef, hall, lobbyBusy, lobbyCounts, lobbyRooms, messages, onDelete, onDirect, onHallChange, onInvite, onJoin, onLobbyRoom, onReport, onSend, onTextChange, overview, text }: {
  activeGame: GameId;
  busy: boolean;
  currentUserId: string;
  endRef: RefObject<HTMLDivElement | null>;
  hall: LobbyHall;
  lobbyBusy: boolean;
  lobbyCounts: LobbyCounts;
  lobbyRooms: LobbyRoom[];
  messages: ChatMessage[];
  onDelete: (messageId: string) => void;
  onDirect: () => void;
  onHallChange: (hall: LobbyHall) => void;
  onInvite: () => void;
  onJoin: (message: ChatMessage) => void;
  onLobbyRoom: (room: LobbyRoom) => void;
  onReport: (messageId: string) => void;
  onSend: () => void;
  onTextChange: (value: string) => void;
  overview: ChatOverview;
  text: string;
}) {
  const gameTitle = gameCatalog.find((game) => game.id === activeGame)?.title ?? "棋类对局";
  const directUnread = Object.values(overview.directUnreads).reduce((sum, count) => sum + count, 0);
  const hallName = hall === "main" ? "主大厅" : historyGameName(hall);
  const [mobileSection, setMobileSection] = useState<"chat" | "rooms">("chat");

  return (
    <section aria-label="手机世界频道" className="mobile-world-channel">
      <header className="mobile-world-header">
        <div><small>WORLD LOBBY</small><h1>{hallName}</h1><p><i />{lobbyCounts[hall]} 间棋局正在开放</p></div>
        <button aria-label="打开好友私聊" onClick={onDirect} title="好友私聊" type="button"><MessageCircle size={20} />{directUnread > 0 && <b>{Math.min(directUnread, 99)}</b>}</button>
      </header>

      <nav aria-label="大厅分类" className="mobile-world-halls">
        {(["main", "go", "gomoku", "reversi"] as LobbyHall[]).map((targetHall) => (
          <button className={hall === targetHall ? "active" : ""} key={targetHall} onClick={() => onHallChange(targetHall)} type="button">
            <span>{targetHall === "main" ? "全部" : historyGameName(targetHall)}</span><i>{lobbyCounts[targetHall]}</i>
          </button>
        ))}
      </nav>

      <nav aria-label="世界大厅内容" className="mobile-world-view-tabs">
        <button className={mobileSection === "chat" ? "active" : ""} onClick={() => setMobileSection("chat")} type="button"><MessageCircle size={15} />聊天</button>
        <button className={mobileSection === "rooms" ? "active" : ""} onClick={() => setMobileSection("rooms")} type="button"><Waypoints size={15} />公开棋局 <i>{lobbyRooms.length}</i></button>
      </nav>

      {mobileSection === "rooms" && <section aria-label="正在进行的公开棋局" className="mobile-live-rooms is-page">
        <header><div><Waypoints size={15} /><strong>实时棋局</strong></div><span>{lobbyBusy ? <LoaderCircle className="spin" size={14} /> : lobbyRooms.length ? "下滑查看更多" : "等待开局"}</span></header>
        <div className="mobile-room-rail">
          {lobbyRooms.length === 0 ? (
            <div className="mobile-room-empty"><span><Gamepad2 size={17} /></span><div><strong>还没有公开棋局</strong><small>创建房间并开启观战后会出现在这里</small></div></div>
          ) : lobbyRooms.map((targetRoom) => {
            const action = targetRoom.joinable ? "加入" : targetRoom.spectatable ? "观战" : "等待";
            return (
              <article className="mobile-room-ticket" key={targetRoom.id}>
                <div className="mobile-room-ticket-top"><span>{historyGameName(targetRoom.game)}</span><i>{targetRoom.status === "waiting" ? "待加入" : `${targetRoom.moveCount} 手`}</i></div>
                <div className="mobile-room-ticket-players">
                  <span><UserAvatar name={targetRoom.players.black ?? "黑"} src={targetRoom.profiles.black.avatarUrl} /><b>{targetRoom.players.black ?? "等待黑方"}</b></span>
                  <em>VS</em>
                  <span><UserAvatar name={targetRoom.players.white ?? "白"} src={targetRoom.profiles.white.avatarUrl} /><b>{targetRoom.players.white ?? "等待白方"}</b></span>
                </div>
                <footer><span><Users size={12} />{targetRoom.spectatorCount}</span><button disabled={!targetRoom.joinable && !targetRoom.spectatable} onClick={() => onLobbyRoom(targetRoom)} type="button">{action}<ChevronRight size={13} /></button></footer>
              </article>
            );
          })}
        </div>
      </section>}

      {mobileSection === "chat" && <section aria-label="频道消息" className="mobile-world-feed">
        <header><strong>频道消息</strong><span><Globe2 size={12} />文明交流</span></header>
        <div aria-live="polite" className="mobile-world-message-list">
          {messages.length === 0 ? (
            <div className="mobile-world-empty"><span><MessageCircle size={20} /></span><strong>这里还很安静</strong><p>和同一大厅的棋友打个招呼吧。</p></div>
          ) : messages.map((message) => (
            <article className={`mobile-world-message ${message.isMine ? "mine" : ""}`} key={message.id}>
              {!message.isMine && <span className="mobile-world-avatar"><UserAvatar name={message.sender.displayName} src={message.sender.avatarUrl} /></span>}
              <div>
                <header>
                  <strong>{message.isMine ? "我" : message.sender.displayName}</strong>
                  <time>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
                  {message.isMine ? <button aria-label="删除消息" onClick={() => onDelete(message.id)} title="删除消息" type="button"><Trash2 size={11} /></button> : <button aria-label="举报消息" onClick={() => onReport(message.id)} title="举报消息" type="button"><Flag size={11} /></button>}
                </header>
                <div className="mobile-world-bubble">
                  {message.body && <p>{message.body}</p>}
                  {message.room && (
                    <button className="mobile-world-invite" disabled={!message.room.open || message.sender.id === currentUserId} onClick={() => onJoin(message)} type="button">
                      <span><Gamepad2 size={17} /></span><span><strong>{gameCatalog.find((game) => game.id === message.room?.game)?.title ?? "棋类对局"}</strong><small>{message.room.open ? "房间开放中" : "棋局已结束"}</small></span><i>{message.sender.id === currentUserId ? "已发送" : message.room.open ? "加入" : "已结束"}</i>
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
          <div ref={endRef} />
        </div>
      </section>}

      {mobileSection === "chat" && <form className="mobile-world-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
        <button aria-label={`发送${gameTitle}房间邀请`} disabled={busy} onClick={onInvite} title="发送房间邀请" type="button"><Gamepad2 size={19} /></button>
        <textarea aria-label="世界频道消息" maxLength={200} onChange={(event) => onTextChange(event.target.value)} placeholder="说点什么..." rows={1} value={text} />
        <button aria-label="发送消息" className="send" disabled={busy || !text.trim()} type="submit">{busy ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button>
      </form>}
    </section>
  );
}

function ChatPanel({ activeGame, busy, channel, currentUserId, endRef, friends, hall, lobbyBusy, lobbyCounts, lobbyRooms, messages, onChannelChange, onClose, onDelete, onHallChange, onInvite, onJoin, onLobbyRoom, onPeerChange, onReport, onSend, onTextChange, overview, peer, text }: {
  activeGame: GameId;
  busy: boolean;
  channel: ChatChannel;
  currentUserId: string;
  endRef: RefObject<HTMLDivElement | null>;
  friends: FriendPerson[];
  hall: LobbyHall;
  lobbyBusy: boolean;
  lobbyCounts: LobbyCounts;
  lobbyRooms: LobbyRoom[];
  messages: ChatMessage[];
  onChannelChange: (channel: ChatChannel) => void;
  onClose: () => void;
  onDelete: (messageId: string) => void;
  onHallChange: (hall: LobbyHall) => void;
  onInvite: () => void;
  onJoin: (message: ChatMessage) => void;
  onLobbyRoom: (room: LobbyRoom) => void;
  onPeerChange: (peer: FriendPerson | null) => void;
  onReport: (messageId: string) => void;
  onSend: () => void;
  onTextChange: (value: string) => void;
  overview: ChatOverview;
  peer: FriendPerson | null;
  text: string;
}) {
  const gameTitle = gameCatalog.find((game) => game.id === activeGame)?.title ?? "棋类对局";
  const directUnread = Object.values(overview.directUnreads).reduce((sum, count) => sum + count, 0);
  const sortedFriends = [...friends].sort((first, second) => Number(second.online) - Number(first.online) || first.displayName.localeCompare(second.displayName, "zh-CN"));
  const messageList = (
    <div className="chat-messages" aria-live="polite">
      {messages.length === 0 ? <div className="chat-empty"><MessageCircle size={21} /><span>{channel === "world" ? "成为第一个发言的人" : "发一条消息开始聊天"}</span></div> : messages.map((message) => (
        <article className={`chat-message ${message.isMine ? "mine" : ""}`} key={message.id}>
          {!message.isMine && <span className="chat-message-avatar"><UserAvatar name={message.sender.displayName} src={message.sender.avatarUrl} /></span>}
          <div className="chat-message-content">
            <header><strong>{message.isMine ? "我" : message.sender.displayName}</strong><time>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></header>
            {message.body && <p>{message.body}</p>}
            {message.room && (
              <button className="chat-room-invite" disabled={!message.room.open || message.sender.id === currentUserId} onClick={() => onJoin(message)} type="button">
                <span><Gamepad2 size={19} /></span>
                <span><strong>{gameCatalog.find((game) => game.id === message.room?.game)?.title ?? "棋类对局"}</strong><small>{message.sender.id === currentUserId ? "等待其他玩家加入" : message.room.open ? "房间开放中" : "房间已结束"}</small></span>
                <i>{message.sender.id === currentUserId ? "等待" : message.room.open ? "加入" : "已满"}</i>
              </button>
            )}
            <div className="chat-message-actions">
              {message.isMine ? <button aria-label="删除消息" onClick={() => onDelete(message.id)} title="删除消息" type="button"><Trash2 size={13} /></button> : channel === "world" && <button aria-label="举报消息" onClick={() => onReport(message.id)} title="举报消息" type="button"><Flag size={13} /></button>}
            </div>
          </div>
        </article>
      ))}
      <div ref={endRef} />
    </div>
  );
  const composer = (
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
      <button aria-label={`发送${gameTitle}房间邀请`} disabled={busy} onClick={onInvite} title={`发送${gameTitle}房间邀请`} type="button"><Gamepad2 size={18} /></button>
      <textarea aria-label="聊天消息" maxLength={200} onChange={(event) => onTextChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} placeholder={channel === "world" ? "和大家说点什么" : `发送给 ${peer?.displayName ?? "好友"}`} rows={1} value={text} />
      <button aria-label="发送消息" className="send" disabled={busy || !text.trim()} title="发送消息" type="submit">{busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>
    </form>
  );
  return (
    <aside aria-label="消息中心" className={`chat-panel ${channel === "world" ? "world-lobby-panel" : "direct-chat-panel"}`}>
      <header><div><small>{channel === "world" ? "WORLD LOBBY" : "MESSAGES"}</small><h2>{channel === "world" ? hall === "main" ? "世界主大厅" : `${historyGameName(hall)}大厅` : "好友私聊"}</h2></div><button aria-label="关闭聊天" onClick={onClose} type="button"><X size={18} /></button></header>
      <div className="chat-tabs" aria-label="聊天频道">
        <button className={channel === "world" ? "active" : ""} onClick={() => onChannelChange("world")} type="button"><Globe2 size={15} />世界{overview.worldUnread > 0 && <span>{Math.min(overview.worldUnread, 99)}</span>}</button>
        <button className={channel === "direct" ? "active" : ""} onClick={() => onChannelChange("direct")} type="button"><MessageCircle size={15} />私聊{directUnread > 0 && <span>{Math.min(directUnread, 99)}</span>}</button>
      </div>

      {channel === "world" && <div className="world-hall-tabs" aria-label="大厅分类">
        {(["main", "go", "gomoku", "reversi"] as LobbyHall[]).map((targetHall) => <button className={hall === targetHall ? "active" : ""} key={targetHall} onClick={() => onHallChange(targetHall)} type="button"><span>{targetHall === "main" ? "主大厅" : historyGameName(targetHall)}</span><i>{lobbyCounts[targetHall]}</i></button>)}
      </div>}
      {channel === "world" && <div className="world-channel-note"><Globe2 size={15} /><span>{hall === "main" ? "全站交流" : `${historyGameName(hall)}交流区`}</span><i>文明交流</i></div>}
      {channel === "world" && <section className="lobby-room-browser" aria-label="公开房间">
        <header><div><small>LIVE ROOMS</small><strong>公开棋局</strong></div><span>{lobbyBusy ? <LoaderCircle className="spin" size={15} /> : `${lobbyRooms.length} 间`}</span></header>
        <div className="lobby-room-list">
          {lobbyRooms.length === 0 ? <div className="lobby-room-empty"><Waypoints size={26} /><strong>暂时没有公开棋局</strong><p>创建好友房并开启观战后，会出现在这里。</p></div> : lobbyRooms.map((targetRoom) => <LobbyRoomCard key={targetRoom.id} onOpen={() => onLobbyRoom(targetRoom)} room={targetRoom} />)}
        </div>
      </section>}
      {channel === "world" && messageList}
      {channel === "world" && composer}

      {channel === "direct" && <section className={`direct-friend-pane ${peer ? "has-selection" : ""}`} aria-label="私聊好友">
        <header><div><small>CONTACTS</small><strong>好友</strong></div><span>{friends.filter((friend) => friend.online).length} 人在线</span></header>
        <div className="chat-friend-list">
          {friends.length === 0 ? <FriendEmpty text="添加好友后即可私聊" /> : sortedFriends.map((friend) => (
            <button className={peer?.id === friend.id ? "active" : ""} key={friend.id} onClick={() => onPeerChange(friend)} type="button">
              <FriendIdentity person={friend} />
              {(overview.directUnreads[friend.id] ?? 0) > 0 && <span>{Math.min(overview.directUnreads[friend.id], 99)}</span>}
            </button>
          ))}
        </div>
      </section>}

      {channel === "direct" && <section className={`direct-conversation ${peer ? "has-peer" : ""}`} aria-label="好友对话">
        {peer ? <>
          <button className="chat-peer-bar" onClick={() => onPeerChange(null)} type="button"><ChevronLeft size={16} /><span className="chat-peer-avatar"><UserAvatar name={peer.displayName} src={peer.avatarUrl} /></span><span><strong>{peer.displayName}</strong><small>{peer.signature || (peer.online ? "在线" : "离线")}</small></span><i className={peer.online ? "online" : ""}>{peer.online ? "在线" : "离线"}</i></button>
          {messageList}
          {composer}
        </> : <div className="direct-chat-empty"><span><MessageCircle size={28} /></span><strong>选择一位好友</strong><p>查看聊天记录，或直接发送房间邀请。</p></div>}
      </section>}
    </aside>
  );
}

function FriendPanel({ busy, data, onAction, onChat, onClose, onConfirm, onInvite, onSearch, onSearchChange, onTabChange, search, searchResults, tab }: {
  busy: string;
  data: FriendsData;
  onAction: (type: string, targetUserId: string, message: string) => void;
  onChat: (friend: FriendPerson) => void;
  onClose: () => void;
  onConfirm: (confirm: FriendConfirm) => void;
  onInvite: (friend: FriendPerson) => void;
  onSearch: () => void;
  onSearchChange: (value: string) => void;
  onTabChange: (tab: FriendTab) => void;
  search: string;
  searchResults: FriendSearchResult[];
  tab: FriendTab;
}) {
  const friends = [...data.friends].sort((first, second) => Number(second.online) - Number(first.online) || first.displayName.localeCompare(second.displayName, "zh-CN"));
  const requestCount = data.incomingRequests.length;
  return (
    <aside aria-label="好友中心" className="friend-panel">
      <header><div><small>FRIENDS</small><h2>好友</h2></div><button aria-label="关闭好友面板" onClick={onClose} type="button"><X size={18} /></button></header>
      <form className="friend-search" onSubmit={(event) => { event.preventDefault(); onSearch(); }}>
        <Search size={16} />
        <input aria-label="搜索用户名或棋手 ID" maxLength={16} onChange={(event) => onSearchChange(event.target.value)} placeholder="用户名或 MG-棋手 ID" value={search} />
        <button aria-label="搜索" disabled={!search.trim() || busy === "search"} title="搜索" type="submit">{busy === "search" ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}</button>
      </form>

      {search.trim() && (
        <section className="friend-search-results" aria-label="搜索结果">
          <span className="friend-section-label">搜索结果</span>
          {searchResults.length === 0 && busy !== "search" ? <FriendEmpty text="没有找到相关用户" /> : searchResults.map((person) => (
            <div className="friend-row" key={person.id}>
              <FriendIdentity person={person} />
              <div className="friend-row-actions">
                {person.relationship === "none" && <button disabled={Boolean(busy)} onClick={() => onAction("sendRequest", person.id, "好友申请已发送")} title="添加好友" type="button"><Plus size={16} /></button>}
                {person.relationship === "incoming" && <button className="positive" disabled={Boolean(busy)} onClick={() => onAction("acceptRequest", person.id, "已添加好友")} title="同意好友申请" type="button"><Check size={16} /></button>}
                {person.relationship === "outgoing" && <button disabled={Boolean(busy)} onClick={() => onAction("cancelRequest", person.id, "已取消好友申请")} title="取消好友申请" type="button"><X size={16} /></button>}
                {person.relationship === "friend" && <span className="relationship-label">好友</span>}
                {person.relationship === "blocked" && <button disabled={Boolean(busy)} onClick={() => onAction("unblockUser", person.id, "已解除屏蔽")} title="解除屏蔽" type="button"><ShieldCheck size={16} /></button>}
                {person.relationship === "blocked_by_other" && <span className="relationship-label muted">不可添加</span>}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="friend-tabs" aria-label="好友分类">
        <button className={tab === "friends" ? "active" : ""} onClick={() => onTabChange("friends")} type="button">好友 <span>{data.friends.length}</span></button>
        <button className={tab === "requests" ? "active" : ""} onClick={() => onTabChange("requests")} type="button">申请 {requestCount > 0 && <span className="alert">{requestCount}</span>}</button>
        <button className={tab === "blocked" ? "active" : ""} onClick={() => onTabChange("blocked")} type="button">屏蔽</button>
      </div>

      <div className="friend-panel-body">
        {tab === "friends" && (
          <>
            <section>
              <span className="friend-section-label">全部好友</span>
              {friends.length === 0 ? <FriendEmpty text="还没有好友，搜索用户名添加" /> : friends.map((person) => (
                <div className="friend-row" key={person.id}>
                  <FriendIdentity person={person} />
                  <div className="friend-row-actions">
                    <button disabled={Boolean(busy)} onClick={() => onChat(person)} title="发送消息" type="button"><MessageCircle size={16} /></button>
                    <button className="invite" disabled={!person.online || Boolean(busy)} onClick={() => onInvite(person)} title={person.online ? "邀请对局" : "好友离线"} type="button"><Gamepad2 size={16} /></button>
                    <button disabled={Boolean(busy)} onClick={() => onConfirm({ type: "removeFriend", person })} title="删除好友" type="button"><Trash2 size={15} /></button>
                    <button disabled={Boolean(busy)} onClick={() => onConfirm({ type: "blockUser", person })} title="屏蔽用户" type="button"><X size={15} /></button>
                  </div>
                </div>
              ))}
            </section>
            {data.recent.length > 0 && (
              <section>
                <span className="friend-section-label">最近对手</span>
                {data.recent.map((person) => <div className="friend-row" key={person.id}><FriendIdentity person={person} /><div className="friend-row-actions"><button disabled={Boolean(busy)} onClick={() => onAction("sendRequest", person.id, "好友申请已发送")} title="添加好友" type="button"><Plus size={16} /></button></div></div>)}
              </section>
            )}
          </>
        )}

        {tab === "requests" && (
          <>
            <section>
              <span className="friend-section-label">收到的申请</span>
              {data.incomingRequests.length === 0 ? <FriendEmpty text="暂无新的好友申请" /> : data.incomingRequests.map((person) => <div className="friend-row" key={person.id}><FriendIdentity person={person} /><div className="friend-row-actions"><button disabled={Boolean(busy)} onClick={() => onAction("rejectRequest", person.id, "已拒绝好友申请")} title="拒绝" type="button"><X size={16} /></button><button className="positive" disabled={Boolean(busy)} onClick={() => onAction("acceptRequest", person.id, "已添加好友")} title="同意" type="button"><Check size={16} /></button></div></div>)}
            </section>
            {data.outgoingRequests.length > 0 && <section><span className="friend-section-label">已发送</span>{data.outgoingRequests.map((person) => <div className="friend-row" key={person.id}><FriendIdentity person={person} /><div className="friend-row-actions"><button disabled={Boolean(busy)} onClick={() => onAction("cancelRequest", person.id, "已取消好友申请")} title="取消申请" type="button"><X size={16} /></button></div></div>)}</section>}
          </>
        )}

        {tab === "blocked" && (
          <section>
            <span className="friend-section-label">已屏蔽用户</span>
            {data.blocked.length === 0 ? <FriendEmpty text="没有已屏蔽的用户" /> : data.blocked.map((person) => <div className="friend-row" key={person.id}><FriendIdentity person={person} /><div className="friend-row-actions"><button disabled={Boolean(busy)} onClick={() => onAction("unblockUser", person.id, "已解除屏蔽")} title="解除屏蔽" type="button"><ShieldCheck size={16} /></button></div></div>)}
          </section>
        )}
      </div>
    </aside>
  );
}

function FriendIdentity({ person }: { person: FriendPerson }) {
  return <div className="friend-identity"><span className="friend-avatar"><UserAvatar name={person.displayName} src={person.avatarUrl} /><i className={person.online ? "online" : ""} /></span><div><strong>{person.displayName}</strong><small>{person.publicId}</small><p>{person.signature || (person.online ? "在线" : "离线")}</p></div></div>;
}

function FriendEmpty({ text }: { text: string }) {
  return <div className="friend-empty"><Users size={18} /><span>{text}</span></div>;
}

function IntersectionBoard({ analysisPoints = [], board, deadPoints = [], game, lastMove, onConfirm, onPlay, selectedPoint = null, size }: { analysisPoints?: Point[]; board: Stone[][]; deadPoints?: Point[]; game: "go" | "gomoku"; lastMove: Point | null; onConfirm?: (point: Point) => void; onPlay: (row: number, col: number) => void; selectedPoint?: Point | null; size: number }) {
  const stars = starPoints(size, game);
  const dead = new Set(deadPoints.map(([row, col]) => `${row}-${col}`));
  const analysis = new Set(analysisPoints.map(([row, col]) => `${row}-${col}`));
  return (
    <div className={`intersection-board standard-board ${game}`} style={{ "--board-size": size } as CSSProperties} aria-label={`${size} 路${game === "go" ? "围棋" : "五子棋"}棋盘`}>
      {board.map((row, rowIndex) => row.map((stone, colIndex) => {
        const edgeClasses = [rowIndex === 0 ? "top" : "", rowIndex === size - 1 ? "bottom" : "", colIndex === 0 ? "left" : "", colIndex === size - 1 ? "right" : ""].filter(Boolean).join(" ");
        const isLast = lastMove?.[0] === rowIndex && lastMove?.[1] === colIndex;
        const isDead = dead.has(`${rowIndex}-${colIndex}`);
        const isAnalysis = analysis.has(`${rowIndex}-${colIndex}`);
        const isSelected = selectedPoint?.[0] === rowIndex && selectedPoint?.[1] === colIndex;
        return (
          <button
            aria-label={`${rowIndex + 1}-${colIndex + 1}${stone ? playerName(stone) : "空位"}`}
            className={`${edgeClasses} ${stars.has(`${rowIndex}-${colIndex}`) ? "star" : ""} ${stone ? `stone ${stone}` : ""} ${isLast ? "last" : ""} ${isDead ? "dead" : ""} ${isAnalysis ? "analysis-point" : ""} ${isSelected ? "selected-point" : ""}`}
            key={`${rowIndex}-${colIndex}`}
            onClick={() => onPlay(rowIndex, colIndex)}
            onDoubleClick={() => onConfirm?.([rowIndex, colIndex])}
            type="button"
          />
        );
      }))}
    </div>
  );
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return <button className="icon-button" onClick={onClick} type="button" aria-label={label} title={label}>{children}</button>;
}

function SettingToggle({ checked, icon, label, onChange }: { checked: boolean; icon: ReactNode; label: string; onChange: (value: boolean) => void }) {
  return (
    <div className="setting-toggle-row">
      <span>{icon}{label}</span>
      <button aria-label={`${label}${checked ? "已开启" : "已关闭"}`} aria-pressed={checked} className={checked ? "active" : ""} onClick={() => onChange(!checked)} type="button"><i /></button>
    </div>
  );
}

function ScoreRow({ color, label, value }: { color?: Player; label: string; value: number }) {
  return <div className="score-row"><span>{color && <i className={`score-dot ${color}`} />}{label}</span><strong>{value}</strong></div>;
}
