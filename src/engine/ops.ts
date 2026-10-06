import { Random } from "./rng";
import type { ClassMap, FlowField, Image, LineSegment, Mask, Size } from "./types";

/**
 * The operators under test.
 *
 * Every function here is deterministic and boundary-explicit. Border handling is
 * clamped rather than zero-padded, because a padded border manufactures edges
 * that were never in the scene and would quietly inflate an error measurement.
 */

const clamp = (value: number, low: number, high: number): number => (value < low ? low : value > high ? high : value);

/** The 3x3 Sobel kernel is a central difference multiplied by this factor. */
const SOBEL_CENTRAL_DIFFERENCE_SCALE = 8;

export function createImage(size: Size, fill = 0): Image {
  const image = new Float64Array(size.width * size.height);
  if (fill !== 0) image.fill(fill);
  return image;
}

export function createMask(size: Size): Mask {
  return new Uint8Array(size.width * size.height);
}

function at(image: Image, size: Size, x: number, y: number): number {
  const cx = clamp(x, 0, size.width - 1);
  const cy = clamp(y, 0, size.height - 1);
  return image[cy * size.width + cx];
}

export function cloneImage(image: Image): Image {
  return Float64Array.from(image);
}

/** Separable 1D convolution with clamped borders. */
function convolveSeparable(source: Image, size: Size, kernel: number[], horizontal: boolean): Image {
  const radius = (kernel.length - 1) / 2;
  const out = createImage(size);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k += 1) {
        const offset = k - radius;
        sum += (horizontal ? at(source, size, x + offset, y) : at(source, size, x, y + offset)) * kernel[k];
      }
      out[y * size.width + x] = sum;
    }
  }
  return out;
}

export function gaussianKernel(sigma: number): number[] {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel: number[] = [];
  let total = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const value = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(value);
    total += value;
  }
  return kernel.map((value) => value / total);
}

export function gaussianBlur(source: Image, size: Size, sigma: number): Image {
  const kernel = gaussianKernel(sigma);
  return convolveSeparable(convolveSeparable(source, size, kernel, true), size, kernel, false);
}

/** General 2D convolution, used by the learning layer to check the fast path. */
export function convolve2d(source: Image, size: Size, kernel: number[], kernelWidth: number, kernelHeight: number): Image {
  const radiusX = (kernelWidth - 1) / 2;
  const radiusY = (kernelHeight - 1) / 2;
  const out = createImage(size);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      let sum = 0;
      for (let ky = 0; ky < kernelHeight; ky += 1) {
        for (let kx = 0; kx < kernelWidth; kx += 1) {
          sum += at(source, size, x + kx - radiusX, y + ky - radiusY) * kernel[ky * kernelWidth + kx];
        }
      }
      out[y * size.width + x] = sum;
    }
  }
  return out;
}

export function quantize(source: Image, levels: number): Image {
  const out = createImage({ width: source.length, height: 1 });
  const last = levels - 1;
  for (let i = 0; i < source.length; i += 1) out[i] = Math.round(clamp(source[i], 0, 1) * last) / last;
  return out;
}

/** Deterministic additive Gaussian noise. The seed is derived, never ambient. */
export function addNoise(source: Image, sigma: number, seed: number): Image {
  const random = new Random(seed);
  const out = cloneImage(source);
  for (let i = 0; i < out.length; i += 1) out[i] = clamp(out[i] + random.normal(0, sigma), 0, 1);
  return out;
}

export function sobel(source: Image, size: Size): { gx: Image; gy: Image } {
  const gx = createImage(size);
  const gy = createImage(size);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const tl = at(source, size, x - 1, y - 1);
      const tc = at(source, size, x, y - 1);
      const tr = at(source, size, x + 1, y - 1);
      const ml = at(source, size, x - 1, y);
      const mr = at(source, size, x + 1, y);
      const bl = at(source, size, x - 1, y + 1);
      const bc = at(source, size, x, y + 1);
      const br = at(source, size, x + 1, y + 1);
      gx[y * size.width + x] = tr + 2 * mr + br - (tl + 2 * ml + bl);
      gy[y * size.width + x] = bl + 2 * bc + br - (tl + 2 * tc + tr);
    }
  }
  return { gx, gy };
}

