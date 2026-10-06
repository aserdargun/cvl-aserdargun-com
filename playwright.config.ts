import { defineConfig, devices } from "@playwright/test";

// The laboratory must render and measure identically in a real browser, so the
// browser tests drive the built application rather than a fixture page.
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.CVL_BASE_URL ?? "http://127.0.0.1:8073",
    trace: "off",
  },
  webServer: process.env.CVL_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run preview",
        url: "http://127.0.0.1:8073",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
