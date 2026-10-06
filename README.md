# CVL — Computer Vision Laboratory

**Sentetik sahne. Bilinen cevap. Ölçülen algı.**
**Synthetic scene. Known truth. Measured perception.**

VIS'in *ölçüm* yarısıdır. [VIS](https://vis.aserdargun.com/) bir bilgi bankasıdır: yedi algı
katmanını birincil kaynaklara bağlı olarak açıklar ve ölçmez. **CVL açıklamaz, ölçer.** O
fikirlerin her birini, sahneyle birlikte çizilen piksel cevap anahtarına kar hesaplar; bir
işleçin ne yaptığını ve nerede durduğunu soran sorular ise VIS'te, kaynaklarıyla birlikte
yanıtlanır. Bu yüzden CVL'de açıklama metni yoktur; her katmanın altında o katmanın okunacağı
bilgi bankası bağlantısı vardır.

Bu yüzden buradaki her sayı bir ölçümdür. Sahne sentetiktir, çizgileri prosedürel olarak
üretilir ve **yanına cevap anahtarı aynı geçişte yazılır**. Eğer resimle anahtar ayrışabilseydi,
raporlanan sayı artık ölçüm olmaktan çıkıp bir iddia olurdu; bu yüzden ikisi tek bir karardan
doğar.

Gerçek kamera, gerçek sahne, önceden eğitilmiş model, hesap gönderimi, hesap kaydı veya backend
**yoktur**.

## Ne ölçülüyor

| # | Katman | Ölçüm | İlk bakılacak sayı |
|---|---|---|---|
| 01 | Sinyal | 32 seviyeye nicemleme + σ=0.05 gürültü | `psnr` |
| 02 | Süzme | Ayırılabilir Gauss ↔ naif 2B konvolüsyon | `separableVsNaiveRmse` |
| 03 | Kenar | Sobel + Canny, bir piksel bant içinde | `precision` / `recall` |
| 04 | Bölge | Otsu + morfoloji + bağlı bileşen, örtüşmeye göre eşleşme | `meanIoU` |
| 05 | Geometri | 180 kutuşuk Hough, normal biçiminde eşleşme | `recall` |
| 06 | Öğrenme | Çalışma anında eğitilen küçük CNN ↔ elle yazılmış yol | `iouDelta` |
| 07 | Derinlik | Yer düzlemi önseli, nesne düzeyinde sıra korelasyonu | `objectRankCorrelation` |
| 08 | Hareket | Lucas-Kanade, bilinen kaydırmaya karşı | `meanEndpointError` |

## Üç katman, bir sözleşme

| Katman | Durum | Kapsam |
|---|---|---|
| **CPU** (varsayılan) | Her yerde çalışır, tam olarak deterministik | Sekiz katmanın tamamı, f64 biriktirme |
| **WebGPU** | `--enable-unsafe-webgpu` gerektirir, isteğe bağlı | Veri paralel geçişler, f32 biriktirme |

Arayüz **dürüstçe raporlar**: güvenli bağlam, `navigator.gpu`, adapter, cihaz ve üretici
ayrı ayrı gösterilir. `requestAdapter()` sessizce `null` dönebilir; `navigator.gpu` var olması bir
çekirdeğin çalışacağı anlamına gelmez. Bu yüzden arayüz bunu açıkça söyler ve sessizce geri
düşmez.

Histerezis ve Hough tepe araması sıralıdır; GPU'ya taşınmaz. Taşınırsa sonuç değişir, yalnızca
zamanlama değil.

## Çalıştırma

Node.js 22+:

```sh
npm ci
npm start          # http://127.0.0.1:8072
npm stop
```

| Komut | İş |
|---|---|
| `npm run dev` | ön planda geliştirme |
| `npm run build` | tsc, Vite derlemesi, `release.json`, artifact doğrulaması |
| `npm run preview` | derlenmiş uygulama, http://127.0.0.1:8073 |
| `npm test` | 12 alan testi: determinizm, sözleşme, operatör, metrik, öğrenme |
| `npm run test:ui` | 10 tarayıcı testi: akış, yeniden üretim, VIS sınırı, WebGPU paraleliği |
| `npm run validate` | lint + build + alan + tarayıcı |
| `npm run verify:live` | yayınlanan adresi doğrular |

WebGPU testi **atlamaz**. Gerçek bir adapter yoksa başarısız olur, çünkü "GPU yolunu test
etmedim" ile "GPU yolu çalışıyor" arasındaki fark, laboratuvarın varlık sebebidir.

## Doğrulama sözleşmesi

- `deterministik` — aynı tohum → bayt bayt aynı sahne. `Math.random` ve saat sahneye ulaşamaz.
- `ground-truth` — üreticinin kendi maskesi **IoU 1.0000** vermeli; sapma hata işaretidir.
- `parity` — CPU f64 ve GPU f32 aynı girdide ölçülür, tolerans **1e-3**.
- `adapter` — güvenli bağlam → `navigator.gpu` → `requestAdapter()` → `requestDevice()` zinciri
  adım adım raporlanır.
- `no-silent-fallback` — ölçülemeyen sayı `null` olur, asla NaN veya önceki değer taşınmaz.

## VIS ile sınır

CVL, [VIS](https://vis.aserdargun.com/) bilgi bankasının ölçüm yarısıdır ve iki uygulama
birbirinin kopyası değildir:

- **CVL ölçer.** Kaynak gösteremez, bu yüzden bir işleci açıklamaz.
- **VIS açıklar.** Motor içermez, bu yüzden ölçüm iddiasında bulunamaz.

Sınır arayüzde görünürdür: her CVL katmanı, kendi okuması için VIS'e giden bir bağlantı taşır.
Bağlantı öğrenme ilişkisidir; çalışma, onay veya veri aktarımı değildir.

## Kapsam

- Eğitim amaçlı, sentetik, deterministik. Gerçek model, gerçek sensör, telemetri, hesap veya
  kalıcı depolama yoktur.
- Sonuç şeması: [`schemas/experiment-run.schema.json`](schemas/experiment-run.schema.json)
- Mimari: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Doğrulama: [`docs/VALIDATION.md`](docs/VALIDATION.md)
- Dağıtım: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)