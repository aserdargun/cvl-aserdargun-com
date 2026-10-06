import { Random } from "./rng";
import type { ClassMap, Depth, Image, LineSegment, Mask, Scene, SceneObject, ShapeKind, Size } from "./types";

/**
 * Scene and answer key, painted in one pass.
 *
 * The generator never writes the picture and the truth separately. For every
 * pixel it decides the object id first, then writes luminance, depth and
 * background from that same decision. That is the only reason a reported IoU
 * can be trusted: the picture cannot disagree with its own answer key, because
 * there is only one decision.
 */

const HORIZON_LEVEL = 0.62;
const HORIZON_FEATURE = 201;
const LINE_FEATURE = 200;

function insideEllipse(x: number, y: number, box: { x: number; y: number; w: number; h: number }): boolean {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const nx = (x - cx) / (box.w / 2);
  const ny = (y - cy) / (box.h / 2);
  return nx * nx + ny * ny <= 1;
}

function insideRect(x: number, y: number, box: { x: number; y: number; w: number; h: number }): boolean {
  return x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
}

function insideShape(x: number, y: number, kind: ShapeKind, box: SceneObject["box"]): boolean {
  return kind === "rect" ? insideRect(x, y, box) : insideEllipse(x, y, box);
}

/** Line in normal form. `rho` is the signed distance of the line from the origin. */
export function toLineForm(x0: number, y0: number, x1: number, y1: number): LineSegment {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy) || 1;
  let nx = -dy / length;
  let ny = dx / length;
  let angle = Math.atan2(ny, nx);
  if (angle < 0) {
    // Adding pi to an angle reverses the normal it points along, so the vector
    // has to be reversed with it. Otherwise `angle` and `rho` describe two
    // different lines and the measured peak comes back mirrored through the
    // origin.
    angle += Math.PI;
    nx = -nx;
    ny = -ny;
  }
  const rho = nx * x0 + ny * y0;
  return { x0, y0, x1, y1, angle, rho };
}

function layOutObjects(random: Random, size: Size): SceneObject[] {
  const count = random.int(3, 4);
  const objects: SceneObject[] = [];
  const margin = 6;

  for (let index = 0; index < count; index += 1) {
    // Keep sampling until the object lands fully inside the image and does not
    // overlap an existing one. Overlap would make per-object IoU ambiguous.
    let placed = false;
    for (let attempt = 0; attempt < 64 && !placed; attempt += 1) {
      const w = random.int(16, 30);
      const h = random.int(14, 26);
      const x = random.int(margin, Math.max(margin, size.width - w - margin));
      // Objects sit on the ground plane, so they live below the horizon.
      const y = random.int(Math.round(size.height * 0.25), Math.max(Math.round(size.height * 0.25) + 1, size.height - h - margin));
      const box = { x, y, w, h };
      const clash = objects.some((other) => {
        const overlapX = box.x < other.box.x + other.box.w && other.box.x < box.x + box.w;
        const overlapY = box.y < other.box.y + other.box.h && other.box.y < box.y + box.h;
        return overlapX && overlapY;
      });
      if (clash) continue;
      // Inverse depth grows as an object comes closer, and a lower object in the
      // frame is the closer one on a ground plane.
      const nearness = (y + h) / size.height;
      // The level is drawn from a band that cannot overlap the background range.
      // An object that is invisible against the background would make its own
      // ground-truth boundary undetectable, and the edge layer would then be
      // measuring the scene's design mistake instead of the operator.
      const highContrast = index % 2 === 0;
      const level = highContrast ? random.uniform(0.45, 0.9) : random.uniform(0.02, 0.1);
      objects.push({
        id: index + 1,
        kind: index % 2 === 0 ? "rect" : "ellipse",
        label: `object-${index + 1}`,
        box,
        level,
        depth: 0.25 + 0.7 * nearness,
      });
      placed = true;
    }
  }
  return objects;
}

function layOutLines(random: Random, size: Size): LineSegment[] {
  const count = 3;
  const lines: LineSegment[] = [];
  const usedAngles: number[] = [];
  for (let index = 0; index < count; index += 1) {
    for (let attempt = 0; attempt < 48; attempt += 1) {
      const angle = random.uniform(Math.PI * 0.08, Math.PI * 0.92);
      // Keep the lines apart so each Hough peak is attributable.
      if (usedAngles.some((used) => Math.abs(used - angle) < Math.PI / 10)) continue;
      const cx = random.uniform(size.width * 0.2, size.width * 0.8);
      const cy = random.uniform(size.height * 0.15, size.height * 0.85);
      // Long enough that a painted line accumulates more Hough votes than any
      // object perimeter. A short line loses the geometry measurement to the
      // rectangles in the scene, which is a fact about the drawing and not
      // about the transform.
      const span = Math.hypot(size.width, size.height) * 0.8;
      const dx = Math.cos(angle) * span;
      const dy = Math.sin(angle) * span;
      const x0 = Math.round(cx - dx);
      const y0 = Math.round(cy - dy);
      const x1 = Math.round(cx + dx);
      const y1 = Math.round(cy + dy);
      usedAngles.push(angle);
      lines.push(toLineForm(x0, y0, x1, y1));
      break;
    }
  }
  return lines;
}

export interface SceneOptions {
  seed: number;
  width?: number;
  height?: number;
  /**
   * Deterministic high-frequency texture amplitude in [0,1].
   *
   * A flat synthetic field gives an optical-flow solver nothing to lock onto, so
   * the motion layer builds its scene with texture and says so. Texture is
   * painted in the same pass as everything else, so the key still cannot drift.
   */
  texture?: number;
  /**
   * Paint the one-pixel line decorations and the horizon rule.
   *
   * They belong to the geometry and edge measurements. They are narrower than
   * an optical-flow window, so a motion measurement on a frame that carries
   * them is dominated by an artefact of the drawing style rather than by the
   * structure it is supposed to track.
   */
  decorations?: boolean;
}

