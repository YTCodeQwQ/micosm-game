"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange, Check, Clock3, Crown, Edit3, LoaderCircle, LockKeyhole,
  Play, Plus, ShieldAlert, Square, Trash2, Trophy, X,
} from "lucide-react";
import styles from "./admin.module.css";

type SeasonStatus = "draft" | "active" | "closing" | "closed";
type Season = {
  id: string; code: string; name: string; summary: string; status: SeasonStatus;
  startsAt: number; endsAt: number; goEnabled: boolean; gomokuEnabled: boolean;
  carryPercent: number; activatedAt: number | null; closedAt: number | null;
  counts: { matches: number; activeMatches: number; queued: number; standings: number };
};
type SeasonData = { seasons: Season[]; current: Season | null; canManage: boolean };
type SeasonForm = {
  id?: string; name: string; summary: string; startsAt: string; endsAt: string;
  carryPercent: number; goEnabled: boolean; gomokuEnabled: boolean;
};
type ConfirmAction = { season: Season; action: "activate" | "begin_close" | "finalize" | "delete"; title: string; detail: string; label: string; danger?: boolean };

const statusLabel: Record<SeasonStatus, string> = { draft: "草稿", active: "进行中", closing: "停止报名", closed: "已封存" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `请求失败（${response.status}）`);
  return data;
}

