import { buildScene } from "./engine/scene";
import { runLayer } from "./engine/pipeline";
import { gaussianBlur } from "./engine/ops";
import { probeWebGpu, gpuGaussianBlurAndCompare } from "./engine/gpuEngine";

/**
 * The measurement surface.
 *
 * A laboratory that cannot be measured from outside is not reproducible by a
 * reader either. These are the same functions the interface uses, exposed so a
 * browser test, a second operator or an automated agent can reproduce any
 * number the page shows rather than taking the page's word for it.
 */
export const testSurface = {
  buildScene,
  runLayer,
  gaussianBlur,
  probeWebGpu,
  gpuGaussianBlurAndCompare,
};

declare global {
  interface Window {
    __cvl: typeof testSurface;
  }
}

if (typeof window !== "undefined") window.__cvl = testSurface;

export { runLayer as unusedSceneRun };