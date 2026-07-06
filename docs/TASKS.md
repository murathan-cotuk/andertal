# Görev Listesi

İlk not tarihi: 04.07
Son gözden geçirme (kod bazlı durum kontrolü): 06.07.2026

## Özet

| Durum | Adet |
|---|---|
| ✅ Tamamlanmış | 11 |
| ⚠️ Kısmen tamamlanmış | 7 |
| 🐛 Bozuk / hatalı (kodda bulundu) | 0 |
| ❓ Kodda bulgu yok / canlıda doğrulanmalı | 2 |
| **Toplam** | **20** |

Not: İlk gözden geçirme (06.07.2026) sadece koda bakılarak yapıldı. Aynı gün içinde, kullanıcı onayıyla, 4 doğrulanmış hata (Görev 5, 9, 10, 20) düzeltildi — bu değişiklikler henüz commit/push edilmedi, kullanıcı onayı bekleniyor.

---

### 1. Excel import → seller_id ve EAN mevcut olma hatası

> Sellercentralde import-export sayfasindan ürün import etmek icin excel hazirladim. Ürünler zaten var diyor ancak seller olarak products/inventory sayfasinda bu ekledigim ürünleri göremiyorum... eklenmek istenen ean mevcut olsa bile hata almamaliyiz, basarili eklenmeli... database de kayitli bilgilerin aynisi ise sellerlar hicbir uyari olmadan listelenmeli, degisiklik varsa hata olmadan eklenip superusera bildirim/öneri gitmeli.

**Durum: ✅ Düzeltildi (06.07.2026, henüz commit/push edilmedi)**
- `seller_id`'nin ürüne iliştirilmesi ve seller'ın kendi ürünlerini görebilmesi kodda doğru görünüyor (`admin-products.js:330, 459-464, 119-133`) — bu belirti muhtemelen daha önceki router-factory düzeltmeleriyle çözülmüş.
- EAN zaten varsa hata vermeme + fark yoksa sessizce ekleme + fark varsa değişiklik-önerisi oluşturma mantığı kodda mevcut (`admin-products.js:559-631`) — dokunulmadı.
- **Düzeltildi**: EAN-zaten-var durumunda yeni satıcı satırının `status` alanı artık her zaman `'draft'` (eskiden `'active'` sabitti, PUT akışıyla tutarsızdı). Ayrıca yeni bir draft listing oluştuğunda artık superuser'a in-app bildirim gidiyor (`admin_hub_notifications` tablosuna `type: 'seller_listing_pending'` kaydı, hangi satıcının hangi ürünü eklediğini belirtiyor). Bildirim, notifications.js'e eklenen yeni bir bildirim kategorisiyle (unread-count + feed + mark-read + delete akışlarının hepsinde) superuser arayüzünde görünür.
- Not: Bu draft listing, `store-products.js:260`'daki buybox/"other sellers" sorgusu `status = 'active'` şartı aradığı için, superuser (veya satıcının kendisi) onaylayıp aktif hale getirmeden shop'ta görünmeyecek — bu kasıtlı, istenen davranış.

---

### 2. Kampanya yayınlama + bütçe bölme

> Saticilarin olusturdugu kampanyalari kontrol edip bagladigimiz marketing hesabinda tek tik ile yayinlayalim... 5 euro bütce 5 farkli platforma 1er euro seklinde bölünecek.

**Durum: ⚠️ Kısmen tamamlanmış**
- Google Ads için gerçek entegrasyon var: OAuth, kampanya/bütçe/reklam grubu oluşturma, tek-tık publish endpoint'i bütçeyi platform sayısına gerçekten bölüyor (`campaigns.js:221-414, 417, 430`).
- Eksik: Meta ve diğer platformlar için gerçek API entegrasyonu yok, sadece sahte `sim_${platform}_...` ID üretiliyor (`campaigns.js:441-444`).
- Eksik: Stripe'tan satıcıya tam tutarın tahsili, publish anına otomatik bağlı değil — ayrı bir 30 günlük ön-ödeme akışı (`campaigns.js:493-532`).

---

### 3. Buybox en son ekleyene veriliyor / diğer satıcılar gözükmüyor

