# Backend Refactor Planı — server.js → Modüler Yapı

> **Durum:** Hazır, onay bekleniyor  
> **Hedef dosya:** `apps/medusa-backend/server.js` — 23.695 satır  
> **Son güncelleme:** 2026-07-02

---

## Mimari Talimatlar (Bundan Sonraki Her Geliştirme İçin)

Bu talimatlar kalıcıdır. Yeni bir route, servis veya utility yazılacaksa bu kurallara uyulacak.

### Genel Kural: Her Şey `src/` Altında

```
apps/medusa-backend/
  server.js              ← sadece bootstrap + mount (maks. 300 satır)
  src/
    context.js           ← paylaşılan state (db, stripe, helpers) — TEK kaynak
    middleware/
      auth.js            ← requireSellerAuth, requireSuperuser, requireCustomerAuth
      rate-limit.js      ← tüm limiterlar
    routes/
      auth.js            ← /admin-hub/auth/*
      products.js        ← /admin-hub/products/*
      orders.js          ← /admin-hub/v1/orders/* + /store/orders/*
      ...
    services/
      email.js           ← (ZATen var: src/email.js — taşınmaz, kalır)
      stripe.js          ← stripe client + helper fn'ler
      pdf.js             ← (ZATen var: src/order-pdf-*.js — kalır)
    utils/
      db.js              ← withClient, getAdminHubDbClient vb.
```

### Route Dosyası Şablonu

Her `src/routes/*.js` dosyası bu formatı kullanır:

```js
const { Router } = require('express')

/**
 * @param {import('../context').AppContext} ctx
 * @returns {Router}
 */
module.exports = function createXxxRouter(ctx) {
  const router = Router()
  const { db, stripe, auth, dispatch } = ctx

  router.get('/some-path', auth.requireSeller, async (req, res) => {
    // handler buraya
  })

  return router
}
```

`server.js` içinde mount:
```js
const createXxxRouter = require('./src/routes/xxx')
httpApp.use('/', createXxxRouter(ctx))
```

### Yasak Pratikler

- `server.js`'e yeni route ekleme — her yeni endpoint kendi route dosyasına gider
- Route dosyası içinde `require('stripe')` ya da `new Pool()` çağırma — context'ten al
- Handler içinde e-posta HTML'i inline yazma — `src/services/email.js`'e taşı
- 500 satırı geçen route dosyası — daha küçük parçalara böl

---

## Mevcut Durum Analizi

### Test Coverage

| Alan | Durum |
|------|-------|
| Route handler testleri | **YOK** — sıfır coverage |
| `src/eu-origin/metadata.test.js` | Var (utility testi) |
| `src/media-filename.test.js` | Var (utility testi) |
| `tests/region-product-integration.test.md` | Manuel test notu (çalışmaz) |

**Sonuç:** Route'lar için otomatik test yok. Bu yüzden refactor sırasında her aşamada **manuel smoke test** yapılacak.

### Zaten Ayrılmış Modüller (Dokunma)

Bunlar `server.js`'den zaten import ediliyor, iyi durumda:

- `src/email.js`, `src/email-providers.js`
- `src/smtp-sender-resolve.js`
- `src/order-money.js`
- `src/order-pdf-buffers.js`, `src/order-pdf-layout.js`, `src/order-pdf-i18n.js`
- `src/flow-automation.js`, `src/flow-queue.js`
- `src/redis.js`
- `src/eu-origin/` (tam klasör)
- `src/media-filename.js`
- `src/category-auto-translate.js`
- `src/logger.js`

### Route Haritası (Satır → Domain)

