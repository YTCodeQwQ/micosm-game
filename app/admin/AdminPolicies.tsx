"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Check, Clock3, FilePlus2, LoaderCircle, RotateCcw, Send, ShieldCheck } from "lucide-react";
import styles from "./admin.module.css";

type PolicyKind = "user_agreement" | "privacy" | "community_rules" | "report_appeal";
type Policy = { id: string; kind: PolicyKind; label: string; version: number; title: string; summary: string; body: string; status: string; material: boolean; publisherName: string | null; publishedAt: number | null; createdAt: number; updatedAt: number };
type Draft = { id: string; kind: PolicyKind; title: string; summary: string; body: string; material: boolean; reason: string };
const emptyDraft: Draft = { id: "", kind: "user_agreement", title: "", summary: "", body: "", material: false, reason: "" };
const labels: Record<PolicyKind, string> = { user_agreement: "用户协议", privacy: "隐私政策", community_rules: "社区规则", report_appeal: "举报与申诉" };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `请求失败（${response.status}）`);
  return data;
}

export function AdminPolicies({ canWrite, onError, onNotice, revision = 0 }: { canWrite: boolean; onError: (message: string) => void; onNotice: (message: string) => void; revision?: number }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState("");
  const published = useMemo(() => policies.filter((item) => item.status === "published").length, [policies]);
  const load = useCallback(async () => {
    setBusy("load");
    try { setPolicies((await requestJson<{ policies: Policy[] }>("/api/admin/policies")).policies); }
    catch (caught) { onError(caught instanceof Error ? caught.message : "读取规则失败"); }
    finally { setBusy(""); }
  }, [onError]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, revision]);

  function edit(item: Policy) {
    if (item.status === "draft") setDraft({ id: item.id, kind: item.kind, title: item.title, summary: item.summary, body: item.body, material: item.material, reason: "继续编辑草稿" });
    else setDraft({ id: "", kind: item.kind, title: item.title, summary: item.summary, body: item.body, material: item.material, reason: `基于 v${item.version} 创建新版本` });
  }
  async function mutate(payload: Record<string, unknown>, success: string) {
    setBusy(String(payload.action));
    try { await requestJson("/api/admin/policies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); onNotice(success); setDraft(emptyDraft); await load(); }
    catch (caught) { onError(caught instanceof Error ? caught.message : "规则操作失败"); }
    finally { setBusy(""); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void mutate({ action: "save", ...draft }, draft.id ? "规则草稿已保存" : "新版本草稿已创建");
  }

  return <section className={`${styles.pageSection} ${styles.policyWorkspace}`}>
    <div className={styles.policySummary}><span><BookOpenCheck size={23} /></span><div><small>POLICY CENTER</small><strong>协议与规则版本库</strong><p>发布后立即展示给玩家；重要版本会要求玩家留下确认记录。</p></div><b>{published} 类正在生效</b></div>
    <div className={styles.policyLayout}>
      <form className={styles.policyEditor} onSubmit={submit}><header><div><small>{draft.id ? "EDIT DRAFT" : "NEW VERSION"}</small><h2>{draft.id ? "编辑规则草稿" : "创建规则版本"}</h2></div>{draft.id && <button aria-label="新建版本" onClick={() => setDraft(emptyDraft)} title="新建版本" type="button"><FilePlus2 size={17} /></button>}</header><label>规则类型<select disabled={Boolean(draft.id)} onChange={(event) => setDraft((value) => ({ ...value, kind: event.target.value as PolicyKind }))} value={draft.kind}>{Object.entries(labels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label><label>标题<input maxLength={100} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} placeholder="例如：Micosm Game 用户协议" required value={draft.title} /></label><label>摘要<input maxLength={240} onChange={(event) => setDraft((value) => ({ ...value, summary: event.target.value }))} placeholder="告诉玩家本次版本主要说明什么" value={draft.summary} /></label><label>正文<textarea maxLength={20000} minLength={20} onChange={(event) => setDraft((value) => ({ ...value, body: event.target.value }))} placeholder="使用清晰、可阅读的分段文本" required rows={13} value={draft.body} /></label><label className={styles.policyMaterial}><input checked={draft.material} onChange={(event) => setDraft((value) => ({ ...value, material: event.target.checked }))} type="checkbox" /><span><strong>重要版本</strong><small>发布后要求登录用户确认</small></span></label><label>操作说明<input maxLength={240} onChange={(event) => setDraft((value) => ({ ...value, reason: event.target.value }))} placeholder="写入永久审计记录" required value={draft.reason} /></label><button className={styles.policySave} disabled={!canWrite || Boolean(busy) || draft.title.trim().length < 4 || draft.body.trim().length < 20 || !draft.reason.trim()} type="submit">{busy === "save" ? <LoaderCircle className={styles.spin} size={17} /> : <ShieldCheck size={17} />}{draft.id ? "保存草稿" : "创建草稿"}</button></form>
      <section className={styles.policyArchive}><header><div><small>VERSION ARCHIVE</small><h2>全部版本</h2></div><span>{policies.length} 个版本</span></header><div className={styles.policyList}>{policies.map((item) => <article className={`${styles.policyCard} ${styles[`policy_${item.status}`]}`} key={item.id}><header><div><span>{item.label}</span><b>v{item.version}</b>{item.material && <em>重要</em>}</div><time><Clock3 size={12} />{new Date(item.updatedAt).toLocaleString("zh-CN", { hour12: false })}</time></header><h3>{item.title}</h3><p>{item.summary || item.body.slice(0, 100)}</p><footer><b>{item.status === "published" ? <><Check size={14} />正在生效</> : item.status === "draft" ? "草稿" : "已撤回"}</b><button onClick={() => edit(item)} type="button">{item.status === "draft" ? "编辑" : "创建新版"}</button>{canWrite && item.status === "draft" && <button className={styles.policyPublish} disabled={Boolean(busy)} onClick={() => void mutate({ action: "publish", id: item.id, reason: `发布 ${item.label} v${item.version}` }, "规则版本已发布")} type="button"><Send size={14} />发布</button>}{canWrite && item.status === "published" && <button className={styles.policyWithdraw} disabled={Boolean(busy)} onClick={() => void mutate({ action: "withdraw", id: item.id, reason: `撤回 ${item.label} v${item.version}` }, "规则版本已撤回")} type="button"><RotateCcw size={14} />撤回</button>}</footer></article>)}{!policies.length && <div className={styles.announcementEmpty}><BookOpenCheck size={24} /><strong>还没有规则版本</strong></div>}</div></section>
    </div>
  </section>;
}
