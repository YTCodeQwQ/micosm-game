"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, MessageCircle, Pin, RotateCcw, Search, Sparkles, X } from "lucide-react";
import styles from "./admin.module.css";

type ManagedPost = {
  id: string;
  category: string;
  title: string;
  excerpt: string;
  status: "visible" | "hidden";
  pinned: boolean;
  featured: boolean;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
  author: { id: string; displayName: string; publicId: string };
  likes: number;
  comments: number;
};

type CommunityAction = "pin" | "feature" | "lock" | "hide" | "restore";
type Pending = { post: ManagedPost; action: CommunityAction; enabled?: boolean; title: string; detail: string; danger?: boolean };

const categoryLabels: Record<string, string> = {
  general: "综合", go: "围棋", gomoku: "五子棋", reversi: "黑白棋", review: "棋局复盘", help: "新手求助", feedback: "建议反馈",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `请求失败（${response.status}）`);
  return data;
}

export function AdminCommunity({ onError, onNotice, revision }: { onError: (message: string) => void; onNotice: (message: string) => void; revision: number }) {
  const [posts, setPosts] = useState<ManagedPost[]>([]);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async (search = activeQuery) => {
    setBusy(true);
    try {
      const data = await requestJson<{ posts: ManagedPost[] }>(`/api/admin/community?q=${encodeURIComponent(search)}`);
      setPosts(data.posts);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "读取讨论失败");
    } finally {
      setBusy(false);
    }
  }, [activeQuery, onError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, revision]);

  function ask(post: ManagedPost, action: CommunityAction, enabled?: boolean) {
    const content: Record<CommunityAction, { title: string; detail: string; danger?: boolean }> = {
      pin: { title: enabled ? "置顶这篇讨论" : "取消帖子置顶", detail: enabled ? "帖子会出现在讨论列表顶部。" : "帖子将恢复按更新时间排序。" },
      feature: { title: enabled ? "设为精华讨论" : "取消精华标记", detail: enabled ? "作者会收到精华提醒。" : "帖子内容不会被删除。" },
      lock: { title: enabled ? "停止新评论" : "重新开放评论", detail: enabled ? "已有评论保留，但用户不能继续回复。" : "用户可以继续参与讨论。" },
      hide: { title: "隐藏这篇帖子", detail: "帖子将从所有用户的讨论区消失，之后仍可恢复。", danger: true },
      restore: { title: "恢复显示帖子", detail: "帖子将重新出现在公开讨论区。" },
    };
    setReason("");
    setPending({ post, action, enabled, ...content[action] });
  }

  async function submit() {
    if (!pending || reason.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      await requestJson("/api/admin/community", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: pending.action, postId: pending.post.id, enabled: pending.enabled, reason }) });
      setPending(null);
      setReason("");
      onNotice("帖子状态已更新并写入审计");
      await load();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "内容操作失败");
      setBusy(false);
    }
  }

  return <section className={styles.communityAdmin}>
    <form className={styles.searchbar} onSubmit={(event) => { event.preventDefault(); const next = query.trim(); setActiveQuery(next); void load(next); }}><Search size={18} /><input maxLength={40} onChange={(event) => setQuery(event.target.value)} placeholder="标题、正文、作者或 MG-ID" value={query} /><button type="submit">搜索讨论</button></form>
    <header className={styles.communityAdminHeader}><div><small>CONTENT OPERATIONS</small><h2>讨论内容运营</h2><p>管理置顶、精华、评论状态和公开显示。</p></div><span>{posts.length} 篇</span></header>
    <div className={styles.communityAdminList}>
      {posts.map((post) => <article className={post.status === "hidden" ? styles.communityPostHidden : ""} key={post.id}>
        <header><div><span>{categoryLabels[post.category] ?? post.category}</span>{post.pinned && <b><Pin size={12} />置顶</b>}{post.featured && <b><Sparkles size={12} />精华</b>}{post.locked && <b><LockKeyhole size={12} />已锁定</b>}{post.status === "hidden" && <b><EyeOff size={12} />已隐藏</b>}</div><time>{new Date(post.updatedAt).toLocaleString("zh-CN", { hour12: false })}</time></header>
        <h3>{post.title}</h3><p>{post.excerpt}</p>
        <footer><div><strong>{post.author.displayName}</strong><small>{post.author.publicId} · {post.likes} 赞 · {post.comments} 条评论</small></div><nav>
          <button onClick={() => ask(post, "pin", !post.pinned)} type="button"><Pin size={15} />{post.pinned ? "取消置顶" : "置顶"}</button>
          <button onClick={() => ask(post, "feature", !post.featured)} type="button"><Sparkles size={15} />{post.featured ? "取消精华" : "精华"}</button>
          <button onClick={() => ask(post, "lock", !post.locked)} type="button"><LockKeyhole size={15} />{post.locked ? "开放评论" : "锁定"}</button>
          {post.status === "hidden" ? <button onClick={() => ask(post, "restore")} type="button"><Eye size={15} />恢复</button> : <button className={styles.communityHideAction} onClick={() => ask(post, "hide")} type="button"><EyeOff size={15} />隐藏</button>}
        </nav></footer>
      </article>)}
      {!busy && !posts.length && <div className={styles.empty}><MessageCircle size={22} /><div><strong>没有找到讨论</strong><p>换一个关键词再试。</p></div></div>}
      {busy && !posts.length && <div className={styles.empty}><LoaderCircle className={styles.spin} size={22} /><div><strong>正在读取讨论</strong><p>内容状态马上就好。</p></div></div>}
    </div>
    {pending && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPending(null); }}><section aria-modal="true" className={styles.modal} role="dialog"><header><div><small>CONTENT ACTION</small><h2>{pending.title}</h2></div><button aria-label="关闭" onClick={() => setPending(null)} type="button"><X size={18} /></button></header><p>{pending.detail}</p><label>操作原因<textarea autoFocus maxLength={240} onChange={(event) => setReason(event.target.value)} placeholder="原因会永久写入审计并通知作者" rows={3} value={reason} /></label><footer><button onClick={() => setPending(null)} type="button">取消</button><button className={pending.danger ? styles.confirmDanger : ""} disabled={reason.trim().length < 2 || busy} onClick={() => void submit()} type="button">{busy ? <LoaderCircle className={styles.spin} size={16} /> : pending.action === "restore" ? <RotateCcw size={16} /> : null}确认操作</button></footer></section></div>}
  </section>;
}
