# Andertal App Platform — Geliştirme İlerlemesi

## DURUM ÖZETI (Tamamlanan)

### PR 1 + PR 2 — Backend (TAMAMLANDI ✅)

**Yeni dosyalar (`apps/medusa-backend`):**
- `src/modules/app-platform/ids.js` — ID prefix generator (`dev_`, `app_`, `apv_`, `inst_`, `tok_`, `cod_`)
- `src/modules/app-platform/crypto.js` — SHA-256 hash, timing-safe compare, generateSecret/Code
- `src/modules/app-platform/scope-registry.js` — 17 scope tanımı, SHOP_APP_ONLY_SCOPES set
- `src/modules/app-platform/manifest-validator.js` — manifest doğrulama + tier-type match kontrolü
- `src/modules/app-platform/service.js` — signDeveloperToken / verifyDeveloperToken (DEVELOPER_JWT_SECRET)
- `src/routes/developer-api.js` — `/developer-api/v1/` (signup, login, me, CRUD apps, rotate-secret, submit)
- `src/routes/app-oauth.js` — `/oauth/authorize` (HTML consent), `/oauth/token` (code + refresh), `/oauth/revoke`
- `src/routes/public-api-v1.js` — `/api/public-api/v1/` (orders, products, inventory, fulfillments + 500 req/min rate limit)
- `src/routes/app-store.js` — `/admin-hub/v1/app-store/` (apps catalog, installations CRUD)

**Güncellenen dosyalar:**
- `server.js` — 8 DB tablosu migration (CREATE TABLE IF NOT EXISTS), 4 yeni route kaydı, CORS'a `localhost:3003` eklendi, cookieParser middleware

**DB Tabloları:** `developers`, `platform_apps`, `platform_app_versions`, `platform_app_installations`, `platform_oauth_codes`, `platform_app_tokens`, `platform_app_webhook_subscriptions`, `platform_app_reviews`

### PR 3 — Developer Portal `apps/developer/` (TAMAMLANDI ✅)

**Yeni uygulama:**
- `package.json` — `@andertal/developer`, Next.js 16, port 3003
- `next.config.js` — withNextIntl, güvenlik headers
- `src/i18n/routing.js`, `src/i18n/request.js` — 6 dil (en, de, tr, fr, it, es)
- `src/messages/{en,de,tr,fr,it,es}.json` — tam çeviri
- `src/app/layout.jsx`, `src/app/[locale]/layout.jsx`
- `src/app/[locale]/page.jsx` — auth durumuna göre dashboard/login yönlendir
- `src/app/[locale]/(auth)/login/page.jsx` — giriş formu
- `src/app/[locale]/(auth)/signup/page.jsx` — kayıt formu (şirket adı, ülke, KDV, terms onayı)
- `src/app/[locale]/dashboard/page.jsx` — stats (toplam app, yayın sayısı, kurulum), son app listesi
- `src/app/[locale]/apps/page.jsx` — app listesi tablosu
- `src/app/[locale]/apps/new/page.jsx` — app oluşturma formu (tip seçimi, scopes, OAuth URL)
- `src/app/[locale]/apps/[id]/page.jsx` — app detay: OAuth credentials, manifest editor, submit
- `src/lib/api.js` — `apiFetch`, `api.*` helpers (localStorage `dev_token`)
- `src/components/AuthGuard.jsx` — token yoksa login'e yönlendir
- `src/components/PortalNav.jsx` — üst nav (siyah bar)
- `.env.example`

### PR 4 — Sellercentral App Store (TAMAMLANDI ✅)

**Yeni sayfalar (`apps/sellercentral/src/app/[locale]/apps/`):**
- `page.jsx` — App Store kataloğu (kategori filtresi, arama, install butonu)
- `[handle]/page.jsx` — App detay sayfası (scope listesi, install → OAuth yönlendirme)
- `installed/page.jsx` — Kurulu uygulamalar (uninstall, kurulum tarihi)

