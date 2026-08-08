"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, LoaderCircle, MessageSquareWarning, ShieldAlert, TimerReset, Trash2, VolumeX, X } from "lucide-react";

type Report = {
  id: string;
  messageId: string;
  message: string;
  createdAt: number;
  status: string;
  targetUserId: string | null;
  senderName: string;
  reporterName: string;
  deleted: boolean;
};

type Sanction = {
  userId: string;
  publicId: string;
  displayName: string;
  mutedUntil: number | null;
  bannedUntil: number | null;
  reason: string;
};

type ModerationData = { reports: Report[]; sanctions: Sanction[] };

export function ModerationPanel({ onClose, onNotice }: { onClose: () => void; onNotice: (message: string) => void }) {
  const [data, setData] = useState<ModerationData>({ reports: [], sanctions: [] });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"reports" | "sanctions">("reports");
  const [openedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/admin/moderation", { cache: "no-store" });
      const result = await response.json() as ModerationData & { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "读取举报失败");
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取举报失败");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(action: string, values: Record<string, unknown>, success: string) {
    const actionKey = `${action}:${values.reportId ?? values.targetUserId ?? "all"}`;
    setBusy(actionKey);
    try {
      const response = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...values }),
      });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "管理操作失败");
      onNotice(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "管理操作失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="moderation-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }} role="presentation">
      <section aria-labelledby="moderation-title" aria-modal="true" className="moderation-panel" role="dialog">
        <header>
          <div><span>SAFETY CENTER</span><h2 id="moderation-title">频道管理</h2><p>处理举报与账号限制</p></div>
          <button aria-label="关闭频道管理" onClick={onClose} type="button"><X size={19} /></button>
        </header>
        <nav aria-label="管理分类">
          <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")} type="button"><MessageSquareWarning size={16} />待处理 <b>{data.reports.filter((report) => report.status === "open").length}</b></button>
          <button className={tab === "sanctions" ? "active" : ""} onClick={() => setTab("sanctions")} type="button"><ShieldAlert size={16} />限制中 <b>{data.sanctions.length}</b></button>
        </nav>
        {error && <div className="moderation-error"><ShieldAlert size={16} />{error}<button onClick={() => void load()} type="button">重试</button></div>}
        <div className="moderation-list">
          {tab === "reports" && data.reports.filter((report) => report.status === "open").map((report) => (
            <article className="moderation-report" key={report.id}>
              <header><strong>{report.senderName}</strong><time>{new Date(report.createdAt).toLocaleString("zh-CN", { hour12: false })}</time></header>
              <blockquote>{report.deleted ? "该消息已删除" : report.message}</blockquote>
              <p>由 {report.reporterName} 举报</p>
              <footer>
                <button disabled={Boolean(busy)} onClick={() => void act("dismiss", { reportId: report.id }, "已忽略这条举报")} type="button"><Check size={15} />忽略</button>
                <button disabled={Boolean(busy) || report.deleted} onClick={() => void act("delete_message", { reportId: report.id }, "消息已删除")} type="button"><Trash2 size={15} />删除</button>
                <button disabled={Boolean(busy) || !report.targetUserId} onClick={() => void act("mute", { reportId: report.id, targetUserId: report.targetUserId, durationMinutes: 10 }, "已禁言 10 分钟")} type="button"><VolumeX size={15} />禁言</button>
                <button className="danger" disabled={Boolean(busy) || !report.targetUserId} onClick={() => void act("ban", { reportId: report.id, targetUserId: report.targetUserId, durationMinutes: 1440 }, "账号已暂停 24 小时")} type="button"><Ban size={15} />封禁</button>
              </footer>
            </article>
          ))}
          {tab === "reports" && !data.reports.some((report) => report.status === "open") && <div className="moderation-empty"><Check size={22} /><strong>频道很干净</strong><p>当前没有待处理举报。</p></div>}
          {tab === "sanctions" && data.sanctions.map((sanction) => (
            <article className="moderation-sanction" key={sanction.userId}>
              <div><strong>{sanction.displayName}</strong><small>{sanction.publicId}</small><p>{sanction.reason || "未填写原因"}</p></div>
              <footer>
                {sanction.mutedUntil && sanction.mutedUntil > openedAt && <button disabled={Boolean(busy)} onClick={() => void act("unmute", { targetUserId: sanction.userId }, "已解除禁言")} type="button"><TimerReset size={15} />解除禁言</button>}
                {sanction.bannedUntil && sanction.bannedUntil > openedAt && <button disabled={Boolean(busy)} onClick={() => void act("unban", { targetUserId: sanction.userId }, "已解除封禁")} type="button"><Check size={15} />解除封禁</button>}
              </footer>
            </article>
          ))}
          {tab === "sanctions" && data.sanctions.length === 0 && <div className="moderation-empty"><ShieldAlert size={22} /><strong>没有受限账号</strong><p>所有玩家当前均可正常交流。</p></div>}
        </div>
        {busy && <div className="moderation-busy" aria-live="polite"><LoaderCircle className="spin" size={17} />正在处理</div>}
      </section>
    </div>
  );
}
