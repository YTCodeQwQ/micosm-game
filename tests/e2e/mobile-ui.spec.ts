import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, mockSignedInApi } from "./helpers";

test("mobile sign-in keeps errors and controls visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile snapshot");
  await page.route("**/api/auth", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 401, json: { user: null } });
    return route.fulfill({ status: 401, json: { error: { message: "手机号或密码不正确" } } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "进入 Micosm Game" })).toBeVisible();
  await page.getByLabel("手机号").fill("13800138000");
  await page.getByLabel("密码").fill("wrongpass");
  await page.locator(".auth-submit").click();
  await expect(page.getByText("手机号或密码不正确")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("sign-in-error.png", { fullPage: true });
});

test("mobile primary pages stay compact and usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile snapshot");
  await mockSignedInApi(page);
  await page.goto("/");
  await expect(page.locator("#mobile-play-title")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("home.png", { fullPage: true });

  await page.locator(".mobile-primary-nav").getByRole("button", { name: /大厅/ }).click();
  await expect(page.getByRole("heading", { name: "星海交流站" })).toBeVisible();
  await expect(page.getByRole("button", { name: /实时大厅/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("community.png", { fullPage: true });

  await page.locator(".mobile-primary-nav").getByRole("button", { name: /好友/ }).click();
  await expect(page.locator(".friend-panel > header").getByRole("heading", { name: "好友" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.locator(".mobile-primary-nav").getByRole("button", { name: /我的/ }).click();
  await expect(page.getByRole("button", { name: "进入浏览器全屏" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加到手机桌面" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("account.png", { fullPage: true });
});
