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

## Fonksiyon bazlı iyileştirme programı (2026-10-07)

Her alan tek tek ve uçtan uca ele alınır: önce denetim raporu, sonra kod, veri, test ve doküman. Bir alan bitmeden sonrakine geçilmez. Hedef: uluslararası pazaryeri standardı (Amazon, Zalando, Otto seviyesi), modern görünüm, eksiksiz fonksiyon. Kural: çalışan hiçbir şey bozulmaz; her değişiklik geriye uyumludur ve testlidir. Referans derinlik: ödeme altyapısı (`docs/Odeme-Payout-Implementasyon.md`).

- [ ] **A. Ürün oluşturma ve yayınlama:** ürün ekleme, varyantlar, Eigenschaften, marka, kategori, GPSR/yasal alanlar, kaydetme (taslak), yayına alma, mevcut katalog ürününe teklif ekleme, toplu yükleme.
- [ ] **B. Sipariş yaşam döngüsü:** sipariş, hazırlama, kargo etiketi ve takip, teslim onayı (ödeme saati), iptal, iade ve Widerruf.
- [ ] **C. Satıcı kaydı ve onboarding:** kayıt, onay, sözleşme, hukuki ve vergi bilgileri, ödeme hesabı.
- [ ] **D. Kategori ağacı ve import:** Excel import, kategori atama, filtreler, uyumluluk profilleri.
- [ ] **E. Shop vitrini:** ana sayfa, kategori sayfaları, ürün sayfası, arama, sepet ve checkout deneyimi.
- [ ] **F. Bildirimler ve e-postalar:** müşteriye ve satıcıya ne, ne zaman gider; zil paneli; flow otomasyonu.
- [ ] **G. Faturalar ve vergi:** müşteri faturası, Provisionsrechnung, OSS, DAC7 raporu.

A alanı ilerleme (2026-10-07):
- [x] EAN/GTIN: yeni girilen kod GS1 kontrol hanesiyle doğrulanır (GTIN-8/12/13/14); önceden kayıtlı kodlar muaf. Çakışma kontrolü tüm ürünleri belleğe çekmek yerine veritabanında yapılır (`src/product-ean.js`). SC'de alan anında uyarır.
- [x] SKU: satıcı hesabı içinde benzersiz (ürün, varyant ve teklif SKU'ları; büyük/küçük harf duyarsız); eski SKU'lar muaf (`src/product-sku.js`).
- [x] Grundpreis (PAngV 2022): g/ml her zaman 1 kg / 1 l başına; varyantın kendi içeriği kullanılır; kampanya fiyatı gösterilirken Grundpreis de ona göre hesaplanır (`apps/shop/src/lib/grundpreis.js`).
- [ ] Grundpreis kategori/ürün kartlarında da gösterilmeli (E alanı) ve Google Merchant feed'e `unit_pricing_measure` eklenmeli (SEO alanı).
- [ ] Canlıdaki test ürünlerinin EAN'ları gerçek GTIN değil (153 kodun 144'ü); kod değiştirilmedikçe kaydetme engellenmez. "arts | | | title_de" başlıklı ürünler hatalı Excel importundan kalmış.

Açık küçük işler (A alanında kapatılır):
- [ ] "Ecom Lastest" ve "1 Tütün tabakasi…" ürünleri eski `_catalog_approval_pending` işareti yüzünden shop'ta gizli; işaret temizlenecek.
- [ ] Second-nav arka plan düzeltmesi (`ShopHeader.jsx`, chrome cover yalnızca kaydırınca) push bekliyor.

Stripe Dashboard işleri (bölüm 6) bilinçli olarak programın sonuna bırakıldı.

## Bu listeye alınmayanlar

Affiliate ödemeleri vergi incelemesi bitene kadar kapalı; ilk satışa engel değil. Kategorilere toplu SEO metni yazılmayacak. Sunucu tarafı stil gecikmesi ve CDN hız işidir, satış kapısı değil.
