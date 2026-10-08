# Yapılacaklar

İlk gerçek satışa kadar. Sıra bağımlılığa göre.

## 1. Shop vitrini

- [ ] Ana sayfa ve kategori sayfalarını mevcut görsel şablona göre düzenle (`docs/designs/Home-Picture-Template`, `docs/designs/claude-frontendfigma`).

Engel: SellerCentral’da landing kaydı anında yayınlanır. Hazır iş metni yoksa sayfa metni uydurulmaz.

## 2. Kategori ağacı

- [ ] Shop’ta kullanılacak kategorileri Excel import ile tamamla.

Engel: Canlı veritabanında yaklaşık 12.337 kategori zaten duruyor. Yeni dosyada aynı slug varsa satır güncellenir, ikinci kayıt açılmaz. Bu iş CSV import ile yapılmaz; kolon `name` değil `name_de`. Staging veritabanı yok, import doğrudan canlıya gider. Tam kategori listesini metadata ile çekmek bellek taşırır.

## 3. Satıcı kaydı

- [ ] Seçilen satıcıyla SellerCentral kaydı aç, superuser onayını ver, ödeme için IBAN’ı kaydet.

Engel: Payout için satıcı SC → Einstellungen → Zahlungen'da **Stripe-Auszahlungskonto** açmalı (Custom, recipient; Stripe sözleşmesini kendisi kabul eder) ve Stripe doğrulamasını tamamlamalı. Bunu yapmayan satıcıya otomatik ödeme gitmez; yalnızca superuser manuel havaleyi (gerçek referans ve tutar onayıyla) kaydedebilir. Ayrıntı: `docs/Odeme-Payout-Implementasyon.md`.

## 4. Ürünleri kategorize et

- [ ] Bu satıcının ürünlerini doğru kategoriye bağla.

Engel: Kategori bir kez kaydedilince değişmez. Yanlış kategori, ürüne yanlış uyumluluk alanlarını da kilitler. Kategori ağacı bitmeden bu adıma geçilmez.

## 5. Ürünleri yayınla

- [ ] Ürünleri fiyat, stok, görsel ve zorunlu alanlarla shop’ta listele.

Engel: Her ürün, kategorisi ne olursa olsun üç GPSR alanı (üretici, üretici bilgisi, sorumlu kişi) dolmadan kaydedilemez. Yayın sonrası shop önbelleği yenilenmezse `REVALIDATE_SECRET` ile `STOREFRONT_PUBLIC_URL` eşleşmiyordur.

## 6. Stripe’ı canlıya al

- [ ] Canlı yayınlanabilir anahtar ve gizli anahtarı platform ödeme ayarına yaz.
- [ ] Stripe canlı webhook’unu bağla; `STRIPE_WEBHOOK_SECRET` değerini aynı canlı uç noktadan al.
- [ ] Connect webhook uç noktasını ekle (payout.*, account.updated; “Events on Connected accounts”) ve `STRIPE_CONNECT_WEBHOOK_SECRET` olarak kaydet. Olay listesi: `docs/Odeme-Payout-Implementasyon.md` §11.
- [ ] Stripe Dashboard’da platformun Custom/recipient connected account kullanmaya yetkili olduğunu doğrula.

Engel: Gizli anahtar veritabanında (`store_platform_checkout`), webhook sırrı ortam değişkeninde. Biri test, biri canlı kalırsa kart çekilir ama sipariş onaylanmaz. İlk geçiş gerçek para hareketidir.

## 7. İlk gerçek sipariş

- [ ] Küçük tutarlı bir siparişle ödemeyi, webhook’u ve satıcı hakediş kaydını doğrula.

Engel: Bunu 5 ve 6 bitmeden yapma.

## Çalışma sırası ve kayıt kuralı (2026-10-07)

Her adım `docs/ILERLEME.md`'ye yazılır (ne yapıldı, dosyalar, test, sırada ne var). Başka cihazda pull sonrası önce `ILERLEME.md` + bu dosya okunur. Commit/push kullanıcıda; `backfill … --apply` yalnız kullanıcı açıkça derse.

