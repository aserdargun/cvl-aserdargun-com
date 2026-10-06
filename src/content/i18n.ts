/** Interface strings. Turkish and English are written side by side on purpose. */
export type Locale = "tr" | "en";
export type Text = Record<Locale, string>;

export const UI = {
  title: { tr: "CVL — Bilgisayarlı Görü Laboratuvarı", en: "CVL — Computer Vision Laboratory" } as Text,
  tagline: { tr: "Sentetik sahne. Bilinen cevap. Ölçülen algı.", en: "Synthetic scene. Known truth. Measured perception." } as Text,
  intro: {
    tr: "Her sahne prosedürel olarak üretilir ve piksel başına cevap anahtarıyla birlikte çizilir. Raporlanan her sayı bir tahmin değil, bir ölçümdür.",
    en: "Every scene is generated procedurally and painted together with its per-pixel answer key. Every reported number is a measurement, never an estimate.",
  } as Text,
  scene: { tr: "Sahne", en: "Scene" } as Text,
  truth: { tr: "Cevap anahtarı", en: "Answer key" } as Text,
  measured: { tr: "Ölçüm", en: "Measurement" } as Text,
  layers: { tr: "Katmanlar", en: "Layers" } as Text,
  metrics: { tr: "Ölçümler", en: "Measurements" } as Text,
  method: { tr: "Yöntem", en: "Method" } as Text,
  notFor: { tr: "Ne için değil", en: "What it is not for" } as Text,
  sources: { tr: "Kaynaklar", en: "Sources" } as Text,
  notes: { tr: "Notlar", en: "Notes" } as Text,
  engine: { tr: "Motor", en: "Engine" } as Text,
  seed: { tr: "Tohum", en: "Seed" } as Text,
  rerun: { tr: "Yeniden ölç", en: "Re-measure" } as Text,
  running: { tr: "Ölçülüyor…", en: "Measuring…" } as Text,
  notMeasured: { tr: "ölçülemedi", en: "not measurable" } as Text,
  contract: { tr: "Sözleşme", en: "Contract" } as Text,
  contractPass: { tr: "Anahtar kendisiyle uyumlu", en: "Key agrees with itself" } as Text,
  contractFail: { tr: "Anahtar kendisiyle uyumsuz", en: "Key disagrees with itself" } as Text,
  parity: { tr: "CPU / GPU paraleliği", en: "CPU / GPU parity" } as Text,
  language: { tr: "Türkçe", en: "English" } as Text,
  objects: { tr: "nesne", en: "objects" } as Text,
  lines: { tr: "çizgi", en: "lines" } as Text,
  footer: {
    tr: "CVL, VIS'in ölçüm yarısıdır: bilgi bankası açıklar, laboratuvar ölçer. Eğitim amaçlı, sentetik ve değişmez tohum.",
    en: "CVL is the measurement half of VIS: the knowledge bank explains, the laboratory measures. Educational, synthetic and fixed-seed.",
  } as Text,
};

export function localized(locale: Locale, text: Text): string {
  return locale === "tr" ? text.tr : text.en;
}