import { rootMeanSquareError } from "./metrics";
import { gaussianKernel } from "./ops";
import type { Image, Size } from "./types";
import { GAUSSIAN_HORIZONTAL, GAUSSIAN_VERTICAL, UNIFORM_BYTES } from "./gpuShaders";
import { CPU_CAPABILITIES } from "./cpuEngine";

/**
 * The WebGPU path, and the honest report of what it can and cannot do.
 *
 * `navigator.gpu` existing does not mean a kernel can run: `requestAdapter()`
 * is allowed to return null, and that is a fact about the machine rather than
 * an error to swallow. Every step of the probe is reported separately so the
 * interface can say exactly where a GPU path stopped.
 */

export interface AdapterProbe {
  secureContext: boolean;
  hasNavigatorGpu: boolean;
  adapterRequested: boolean;
  adapterFound: boolean;
  vendor: string | null;
  architecture: string | null;
  description: string | null;
  deviceRequested: boolean;
  deviceFound: boolean;
  /** Plain-language reason the GPU path is unavailable, or null when it is. */
  unavailableReason: string | null;
}

export interface ParityResult {
  sigma: number;
  rmse: number;
  maxAbsDifference: number;
  withinTolerance: boolean;
  tolerance: number;
  /** Level means, so a reader can tell a rounding difference from a wrong result. */
  meanMeasured: number;
  meanReference: number;
  meanInput: number;
  firstPixels: { measured: number[]; reference: number[]; input: number[] };
  /** Pixel index of the largest disagreement, so a failure can be located. */
  worstIndex: number;
  worstGpu: number;
  worstReference: number;
}

export const PARITY_TOLERANCE = 1e-3;

export function probeAdapter(): AdapterProbe {
  const secureContext = typeof isSecureContext === "boolean" ? isSecureContext : false;
  const gpu = (globalThis as { navigator?: { gpu?: unknown } }).navigator?.gpu as
    | { requestAdapter(): Promise<unknown> }
    | undefined;
  const probe: AdapterProbe = {
    secureContext,
    hasNavigatorGpu: Boolean(gpu),
    adapterRequested: false,
    adapterFound: false,
    vendor: null,
    architecture: null,
    description: null,
    deviceRequested: false,
    deviceFound: false,
    unavailableReason: null,
  };
  if (!secureContext) probe.unavailableReason = "not a secure context";
  else if (!gpu) probe.unavailableReason = "navigator.gpu is undefined in this browser";
  return probe;
}

interface AdapterLike {
  info?: { vendor?: string; architecture?: string; device?: string; description?: string };
  requestDevice(): Promise<unknown>;
}

/**
 * Run the full probe. Asynchronous because `requestAdapter` is; the reported
 * chain is deliberately step by step rather than a single boolean.
 */
export async function probeWebGpu(): Promise<{ probe: AdapterProbe; device: GPUDevice | null; adapter: AdapterLike | null }> {
  const probe = probeAdapter();
  if (probe.unavailableReason) return { probe, device: null, adapter: null };

  const gpu = (globalThis as { navigator?: { gpu?: { requestAdapter(): Promise<AdapterLike | null> } } }).navigator!.gpu!;
  probe.adapterRequested = true;
  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    probe.unavailableReason = "requestAdapter() returned null, so no kernel can run here";
    return { probe, device: null, adapter: null };
  }
  probe.adapterFound = true;
  const info = adapter.info ?? {};
  probe.vendor = info.vendor ?? null;
  probe.architecture = info.architecture ?? null;
  probe.description = info.description ?? info.device ?? null;

  probe.deviceRequested = true;
  const device = (await adapter.requestDevice()) as GPUDevice | null;
  if (!device) {
    probe.unavailableReason = "requestDevice() returned null";
    return { probe, device: null, adapter };
  }
  probe.deviceFound = true;
  return { probe, device, adapter };
}

/**
 * Run the separable Gaussian on the GPU and compare it with the f64 CPU result.
 * The comparison is the deliverable: a GPU number alone would be an assertion.
 */
