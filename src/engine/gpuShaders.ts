/**
 * Compute shaders for the data-parallel part of the pipeline.
 *
 * Only operators whose steps are independent per pixel belong here. Hysteresis
 * and the Hough peak search are sequential, so they stay on the CPU: running
 * them on the GPU would change the result, not just the schedule.
 */

const PARAMS = /* wgsl */ `
struct Params {
  width: u32,
  height: u32,
  radius: i32,
  sigma: f32,
};

@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

fn weightAt(offset: i32) -> f32 {
  // The Gaussian is a function of the squared offset over sigma squared. Scaling
  // the offset by sigma here would produce a fixed-width kernel whatever sigma
  // says, which looks like a plausible blur and measures as a different one.
  let d = f32(offset);
  return exp(-(d * d) / (2.0 * params.sigma * params.sigma));
}
`;

export const GAUSSIAN_HORIZONTAL = /* wgsl */ `
${PARAMS}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.width * params.height) {
    return;
  }
  let y = i32(index / params.width);
  let x = i32(index % params.width);

  var sum = 0.0;
  var kernelTotal = 0.0;
  for (var k = -params.radius; k <= params.radius; k = k + 1) {
    let w = weightAt(k);
    kernelTotal = kernelTotal + w;
    let sx = clamp(x + k, 0, i32(params.width) - 1);
    sum = sum + input[u32(y) * params.width + u32(sx)] * w;
  }
  output[index] = sum / kernelTotal;
}
`;

export const GAUSSIAN_VERTICAL = /* wgsl */ `
${PARAMS}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= params.width * params.height) {
    return;
  }
  let y = i32(index / params.width);
  let x = i32(index % params.width);

  var sum = 0.0;
  var kernelTotal = 0.0;
  for (var k = -params.radius; k <= params.radius; k = k + 1) {
    let w = weightAt(k);
    kernelTotal = kernelTotal + w;
    let sy = clamp(y + k, 0, i32(params.height) - 1);
    sum = sum + input[u32(sy) * params.width + u32(x)] * w;
  }
  output[index] = sum / kernelTotal;
}
`;

export const UNIFORM_BYTES = 16;