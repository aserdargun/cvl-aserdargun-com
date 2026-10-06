/**
 * Minimal WebGPU surface.
 *
 * TypeScript's DOM library does not ship the WebGPU types, and the laboratory
 * only needs the handful of interfaces below. Declaring them here keeps the
 * engine honest about what it calls without pulling in a dependency.
 */

interface GPUAdapterInfoLike {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

interface GPUTextureLike {
  width: number;
  height: number;
}

declare class GPUBuffer {
  readonly size: number;
  destroy(): void;
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}

declare class GPUShaderModule {
  constructor(descriptor: { code: string; label?: string });
}

declare class GPUBindGroup {
  constructor(descriptor: { layout: unknown; entries: { binding: number; resource: { buffer: GPUBuffer } }[] });
}

declare class GPUComputePipeline {
  getBindGroupLayout(index: number): unknown;
}

declare class GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, group: GPUBindGroup): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}

declare class GPUCommandEncoder {
  beginComputePass(): GPUComputePassEncoder;
  copyBufferToBuffer(source: GPUBuffer, sourceOffset: number, destination: GPUBuffer, destinationOffset: number, size: number): void;
  finish(): unknown;
}

declare class GPUQueue {
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource | ArrayBufferView): void;
  submit(commands: unknown[]): void;
  onSubmittedWorkDone(): Promise<void>;
}

declare class GPUDevice {
  createBuffer(descriptor: { size: number; usage: number }): GPUBuffer;
  createShaderModule(descriptor: { code: string; label?: string }): GPUShaderModule;
  createComputePipeline(descriptor: { layout: "auto"; compute: { module: GPUShaderModule; entryPoint: string } }): GPUComputePipeline;
  createBindGroup(descriptor: { layout: unknown; entries: { binding: number; resource: { buffer: GPUBuffer } }[] }): GPUBindGroup;
  createCommandEncoder(): GPUCommandEncoder;
  queue: GPUQueue;
}

declare const GPUBufferUsage: {
  MAP_READ: number;
  MAP_WRITE: number;
  COPY_SRC: number;
  COPY_DST: number;
  INDEX: number;
  VERTEX: number;
  UNIFORM: number;
  STORAGE: number;
  INDIRECT: number;
  QUERY_RESOLVE: number;
};

declare const GPUMapMode: { READ: number; WRITE: number };