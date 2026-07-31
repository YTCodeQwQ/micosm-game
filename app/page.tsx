"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Gamepad2,
  Home,
  RotateCcw,
  Search,
  Settings,
  Star,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

type GameId = "gomoku" | "sudoku" | "reversi";
type Category = "全部" | "棋盘" | "数字";
type ReversiStone = "black" | "white" | null;
type GomokuStone = "black" | "white" | null;

const games: Array<{
  id: GameId;
  title: string;
  subtitle: string;
  category: Exclude<Category, "全部">;
  level: string;
  time: string;
  tone: string;
}> = [
  {
    id: "gomoku",
    title: "五子连珠",
    subtitle: "九路快棋",
    category: "棋盘",
    level: "入门",
    time: "3 分钟",
    tone: "ochre",
  },
  {
    id: "reversi",
    title: "迷你黑白棋",
    subtitle: "四路翻转",
    category: "棋盘",
    level: "进阶",
    time: "4 分钟",
    tone: "green",
  },
  {
    id: "sudoku",
    title: "四宫数独",
    subtitle: "逻辑热身",
    category: "数字",
    level: "轻松",
    time: "2 分钟",
    tone: "blue",
  },
];

const sudokuPuzzle = [
  [1, 0, 0, 4],
  [0, 4, 1, 0],
  [0, 1, 4, 0],
  [4, 0, 0, 1],
];

const sudokuSolution = [
  [1, 3, 2, 4],
  [2, 4, 1, 3],
  [3, 1, 4, 2],
  [4, 2, 3, 1],
];

const initialReversi: ReversiStone[][] = [
  [null, null, null, null],
  [null, "white", "black", null],
  [null, "black", "white", null],
  [null, null, null, null],
];

const directions = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function makeGomokuBoard(): GomokuStone[][] {
  return Array.from({ length: 9 }, () => Array<GomokuStone>(9).fill(null));
}

function copyBoard<T>(board: T[][]): T[][] {
  return board.map((row) => [...row]);
}

function hasFive(board: GomokuStone[][], player: Exclude<GomokuStone, null>) {
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      if (board[row][col] !== player) continue;
      for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        let count = 1;
        for (let step = 1; step < 5; step += 1) {
          const nextRow = row + dr * step;
          const nextCol = col + dc * step;
          if (nextRow < 0 || nextRow >= 9 || nextCol < 0 || nextCol >= 9) break;
          if (board[nextRow][nextCol] === player) count += 1;
        }
        if (count >= 5) return true;
      }
    }
  }
  return false;
}

function getFlips(
  board: ReversiStone[][],
  row: number,
  col: number,
  player: Exclude<ReversiStone, null>,
) {
  if (board[row][col]) return [];
  const rival = player === "black" ? "white" : "black";
  const flips: Array<[number, number]> = [];

  for (const [dr, dc] of directions) {
    const path: Array<[number, number]> = [];
    let nextRow = row + dr;
    let nextCol = col + dc;
    while (
      nextRow >= 0 &&
      nextRow < 4 &&
      nextCol >= 0 &&
      nextCol < 4 &&
      board[nextRow][nextCol] === rival
    ) {
      path.push([nextRow, nextCol]);
      nextRow += dr;
      nextCol += dc;
    }
    if (
      path.length &&
      nextRow >= 0 &&
      nextRow < 4 &&
      nextCol >= 0 &&
      nextCol < 4 &&
      board[nextRow][nextCol] === player
    ) {
      flips.push(...path);
    }
  }
  return flips;
}

function reversiScore(board: ReversiStone[][]) {
  return board.flat().reduce(
    (score, stone) => {
      if (stone === "black") score.black += 1;
      if (stone === "white") score.white += 1;
      return score;
    },
    { black: 0, white: 0 },
  );
}

