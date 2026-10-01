# SEO / GEO Uygulama Durumu — Andertal

Mimari açıklaması için bkz. `docs/seo-geo-architecture.md`. Bu dosya sadece durum tablosu: her konu için
**COMPLETE / PARTIAL / MISSING / NOT APPLICABLE**.

Son güncelleme: bu SEO/GEO entegrasyon turunun sonunda (bkz. ilgili commit).

---

## 1. Teknik SEO

| Alan | Durum | Not |
|---|---|---|
| Merkezi metadata sistemi (`generateMetadata`) | **COMPLETE** | `apps/shop/src/lib/seo.js` → `buildPageMetadata()`, 8 dosyada kullanılıyor |
| title / description | **COMPLETE** | Gerçek ürün/kategori/CMS verisinden, fallback zinciri var |
| canonical | **COMPLETE** | Her `buildPageMetadata` çağrısında, kanonik market+locale'e göre |
| robots metadata (noindex) | **COMPLETE** (bu turda tamamlandı) | Önceden kod vardı ama hiç tetiklenmiyordu (ölü kod) — artık market-duplikasyon ve çözülemeyen handle'lar için aktif |
| Open Graph | **COMPLETE** | title/description/image/type/locale |
| Twitter/X metadata | **COMPLETE** | summary / summary_large_image |
| alternates / hreflang | **COMPLETE** | Her locale için otomatik, sitemap ile tutarlı |
| sitemap.xml | **PARTIAL** | Ürün/koleksiyon/sayfa/marka vardı; kategori bu turda eklendi; sitemap index/chunking yok (tek dosya) |
| robots.txt | **COMPLETE** | Zaten sağlamdı; `/cms-preview` eklendi |
| 404 (gerçek route) | **COMPLETE** | `not-found.jsx`, gerçek HTTP 404 |
| 404 (ürün sayfası, client component) | **PARTIAL** | Yayından kalkmış/silinmiş ürün artık `noindex`; HTTP status hâlâ 200 (client component sınırlaması) |
| redirects (kod seviyesi, 3 legacy URL) | **COMPLETE** | `permanentRedirect()` ile 301 |
| redirects (admin/CMS yönetilen) | **MISSING** | Sellercentral'da sadece placeholder UI var, backend/route hiç yok |
| pagination SEO (rel=next/prev, sayfa başına URL) | **MISSING** | Kategori/koleksiyon sayfalama tamamen client-state, URL'de hiç yok |
| image SEO (next/image + alt) | **PARTIAL** | Ürün kartları/PDP iyi; kategori/marka banner'ları `<img>` (next/image değil) |
| Core Web Vitals / font loading | **COMPLETE** | `next/font`, `display:swap`, self-hosted |
| SSR vs client component oranı | **PARTIAL** | İçerik sayfalarının ~%88'i client component (metadata server-side, ana içerik client-side) — bilinçli mimari tercih, bu turda değiştirilmedi |
| llms.txt | **COMPLETE** | Zaten vardı, doğru/dürüst içerik |
| manifest.webmanifest | **COMPLETE** | Zaten vardı |

## 2. Product SEO

