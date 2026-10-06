import { angleDistance, dilate } from "./ops";
import type { Depth, FlowField, Image, LineSegment, Mask, Metrics, Size } from "./types";

/**
 * Every metric compares a measurement against the answer key that was painted
 * with the scene. None of them compares a result with itself, and none of them
 * reports a number without stating what the correct answer was.
 */

export function intersectionOverUnion(predicted: Mask, truth: Mask): number {
  let intersection = 0;
  let predictedCount = 0;
  let truthCount = 0;
  for (let i = 0; i < truth.length; i += 1) {
    if (predicted[i] === 1) predictedCount += 1;
    if (truth[i] === 1) truthCount += 1;
    if (predicted[i] === 1 && truth[i] === 1) intersection += 1;
  }
  // Set union, not a sum: |P ∪ T| = |P| + |T| - |P ∩ T|.
  const union = predictedCount + truthCount - intersection;
  return union === 0 ? 1 : intersection / union;
}

export function diceCoefficient(predicted: Mask, truth: Mask): number {
  let intersection = 0;
  let sum = 0;
  for (let i = 0; i < truth.length; i += 1) {
    if (predicted[i] === 1) sum += 1;
    if (truth[i] === 1) sum += 1;
    if (predicted[i] === 1 && truth[i] === 1) intersection += 1;
  }
  return sum === 0 ? 1 : (2 * intersection) / sum;
}

/**
 * Precision and recall inside a tolerance band. A detector that marks the
 * pixel just inside the boundary is one pixel late, not a false positive, so the
 * band has to be stated rather than assumed.
 */
export function bandedPrecisionRecall(predicted: Mask, truth: Mask, size: Size, tolerance: number): { precision: number; recall: number } {
  const band = tolerance > 0 ? dilate(truth, size, tolerance) : truth;
  let matched = 0;
  let predictedCount = 0;
  let truthCount = 0;
  for (let i = 0; i < truth.length; i += 1) {
    if (predicted[i] === 1) predictedCount += 1;
    if (truth[i] === 1) truthCount += 1;
    if (predicted[i] === 1 && band[i] === 1) matched += 1;
  }
  return {
    precision: predictedCount === 0 ? 0 : matched / predictedCount,
    recall: truthCount === 0 ? 0 : matched / truthCount,
  };
}

export function peakSignalToNoiseRatio(reference: Image, measured: Image): number {
  let squaredError = 0;
  for (let i = 0; i < reference.length; i += 1) squaredError += (reference[i] - measured[i]) ** 2;
  const mse = squaredError / reference.length;
  if (mse === 0) return Number.POSITIVE_INFINITY;
  return 10 * Math.log10(1 / mse);
}

export function meanAbsoluteError(reference: Image, measured: Image): number {
  let total = 0;
  for (let i = 0; i < reference.length; i += 1) total += Math.abs(reference[i] - measured[i]);
  return total / reference.length;
}

/** Structural similarity on 8x8 windows, averaged. */
export function structuralSimilarity(reference: Image, measured: Image, size: Size): number {
  const windowSize = 8;
  const c1 = 0.01 ** 2;
  const c2 = 0.03 ** 2;
  let total = 0;
  let count = 0;
  for (let y = 0; y + windowSize <= size.height; y += windowSize) {
    for (let x = 0; x + windowSize <= size.width; x += windowSize) {
      let meanA = 0;
      let meanB = 0;
      for (let wy = 0; wy < windowSize; wy += 1) {
        for (let wx = 0; wx < windowSize; wx += 1) {
          meanA += reference[(y + wy) * size.width + x + wx];
          meanB += measured[(y + wy) * size.width + x + wx];
        }
      }
      const n = windowSize * windowSize;
      meanA /= n;
      meanB /= n;
      let varA = 0;
      let varB = 0;
      let covariance = 0;
      for (let wy = 0; wy < windowSize; wy += 1) {
        for (let wx = 0; wx < windowSize; wx += 1) {
          const a = reference[(y + wy) * size.width + x + wx] - meanA;
          const b = measured[(y + wy) * size.width + x + wx] - meanB;
          varA += a * a;
          varB += b * b;
          covariance += a * b;
        }
      }
      varA /= n - 1;
      varB /= n - 1;
      covariance /= n - 1;
      total += ((2 * meanA * meanB + c1) * (2 * covariance + c2)) / ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));
      count += 1;
    }
  }
  return count === 0 ? 1 : total / count;
}