/** Non-maximum suppression on the 8-neighbour circle, quantised to four directions. */
function suppress(magnitude: Image, gx: Image, gy: Image, size: Size): Image {
  const out = createImage(size);
  for (let y = 1; y < size.height - 1; y += 1) {
    for (let x = 1; x < size.width - 1; x += 1) {
      const index = y * size.width + x;
      const angle = ((Math.atan2(gy[index], gx[index]) * 180) / Math.PI + 180) % 180;
      let nx: number;
      let ny: number;
      if (angle < 22.5 || angle >= 157.5) {
        nx = 1;
        ny = 0;
      } else if (angle < 67.5) {
        nx = 1;
        ny = 1;
      } else if (angle < 112.5) {
        nx = 0;
        ny = 1;
      } else {
        nx = -1;
        ny = 1;
      }
      const a = magnitude[(y + ny) * size.width + (x + nx)];
      const b = magnitude[(y - ny) * size.width + (x - nx)];
      if (magnitude[index] >= a && magnitude[index] >= b) out[index] = magnitude[index];
    }
  }
  return out;
}

/** Link every strong edge to the weak edges that are 8-connected to it. */
function hysteresis(strong: Mask, weak: Mask, size: Size): Mask {
  const out = new Uint8Array(strong);
  const stack: number[] = [];
  for (let i = 0; i < strong.length; i += 1) if (strong[i]) stack.push(i);
  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % size.width;
    const y = (index / size.width) | 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size.width || ny >= size.height) continue;
        const neighbour = ny * size.width + nx;
        if (!out[neighbour] && weak[neighbour]) {
          out[neighbour] = 1;
          stack.push(neighbour);
        }
      }
    }
  }
  return out;
}

export function canny(source: Image, size: Size, sigma = 1.2, highRatio = 0.6, lowRatio = 0.3): Mask {
  const blurred = gaussianBlur(source, size, sigma);
  const { gx, gy } = sobel(blurred, size);
  const magnitude = createImage(size);
  let max = 0;
  for (let i = 0; i < gx.length; i += 1) {
    magnitude[i] = Math.hypot(gx[i], gy[i]);
    if (magnitude[i] > max) max = magnitude[i];
  }
  if (max === 0) return createMask(size);
  const thinned = suppress(magnitude, gx, gy, size);
  const strong = createMask(size);
  const weak = createMask(size);
  for (let i = 0; i < thinned.length; i += 1) {
    if (thinned[i] >= highRatio * max) strong[i] = 1;
    else if (thinned[i] >= lowRatio * max) weak[i] = 1;
  }
  return hysteresis(strong, weak, size);
}

/** Otsu's method: the threshold that maximises between-class variance. */
export function otsuThreshold(source: Image, bins = 256): number {
  const histogram = new Float64Array(bins);
  for (let i = 0; i < source.length; i += 1) histogram[clamp(Math.round(source[i] * (bins - 1)), 0, bins - 1)] += 1;
  const total = source.length;
  let sumAll = 0;
  for (let bin = 0; bin < bins; bin += 1) sumAll += bin * histogram[bin];
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let bestVariance = -1;
  for (let bin = 0; bin < bins; bin += 1) {
    weightBackground += histogram[bin];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += bin * histogram[bin];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sumAll - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = bin;
    }
  }
  return best / (bins - 1);
}

export function threshold(source: Image, size: Size, level: number): Mask {
  const out = createMask(size);
  for (let i = 0; i < source.length; i += 1) out[i] = source[i] >= level ? 1 : 0;
  return out;
}

function morph(source: Mask, size: Size, radius: number, dilate: boolean): Mask {
  const out = createMask(size);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      let value = dilate ? 0 : 1;
      for (let dy = -radius; dy <= radius && value === (dilate ? 0 : 1); dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = clamp(x + dx, 0, size.width - 1);
          const ny = clamp(y + dy, 0, size.height - 1);
          const pixel = source[ny * size.width + nx];
          if (dilate ? pixel === 1 : pixel === 0) {
            value = dilate ? 1 : 0;
            break;
          }
        }
      }
      out[y * size.width + x] = value;
    }
  }
  return out;
}

export function dilate(source: Mask, size: Size, radius: number): Mask {
  return morph(source, size, radius, true);
}

export function erode(source: Mask, size: Size, radius: number): Mask {
  return morph(source, size, radius, false);
}

export function open(source: Mask, size: Size, radius: number): Mask {
  return dilate(erode(source, size, radius), size, radius);
}

export function close(source: Mask, size: Size, radius: number): Mask {
  return erode(dilate(source, size, radius), size, radius);
}

export interface Components {
  labels: Int32Array;
  count: number;
  sizes: number[];
}

