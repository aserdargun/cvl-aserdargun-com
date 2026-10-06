/** Shared shapes for the laboratory. A measurement is always typed against one of these. */

export interface Size {
  width: number;
  height: number;
}

/** Single-channel image in [0,1], row-major, length width*height. */
export type Image = Float64Array;

/** Binary labelling, row-major, length width*height. */
export type Mask = Uint8Array;

/** Object id per pixel; 0 is background, 1..n are the drawn objects. */
export type ClassMap = Uint8Array;

/** Ground-truth inverse depth in [0,1]; larger means nearer. */
export type Depth = Float64Array;

export type ShapeKind = "rect" | "ellipse";

export interface SceneObject {
  id: number;
  kind: ShapeKind;
  label: string;
  /** Bounding box in pixels. */
  box: { x: number; y: number; w: number; h: number };
  /** Luminance painted into the object, in [0,1]. */
  level: number;
  /** Ground-truth inverse depth painted into the object. */
  depth: number;
}

export interface LineSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  angle: number;
  rho: number;
}

/**
 * A scene and the answer key produced with it, in one pass.
 *
 * The scene pixels and the truth fields are written by the same drawing routine.
 * If they could drift apart, every downstream number would stop being a
 * measurement and become an assertion, so the type carries them together.
 */
export interface Scene {
  size: Size;
  seed: number;
  /** Painted luminance. */
  luminance: Image;
  /** Per-object background luminance, painted alongside `luminance`. */
  background: Image;
  truth: {
    classes: ClassMap;
    /** Union of all foreground. */
    foreground: Mask;
    /** Boundary of the foreground: the pixels a true edge detector must find. */
    edges: Mask;
    depth: Depth;
    lines: LineSegment[];
    /** Known translation of the second frame, for the motion measurement. */
    shift: { dx: number; dy: number };
  };
  objects: SceneObject[];
}

export type LayerId =
  | "signal"
  | "filtering"
  | "edges"
  | "regions"
  | "geometry"
  | "learning"
  | "depth"
  | "motion";

export interface StageArtifact {
  /** The measured output of the operator under test. */
  mask: Mask;
  label: string;
}

export interface FlowField {
  dx: Float64Array;
  dy: Float64Array;
  valid: Mask;
}

export interface Metrics {
  [key: string]: number | string | null;
}

export interface ExperimentRun {
  schemaVersion: "1.0";
  experimentId: LayerId;
  sceneSeed: number;
  engineId: "cpu" | "webgpu";
  engineDescribe: string;
  truth: StageArtifact;
  measured: StageArtifact;
  metrics: Metrics;
  notes: string;
}