| Alan | Durum | Not |
|---|---|---|
| SEO title/description | **COMPLETE** | Gerçek veri + fallback |
| canonical | **COMPLETE** | Buy-box kazananına göre |
| Open Graph | **PARTIAL** | `type` hep `website`, `product` değil; fiyat/availability OG alanları yok |
| Product JSON-LD | **COMPLETE** | name/description/image/sku/gtin/brand/category/offers |
| GTIN | **PARTIAL** | Gerçek veri varsa basılıyor; çoğu üründe veri yok (idealo feed'in kendi atlama mantığı bunu doğruluyor) — uydurulmadı |
| Brand | **PARTIAL** | Varsa basılıyor; dedicated kolon yok, sadece metadata key'leri (tutarsız isimlendirme: `brand_name`/`brand`/`hersteller`) |
| MPN | **MISSING** | Şemada hiç yok, uydurulmadı |
| Warranty | **MISSING** | Şemada hiç yok, uydurulmadı |
| Condition | **NOT APPLICABLE** | Platformda ikinci el/yenilenmiş akışı yok → sabit `NewCondition` gerçek bir iş kuralı |
| AggregateRating | **COMPLETE** (bu turda düzeltildi) | Veri gerçekten vardı ama backend tekil ürün endpoint'i hiç döndürmüyordu — artık `store_product_reviews`'tan gerçek COUNT/AVG geliyor |
| Review (tekil inceleme listesi şeması) | **MISSING** | Sadece aggregate var, bireysel review schema yok |
| BreadcrumbList | **COMPLETE** | Ürün JSON-LD içinde |
| index/noindex/redirect/404 kuralları | **PARTIAL** | Silinmiş/yayından kalkmış/onaysız-satıcı → `noindex` (bu turda eklendi) + backend 404; gerçek sayfa HTTP status'u 200 kalıyor |
| out-of-stock | **COMPLETE** | `offers.availability: OutOfStock`, sayfa indexli kalır (doğru davranış) |
| multi-seller / variant | **COMPLETE** | EAN bazlı buy-box, zaten iyi tasarlanmış |

## 3. Category SEO

| Alan | Durum | Not |
|---|---|---|
| title/description | **COMPLETE** | Gerçek veri + fallback, ama SEO alanları 24k kategoride büyük ihtimalle çoğunlukla boş (manuel doldurma, toplu üretim yok) |
| canonical | **COMPLETE** | |
| H1 | **COMPLETE** | `CategoryTemplate.jsx` gerçek kategori adını H1 yapıyor |
| child categories / breadcrumbs (UI) | **COMPLETE** | Gerçek hiyerarşiden |
| CollectionPage + BreadcrumbList JSON-LD | **COMPLETE** (bu turda eklendi) | Önceden sıfırdı |
| ItemList JSON-LD | **MISSING** | Bilinçli olarak ertelendi (ekstra fetch gerektirir) |
| FAQ (kategori bazlı) | **NOT APPLICABLE** | Böyle bir içerik modeli yok |
| İndexlenebilirlik (thin/empty kategori kontrolü) | **COMPLETE** (bu turda bağlandı) | `has_products` artık `/store/categories?slug=` tekil yanıtına da ekleniyor (`store-public.js`) ve `generateMetadata` bunu `noIndex` olarak kullanıyor |
| 24k kategoriye toplu AI metni | **NOT DONE (bilinçli)** | Görev tanımı da bunu açıkça yasaklıyor |

## 4. Faceted Navigation

| Alan | Durum | Not |
|---|---|---|
| Filtre URL'leri (brand/price/color/size) | **NOT APPLICABLE** | Mevcut sistemde filtreler URL'de hiç temsil edilmiyor (salt React state) — "milyonlarca URL" riski bugün fiilen yok |
| sort/sale/neu/bestseller query param kontrolü | **COMPLETE** (zaten doğru) | Sabit, küçük değer kümesi; canonical bunlardan etkilenmiyor (kazara doğru) |
| Gelecekteki facet-landing mimarisi | **DOCUMENTED, NOT IMPLEMENTED** | Kural mimaride (§6) tanımlandı, kod yazılmadı (bugün ihtiyaç yok) |

## 5. Structured Data

| Şema | Durum |
|---|---|
| Organization | **COMPLETE** (zaten vardı, minimal) |
| WebSite + SearchAction | **COMPLETE** (zaten vardı) |
| Product + Offer + Brand + AggregateRating | **COMPLETE** (AggregateRating bu turda düzeltildi) |
| BreadcrumbList (ürün) | **COMPLETE** |
| CollectionPage + BreadcrumbList (kategori) | **COMPLETE** (bu turda eklendi) |
| ItemList | **MISSING** |
| FAQPage | **PARTIAL** (bu turda eklendi — `accordion` container'larından `/pages/[slug]`'ta üretiliyor; `support_faq`'ın iç içe kategori yapısı doğrulanmadığı için kapsam dışı) |
| Article/BlogPosting | **MISSING** (veri var, şema yok) |
| Review (bireysel) | **MISSING** |
| LocalBusiness | **NOT APPLICABLE** | Andertal fiziksel mağaza değil, online pazaryeri |

## 6. Internal Linking

| Yön | Durum |
|---|---|
| Ürün → kategori → üst kategori (breadcrumb) | **COMPLETE** |
| Ürün → marka | **MISSING** | JSON-LD'de marka adı var ama tıklanabilir link yok |
| Ürün → satıcı | **PARTIAL** | Multi-offer bilgisi var, doğrudan satıcı sayfası linki UI'da sınırlı |
| Ürün → benzer ürün | **MISSING** | |
| Kategori → üst/alt/kardeş | **COMPLETE** | |
| Kategori → marka | **MISSING** | Filtre panelindeki marka seçimi gerçek linke gitmiyor |
| Content → category/product/seller/compliance | **PARTIAL** | CMS container sistemi (landing pages) bunu teknik olarak destekliyor, sistematik olarak her content sayfasında kurulmamış |

## 7. Sitemap

| Alan | Durum |
|---|---|
| Ürünler | **COMPLETE** (zaten vardı) |
| Koleksiyonlar | **COMPLETE** (zaten vardı) |
| CMS sayfaları | **COMPLETE** (zaten vardı, cap yokmuş meğer — backend'de limit yok) |
| Markalar | **COMPLETE** (zaten vardı; gerçek `updated_at` bu turda eklendi) |
| Kategoriler | **COMPLETE** (bu turda eklendi, `has_products` filtresiyle) |
| Seller sayfaları | **COMPLETE** (bu turda eklendi) | Yeni `GET /store/sellers` endpoint'i (onaylı + gerçek `store_name` olan satıcılar) sitemap'e bağlandı |
| Sitemap index / chunking | **MISSING** | Tek dosya; 45k URL'de uyarı var ama otomatik bölme yok |
| Fake lastModified | **DÜZELTİLDİ** | Artık gerçek tarih yoksa `<lastmod>` hiç basılmıyor |

## 8. Robots.txt

| Alan | Durum |
|---|---|
| Hesap/checkout/sepet/login/mesaj engelleme | **COMPLETE** (zaten vardı) |
| API engelleme | **COMPLETE** (zaten vardı) |
| cms-preview engelleme | **COMPLETE** (bu turda eklendi) |
| Sitemap referansı | **COMPLETE** (zaten vardı) |
| AI crawler ayrımı (GPTBot engelli, OAI-SearchBot açık) | **COMPLETE** (zaten vardı) |

## 9. GEO / AEO

| Sayfa | Durum |
|---|---|
| /about | **COMPLETE** (farklı slug: `about-us`) |
| /for-sellers, /selling-on-andertal | **COMPLETE** (farklı slug: `verkaeufer-werden`) |
| /shipping | **COMPLETE** (farklı slug: `versand-lieferung`) |
| /returns | **COMPLETE** (farklı slug: `retoure`, `right-of-withdrawal`) |
| /faq | **PARTIAL** | `customer-support` sayfasında FAQ içerik tipi (`support_faq`) var, ayrı bir `/faq` sayfası yok |
| /how-it-works | **MISSING** | Oluşturulmadı — gerçek editoryal karar + metin gerekiyor |
| /fees | **MISSING** | Gerçek komisyon/ücret verisi sağlanmadığı için oluşturulmadı |
| /warranty | **MISSING** | Gerçek garanti politikası metni sağlanmadığı için oluşturulmadı |
| /compliance | **MISSING** | Backend'de `compliance_review` mantığı var, public açıklama sayfası yok |
| /jtl, /billbee | **MISSING** | Entegrasyonlar gerçek (`src/routes/integrations.js`) ama public tanıtım sayfası yok |

## 10. llms.txt

**COMPLETE** (zaten vardı) — statik, dürüst, private URL içermiyor. Bu turda değiştirilmedi (zaten iyiydi,
gereksiz dokunulmadı).

## 11. Programmatic SEO (24k kategori)

**PARTIAL / BİLİNÇLİ SINIRLI** — thin-content üretimi yapılmadı (görev tanımı da yasaklıyor). Gerçek veriden
beslenen CollectionPage şeması ve sitemap filtresi eklendi; toplu AI içerik üretimi kasıtlı olarak yapılmadı.

## 12. Brand SEO

| Alan | Durum |
|---|---|
| `/brand/[handle]` metadata | **COMPLETE** (zaten vardı) |
| Canonical | **COMPLETE** (zaten vardı) |
| JSON-LD | **COMPLETE** (bu turda eklendi) | `CollectionPage` + `BreadcrumbList` (`buildBrandJsonLd`, `apps/shop/src/lib/seo.js`) |
| Sitemap'te gerçek tarih | **COMPLETE** (bu turda düzeltildi) |
| Hatalı/anlamsız marka kaydı indexleme engeli | **PARTIAL** | `/store/brands` zaten sadece `status = active` markaları döndürüyor; ekstra bir "kalite" filtresi yok |

## 13. Seller SEO

| Alan | Durum |
|---|---|
| `/seller/[seller_id]` metadata | **COMPLETE** (zaten vardı) |
| Canonical | **COMPLETE** (zaten vardı) |
| Structured data | **COMPLETE** (bu turda eklendi) | `WebPage` + `BreadcrumbList` (+ gerçek veri varsa `AggregateRating`) (`buildSellerJsonLd`, `apps/shop/src/lib/seo.js`) |
| Sitemap'e dahil | **COMPLETE** (bu turda eklendi) | Yeni `GET /store/sellers` endpoint'i üzerinden |
| Sellercentral (private) sayfalarının indexlenmemesi | **NOT APPLICABLE / DOĞRULANMADI** | Sellercentral ayrı bir app (`apps/sellercentral`) — bu denetim kapsamı `apps/shop` idi; Sellercentral'ın kendi robots/auth koruması bu turda incelenmedi |

**Not (veri hijyeni, kod değil):** `/store/sellers`'ı canlı DB'ye karşı test ederken onaylı satıcılar arasında
görünürde test/QA amaçlı hesaplar da var ("QA Nav Test Shop", "CursorAgentTest") — bunlar artık sitemap'e de
giriyor. Bunları filtrelemek bir iş kararı (hangi hesaplar gerçek satıcı, hangileri test) olduğu için burada
otomatik filtrelemedim; gerekiyorsa `approval_status`'a ek bir "test hesabı" bayrağı eklenmesi önerilir.

## 14. Google Merchant Center

**MISSING → COMPLETE (temel feed)** — Önceden hiçbir feed/entegrasyon yoktu. Bu turda
`apps/medusa-backend/src/routes/google-merchant-feed.js` oluşturuldu ve `server.js`'e bağlandı
(`GET /google-merchant-feed.xml`). Temel alanlar (id/title/description/link/image/price/availability/brand/gtin/
condition) gerçek veriden geliyor. `google_product_category`, `mpn`, `shipping` bilinçli olarak eksik bırakıldı
(veri/eşleştirme tablosu yok, uydurulmadı).

## 15. International SEO

**COMPLETE** (zaten sağlamdı) — hreflang, canonical, locale-aware metadata, sitemap hepsi tutarlı. Bu turda
sadece market-duplikasyon noindex'i eklendi (§1), mevcut locale mimarisine dokunulmadı.

## 16. Performance

**AUDIT ONLY** — bu turda kod değişikliği yapılmadı. Bulgular `seo-geo-architecture.md` §1'de: font loading iyi,
ama içerik sayfalarının ~%88'i client component (SEO açısından kritik içerik metadata'da server-side, ana body
client-side hydration'a bağımlı).

## 17. SEO Validation

**MISSING (bu turda kurulmadı)** — otomatik "missing title/duplicate description/broken redirect" tarzı bir
validation suite yok. Mevcut `node --test` altyapısı (148 test, `apps/medusa-backend`) regresyon için kullanıldı
ama SEO-özel bir kontrol seti eklenmedi.

## 18. SEO Diagnostic (admin araç)

**MISSING** — protected bir "bu URL için title/canonical/schema/indexability göster" admin aracı bu turda
yapılmadı.

## 19. Content Architecture

**NOT DONE (bilinçli)** — görev tanımı da "yüzlerce AI makale üretme" diyor. `/blog`, `/guides` gibi klasörler
oluşturulmadı; mevcut CMS `page_type='blog'` altyapısı zaten var ve yeterli, yeni bir içerik modeli icat
edilmedi.

## 20. Okara Uyumluluğu

**COMPLETE (temel gereksinimler)** — metadata, canonical, structured data, sitemap, robots, llms.txt zaten
standart/temiz. Okara'ya özel bir entegrasyon yapılmadı (görev tanımı da yapma diyor).

## 21. SEO Config

**PARTIAL** — `SITE_URL`, market/locale sabitleri zaten `apps/shop/src/lib/seo.js` ve `shop-market.js`'te
merkezi ve env-var tabanlı (`NEXT_PUBLIC_SITE_URL`). Organization/sosyal medya bilgisi gibi alanlar
(`buildOrganizationJsonLd`) hâlâ dosya içinde sabit — ayrı bir config dosyasına taşınmadı (gereksiz refactor
riski, mevcut yapı zaten çalışıyor).

---

## Environment Variables (yeni/mevcut, bu tur için)

| Değişken | Durum | Not |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Zaten mevcut olmalı | `apps/shop/src/lib/seo.js` SITE_URL kaynağı |
| `STOREFRONT_PUBLIC_URL` / `NEXT_PUBLIC_SHOP_URL` / `SHOP_PUBLIC_URL` | Zaten mevcut olmalı (idealo feed de kullanıyor) | Google Merchant feed linkleri için yeniden kullanıldı, **yeni env var eklenmedi** |

## Manuel yapılması gerekenler (kod değil, iş/içerik kararı)

1. Google Merchant Center hesabı açıp `https://<backend-domain>/google-merchant-feed.xml`'i feed olarak tanımlamak.
2. `/fees`, `/warranty`, `/compliance`, `/how-it-works`, `/jtl`, `/billbee` sayfaları için gerçek metni sağlamak
   (CMS altyapısı hazır, Sellercentral → Content → Pages üzerinden eklenebilir).
3. 24.000 kategorinin `seo_title`/`seo_description`/`long_content` alanlarını önceliklendirip (ör. en çok
   trafik alan üst kategoriler) manuel/yarı-otomatik doldurmak — toplu AI üretimi bilerek yapılmadı.