| Satır Aralığı | Domain | Route Sayısı |
|---------------|--------|-------------|
| 2418–2450 | categories (admin) | 6 |
| 2490–2545 | products (admin medusa) | 3 |
| 2542–3050 | orders (admin medusa) + collections | ~15 |
| 2739–3050 | collections | 5 |
| 3173–3190 | brands | 4 |
| 3189–3230 | banners | 4 |
| 3297–3560 | metafield-definitions | 6 |
| 3884–3935 | menus + menu-items | 9 |
| 5145–5450 | products (admin-hub) | 10 |
| 5443–6210 | seller-settings, seller-profile | 5 |
| 6203–6215 | auth (seller) | 9 |
| 6210–6215 | users (superuser) | 5 |
| 6442–6490 | platform-checkout, stripe-payment-methods | 5 |
| 7368–8160 | store/products, store/brands | 5 |
| 8158–10570 | carts + line-items | 8 |
| 10567–10640 | payments (payment-intent) | 3 |
| 10569–11000 | store/orders | 6 |
| 10634–10750 | store/collections | 2 |
| 10749–10975 | store/categories | 2 |
| 10972–11560 | store/menus, store/pages (by label-slug) | 3 |
| 11549–11560 | media | 10 |
| 14100–14110 | integrations/sendcloud | 3 |
| 14684–14700 | customers (store) + auth/token | 9 |
| 14701–14710 | shipping-groups | 5 |
| 14709–14715 | reviews | 5 |
| 14715–14840 | orders (admin-hub v1) + shipment-events + labels | 20 |
| 14818–14830 | shipping-carriers | 4 |
| 14825–14840 | integrations (billbee, trustpilot, generic) | 12 |
| 14925–14930 | billbee marketplace connection | 2 |
| 14928–14995 | abandoned-carts | 1 |
| 14991–15000 | returns | 4 |
| 15135–15185 | pages (admin+store) | 7 |
| 15329–15390 | landing-page | 6 |
| 15483–15520 | styles + trustpilot-config | 4 |
| 17124–17180 | notifications + messages + smtp | 17 |
| 18537–18760 | flows + flow-execution-logs | 12 |
| 20783–20820 | transactions + coupons + commission-invoices + payouts | 12 |
| 20798–20820 | seller-account (iban, password, profile, locations) | 9 |
| 20806–20820 | seller-errors + invites/subusers | 8 |
| 20824–20895 | product-groups | 5 |
| 20917–21340 | campaigns | 10 |
| 21389–21440 | automations + marketing-accounts | 4 |
| 21555–21610 | store/campaigns/discount | 1 |
| 21606–21700 | seller-listings + product-change-requests | 6 |
| 22136–22165 | sellers (superuser admin) | 6 |
| 22161–22560 | verification | 3 |
| 22558–22800 | signing (seller agreement) | 5 |
| 22792–23110 | stripe-connect | 5 |
| 23113–23260 | seller-card + superuser-card | 8 |
| 23301–23365 | webhook/sendcloud | 1 |
| 23359–24215 | webhook/stripe (Stripe olayları) | 1 (büyük) |
| 24214–24460 | newsletter | 6 |
| 24451–24457 | ranking | 5 |

**Toplam:** ~50 bağımsız domain, ~300+ route

---

## Aşama 0 — Önkoşul: Paylaşılan Context Modülü

**Bu yapılmadan hiçbir route dosyası çıkarılamaz.**

`server.js` içinde route handler'ların büyük çoğunluğu şu shared nesnelere closure ile erişiyor:

- `pgPool` / `getAdminHubDbClient()` / `getSellerDbClient()` — PostgreSQL bağlantısı
- `stripe` — Stripe client (STRIPE_SECRET_KEY ile init)
- `withClient(getClient, fn)` — db transaction yardımcısı
- `requireSuperuser` / `requireSellerAuth` / `requireCustomerAuth` — auth middleware
- `dispatchOrderFlowEvent` / `dispatchCustomerFlowEvent` — flow tetikleyici
- `logSellerError` — hata loglama
- JWT sign/verify

### Yapılacak: `src/context.js`

Bu dosya bir `ctx` objesi export eder. `server.js` bu objeyi bir kez oluşturur ve tüm router factory'lerine argüman olarak geçer.

```js
// src/context.js
// AppContext tipini jsdoc ile tanımla — TypeScript'e geçilirse burası değişir
/**
 * @typedef {Object} AppContext
 * @property {{ adminHub: Function, seller: Function }} db
 * @property {import('stripe').Stripe} stripe
 * @property {Function} withClient
 * @property {{ requireSeller: Function, requireSuperuser: Function, requireCustomer: Function }} auth
 * @property {{ order: Function, customer: Function }} dispatch
 * @property {Function} logSellerError
 */
```

