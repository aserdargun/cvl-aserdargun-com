import { expect, test } from "@playwright/test";

// The laboratory must render, measure and report in a real browser. Anything
// asserted here is asserted against the same public surface a reader sees.

test.describe("laboratory", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("CVL");
  });

  test("shows the scene, the answer key and the measurement", async ({ page }) => {
    await expect(page.locator(".panel")).toHaveCount(3);
    await expect(page.locator(".panel figcaption").first()).toBeVisible();
    const sizes = await page.locator(".panel canvas").evaluateAll((nodes) =>
      nodes.map((node) => {
        const canvas = node as HTMLCanvasElement;
        return { w: canvas.width, h: canvas.height };
      }),
    );
    for (const size of sizes) {
      expect(size.w).toBe(160);
      expect(size.h).toBe(120);
    }
  });

  test("every layer reports a measured number", async ({ page }) => {
    for (const layer of ["signal", "filtering", "edges", "regions", "geometry", "learning", "depth", "motion"]) {
      await page.getByTestId(`layer-${layer}`).click();
      const table = page.getByTestId("metrics-table");
      await expect(table).toBeVisible();
      const rows = await table.locator("tr").count();
      expect(rows, `layer ${layer} must report at least one metric`).toBeGreaterThan(0);
    }
  });

  test("the same seed reproduces the same measurement", async ({ page }) => {
    await page.getByTestId("layer-edges").click();
    await expect(page.getByTestId("metrics-table")).toBeVisible();
    const first = await page.getByTestId("metrics-table").innerText();
    await page.getByTestId("seed-input").fill("4242");
    await page.getByTestId("layer-edges").click();
    const changed = await page.getByTestId("metrics-table").innerText();
    expect(changed).not.toBe(first);
    await page.getByTestId("seed-input").fill("20261006");
    await page.getByTestId("layer-edges").click();
    const back = await page.getByTestId("metrics-table").innerText();
    expect(back).toBe(first);
  });

  test("switching language changes the reading, not the numbers", async ({ page }) => {
    await page.getByTestId("layer-depth").click();
    await expect(page.getByTestId("metrics-table")).toBeVisible();
    const before = await page.getByTestId("metrics-table").innerText();
    await page.getByTestId("locale-toggle").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Computer Vision Laboratory");
    const after = await page.getByTestId("metrics-table").innerText();
    expect(after).toBe(before);
  });

  test("the engine report names every layer and its honest reason", async ({ page }) => {
    const summary = await page.getByTestId("engine-summary").innerText();
    expect(summary).toContain("CPU");
    for (const layer of ["signal", "filtering", "edges", "regions", "geometry", "learning", "depth", "motion"]) {
      await expect(page.getByTestId(`capability-${layer}`)).toBeVisible();
    }
    await expect(page.getByTestId("adapter-probe")).toContainText("secureContext");
  });

  test("nothing overflows horizontally on a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("CVL");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
