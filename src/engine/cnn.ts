import { Random } from "./rng";
import type { Image, Mask, Size } from "./types";

/**
 * A small convolutional network, trained at run time on the scene's own answer
 * key.
 *
 * Nothing is downloaded and nothing is pre-trained. The weights start from a
 * fixed seed and the loop count is fixed, so the same scene produces the same
 * network every time. That is what makes the comparison against the hand
 * written path a measurement: both paths are scored on the same pixels against
 * the same key, and the only difference is who produced the mask.
 */

export interface ConvLayer {
  /** Row-major [out][in][ky][kx]. */
  weights: Float64Array;
  biases: Float64Array;
  inputs: number;
  outputs: number;
  kernel: number;
}

export interface DenseLayer {
  weights: Float64Array;
  biases: Float64Array;
  inputs: number;
  outputs: number;
}

export interface Network {
  conv1: ConvLayer;
  conv2: ConvLayer;
  dense: DenseLayer;
}

function heInit(random: Random, count: number, fanIn: number): Float64Array {
  const scale = Math.sqrt(2 / Math.max(1, fanIn));
  const values = new Float64Array(count);
  for (let i = 0; i < count; i += 1) values[i] = random.normal(0, scale);
  return values;
}

export function createNetwork(seed: number, conv1Outputs = 8, conv2Outputs = 8): Network {
  const random = new Random(seed);
  return {
    conv1: { weights: heInit(random, conv1Outputs * 1 * 5 * 5, 1), biases: new Float64Array(conv1Outputs), inputs: 1, outputs: conv1Outputs, kernel: 5 },
    conv2: { weights: heInit(random, conv2Outputs * conv1Outputs * 3 * 3, conv1Outputs * 9), biases: new Float64Array(conv2Outputs), inputs: conv1Outputs, outputs: conv2Outputs, kernel: 3 },
    dense: { weights: heInit(random, conv2Outputs, conv2Outputs), biases: new Float64Array(1), inputs: conv2Outputs, outputs: 1 },
  };
}

/** Box-downsample by an integer factor, so the network and the hand path score the same pixels. */
export function downsample(source: Image, size: Size, factor: number): { image: Image; size: Size } {
  const width = Math.floor(size.width / factor);
  const height = Math.floor(size.height / factor);
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) sum += source[(y * factor + dy) * size.width + x * factor + dx];
      }
      out[y * width + x] = sum / (factor * factor);
    }
  }
  return { image: out, size: { width, height } };
}

export function downsampleMask(source: Mask, size: Size, factor: number): Mask {
  const width = Math.floor(size.width / factor);
  const height = Math.floor(size.height / factor);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hits = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) hits += source[(y * factor + dy) * size.width + x * factor + dx];
      }
      out[y * width + x] = hits * 2 > factor * factor ? 1 : 0;
    }
  }
  return out;
}

function sampleX(x: number, size: Size): number {
  return x < 0 ? 0 : x >= size.width ? size.width - 1 : x;
}

function sampleY(y: number, size: Size): number {
  return y < 0 ? 0 : y >= size.height ? size.height - 1 : y;
}

function convForward(input: Image, size: Size, layer: ConvLayer): Image {
  const radius = (layer.kernel - 1) / 2;
  const pixels = size.width * size.height;
  const out = new Float64Array(layer.outputs * pixels);
  const { width, height } = size;
  for (let o = 0; o < layer.outputs; o += 1) {
    const weightOffset = o * layer.inputs * layer.kernel * layer.kernel;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = layer.biases[o];
        for (let c = 0; c < layer.inputs; c += 1) {
          const channelOffset = c * pixels;
          const weightChannel = weightOffset + c * layer.kernel * layer.kernel;
          for (let ky = 0; ky < layer.kernel; ky += 1) {
            const sy = sampleY(y + ky - radius, size);
            const rowOffset = channelOffset + sy * width;
            for (let kx = 0; kx < layer.kernel; kx += 1) {
              sum += input[rowOffset + sampleX(x + kx - radius, size)] * layer.weights[weightChannel + ky * layer.kernel + kx];
            }
          }
        }
        out[o * pixels + y * width + x] = sum;
      }
    }
  }
  return out;
}

