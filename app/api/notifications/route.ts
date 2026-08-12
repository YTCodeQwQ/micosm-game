import { getD1 } from "../../../db";
import { avatarUrlForKey, getSessionUser } from "../../../lib/auth";
import { ensureAppSchema } from "../../../lib/database-migrations";

type Row = { id: string; kind: string; title: string; message: string; actor_user_id: string | null; entity_type: string | null; entity_id: string | null; read_at: number | null; created_at: number; display_name: string | null; avatar_key: string | null };

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
  const rows = await d1.prepare(`SELECT n.id, n.kind, n.title, n.message, n.actor_user_id, n.entity_type, n.entity_id, n.read_at, n.created_at,
      u.display_name, u.avatar_key
    FROM user_notifications n LEFT JOIN users u ON u.id = n.actor_user_id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`).bind(user.id).all<Row>();
  const unread = await d1.prepare("SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ? AND read_at IS NULL").bind(user.id).first<{ count: number }>();
  return Response.json({
    unread: Number(unread?.count ?? 0),
    notifications: rows.results.map((row) => ({
      id: row.id, kind: row.kind, title: row.title, message: row.message, entityType: row.entity_type, entityId: row.entity_id,
      readAt: row.read_at, createdAt: row.created_at,
      actor: row.actor_user_id ? { id: row.actor_user_id, displayName: row.display_name ?? "玩家", avatarUrl: avatarUrlForKey(row.avatar_key) } : null,
    })),
  });
}

export async function POST(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });
  const payload = await request.json() as { type?: string; id?: string };
  const now = Date.now();
  if (payload.type === "markRead") {
    await d1.prepare("UPDATE user_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?").bind(now, payload.id ?? "", user.id).run();
    return Response.json({ read: true, readAt: now });
  }
  if (payload.type === "markAllRead") {
    await d1.prepare("UPDATE user_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(now, user.id).run();
    return Response.json({ read: true, readAt: now });
  }
  if (payload.type === "deleteAll") {
    await d1.prepare("DELETE FROM user_notifications WHERE user_id = ?").bind(user.id).run();
    return Response.json({ deleted: true });
  }
  return Response.json({ error: { code: "invalid_action", message: "无法识别这个通知操作" } }, { status: 400 });
}
