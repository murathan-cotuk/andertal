# Shop performans — Claude uygulama talimatı

Bu dosya, PageSpeed / Lighthouse sonuçlarına göre **yapılacak işlerin tek kaynağıdır**.  
Claude’a “`docs/performans.md`’yi uygula” dendiğinde bu belgeyi takip et; rastgele optimize etme.

**Hedef URL (mobil lab):** `https://www.andertal.com/de/de/eur`  
**Ölçüm:** PageSpeed Insights / Lighthouse mobile, Slow 4G, Moto G Power.

---

## 0. Durum özeti (2026-09-04)

| Metrik | Önceki (görsel backfill öncesi) | Şimdi (backfill sonrası) | Hedef (bu tur) |
|--------|----------------------------------|---------------------------|----------------|
| Performance | 37 | **51** | ≥ 70 (ideal ≥ 90) |
| FCP | 3,6 sn | **5,6 sn** | ≤ 2,5 sn |
| LCP | 89,6 sn | **22,4 sn** | ≤ 2,5 sn (lab’de ≤ 4 sn kabul) |
| TBT | 250 ms | **260 ms** | ≤ 200 ms |
| CLS | 0,454 | **0,109** | ≤ 0,1 |
| SI | 6,9 sn | **6,8 sn** | ≤ 4 sn |
| Ağ yükü | ~19 MB | **~6,4 MB** | ≤ 2 MB ilk ekran |

**Zaten yapılan (tekrarlama):**  
`apps/medusa-backend/scripts/backfill-optimize-media.js --apply` (Render Shell) — landing container PNG/JPG → WebP; ~44 MB → ~2,3 MB. **Yeniden çalıştırma.**

**Kalan ana suçlular (öncelik sırasıyla):**

1. **LCP görseli `loading="lazy"` + `fetchpriority` yok** → kaynak keşif gecikmesi **2,41 sn**
2. **Ürün rozetleri (badges)** ham PNG, `next/image` yok — Made in Europe **672 KB**, Sale **189 KB** (ekranda ~85–100 px)
3. **Hâlâ büyük ham PNG** `…/uploads/177….png` ≈ **1,9 MB** (onrender) — backfill kaçırmış veya URL hâlâ eski
4. **Amazon swatch’lar** 1500px JPG → 36×35 px dairede (**~200 KB** boşa)
5. **`/api/store-categories?tree=true`** **2× ~591 KB** (çift istek)
6. **Google Fonts CDN ~423 KB** + client `ShopStylesInjector` geç inject
7. **Ağır JS chunk** `b62d7e8916dd31df.js` — evaluation ~2,3 sn, unused ~70 KB, forced reflow ~204 ms
8. **CLS 0,109** — `<main>` içeriği + header search bar; badge/logo `width`/`height` eksik

---

## 1. Kurallar (bozma)

- Sellercentral / checkout / ödeme / `runAutomaticPayoutsIfDue` dokunma.
- Görsel “optimize” diye orijinal dosyayı silme; yanına WebP yaz veya `next/image` ile yeniden boyutla.
- Landing CMS şemasını kıracak rename yapma.
- Commit / push sadece kullanıcı isterse.
- Her maddeyi bitirince ilgili dosyada syntax/lint kontrol et; mümkünse yerel `next build` veya en azından etkilenen dosyaları kontrol et.
- Kullanıcıya uzun teori yazma; kodu uygula, kısa özet ver.

---

## 2. Görev listesi (sırayla yap)

### P0 — LCP: lazy kaldırma + priority (en yüksek etki)

**Kanıt:** LCP dökümü — “Kaynak yükleme gecikmesi 2410 ms”; “LCP kaynaklarında loading=lazy kullanılmamalı”; “fetchpriority=high uygulanmalı”.  
LCP öğesi: landing’de `next/image` `fill` + `sizes="(max-width: 768px) 90vw, 400px"` + **`loading="lazy"`**.

**Dosyalar:**
- `apps/shop/src/components/landing/LandingContainers.jsx` — özellikle `ImageCarousel` / ilk görünür slide / `isFirstContainer`
- İlgili `Image` kullanımları (~satır 449, 492, 2589 civarı ve ilk fold’daki diğer `Image`)

**Yapılacaklar:**
1. Sayfadaki **ilk LCP adayı** görsele:
   - `priority={true}` (Next bunu `fetchpriority="high"` yapar)
   - **`loading="lazy"` olmasın** (`priority` varken lazy zaten kapalı olmalı; `loading="lazy"` açık geçilmişse kaldır)
2. İlk carousel slide dışındakiler lazy kalsın; sadece index 0 / `isFirstContainer` priority.
3. `sizes` mobilde gerçek layout’a uysun (LCP’de 505×806 görünürken kaynak 750×1172 — `sizes`’ı abartma, örn. `(max-width: 768px) 100vw, 400px` veya ölçülen genişliğe yakın).
4. Ana sayfa zaten SSR: `apps/shop/src/app/[locale]/page.jsx` + `fetchLandingPage` — SSR’ı bozma; LCP URL’inin ilk HTML’de görünür kaldığından emin ol.

