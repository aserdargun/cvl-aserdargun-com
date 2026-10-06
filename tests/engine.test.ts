import { describe, expect, test } from "vitest";
import { balancedWeights, createNetwork, downsample, downsampleMask, predictMask, train } from "../src/engine/cnn";
import { bandedPrecisionRecall, intersectionOverUnion, spearmanRankCorrelation } from "../src/engine/metrics";
import {
  canny,
  close,
  connectedComponents,
  houghTransform,
  lineToSegment,
  lucasKanade,
  otsuThreshold,
  open,
  shiftImage,
  threshold,
} from "../src/engine/ops";
import { buildScene, objectMasks } from "../src/engine/scene";
import { LAYERS, contractRun, runLayer } from "../src/engine/pipeline";

const SEED = 20261006;

describe("determinism", () => {
  test("the same seed produces byte-identical scenes", () => {
    const a = buildScene({ seed: SEED });
    const b = buildScene({ seed: SEED });
    expect(Array.from(a.luminance)).toEqual(Array.from(b.luminance));
    expect(Array.from(a.truth.classes)).toEqual(Array.from(b.truth.classes));
    expect(Array.from(a.truth.depth)).toEqual(Array.from(b.truth.depth));
    expect(JSON.stringify(a.truth.lines)).toBe(JSON.stringify(b.truth.lines));
    expect(a.truth.shift).toEqual(b.truth.shift);
  });

  test("a different seed produces a different scene", () => {
    const a = buildScene({ seed: SEED });
    const b = buildScene({ seed: SEED + 1 });
    expect(Array.from(a.truth.classes)).not.toEqual(Array.from(b.truth.classes));
  });
});

describe("ground truth contract", () => {
  test("the painted key agrees with itself at IoU 1", () => {
    for (const seed of [SEED, SEED + 1, SEED + 2]) {
      const scene = buildScene({ seed });
      const masks = objectMasks(scene);
      expect(masks.size).toBe(scene.objects.length);
      for (const mask of masks.values()) {
        expect(intersectionOverUnion(mask, mask)).toBe(1);
      }
      const run = contractRun(scene);
      expect(run.metrics.selfIoU).toBe(1);
    }
  });

  test("every painted object id is accounted for exactly once", () => {
    const scene = buildScene({ seed: SEED });
    const ids = new Set<number>();
    for (let i = 0; i < scene.truth.classes.length; i += 1) {
      const id = scene.truth.classes[i];
      if (id !== 0) ids.add(id);
    }
    expect([...ids].sort((a, b) => a - b)).toEqual(scene.objects.map((object) => object.id));
  });
});

describe("edge detection", () => {
  test("Canny finds most of the painted boundary and stays inside the band", () => {
    const scene = buildScene({ seed: SEED });
    const measured = canny(scene.luminance, scene.size);
    const scores = bandedPrecisionRecall(measured, scene.truth.edges, scene.size, 1);
    expect(scores.recall).toBeGreaterThan(0.6);
    expect(scores.precision).toBeGreaterThan(0.7);
  });
});

describe("region segmentation", () => {
  test("threshold plus morphology recovers most objects", () => {
    const scene = buildScene({ seed: SEED });
    const level = otsuThreshold(scene.luminance);
    const cleaned = open(close(threshold(scene.luminance, scene.size, level), scene.size, 1), scene.size, 1);
    const components = connectedComponents(cleaned, scene.size);
    const masks = objectMasks(scene);
    let best = 0;
    for (const [, truth] of masks) {
      for (let label = 1; label <= components.count; label += 1) {
        const predicted = new Uint8Array(cleaned.length);
        for (let i = 0; i < predicted.length; i += 1) predicted[i] = components.labels[i] === label ? 1 : 0;
        best = Math.max(best, intersectionOverUnion(predicted, truth));
      }
    }
    expect(best).toBeGreaterThan(0.8);
  });
});

