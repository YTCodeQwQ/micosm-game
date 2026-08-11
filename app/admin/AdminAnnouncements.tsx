"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, FileText, LoaderCircle, Megaphone, Pencil, Send, X } from "lucide-react";
import styles from "./admin.module.css";

type Announcement = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: "update" | "maintenance" | "event" | "rules" | "community";
  priority: "normal" | "important" | "critical";
  status: "draft" | "published" | "withdrawn";
  publishedAt: number;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type Draft = Pick<Announcement, "title" | "summary" | "body" | "category" | "priority"> & {
  status: "draft" | "published";
  reason: string;
};

const emptyDraft: Draft = {
  title: "",
  summary: "",
  body: "",
  category: "community",
  priority: "normal",
  status: "published",
  reason: "",
};

const categoryLabels: Record<Announcement["category"], string> = {
  update: "版本更新",
  maintenance: "维护通知",
  event: "活动公告",
  rules: "规则调整",
  community: "社区公告",
};

const statusLabels: Record<Announcement["status"], string> = {
  draft: "草稿",
  published: "已发布",
  withdrawn: "已撤回",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `请求失败（${response.status}）`);
  return data;
}

function formatTime(value: number) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function AdminAnnouncements({ onError, onNotice, revision }: {
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  revision: number;
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const data = await requestJson<{ announcements: Announcement[] }>("/api/admin/announcements");
      setAnnouncements(data.announcements);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "读取公告失败");
    } finally {
      setBusy("");
    }
  }, [onError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, revision]);

  const activeCount = useMemo(() => announcements.filter((item) => item.status === "published").length, [announcements]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetEditor() {
    setDraft(emptyDraft);
    setEditingId(null);
  }

  function edit(item: Announcement) {
    setEditingId(item.id);
    setDraft({
      title: item.title,
      summary: item.summary,
      body: item.body,
      category: item.category,
      priority: item.priority,
      status: item.status === "draft" ? "draft" : "published",
      reason: "更新公告内容",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    try {
      await requestJson("/api/admin/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: editingId ? "update" : "create",
          id: editingId,
          ...draft,
          reason: draft.reason.trim() || (editingId ? "更新公告" : "发布公告"),
        }),
      });
      onNotice(editingId ? "公告已更新" : draft.status === "draft" ? "草稿已保存" : "公告已发布");
      resetEditor();
      await load();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "保存公告失败");
    } finally {
      setBusy("");
    }
  }

  async function withdraw(id: string) {
    setBusy(`withdraw:${id}`);
    try {
      await requestJson("/api/admin/announcements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "withdraw", id, reason: "从社区公告区撤回" }),
      });
      setConfirmWithdrawId(null);
      onNotice("公告已撤回");
      await load();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "撤回公告失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={`${styles.pageSection} ${styles.announcementWorkspace}`}>
      <div className={styles.announcementSummary}>
        <span><Megaphone size={20} /></span>
        <div><strong>社区公告中枢</strong><p>公告会同步到社区与游戏大厅，重要内容会获得更醒目的展示。</p></div>
        <b>{activeCount} 条生效中</b>
      </div>

      <div className={styles.announcementLayout}>
        <form className={styles.announcementEditor} onSubmit={submit}>
          <header>
            <div><small>{editingId ? "EDIT ANNOUNCEMENT" : "NEW ANNOUNCEMENT"}</small><h2>{editingId ? "编辑公告" : "发布新公告"}</h2></div>
            {editingId && <button aria-label="取消编辑" onClick={resetEditor} type="button"><X size={17} /></button>}
          </header>

          <label>标题<input maxLength={80} onChange={(event) => update("title", event.target.value)} placeholder="例如：Micosm 社区正式开放" required value={draft.title} /></label>
          <label>一句话摘要<input maxLength={160} onChange={(event) => update("summary", event.target.value)} placeholder="在首页公告条中展示" value={draft.summary} /></label>
          <label>公告正文<textarea maxLength={5000} onChange={(event) => update("body", event.target.value)} placeholder="写清楚更新内容、影响范围和玩家需要知道的事项" required rows={9} value={draft.body} /></label>

          <div className={styles.announcementFields}>
            <label>类型<select onChange={(event) => update("category", event.target.value as Draft["category"])} value={draft.category}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>优先级<select onChange={(event) => update("priority", event.target.value as Draft["priority"])} value={draft.priority}><option value="normal">普通</option><option value="important">重要</option><option value="critical">紧急</option></select></label>
            <label>发布状态<select onChange={(event) => update("status", event.target.value as Draft["status"])} value={draft.status}><option value="published">立即发布</option><option value="draft">保存草稿</option></select></label>
          </div>

          <label>审计说明<input maxLength={240} onChange={(event) => update("reason", event.target.value)} placeholder="选填，例如：发布 v0.3 更新说明" value={draft.reason} /></label>
          <button className={styles.announcementSubmit} disabled={Boolean(busy) || draft.title.trim().length < 4 || draft.body.trim().length < 8} type="submit">
            {busy === "save" ? <LoaderCircle className={styles.spin} size={18} /> : draft.status === "draft" ? <FileText size={18} /> : <Send size={18} />}
            {editingId ? "保存修改" : draft.status === "draft" ? "保存草稿" : "发布公告"}
          </button>
        </form>

        <section className={styles.announcementArchive}>
          <header><div><small>ANNOUNCEMENT ARCHIVE</small><h2>历史公告</h2></div>{busy === "load" && <LoaderCircle className={styles.spin} size={18} />}</header>
          <div className={styles.announcementList}>
            {announcements.map((item) => (
              <article className={`${styles.announcementCard} ${styles[`priority_${item.priority}`]}`} key={item.id}>
                <div className={styles.announcementCardMeta}>
                  <span>{categoryLabels[item.category]}</span>
                  <b className={styles[`status_${item.status}`]}>{statusLabels[item.status]}</b>
                  <time><Clock3 size={12} />{formatTime(item.updatedAt)}</time>
                </div>
                <h3>{item.title}</h3>
                <p>{item.summary || item.body.slice(0, 96)}</p>
                {item.priority !== "normal" && <small className={styles.announcementPriority}><AlertTriangle size={13} />{item.priority === "critical" ? "紧急公告" : "重要公告"}</small>}
                <footer>
                  <button onClick={() => edit(item)} type="button"><Pencil size={15} />编辑</button>
                  {item.status !== "withdrawn" && (confirmWithdrawId === item.id ? <>
                    <button className={styles.withdrawConfirm} disabled={Boolean(busy)} onClick={() => void withdraw(item.id)} type="button"><Check size={15} />确认撤回</button>
                    <button onClick={() => setConfirmWithdrawId(null)} type="button">取消</button>
                  </> : <button onClick={() => setConfirmWithdrawId(item.id)} type="button"><X size={15} />撤回</button>)}
                </footer>
              </article>
            ))}
            {!announcements.length && busy !== "load" && <div className={styles.announcementEmpty}><Megaphone size={24} /><strong>还没有公告</strong><p>第一条公告发布后会出现在这里。</p></div>}
          </div>
        </section>
      </div>
    </section>
  );
}
