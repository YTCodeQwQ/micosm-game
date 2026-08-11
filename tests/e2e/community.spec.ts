import { expect, test, type Page } from "@playwright/test";
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
  attachment: null,
};

async function mockCommunity(page: Page) {
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

  await page.getByRole("heading", { name: post.title }).click();
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
  await page.locator(".mobile-primary-nav").getByRole("button", { name: /大厅/ }).click();
  await expect(page.getByRole("heading", { name: "星海交流站" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: /发布讨论/ }).first().click();
  await expect(page.getByRole("dialog", { name: "发布讨论" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("desktop community keeps the feed focused and readable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop community layout");
  await mockSignedInApi(page);
  await mockCommunity(page);
  await page.goto("/");
  await page.locator(".main-nav").getByRole("button", { name: "社区" }).click();
  await expect(page.getByRole("heading", { name: "星海交流站" })).toBeVisible();
  await expect(page.getByRole("heading", { name: post.title })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath("community-main-desktop.png") });
  await page.locator(".community-primary-tabs").getByRole("button", { name: /公告/ }).click();
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
