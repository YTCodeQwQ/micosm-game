import { expect, test } from "@playwright/test";
import { activateMatch, applyMatchAction, createMatchState } from "../../lib/match-engine";
import { expectNoHorizontalOverflow, mockSignedInApi } from "./helpers";

function replayFixture() {
  let state = activateMatch(createMatchState("gomoku", 15, "black", false));
  const moves = [
    ["black", 7, 7], ["white", 0, 0],
    ["black", 7, 8], ["white", 0, 1],
    ["black", 7, 9], ["white", 0, 2],
    ["black", 7, 10], ["white", 0, 3],
    ["black", 7, 11],
  ] as const;
  for (const [player, row, col] of moves) state = applyMatchAction(state, player, { type: "play", row, col });
  return {
    id: "replay-record",
    roomId: "REPLAY",
    game: "gomoku" as const,
    mode: "private" as const,
    boardSize: 15,
    role: "black" as const,
    opponent: { name: "白方测试员", avatarUrl: null },
    players: { black: "黑方测试员", white: "白方测试员" },
    winner: "black" as const,
    result: "win" as const,
    reason: "win" as const,
    moveCount: 9,
    finalScore: null,
    startedAt: 100,
    endedAt: 200,
    state,
  };
}

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

test("saved games replay every move with seeking and accelerated playback", async ({ page }, testInfo) => {
  test.skip(!["mobile-chromium", "mobile-small"].includes(testInfo.project.name), "mobile replay controls");
  const record = replayFixture();
  await mockSignedInApi(page);
  await page.route("**/api/history**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: url.searchParams.has("id") ? { record } : { records: [record] } });
  });
  await page.goto("/");
  await page.locator(".mobile-primary-nav").getByRole("button", { name: /我的/ }).click();
  await page.getByRole("button", { name: "对局记录" }).click();
  await page.locator(".history-row-open").click();

  const progress = page.getByRole("slider", { name: "复盘进度" });
  await expect(progress).toHaveValue("9");
  await progress.fill("5");
  await expect(page.getByText("黑方落子 · J8", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "跳到开局" }).click();
  await page.getByRole("button", { name: "4x" }).click();
  await page.getByRole("button", { name: "播放复盘" }).click();
  await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(1);
  await page.getByRole("button", { name: "暂停复盘" }).click();
  const pausedAt = await progress.inputValue();
  await page.waitForTimeout(400);
  await expect(progress).toHaveValue(pausedAt);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("replay-player.png") });
});