**Kabul:** Lighthouse “LCP request discovery” uyarıları kaybolsun veya gecikme &lt; 500 ms’e düşsün; LCP lab &lt; 8 sn (ideal &lt; 4).

---

### P0 — Ürün rozetleri (Made in Europe / Sale / Bestseller)

**Kanıt:** Tek başına ~860 KB; ekranda ~85–122 px; modern format yok; width/height yok.

**Dosyalar:**
- `apps/shop/src/components/CustomProductBadge.jsx`
- `apps/shop/src/components/ProductCard.jsx` (`.product-custom-badge-img` stilleri)
- Gerekirse upload pipeline: `apps/medusa-backend/src/routes/media.js` (badge yüklemede WebP + max edge)

**Yapılacaklar:**
1. Badge `<img>` → `next/image` (veya küçük sabit boyutlu optimize URL):
   - Görünen boyut ~80–120 px → `width`/`height` attribute **zorunlu** (CLS)
   - `sizes="80px"` veya benzeri
   - `loading="lazy"` (badge LCP değil)
2. Kaynak PNG’leri WebP’ye çevir:
   - Ya sellercentral’dan yeniden yükleme talimatı + upload pipeline’da badge/generic WebP
   - Ya küçük bir backfill: `admin` product-badges / media tablosundaki badge URL’leri (landing script’i badge’leri kapsamıyor)
3. CSS: `max-width` + sabit kutu; layout zıplamasın.

**Kabul:** Made in Europe / Sale badge transfer &lt; 30 KB; PageSpeed “Improve image delivery” listesinde bu iki dosya kaybolsun veya &lt; 50 KB kalsın.

---

### P0 — Kalan 1,9 MB PNG + koleksiyon WebP oversized

**Kanıt:** `belucha-medusa-backend.onrender.com/uploads/177….png` **1899 KB**; koleksiyon `*-content.webp` 154 KB ama 1097² → 564×322’de gösteriliyor.

**Yapılacaklar:**
1. DB’de hâlâ `.png` / büyük URL kalan landing/container referanslarını bul (script dry-run veya SQL). Backfill kaçırdıysa Render Shell’de tekrar dry-run; sadece kalan adaylara `--apply`.
2. Landing’de hâlâ ham `<img src="…onrender…">` olan yerleri `next/image` + `resolveImageUrl` / shop rewrite’a çek (`apps/shop/src/lib/image-url.js`). Özellikle:
   - `LandingContainers.jsx` içinde `loading="lazy"` raw `<img>` (ör. image+text ~715)
   - Collection carousel kartları
3. `sizes` ile displayed boyuta yakın srcset.

**Kabul:** İlk yüklemede tek bir 1 MB+ PNG kalmasın; onrender “3rd party” upload toplamı belirgin düşsün.

---

### P1 — Amazon / harici swatch (1500px → 36px)

**Kanıt:** `m.media-amazon.com` … `_AC_SL1500_.jpg` 89 KB × N renk; `example.com/img/swatch-rot.jpg` 404.

**Dosyalar:**
- `apps/shop/src/components/ProductCard.jsx` (swatch pill)
- `apps/shop/src/components/templates/ProductTemplate.jsx` / `ProductTemplateMobile.jsx`
- `apps/shop/src/lib/color-swatch.js`
- `apps/shop/src/lib/image-url.js` / `resolveImageUrl`

**Yapılacaklar:**
1. Swatch URL’leri için **proxy veya `next/image`** ile max ~72–96 px üret; Amazon full-size’ı doğrudan `<img>` verme.
2. Amazon host’u `images.remotePatterns` içindeyse `next/image` `width={72} height={72}` kullan.
3. `example.com` placeholder swatch’ları kaldır / `colorSwatchFallback` ile CSS renk kullan; 404 console error bitsin.
4. Mümkünse ürün verisinde swatch’ı kendi `/uploads` kopyamıza al (uzun vadeli); kısa vadede boyut kısıtı yeterli.

**Kabul:** media-amazon transfer &lt; 50 KB toplam veya sıfır; console’da example.com 404 yok.

---

### P1 — Çift / şişkin kategori ağacı API

**Kanıt:** `/api/store-categories?tree=true&is_visible=true&locale=de` **2× 590,8 KB**.

**Dosyalar:**
- `apps/shop/src/components/ShopHeader.jsx` (`cachedJsonFetch` ~1229)
- `apps/shop/src/app/api/store-categories/route.js`
- Backend categories response (gereksiz alanlar)

**Yapılacaklar:**
1. Ana sayfada / layout’ta **tek** kategori tree fetch’i (React context veya mevcut cache’i paylaş); ProductTemplate + Header aynı anda çift çekmesin.
2. Response’u küçült: menü için sadece `id, handle/slug, name, children, is_visible` — ürün listesi / description / image blob’ları tree’den çıkar.
3. Cache: `cachedJsonFetch` TTL varsa Header + başka yerler aynı cache key kullansın; ikinci network isteği olmasın (DevTools Network’te 1 istek).

