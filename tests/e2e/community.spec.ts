import { expect, test, type Page } from "@playwright/test";
import { activateMatch, applyMatchAction, createMatchState } from "../../lib/match-engine";
import { createMicosmGameFile } from "../../lib/game-record";
import { expectNoHorizontalOverflow, mockSignedInApi } from "./helpers";

const author = {
  id: "author-1",
  publicId: "MG-STAR00001",
  displayName: "星野棋手",
  signature: "复盘比胜负更长久",
  avatarUrl: null,
};

const announcement = {
  id: "announcement-1",
  title: "星海社区开始试运行",
  summary: "公告、讨论与棋谱分享现已开放。",
  body: "欢迎来到星海交流站。你可以分享棋局、讨论变化，也可以查看版本和维护消息。",
  category: "community",
  priority: "important",
  publishedAt: Date.now(),
  expiresAt: null,
};

function communityReplayFile() {
  let state = activateMatch(createMatchState("gomoku", 15, "black", false));
  const moves = [
    ["black", 7, 7], ["white", 0, 0], ["black", 7, 8], ["white", 0, 1],
    ["black", 7, 9], ["white", 0, 2], ["black", 7, 10], ["white", 0, 3], ["black", 7, 11],
  ] as const;
  for (const [player, row, col] of moves) state = applyMatchAction(state, player, { type: "play", row, col });
  return createMicosmGameFile({
    title: "社区测试棋谱",
    game: "gomoku",
    mode: "private",
    boardSize: 15,
    viewerRole: "black",
    players: { black: "星野棋手", white: "白方棋手" },
    winner: "black",
    reason: "win",
    state,
    startedAt: 100,
    endedAt: 200,
  });
}

const replayFile = communityReplayFile();

const post = {
  id: "post-1",
  category: "review",
  title: "这盘五子棋的第 17 手还有更强变化吗？",
  body: "我把刚刚的对局保存下来了，想听听大家对中盘进攻次序的看法。",
  pinned: false,
  featured: true,
  locked: false,
  createdAt: Date.now() - 60_000,
  updatedAt: Date.now() - 60_000,
  isMine: false,
  author,
  likes: 12,
  comments: 1,
  liked: false,
  favorited: false,
  attachment: {
    game: "gomoku",
    boardSize: 15,
    players: { black: "星野棋手", white: "白方棋手" },
    winner: "black",
    reason: "win",
    moveCount: 9,
    file: replayFile,
  },
};

async function mockCommunity(page: Page) {
  await page.route("**/api/chat**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST") return route.fulfill({ json: { read: true } });
    if (url.searchParams.get("view") === "overview") return route.fulfill({ json: { worldUnread: 0, directUnreads: {} } });
    return route.fulfill({ json: { messages: [{
      id: "live-message-1",
      channel: "world",
      hall: "main",
      body: "晚上好，五子棋大厅有人来一局吗？",
      createdAt: Date.now(),
      isMine: false,
      sender: author,
      room: null,
    }] } });
  });
  await page.route("**/api/lobby**", async (route) => route.fulfill({ json: {
    counts: { main: 1, go: 0, gomoku: 1, reversi: 0 },
    rooms: [{
      id: "live-room-1",
      game: "gomoku",
      mode: "private",
      spectatorPolicy: "public",
      status: "waiting",
      turn: "black",
      moveCount: 0,
      boardSize: 15,
      board: Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => null)),
      lastMove: null,
      players: { black: "星野棋手", white: null },
      profiles: { black: { avatarUrl: null }, white: { avatarUrl: null } },
      joinable: true,
      spectatable: true,
      spectatorCount: 2,
      updatedAt: Date.now(),
    }],
  } }));
  await page.route("**/api/community**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST") return route.fulfill({ json: { created: true } });
    if (url.searchParams.get("view") === "announcements") return route.fulfill({ json: { announcements: [announcement] } });
    if (url.searchParams.get("view") === "post") return route.fulfill({ json: { post, comments: [{ id: "comment-1", postId: post.id, parentId: null, body: "我会先在右侧做交换。", createdAt: Date.now(), isMine: false, author }] } });
    return route.fulfill({ json: { posts: [post], announcements: [announcement] } });
  });
}

