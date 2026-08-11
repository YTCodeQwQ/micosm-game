import { expect, type Page } from "@playwright/test";

const user = {
  id: "test-user",
  publicId: "MG-TEST00001",
  phone: "138****0000",
  displayName: "星野测试员",
  signature: "今晚也认真看清每一手棋",
  avatarKey: null,
  avatarUrl: null,
  hasPassword: true,
  role: "player",
};

export async function mockSignedInApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth" && request.method() === "GET") return route.fulfill({ json: { user } });
    if (url.pathname === "/api/friends" && request.method() === "GET") return route.fulfill({ json: { friends: [], incomingRequests: [], outgoingRequests: [], blocked: [], recent: [], gameInvites: [] } });
    if (url.pathname === "/api/chat" && url.searchParams.get("view") === "overview") return route.fulfill({ json: { worldUnread: 0, directUnreads: {} } });
    if (url.pathname === "/api/chat" && request.method() === "GET") return route.fulfill({ json: { messages: [] } });
    if (url.pathname === "/api/chat" && request.method() === "POST") return route.fulfill({ json: { read: true } });
    if (url.pathname === "/api/lobby") return route.fulfill({ json: { rooms: [], counts: { main: 0, go: 0, gomoku: 0, reversi: 0 } } });
    if (url.pathname === "/api/rank") return route.fulfill({ json: { profiles: {}, position: null, leaderboard: [] } });
    if (url.pathname === "/api/history") return route.fulfill({ json: { records: [] } });
    if (url.pathname === "/api/saves") return route.fulfill({ json: { records: [], limit: 10 } });
    return route.fulfill({ status: 404, json: { error: { message: "mocked" } } });
  });
}

export async function expectNoHorizontalOverflow(page: Page) {
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewportWidth);
}