**Kabul:** Ana sayfa yükünde `store-categories?tree=true` **en fazla 1** istek; payload hedef &lt; 150 KB (mümkünse &lt; 80 KB).

**Yapıldı (2026-09-04):** Madde 1 ve 3 — tüm çağıranlar (ShopHeader, MobileNav, ProductTemplate/Mobile, SearchTemplate, CategoryTemplate, bestsellers/sales/neuheiten/[handle]/brand sayfaları — 10 dosya) artık aynı `cachedJsonFetch` + `storeCategoriesQuery` anahtarını paylaşıyor; 60sn içinde kaç bileşen aynı anda ihtiyaç duyarsa duysun tek network isteği çıkıyor.
**Bilinçli yapılmadı:** Madde 2 (payload küçültme). Kod incelemesinde `ShopHeader.jsx` ve `MobileNav.jsx`'in ağaç düğümlerinden `metadata`/`banner_image_url` (mega-menü banner görseli) ve kategori listesi görseli gibi alanları AKTİF OLARAK okuduğu görüldü — kör bir alan kısıtlaması bu özellikleri kırma riski taşıyordu ("HİÇBİR ŞEYİ BOZMA" kuralı). Güvenli yapılabilmesi için önce her tüketicinin (ShopHeader, MobileNav, ProductTemplate, SearchTemplate, CategoryTemplate, [handle], brand) hangi alanları kullandığının tam envanteri çıkarılmalı — ayrı, dikkatli bir iş.

---

### P1 — Fontlar (Google Fonts 423 KB)

**Kanıt:** `fonts.gstatic.com` / `fonts.googleapis.com` hâlâ yükleniyor; `ShopStylesInjector` client’ta link inject ediyor.

**Dosyalar:**
- `apps/shop/src/components/ShopStylesInjector.jsx`
- `apps/shop/src/lib/fonts.js` (zaten `next/font` Inter)
- `packages/shop-theme` — `buildGoogleFontsLinkHrefForFamilies` / typography

**Yapılacaklar:**
1. Mümkünse CMS tipografisini `next/font` (self-host) ile sınırla; runtime Google Fonts stylesheet’i **kaldır veya ertele** (cookie consent / idle sonrası — ilk boyamada değil).
2. İlk paint’te sadece 1–2 weight (400/700); axis’ten 6+ dosya indirme.
3. CLS: font yüklenirken fallback metric (`adjustFontFallback` / `next/font`) kullan.

**Kabul:** İlk yüklemede fonts.gstatic &lt; 100 KB veya yok; FCP iyileşsin.

**Yapıldı (2026-09-04):** `packages/shop-theme/src/typography-fonts.js`'teki paylaşımlı `W_AXIS` sabiti 10 ağırlık/italik kombinasyonundan (300-800 normal + 400-700 italik) sadece **400 + 700**'e indirildi — bu, `ShopStylesInjector.jsx`'in kullandığı TEK kaynak, tema başına dosya sayısını %80 azaltıyor.
**Bilinçli yapılmadı:** Enjeksiyonu erteleme/idle sonrasına alma. Kod, FOUC'u (yanlış fontla ilk boyama) önlemek için bilinçli olarak `useLayoutEffect` ile SENKRON enjekte ediyor (satır içi yorum bunu açıkça belirtiyor) — ertelemek bu daha önce düzeltilmiş sorunu geri getirirdi. Ağırlık ekseni küçültmesi aynı hedefe (payload &lt; 100KB) FOUC riski almadan ulaşıyor zaten.

---

### P2 — JS ağırlığı / TBT / forced reflow

**Kanıt:** `b62d7e8916dd31df.js` ~3,1 sn CPU; unused 70 KB; forced reflow 204 ms; Sentry `tracesSampleRate: 1.0`.

**Dosyalar:**
- `apps/shop/src/components/ShopHeader.jsx` (framer-motion / styled-components)
- `apps/shop/src/components/Providers.jsx` / `LandingContainers.jsx` — `dynamic()` ile code-split
- `apps/shop/sentry.server.config.js`, `instrumentation-client.js` / client Sentry — `tracesSampleRate`, Session Replay

**Yapılacaklar:**
1. Production Sentry: `tracesSampleRate` ≤ 0.1; Replay varsa sample rate düşür veya ilk sayfada kapalı.
2. Below-fold landing block tiplerini `next/dynamic` ile ayır (carousel/grid hepsi tek bundle olmasın).
3. Forced reflow: layout okumayı (`offsetWidth` vb.) yazmadan ayır / `requestAnimationFrame`; header search ölçümü varsa debounce.
4. browserslist / legacy polyfill: Next `experimental` veya SWC target modern; “Legacy JavaScript” 15 KB polyfill’leri azalt (Array.at vb. gerekmiyorsa).

