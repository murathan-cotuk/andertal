
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
4. Sellercentral'da **`/marketing/affiliate`** (opsiyonel, bilgilendirici) — seller kendi ürünlerine gelen affiliate tıklama/satış özetini görür; **ürün ekleme/onay yok**.
5. Sellercentral superuser tarafında **`/affiliate-admin`** — affiliate onay (signup), fraud queue, payout override.
## İKİ AFFILIATE MODELİ
### Ortak kasa kuralı (her iki model)
- Affiliate komisyonu **seller’dan kesilmez**. Andertal’ın aldığı pazar yeri komisyonundan (varsayılan **%12**, `seller_users.commission_rate`) pay ayrılır.
- Ödeme: Andertal kasası → affiliate Stripe Connect hesabına (platform Stripe transfer / payout).
- Formül tabanı: ilgili satışın **Andertal platform komisyonu (EUR cents)** = genelde `merchandise_basis × commission_rate` (örn. 100 € × %12 = **12 €**).

### Model 1 — Seller Referral (Recurring)
- Affiliate, sellercentral signup linki üretir: `sellercentral.andertal.com/[locale]/signup?ref=AFF_XXX`.
- Seller bu linkten kayıt olur ve superuser onaylar (seller hesabı onayı — affiliate ürün onayı değil).
- O seller’ın her ödenen satışında Andertal platform komisyonu hesaplanır.
- Affiliate’e: **platform komisyonunun %5’i**.
  - Örnek: Seller 100 € sattı → Andertal 12 € komisyon → affiliate **0,60 €** (`12 × 0,05`).
- **Süre**: Referral aktif kaldığı sürece aynı oran (**sabit %5**). Tier1/tier2 yok.
- Bir seller sadece **bir** affiliate’e bağlı kalır (lock-in: ilk attribute eden alır).
- Seller referral attribution window: **24 saat** (product window’dan ayrı — daha kısa).

### Model 2 — Product Referral (Tüm katalog — seller onayı yok)
- Affiliate, **sistemdeki herhangi bir satılabilir ürün** için link üretebilir. Seller’ın ürünü “affiliate programına eklemesi” **yok**; tek tek onay **yok**.
- Müşteri linkten gelir, 30 gün içinde o ürünü (veya attributed line’ı) alırsa affiliate komisyon kazanır.
- Affiliate’e: **o satırın Andertal platform komisyonunun %8’i**.
  - Örnek: 100 € ürün → Andertal 12 € komisyon → affiliate **0,96 €** (`12 × 0,08`).