/** 4-connected labelling. Returns 0 for background and 1..count for components. */
export function connectedComponents(source: Mask, size: Size): Components {
  const labels = new Int32Array(size.width * size.height);
  const sizes: number[] = [];
  let current = 0;
  const stack: number[] = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] === 0 || labels[start] !== 0) continue;
    current += 1;
    let area = 0;
    stack.push(start);
    labels[start] = current;
    while (stack.length > 0) {
      const index = stack.pop()!;
      area += 1;
      const x = index % size.width;
      const y = (index / size.width) | 0;
      const neighbours = [y > 0 ? index - size.width : -1, y < size.height - 1 ? index + size.width : -1, x > 0 ? index - 1 : -1, x < size.width - 1 ? index + 1 : -1];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && source[neighbour] === 1 && labels[neighbour] === 0) {
          labels[neighbour] = current;
          stack.push(neighbour);
        }
      }
    }
    sizes.push(area);
  }
  return { labels, count: current, sizes };
}

export interface HoughPeak {
  theta: number;
  rho: number;
  votes: number;
}

const THETA_BINS = 180;
const RHO_RESOLUTION = 1;

/**
 * Hough transform over [0, pi). `theta` and `rho` use the same normal form as the
 * generator, so a measured peak can be compared to a painted segment directly.
 */
export function houghTransform(edges: Mask, size: Size, minVotes = 12): HoughPeak[] {
  const maxRho = Math.ceil(Math.hypot(size.width, size.height));
  const rhoBins = 2 * maxRho + 1;
  const accumulator = new Float64Array(THETA_BINS * rhoBins);
  for (let thetaIndex = 0; thetaIndex < THETA_BINS; thetaIndex += 1) {
    const theta = (thetaIndex * Math.PI) / THETA_BINS;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    for (let y = 0; y < size.height; y += 1) {
      for (let x = 0; x < size.width; x += 1) {
        if (edges[y * size.width + x] === 0) continue;
        const rho = Math.round((x * cos + y * sin) / RHO_RESOLUTION);
        const bin = rho + maxRho;
        if (bin < 0 || bin >= rhoBins) continue;
        accumulator[thetaIndex * rhoBins + bin] += 1;
      }
    }
  }
  const peaks: HoughPeak[] = [];
  for (let thetaIndex = 0; thetaIndex < THETA_BINS; thetaIndex += 1) {
    for (let rhoBin = 0; rhoBin < rhoBins; rhoBin += 1) {
      const votes = accumulator[thetaIndex * rhoBins + rhoBin];
      if (votes < minVotes) continue;
      const isLocalMax =
        (rhoBin > 0 && accumulator[thetaIndex * rhoBins + rhoBin - 1] < votes) &&
        (rhoBin < rhoBins - 1 && accumulator[thetaIndex * rhoBins + rhoBin + 1] < votes);
      if (!isLocalMax) continue;
      peaks.push({ theta: (thetaIndex * Math.PI) / THETA_BINS, rho: (rhoBin - maxRho) * RHO_RESOLUTION, votes });
    }
  }
  // Merge neighbouring theta bins that describe the same physical line.
  const merged: HoughPeak[] = [];
  for (const peak of peaks.sort((a, b) => b.votes - a.votes)) {
    const near = merged.find((other) => angleDistance(other.theta, peak.theta) < (3 * Math.PI) / THETA_BINS && Math.abs(other.rho - peak.rho) <= 3);
    if (!near) merged.push({ ...peak });
    else near.votes = Math.max(near.votes, peak.votes);
  }
  return merged.slice(0, 6);
}

export function angleDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/**
 * Clip a normal-form line to the image box (Liang-Barsky), so a peak becomes a
 * measurable segment. Peaks whose angle is close to an axis land outside the box
 * on a naive two-point intersection, which is why the clipping is done on the
 * parameter interval rather than by solving for x and y independently.
 */
export function lineToSegment(peak: HoughPeak, size: Size): LineSegment {
  const cos = Math.cos(peak.theta);
  const sin = Math.sin(peak.theta);
  const px = peak.rho * cos;
  const py = peak.rho * sin;
  const dx = -sin;
  const dy = cos;

  let lo = -Infinity;
  let hi = Infinity;
  let degenerate = false;
  const constrain = (value: number, direction: number, min: number, max: number): void => {
    if (Math.abs(direction) < 1e-12) {
      if (value < min || value > max) degenerate = true;
      return;
    }
    const t1 = (min - value) / direction;
    const t2 = (max - value) / direction;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  };
  constrain(px, dx, 0, size.width);
  constrain(py, dy, 0, size.height);

  if (degenerate || hi < lo || !Number.isFinite(lo) || !Number.isFinite(hi)) {
    // The line misses the image entirely. Report it as a short segment at its
    // closest point so it can still be matched and counted as a false positive.
    return { x0: px, y0: py, x1: px, y1: py, angle: peak.theta, rho: peak.rho };
  }
  if (hi - lo < 1e-9) {
    return { x0: px + lo * dx, y0: py + lo * dy, x1: px + (lo + 1) * dx, y1: py + (lo + 1) * dy, angle: peak.theta, rho: peak.rho };
  }
  return {
    x0: px + lo * dx,
    y0: py + lo * dy,
    x1: px + hi * dx,
    y1: py + hi * dy,
    angle: peak.theta,
    rho: peak.rho,
  };
}

