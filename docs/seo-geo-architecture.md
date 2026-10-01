# SEO / GEO Mimarisi — Andertal

Bu doküman Andertal shop'unun (`apps/shop`) SEO, GEO/AEO (AI arama motorları için keşfedilebilirlik) ve Merchant
Discovery mimarisini anlatır. Amaç: tek bir merkezi, sürdürülebilir sistem — sayfalara dağılmış birbirinden
bağımsız SEO kodu değil.

Durum tablosu (ne tamam, ne eksik) için bkz. `docs/seo-implementation-status.md`.

---

## 1. Merkezi SEO mimarisi

Tüm metadata/JSON-LD üretimi **tek bir dosyadan** geçer: `apps/shop/src/lib/seo.js`. Bu dosya:

- `buildPageMetadata({ title, description, market, locale, path | pathForLocale, images, noIndex, noFollow })`
  → Next.js `generateMetadata` dönüş objesi (title, description, canonical, hreflang alternates, Open Graph,
  Twitter Card, gerekiyorsa `robots`).
- `buildProductJsonLd(product, { locale, market, canonicalUrl, reviewCount, reviewAverage })` → `Product` +
  `Offer` + `BreadcrumbList` JSON-LD dizisi.
- `buildCategoryJsonLd(category, { locale, market, canonicalUrl })` → `CollectionPage` + `BreadcrumbList`.
- `buildBrandJsonLd(brand, { locale, market, canonicalUrl })` → `CollectionPage` + `BreadcrumbList` (marka sayfası).
- `buildSellerJsonLd(seller, { locale, market, canonicalUrl })` → `WebPage` + `BreadcrumbList` (+ gerçek veri
  varsa `AggregateRating`) (satıcı mağaza sayfası).
