import type { LayerId } from "../engine/types";
import type { Text } from "./i18n";

export interface LayerSource {
  label: string;
  url: string;
}

/**
 * The written layer beside every measurement.
 *
 * Each entry carries what the layer claims, what it is explicitly not for, and
 * the sources the claim rests on. A number without those three is an anecdote.
 */
export interface LayerContent {
  id: LayerId;
  index: string;
  title: Text;
  question: Text;
  method: Text;
  notFor: Text;
  sources: LayerSource[];
  /** Which single number a reader should look at first. */
  headlineMetric: string;
}

export const LAYER_CONTENT: LayerContent[] = [
  {
    id: "signal",
    index: "01",
    title: { tr: "Sinyal", en: "Signal" },
    question: { tr: "Örnekleme ve nicemleme görüntüyü ne kadar bozar?", en: "How much does sampling and quantisation damage the image?" },
    method: {
      tr: "Sahne 32 seviyeye nicemlenir, ardından σ=0.05 Gauss gürültüsü eklenir. PSNR, SSIM ve ortalama mutlak hata cevap anahtarına karşı hesaplanır.",
      en: "The scene is quantised to 32 levels and then given Gaussian noise at sigma 0.05. PSNR, SSIM and mean absolute error are computed against the answer key.",
    },
    notFor: {
      tr: "Kamera gürültüsü değildir. Eklenen gürültü sentetiktir ve gerçek bir sensörün kovasıyla ilgisi yoktur.",
      en: "This is not camera noise. The added noise is synthetic and says nothing about a real sensor's shot noise.",
    },
    sources: [
      { label: "PSNR and SSIM: image quality metrics", url: "https://www.rivertz.org/psnr-and-ssim/" },
    ],
    headlineMetric: "psnr",
  },
  {
    id: "filtering",
    index: "02",
    title: { tr: "Süzme", en: "Filtering" },
    question: { tr: "Ayırılabilir konvolüsyon iki boyutlu konvolüsyonun yerine geçebilir mi?", en: "Can a separable convolution stand in for the two-dimensional one?" },
    method: {
      tr: "Ayırılabilir Gauss ile naif iki boyutlu konvolüsyon aynı girdide çalıştırılır; RMSE ve maksimum mutlak fark ölçülür.",
      en: "A separable Gaussian and the naive two-dimensional convolution run on the same input; the RMSE and maximum absolute difference are measured.",
    },
    notFor: {
      tr: "Bu bir hız ölçümü değildir. Yalnızca kısayolun tanımı verdiği sonucu verdiğini gösterir.",
      en: "This is not a speed measurement. It only shows that the shortcut reproduces the definition.",
    },
    sources: [
      { label: "Gaussian derivative of Gaussian", url: "https://en.wikipedia.org/wiki/Derivative_of_Gaussian" },
    ],
    headlineMetric: "separableVsNaiveRmse",
  },
  {
    id: "edges",
    index: "03",
    title: { tr: "Kenar", en: "Edges" },
    question: { tr: "Nesne sınırının ne kadarı bulunuyor, bulunanlar gerçek mi?", en: "How much of the object boundary is found, and is what was found real?" },
    method: {
      tr: "Gauss bulanıklığı, Sobel, olmayan en büyük sönümleme ve histerezis. Kesinlik ve hatırlama bir piksel bant içinde ölçülür.",
      en: "Gaussian blur, Sobel, non-maximum suppression and hysteresis. Precision and recall are measured inside a one-pixel band.",
    },
    notFor: {
      tr: "Kenar bir nesnenin sınırı değildir. Gölge, doku sınırı ve parlaklık geçişi de kenardır.",
      en: "An edge is not the boundary of an object. A shadow, a texture boundary and a shading step are edges too.",
    },
    sources: [
      { label: "Canny edge detection", url: "https://en.wikipedia.org/wiki/Canny_edge_detector" },
      { label: "Non-maximum suppression", url: "https://en.wikipedia.org/wiki/Edge_detection" },
    ],
    headlineMetric: "f1",
  },
  {
    id: "regions",
    index: "04",
    title: { tr: "Bölge", en: "Regions" },
    question: { tr: "Eşikleme nesneyi buluyor mu, yoksa gölgeyi nesne mi sanıyor?", en: "Does thresholding find the object, or does it mistake a shadow for one?" },
    method: {
      tr: "Otsu eşiği, kapatma ve açma, dört komşuluklu bağlı bileşen etiketleme. Tespitler nesne maskeleriyle en yüksek örtüşmeye göre eşleştirilir.",
      en: "Otsu threshold, closing and opening, 4-connected labelling. Detections are matched to the object masks by largest overlap.",
    },
    notFor: {
      tr: "Bulunmayan nesneleri saymaz. Kaçırılan nesne kaçırılmış olarak raporlanır, yeniden adlandırılarak gizlenmez.",
      en: "It does not count objects that are not there. A missed object is reported as missed rather than hidden by relabelling.",
    },
    sources: [
      { label: "Otsu thresholding", url: "https://en.wikipedia.org/wiki/Otsu%27s_method" },
      { label: "Mathematical morphology", url: "https://en.wikipedia.org/wiki/Mathematical_morphology" },
    ],
    headlineMetric: "meanIoU",
  },
  {
    id: "geometry",
    index: "05",
    title: { tr: "Geometri", en: "Geometry" },
    question: { tr: "Düz çizgi nerede ve ufku yokken ne olur?", en: "Where is the straight line, and what happens without a horizon?" },
    method: {
      tr: "Kenar maskesi 180 kutuşuk Hough dönüşümüne girer; tepe noktaları normal biçiminde eşleştirilir.",
      en: "The edge mask enters a 180-bin Hough transform; peaks are matched in normal form.",
    },
    notFor: {
      tr: "Hough bir çizgi bulduğunda onun doğru olduğunu iddia etmez. Nesne kenarları da tepe üretir ve kesinlik bunu ölçer.",
      en: "A Hough peak is not a claim that the line is the intended one. Object edges produce peaks too, and precision measures that.",
    },
    sources: [
      { label: "Hough transform", url: "https://en.wikipedia.org/wiki/Hough_transform" },
    ],
    headlineMetric: "recall",
  },
  {
    id: "learning",
    index: "06",
    title: { tr: "Öğrenme", en: "Learning" },
    question: { tr: "Çalışma anında eğitilen bir ağ elle yazılmış yoldan ne satın alıyor?", en: "What does a network trained at run time buy over the hand-written path?" },
    method: {
      tr: "5x5 ve 3x3 konvolüsyonlu küçük bir ağ, sahnenin kendi cevap anahtarında 250 tam yığın iterasyonla eğitilir. Elle yazılmış yol tam olarak aynı piksellerde puanlanır.",
      en: "A small 5x5 and 3x3 convolutional network is trained for 250 full-batch iterations on the scene's own answer key. The hand-written path is scored on exactly the same pixels.",
    },
    notFor: {
      tr: "Bu bir başarım iddiası değildir. Ağırlıklar önceden eğitilmiş değildir; sabit tohumdan başlar ve her çalıştırmada aynıdır.",
      en: "This is not a performance claim. The weights are not pre-trained; they start from a fixed seed and are identical on every run.",
    },
    sources: [
      { label: "Cross-entropy loss", url: "https://en.wikipedia.org/wiki/Cross_entropy" },
      { label: "He initialisation", url: "https://arxiv.org/abs/1502.01852" },
    ],
    headlineMetric: "iouDelta",
  },
  {
    id: "depth",
    index: "07",
    title: { tr: "Derinlik", en: "Depth" },
    question: { tr: "Tek kamera gerçekte neyi bilir?", en: "What does a single camera actually know?" },
    method: {
      tr: "Yer düzlemi önseli ile yerel kontrast terimi karıştırılır ve nesne düzeyinde sıra korelasyonu hesaplanır.",
      en: "A ground-plane prior is mixed with a local-contrast term and the ordering is scored per object.",
    },
    notFor: {
      tr: "Ölçek değil sıra ölçülür. Tek kamera mesafeyi değil sıralamayı belirleyebilir.",
      en: "An ordering is measured, not a scale. A single camera can fix the ordering but not the distance.",
    },
    sources: [
      { label: "Spearman rank correlation", url: "https://en.wikipedia.org/wiki/Spearman%27s_rank_correlation_coefficient" },
      { label: "Monocular depth cues", url: "https://en.wikipedia.org/wiki/Stereo_vision" },
    ],
    headlineMetric: "objectRankCorrelation",
  },
  {
    id: "motion",
    index: "08",
    title: { tr: "Hareket", en: "Motion" },
    question: { tr: "Kareler arası ne değişti ve bu ölçüm güvenilir mi?", en: "What changed between the frames, and can that measurement be trusted?" },
    method: {
      tr: "Bilinen kaydırma ile Lucas-Kanade seyreltik akışı. Düz ve zayıf pencereler geçersiz olarak raporlanır.",
      en: "Sparse Lucas-Kanade against a known translation. Flat and weak windows are reported invalid.",
    },
    notFor: {
      tr: "Geçersiz pencereler sessizce atılmaz; geçerli oranı sonucun parçasıdır.",
      en: "Rejected windows are not silently dropped; the valid ratio is part of the result.",
    },
    sources: [
      { label: "Lucas-Kanade method", url: "https://en.wikipedia.org/wiki/Lucas%E2%80%93Kanade_method" },
    ],
    headlineMetric: "meanEndpointError",
  },
];

export function layerContent(id: LayerId): LayerContent {
  return LAYER_CONTENT.find((layer) => layer.id === id)!;
}