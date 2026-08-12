"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, Ban, BookOpenCheck, Bot, Check, ChevronRight, CircleGauge, Clock3, FlaskConical, Gamepad2, History,
  LoaderCircle, LogOut, Megaphone, MessageCircle, MessageSquareWarning, RefreshCw, Search, ShieldCheck, ShieldX, UserCog,
  Users, VolumeX, Wrench, X,
} from "lucide-react";
import styles from "./admin.module.css";
import { AdminAnnouncements } from "./AdminAnnouncements";
import { AdminGameOperations } from "./AdminGameOperations";
import { AdminPolicies } from "./AdminPolicies";
import { AdminOperations } from "./AdminOperations";
import { AdminCommunity } from "./AdminCommunity";
import { AdminBetaCenter } from "./AdminBetaCenter";

type Permission =
  | "overview.read" | "users.read" | "users.sanction" | "users.sessions" | "reports.read" | "reports.write"
  | "matches.read" | "ranking.read" | "ranking.write" | "ranking.seasons.write" | "ai.read" | "ai.write" | "announcements.write"
  | "community.write" | "policies.read" | "policies.write" | "audit.read" | "roles.write" | "operations.read" | "operations.write" | "beta.manage";
type AdminRole = "super_admin" | "admin" | "moderator" | "support" | "operator";
type View = "overview" | "beta" | "users" | "moderation" | "games" | "announcements" | "community" | "policies" | "ai" | "operations" | "audit";

type Overview = {
  actor: { id: string; publicId: string; displayName: string; role: AdminRole; permissions: Permission[] };
  stats: Record<"users" | "newUsers" | "activeUsers" | "liveRooms" | "completedMatches" | "messages" | "openReports" | "activeSanctions" | "rankedQueue", number>;
  recentAudit: AuditEntry[];
  generatedAt: number;
};
type AuditEntry = {
  id: string; requestId?: string; module: string; action: string; targetType: string | null; targetId: string | null;
  reason: string; createdAt: number; adminName: string; adminRole?: string; before?: unknown; after?: unknown;
};
type ManagedUser = {
  id: string; publicId: string; displayName: string; phone: string; signature: string; avatarUrl: string | null;
  role: AdminRole | "player"; createdAt: number; updatedAt: number; sessionCount: number;
  sanction: { mutedUntil: number | null; bannedUntil: number | null; reason: string };
  ranks: { go: number; gomoku: number };
};
type Report = {
  id: string; messageId: string; message: string; createdAt: number; status: string; targetUserId: string | null;
  senderName: string; reporterName: string; deleted: boolean; source?: "chat" | "community"; targetType?: "message" | "post" | "comment";
};
type Sanction = { userId: string; publicId: string; displayName: string; mutedUntil: number | null; bannedUntil: number | null; reason: string };
type EngineStatus = {
  engine: string; ready: boolean; reachable: boolean; responseMs: number; model?: string; version?: string; modelHash?: string;
  detail?: string; workers?: number; threadsPerWorker?: number; uptimeSeconds?: number;
  metrics?: { requests?: number; successes?: number; failures?: number; queued?: number; active?: number; latency?: { p50Ms?: number; p95Ms?: number } };
};
type ConfirmAction = { title: string; description: string; confirmLabel: string; danger?: boolean; run: (reason: string) => Promise<void> };

const ROLE_LABELS: Record<AdminRole | "player", string> = {
  super_admin: "超级管理员", admin: "管理员", moderator: "审核员", support: "客服", operator: "运维", player: "普通用户",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message ?? `请求失败（${response.status}）`);
  return data;
}

function formatTime(value: number | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "无";
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button className={active ? styles.active : ""} onClick={onClick} type="button">{icon}<span>{label}</span>{badge ? <b>{badge}</b> : null}</button>;
}

