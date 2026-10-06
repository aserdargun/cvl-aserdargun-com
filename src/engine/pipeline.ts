import { balancedWeights, createNetwork, downsample, downsampleMask, predictMask, train } from "./cnn";
import { depthMeasurement } from "./depth";
import {
  bandedPrecisionRecall,
  diceCoefficient,
  flowError,
  intersectionOverUnion,
  matchLines,
  meanAbsoluteError,
  peakSignalToNoiseRatio,
  rootMeanSquareError,
  spearmanRankCorrelation,
  structuralSimilarity,
  summariseMetrics,
} from "./metrics";
import {
  addNoise,
  canny,
  close,
  connectedComponents,
  convolve2d,
  gaussianBlur,
  gaussianKernel,
  houghTransform,
  lineToSegment,
  lucasKanade,
  otsuThreshold,
  open,
  quantize,
  shiftImage,
  threshold,
} from "./ops";
import { buildScene, objectMasks } from "./scene";
import type { ExperimentRun, LayerId, Mask, Scene } from "./types";

/**
 * The measurement pipeline.
 *
 * Every layer returns an `ExperimentRun` that carries the answer key it was
 * scored against, so a number in the interface can always be traced back to the
 * pixels that made it true. Nothing here carries a value across runs.
 */

export const LAYERS: LayerId[] = ["signal", "filtering", "edges", "regions", "geometry", "learning", "depth", "motion"];

const DEFAULT_SEED = 20261006;

/** Grating amplitude for the motion measurement; see buildScene's texture note. */
const MOTION_TEXTURE = 0.25;

/** Contract: the generator's own key must agree with itself exactly. */
export function contractRun(scene: Scene): ExperimentRun {
  const masks = objectMasks(scene);
  let worst = 1;
  for (const mask of masks.values()) worst = Math.min(worst, intersectionOverUnion(mask, mask));
  return {
    schemaVersion: "1.0",
    experimentId: "signal",
    sceneSeed: scene.seed,
    engineId: "cpu",
    engineDescribe: "contract check, no operator applied",
    truth: { mask: scene.truth.foreground, label: "painted foreground" },
    measured: { mask: scene.truth.foreground, label: "key re-read from the class map" },
    metrics: summariseMetrics({ selfIoU: worst, objects: scene.objects.length, lines: scene.truth.lines.length }),
    notes: "A self-intersection below 1.0 means the picture and the answer key disagree, which invalidates every other layer.",
  };
}

function signalLayer(scene: Scene): ExperimentRun {
  const quantised = quantize(scene.luminance, 32);
  const noisy = addNoise(quantised, 0.05, scene.seed + 17);
  return {
    schemaVersion: "1.0",
    experimentId: "signal",
    sceneSeed: scene.seed,
    engineId: "cpu",
    engineDescribe: "quantise to 32 levels, then additive Gaussian noise sigma 0.05",
    truth: { mask: scene.truth.foreground, label: "painted scene" },
    measured: { mask: scene.truth.foreground, label: "32 levels plus noise" },
    metrics: summariseMetrics({
      psnr: peakSignalToNoiseRatio(scene.luminance, noisy),
      ssim: structuralSimilarity(scene.luminance, noisy, scene.size),
      mae: meanAbsoluteError(scene.luminance, noisy),
    }),
    notes: "The answer key is the unquantised scene. PSNR and SSIM say how much of it survives the 32-level grid and the noise.",
  };
}

