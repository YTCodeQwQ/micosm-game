import { expect, test } from "@playwright/test";

test("desktop match workspace keeps the board focused and exposes match chat", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop match workspace");
  await page.setViewportSize({ width: 2048, height: 1088 });
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  const registration = await page.request.post("/api/auth", {
    data: {
      type: "register",
      phone: `138${suffix}`,
      displayName: `棋局验收${suffix.slice(-5)}`,
      password: "match-ui-test-password",
      inviteCode: "abcd123",
    },
  });
  expect(registration.status()).toBe(201);

  const created = await page.request.post("/api/match", { data: { type: "create", game: "gomoku", size: 15, colorPreference: "black", spectatorPolicy: "public" } });
  expect(created.status()).toBe(201);
  const session = await created.json() as { room: { id: string }; playerId: string };
  await page.addInitScript((value) => window.sessionStorage.setItem("micosm-room", JSON.stringify(value)), { roomId: session.room.id, playerId: session.playerId, spectating: false });
  await page.addInitScript(() => window.localStorage.setItem("micosm-settings", JSON.stringify({ boardScale: 130 })));

  await page.goto("/");
  await expect(page.locator(".play-surface")).toBeVisible();
  await expect(page.locator(".match-library")).toBeHidden();
  await expect(page.locator(".info-panel")).toBeVisible();
  await expect(page.locator(".room-leave-button")).toContainText(/取消|退出/);
  const board = await page.locator(".standard-board").boundingBox();
  expect(board).not.toBeNull();
  expect(board!.width).toBeLessThanOrEqual(860);
  expect(board!.width).toBeGreaterThanOrEqual(800);
  const workspace = await page.locator(".app-grid").boundingBox();
  expect(workspace).not.toBeNull();
  expect(workspace!.x).toBeLessThanOrEqual(18);
  expect(2048 - workspace!.x - workspace!.width).toBeLessThanOrEqual(18);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("match-wide-inspection.png") });

  await page.getByRole("button", { name: /对局聊天/ }).click();
  await expect(page.getByRole("complementary", { name: "对局聊天" })).toBeVisible();
  await expect(page.getByRole("button", { name: "不接收" })).toBeVisible();
  await expect(page.getByRole("button", { name: "仅对手" })).toBeVisible();
  await expect(page.getByRole("button", { name: "全部" })).toBeVisible();

  await page.request.post("/api/match", { data: { type: "leave", roomId: session.room.id } });
});