function reluForward(input: Image): Image {
  const out = new Float64Array(input.length);
  for (let i = 0; i < input.length; i += 1) out[i] = input[i] > 0 ? input[i] : 0;
  return out;
}

function sigmoid(value: number): number {
  return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value));
}

interface ForwardCache {
  a0: Image;
  z1: Image;
  a1: Image;
  z2: Image;
  a2: Image;
  size: Size;
  pixels: number;
}

export function forward(net: Network, input: Image, size: Size): { output: Float64Array; cache: ForwardCache } {
  const pixels = size.width * size.height;
  const a0 = input;
  const z1 = convForward(a0, size, net.conv1);
  const a1 = reluForward(z1);
  const z2 = convForward(a1, size, net.conv2);
  const a2 = reluForward(z2);
  const output = new Float64Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    let sum = net.dense.biases[0];
    for (let c = 0; c < net.conv2.outputs; c += 1) sum += a2[c * pixels + i] * net.dense.weights[c];
    output[i] = sigmoid(sum);
  }
  return { output, cache: { a0, z1, a1, z2, a2, size, pixels } };
}

export interface TrainingOptions {
  iterations: number;
  learningRate: number;
  /** Sample every n-th pixel in raster order, deterministically. */
  stride: number;
  /**
   * Class weights. A scene where 8% of pixels are foreground will otherwise be
   * solved optimally by predicting nothing, which is a true statement about the
   * loss and a useless statement about segmentation. Balancing the classes makes
   * the reported IoU mean what a reader will assume it means.
   */
  positiveWeight: number;
  negativeWeight: number;
}

/** Weights that give both classes half the total mass. */
export function balancedWeights(truth: Mask): { positiveWeight: number; negativeWeight: number } {
  let positive = 0;
  for (let i = 0; i < truth.length; i += 1) positive += truth[i];
  const positiveRate = positive / Math.max(1, truth.length);
  return {
    positiveWeight: positiveRate > 0 ? 0.5 / positiveRate : 1,
    negativeWeight: positiveRate < 1 ? 0.5 / (1 - positiveRate) : 1,
  };
}

export interface TrainingResult {
  net: Network;
  loss: number[];
}

/**
 * Full-batch gradient descent with a fixed iteration count. The loss is
 * recorded so the interface can show a real convergence curve instead of
 * asserting that training worked.
 */