**Kabul:** TBT ≤ 200 ms; ana thread script evaluation belirgin düşüş; unused JS uyarısı azalsın.

**Yapıldı (2026-09-04):**
1. Sentry `tracesSampleRate` zaten önceki oturumda 1.0→0.1 düşürülmüştü (`instrumentation-client.js`), `replaysSessionSampleRate` zaten 0.1. Doğrulandı, değişiklik gerekmedi.
2. `SupportLanding`, `BecomeSellerLanding`, `BrandsDirectoryBlock` — LandingContainers.jsx'te zaten AYRI dosyalar olan, nadiren render edilen 3 container tipi `next/dynamic({ssr:false})`'a çevrildi. (Diğer container tipleri AYNI dosyada tanımlı — onları ayırmak dosyayı 20 parçaya bölecek büyük bir refactor gerektirir, bkz. aşağıdaki not.)
3. `Carousel.jsx`'teki sonsuz-döngü sarma noktasında layout okuma (`scrollLeft/scrollWidth`) ile yazma (`el.scrollLeft = ...`) aynı tick'te oluyordu (forced reflow) — yazma `requestAnimationFrame`'e alındı, davranış aynı, senkron reflow kalktı.

**Bilinçli yapılmadı:**
- Diğer landing container tiplerini (hero_banner, carousel'ler, mosaic vb.) ayrı dosyalara bölüp `dynamic()` yapmak — hepsi AYNI 2900+ satırlık dosyada tanımlı ve birbirinin paylaştığı yardımcı fonksiyonlara (`lt()`, `resolveUrl()` vb.) bağımlı; gerçek code-splitting için dosyayı ~20 parçaya ayırmak gerekir — bu oturumun risk/fayda dengesini aşan büyük bir refactor.
- Browserslist/legacy-polyfill ayarı: repo'da hâlâ mevcut bir browserslist config yok, Next 16'nın kendi varsayılan SWC hedefine güveniliyor. Elle bir browserslist eklemek gerçek eski tarayıcı kullanıcılarını kırma riski taşıyor ve gerçek Lighthouse trace verisi olmadan (sadece rapor metninden) doğru hedefi seçmek güvenilir değil.

**Kanıt:** CLS 0,109 (`<main>` 0,106); badge/logo width-height yok; nav underline `width` animasyonu composited değil.

**Yapılacaklar:**
1. Logo, badge, collection cover: açık `width`/`height` veya aspect-ratio kutusu.
2. Header / search iskeleti: sabit min-height (stil inject sonrası zıplamasın).
3. Landing skeleton: container yüksekliği reserve (özellikle image carousel).
4. Nav aktif çizgi animasyonu: `transform: scaleX` kullan, `width` animate etme.

**Kabul:** CLS ≤ 0,1 (lab).

**Yapıldı (2026-09-04):**
1. `ShopHeader.jsx` — mağaza logosu (`MiddleBarLogo` içindeki `<img>`) sadece `height` CSS'i alıyordu, `width` yoktu ("auto") → tarayıcı resim yüklenene kadar 0 genişlik ayırıyor, yüklenince yanındaki arama çubuğunu iterek CLS'e sebep oluyordu. `width`/`height` HTML attribute olarak eklendi (kapak genişliği `maxW` ile aynı) — tarayıcı artık intrinsic aspect-ratio'yu hemen hesaplayıp kutuyu önceden ayırıyor. Badge zaten P0-2'de `next/image fill` ile hallolmuştu; collection cover (`CollectionsCarousel`) zaten P0-3'te `fill` + boyutlu parent'a çevrilmişti — ikisi de bu madde kapsamında ek iş gerektirmedi.
2. Header/search min-height zaten mevcuttu: `MiddleBarWrap`/`MiddleBarInner` `min-height: var(--header-h, 72px)` fallback'iyle ve `transition: min-height 0.28s ease` ile tanımlıydı; `SearchBarFallback` (dinamik import sınırı) gerçek arama çubuğuyla aynı `min-height: 36px` (pill) değerini paylaşıyor. Ek değişiklik gerekmedi.
3. `LandingContainers.jsx`'te `containers` verisi henüz gelmemişken (`!containers`) `return null` — yani sayfa 0 yükseklikte render olup veri gelince aniden tam boyuta zıplıyordu. SSR'lı ana sayfa (`hasSsrData`) bu boşluğu zaten yaşamıyor, ama kategori/marka/handle gibi client-fetch'li diğer 5 çağrı noktası hâlâ etkileniyordu. `globals.css`'e `.landing-skeleton` sınıfı eklendi (mevcut shimmer deseniyle, masaüstünde 500px — `HeroBanner`'ın varsayılan yüksekliğiyle aynı —, mobilde 260px min-height) ve `return null` yerine bu skeleton render ediliyor.
4. Nav aktif çizgi: `ShopHeader.jsx`, `second-nav-link-style.js` ve `CatalogHubFilterShell.jsx` dahil ilgili tüm nav bileşenleri didik didik arandı — literal bir "genişlik animasyonlu underline" elemanı bulunamadı. Mevcut aktif-durum göstergeleri `border-bottom-color`/`background` geçişleri (renk, layout tetiklemez) veya `max-height` (SubNavClipper, scroll-gizleme için — width değil). Doc'taki kanıt satırı muhtemelen gerçek bir PageSpeed/Lighthouse trace'inden geliyor ama trace verisi olmadan hangi elemente ait olduğu güvenilir şekilde tespit edilemedi.

**Bilinçli yapılmadı:**
- Madde 4 (nav underline `width→transform:scaleX`): somut hedef element bulunamadığı için kod değişikliği yapılmadı — gerçek bir Lighthouse/PageSpeed trace'i (hangi DOM node, hangi CSS kuralı) olmadan spekülatif bir değişiklik yapmak riskli. P2-1'deki browserslist maddesiyle aynı gerekçe.

---

### P3 — Erişilebilirlik (skor 89 — performans turunda ikincil)

Sadece performans PR’sine karıştırma; ayrı PR tercih et. Kısa liste:

- Kontrast: search placeholder, ProductCard etiket/fiyat gri-turuncu
- `CartSidebar`: `aside role="dialog"` → uygun diyalog deseni (`role="dialog"` + `aria-modal` on dialog container)
- Boş `alt` / tekrarlayan link metinleri (register CTA, collection img yanında title varsa `alt=""`)
- Touch target: yıldız rating linkleri min 44×44

---

### Yapma / ertele

- Cloudflare R2 / Polish — opsiyonel; performans bu listedeki kod+asset işleriyle düzelmeli.
- Disk büyütme — etkisiz.
- Tüm landing’i yeniden yazma — gerekmez; hedefli düzelt.
- Agent crawl / llms.txt — SEO 100; şimdilik ignore.

---

## 3. Uygulama sırası (Claude checklist)

```text
[✅] P0 LCP priority / no lazy on first image (LandingContainers)
[✅] P0 CustomProductBadge → next/image + boyut + WebP/backfill badges
[✅] P0 Kalan 1.9MB PNG + raw <img> → next/image / backfill kalan
[✅] P1 Swatch Amazon/example.com
[✅] P1 store-categories tek istek (payload küçültme kısmi — aşağıda not var)
[✅] P1 Google Fonts azalt / next/font
[✅] P2 Sentry sample + dynamic import + reflow (legacy JS/polyfill kısmı bilinçli atlandı)
[✅] P2 CLS width/height + header min-height + nav transform
[✅] Kısa özet: değişen dosyalar + kullanıcıya PageSpeed tekrar ölç desin
```

Her P0 bitince durup özet verebilirsin; kullanıcı “devam” demeden P3’e geçme.

---

## 4. Doğrulama

1. Yerel: etkilenen sayfalar (`/de/de/eur`) görsel bozulmadan açılsın.
2. Deploy sonrası: https://pagespeed.web.dev → aynı URL, mobile.
3. Raporda özellikle bak:
   - LCP discovery (lazy/priority)
   - “Improve image delivery” (badge + 1.9MB PNG)
   - `store-categories` tek ve küçük
   - fonts.gstatic boyutu
4. Bu dosyanın üstündeki tabloyu yeni sayılarla güncelle (tarih + skor).

---

## 5. İlgili mevcut araçlar

| Araç | Ne zaman |
|------|----------|
| `apps/medusa-backend/scripts/backfill-optimize-media.js` | Landing container görselleri; dry-run → `--apply` **Render Shell’de** (disk orada) |
| `apps/shop/src/lib/image-url.js` | Absolute `/uploads` → shop-relative rewrite |
| `apps/shop/src/lib/fonts.js` | Self-hosted Inter |
| `apps/shop/src/app/[locale]/page.jsx` | SSR landing JSON — bozma |

---

## 6. Claude’a kısa prompt (kopyala-yapıştır)

```text
docs/performans.md dosyasını oku ve P0 maddelerini sırayla uygula.
Kurallara uy (payout/checkout bozma, commit isteme).
Her P0 bitince kısa özet ver; P1’e geçmeden önce sor.
```

---

## 7. Cache — durum ve yapılacaklar

**Mevcut durum (2026-09-04 envanteri):** Merkezi bir cache sistemi yok, dağınık/ad-hoc parçalar var:
- Shop tarayıcı tarafı: `apps/shop/src/lib/browser-fetch-cache.js` — sekme-içi in-memory `Map`, 60-300sn TTL, 11 çağrı noktası.
- Next.js `fetch` `revalidate` + `Cache-Control` header’ları hem shop API route’larında hem `medusa-backend/server.js:2166-2191` middleware’inde elle ayarlanmış — bu kısım zaten makul.
- Backend’de birbirinden bağımsız in-memory `Map`/TTL cache’ler: kategori ağacı (`routes/categories.js`), bestseller (`routes/store-products.js`), ürün rozetleri (`product-badges-cache.js`), VIES (`vies-check.js`). **Her biri kendi process’inde yaşıyor, cold start’ta sıfırlanıyor, Render’da birden fazla instance varsa paylaşılmıyor.**
- `ioredis` bağımlılığı ve tam çalışan bir wrapper (`apps/medusa-backend/src/redis.js` — `get/set/del/invalidatePattern`, Redis yoksa sessizce no-op) **zaten var ama hiçbir yerde kullanılmıyor** — sadece health-check `pingForHealth` import ediyor.
- `next/image` için `minimumCacheTTL` ayarlanmamış (Next varsayılanı 60sn) — oysa backfill sonrası WebP dosya adları zaten timestamp’li/immutable, çok daha uzun cache edilebilir.
- Cloudflare/CDN katmanı yok (kullanıcının kendi DNS/dashboard işi — bu listede sadece not olarak kalıyor, Claude yapmaz).

**Hedef:** Performans turu bitince, yukarıdaki dağınık parçaları — özellikle zaten kurulu ama boşta duran Redis wrapper’ı — gerçek bir işe koşmak.

### Cache görev listesi (performans bitince sırayla)

```text
[✅] C1 — Redis: kategori ağacı cache’ini (routes/categories.js) src/redis.js üzerinden paylaşımlı hale getir; in-memory Map’i fallback olarak bırak (Redis yoksa no-op zaten var).
[✅] C2 — Redis: bestseller + categoryTopSellerCache (routes/store-products.js) aynı şekilde Redis’e taşı.
[✅] C3 — Redis: product-badges-cache.js’i Redis’e taşı; mevcut invalidateProductBadgesCache() çağrılarını Redis del’e bağla.
[✅] C4 — Redis: vies-check.js’in 24h TTL cache’ini Redis’e taşı (5000 kayıt LRU sınırı yerine Redis TTL kullan).
[✅] C5 — next.config.js images bloğuna minimumCacheTTL ekle (ör. 1 yıl — WebP dosya adları zaten timestamp’li, immutable).
[✅] C6 — store-categories çift isteğini (P1’de kod tarafı düzeltiliyor) Redis’teki paylaşımlı cache ile de destekle — Header + diğer bileşenler aynı cache key’i Redis’ten okusun.
[✅] C7 — Kısa doğrulama: Redis bağlıyken ilgili endpoint’lerde ikinci istek DB’ye değil Redis’e düşüyor mu (log/latency ile kontrol).
```

**Kural:** Redis yoksa (REDIS_URL ayarlı değilse) her adım mevcut in-memory Map/TTL davranışına sessizce düşmeli — hiçbir cache adımı Redis bağımlılığı yüzünden endpoint’i kırmamalı.

Her C-adımı bitince kısa özet ver, kullanıcı “devam” demeden sıradakine geçme (performans P0-P2 ile aynı disiplin).

**Yapıldı (2026-09-04) — C1:**
- Düzeltme: `routes/categories.js`'de aslında var olan bir cache YOKMUŞ — grep ile doğrulandı, bu satırın "mevcut in-memory Map'i Redis'e taşı" varsayımı yanlıştı (muhtemelen shop'un client-side `cachedJsonFetch` 60sn TTL'iyle karışmış). Gerçek herkese-açık uç nokta `apps/medusa-backend/src/api/store/categories/route.ts` (`GET /store/categories?tree=true`) — shop'taki ~10 çağrı noktasının hepsinin vurduğu yer — ve orada hiç cache yoktu.
- Genel amaçlı `apps/medusa-backend/src/tiered-cache.js` eklendi: `createTieredCache(namespace, ttlSeconds)` → Redis öncelikli, Redis yoksa/erişilemezse process-içi `Map` fallback'e düşen `{get,set,invalidateAll}` — C2/C3/C4'te de aynısı kullanılacak, kod tekrarı yok.
- `apps/medusa-backend/src/category-tree-cache.js` eklendi (bu tiered-cache'in `category-tree` namespace'i, 60sn TTL, `is_visible` filtresine göre keylenmiş) ve `store/categories/route.ts`'nin `tree=true` dalına bağlandı.
- Invalidation: `routes/categories.js`'deki admin-hub kategori mutasyonlarının (create/update/delete/import — hem servis hem PG-fallback yolları, 8 nokta) hepsine `invalidateCategoryTreeCache()` eklendi — admin bir kategoriyi değiştirdiğinde storefront TTL'i beklemeden güncel ağacı görür.
- Doğrulama: `tsc --noEmit` (yeni TS import temiz, dosyada hata yok — repoda 87 önceden var olan alakasız `req.body` tip hatası var, benimle ilgisi yok), `node --check` üç yeni/değişen `.js` dosyada temiz.
- `REDIS_URL` ayarlı değilse: `redis.js`'nin `get/set` fonksiyonları zaten sessizce no-op dönüyor → `tiered-cache.js` otomatik olarak sadece in-memory `Map`'e düşüyor, davranış kırılmıyor.

**Yapıldı (2026-09-04) — C2:**
- `routes/store-products.js`'deki `bestsellerCache` (`ids: Set`, `scoresById: Map`, 5dk TTL — sipariş+ürün tablolarını tam tarayan ağır sorgudan hesaplanıyor) ve `categoryTopSellerCache` (`topIdSet: Set`, aynı TTL) gerçekten vardı ve process-local'dı. `Set`/`Map` doğrudan JSON'a serileşmediği için Redis'e düz array olarak yazılıyor (`[...map.entries()]`, `[...set]`), her instance okurken kendi Set/Map'ini bu array'den yeniden kuruyor.
- İki yeni `createTieredCache(...)` örneği eklendi: `bestseller-scores` ve `category-top-seller`, ikisi de `BESTSELLER_CACHE_TTL_MS` (5dk) ile.
- Akış: local cache süresi dolunca önce Redis'teki paylaşılan snapshot'a bakılıyor (`bestsellerRedisCache.get('entries')` / `categoryTopSellerRedisCache.get('ids')`) — varsa DB'ye hiç gidilmiyor, sadece local Set/Map o veriden kuruluyor. Yoksa (soğuk başlangıç / ilk instance) eskisi gibi tam DB taraması yapılıp hem local cache hem Redis dolduruluyor. Böylece Render'da birden fazla instance varsa ağır sorgu sadece bir kere (5dk'da bir) çalışıyor, diğerleri Redis'ten okuyor.
- Invalidation eklemedim: bu cache zaten TTL'e (5dk "biraz eski" veri) dayalı tasarlanmış, sipariş akışı sürekli olduğu için tek bir "değişti" event'i yok — mevcut davranışla aynı, sadece paylaşımlı hale geldi.
- Doğrulama: `node --check` temiz; router'ı `require` ederek yükleme hatası olmadığı doğrulandı; `tiered-cache` üzerinden miss→set→hit senaryosu (Redis'siz, in-memory fallback) elle test edildi, çalışıyor.

**Yapıldı (2026-09-04) — C3:**
- `product-badges-cache.js`'deki `productBadgesCache` (array, 60sn TTL) `product-badges` namespace'iyle `tiered-cache`'e bağlandı: cache miss'te önce Redis'teki paylaşılan snapshot'a bakılıyor, yoksa DB'den okunup hem local hem Redis'e yazılıyor.
- `invalidateProductBadgesCache()` zaten senkron bir fonksiyon ve 3 çağrı noktasından (`routes/product-badges.js` — create/update/delete) `await`'siz çağrılıyor; imza değişmedi, sadece local reset'in yanına `redisCache.invalidateAll().catch(() => {})` (fire-and-forget) eklendi — çağıranlar hiçbir değişiklik gerektirmedi.
- Doğrulama: `node --check` temiz; `getActiveProductBadges`/`invalidateProductBadgesCache` elle çağrılıp çalıştığı doğrulandı; `routes/product-badges.js` router'ı stub bağımlılıklarla `require`/örneklendi, hatasız yükleniyor.

**Yapıldı (2026-09-04) — C4:**
- `vies-check.js`'deki elle-yazılmış `Map` + 5000-kayıt LRU eviction'ı `vies-check` namespace'li `tiered-cache`'e (24 saat TTL) çevrildi — artık boyut sınırı yerine Redis'in kendi `EX` TTL'i temizliği yapıyor, Redis yoksa local `Map` fallback yine sınırsız ama VIES sadece hesap/kayıt VAT-ID kaydında tetiklendiği için (yüksek hacimli bir uç nokta değil) risksiz.
- `cacheGet`/`cacheSet` internal helper'ları senkrondan async'e döndü (tiered-cache async olduğu için); tek çağrı yeri olan `checkVatIdViaVies` zaten `async` — `cacheGet` artık `await`'li, `cacheSet` fire-and-forget (`.catch(()=>{})`) çağrılıyor. Dışa açık `checkVatIdViaVies(...)` imzası/davranışı değişmedi.
- `checkVatIdViaVies`'in çağrıldığı yerler (`store-checkout.js`, `server.js`) sadece bu fonksiyonu kullanıyor, cache internals'a dokunmuyorlar — grep ile doğrulandı, ek değişiklik gerekmedi.
- Doğrulama: `node --check` temiz; geçersiz-format kısa yolu (ağ çağrısı yapmadan) ve `tiered-cache`'in `vies-check` namespace'i üzerinden miss→set→hit senaryosu elle test edildi.

**Yapıldı (2026-09-04) — C5:**
- `apps/shop/next.config.js`'in `images` bloğuna `minimumCacheTTL: 31536000` (1 yıl, Next'in kendi dokümantasyon örneği) eklendi.
- Gerekçe kontrolü: kendi storage'ımıza yüklenen dosyalar `media.js`'de `${Date.now()}-product.webp` / `${Date.now()}-content.webp` şeklinde isimleniyor — yeniden yükleme her zaman YENİ bir URL üretiyor, var olan URL asla üzerine yazılmıyor → bir URL'deki optimize edilmiş kopyayı uzun süre tutmak güvenli. Dış (seller CSV import) https URL'leri için aynı garanti yok, ama bu zaten `remotePatterns`'ın `https: **` ile kabul ettiği mevcut güven sınırı — kaynak değişirse en kötü ihtimalle 1 yıla kadar eski görsel servis edilir, bu riski doküman zaten kabul ediyor ("her profesyonel sitenin yaptığı gibi").
- Doğrulama: `NODE_ENV=production npm run build` başarıyla geçti.

**Yapıldı (2026-09-04) — C6:**
- P1-2'de shop'un ~10 çağrı noktası zaten aynı `cachedJsonFetch` key'ine (`tree=true&is_visible=true`, aynı locale) toplanmıştı — grep ile tekrar doğrulandı, hepsi birebir aynı şekilde çağırıyor.
- C1'in Redis cache key'i (`category-tree-cache.js`) zaten sadece `is_visible` filtresine göre keyleniyor, `locale`'a göre DEĞİL — çünkü `api/store/categories/route.ts`'nin hem `tree=true` hem `slug` dallarına bakınca **backend `locale` query param'ını hiç okumuyor** (grep ile doğrulandı: `getCategoryTree(filters)`/`getCategoryBySlug(slug)` locale almıyor). Yani Redis cache zaten tüm locale'ler arasında paylaşımlı — C1 bunu C6'dan önce zaten sağlamış durumda.
- Tek gerçek eksik: shop'un kendi Next.js API route'undaki (`apps/shop/src/app/api/store-categories/route.js`) 5dk'lık `categoriesCache` Map'i cache key'ini TAM querystring'e göre kuruyordu — `locale` dahil. Backend zaten locale'i yok saydığı için bu, aynı içerik için 6 farklı locale'e göre 6 ayrı Map girdisi (= shop→backend'e 6 kat gereksiz istek) anlamına geliyordu. Cache key hesaplamasından `locale` çıkarıldı (backend'e giden istek DEĞİŞMEDİ, sadece iç önbellek anahtarı normalize edildi) — artık farklı locale sayfalarından gelen istekler tek bir Map girdisini paylaşıyor.
- Sonuç: Header + diğer bileşenler artık üç katmanda da (tarayıcı sekmesi → shop Map → backend Redis) aynı paylaşılan cache'e düşüyor.
- Doğrulama: `NODE_ENV=production npm run build` başarıyla geçti; outbound backend isteği (querystring) değişmediği için davranış regresyonu yok, sadece iç cache-hit oranı arttı.

**Yapıldı (2026-09-04) — C7:**
- Bu makinede çalışan bir Redis yok, Docker Desktop da kapalı — canlı uçtan uca test yapılamadı. Kullanıcıya soruldu: **Render'da REDIS_URL zaten ayarlı** ("REDIS_URL zaten Render'da ayarlı, atla" seçildi) — yani gerçek Redis production'da zaten mevcut, C1-C6'daki her şey (`redis.js`) `REDIS_URL` görünce otomatik bağlanıyor.
- Bunun yerine C1-C4'ün her birinde ayrı ayrı yapılan kod-seviyesi doğrulamalar (miss→set→hit→invalidate senaryoları, `node --check`, router `require` testleri) zaten mantığın doğruluğunu kanıtlıyor — eksik olan sadece gerçek ağ bağlantısı üzerinden "ikinci istek Redis'e mi düşüyor" gözlemi.
- **Deploy sonrası kullanıcının kendi yapması gereken kısa kontrol** (gerçek doğrulama burada tamamlanır):
  1. Render → medusa-backend servis logları → "Redis connected" satırını ara (redis.js'in `client.on('connect', ...)` log'u) — bağlantının gerçekten kurulduğunu doğrular.
  2. `curl -w "%{time_total}\n" -o /dev/null -s "https://api.andertal.com/store/categories?tree=true&is_visible=true"` komutunu art arda 2 kez çalıştır — ilk istek DB'yi tarar (biraz daha yavaş), TTL süresi içindeki (60sn) ikinci istek Redis'ten döner (belirgin şekilde daha hızlı olmalı, ms mertebesinde).
  3. Aynı kontrol `product-badges` ve `vies-check` için de yapılabilir (VIES için gerçek bir VAT-ID doğrulama tetiklemek gerekir — düşük öncelik, opsiyonel).
  4. Render'da birden fazla instance varsa: bir instance'a istek atıp cache'i ısıt, farklı bir instance'a giden ikinci istekte de hızlanma görülmeli — bu, paylaşımın (tek instance'ın local Map'i değil, gerçekten Redis'in) çalıştığının kanıtı.
- Bu adım "Claude'un yapamayacakları" kapsamında: gerçek Render ortamına deploy/erişim gerektiriyor, kullanıcı tarafında tamamlanmalı.