function filteringLayer(scene: Scene): ExperimentRun {
  const sigma = 1.4;
  const separable = gaussianBlur(scene.luminance, scene.size, sigma);
  const kernel = gaussianKernel(sigma);
  // The naive 2D path is the definition; the separable path is the optimisation.
  // Measuring them against each other is the only honest check on the shortcut.
  const kernelWidth = kernel.length;
  const naive = convolve2d(scene.luminance, scene.size, buildOuterProduct(kernel), kernelWidth, kernelWidth);
  const flat = new Float64Array(scene.luminance.length);
  for (let i = 0; i < separable.length; i += 1) flat[i] = separable[i];
  let energyBefore = 0;
  for (let i = 0; i < scene.luminance.length; i += 1) energyBefore += scene.luminance[i] ** 2;
  let energyAfter = 0;
  for (let i = 0; i < separable.length; i += 1) energyAfter += separable[i] ** 2;
  return {
    schemaVersion: "1.0",
    experimentId: "filtering",
    sceneSeed: scene.seed,
    engineId: "cpu",
    engineDescribe: `separable Gaussian sigma ${sigma} against the naive 2D convolution`,
    truth: { mask: scene.truth.foreground, label: "naive 2D convolution" },
    measured: { mask: scene.truth.foreground, label: "separable convolution" },
    metrics: summariseMetrics({
      separableVsNaiveRmse: rootMeanSquareError(naive, flat),
      maxAbsDifference: maxAbsDifference(naive, flat),
      energyRatio: energyBefore === 0 ? 0 : energyAfter / energyBefore,
    }),
    notes: "Separable filtering is only legitimate if it reproduces the two-dimensional convolution. The RMSE is that claim, measured.",
  };
}

function buildOuterProduct(kernel: number[]): number[] {
  const out: number[] = [];
  for (const a of kernel) for (const b of kernel) out.push(a * b);
  return out;
}

function maxAbsDifference(a: Float64Array, b: Float64Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i += 1) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

function edgesLayer(scene: Scene): ExperimentRun {
  const measured = canny(scene.luminance, scene.size);
  const scores = bandedPrecisionRecall(measured, scene.truth.edges, scene.size, 1);
  return {
    schemaVersion: "1.0",
    experimentId: "edges",
    sceneSeed: scene.seed,
    engineId: "cpu",
    engineDescribe: "Gaussian sigma 1.2, Sobel, non-maximum suppression, hysteresis 0.6/0.3",
    truth: { mask: scene.truth.edges, label: "painted object boundary" },
    measured: { mask: measured, label: "Canny edges" },
    metrics: summariseMetrics({ precision: scores.precision, recall: scores.recall, f1: f1(scores.precision, scores.recall) }),
    notes: "Scored inside a one-pixel band. A detector that marks the pixel just inside the boundary is one pixel late, not a false positive.",
  };
}

function regionsLayer(scene: Scene): ExperimentRun {
  const level = otsuThreshold(scene.luminance);
  const raw = threshold(scene.luminance, scene.size, level);
  const cleaned = open(close(raw, scene.size, 1), scene.size, 1);
  const components = connectedComponents(cleaned, scene.size);
  const masks = objectMasks(scene);

  // Component labels are arbitrary, so a detected region is matched to the
  // object it overlaps most. Matching on the label alone would report zero
  // overlap for a perfect segmentation, which measures nothing.
  const detections: { label: number; area: number; scores: { id: number; iou: number }[] }[] = [];
  for (let label = 1; label <= components.count; label += 1) {
    const area = components.sizes[label - 1] ?? 0;
    if (area < MIN_COMPONENT_AREA) continue;
    const predicted: Mask = new Uint8Array(cleaned.length);
    for (let i = 0; i < predicted.length; i += 1) predicted[i] = components.labels[i] === label ? 1 : 0;
    const scores = [...masks.entries()].map(([id, truth]) => ({ id, iou: intersectionOverUnion(predicted, truth) }));
    detections.push({ label, area, scores });
  }

  const takenObjects = new Set<number>();
  const matched: number[] = [];
  for (const detection of [...detections].sort((a, b) => Math.max(...b.scores.map((s) => s.iou)) - Math.max(...a.scores.map((s) => s.iou)))) {
    const best = detection.scores.filter((s) => !takenObjects.has(s.id)).sort((a, b) => b.iou - a.iou)[0];
    // A near-zero overlap is a speckle that happens to sit near an object, not a
    // detection of it. Counting it as a match would flatter the mean.
    if (!best || best.iou < MIN_MATCH_IOU) continue;
    takenObjects.add(best.id);
    matched.push(best.iou);
  }

  const meanIou = matched.length === 0 ? 0 : matched.reduce((sum, value) => sum + value, 0) / matched.length;
  return {
    schemaVersion: "1.0",
    experimentId: "regions",
    sceneSeed: scene.seed,
    engineId: "cpu",
    engineDescribe: `Otsu threshold ${level.toFixed(4)}, closing then opening, 4-connected labelling, matched by overlap`,
    truth: { mask: scene.truth.foreground, label: "painted object masks" },
    measured: { mask: cleaned, label: "thresholded components" },
    metrics: summariseMetrics({
      otsuLevel: level,
      meanIoU: meanIou,
      worstMatchedIoU: matched.length === 0 ? null : Math.min(...matched),
      matchedObjects: matched.length,
      missedObjects: masks.size - matched.length,
      detections: detections.length,
      objects: scene.objects.length,
      spuriousDetections: detections.length - matched.length,
    }),
    notes: "A dark object and the graded background can land on the same side of a single global threshold; a missed object is counted as missed rather than hidden by relabelling.",
  };
}