export function train(net: Network, input: Image, truth: Mask, size: Size, options: TrainingOptions): TrainingResult {
  const { conv1, conv2, dense } = net;
  const loss: number[] = [];
  const samples: number[] = [];
  for (let i = 0; i < size.width * size.height; i += options.stride) samples.push(i);
  let totalWeight = 0;
  for (const i of samples) totalWeight += truth[i] === 1 ? options.positiveWeight : options.negativeWeight;
  const radius1 = (conv1.kernel - 1) / 2;
  const radius2 = (conv2.kernel - 1) / 2;

  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    const { output, cache } = forward(net, input, size);
    const { pixels } = cache;
    const gradW1 = new Float64Array(conv1.weights.length);
    const gradB1 = new Float64Array(conv1.biases.length);
    const gradW2 = new Float64Array(conv2.weights.length);
    const gradB2 = new Float64Array(conv2.biases.length);
    const gradWd = new Float64Array(dense.weights.length);
    let gradBd = 0;
    let totalLoss = 0;

    // Dense layer: the network scores every pixel with one shared weight set.
    for (const i of samples) {
      const predicted = output[i];
      const target = truth[i];
      const weight = target === 1 ? options.positiveWeight : options.negativeWeight;
      totalLoss += weight * -(target * Math.log(predicted + 1e-9) + (1 - target) * Math.log(1 - predicted + 1e-9));
      const delta = weight * (predicted - target);
      gradBd += delta;
      for (let c = 0; c < dense.inputs; c += 1) gradWd[c] += delta * cache.a2[c * pixels + i];
    }

    // conv2 backward: dL/dA2 is dense, then ReLU, then the kernel weights.
    const deltaZ2 = new Float64Array(conv2.outputs * pixels);
    for (const i of samples) {
      const delta = (truth[i] === 1 ? options.positiveWeight : options.negativeWeight) * (output[i] - truth[i]);
      for (let c = 0; c < conv2.outputs; c += 1) {
        const value = delta * dense.weights[c];
        deltaZ2[c * pixels + i] = cache.z2[c * pixels + i] > 0 ? value : 0;
      }
    }
    for (let o = 0; o < conv2.outputs; o += 1) {
      const weightOffset = o * conv2.inputs * conv2.kernel * conv2.kernel;
      for (const i of samples) {
        const delta = deltaZ2[o * pixels + i];
        if (delta === 0) continue;
        gradB2[o] += delta;
        const x = i % size.width;
        const y = (i - x) / size.width;
        for (let c = 0; c < conv2.inputs; c += 1) {
          const channelOffset = c * pixels;
          const weightChannel = weightOffset + c * conv2.kernel * conv2.kernel;
          for (let ky = 0; ky < conv2.kernel; ky += 1) {
            const sy = sampleY(y + ky - radius2, size);
            for (let kx = 0; kx < conv2.kernel; kx += 1) {
              gradW2[weightChannel + ky * conv2.kernel + kx] += delta * cache.a1[channelOffset + sy * size.width + sampleX(x + kx - radius2, size)];
            }
          }
        }
      }
    }

    // conv1 backward: dL/dA1 is the transpose of conv2's kernel.
    const deltaZ1 = new Float64Array(conv1.outputs * pixels);
    for (const i of samples) {
      const x = i % size.width;
      const y = (i - x) / size.width;
      let accumulated = 0;
      for (let o = 0; o < conv2.outputs; o += 1) {
        const weightOffset = o * conv2.inputs * conv2.kernel * conv2.kernel;
        let sum = 0;
        for (let ky = 0; ky < conv2.kernel; ky += 1) {
          const dy = sampleY(y - ky + radius2, size);
          for (let kx = 0; kx < conv2.kernel; kx += 1) {
            const dx = sampleX(x - kx + radius2, size);
            sum += deltaZ2[o * pixels + dy * size.width + dx] * conv2.weights[weightOffset + ky * conv2.kernel + kx];
          }
        }
        accumulated += sum;
      }
      deltaZ1[i] = cache.z1[i] > 0 ? accumulated : 0;
    }
    for (let o = 0; o < conv1.outputs; o += 1) {
      const weightOffset = o * conv1.inputs * conv1.kernel * conv1.kernel;
      for (const i of samples) {
        const delta = deltaZ1[i];
        if (delta === 0) continue;
        gradB1[o] += delta;
        const x = i % size.width;
        const y = (i - x) / size.width;
        for (let ky = 0; ky < conv1.kernel; ky += 1) {
          const sy = sampleY(y + ky - radius1, size);
          for (let kx = 0; kx < conv1.kernel; kx += 1) {
            gradW1[weightOffset + (ky * conv1.kernel + kx)] += delta * cache.a0[sy * size.width + sampleX(x + kx - radius1, size)];
          }
        }
      }
    }

    const scale = options.learningRate / Math.max(1e-9, totalWeight);
    for (let i = 0; i < conv1.weights.length; i += 1) conv1.weights[i] -= scale * gradW1[i];
    for (let i = 0; i < conv1.biases.length; i += 1) conv1.biases[i] -= scale * gradB1[i];
    for (let i = 0; i < conv2.weights.length; i += 1) conv2.weights[i] -= scale * gradW2[i];
    for (let i = 0; i < conv2.biases.length; i += 1) conv2.biases[i] -= scale * gradB2[i];
    for (let i = 0; i < dense.weights.length; i += 1) dense.weights[i] -= scale * gradWd[i];
    dense.biases[0] -= scale * gradBd;

    loss.push(totalLoss / Math.max(1e-9, totalWeight));
  }
  return { net, loss };
}

/** Binarise network output. The threshold is part of the measured pipeline. */
export function predictMask(net: Network, input: Image, size: Size, threshold = 0.5): Mask {
  const { output } = forward(net, input, size);
  const mask = new Uint8Array(output.length);
  for (let i = 0; i < output.length; i += 1) mask[i] = output[i] >= threshold ? 1 : 0;
  return mask;
}