- **Para kaynağı**: Andertal kasası (Stripe). Seller’ın maliyeti değişmez — hâlâ yalnızca platform %12 (veya kendi `commission_rate`); ekstra % kesilmez.
- **Granülarite**: Katalog geneli. Enrollment / wind-down / min lock-in **yok**.
- Stokta olmayan / silinmiş / `merged` ürünlere yeni link üretimi engellenebilir; mevcut attribution penceresi kuralları attribution engine’de kalır.
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
| Çoklu affiliate çakışması | Lock-in: ilk attribute’ı oluşturan affiliate sahibi, sonradan değişmez |
| **Platform komisyon tabanı** | **Seller `commission_rate` (varsayılan %12) — Andertal kasası** |
| **Seller referral payı** | **Platform komisyonunun %5’i (sabit; tier yok)** |
| **Product referral payı** | **Platform komisyonunun %8’i (sabit)** |
| **Product link kapsamı** | **Tüm katalog — seller enrollment / onay yok** |
| **Affiliate ödemesi** | **Andertal → Stripe Connect (seller’dan ek kesinti yok)** |
| **Product enrollment / wind-down** | **YOK (kaldırıldı)** |
| **Emergency product removal** | **Superuser isteğe bağlı (yasal/fraud); affiliate link disable + e-mail; confirmed 90g korunabilir** |
### Compliance Gate'leri (PR Merge Öncesi Zorunlu)
- **PR 7 (Payout) merge öncesi**: Steuerberater vergi modülü review'u + DAC7 raporlama logic doğrulaması.
- **PR 9 (Consent banner) merge öncesi**: Hukuk danışmanı TTDSG/GDPR onayı; cookie kategorilendirmesi.
- **PR 10 (Terms) merge öncesi**: Avukat affiliate sözleşmesi review’u (brand bidding, ban, müsadere, kasa-ödeme maddeleri).
### Karar Değişikliği Prosedürü
Tablodaki herhangi bir karar değişirse: önce tablo → sonra `config.js` + migration → açık PR’lar rebase.
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
│       │   │   └── seller-referral.ts
│       │   ├── service.ts
│       │   ├── attribution-engine.ts
│       │   ├── commission-calculator.ts
│       │   ├── fraud-detector.ts
│       │   └── payout-scheduler.ts
│       ├── workers/
│       │   ├── commission-recalc.js              (order.paid → komisyon yarat; Andertal kasası payı)
│       │   ├── commission-clawback.js            (order.refunded → clawback)
│       │   ├── commission-confirm.js             (cron, daily — 30 gün geçenleri confirm)
│       │   ├── monthly-payout.js                 (cron, ayın 1'i UTC 03:00 — Stripe transfer)
│       │   └── seller-referral-monthly.js        (cron, ayın 1'i — Model 1: platform_fee × 5%)
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
│           └── sellercentral/affiliate-marketing/ (seller read-only özet; enrollment YOK)
│
├── shop/
│   └── middleware.js                             (?ref capture + cookie consent check)
│
├── sellercentral/
│   ├── middleware.ts                             (signup sayfasında ?ref capture)
│   └── src/app/[locale]/
│       ├── marketing/
│       │   └── affiliate/page.jsx                (YENİ — seller bilgilendirme / metrik; onay yok)
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
  product_id TEXT,                                 -- type='product' ise katalog ürünü (enrollment yok)
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
  current_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 5.00,  -- % of Andertal platform commission
  notes TEXT
);
-- NOT: product_affiliate_enrollments YOK — tüm katalog affiliate linklenebilir; seller onayı yok.
CREATE TABLE affiliate_commissions (
  id TEXT PRIMARY KEY,
  affiliate_id TEXT REFERENCES affiliates(id),
  source_type TEXT NOT NULL,                       -- 'seller_referral' | 'product_sale'
  order_id TEXT,
  seller_id TEXT,
  product_id TEXT,
  gross_amount_cents INT NOT NULL,                -- merchandise / GMV basis (cents)
  platform_commission_cents INT NOT NULL,          -- Andertal'ın aldığı komisyon (cents)
  rate_pct DECIMAL(5,2) NOT NULL,                 -- seller_referral: 5 | product_sale: 8
  commission_cents INT NOT NULL,                   -- platform_commission_cents * rate_pct / 100
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending | confirmed | clawed_back | paid | forfeited
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  confirmable_at TIMESTAMPTZ NOT NULL,             -- earned + 30 gün
  payout_id TEXT,
  emergency_protected BOOLEAN DEFAULT FALSE
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
  // Platform fee (Andertal) — affiliate payı bunun üzerinden
  DEFAULT_PLATFORM_COMMISSION_RATE: 0.12,          // seller_users.commission_rate yoksa
  // Seller Referral (Model 1) — Andertal platform komisyonunun yüzdesi
  SELLER_REFERRAL_OF_PLATFORM_PCT: 5,
  // Product Referral (Model 2) — Andertal platform komisyonunun yüzdesi
  PRODUCT_REFERRAL_OF_PLATFORM_PCT: 8,
  // Payout (Andertal kasası → affiliate Stripe Connect)
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
  // Approval (affiliate hesap signup — ürün onayı değil)
  MANUAL_APPROVAL_FIRST_N_AFFILIATES: 100,
  // Geography
  ALLOWED_COUNTRIES: ['DE','AT','CH','NL','BE','LU','FR','IT','ES','PT','IE','DK','SE','FI','PL','GB'],
};
```
## TRACKING & ATTRIBUTION
### Cookie Set Akışı (shop + sellercentral middleware)
1. URL’de `?ref=AFF_XXX` görünür.
2. Mevcut cookie consent state’i kontrol edilir.
3. **Marketing/Affiliate kategorisi onaylı değilse**: click DB’ye kaydedilir (`consent_marketing=false`), cookie set EDİLMEZ, attribution oluşturulmaz.
4. Onaylıysa: `__atrl` cookie set edilir (30 gün, SameSite=Lax, Secure).
5. Click `affiliate_clicks`’e yazılır, `affiliate_attributions` upsert edilir (cookie_id key).
### Order Completion — Product Referral
1. `order.paid` event → `commission-recalc` worker.
2. Order’ın `customer_id` veya `cookie_id` üzerinden son 30 gün’deki son **product** attribution bulunur.
3. Her attributed line item için:
   - Ürün katalogda affiliate’e açıktır (enrollment check **yok**).
   - `platform_commission_cents` = line merchandise basis × seller `commission_rate` (veya stored application fee’nin satır payı).
   - Affiliate komisyon: `round(platform_commission_cents * PRODUCT_REFERRAL_OF_PLATFORM_PCT / 100)` → örn. 1200 × 8% = **96 cents**.
4. `affiliate_commissions` row: `source_type='product_sale'`, `status='pending'`, `confirmable_at = now + 30 gün`.
5. Seller’dan ek kesinti **yok**; kayıt sadece Andertal → affiliate yükümlülüğü.
### Seller Referral (aylık)
1. `seller-referral-monthly` worker: referred seller’ın dönemdeki `platform_commission` toplamı.
2. Affiliate: `round(sum_platform_commission_cents * SELLER_REFERRAL_OF_PLATFORM_PCT / 100)` → örn. 1200 × 5% = **60 cents**.
3. Aynı Stripe payout pipeline’ına `confirmed` sonrası dahil.
### Refund / Chargeback
- `order.refunded` → ilgili commission `status = 'clawed_back'` (emergency_protected=true ise yok).
- Chargeback → `clawed_back` + fraud_flag(medium). 3+/90 gün → auto-suspend.
### Confirmation
- Daily cron: `confirmable_at <= now` AND `status='pending'` → `confirmed`.
## WIND-DOWN / ENROLLMENT
**Yok.** Seller ürün onayı ve enrollment state machine kaldırıldı. Superuser yasal/fraud için ürün veya affiliate link’i manuel disable edebilir; confirmed komisyonlar için opsiyonel `emergency_protected`.
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
**Read-only bilgilendirme (enrollment / “Add Products” yok):**
- Kısa açıklama: ürünler otomatik affiliate programına açıktır; komisyon Andertal kasasından ödenir; seller’dan ek kesinti yok.
- KPI bar (opsiyonel): bu ay affiliate-attributed clicks / satışlar / (bilgi amaçlı) Andertal’ın affiliate’e ödediği tutar özeti — seller bakiyesini etkilemez.
- Tablo (read-only): Ürün (image + name + SKU), Clicks (30g), Attributed sales (30g). Actions / Remove / Status badge **yok**.
## SELLERCENTRAL — `/affiliate-admin` (Superuser Only)
Sayfalar:
- **Pending**: signup approve/reject queue, KYC doc preview.
- **Fraud**: aktif fraud_flags listesi, severity'ye göre filtre, "Resolve / Suspend / Ban" actions.
- **Payouts**: tüm payout history, failed transfer retry, manual override.
- **Commission Adjustments**: manuel claw-back veya bonus (audit log'a yazılır).
- **Link / product disable** (opsiyonel): yasal/fraud için ürün veya affiliate link disable (gerekçe zorunlu, e-mail); enrollment state machine yok.
## SHOP — UI Eklemeleri
1. **Cookie consent banner**: Mevcut sisteme "Marketing/Affiliate" kategorisi eklenir (GDPR/TTDSG). Reject ederse `__atrl` set edilmez.
2. **Product page**: `?ref=AFF_XXX` ile gelinmişse ilk landing'de tek seferlik discrete banner: *"Bu ziyaret bir affiliate link üzerinden gerçekleşti. Aldığınız üründen değişiklik olmaz. [Lerne mehr]"* — BGH 2017 disclosure kararları gereği.
3. **Short URL redirect**: `andertal.com/r/{short_code}` → 302 redirect to target_url + `?ref=AFF_XXX` (cookie middleware yakalar).
## AFFILIATE PORTAL — `apps/affiliate/`
Next.js 14 App Router, next-intl, Polaris (sellercentral ile tutarlı), JWT auth.
### Dashboard
KPI kartları (bu ay clicks/conversions/pending/lifetime) + 30-gün grafiği + top 5 link + top 5 referred seller.
### Links
- "New Link" wizard: tip seç → seller_signup / product / category / storefront.
- Product link'te: katalog araması — **tüm satılabilir ürünler** (seller enrollment filtresi yok). Silinmiş / stokta yok / `merged` ürünler link üretiminde engellenebilir.
- Short URL + QR kod indirme.
- Per-link metrikler tablosu.
### Referrals (Sellers)
- Getirdiğim seller'lar (anonimize): "S-1234", signup tarihi, status, bu ay earnings, lifetime earnings.
- Oran sabittir: platform komisyonunun **%5**’i (tier badge yok).
### Reports
Tarih aralığı + link + source type filtreleri + CSV export + günlük/haftalık/aylık breakdown.
### Payouts
Sonraki payout tarihi + tahmini tutar + history (Stripe transfer ID linkli). Ödeme Andertal → Stripe Connect.
### Settings
Profil, Stripe Connect onboarding, vergi bilgileri (DAC7 600€ üstünde Steuer-ID zorunlu).
### Resources
Andertal logo (light/dark), banner setleri (728x90 / 300x250 / 1080x1080 / 1080x1920), DE+EN marketing copy, brand guideline PDF.
### Terms (`/terms`)
Hukuki olarak detaylı affiliate sözleşmesi DE + EN. Mutlaka kapsayacak maddeler:
- Model 1: seller referral = Andertal platform komisyonunun **%5**’i (sabit; tier yok); Andertal kasasından Stripe ile ödeme
- Model 2: product referral = Andertal platform komisyonunun **%8**’i (sabit); tüm katalog; seller ürün onayı yok
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
| **PR 1** | Schema migration + module skeleton + config + attribution-engine + scope unit testleri (UI yok). Enrollment tablosu yok. |
| **PR 2** | Tracking middleware (shop + sellercentral) + cookie consent integration + `affiliate_clicks` write path + short URL redirect. |
| **PR 3** | Affiliate portal iskelet: signup, login, dashboard, link generator UI + backend CRUD (katalog ürün linki; enrollment check yok). |
| **PR 4** | Order event hook: `commission-recalc` (platform_fee × 8%) + `commission-clawback` + `commission-confirm` worker'ları. |
| **PR 5** | Sellercentral `/marketing/affiliate` read-only özet sayfası (enrollment API / lifecycle worker **yok**). |
| **PR 6** | Seller referral flow: signup capture, `seller_referrals` row, `seller-referral-monthly` worker (platform_fee × **%5**, sabit). |
| **PR 7** | Payout system: minimum threshold, Andertal kasası → Stripe Connect transfer, payout webhook handler. **Steuerberater gate.** |
| **PR 8** | Fraud detection + sellercentral `/affiliate-admin` paneli (pending, fraud queue, payouts, commission adjustments, opsiyonel link/product disable). |
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
- [ ] Product link: katalogdaki satılabilir herhangi bir ürün seçilebilir (seller onayı / enrollment yok).
### Tracking
- [ ] `?ref=AFF_XXX` ile gelen ziyaretçi cookie alır (consent verdiyse).
- [ ] Cookie consent reddederse cookie set edilmez, click DB'ye `consent_marketing=false` yazılır, attribution yaratılmaz.
- [ ] Short URL `andertal.com/r/{code}` → 302 redirect çalışır.
### Commission — Product
- [ ] Müşteri affiliate link'ten gelir, 30 gün içinde attributed ürünü alır → pending commission.
- [ ] 30 gün sonra commission `confirmed`, ayın 1'inde Andertal → Stripe Connect payout.
- [ ] Komisyon = `round(platform_commission_cents * 8 / 100)` (örn. 12 € platform → 0,96 € affiliate). Floor / %3,5 yok.
- [ ] Seller’dan ek kesinti yok; ödeme Andertal kasasından.
- [ ] Refund → clawback (emergency_protected hariç).
### Enrollment / Wind-down
- [ ] Yok — seller ürün ekleme / Remove / wind-down akışı implement edilmez.
### Seller Referral
- [ ] Sellercentral signup linkinde `?ref=AFF_XXX` → `seller_users.referred_by_affiliate_id` set.
- [ ] Superuser onayı sonrası `seller_referrals` row yaratılır, `current_rate_pct = 5`.
- [ ] Aylık worker: o ayki Andertal platform komisyonunun **%5**’i affiliate’e (örn. 12 € → 0,60 €). Tier1/tier2 yok.
### Fraud
- [ ] Self-referral: aynı email/phone/payment → otomatik reject + high flag.
- [ ] IP match → medium flag, 3+ flag birikince auto-suspend.
- [ ] Chargeback 3+/90 gün → auto-suspend.
### Admin
- [ ] Sellercentral `/affiliate-admin` superuser-only erişim.
- [ ] Pending affiliate signup'lar görünür, approve/reject yapılabilir.
- [ ] Fraud queue'da flag'ler severity'e göre filtreli.
- [ ] Opsiyonel: ürün/link disable + e-mail (enrollment state machine değil).
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
