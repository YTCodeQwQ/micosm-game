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

test("desktop ranked lobby keeps the progression together and the board visible", async ({ page }, testInfo) => {
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

    const overview = await page.locator(".rank-overview").boundingBox();
    const path = await page.locator(".rank-path").boundingBox();
    const board = await page.locator(".rank-board").boundingBox();
    expect(overview).not.toBeNull();
    expect(path).not.toBeNull();
    expect(board).not.toBeNull();
    expect(path!.x).toBe(overview!.x);
    expect(path!.y).toBeGreaterThan(overview!.y + overview!.height);
    expect(board!.x).toBeGreaterThan(overview!.x + overview!.width);
    expect(overview!.width / board!.width).toBeGreaterThan(1.65);
    expect(board!.height).toBeLessThan(viewport.height - 80);
  }
});