export function buildScene({ seed, width = 160, height = 120, texture = 0, decorations = true }: SceneOptions): Scene {
  const size: Size = { width, height };
  const random = new Random(seed);
  const objects = layOutObjects(random, size);
  const lines = decorations ? layOutLines(random, size) : [];
  // Small-displacement regime. A windowed solver linearises the motion, so a
  // displacement that approaches the texture period is measured with a real,
  // reportable bias rather than being hidden by picking a tiny shift.
  const shift = { dx: random.uniform(0, 1) < 0.5 ? -2 : 2, dy: random.pick([-2, 0, 2]) };

  const count = width * height;
  const luminance: Image = new Float64Array(count);
  const background: Image = new Float64Array(count);
  const depth: Depth = new Float64Array(count);
  const classes: ClassMap = new Uint8Array(count);
  // Feature id per pixel: 0 background, 1..n objects, 200 lines, 201 horizon.
  // The edge key is derived from this, so every visible feature has a boundary.
  const features = new Uint8Array(count);
  const phase = random.uniform(0, Math.PI * 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      // Background: a graded plane, darker at the top, so the depth measurement
      // has a real monotonic ground plane to recover rather than a flat field.
      const t = y / (height - 1);
      background[index] = 0.15 + 0.2 * t;
      depth[index] = 0.08 + 0.3 * t;
      classes[index] = 0;
      luminance[index] = background[index];

      if (decorations && y === Math.round(height * 0.22)) {
        luminance[index] = HORIZON_LEVEL;
        features[index] = HORIZON_FEATURE;
      }

      // One decision per pixel; everything else follows from it.
      let winner: SceneObject | null = null;
      for (const object of objects) {
        if (insideShape(x, y, object.kind, object.box)) {
          winner = object;
          break;
        }
      }
      if (winner) {
        classes[index] = winner.id;
        features[index] = winner.id;
        luminance[index] = winner.level;
        depth[index] = winner.depth;
      }

      if (texture > 0) {
        // A coherent grating, not random noise. White noise is the worst case
        // for a windowed flow solver: it has strong gradients in every
        // direction, so it passes the conditioning test, yet its temporal term
        // is uncorrelated with those gradients and the estimate collapses to
        // zero. A grating translates coherently and can actually be tracked.
        // Multiplicative, not additive: a dark object has no headroom, and
        // clipping a sinusoid destroys exactly the coherent structure the
        // flow solver is supposed to track.
        const gx = Math.sin((2 * Math.PI * x) / 24 + phase);
        const gy = Math.sin((2 * Math.PI * y) / 31 + phase);
        luminance[index] = clamp01(luminance[index] * (1 + texture * (0.7 * gx + 0.45 * gy)));
      }
    }
  }

  // Lines are drawn after the objects so the geometry measurement is not
  // occluded, and they are recorded in the key because they are painted.
  for (const line of lines) {
    drawLine(luminance, features, size, line, 0.94, LINE_FEATURE);
  }

  const foreground = new Uint8Array(count);
  const edges = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) foreground[index] = classes[index] > 0 ? 1 : 0;

  // A true edge is a painted feature pixel that touches something else. Because
  // the key is built from every feature rather than from the objects alone, the
  // horizon and the drawn lines are included: a detector that finds them is not
  // producing false positives.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const feature = features[index];
      if (feature === 0) continue;
      const left = x > 0 ? features[index - 1] : 0;
      const right = x < width - 1 ? features[index + 1] : 0;
      const up = y > 0 ? features[index - width] : 0;
      const down = y < height - 1 ? features[index + width] : 0;
      if (left !== feature || right !== feature || up !== feature || down !== feature) edges[index] = 1;
    }
  }

  return {
    size,
    seed,
    luminance,
    background,
    truth: { classes, foreground, edges, depth, lines, shift },
    objects,
  };
}

/** Nearest-pixel rasterisation of the ground-truth segment. */
function drawLine(target: Image, features: Uint8Array, size: Size, line: LineSegment, level: number, feature: number): void {
  const steps = Math.max(Math.abs(line.x1 - line.x0), Math.abs(line.y1 - line.y0), 1);
  // Two pixels wide: a one-pixel rule is thinner than the smoothing that
  // precedes edge detection, so it survives only intermittently.
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    for (let offset = 0; offset <= 1; offset += 1) {
      // `angle` is the normal angle, so the perpendicular direction is the
      // normal itself. Offsetting along the line would only lengthen it.
      const x = Math.round(line.x0 + (line.x1 - line.x0) * t + offset * Math.cos(line.angle));
      const y = Math.round(line.y0 + (line.y1 - line.y0) * t + offset * Math.sin(line.angle));
      if (x >= 0 && x < size.width && y >= 0 && y < size.height) {
        const index = y * size.width + x;
        target[index] = level;
        features[index] = feature;
      }
    }
  }
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Per-object ground-truth masks, derived from the class map rather than redrawn. */
export function objectMasks(scene: Scene): Map<number, Mask> {
  const masks = new Map<number, Mask>();
  for (const object of scene.objects) {
    const mask: Mask = new Uint8Array(scene.size.width * scene.size.height);
    masks.set(object.id, mask);
  }
  for (let index = 0; index < scene.truth.classes.length; index += 1) {
    const id = scene.truth.classes[index];
    if (id > 0) masks.get(id)![index] = 1;
  }
  return masks;
}