export default function HomePage() {
  const [activeGame, setActiveGame] = useState<GameId>("gomoku");
  const [category, setCategory] = useState<Category>("全部");
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<GameId[]>([]);
  const [completed, setCompleted] = useState(0);
  const [ready, setReady] = useState(false);

  const [gomokuBoard, setGomokuBoard] = useState(makeGomokuBoard);
  const [gomokuTurn, setGomokuTurn] = useState<Exclude<GomokuStone, null>>("black");
  const [gomokuWinner, setGomokuWinner] = useState<Exclude<GomokuStone, null> | null>(null);

  const [sudokuBoard, setSudokuBoard] = useState(() => copyBoard(sudokuPuzzle));
  const [sudokuDone, setSudokuDone] = useState(false);

  const [reversiBoard, setReversiBoard] = useState(() => copyBoard(initialReversi));
  const [reversiTurn, setReversiTurn] = useState<Exclude<ReversiStone, null>>("black");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("yijing-progress");
      if (saved) {
        const data = JSON.parse(saved) as { favorites?: GameId[]; completed?: number };
        setFavorites(data.favorites ?? []);
        setCompleted(data.completed ?? 0);
      }
    } catch {
      // A fresh local profile is fine when stored progress cannot be read.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem("yijing-progress", JSON.stringify({ favorites, completed }));
  }, [completed, favorites, ready]);

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const inCategory = category === "全部" || game.category === category;
      const matchesSearch = `${game.title}${game.subtitle}`.includes(search.trim());
      return inCategory && matchesSearch;
    });
  }, [category, search]);

  const activeMeta = games.find((game) => game.id === activeGame) ?? games[0];
  const sudokuErrors = sudokuBoard.flat().reduce((sum, cell, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    return sum + (cell !== 0 && cell !== sudokuSolution[row][col] ? 1 : 0);
  }, 0);
  const score = reversiScore(reversiBoard);

  function recordWin() {
    setCompleted((value) => value + 1);
  }

  function playGomoku(row: number, col: number) {
    if (gomokuBoard[row][col] || gomokuWinner) return;
    const next = copyBoard(gomokuBoard);
    next[row][col] = gomokuTurn;
    setGomokuBoard(next);
    if (hasFive(next, gomokuTurn)) {
      setGomokuWinner(gomokuTurn);
      recordWin();
    } else {
      setGomokuTurn(gomokuTurn === "black" ? "white" : "black");
    }
  }

  function resetGomoku() {
    setGomokuBoard(makeGomokuBoard());
    setGomokuTurn("black");
    setGomokuWinner(null);
  }

  function playSudoku(row: number, col: number) {
    if (sudokuPuzzle[row][col] || sudokuDone) return;
    const next = copyBoard(sudokuBoard);
    next[row][col] = next[row][col] >= 4 ? 0 : next[row][col] + 1;
    setSudokuBoard(next);
    if (next.every((line, r) => line.every((cell, c) => cell === sudokuSolution[r][c]))) {
      setSudokuDone(true);
      recordWin();
    }
  }

  function resetSudoku() {
    setSudokuBoard(copyBoard(sudokuPuzzle));
    setSudokuDone(false);
  }

  function playReversi(row: number, col: number) {
    const flips = getFlips(reversiBoard, row, col, reversiTurn);
    if (!flips.length) return;
    const next = copyBoard(reversiBoard);
    next[row][col] = reversiTurn;
    flips.forEach(([flipRow, flipCol]) => {
      next[flipRow][flipCol] = reversiTurn;
    });
    setReversiBoard(next);
    setReversiTurn(reversiTurn === "black" ? "white" : "black");
    if (next.flat().every(Boolean)) recordWin();
  }

  function resetReversi() {
    setReversiBoard(copyBoard(initialReversi));
    setReversiTurn("black");
  }

  function toggleFavorite(id: GameId) {
    setFavorites((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }

  const gameStatus =
    activeGame === "gomoku"
      ? gomokuWinner
        ? `${gomokuWinner === "black" ? "黑方" : "白方"}获胜`
        : `${gomokuTurn === "black" ? "黑方" : "白方"}落子`
      : activeGame === "sudoku"
        ? sudokuDone
          ? "挑战完成"
          : sudokuErrors
            ? `${sudokuErrors} 处待修正`
            : "继续推理"
        : `${reversiTurn === "black" ? "黑方" : "白方"}行动`;

  return (
    <main className="app-shell">
      <nav className="nav-rail" aria-label="主导航">
        <div className="brand-mark" aria-label="弈境">弈</div>
        <div className="nav-actions">
          <NavButton label="首页" active><Home size={20} /></NavButton>
          <NavButton label="游戏"><Gamepad2 size={20} /></NavButton>
          <NavButton label="排行"><Trophy size={20} /></NavButton>
          <NavButton label="日历"><CalendarDays size={20} /></NavButton>
        </div>
        <div className="nav-bottom">
          <NavButton label="设置"><Settings size={20} /></NavButton>
          <button className="avatar" type="button" aria-label="个人中心">M</button>
        </div>
      </nav>

      <aside className="library-panel" aria-label="游戏大厅">
        <header className="library-header">
          <span className="product-name">弈境</span>
          <h1>游戏大厅</h1>
          <p>短局、清醒、随时开一盘。</p>
        </header>

        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="搜索游戏"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索游戏"
            type="search"
            value={search}
          />
          <kbd>/</kbd>
        </label>

        <div className="category-tabs" role="tablist" aria-label="游戏分类">
          {(["全部", "棋盘", "数字"] as Category[]).map((item) => (
            <button
              aria-selected={category === item}
              className={category === item ? "active" : ""}
              key={item}
              onClick={() => setCategory(item)}
              role="tab"
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="game-list">
          {filteredGames.map((game) => (
            <article className={`game-item ${activeGame === game.id ? "selected" : ""}`} key={game.id}>
              <button className="game-open" onClick={() => setActiveGame(game.id)} type="button">
                <GameThumb game={game.id} tone={game.tone} />
                <span className="game-copy">
                  <span className="game-title-row">
                    <strong>{game.title}</strong>
                    <span>{game.level}</span>
                  </span>
                  <small>{game.subtitle} · {game.time}</small>
                </span>
                <ChevronRight className="game-chevron" size={18} />
              </button>
              <button
                aria-label={`${favorites.includes(game.id) ? "取消收藏" : "收藏"}${game.title}`}
                className={`favorite ${favorites.includes(game.id) ? "active" : ""}`}
                onClick={() => toggleFavorite(game.id)}
                type="button"
              >
                <Star size={16} fill={favorites.includes(game.id) ? "currentColor" : "none"} />
              </button>
            </article>
          ))}
          {!filteredGames.length && <p className="empty-state">没有找到对应游戏</p>}
        </div>

        <section className="daily-progress" aria-label="今日进度">
          <div>
            <span>今日练习</span>
            <strong>{Math.min(completed, 3)} / 3</strong>
          </div>
          <div className="progress-track"><span style={{ width: `${Math.min(completed / 3, 1) * 100}%` }} /></div>
          <p>再完成 {Math.max(3 - completed, 0)} 局，解锁进阶题。</p>
        </section>
      </aside>

      <section className="arena-panel" aria-label="当前棋局">
        <header className="arena-topbar">
          <div>
            <span className="breadcrumb">游戏大厅 / {activeMeta.category}</span>
            <h2>{activeMeta.title}</h2>
          </div>
          <div className="arena-actions">
            <button type="button" aria-label="查看规则" title="查看规则"><CircleHelp size={19} /></button>
            <button
              type="button"
              aria-label="重新开始"
              title="重新开始"
              onClick={activeGame === "gomoku" ? resetGomoku : activeGame === "sudoku" ? resetSudoku : resetReversi}
            >
              <RotateCcw size={19} />
            </button>
          </div>
        </header>

        <div className="board-stage">
          <div className="stage-meta">
            <span>快速练习</span>
            <span>{activeMeta.time}</span>
          </div>

          {activeGame === "gomoku" && (
            <div className="gomoku-board board" aria-label="五子连珠棋盘">
              {gomokuBoard.map((row, rowIndex) =>
                row.map((stone, colIndex) => (
                  <button
                    aria-label={`第 ${rowIndex + 1} 行，第 ${colIndex + 1} 列${stone ? `，${stone === "black" ? "黑子" : "白子"}` : "，空位"}`}
                    className={stone ? `stone-${stone}` : ""}
                    key={`${rowIndex}-${colIndex}`}
                    onClick={() => playGomoku(rowIndex, colIndex)}
                    type="button"
                  />
                )),
              )}
            </div>
          )}

          {activeGame === "sudoku" && (
            <div className="sudoku-board board" aria-label="四宫数独棋盘">
              {sudokuBoard.map((row, rowIndex) =>
                row.map((value, colIndex) => {
                  const given = sudokuPuzzle[rowIndex][colIndex] !== 0;
                  const error = value !== 0 && value !== sudokuSolution[rowIndex][colIndex];
                  return (
                    <button
                      aria-label={`第 ${rowIndex + 1} 行，第 ${colIndex + 1} 列${value ? `，数字 ${value}` : "，空格"}`}
                      className={`${given ? "given" : ""} ${error ? "error" : ""}`}
                      key={`${rowIndex}-${colIndex}`}
                      onClick={() => playSudoku(rowIndex, colIndex)}
                      type="button"
                    >
                      {value || ""}
                    </button>
                  );
                }),
              )}
            </div>
          )}

          {activeGame === "reversi" && (
            <div className="reversi-board board" aria-label="迷你黑白棋棋盘">
              {reversiBoard.map((row, rowIndex) =>
                row.map((stone, colIndex) => {
                  const legal = getFlips(reversiBoard, rowIndex, colIndex, reversiTurn).length > 0;
                  return (
                    <button
                      aria-label={`第 ${rowIndex + 1} 行，第 ${colIndex + 1} 列${stone ? `，${stone === "black" ? "黑子" : "白子"}` : legal ? "，可落子" : "，空位"}`}
                      className={`${stone ? `stone-${stone}` : ""} ${legal ? "legal" : ""}`}
                      key={`${rowIndex}-${colIndex}`}
                      onClick={() => playReversi(rowIndex, colIndex)}
                      type="button"
                    />
                  );
                }),
              )}
            </div>
          )}

          <div className="mobile-status">
            <span className="turn-dot" />
            <strong>{gameStatus}</strong>
          </div>
        </div>
      </section>

      <aside className="match-panel" aria-label="对局信息">
        <header className="match-heading">
          <span>对局信息</span>
          <button type="button" aria-label="邀请好友" title="邀请好友"><Users size={18} /></button>
        </header>

        <section className="turn-section">
          <span className="section-label">当前状态</span>
          <div className="turn-display">
            <span className={`player-stone ${activeGame === "sudoku" ? "number" : ""}`}>
              {activeGame === "sudoku" ? "4" : ""}
            </span>
            <div>
              <strong>{gameStatus}</strong>
              <small>保持专注，想清楚再落子</small>
            </div>
          </div>
        </section>

        <section className="objective-section">
          <span className="section-label">本局目标</span>
          <p>
            {activeGame === "gomoku" && "横、竖或斜线率先连成五子。两人可在同一设备轮流落子。"}
            {activeGame === "sudoku" && "让每行、每列和每个 2 × 2 宫都包含数字 1 到 4。点击空格切换数字。"}
            {activeGame === "reversi" && "在高亮位置落子，夹住并翻转对手棋子。棋盘填满时棋子更多者胜。"}
          </p>
        </section>

        {activeGame === "reversi" ? (
          <section className="score-section">
            <span className="section-label">棋子统计</span>
            <div className="score-line"><span><i className="score-stone black" />黑方</span><strong>{score.black}</strong></div>
            <div className="score-line"><span><i className="score-stone white" />白方</span><strong>{score.white}</strong></div>
          </section>
        ) : (
          <section className="score-section">
            <span className="section-label">练习记录</span>
            <div className="score-line"><span>今日完成</span><strong>{completed}</strong></div>
            <div className="score-line"><span>已收藏</span><strong>{favorites.length}</strong></div>
          </section>
        )}

        <section className="tip-section">
          <Zap size={18} />
          <div>
            <strong>训练提示</strong>
            <p>{activeGame === "gomoku" ? "先观察对手是否已经形成四连。" : activeGame === "sudoku" ? "优先填写只剩一个候选数的格子。" : "角落一旦占据，就不会再被翻转。"}</p>
          </div>
        </section>

        <button
          className="reset-button"
          onClick={activeGame === "gomoku" ? resetGomoku : activeGame === "sudoku" ? resetSudoku : resetReversi}
          type="button"
        >
          <RotateCcw size={17} />
          重新开始
        </button>
      </aside>
    </main>
  );
}

function NavButton({ children, label, active = false }: { children: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} type="button" aria-label={label} title={label}>
      {children}
    </button>
  );
}

function GameThumb({ game, tone }: { game: GameId; tone: string }) {
  return (
    <span className={`game-thumb ${tone}`} aria-hidden="true">
      {game === "sudoku" ? (
        <span className="thumb-sudoku"><i>1</i><i /><i>3</i><i>4</i></span>
      ) : (
        <span className={`thumb-board ${game}`}><i /><i /><i /><i /></span>
      )}
    </span>
  );
}
