import { CPU_CAPABILITIES, createCpuEngine } from "./cpuEngine";
import { gpuCapabilities, probeWebGpu, type AdapterProbe } from "./gpuEngine";
import type { EngineCapability } from "./cpuEngine";

/**
 * Engine selection.
 *
 * There is no "try WebGPU and quietly continue" branch. The probe is a report,
 * the report is shown, and the CPU stays the default either way.
 */

export type EngineId = "cpu" | "webgpu";

export interface EngineReport {
  selected: EngineId;
  probe: AdapterProbe;
  capabilities: EngineCapability[];
  /** The sequential layers, listed so the reader can see what stays on the CPU. */
  cpuOnlyLayers: string[];
  summary: string;
}

export function cpuReport(): EngineReport {
  const probe: AdapterProbe = {
    secureContext: false,
    hasNavigatorGpu: false,
    adapterRequested: false,
    adapterFound: false,
    vendor: null,
    architecture: null,
    description: null,
    deviceRequested: false,
    deviceFound: false,
    unavailableReason: "probe has not run in this environment",
  };
  return {
    selected: "cpu",
    probe,
    capabilities: CPU_CAPABILITIES,
    cpuOnlyLayers: CPU_CAPABILITIES.filter((c) => !c.gpu).map((c) => c.layer),
    summary: "CPU, f64 accumulation, every layer",
  };
}

export async function selectEngine(): Promise<EngineReport> {
  const { probe, device } = await probeWebGpu();
  const available = Boolean(device);
  return {
    selected: available ? "webgpu" : "cpu",
    probe,
    capabilities: gpuCapabilities(available),
    cpuOnlyLayers: CPU_CAPABILITIES.filter((c) => !c.gpu).map((c) => c.layer),
    summary: available
      ? `CPU, f64 accumulation, every layer · WebGPU f32 for data-parallel layers (${probe.vendor ?? "unknown vendor"})`
      : `CPU, f64 accumulation, every layer · WebGPU unavailable: ${probe.unavailableReason ?? "unknown reason"}`,
  };
}

export { createCpuEngine };