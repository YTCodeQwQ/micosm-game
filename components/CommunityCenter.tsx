"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Bell, Bookmark, ChevronRight, Clock3, Flag, Flame, Gamepad2, Globe2,
  Heart, LoaderCircle, MessageCircle, Megaphone, PenLine, Pin, Plus, Send, Sparkles,
  Trash2, Trophy, X,
} from "lucide-react";
import type { MicosmGameFile } from "../lib/game-record";

type CommunityUser = { id: string; publicId: string; displayName: string; signature: string; avatarUrl: string | null };
type CommunityAuthor = { id: string; publicId: string; displayName: string; signature: string; avatarUrl: string | null };
type Attachment = {
  game: "go" | "gomoku" | "reversi";
  boardSize: number;
  players: { black: string; white: string };
  winner: "black" | "white" | "draw";
  reason: string;
  moveCount: number;
  file?: MicosmGameFile;
};
type CommunityPost = {
  id: string;
  category: string;
  title: string;
  body: string;
  pinned: boolean;
  featured: boolean;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
  isMine: boolean;
  author: CommunityAuthor;
  likes: number;
  comments: number;
  liked: boolean;
  favorited: boolean;
  attachment: Attachment | null;
};
type CommunityComment = { id: string; postId: string; parentId: string | null; body: string; createdAt: number; isMine: boolean; author: CommunityAuthor };
type CommunityAnnouncement = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: "update" | "maintenance" | "event" | "rules" | "community";
  priority: "normal" | "important" | "critical";
  publishedAt: number;
  expiresAt: number | null;
};
type SavedGameChoice = { id: string; title: string; game: Attachment["game"]; players: Attachment["players"]; moveCount: number; result: string };

const categories = [
  ["all", "全部"], ["general", "综合"], ["go", "围棋"], ["gomoku", "五子棋"],
  ["reversi", "黑白棋"], ["review", "棋局复盘"], ["help", "新手求助"], ["feedback", "建议反馈"],
] as const;

const categoryNames = Object.fromEntries(categories) as Record<string, string>;
const announcementNames = { update: "版本更新", maintenance: "维护通知", event: "活动公告", rules: "规则调整", community: "社区公告" };
const MIN_POST_TITLE_LENGTH = 4;
const MIN_POST_BODY_LENGTH = 8;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `请求失败（${response.status}）`);
  return data;
}

