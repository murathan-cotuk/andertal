# Değişiklik Raporu

---

## 14.06.2026

---

### 1. EAN Deduplication — Ürün İmport Sorunu

**Dosya:** `apps/medusa-backend/server.js` → `adminHubProductsPOST` (~satır 4128–4184)

**Eskiden:**
Seller Excel ile ürün yüklerken EAN zaten veritabanında varsa `"EAN already exists"` hatası alıyor, 0 ürün oluşturuluyordu. Ürünler superuser envanterinde görünüyor ama seller'ın envanterinde görünmüyordu.

**Artık:**
- Yüklenen EAN veritabanında mevcutsa hata verilmez, seller `admin_hub_seller_listings` tablosuna listeleme olarak eklenir.
- EAN araması artık `listAdminHubProductsDb` yerine doğrudan PostgreSQL `REGEXP_REPLACE` sorgusuyla yapılıyor (daha güvenilir).
- Veriler aynıysa sessizce listeleme oluşur, farklıysa superuser'a değişiklik bildirimi gider.
- Safety net fallback da aynı şekilde doğrudan SQL'e alındı.

---

### 2. Superuser Ürün Sayfasında shop_name Hatası

**Dosya:** `apps/medusa-backend/server.js` → `adminHubProductByIdGET` (~satır 4512)

**Eskiden:**
`seller_users` tablosunda `shop_name` kolonu olmadığı için `seller_listings` her zaman boş dönüyordu. Ürün detayında hangi satıcıların listelediği görünmüyordu.

**Artık:**
`COALESCE(su.store_name, su.shop_name) AS shop_name` kullanılıyor. Doğru kolon okunuyor, ürün sayfasında satıcı listesi görünüyor.

---

### 3. Superuser Envanter Sayfasında Master Ürün Görünümü

**Dosya:** `apps/sellercentral/src/components/pages/InventoryPage.jsx`

**Eskiden:**
Seller_id'si `NULL` olan master ürünler (EAN ile eklenen) superuser'ın kendi ürünleri arasında görünüyordu, hangi satıcıya ait olduğu belli değildi.

**Artık:**
`GET /admin-hub/product-listings-map` endpoint'i çekilip `productListingsMap` state'ine alınıyor. Master ürünler, onları listeleyen ilk satıcının grubu altında gösteriliyor.

---

### 4. BuyBox Tie-Breaker Düzeltmesi

**Dosya:** `apps/medusa-backend/server.js` → `storeProductByIdFromAdminHubGET` (~satır 7071)

**Eskiden:**
```js
scored.sort((a, b) => b.score - a.score)
```
Score'lar eşit olduğunda son eklenen satıcı kazanıyordu (JavaScript sort kararsız).

**Artık:**
```js
scored.sort((a, b) => {
  const diff = b.score - a.score
  if (diff !== 0) return diff
  return new Date(a.p.created_at || 0) - new Date(b.p.created_at || 0)
})
```
Score eşitliğinde ilk listeleyen satıcı BuyBox'ı kazanır.

---

### 5. Kupon Kodu UUID Cast Hatası

**Dosya:** `apps/medusa-backend/server.js` → `resolveCartCouponDiscountSync` (~satır 7309)

**Eskiden:**
```sql
WHERE product_id = ANY($1::varchar[])
```
`product_id` kolonu UUID tipinde, `::varchar[]` cast'i sessizce başarısız oluyordu. `sellersViaListings` her zaman boş dönüyordu. Satıcıya özgü kuponlar `"Ungültiger oder abgelaufener Coupon-Code"` hatası veriyordu.

**Artık:**
```sql
WHERE product_id::text = ANY($1::text[])
```
UUID → text dönüşümü doğru çalışıyor, satıcı kuponları geçerli tanınıyor.

---

### 6. Sipariş Onay Sayfası Eksikti

**Dosya:** `apps/shop/src/app/[locale]/checkout/page.jsx` (satır 1082 ve 1617)

**Eskiden:**
```js
router.push(`/${locale}/order/${orderId}`)
```
Ödeme tamamlandıktan sonra doğrudan sipariş detay sayfasına yönlendiriliyordu, yeşil onay banner'ı ve teşekkür mesajı görünmüyordu.