/** Below this area a blob is speckle rather than an object. */
const MIN_COMPONENT_AREA = 12;

/** An overlap below this does not count as having found the object. */
const MIN_MATCH_IOU = 0.2;

function geometryLayer(scene: Scene): ExperimentRun {
  const edgeMask = canny(scene.luminance, scene.size);
  const peaks = houghTransform(edgeMask, scene.size, 12);
  const predicted = peaks.map((peak) => lineToSegment(peak, scene.size));
  const scores = matchLines(predicted, scene.truth.lines, { angleToleranceDeg: 6, rhoTolerance: 5 });
  return {
    schemaVersion: "1.0",
    experimentId: "geometry",
    sceneSeed: scene.seed,
    engineId: "cpu",
    engineDescribe: "Canny edges into a 180-bin Hough transform, greedy one-to-one matching",
    truth: { mask: scene.truth.foreground, label: "painted line segments" },
    measured: { mask: edgeMask, label: `${predicted.length} Hough segments` },
    metrics: summariseMetrics({
      precision: scores.precision,
      recall: scores.recall,
      angleErrorDeg: scores.angleErrorDeg,
      rhoError: scores.rhoError,
      predictedLines: predicted.length,
      truthLines: scene.truth.lines.length,
    }),
    notes: "Lines are matched in normal form. A peak with the wrong angle is a different line, not a slightly worse one.",
  };
}

function learningLayer(scene: Scene): ExperimentRun {
  const factor = 2;
  const small = downsample(scene.luminance, scene.size, factor);
  const truthSmall = downsampleMask(scene.truth.foreground, scene.size, factor);
  const weights = balancedWeights(truthSmall);
  const net = createNetwork(scene.seed + 3);
  const trained = train(net, small.image, truthSmall, small.size, {
    iterations: 250,
    learningRate: 0.3,
    stride: 1,
    positiveWeight: weights.positiveWeight,
    negativeWeight: weights.negativeWeight,
  });
  const predicted = predictMask(trained.net, small.image, small.size);

  // The hand written path, scored on exactly the same downsampled pixels.
  const level = otsuThreshold(small.image);
  const handRaw = threshold(small.image, small.size, level);
  const handCleaned = close(handRaw, small.size, 1);

  const learnedIoU = intersectionOverUnion(predicted, truthSmall);
  const handIoU = intersectionOverUnion(handCleaned, truthSmall);
  const loss = trained.loss;
  const positiveRate = truthSmall.reduce((sum, value) => sum + value, 0) / truthSmall.length;
  return {
    schemaVersion: "1.0",
    experimentId: "learning",
    sceneSeed: scene.seed,
    engineId: "cpu",
    engineDescribe: `5x5 and 3x3 convolution, 8 channels each, trained at run time for ${loss.length} iterations`,
    truth: { mask: truthSmall, label: "painted masks at half resolution" },
    measured: { mask: predicted, label: "learned path at half resolution" },
    metrics: summariseMetrics({
      learnedIoU: learnedIoU,
      handWrittenIoU: handIoU,
      iouDelta: learnedIoU - handIoU,
      finalLoss: loss.length === 0 ? null : loss[loss.length - 1],
      initialLoss: loss.length === 0 ? null : loss[0],
      foregroundShare: positiveRate,
      positiveWeight: weights.positiveWeight,
      workSize: `${small.size.width}x${small.size.height}`,
    }),
    notes: "Both paths are scored on the same pixels against the same key. The learning rate, iteration count, class weights and initialisation seed are all fixed, so the difference is the method and not the luck.",
  };
}