export default function AdminPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [query, setQuery] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [engines, setEngines] = useState<EngineStatus[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [reason, setReason] = useState("");
  const [announcementRevision, setAnnouncementRevision] = useState(0);
  const [communityRevision, setCommunityRevision] = useState(0);
  const [gameOpsRevision, setGameOpsRevision] = useState(0);
  const [policyRevision, setPolicyRevision] = useState(0);
  const [operationsRevision, setOperationsRevision] = useState(0);
  const [betaRevision, setBetaRevision] = useState(0);

  const permissions = useMemo(() => new Set(overview?.actor.permissions ?? []), [overview]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      setError("");
      setOverview(await requestJson<Overview>("/api/admin/overview"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "管理后台暂时不可用");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async (search = query) => {
    const result = await requestJson<{ users: ManagedUser[] }>(`/api/admin/users?q=${encodeURIComponent(search)}`);
    setUsers(result.users);
  }, [query]);

  const loadModeration = useCallback(async () => {
    const result = await requestJson<{ reports: Report[]; sanctions: Sanction[] }>("/api/admin/moderation");
    setReports(result.reports);
    setSanctions(result.sanctions);
  }, []);

  const loadAi = useCallback(async () => {
    const result = await requestJson<{ engines: EngineStatus[] }>("/api/admin/ai");
    setEngines(result.engines);
  }, []);

  const loadAudit = useCallback(async () => {
    const result = await requestJson<{ entries: AuditEntry[] }>("/api/admin/audit");
    setAudit(result.entries);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);
  useEffect(() => {
    if (!overview) return;
    const timer = window.setTimeout(() => {
      const load = view === "users" ? loadUsers() : view === "moderation" ? loadModeration() : view === "ai" ? loadAi() : view === "audit" ? loadAudit() : Promise.resolve();
      setBusy(`load:${view}`);
      load.catch((caught) => setError(caught instanceof Error ? caught.message : "读取数据失败")).finally(() => setBusy(""));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAi, loadAudit, loadModeration, loadUsers, overview, view]);

  async function mutate(url: string, payload: Record<string, unknown>, success: string, reload: () => Promise<void>) {
    setBusy(`${url}:${payload.action ?? "write"}`);
    try {
      setError("");
      await requestJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      setNotice(success);
      window.setTimeout(() => setNotice(""), 2800);
      await Promise.all([reload(), loadOverview()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "管理操作失败");
    } finally {
      setBusy("");
    }
  }

  function ask(action: ConfirmAction) {
    setReason("");
    setConfirmAction(action);
  }

  async function submitConfirm(event: FormEvent) {
    event.preventDefault();
    if (!confirmAction || !reason.trim()) return;
    const action = confirmAction;
    setConfirmAction(null);
    await action.run(reason.trim());
  }

  if (loading && !overview) return <main className={styles.gate}><LoaderCircle className={styles.spin} size={28} /><strong>正在验证管理权限</strong></main>;
  if (!overview) return <main className={styles.gate}><ShieldX size={34} /><h1>无法进入管理后台</h1><p>{error || "当前账号没有管理权限"}</p><Link href="/"><ArrowLeft size={16} />返回游戏平台</Link></main>;

  const openReports = reports.filter((report) => report.status === "open");
  const renderedAt = overview.generatedAt;
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/"><span><ShieldCheck size={23} /></span><div><strong>Micosm</strong><small>管理工作台</small></div></Link>
        <nav aria-label="后台导航">
          <NavButton active={view === "overview"} icon={<CircleGauge size={18} />} label="概览" onClick={() => setView("overview")} />
          {permissions.has("beta.manage") && <NavButton active={view === "beta"} icon={<FlaskConical size={18} />} label="内测中心" onClick={() => setView("beta")} />}
          {permissions.has("users.read") && <NavButton active={view === "users"} icon={<Users size={18} />} label="用户" onClick={() => setView("users")} />}
          {permissions.has("reports.read") && <NavButton active={view === "moderation"} badge={overview.stats.openReports} icon={<MessageSquareWarning size={18} />} label="举报与处罚" onClick={() => setView("moderation")} />}
          {permissions.has("matches.read") && <NavButton active={view === "games"} icon={<Gamepad2 size={18} />} label="对局与排位" onClick={() => setView("games")} />}
          {permissions.has("announcements.write") && <NavButton active={view === "announcements"} icon={<Megaphone size={18} />} label="公告" onClick={() => setView("announcements")} />}
          {permissions.has("community.write") && <NavButton active={view === "community"} icon={<MessageCircle size={18} />} label="讨论运营" onClick={() => setView("community")} />}
          {permissions.has("policies.read") && <NavButton active={view === "policies"} icon={<BookOpenCheck size={18} />} label="协议与规则" onClick={() => setView("policies")} />}
          {permissions.has("ai.read") && <NavButton active={view === "ai"} icon={<Bot size={18} />} label="AI 运行状态" onClick={() => setView("ai")} />}
          {permissions.has("operations.read") && <NavButton active={view === "operations"} icon={<Wrench size={18} />} label="运行控制台" onClick={() => setView("operations")} />}
          {permissions.has("audit.read") && <NavButton active={view === "audit"} icon={<History size={18} />} label="操作审计" onClick={() => setView("audit")} />}
        </nav>
        <div className={styles.actor}><span>{overview.actor.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{overview.actor.displayName}</strong><small>{ROLE_LABELS[overview.actor.role]}</small></div></div>
        <Link className={styles.back} href="/"><LogOut size={17} />返回游戏平台</Link>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div><small>ADMIN CONSOLE</small><h1>{view === "overview" ? "运行概览" : view === "beta" ? "内测中心" : view === "users" ? "用户与权限" : view === "moderation" ? "举报与处罚" : view === "games" ? "对局与排位" : view === "announcements" ? "社区公告" : view === "community" ? "讨论内容运营" : view === "policies" ? "协议与规则" : view === "ai" ? "AI 运行状态" : view === "operations" ? "运行控制台" : "操作审计"}</h1></div>
          <button aria-label="刷新当前页面" onClick={() => { if (view === "overview") void loadOverview(); else if (view === "beta") setBetaRevision((value) => value + 1); else if (view === "users") void loadUsers(); else if (view === "moderation") void loadModeration(); else if (view === "games") setGameOpsRevision((value) => value + 1); else if (view === "announcements") setAnnouncementRevision((value) => value + 1); else if (view === "community") setCommunityRevision((value) => value + 1); else if (view === "policies") setPolicyRevision((value) => value + 1); else if (view === "ai") void loadAi(); else if (view === "operations") setOperationsRevision((value) => value + 1); else void loadAudit(); }} type="button"><RefreshCw className={busy.startsWith("load:") ? styles.spin : ""} size={18} /></button>
        </header>
        {error && <div className={styles.error}><ShieldX size={17} /><span>{error}</span><button onClick={() => setError("")} type="button"><X size={15} /></button></div>}
        {notice && <div className={styles.notice}><Check size={17} />{notice}</div>}

        {view === "announcements" && <AdminAnnouncements onError={setError} onNotice={(message) => { setNotice(message); window.setTimeout(() => setNotice(""), 2800); }} revision={announcementRevision} />}
        {view === "community" && <AdminCommunity onError={setError} onNotice={(message) => { setNotice(message); window.setTimeout(() => setNotice(""), 2800); }} revision={communityRevision} />}
        {view === "games" && <AdminGameOperations canManageSeasons={permissions.has("ranking.seasons.write")} canWriteRank={permissions.has("ranking.write")} onError={setError} onNotice={(message) => { setNotice(message); window.setTimeout(() => setNotice(""), 2800); }} revision={gameOpsRevision} />}
        {view === "policies" && <AdminPolicies canWrite={permissions.has("policies.write")} onError={setError} onNotice={(message) => { setNotice(message); window.setTimeout(() => setNotice(""), 2800); }} revision={policyRevision} />}
        {view === "operations" && <AdminOperations canWrite={permissions.has("operations.write")} onError={setError} onNotice={(message) => { setNotice(message); window.setTimeout(() => setNotice(""), 2800); }} revision={operationsRevision} />}
        {view === "beta" && <AdminBetaCenter onError={setError} onNotice={(message) => { setNotice(message); window.setTimeout(() => setNotice(""), 2800); }} onOpenSeasons={() => setView("games")} revision={betaRevision} />}

        {view === "overview" && <OverviewView data={overview} />}
        {view === "users" && <section className={styles.pageSection}>
          <form className={styles.searchbar} onSubmit={(event) => { event.preventDefault(); void loadUsers(); }}><Search size={18} /><input onChange={(event) => setQuery(event.target.value)} placeholder="用户名、MG-棋手 ID 或手机号" value={query} /><button type="submit">查询</button></form>
          <div className={styles.tableHeader}><strong>用户</strong><span>会话</span><span>段位分</span><span>状态</span><span>操作</span></div>
          <div className={styles.rows}>{users.map((user) => {
            const restricted = Boolean((user.sanction.mutedUntil ?? 0) > renderedAt || (user.sanction.bannedUntil ?? 0) > renderedAt);
            return <article className={styles.userRow} key={user.id}>
              <div className={styles.userIdentity}>{user.avatarUrl ? <Image alt="" height={42} src={user.avatarUrl} unoptimized width={42} /> : <span>{user.displayName.slice(0, 1).toUpperCase()}</span>}<div><strong>{user.displayName}<i>{ROLE_LABELS[user.role]}</i></strong><small>{user.publicId} · {user.phone}</small><p>{user.signature || "未设置个性签名"}</p></div></div>
              <div data-label="有效会话"><strong>{user.sessionCount}</strong><small>个设备</small></div>
              <div data-label="段位分"><strong>围 {user.ranks.go}</strong><small>五子棋 {user.ranks.gomoku}</small></div>
              <div data-label="状态"><b className={restricted ? styles.bad : styles.good}>{restricted ? "受限" : "正常"}</b><small>{user.sanction.reason || formatTime(user.updatedAt)}</small></div>
              <div className={styles.rowActions}>
                {permissions.has("users.sessions") && <button disabled={Boolean(busy) || user.sessionCount === 0} onClick={() => ask({ title: "吊销全部会话", description: `让 ${user.displayName} 在所有设备上退出登录。`, confirmLabel: "确认吊销", danger: true, run: (why) => mutate("/api/admin/users", { action: "revoke_sessions", userId: user.id, reason: why }, "已吊销用户会话", () => loadUsers()) })} type="button"><LogOut size={16} />会话</button>}
                {permissions.has("roles.write") && <select aria-label={`调整 ${user.displayName} 的角色`} disabled={Boolean(busy)} onChange={(event) => { const role = event.target.value; if (role === user.role) return; ask({ title: "调整管理角色", description: `将 ${user.displayName} 的角色由“${ROLE_LABELS[user.role]}”改为“${ROLE_LABELS[role as keyof typeof ROLE_LABELS]}”。`, confirmLabel: "确认调整", danger: role === "player", run: (why) => mutate("/api/admin/users", { action: "set_role", userId: user.id, role, reason: why }, "用户角色已更新", () => loadUsers()) }); }} value={user.role}><option value="player">普通用户</option><option value="support">客服</option><option value="moderator">审核员</option><option value="operator">运维</option><option value="admin">管理员</option><option value="super_admin">超级管理员</option></select>}
              </div>
            </article>;
          })}{!users.length && <Empty icon={<Users size={22} />} title="没有找到用户" detail="换一个用户名或棋手 ID 再试。" />}</div>
        </section>}

        {view === "moderation" && <section className={styles.pageSection}>
          <div className={styles.splitHeading}><div><strong>待处理举报</strong><span>{openReports.length}</span></div><small>所有处置都会写入审计日志</small></div>
          <div className={styles.reportGrid}>{openReports.map((report) => <article className={styles.report} key={report.id}><header><div><strong>{report.senderName}</strong><small>{report.source === "community" ? report.targetType === "comment" ? "社区评论" : "社区帖子" : "频道消息"} · 由 {report.reporterName} 举报</small></div><time>{formatTime(report.createdAt)}</time></header><blockquote>{report.deleted ? "内容已删除" : report.message}</blockquote><footer>
            <button onClick={() => ask({ title: "忽略举报", description: "保留原消息并关闭这条举报。", confirmLabel: "确认忽略", run: (why) => mutate("/api/admin/moderation", { action: "dismiss", reportId: report.id, reason: why }, "举报已忽略", loadModeration) })} type="button"><Check size={15} />忽略</button>
            <button disabled={report.deleted} onClick={() => ask({ title: "删除违规内容", description: "内容会从频道或社区隐藏，相关举报自动结案。", confirmLabel: "删除内容", danger: true, run: (why) => mutate("/api/admin/moderation", { action: "delete_message", reportId: report.id, reason: why }, "违规内容已删除", loadModeration) })} type="button"><ShieldX size={15} />删除</button>
            <button disabled={!report.targetUserId} onClick={() => ask({ title: "禁言 10 分钟", description: `暂时限制 ${report.senderName} 发送频道消息。`, confirmLabel: "确认禁言", run: (why) => mutate("/api/admin/moderation", { action: "mute", reportId: report.id, targetUserId: report.targetUserId, durationMinutes: 10, reason: why }, "用户已禁言", loadModeration) })} type="button"><VolumeX size={15} />禁言</button>
            <button className={styles.dangerButton} disabled={!report.targetUserId} onClick={() => ask({ title: "封禁 24 小时", description: `封禁 ${report.senderName} 并吊销其全部登录会话。`, confirmLabel: "确认封禁", danger: true, run: (why) => mutate("/api/admin/moderation", { action: "ban", reportId: report.id, targetUserId: report.targetUserId, durationMinutes: 1440, reason: why }, "用户已封禁", loadModeration) })} type="button"><Ban size={15} />封禁</button>
          </footer></article>)}{!openReports.length && <Empty icon={<ShieldCheck size={22} />} title="举报队列已清空" detail="当前没有等待处理的频道举报。" />}</div>
          <div className={styles.splitHeading}><div><strong>当前账号限制</strong><span>{sanctions.length}</span></div></div>
          <div className={styles.sanctions}>{sanctions.map((sanction) => <article key={sanction.userId}><div><strong>{sanction.displayName}</strong><small>{sanction.publicId} · {sanction.reason || "未填写原因"}</small></div><span>{sanction.bannedUntil && sanction.bannedUntil > renderedAt ? `封禁至 ${formatTime(sanction.bannedUntil)}` : `禁言至 ${formatTime(sanction.mutedUntil)}`}</span><button onClick={() => ask({ title: "解除账号限制", description: `恢复 ${sanction.displayName} 的相关权限。`, confirmLabel: "确认解除", run: (why) => mutate("/api/admin/moderation", { action: sanction.bannedUntil && sanction.bannedUntil > renderedAt ? "unban" : "unmute", targetUserId: sanction.userId, reason: why }, "账号限制已解除", loadModeration) })} type="button">解除</button></article>)}</div>
        </section>}

        {view === "ai" && <section className={styles.pageSection}><div className={styles.engineGrid}>{engines.map((engine) => <article className={styles.engine} key={engine.engine}><header><span className={engine.ready ? styles.engineReady : styles.engineDown}><Bot size={22} /></span><div><strong>{engine.engine === "rapfi" ? "Rapfi 五子棋" : "KataGo 围棋"}</strong><small>{engine.model || "独立棋力服务"}</small></div><b className={engine.ready ? styles.good : styles.bad}>{engine.ready ? "运行中" : "不可用"}</b></header><dl><div><dt>响应</dt><dd>{engine.responseMs} ms</dd></div><div><dt>版本</dt><dd>{engine.version || "未上报"}</dd></div><div><dt>模型哈希</dt><dd>{engine.modelHash || "未上报"}</dd></div><div><dt>进程配置</dt><dd>{engine.workers ? `${engine.workers} 进程 × ${engine.threadsPerWorker} 线程` : "由部署环境管理"}</dd></div><div><dt>请求</dt><dd>{engine.metrics?.successes ?? 0} 成功 / {engine.metrics?.failures ?? 0} 失败</dd></div><div><dt>延迟</dt><dd>P50 {engine.metrics?.latency?.p50Ms ?? 0} ms · P95 {engine.metrics?.latency?.p95Ms ?? 0} ms</dd></div></dl><p>{engine.detail || "服务没有返回额外说明"}</p></article>)}</div><div className={styles.infoBand}><Activity size={19} /><div><strong>运行配置保持只读</strong><p>密钥、恢复数据库和重启宿主机不会放进网页后台；部署 Agent 仍负责这些高风险操作。</p></div></div></section>}

        {view === "audit" && <section className={styles.pageSection}><div className={styles.auditList}>{audit.map((entry) => <article key={entry.id}><span><History size={17} /></span><div><header><strong>{entry.adminName}</strong><b>{entry.module} / {entry.action}</b><time>{formatTime(entry.createdAt)}</time></header><p>{entry.reason || "未填写补充说明"}</p><small>{entry.targetType ? `${entry.targetType}: ${entry.targetId}` : "无直接目标"}{entry.requestId ? ` · 请求 ${entry.requestId.slice(0, 12)}` : ""}</small></div></article>)}{!audit.length && <Empty icon={<History size={22} />} title="暂无管理操作" detail="后续写操作会按时间记录在这里。" />}</div></section>}
      </section>

      {confirmAction && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirmAction(null); }}><form aria-modal="true" className={styles.modal} onSubmit={submitConfirm} role="dialog"><header><div><small>ADMIN ACTION</small><h2>{confirmAction.title}</h2></div><button aria-label="关闭" onClick={() => setConfirmAction(null)} type="button"><X size={18} /></button></header><p>{confirmAction.description}</p><label>操作原因<textarea autoFocus maxLength={240} onChange={(event) => setReason(event.target.value)} placeholder="原因会永久写入审计记录" required rows={3} value={reason} /></label><footer><button onClick={() => setConfirmAction(null)} type="button">取消</button><button className={confirmAction.danger ? styles.confirmDanger : ""} disabled={!reason.trim()} type="submit">{confirmAction.confirmLabel}</button></footer></form></div>}
    </main>
  );
}

function OverviewView({ data }: { data: Overview }) {
  const stats = [
    ["在线用户", data.stats.activeUsers, `${data.stats.users} 名注册用户`, <Users key="users" size={20} />],
    ["实时棋局", data.stats.liveRooms, `${data.stats.rankedQueue} 人等待排位`, <Gamepad2 key="rooms" size={20} />],
    ["待审举报", data.stats.openReports, `${data.stats.activeSanctions} 个账号受限`, <MessageSquareWarning key="reports" size={20} />],
    ["今日完成", data.stats.completedMatches, `${data.stats.messages} 条频道消息`, <Activity key="matches" size={20} />],
  ] as const;
  return <section className={styles.overview}><div className={styles.statGrid}>{stats.map(([label, value, detail, icon]) => <article key={label}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>)}</div><div className={styles.overviewGrid}><section><header><div><strong>运行摘要</strong><small>最近五分钟与最近二十四小时</small></div><Activity size={18} /></header><div className={styles.healthRows}><div><span className={styles.statusDot} /><strong>平台服务</strong><small>管理 API 与数据库可用</small><b>正常</b></div><div><Clock3 size={16} /><strong>今日新增</strong><small>新注册用户</small><b>{data.stats.newUsers}</b></div><div><UserCog size={16} /><strong>当前角色</strong><small>{data.actor.publicId}</small><b>{ROLE_LABELS[data.actor.role]}</b></div></div></section><section><header><div><strong>最近管理操作</strong><small>仅展示最新 8 条</small></div><History size={18} /></header><div className={styles.miniAudit}>{data.recentAudit.map((entry) => <div key={entry.id}><span>{entry.adminName.slice(0, 1)}</span><p><strong>{entry.adminName}</strong><small>{entry.module} / {entry.action}</small></p><time>{new Date(entry.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</time></div>)}{!data.recentAudit.length && <Empty icon={<History size={20} />} title="暂无操作记录" detail="第一条管理操作会出现在这里。" />}</div></section></div></section>;
}

function Empty({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className={styles.empty}>{icon}<div><strong>{title}</strong><p>{detail}</p></div><ChevronRight size={17} /></div>;
}