**Artık:**
```js
router.push(`/${locale}/order/${orderId}?confirmed=1`)
```
Sipariş detay sayfası `?confirmed=1` parametresini görünce yeşil tik, "Vielen Dank für Ihre Bestellung!" mesajı ve e-posta bildirimi gösteriyor.

---

### 7. Versendet Durumunda Yanlış Abgeschlossen

**Dosya:** `apps/sellercentral/src/components/pages/OrderDetailPage.jsx` (satır 134, 138)

**Eskiden:**
```js
// Yanlış: versendet + bezahlt → abgeschlossen
if ((val === "zugestellt" || val === "versendet") && paymentStatus === "bezahlt") setOrderStatus("abgeschlossen")
if (val === "bezahlt" && (deliveryStatus === "zugestellt" || deliveryStatus === "versendet")) setOrderStatus("abgeschlossen")
```
Lieferstatus `versendet` yapılıp Zahlungsstatus `bezahlt` iken sipariş `abgeschlossen` oluyordu.

**Artık:**
```js
// Doğru: yalnızca zugestellt + bezahlt → abgeschlossen
if (val === "zugestellt" && paymentStatus === "bezahlt") setOrderStatus("abgeschlossen")
if (val === "bezahlt" && deliveryStatus === "zugestellt") setOrderStatus("abgeschlossen")
```
Sipariş yalnızca `zugestellt + bezahlt` kombinasyonunda `abgeschlossen` oluyor.

---

### 8. Tracking Numarası Girilince Lieferstatus Otomatik Versendet

**Dosya:** `apps/medusa-backend/server.js` → `adminHubOrderPATCH` (~satır 11652)

**Eskiden:**
Tracking numarası girildiğinde yalnızca bir "Paket wurde versendet" shipment event'i oluşturuluyordu. `delivery_status` alanı otomatik olarak değişmiyordu, satıcının ayrıca elle `versendet` seçmesi gerekiyordu.

**Artık:**
```js
if (trackingChanged && !['versendet','zugestellt','shipped','delivered'].includes(prevRow.delivery_status)) {
  await client.query(
    `UPDATE store_orders SET delivery_status='versendet' WHERE id=$1::uuid AND delivery_status NOT IN (...)`,
    [id]
  )
}
```
Tracking numarası ilk girildiğinde `delivery_status` otomatik olarak `versendet` oluyor.

---

### 9. DPD, GLS ve UPS Kargo Takip Desteği

**Dosya:** `apps/medusa-backend/server.js` → `adminHubOrderRefreshTrackingPOST` (~satır 12624)  
**Dosya:** `apps/medusa-backend/server.js` → `runAutoTrackingRefresh` (~satır 18979)

**Eskiden:**
- Manuel "Tracking yenile" butonu ve arka plan otomatik yenileme (3 saatte bir) yalnızca DHL'i destekliyordu.
- DPD, GLS, UPS siparişleri için `"Automatischer API-Abruf für diesen Versanddienst ist noch nicht angebunden."` mesajı dönüyordu.
- Yalnızca "Paket wurde versendet" başlangıç event'i görünüyordu, sonraki kargo güncellemeleri yansımıyordu.

**Artık:**

| Carrier | API | Kimlik Bilgisi |
|---------|-----|----------------|
| DHL | `api-eu.dhl.com` | DHL API Key (mevcut) |
| DPD | `tracking.dpd.de` (public REST) | Gerekmez |
| GLS | `gls-group.com` (public REST) | Gerekmez |
| UPS | `onlinetools.ups.com` (OAuth2) | Client-ID + Secret (Einstellungen → Versand) |

- DPD ve GLS için API anahtarı gerekmez, tracking otomatik çalışır.
- UPS için Versanddienstleister ayarlarına Client-ID (api_key) ve Client-Secret (api_secret) girilmesi yeterli.
- Arka plan otomatik yenileme artık DHL + DPD + GLS'i kapsamakta (UPS OAuth2 gerektirdiği için arka planda çalışmaz, manuel refresh gerekir).
- Status eşleştirmesi: `zugestellt`, `versendet`, `in_transit` olarak normalize edilip DB'ye yazılıyor.

