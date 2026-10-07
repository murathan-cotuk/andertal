# İlerleme günlüğü

Her çalışma adımı burada kayıtlıdır: ne yapıldı, hangi dosyalar, nasıl test edildi, sırada ne var.
Başka cihazda devam ederken önce bu dosyayı ve `docs/TASKS.md`'yi oku. En yeni kayıt en üstte.

Test komutları (apps/medusa-backend):
- `npm test` — birim testler
- `SETTLEMENT_TEST_PG_URL=postgres://… npm run test:settlement` — gerçek PostgreSQL ile settlement + EAN/SKU entegrasyon testleri
- Shop: `node --test src/lib/grundpreis.test.mjs`

---

## 2026-10-07 — B: satıcı başına gönderi (bitti, karar 1)

- Settlement şeması: `order_shipments` (sipariş × satıcı: kargo, takip no, durum offen→versendet→zugestellt, satıcı bildirimi, teslim onayı + kaynak; takip no indeksi).
- `src/settlement/shipments.js`: `recordShipment` (yalnız ileri yönde durum; satıcının "zugestellt"i ödeme saatini BAŞLATMAZ), `confirmShipmentDelivery` (yalnız carrier_webhook / carrier_api / superuser; o satıcının ödeme saatini başlatır; tüm satıcılar teslim edilince sipariş seviyesi `delivery_confirmed_at` + `zugestellt`), `confirmDeliveryForTracking` (çok satıcılı siparişte yalnız o takip numarasının satıcısı, aksi halde eski sipariş seviyesi onayı), `findShipmentByTracking`, `listShipments`, `orderSellerIds`.
- Ödeme saati: `refreshEligibilityForOrder` her payable için önce satıcının kendi gönderi onayını, yoksa sipariş seviyesini kullanır → tek satıcılı ve eski siparişler aynen.
- Bağlanan yerler: Sendcloud webhook (takip no siparişte yoksa gönderilerde arar; çok satıcılıda yalnız ilgili satıcı), kargo API takip yenileme, etiket satın alma (gönderi kaydı), sipariş PATCH (satıcı = kendi gönderisi; superuser tek satıcılı siparişte o satıcı).
- Görünüm: SC sipariş detayında "Sendungen" kartı (satıcı yalnız kendisini, superuser hepsini görür; teslim onay tarihi). Shop sipariş detayında birden fazla paket varsa "Versand durch [Händler]" satırları (6 dil). API: admin sipariş GET ve `/store/orders/me` `shipments` döner.
- Test: `settlement.test.js` +2 (iki satıcılı sipariş: A teslim → yalnız A eligible, B bekler; B teslim → sipariş zugestellt; idempotent; güvenilmeyen kaynak reddedilir / tek satıcılı eski kural). `test:settlement` 92/92, `npm test` 195/195, SC + shop build EXIT 0.
- Bilinen sınır: SC'deki "Tracking aktualisieren" düğmesi sipariş seviyesindeki (son girilen) takip numarasını yeniler; çok satıcılı siparişte diğer satıcının paketi Sendcloud webhook'u ile onaylanır.

## 2026-10-07 — Kullanıcı kararları (sıradaki işler)

1. Çok satıcılı siparişte **satıcı başına gönderi** (takip no + teslim onayı → o satıcının ödeme saati): **EVET, şimdi** (sıradaki iş).
2. Ürün düzenleme (s34) **dil hapları + çeviri noktaları + pazar bazlı fiyat tablosu**: **EVET**.
3. PDP/sepet **"Lieferung bis [Datum]"** için kargo grubuna hazırlık + transit gün alanı: **EVET**.
4. Faz 3 family_link: **sonraya**.

## 2026-10-07 — B: müşteri iptal/iade hataları (bitti)

- **Hata (canlı)**: shop'un `getMedusaClient().request` hata durumunda istisna atmaz, `{ __error }` döner. Sipariş detayındaki **iade formu ve iade takip formu bunu kontrol etmiyordu** → reddedilen iade (ör. süre dolmuş) müşteriye "Rücksendung angefragt" (başarılı) gösteriyordu. Artık `__error` kontrol edilip hata gösteriliyor.
- Backend iptal/iade hatalarına sabit `code` eklendi (`not_cancellable`, `already_shipped`, `cancel_window_expired`, `contact_support`, `no_items`, `invalid_item`; mevcut `already_returned`, `quantity_exceeds`, `return_period_expired`). Shop istemcisi `code` + `details` taşır; `src/lib/order-error-text.js` kodu `orderErrors` mesajlarıyla 6 dile çevirir (bilinmeyen kodda backend metni). Sipariş detay ve liste sayfalarında iptal + iade.
- Build: shop EXIT 0; backend `npm test` geçti.

