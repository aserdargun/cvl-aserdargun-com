# CVL working contract

- Build the bilingual computer-vision measurement laboratory: a deterministic surface that
  runs entirely in the browser. Every image is synthetic. No API key, account, backend, real
  camera or pre-trained model is required, and the app must never reach a real sensor, file,
  network or account.
- Keep measurement truth in `src/engine` and the Turkish/English copy in `src/content`. The
  synthetic scene is a model, not a shim around a real camera.
- The picture and the answer key are painted in one pass. If they can drift apart, a reported
  number stops being a measurement.
- Every reported number is computed against that answer key on the run in front of the reader.
  Never carry a value over from a previous configuration, and never present a synthetic mask
  as a real capture. A measurement that cannot be taken is `null`, never NaN.
- The CPU path is the default and a first-class one. A laboratory whose numbers require a
  discrete GPU is a laboratory that cannot be reproduced. WebGPU is offered, probed honestly,
  and every operator it cannot answer is named in the interface.
- A missing GPU adapter is a reported fact, not a silent fallback: `requestAdapter()` returning
  null must be visible, because `navigator.gpu` existing does not mean a kernel can run.
- Keep Turkish and English controls, questions, methods and notes equivalent.
- Verify `npm run validate` and review `git diff --check` before handoff.
- Local work only unless the user authorizes external publication. Preserve unrelated work
  and processes.
