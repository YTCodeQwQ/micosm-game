import { getAvatarBucket, getD1 } from "../../../db";
import { authUserFromRow, cleanDisplayName, cleanSignature, createPassword, ensureAuthSchema, getSessionUser, maskedPhone, normalizeUsernameKey, passwordIsValid, verifyPassword, type AuthUserRow } from "../../../lib/auth";

const userSelect = "id, public_id, phone, display_name, username_key, password_hash, password_salt, signature, avatar_key";
const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    const d1 = getD1();
    await ensureAuthSchema(d1);
    const current = await getSessionUser(request, d1);
    if (!current) return Response.json({ error: { code: "auth_required", message: "请先登录" } }, { status: 401 });

    const form = await request.formData();
    const displayName = cleanDisplayName(form.get("displayName"));
    const signature = cleanSignature(form.get("signature"));
    if (!displayName) return Response.json({ error: { code: "invalid_name", message: "请输入用户名" } }, { status: 400 });
    const usernameKey = normalizeUsernameKey(displayName);
    const nameOwner = await d1.prepare("SELECT id FROM users WHERE username_key = ? AND id <> ?").bind(usernameKey, current.id).first<{ id: string }>();
    if (nameOwner) return Response.json({ error: { code: "username_taken", message: "这个用户名已经被使用" } }, { status: 409 });

    const oldRow = await d1.prepare(`SELECT ${userSelect} FROM users WHERE id = ?`).bind(current.id).first<AuthUserRow>();
    if (!oldRow) return Response.json({ error: { code: "user_not_found", message: "账号不存在" } }, { status: 404 });
    const avatar = form.get("avatar");
    const removeAvatar = form.get("removeAvatar") === "true";
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    let passwordHash = oldRow.password_hash;
    let passwordSalt = oldRow.password_salt;
    if (newPassword) {
      if (!passwordIsValid(newPassword)) return Response.json({ error: { code: "invalid_password", message: "新密码需要 8 至 64 个字符" } }, { status: 400 });
      if (oldRow.password_hash && oldRow.password_salt && !await verifyPassword(currentPassword, oldRow.password_hash, oldRow.password_salt)) {
        return Response.json({ error: { code: "invalid_current_password", message: "当前密码不正确" } }, { status: 403 });
      }
      const password = await createPassword(newPassword);
      passwordHash = password.hash;
      passwordSalt = password.salt;
    }
    let avatarKey = removeAvatar ? null : oldRow.avatar_key;
    if (avatar instanceof File && avatar.size > 0) {
      const extension = allowedImageTypes.get(avatar.type);
      if (!extension) return Response.json({ error: { code: "invalid_avatar", message: "头像仅支持 JPG、PNG、WebP 或 GIF" } }, { status: 400 });
      if (avatar.size > 2 * 1024 * 1024) return Response.json({ error: { code: "avatar_too_large", message: "头像不能超过 2MB" } }, { status: 413 });
      uploadedKey = `${current.id}-${crypto.randomUUID()}.${extension}`;
      await getAvatarBucket().put(uploadedKey, avatar.stream(), { httpMetadata: { contentType: avatar.type }, customMetadata: { owner: current.id } });
      avatarKey = uploadedKey;
    }

    await d1.prepare("UPDATE users SET display_name = ?, username_key = ?, signature = ?, avatar_key = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?")
      .bind(displayName, usernameKey, signature, avatarKey, passwordHash, passwordSalt, Date.now(), current.id).run();
    if (oldRow.avatar_key && oldRow.avatar_key !== avatarKey) await getAvatarBucket().delete(oldRow.avatar_key);
    const row = { ...oldRow, display_name: displayName, username_key: usernameKey, signature, avatar_key: avatarKey, password_hash: passwordHash, password_salt: passwordSalt };
    const user = authUserFromRow(row);
    return Response.json({ user: { ...user, phone: maskedPhone(user.phone) } });
  } catch (error) {
    if (uploadedKey) await getAvatarBucket().delete(uploadedKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : "保存资料失败";
    if (/UNIQUE constraint failed: users\.username_key/.test(message)) return Response.json({ error: { code: "username_taken", message: "这个用户名已经被使用" } }, { status: 409 });
    return Response.json({ error: { code: "server_error", message } }, { status: 500 });
  }
}