Sıra: (1) B alanının 1. adımı — bitti → (2) Cursor handoff Faz 0…3 → (3) JTL ortaklık Faz A–D (`docs/jtl.md`) → (4) Shop-SC Konsept PDF denetimi + Sellercentral tasarımları → (5) B alanının kalanı ve C–G.

### Cursor handoff — SC varyasyon / uyumluluk paritesi

Kaynak: `docs/HANDOFF-cursor-plan-sc-variation-compliance.md`, referans görseller `pic/eprel1.png`, `pic/eprel2.png`, `pic/gewahrleistung.png`. Sıra: 0 → 0b → 0c → 0e → 0d → 0f → 1 → 2 → 3. Önce uygulanmış olabilecek kısımlar kontrol edilir.

- [x] **Faz 0** — Shop Eigenschaften: aynı metafield anahtarı tek satır (değerler virgülle), parent+varyant aynı anahtar bir kez; `packaging_unit` / `packaging_unit_plural` gizli.
- [x] **Faz 0b** — Mevcut ürüne teklif eklerken EAN 400: satıcı olmayan teklifte master EAN "değiştirilemez" kontrolü atlanır; sahipte `normalizeStoreEan` ile karşılaştırılır; teklif EAN'ı master'a yazılmaz.
- [x] **Faz 0c** — SC Rechtlich: WEEE, EPREL ve Produktdateien ayrı bloklar; zorunlu alan kırmızı `*` ve boşken kırmızı çerçeve; opsiyoneller zorunlulardan sonra; manuel alanlarda Required/Optional seçimi (varsayılan Required).
- [x] **Faz 0e** — EPREL alanları: `energy_class_scale`, `energy_class_grade`, `eprel_number`, `energy_label_image`, `energy_label_qr` (6 dilde açıklama); WEEE altında URL yok.
- [x] **Faz 0d** — Shop PDP: `weee_number` yalnız buybox'ta; EPREL sınıfı varsa varyasyon seçicinin üstünde rozet → tıklayınca etiket modalı; diğer yasal gruplar açıklamanın yanında grup sekmeleri; `custom_test` → "Test"; Eigenschaften tablosu yasal sekmelere karışmaz.
- [x] **Faz 0f** — Açıklamanın hemen altında "Güvenlik ve ürün kaynakları": solda yasal garanti (AB ≥ 2 yıl, 6 dil sabit metin + `warranty_info_url`, superuser ayarı, varsayılan `/pages/gewaehrleistung`), sağda GPSR kişileri + `safety_information_text` / `safety_information_pdf`.
- [x] **Faz 1** — Farbe ≠ Design: varyasyon grubu seçiminde `metafield_key` korunur, Farbe seçilince Design'a dönmez.
- [x] **Faz 2** — Varyant formu = ürün formu (ülke fiyatları, Genel/Spez/Rechtlich düzeni).
- [ ] **Faz 3** — (ön koşul gerekli, ayrıntı ILERLEME.md: shop/store API aile üyelerini varyant olarak göstermeden varsayılan açılmaz; dry-run: 8 ürün → 145 satır) — `family_link` (`legacyFold: false`); çocuklar ProductEditPage'de; backfill yalnız dry-run.

### JTL ortaklık ve entegrasyon (`docs/jtl.md`)

Kullanıcı talimatı: Faz A–D sırayla; `docs/CONNECTOR.md` ile bağlantılı; **JTL %1 payı satıcı ledger'ına yazılmaz** (platformun JTL'e borcu, satıcı hakedişini etkilemez). Sözleşme: `docs/JTL/JTL Contract.pdf`.

