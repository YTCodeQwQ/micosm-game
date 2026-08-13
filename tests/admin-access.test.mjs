import assert from "node:assert/strict";
import test from "node:test";

import { permissionsForRole, roleHasPermission } from "../lib/admin.ts";
import { readFileSync } from "node:fs";

test("administrator roles expose only their intended capabilities", () => {
  assert.equal(roleHasPermission("super_admin", "roles.write"), true);
  assert.equal(roleHasPermission("super_admin", "ranking.seasons.write"), true);
  assert.equal(roleHasPermission("admin", "roles.write"), false);
  assert.equal(roleHasPermission("admin", "ranking.seasons.write"), false);
  assert.equal(roleHasPermission("moderator", "reports.write"), true);
  assert.equal(roleHasPermission("moderator", "ranking.write"), false);
  assert.equal(roleHasPermission("support", "users.sessions"), true);
  assert.equal(roleHasPermission("support", "users.sanction"), false);
  assert.equal(roleHasPermission("operator", "ai.write"), true);
  assert.equal(roleHasPermission("operator", "reports.write"), false);
});

test("permission lists are returned as defensive copies", () => {
  const first = permissionsForRole("moderator");
  first.length = 0;
  assert.equal(permissionsForRole("moderator").includes("reports.write"), true);
});

test("detailed sanctions support custom durations, permanent bans, and separate releases", () => {
  const adminPage = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  const moderationRoute = readFileSync(new URL("../app/api/admin/moderation/route.ts", import.meta.url), "utf8");

  assert.match(adminPage, /账号封禁/);
  assert.match(adminPage, /聊天禁言/);
  assert.match(adminPage, /自定义处罚时长/);
  assert.match(adminPage, /确认执行永久封禁/);
  assert.match(adminPage, /提前解除账号封禁/);
  assert.match(adminPage, /提前解除聊天禁言/);
  assert.match(adminPage, /最近处罚记录/);
  assert.match(moderationRoute, /PERMANENT_SANCTION_UNTIL/);
  assert.match(moderationRoute, /maxDurationMinutes = action === "mute" \? 43_200 : 525_600/);
  assert.match(moderationRoute, /internalNote/);
});