function formatRelativeTime(value: number) {
  const delta = Math.max(0, Date.now() - value);
  if (delta < 60_000) return "刚刚";
  if (delta < 60 * 60_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 24 * 60 * 60_000) return `${Math.floor(delta / 60 / 60_000)} 小时前`;
  if (delta < 7 * 24 * 60 * 60_000) return `${Math.floor(delta / 24 / 60 / 60_000)} 天前`;
  return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function gameName(game: Attachment["game"]) {
  return game === "go" ? "围棋" : game === "gomoku" ? "五子棋" : "黑白棋";
}

function CommunityAvatar({ author }: { author: CommunityAuthor | CommunityUser }) {
  return <span className="community-avatar">{author.avatarUrl ? <Image alt="" fill sizes="44px" src={author.avatarUrl} unoptimized /> : <b>{author.displayName.slice(0, 1).toUpperCase()}</b>}</span>;
}

function GameAttachment({ attachment, onOpen }: { attachment: Attachment; onOpen?: () => void }) {
  const winner = attachment.winner === "draw" ? "和棋" : attachment.winner === "black" ? "黑方胜" : "白方胜";
  return (
    <button className="community-game-attachment" disabled={!onOpen} onClick={onOpen} type="button">
      <span><Gamepad2 size={20} /></span>
      <div><small>{gameName(attachment.game)} · {attachment.boardSize} 路</small><strong>{attachment.players.black} 对 {attachment.players.white}</strong><p>{attachment.moveCount} 手 · {winner}</p></div>
      <i>{onOpen ? "查看复盘" : "棋谱附件"}<ChevronRight size={15} /></i>
    </button>
  );
}

export function CommunityCenter({ initialSection, onOpenGame, onOpenLiveLobby, onToast, revision, user }: {
  initialSection: "discussion" | "announcements";
  onOpenGame: (file: MicosmGameFile) => void;
  onOpenLiveLobby: () => void;
  onToast: (message: string, tone?: "info" | "success" | "warning") => void;
  revision: number;
  user: CommunityUser;
}) {
  const [section, setSection] = useState<"discussion" | "announcements">(initialSection);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [announcements, setAnnouncements] = useState<CommunityAnnouncement[]>([]);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"latest" | "hot">("latest");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postCategory, setPostCategory] = useState("general");
  const [savedGameId, setSavedGameId] = useState("");
  const [savedGames, setSavedGames] = useState<SavedGameChoice[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const loadFeed = useCallback(async () => {
    const query = new URLSearchParams({ view: "feed", category, sort });
    if (favoritesOnly) query.set("favorites", "1");
    const data = await requestJson<{ posts: CommunityPost[]; announcements: CommunityAnnouncement[] }>(`/api/community?${query}`);
    setPosts(data.posts);
    setAnnouncements((current) => current.length > data.announcements.length ? current : data.announcements);
  }, [category, favoritesOnly, sort]);

  const loadAnnouncements = useCallback(async () => {
    const data = await requestJson<{ announcements: CommunityAnnouncement[] }>("/api/community?view=announcements");
    setAnnouncements(data.announcements);
  }, []);

  const openPost = useCallback(async (id: string) => {
    setBusy(`post:${id}`);
    try {
      const data = await requestJson<{ post: CommunityPost; comments: CommunityComment[] }>(`/api/community?view=post&id=${encodeURIComponent(id)}`);
      setSelectedPost(data.post);
      setComments(data.comments);
      setCommentBody("");
      setReplyingTo(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : "读取帖子失败", "warning");
    } finally {
      setBusy("");
    }
  }, [onToast]);

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      setBusy("feed");
      setError("");
      void Promise.all([loadFeed(), loadAnnouncements()])
        .catch((caught) => { if (!disposed) setError(caught instanceof Error ? caught.message : "社区暂时不可用"); })
        .finally(() => { if (!disposed) setBusy(""); });
    }, 0);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [loadAnnouncements, loadFeed, revision]);

  const mutate = useCallback(async (payload: Record<string, unknown>) => {
    return requestJson<Record<string, unknown>>("/api/community", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  }, []);

  async function openComposer() {
    setComposerOpen(true);
    setError("");
    try {
      const data = await requestJson<{ records: SavedGameChoice[] }>("/api/saves");
      setSavedGames(data.records);
    } catch {
      setSavedGames([]);
    }
  }

  async function submitPost() {
    if (busy) return;
    const titleLength = Array.from(postTitle.trim()).length;
    const bodyLength = Array.from(postBody.trim()).length;
    const problems = [];
    if (titleLength < MIN_POST_TITLE_LENGTH) problems.push(`标题至少 ${MIN_POST_TITLE_LENGTH} 个字（还差 ${MIN_POST_TITLE_LENGTH - titleLength} 个）`);
    if (bodyLength < MIN_POST_BODY_LENGTH) problems.push(`正文至少 ${MIN_POST_BODY_LENGTH} 个字（还差 ${MIN_POST_BODY_LENGTH - bodyLength} 个）`);
    if (problems.length) {
      setError(`还不能发布：${problems.join("；")}`);
      return;
    }
    setBusy("createPost");
    setError("");
    try {
      const data = await mutate({ type: "createPost", title: postTitle, body: postBody, category: postCategory, savedGameId: savedGameId || null }) as { id?: string };
      setComposerOpen(false);
      setPostTitle("");
      setPostBody("");
      setSavedGameId("");
      onToast("帖子已发布", "success");
      await loadFeed();
      if (data.id) await openPost(data.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布失败");
    } finally {
      setBusy("");
    }
  }

  async function react(post: CommunityPost, kind: "like" | "favorite") {
    setBusy(`${kind}:${post.id}`);
    try {
      await mutate({ type: "toggleReaction", postId: post.id, kind });
      if (selectedPost?.id === post.id) await openPost(post.id);
      await loadFeed();
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : "操作失败", "warning");
    } finally {
      setBusy("");
    }
  }

  async function submitComment() {
    if (!selectedPost || busy || !commentBody.trim()) return;
    setBusy("comment");
    try {
      await mutate({ type: "comment", postId: selectedPost.id, parentId: replyingTo?.id ?? null, body: commentBody });
      setCommentBody("");
      setReplyingTo(null);
      await openPost(selectedPost.id);
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : "评论失败", "warning");
    } finally {
      setBusy("");
    }
  }

  async function report(targetType: "post" | "comment", targetId: string) {
    try {
      await mutate({ type: "report", targetType, targetId });
      onToast("举报已提交，审核员会进行处理", "success");
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : "举报失败", "warning");
    }
  }

  async function remove(type: "deletePost" | "deleteComment", id: string) {
    if (!window.confirm(type === "deletePost" ? "删除这篇帖子？" : "删除这条评论？")) return;
    try {
      await mutate(type === "deletePost" ? { type, postId: id } : { type, commentId: id });
      if (type === "deletePost") setSelectedPost(null);
      else if (selectedPost) await openPost(selectedPost.id);
      await loadFeed();
      onToast("内容已删除", "success");
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : "删除失败", "warning");
    }
  }

  const latestAnnouncement = announcements[0];
  const selectedAttachment = useMemo(() => savedGames.find((record) => record.id === savedGameId), [savedGameId, savedGames]);

  return (
    <section className="community-center" aria-label="星海社区">
      <header className="community-hero">
        <Image alt="星海棋社交流区" fill priority sizes="100vw" src="/micosm-club-lobby-desktop.webp" unoptimized />
        <div className="community-hero-shade" />
        <div className="community-hero-copy"><small>MICOSM COMMUNITY</small><h1>星海交流站</h1><p>交换棋局，也交换每一步背后的想法。</p></div>
        <div className="community-hero-orbit"><span><MessageCircle size={20} /></span><b>{posts.length}</b><small>篇讨论正在发光</small></div>
      </header>

      <nav className="community-primary-tabs" aria-label="社区分区">
        <button onClick={onOpenLiveLobby} type="button"><Globe2 size={17} /><span>实时大厅</span><small>聊天与观战</small></button>
        <button aria-current={section === "discussion" ? "page" : undefined} className={section === "discussion" ? "active" : ""} onClick={() => { setSection("discussion"); setSelectedPost(null); }} type="button"><MessageCircle size={17} /><span>讨论区</span><small>交流与复盘</small></button>
        <button aria-current={section === "announcements" ? "page" : undefined} className={section === "announcements" ? "active" : ""} onClick={() => { setSection("announcements"); setSelectedPost(null); }} type="button"><Bell size={17} /><span>公告</span><small>{announcements.length} 条消息</small></button>
      </nav>

      {error && !composerOpen && <div className="community-error"><Bell size={17} /><span>{error}</span><button onClick={() => setError("")} type="button"><X size={15} /></button></div>}

      {section === "discussion" && selectedPost ? (
        <div className="community-detail-layout">
          <main className="community-post-detail">
            <button className="community-detail-back" onClick={() => setSelectedPost(null)} type="button"><ArrowLeft size={17} />返回讨论区</button>
            <article>
              <header className="community-post-author"><CommunityAvatar author={selectedPost.author} /><div><strong>{selectedPost.author.displayName}</strong><small>{selectedPost.author.publicId} · {formatRelativeTime(selectedPost.createdAt)}</small></div>{selectedPost.featured && <i><Sparkles size={13} />精华</i>}</header>
              <div className="community-post-tags"><span>{categoryNames[selectedPost.category]}</span>{selectedPost.pinned && <span><Pin size={12} />置顶</span>}</div>
              <h2>{selectedPost.title}</h2>
              <div className="community-post-body">{selectedPost.body.split("\n").map((line, index) => <p key={`${line}-${index}`}>{line || <br />}</p>)}</div>
              {selectedPost.attachment && <GameAttachment attachment={selectedPost.attachment} onOpen={selectedPost.attachment.file ? () => onOpenGame(selectedPost.attachment?.file as MicosmGameFile) : undefined} />}
              <footer className="community-post-actions">
                <button className={selectedPost.liked ? "active" : ""} disabled={busy === `like:${selectedPost.id}`} onClick={() => void react(selectedPost, "like")} type="button"><Heart fill={selectedPost.liked ? "currentColor" : "none"} size={17} />{selectedPost.likes}</button>
                <button className={selectedPost.favorited ? "active" : ""} disabled={busy === `favorite:${selectedPost.id}`} onClick={() => void react(selectedPost, "favorite")} type="button"><Bookmark fill={selectedPost.favorited ? "currentColor" : "none"} size={17} />{selectedPost.favorited ? "已收藏" : "收藏"}</button>
                {selectedPost.isMine ? <button className="danger" onClick={() => void remove("deletePost", selectedPost.id)} type="button"><Trash2 size={16} />删除</button> : <button onClick={() => void report("post", selectedPost.id)} type="button"><Flag size={15} />举报</button>}
              </footer>
            </article>
            <section className="community-comments">
              <header><div><strong>评论</strong><span>{comments.length}</span></div>{selectedPost.locked && <small>帖子已停止评论</small>}</header>
              <div className="community-comment-list">
                {comments.map((comment) => {
                  const parent = comment.parentId ? comments.find((item) => item.id === comment.parentId) : null;
                  return <article key={comment.id}><CommunityAvatar author={comment.author} /><div><header><strong>{comment.author.displayName}</strong><time>{formatRelativeTime(comment.createdAt)}</time></header>{parent && <small>回复 @{parent.author.displayName}</small>}<p>{comment.body}</p><footer><button onClick={() => setReplyingTo(comment)} type="button">回复</button>{comment.isMine ? <button onClick={() => void remove("deleteComment", comment.id)} type="button">删除</button> : <button onClick={() => void report("comment", comment.id)} type="button">举报</button>}</footer></div></article>;
                })}
                {!comments.length && <div className="community-empty compact"><MessageCircle size={22} /><strong>还没有评论</strong><p>说说你看到的关键一手。</p></div>}
              </div>
              {!selectedPost.locked && <form className="community-comment-composer" onSubmit={(event) => { event.preventDefault(); void submitComment(); }}>
                {replyingTo && <div><span>回复 {replyingTo.author.displayName}</span><button aria-label="取消回复" onClick={() => setReplyingTo(null)} type="button"><X size={14} /></button></div>}
                <textarea maxLength={500} onChange={(event) => setCommentBody(event.target.value)} placeholder="认真交流，尊重不同的棋路……" rows={3} value={commentBody} />
                <button disabled={busy === "comment" || !commentBody.trim()} type="submit">{busy === "comment" ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}发表评论</button>
              </form>}
            </section>
          </main>
          <aside className="community-detail-side"><div><Trophy size={20} /><strong>复盘讨论提示</strong><p>可以指出手数与坐标，也可以附上自己的变化图思路。对棋不对人。</p></div><button onClick={() => void openComposer()} type="button"><Plus size={17} />发布新讨论</button></aside>
        </div>
      ) : section === "discussion" ? (
        <div className="community-layout">
          <main className="community-feed">
            {latestAnnouncement && <button className={`community-announcement-strip ${latestAnnouncement.priority}`} onClick={() => setSection("announcements")} type="button"><span><Megaphone size={17} /></span><div><small>{announcementNames[latestAnnouncement.category]}</small><strong>{latestAnnouncement.title}</strong></div><ChevronRight size={17} /></button>}
            <div className="community-feed-toolbar"><div><button className={sort === "latest" ? "active" : ""} onClick={() => setSort("latest")} type="button"><Clock3 size={15} />最新</button><button className={sort === "hot" ? "active" : ""} onClick={() => setSort("hot")} type="button"><Flame size={15} />热门</button><button className={favoritesOnly ? "active" : ""} onClick={() => setFavoritesOnly((value) => !value)} type="button"><Bookmark size={15} />收藏</button></div><button className="community-compose-primary" onClick={() => void openComposer()} type="button"><PenLine size={16} />发布讨论</button></div>
            <div className="community-categories" aria-label="帖子分类">{categories.map(([id, label]) => <button className={category === id ? "active" : ""} key={id} onClick={() => setCategory(id)} type="button">{label}</button>)}</div>
            <div className="community-post-list">
              {posts.map((post) => <article className="community-post-card" key={post.id}>
                <button className="community-post-open" disabled={busy === `post:${post.id}`} onClick={() => void openPost(post.id)} type="button">
                  <header className="community-post-author"><CommunityAvatar author={post.author} /><div><strong>{post.author.displayName}</strong><small>{formatRelativeTime(post.createdAt)} · {categoryNames[post.category]}</small></div>{post.pinned && <i><Pin size={12} />置顶</i>}</header>
                  <h2>{post.title}</h2><p>{post.body}</p>
                  {post.attachment && <div className="community-post-game-line"><Gamepad2 size={15} /><span>{gameName(post.attachment.game)}棋谱 · {post.attachment.moveCount} 手</span><b>可复盘</b></div>}
                </button>
                <footer><span><Heart fill={post.liked ? "currentColor" : "none"} size={15} />{post.likes}</span><span><MessageCircle size={15} />{post.comments}</span><button aria-label={post.favorited ? "取消收藏" : "收藏帖子"} className={post.favorited ? "active" : ""} onClick={() => void react(post, "favorite")} type="button"><Bookmark fill={post.favorited ? "currentColor" : "none"} size={16} /></button></footer>
              </article>)}
              {busy === "feed" && !posts.length && <div className="community-empty"><LoaderCircle className="spin" size={24} /><strong>正在连接星海社区</strong></div>}
              {!busy && !posts.length && <div className="community-empty"><MessageCircle size={26} /><strong>{favoritesOnly ? "还没有收藏帖子" : "这里还没有讨论"}</strong><p>{favoritesOnly ? "遇到值得反复看的内容时，可以先收藏起来。" : "成为第一个分享棋局和想法的人。"}</p><button onClick={() => void openComposer()} type="button"><Plus size={16} />发布第一篇</button></div>}
            </div>
          </main>
          <aside className="community-sidebar">
            <section className="community-user-card"><CommunityAvatar author={user} /><div><small>正在以此身份交流</small><strong>{user.displayName}</strong><p>{user.signature || user.publicId}</p></div></section>
            <button className="community-new-post" onClick={() => void openComposer()} type="button"><span><PenLine size={20} /></span><div><strong>发布讨论</strong><small>支持附加云端棋谱</small></div><ChevronRight size={18} /></button>
            <section className="community-guidelines"><header><Sparkles size={17} /><strong>交流约定</strong></header><p>分享真实棋局，尊重不同水平。讨论棋路，不攻击棋手。</p><button onClick={() => { setCategory("feedback"); setSection("discussion"); }} type="button">提交建议<ChevronRight size={14} /></button></section>
          </aside>
        </div>
      ) : (
        <div className="community-announcement-page">
          <header><div><small>NOTICE BOARD</small><h2>棋社公告</h2><p>版本、维护、活动和规则变化都会留在这里。</p></div><span><Megaphone size={24} /></span></header>
          <div className="community-announcement-list">{announcements.map((item, index) => <details key={item.id} open={index === 0}><summary><span className={item.priority}><Megaphone size={17} /></span><div><small>{announcementNames[item.category]} · {new Date(item.publishedAt).toLocaleDateString("zh-CN")}</small><strong>{item.title}</strong><p>{item.summary}</p></div><ChevronRight size={18} /></summary><div className="community-announcement-body">{item.body.split("\n").map((line, lineIndex) => <p key={`${line}-${lineIndex}`}>{line}</p>)}</div></details>)}</div>
        </div>
      )}

      {composerOpen && <div className="community-composer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false); }}><section aria-label="发布讨论" aria-modal="true" className="community-composer" role="dialog"><header><div><small>NEW DISCUSSION</small><h2>发布讨论</h2></div><button aria-label="关闭" onClick={() => setComposerOpen(false)} type="button"><X size={18} /></button></header>{error && <div className="community-composer-error">{error}</div>}<label><span>分类</span><select onChange={(event) => setPostCategory(event.target.value)} value={postCategory}>{categories.filter(([id]) => id !== "all").map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label><span>标题 <small className={postTitle.trim().length > 0 && postTitle.trim().length < MIN_POST_TITLE_LENGTH ? "is-short" : ""}>至少 {MIN_POST_TITLE_LENGTH} 个字 · 当前 {Array.from(postTitle.trim()).length}</small></span><input aria-invalid={postTitle.trim().length > 0 && postTitle.trim().length < MIN_POST_TITLE_LENGTH} maxLength={60} onChange={(event) => { setPostTitle(event.target.value); setError(""); }} placeholder="一句话说清想讨论什么" value={postTitle} /></label><label><span>正文 <small className={postBody.trim().length > 0 && postBody.trim().length < MIN_POST_BODY_LENGTH ? "is-short" : ""}>至少 {MIN_POST_BODY_LENGTH} 个字 · 当前 {Array.from(postBody.trim()).length}</small></span><textarea aria-invalid={postBody.trim().length > 0 && postBody.trim().length < MIN_POST_BODY_LENGTH} maxLength={3000} onChange={(event) => { setPostBody(event.target.value); setError(""); }} placeholder="分享你的想法、疑问或关键手数……" rows={8} value={postBody} /></label><label><span>附加棋谱 <small>可选</small></span><select onChange={(event) => setSavedGameId(event.target.value)} value={savedGameId}><option value="">不附加棋谱</option>{savedGames.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}</select></label>{selectedAttachment && <div className="community-selected-game"><Gamepad2 size={18} /><div><strong>{selectedAttachment.title}</strong><small>{gameName(selectedAttachment.game)} · {selectedAttachment.moveCount} 手</small></div><button aria-label="移除棋谱" onClick={() => setSavedGameId("")} type="button"><X size={15} /></button></div>}<footer><span>{postBody.length} / 3000</span><button onClick={() => setComposerOpen(false)} type="button">取消</button><button className="primary" disabled={busy === "createPost"} onClick={() => void submitPost()} type="button">{busy === "createPost" ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}发布</button></footer></section></div>}
    </section>
  );
}
