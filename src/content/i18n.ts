/** Interface strings. Turkish and English are written side by side on purpose. */
export type Locale = "tr" | "en";
export type Text = Record<Locale, string>;

/**
 * CVL measures. It does not explain, cite or teach.
 *
 * Every string here names a measurement, the machine that produced it, or the
 * reading in VIS where the idea behind it is explained and sourced. The prose
 * that used to live here belongs to the knowledge bank; keeping a copy of it
 * here is how two applications end up making the same claim twice.
 */
export const UI = {
  title: { tr: "CVL — Bilgisayarlı Görü Laboratuvarı", en: "CVL — Computer Vision Laboratory" } as Text,
  tagline: { tr: "Sentetik sahne. Bilinen cevap. Ölçülen algı.", en: "Synthetic scene. Known truth. Measured perception." } as Text,
  intro: {
    tr: "CVL ölçer, açıklamaz. Her sahne prosedürel olarak üretilir ve piksel başına cevap anahtarıyla birlikte çizilir; raporlanan her sayı bir tahmin değil, bir ölçümdür. Kavramların metni, yöntemleri ve kaynakları VIS'tedir.",
    en: "CVL measures, it does not explain. Every scene is generated procedurally and painted together with its per-pixel answer key; every reported number is a measurement, never an estimate. The prose, methods and sources behind each idea live in VIS.",
  } as Text,
  scene: { tr: "Sahne", en: "Scene" } as Text,
  truth: { tr: "Cevap anahtarı", en: "Answer key" } as Text,
  measured: { tr: "Ölçüm", en: "Measurement" } as Text,
  layers: { tr: "Katmanlar", en: "Layers" } as Text,
  metrics: { tr: "Ölçümler", en: "Measurements" } as Text,
  readingNote: {
    tr: "Bu katmanın ne ölçtüğü burada anlatılmaz. Açıklama, yöntem ve kaynaklar VIS bilgi bankasındadır.",
    en: "What this layer measures is not explained here. The explanation, the method and the sources are in the VIS knowledge bank.",
  } as Text,
  readInVis: { tr: "Bu ölçümü VIS'te oku", en: "Read this measurement in VIS" } as Text,
  rerun: { tr: "Yeniden ölç", en: "Re-measure" } as Text,
  running: { tr: "Ölçülüyor…", en: "Measuring…" } as Text,
  notMeasured: { tr: "ölçülemedi", en: "not measurable" } as Text,
  engine: { tr: "Motor", en: "Engine" } as Text,
  seed: { tr: "Tohum", en: "Seed" } as Text,
  notes: { tr: "Notlar", en: "Notes" } as Text,
  language: { tr: "Türkçe", en: "English" } as Text,
  footer: {
    tr: "CVL yalnızca ölçer. Kavramı VIS anlatır: https://vis.aserdargun.com — eğitim amaçlı, sentetik, değişmez tohum.",
    en: "CVL only measures. VIS explains the idea: https://vis.aserdargun.com — educational, synthetic, fixed seed.",
  } as Text,
};

export function localized(locale: Locale, text: Text): string {
  return locale === "tr" ? text.tr : text.en;
}