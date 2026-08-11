import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, mockSignedInApi } from "./helpers";

test("mobile game-record center uses a dedicated uncluttered layout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile game-record layout");
  await mockSignedInApi(page);
  await page.goto("/");
  await page.locator(".mobile-primary-nav").getByRole("button", { name: /我的/ }).click();
  await page.getByRole("button", { name: "对局记录" }).click();
  await expect(page.getByRole("heading", { name: "棋谱中心" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /最近对局/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /云端棋谱/ })).toBeVisible();
  await expect(page.locator(".history-import-button")).toBeVisible();
  await expect(page.locator(".mobile-primary-nav")).toBeHidden();
  await expectNoHorizontalOverflow(page);
});
