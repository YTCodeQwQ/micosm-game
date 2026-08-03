import { getD1 } from "../../../db";
import { authUserFromRow, cleanDisplayName, clearSessionCookie, createPassword, createSession, deleteSession, ensureAuthSchema, getSessionUser, inviteCodeIsValid, maskedPhone, normalizePhone, normalizeUsernameKey, passwordIsValid, publicUserIdForInternalId, verifyPassword, type AuthUser, type AuthUserRow } from "../../../lib/auth";

function publicUser(user: AuthUser) {
  return { ...user, phone: maskedPhone(user.phone) };
}

const userSelect = "id, public_id, phone, display_name, username_key, password_hash, password_salt, signature, avatar_key";

export async function GET(request: Request) {
  const d1 = getD1();
  await ensureAuthSchema(d1);
  const user = await getSessionUser(request, d1);
  if (!user) return Response.json({ user: null }, { status: 401, headers: { "set-cookie": clearSessionCookie(request.url) } });
  return Response.json({ user: publicUser(user) });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { type?: string; phone?: string; displayName?: string; password?: string; inviteCode?: string };
    const d1 = getD1();
    await ensureAuthSchema(d1);

    if (payload.type === "signOut") {
      await deleteSession(request, d1);
      return Response.json({ signedOut: true }, { headers: { "set-cookie": clearSessionCookie(request.url) } });
    }

    const phone = normalizePhone(payload.phone);
    if (!phone) return Response.json({ error: { code: "invalid_phone", message: "请输入正确的中国大陆手机号" } }, { status: 400 });
    if (!passwordIsValid(payload.password)) return Response.json({ error: { code: "invalid_password", message: "密码需要 8 至 64 个字符" } }, { status: 400 });

    if (payload.type === "register") {
      const displayName = cleanDisplayName(payload.displayName);
      if (!displayName) return Response.json({ error: { code: "invalid_name", message: "请输入用户名" } }, { status: 400 });
      if (!inviteCodeIsValid(payload.inviteCode)) return Response.json({ error: { code: "invalid_invite", message: "邀请码不正确" } }, { status: 403 });
      const usernameKey = normalizeUsernameKey(displayName);
      const nameOwner = await d1.prepare(`SELECT ${userSelect} FROM users WHERE username_key = ?`).bind(usernameKey).first<AuthUserRow>();
      const phoneOwner = await d1.prepare(`SELECT ${userSelect} FROM users WHERE phone = ?`).bind(phone).first<AuthUserRow>();
      if (nameOwner && nameOwner.id !== phoneOwner?.id) return Response.json({ error: { code: "username_taken", message: "这个用户名已经被使用" } }, { status: 409 });
      if (phoneOwner?.password_hash) return Response.json({ error: { code: "phone_taken", message: "这个手机号已经注册，请直接登录" } }, { status: 409 });

      const password = await createPassword(payload.password);
      const now = Date.now();
      let row: AuthUserRow;
      if (phoneOwner) {
        await d1.prepare("UPDATE users SET display_name = ?, username_key = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?")
          .bind(displayName, usernameKey, password.hash, password.salt, now, phoneOwner.id).run();
        row = { ...phoneOwner, display_name: displayName, username_key: usernameKey, password_hash: password.hash, password_salt: password.salt };
      } else {
        const id = crypto.randomUUID();
        const publicId = await publicUserIdForInternalId(id);
        await d1.prepare("INSERT INTO users (id, public_id, phone, display_name, username_key, password_hash, password_salt, signature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)")
          .bind(id, publicId, phone, displayName, usernameKey, password.hash, password.salt, now, now).run();
        row = { id, public_id: publicId, phone, display_name: displayName, username_key: usernameKey, password_hash: password.hash, password_salt: password.salt, signature: "", avatar_key: null };
      }
      const cookie = await createSession(d1, row.id, request.url);
      return Response.json({ user: publicUser(authUserFromRow(row)) }, { status: 201, headers: { "set-cookie": cookie } });
    }

    if (payload.type === "signIn") {
      const row = await d1.prepare(`SELECT ${userSelect} FROM users WHERE phone = ?`).bind(phone).first<AuthUserRow>();
      if (!row?.password_hash || !row.password_salt) return Response.json({ error: { code: "invalid_credentials", message: "手机号或密码不正确" } }, { status: 401 });
      if (!await verifyPassword(payload.password, row.password_hash, row.password_salt)) return Response.json({ error: { code: "invalid_credentials", message: "手机号或密码不正确" } }, { status: 401 });
      const cookie = await createSession(d1, row.id, request.url);
      return Response.json({ user: publicUser(authUserFromRow(row)) }, { headers: { "set-cookie": cookie } });
    }

    return Response.json({ error: { code: "invalid_request", message: "无法识别这个请求" } }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "账号请求失败";
    if (/UNIQUE constraint failed: users\.username_key/.test(message)) return Response.json({ error: { code: "username_taken", message: "这个用户名已经被使用" } }, { status: 409 });
    return Response.json({ error: { code: "server_error", message } }, { status: 500 });
  }
}