---

### 10. Sepet — Stale Cart ve Sidebar Bug Düzeltmesi

**Dosya:** `apps/shop/src/lib/medusa-client.js` (satır 172)  
**Dosya:** `apps/shop/src/context/CartContext.jsx` (~satır 85)

**Eskiden:**
```js
// medusa-client.js
if (res?.__error) return { cart: null }
// CartContext.jsx — addToCart başarısız olsa bile fetchCart çağrılıyordu
const refreshed = await fetchCart(c.id)
if (refreshed) { setCart(refreshed); return refreshed }  // truthy → sidebar açılıyordu!
```
`addToCart` backend hatası alınca (500/404) `fetchCart` ile eski cart çekiliyordu. Eski cart truthy döndüğü için sidebar açılıyordu ama ürün eklenmemişti.

Ayrıca checkout sonrası cart ID localStorage'dan siliniyordu; tekrar ürün eklemeye çalışınca 404 alınıp sessizce başarısız oluyordu.

**Artık:**
```js
// medusa-client.js — hata bilgisi iletiliyor
if (res?.__error) return { cart: null, __error: true, status: res.status }

// CartContext.jsx — stale cart otomatik yenileniyor, hata durumunda sidebar açılmıyor
if (res?.__error && res?.status === 404) {
  // localStorage temizle, yeni cart oluştur, tekrar dene
  window.localStorage.removeItem(CART_ID_KEY)
  setCart(null)
  c = await createCart()
  res = await client.addToCart(c.id, variantId, quantity, sellerId)
}
if (res?.__error) return null  // kesin hata → sidebar açılmaz
```
- 404 (cart bulunamadı): yeni cart oluşturulur, ürün tekrar eklenir.
- Diğer hatalar: `null` döner, sidebar açılmaz, hata notice gösterilir.

---

---

### 11. CMS Page — "Etwas ist schiefgelaufen" Hatası

**Dosya:** `apps/shop/src/app/api/store-pages/[slug]/route.js` (satır 7)  
**Dosya:** `apps/shop/src/components/Footer.jsx` (satır 27)  
**Dosya:** `apps/shop/src/app/[locale]/[handle]/page.jsx` (satır 937)

**Eskiden:**
Üç ayrı bug birbirine zincirleniyordu:

1. `api/store-pages/[slug]/route.js` satır 7'de Next.js 16'da `params` bir Promise olduğundan `const { slug } = params` ile `slug` her zaman `undefined` dönüyor, API her zaman 404 veriyordu.

2. `Footer.jsx`'in kendi local `menuItemHref` fonksiyonu, `link_type === "page"` için `/${pageSlug}` döndürüyordu (`/pages/` prefix'i eksikti). Footer menüsündeki page linkleri `/pages/[slug]` yerine `[handle]` rotasına gidiyordu.

3. `[handle]/page.jsx` satır 937'de `if (notFoundSt) notFound()` şeklinde bir `"use client"` bileşeninden `notFound()` çağrılıyordu. Bu throw, Next.js error boundary'lerini atlayıp doğrudan `Providers.jsx`'teki özel React class `ErrorBoundary`'e düşüyordu — "Etwas ist schiefgelaufen" ekranı çıkıyordu.

**Artık:**
```js
// 1. api/store-pages/[slug]/route.js — await eklendi
const { slug } = await params;

// 2. Footer.jsx — /pages/ prefix'i eklendi
return pageSlug ? `/pages/${pageSlug}` : "#";

// 3. [handle]/page.jsx — notFound() yerine inline 404 render
if (notFoundSt) return (
  <PageWrap>
    <ShopHeader />
    <Main>
      <div style={{ padding: "64px 32px", textAlign: "center" }}>
        <p style={{ fontSize: 15, color: "#6b7280" }}>Die Seite wurde nicht gefunden.</p>
      </div>
    </Main>
    <Footer />
  </PageWrap>
);
```

