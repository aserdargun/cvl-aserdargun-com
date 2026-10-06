import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/*.test.ts"],
    // The learning layer trains a small network for 250 full-batch iterations.
    // That is a few seconds of honest work locally and more on a shared CI
    // runner, so the default five seconds would report a timeout rather than a
    // failure.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});