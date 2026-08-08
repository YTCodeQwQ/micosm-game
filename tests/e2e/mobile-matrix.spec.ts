import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, mockSignedInApi } from "./helpers";

test("mobile viewport matrix exposes every primary destination", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "mobile matrix");
  await mockSignedInApi(page);
  await page.goto("/");
  const nav = page.locator(".mobile-primary-nav");
  await expect(nav).toBeVisible();
  await expectNoHorizontalOverflow(page);

  for (const destination of ["大厅", "好友", "我的", "游戏"]) {
    await nav.getByRole("button", { name: new RegExp(destination) }).click();
    await expectNoHorizontalOverflow(page);
  }
  await expect(page.locator("#mobile-play-title")).toBeVisible();
});
