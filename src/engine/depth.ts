import { gaussianBlur } from "./ops";
import type { Depth, Image, Mask, Scene, Size } from "./types";

/**
 * Monocular depth from classical cues.
 *
 * This is deliberately a cue, not a model. The estimate combines the two
 * assumptions a single camera actually gives you: things lower in the frame sit
 * on the ground plane and are therefore nearer, and a locally sharp, high
 * contrast patch belongs to an object rather than to the background.
 *
 * The measurement that matters is the rank correlation against the painted
 * depth ordering, because that is the only part a monocular cue can be judged
 * on. Where it is wrong, it is wrong in an instructive way: the cue has no way
 * to know that an object floating above the plane is still floating.
 */

export interface DepthCueOptions {
  /** Where the ground plane meets the sky, as a fraction of image height. */
  horizon: number;
  /** Weight of the local-contrast term relative to the ground-plane prior. */
  contrastWeight: number;
}

export function estimateDepth(scene: Scene, options: DepthCueOptions): { depth: Depth; surface: Image } {
  const { size, luminance } = scene;
  const localContrast = localContrastMap(luminance, size);
  const depth: Depth = new Float64Array(size.width * size.height);
  const surface: Image = new Float64Array(size.width * size.height);
  const horizonY = options.horizon * size.height;

  for (let y = 0; y < size.height; y += 1) {
    // The ground-plane term only exists below the horizon. Above it, the cue
    // has nothing to say and must say so rather than invent a depth.
    const groundTerm = y > horizonY ? Math.min(1, (y - horizonY) / Math.max(1, size.height - horizonY)) : 0;
    for (let x = 0; x < size.width; x += 1) {
      const index = y * size.width + x;
      const contrast = Math.min(1, localContrast[index] / 0.25);
      surface[index] = contrast;
      depth[index] = Math.min(1, groundTerm * (1 - options.contrastWeight) + contrast * options.contrastWeight);
    }
  }
  return { depth, surface };
}

function localContrastMap(luminance: Image, size: Size): Image {
  const blurred = gaussianBlur(luminance, size, 2);
  const out = new Float64Array(size.width * size.height);
  for (let i = 0; i < luminance.length; i += 1) out[i] = Math.abs(luminance[i] - blurred[i]);
  return out;
}

/**
 * The failure case this laboratory exists to show: an object placed away from
 * the ground plane gets a depth the cue cannot justify, and the rank
 * correlation drops. Returning the masked correlation shows how much of the
 * error belongs to the foreground rather than to the background.
 */
export function depthMeasurement(scene: Scene, options: DepthCueOptions): { depth: Depth; surface: Image; foreground: Mask } {
  const { depth, surface } = estimateDepth(scene, options);
  return { depth, surface, foreground: scene.truth.foreground };
}