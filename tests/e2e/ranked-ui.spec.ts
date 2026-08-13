import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, mockSignedInApi } from "./helpers";

const playableRankData = {
  season: { id: "season-1", code: "S1", name: "星轨试炼", summary: "", status: "active", startsAt: Date.now() - 1_000, endsAt: Date.now() + 86_400_000, goEnabled: true, gomokuEnabled: true, carryPercent: 0, activatedAt: Date.now() - 1_000, closedAt: null },
  seasonPlayable: true,
  seasonReason: "",
  profiles: {
    go: { game: "go", rating: 128, peakRating: 128, wins: 4, losses: 2, draws: 0, streak: 1, matches: 6, label: "微光", progress: { current: 28, required: 100 } },
    gomoku: { game: "gomoku", rating: 42, peakRating: 42, wins: 1, losses: 1, draws: 0, streak: 0, matches: 2, label: "尘星", progress: { current: 42, required: 100 } },
  },
  position: 12,
  leaderboard: [],
};

const leaderboardRankData = {
  ...playableRankData,
  position: 6,
  leaderboard: Array.from({ length: 12 }, (_, index) => ({
    position: index + 1,
    userId: index === 5 ? "user-1" : `rank-user-${index + 1}`,
    publicId: `MG-STAR${String(index + 1).padStart(3, "0")}`,
    displayName: index === 5 ? "星野测试员" : `星轨棋手 ${index + 1}`,
    signature: `正在向第 ${index + 1} 席前进。`,
    avatarUrl: null,
    rating: 780 - index * 28,
    label: index < 3 ? "无垠" : index < 7 ? "天幕" : "星穹",
    wins: 30 - index,
    losses: 8 + index,
    matches: 38,
    isMe: index === 5,
  })),
};

test("home promotes ranked play and starts the selected game directly", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop home check");
  await mockSignedInApi(page);
  await page.route("**/api/rank**", (route) => route.fulfill({ json: playableRankData }));
  const rankedRequest = page.waitForRequest((request) => request.url().endsWith("/api/match") && request.method() === "POST" && request.postDataJSON().type === "rankmake");
  await page.goto("/");

  const rankedEntry = page.locator(".lobby-ranked-button");
  const quickEntry = page.locator(".lobby-match-button");
  await expect(rankedEntry).toBeVisible();
  await expect(rankedEntry).toContainText("开始排位");
  await expect(quickEntry).toBeVisible();
  expect((await rankedEntry.boundingBox())!.height).toBe((await quickEntry.boundingBox())!.height);
  await rankedEntry.click();
  expect((await rankedRequest).postDataJSON()).toMatchObject({ type: "rankmake", game: "go" });
});

test("mobile keeps ranked play in the primary navigation and first action row", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "mobile home check");
  await mockSignedInApi(page);
  await page.route("**/api/rank**", (route) => route.fulfill({ json: playableRankData }));
  await page.goto("/");

  const nav = page.locator(".mobile-primary-nav");
  await expect(nav.getByRole("button")).toHaveCount(5);
  await expect(nav.getByRole("button", { name: "排位" })).toBeVisible();
  await expect(page.locator(".mobile-ranked-entry")).toContainText("开始排位");
  await expect(page.locator(".mobile-quick-match")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("mobile ranked center keeps the start action in the first viewport", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"), "mobile ranked layout check");
  await mockSignedInApi(page);
  await page.route("**/api/rank**", (route) => route.fulfill({ json: playableRankData }));
  await page.addInitScript(() => window.sessionStorage.setItem("micosm-main-view", "ranked"));
  await page.goto("/");

  const start = page.locator(".rank-start");
  await expect(start).toBeVisible();
  await expect(start).toBeEnabled();
  const startBox = await start.boundingBox();
  expect(startBox).not.toBeNull();
  expect(startBox!.y + startBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expectNoHorizontalOverflow(page);
});

test("desktop ranked lobby fills the workspace and keeps related sections together", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop layout check");
  await mockSignedInApi(page);
  await page.addInitScript(() => window.sessionStorage.setItem("micosm-main-view", "ranked"));
  await page.goto("/");
  await expect(page.locator(".ranked-lobby")).toBeVisible();

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 2048, height: 1088 },
  ]) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);

    const lobby = await page.locator(".ranked-lobby").boundingBox();
    const overview = await page.locator(".rank-overview").boundingBox();
    const path = await page.locator(".rank-path").boundingBox();
    const board = await page.locator(".rank-board").boundingBox();
    expect(lobby).not.toBeNull();
    expect(overview).not.toBeNull();
    expect(path).not.toBeNull();
    expect(board).not.toBeNull();
    expect(lobby!.width / viewport.width).toBeGreaterThan(.95);
    expect(path!.x).toBe(overview!.x);
    expect(path!.y).toBeGreaterThan(overview!.y + overview!.height);
    expect(Math.abs(path!.y - board!.y)).toBeLessThan(2);
    expect(board!.x).toBeGreaterThan(path!.x + path!.width);
    expect(path!.width / board!.width).toBeGreaterThan(1.65);
    expect(Math.abs(path!.height - board!.height)).toBeLessThan(2);
  }
});

test("rank preview opens the complete leaderboard and player profile", async ({ page }) => {
  await mockSignedInApi(page);
  await page.route("**/api/rank**", (route) => route.fulfill({ json: leaderboardRankData }));
  await page.addInitScript(() => window.sessionStorage.setItem("micosm-main-view", "ranked"));
  await page.goto("/");

  await expect(page.locator(".rank-board-list > button")).toHaveCount(10);
  await page.locator(".rank-board-expand").click();
  await expect(page.getByRole("dialog", { name: "完整排位榜" })).toBeVisible();
  await expect(page.locator(".rank-dialog-table > div > button")).toHaveCount(12);
  await page.locator(".rank-dialog-table > div > button").first().click();
  await expect(page.getByRole("dialog", { name: "星轨棋手 1" })).toBeVisible();
  await expect(page.locator(".rank-player-stats")).toContainText("79%");
  await page.getByRole("button", { name: "返回榜单" }).click();
  await expect(page.getByRole("dialog", { name: "完整排位榜" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