---

## Aşama 1 — En Bağımsız Route'lar (Düşük Risk)

Bu domain'lerdeki handler'lar minimal dış bağımlılık kullanır. Başlangıç noktası bunlar olmalı.

### 1-A: `src/routes/categories.js`
- Satırlar: ~2418–2450
- Routes: `GET/POST /admin-hub/categories`, `GET/PUT/DELETE /admin-hub/categories/:id`, `/admin-hub/v1/categories/*`
- Bağımlılık: `withClient(getAdminHubDbClient)`, `requireSuperuser`

### 1-B: `src/routes/brands.js`
- Satırlar: ~3173–3190
- Routes: `GET/POST /admin-hub/brands`, `PATCH/DELETE /admin-hub/brands/:id`
- Bağımlılık: `withClient(getAdminHubDbClient)`

### 1-C: `src/routes/banners.js`
- Satırlar: ~3189–3230
- Routes: `GET/POST /admin-hub/v1/banners`, `PUT/DELETE /admin-hub/v1/banners/:id`
- Bağımlılık: `withClient`, `requireSuperuser`

### 1-D: `src/routes/metafield-definitions.js`
- Satırlar: ~3297–3560
- Routes: 6 endpoint, metafield CRUD + pending/approve/reject
- Bağımlılık: `withClient(getAdminHubDbClient)`, `requireSuperuser`

### 1-E: `src/routes/styles.js`
- Satırlar: ~15483–15520
- Routes: `GET/PUT /admin-hub/styles`, `GET /store/styles`, `GET /store/trustpilot-config`
- Bağımlılık: `withClient`

---

## Aşama 2 — Orta Karmaşıklık

### 2-A: `src/routes/menus.js`
- Satırlar: ~3884–3935
- Routes: menus CRUD + menu-items CRUD + menu-locations

### 2-B: `src/routes/collections.js`
- Satırlar: ~2739–3050
- Routes: `/admin/collections/*` + `/admin-hub/collections/*`

### 2-C: `src/routes/pages.js`
- Satırlar: ~15135–15185
- Routes: admin pages CRUD + `/store/pages/*`

### 2-D: `src/routes/landing-page.js`
- Satırlar: ~15329–15390

### 2-E: `src/routes/media.js`
- Satırlar: ~11549–11560
- Dikkat: `multer` upload middleware `prepareSellerMediaUploadPath` da context'e taşınacak

### 2-F: `src/routes/newsletter.js`
- Satırlar: ~24214–24460
- Routes: store subscribe/unsubscribe + admin CRUD

### 2-G: `src/routes/reviews.js`
- Satırlar: ~14709–14715
- Routes: store + admin reviews

### 2-H: `src/routes/shipping-groups.js`
- Satırlar: ~14701–14710

### 2-I: `src/routes/shipping-carriers.js`
- Satırlar: ~14818–14830

---

## Aşama 3 — Auth ve Seller (Yüksek Önem)

### 3-A: `src/routes/auth.js`
- Satırlar: ~6203–6215
- Routes: register, login, me, 2FA setup/verify/disable
- Dikkat: `validatePasswordStrength`, JWT sign/verify, `notifySuperusersNewSeller` — bunlar context üzerinden veya kendi yardımcı fonksiyonları olarak gelmeli

### 3-B: `src/routes/users.js`
- Satırlar: ~6210–6215
- Routes: superuser user CRUD, invite, subusers

### 3-C: `src/routes/seller-settings.js`
- Satırlar: ~5635–6200
- Routes: `GET/PATCH /admin-hub/seller-settings`, seller profile

### 3-D: `src/routes/seller-account.js`
- Satırlar: ~20798–20820
- Routes: iban, password, profile, locations, account, seller-errors

### 3-E: `src/routes/sellers-admin.js`
- Satırlar: ~22136–22165
- Routes: superuser seller listing, by-id, approve, impersonate

---

## Aşama 4 — Ürün ve Katalog

