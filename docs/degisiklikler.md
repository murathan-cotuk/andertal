# Değişiklik Günlüğü

---

## 2026-06-10

### 1. Satıcı Kredi Kartı Yönetimi

**Amaç:** Satıcıların platform ücreti veya iade/chargeback durumlarında yetersiz bakiye olduğunda ödeme yapılabilmesi için kredi kartı ekleyebilmeleri sağlandı. Süperkullanıcılar satıcıların kartlarını görüntüleyip silebilir.

#### Backend — `apps/medusa-backend/server.js`

**Veritabanı — `seller_users` tablosuna yeni sütunlar:**
- `stripe_customer_id` — Stripe Customer ID (fatura için)
- `stripe_payment_method_id` — Kayıtlı ödeme yöntemi ID'si
- `stripe_card_last4` — Son 4 hane (maskelenmiş gösterim için)
- `stripe_card_brand` — Kart markası (visa, mastercard, vb.)
- `stripe_card_exp_month` — Son kullanma ayı
- `stripe_card_exp_year` — Son kullanma yılı

**Yeni API uç noktaları:**

| Uç Nokta | Yetki | Açıklama |
|---|---|---|
| `GET /admin-hub/v1/stripe-publishable-key` | Satıcı | Stripe publishable key döner (kart formu için) |
| `POST /admin-hub/v1/seller/card/setup-intent` | Satıcı | Stripe Customer + SetupIntent oluşturur, `client_secret` döner |
| `POST /admin-hub/v1/seller/card/confirm` | Satıcı | Stripe.js'ten gelen PM ID ile kart bilgilerini DB'ye kaydeder |
| `GET /admin-hub/v1/seller/card` | Satıcı | Mevcut kartın maskelenmiş bilgilerini döner |
| `DELETE /admin-hub/v1/seller/card` | Satıcı | Kartı Stripe'tan detach eder, DB'den temizler |
| `GET /admin-hub/v1/sellers/:id/card` | Süperkullanıcı | Seçili satıcının kart bilgisini döner |
| `DELETE /admin-hub/v1/sellers/:id/card` | Süperkullanıcı | Seçili satıcının kartını siler |

**PCI Uyumu:** Kart numarası hiçbir zaman sunuculara ulaşmaz. Stripe.js direkt Stripe'a gönderir; DB'de yalnızca son 4 hane, marka ve son kullanma tarihi saklanır.

---

#### Frontend — `apps/sellercentral/src/`

**Yeni dosya: `components/SellerCreditCardSection.jsx`**
- Stripe.js'i CDN'den yükler (`https://js.stripe.com/v3/`)
- Mevcut kartı gösterir (marka + `**** last4` + son kullanma)
- "Hinzufügen / Ändern" butonu ile Stripe Elements kart formu açar
- SetupIntent akışını yürütür: `stripe.confirmCardSetup()` → backend'e PM ID gönderir
- "Entfernen" ile kartı siler
- `title` ve `subtitle` prop'ları ile sayfalara özel metin gösterilir

**Güncellenen dosyalar:**

| Dosya | Değişiklik |
|---|---|
| `components/pages/settings/VerificationSettingsPage.jsx` | Doğrulama formunda "Gönder" butonunun hemen üstüne `SellerCreditCardSection` eklendi (3 dilde etiket desteği: DE/TR/EN) |
| `app/[locale]/settings/payments/page.jsx` | IBAN bölümünün altına `SellerCreditCardSection` eklendi |
| `components/pages/SellerDetailPage.jsx` | "Firmendaten" sekmesine `AdminSellerCardSection` bileşeni eklendi — süperkullanıcı satıcı kartını görür ve silebilir |
| `lib/medusa-admin-client.js` | 7 yeni istemci metodu eklendi: `getStripePublishableKey`, `getSellerCard`, `deleteSellerCard`, `createSellerCardSetupIntent`, `confirmSellerCard`, `getSellerCardByAdmin`, `deleteSellerCardByAdmin` |

---

### 2. Bestseller Karussell — Landing Page Container

**Amaç:** Landing page editöründe "Bestseller Karussell" adlı yeni bir konteyner tipi oluşturuldu. Seçilen kategorideki en çok satan ürünleri sıralı biçimde gösterir.

