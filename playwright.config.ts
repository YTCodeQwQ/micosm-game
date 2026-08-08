import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 7_000, toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.015 } },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome" } },
    { name: "mobile-small", use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome", viewport: { width: 320, height: 568 } } },
    { name: "mobile-wide", use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome", viewport: { width: 430, height: 932 } } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "npm run dev -- --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
