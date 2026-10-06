# Architecture

## The one rule

The scene and its answer key are produced by one decision per pixel. For every pixel the
generator decides the object id first, then writes luminance, depth and background from that
same decision. Nothing downstream is allowed to redraw either side.

This is why the ground-truth contract is a test rather than a comment: `contractRun` re-reads
the key out of the class map and scores it against the painted key. An intersection-over-union
below 1.0 means the picture and the answer key disagree, and every other number in the
application is void.

## The other rule: CVL measures, VIS explains

This laboratory holds no explanation. The question a layer asks, the method it describes, what
it is explicitly *not* for and the sources behind those claims all live in the knowledge bank at
https://vis.aserdargun.com/.

The reason is duplication risk. A method described twice will eventually be described
differently, and the reader has no way to tell which copy is current. One explanation, in one
place, cited to primary sources; one measurement, here, recomputable by the reader.

The boundary is visible in the interface rather than only in this document: every layer carries
a `read-in-vis` link pointing at the knowledge-bank layer that explains it, and that is the only
link in the section. `tests/browser/browser.spec.ts` asserts both directions of the contract —
that the reading is present and that no method, boundary or source is duplicated here.

## Modules

| Module | Responsibility |
|---|---|
| `rng.ts` | mulberry32 streams. A named stream, so a new draw in one place cannot shift another. |
| `scene.ts` | Scene, object layout, line layout, feature map, answer key. |
| `ops.ts` | Operators under test: convolution, Sobel, Canny, Otsu, morphology, labelling, Hough, shift, Lucas-Kanade. |
| `metrics.ts` | Comparison against the key: IoU, banded precision and recall, PSNR, SSIM, Spearman, line matching, flow error. |
| `cnn.ts` | A small network, its backprop, and class balancing. |
| `depth.ts` | Monocular cues and their failure case. |
| `pipeline.ts` | The eight layers, each returning a run with the key it was scored against. |
| `cpuEngine.ts` | The CPU backend and the honest per-layer capability list. |
| `gpuEngine.ts` | WebGPU probe, separable Gaussian, parity measurement. |
| `gpuShaders.ts` | WGSL for the data-parallel passes only. |
| `selectEngine.ts` | Engine choice expressed as a report, never as a silent fallback. |

## Borders

Every operator clamps at the border rather than zero-padding. A padded border manufactures
edges that were never in the scene and would quietly inflate an error measurement.

## Why some layers stay on the CPU

Non-maximum suppression, hysteresis, connected-component labelling and the Hough peak search are
sequential. Moving them to the GPU would change the result, not just the schedule, so they stay
on the CPU and the interface says so per layer.

## Scene configuration per layer

Two layers measure on a configured variant of the same seed, and both say so in their run notes:

- **motion** uses a coherent multiplicative grating and omits the one-pixel line decorations.
  A flat field gives a windowed solver nothing to track, and the line rules are thinner than
  the flow window, so measuring on them would report the drawing style rather than the method.
- **learning** scores at half resolution, because the network and the hand-written path must be
  compared on the same pixels.

## Reproducibility

Same seed, same bytes. Weights start from a fixed seed and the iteration count, learning rate
and class weights are all fixed. Nothing reaches a scene from `Math.random`, the clock or a
device-dependent value.