## 2026-10-07 — Yeni iş listesi alındı (sıra TASKS.md'de)

1. Cursor handoff (`docs/HANDOFF-cursor-plan-sc-variation-compliance.md`) Faz 0 → 0b → 0c → 0e → 0d → 0f → 1 → 2 → 3. Her faz bitince burada kayıt.
2. `Andertal Shop-SC Konsept.pdf`: shop sayfaları yapıldı mı denetimi + sondaki Sellercentral tasarımlarının uygulanması.
Durum: handoff Faz 0 ile başlanıyor.

## 2026-10-07 — Handoff Faz 0 ve 0b (bitti)

- **Faz 0** — shop Eigenschaften (`apps/shop/src/lib/metafield-definitions.js` → `mergeMetafieldRows`, testi `metafield-definitions.test.mjs`): aynı anahtar tek satır, değerler ", " ile; varyantta olan anahtar ana ürünün değerinin yerine geçer (asıl ürün = varyasyon); `packaging_unit` / `packaging_unit_plural` gizli (hem metafield hem `META_HIDDEN_KEYS`). `ProductTemplate.jsx` ve `ProductTemplateMobile.jsx` (2 tablo) tek döngü kullanır.
- **Faz 0b** — `admin-products.js` PUT: "EAN cannot be changed" kontrolü yalnız ürünün sahibi / superuser için çalışır; ikinci satıcının teklifindeki (çoğunlukla alt) EAN artık 400 vermez. Sahipte karşılaştırma `normalizeStoreEan` ile (boşluk/tire farkı hata sayılmaz). Teklif EAN'ı `SELLER_LISTING_META_FIELDS` içinde → master'a yazılmaz, değişiklik talebi de açılmaz (kontrol edildi).
Sıradaki: Faz 0c (SC Rechtlich blokları + zorunlu alan UX + manuel Required/Optional).

## 2026-10-07 — Handoff Faz 0c ve 0e (bitti)

