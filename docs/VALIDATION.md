# Validation

## What is checked

| Check | Command | Meaning |
|---|---|---|
| Ground-truth contract | `npm test` | The painted key scores IoU 1.0 against itself. |
| Determinism | `npm test` | Two builds of one seed are byte-identical. |
| Operators | `npm test` | Edge recall and precision, region recovery, Hough recall, flow recovery, depth ordering, training. |
| Lint and types | `npm run lint`, `npm run build` | No unused code, no unsafe type escape. |
| Artifact | `npm run build` | `dist/` carries the identity, the mount point, the schema and the release record. |
| Browser flows | `npm run test:ui` | The page renders, measures, reproduces and survives a phone viewport. |
| WebGPU parity | `npm run test:ui` | A real adapter agrees with the CPU within 1e-3, or the run fails. |
| The split | `npm run test:ui` | Every layer links out to VIS for its reading, and no method, boundary statement or source is duplicated here. |
| Published build | `npm run verify:live` | The deployed address serves this identity and this commit. |

## The split with VIS, and why it is tested

CVL measures; [VIS](https://vis.aserdargun.com/) explains. The prose that used to sit beside
every measurement here — the question, the method, what an operator is not for, the sources —
was removed rather than reworded, so that one explanation exists in one place.

A duplicated explanation fails quietly: it does not break a build, it simply becomes wrong in
one of the two copies. The browser suite therefore asserts the absence directly. For every one
of the eight layers it checks that a `read-in-vis` link points at
`https://vis.aserdargun.com/#katman-<layer>`, and it checks that no method heading, boundary
heading or source link is rendered on the measuring surface at all.

## The GPU test does not skip

A laboratory that quietly passes when the GPU path is untested has an unverified GPU claim. The
test fails when `requestAdapter()` returns null, and the test environment therefore requests the
software adapter explicitly:

```
--enable-unsafe-webgpu --enable-features=Vulkan --use-webgpu-adapter=swiftshader --use-angle=swiftshader
```

## Precision between the two engines

The CPU accumulates in f64 and the GPU in f32. The comparison is the deliverable, so the parity
result reports the RMSE, the maximum absolute difference, and the level means of input,
reference and measured. A reader can therefore tell a rounding difference from a wrong result:
matching means with a large RMSE means an error concentrated somewhere, not everywhere.

## Failure modes worth knowing

- **NaN silently becoming zero.** Every metric that cannot be computed is `null` at the boundary
  of `summariseMetrics`, so a failure is visible in the interface.
- **A truth that is narrower than the picture.** The edge key is built from every painted
  feature, including the line rules and the horizon. A key that omits visible structure makes a
  correct detector look wrong.
- **Weighting a metric by convenience.** Connected components are matched to objects by largest
  overlap, because component labels are arbitrary; matching on the label would report zero
  overlap for a perfect segmentation.