- API route artık slug'ı doğru okuyor, yayınlanmış sayfalar döndürülüyor.
- Footer menüsündeki page linkleri artık `/pages/[slug]` rotasına gidiyor.
- Bulunamayan handle'lar artık ErrorBoundary'ye düşmek yerine nazikçe "Die Seite wurde nicht gefunden." gösteriyor.

---

### 12. Geolocation Düzeltmesi — EN Locale → DE Market

**Dosya:** `apps/shop/src/lib/shop-market.js`

**Eskiden:**
`defaultMarketForLocale("en")` → `"gb"` döndürüyordu. İngilizce tarayıcıyla Almanya'dan giren kullanıcılar GB/GB market'e düşüyordu.

**Artık:**
```js
if (l === "en") return "de";  // eskiden: return "gb"
```
İngilizce locale → DE market'e yönlendiriyor.

---

### 13. Brands Sayfası — Yeni Markalar Görünmüyor

**Dosya:** `apps/medusa-backend/server.js` → `/store/brands` endpoint

**Eskiden:**
Tüm yayınlanmış ürünler çekilip `visibleBrandIds` Set'i oluşturuluyordu. Yalnızca bu Set'teki markalar gösteriliyordu. Ürünü olmayan yeni eklenen markalar hiç görünmüyordu.

**Artık:**
`visibleBrandIds` filtresi tamamen kaldırıldı. `handle` alanı dolu tüm markalar listeleniyor.

---

### 14. Shop Breadcrumb — "Koleksiyon" Yerine Kategori

**Dosya:** `apps/shop/src/components/templates/ProductTemplate.jsx` (~satır 1448)  
**Dosya:** `apps/shop/src/components/templates/ProductTemplateMobile.jsx` (~satır 1488)

**Eskiden:**
Ürünün bir kategorisi yoksa breadcrumb `product.collection.title` değerini (genellikle "Koleksiyon") gösteriyordu.

**Artık:**
Collection'a dayalı breadcrumb tamamen kaldırıldı. Breadcrumb yalnızca: Home → kategori ataları → güncel kategori → ürün başlığı şeklinde oluşuyor.

---

### 15. Bestseller Badge — Tüm Product Card'larda

**Dosya:** `apps/shop/src/components/ProductGrid.jsx`

**Eskiden:**
Grid içindeki yalnızca en yüksek `sales_score`'lu tek ürün bestseller badge'i alıyordu.

**Artık:**
`isBestsellerMetadata(p.metadata) || p.id === bestsellerProductId` kontrolü yapılıyor. `metadata.is_bestseller === true` veya `metadata.badge === "bestseller"` olan tüm ürünler badge alıyor.

---

### 16. EAN Koruması — İkinci Satıcı Kilitlemesi

**Dosya:** `apps/sellercentral/src/components/pages/products/ProductEditPage.jsx`

**Eskiden:**
İkinci satıcı (ürünü ilk o listelemeyen seller) ProductEditPage'de EAN alanını düzenleyebiliyordu.

**Artık:**
- `currentSellerId` localStorage'dan okunuyor.
- `isSecondSeller` türetiliyor: superuser değilse, yeni ürün değilse ve `product.metadata.seller_id !== currentSellerId` ise `true`.
- EAN TextField `disabled={isSecondSeller}`, üzerinde `🔒` suffix ve `"(gesperrt — nur Erstanbieter kann ändern)"` label ek notu gösteriliyor.

---

### 17. Bestseller Carousel — Kategori Hiyerarşi Seçici

**Dosya:** `apps/sellercentral/src/components/pages/content/LandingPageEditor.jsx` → `BestsellerCarouselEditor`

**Eskiden:**
Kategori seçimi düz `<Select>` dropdown ile yapılıyordu; hiyerarşi boşluk (non-breaking space) ile ifade ediliyordu. Üst/alt kategori ilişkisi belirsizdi.

**Artık:**
`CategoryDrilldownSelect` bileşeni kullanılıyor. Arama, breadcrumb yolu ve drilldown navigasyonu mevcut. Eski verilerle uyumluluk için `category_slug` → `category_id` dönüşümü otomatik yapılıyor; konteyner artık her ikisini de saklıyor (`category_id` + `category_slug`).

