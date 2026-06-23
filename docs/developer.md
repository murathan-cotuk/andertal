
# GÖREV: Andertal App Platform — Developer Portal + App Store
## BAĞLAM
Andertal monorepo'sunda (`apps/medusa-backend`, `apps/sellercentral`, `apps/shop`) çalışan
bir multi-vendor e-ticaret platformu var. Bugün `apps/sellercentral/src/app/[locale]/settings/integrations/page.jsx`
içinde her entegrasyon (SMTP, Trustpilot, Marketing, Billbee, API keys) **hardcoded React
komponenti** olarak gömülü. Yeni entegrasyon = yeni kod = deploy.
`apps/medusa-backend/billbee-marketplace-api.js` zaten `/api/v1/` altında generic public
API olarak tasarlanmış, Basic Auth ile `andertal_zug_...` / `andertal_ssk_...` credential
mantığı kurulmuş, `store_integrations` tablosu var. Bu temeli kıracak şekilde değil,
**üzerine OAuth + manifest + developer UI ekleyerek** Shopify App Store mantığında bir
ekosistem kuracaksın.
## ÜRÜN HEDEFİ
1. `developer.andertal.com` — Üçüncü taraf geliştiricilerin kayıt olup app yarattığı portal.
2. Sellercentral'da `/apps` route'u — Satıcıların app'leri keşfettiği, kurduğu, ayarladığı App Store paneli.
3. Mevcut `/settings/integrations` sayfası kalır ama sadece **kurulu app'lerin ayarlarını + first-party native ayarları (SMTP vb.)** gösterir; arama/keşif `/apps`'e taşınır.
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
if (manifest.type === "shop_app" && !developer.is_superuser) {
  throw 403 "Only platform-owned developer accounts can publish shop apps";
}
```
Frontend'de de developer portal'da "App tipi seç" adımında Tier 2 developer'lara `shop_app` opsiyonu gri/disabled gösterilecek.
## MİMARİ
```
apps/
├── medusa-backend/                          (mevcut)
│   └── src/
│       ├── modules/app-platform/            (YENİ)
│       │   ├── models/
│       │   │   ├── developer.ts
│       │   │   ├── app.ts
│       │   │   ├── app-version.ts
│       │   │   ├── app-installation.ts
│       │   │   ├── app-token.ts
│       │   │   ├── app-webhook-subscription.ts
│       │   │   ├── app-webhook-delivery.ts
│       │   │   └── app-review.ts
│       │   ├── service.ts
│       │   ├── oauth-server.ts
│       │   ├── scope-registry.ts            (geçerli scope listesi tek kaynak)
│       │   ├── manifest-validator.ts
│       │   └── webhook-dispatcher.ts
│       └── api/
│           ├── developer/                   (developer.andertal.com için, JWT auth)
│           │   ├── auth/
│           │   ├── apps/
│           │   ├── apps/[id]/versions/
│           │   ├── apps/[id]/submit/
│           │   └── apps/[id]/analytics/
│           ├── oauth/                       (Authorization Code flow)
│           │   ├── authorize/route.js
│           │   ├── token/route.js
│           │   └── revoke/route.js
│           ├── public-api/v1/               (3rd-party app'ler için; Bearer auth + scope check)
│           │   ├── products/
│           │   ├── orders/
│           │   ├── inventory/
│           │   ├── customers/
│           │   ├── fulfillments/
│           │   └── webhooks/                (app webhook subscribe/unsubscribe)
│           └── store/app-store/             (sellercentral App Store UI için, public liste)
│               ├── apps/route.js            (arama, kategori, filter)
│               ├── apps/[handle]/route.js
│               └── installations/route.js   (seller kurar/kaldırır)
│
├── sellercentral/                           (mevcut)
│   └── src/app/[locale]/
│       ├── apps/                            (YENİ — App Store)
│       │   ├── page.jsx                     (arama + kategori grid)
│       │   ├── [handle]/page.jsx            (app detay + install butonu)
│       │   └── installed/page.jsx           (benim app'lerim)
│       └── settings/integrations/page.jsx   (refactor: kurulu app ayarları + native SMTP/Trustpilot)
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
        ├── apps/[id]/versions/page.jsx
        ├── apps/[id]/test/page.jsx
        ├── apps/[id]/submit/page.jsx
        ├── apps/[id]/analytics/page.jsx
        ├── apps/[id]/billing/page.jsx
        ├── docs/                            (markdown-driven, MDX)
        └── api-reference/                   (OpenAPI spec'ten Redocly veya Stoplight Elements)
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
  "description": {
    "de": "...",
    "en": "...",
    "tr": "..."
  },
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
    "model": "free" | "monthly" | "usage",
    "amount_eur": 9.99,
    "trial_days": 14
  },
  "scopes": [
    "read_products",
    "write_products",
    "read_orders",
    "write_fulfillments"
  ],
  "oauth": {
    "redirect_urls": ["https://app.billbee.io/oauth/andertal/callback"]
  },
  "webhooks": {
    "endpoint": "https://app.billbee.io/andertal/webhooks",
    "events": [
      "order.created",
      "order.paid",
      "order.cancelled",
      "product.updated"
    ]
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
`shop_app` tipinde **ek olarak** doldurulması gereken alan:
```json
{
  "type": "shop_app",
  "shop_extensions": {
    "blocks": [
      {
        "id": "loyalty-badge",
        "name": "Loyalty Badge",
        "target": "product_card" | "product_page" | "cart_drawer" | "checkout_thankyou" | "footer",
        "render_url": "https://app.example.com/blocks/loyalty",
        "settings_schema": [...]
      }
    ],
    "checkout_extensions": [...]
  }
}
```
Tier 2 developer'lar `shop_extensions` alanını doldurursa backend 403 döner.
## SCOPE LİSTESİ (TEK KAYNAK: `scope-registry.ts`)
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
# Sadece shop_app — Tier 2'ye verilmez
write_storefront         Shop UI'a block ekleme
write_checkout           Checkout extension
```
Public API endpoint'leri `requireScope('read_orders')` middleware'i ile korunmalı. Token'ın
scope'ları DB'de saklanır, request'te bit-mask check yapılır.
## OAUTH 2.0 AUTHORIZATION CODE FLOW
1. Seller sellercentral'da `/apps/[handle]` sayfasında **Install** der.
2. Tarayıcı `GET /oauth/authorize?client_id=...&scope=...&redirect_uri=...&state=...` adresine yönlendirilir.
3. Andertal **Consent Screen** gösterir: "Bu app şu izinleri istiyor: ... [Onayla] [Reddet]".
4. Onaylanırsa `redirect_uri?code=...&state=...` ile app backend'ine döner.
5. App backend: `POST /oauth/token` (code + client_id + client_secret) → `access_token` + `refresh_token`.
6. App, `Authorization: Bearer <access_token>` ile `/api/public-api/v1/...` çağırır.
7. Access token TTL: 24 saat. Refresh token TTL: 60 gün, kullanımda rotate.
Mevcut `api_key/api_secret` Basic Auth modeli **first-party machine-to-machine** kullanım için
korunur (kendi entegrasyonlarınız + Billbee gibi legacy). Yeni 3rd-party app'ler Bearer/OAuth kullanır.
## WEBHOOK SİSTEMİ
- Event listesi: `order.created`, `order.updated`, `order.paid`, `order.shipped`, `order.delivered`,
  `order.cancelled`, `product.created`, `product.updated`, `product.deleted`, `inventory.updated`,
  `customer.created`, `app.uninstalled`.
- Her POST'ta `X-Andertal-Hmac-SHA256: <hmac(payload, app.client_secret)>` header'ı.
- App `2xx` döner → success. `5xx` veya timeout → exponential backoff retry (1m, 5m, 30m, 2h, 12h, 24h). 24 saatte 6 retry başarısızsa subscription `disabled` işaretlenir, developer'a mail gider.
- Redis queue (mevcut `flow-queue.js` mantığını referans al) ile worker pool kullan.
- `app.uninstalled` webhook'una developer 30 gün içinde data purge yapmak **zorundadır** (GDPR Right to Erasure). Bu sözleşme metninde de yer alır.
## SELLERCENTRAL APP STORE UI (`/apps`)
Mevcut `apps/sellercentral/src/app/[locale]/settings/integrations/page.jsx` referans alınır
(Polaris design system, IntegrationsAccordion görünümü). Yeni `/apps/page.jsx`:
- Üstte **sadece app arama** input'u (talimattaki kural: "kendi arama cubugu olsun yalnizca appler aranabilsin" — sellercentral'ın global aramasından bağımsız).
- Sol tarafta kategori filtresi: All, Shipping & Fulfillment, Accounting, Marketing, Analytics, Inventory, Reviews, Storefront (sadece shop_app olanlar).
- Grid: app card (icon, name, kısa açıklama, kategori, rating, install count, fiyat badge).
- "Featured" + "Built by Andertal" + "New" rozet desteği.
- App card → `/apps/[handle]` detay sayfası: screenshots carousel, açıklama, scope listesi (insan-okur formatta), pricing, "Install" butonu, "Privacy & Data" sekmesi.
- "Installed" filtresi → kurulu app'lerin listesi.
i18n: Mevcut `useUI()` ve `getIntegrationsCopy(locale)` mantığını kullan, yeni `getAppStoreCopy(locale)`
ekle (`apps/sellercentral/src/lib/app-store-i18n.js`).
## DEVELOPER PORTAL UI (`apps/developer/`)
- Next.js 14 App Router, `next-intl`, Polaris (sellercentral ile aynı stack).
- Auth: JWT, kendi `seller_users` tablosundan **değil** yeni `developers` tablosundan. Login akışı bağımsız.
- Signup'ta `is_superuser_developer` flag'i otomatik **false**. Sadece manuel olarak (admin SQL veya superuser sellercentral hesabına bağlı email match) `true` yapılır.
- Signup formunda: email, şifre, firma adı (ops), ülke, vergi no (ops), terms accept, DPA accept.
- App create wizard:
  1. App tipi seç (Tier 2'de `shop_app` kilitli, hover'da "Requires Andertal platform partnership" tooltip).
  2. Temel bilgiler (handle, name, açıklama).
  3. Scope seç (checkbox listesi + her scope'un ne yaptığı açıklama).
  4. OAuth redirect URL.
  5. Webhook endpoint + event seçimi.
  6. (shop_app ise) Shop extensions config.
  7. Pricing.
  8. Review → Save → `client_id` + `client_secret` üret, secret'ı **bir kez** göster.
## REVIEW / SUBMISSION SÜRECİ
- App ilk yaratıldığında `status = "draft"`. Test store'da kurulabilir, public store'da listelenmez.
- Developer "Submit for Review" tıklarsa otomatik kontroller:
  - Manifest valid mi (JSON schema)
  - Tier-type match mi
  - OAuth callback reachable mi (HTTP HEAD)
  - Webhook endpoint reachable mi
  - Icon + screenshots minimum boyut/format
  - Privacy policy URL erişilebilir mi
- Geçerse → `status = "pending_review"`. Andertal admin paneline (mevcut superuser sellercentral) bildirim.
- Admin sandbox seller'da test eder, screenshot/açıklama uygunsa **approve** → `status = "published"`, app store'da görünür.
- Reject ederse sebep + tekrar submit hakkı.
- Yayın sonrası izleme: hata oranı > %5 / saat → otomatik `status = "suspended"`, developer'a mail.
## STRIPE CONNECT — REVENUE SHARE
- Developer signup'ta Stripe Connect Express onboarding (KYC).
- Paid app kurulduğunda seller'dan tahsilat Andertal'ın mevcut Stripe hesabına (`stripe_test.txt`'deki) düşer.
- Aylık otomatik payout: developer'a %85, Andertal'a %15 (ilk yıl). Bu oranı `app_platform_settings`
  tablosunda config edilebilir tut.
- Trial dönemi içinde uninstall → ücret yansıtılmaz.
## DOKÜMANTASYON (`apps/developer/src/app/[locale]/docs/`)
MDX-based, Docusaurus benzeri sidebar. Zorunlu sayfalar:
1. `getting-started.mdx` — 15 dakikada ilk app
2. `authentication.mdx` — OAuth flow + machine-to-machine karşılaştırma
3. `api-reference/` — OpenAPI spec'ten otomatik render (Redocly veya Stoplight Elements)
4. `webhooks.mdx` — event listesi, payload örnekleri, HMAC doğrulama (Node + PHP kod)
5. `scopes.mdx` — her scope ne yapar
6. `manifest.mdx` — alan alan referans
7. `app-types.mdx` — `integration_app` vs `shop_app` farkı, Tier 1/2 erişim
8. `app-review.mdx` — submission kriterleri
9. `sdk-nodejs.mdx` — `@andertal/sdk` npm paketi kullanımı (bu paketi de bu görevde oluştur)
10. `test-stores.mdx` — sandbox seller, fake order üretme
11. `brand-guidelines.mdx`
12. `pricing-revenue-share.mdx`
13. `gdpr-compliance.mdx` — DPA, data retention, app.uninstalled webhook zorunluluğu
OpenAPI spec dosyası: `apps/medusa-backend/openapi/public-api-v1.yaml`. Public API endpoint'lerinden
otomatik üret veya manuel yaz. CI'da spec drift kontrolü.
## VERİTABANI MIGRATION'LARI
Postgres (mevcut `medusa-backend` DB'sinde):
```sql
CREATE TABLE developers (
  id TEXT PRIMARY KEY,                  -- dev_xxx
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
  id TEXT PRIMARY KEY,                  -- app_xxx
  developer_id TEXT REFERENCES developers(id) ON DELETE RESTRICT,
  handle TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,                   -- 'integration_app' | 'shop_app'
  client_id TEXT UNIQUE NOT NULL,
  client_secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | pending_review | published | rejected | suspended
  current_version_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE app_versions (
  id TEXT PRIMARY KEY,
  app_id TEXT REFERENCES apps(id) ON DELETE CASCADE,
  version TEXT NOT NULL,                -- semver
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
  status TEXT NOT NULL,                 -- approved | rejected
  notes TEXT,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);
```
`seller_users` tablosuna ek alan:
```sql
ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS developer_id TEXT REFERENCES developers(id);
```
Bu, sellercentral superuser hesabı ile developer portal hesabını eşler — superuser developer
tier'ı otomatik tespit için.
## GÜVENLİK ZORUNLULUKLARI
- Client secret'lar SHA-256 hash'lenmiş halde saklanır, sadece create/rotate sırasında plaintext gösterilir.
- Access token'lar hash'lenmiş halde saklanır (lookup için prefix index).
- Rate limit: app başına 1000 req/dk, seller+app başına 500 req/dk.
- IP allowlist desteği (developer manifest'te opsiyonel).
- Anomaly detection: bir token saniyede 100+ istek atarsa otomatik suspend + alert.
- Audit log: tüm scope-elevation, install/uninstall, manifest publish event'leri.
## FAZLAR (PR-BAZLI TESLİMAT)
İmplementasyonu **tek PR'da yapma**. Her faz ayrı PR:
**PR 1 — Schema & Module Skeleton**
- Migration'lar, `app-platform` modülü, `scope-registry.ts`, `manifest-validator.ts` (unit testlerle).
- Mevcut `billbee-marketplace-api.js`'ye dokunma.
**PR 2 — OAuth Server + Public API v1**
- `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`.
- `/api/public-api/v1/products` ve `/api/public-api/v1/orders` (read-only) endpoint'leri.
- `requireScope` middleware.
- Mevcut billbee endpoint'lerine **dokunma** — paralel yaşasınlar.
**PR 3 — Developer Portal (Auth + App CRUD)**
- `apps/developer/` Next.js iskelet.
- Signup/login/dashboard.
- App create wizard (sadece `integration_app`).
- Manifest editor (JSON + form view).
- `is_superuser_developer` SQL ile manuel set edilir (PR 3'te admin UI yok).
**PR 4 — Sellercentral App Store**
- `/apps`, `/apps/[handle]`, `/apps/installed` route'ları.
- App store API endpoint'leri (`/api/store/app-store/...`).
- Install/uninstall akışı + OAuth consent screen.
**PR 5 — Webhook System**
- Subscription CRUD, dispatcher, retry queue, HMAC, dead-letter.
- İlk event'ler: `order.created`, `order.paid`, `order.shipped`, `app.uninstalled`.
**PR 6 — Documentation Site + OpenAPI**
- `apps/developer/docs/` MDX content.
- `openapi/public-api-v1.yaml`.
- Redocly UI.
- `@andertal/sdk` npm paketi (Node.js, TypeScript types).
**PR 7 — Shop Apps (Tier 1)**
- `shop_extensions` manifest desteği.
- Shop frontend'de block render mekanizması (iframe veya React federation).
- Sadece `shop_app` + `is_superuser_developer` = true kontrolü.
**PR 8 — Review & Approval Flow**
- Submission validators.
- Admin review UI (sellercentral superuser tarafında yeni route).
- Approve/reject/suspend akışı.
**PR 9 — Stripe Connect & Billing**
- Developer onboarding.
- Subscription lifecycle.
- Monthly payout.
**PR 10 — Migration of First-Party Apps**
- Billbee, SMTP, Trustpilot, Marketing'i internal `integration_app` olarak migrate et.
- `/settings/integrations` sayfasını refactor — sadece kurulu app ayarlarını ve native SMTP'yi göster.
## ACCEPTANCE CRITERIA (PR 1 + PR 2 + PR 3 + PR 4 sonrası MVP)
- [ ] Yeni developer signup olabilir, app oluşturabilir.
- [ ] Developer manifest yazıp `client_id` + `client_secret` alabilir.
- [ ] Tier 2 developer manifest'inde `type: "shop_app"` yazarsa 403 hata alır.
- [ ] Seller `/apps` sayfasında app'i bulup install edebilir.
- [ ] OAuth consent screen scope listesini insan-okur formatta gösterir.
- [ ] App, OAuth ile aldığı access_token ile `/api/public-api/v1/orders` çağırabilir ve sadece o seller'ın siparişlerini görür.
- [ ] App, scope'unda olmayan endpoint'i çağırırsa 403 alır.
- [ ] Seller app'i uninstall edince token revoke olur, app artık o seller'ın verisine erişemez.
- [ ] Mevcut Billbee entegrasyonu **bozulmaz** — paralel çalışır.
## KISITLAR
- Türkçe + Almanca + İngilizce + İspanyolca + İtalyanca + Fransızca i18n desteği (mevcut `next-intl` setup).
- Tüm UI Polaris design system kullanmalı (sellercentral ile tutarlılık).
- Veriler EU bölgesinde kalmalı (GDPR — mevcut `eu-origin` modülü referans).
- Hardcoded credential / secret yok. `.env` veya secret manager kullan.
## ÖNCE NE YAPACAKSIN
1. Bu prompt'u oku, anladığın versiyonu bana özetle.
2. Manifest schema ve scope listesi konusunda eksik/risk gördüğün noktaları soru olarak sor — kod yazma.
3. Onay aldıktan sonra PR 1'i (schema + module skeleton) aç. Tek PR'da hepsini yapma.
4. Her PR'da: migration → service → API → UI sırası izle, her katmanda unit/integration test yaz.
5. Mevcut `billbee-marketplace-api.js`'i referans al ama refactor'unu PR 10'a ertele.
KAFA KARIŞIKLIĞI VARSA: durmadan kod yazma — sor.
