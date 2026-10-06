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

  const inputBuffer = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inputBuffer, 0, input);

  const scratch = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.STORAGE });
  const result = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readback = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

  const uniform = device.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const params = new ArrayBuffer(UNIFORM_BYTES);
  const view = new DataView(params);
  view.setUint32(0, size.width, true);
  view.setUint32(4, size.height, true);
  view.setInt32(8, radius, true);
  view.setFloat32(12, sigma, true);
  device.queue.writeBuffer(uniform, 0, params);

  const runPass = async (code: string, source: GPUBuffer, destination: GPUBuffer): Promise<void> => {
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: device.createShaderModule({ code }), entryPoint: "main" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: source } },
        { binding: 1, resource: { buffer: destination } },
        { binding: 2, resource: { buffer: uniform } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil((size.width * size.height) / 64));
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  };

  await runPass(GAUSSIAN_HORIZONTAL, inputBuffer, scratch);
  await runPass(GAUSSIAN_VERTICAL, scratch, result);
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(result, 0, readback, 0, input.byteLength);
  device.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  const measured = new Float32Array(readback.getMappedRange().slice(0));

  let maxAbs = 0;
  for (let i = 0; i < measured.length; i += 1) maxAbs = Math.max(maxAbs, Math.abs(measured[i] - reference[i]));
  const rmse = rootMeanSquareError(reference, measured);

  for (const buffer of [inputBuffer, scratch, result, readback, uniform]) buffer.destroy();

  return {
    sigma,
    rmse,
    maxAbsDifference: maxAbs,
    withinTolerance: rmse <= PARITY_TOLERANCE,
    tolerance: PARITY_TOLERANCE,
  };
}

/** Which layers the GPU path would take, given the sequential ones cannot move. */
export function gpuCapabilities(available: boolean): { layer: string; gpu: boolean; reason: string }[] {
  return CPU_CAPABILITIES.map((capability) =>
    available ? capability : { ...capability, gpu: false, reason: `${capability.reason}; no adapter available` },
  );
}