function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) result[order[k].index] = averageRank;
    i = j + 1;
  }
  return result;
}

/**
 * Spearman rank correlation. Depth is an ordering, not a scale: the cue estimate
 * is allowed to be monotone but not linearly scaled, so rank correlation is the
 * honest measurement and Pearson on raw values would not be.
 */
export function spearmanRankCorrelation(predicted: Float64Array, truth: Float64Array, mask?: Mask): number {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < truth.length; i += 1) {
    if (mask && mask[i] === 0) continue;
    a.push(predicted[i]);
    b.push(truth[i]);
  }
  if (a.length < 2) return 0;
  const rankA = ranks(a);
  const rankB = ranks(b);
  const n = a.length;
  const meanA = rankA.reduce((sum, value) => sum + value, 0) / n;
  const meanB = rankB.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = rankA[i] - meanA;
    const db = rankB[i] - meanB;
    numerator += da * db;
    denominatorA += da * da;
    denominatorB += db * db;
  }
  if (denominatorA === 0 || denominatorB === 0) return 0;
  return numerator / Math.sqrt(denominatorA * denominatorB);
}

export interface LineMatch {
  precision: number;
  recall: number;
  angleErrorDeg: number;
  rhoError: number;
}

/** One-to-one greedy matching in normal form, strongest peak first. */
export function matchLines(
  predicted: LineSegment[],
  truth: LineSegment[],
  options: { angleToleranceDeg: number; rhoTolerance: number },
): LineMatch {
  const angleTolerance = (options.angleToleranceDeg * Math.PI) / 180;
  const remaining = [...truth];
  let matched = 0;
  let angleErrorTotal = 0;
  let rhoErrorTotal = 0;
  for (const candidate of predicted) {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    remaining.forEach((line, index) => {
      const angleError = angleDistance(candidate.angle, line.angle);
      const rhoError = Math.abs(candidate.rho - line.rho);
      if (angleError > angleTolerance || rhoError > options.rhoTolerance) return;
      const score = angleError / angleTolerance + rhoError / options.rhoTolerance;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      const line = remaining[bestIndex];
      remaining.splice(bestIndex, 1);
      matched += 1;
      angleErrorTotal += angleDistance(candidate.angle, line.angle);
      rhoErrorTotal += Math.abs(candidate.rho - line.rho);
    }
  }
  return {
    precision: predicted.length === 0 ? 0 : matched / predicted.length,
    recall: truth.length === 0 ? 0 : matched / truth.length,
    angleErrorDeg: matched === 0 ? Number.NaN : (angleErrorTotal / matched) * (180 / Math.PI),
    rhoError: matched === 0 ? Number.NaN : rhoErrorTotal / matched,
  };
}

export interface FlowError {
  meanEndpointError: number;
  medianEndpointError: number;
  validRatio: number;
}

/** Endpoint error in pixels over the windows the solver was willing to trust. */
export function flowError(field: FlowField, truthShift: { dx: number; dy: number }, margin: number, size: Size): FlowError {
  const errors: number[] = [];
  let valid = 0;
  let considered = 0;
  for (let y = margin; y < size.height - margin; y += 1) {
    for (let x = margin; x < size.width - margin; x += 1) {
      const index = y * size.width + x;
      considered += 1;
      if (field.valid[index] === 0) continue;
      valid += 1;
      errors.push(Math.hypot(field.dx[index] - truthShift.dx, field.dy[index] - truthShift.dy));
    }
  }
  errors.sort((a, b) => a - b);
  const mean = errors.length === 0 ? Number.NaN : errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const median = errors.length === 0 ? Number.NaN : errors[Math.floor(errors.length / 2)];
  return { meanEndpointError: mean, medianEndpointError: median, validRatio: considered === 0 ? 0 : valid / considered };
}

/** Root mean square error, used for the CPU/GPU parity comparison. */
export function rootMeanSquareError(reference: ArrayLike<number>, measured: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < reference.length; i += 1) total += (reference[i] - measured[i]) ** 2;
  return Math.sqrt(total / reference.length);
}

export function round(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function summariseMetrics(metrics: Metrics, digits = 6): Metrics {
  const out: Metrics = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (value === null) {
      out[key] = null;
      continue;
    }
    if (typeof value === "number") {
      // A measurement that cannot be taken is reported as absent, never as NaN.
      out[key] = Number.isFinite(value) ? round(value, digits) : null;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export type { Depth };