- [x] **Faz A** — Attribution: hangi satıcı "JTL satıcısı" (veri modeli + attribution noktaları + test).
- [x] **Faz B** — Brüt GMV ve %1 accrual (ayrı tablo, satıcı ledger'ı değil; ne zaman yazılır; test).
- [x] **Faz C** — SC Settings → Billing → JTL sekmesi (superuser): rapor, API, 6 dil.
- [x] **Faz D** — Otomatik JTL raporlama e-postası (sözleşmedeki zamanlama), manuel + otomatik, Content → Flows.
- Faz E (SCX connector) CONNECTOR.md ile paralel; Faz F operasyon/hukuk dokümantasyonu.

### Andertal Shop-SC Konsept.pdf

Kaynak: `docs/designs/claude-frontendfigma/Andertal Shop-SC Konsept.pdf`.
- [x] Shop sayfaları tek tek PDF ile karşılaştırılır; yapılmış / eksik listesi `ILERLEME.md`'ye yazılır. (Kural: istenmeden shop görünümü değiştirilmez — eksikler PDF'teki tasarım olduğu için uygulanır, sonucu kullanıcıya listelenir.)
- [~] PDF'in sonundaki Sellercentral tasarımları uygulanır — kabuk, liste şablonu (Envanter/Bestellungen/Retouren), Bestellung detayı, ürün/varyant başlıkları, Übersicht + Berichte yapıldı; kalan: mobil SC (s36/37), ürün düzenlemede dil hapları + pazar fiyat tablosu + yapışkan kaydet çubuğu (onay gerekir), PDP teslim tarihi tahmini (veri modeli). Ayrıntı: ILERLEME.md (yoğun tablo tercihi korunur).

## Fonksiyon bazlı iyileştirme programı (2026-10-07)

Her alan tek tek ve uçtan uca ele alınır: önce denetim raporu, sonra kod, veri, test ve doküman. Bir alan bitmeden sonrakine geçilmez. Hedef: uluslararası pazaryeri standardı (Amazon, Zalando, Otto seviyesi), modern görünüm, eksiksiz fonksiyon. Kural: çalışan hiçbir şey bozulmaz; her değişiklik geriye uyumludur ve testlidir. Referans derinlik: ödeme altyapısı (`docs/Odeme-Payout-Implementasyon.md`).

- [x] **A. Ürün oluşturma ve yayınlama:** ürün ekleme, varyantlar, Eigenschaften, marka, kategori, GPSR/yasal alanlar, kaydetme (taslak), yayına alma, mevcut katalog ürününe teklif ekleme, toplu yükleme.
- [x] **B. Sipariş yaşam döngüsü:** sipariş, hazırlama, kargo etiketi ve takip, teslim onayı (ödeme saati), iptal, iade ve Widerruf. (2026-10-08 kapandı; ayrıntı ILERLEME.md. Açık: izinli production düzeltmeleri; olay geçmişi paket bazlı değil; kısmi iptalde bonus orantısı; iptal e-postası → F.)
- [x] **C. Satıcı kaydı ve onboarding:** kayıt, onay, sözleşme, hukuki ve vergi bilgileri, ödeme hesabı. (2026-10-08 kapandı; ayrıntı ILERLEME.md. Açık: eksik bilgili 2 onaylı satıcı — kullanıcı kararı; satıcı e-posta doğrulaması; IBAN değişikliği bildirimi → F.)
- [x] **D. Kategori ağacı ve import:** Excel import, kategori atama, filtreler, uyumluluk profilleri. (2026-10-08 kapandı; ayrıntı ILERLEME.md.)
- [x] **E. Shop vitrini:** (2026-10-08 kapandı; ayrıntı ILERLEME.md. Açık: kategori sayfasında sunucu tarafı sayfalama.) ana sayfa, kategori sayfaları, ürün sayfası, arama, sepet ve checkout deneyimi. A'dan devreden: ~~Grundpreis ürün kartlarında~~ ✅ 2026-10-08; ~~Merchant feed `unit_pricing_measure`~~ ✅ 2026-10-08.
- [x] **F. Bildirimler ve e-postalar:** (2026-10-08 kapandı; ayrıntı ILERLEME.md. Açık: bounce/şikâyet webhook kurulumu; yeni olaylar için Flows metinleri — kullanıcı.) müşteriye ve satıcıya ne, ne zaman gider; zil paneli; flow otomasyonu.
- [x] **G. Faturalar ve vergi:** (2026-10-08 kapandı; ayrıntı ILERLEME.md. Açık: OSS raporu — Steuerberater.) müşteri faturası, Provisionsrechnung, OSS, DAC7 raporu.