### 4-A: `src/routes/products-adminhub.js`
- Satırlar: ~5145–5450
- Routes: admin-hub ürün CRUD, EAN lookup, listings-map, variants, bulk-import

### 4-B: `src/routes/products-store.js`
- Satırlar: ~7368–8160
- Routes: `/store/products`, `/store/products/:id`, `/store/brands/*`, `/store/approved-seller-ids`

### 4-C: `src/routes/categories-store.js`
- Satırlar: ~10749+

### 4-D: `src/routes/collections-store.js`
- Satırlar: ~10634–10750

### 4-E: `src/routes/ranking.js`
- Satırlar: ~24451–24457
- Routes: `/store/products/ranked`, `/store/events`, `/admin-hub/v1/ranking/*`

---

## Aşama 5 — Sepet ve Ödeme

### 5-A: `src/routes/carts.js`
- Satırlar: ~8158–10570
- **En büyük ve en kritik domain** (~2400 satır) — sepet mantığı, indirimler, bonus puan
- Dikkat: `stripe` client yoğun kullanım

### 5-B: `src/routes/payments.js`
- Satırlar: ~10567–10640
- Routes: `POST /store/payment-intent`, `GET /store/public-payment-config`
- Bağımlılık: `stripe`

### 5-C: `src/routes/stripe-connect.js`
- Satırlar: ~22792–23260
- Routes: onboard, status, dashboard-link, disconnect, transfer, seller-card endpoints
- Bağımlılık: `stripe` yoğun

---

## Aşama 6 — Sipariş ve İade

### 6-A: `src/routes/orders-store.js`
- Satırlar: ~10569–11000
- Routes: `POST /store/orders`, `GET /store/orders/me`, `GET /store/orders/:id`, cancel, return-request, invoice PDF'leri

### 6-B: `src/routes/orders-adminhub.js`
- Satırlar: ~14715–14840
- Routes: admin v1 orders CRUD, PDF'ler (invoice, lieferschein, provisionsfaktur, versandlabel, retoure), shipment-events, label/rates/checkout/fulfill

### 6-C: `src/routes/returns.js`
- Satırlar: ~14991–15000

### 6-D: `src/routes/transactions-payouts.js`
- Satırlar: ~20783–20800
- Routes: transactions, coupons, commission-invoices, payouts, payout-summary, payout-overview

---

## Aşama 7 — Müşteri ve İletişim

### 7-A: `src/routes/customers.js`
- Satırlar: ~14684–14700
- Routes: register, auth/token, me, addresses, payment-methods, wishlist, bonus-ledger, discounts

### 7-B: `src/routes/notifications.js`
- Satırlar: ~17124–17180
- Routes: notifications, messages, message-templates, store/messages, smtp-settings, smtp-senders

---

## Aşama 8 — Flow ve Kampanya

### 8-A: `src/routes/flows.js`
- Satırlar: ~18537–18760
- Routes: flows CRUD, test-email, snapshots, flow-execution-logs

### 8-B: `src/routes/campaigns.js`
- Satırlar: ~20917–21340
- Routes: campaigns CRUD, publish/pause/resume, checkout, automations, marketing-accounts, store/campaigns/discount

### 8-C: `src/routes/product-change-requests.js`
- Satırlar: ~21659–21780

### 8-D: `src/routes/seller-listings.js`
- Satırlar: ~21606–21660

### 8-E: `src/routes/product-groups.js`
- Satırlar: ~20824–20895

---

## Aşama 9 — Verification, Signing, Webhooks

### 9-A: `src/routes/verification.js`
- Satırlar: ~22161–22560
- Routes: verification/start, status, review

### 9-B: `src/routes/signing.js`
- Satırlar: ~22558–22800
- Routes: sign-token, public/sign/:token, seller/sign/:token/auth, submit, sign-status, agreement-pdf

### 9-C: `src/routes/integrations.js`
- Satırlar: ~14100–14840
- Routes: sendcloud, trustpilot, generic integrations CRUD, billbee (credentials, test, webhook, marketplace connection), platform-checkout-settings, stripe-payment-methods