- **0c ayrı bloklar**: ProductEditPage "Produktdokumente & Compliance" kartında WEEE kendi başlığıyla (ElektroG) tek başına; EPREL alanlarının hepsi kategori bölümündeki "EPREL" grubunda (ComplianceFieldsSection, `eprel_number` artık `ALREADY_RENDERED_KEYS`'te değil); Produktdateien ayrı başlık. Kategorisi artık EPREL istemeyen üründe kayıtlı EPREL numarası kaybolmasın diye statik yedek alan kaldı.
- **0c zorunlu alan UX**: zorunlu alan kırmızı `*` (Polaris `requiredIndicator`) + boşken kırmızı çerçeve ve "Pflichtfeld" (6 dil); WEEE alanı da. Kayıt engellenmez. Opsiyoneller zaten zorunlulardan sonra sıralanıyordu.
- **0c manuel Required/Optional**: `categories.js` `sanitizeCustomField` → `required` bayrağı (yoksa zorunlu = eski davranış). Şema birleştirmede Optional alanlar (profil alanı override'ı dahil) zorunlu ve yayın-engelleyici listelerden çıkıp opsiyonele geçer. SC ComplianceProfilesPage: ekleme formunda "Verbindlichkeit" seçimi, listede Pflicht/Optional rozeti + "Optional machen / Pflicht machen" düğmesi.
- **0e EPREL alanları** (`compliance-profiles.json`, `energy_labeled_eprel`): yeni `energy_class_scale` (A-G, A+++-D, A++-E, A+-F) ve `energy_class_grade` (A+++…G); `energy_label_qr` = "Produktdatenblatt / EPREL-Link"; tüm EPREL alanlarına 6 dilde ayrıntılı açıklama. Zorunlu: `eprel_number`, `energy_class_grade`, `energy_label_image`; opsiyonel: skala, veri sayfası linki. WEEE altında URL alanı yok.
- Not: VariantEditPage'de statik WEEE alanı yok (EPREL artık kategori bölümünden geliyor) — Faz 2 (varyant = ürün formu) kapsamında eklenecek.
Test: backend `npm test` 187/187; SC dosyaları esbuild ile derleniyor.
Sıradaki: Faz 0d (shop PDP: EPREL rozeti + modal, WEEE buybox'ta, yasal grup sekmeleri, `custom_` etiketi).

## 2026-10-07 — Handoff Faz 0d ve 0f (bitti) + JTL talebi kuyruğa alındı

- Yeni bileşen `apps/shop/src/components/product/PdpCompliance.jsx`:
  - `EnergyClassBadge` — `energy_class_grade` doluysa varyasyon seçicinin **üstünde** AB renkli sınıf oku + skala (A↑G) + "Produktdatenblatt" bağlantısı; tıklayınca modal: "Energieklasse" sekmesi (etiket görseli `energy_label_image`) ve "Produktdatenblatt" sekmesi (`energy_label_qr`, yoksa EPREL numarasından `eprel.ec.europa.eu/qr/<no>`). Esc/arka plan tıklaması kapatır. Varyant değeri ana ürünün değerinin önüne geçer.
  - `LegalGroupTabs` — yasal alanlar gruplar halinde sekmeler: Hersteller & Verantwortliche (GPSR), Energieverbrauchskennzeichnung, Elektro-Sicherheit, Batterien, Warnhinweise, Inhaltsstoffe, Regulierte Angaben, Weitere Angaben (`custom_*`). Eski tek "Produktsicherheit" yığını kaldırıldı (`id="produktsicherheit"` korundu).
  - `SafetyResources` (Faz 0f) — açıklamanın hemen altında "Sicherheit und Produktressourcen": solda yasal garanti (AB ≥ 2 yıl, Direktif 2019/771, 6 dilde sabit metin) + "Mehr erfahren" → `warranty_info_url`; sağda "Sicherheitsbilder und Kontakte" (GPSR sekmesini açar ve kaydırır) + `safety_information_text` / `safety_information_pdf`.
- `ProductTemplate.jsx` + `ProductTemplateMobile.jsx`: rozet her iki varyant seçici yerleşiminde; EPREL numarası buybox'tan çıktı (rozet/modal/EPREL sekmesinde), `weee_number` buybox'ta kaldı; `custom_*`, `energy_class_*`, `safety_information_*` Eigenschaften tablosuna girmez. Mobil şablon artık `useProductPageSettings` kullanır (garanti linki için).
- `prop-labels.js`: `custom_test` → "Test".
- Faz 0f SC: `compliance-profiles.json` temel GPSR profiline (tüm kategoriler miras alır) opsiyonel `safety_information_text` + `safety_information_pdf` (6 dil açıklama) → ürün Rechtlich bölümünde görünür. Süper kullanıcı ayarı: Content → Produktseite paneli (`ProductPageSettingsPanel.jsx`) "Gesetzliche Gewährleistung — Link" → `__product_page__` ayarlarında `warranty_info_url`; boşsa `/<market>/pages/gewaehrleistung`. **Not:** bu CMS sayfası gerçek metinle oluşturulmalı (metin uydurulmadı).
- JTL talebi (`docs/jtl.md` Faz A–D, CONNECTOR.md'ye bağlı, %1 satıcı ledger'ına YAZILMAZ) TASKS.md'de handoff'tan sonraki sıraya alındı.
Sıradaki: Handoff Faz 1 (Farbe ≠ Design).

## 2026-10-07 — Handoff Faz 1: Farbe ≠ Design (bitti, kısmi teşhis)

- Kodda Farbe'yi Design'a çeviren tek bir satır bulunamadı; canlı tanımlarda etiket/anahtar çakışması da yok (salt-okuma kontrol). Kök sebep adayı kapatıldı: takma ad haritalarında (`buildCatalogMaps` backend, `buildMetafieldLookup` Excel import) başka bir tanımın etiketi/çevirisi bir anahtarın takma adını **ezebiliyordu**; artık birebir anahtar her zaman kazanır. Test: `src/catalog-metafield-pending.test.js`.
- SC varyasyon grubu seçiminde seçenekler "Etiket (anahtar)" gösterir — benzer adlı Eigenschaften karışmaz; `metafield_key` seçilen anahtar olarak kalır, grup adı o anahtarın etiketi (`getGroupDisplayName` zaten öyleydi).
- **Kullanıcıdan istenecek**: hata tekrar görülürse ürün linki/ID — gerçek veriyle yeniden üretilip kesin sebep bulunacak.
Sıradaki: Faz 2 (varyant formu = ürün formu).

## 2026-10-07 — Handoff Faz 2: varyant = ürün (bitti) — PARA DÜZELTMESİ içerir

- **Bulunan hata (canlı)**: varyant sayfası ve varyasyon matrisi varyant fiyatını `price_cents` / `sale_price_cents`'e yazıyor; checkout ise bunu alıp **ana ürünün `metadata.prices[ülke]` fiyatıyla eziyordu**, varyantın indirim fiyatını hiç uygulamıyordu. Canlı örnek: "Vampire Vape 30ml" varyantı 28,00 € girilmiş, 28,90 € (ana ürün) tahsil ediliyor. Ayrıca başka satıcının teklif fiyatı da ana ürünün ülke fiyatıyla eziliyordu.
- **Düzeltme**: tek kaynak `apps/medusa-backend/src/line-unit-price.js` (`resolveCatalogUnitPriceCents`, testli): varyant ülke fiyatı → varyantın kendi fiyatı (daha düşükse indirim) → ana ürün ülke fiyatı → DE/EUR yedekleri → ana ürün fiyatı. Checkout (`storeCartLineItemsPOST`) bunu kullanır; başka satıcının teklif fiyatı artık ezilmez. Store API varyanta `own_price_cents` + `sale_price_cents` ekler; shop PDP fiyat zinciri ve `resolveProductSaleCents` aynı sırayı izler (gösterilen = tahsil edilen).
- **Deploy sonrası etki**: o varyant 28,00 € satılır (satıcının girdiği fiyat). Kategori kartlarındaki fiyat gösterimi E alanında aynı kurala bağlanacak.
- Rechtlich paritesi: VariantEditPage'e WEEE alanı eklendi (kategori isterse zorunlu, kırmızı çerçeve); EPREL alanları kategori bölümünden geliyor; shop buybox WEEE'yi varyantın kendi değerinden gösterir.
- Not: ürün sayfası da yalnız DE fiyatı düzenliyor (ülke seçici kodda kapalı) — varyantta da DE fiyat alanları yeterli; ülke bazlı fiyat girişi ayrı bir iş olarak not edildi.
Test: backend `npm test` 191/191 (+3 fiyat çözümleyici testi).
Sıradaki: Faz 3 (family_link).

## 2026-10-07 — Handoff Faz 3: family_link (DURDURULDU — ön koşul gerekli)

- Dry-run (yazma yok) `scripts/backfill-variants-to-products.js`: 8 ana ürün → 145 alt ürün satırı (Vampire Vape 9, Ecommezzo 12, Tütün tabakası 36+36, arts/appliances/automotive 16'şar, Ecom Lastest 4). `--apply` ÇALIŞTIRILMADI.
- Neden durdu: `legacyFold: false` (family_link) bugün açılırsa birleştirilen ürünler shop'ta **varyant seçicisini kaybeder** — store API aile üyelerini tek PDP'de varyant olarak birleştirmiyor (yalnız `family_id` döner) ve sepet/checkout varyantı "aynı ürün satırı + varyant id" olarak çözüyor; aile modelinde her varyant ayrı ürün satırı. "Sistemi bozma" kuralı.
- Faz 3 için gereken sıra (onay sonrası): (1) store API: `family_id` olan ürün istenince aile üyelerini `variation_groups` + üye başına varyant (kendi id, fiyat, stok, görsel, EAN) olarak döndür; (2) shop PDP varyant seçimi üyenin ürün id'sine gider, sepete o ürün eklenir (checkout fiyatı zaten ürün bazlı — `src/line-unit-price.js`); (3) SC: aile üyeleri ProductEditPage'de açılır; (4) ancak bunlar canlıda doğrulandıktan sonra `combineProductsAsVariants` varsayılanı `legacyFold: false` ve backfill `--apply` (kullanıcı onayıyla).
Sıradaki: JTL Faz A (`docs/jtl.md`).

## 2026-10-07 — JTL Faz A + B (bitti)

Sözleşme okundu (`docs/JTL/JTL Contract.pdf`, Marktplatzpartnervertrag §3–4): %1, partnerlik sayesinde ilk kez müşteri olan veya son 12 ayda işlem yapmamışken dönen JTL satıcısının platformdaki **toplam** brüt cirosu (sepet + kargo, fiili son tutar) üzerinden; + USt (JTL faturası); çeyreklik rapor, takip eden ayın 5'ine kadar `technologiepartner@jtl-software.de`, aylara bölünmüş + doğruluk beyanı; ödeme faturadan 2 hafta sonra; fesihte (§4.5) yükümlülük biter.
- Modül `apps/medusa-backend/src/jtl-partner/index.js` (şema sunucu açılışında, settlement'tan sonra). **Satıcı ledger'ına / payable'lara / payout'lara hiçbir şey yazmaz** — ayrı, append-only platform borç defteri.
- Tablolar: `jtl_partner_attributions` (satıcı, SCX dış id, kaynak `jtl_scx_signup|manual_superuser`, uygunluk + sebep, son satış, bitiş), `jtl_partner_accruals` (idempotency_key benzersiz; `sale` = ödenmiş payable brüt+kargo, `refund` = başarılı iade satırı negatif; ay/çeyrek Europe/Berlin), `jtl_report_sends` (Faz D gönderim günlüğü).
- Faz A: `attributeJtlSeller` (açıkken idempotent; §3.1: ilk kez → uygun, son satış > 12 ay → uygun, son 12 ayda satış → kayıt edilir ama uygun değil), `endJtlAttribution` (bağlantı kesilince). SCX signup henüz yok (CONNECTOR.md Faz E) → signup tamamlanınca `attributeJtlSeller({ source: 'jtl_scx_signup' })` çağrılacak; şimdilik süper kullanıcı manuel işaretler.
- Faz B: `syncJtlAccruals` settlement tablolarından idempotent besler (settlement koduna dokunmadan); rapor üretmeden önce otomatik çalışır. Karar (dokümante): baz = satıcı payable brüt (mal + kargo, KDV dahil); iadeler orantılı düşer; chargeback'ler şimdilik düşülmez (sözleşmede yok — Steuerberater/JTL ile netleştirilecek).
- Test `src/jtl-partner/jtl-partner.test.js` (gerçek PG): 100 € → 1 €, 30 € iade → −0,30 €, JTL olmayan satıcı rapor dışı, 12 ay kuralı, idempotentlik, satıcı bakiyesi JTL'den etkilenmez. 5/5.
Sıradaki: JTL Faz C (API + SC Billing → JTL sekmesi).

## 2026-10-07 — JTL Faz C + D (bitti) — JTL A–D tamam

- **API** (`src/routes/jtl-partner.js`, yalnız superuser): `GET /admin-hub/v1/billing/jtl?period=2026-Q1` (özet, aylar, satıcı×ay satırları, ilişkilendirilmiş satıcılar, son gönderim, alıcı), `GET …/jtl/export.csv`, `POST …/jtl/attribute` (manuel), `POST …/jtl/end`, `POST …/jtl/send-report` (`confirm_accuracy: true` zorunlu, `dry_run: true` = yalnız çağırana), `GET …/jtl/sends`.
- **SC** Settings → Billing → **JTL** sekmesi (yalnız superuser, Finanzamt'ın yanında): çeyrek seçici, KPI (brüt ciro, %1, USt tahmini, satıcı sayısı, rapor son tarihi, son gönderim durumu), satıcı×ay yoğun tablo, CSV + XLSX (`/api/billing/jtl-export`), doğruluk beyanı onay kutusu + "Test an mich senden" / "An JTL senden" (onay penceresi), JTL satıcıları listesi (kaynak, başlangıç, uygunluk sebebi, son satış, "Beenden") + manuel ilişkilendirme formu. 6 dil.
- **E-posta (Faz D)**: Almanca rapor e-postası (aylık tablo, toplam, USt notu, §3.3 ii beyanı + onaylayan + zaman) + CSV eki; `jtl_report_sends` günlüğü; gerçek gönderimde çeyreğin accrual'larına `reporting_batch_id`. Otomatik: `server.js` 6 saatte bir `autoSendDueJtlReport` → yalnız `JTL_REPORT_AUTO_SEND=true` ise, Ocak/Nisan/Temmuz/Ekim'in 4–5'inde, önceki çeyrek gönderilmemişse; `JTL_REPORT_CC`'ye kopya.
- `src/email.js`: opsiyonel `cc` ve `attachments` (geriye uyumlu).
- `docs/jtl.md` kontrol listesi işaretlendi + "9b. Uygulama durumu" ve env kontrol listesi eklendi.
Test: `npm test` 195/195; gerçek PG `test:settlement` 90/90 (JTL 7 test dahil).
Açık: Faz E (SCX connector, CONNECTOR.md) — sign-up tamamlanınca `attributeJtlSeller({ source: 'jtl_scx_signup' })` çağrısı; prod'da `JTL_REPORT_AUTO_SEND=true` ayarı kullanıcıda.
Sıradaki: Shop-SC Konsept PDF denetimi + Sellercentral tasarımları.

## 2026-10-07 — Shop-SC Konsept PDF: sayfa haritası (denetim başladı)

PDF 43 sayfa (1080 px genişlik). Sayfaları görmek için: scratchpad'de mupdf ile PNG'ye çevrildi (repo dışı). Harita:
- Shop masaüstü: s1 ana sayfa · s2 header şeridi · s3 PDP · s4 mega menü · s6 sepet çekmecesi · s7 arama paneli · s9 kategori · s10/23/24/27 ürün kartları · s17 hesap menüsü · s18/21 arama boş/öneri · s19/29 koleksiyon · s20/30 yasal sayfalar · s22/26 footer · s28 kategori sayfası (tam) · s31 hesap sayfası.
- Shop mobil: s8 ana sayfa · s11 filtre · s12 kategori gezinme · s13 arama · s14/16 PDP · s15 sepet · s25 alt navigasyon.
- Sellercentral: s5 Übersicht · s32 şablon bileşenleri ("Bausteine für alle Seiten") · s33–35 sayfa şablonları · s36 mobil siparişler · s37 mobil ürün düzenleme · s38 · s39 topbar · s40–42 sipariş sayfaları · s43 analiz.
Sıra: önce Sellercentral tasarımlarının uygulanması (kullanıcı açıkça istedi), sonra shop sayfa sayfa "yapıldı / eksik" listesi.

### SC tasarım denetimi (canlı SC ile karşılaştırma, 2026-10-07)
Durum: önceki oturumda yalnız görsel katman ("Warmer Marktplatz" — renk/font/köşe, `globals.css` ~530+) uygulanmış. Canlıda: siyah topbar, beyaz içerik alanı, küçük başlık, sekmesiz liste. Tasarımla farklar ve uygulama sırası:
1. [x] **Kabuk (s32/33/39)** — `globals.css` sonuna "SC Konsept s32/s33/s39 — shell" bloğu (yalnız CSS): açık topbar (bej zemin, alt çizgi), masaüstünde logo alanı koyu (sidebar yukarıdan tek kolon gibi; logo görseli platform ayarından, değiştirilmedi), sayfa zemini bej, arama hapı (#EFE9DF, odakta turuncu halka), ikonlar/dil hapı/hesap çipi koyu, açık menü bölümü turuncu hap + seçili alt öğe açık hap. Canlı sayfada geçici CSS enjeksiyonuyla önizlendi ve doğrulandı. Kalan: büyük sayfa başlığı + breadcrumb (sayfa bazında, adım 2'de). Tasarım gereği: açık topbar (arama hapı + ⌘K, DE hapı, mesaj/zil, hesap çipi "Shopname / Superuser"), bej zemin (#F6F2EC) üstünde beyaz kartlar, sidebar logosu (turuncu "a" + "andertal SELLERCENTRAL"), sayfa başlığı = küçük breadcrumb + büyük başlık (Bricolage) + sağda 44 px hap butonlar.
2. [~] **Liste şablonu (s32/33/40/42)** — ortak bileşenler `apps/sellercentral/src/components/sc/ScPage.jsx`: `ScPageHeader` (breadcrumb + Bricolage başlık + sağda aksiyonlar), `ScTabs` (alt çizgili sekmeler + sayaç), `ScBulkBar` (koyu toplu işlem çubuğu; `globals.css` `.sc-bulk-bar` buton renkleri), `ScKpiTiles`. Uygulandı: **Envanter** (başlık + "Produkte" breadcrumb, durum sekmeleri — durum açılır menüsünün yerini aldı, koyu bulk bar), **Bestellungen** (başlık "Alle Bestellungen", 4 KPI kutusu: Zu versenden (+24 saatten eski uyarısı) / Unbezahlt / Unterwegs / Offene Retouren — son filtresiz yüklemeden sayılır, tıklanınca filtre uygular; sekmeler Alle/Zu versenden/Offen/Versendet/Zugestellt/Storniert mevcut filtreleri ayarlar, açılır menüler kalır; koyu bulk bar), **Retouren** (başlık + "Bestellungen" breadcrumb, KPI kutuları, sayaçlı sekmeler; detay şimdilik kayan panel). Tablolar ve filtre satırları yoğun haliyle korundu. Not: Retouren yamasında ilk denemede yanlış çapa (dosyada iki "Header" yorumu) kod sildi — HEAD'den geri yüklenip doğru çapayla yeniden uygulandı. Tasarım gereği: sekmeler (Alle [N] / Aktiv / Entwurf / In Prüfung / Archiviert), arama + "+ Filtre" çipleri, toplu işlem çubuğu (koyu), tablo başlığı bej, durum hapları 5 ton, sayfalama. Ürünler, Bestellungen (+4 KPI kutusu), Retouren (liste + sağ detay paneli).
3. [~] **Detaylar** — yapıldı: **Bestellung** (bej zemin, `ScPageHeader` breadcrumb "Bestellungen › #N", başlık + ödeme/teslim durum hapları (`ScStatusPill`, 5 ton), Rechnung/Lieferschein aksiyonları; kartlar 20 px köşe + Bricolage başlık; iki kolon zaten tasarımdaki gibiydi), **Ürün düzenleme** başlığı (breadcrumb "Produkte › Bearbeiten", büyük başlık + durum hapı), **Varyant** başlığı (breadcrumb "Produkte › Ürün › Variante"). **Hata düzeltmesi**: ürün sayfasında kilitli "Marke" alanı kategori ağacı (~12k) yüklenene kadar ham marka UUID'si gösteriyordu — kategoriler/koleksiyonlar/markalar artık bağımsız yükleniyor, beklerken "…". Bilinçli olarak YAPILMAYAN (fonksiyon değiştirir, ayrı onay): dil hapları + çeviri noktaları (s34), pazar bazlı fiyat tablosu, sekmesiz tek sayfa düzeni, alt yapışkan kaydet çubuğu (kaydet şu an topbar'da), Retouren sağ detay paneli. Build: SC + shop `next build` EXIT 0. Tasarım gereği: Bestellung (s41: Artikel/Zahlung/Verlauf + sağda Kunde/Adresse/Risiko), Ürün düzenleme (s34: dil hapları + yeşil/turuncu nokta, Allgemein/Medien/Preise (pazar tablosu)/Varianten, sağda Status/Einordnung/Identifikation/Suchmaschinen, alt yapışkan kaydet çubuğu), Varianten (s35: seçenek kartları + tablo + sağ panel).
4. [~] **Übersicht (s5)** ve **Berichte (s43)** — yapıldı: dashboard başlığı (küçük selamlama satırı + büyük "Übersicht", Polaris başlığı boş; aksiyonlar aynen), KPI kartları sade beyaz kutu (emoji ve renkli sol kenar kaldırıldı, Bricolage değer, 16 px köşe), `RevenueAreaChart`'a `variant="bars"` (bej günlük barlar, son gün turuncu; varsayılan çizgi modu değişmedi) → dashboard ve Analysen grafiği bar. Yapılmadı: "Vorperiode" karşılaştırma barları, Kaufpfad hunisi, Umsatz nach Land (veri/endpoint gerekir). Tasarım gereği: KPI kutuları, bar grafik, yeni siparişler, top ürünler, satın alma hunisi.
5. [x] **Mobil (s36/37) + yapışkan kaydet çubuğu** (2026-10-07, ikinci tur): `components/sc/MobileTabBar.jsx` — telefonda (< 48em) alt menü Start / Bestellungen / Produkte / Analysen / Nachrichten (aktif turuncu; masaüstünde gizli; içerik altına boşluk). Bestellungen telefonda tablo yerine kart listesi (#No, tarih, müşteri · adet, tutar, ödeme/teslim hapları; `.sc-orders-cards` / `.sc-orders-table`). `components/sc/UnsavedBar.jsx` — kaydedilmemiş değişiklik olduğunda altta yapışkan çubuk "● Ungespeicherte Änderungen · Verwerfen · Speichern" (6 dil; aynı `runSave`/`runDiscard`), topbar'daki İngilizce Discard/Save butonlarının yerini aldı; masaüstünde içerik alanının altında, telefonda alt menünün üstünde. SC build EXIT 0.

### Shop denetimi (PDF s1–31 ↔ canlı + kod, 2026-10-07)
Not: tarayıcı penceresi görünür olmadığı için ekran görüntüsü alınamadı; denetim canlı DOM metni + kod üzerinden yapıldı. Canlı site son push'u gösterir (bugünkü değişiklikler deploy sonrası görünür).
- s1 Ana sayfa: ✅ hero ("Gutes aus Europa…", Jetzt entdecken / Verkäufer werden), Sale + Neuheiten kutuları, güven şeridi (Käuferschutz/Versand/Bonuspunkte/Verifizierte Marken), Beliebte Kategorien, Bestseller. ⚠️ "Inspiration der Woche" kodda var (`warm-home-composition.js`) ama ≥3 görsel girilmesi gerekiyor → **içerik işi** (SC Landing). Header ikinci satırındaki öğeler (Neuheiten/Bestsellers/Marken/…) tasarımda kategoriler → **menü içeriği**, kod değil.
- s3/s14/s16 PDP: ✅ breadcrumb, galeri, satış adedi, Verifizierte Marke, varyant seçici, bullet'lar, Grundpreis, Bonuspunkte, Jetzt kaufen, diğer satıcılar, Käuferschutz, Versand & Rückgabe, "Kunden kauften auch", Ähnliche Produkte. **Eklendi**: yorum özeti (ortalama + 5★…1★ yüzde barları, `RatingDistribution.jsx`, iki şablonda). ❌ **"Auf Lager · Lieferung bis [DATUM]"** — teslim süresi verisi yok (satıcı hazırlık süresi + taşıyıcı transit süresi alanı gerekir); tarih uydurulmadı → ayrı iş. "Bewertung schreiben": yorumlar yalnız doğrulanmış siparişten (sipariş sayfasından) yazılıyor — bilinçli.
- s6/s15 Sepet: ✅ ücretsiz kargo eşiği ilerlemesi, satıcı adı, adet. s7/s13/s18/s21 Arama: ✅ öneriler, kategori/marka/ürün sonuçları, son ve popüler aramalar (`DropdownSearch`, `SearchDiscovery`). s9/s11/s28 Kategori: ✅ alt kategori, filtreler (stokta olanlar dahil), sıralama. s19/s29 Koleksiyon: ✅ sayfa var. s17/s31 Hesap: ✅ bonus kutuları (`AccountOverviewTiles`). s20/s30 Yasal: ✅ `pages/[slug]` (metin CMS'ten — uydurulmaz). s22/s26 Footer: ✅ 4 menü + sosyal. s25 Mobil alt menü: ✅.
- Açık (sonraki iş): teslim tarihi tahmini (veri modeli), mobil SC (s36/37), SC ürün düzenlemede dil hapları + pazar fiyat tablosu + yapışkan kaydet çubuğu (fonksiyon değiştirdiği için ayrı onay).
Kural: yoğun tablo tercihi (kullanıcı) korunur; fonksiyon değişmez, yalnız görünüm/düzen.

## 2026-10-07 — B. Sipariş yaşam döngüsü, 1. adım: Widerruf ve iade (bitti)

Yapılanlar:
- **Widerruf süresi** (`apps/medusa-backend/src/withdrawal.js`): teslimden sonraki 14. günün sonunda (Europe/Berlin, §§187/188 BGB) biter; önceden 14×24 saat sayılıyordu. Ürün sayfasında daha uzun süre (`metadata.return_days`) vaat edildiyse o geçerli. Teslim tarihi = `delivery_confirmed_at` ve `delivery_date`'in en geç olanı; teslimden önce süre yok.
- **Birden fazla iade**: sipariş başına tek açık iade kuralı kaldırıldı; yalnızca reddedilmemiş iadelerde zaten talep edilen adetler düşülür (`remainingReturnable`).
- **Gerekçe zorunlu değil** (§355 Abs. 1 BGB): shop iade formunda "neden" artık isteğe bağlı ("Keine Angabe"), 6 dil.
- **İade tutarını backend hesaplar** (`src/settlement/return-refund.js`): iade edilen ürünler + satıcının siparişteki tüm ürünleri geri geliyorsa gidiş kargo ücreti (§357 Abs. 2 BGB). Kupon/puan oranı createRefundRecord ile aynı. `executeReturnRefund` kargoyu settlement'a `shippingSellerIds` ile geçirir. SC iade modalı "tam iade" için artık sipariş toplamını değil bu tutarı önerir ve dökümünü gösterir.
- **Shop** `/store/orders/me` her siparişe `return_window` döner (son tarih, süre, kalan adetler). Sipariş detay ve liste sayfası iade butonunu buna göre gösterir; modal yalnız kalan ürünleri/adetleri listeler.
- **Hata düzeltmesi**: sipariş listesindeki hızlı iade butonu ürün göndermiyordu ve backend her zaman reddediyordu; artık kalan tüm ürünleri gönderir.

Dosyalar: `src/withdrawal.js`(+test), `src/settlement/return-refund.js`, `src/settlement/index.js`, `src/settlement/refunds.js` (export), `src/routes/returns.js`, `src/routes/store-checkout.js`, `src/settlement/settlement.test.js` (Widerruf entegrasyon testi), SC `OrdersReturnsPage.jsx`, `orders-returns-i18n.js`, shop `order/[id]/page.jsx`, `orders/page.jsx`, `messages/*.json`.
Test: `npm test` 187/187; gerçek PG ile settlement 79/79.

B'de sıradakiler (denetimde tespit edildi, henüz yapılmadı):
- Çok satıcılı siparişte tek `delivery_status`/`tracking_number` var; satıcı başına gönderi (shipment) modeli gerekiyor. Canlıda henüz çok satıcılı sipariş yok. Tasarım önerisi hazırlanıp onaya sunulacak (settlement teslim saatine dokunduğu için).
- Müşteri iptal/iade hata mesajları yalnız Almanca; `code` alanları eklendi, shop'ta 6 dile çevrilecek (E alanı).
- Canlıda `order_status = 'refunded'` ama `payment_status = 'bezahlt'` olan eski siparişler var (3 adet) — gösterim tutarlılığı kontrol edilecek.

## 2026-10-07 — A. Ürün oluşturma ve yayınlama (bitti)

Ayrıntı `docs/TASKS.md` → "A alanı". Özet: GTIN kontrol hanesi, satıcı içi SKU benzersizliği, Grundpreis (PAngV), yayına alma hazırlık kapısı, teklif durumu düzeltmesi (`published`→`active`, önceden shop'ta görünmüyordu), varyant matrisi doğrulaması, ürün görseli kırpma yerine beyaz dolgu + 100 MB yükleme sınırı.
