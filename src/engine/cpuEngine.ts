import { gaussianBlur } from "./ops";
import type { Image, Size } from "./types";

/**
 * The CPU engine. It is the default and a first class one.
 *
 * A laboratory whose numbers require a discrete GPU is a laboratory that cannot
 * be reproduced, so every layer runs here and every reported number comes from
 * this path unless the interface explicitly says otherwise.
 */
export interface EngineCapability {
  layer: string;
  gpu: boolean;
  reason: string;
}

/** Layers whose steps are sequential and therefore stay on the CPU. */
export const SEQUENTIAL_LAYERS = ["edges", "regions", "geometry", "learning"] as const;

export const CPU_CAPABILITIES: EngineCapability[] = [
  { layer: "signal", gpu: true, reason: "elementwise, fully data-parallel" },
  { layer: "filtering", gpu: true, reason: "separable convolution is data-parallel" },
  { layer: "edges", gpu: false, reason: "non-maximum suppression and hysteresis are sequential" },
  { layer: "regions", gpu: false, reason: "connected-component labelling is sequential" },
  { layer: "geometry", gpu: false, reason: "the Hough peak search is a global reduction with local maxima" },
  { layer: "learning", gpu: false, reason: "training is a fixed full-batch schedule; the transfer cost exceeds the work" },
  { layer: "depth", gpu: true, reason: "elementwise cue combination" },
  { layer: "motion", gpu: true, reason: "per-window solves are independent" },
];

export interface CpuEngine {
  id: "cpu";
  describe: string;
  gaussianBlur(image: Image, size: Size, sigma: number): Image;
  capabilities: EngineCapability[];
}

export function createCpuEngine(): CpuEngine {
  return {
    id: "cpu",
    describe: "CPU, f64 accumulation, every layer",
    gaussianBlur,
    capabilities: CPU_CAPABILITIES,
  };
}