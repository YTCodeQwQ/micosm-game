"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  CalendarRange, Check, Clipboard, Copy, FlaskConical, LoaderCircle, MessageSquareWarning,
  Power, RefreshCw, Send, TicketCheck, X,
} from "lucide-react";
import styles from "./admin.module.css";

type BetaInvite = { id: string; code: string; label: string; maxUses: number; uses: number; enabled: boolean; expiresAt: number | null; createdAt: number; updatedAt: number };
type BetaFeedback = {
  id: string; category: string; categoryLabel: string; title: string; body: string; pageContext: string; status: string;
  adminNote: string; reviewedAt: number | null; createdAt: number; updatedAt: number;
  user: { displayName: string; publicId: string; avatarUrl: string | null };
};
type BetaSeason = { id: string; code: string; name: string; summary: string; status: string; startsAt: number; endsAt: number; goEnabled: boolean; gomokuEnabled: boolean };
type BetaDashboard = {
  generatedAt: number;
  settings: { betaMode: boolean; feedbackEnabled: boolean; programName: string; notice: string; updatedAt: number };
  season: BetaSeason | null;
  invites: BetaInvite[];
  feedback: BetaFeedback[];
};

const STATUS_LABELS: Record<string, string> = { open: "待处理", reviewing: "处理中", resolved: "已解决", closed: "已关闭" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `请求失败（${response.status}）`);
  return data;
}

function formatTime(value: number | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "长期有效";
}