#### `apps/shop/src/components/landing/LandingContainers.jsx`
- `BestsellerCarousel` bileşeni eklendi
- `/api/store-products?category=...&limit=50` üzerinden ürün çeker
- `toSalesScore()` ile sıralar, en yüksek satışlıdan başlar
- Her kart üzerinde Bestseller etiketi + sıra numarası (`#1`, `#2`…) gösterir
- "Mehr anzeigen" → ilgili kategori sayfasına `?sort=bestseller` ile yönlendirir
- Mobil grid/row layout desteği

#### `apps/sellercentral/src/components/pages/content/LandingPageEditor.jsx`
- `BestsellerCarouselEditor` bileşeni eklendi (kategori seçici, başlık, satır başı ürün sayısı, boşluk, mobil düzen ayarları)
- `getContainerTypes()` fonksiyonuna DE/TR dil desteğiyle yeni tip eklendi
- `newContainer()` ve `renderContainer()` switch'lerine `bestseller_carousel` case'i eklendi

---

### 3. AGB Sayfası Yönlendirme Sorunu Düzeltmesi

**Sorun:** Menüde "AGB" linkine tıklandığında shop ana sayfasına yönlendiriyordu.

**Kök Neden:** `[handle]/page.jsx` içindeki CMS sayfa sorgusu `process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL` adresini tarayıcı tarafından çağırıyordu — bu URL CORS veya iç ağ kısıtlamaları nedeniyle erişilemezdi.

#### Yeni dosyalar:
- `apps/shop/src/app/api/store-pages/route.js` — tüm yayınlanmış sayfaları listeleyen proxy
- `apps/shop/src/app/api/store-pages/[slug]/route.js` — tek sayfa getiren proxy

#### Güncellenen dosyalar:
- `apps/shop/src/lib/medusa-client.js` — `getPageBySlug()` proxy rotasını kullanacak şekilde güncellendi
- `apps/shop/src/app/[locale]/[handle]/page.jsx` — CMS fallback proxy üzerinden çalışır hale getirildi

---

### 4. Made in Europe Badge — Kategori/Koleksiyon Sayfalarında Gösterim

**Sorun:** Badge yalnızca ürün detay sayfasında görünüyordu, kategori ve koleksiyon kartlarında yoktu.

#### `apps/shop/src/components/ProductCard.jsx`
- `MadeInEuropeOverlay` ve `isEuOriginVerified` import'ları eklendi
- `isEuOrigin = isEuOriginVerified(product.metadata)` hesaplanıp `ImgBlock` içine overlay yerleştirildi

---

### 5. Made in Europe Badge — Taşma Sorunu Düzeltmesi

**Sorun:** Ürün detay sayfasında badge'e offset verildiğinde `MainImageWrap`'in `overflow: hidden` özelliği badge'i kırpıyordu.

#### `apps/shop/src/components/templates/ProductTemplate.jsx`
#### `apps/shop/src/components/templates/ProductTemplateMobile.jsx`
- `MadeInEuropeOverlay` `MainImageWrap` dışına taşındı; üst `position: relative` container içine alındı
- Badge artık görselin dışına %5 taşabilir (`translateY(5%)`)

#### `apps/shop/src/components/MadeInEuropeOverlay.jsx`
- Varsayılan offset: `offset_left: 0`, `offset_bottom: 0`
- `ShopStylesContext`'ten badge konfigürasyonu çeker

---

### 6. Bestseller — Kategori Bazlı Hesaplama

**Sorun:** Tüm ürünler bestseller etiketi alıyordu (statik metadata bayrağı).

**Çözüm:** Her kategori/koleksiyon listesi kendi içinde değerlendirilir; listedeki en yüksek satış skorlu tek ürün bestseller olarak işaretlenir.

#### `apps/shop/src/components/ProductGrid.jsx`
- `toSalesScore()` ile her liste render'ında en yüksek skorlu ürün belirlenir
- Yalnızca o ürüne `isBestseller={true}` prop'u geçilir

#### `apps/shop/src/lib/catalog-listing.js`
- `SORT_OPTIONS`'a `{ value: "bestseller", label: "Bestseller" }` eklendi
- `applyCatalogSort()`'a bestseller sıralama mantığı eklendi

#### `apps/shop/src/components/templates/CategoryTemplate.jsx`
- `useSearchParams` hook'u eklendi; URL'deki `?sort=bestseller` parametresi başlangıç sort değeri olarak okunur

---

### 7. SKU & EAN Alanı Düzeltmesi

**Dosya:** `apps/sellercentral/src/components/pages/products/VariantEditPage.jsx`

- "SKU & EAN" başlığı kaldırıldı
- Her iki alandaki `labelHidden` prop'u kaldırıldı; etiketler yan yana görünür hale getirildi