function depthLayer(scene: Scene): ExperimentRun {
  const { depth, foreground } = depthMeasurement(scene, { horizon: 0.22, contrastWeight: 0.35 });
  const pixelRank = spearmanRankCorrelation(depth, scene.truth.depth);

  // A monocular cue produces a depth for a region, not for a pixel. Comparing
  // per-pixel against a constant painted depth per object would only measure
  // how much a cue varies inside a flat region, which is not the claim.
  const masks = objectMasks(scene);
  const predicted: number[] = [];
  const truth: number[] = [];
  for (const object of scene.objects) {
    const mask = masks.get(object.id)!;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] === 0) continue;
      sum += depth[i];
      count += 1;
    }
    if (count === 0) continue;
    predicted.push(sum / count);
    truth.push(object.depth);
  }
  const objectRank = predicted.length >= 2 ? spearmanRankCorrelation(Float64Array.from(predicted), Float64Array.from(truth)) : null;
  return {
    schemaVersion: "1.0",
    experimentId: "depth",
    sceneSeed: scene.seed,
    engineId: "cpu",
    engineDescribe: "ground-plane prior at y=0.22 mixed 0.35 with a local-contrast term",
    truth: { mask: foreground, label: "painted inverse depth" },
    measured: { mask: foreground, label: "monocular cue estimate" },
    metrics: summariseMetrics({
      rankCorrelation: pixelRank,
      objectRankCorrelation: objectRank,
      objectsMeasured: predicted.length,
    }),
    notes: "Rank correlation, not a scale error: a single camera fixes an ordering, not a distance. The object-level number is the honest one, because a cue can only claim an ordering between regions, not inside one.",
  };
}

function motionLayer(scene: Scene): ExperimentRun {
  // A flat synthetic field gives a windowed flow solver nothing to track, so
  // this layer measures on a textured variant of the same seed. The translation
  // it reports is still the painted one, and the texture is painted in the same
  // pass, so the answer key is exactly as trustworthy as in any other layer.
  const textured = buildScene({
    seed: scene.seed,
    width: scene.size.width,
    height: scene.size.height,
    texture: MOTION_TEXTURE,
    decorations: false,
  });
  const shifted = shiftImage(textured.luminance, textured.size, textured.truth.shift.dx, textured.truth.shift.dy);
  const field = lucasKanade(textured.luminance, shifted, textured.size, { window: 9, minEigenvalue: 0.0005, maxAnisotropy: 200 });
  const error = flowError(field, textured.truth.shift, 8, textured.size);
  return {
    schemaVersion: "1.0",
    experimentId: "motion",
    sceneSeed: scene.seed,
    engineId: "cpu",
    engineDescribe: `Lucas-Kanade, 9x9 window, textured scene without line decorations, shift (${textured.truth.shift.dx}, ${textured.truth.shift.dy})`,
    truth: { mask: textured.truth.foreground, label: "painted translation" },
    measured: { mask: textured.truth.foreground, label: "sparse flow field" },
    metrics: summariseMetrics({
      meanEndpointError: error.meanEndpointError,
      medianEndpointError: error.medianEndpointError,
      validRatio: error.validRatio,
      shiftDx: textured.truth.shift.dx,
      shiftDy: textured.truth.shift.dy,
      textureAmplitude: MOTION_TEXTURE,
    }),
    notes: "The displacement is known because the laboratory painted it. Windows that are locally flat are reported invalid rather than given a confident number, so the valid ratio is part of the result. The one-pixel line decorations are omitted here because they are narrower than the flow window.",
  };
}

export function runLayer(layer: LayerId, scene: Scene): ExperimentRun {
  switch (layer) {
    case "signal":
      return signalLayer(scene);
    case "filtering":
      return filteringLayer(scene);
    case "edges":
      return edgesLayer(scene);
    case "regions":
      return regionsLayer(scene);
    case "geometry":
      return geometryLayer(scene);
    case "learning":
      return learningLayer(scene);
    case "depth":
      return depthLayer(scene);
    case "motion":
      return motionLayer(scene);
  }
}

export function runAll(seed = DEFAULT_SEED): { scene: Scene; runs: ExperimentRun[] } {
  const scene = buildScene({ seed });
  return { scene, runs: LAYERS.map((layer) => runLayer(layer, scene)) };
}

export function f1(precision: number, recall: number): number {
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export { buildScene, diceCoefficient, gaussianKernel };