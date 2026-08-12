import { env } from "cloudflare:workers";
import { getD1 } from "../../../db";
import { configuredAdminIds, resolveConfiguredAdmin } from "../../../lib/admin";
import { authUserFromRow, cleanDisplayName, clearSessionCookie, createPassword, createSession, deleteSession, getSessionUser, maskedPhone, normalizePhone, normalizeUsernameKey, passwordIsValid, publicUserIdForInternalId, verifyPassword, type AuthUser, type AuthUserRow } from "../../../lib/auth";
import { releaseBetaInvite, reserveBetaInvite } from "../../../lib/beta";
import { ensureAppSchema } from "../../../lib/database-migrations";
import { activeSanction } from "../../../lib/moderation";
import { featureEnabled, featureUnavailable } from "../../../lib/operations";
import { clientAddress, consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";

function publicUser(user: AuthUser) {
  return { ...user, phone: maskedPhone(user.phone) };
}

const userSelect = "id, public_id, phone, display_name, username_key, password_hash, password_salt, signature, avatar_key, role";

function adminIds() {
  return configuredAdminIds((env as unknown as { MICO_ADMIN_PUBLIC_IDS?: string }).MICO_ADMIN_PUBLIC_IDS);
}

async function resolvedUser(d1: ReturnType<typeof getD1>, user: AuthUser) {
  return resolveConfiguredAdmin(d1, user, adminIds());
}

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAppSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return Response.json({ user: null }, { status: 401, headers: { "set-cookie": clearSessionCookie(request.url) } });
  const resolved = await resolvedUser(d1, user);
  const sanction = await activeSanction(d1, resolved.id);
  if (sanction.banned) return Response.json({ user: null, error: { code: "account_banned", message: "账号已被暂停使用" } }, { status: 403, headers: { "set-cookie": clearSessionCookie(request.url) } });
  return Response.json({ user: publicUser(resolved) });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { type?: string; phone?: string; displayName?: string; password?: string; inviteCode?: string };
    const d1 = getD1();
    await ensureAppSchema(d1);

    if (payload.type === "signOut") {
      await deleteSession(request, d1);
      return Response.json({ signedOut: true }, { headers: { "set-cookie": clearSessionCookie(request.url) } });
    }

    const phone = normalizePhone(payload.phone);
    if (!phone) return Response.json({ error: { code: "invalid_phone", message: "请输入正确的中国大陆手机号" } }, { status: 400 });
    if (!passwordIsValid(payload.password)) return Response.json({ error: { code: "invalid_password", message: "密码需要 8 至 64 个字符" } }, { status: 400 });
    const ipLimit = await consumeRateLimit(d1, { scope: "auth_ip", actor: clientAddress(request), limit: 60, windowMs: 10 * 60_000 });
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit, "尝试次数过多，请稍后再试");
    const phoneLimit = await consumeRateLimit(d1, { scope: "auth_phone", actor: phone, limit: 10, windowMs: 10 * 60_000 });
    if (!phoneLimit.allowed) return rateLimitResponse(phoneLimit, "这个手机号尝试得太频繁了，请稍后再试");

    if (payload.type === "register") {
      if (!await featureEnabled(d1, "registration_enabled")) return featureUnavailable("新用户注册暂时关闭，请稍后再试", "registration_closed");
      if (await featureEnabled(d1, "maintenance_mode")) return featureUnavailable("平台正在维护，暂时不能注册新账号", "maintenance_mode");
      const displayName = cleanDisplayName(payload.displayName);
      if (!displayName) return Response.json({ error: { code: "invalid_name", message: "请输入用户名" } }, { status: 400 });
      const usernameKey = normalizeUsernameKey(displayName);
      const nameOwner = await d1.prepare(`SELECT ${userSelect} FROM users WHERE username_key = ?`).bind(usernameKey).first<AuthUserRow>();
      const phoneOwner = await d1.prepare(`SELECT ${userSelect} FROM users WHERE phone = ?`).bind(phone).first<AuthUserRow>();
      if (nameOwner && nameOwner.id !== phoneOwner?.id) return Response.json({ error: { code: "username_taken", message: "这个用户名已经被使用" } }, { status: 409 });
      if (phoneOwner?.password_hash) return Response.json({ error: { code: "phone_taken", message: "这个手机号已经注册，请直接登录" } }, { status: 409 });

      const userId = phoneOwner?.id ?? crypto.randomUUID();
      const reservation = await reserveBetaInvite(d1, payload.inviteCode, userId);
      if (!reservation.ok) return Response.json({ error: { code: reservation.code, message: reservation.message } }, { status: 403 });
      let row: AuthUserRow;
      try {
        const password = await createPassword(payload.password);
        const now = Date.now();
        if (phoneOwner) {
          await d1.prepare("UPDATE users SET display_name = ?, username_key = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?")
            .bind(displayName, usernameKey, password.hash, password.salt, now, phoneOwner.id).run();
          row = { ...phoneOwner, display_name: displayName, username_key: usernameKey, password_hash: password.hash, password_salt: password.salt };
        } else {
          const publicId = await publicUserIdForInternalId(userId);
          await d1.prepare("INSERT INTO users (id, public_id, phone, display_name, username_key, password_hash, password_salt, signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)")
            .bind(userId, publicId, phone, displayName, usernameKey, password.hash, password.salt, now, now).run();
          row = { id: userId, public_id: publicId, phone, display_name: displayName, username_key: usernameKey, password_hash: password.hash, password_salt: password.salt, signature: "", avatar_key: null, role: "player" };
        }
      } catch (error) {
        await releaseBetaInvite(d1, reservation);
        throw error;
      }
      const cookie = await createSession(d1, row.id, request.url);
      const user = await resolvedUser(d1, authUserFromRow(row));
      return Response.json({ user: publicUser(user) }, { status: 201, headers: { "set-cookie": cookie } });
    }

    if (payload.type === "signIn") {
      const row = await d1.prepare(`SELECT ${userSelect} FROM users WHERE phone = ?`).bind(phone).first<AuthUserRow>();
      if (!row?.password_hash || !row.password_salt) return Response.json({ error: { code: "invalid_credentials", message: "手机号或密码不正确" } }, { status: 401 });
      if (!await verifyPassword(payload.password, row.password_hash, row.password_salt)) return Response.json({ error: { code: "invalid_credentials", message: "手机号或密码不正确" } }, { status: 401 });
      const user = await resolvedUser(d1, authUserFromRow(row));
      const sanction = await activeSanction(d1, user.id);
      if (sanction.banned) return Response.json({ error: { code: "account_banned", message: "账号已被暂停使用" } }, { status: 403 });
      const cookie = await createSession(d1, row.id, request.url);
      return Response.json({ user: publicUser(user) }, { headers: { "set-cookie": cookie } });
    }

    return Response.json({ error: { code: "invalid_request", message: "无法识别这个请求" } }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "账号请求失败";
    if (/UNIQUE constraint failed: users\.username_key/.test(message)) return Response.json({ error: { code: "username_taken", message: "这个用户名已经被使用" } }, { status: 409 });
    return Response.json({ error: { code: "server_error", message } }, { status: 500 });
  }
}