export async function gpuGaussianBlurAndCompare(
  device: GPUDevice,
  input: Image,
  size: Size,
  sigma: number,
  reference: Image,
): Promise<ParityResult> {
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) / 2;

  // WebGPU storage buffers are f32. Uploading the f64 reference bytes would be
  // read back as a different set of numbers entirely, so the conversion is
  // explicit here and the f32 versus f64 difference is what parity measures.
  const upload = Float32Array.from(input);
  const inputBuffer = device.createBuffer({ size: upload.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inputBuffer, 0, upload);

  const scratch = device.createBuffer({ size: upload.byteLength, usage: GPUBufferUsage.STORAGE });
  const result = device.createBuffer({ size: upload.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readback = device.createBuffer({ size: upload.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

  const uniform = device.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const params = new ArrayBuffer(UNIFORM_BYTES);
  const view = new DataView(params);
  view.setUint32(0, size.width, true);
  view.setUint32(4, size.height, true);
  view.setInt32(8, radius, true);
  view.setFloat32(12, sigma, true);
  device.queue.writeBuffer(uniform, 0, params);

  // Both passes go into one compute pass. The horizontal pass writes the
  // intermediate that the vertical pass reads, so the two dispatches have to be
  // separated by the pass's own usage scope rather than by two submissions:
  // across submissions the readback ordering is not something the application
  // should have to reason about.
  const makePipeline = (code: string) =>
    device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code }), entryPoint: "main" },
    });

  const horizontal = makePipeline(GAUSSIAN_HORIZONTAL);
  const vertical = makePipeline(GAUSSIAN_VERTICAL);
  const bind = (pipeline: ReturnType<typeof makePipeline>, source: GPUBuffer, destination: GPUBuffer) =>
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: source } },
        { binding: 1, resource: { buffer: destination } },
        { binding: 2, resource: { buffer: uniform } },
      ],
    });

  const groups = Math.ceil((size.width * size.height) / 64);
  const blurEncoder = device.createCommandEncoder();
  const passEncoder = blurEncoder.beginComputePass();
  passEncoder.setPipeline(horizontal);
  passEncoder.setBindGroup(0, bind(horizontal, inputBuffer, scratch));
  passEncoder.dispatchWorkgroups(groups);
  passEncoder.setPipeline(vertical);
  passEncoder.setBindGroup(0, bind(vertical, scratch, result));
  passEncoder.dispatchWorkgroups(groups);
  passEncoder.end();
  const blurCommands = blurEncoder.finish();

  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(result, 0, readback, 0, upload.byteLength);
  device.queue.submit([blurCommands, encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const measured = new Float32Array(readback.getMappedRange().slice(0));

  let maxAbs = 0;
  let worstIndex = 0;
  let sumMeasured = 0;
  let sumReference = 0;
  let sumInput = 0;
  for (let i = 0; i < measured.length; i += 1) {
    const difference = Math.abs(measured[i] - reference[i]);
    if (difference > maxAbs) {
      maxAbs = difference;
      worstIndex = i;
    }
    sumMeasured += measured[i];
    sumReference += reference[i];
    sumInput += input[i];
  }
  const rmse = rootMeanSquareError(reference, measured);
  const count = Math.max(1, measured.length);

  for (const buffer of [inputBuffer, scratch, result, readback, uniform]) buffer.destroy();

  return {
    sigma,
    rmse,
    maxAbsDifference: maxAbs,
    withinTolerance: rmse <= PARITY_TOLERANCE,
    tolerance: PARITY_TOLERANCE,
    meanMeasured: sumMeasured / count,
    meanReference: sumReference / count,
    meanInput: sumInput / count,
    worstIndex,
    worstGpu: measured[worstIndex],
    worstReference: reference[worstIndex],
    firstPixels: {
      measured: Array.from(measured.slice(0, 6)),
      reference: Array.from(reference.slice(0, 6)),
      input: Array.from(input.slice(0, 6)),
    },
  };
}

/** Which layers the GPU path would take, given the sequential ones cannot move. */
export function gpuCapabilities(available: boolean): { layer: string; gpu: boolean; reason: string }[] {
  return CPU_CAPABILITIES.map((capability) =>
    available ? capability : { ...capability, gpu: false, reason: `${capability.reason}; no adapter available` },
  );
}