> 1 ürünün birden fazla saticisi var ancak shopta diger saticilar gözükmüyor. Buyboxu neden otomatik en son ekleyene verdin?

**Durum: ✅ Tamamlanmış (kodda), canlıda doğrulanmalı**
- Buybox skoru fiyat + satıcı puanı + yorum sayısı + stok üzerinden hesaplanıyor, en-son-eklenen değil (`store-products.js:214-216, 643`).
- "Other sellers (N)" çoklu satıcı listesi backend ve frontend'de mevcut (`store-products.js:632-658`, `ProductTemplate.jsx:1785-1814`, `ProductTemplateMobile.jsx:1966-1995`).
- Kod bu şikayeti doğrulamıyor — muhtemelen canlıda eski bir deploy çalışıyor olabilir, canlı ortamda tekrar test edilmesi öneriliyor.

---

### 4. Excel import → unit_type/unit_value sonrası per_unit alanı

> Excel ile ürün eklemede unit_type ve unit_value degerlerinde hemen sonra per_unit degeri ekleyelim (1000 g kismina tekabül etsin).

**Durum: ✅ Tamamlanmış**
- Excel `per_unit` kolonu `unit_reference` alanına maplenmiş, hem varyant hem parent metadata'da kullanılıyor (`apps/sellercentral/src/app/api/import-export/import/route.js:247-248, 954-958, 993-999`).

---

### 5. EAN değiştirilebiliyor / onay sistemi yok / kırmızı bildirim yok

> Ürünü sonradan ekleyen biri eanini da degistirebiliyor... eanin asla degistirilememli. Sadece ilk ekleyen satici sorgusuz degisiklik hakkina sahip olmali... degisiklik önerildiginde inventory sayfasinda kirmizi bildirim ve "degisikliklik önerildi" butonu olmali.

**Durum: ✅ Düzeltildi (06.07.2026, henüz commit/push edilmedi)**
- EAN değiştirilemezliği doğru şekilde uygulanmış (`admin-products.js:793-806` → 400 hatası) — dokunulmadı.
- İlk ekleyen satıcının serbestçe düzenleyebilmesi doğru çalışıyor (`admin-products.js:813` koşulu) — dokunulmadı.
- Kırmızı "Değişiklik önerildi (N)" bildirim rozeti sellercentralde mevcut ve çalışıyor (`InventoryPage.jsx:455-475, 635-725`) — dokunulmadı.
- **Bulunan hata**: Başka bir satıcı ortak (shared) alanlarda değişiklik yapmaya çalıştığında (`admin-products.js:813-851` ve `893-955`), istek 202 dönüp sadece değişiklik-önerisi kaydediyordu — **aynı istekteki fiyat/stok/durum/sku gibi satıcıya özel alanlar hiç kaydedilmiyordu**.
- **Yapılan düzeltme**: İki bloktaki erken `return` kaldırıldı; artık ortak alan değişikliği önerisi oluşturulduktan SONRA aynı istekteki satıcıya özel alanlar (`admin_hub_seller_listings`) da kaydediliyor. Yanıt artık hem `listing_saved: true` hem `suggestion_submitted: true` dönebiliyor. Ayrıca sellercentral tarafında `ProductEditPage.jsx`'te `suggestion_submitted` geldiğinde erken `return true` yapılıp `listing_saved` hiç işlenmeyen aynı kökten gelen bir frontend hatası da düzeltildi — artık ikisi birlikte geldiğinde hem veriler UI state'ine yansıyor hem birleşik bir başarı mesajı gösteriliyor.
- **Ek düzeltme (aynı gün)**: Bu iki bloktaki yeni-listing INSERT'leri de artık `status: 'draft'` ile başlıyor (tutarlılık için Görev 1 ile aynı mantık) ve yeni bir draft listing oluştuğunda superuser'a `seller_listing_pending` tipinde in-app bildirim gidiyor.

---

### 6. Billbee entegrasyonu