function localInput(timestamp: number) {
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

function emptyForm(): SeasonForm {
  const now = Date.now();
  return {
    name: "", summary: "", startsAt: localInput(now), endsAt: localInput(now + 90 * 24 * 60 * 60 * 1000),
    carryPercent: 50, goEnabled: true, gomokuEnabled: true,
  };
}

function formFor(season: Season): SeasonForm {
  return {
    id: season.id, name: season.name, summary: season.summary,
    startsAt: localInput(season.startsAt), endsAt: localInput(season.endsAt),
    carryPercent: season.carryPercent, goEnabled: season.goEnabled, gomokuEnabled: season.gomokuEnabled,
  };
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function AdminRankSeasons({ canManage, onError, onNotice, revision = 0 }: {
  canManage: boolean; onError: (message: string) => void; onNotice: (message: string) => void; revision?: number;
}) {
  const [data, setData] = useState<SeasonData | null>(null);
  const [busy, setBusy] = useState("");
  const [editor, setEditor] = useState<SeasonForm | null>(null);
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    try { setData(await requestJson<SeasonData>("/api/admin/ranking/seasons")); }
    catch (caught) { onError(caught instanceof Error ? caught.message : "读取排位赛季失败"); }
    finally { setBusy(""); }
  }, [onError]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, revision]);

  const current = data?.current ?? null;
  const drafts = useMemo(() => data?.seasons.filter((season) => season.status === "draft") ?? [], [data]);
  const history = useMemo(() => data?.seasons.filter((season) => season.status === "closed") ?? [], [data]);

  async function saveSeason(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy("save");
    try {
      const payload = {
        action: editor.id ? "update" : "create", seasonId: editor.id,
        name: editor.name, summary: editor.summary,
        startsAt: new Date(editor.startsAt).getTime(), endsAt: new Date(editor.endsAt).getTime(),
        carryPercent: editor.carryPercent, goEnabled: editor.goEnabled, gomokuEnabled: editor.gomokuEnabled,
      };
      const next = await requestJson<{ seasons: Season[] }>("/api/admin/ranking/seasons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      setData((value) => value ? { ...value, seasons: next.seasons, current: next.seasons.find((season) => ["active", "closing"].includes(season.status)) ?? null } : value);
      setEditor(null); onNotice(editor.id ? "赛季设置已更新" : "赛季草稿已创建");
    } catch (caught) { onError(caught instanceof Error ? caught.message : "保存赛季失败"); }
    finally { setBusy(""); }
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault();
    if (!confirming || !reason.trim()) return;
    setBusy(confirming.action);
    try {
      const next = await requestJson<{ seasons: Season[] }>("/api/admin/ranking/seasons", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: confirming.action, seasonId: confirming.season.id, reason: reason.trim() }),
      });
      setData((value) => value ? { ...value, seasons: next.seasons, current: next.seasons.find((season) => ["active", "closing"].includes(season.status)) ?? null } : value);
      onNotice(confirming.action === "activate" ? "新赛季已激活" : confirming.action === "begin_close" ? "赛季已停止报名" : confirming.action === "finalize" ? "赛季榜单已封存" : "赛季草稿已删除");
      setConfirming(null); setReason("");
    } catch (caught) { onError(caught instanceof Error ? caught.message : "赛季操作失败"); }
    finally { setBusy(""); }
  }

  function ask(action: ConfirmAction) { setConfirming(action); setReason(""); }

  return <section className={styles.seasonWorkspace}>
    <header className={styles.seasonHeading}>
      <div><small>RANK SEASONS</small><h2>排位赛季</h2><p>赛季边界、积分继承和榜单封存由超级管理员统一控制。</p></div>
      {canManage ? <button onClick={() => setEditor(emptyForm())} type="button"><Plus size={16} />新建赛季</button> : <span><LockKeyhole size={15} />只读</span>}
    </header>

    {current ? <article className={`${styles.currentSeason} ${styles[`season_${current.status}`]}`}>
      <span><Crown size={24} /></span>
      <div><small>{current.code} · {statusLabel[current.status]}</small><h3>{current.name}</h3><p>{current.summary || "本赛季没有补充说明。"}</p><time>{formatDate(current.startsAt)} - {formatDate(current.endsAt)}</time></div>
      <dl><div><dt>排位对局</dt><dd>{current.counts.matches}</dd></div><div><dt>等待队列</dt><dd>{current.counts.queued}</dd></div><div><dt>在途对局</dt><dd>{current.counts.activeMatches}</dd></div></dl>
      {canManage && <footer>
        <button onClick={() => setEditor(formFor(current))} type="button"><Edit3 size={15} />设置</button>
        {current.status === "active" && <button className={styles.seasonStop} onClick={() => ask({ season: current, action: "begin_close", title: "停止本赛季报名", detail: "等待队列会被清空；已经开始的排位仍会正常下完并结算。", label: "停止报名", danger: true })} type="button"><Square size={15} />停止报名</button>}
        {current.status === "closing" && <button disabled={current.counts.activeMatches > 0} onClick={() => ask({ season: current, action: "finalize", title: "封存赛季榜单", detail: "当前积分将生成不可变的历史榜单。封存后才能激活下一赛季。", label: "确认封存" })} title={current.counts.activeMatches > 0 ? `还有 ${current.counts.activeMatches} 场排位尚未结算` : "生成历史榜单并结束赛季"} type="button"><Check size={15} />封存榜单</button>}
      </footer>}
    </article> : <div className={styles.noCurrentSeason}><Clock3 size={23} /><div><strong>当前没有进行中的赛季</strong><p>可以先准备草稿，确认时间与积分继承规则后再激活。</p></div></div>}

    <div className={styles.seasonLists}>
      <section><header><div><small>NEXT</small><h3>赛季草稿</h3></div><b>{drafts.length}</b></header>{drafts.map((season) => <article className={styles.seasonRow} key={season.id}><span><CalendarRange size={18} /></span><div><strong>{season.name}</strong><small>{season.code} · {formatDate(season.startsAt)}</small><p>{season.goEnabled ? "围棋" : ""}{season.goEnabled && season.gomokuEnabled ? " · " : ""}{season.gomokuEnabled ? "五子棋" : ""} · 继承 {season.carryPercent}% 积分</p></div>{canManage && <div><button aria-label="编辑赛季" onClick={() => setEditor(formFor(season))} title="编辑" type="button"><Edit3 size={15} /></button><button aria-label="激活赛季" disabled={Boolean(current)} onClick={() => ask({ season, action: "activate", title: "激活新赛季", detail: `全体棋手将继承上赛季 ${season.carryPercent}% 的积分，胜负与场次会清零。`, label: "确认激活" })} title={current ? "需要先封存当前赛季" : "激活赛季"} type="button"><Play size={15} /></button><button aria-label="删除草稿" onClick={() => ask({ season, action: "delete", title: "删除赛季草稿", detail: "只会删除尚未激活的草稿，不影响任何排位数据。", label: "删除草稿", danger: true })} title="删除" type="button"><Trash2 size={15} /></button></div>}</article>)}{!drafts.length && <p className={styles.seasonEmpty}>还没有准备中的赛季草稿。</p>}</section>
      <section><header><div><small>ARCHIVE</small><h3>历史赛季</h3></div><b>{history.length}</b></header>{history.map((season) => <article className={styles.seasonRow} key={season.id}><span><Trophy size={18} /></span><div><strong>{season.name}</strong><small>{season.code} · {formatDate(season.closedAt ?? season.endsAt)}</small><p>{season.counts.matches} 场排位 · {season.counts.standings} 条榜单记录</p></div><em>已封存</em></article>)}{!history.length && <p className={styles.seasonEmpty}>首个赛季封存后会保存在这里。</p>}</section>
    </div>

    {editor && <div className={styles.seasonModalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}><form aria-modal="true" className={styles.seasonModal} onSubmit={saveSeason} role="dialog"><header><div><small>SEASON SETUP</small><h2>{editor.id ? "编辑排位赛季" : "创建排位赛季"}</h2></div><button aria-label="关闭" onClick={() => setEditor(null)} type="button"><X size={18} /></button></header><label>赛季名称<input autoFocus maxLength={30} minLength={2} onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="例如：星海盛夏季" required value={editor.name} /></label><label>赛季说明<textarea maxLength={180} onChange={(event) => setEditor({ ...editor, summary: event.target.value })} placeholder="展示给玩家的简短说明" rows={3} value={editor.summary} /></label><div className={styles.seasonDateFields}><label>开始时间<input disabled={Boolean(editor.id && data?.seasons.find((item) => item.id === editor.id)?.status !== "draft")} onChange={(event) => setEditor({ ...editor, startsAt: event.target.value })} required type="datetime-local" value={editor.startsAt} /></label><label>结束时间<input disabled={Boolean(editor.id && data?.seasons.find((item) => item.id === editor.id)?.status === "closing")} onChange={(event) => setEditor({ ...editor, endsAt: event.target.value })} required type="datetime-local" value={editor.endsAt} /></label></div><fieldset><legend>开放棋类</legend><label><input checked={editor.goEnabled} onChange={(event) => setEditor({ ...editor, goEnabled: event.target.checked })} type="checkbox" />围棋</label><label><input checked={editor.gomokuEnabled} onChange={(event) => setEditor({ ...editor, gomokuEnabled: event.target.checked })} type="checkbox" />五子棋</label></fieldset><label>新赛季积分继承<select disabled={Boolean(editor.id && data?.seasons.find((item) => item.id === editor.id)?.status !== "draft")} onChange={(event) => setEditor({ ...editor, carryPercent: Number(event.target.value) })} value={editor.carryPercent}><option value={0}>0% · 全部从尘星开始</option><option value={25}>25% · 大幅回落</option><option value={50}>50% · 平衡软重置</option><option value={75}>75% · 小幅回落</option><option value={100}>100% · 完整继承</option></select><small>只继承积分；胜负、场次、连胜和赛季最高分都会重新计算。</small></label><footer><button onClick={() => setEditor(null)} type="button">取消</button><button disabled={busy === "save" || !editor.name.trim()} type="submit">{busy === "save" ? <LoaderCircle className={styles.spin} size={15} /> : <Check size={15} />}保存赛季</button></footer></form></div>}

    {confirming && <div className={styles.seasonModalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirming(null); }}><form aria-modal="true" className={styles.seasonConfirm} onSubmit={submitAction} role="dialog"><span className={confirming.danger ? styles.danger : ""}><ShieldAlert size={22} /></span><h2>{confirming.title}</h2><strong>{confirming.season.name}</strong><p>{confirming.detail}</p><label>操作原因<textarea autoFocus maxLength={240} onChange={(event) => setReason(event.target.value)} placeholder="原因会永久写入后台审计记录" required rows={3} value={reason} /></label><footer><button onClick={() => setConfirming(null)} type="button">取消</button><button className={confirming.danger ? styles.dangerButton : ""} disabled={!reason.trim() || Boolean(busy)} type="submit">{confirming.label}</button></footer></form></div>}
  </section>;
}