A alanı (tamamlandı 2026-10-07):
- [x] EAN/GTIN: yeni girilen kod GS1 kontrol hanesiyle doğrulanır (GTIN-8/12/13/14); önceden kayıtlı kodlar muaf. Çakışma kontrolü tüm ürünleri belleğe çekmek yerine veritabanında yapılır (`src/product-ean.js`). SC'de alan anında uyarır.
- [x] SKU: satıcı hesabı içinde benzersiz (ürün, varyant ve teklif SKU'ları; büyük/küçük harf duyarsız); eski SKU'lar muaf (`src/product-sku.js`).
- [x] Grundpreis (PAngV 2022): g/ml her zaman 1 kg / 1 l başına; varyantın kendi içeriği kullanılır; kampanya fiyatı gösterilirken Grundpreis de ona göre hesaplanır (`apps/shop/src/lib/grundpreis.js`).
- [x] Yayına alma hazırlığı: taslaktan yayına geçen (veya yeni) ürün başlık, fiyat (her varyant için), en az bir görsel ve kategori olmadan yayına çıkmaz; kayıt korunur, taslak kalır, eksikler 6 dilde gösterilir. Zaten yayındaki ürünler bu kural yüzünden yayından kalkmaz (`src/product-readiness.js`).
- [x] Toplu import (Excel ve CSV bulk-import): yayın istenip taslak kalan satırlar sonuç ekranında eksikleriyle listelenir. Import sonuç ekranındaki Almanca metinler (yanlışlıkla Türkçeydi) düzeltildi.
- [x] Mevcut ürüne teklif ekleme: formdan gelen `published` durumu teklifte `active` olarak yazılır. Önceden bu teklifler shop'ta ve checkout'ta hiç görünmüyordu; eski `published` kayıtlar da artık okunur. Fiyatı 0 olan teklif yayına çıkmaz (`src/listing-status.js`).
- [x] Varyant matrisi: aynı seçenek kombinasyonu iki kez ya da bir varyasyon grubunun değeri eksik kaydedilemez; eski sorunlu kayıtlar muaf (`src/product-variants.js`).
- [x] Ürün görselleri: JPEG/PNG/WebP/AVIF; uzun kenar ≥ 1000 px; kare olmayan görsel kırpılmaz, beyazla kareye tamamlanır (önceden ortadan kırpılıyordu); şeffaf arka plan beyaz; telefon fotoğraflarının yönü düzeltilir; çıktı 1000–2000 px kare WebP. Yükleme sınırı 100 MB (önceden sınırsızdı, sunucu belleğini tüketebilirdi).
- Not: Canlıdaki test ürünlerinin EAN'ları gerçek GTIN değil (153 kodun 144'ü); kod değiştirilmedikçe kaydetme engellenmez. "arts | | | title_de" başlıklı ürünler hatalı Excel importundan kalmış.

Açık küçük işler (A alanında kapatılır):
- [x] Eski `_catalog_approval_pending` bayrağı ürünü artık shop'tan gizlemez; ürün GET'te otomatik temizlenir. Katalog önerileri superuser ziline (`catalog_proposals` / Metaobjekte) düşer.
- [ ] Second-nav arka plan düzeltmesi (`ShopHeader.jsx`, chrome cover yalnızca kaydırınca) push bekliyor.

Stripe Dashboard işleri (bölüm 6) bilinçli olarak programın sonuna bırakıldı.

## JTL pazar yeri ortaklığı

Sözleşme imzalandı (`docs/JTL/JTL Contract.pdf`). Uygulama talimatı ve task listesi: [`docs/jtl.md`](jtl.md). Teknik SCX connector: [`docs/CONNECTOR.md`](CONNECTOR.md).
- [ ] Attribution + %1 accrual + Billing → JTL tab (superuser) + çeyreklik e-posta raporu (`docs/jtl.md` Faz A–D).

## Bu listeye alınmayanlar

Affiliate ödemeleri vergi incelemesi bitene kadar kapalı; ilk satışa engel değil. Kategorilere toplu SEO metni yazılmayacak. Sunucu tarafı stil gecikmesi ve CDN hız işidir, satış kapısı değil.
