
# GÖREV: Andertal Affiliate Platform — affiliate.andertal.com
## BAĞLAM
Andertal monorepo (`apps/medusa-backend`, `apps/sellercentral`, `apps/shop`) üzerinde multi-vendor
e-ticaret platformu. Paralel olarak `apps/developer/` (App Platform) geliştiriliyor — onunla
Stripe Connect ve auth katmanlarını paylaşacak. Mevcut Stripe entegrasyonu (`stripe_test.txt`),
`flow-queue.js` Redis worker mantığı, `next-intl` i18n, Polaris design system kullanılıyor.
TALIMAT.md'de Almanya-odaklı, EU-origin, GDPR'a duyarlı tasarım kararları var.
## ÜRÜN HEDEFİ
1. **`affiliate.andertal.com`** — Affiliate'lerin kayıt olduğu, link ürettiği, kazancını gördüğü Next.js portal.
2. Shop + sellercentral tarafında **tracking middleware** (`?ref=AFF_XXX` capture, GDPR-uyumlu).
3. Backend tarafında attribution engine, commission calculator, payout scheduler, fraud detector.
4. Sellercentral'da **`/marketing/affiliate`** sayfası — seller'ların ürün ürün affiliate programına ekleyeceği yer.
5. Sellercentral superuser tarafında **`/affiliate-admin`** — affiliate onay, fraud queue, payout override.
## İKİ AFFILIATE MODELİ
### Model 1 — Seller Referral (Recurring)
- Affiliate, sellercentral signup linki üretir: `sellercentral.andertal.com/[locale]/signup?ref=AFF_XXX`.
- Seller bu linkten kayıt olur ve superuser onaylar.
- Seller'ın aylık GMV'sinden Andertal her zaman %12 komisyon alır.
- Bu %12'nin **%10'u affiliate'e ödenir** = GMV'nin efektif %1,2'si.
- **Süre**: İlk 24 ay tier1 (%10), sonrası tier2 (%3). Lifetime DEĞİL.
- Bir seller sadece **bir** affiliate'e bağlı kalır (lock-in: ilk attribute eden alır).
- Seller referral attribution window: **24 saat** (product window'dan ayrı — daha kısa).
### Model 2 — Product Referral (Per-Product Opt-in)
- Affiliate, **sadece** seller tarafından affiliate programına eklenmiş ürünler için link üretebilir.
- Müşteri linkten gelir, 30 gün içinde alışveriş yaparsa affiliate komisyon kazanır.
- **Komisyon**: **Sabit %3,5** (negotiate yok, boost yok). **Minimum 0,15 € floor.**
- **Para kaynağı**: Andertal %12 dokunulmaz; seller affiliate ürünlerinde ek olarak %3,5 öder.
  Toplam seller maliyeti affiliate ürünlerde: **%15,5**. Affiliate olmayan ürünlerde değişmez (%12).
- **Granülarite**: Per-product. Seller `/marketing/affiliate` sayfasından tek tek veya bulk ekler.
### Wind-down Modeli — Affiliate Koruma (3 Katman, Toplam 74 gün garanti)
Seller bir ürünü programa ekledikten sonra çıkarmak istediğinde affiliate'in mağdur olmaması için:
1. **Min lock-in (30 gün)** — Program eklenen ürün ilk 30 gün çıkarılamaz. UI'da Remove disabled.
2. **Wind-down (14 gün)** — 30 gün dolunca "Schedule removal" yapılır. 14 gün boyunca:
   - Mevcut affiliate linkler çalışır, komisyon üretmeye devam eder.
   - **Yeni link üretilemez** (frontend disabled + backend 409).
   - Affiliate'lere otomatik e-mail + dashboard'da "Active links affected" widget.
3. **Attribution survival (30 gün)** — Wind-down öncesi tıklamalar 30 günlük attribution penceresini
   tamamlar; bu pencere içinde satın alma olursa komisyon ödenir.
**Emergency override**: Sadece superuser (yasal sorun, recall, fraud için). Affiliate'lere açıklayıcı
e-mail + **son 90 gündeki tüm confirmed commission'lar clawback olmaz, ödeme garantilidir**.
## KARAR TABLOSU (Tek Kaynak — Kod Yazarken Bunu Referans Al)
| Karar | Değer |
|---|---|
| Attribution window (product) | 30 gün |
| Attribution window (seller signup) | 24 saat |
| Attribution modeli | Last-click |
| Self-referral | Yasak — email/phone/payment match'te otomatik reject + high fraud flag |
| IP/cihaz match | Otomatik flag (block değil); 3+ flag birikince suspend |
| Refund clawback | Zorunlu — pending'de iptal, paid'de bir sonraki payout'tan düş, negatif bakiyeye izin var |
| Chargeback | Clawback + medium fraud flag; 3+/90 gün = auto-suspend |
| Minimum payout | 50 EUR |
| Payout periyodu | Aylık, ayın 1'i UTC 03:00; net 30 confirmation hold |
| Cookie consent | TTDSG + GDPR — explicit "Marketing/Affiliate" onayı şart, reject ise tracking yok |
| KYC | Stripe Connect basic her affiliate; 600 EUR/yıl üstü DAC7 tam KYC + Steuer-ID |
| Brand bidding | Yasak (andertal + varyantları); ihlal → uyarı → ban + komisyon müsadere |
| Affiliate kodu | `AFF_` + 8 char base32 auto; approve sonrası vanity slug opsiyonel |
| Onay modu | İlk 100: manuel. Sonrası: trust-score auto-approve |
| MLM/sub-affiliate | Yasak — tek seviyeli |
| Coupon affiliate | MVP dışı, PR 11+ |
| Coğrafi kapsam | EU + UK + CH (MVP) |
| Currency | EUR (sadece) |
| Influencer disclosure banner | Affiliate'li ziyarette ilk landing'de tek seferlik discrete banner |
| Ban sonrası bakiye | Fraud ban: tüm bakiye müsadere. Non-fraud ban: confirmed bakiye ödenir, pending iptal |
| Hesap kapatma | Self-service; confirmed bakiye ödenir; data 6 yıl §147 AO retention |
| Affiliate API | v1: clicks, commissions, payouts read endpoints (Bearer token) |
| Çoklu affiliate çakışması | Lock-in: ilk attribute'ı oluşturan affiliate sahibi, sonradan değişmez |
| **Seller referral tier1** | **%10 — ilk 24 ay** |
| **Seller referral tier2** | **%3 — 24 ay sonrası** |
| **Product affiliate rate** | **Sabit %3,5, min 0,15 € floor** |
| **Product affiliate granülaritesi** | **Per-product (seller seçer)** |
| **Min lock-in** | **30 gün** |
| **Wind-down** | **14 gün** |
| **Attribution survival** | **30 gün (click bazlı)** |
| **Emergency removal** | **Sadece superuser; affiliate'lere son 90 gün ödeme garantili** |
### Compliance Gate'leri (PR Merge Öncesi Zorunlu)
- **PR 7 (Payout) merge öncesi**: Steuerberater vergi modülü review'u + DAC7 raporlama logic doğrulaması.
- **PR 9 (Consent banner) merge öncesi**: Hukuk danışmanı TTDSG/GDPR onayı; cookie kategorilendirmesi.
- **PR 10 (Terms) merge öncesi**: Avukat affiliate sözleşmesi review'u (brand bidding, ban, müsadere, wind-down maddeleri).
### Karar Değişikliği Prosedürü
Tablodaki herhangi bir karar değişirse: önce tablo → sonra `config.js` + migration → açık PR'lar rebase.
## MİMARİ
```
apps/
├── medusa-backend/
│   └── src/
│       ├── modules/affiliate-platform/
│       │   ├── models/
│       │   │   ├── affiliate.ts
│       │   │   ├── affiliate-link.ts
│       │   │   ├── affiliate-click.ts
│       │   │   ├── affiliate-attribution.ts
│       │   │   ├── affiliate-commission.ts
│       │   │   ├── affiliate-payout.ts
│       │   │   ├── affiliate-fraud-flag.ts
│       │   │   ├── seller-referral.ts
│       │   │   └── product-affiliate-enrollment.ts
│       │   ├── service.ts
│       │   ├── attribution-engine.ts
│       │   ├── commission-calculator.ts
│       │   ├── fraud-detector.ts
│       │   ├── payout-scheduler.ts
│       │   └── enrollment-lifecycle.ts
│       ├── workers/
│       │   ├── commission-recalc.js              (order.paid → komisyon yarat)
│       │   ├── commission-clawback.js            (order.refunded → clawback)
│       │   ├── commission-confirm.js             (cron, daily — 30 gün geçenleri confirm)
│       │   ├── enrollment-lifecycle.js           (cron, hourly — wind-down state machine)
│       │   ├── monthly-payout.js                 (cron, ayın 1'i UTC 03:00)
│       │   └── seller-referral-monthly.js        (cron, ayın 1'i — Model 1 komisyon hesabı)
│       └── api/
│           ├── affiliate/                        (affiliate.andertal.com için, JWT)
│           │   ├── auth/
│           │   ├── dashboard/
│           │   ├── links/
│           │   ├── reports/
│           │   ├── payouts/
│           │   └── seller-referrals/
│           ├── public/affiliate-track/           (cookie set, shop + sellercentral'dan)
│           ├── admin/affiliate/                  (superuser onay/fraud/payout)
│           └── sellercentral/affiliate-marketing/ (/marketing/affiliate backend)
│
├── shop/
│   └── middleware.js                             (?ref capture + cookie consent check)
│
├── sellercentral/
│   ├── middleware.ts                             (signup sayfasında ?ref capture)
│   └── src/app/[locale]/
│       ├── marketing/
│       │   └── affiliate/page.jsx                (YENİ — per-product enrollment)
│       └── affiliate-admin/                      (YENİ — superuser only)
│           ├── page.jsx
│           ├── pending/page.jsx
│           ├── fraud/page.jsx
│           └── payouts/page.jsx
│
└── affiliate/                                    (YENİ — affiliate.andertal.com)
    └── src/app/[locale]/
        ├── (auth)/signup/page.jsx
        ├── (auth)/login/page.jsx
        ├── dashboard/page.jsx
        ├── links/page.jsx
        ├── links/new/page.jsx
        ├── referrals/page.jsx                    (getirdiğim seller'lar)
        ├── reports/page.jsx
        ├── payouts/page.jsx
        ├── settings/page.jsx                     (Stripe Connect, vergi)
        ├── resources/page.jsx                    (banner, marketing materyali)
        └── terms/page.jsx                        (hukuki uzun sözleşme DE/EN)
```
## VERİTABANI MIGRATION'LARI
```sql
CREATE TABLE affiliates (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,                       -- AFF_K3X9MNQ7
  vanity_slug TEXT UNIQUE,                         -- /r/john-smith opsiyonel
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  company_name TEXT,
  country TEXT,
  vat_number TEXT,
  tax_id TEXT,                                     -- DAC7 600€+ için
  stripe_account_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending | active | suspended | banned | closed
  ban_reason TEXT,                                 -- fraud | tos_violation | self_closed | ...
  terms_accepted_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE affiliate_links (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT REFERENCES affiliates(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                              -- 'seller_signup' | 'product' | 'category' | 'storefront'
  target_url TEXT NOT NULL,
  short_code TEXT UNIQUE NOT NULL,                 -- /r/{short_code}
  product_id TEXT,                                 -- type='product' ise enrollment check için
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE affiliate_clicks (
  id TEXT PRIMARY KEY,
  link_id TEXT REFERENCES affiliate_links(id) ON DELETE CASCADE,
  affiliate_id TEXT REFERENCES affiliates(id),
  ip_hash TEXT,                                    -- SHA-256 (GDPR pseudonymization)
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  cookie_id TEXT,                                  -- anonymous visitor id
  consent_marketing BOOLEAN NOT NULL,              -- false ise click tutulur ama attribution yapılmaz
  bot_flagged BOOLEAN DEFAULT FALSE,
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE affiliate_attributions (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT REFERENCES affiliates(id),
  cookie_id TEXT NOT NULL,
  source_type TEXT NOT NULL,                       -- 'product' | 'seller_signup' | 'storefront'
  product_id TEXT,                                 -- product type ise
  first_click_at TIMESTAMPTZ NOT NULL,
  last_click_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,                 -- product: +30 gün, seller_signup: +24 saat
  resolved_order_id TEXT,
  resolved_seller_id TEXT,
  resolved_at TIMESTAMPTZ
);
CREATE TABLE seller_referrals (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT REFERENCES affiliates(id) ON DELETE RESTRICT,
  seller_id TEXT NOT NULL UNIQUE,
  referred_at TIMESTAMPTZ DEFAULT NOW(),
  commission_tier_active BOOLEAN DEFAULT TRUE,
  tier1_until TIMESTAMPTZ,                         -- referred_at + 24 ay
  current_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  notes TEXT
);
CREATE TABLE product_affiliate_enrollments (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending | active | min_lockin | winding_down | removed | emergency_removed
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  min_lockin_until TIMESTAMPTZ NOT NULL,           -- enrolled_at + 30 days
  winddown_started_at TIMESTAMPTZ,
  winddown_ends_at TIMESTAMPTZ,                    -- winddown_started_at + 14 days
  removed_at TIMESTAMPTZ,
  emergency_removed_by TEXT,
  commission_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 3.50,
  commission_floor_cents INT NOT NULL DEFAULT 15,
  UNIQUE (product_id, seller_id)
);
CREATE INDEX idx_product_affiliate_status ON product_affiliate_enrollments(status);
CREATE INDEX idx_product_affiliate_winddown ON product_affiliate_enrollments(winddown_ends_at)
  WHERE status = 'winding_down';
CREATE TABLE affiliate_commissions (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT REFERENCES affiliates(id),
  source_type TEXT NOT NULL,                       -- 'seller_referral' | 'product_sale'
  order_id TEXT,
  seller_id TEXT,
  product_id TEXT,
  gross_amount_cents INT NOT NULL,
  rate_pct DECIMAL(5,2) NOT NULL,
  commission_cents INT NOT NULL,                   -- floor uygulanmış
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending | confirmed | clawed_back | paid | forfeited
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  confirmable_at TIMESTAMPTZ NOT NULL,             -- earned + 30 gün
  payout_id TEXT,
  emergency_protected BOOLEAN DEFAULT FALSE        -- emergency_removed durumunda clawback'ten korunur
);
CREATE TABLE affiliate_payouts (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT REFERENCES affiliates(id),
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,                            -- pending | processing | paid | failed
  stripe_transfer_id TEXT,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE TABLE affiliate_fraud_flags (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT REFERENCES affiliates(id),
  flag_type TEXT NOT NULL,
    -- 'self_referral' | 'ip_match' | 'velocity' | 'pattern' | 'chargeback' | 'brand_bid' | 'manual'
  severity TEXT NOT NULL,                          -- 'low' | 'medium' | 'high'
  details JSONB,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Mevcut tablolara ek
ALTER TABLE seller_users ADD COLUMN IF NOT EXISTS referred_by_affiliate_id TEXT REFERENCES affiliates(id);
```
## DEFAULT PARAMETRELER (`modules/affiliate-platform/config.js`)
```js
module.exports = {
  // Attribution
  PRODUCT_ATTRIBUTION_WINDOW_DAYS: 30,
  SELLER_SIGNUP_ATTRIBUTION_WINDOW_HOURS: 24,
  ATTRIBUTION_MODEL: 'last_click',
  // Seller Referral (Model 1)
  SELLER_REFERRAL_TIER1_PCT: 10,
  SELLER_REFERRAL_TIER1_DURATION_MONTHS: 24,
  SELLER_REFERRAL_TIER2_PCT: 3,
  // Product Referral (Model 2)
  PRODUCT_REFERRAL_PCT_FIXED: 3.5,
  PRODUCT_REFERRAL_FLOOR_CENTS: 15,
  PRODUCT_AFFILIATE_MIN_LOCKIN_DAYS: 30,
  PRODUCT_AFFILIATE_WINDDOWN_DAYS: 14,
  PRODUCT_AFFILIATE_ATTRIBUTION_SURVIVAL_DAYS: 30,
  EMERGENCY_REMOVAL_PROTECTION_DAYS: 90,
  // Payout
  MIN_PAYOUT_EUR: 50,
  PAYOUT_DAY_OF_MONTH: 1,
  CONFIRMATION_HOLD_DAYS: 30,
  // Cookie & Tracking
  COOKIE_NAME: '__atrl',
  COOKIE_MAX_AGE_SECONDS: 30 * 86400,
  // Fraud & Compliance
  SELF_REFERRAL_AUTO_BLOCK: true,
  IP_MATCH_AUTO_FLAG: true,
  CHARGEBACK_AUTO_SUSPEND_THRESHOLD: 3,
  CHARGEBACK_SUSPEND_WINDOW_DAYS: 90,
  FRAUD_FLAGS_AUTO_SUSPEND_THRESHOLD: 3,
  KYC_REQUIRED_OVER_EUR: 600,                      // DAC7
  // Approval
  MANUAL_APPROVAL_FIRST_N_AFFILIATES: 100,
  // Geography
  ALLOWED_COUNTRIES: ['DE','AT','CH','NL','BE','LU','FR','IT','ES','PT','IE','DK','SE','FI','PL','GB'],
};
```
## TRACKING & ATTRIBUTION
### Cookie Set Akışı (shop + sellercentral middleware)
1. URL'de `?ref=AFF_XXX` görünür.
2. Mevcut cookie consent state'i kontrol edilir.
3. **Marketing/Affiliate kategorisi onaylı değilse**: click DB'ye kaydedilir (`consent_marketing=false`), cookie set EDİLMEZ, attribution oluşturulmaz.
4. Onaylıysa: `__atrl` cookie set edilir (30 gün, SameSite=Lax, Secure).
5. Click `affiliate_clicks`'e yazılır, `affiliate_attributions` upsert edilir (cookie_id key).
### Order Completion
1. `order.paid` event → `commission-recalc` worker.
2. Order'ın `customer_id` veya `cookie_id` üzerinden son 30 gün'deki son attribution bulunur.
3. Her line item için:
   - Seller'ın o ürün için aktif `product_affiliate_enrollments` row'u var mı?
   - Status `active` | `min_lockin` | `winding_down` ise → komisyon yarat.
   - `winding_down`'da: enrollment'tan değil, **attribution penceresinden** kontrol et — click wind-down'dan önce miydi? Evet ise komisyon yarat.
   - `removed` ise: attribution survival check — click `removed_at`'ten önce ve 30 gün penceresi içindeyse → komisyon yarat.
   - Komisyon: `max(line_total * 3.5%, 15 cents)`.
4. `affiliate_commissions` row'u `status = 'pending'`, `confirmable_at = now + 30 gün`.
### Refund / Chargeback
- `order.refunded` → ilgili commission `status = 'clawed_back'` (emergency_protected=true ise yok).
- Chargeback → `clawed_back` + fraud_flag(medium). 3+/90 gün → auto-suspend.
### Confirmation
- Daily cron: `confirmable_at <= now` AND `status='pending'` → `confirmed`.
## WIND-DOWN STATE MACHINE (`enrollment-lifecycle.js`, hourly cron)
```
pending → active                  (enrollment yaratıldıktan 5 dk sonra)
active → min_lockin               (her zaman aktif; min_lockin_until > now ise UI'da Remove disabled)
active/min_lockin → winding_down  (seller "Schedule Removal" tıkladı, min_lockin_until <= now ise)
winding_down → removed            (winddown_ends_at <= now)
[any] → emergency_removed         (superuser manuel)
```
`winding_down` ve `removed` ürünler için `affiliate_links` oluşturmaya çalışma → 409.
`emergency_removed` olunca: son 90 gündeki tüm bu ürün için commission'lar `emergency_protected=true`.
## FRAUD DETECTION (`fraud-detector.ts`)
Her commission yaratıldığında çalışır:
1. **Self-referral**: customer.email/phone/payment == affiliate.email/phone/payment → block + high flag.
2. **IP match**: click ip_hash == order ip_hash + same hour → medium flag.
3. **Velocity**: 24 saatte 50+ click → low flag.
4. **Pattern**: tüm conversion'lar aynı country + same time-of-day band → low flag.
5. **Chargeback**: 3+ / 90 gün → auto-suspend.
6. **Brand bid**: Aylık manuel + scriptli "andertal" Google/Bing Ads taraması; tespit → manual flag (high).
7. Toplam aktif flag ≥ 3 → auto-suspend.
## PAYOUT (`monthly-payout.js`)
- Cron: ayın 1'i, UTC 03:00.
- `affiliate_commissions` WHERE `status='confirmed'` AND `payout_id IS NULL` → group by affiliate.
- Toplam < 50 EUR → carry-over.
- ≥ 50 EUR ve `affiliate.status='active'` ve KYC ok → `affiliate_payouts` row + Stripe Connect transfer.
- KYC eksikse payout block, affiliate'e uyarı maili.
## SELLERCENTRAL — `/marketing/affiliate` (Her Seller)
Mevcut sellercentral marketing menüsünün altına "Affiliate" alt-menü eklenir.
**Layout (Polaris):**
- Top: KPI bar (bu ay satış, gelir, ödenen komisyon).
- "Add Products" wizard: ürün arama + bulk multi-select + confirmation modal ("12 ürün eklenecek, %3,5 komisyon, min bağlılık 30 gün, devam?").
- Table:
  - Kolonlar: Checkbox, Ürün (image + name + SKU), Rate (%3,5), Clicks (30g), Status badge, Actions menu.
  - Status badge'ler: `Active` (yeşil), `Min Lock-in: 18d remaining` (sarı), `Winding Down: 8d remaining` (turuncu), `Removed` (gri).
  - Actions: "Remove" sadece `min_lockin_until <= now` olanlarda enabled; tıklanınca "Schedule Removal" confirmation modal'ı (14 gün wind-down açıklamalı).
- Bulk actions: bulk schedule removal (her ürün için ayrı min_lockin kontrolü; uygun olmayanlar skip + toast bilgisi).
- Üst banner: wind-down kuralları kısa metin.
## SELLERCENTRAL — `/affiliate-admin` (Superuser Only)
Sayfalar:
- **Pending**: signup approve/reject queue, KYC doc preview.
- **Fraud**: aktif fraud_flags listesi, severity'ye göre filtre, "Resolve / Suspend / Ban" actions.
- **Payouts**: tüm payout history, failed transfer retry, manual override.
- **Commission Adjustments**: manuel claw-back veya bonus (audit log'a yazılır).
- **Emergency Removal**: seller bazlı ürün emergency_remove butonu (gerekçe zorunlu, e-mail trigger).
## SHOP — UI Eklemeleri
1. **Cookie consent banner**: Mevcut sisteme "Marketing/Affiliate" kategorisi eklenir (GDPR/TTDSG). Reject ederse `__atrl` set edilmez.
2. **Product page**: `?ref=AFF_XXX` ile gelinmişse ilk landing'de tek seferlik discrete banner: *"Bu ziyaret bir affiliate link üzerinden gerçekleşti. Aldığınız üründen değişiklik olmaz. [Lerne mehr]"* — BGH 2017 disclosure kararları gereği.
3. **Short URL redirect**: `andertal.com/r/{short_code}` → 302 redirect to target_url + `?ref=AFF_XXX` (cookie middleware yakalar).
## AFFILIATE PORTAL — `apps/affiliate/`
Next.js 14 App Router, next-intl, Polaris (sellercentral ile tutarlı), JWT auth.
### Dashboard
KPI kartları (bu ay clicks/conversions/pending/lifetime) + 30-gün grafiği + top 5 link + top 5 referred seller + "Active links affected" widget (winding_down ürünler).
### Links
- "New Link" wizard: tip seç → seller_signup / product / category / storefront.
- Product link'te: arama + sadece `status IN ('active','min_lockin','winding_down')` ürünler listelenir. `winding_down` olanlar gri + uyarı.
- Short URL + QR kod indirme.
- Per-link metrikler tablosu.
### Referrals (Sellers)
- Getirdiğim seller'lar (anonimize): "S-1234", signup tarihi, status, bu ay earnings, lifetime earnings, tier badge (Tier1/Tier2).
- Tier1'den Tier2'ye geçiş için gün sayısı.
### Reports
Tarih aralığı + link + source type filtreleri + CSV export + günlük/haftalık/aylık breakdown.
### Payouts
Sonraki payout tarihi + tahmini tutar + history (Stripe transfer ID linkli).
### Settings
Profil, Stripe Connect onboarding, vergi bilgileri (DAC7 600€ üstünde Steuer-ID zorunlu).
### Resources
Andertal logo (light/dark), banner setleri (728x90 / 300x250 / 1080x1080 / 1080x1920), DE+EN marketing copy, brand guideline PDF.
### Terms (`/terms`)
Hukuki olarak detaylı affiliate sözleşmesi DE + EN. Mutlaka kapsayacak maddeler:
- 24 ay sonrası tier1 → tier2 düşüş (Model 1)
- %3,5 sabit rate + min 0,15 € floor (Model 2)
- Per-product enrollment + min 30 gün lock-in + 14 gün wind-down + 30 gün attribution survival
- Self-referral yasağı + sonuçları (commission müsadere)
- Brand bidding yasağı (andertal + varyantlar)
- IP/cihaz match, velocity, chargeback kuralları
- Refund clawback otomatik
- Cookie consent zorunluluğu (TTDSG)
- DAC7 raporlama (600€ üstü)
- Ban sonrası bakiye prosedürü (fraud ban: tüm müsadere; non-fraud: confirmed ödenir)
- 6 yıl data retention §147 AO
- Geçerli hukuk: Almanya, yetkili mahkeme
## FAZLAR (PR-Bazlı Teslimat)
**Tek PR'da hepsini yapma.** Her faz ayrı PR:
| PR | İçerik |
|---|---|
| **PR 1** | Schema migration + module skeleton + config + attribution-engine + scope unit testleri (UI yok). |
| **PR 2** | Tracking middleware (shop + sellercentral) + cookie consent integration + `affiliate_clicks` write path + short URL redirect. |
| **PR 3** | Affiliate portal iskelet: signup, login, dashboard, link generator UI + backend CRUD. |
| **PR 4** | Order event hook: `commission-recalc` + `commission-clawback` + `commission-confirm` worker'ları. |
| **PR 5** | Sellercentral `/marketing/affiliate` sayfası + `product_affiliate_enrollments` API + `enrollment-lifecycle` worker (state machine: pending → active → min_lockin → winding_down → removed). |
| **PR 6** | Seller referral flow: signup capture, `seller_referrals` row, `seller-referral-monthly` worker (tier1/tier2 logic). |
| **PR 7** | Payout system: minimum threshold, Stripe Connect transfer, payout webhook handler. **Steuerberater gate.** |
| **PR 8** | Fraud detection + sellercentral `/affiliate-admin` paneli (pending, fraud queue, payouts, commission adjustments, emergency removal). |
| **PR 9** | Shop cookie consent banner update (TTDSG/GDPR compliance) + affiliate disclosure banner + brand bid manual monitoring scripti. **Hukuk gate.** |
| **PR 10** | Reports + CSV export + Resources + Terms (hukuki uzun metin DE/EN). **Avukat gate.** |
## ENTEGRASYON: DEVELOPER PLATFORM İLE ORTAK ALTYAPI
`apps/developer/` paralel olarak yapılıyor. Ortak katmanları paylaşılan paketlere çıkar (PR 3 sonrası refactor):
```
packages/
├── platform-auth/         (JWT helper'ları)
├── platform-stripe/       (Connect Express onboarding)
└── platform-ui/           (Polaris-based shared components: KPI cards, link table)
```
Premature abstraction yapma — önce developer + affiliate ayrı kalsın, **PR 3 sonrası** ortaklığı çıkar.
## ACCEPTANCE CRITERIA (MVP)
### Affiliate
- [ ] Yeni affiliate signup → email verify → Stripe Connect onboarding → status `active`.
- [ ] Affiliate dashboard'da link üretebilir, short URL alır.
- [ ] Link üretirken sadece `active/min_lockin/winding_down` enrollment'lı ürünleri görür.
### Tracking
- [ ] `?ref=AFF_XXX` ile gelen ziyaretçi cookie alır (consent verdiyse).
- [ ] Cookie consent reddederse cookie set edilmez, click DB'ye `consent_marketing=false` yazılır, attribution yaratılmaz.
- [ ] Short URL `andertal.com/r/{code}` → 302 redirect çalışır.
### Commission — Product
- [ ] Müşteri affiliate link'ten gelir, 30 gün içinde affiliate-enrolled ürün alır → pending commission.
- [ ] 30 gün sonra commission `confirmed`, ayın 1'inde payout.
- [ ] Komisyon = `max(line_total * 3.5%, 15 cents)`. %3,5 sabit, floor uygulanır.
- [ ] Refund → clawback (emergency_protected hariç).
### Wind-down
- [ ] Seller programa ürün ekler → 30 gün boyunca Remove disabled (UI + 409).
- [ ] 30 gün sonra "Schedule Removal" → status `winding_down`, 14 gün geri sayım.
- [ ] `winding_down` ürün için affiliate yeni link üretemez, mevcut linkler komisyon üretir.
- [ ] `winding_down` ürün affected affiliate'lere otomatik e-mail + dashboard widget.
- [ ] 14 gün sonra `removed`, attribution penceresi (30 gün) içindeki click'lerden satış olursa hâlâ komisyon ödenir.
- [ ] Superuser emergency removal → son 90 gün confirmed commission `emergency_protected=true`, clawback'ten korunur.
### Seller Referral
- [ ] Sellercentral signup linkinde `?ref=AFF_XXX` → `seller_users.referred_by_affiliate_id` set.
- [ ] Superuser onayı sonrası `seller_referrals` row yaratılır, `tier1_until = now + 24 month`.
- [ ] Aylık worker seller'ın o ayki Andertal komisyonunu hesaplar, tier1 ise %10, tier2 ise %3.
- [ ] 24 ay dolunca otomatik tier2'ye geçer.
### Fraud
- [ ] Self-referral: aynı email/phone/payment → otomatik reject + high flag.
- [ ] IP match → medium flag, 3+ flag birikince auto-suspend.
- [ ] Chargeback 3+/90 gün → auto-suspend.
### Admin
- [ ] Sellercentral `/affiliate-admin` superuser-only erişim.
- [ ] Pending affiliate signup'lar görünür, approve/reject yapılabilir.
- [ ] Fraud queue'da flag'ler severity'e göre filtreli.
- [ ] Emergency removal butonu + e-mail trigger.
### Compliance
- [ ] TTDSG cookie consent kategori: "Marketing/Affiliate" eklenmiş.
- [ ] Affiliate disclosure banner ilk landing'de gösterilir.
- [ ] 600 EUR/yıl üstü affiliate'lerde DAC7 KYC + Steuer-ID toplanır.
## KISITLAR
- Türkçe + Almanca + İngilizce + İspanyolca + İtalyanca + Fransızca i18n (mevcut `next-intl`).
- Polaris design system (sellercentral + developer ile tutarlılık).
- GDPR + TTDSG (Almanya) uyumu zorunlu.
- Mevcut `flow-queue.js` Redis worker pattern'ı referans alınmalı.
- Hardcoded secret yok. Stripe key'leri `.env`.
- Tüm UI mobile-responsive.
- EU + UK + CH dışı affiliate signup reddedilir.
- Currency sadece EUR.
- Single-tier (MLM yasak).
## ÖNCE NE YAPACAKSIN
1. Bu dokümanı oku, anladığın versiyonu özetle.
2. Aşağıdaki noktalarda **doğrulama sorusu** sor (kod yazma):
   - Mevcut Stripe entegrasyonu test mode'da mı? Connect Express production setup için ek bilgi gerekiyor mu?
   - Mevcut sellercentral marketing menüsünün konum/yapısı (yeni "Affiliate" alt-menüyü nereye yerleştireceğim)?
   - Mevcut cookie consent banner kodu nerede, "Marketing/Affiliate" kategorisi ekleyebileceğim mevcut yapı var mı?
   - `apps/developer/` paralel iş başladıysa, hangi PR'ı bekleyeceğim (özellikle Stripe Connect ortak setup için)?
3. Onay aldıktan sonra **PR 1**'den başla. Tek PR'da hepsini yapma.
4. Her PR'da: migration → service → worker → API → UI → test sırası.
5. Compliance gate'li PR'larda (PR 7, 9, 10) kullanıcıya açıkça "bu PR merge edilmeden önce şu review zorunlu" uyarısı ver.
6. Her PR commit message'ında karar tablosundaki ilgili satıra referans ver.
**KAFA KARIŞIKLIĞI VARSA: Durmadan kod yazma — sor.**