**Güncellenen dosyalar:**
- `src/components/PolarisLayout.jsx` — `AppsIcon` import + Apps nav item (App Store / Installed alt menü)
- `src/messages/{en,de,tr,fr,it,es}.json` — `apps`, `installed`, `appStore` çevirileri eklendi
- `next.config.js` — `/:locale/apps` redirect kaldırıldı (artık gerçek sayfa)
- `turbo.json` — `DEVELOPER_JWT_SECRET`, `APP_PLATFORM_AUTO_APPROVE`, `SUPERUSER_EMAILS`, `NEXT_PUBLIC_DEVELOPER_PORTAL_URL`, `NEXT_PUBLIC_DEVELOPER_API_PREFIX` globalEnv'e eklendi

## BEKLEYEN / SONRAKI ADIMLAR

- [ ] **Vercel deploy:** `apps/developer` projesini Vercel'e ekle — root dir: `apps/developer`, env vars `.env.example`'daki değerleri doldur
- [ ] **Render env:** `DEVELOPER_JWT_SECRET` ekle (Developer Portal ile aynı değer)
- [ ] **`CORS_ORIGINS`:** `https://developer.andertal.com` ekle (Render'da)
- [ ] **`APP_PLATFORM_AUTO_APPROVE=true`** — PR 8 admin review UI gelene kadar aktif tut
- [ ] **`SUPERUSER_EMAILS`:** `murathan.cotuk@gmail.com` gibi superuser developer emaillerini virgülle ayır
- [ ] **Test checklist** (aşağıdaki spec'e bak)
- [ ] **PR 5:** Webhook dispatcher (PR 6+)

---

# GÖREV: Andertal App Platform — Developer Portal + App Store

## BAĞLAM

Andertal monorepo'sunda (`apps/medusa-backend`, `apps/sellercentral`, `apps/shop`) çalışan bir multi-vendor e-ticaret platformu var. Bugün `apps/sellercentral/src/app/[locale]/settings/integrations/page.jsx` içinde her entegrasyon (SMTP, Trustpilot, Marketing, Billbee, API keys) **hardcoded React komponenti** olarak gömülü. Yeni entegrasyon = yeni kod = deploy.

`apps/medusa-backend/billbee-marketplace-api.js` zaten `/api/v1/` altında generic public API olarak tasarlanmış, Basic Auth ile `andertal_zug_...` / `andertal_ssk_...` credential mantığı kurulmuş, `store_integrations` tablosu var. Bu temeli kıracak şekilde değil, **üzerine OAuth + manifest + developer UI ekleyerek** Shopify App Store mantığında bir ekosistem kurulacak.

## KARGO / FULFILLMENT STRATEJİSİ

1. **Varsayılan:** Platform Sendcloud etiketi — sipariş sayfasında "Kargo etiketi al" → popup; sağda Sendcloud API'den gelen seçenekler ucuzdan pahalıya, taşıyıcı logolarıyla. Fiyat = Sendcloud net fiyat + **30 cent** (sabit markup, yüzde değil). Env: `APP_PLATFORM_LABEL_MARKUP_CENTS=30`.
2. **Alternatif:** Satıcı ERP/app kurar → OAuth ile bağlanır → `write_fulfillments` scope ile tracking + gönderildi bilgisini platforma yazar.

Platform etiket UI'sı App Platform MVP kapsamı dışındadır (ayrı iş). MVP odak: developer portal + backend OAuth/Public API iskeleti + sellercentral App Store (**PR 1–4**).

## ÜRÜN HEDEFİ

1. `developer.andertal.com` — Üçüncü taraf geliştiricilerin kayıt olup app yarattığı portal.
2. Sellercentral'da `/apps` route'u — Satıcıların app'leri keşfettiği, kurduğu, ayarladığı App Store paneli.
3. Mevcut `/settings/integrations` sayfası kalır ama sadece **kurulu app'lerin ayarlarını + first-party native ayarları (SMTP vb.)** gösterir; arama/keşif `/apps`'e taşınır. MVP'de integrations sayfasına sadece "Daha fazla app keşfet → /apps" banner/link ekle; full refactor PR 10'a kalsın.

## MEVCUT KOD — DOKUNMA / BOZMA

- `apps/medusa-backend/billbee-marketplace-api.js` — `/api/v1/` ve `/api/billbee/` legacy API. Refactor etme, kırma. Yeni Public API **paralel** yaşasın (`/api/public-api/v1/`).
- Mevcut `store_integrations`, Billbee, Sendcloud, SMTP hardcoded entegrasyonlar çalışmaya devam etmeli.
- `billbee-marketplace-api.js` refactor'u PR 10'a ertele.

## MONOREPO YAPISI

- Root: npm workspaces + turbo (`package.json`, `turbo.json`)
- `apps/sellercentral` — Next.js 16, next-intl, Polaris, port **3002**, referans UI
- `apps/shop` — port 3000
- `apps/medusa-backend` — Express `server.js`, Postgres, port **9000**
- `apps/developer` — **YENİ**, `developer.andertal.com` (Vercel), port **3003**

## KRİTİK İŞ KURALI — DEVELOPER TIER SİSTEMİ

Geliştiriciler iki seviyede ayrılır ve bu seviye, **yarattıkları app'in tipini sınırlar**:

### Tier 1 — Superuser Developer

- **Sadece platform superuser hesabı** (sellercentral'da `localStorage.sellerIsSuperuser === "true"` olan kullanıcı, backend tarafında `seller_users.is_superuser = true`) developer.andertal.com'da bu rolde kayıt olabilir.
- **`shop_app`** ve **`integration_app`** — her iki tipte de app publish edebilir.
- Storefront'a (shop'a) direkt müdahale edebilir: tema bloğu, checkout extension, storefront widget, ürün sayfası komponenti, custom page section.

### Tier 2 — Integration Developer

- Herkese açık kayıt. Email doğrulama + (opsiyonel) firma bilgisi yeterli.
- **Sadece `integration_app`** publish edebilir.
- Yapabilecekleri: API ile veri okuma/yazma, webhook dinleme, sellercentral içinde embedded settings sayfası (iframe), background sync (Billbee, JTL, Xentral, DHL, Sevdesk, Lexoffice, Klaviyo vb. tarzı).
- **Yapamayacakları:** shop frontend'ine HTML/CSS/JS enjekte etmek, checkout'a müdahale etmek, ürün sayfası bloğu eklemek, herhangi bir public storefront URL'ine kod injection yapmak.

### Manifest seviyesinde zorlama

`manifest.json` içinde `"type": "shop_app" | "integration_app"` zorunlu alan olacak. Backend, app create / version submit endpoint'lerinde developer tier ile manifest type uyumunu kontrol edecek:

```
if (manifest.type === "shop_app" && !developer.is_superuser_developer) {
  throw 403 "Only platform-owned developer accounts can publish shop apps";
}
```

Frontend'de de developer portal'da "App tipi seç" adımında Tier 2 developer'lara `shop_app` opsiyonu gri/disabled gösterilecek. Tier 2 `shop_extensions` alanını doldurursa backend 403 döner.

## MİMARİ

```
apps/
├── medusa-backend/                          (mevcut)
│   └── src/
│       ├── modules/app-platform/            (YENİ — JS tercih et, src/routes/*.js ile uyumlu)
│       │   ├── scope-registry.js            (geçerli scope listesi tek kaynak)
│       │   ├── manifest-validator.js
│       │   ├── ids.js                       (dev_, app_, inst_ prefix)
│       │   ├── crypto.js                    (SHA-256 hash, timing-safe compare)
│       │   ├── service.js
│       │   ├── oauth-server.js
│       │   └── webhook-dispatcher.js        (PR 5)
│       └── routes/
│           ├── developer-api.js             (/developer-api/v1/ — developer portal JWT)
│           ├── app-oauth.js                   (/oauth/authorize, /token, /revoke)
│           ├── public-api-v1.js             (/api/public-api/v1/ — Bearer + scope)
│           └── app-store.js                 (/admin-hub/v1/app-store/ — sellercentral)
│
├── sellercentral/                           (mevcut)
│   └── src/app/[locale]/
│       ├── apps/                            (YENİ — App Store)
│       │   ├── page.jsx
│       │   ├── [handle]/page.jsx
│       │   └── installed/page.jsx
│       └── settings/integrations/page.jsx   (MVP: banner → /apps; full refactor PR 10)
│
└── developer/                               (YENİ — developer.andertal.com)
    └── src/app/[locale]/
        ├── (auth)/signup/page.jsx
        ├── (auth)/login/page.jsx
        ├── dashboard/page.jsx
        ├── apps/page.jsx
        ├── apps/new/page.jsx
        ├── apps/[id]/page.jsx
        ├── apps/[id]/manifest/page.jsx
        ├── apps/[id]/versions/page.jsx      (PR 6+)
        ├── apps/[id]/test/page.jsx
        ├── apps/[id]/submit/page.jsx
        ├── apps/[id]/analytics/page.jsx
        ├── apps/[id]/billing/page.jsx       (PR 9)
        ├── docs/                            (PR 6 — MDX)
        └── api-reference/                   (PR 6 — OpenAPI / Redocly)
```

## MANIFEST ŞEMASI

```json
{
  "schema_version": "1",
  "handle": "billbee-sync",
  "name": "Billbee Sync",
  "type": "integration_app",
  "version": "1.0.0",
  "developer_id": "dev_...",
  "description": { "de": "...", "en": "...", "tr": "..." },
  "category": "shipping-fulfillment",
  "tags": ["billbee", "fulfillment", "warehouse"],
  "icon_url": "https://cdn.andertal.com/apps/billbee/icon.png",
  "screenshots": ["https://..."],
  "support": {
    "email": "support@billbee.io",
    "url": "https://billbee.io/help",
    "privacy_policy_url": "https://billbee.io/privacy"
  },
  "pricing": {
    "model": "free | monthly | usage",
    "amount_eur": 9.99,
    "trial_days": 14
  },
  "scopes": ["read_products", "write_products", "read_orders", "write_fulfillments"],
  "oauth": { "redirect_urls": ["https://app.billbee.io/oauth/andertal/callback"] },
  "webhooks": {
    "endpoint": "https://app.billbee.io/andertal/webhooks",
    "events": ["order.created", "order.paid", "order.cancelled", "product.updated"]
  },
  "ui": {
    "embedded_settings_url": "https://app.billbee.io/embed/settings?seller={seller_id}",
    "embedded_dashboard_url": null
  },
  "shop_extensions": null,
  "data_processing": {
    "stores_customer_data": true,
    "data_retention_days": 90,
    "subprocessors": ["AWS Frankfurt"]
  }
}
```

`shop_app` tipinde ek olarak `shop_extensions` (blocks, checkout_extensions) zorunlu — detay için `app-types` dokümantasyonu.

## SCOPE LİSTESİ (TEK KAYNAK: `scope-registry.js`)

```
read_products            Ürün okuma
write_products           Ürün oluşturma/güncelleme
read_orders              Sipariş okuma
write_orders             Sipariş durumu güncelleme (kısıtlı)
write_fulfillments       Tracking number + kargo durumu yazma
read_inventory           Stok okuma
write_inventory          Stok güncelleme
read_customers           Müşteri verisi okuma (GDPR riskli — onay zorunlu)
read_analytics           Satış raporları
write_discounts          Kupon/indirim oluşturma
read_brands              Marka okuma
write_brands             Marka oluşturma/güncelleme
read_categories          Kategori okuma
write_shipping_methods   Versandgruppe/method oluşturma
read_seller_settings     Seller profili okuma
write_storefront         Shop UI'a block ekleme (sadece shop_app — Tier 2'ye verilmez)
write_checkout           Checkout extension (sadece shop_app)
```

Public API endpoint'leri `requireScope('read_orders')` middleware'i ile korunmalı. Token scope'ları DB'de saklanır.

## OAUTH 2.0 AUTHORIZATION CODE FLOW

1. Seller sellercentral'da `/apps/[handle]` sayfasında **Install** der.
2. Tarayıcı `GET /oauth/authorize?client_id=...&scope=...&redirect_uri=...&state=...` adresine yönlendirilir.
3. Andertal **Consent Screen** gösterir: "Bu app şu izinleri istiyor: ... [Onayla] [Reddet]". Scope açıklamaları `scope-registry`'den insan-okur formatta.
4. Onaylanırsa `redirect_uri?code=...&state=...` ile app backend'ine döner.
5. App backend: `POST /oauth/token` (code + client_id + client_secret) → `access_token` + `refresh_token`.
6. App, `Authorization: Bearer <access_token>` ile `/api/public-api/v1/...` çağırır.
7. Access token TTL: 24 saat. Refresh token TTL: 60 gün, kullanımda rotate.

Mevcut `api_key/api_secret` Basic Auth modeli **first-party machine-to-machine** için korunur (Billbee legacy). Yeni 3rd-party app'ler Bearer/OAuth kullanır.

Seller JWT: sellercentral cookie `sc_token` veya `Authorization: Bearer` — `/oauth/authorize` için gerekli.

## WEBHOOK SİSTEMİ (PR 5)

- Event listesi: `order.created`, `order.updated`, `order.paid`, `order.shipped`, `order.delivered`, `order.cancelled`, `product.created`, `product.updated`, `product.deleted`, `inventory.updated`, `customer.created`, `app.uninstalled`.
- Her POST'ta `X-Andertal-Hmac-SHA256: <hmac(payload, app.client_secret)>` header'ı.
- Retry: exponential backoff (1m, 5m, 30m, 2h, 12h, 24h). 6 retry başarısızsa subscription `disabled`, developer'a mail.
- Redis queue (`flow-queue.js` referans) ile worker pool.
- `app.uninstalled` webhook'una developer 30 gün içinde data purge **zorunlu** (GDPR).

MVP'de webhook tabloları oluşur, manifest alanı kaydedilir; dispatcher PR 5'e kalır.

## SELLERCENTRAL APP STORE UI (`/apps`)

`settings/integrations/page.jsx` referans alınır (Polaris, IntegrationsAccordion).

- Üstte **sadece app arama** (sellercentral global aramasından bağımsız).
- Sol kategori filtresi: All, Shipping & Fulfillment, Accounting, Marketing, Analytics, Inventory, Reviews, Storefront (shop_app).
- Grid: icon, name, açıklama, kategori, rating, install count, fiyat badge.
- Rozetler: "Featured", "Built by Andertal", "New".
- `/apps/[handle]`: screenshots, scope listesi, pricing, Install, Privacy & Data sekmesi.
- `/apps/installed`: kurulu app'ler, uninstall.
- Nav: `PolarisLayout.jsx`'e **Apps** linki (Apps = keşif; Integrations = kurulu/native ayarlar).
- i18n: `apps/sellercentral/src/lib/app-store-i18n.js` — 6 dil (de, en, tr, fr, es, it).

API: `/admin-hub/v1/app-store/*` — `requireSellerAuth`.

## DEVELOPER PORTAL UI (`apps/developer/`)

- Next.js 16 App Router, `next-intl`, Polaris (sellercentral ile aynı stack).
- Auth: JWT, `developers` tablosu — `seller_users`'tan **bağımsız**.
- `is_superuser_developer` otomatik **false**; manuel SQL veya superuser email match ile `true`.
- Signup: email, şifre, firma adı (ops), ülke, vergi no (ops), terms + DPA accept.
- App create wizard:
  1. App tipi (Tier 2'de `shop_app` kilitli + tooltip)
  2. Handle, name, açıklama (de/en)
  3. Scope checkbox'ları
  4. OAuth redirect URL
  5. Webhook endpoint + events
  6. (shop_app) Shop extensions
  7. Pricing
  8. Review → `client_id` + `client_secret` **bir kez** göster
- Manifest editor: JSON textarea + form view toggle.
- Auth cookie: `dev_token` (sellercentral `sc_token` pattern'ine bak).

## REVIEW / SUBMISSION SÜRECİ

- App `status = "draft"` ile başlar. Public store'da listelenmez.
- Submit otomatik kontroller: manifest valid, tier-type match, OAuth/webhook reachable (HEAD), icon/screenshots, privacy policy URL.
- Geçerse → `pending_review` → admin approve → `published`.
- MVP bypass: `APP_PLATFORM_AUTO_APPROVE=true` → doğrudan `published` (PR 8 admin UI'ya kadar).
- Yayın sonrası hata oranı > %5/saat → `suspended`.

## STRIPE CONNECT — REVENUE SHARE (PR 9)

- Developer Stripe Connect Express onboarding.
- Paid app tahsilatı Andertal Stripe hesabına; aylık payout developer %85 / Andertal %15 (config: `app_platform_settings`).
- Trial içinde uninstall → ücret yansıtılmaz.

## DOKÜMANTASYON (PR 6)

`apps/developer/src/app/[locale]/docs/` — MDX sidebar:

1. getting-started · 2. authentication · 3. api-reference (OpenAPI) · 4. webhooks · 5. scopes · 6. manifest · 7. app-types · 8. app-review · 9. sdk-nodejs (`@andertal/sdk`) · 10. test-stores · 11. brand-guidelines · 12. pricing-revenue-share · 13. gdpr-compliance

OpenAPI: `apps/medusa-backend/openapi/public-api-v1.yaml` — CI spec drift kontrolü.

## VERİTABANI MIGRATION'LARI

Postgres (`medusa-backend` DB):

```sql
CREATE TABLE developers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  company_name TEXT,
  country TEXT,
  vat_number TEXT,
  is_superuser_developer BOOLEAN DEFAULT FALSE,
  stripe_account_id TEXT,
  dpa_accepted_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  developer_id TEXT REFERENCES developers(id) ON DELETE RESTRICT,
  handle TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  client_id TEXT UNIQUE NOT NULL,
  client_secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  current_version_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE app_versions (
  id TEXT PRIMARY KEY,
  app_id TEXT REFERENCES apps(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  manifest JSONB NOT NULL,
  changelog TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (app_id, version)
);
CREATE TABLE app_installations (
  id TEXT PRIMARY KEY,
  app_id TEXT REFERENCES apps(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  version_id TEXT REFERENCES app_versions(id),
  scopes TEXT[] NOT NULL,
  settings JSONB DEFAULT '{}',
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  uninstalled_at TIMESTAMPTZ,
  UNIQUE (app_id, seller_id)
);
CREATE TABLE app_tokens (
  id TEXT PRIMARY KEY,
  installation_id TEXT REFERENCES app_installations(id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL,
  refresh_token_hash TEXT,
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE app_webhook_subscriptions (
  id TEXT PRIMARY KEY,
  installation_id TEXT REFERENCES app_installations(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE app_webhook_deliveries (
  id TEXT PRIMARY KEY,
  subscription_id TEXT REFERENCES app_webhook_subscriptions(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  attempt INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_permanently_at TIMESTAMPTZ,
  last_response_status INT,
  last_response_body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE app_reviews (
  id TEXT PRIMARY KEY,
  app_id TEXT REFERENCES apps(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES app_versions(id),
  reviewer_id TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS developer_id TEXT REFERENCES developers(id);
```

`server.js` `CREATE TABLE IF NOT EXISTS` pattern'i varsa migration ile tutarlı ol.

## GÜVENLİK ZORUNLULUKLARI

- Client secret / access token SHA-256 hash; plaintext sadece create/rotate sırasında.
- Rate limit: app başına 1000 req/dk, seller+app başına 500 req/dk (MVP: in-memory Map yeterli).
- `DEVELOPER_JWT_SECRET` seller JWT'den **ayrı** olmalı.
- IP allowlist (manifest, opsiyonel), anomaly detection (100+ req/s → suspend), audit log.

## FAZLAR (PR-BAZLI TESLİMAT)

İmplementasyonu **tek PR'da yapma**. Her PR: migration → service → API → UI → test.

### PR 1 — Schema & Module Skeleton

- Migration'lar + `src/modules/app-platform/` (`scope-registry.js`, `manifest-validator.js`, `ids.js`, `crypto.js`, `service.js`).
- Unit test: manifest-validator + scope-registry (en az 5 test).
- `billbee-marketplace-api.js`'ye dokunma.
- Commit: `feat(app-platform): add schema and module skeleton`

### PR 2 — OAuth Server + Public API v1

**OAuth** (`src/routes/app-oauth.js`):

- `GET /oauth/authorize` — seller JWT gerekli; MVP basit HTML consent yeterli
- `POST /oauth/token`, `POST /oauth/revoke`
- Env: `OAUTH_CODE_TTL_SECONDS`, `OAUTH_ACCESS_TOKEN_TTL_SECONDS`, `OAUTH_REFRESH_TOKEN_TTL_SECONDS`, `DEVELOPER_JWT_SECRET`

**Public API** (`src/routes/public-api-v1.js`, prefix `/api/public-api/v1/`):

- `GET /orders`, `GET /orders/:id` — installation'ın `seller_id` siparişleri
- `GET /products`
- `PUT /inventory/:sku` veya `POST /inventory/bulk` (`write_inventory`)
- `POST /orders/:id/fulfillments` — `{ tracking_number, carrier_name, shipped_at? }` → `delivery_status='versendet'` (`write_fulfillments`). Mevcut `orders.js` / `shipment-tracking.js` mantığını reuse et.

**Developer API** (`src/routes/developer-api.js`, prefix `/developer-api/v1/`):

- `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`
- `GET|POST|PATCH /apps`, `POST /apps/:id/versions`, `POST /apps/:id/rotate-secret`, `POST /apps/:id/submit`

**App Store API** (`src/routes/app-store.js`, prefix `/admin-hub/v1/app-store/`):

- `GET /apps`, `GET /apps/:handle`, `GET /installations`, `POST /apps/:handle/install`, `DELETE /installations/:id`

**CORS:** `https://developer.andertal.com`, `http://localhost:3003`

- Commit: `feat(app-platform): oauth server and public API v1`

### PR 3 — Developer Portal

- `apps/developer/` scaffold (sellercentral referans, port 3003, `@andertal/developer`).
- Signup/login/dashboard, app wizard, manifest editor.
- `.env.example`, `README.md` (Vercel deploy notları).
- `turbo.json` globalEnv güncelle.
- Commit: `feat(developer): add developer portal app`

### PR 4 — Sellercentral App Store

- `/apps`, `/apps/[handle]`, `/apps/installed`
- Nav Apps linki; integrations banner → `/apps`
- OAuth install akışı
- Opsiyonel seed: `billbee-sync` placeholder app (`Built by Andertal`)
- Commit: `feat(sellercentral): add app store and install flow`

### PR 5 — Webhook System

Subscription CRUD, dispatcher, retry, HMAC. Event'ler: `order.created`, `order.paid`, `order.shipped`, `app.uninstalled`.

### PR 6 — Documentation + OpenAPI + `@andertal/sdk`

### PR 7 — Shop Apps (Tier 1, `shop_extensions`)

### PR 8 — Review & Approval Flow (admin UI)

### PR 9 — Stripe Connect & Billing

### PR 10 — First-Party App Migration

Billbee, SMTP, Trustpilot, Marketing → `integration_app`. `/settings/integrations` full refactor.

## ENV DOSYALARI

### `apps/developer/.env.example`

```env
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_DEVELOPER_API_PREFIX=/developer-api/v1
DEVELOPER_JWT_SECRET=
NEXT_PUBLIC_DEVELOPER_PORTAL_URL=http://localhost:3003
NEXT_PUBLIC_SELLERCENTRAL_URL=http://localhost:3002
# NEXT_PUBLIC_SENTRY_DSN=
# NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
```

Generate secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

### `apps/medusa-backend/.env.example` — ekle

```env
# DEVELOPER_JWT_SECRET=              # min 32 chars, SELLER_JWT_SECRET'tan ayrı
# APP_PLATFORM_JWT_SECRET=           # alias
# OAUTH_ACCESS_TOKEN_TTL_SECONDS=86400
# OAUTH_REFRESH_TOKEN_TTL_SECONDS=5184000
# OAUTH_CODE_TTL_SECONDS=600
# APP_PLATFORM_AUTO_APPROVE=true       # MVP: manual review atla
# APP_PLATFORM_LABEL_MARKUP_CENTS=30   # Sendcloud platform etiket markup
```

### `apps/sellercentral/.env.example` — ekle

```env
# NEXT_PUBLIC_SELLERCENTRAL_URL=https://sellercentral.andertal.com
```

### `turbo.json` — `globalEnv` / build `env`

`NEXT_PUBLIC_DEVELOPER_API_PREFIX`, `DEVELOPER_JWT_SECRET`, `NEXT_PUBLIC_DEVELOPER_PORTAL_URL`

Gerçek secret'ları `.env.example`'a yazma — `.env.local` gitignore'da kalsın.

## VERCEL / RENDER DEPLOY

| Vercel Project | Domain | Root Directory |
|----------------|--------|----------------|
| developer | developer.andertal.com | `apps/developer` |

Build: `cd ../.. && npm run build --workspace=@andertal/developer`

**Vercel env:**

- `NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.andertal.com`
- `DEVELOPER_JWT_SECRET` = Render backend ile **aynı**
- `NEXT_PUBLIC_DEVELOPER_PORTAL_URL=https://developer.andertal.com`
- `NEXT_PUBLIC_SELLERCENTRAL_URL=https://sellercentral.andertal.com`

**Render backend:**

- `CORS_ORIGINS` ... `https://developer.andertal.com`
- `DEVELOPER_JWT_SECRET` ekle

## TEST CHECKLIST (MVP commit öncesi)

1. `npm run build --workspace=@andertal/developer`
2. `npm run build --workspace=@andertal/sellercentral`
3. Developer signup/login → app create → client_id/secret
4. App submit/publish (`APP_PLATFORM_AUTO_APPROVE` veya manual)
5. Seller `/apps` → install → OAuth consent → token
6. `GET /api/public-api/v1/orders` — sadece o seller
7. `POST /api/public-api/v1/orders/:id/fulfillments` — tracking yazar
8. Scope dışı → 403; uninstall → token revoke
9. Billbee `/api/v1/orders` regression PASS

## ACCEPTANCE CRITERIA (PR 1–4 MVP)

- [ ] `developer.andertal.com` build alıyor (local :3003)
- [ ] Developer signup → app oluştur → `client_id` + `client_secret`
- [ ] Tier 2 `shop_app` → 403
- [ ] Seller `/apps` → app bul → install
- [ ] OAuth consent scope'ları insan-okur formatta
- [ ] Bearer token ile orders read (sadece o seller)
- [ ] Fulfillment write (tracking) çalışıyor
- [ ] Scope dışı endpoint → 403; uninstall → erişim kesiliyor
- [ ] Billbee legacy API bozulmadı
- [ ] `.env.example` dosyaları + README deploy notları güncel

## KAPSAM DIŞI (MVP — YAPMA)

- PR 5 webhook dispatcher (tablo + manifest alanı yeterli)
- PR 7 shop_app / storefront blocks
- PR 8 admin review UI (`APP_PLATFORM_AUTO_APPROVE` ile geç)
- PR 9 Stripe Connect
- PR 10 Billbee → integration_app migration
- Sendcloud label popup UI
- `@andertal/sdk` (PR 6)

## KISITLAR

- i18n: de, en, tr, fr, es, it (`next-intl`)
- UI: Polaris (sellercentral ile tutarlı)
- Veriler EU'da kalmalı (GDPR)
- Hardcoded credential yok

## GIT

Her faz ayrı commit (minimum 4). Conventional commits: `feat(app-platform): ...`, `feat(developer): ...`, `feat(sellercentral): ...`

Push: `git push origin HEAD`

## İMPLEMENTASYON SIRASI

1. PR 1 → PR 2 → PR 3 → PR 4 sırayla; tek PR'da hepsini yapma.
2. Her katmanda test yaz.
3. `billbee-marketplace-api.js` referans al ama refactor etme.
4. Belirsizlik varsa dur, sor — varsayım yapıp kırma.
