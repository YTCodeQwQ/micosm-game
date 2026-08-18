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
  await expect(page.getByRole("heading", { name: "欢迎回来，星野测试员" })).toBeVisible();
  await expect(page.locator(".auth-backdrop")).toBeHidden();
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
  await expect(page).toHaveScreenshot("friends.png", { fullPage: true });

  await page.locator(".mobile-primary-nav").getByRole("button", { name: /我的/ }).click();
  await expect(page.getByRole("button", { name: "进入浏览器全屏" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加到手机桌面" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page).toHaveScreenshot("account.png", { fullPage: true });
});

test("mobile workspace survives a browser refresh", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile workspace behavior");
  await mockSignedInApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "欢迎回来，星野测试员" })).toBeVisible();
  await expect(page.locator(".auth-backdrop")).toBeHidden();

  await page.locator(".mobile-primary-nav").getByRole("button", { name: /好友/ }).click();
  await expect(page.locator(".friend-panel > header").getByRole("heading", { name: "好友" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("micosm-workspace"))).toContain('"panel":"friends"');
  await page.reload();
  await expect(page.locator(".friend-panel > header").getByRole("heading", { name: "好友" })).toBeVisible();

  await page.locator(".mobile-primary-nav").getByRole("button", { name: /我的/ }).click();
  await expect(page.getByRole("button", { name: "进入浏览器全屏" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("micosm-workspace"))).toContain('"panel":"account"');
  await page.reload();
  await expect(page.getByRole("button", { name: "进入浏览器全屏" })).toBeVisible();

  await page.locator(".mobile-primary-nav").getByRole("button", { name: /大厅/ }).click();
  await page.getByRole("button", { name: /实时大厅/ }).click();
  await expect(page.getByRole("heading", { name: "世界主大厅" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("micosm-workspace"))).toContain('"communityLive":true');
  await page.reload();
  await expect(page.getByRole("heading", { name: "世界主大厅" })).toBeVisible();
});

test("desktop lobby keeps the artwork and controls in balance", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop layout snapshot");
  await mockSignedInApi(page);
  await page.goto("/");

  const hero = page.locator(".club-hero");
  const consolePanel = page.locator(".lobby-console");
  const viewports = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 2048, height: 1088 },
    { width: 2560, height: 1360 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(hero).toBeVisible();
    await expect(consolePanel).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const heroBox = await hero.boundingBox();
    const consoleBox = await consolePanel.boundingBox();
    expect(heroBox).not.toBeNull();
    expect(consoleBox).not.toBeNull();
    expect(heroBox!.width).toBeGreaterThan(consoleBox!.width);
    expect(consoleBox!.width).toBeGreaterThanOrEqual(440);
    expect(heroBox!.x).toBeLessThanOrEqual(24);
    expect(viewport.width - (consoleBox!.x + consoleBox!.width)).toBeLessThanOrEqual(24);
    expect(viewport.height - (heroBox!.y + heroBox!.height)).toBeLessThanOrEqual(20);
  }

  await page.setViewportSize({ width: 2560, height: 1360 });
  await expect(page).toHaveScreenshot("home-desktop-wide.png", { fullPage: true });
  await page.setViewportSize({ width: 2048, height: 1088 });
  await expect(page).toHaveScreenshot("home-desktop.png", { fullPage: true });
});
