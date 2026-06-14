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

## Bekleyen / Henüz Yapılmayan

- Shop URL sorunu (`/produkt/`, `/pages/` prefix'leri kaldırılmadı)
- Geolocation GB/GB → DE/DE (Almanya'dan açılınca yanlış locale)
- `/brands` sayfasında son eklenen marka görünmüyor
- Shop breadcrumbs (kategori yerine "Koleksiyon" yazıyor)
- Bestseller badge tüm product card'larda (category, search, menu)
- Bestseller carousel kategori dropdown hiyerarşisi
- Excel `per_unit` alanı eklenmesi
- Ürün koruma: EAN immutable, ilk satıcı düzenleme hakkı, değişiklik önerileri + kırmızı badge
- İkinci satıcı aynı EAN'i eklerken seller-specific alanlar boş gelmeli, save düzelmeli
- Shopta "Other Sellers (N)" accordion (fiyat + yıldız)
- Kupon sayfası superuser kategorilendirmesi
- Kampanya sistemi (Stripe + Google Ads / Meta dağıtım)
- Sellercentralde takip numarasının girilebildiği yer — hangi alanda, hangi UI component'ta olduğu doğrulanmadı
