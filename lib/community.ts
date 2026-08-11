import { parseMicosmGameFile, type MicosmGameFile } from "./game-record.ts";

type CommunityStatement = {
  bind(...values: unknown[]): CommunityStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};

export type CommunityD1 = { prepare(query: string): CommunityStatement };

export const DISCUSSION_CATEGORIES = ["general", "go", "gomoku", "reversi", "review", "help", "feedback"] as const;
export type DiscussionCategory = typeof DISCUSSION_CATEGORIES[number];
export type DiscussionReaction = "like" | "favorite";

export type DiscussionPostRow = {
  id: string;
  user_id: string;
  category: DiscussionCategory;
  title: string;
  body: string;
  attachment_json: string | null;
  status: "visible" | "hidden" | "deleted";
  pinned: number;
  featured: number;
  locked: number;
  created_at: number;
  updated_at: number;
  display_name: string;
  public_id: string;
  signature: string | null;
  avatar_key: string | null;
  likes: number;
  comments: number;
  liked: number;
  favorited: number;
};

export type AnnouncementRow = {
  id: string;
  title: string;
  summary: string;
  body: string;
  category: "update" | "maintenance" | "event" | "rules" | "community";
  priority: "normal" | "important" | "critical";
  status: "draft" | "published" | "withdrawn";
  published_at: number;
  expires_at: number | null;
  author_id: string | null;
  created_at: number;
  updated_at: number;
};

function cleanMultiline(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return Array.from(value.normalize("NFKC").replace(/\r\n?/g, "\n").trim()).slice(0, maxLength).join("");
}

export function cleanPostTitle(value: unknown) {
  return cleanMultiline(value, 60).replace(/\s+/g, " ");
}

export function cleanPostBody(value: unknown) {
  return cleanMultiline(value, 3000);
}

export function cleanCommentBody(value: unknown) {
  return cleanMultiline(value, 500);
}

export function discussionCategory(value: unknown): DiscussionCategory {
  return typeof value === "string" && (DISCUSSION_CATEGORIES as readonly string[]).includes(value) ? value as DiscussionCategory : "general";
}

export function postAttachment(value: string | null): MicosmGameFile | null {
  if (!value) return null;
  return parseMicosmGameFile(JSON.parse(value));
}

export async function ensureCommunitySchema(d1: CommunityD1) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS community_announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'community',
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'draft',
    published_at INTEGER NOT NULL,
    expires_at INTEGER,
    author_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS community_announcements_public_idx ON community_announcements(status, published_at DESC)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS discussion_posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    attachment_json TEXT,
    status TEXT NOT NULL DEFAULT 'visible',
    pinned INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS discussion_posts_feed_idx ON discussion_posts(status, pinned DESC, updated_at DESC)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS discussion_posts_user_idx ON discussion_posts(user_id, created_at DESC)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS discussion_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_id TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS discussion_comments_post_idx ON discussion_comments(post_id, created_at)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS discussion_reactions (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (post_id, user_id, kind)
  )`).run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS discussion_reactions_user_idx ON discussion_reactions(user_id, kind, created_at DESC)").run();

  await d1.prepare(`CREATE TABLE IF NOT EXISTS discussion_reports (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'inappropriate',
    status TEXT NOT NULL DEFAULT 'open',
    reviewed_by TEXT,
    reviewed_at INTEGER,
    resolution TEXT,
    created_at INTEGER NOT NULL
  )`).run();
  const reportColumns = await d1.prepare("PRAGMA table_info(discussion_reports)").all<{ name: string }>();
  const reportColumnNames = new Set(reportColumns.results.map((column) => column.name));
  if (!reportColumnNames.has("reviewed_by")) await d1.prepare("ALTER TABLE discussion_reports ADD COLUMN reviewed_by TEXT").run();
  if (!reportColumnNames.has("reviewed_at")) await d1.prepare("ALTER TABLE discussion_reports ADD COLUMN reviewed_at INTEGER").run();
  if (!reportColumnNames.has("resolution")) await d1.prepare("ALTER TABLE discussion_reports ADD COLUMN resolution TEXT").run();
  await d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS discussion_reports_unique ON discussion_reports(target_type, target_id, reporter_id)").run();
  await d1.prepare("CREATE INDEX IF NOT EXISTS discussion_reports_status_idx ON discussion_reports(status, created_at DESC)").run();

  const now = Date.now();
  await d1.prepare(`INSERT OR IGNORE INTO community_announcements (
      id, title, summary, body, category, priority, status, published_at, expires_at, author_id, created_at, updated_at
    ) VALUES (
      'micosm-community-open', '星海社区开始试运行', '公告、讨论与棋谱分享现已开放。',
      '棋手们现在可以在讨论区交流对局、分享云端棋谱，也可以在公告区查看版本更新与维护消息。社区仍处于试运行阶段，欢迎通过“建议反馈”分类告诉我们你的想法。',
      'community', 'important', 'published', ?, NULL, NULL, ?, ?
    )`).bind(now, now, now).run();
}
