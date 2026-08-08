import { expect, test } from "@playwright/test";

test("authenticated platform and room sockets deliver live events", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "single realtime integration run");
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  const registration = await page.request.post("/api/auth", {
    data: {
      type: "register",
      phone: `139${suffix}`,
      displayName: `实时${suffix.slice(-6)}`,
      password: "realtime-test-password",
      inviteCode: "abcd123",
    },
  });
  expect(registration.status()).toBe(201);
  await page.goto("/");

  await page.evaluate(() => {
    const state = window as typeof window & { __platformEvents?: string[]; __platformSocket?: WebSocket };
    state.__platformEvents = [];
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    state.__platformSocket = new WebSocket(`${protocol}//${location.host}/api/platform-realtime`);
    state.__platformSocket.addEventListener("message", (event) => state.__platformEvents?.push(String(event.data)));
  });
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __platformEvents?: string[] }).__platformEvents ?? []))
    .toContainEqual(expect.stringContaining('"type":"connected"'));

  const message = await page.request.post("/api/chat", { data: { type: "send", channel: "world", hall: "main", body: `实时通道测试 ${suffix}` } });
  expect(message.status()).toBe(200);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __platformEvents?: string[] }).__platformEvents ?? []))
    .toContainEqual(expect.stringContaining('"type":"chat_updated"'));

  const created = await page.request.post("/api/match", { data: { type: "create", game: "gomoku", size: 15, colorPreference: "black" } });
  expect(created.status()).toBe(201);
  const roomId = (await created.json() as { room: { id: string } }).room.id;
  await page.evaluate((id) => {
    const state = window as typeof window & { __roomEvents?: string[]; __roomSocket?: WebSocket };
    state.__roomEvents = [];
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    state.__roomSocket = new WebSocket(`${protocol}//${location.host}/api/realtime?roomId=${encodeURIComponent(id)}`);
    state.__roomSocket.addEventListener("message", (event) => state.__roomEvents?.push(String(event.data)));
  }, roomId);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __roomEvents?: string[] }).__roomEvents ?? []))
    .toContainEqual(expect.stringContaining('"type":"connected"'));

  await page.request.post("/api/match", { data: { type: "leave", roomId } });
  await page.evaluate(() => {
    const state = window as typeof window & { __platformSocket?: WebSocket; __roomSocket?: WebSocket };
    state.__platformSocket?.close();
    state.__roomSocket?.close();
  });
});