### 9-D: `src/routes/webhooks.js`
- Satırlar: ~23301–24215
- **Stripe webhook** (~800 satır) — en kompleks single handler
- `webhook/sendcloud` + `webhook/stripe`
- Dikkat: `req.rawBody` doğrudan okunuyor (Stripe imza doğrulama), bu middleware sırası bozulmamalı

---

## Aşama 10 — Kalan Küçükler

### 10-A: `src/routes/platform-checkout.js`
- Satırlar: ~6442–6490
- Routes: platform-checkout-settings, stripe-payment-methods (superuser)

### 10-B: `src/middleware/auth.js`
- `requireSuperuser`, `requireSellerAuth`, `requireCustomerAuth` middleware'lerini server.js'den çıkar

### 10-C: `src/middleware/rate-limit.js`
- `authLimiter`, `registerLimiter`, `totpLimiter`, `passwordChangeLimiter`, `customerAuthLimiter`, `paymentLimiter` — hepsini buraya taşı

---

## Geri Dönüş (Rollback) Planı

Her adımdan önce git commit atılacak. Geri dönüş tek komut:

```bash
git checkout <önceki-commit-hash> -- apps/medusa-backend/server.js
```

Ayrıca her aşama başında branch oluştur:

```bash
git checkout -b refactor/server-phase-1
```

Aşama tamamlanıp test edilince:

```bash
git checkout main && git merge refactor/server-phase-1
```

Sorun çıkarsa:

```bash
git branch -D refactor/server-phase-1
# main'de değişiklik yok, sistem eski haliyle çalışıyor
```

---

## Smoke Test Kontrol Listesi (Her Aşama Sonrası)

Her route dosyası çıkarıldıktan sonra şunları test et:

```
[ ] Server başlatılabiliyor (node server.js hatasız çalışıyor)
[ ] GET /health → 200
[ ] Çıkarılan domain'in GET endpoint'i → beklenilen yanıt
[ ] Auth gerektiren endpoint → 401 döndürüyor (token olmadan)
[ ] Yanlış payload gönder → 400/422 döndürüyor (hata yakama çalışıyor)
[ ] Sellercentral'dan ilgili sayfayı aç → çalışıyor
[ ] Shop'tan ilgili sayfayı aç → çalışıyor
```

---

## Risk Değerlendirmesi

| Risk | Seviye | Önlem |
|------|--------|-------|
| Test coverage yok | Yüksek | Her aşama sonrası manuel smoke test |
| Shared state (pgPool, stripe) referans kopması | Yüksek | Phase 0 önce yapılacak: context.js |
| Middleware sırası bozulması | Orta | server.js'de mount sırası korunacak |
| Circular import | Orta | Route dosyaları context'ten alır, birbirini import etmez |
| Stripe webhook rawBody kaybı | Yüksek | webhooks.js en son çıkarılacak (Phase 9-D) |
| Üretim ortamı kesintisi | Yüksek | Aşamalı deploy: her aşama ayrı commit + test sonrası push |

---

## Sıfır Hata Garantisi

**Hayır, sıfır hata garantisi verilemez.**

Ancak bu plan bunu minimize eder:

1. **Rollback her zaman mevcut** — git history korunuyor
2. **Aşamalı ilerleme** — tek seferde tüm dosya değil, domain domain
3. **En riskli parçalar en sona** (webhook/stripe, carts, payments)
4. **Phase 0 önce** — shared state doğru çözülmezse Phase 1'e geçilmez
5. **Smoke test zorunlu** — her commit'ten sonra test, sonra devam

Yaşanabilecek en kötü senaryo: bir route handler hata verir → test sırasında fark edilir → git revert → 2 dakikada geri dönüş.

---

## Uygulama Öncesi Checklist

```
[ ] Render'da aktif deploy var mı? (deployment freeze düşün)
[ ] Son production deploy stable mi?
[ ] Local ortamda server.js çalışıyor mu? (node apps/medusa-backend/server.js)
[ ] Git working tree temiz mi? (git status)
[ ] Phase 0 (context.js) tamamlandı mı?
[ ] Başlamak için onay verildi mi?
```
