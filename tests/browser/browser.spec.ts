import { expect, test } from "@playwright/test";

// The laboratory must render, measure and report in a real browser. Anything
// asserted here is asserted against the same public surface a reader sees.

// Waiting for the table alone can catch the previous layer's rows, because the
// measurement runs on a timer. Waiting for a row only the new layer produces
// makes the read unambiguous.
async function waitForMetric(page: import("@playwright/test").Page, key: string): Promise<void> {
  // The row text is the key and the value concatenated by the browser, so the
  // filter matches the key alone.
  await expect(page.getByTestId("metrics-table").locator("tr").filter({ hasText: key }).first()).toBeVisible();
}

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
    const headline: Record<string, string> = {
      signal: "psnr",
      filtering: "separableVsNaiveRmse",
      edges: "precision",
      regions: "meanIoU",
      geometry: "recall",
      learning: "iouDelta",
      depth: "objectsMeasured",
      motion: "validRatio",
    };
    for (const [layer, key] of Object.entries(headline)) {
      await page.getByTestId(`layer-${layer}`).click();
      await waitForMetric(page, key);
      expect(await page.getByTestId("metrics-table").locator("tr").count(), `layer ${layer}`).toBeGreaterThan(0);
    }
  });

  test("the same seed reproduces the same measurement", async ({ page }) => {
    await page.getByTestId("layer-edges").click();
    await waitForMetric(page, "precision");
    const first = await page.getByTestId("metrics-table").innerText();
    await page.getByTestId("seed-input").fill("4242");
    await page.getByTestId("layer-filtering").click();
    await page.getByTestId("layer-edges").click();
    await waitForMetric(page, "precision");
    expect(await page.getByTestId("metrics-table").innerText()).not.toBe(first);
    await page.getByTestId("seed-input").fill("20261006");
    await page.getByTestId("layer-filtering").click();
    await page.getByTestId("layer-edges").click();
    await waitForMetric(page, "precision");
    expect(await page.getByTestId("metrics-table").innerText()).toBe(first);
  });

  test("switching language changes the reading, not the numbers", async ({ page }) => {
    await page.getByTestId("layer-depth").click();
    await waitForMetric(page, "objectsMeasured");
    // Numbers only: a metric that could not be taken is written in the reader's
    // language, so the raw table text is expected to change.
    const numbers = () =>
      page.getByTestId("metrics-table").locator("tr").evaluateAll((rows) =>
        rows.map((row) => `${(row as HTMLElement).querySelector("th")!.textContent}=${(row as HTMLElement).querySelector("td")!.textContent}`),
      );
    const before = await numbers();
    await page.getByTestId("locale-toggle").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Computer Vision Laboratory");
    expect(await numbers()).toEqual(before);
  });

  test("the engine report names every layer and its honest reason", async ({ page }) => {
    const summary = await page.getByTestId("engine-summary").innerText();
    expect(summary).toContain("CPU");
    for (const layer of ["signal", "filtering", "edges", "regions", "geometry", "learning", "depth", "motion"]) {
      await expect(page.getByTestId(`capability-${layer}`)).toBeVisible();
    }
    await expect(page.getByTestId("adapter-probe")).toContainText("secureContext");
  });

  test("every layer sends the reader to VIS for its reading", async ({ page }) => {
    for (const layer of ["signal", "filtering", "edges", "regions", "geometry", "learning", "depth", "motion"]) {
      await page.getByTestId(`layer-${layer}`).click();
      const link = page.getByTestId("read-in-vis");
      // The explanation lives in the knowledge bank, so the link must leave.
      await expect(link).toHaveAttribute("href", `https://vis.aserdargun.com/#katman-${layer}`);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noreferrer");
    }
  });

  test("the laboratory does not explain what it measures", async ({ page }) => {
    // CVL measures; VIS explains. The question, the method, the boundary statement and the
    // sources were removed from this surface so that one explanation exists, not two.
    await page.getByTestId("layer-edges").click();
    await waitForMetric(page, "precision");
    const reading = page.getByTestId("reading");
    await expect(reading).toContainText("VIS");
    for (const heading of ["Yöntem", "Method", "Ne için değil", "What it is not for", "Kaynaklar", "Sources"]) {
      await expect(page.getByText(heading, { exact: true })).toHaveCount(0);
    }
    // No external citation is presented here; only the link to the bank that holds them.
    await expect(reading.locator("a")).toHaveCount(1);
  });

  test("nothing overflows horizontally on a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("CVL");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
