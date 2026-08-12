"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Check, ChevronRight, LoaderCircle, ShieldCheck, X } from "lucide-react";

type Policy = { id: string; kind: string; label: string; version: number; title: string; summary: string; body: string; material: boolean; publishedAt: number | null; acceptedAt: number | null };

export function PolicyCenter({ open, onClose, onToast }: { open: boolean; onClose: () => void; onToast: (message: string) => void }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState("load");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/policies", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json() as { policies?: Policy[]; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "规则中心暂时不可用");
      setError("");
      setPolicies(data.policies ?? []); setActiveId((current) => current && data.policies?.some((item) => item.id === current) ? current : data.policies?.[0]?.id ?? "");
    }).catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "规则中心暂时不可用"); }).finally(() => { if (!controller.signal.aborted) setBusy(""); });
    return () => controller.abort();
  }, [open]);
  const active = useMemo(() => policies.find((item) => item.id === activeId) ?? policies[0], [activeId, policies]);

  async function accept() {
    if (!active) return;
    setBusy(active.id); setError("");
    try {
      const response = await fetch("/api/policies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId: active.id }) });
      const data = await response.json() as { acceptedAt?: number; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "确认失败");
      setPolicies((items) => items.map((item) => item.id === active.id ? { ...item, acceptedAt: data.acceptedAt ?? Date.now() } : item));
      onToast("已记录你的规则确认");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "确认失败"); }
    finally { setBusy(""); }
  }

  if (!open) return null;
  return <div className="policy-center-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-labelledby="policy-center-title" aria-modal="true" className="policy-center" role="dialog"><header><span><BookOpenCheck size={22} /></span><div><small>POLICY CENTER</small><h2 id="policy-center-title">协议与规则</h2></div><button aria-label="关闭规则中心" onClick={onClose} type="button"><X size={18} /></button></header>{busy === "load" ? <div className="policy-center-loading"><LoaderCircle className="spin" size={24} />正在读取当前版本</div> : error && !policies.length ? <div className="policy-center-loading"><ShieldCheck size={24} />{error}</div> : <div className="policy-center-layout"><nav aria-label="规则目录">{policies.map((item) => <button className={item.id === active?.id ? "active" : ""} key={item.id} onClick={() => { setActiveId(item.id); setError(""); }} type="button"><span><strong>{item.label}</strong><small>版本 {item.version}{item.material ? " · 重要更新" : ""}</small></span>{item.acceptedAt ? <Check size={17} /> : <ChevronRight size={17} />}</button>)}</nav>{active && <article><header><div><small>{active.label.toUpperCase()} · V{active.version}</small><h3>{active.title}</h3><p>{active.summary}</p></div>{active.acceptedAt && <span><Check size={14} />已确认</span>}</header><div className="policy-center-body">{active.body.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{error && <div className="policy-center-error">{error}</div>}<footer><small>发布于 {active.publishedAt ? new Date(active.publishedAt).toLocaleDateString("zh-CN") : "测试阶段"}</small>{!active.acceptedAt && <button disabled={busy === active.id} onClick={() => void accept()} type="button">{busy === active.id ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}我已阅读并确认</button>}</footer></article>}</div>}</section></div>;
}
