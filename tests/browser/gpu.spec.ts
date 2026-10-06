import { expect, test } from "@playwright/test";

// This package does not skip. A laboratory that quietly passes when the GPU
// path is untested is a laboratory whose GPU claim has never been checked, and
// a missing adapter is a fact about the machine that has to be reported rather
// than absorbed.

const SIGMA = 1.4;

test("a real WebGPU adapter exists and agrees with the CPU within 1e-3", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("CVL");

  const result = await page.evaluate(async (sigma) => {
    const surface = (window as unknown as { __cvl: typeof window.__cvl }).__cvl;
    const { device, probe } = await surface.probeWebGpu();
    if (!device) return { probe, parity: null };
    const scene = surface.buildScene({ seed: 20261006 });
    const reference = surface.gaussianBlur(scene.luminance, scene.size, sigma);
    const parity = await surface.gpuGaussianBlurAndCompare(device, scene.luminance, scene.size, sigma, reference);
    return { probe, parity };
  }, SIGMA);

  expect(
    result.probe.deviceFound,
    `no WebGPU device: secureContext=${result.probe.secureContext} navigator.gpu=${result.probe.hasNavigatorGpu} ` +
      `adapter=${result.probe.adapterFound} reason=${result.probe.unavailableReason ?? "none"}`,
  ).toBe(true);

  expect(result.parity, "a device was found but no parity measurement was returned").not.toBeNull();
  expect(result.parity!.withinTolerance, `rmse=${result.parity!.rmse} tolerance=${result.parity!.tolerance}`).toBe(true);
});

test("the page reports the adapter chain step by step", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("CVL");
  await expect(page.getByTestId("adapter-probe")).toContainText("adapter=");
  await expect(page.getByTestId("adapter-probe")).toContainText("device=");
  const summary = await page.getByTestId("engine-summary").innerText();
  expect(summary.length).toBeGreaterThan(0);
});