- `buildFaqJsonLd(containers, locale)` → CMS `accordion` container'larından `FAQPage`.
- `buildOrganizationJsonLd()` / `buildWebsiteJsonLd()` → site geneli şema (root layout'ta render edilir).
- `productSeoFallback()` / `categorySeoFallback()` → SEO alanı boşsa gerçek ürün/kategori verisinden title/description
  üretir (asla jenerik metin değil — bkz. §3).

**Kural:** yeni bir sayfa tipi SEO'ya ihtiyaç duyduğunda, kendi başına metadata objesi yazmak yerine
`buildPageMetadata`/`buildProductJsonLd`/`buildCategoryJsonLd`'yi çağırmalı veya bu dosyaya yeni bir
`buildXJsonLd` eklenmeli. Şu an bu kurala uyan çağrı noktaları: `[locale]/[handle]/layout.jsx` (ürün/kategori/
koleksiyon/CMS), `[locale]/page.jsx` (anasayfa), `[locale]/brands/layout.jsx`, `[locale]/brand/[handle]/layout.jsx`,
`[locale]/seller/[seller_id]/layout.jsx`, `[locale]/pages/[slug]/layout.jsx`.

JSON-LD'nin DOM'a basılması tek bir paylaşılan component üzerinden olur: `apps/shop/src/components/SeoJsonLd.jsx`.

## 2. URL stratejisi

Public URL şekli: `/{country}/{locale}/...` (örn. `/de/de/produkt-x`). İç Next.js route'ları next-intl ile
`/{locale}/...` — middleware (`apps/shop/src/proxy.js`) bu iki şekli birbirine çevirir.

- **Canonical kural:** her locale için TEK bir "kanonik market" var (`defaultMarketForLocale()`,
  `apps/shop/src/lib/shop-market.js`) — örn. `de` locale → `de` market, `fr` locale → `fr` market. Bütün
  `<link rel="canonical">` etiketleri her zaman bu kanonik market+locale kombinasyonuna işaret eder.
- **Market-tekrar sorunu:** `isValidMarket()` herhangi bir 2 harfli kodu kabul ediyor (gerçek bir whitelist değil,
  sadece referans amaçlı `SHOP_MARKETS` listesi var) — yani `/us/de/...`, `/xx/de/...` gibi binlerce kombinasyon
  aynı sayfayı `200 OK` ile döndürüyor. Bunu routing seviyesinde kısıtlamadık (gerçek bookmark/kampanya linkleri
  kırılabilir, "mevcut sistemi bozma" kuralına aykırı olurdu) — bunun yerine `buildPageMetadata` artık
  `isCanonicalMarket(market, locale)` kontrolü yapıp kanonik olmayan her market için otomatik
  `robots: noindex, follow` ekliyor (`apps/shop/src/lib/seo.js`). Routing aynen çalışmaya devam ediyor, sadece
  Google'a "bu kopya, asıl burada" sinyali artık gidiyor.
- **Legacy URL'ler:** `/{locale}/product/[slug]`, `/{locale}/produkt/[handle]`, `/{locale}/category/[slug]`
  sadece 301 (`permanentRedirect`) atan shim'ler — gerçek sayfa değiller.
- **Stabil link'ler:** `/{locale}/p/[an_id]` bir Route Handler, Sellercentral'daki AN-ID'den gerçek ürün
  handle'ına 302 çevirir (affiliate/stabil link senaryosu — ürün yeniden adlandırılsa bile link kırılmaz).

## 3. Product SEO

Gerçek route: `apps/shop/src/app/[locale]/[handle]/layout.jsx` + `page.jsx` (catch-all handle route; diğer
`product/`, `produkt/` route'ları birer yönlendirme kabuğu).

- **Metadata:** `productSeoFallback()` sırasıyla dener: çeviri `seo_title`/`seo_description` → `metadata.seo_meta_title`
  → yerelleştirilmiş başlık/açıklama → ham `title`/`description`. Yani satıcı/admin SEO alanlarını doldurmadıysa
  jenerik metin DEĞİL, gerçek ürün başlığı/açıklaması kullanılır.
- **JSON-LD (`Product`):** `name`, `description`, `image[]`, `sku`, `gtin{8,12,13,14}` (sadece gerçek EAN/barkod
  varsa ve uzunluğu GS1 standardına uyuyorsa), `brand` (varsa), `category`, `offers.price/priceCurrency/
  availability/itemCondition/seller`, `aggregateRating` (gerçek inceleme verisi varsa).
- **Veri bütünlüğü kuralı:** şemaya konan HER alan `admin_hub_products` tablosundan ya da onun `metadata` jsonb
  alanından gelir — hiçbir alan uydurulmaz. Şu an **GERÇEKTEN VAR OLMAYAN** alanlar: `MPN`, `warranty`,
  `weight`/`dimensions`, gerçek `condition` (used/refurbished) — bunlar şemaya hiç eklenmedi, ileride bu kolonlar
  DB'ye eklenirse `buildProductJsonLd`'ye eklenebilir. `itemCondition` şu an platform geneli sabit
  `NewCondition` — Andertal'de ikinci el/yenilenmiş ürün akışı olmadığı için bu bir iş kuralı, uydurma veri değil.
- **Çoklu satıcı / aynı EAN:** Aynı ürünü birden fazla satıcı satıyorsa (`store-products.js`,
  `storeProductByIdFromAdminHubGET`), backend EAN bazlı "buy box" hesaplar (fiyat + satıcı puanı + stok +
  marka onayı) ve kazanan satıcının sayfasını kanonik URL yapar. Sunucu tarafında `<link rel="canonical">`,
  hreflang ve JSON-LD zaten kazanan satıcının URL'sine işaret eder; istemci tarafında da `router.replace()` ile
  (HTTP redirect değil, yumuşak link değişimi) aynı URL'e geçilir.
- **Ürün durumu / indexability:** silinmiş, yayından kaldırılmış veya onaysız-satıcı ürünleri backend API'de zaten
  404 döndürüyor. `[handle]/layout.jsx`'te artık bu durumda (`entity.kind === "none"`) `robots: {index:false,
  follow:false}` ekleniyor — önceden bu generic "Andertal" başlıklı bir sayfa 200 ile indexlenebilir kalıyordu.
  **Not:** sayfanın HTTP status kodu hâlâ 200 (gerçek `notFound()`/404 değil) — `page.jsx` client component
  olduğu için bunu değiştirmek daha büyük bir routing değişikliği gerektirir, bkz. roadmap (§16).
- **AggregateRating:** `store_product_reviews` tablosunda gerçek inceleme verisi var ve PDP'de gösteriliyordu,
  ama tekil ürün API'si (`GET /store/products/:handle`) bu veriyi JSON-LD'nin okuduğu `metadata.review_count`/
  `review_avg` alanlarına hiç koymuyordu — yani alan "destekleniyor" görünüyordu ama pratikte hiç tetiklenmiyordu.
  `enrichMappedStoreProduct()` (`apps/medusa-backend/src/routes/store-products.js`) artık aynı multi-seller/EAN
  grubu (`matchIds`) için `store_product_reviews`'tan gerçek `COUNT`/`AVG` çekip ekliyor.

## 4. Category SEO

Gerçek route yine `[locale]/[handle]/layout.jsx` (kategori dalı) + `CategoryTemplate.jsx`.

- `admin_hub_categories`: `name`, `slug` (unique), `description`, `parent_id`, `seo_title`, `seo_description`,
  `long_content`, `banner_image_url`. SEO Hub (`apps/medusa-backend/src/routes/seo-hub.js`) bunları tek tek
  düzenleme imkanı veriyor — ama **toplu otomatik üretim sadece ürünler için var** (`/seo/products/auto-generate`),
  kategoriler için yok. 24.000 kategoride bu alanların çoğu muhtemelen boş — bilerek 24.000 sayfaya AI metni
  doldurmadık (görev tanımının kendisi de bunu yasaklıyor); bunun yerine (a) indexlenebilirlik kontrolü (§5) ve
  (b) gerçek veriden (ürün sayısı, alt kategoriler, breadcrumb) beslenen bir sayfa yapısı önceliklendirildi.
- **JSON-LD:** Artık `buildCategoryJsonLd()` ile `CollectionPage` + `BreadcrumbList` üretiliyor (önceden kategori
  sayfalarında SIFIR yapılandırılmış veri vardı). Breadcrumb, `/store/categories?slug=` endpoint'inin zaten
  döndürdüğü gerçek `ancestors` zincirinden geliyor (`fetchStoreCategoryBySlug()` artık bunu `_ancestors` olarak
  taşıyor — önceden bu alan response'tan atılıyordu).
  `ItemList` eklenmedi: bunu doğru yapmak JSON-LD için ayrıca bir ürün listesi çekmeyi gerektirir
  (`CategoryTemplate.jsx` zaten gerçek ürün gridini render ediyor) — gelecekte eklenirse aynı veri kaynağından
  (kategori ürün listesi API'si) beslenmeli, ayrı bir fetch icat edilmemeli.

## 5. İndexlenebilirlik (noindex mimarisi)

`buildPageMetadata`'nın `noIndex`/`noFollow` parametreleri artık gerçekten kullanılıyor (önceden kodda vardı ama
hiçbir çağrı noktası `true` geçmiyordu — "ölü kod"du):

| Durum | Davranış |
|---|---|
| Market URL'i o locale için kanonik değilse (`/us/de/...`) | `noindex, follow` (otomatik, `buildPageMetadata` içinde) |
| `[handle]` hiçbir ürün/kategori/koleksiyon/CMS sayfasına çözülmüyorsa (silinmiş/yayından kalkmış/typo) | `noindex, nofollow` |
| Ana sayfa, kanonik olmayan market altında | `noindex, follow` |

**Henüz yapılmadı (roadmap, §16):** kategori `has_products === false` (alt ağacında hiç ürün yok) durumunda
otomatik noindex. Bu sinyal zaten hesaplanıyor (`apps/medusa-backend/src/store-category-tree.js`,
`annotateCategoryTreeHasProducts`) ve storefront menüsünden boş kategorileri gizlemek için kullanılıyor — ama
`generateMetadata`'ya hiç iletilmiyor. Bunu bağlamak, sitemap'teki `has_products` filtresiyle (§7) tutarlı bir
sonraki adım.

## 6. Faceted navigation

Denetimde çıkan gerçek: **marka/fiyat/renk/beden/beden gibi filtreler URL'de hiç temsil edilmiyor** —
`StackedFilterPanel.jsx` tamamen React state, `URLSearchParams`/`router.push` kullanmıyor. Yani görev
tanımındaki "sınırsız filtre URL'si → indexleme" riski **şu anda fiilen yok** (filtre URL'si diye bir şey yok ki
indexlensin). URL'de yaşayan tek parametreler: `sort`, `sale`, `neu`, `bestseller` (kategori/koleksiyon
sayfalarında) ve `q`/`cat` (arama sayfasında) — hepsi sabit, küçük bir değer kümesiyle sınırlı, whitelist'e
ihtiyaç duyacak kadar patlayan bir alan değil.

**Mimari karar:** şu an bu parametreler için ayrı bir noindex/canonical kuralı YAZMADIK, çünkü `generateMetadata`
zaten `searchParams`'ı hiç okumuyor — yani kanonik her zaman parametresiz URL'e işaret ediyor (kazara doğru
davranış). Eğer ileride facet'ler gerçek URL state'i kazanırsa (kullanıcı deneyimi için paylaşılabilir/
bookmarklanabilir filtre linkleri istenirse), şu kural önerilir: facet kombinasyonu ticari değeri olan, önceden
tanımlı bir "landing" ise (`?brand=X` tek başına gibi) indexlenebilir + kendi canonical'ına sahip olsun; iki veya
daha fazla facet birleşimi her zaman `noindex, follow` + ana kategori URL'sine canonical olsun. Bu, kod
yazılmadan önce karar olarak buraya not edildi; bugün gerçek bir URL alanı olmadığı için erken/spekülatif kod
yazmadık (gereksiz refactor/karmaşıklık).

## 7. Structured Data envanteri

| Şema | Nerede | Kaynak veri |
|---|---|---|
| `Organization`, `WebSite` (+`SearchAction`) | Root layout, her sayfada | Sabit + `SITE_URL` |
| `Product`, `Offer`, `Brand`, `AggregateRating` | Ürün sayfası | `admin_hub_products` + `store_product_reviews` |
| `BreadcrumbList` (ürün) | Ürün sayfası | `metadata.category_slug` |
| `CollectionPage`, `BreadcrumbList` (kategori) | Kategori sayfası | `admin_hub_categories` + ancestors |
| `CollectionPage`, `BreadcrumbList` (marka) | `/brand/[handle]` | `admin_hub_brands` |
| `WebPage`, `BreadcrumbList`, `AggregateRating` (satıcı) | `/seller/[seller_id]` | `admin_hub_seller_settings` + `store_product_reviews` |
| `FAQPage` | `/pages/[slug]` (CMS, `accordion` container'ı varsa) | Sellercentral landing-page editör verisi |

**Hâlâ yok (bilinçli, veri/kapsam nedeniyle ertelendi):** `FAQPage` (CMS'teki `accordion`/`support_faq`
container'ları gerçek soru/cevap verisi taşıyor ama hiçbir şema üretilmiyor — veri var, bağlama eksik),
`Article`/`BlogPosting` (blog `page_type='blog'` olarak işaretli ama şema yok), `Review` (tekil inceleme listesi —
sadece `aggregateRating` var). Bunlar gerçek, mevcut veriden üretilebilir ama bu turda kapsam dışı bırakıldı —
bkz. implementation-status.

## 8. Sitemap

`apps/shop/src/app/sitemap.xml/route.js` — tek `<urlset>` dosyası (henüz sitemap index değil, §16'ya bakın).

İçerik: statik sayfalar, koleksiyonlar, ürünler (sayfalanmış, `status=published`, 750×200 = ~150k satır tavanı),
**kategoriler (yeni — sadece `is_visible !== false && has_products !== false`, yani boş/tanıtımı olmayan
kategoriler sitemap'e girmiyor)**, CMS sayfaları, markalar. Her URL için tüm aktif locale'ler için hreflang
`xhtml:link` alternates var.

**Sahte `lastmod` yok:** `urlEntry()` artık `lastmod` parametresi boşsa etiketi tamamen atlıyor (önceden her
zaman `today` damgalıyordu — kategoriler için gerçek bir `updated_at` yok, o yüzden hiç basılmıyor). Markalar
için `admin_hub_brands.updated_at` artık gerçekten seçiliyor ve kullanılıyor (önceden `created_at` bile
response'a dahil ama sitemap'te kullanılmıyordu, sabit `today` basılıyordu).

**Satıcı sayfaları:** `apps/medusa-backend/src/routes/platform-checkout.js`'teki yeni `GET /store/sellers`
endpoint'i (önceden hiç yoktu — sadece tekil `/store/seller-profile/:seller_id` vardı) onaylı ve gerçek
`store_name`'i olan satıcıları `admin_hub_seller_settings`'ten listeler; sitemap artık bunları `seller/{id}`
olarak, gerçek `updated_at` ile ekliyor.

**50.000 URL limiti:** şu an tek dosya — toplam URL 45.000'i geçerse sunucu loguna uyarı basılıyor
(`console.warn`), ama otomatik sitemap index'e bölünmüyor. Bu bilinçli bir risk kabulü: mevcut katalog
büyüklüğü bu sınırın çok altında, index'e bölmek (ürün/kategori/marka/sayfa için ayrı dosyalar + bir
`<sitemapindex>`) ayrı bir mimari değişiklik ve test yükü getiriyor — "gerekirse" yapılacak iş olarak
roadmap'e (§16) alındı, erken optimizasyon yapılmadı.

## 9. Robots.txt

`apps/shop/src/app/robots.txt/route.js`. Hesap/checkout/sepet/giriş/mesajlar gibi tüm özel/işlemsel yüzeyler
`Disallow` ile kapalı, artık `/*/cms-preview` (taslak önizleme, indexlenecek gerçek içeriği yok) de eklendi.
`Sitemap:` satırı mevcut. `GPTBot` (OpenAI'ın model-eğitim crawler'ı) engelleniyor, ama `OAI-SearchBot`
(ChatGPT'nin arama/keşif crawler'ı) ve `Googlebot`/`Bingbot` açık — yani AI arama motorları içeriği
keşfedebiliyor, model eğitimi için toplu kazınmıyor. **Robots.txt noindex yerine kullanılmıyor** — crawl
engelleme ile indexleme engelleme (meta `robots`) ayrı tutuldu (§5).

## 10. Internal linking

Mevcut: breadcrumb (ürün JSON-LD + kategori HTML/JSON-LD), kategori→üst/alt/kardeş kategori linkleri,
CMS sayfa kısayolları. **Zayıf:** ürün→marka, ürün→satıcı, ürün→benzer ürün gibi çapraz linkler JSON-LD'de yok;
kategori filtre panelindeki marka seçimi gerçek `/brand/[handle]` linkine gitmiyor (sadece state). Bu turda
kapsam dışı bırakıldı (UI/UX değişikliği gerektiriyor, SEO spam'ine kaçmadan "anlamlı" link eklemek dikkat
ister) — roadmap'e not edildi.

## 11. GEO / AEO (AI arama motorları için keşfedilebilirlik)

Amaç: ChatGPT/Gemini/Perplexity gibi sistemlerin Andertal hakkında doğru bilgiyi bulup alıntılayabilmesi — AI'ları
kandırmaya çalışmadan (gizli metin, cloaking, vb. YOK).

**Mevcut CMS sayfaları (gerçek, zaten var):** `about-us`, `verkaeufer-werden` (satıcı olma), `versand-lieferung`
(kargo), `retoure` + `right-of-withdrawal` (iade/cayma), `customer-support`, `terms-conditions`, `privacy-policy`,
`legal-notice`. Bunlar görev tanımındaki `/about`, `/shipping`, `/returns`, `/for-sellers` isteklerini zaten
karşılıyor — farklı slug'larla.

**Gerçekten eksik olan ve bu turda OLUŞTURULMAYAN sayfalar:** `/fees` (satıcı komisyon/ücret yapısı), `/warranty`
(garanti politikası), `/compliance` (GPSR/uyumluluk süreci — backend'de `compliance_review` mantığı var ama
public bir açıklama sayfası yok), `/how-it-works`, `/jtl`, `/billbee` (gerçek entegrasyonlar var —
`apps/medusa-backend/src/routes/integrations.js` — ama public tanıtım sayfası yok). **Neden oluşturulmadı:**
görev tanımı açıkça "bu sayfaların içeriği sadece gerçek Andertal business logic'inden gelsin... marketing
fluff/uydurma veri üretme" diyor — gerçek ücret yüzdesi, gerçek garanti metni, gerçek compliance süreç açıklaması
elimde doğrulanmış veri olarak yok. Bunları yazmak "gerçek olmayan veri üretme" kuralını ihlal ederdi. Bu sayfalar
için gerçek metni (fiyat/komisyon tablosu, garanti şartları, compliance süreci) sağladığınızda doğrudan
`admin_hub_pages`'e eklenebilir — altyapı (CMS, landing-page editör, SEO metadata, sitemap) hazır, sadece
içerik eksik.

**"Doğrudan cevap" yapısı:** görev tanımındaki "Was ist Andertal? → ilk paragrafta cevap" prensibi mevcut
`about-us` sayfasının gerçek içeriğine uygulanabilir bir editoryal kural — bu bir içerik/metin düzenleme işi,
kod değişikliği değil; CMS editöründen (Sellercentral → Content → Pages) uygulanmalı.

## 12. llms.txt

`apps/shop/src/app/llms.txt/route.js` zaten vardı — statik/elle yazılmış, 6 yüzey (anasayfa, brands, bestsellers,
neuheiten, sales, customer-support) listeliyor, hangi şemaların var olduğunu doğru şekilde belirtiyor (Product+
Offer+BreadcrumbList). Private/admin URL yok (zaten doğru). Bu dosyayı normal SEO'nun yerine koymuyoruz — sadece
tamamlayıcı bir AI-crawler imzası.

## 13. Google Merchant Center

**Önceden hiç yoktu.** `apps/medusa-backend/src/routes/google-merchant-feed.js` (yeni) — Idealo feed'inin
(`idealo-feed.js`) aynı cache/preview mimarisini kullanıyor ama Google'ın kendi standart RSS 2.0 +
`xmlns:g` şemasını üretiyor. `GET /google-merchant-feed.xml` (altı saatte bir yenilenen cache, `?preview=1` ile
ilk 5 ürünü anlık görme).

Gerçekten var olan alanlar: `id`, `title`, `description`, `link`, `image_link`, `price`, `availability`
(`in_stock`/`out_of_stock`, gerçek stok verisinden), `brand` (varsa), `gtin` (gerçek EAN varsa, GS1 uzunluk
kontrolüyle). **Bilerek eklenmeyenler:** `mpn` (veri yok), `google_product_category` (Andertal↔Google taksonomi
eşleştirme tablosu yok — Idealo'nun `admin_hub_idealo_category_map`'ine benzer bir tablo gerekir, henüz
oluşturulmadı), `shipping` (ürün bazlı ağırlık/boyut verisi yok — Merchant Center hesap ayarlarından
yapılandırılmalı), `condition` sabit `new` (ikinci el akışı olmadığı için platform geneli gerçek bir iş kuralı).

**Gerekli environment variable:** YOK — mevcut `STOREFRONT_PUBLIC_URL`/`NEXT_PUBLIC_SHOP_URL`/`SHOP_PUBLIC_URL`
(zaten Idealo feed'i için tanımlı olmalı) yeniden kullanılıyor.

**Manuel yapılması gereken:** Google Merchant Center hesabı açılıp bu feed URL'si tanımlanmalı; feed URL'si
`https://api.andertal.com/google-merchant-feed.xml` (gerçek backend domain'ine göre).

## 14. International SEO

Mevcut yapı zaten sağlam: `SHOP_LOCALES = [en, de, tr, fr, it, es]`, her locale için `hreflangForLocale()` ve
`languageAlternates()` — ürün/kategori/koleksiyon/CMS/anasayfa dahil her `generateMetadata` çağrısında
otomatik hreflang. Sitemap de aynı `fetchEnabledShopLocales()`'ı kullanıyor — dinamik olarak kapatılan bir
locale hem canlı sayfalardan hem sitemap'ten aynı anda düşüyor (tutarlı). Yeni dil eklemek
`SHOP_LOCALES`/`defaultMarketForLocale()`/`defaultLocaleForMarket()`'a (`apps/shop/src/lib/shop-market.js`) birer
satır eklemek kadar basit — mimari zaten bunun için tasarlanmış, değiştirmedik.

## 15. Validation

Bu turda kapsamlı bir otomatik SEO-validation test paketi KURULMADI (ör. "sitemap'te noindex URL var mı",
"broken redirect var mı" gibi canlı-site taramaları) — bu, ayrı bir araç/cron gerektiren, görev kapsamının geri
kalanından daha büyük bir iş. Yapılan: yeni eklenen fonksiyonlar (`isCanonicalMarket`, `buildCategoryJsonLd`,
feed `buildFeedEntry`) için birim testi şeklinde değil ama mevcut `node --test` altyapısı (`apps/medusa-backend`,
148 test) ile syntax/regresyon kontrolü yapıldı. Gerçek bir "SEO lint" (başlık/description eksik mi, JSON-LD
bozuk mu) aracı roadmap'te (§16).

## 16. Roadmap (yapılmadı, bilinçli olarak ertelendi)

Aşağıdakiler bu ikinci turda tamamlandı (bir önceki revizyonda roadmap'teydi):
kategori `has_products` → `noindex` bağlandı; `FAQPage` şeması (`accordion` container'larından) eklendi;
Brand (`/brand/[handle]`) ve Seller (`/seller/[seller_id]`) sayfalarına JSON-LD eklendi; yeni `GET
/store/sellers` endpoint'i ile satıcı sayfaları sitemap'e dahil edildi.

Hâlâ yapılmadı:

1. Sitemap'i gerçek bir `<sitemapindex>` + ayrı product/category/brand/page/seller sitemap dosyalarına bölmek
   (şu an tek dosya, 45k URL'de uyarı veriyor ama bölmüyor).
2. `support_faq` container tipi için FAQPage (iç içe kategori/items yapısı bu turda doğrulanmadı — sadece
   düz `accordion` container'ları şemaya bağlandı).
3. `Article`/`BlogPosting` şeması (blog sayfaları için).
4. Ürün sayfası gerçek 404/410 HTTP status (şu an client component olduğu için her zaman 200 dönüyor,
   sadece `noindex` meta'sı var — routing'i server component'e taşımak daha büyük bir refactor).
5. Google product category mapping tablosu (Merchant Center feed'i tamamlamak için).
6. `/fees`, `/warranty`, `/compliance`, `/how-it-works`, `/jtl`, `/billbee` sayfaları — gerçek iş içeriği
   sağlandığında.
7. Internal linking: ürün→marka/satıcı/benzer ürün, kategori→ilgili kategori (şema seviyesinde değil,
   gerçek tıklanabilir UI linki olarak).
8. Faceted navigation gerçek URL state kazanırsa, §6'daki noindex/canonical kuralını kodla.
9. `/store/sellers` listesinde görünen test/QA satıcı hesaplarının (ör. "QA Nav Test Shop") gerçek satıcılardan
   ayrılması — bir veri/iş kararı, bu turda otomatik filtrelenmedi (bkz. implementation-status §13).
