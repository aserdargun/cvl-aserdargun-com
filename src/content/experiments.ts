import type { LayerId } from "../engine/types";
import type { Text } from "./i18n";

/**
 * The measurement identity beside every run.
 *
 * This laboratory measures and does not explain. A layer therefore carries only
 * what a run needs in order to be identified and reproduced: its index, its
 * name, the number to look at first, and the reading in VIS that explains what
 * the operator does and where it stops.
 *
 * The prose — the question, the method, what the operator is *not* for, and the
 * sources behind the claim — lives in the knowledge bank at
 * https://vis.aserdargun.com/. Splitting them this way is the only way both
 * applications can stay honest: one number can be recomputed here, and one idea
 * can be cited there, without either surface pretending to be the other.
 */
export interface LayerContent {
  id: LayerId;
  index: string;
  title: Text;
  /** Which single number a reader should look at first. */
  headlineMetric: string;
  /** The knowledge-bank layer that explains this measurement. */
  readsIn: KnowledgeLayer;
}

/** Where the knowledge bank lives. CVL never measures here, VIS never explains elsewhere. */
export const KNOWLEDGE_BANK_URL = "https://vis.aserdargun.com/";

/**
 * The layers the knowledge bank actually publishes, which is *not* the set this
 * laboratory measures: VIS explains seven layers, this laboratory measures eight.
 *
 * The two vocabularies are deliberately different types. A reading must name a
 * layer the bank publishes, because the bank's fragment handler returns silently
 * when the id is unknown — so a link naming a layer VIS does not have opens the
 * top of the page and never says so. Typing this as `LayerId` is what allowed the
 * depth layer to ship a reading for a layer that does not exist.
 */
export type KnowledgeLayer = "signal" | "filtering" | "edges" | "regions" | "geometry" | "learning" | "motion";

/** The seven knowledge-bank layers, in the order the bank publishes them. */
export const KNOWLEDGE_LAYERS: readonly KnowledgeLayer[] = ["signal", "filtering", "edges", "regions", "geometry", "learning", "motion"];

/**
 * A deep link into a named knowledge-bank layer, so the reader lands on the
 * explanation of the operator they are looking at rather than on a home page.
 */
export function readingLink(layer: KnowledgeLayer): string {
  return `${KNOWLEDGE_BANK_URL}#katman-${layer}`;
}

export const LAYER_CONTENT: LayerContent[] = [
  { id: "signal", index: "01", title: { tr: "Sinyal", en: "Signal" }, headlineMetric: "psnr", readsIn: "signal" },
  { id: "filtering", index: "02", title: { tr: "Süzme", en: "Filtering" }, headlineMetric: "separableVsNaiveRmse", readsIn: "filtering" },
  { id: "edges", index: "03", title: { tr: "Kenar", en: "Edges" }, headlineMetric: "f1", readsIn: "edges" },
  { id: "regions", index: "04", title: { tr: "Bölge", en: "Regions" }, headlineMetric: "meanIoU", readsIn: "regions" },
  { id: "geometry", index: "05", title: { tr: "Geometri", en: "Geometry" }, headlineMetric: "recall", readsIn: "geometry" },
  { id: "learning", index: "06", title: { tr: "Öğrenme", en: "Learning" }, headlineMetric: "iouDelta", readsIn: "learning" },
  // Depth reads in Geometry, not in a layer of its own: the knowledge bank
  // publishes seven layers and depth is not one of them, so a `#katman-depth`
  // reading opened the top of that page and said nothing. The cue really is
  // geometric — a ground-plane prior anchored at the horizon — and its stated
  // blind spot is the one Geometry already names: scale-relative structure that
  // cannot know an object floating above the plane is still floating.
  { id: "depth", index: "07", title: { tr: "Derinlik", en: "Depth" }, headlineMetric: "objectRankCorrelation", readsIn: "geometry" },
  { id: "motion", index: "08", title: { tr: "Hareket", en: "Motion" }, headlineMetric: "meanEndpointError", readsIn: "motion" },
];

export function layerContent(id: LayerId): LayerContent {
  return LAYER_CONTENT.find((layer) => layer.id === id)!;
}