export function AdminBetaCenter({ onError, onNotice, onOpenSeasons, revision = 0 }: { onError: (message: string) => void; onNotice: (message: string) => void; onOpenSeasons: () => void; revision?: number }) {
  const [data, setData] = useState<BetaDashboard | null>(null);
  const [busy, setBusy] = useState("");
  const [programName, setProgramName] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [inviteLabel, setInviteLabel] = useState("测试玩家");
  const [inviteLimit, setInviteLimit] = useState(10);
  const [inviteDays, setInviteDays] = useState(30);
  const [feedbackFilter, setFeedbackFilter] = useState("active");
  const [selected, setSelected] = useState<BetaFeedback | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState("reviewing");
  const [feedbackNote, setFeedbackNote] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const next = await requestJson<BetaDashboard>("/api/admin/beta");
      setData(next);
      setProgramName(next.settings.programName);
      setNotice(next.settings.notice);
    } catch (error) {
      onError(error instanceof Error ? error.message : "读取内测中心失败");
    } finally {
      setBusy("");
    }
  }, [onError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, revision]);

  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(String(payload.action ?? "write"));
    try {
      const next = await requestJson<BetaDashboard & { ok: boolean }>("/api/admin/beta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      setData(next);
      setProgramName(next.settings.programName);
      setNotice(next.settings.notice);
      onNotice(success);
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "内测管理操作失败");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function saveProgram(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return onError("请填写本次调整原因");
    if (await mutate({ action: "update_program", programName, notice, reason }, "内测说明已更新")) setReason("");
  }

  async function createInvite(event: FormEvent) {
    event.preventDefault();
    const expiresAt = inviteDays > 0 ? Date.now() + inviteDays * 24 * 60 * 60 * 1000 : null;
    if (await mutate({ action: "create_invite", label: inviteLabel, maxUses: inviteLimit, expiresAt, reason: `创建“${inviteLabel}”内测邀请码` }, "新邀请码已生成")) setInviteLabel("测试玩家");
  }

  const visibleFeedback = useMemo(() => (data?.feedback ?? []).filter((item) => feedbackFilter === "all" || (feedbackFilter === "active" ? ["open", "reviewing"].includes(item.status) : item.status === feedbackFilter)), [data?.feedback, feedbackFilter]);
  const activeFeedback = data?.feedback.filter((item) => ["open", "reviewing"].includes(item.status)).length ?? 0;

  if (!data) return <div className={styles.betaLoading}><LoaderCircle className={styles.spin} size={24} />正在读取内测配置</div>;

  return <section className={styles.betaWorkspace}>
    <header className={styles.betaHero}>
      <span><FlaskConical size={25} /></span>
      <div><small>BETA CONTROL</small><h2>{data.settings.programName}</h2><p>控制内测标识、邀请名额、当前赛季与玩家反馈。</p></div>
      <button aria-label="刷新内测中心" disabled={Boolean(busy)} onClick={() => void load()} title="刷新" type="button"><RefreshCw className={busy === "load" ? styles.spin : ""} size={18} /></button>
    </header>

    <div className={styles.betaMetrics}>
      <article><span className={data.settings.betaMode ? styles.betaMetricOn : styles.betaMetricOff}><Power size={19} /></span><div><small>环境状态</small><strong>{data.settings.betaMode ? "内测开启" : "正式显示"}</strong></div><button aria-pressed={data.settings.betaMode} className={data.settings.betaMode ? styles.flagEnabled : ""} disabled={Boolean(busy)} onClick={() => void mutate({ action: "set_flag", key: "beta_mode", enabled: !data.settings.betaMode, reason: "超级管理员切换内测环境显示" }, data.settings.betaMode ? "内测标识已关闭" : "内测标识已开启")} type="button"><i /></button></article>
      <article><span className={data.settings.feedbackEnabled ? styles.betaMetricOn : styles.betaMetricOff}><MessageSquareWarning size={19} /></span><div><small>反馈入口</small><strong>{data.settings.feedbackEnabled ? "接受反馈" : "暂停提交"}</strong></div><button aria-pressed={data.settings.feedbackEnabled} className={data.settings.feedbackEnabled ? styles.flagEnabled : ""} disabled={Boolean(busy)} onClick={() => void mutate({ action: "set_flag", key: "feedback_enabled", enabled: !data.settings.feedbackEnabled, reason: "超级管理员切换内测反馈入口" }, data.settings.feedbackEnabled ? "反馈入口已暂停" : "反馈入口已开放")} type="button"><i /></button></article>
      <article><span><TicketCheck size={19} /></span><div><small>可用邀请码</small><strong>{data.invites.filter((item) => item.enabled && (!item.expiresAt || item.expiresAt > data.generatedAt) && (!item.maxUses || item.uses < item.maxUses)).length}</strong></div></article>
      <article><span><Clipboard size={19} /></span><div><small>待跟进反馈</small><strong>{activeFeedback}</strong></div></article>
    </div>

    <div className={styles.betaGrid}>
      <div>
        <form className={styles.betaPanel} onSubmit={saveProgram}>
          <header><span><FlaskConical size={19} /></span><div><small>环境信息</small><h3>玩家端内测说明</h3></div></header>
          <label><span>内测计划名称</span><input maxLength={40} onChange={(event) => setProgramName(event.target.value)} value={programName} /></label>
          <label><span>数据与测试说明</span><textarea maxLength={180} onChange={(event) => setNotice(event.target.value)} rows={3} value={notice} /></label>
          <label><span>调整原因</span><input maxLength={120} onChange={(event) => setReason(event.target.value)} placeholder="将写入操作审计" value={reason} /></label>
          <button disabled={Boolean(busy) || !reason.trim()} type="submit"><Check size={16} />保存内测说明</button>
        </form>

        <section className={styles.betaPanel}>
          <header><span><CalendarRange size={19} /></span><div><small>当前排位赛季</small><h3>{data.season?.name ?? "暂无进行中的赛季"}</h3></div></header>
          {data.season ? <div className={styles.betaSeason}>
            <div><b>{data.season.code}</b><span>{data.season.status === "active" ? "进行中" : "收尾中"}</span></div>
            <p>{data.season.summary || "暂无赛季说明"}</p>
            <small>{formatTime(data.season.startsAt)} 至 {formatTime(data.season.endsAt)} · {data.season.goEnabled ? "围棋" : ""}{data.season.goEnabled && data.season.gomokuEnabled ? " / " : ""}{data.season.gomokuEnabled ? "五子棋" : ""}</small>
          </div> : <p className={styles.betaEmptyText}>请先建立并激活一个内测排位赛季。</p>}
          <button className={styles.betaSecondary} onClick={onOpenSeasons} type="button"><CalendarRange size={16} />进入赛季管理</button>
        </section>
      </div>

      <section className={styles.betaPanel}>
        <header><span><TicketCheck size={19} /></span><div><small>注册准入</small><h3>邀请码管理</h3></div></header>
        <form className={styles.inviteCreator} onSubmit={createInvite}>
          <label><span>用途备注</span><input maxLength={30} onChange={(event) => setInviteLabel(event.target.value)} value={inviteLabel} /></label>
          <label><span>最多使用</span><input max={10000} min={0} onChange={(event) => setInviteLimit(Number(event.target.value))} type="number" value={inviteLimit} /><small>0 为不限次数</small></label>
          <label><span>有效天数</span><input max={365} min={0} onChange={(event) => setInviteDays(Number(event.target.value))} type="number" value={inviteDays} /><small>0 为长期有效</small></label>
          <button disabled={Boolean(busy) || inviteLabel.trim().length < 2} type="submit"><TicketCheck size={16} />生成邀请码</button>
        </form>
        <div className={styles.inviteList}>{data.invites.map((invite) => {
          const exhausted = Boolean(invite.maxUses && invite.uses >= invite.maxUses);
          const expired = Boolean(invite.expiresAt && invite.expiresAt <= data.generatedAt);
          return <article className={!invite.enabled || exhausted || expired ? styles.inviteInactive : ""} key={invite.id}>
            <div><code>{invite.code}</code><button aria-label={`复制邀请码 ${invite.code}`} onClick={() => void navigator.clipboard.writeText(invite.code).then(() => onNotice("邀请码已复制"))} title="复制邀请码" type="button"><Copy size={14} /></button></div>
            <strong>{invite.label}</strong>
            <small>{invite.uses} / {invite.maxUses || "不限"} 次 · {expired ? "已过期" : formatTime(invite.expiresAt)}</small>
            <button aria-pressed={invite.enabled} className={invite.enabled ? styles.flagEnabled : ""} disabled={Boolean(busy)} onClick={() => void mutate({ action: "update_invite", inviteId: invite.id, enabled: !invite.enabled, reason: `${invite.enabled ? "停用" : "启用"}邀请码 ${invite.code}` }, invite.enabled ? "邀请码已停用" : "邀请码已启用")} type="button"><i /></button>
          </article>;
        })}</div>
      </section>
    </div>

    <section className={styles.betaFeedbackPanel}>
      <header><div><small>PLAYER FEEDBACK</small><h3>内测反馈</h3></div><nav>{[['active','待跟进'],['open','新反馈'],['reviewing','处理中'],['resolved','已解决'],['all','全部']].map(([key,label]) => <button className={feedbackFilter === key ? styles.active : ""} key={key} onClick={() => setFeedbackFilter(key)} type="button">{label}</button>)}</nav></header>
      <div className={styles.betaFeedbackList}>{visibleFeedback.map((item) => <button key={item.id} onClick={() => { setSelected(item); setFeedbackStatus(item.status === "open" ? "reviewing" : item.status); setFeedbackNote(item.adminNote); }} type="button">
        <span>{item.user.avatarUrl ? <Image alt="" height={38} src={item.user.avatarUrl} unoptimized width={38} /> : item.user.displayName.slice(0, 1).toUpperCase()}</span>
        <div><header><strong>{item.title}</strong><b className={styles[`feedback_${item.status}`]}>{STATUS_LABELS[item.status] ?? item.status}</b></header><p>{item.body}</p><small>{item.user.displayName} · {item.user.publicId} · {item.categoryLabel} · {formatTime(item.createdAt)}</small></div>
      </button>)}{!visibleFeedback.length && <div className={styles.betaEmpty}><MessageSquareWarning size={24} /><strong>这里暂时没有反馈</strong><p>玩家提交后会按待处理优先显示。</p></div>}</div>
    </section>

    {selected && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}><form className={styles.betaFeedbackModal} onSubmit={(event) => { event.preventDefault(); void mutate({ action: "update_feedback", feedbackId: selected.id, status: feedbackStatus, adminNote: feedbackNote, reason: `处理玩家反馈：${selected.title}` }, "反馈状态已更新").then((ok) => { if (ok) setSelected(null); }); }}>
      <header><div><small>{selected.categoryLabel} · {selected.user.publicId}</small><h2>{selected.title}</h2></div><button aria-label="关闭" onClick={() => setSelected(null)} type="button"><X size={17} /></button></header>
      <blockquote>{selected.body}</blockquote>
      {selected.pageContext && <p>页面位置：{selected.pageContext}</p>}
      <label><span>处理状态</span><select onChange={(event) => setFeedbackStatus(event.target.value)} value={feedbackStatus}><option value="open">待处理</option><option value="reviewing">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select></label>
      <label><span>回复玩家</span><textarea maxLength={500} onChange={(event) => setFeedbackNote(event.target.value)} placeholder="处理进展会通过通知发送给玩家" rows={4} value={feedbackNote} /></label>
      <footer><button onClick={() => setSelected(null)} type="button">取消</button><button disabled={Boolean(busy)} type="submit"><Send size={15} />保存并通知</button></footer>
    </form></div>}
  </section>;
}
