"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, Database, Gamepad2, LoaderCircle, MessageCircle, Power, Server, ShieldCheck, Users, X } from "lucide-react";
import styles from "./admin.module.css";

type Flag = { key: string; label: string; description: string; category: "platform" | "games" | "community" | "ai"; enabled: boolean; risk: "normal" | "high"; updatedBy: string | null; reason: string; updatedAt: number };
type Health = { database: string; databaseLatencyMs: number; schemaVersion: number; liveRooms: number; matchmakingQueue: number; rankedQueue: number; activeUsers: number; recentErrors: number };
type Payload = { generatedAt: number; health: Health; flags: Flag[] };
type Pending = { flag: Flag; enabled: boolean };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `请求失败（${response.status}）`);
  return data;
}

const categoryLabels = { platform: "平台", games: "对局", community: "社区", ai: "AI" } as const;
const categoryIcons = { platform: <Server size={19} />, games: <Gamepad2 size={19} />, community: <MessageCircle size={19} />, ai: <Bot size={19} /> };

export function AdminOperations({ canWrite, onError, onNotice, revision = 0 }: { canWrite: boolean; onError: (message: string) => void; onNotice: (message: string) => void; revision?: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    setBusy("load");
    try { setData(await requestJson<Payload>("/api/admin/operations")); }
    catch (caught) { onError(caught instanceof Error ? caught.message : "读取运行状态失败"); }
    finally { setBusy(""); }
  }, [onError]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, revision]);
  const grouped = useMemo(() => Object.fromEntries((["platform", "games", "community", "ai"] as const).map((category) => [category, data?.flags.filter((flag) => flag.category === category) ?? []])), [data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending || reason.trim().length < 4) return;
    setBusy(pending.flag.key);
    try {
      const result = await requestJson<{ flags: Flag[] }>("/api/admin/operations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: pending.flag.key, enabled: pending.enabled, reason: reason.trim() }) });
      setData((current) => current ? { ...current, flags: result.flags, generatedAt: Date.now() } : current);
      onNotice(`${pending.flag.label}已${pending.enabled ? "开启" : "关闭"}`);
      setPending(null); setReason("");
    } catch (caught) { onError(caught instanceof Error ? caught.message : "功能开关更新失败"); }
    finally { setBusy(""); }
  }

  if (!data) return <section className={`${styles.pageSection} ${styles.operationsLoading}`}><LoaderCircle className={styles.spin} size={25} />正在读取运行状态</section>;
  const cards = [
    { label: "数据库", value: `${data.health.databaseLatencyMs} ms`, detail: `迁移版本 v${data.health.schemaVersion}`, icon: <Database size={21} />, good: data.health.database === "healthy" },
    { label: "活跃玩家", value: data.health.activeUsers, detail: "最近 5 分钟", icon: <Users size={21} />, good: true },
    { label: "实时棋局", value: data.health.liveRooms, detail: `${data.health.matchmakingQueue} 匹配 · ${data.health.rankedQueue} 排位`, icon: <Gamepad2 size={21} />, good: true },
    { label: "近期错误", value: data.health.recentErrors, detail: "最近 1 小时", icon: <Activity size={21} />, good: data.health.recentErrors === 0 },
  ];
  return <section className={`${styles.pageSection} ${styles.operationsWorkspace}`}>
    <div className={styles.operationsHero}><span><Power size={24} /></span><div><small>OPERATIONS CONTROL</small><strong>运行控制台</strong><p>所有开关立即生效并写入审计；密钥、数据库恢复和服务器重启仍由部署流程管理。</p></div><b><span />运行中</b></div>
    <div className={styles.operationsHealth}>{cards.map((card) => <article key={card.label}><span className={card.good ? styles.operationGood : styles.operationWarn}>{card.icon}</span><div><small>{card.label}</small><strong>{card.value}</strong><p>{card.detail}</p></div></article>)}</div>
    <div className={styles.operationsGroups}>{(["platform", "games", "community", "ai"] as const).map((category) => <section key={category}><header><span>{categoryIcons[category]}</span><div><small>{category.toUpperCase()}</small><h2>{categoryLabels[category]}开关</h2></div></header><div>{grouped[category].map((flag) => <article className={!flag.enabled ? styles.flagOff : ""} key={flag.key}><div><strong>{flag.label}{flag.risk === "high" && <em>高影响</em>}</strong><p>{flag.description}</p><small>{flag.updatedAt ? `${new Date(flag.updatedAt).toLocaleString("zh-CN", { hour12: false })} · ${flag.reason}` : "系统默认值"}</small></div><button aria-checked={flag.enabled} aria-label={`${flag.enabled ? "关闭" : "开启"}${flag.label}`} className={flag.enabled ? styles.flagEnabled : ""} disabled={!canWrite || Boolean(busy)} onClick={() => { setReason(""); setPending({ flag, enabled: !flag.enabled }); }} role="switch" type="button"><i /></button></article>)}</div></section>)}</div>
    {pending && <div className={styles.operationsModalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPending(null); }}><form className={styles.operationsModal} onSubmit={submit}><header><span>{pending.flag.risk === "high" ? <AlertTriangle size={21} /> : <ShieldCheck size={21} />}</span><div><small>FEATURE FLAG</small><h2>{pending.enabled ? "开启" : "关闭"}{pending.flag.label}</h2></div><button aria-label="关闭" onClick={() => setPending(null)} type="button"><X size={17} /></button></header><p>{pending.flag.description}</p><label>操作原因<textarea autoFocus maxLength={240} minLength={4} onChange={(event) => setReason(event.target.value)} placeholder="至少 4 个字，会永久写入审计记录" required rows={3} value={reason} /></label><footer><button onClick={() => setPending(null)} type="button">取消</button><button className={pending.flag.risk === "high" ? styles.operationDanger : ""} disabled={reason.trim().length < 4 || Boolean(busy)} type="submit">确认{pending.enabled ? "开启" : "关闭"}</button></footer></form></div>}
  </section>;
}