describe("line geometry", () => {
  test("Hough recovers the painted segments", () => {
    const scene = buildScene({ seed: SEED });
    const peaks = houghTransform(canny(scene.luminance, scene.size), scene.size, 12);
    const segments = peaks.map((peak) => lineToSegment(peak, scene.size));
    let matched = 0;
    const remaining = [...scene.truth.lines];
    for (const candidate of segments) {
      let bestIndex = -1;
      let bestScore = Infinity;
      remaining.forEach((line, index) => {
        const d = Math.abs(candidate.angle - line.angle) % Math.PI;
        const angleError = Math.min(d, Math.PI - d);
        const rhoError = Math.abs(candidate.rho - line.rho);
        const score = angleError + rhoError;
        if (angleError < (6 * Math.PI) / 180 && rhoError < 5 && score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      if (bestIndex >= 0) {
        matched += 1;
        remaining.splice(bestIndex, 1);
      }
    }
    expect(matched).toBe(scene.truth.lines.length);
  });
});

describe("motion", () => {
  test("Lucas-Kanade recovers the painted translation", () => {
    const scene = buildScene({ seed: SEED, texture: 0.25, decorations: false });
    const shifted = shiftImage(scene.luminance, scene.size, scene.truth.shift.dx, scene.truth.shift.dy);
    const field = lucasKanade(scene.luminance, shifted, scene.size, { window: 9, minEigenvalue: 0.0005, maxAnisotropy: 200 });
    let total = 0;
    let count = 0;
    for (let y = 8; y < scene.size.height - 8; y += 1) {
      for (let x = 8; x < scene.size.width - 8; x += 1) {
        const index = y * scene.size.width + x;
        if (field.valid[index] === 0) continue;
        total += Math.hypot(field.dx[index] - scene.truth.shift.dx, field.dy[index] - scene.truth.shift.dy);
        count += 1;
      }
    }
    expect(count).toBeGreaterThan(500);
    expect(total / count).toBeLessThan(1.3);
  });
});

describe("depth cue", () => {
  test("the ground-plane cue orders depth better than chance", () => {
    const scene = buildScene({ seed: SEED });
    const run = runLayer("depth", scene);
    expect(run.metrics.rankCorrelation).toBeGreaterThan(0.3);
    expect(spearmanRankCorrelation(Float64Array.from(scene.truth.depth), scene.truth.depth)).toBeCloseTo(1, 6);
  });
});

describe("learned path", () => {
  test("training reduces the loss and produces a usable mask", () => {
    const scene = buildScene({ seed: SEED });
    const small = downsample(scene.luminance, scene.size, 2);
    const truth = downsampleMask(scene.truth.foreground, scene.size, 2);
    const net = createNetwork(scene.seed + 3);
    const weights = balancedWeights(truth);
    const trained = train(net, small.image, truth, small.size, { iterations: 250, learningRate: 0.3, stride: 1, positiveWeight: weights.positiveWeight, negativeWeight: weights.negativeWeight });
    expect(trained.loss.length).toBe(250);
    expect(trained.loss.at(-1)!).toBeLessThan(trained.loss[0]);
    const predicted = predictMask(trained.net, small.image, small.size);
    expect(intersectionOverUnion(predicted, truth)).toBeGreaterThan(0.7);
  });
});

describe("pipeline", () => {
  test("every layer runs and reports a measured number", () => {
    const scene = buildScene({ seed: SEED });
    for (const layer of LAYERS) {
      const run = runLayer(layer, scene);
      expect(run.experimentId).toBe(layer);
      expect(run.schemaVersion).toBe("1.0");
      expect(Object.keys(run.metrics).length).toBeGreaterThan(0);
      const numbers = Object.values(run.metrics).filter((value) => typeof value === "number") as number[];
      expect(numbers.length).toBeGreaterThan(0);
      for (const value of numbers) expect(Number.isFinite(value)).toBe(true);
      expect(numbers.length).toBeGreaterThan(0);
    }
  });

  test("runs are reproducible", () => {
    const scene = buildScene({ seed: SEED });
    const a = runLayer("edges", scene).metrics;
    const b = runLayer("edges", scene).metrics;
    expect(a).toEqual(b);
  });
});