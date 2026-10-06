import { defineConfig, devices } from "@playwright/test";

// The laboratory must render and measure identically in a real browser, so the
// browser tests drive the built application rather than a fixture page.
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  // A measurement runs on a timer, and the learning layer trains a network in
  // the page. On a shared runner that takes longer than the five-second default,
  // so waiting for a result is given room rather than reporting a timeout.
  expect: { timeout: 60_000 },
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
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Headless Chromium exposes navigator.gpu but hands back no adapter
        // unless the software backend is requested explicitly. The laboratory
        // reports a null adapter as a fact rather than skipping, so the test
        // environment has to make the adapter real.
        launchOptions: {
          args: [
            "--enable-unsafe-webgpu",
            "--enable-features=Vulkan",
            "--use-webgpu-adapter=swiftshader",
            "--use-angle=swiftshader",
            "--disable-gpu-sandbox",
          ],
        },
      },
    },
  ],
});