/** Integer translation with replicate borders, so the border cannot fake motion. */
export function shiftImage(source: Image, size: Size, dx: number, dy: number): Image {
  const out = createImage(size);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) out[y * size.width + x] = at(source, size, x - dx, y - dy);
  }
  return out;
}

export interface FlowOptions {
  window: number;
  /** Reject windows whose smaller eigenvalue is below this; that is the aperture problem. */
  minEigenvalue: number;
  /** Reject windows whose eigenvalue ratio exceeds this; the inverse is unstable. */
  maxAnisotropy: number;
}

/**
 * Sparse Lucas-Kanade: solve the 2x2 structure tensor per window. Windows that
 * are locally flat are reported invalid rather than given a confident answer.
 */
export function lucasKanade(frameA: Image, frameB: Image, size: Size, options: FlowOptions): FlowField {
  const { window, minEigenvalue, maxAnisotropy } = options;
  const raw = sobel(frameA, size);
  // Sobel is a central difference times eight. The structure tensor scales with
  // the square of the gradient while the temporal term scales with the first
  // power, so an unscaled Sobel would divide the recovered displacement by
  // eight. Normalising here keeps the reported displacement in pixels.
  const gx = new Float64Array(raw.gx.length);
  const gy = new Float64Array(raw.gy.length);
  for (let i = 0; i < raw.gx.length; i += 1) {
    gx[i] = raw.gx[i] / SOBEL_CENTRAL_DIFFERENCE_SCALE;
    gy[i] = raw.gy[i] / SOBEL_CENTRAL_DIFFERENCE_SCALE;
  }
  const half = Math.floor(window / 2);
  const dx = new Float64Array(size.width * size.height);
  const dy = new Float64Array(size.width * size.height);
  const valid = createMask(size);
  for (let y = half; y < size.height - half; y += 1) {
    for (let x = half; x < size.width - half; x += 1) {
      let gxx = 0;
      let gxy = 0;
      let gyy = 0;
      let bx = 0;
      let by = 0;
      for (let wy = -half; wy <= half; wy += 1) {
        for (let wx = -half; wx <= half; wx += 1) {
          const px = x + wx;
          const py = y + wy;
          const index = py * size.width + px;
          const ix = gx[index];
          const iy = gy[index];
          // The temporal term: how the window changed between the two frames.
          const it = frameA[index] - frameB[index];
          gxx += ix * ix;
          gxy += ix * iy;
          gyy += iy * iy;
          // A displacement of d moves content so that I_t = A - B ≈ d * grad A,
          // which makes b = sum(grad * I_t) the right-hand side whose solution is d.
          bx += ix * it;
          by += iy * it;
        }
      }
      const trace = gxx + gyy;
      const determinant = gxx * gyy - gxy * gxy;
      if (determinant <= 0) continue;
      const discriminant = Math.sqrt(Math.max(0, (trace * trace) / 4 - determinant));
      const lambdaMin = trace / 2 - discriminant;
      const lambdaMax = trace / 2 + discriminant;
      if (lambdaMin < minEigenvalue) continue;
      const index = y * size.width + x;
      dx[index] = (gyy * bx - gxy * by) / determinant;
      dy[index] = (gxx * by - gxy * bx) / determinant;
      // A window with a near-degenerate structure tensor has an unstable
      // inverse; report it invalid instead of reporting a large confident number.
      valid[index] = lambdaMax <= lambdaMin * maxAnisotropy ? 1 : 0;
    }
  }
  return { dx, dy, valid };
}

/** Keep only the pixels of a class map that satisfy a predicate, as a mask. */
export function maskFromClasses(classes: ClassMap, predicate: (id: number) => boolean): Mask {
  const mask = new Uint8Array(classes.length);
  for (let i = 0; i < classes.length; i += 1) mask[i] = predicate(classes[i]) ? 1 : 0;
  return mask;
}