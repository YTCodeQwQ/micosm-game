"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Eye, Gamepad2, History,
  LoaderCircle, RotateCcw, Search, ShieldCheck, Trophy, Users,
} from "lucide-react";
import { activateMatch, applyMatchAction, createMatchState, type MatchState } from "../../lib/match-engine";
import { AdminRankSeasons } from "./AdminRankSeasons";
import styles from "./admin.module.css";

type MatchSummary = {
  id?: string; roomId: string; game: string; mode: string; boardSize: number;
  players: { black: string; white: string }; winner?: string; reason?: string; moveCount: number;
  finalScore?: { black: number; white: number } | null; startedAt?: number; endedAt?: number; updatedAt?: number;
  status?: string; spectatorCount?: number; rankStatus?: string | null;
};
type MatchEvent = { type: string; actorPlayerId: string | null; roomVersion: number | null; details: Record<string, unknown>; requestId: string; createdAt: number };
type MatchDetail = { kind: "record" | "live"; match: MatchSummary & { state: MatchState; version?: number; spectatorPolicy?: string }; events: MatchEvent[] };
type RankProfile = { position: number; userId: string; publicId: string; displayName: string; rating: number; peakRating: number; label: string; wins: number; losses: number; draws: number; streak: number; matches: number; updatedAt: number };
type RankMatch = { roomId: string; game: string; players: { black: string; white: string }; ratings: { blackBefore: number; whiteBefore: number; blackDelta: number | null; whiteDelta: number | null; blackAfter: number | null; whiteAfter: number | null }; result: string | null; status: string; createdAt: number; settledAt: number | null };
type RankCorrection = { id: string; roomId: string; blackDelta: number; whiteDelta: number; reason: string; adminName: string; createdAt: number };

const gameNames: Record<string, string> = { go: "围棋", gomoku: "五子棋", reversi: "黑白棋" };
const modeNames: Record<string, string> = { private: "好友房", matchmaking: "匹配", ranked: "排位", ai: "人机" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `请求失败（${response.status}）`);
  return data;
}

function formatTime(value?: number | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "未记录";
}

function replayFrames(source?: MatchState) {
  if (!source) return [] as MatchState[];
  let state = activateMatch(createMatchState(source.game, source.size, "black", Boolean(source.gomokuForbidden)));
  const frames = [state];
  for (const move of source.moves ?? []) {
    try {
      if (move.type === "play") state = applyMatchAction(state, move.player, { type: "play", row: move.row, col: move.col });
      else if (move.type === "pass") state = applyMatchAction(state, move.player, { type: "pass" });
      else if (move.type === "resumeGo") state = applyMatchAction(state, move.player, { type: "resumeGo" });
      frames.push(state);
    } catch {
      break;
    }
  }
  return frames;
}

