import assert from "node:assert/strict";
import test from "node:test";

import { permissionsForRole, roleHasPermission } from "../lib/admin.ts";

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