test("mobile community supports discussion, announcements, and posting without overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile community visual flow");
  await mockSignedInApi(page);
  await mockCommunity(page);
  await page.goto("/");

  await expect(page.locator(".mobile-home-announcement")).toContainText("星海社区开始试运行");
  await page.locator(".mobile-primary-nav").getByRole("button", { name: /大厅/ }).click();
  await expect(page.getByRole("heading", { name: "星海交流站" })).toBeVisible();
  await expect(page.getByRole("heading", { name: post.title })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("community-main-mobile.png") });

  await page.locator(".community-primary-tabs").getByRole("button", { name: /实时大厅/ }).click();
  await expect(page.locator(".community-center")).toBeVisible();
  await expect(page.locator(".community-primary-tabs").getByRole("button", { name: /实时大厅/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "世界主大厅" })).toBeVisible();
  await expect(page.locator(".community-live-lobby")).toBeVisible();
  await expect(page.locator(".chat-panel")).toHaveCount(0);
  await expect(page.getByText("晚上好，五子棋大厅有人来一局吗？")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("community-live-mobile.png") });
  await page.locator(".community-live-mobile-tabs").getByRole("button", { name: /公开棋局/ }).click();
  await expect(page.locator(".community-live-rooms")).toBeVisible();
  await expect(page.locator(".community-live-chat")).toBeHidden();
  await page.locator(".community-live-mobile-tabs").getByRole("button", { name: /频道聊天/ }).click();
  await page.locator(".community-primary-tabs").getByRole("button", { name: /讨论区/ }).click();

  await page.getByRole("heading", { name: post.title }).click();
  await expect(page.getByText("我会先在右侧做交换。")).toBeVisible();
  await page.getByRole("button", { name: /查看复盘/ }).click();
  await expect(page.getByRole("heading", { name: "五子棋复盘" })).toBeVisible();
  await expect(page.getByRole("button", { name: "返回帖子" })).toBeVisible();
  await page.getByRole("button", { name: "返回帖子" }).click();
  await expect(page.getByRole("heading", { name: post.title })).toBeVisible();
  await expect(page.getByText("我会先在右侧做交换。")).toBeVisible();
  await page.getByRole("button", { name: "返回讨论区" }).click();

  await page.locator(".community-primary-tabs").getByRole("button", { name: /公告/ }).click();
  await expect(page.getByRole("heading", { name: "棋社公告" })).toBeVisible();
  await expect(page.getByText(announcement.body)).toBeVisible();

  await page.getByRole("button", { name: /讨论区/ }).click();
  await page.getByRole("button", { name: /发布讨论/ }).first().click();
  await expect(page.getByRole("dialog", { name: "发布讨论" })).toBeVisible();
  await page.getByRole("dialog", { name: "发布讨论" }).getByLabel(/标题/).fill("123");
  await page.getByRole("dialog", { name: "发布讨论" }).getByLabel(/正文/).fill("123123");
  await expect(page.getByRole("dialog", { name: "发布讨论" }).getByRole("button", { name: "发布" })).toBeEnabled();
  await page.getByRole("dialog", { name: "发布讨论" }).getByRole("button", { name: "发布" }).click();
  await expect(page.getByText(/标题至少 4 个字.*正文至少 8 个字/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("community-mobile.png") });
});

test("community stays usable on the narrowest supported screen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-small", "small mobile overflow check");
  await mockSignedInApi(page);
  await mockCommunity(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "欢迎回来，星野测试员" })).toBeVisible();
  await page.locator(".mobile-primary-nav").getByRole("button", { name: /大厅/ }).click();
  await expect(page.getByRole("heading", { name: "星海交流站" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.locator(".community-primary-tabs").getByRole("button", { name: /实时大厅/ }).click();
  await expect(page.getByRole("heading", { name: "世界主大厅" })).toBeVisible();
  await expect(page.locator(".community-live-composer")).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await page.locator(".community-primary-tabs").getByRole("button", { name: /讨论区/ }).click();
  await page.getByRole("button", { name: /发布讨论/ }).first().click();
  await expect(page.getByRole("dialog", { name: "发布讨论" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("desktop community keeps the feed focused and readable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop community layout");
  await mockSignedInApi(page);
  await mockCommunity(page);
  await page.goto("/");
  await page.setViewportSize({ width: 2048, height: 1088 });
  await page.locator(".main-nav").getByRole("button", { name: "社区" }).click();
  await expect(page.getByRole("heading", { name: "星海交流站" })).toBeVisible();
  await expect(page.getByRole("heading", { name: post.title })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const communityBox = await page.locator(".community-center").boundingBox();
  const discussionBox = await page.locator(".community-layout").boundingBox();
  expect(communityBox).not.toBeNull();
  expect(discussionBox).not.toBeNull();
  expect(communityBox!.x).toBeLessThanOrEqual(24);
  expect(2048 - (communityBox!.x + communityBox!.width)).toBeLessThanOrEqual(24);
  expect(discussionBox!.height).toBeGreaterThanOrEqual(650);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("community-main-desktop.png") });
  await page.locator(".community-primary-tabs").getByRole("button", { name: /实时大厅/ }).click();
  await expect(page.getByRole("heading", { name: "星海交流站" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "世界主大厅" })).toBeVisible();
  await expect(page.locator(".community-live-lobby")).toBeVisible();
  await expect(page.locator(".chat-panel")).toHaveCount(0);
  await expect(page.getByText("晚上好，五子棋大厅有人来一局吗？")).toBeVisible();
  await expect(page.locator(".community-live-room-list").getByText("星野棋手")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const liveLobbyBox = await page.locator(".community-live-lobby").boundingBox();
  expect(liveLobbyBox).not.toBeNull();
  expect(liveLobbyBox!.x).toBeLessThanOrEqual(24);
  expect(2048 - (liveLobbyBox!.x + liveLobbyBox!.width)).toBeLessThanOrEqual(24);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("community-live-desktop.png") });
  await page.locator(".community-primary-tabs").getByRole("button", { name: /公告/ }).click();
  await expect(page.locator(".community-live-lobby")).toHaveCount(0);
  await expect(page.getByText(announcement.body)).toBeVisible();
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("community-announcement-desktop.png") });
});

test("announcement managers can access the publishing workspace", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop admin workspace");
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/overview") return route.fulfill({ json: {
      actor: { id: "admin-1", publicId: "MG-ADMIN0001", displayName: "社区管理员", role: "admin", permissions: ["overview.read", "announcements.write"] },
      stats: { users: 10, newUsers: 1, activeUsers: 3, liveRooms: 1, completedMatches: 8, messages: 16, openReports: 0, activeSanctions: 0, rankedQueue: 0 },
      recentAudit: [], generatedAt: Date.now(),
    } });
    if (url.pathname === "/api/admin/announcements") return route.fulfill({ json: { announcements: [{ ...announcement, status: "published", createdAt: Date.now(), updatedAt: Date.now() }] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "公告" }).click();
  await expect(page.getByRole("heading", { name: "发布新公告" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "历史公告" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("announcement-admin.png") });
});