---

---

### 18. Shop URL Prefix Kaldırma — `/pages/` ve `/produkt/`

**Dosya:** `apps/shop/src/lib/shop-menu-href.js`  
**Dosya:** `apps/shop/src/components/Footer.jsx`  
**Dosya:** `apps/shop/src/app/[locale]/[handle]/page.jsx`

**Eskiden:**
- Menü/footer'daki "page" tipi linkler `/pages/[slug]` formatında oluşturuluyordu.
- Menü/footer'daki "product" tipi linkler `/produkt/[slug]` formatında oluşturuluyordu.
- `[handle]` catch-all route'u ürünleri tanımıyordu — ürün slug'ı girilince 404 veriyordu.

**Artık:**
- `shop-menu-href.js` ve `Footer.jsx`'teki yerel `menuItemHref`: `page` → `/${slug}`, `product` → `/${slug}`.
- `[handle]/page.jsx`'e son fallback olarak ürün lookup adımı eklendi (`/api/store-products/[handle]`). Kategori → koleksiyon → CMS sayfası → kategori ağacı araması sonrasında ürün bulunursa `ProductTemplate` / `ProductTemplateMobile` gösteriliyor.
- CMS sayfaları zaten `[handle]` route'undan erişilebiliyordu, artık linkler de `/[slug]` formatında oluşturuluyor.

---

### 19. Kupon Sayfası — Superuser Satıcı Kategorilendirmesi

**Dosya:** `apps/sellercentral/src/components/pages/CouponsPage.jsx`

**Eskiden:**
Superuser "Verkäufer-Coupons" bölümünde tüm satıcı kuponları düz liste olarak görünüyordu. Hangi kuponun kime ait olduğu yalnızca "Verkäufer: ..." yazısından anlaşılıyordu.

**Artık:**
Kuponlar `seller_id`'ye göre gruplanıyor. Her satıcı kendi başlığı (isim + kupon sayısı) altında listeleniyor. Satıcı adı `sellerNameById` map'inden çözümleniyor.

---

### 20. Kampanya Sistemi — Stripe Ödeme Adımı

**Dosya:** `apps/medusa-backend/server.js` → `POST /admin-hub/v1/campaigns/:id/checkout`  
**Dosya:** `apps/medusa-backend/server.js` → `/webhook/stripe` — `checkout.session.completed`  
**Dosya:** `apps/sellercentral/src/lib/medusa-admin-client.js` → `createCampaignCheckout()`  
**Dosya:** `apps/sellercentral/src/components/pages/marketing/MarketingPpcCampaignEditorPage.jsx`

**Eskiden:**
Seller kampanya oluştururken Stripe ödeme adımı yoktu. Kampanya direkt superuser'a düşüyordu, `stripe_charge_id` kolonu boş kalıyordu.

**Artık:**

**Backend:**
- `POST /admin-hub/v1/campaigns/:id/checkout`: Platform Stripe anahtarıyla Stripe Checkout Session oluşturuyor. Tutar: `budget_daily_cents × 30` (30 günlük ön ödeme). Session metadata'sına `type: 'campaign_budget'` ve `campaign_id` yazılıyor.
- Webhook `checkout.session.completed`: `type === 'campaign_budget'` ise `seller_campaigns.stripe_charge_id` güncelleniyor, superuser'a `campaign_paid` bildirimi gönderiliyor.

**Frontend:**
- Kampanya editöründe "Speichern" yanına "Bezahlen & einreichen" butonu eklendi (yalnızca seller görür).
- Butona tıklandığında form önce kaydediliyor, ardından Stripe Checkout'a yönlendiriliyor.
- Stripe'tan dönerken `?payment=success` veya `?payment=cancelled` parametresine göre banner gösteriliyor.
- Alt bilgi olarak 30 günlük toplam tutar dinamik hesaplanıp gösteriliyor.

Google Ads + Meta dağıtımı (publish/pause/resume) zaten önceki sürümlerde uygulanmıştı.

---

## Bekleyen / Henüz Yapılmayan

*(Tüm maddeler tamamlandı.)*
