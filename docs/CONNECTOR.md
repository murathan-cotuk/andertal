GÖREV: Andertal ERP Connector Platform — Faz 1 (JTL + Billbee)
## BAĞLAM
Monorepo: apps/medusa-backend (Express/Postgres), apps/sellercentral (Next.js), apps/shop
Mevcut:
- Billbee: billbee-marketplace-api.js + integrations.js (Basic Auth marketplace API)
- Public API: src/routes/public-api-v1.js (OAuth, orders/products/inventory/fulfillments)
- App Platform: developer-api, app-oauth, app-store (docs/developer.md)
- Queue: src/flow-queue.js (Redis/BullMQ pattern — kullan)
- Compliance: src/compliance/resolve-compliance.js (validateProductCompliance — connector'dan çağır)
- JTL Partner Portal + Hub hesapları açıldı (hub.jtl-cloud.com/andertal)
## STRATEJİK HEDEF
SellerCentral'da "Connect your ERP" sayfası. Satıcı JTL veya Billbee seçer, 5 dakikada bağlanır.
Ürünler ERP'den Andertal'a akar. Sipariş Andertal → ERP. Stok çift yönlü.
## MİMARİ (ChatGPT vizyonu + pragmatik fazlama)
Microservice ŞİMDİ DEĞİL. İlk faz medusa-backend içinde modüler connector katmanı.
Yarın apps/connectors/ veya ayrı servis çıkarılabilir — interface aynı kalır.
Seller ERP (JTL-Wawi / Billbee) ↓ Connector Adapter (JTLConnector | BillbeeConnector) ↓ Canonical Product / Order Model ↓ Compliance Engine (resolve-compliance.js) ↓ Catalog Engine (admin-products.js mevcut API'ler) ↓ Marketplace (shop)

ASLA: JTL database'ine direkt bağlanma.
HER ZAMAN: API üzerinden (JTL = SCX Channel API, Billbee = /api/v1/)
## CONNECTOR SDK (yeni modül)
Oluştur: apps/medusa-backend/src/connectors/
```js
// connector-interface.js
// connect(), disconnect(), getConnectionStatus()
// syncProductsFull(), syncProductsDelta(since)
// getStock(sku), updateStock(sku, qty)
// pushOrder(order), updateFulfillment(orderId, tracking)
// handleWebhook(payload) — destekleyenler için
Implementasyonlar:

adapters/billbee-connector.js — mevcut billbee-marketplace-api.js'i wrap et, refactor etme kırma
adapters/jtl-scx-connector.js — YENİ, SCX Channel API
Registry: connectors/registry.js — erp_type → adapter

CANONICAL MODEL (yeni)
Oluştur: apps/medusa-backend/src/connectors/canonical/

// canonical-product.js
{ externalId, sku, ean, title, description, variants[], images[], stock, priceCents, vatPercent, categoryExternalId, attributes{}, manufacturer, source: 'jtl'|'billbee', raw }
// canonical-order.js
{ externalOrderId, lineItems[], customer, shippingAddress, totals, status }
Mapper'lar:

mappers/jtl-to-canonical.js
mappers/billbee-to-canonical.js
mappers/canonical-to-andertal.js — admin_hub product/listing formatına
QUEUE (mevcut flow-queue kullan)
Yeni job tipleri:

connector.sync.full — ilk sync
connector.sync.delta — delta (updated_since)
connector.stock.push
connector.order.push
connector.fulfillment.pull
jtl.scx.poll.events — SCX event polling (60s)
ASLA sync'i HTTP request içinde senkron yapma. Queue → worker → Andertal DB.

10.000 ürün = chunked batch (100'lük), progress sellercentral'da göster.

JTL ENTEGRASYONU (KRİTİK — doğru model)
JTL için URL/username/password YOK. SCX Channel API:

Sandbox: https://scx-sbx.api.jtl-software.com Prod: https://scx.api.jtl-software.com

Env:

JTL_SCX_CHANNEL_REFRESH_TOKEN
JTL_SCX_API_BASE
JTL_SCX_CHANNEL_ID=ANDERTAL
JTL modülleri
src/modules/jtl-scx/auth.js — POST /v1/auth, token cache
src/modules/jtl-scx/event-poller.js — GET/DELETE /v1/channel/event
src/modules/jtl-scx/metadata-bootstrap.js — categories, price types, attributes
src/routes/jtl-scx-channel.js — outbound SCX calls
src/routes/jtl-scx-signup.js — seller sign-up/update session complete
JTL akış
Satıcı JTL-Wawi → Platforms → Andertal → signUpUrl (sessionId)
Sellercentral signup sayfası → login → POST /v1/channel/seller
Event poller: Seller:Offer.New/Update → canonical → compliance → catalog
Andertal sipariş → SCX channel order event → JTL
Seller:Order.Shipping → tracking → store_orders
Media URL'leri 7 gün expire — görselleri Andertal media'ya kopyala.

DB tabloları
admin_hub_erp_connections: seller_id, erp_type, status, config jsonb, linked_at
admin_hub_erp_sync_state: seller_id, erp_type, last_full_sync, last_delta_sync, cursor
admin_hub_erp_external_map: seller_id, erp_type, external_id, entity_type, andertal_id
admin_hub_jtl_sellers (JTL-specific)
admin_hub_erp_sync_log: job_id, status, counts, errors
BILLBEE (mevcut kodu connector'a taşı)
Billbee zaten çalışıyor — billbee-connector.js:

Mevcut /api/v1/orders, /products, /stock kullan
order-update webhook stub'ını GERÇEK implement et (şu an 204 boş dönüyor — TASKS.md)
Sellercentral'da Billbee credentials UI zaten var — erp_connections tablosuna migrate et
COMPLIANCE
canonical → validateProductCompliance() çağır (resolve-compliance.js) Eksik alan varsa: product status = draft, seller'a "Missing WEEE Number" bildirimi Publish gate: compliance blocked_publish_without alanları dolu değilse active olmasın

SELLERCENTRAL UI
Yeni sayfa: apps/sellercentral/src/app/[locale]/settings/erp/page.jsx veya /integrations/erp

"Connect your ERP" grid:

JTL (aktif)
Billbee (aktif)
Xentral, Plentymarkets, Shopify, WooCommerce, Shopware, Amazon, Otto → "Coming soon" badge
JTL kartı:

Durum: Bağlı / Bağlı değil
Talimat: "JTL-Wawi → Platforms → Andertal → Connect"
Sign-up callback sayfası: /integrations/jtl/signup?sessionId=...
Son sync zamanı, ürün sayısı, hata logu
[Disconnect] butonu
Billbee kartı:

Mevcut Billbee settings'i buraya taşı veya linkle
i18n: de, en, tr minimum

DELTA SYNC
Her 5 dakika cron/queue:

Billbee: GET /products?updated_since=... (endpoint yoksa full sync fallback)
JTL: event poller zaten delta mantığı
Stock çift yönlü:

Andertal sipariş → stock düş → connector.updateStock() → ERP
ERP stock change → connector → Andertal inventory
DOKÜMANTASYON
docs/erp-connectors.md — mimari, env, test checklist docs/jtl-integration.md — SCX setup, sandbox Wawi SQL

KABUL KRİTERLERİ

 Connector SDK interface + registry

 Canonical model + mappers

 Queue jobs çalışıyor (flow-queue)

 Billbee connector wrapper + webhook fix

 JTL SCX auth + event poller + signup flow

 SellerCentral ERP connect sayfası

 Compliance check connector pipeline'da

 Mevcut Billbee/public-api bozulmuyor

 Token yoksa JTL poller graceful skip (warn log)
FAZ 2 (bu PR'da YAPMA — sadece TODO comment)
Xentral, plentymarkets adapter
Ayrı microservice extraction
Webhook-first (JTL polling yerine, desteklenince)
Andertal Connect standalone product
KURALLAR
Minimal diff, mevcut pattern'leri takip et (integrations.js, flow-queue.js, admin-products.js)
Yeni connector = yeni adapter dosyası, core değişmez
JTL DB'ye ASLA bağlanma
Test: mevcut lint + ilgili route'lar
---
# SENİN YAPACAKLARIN
## Bugün (15 dk)
**1. JTL’ye sandbox token iste**  
Partner Portal’da SCX token yoksa ticket/mail at. Token gelmeden JTL test edilemez; kod yazılabilir.
**2. Agent moduna geç**  
Yukarıdaki talimatı Claude/Cursor’a yapıştır.
**3. Redis kontrol**  
Connector queue için `REDIS_URL` production’da ayarlı mı bak (`flow-queue.js` kullanıyor).
---
## Token gelince (30 dk)
**4. Env ekle (Render/backend):**
JTL_SCX_CHANNEL_REFRESH_TOKEN=<JTL'den> JTL_SCX_API_BASE=https://scx-sbx.api.jtl-software.com JTL_SCX_CHANNEL_ID=ANDERTAL

**5. Partner Portal’da URL’leri tanımla:**
- Sign-up: `https://sellercentral.andertal.com/de/integrations/jtl/signup`
- Update: `https://sellercentral.andertal.com/de/integrations/jtl/update`
---
## Test (1–2 saat, Windows gerekir)
**6. JTL-Wawi 1.8+ kur**  
Sandbox seller token + MSSQL SQL (JTL docs):
```sql
INSERT INTO SCX.tRefreshToken (cRefreshToken, nType) VALUES (N'<SellerToken>', 1);
UPDATE dbo.tOptions SET cValue = 'https://scx-sbx.api.jtl-software.com' WHERE ckey = 'SCX.URL';
7. Test akışı:

Wawi → Platforms → Andertal → Connect
Ürün ekle → Sellercentral/shop’ta görünüyor mu
Shop’tan sipariş → Wawi’de görünüyor mu
Wawi’de kargo no → Andertal’da tracking güncelleniyor mu
Paralel (token beklemeden)
8. Billbee’yi test et
Mevcut entegrasyon + webhook fix connector PR’ında gelir. Tekstil partnerin Billbee kullanıyorsa önce onu canlıya al.

ChatGPT’den aldığımız / atladığımız
ChatGPT dedi	Gerçek
URL + username + password
❌ JTL için yanlış — SCX sign-up flow
Ayrı microservice hemen
❌ Önce monorepo içi SDK; sonra ayır
RabbitMQ/Kafka
⚠️ flow-queue.js (Redis) zaten var — onu kullan
Connector SDK
✅ Doğru — yapılacak
Canonical model
✅ Doğru — yapılacak
Compliance engine
✅ Zaten var — bağlanacak
8 ERP hemen
❌ Faz 1: JTL + Billbee; diğerleri Coming soon
Özet
Kim	Ne
Claude
Connector SDK + JTL SCX + Billbee wrapper + queue + ERP sayfası
Sen
JTL token iste, env koy, Partner URL tanımla, Wawi ile test et
Agent moduna geç, talimatı yapıştır. Token gelene kadar kod yazılır; token gelince test edersin.