export function AdminGameOperations({ canManageSeasons, canWriteRank, onError, onNotice, revision = 0 }: { canManageSeasons: boolean; canWriteRank: boolean; onError: (message: string) => void; onNotice: (message: string) => void; revision?: number }) {
  const [tab, setTab] = useState<"matches" | "ranking">("matches");
  const [query, setQuery] = useState("");
  const [game, setGame] = useState("");
  const [mode, setMode] = useState("");
  const [records, setRecords] = useState<MatchSummary[]>([]);
  const [liveRooms, setLiveRooms] = useState<MatchSummary[]>([]);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [rankGame, setRankGame] = useState<"go" | "gomoku">("go");
  const [profiles, setProfiles] = useState<RankProfile[]>([]);
  const [rankMatches, setRankMatches] = useState<RankMatch[]>([]);
  const [corrections, setCorrections] = useState<RankCorrection[]>([]);
  const [reversing, setReversing] = useState<RankMatch | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [frameIndex, setFrameIndex] = useState(0);

  const loadMatches = useCallback(async () => {
    setBusy("matches");
    try {
      const params = new URLSearchParams({ q: query });
      if (game) params.set("game", game);
      if (mode) params.set("mode", mode);
      const data = await requestJson<{ records: MatchSummary[]; liveRooms: MatchSummary[] }>(`/api/admin/matches?${params}`);
      setRecords(data.records);
      setLiveRooms(data.liveRooms);
    } catch (caught) { onError(caught instanceof Error ? caught.message : "读取对局失败"); }
    finally { setBusy(""); }
  }, [game, mode, onError, query]);

  const loadRanking = useCallback(async () => {
    setBusy("ranking");
    try {
      const params = new URLSearchParams({ game: rankGame, q: query });
      const data = await requestJson<{ profiles: RankProfile[]; matches: RankMatch[]; corrections: RankCorrection[] }>(`/api/admin/ranking?${params}`);
      setProfiles(data.profiles); setRankMatches(data.matches); setCorrections(data.corrections);
    } catch (caught) { onError(caught instanceof Error ? caught.message : "读取排位数据失败"); }
    finally { setBusy(""); }
  }, [onError, query, rankGame]);

  useEffect(() => { const timer = window.setTimeout(() => void (tab === "matches" ? loadMatches() : loadRanking()), 0); return () => window.clearTimeout(timer); }, [loadMatches, loadRanking, revision, tab]);

  async function openMatch(roomId: string, id?: string) {
    setBusy(`detail:${roomId}`);
    try {
      const data = await requestJson<MatchDetail>(`/api/admin/matches?id=${encodeURIComponent(id ?? roomId)}`);
      setDetail(data); setFrameIndex(0);
    } catch (caught) { onError(caught instanceof Error ? caught.message : "读取对局详情失败"); }
    finally { setBusy(""); }
  }

  async function reverseSettlement() {
    if (!reversing || !reason.trim()) return;
    setBusy(`reverse:${reversing.roomId}`);
    try {
      await requestJson("/api/admin/ranking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reverse_settlement", roomId: reversing.roomId, reason: reason.trim() }) });
      setReversing(null); setReason(""); onNotice("排位结算已撤销，双方积分与场次已回退"); await loadRanking();
    } catch (caught) { onError(caught instanceof Error ? caught.message : "撤销排位结算失败"); }
    finally { setBusy(""); }
  }

  const frames = useMemo(() => replayFrames(detail?.match.state), [detail]);
  const shownFrame = frames[Math.min(frameIndex, Math.max(0, frames.length - 1))] ?? detail?.match.state;

  return <section className={`${styles.pageSection} ${styles.gameOps}`}>
    <div className={styles.gameOpsHero}><span><Gamepad2 size={23} /></span><div><small>GAME OPERATIONS</small><strong>对局与排位工作台</strong><p>检索实时房间、终局复盘和排位结算；原始棋局不会被后台修改。</p></div><div className={styles.gameOpsTabs}><button className={tab === "matches" ? styles.active : ""} onClick={() => setTab("matches")} type="button"><History size={16} />对局</button><button className={tab === "ranking" ? styles.active : ""} onClick={() => setTab("ranking")} type="button"><Trophy size={16} />排位</button></div></div>
    <form className={styles.gameOpsFilters} onSubmit={(event) => { event.preventDefault(); void (tab === "matches" ? loadMatches() : loadRanking()); }}><Search size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="房间号、用户名或 MG-棋手 ID" value={query} />{tab === "matches" && <><select onChange={(event) => setGame(event.target.value)} value={game}><option value="">全部棋类</option><option value="go">围棋</option><option value="gomoku">五子棋</option><option value="reversi">黑白棋</option></select><select onChange={(event) => setMode(event.target.value)} value={mode}><option value="">全部模式</option><option value="private">好友房</option><option value="matchmaking">匹配</option><option value="ranked">排位</option><option value="ai">人机</option></select></>}{tab === "ranking" && <select onChange={(event) => setRankGame(event.target.value === "gomoku" ? "gomoku" : "go")} value={rankGame}><option value="go">围棋排位</option><option value="gomoku">五子棋排位</option></select>}<button disabled={Boolean(busy)} type="submit">{busy ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}查询</button></form>

    {tab === "matches" ? <div className={styles.gameOpsColumns}>
      <section className={styles.gameOpsList}><header><div><small>LIVE & ARCHIVE</small><h2>棋局列表</h2></div><b>{liveRooms.length} 实时 · {records.length} 归档</b></header>{liveRooms.map((item) => <button className={styles.liveMatchRow} key={item.roomId} onClick={() => void openMatch(item.roomId)} type="button"><span><Activity size={17} /></span><div><strong>{item.players.black} <i>vs</i> {item.players.white}</strong><small>{gameNames[item.game]} · {modeNames[item.mode]} · {item.roomId}</small></div><b>{item.status === "playing" ? "进行中" : "等待中"}</b><small>{item.spectatorCount ?? 0} 人观战</small></button>)}{records.map((item) => <button className={styles.matchArchiveRow} key={item.id} onClick={() => void openMatch(item.roomId, item.id)} type="button"><span>{item.winner === "black" ? "黑" : item.winner === "white" ? "白" : "和"}</span><div><strong>{item.players.black} <i>vs</i> {item.players.white}</strong><small>{gameNames[item.game]} · {modeNames[item.mode]} · {item.moveCount} 手</small></div><b>{item.rankStatus === "reversed" ? "已纠错" : item.winner === "draw" ? "和棋" : `${item.winner === "black" ? "黑方" : "白方"}胜`}</b><time>{formatTime(item.endedAt)}</time></button>)}{!liveRooms.length && !records.length && <div className={styles.gameOpsEmpty}><Gamepad2 size={25} /><strong>没有找到棋局</strong><p>调整筛选条件后再试。</p></div>}</section>
      <section className={styles.matchInspector}>{detail ? <><header><div><small>{detail.kind === "live" ? "LIVE INSPECTION" : "ARCHIVED REPLAY"}</small><h2>{detail.match.players.black} vs {detail.match.players.white}</h2></div><b>{detail.match.roomId}</b></header><div className={styles.matchInspectorMeta}><span>{gameNames[detail.match.game]}</span><span>{modeNames[detail.match.mode]}</span><span>{detail.match.boardSize} 路</span><span>{detail.kind === "live" ? `${detail.match.spectatorCount ?? 0} 人观战` : `${detail.match.moveCount} 手`}</span></div><ReplayBoard state={shownFrame} /><div className={styles.replayControl}><button disabled={frameIndex <= 0} onClick={() => setFrameIndex((value) => Math.max(0, value - 1))} type="button"><ArrowLeft size={16} /></button><input aria-label="复盘进度" max={Math.max(0, frames.length - 1)} min={0} onChange={(event) => setFrameIndex(Number(event.target.value))} type="range" value={Math.min(frameIndex, Math.max(0, frames.length - 1))} /><b>{Math.min(frameIndex, Math.max(0, frames.length - 1))} / {Math.max(0, frames.length - 1)}</b><button disabled={frameIndex >= frames.length - 1} onClick={() => setFrameIndex((value) => Math.min(frames.length - 1, value + 1))} type="button"><ArrowRight size={16} /></button></div><div className={styles.matchTimeline}><h3>事件时间线</h3>{detail.events.map((event, index) => <div key={`${event.requestId}-${index}`}><span /><time>{formatTime(event.createdAt)}</time><strong>{event.type}</strong><small>{event.actorPlayerId ?? "系统"} · v{event.roomVersion ?? "-"}</small></div>)}{!detail.events.length && <p>这盘棋没有额外事件记录。</p>}</div></> : <div className={styles.inspectorEmpty}><Eye size={28} /><strong>选择一盘棋</strong><p>这里会展示棋盘复盘和完整事件时间线。</p></div>}</section>
    </div> : <><AdminRankSeasons canManage={canManageSeasons} onError={onError} onNotice={onNotice} revision={revision} /><div className={styles.rankOpsColumns}>
      <section className={styles.rankProfiles}><header><div><small>RATING TABLE</small><h2>{rankGame === "go" ? "围棋" : "五子棋"}棋手</h2></div><b>{profiles.length} 人</b></header>{profiles.map((profile) => <article key={profile.userId}><span>{profile.position}</span><div><strong>{profile.displayName}</strong><small>{profile.publicId} · {profile.label}</small></div><b>{profile.rating}</b><small>{profile.wins}胜 {profile.losses}负 · {profile.matches}局</small></article>)}{!profiles.length && <div className={styles.gameOpsEmpty}><Users size={24} /><strong>暂无排位棋手</strong></div>}</section>
      <section className={styles.rankSettlements}><header><div><small>SETTLEMENTS</small><h2>最近结算</h2></div><b>只允许整局撤销</b></header>{rankMatches.map((match) => <article key={match.roomId}><div><strong>{match.players.black} <i>vs</i> {match.players.white}</strong><small>{match.roomId} · {formatTime(match.settledAt ?? match.createdAt)}</small></div><span>黑 {match.ratings.blackDelta === null ? "-" : `${match.ratings.blackDelta >= 0 ? "+" : ""}${match.ratings.blackDelta}`} · 白 {match.ratings.whiteDelta === null ? "-" : `${match.ratings.whiteDelta >= 0 ? "+" : ""}${match.ratings.whiteDelta}`}</span><b className={match.status === "reversed" ? styles.rankReversed : styles.rankSettled}>{match.status === "reversed" ? "已撤销" : match.status === "settled" ? "已结算" : "处理中"}</b>{canWriteRank && match.status === "settled" && <button onClick={() => { setReversing(match); setReason(""); }} type="button"><RotateCcw size={15} />纠错</button>}</article>)}{!rankMatches.length && <div className={styles.gameOpsEmpty}><Trophy size={24} /><strong>暂无排位结算</strong></div>}<div className={styles.correctionLog}><h3>纠错记录</h3>{corrections.map((item) => <div key={item.id}><ShieldCheck size={15} /><p><strong>{item.roomId}</strong><small>{item.reason}</small></p><span>{item.adminName}<br />{formatTime(item.createdAt)}</span></div>)}{!corrections.length && <p>尚未发生排位纠错。</p>}</div></section>
    </div></>}

    {reversing && <div className={styles.gameOpsModalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReversing(null); }}><section aria-modal="true" className={styles.gameOpsModal} role="dialog"><AlertTriangle size={25} /><h2>撤销排位结算</h2><p>将回退双方本局积分与胜负场次，但保留原始棋局和历史最高分。该操作不可重复。</p><dl><div><dt>房间</dt><dd>{reversing.roomId}</dd></div><div><dt>积分</dt><dd>黑 {reversing.ratings.blackDelta} · 白 {reversing.ratings.whiteDelta}</dd></div></dl><label>纠错原因<textarea autoFocus maxLength={240} onChange={(event) => setReason(event.target.value)} placeholder="说明误判、故障或申诉依据" rows={4} value={reason} /></label><footer><button onClick={() => setReversing(null)} type="button">取消</button><button disabled={!reason.trim() || Boolean(busy)} onClick={() => void reverseSettlement()} type="button">确认撤销</button></footer></section></div>}
  </section>;
}

function ReplayBoard({ state }: { state?: MatchState }) {
  if (!state?.board?.length) return <div className={styles.replayBoardEmpty}>棋盘数据不可用</div>;
  const size = state.board.length;
  return <div className={`${styles.adminReplayBoard} ${state.game === "reversi" ? styles.reversiReplay : ""}`} style={{ gridTemplateColumns: `repeat(${size},1fr)` }}>{state.board.flatMap((row, rowIndex) => row.map((stone, colIndex) => <span className={stone ? styles[`stone_${stone}`] : ""} key={`${rowIndex}-${colIndex}`}>{stone && <i />}</span>))}</div>;
}
