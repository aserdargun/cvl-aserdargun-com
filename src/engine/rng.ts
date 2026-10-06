/**
 * Deterministic pseudo-random source.
 *
 * Every scene in this laboratory is reproducible from its seed alone. No call
 * to `Math.random`, no clock, no device-dependent value is allowed to reach a
 * scene, because a number that cannot be reproduced is not a measurement.
 */

/** mulberry32: 32-bit state, uniform enough for scene layout, trivially portable. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A named random stream, so adding a draw in one place cannot shift another. */
export class Random {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = mulberry32(seed);
  }

  /** Uniform in [min, max). */
  uniform(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.uniform(min, max + 1));
  }

  /** Standard normal via Box-Muller. Cached second value is discarded on purpose. */
  normal(mean = 0, sigma = 1): number {
    const u = Math.max(this.next(), Number.EPSILON);
    const v = this.next();
    return mean + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}