> Billbee entegrasyonu (Einstellungen → Kanäle → Shop hinzufügen → „Eigener Webshop (Billbee API)"...)

**Durum: ⚠️ Kısmen tamamlanmış**
- Basic Auth ile `GET /api/v1/orders`, `/products`, `/stock` (+ `/api/billbee/*` alias) uçları çalışıyor (`billbee-marketplace-api.js:71-317, 320-549`).
- Eksik: `POST /api/v1/webhook/order-update` sadece boş `204` dönen bir stub (`billbee-marketplace-api.js:518,549`) — Billbee'den geri sipariş durumu/kargo/stok güncellemesi alan bir yazma ucu yok.

---

### 7. Kargo takip numarası girilince kargo durumu takibi (genel)

> Bir siparis geldiginde ve sellercentralde trackingnummer girildiginde o trackingnummer in kargo güncellemelerinin görüntülenebilmesini ve gönderi durumuna göre siparis durumunun da güncellenmesini istiyorum.

**Durum: ⚠️ Kısmen tamamlanmış — bkz. Görev 18 ve 20 (aynı konunun devamı, aşağıda detaylı)**

---

### 8. Shop breadcrumbs

> Shopta ürünlerin icinde girdigimde breadcrumbs kisminda kategoriler gözüksün... "Home" yazmamali, "Koleksiyon" adinda kategorimiz yok, gerçek en son subkategori tiklanabilir sekilde gözükmeli.

**Durum: ✅ Tamamlanmış**
- Gerçek kategori ağacından ata kategoriler + güncel yaprak kategori kullanılıyor, "Home" yok, hardcoded "Koleksiyon" yok, hepsi tıklanabilir (`ProductTemplate.jsx:1093-1132, 1401-1410`, `Breadcrumbs.jsx:14-38`, mobilde `ProductTemplateMobile.jsx`). `cb48e24` commit'inde düzeltilmiş, main'de.
- Not: Koleksiyon/kategori **listeleme** sayfası (ürün detayı değil) hâlâ ayrı bir "Home / {başlık}" breadcrumb'ı gösteriyor (`[locale]/[handle]/page.jsx:1101-1107`) — farklı bir sayfa, bu şikayetin kapsamı dışında ama not düşülmeye değer.

---

### 9. Kupon kodu hatası + superuser kategorizasyonu

> Sellercentralde /coupons sayfasindan bir kupon ekledim, shopta bu kuponu girdim ancak Ungültiger oder abgelaufener Coupon-Code diyor... superuser icin üstte kendi kuponlarim, altta satici kuponlari.

**Durum: ✅ Düzeltildi (06.07.2026, henüz commit/push edilmedi) / ✅ Tamamlanmış (kategorizasyon)**
- **Kök neden**: `expires_at` sadece tarih (saat yok) olarak gönderiliyordu, `new Date(...)` bunu UTC gece yarısı olarak yorumluyordu (`CouponsPage.jsx:168,233`, `coupons.js:68`). Doğrulama `expires_at > now()` kontrolü yapınca (`store-checkout.js:164,231`), son geçerlilik günü UTC gece yarısından itibaren kupon "süresi dolmuş" gibi görünüyordu — bugün bitecek bir kupon anında ölü doğuyordu.
- **Yapılan düzeltme**: `CouponsPage.jsx`'te hem yeni kupon oluşturma hem düzenleme formunda, seçilen tarih artık günün başlangıcı yerine günün sonu (`T23:59:59.999`, satıcının yerel saatiyle) olarak ISO'ya çevriliyor. Test: Berlin saatinde 10 Temmuz için eskiden `2026-07-10T00:00:00Z`'de ölüyordu, şimdi `2026-07-10T21:59:59Z`'ye kadar (yani 10 Temmuz'un tamamı boyunca, Berlin saatiyle) geçerli.
- Superuser için "kendi kuponlarım üstte, satıcı kuponları altta" ayrımı doğru şekilde uygulanmış (`CouponsPage.jsx:264-265, 410-477`) — dokunulmadı.

---

### 10. 2. satıcı, sistemde mevcut EAN'i ekliyor — kaydetme çalışmıyor + buybox + "other sellers"

> Sistemde mevcut olan bir eani baska bir satici ile ekledim... save dedigimde kaydedilmiyor... "other sellers (3)" gösterilecek...

**Durum: ✅ Düzeltildi (06.07.2026, henüz commit/push edilmedi) / ✅ Tamamlanmış (buybox + other sellers)**
- Aynı kök neden ve aynı düzeltme: bkz. Görev 5 — satıcıya özel alanlar (fiyat, stok, sku, versandgruppe, yayın tarihi vs.) artık ortak alan farkı olsa da her zaman kaydediliyor.
- Buybox algoritması ve "other sellers (N)" açılır listesi zaten kodda var ve çalışıyor (bkz. Görev 3) — dokunulmadı.

---

### 11. Bestseller etiketi tutarlılığı

> Bestseller etiketi category, collection, search, menu vs her yerde ürün cardinda gözükmeli.

**Durum: ✅ Tamamlanmış**
- Paylaşılan `BestsellerBadge`, tüm listeleme bağlamlarında (kategori, koleksiyon, arama, carousel'ler) kullanılan `ProductCard` üzerinden tutarlı şekilde gösteriliyor (`ProductCard.jsx:542,632-636,970,1022`, `ProductGrid.jsx:130-135`, `LandingContainers.jsx`).
- Tek istisna: `ProductCategoryRow.jsx:386` farklı (düz metin) bir rozet kullanıyor ama bu bileşen hiçbir yerde import edilmiyor — ölü kod, canlı sayfalarda soruna yol açmıyor.

---

### 12. QR kod localhost sorunu + imza endpoint'i + çok dilli doğrulama + hukuki metin uzunluğu

> Qr kodu okuttugumda telefondan localhost:3002 aciliyor... sellercentral icin imza atma endpointi olustur... verification sayfasi ispanyolca/italyanca vs ayarlanmamis... legal agreements cok kisa, 10-12 sayfa olmali.

**Durum: ⚠️ Kısmen tamamlanmış**
- İmza (signing) endpoint'i **tamamlanmış**: QR, doğru production URL'i kullanıyor (`seller-agreement.js:202-227`, localhost değil), giriş → sarı imza alanı → başarı mesajı akışı çalışıyor (`sellercentral/.../sign/[token]/page.jsx`).
- Ancak **localhost:3002 sızıntısı hâlâ canlı olabilir** — farklı bir akışta (kargo etiketi/checkout yönlendirmesi), `SELLERCENTRAL_URL` env değişkeni hâlâ `http://localhost:3002` varsayılanına düşüyor (`shipment-tracking.js:598`, `stripe-connect.js:14`). Kullanıcının gördüğü QR muhtemelen bu ikinci akıştan geliyor.
- Çok dilli doğrulama sayfası **büyük ölçüde tamam**: tr/de/fr/es/it/en arayüz metinleri mevcut (`VerificationSettingsPage.jsx`, `sign/[token]/page.jsx`).
- Hukuki sözleşme metni sadece de/tr/en dillerinde yazılmış, fr/es/it için sessizce İngilizce'ye düşüyor (`CONTRACT_SECTIONS`, satır 583).
- Hukuki metin uzunluğu **tamamlanmamış**: şu an sadece 10 kısa, tek paragraflık bölüm var (~1-2 sayfa), istenen 10-12 sayfalık detaylı içerikten çok uzak.

---

### 13. Bestseller Carousel container template

> Content/landingpage sayfasinda "Bestseller carousel" adinda bir container template olustur...

**Durum: ✅ Tamamlanmış**
- Shop tarafında `BestsellerCarousel` container tipi (`bestseller_carousel`) tam uygulanmış: seçilen kategoriye göre satış skoruna göre sıralama, "#N" rozeti, daha küçük kart genişliği, "Mehr anzeigen" linki (`LandingContainers.jsx:1091-1180,2515`).
- Sellercentral tarafında editör bileşeni ve i18n etiketleri mevcut (`LandingPageEditor.jsx:1526-1621,304,2737`).

---

### 14. Bestseller Carousel kategori seçici (parent > subkategori)

> Bestseller carouselde kategori secme penceresi acildiginda tüm kategoriler alt alta gözükyor... parent kategori>subkategori seklinde ilerlemeli.

**Durum: ✅ Tamamlanmış**
- `BestsellerCarouselEditor`, ürün oluşturma sayfasıyla aynı ağaç-yapılı `CategoryDrilldownSelect` bileşenini kullanıyor, düz liste değil (`LandingPageEditor.jsx:1563-1570`, `CategoryDrilldownSelect.jsx:8-33`).

---

### 15. Brands sayfasında yeni marka gözükmüyor

> Sellercentralde saticilarin kayit ettigi markalar shopta /brands sayfasinda gözüküyor normalde. Son ekledigim marka gözükmüyor.

**Durum: ❓ Kodda bulgu yok / canlıda araştırılmalı**
- Hem backend uçları (`brands.js:20-44`, `store-products.js:681-698`) hem shop sayfası (`/brands`, `/api/store-brands`) herhangi bir onay/durum filtresi içermiyor, cache de `no-store`/`force-dynamic`. Bu kod yolunda yeni markayı dışlayan bir mantık bulunamadı.
- Olası sebep muhtemelen bu kod yolunun dışında: apps arası backend URL uyuşmazlığı, ya da handle çakışması nedeniyle marka sessizce farklı bir handle ile kaydediliyor olabilir — canlı ortamda spesifik markayla test edilmesi gerekiyor.

---

### 16. Shop URL yapısı (/produkt/ kaldırılmalı)

> Shopta url neden /produkt/vampirevape... seklinde? andertal.com/de/de/ yazdiktan sonra hemen ürün bilgileri görünmeli.

**Durum: ⚠️ Kısmen tamamlanmış**
- Temel yetenek zaten var: ürün kartı linki ve catch-all route `/de/de/<handle>` şeklinde direkt çalışıyor (`ProductCard.jsx:562`, `[locale]/[handle]/page.jsx` fallback 4).
- Ancak onlarca iç link hâlâ eski `/produkt/<handle>` önekini kullanıyor: sepet, hesap sayfası, kullanıcı menüsü, checkout, arama dropdown'u, sipariş sayfası, sitemap.xml — ve kritik olarak **ürün sayfasının kendi canonical tag'i bile hâlâ `/produkt/...`'a işaret ediyor** (`ProductTemplate.jsx:1083`, `ProductTemplateMobile.jsx:1101`). Eski `/produkt/[handle]` ve `/product/[slug]` route'ları da hâlâ paralel şekilde duruyor.
- Statik sayfalar için `/pages/[slug]` route'u da hâlâ ayrı duruyor ve sitemap bunu böyle üretiyor.

---

### 17. Sipariş onay sayfası

> Shopta müsteri olarak siparis verdigimde siparis onay sayfasi gözükmüyor. Direkt /order sayfasina yönlendiriyor.

**Durum: ✅ Tamamlanmış**
- Yeşil tik işaretli onay görünümü (`OrderConfirmationView`), "siparişlerim" butonu dahil tam uygulanmış (`order/[id]/page.jsx:330-451`). Checkout başarı sonrası `/order/[id]?confirmed=1`'e yönlendiriyor ve bu görünüm tetikleniyor (`checkout/page.jsx:918,1082,1617`, `order/[id]/page.jsx:519`).
- Ayrı bir URL yerine aynı route üzerinde query-param ile çalışıyor — işlevsel olarak istenen deneyimi sağlıyor.

---

### 18. Kargo takip numarası girilince "versendet" otomatik olmalı

> Sellercentralde siparise kargo takip numarasi gelince lieferstatus otomatik versendet olmali. Ancak olmuyor.

**Durum: ⚠️ Kısmen tamamlanmış — kodda doğru görünüyor, canlıda doğrulanmalı**
- Takip numarası kaydedilince otomatik `versendet` mantığı doğru görünüyor (`orders.js:409-422`). Sellercentral'daki bazı ekranlar bunu zımnen tetikliyor, bazıları (`ShipOrdersModal.jsx`, `VersandPage.jsx`) zaten açıkça `delivery_status:"versendet"` gönderiyor.
- Statik kod incelemesiyle şikayet doğrulanamadı — canlı ortamda hangi ekrandan takip numarası girildiğine göre tekrar test edilmeli.

---

### 19. Bestellstatus "abgeschlossen" mantık hatası

> Zahlungsstatus bezahlt oldugunda ve lieferstatus zugestellt oldugunda bestellt status abgeschlossen olmali. Ancak lieferstatus versendet oldugunda da abgeschlossen oluyor.

**Durum: ❓ Kodda bulgu yok**
- `abgeschlossen` durumunu set eden **her yer** kontrol edildi (`orders.js:394-407`, `shipment-tracking.js:91,407`, `webhooks.js:93`, `server.js:1976`, `OrderDetailPage.jsx:142-147`) — hepsi tutarlı şekilde `bezahlt + zugestellt` şartını arıyor. `orders.js:401-407`'de `zugestellt` değilse `abgeschlossen`'ı geri `in_bearbeitung`'a çeviren açık bir koruma bile var.
- Şu an kodda bu hata yok. Kullanıcı hâlâ görüyorsa muhtemelen eski/cache'lenmiş veri ya da bir UI görüntüleme sorunu — durum hesaplama mantığının kendisi değil.

---

### 20. DHL/DPD/GLS/UPS kargo durumu güncellemeleri gelmiyor

> Siparis icine eklenen kargo takip numarasindan sonra "Paket wurde versendet" geliyor ama diger durum güncellemeleri gelmiyor. DHL, DPD, GLS, UPS ile denedim, hicbiri yansimiyor.

**Durum: ✅ Düzeltildi (06.07.2026, henüz commit/push edilmedi)**
- Gerçek bir arka plan işi var: sunucu açılışından 5 dk sonra başlayıp 3 saatte bir tekrar çalışıyor (`server.js:1862-1989`, `runAutoTrackingRefresh`), DHL/DPD/GLS API'lerini gerçekten çağırıyor.
- **Bulunan hata 1 (daha temel)**: UPS'in manuel "Refresh tracking" butonu bile aslında hiç çalışmıyordu — `shipment-tracking.js:184-187`'deki SQL sorgusu `store_shipping_carriers` tablosundan `api_secret` sütununu hiç SELECT etmiyordu, ama kod birkaç satır sonra `carrierRow.api_secret`'ı okumaya çalışıyordu (her zaman `undefined`). Yani UPS OAuth2 girişimi her zaman boş bir secret ile deneniyor ve başarısız oluyordu. **Düzeltildi**: SELECT'e `api_secret` eklendi.
- **Bulunan hata 2**: UPS otomatik yenileme döngüsüne hiç dahil değildi (`server.js:1878-1882` sadece DHL/DPD/GLS içeriyordu). **Düzeltildi**: `shipment-tracking.js`'teki UPS OAuth2 + tracking-fetch mantığı `runAutoTrackingRefresh`'e de eklendi, UPS artık DHL/DPD/GLS ile aynı 3 saatlik döngüde otomatik güncelleniyor.
- **Bulunan hata 3**: DHL/DPD/GLS/UPS için sipariş bazlı tüm hatalar sessizce yutuluyordu (`catch (_) {}`) — hiç loglanmıyordu, bu yüzden hangi siparişte/hangi taşıyıcıda neyin bozulduğu asla görülemiyordu. **Düzeltildi**: artık `console.warn` ile sipariş ID'si, taşıyıcı adı ve hata mesajıyla loglanıyor (Render loglarında görünür olacak).
- Not: DPD/GLS hâlâ resmi olmayan/dokümante edilmemiş uçlar kullanıyor — bu uçlardan biri değişirse güncellemeler yine durabilir, ama artık en azından bu durum loglara düşecek ve fark edilebilir olacak.
- **Bulunan hata 4 (altyapı, kullanıcı sorusu üzerine bulundu)**: `store_shipping_carriers` tablosunun `seller_id` sütunu var ve her satıcı Sellercentral → Ayarlar → Versand sayfasından kendi DHL/UPS/vs. hesabını kendi API key/secret'ıyla ekleyebiliyor (superuser'a özel değil). Ama hem manuel "Refresh tracking" butonu (`shipment-tracking.js:184-187`) hem otomatik döngü (`server.js` DHL/UPS sorguları), taşıyıcıyı sadece isimle arıyordu (`seller_id` hiç filtrelenmiyordu) — birden fazla satıcı aynı taşıyıcıyı (örn. DHL) kendi ayrı hesabıyla eklerse, sistem rastgele birini seçip yanlış satıcının siparişinde yanlış hesabı kullanabiliyordu. **Düzeltildi**: her iki sorgu da artık önce siparişin sahibi olan satıcının kendi taşıyıcı kaydını, yoksa platform genelindeki (superuser'ın, `seller_id IS NULL`) kaydı kullanacak şekilde güncellendi.
