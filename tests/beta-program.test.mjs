import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBetaInviteCode, isFeedbackCategory, isFeedbackStatus, normalizeBetaInviteCode } from "../lib/beta.ts";
import { permissionsForRole } from "../lib/admin.ts";

test("beta invite codes normalize consistently", () => {
  assert.equal(normalizeBetaInviteCode(" mg-ab cd 123 "), "MGABCD123");
  assert.match(generateBetaInviteCode(), /^MG[A-HJ-NP-Z2-9]{8}$/);
});

test("feedback categories and workflow states are constrained", () => {
  assert.equal(isFeedbackCategory("bug"), true);
  assert.equal(isFeedbackCategory("anything"), false);
  assert.equal(isFeedbackStatus("resolved"), true);
  assert.equal(isFeedbackStatus("deleted"), false);
});

test("only super administrators receive beta management permission", () => {
  assert.equal(permissionsForRole("super_admin").includes("beta.manage"), true);
  for (const role of ["admin", "moderator", "support", "operator"]) {
    assert.equal(permissionsForRole(role).includes("beta.manage"), false, role);
  }
});
