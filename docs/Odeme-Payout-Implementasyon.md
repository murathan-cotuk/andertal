# Ödeme / Payout — Kanonik Settlement Sistemi (Implementasyon)

Tarih: 2026-10-06 · Kaynak: `docs/Odeme-Payout-Denetimi.md` (audit) + 25 fazlık implementasyon isteği + Stripe'ın resmi cevabı.
Kod: `apps/medusa-backend/src/settlement/*`, `src/routes/settlement.js`.

> Kural: Para hareketleri UI'da düzeltilmez. Tek kaynak:
> **Payment → Seller Payable → Ledger → Refund / Dispute → Settlement → Payout.**
> Aynı satıcıya aynı sipariş kalemi için iki kez ödeme yapılamaz (DB seviyesinde garanti).

---

## 1. Para akışı (Separate Charges & Transfers, platform = Merchant of Record)

1. **Checkout**: Müşteri platform hesabına öder (PaymentIntent; `transfer_data` yok, `on_behalf_of` yok).
2. **Sipariş kaydı** (`POST /store/orders`): PaymentIntent Stripe'tan **tekrar okunur** (`status = succeeded`, tutar sepetle aynı mı). Ardından:
   - `order_payments`: doğrulanmış ödeme snapshot'ı (PI, charge, tutar, para birimi, `payment_succeeded_at`, fee bearer)
   - `store_order_items.commission_rate_snapshot`: satır bazında, sipariş anındaki komisyon oranı
   - `seller_payables`: her sipariş kalemi için bir satır + satıcı başına bir kargo satırı (satıcı = **kalemin** satıcısı, sipariş başlığındaki `'default'` asla kullanılmaz)
   - ledger: `SALE` (+brüt), `COMMISSION` (−komisyon), `SHIPPING` (+satıcının kargo payı)
   - Bu adım başarısız olursa sipariş yine oluşur (müşteri ödemiştir). Saatlik **sweeper** PI'ı Stripe'ta yeniden doğrular ve payable'ları tamamlar.
3. **Webhook** `payment_intent.succeeded` / `charge.*`: aynı snapshot'ı idempotent olarak doldurur, Stripe fee'yi (balance transaction) kaydeder.
4. **Teslimat**: Payout saatini başlatan `store_orders.delivery_confirmed_at` alanını yalnızca **carrier webhook (Sendcloud)**, **carrier API (tracking refresh)** veya **superuser** yazabilir. Satıcının "zugestellt" demesi sadece gösterim içindir (`seller_reported_delivered_at`).
5. **Eligibility** (`eligible_at = delivery_confirmed_at + 14 gün`, kalıcı olarak yazılır). Engelleyen durumlar: açık iade, bekleyen refund, açık dispute, ödeme doğrulanmamış, satıcı onaylı değil, `payout_blocked`.
6. **Settlement** (2. ve 4. Cuma, Europe/Berlin, `SETTLEMENT-<tarih>` run key): satıcı başına ödenebilir tüm ledger kalemleri tek bir `seller_settlement_payouts` kaydında toplanır.
7. **Transfer**: Settlement içinde **sipariş başına bir Stripe transferi** yapılır: `source_transaction` = siparişin charge'ı, `transfer_group` = `ORDER_<id>`, idempotency key = parça başına.
8. **Banka payout'u**: Fonlar connected account'ta **available** olunca (recipient transferlerinde yaklaşık 24 saat) `payouts.create` çağrılır. `payout.paid` webhook'u gelince kayıt `paid` olur.

## 2. Tablolar

| Tablo | Amaç | Değişmezlik |
| --- | --- | --- |
| `order_payments` | Sipariş başına doğrulanmış ödeme snapshot'ı + Stripe fee | Tutar sonradan değişmez; tutarsızlık audit'e düşer |
| `seller_payables` | Kalem / kargo bazlı alacak snapshot'ı | Tutar ve oran kolonları **trigger ile kilitli** |
| `seller_ledger_entries` | Append-only satıcı defteri | UPDATE/DELETE **trigger ile yasak**; her kayıtta benzersiz `idempotency_key` |
| `seller_settlement_payouts` | "Para ödendi" bilgisinin TEK kaynağı | `business_key` unique; satıcı başına tek açık payout |
| `seller_payout_items` | Hangi ledger kaydı hangi payout'ta | Ledger kaydı başına tek **aktif** claim (partial unique index) |
| `seller_payout_transfers` | Sipariş başına Stripe transferleri | Idempotency key + transfer id unique |
| `order_refunds` / `order_refund_lines` | Gerçek Stripe refund'ları + satıcı/kalem dağılımı | Ledger'a yalnızca `succeeded` sonrası ve bir kez yazılır |
| `order_disputes` | Chargeback'ler | Stripe dispute id unique |
| `stripe_webhook_events` | Merkezi webhook deposu | `stripe_event_id` PK |
| `finance_audit_log` | Tüm manuel/para olayları | — |
| `settlement_settings.cutover_at` | Bu andan sonraki siparişler otomatik settle edilir | İlk migration'da bir kez yazılır |

Ledger olay tipleri: `SALE, COMMISSION, SHIPPING, REFUND, COMMISSION_REFUND, CHARGEBACK, CHARGEBACK_RELEASE, PAYOUT, PAYOUT_REVERSAL, ADJUSTMENT`. Düzeltme her zaman yeni bir ters kayıtla yapılır, eski kayıt değiştirilmez.

## 3. Payable hesabı

- `gross = unit_price × qty` (müşterinin ödediği değil, satıcının liste fiyatı; kupon ve bonus platform tarafından finanse edilir, BonusPunkte.md ile aynı kural)
- `commission = round(gross × rate_snapshot)`. Oran sırası: checkout snapshot'ı, yoksa ürün override'ı, yoksa satıcı oranı. Hangisinin kullanıldığı `source` alanına yazılır.
- `commission_vat`: satıcı bazlı snapshot (`commission_vat_scheme`, ayrıntı §14):
  - Almanya'daki satıcı → %19
  - Başka bir AB ülkesinde ve VIES'te doğrulanmış USt-IdNr. var → %0 reverse charge
  - AB'de ama USt-IdNr. yok → %19
  - AB dışı → %0, Almanya'da vergiye tabi değil
- Komisyon **KDV dahil** kesilir (Provisionsrechnung'da yazan "fällig" tutar):
  `net = gross + shipping − commission − commission_vat − iadeler + komisyon iadeleri (KDV dahil) − chargeback` (generated kolon)
- Örnekler:
  - 100 €, %12, Alman satıcı → **85,72 €** (12 € komisyon + 2,28 € USt kesilir; satıcı 2,28 €'yu Vorsteuer olarak düşer)
  - Aynı sipariş, reverse charge'lı AB satıcısı → **88 €**
  - İki satıcı 60/40 (reverse charge) → 52,80 € / 35,20 €

## 4. Refund

- Giriş noktaları: SC iade ekranı (`PATCH /returns/:id` ile `refund_status: erstattet`), müşteri iptali, `POST /admin-hub/v1/settlement/orders/:id/refunds`, Stripe Dashboard'da yapılan refund (webhook).
- Akış: `order_refunds (pending)` → `stripe.refunds.create` (idempotency key `andertal-refund-<id>`) → `processing` → `succeeded` / `failed` / `canceled` (webhook ile kesinleşir).
- **İade yalnızca Stripe `succeeded` dediğinde "erstattet" görünür.** Hata alırsa `fehlgeschlagen` + sebep. SC'de yeniden deneme butonu açılır.
- Dağılım:
  - Satır bazlı: kalemin snapshot değeri × adet.
  - Müşteri iadesi satırların "müşterinin ödediği karşılığından" azsa (Wertersatz) satıcıdan orantılı düşülür. Kupon/bonus oranı hesaba katılır, böylece kuponlu ürünün tam iadesinde satıcı alacağının tamamı geri alınır.
  - Tutar bazlı (`amount`): kapsamdaki kalanlar üzerinden orantılı dağıtılır.
  - Çok satıcılı siparişte satır veya `seller_id` vermek **zorunludur**. Satıcı yalnızca **kendi** satırlarını iade edebilir (403).
- Komisyon iadesi (Vertrag §12): tam iadede tamamı, kısmi iadede iade edilen mal bedeli oranında. Son iade kalan kuruşu kapatır.
- Payout'tan **sonra** gelen refund: ledger'a negatif kayıt düşer. Bakiye negatif kalabilir, **0'a kırpılmaz**, sonraki payout'tan mahsup edilir.
- Eşzamanlı iki refund aynı tutarı dağıtamaz (açık refund'lar rezerve sayılır).
- Dashboard refund'u + çok satıcılı sipariş: tahmin yapılmaz. Refund `pending` kalır, payout bloke olur, superuser dağıtır.

## 5. Chargeback / dispute

- `charge.dispute.created` / `funds_withdrawn` olaylarında payable'lar bloke olur ve satıcılara `CHARGEBACK` (−) yazılır. Payable daha önce ödenmişse bu kayıt alacak (receivable) olur.
- `won` (veya `warning_closed`) sonucunda kayıtların birebir karşılığı `CHARGEBACK_RELEASE` olarak yazılır.
- `lost` sonucunda payable `charged_back` olur ve kesinleşir.
- Dağılım: satıcıların kalan alacakları üzerinden. Tam dispute satıcıların kalan alacağının tamamını, kısmi dispute orantılı tutarı geri alır.
- Kaybedilen chargeback'te komisyon ve KDV'si **orantılı olarak iade edilir** (varsayılan). Gerekçe §14'te. `SETTLEMENT_CHARGEBACK_COMMISSION_REVERSAL=none` ancak sözleşme §23'e göre değiştirildikten sonra kullanılmalı.
- Dispute ücreti önce platformdan kesilir. Satıcıya yansıtılması ticari bir karardır: `SETTLEMENT_DISPUTE_FEE_BEARER=platform|seller` (varsayılan platform). `seller` seçilirse yalnızca `lost` sonrası `ADJUSTMENT` yazılır.

## 6. Payout ve Connect

- Hesap modeli: **Stripe Connect Custom**, `service_agreement: recipient`, yalnızca `transfers` capability'si, payout takvimi `manual`.
- Hesabı satıcı kendisi açar (SC → Einstellungen → Zahlungen → "Stripe-Auszahlungskonto"):
  - Hukuki yapı ve adı girer, **Stripe Connected Account Agreement (Recipient)** kutusunu işaretler.
  - Backend isteğin **gerçek IP'sini** (proxy'nin eklediği değer) ve zamanını `tos_acceptance` olarak gönderir. Sözleşmeyi yalnızca hesap sahibi kabul edebilir, alt kullanıcılar edemez.
  - Kalan KYC bilgilerini **Stripe-hosted onboarding** (Account Link, `eventually_due`) toplar. Biz Stripe'ın Required Verification Information listesini tahmin etmiyoruz.
- `account.updated` webhook'u şunları `seller_users` tablosuna yansıtır: `payouts_enabled`, transfers capability, requirements, disabled reason, service agreement, banka hesabının Stripe'taki durumu.
- Payout'a hazır olma şartları: `recipient` sözleşmesi, satıcının kendi TOS kabulü, transfers `active`, `payouts_enabled`, onaylı satıcı, `payout_blocked = false`.
- **Eski hesaplar** (`full` sözleşmesi + platformun doldurduğu IP / 127.0.0.1) **ödeme almaz**. Otomatik olarak yeniden oluşturulmaz; yeniden açılması superuser kararıdır (rapor).
- IBAN: SC'de kaydedilir. Satıcının recipient hesabı varsa Stripe'a external account olarak eklenir; `account_holder_type` hukuki yapıdan gelir. Hesap sahibi ↔ tüzel kişi eşleşmesi `bank_holder_matches_legal_entity` alanına yazılır. UI asla "verified" demez, Stripe'ın verdiği durumu gösterir.
- Manuel havale (Stripe dışı): yalnızca superuser, **gerçek banka referansı** + **tutarın birebir onayı** ile (`POST /admin-hub/v1/payouts/mark-paid` → `transfer_reference`, `confirm_amount_cents`). Ledger'a `PAYOUT` yazılır ve audit log tutulur. Provisionsrechnung satırını elle "bezahlt" yapmak artık mümkün değil (409).
- "Überweisen" (`/payouts/seller-iban-now`) aynı kanonik yolu kullanır.
- Per-order manuel transfer (`/stripe-connect/transfer/:orderId`) yalnızca cutover öncesi legacy siparişler için çalışır.

### Payout durum makinesi

`created → transfer_pending → transferred → payout_pending → paid`

- Henüz hiç para çıkmamışken transfer reddedilirse: `failed` (claim'ler serbest kalır, `PAYOUT_REVERSAL` yazılır, payable'lar tekrar `eligible` olur).
- Bazı transferler başarılı olduktan sonra reddedilirse: `transfer_review` (otomatik geri alma yok, superuser inceler).
- Banka payout'u hata verirse: `payout_failed`. Para connected account'ta kalır. `POST /admin-hub/v1/settlement/payouts/:id/retry` önce eski payout'un gerçekten `failed`/`canceled` olduğunu, hesabın hazır olduğunu ve bakiyenin yettiğini kontrol eder; sonra yeni attempt key ile tekrar dener.
- `transfer.reversed` olayında tamamı geri döndüyse `failed` + `PAYOUT_REVERSAL`; aksi halde inceleme kaydı açılır.

## 7. Idempotency ve çift ödeme engeli

| Katman | Mekanizma |
| --- | --- |
| Webhook | `stripe_webhook_events.stripe_event_id` PK + event başına advisory lock. İşlenmiş event tekrar işlenmez. Hata olursa 500 döner, Stripe tekrar gönderir. |
| Ledger | Her olayın deterministik `idempotency_key` değeri var (`SALE:<payable>`, `REFUND:<line>`, `CHARGEBACK:<dispute>:<payable>` …) ve bu alan unique. |
| Payable | Kalem başına tek satır (unique), satıcı+sipariş başına tek kargo satırı. |
| Payout | `business_key` unique; satıcı başına tek açık payout; ledger kaydı başına tek aktif claim; satıcı başına advisory lock. |
| Stripe çağrıları | Transfer: `andertal-settlement-transfer-<payout>-<order>`. Payout: `…-payout-<payout>-<attempt>`. Refund: `andertal-refund-<id>`. Sonucu bilinmeyen hatalar aynı key ile tekrar denenir. |
| Job | Cuma çalıştırması `seller_payout_auto_runs` ile günde bir kez. Reconciler saatlik. |

Test 14 / 14b: aynı job iki kez çalışınca ve iki ayrı DB bağlantısından paralel çalışınca **tek transfer** oluşuyor.

## 8. Reconciliation

- `order_payments`: charge, balance transaction, `stripe_fee_cents`, `stripe_net_cents`, `fee_bearer`.
- Stripe fee kime ait? `PLATFORM_STRIPE_FEE_BEARER=platform|seller` (varsayılan platform, mevcut formülle aynı). `seller` seçilirse fee satıcılara orantılı `ADJUSTMENT` olarak yazılır, komisyonla karışmaz.
- Transferler sipariş bazında: `source_transaction` + `transfer_group ORDER_<id>`, metadata'da `settlement_payout_id`, `seller_id`, `order_id`. Charge'ın kalan tutarını aşan kısım (ör. platformun ödediği kupon) `source_transaction` olmadan, `SETTLEMENT_<id>` grubuyla gönderilir.
- Connected account bakiyesi negatifse veya platformda `connect_reserved` görülürse: audit kaydı açılır ve satıcı `payout_blocked` olur. Sessizce geçilmez.
- Superuser uçları: `GET /admin-hub/v1/settlement/webhook-events?status=failed`, `/settlement/audit`, `/settlement/payouts`, `/settlement/ledger`, `/settlement/orders/:id`.

## 9. Provisionsrechnung ve DAC7

- Provisionsrechnung (`seller_payouts`) bir **belge**dir. Cutover sonrası dönemlerde rakamlar payable snapshot'ları ve ledger'dan gelir; o günkü komisyon oranıyla yeniden hesaplanmaz. "Bezahlt" bilgisi settlement payout'undan okunur.
- DAC7: rakamlar ledger'dan, satıcı ve çeyrek bazında gelir. **Vergütung (consideration) = ücretler düşüldükten sonraki tutar** (brüt − iade/chargeback − komisyon ve KDV'si); ücretler ayrıca raporlanır. Eşik kontrolü bu tutara göre yapılır. Cutover öncesi siparişler sipariş kalemlerinden **tahmin** edilir ve `includes_estimate` ile işaretlenir. Eksik alanlar listelenir; hiçbir alan uydurulmaz. XML **yalnızca dahili önizlemedir** (`urn:andertal:internal:dac7-preview:v1`), resmî BZSt formatı değildir. Stripe Platform Tax Reporting yalnızca yardımcı araçtır.

## 10. Legacy (cutover öncesi) siparişler

Otomatik settle edilmez. Bu siparişler için `node scripts/settlement-legacy-report.js` çalıştırılır:
- Rapor modu salt okunurdur.
- Payable oluşturmak için `--apply --orders=<id,…>` gerekir. Her PI Stripe'ta tekrar doğrulanır; toplu backfill bilerek yok.
- Güvenilir şekilde türetilebilenler: kalem brütü ve satıcısı, `shipping_by_seller` (varsa), PI, carrier teslim olayı.
- Türetilemeyenler: sipariş anındaki komisyon oranı, daha önce ne kadar ödendiği, Stripe'sız "erstattet" işaretleri.

## 11. Ortam değişkenleri

| Değişken | Varsayılan | Anlamı |
| --- | --- | --- |
| `STRIPE_WEBHOOK_SECRET` | — | Platform webhook secret'ı |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | — | Connect webhook endpoint secret'ı (payout.*, account.updated). İkisi de kabul edilir. |
| `SETTLEMENT_AUTO_PAYOUTS` | açık | `off` yapılırsa Cuma'daki otomatik para hareketi durur; sweeper ve reconciler çalışmaya devam eder |
| `SETTLEMENT_MIN_PAYOUT_CENTS` | 100 | Minimum banka payout tutarı |
| `PLATFORM_STRIPE_FEE_BEARER` | platform | Stripe işlem ücreti |
| `SETTLEMENT_DISPUTE_FEE_BEARER` | platform | Dispute ücreti |
| `SETTLEMENT_CHARGEBACK_COMMISSION_REVERSAL` | proportional | Kaybedilen chargeback'te komisyon ve KDV'si orantılı iade edilir; `none` iade etmez |
| `SELLERCENTRAL_PUBLIC_URL` | origin | Onboarding linkinin dönüş adresi |

Stripe Dashboard'da gereken webhook olayları: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.succeeded`, `charge.updated`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.refund.updated`, `charge.dispute.created/updated/closed/funds_withdrawn/funds_reinstated`, `transfer.created/updated/reversed`. Connect endpoint'i için: `payout.paid/failed/canceled/created/updated`, `account.updated`.

## 12. Implementation checklist: Stripe'ın 7 maddesi (= Denetim §G 1–7)

| # | §G sorusu / Stripe cevabı | Durum | Nerede |
| --- | --- | --- | --- |
| 1 | SCT Almanya'da destekleniyor, 14 günlük bekletme için doğru model. Destination charge yok, `on_behalf_of` yok, MoR platform. | ✅ Charge modeli değişmedi | checkout değişmedi; `transfers.create` (SCT) |
| 2 | Custom = recipient, yalnızca `transfers`, KYC Stripe'ın listesine göre, TOS sahte olmayacak (gerçek IP + tarih), Stripe-hosted onboarding | ✅ Yeni hesaplar recipient + hosted onboarding. ⚠️ Eski `full` hesaplar bloke, yeniden açılması superuser kararı | `settlement/connect-account.js`, `SellerPayoutAccountSection.jsx` |
| 3 | Sabit maksimum bekletme yok (DE için ~90 gün rezerv çerçevesi). Kural: teslim + 14 gün. Recipient transferlerinde ~24 saat gecikme. `transfer_group` / `source_transaction` | ✅ Teslim+14 gün korunuyor; banka payout'u fonlar `available` olunca; sipariş başına `source_transaction` + `ORDER_<id>` | `money.js` (HOLD_DAYS), `payouts.js` (`buildTransferPlan`, `tryBankPayout`) |
| 4 | Transfer sonrası refund/dispute otomatik geri gelmez → transfer reversal veya sonraki payout'tan mahsup. Dispute tutarı ve ücreti platformdan kesilir. Negatif connected balance / connect_reserved sessizce geçilmez | ✅ Mahsup (negatif ledger) uygulandı. ✅ Negatif bakiye ve `connect_reserved` için blok + audit. Transfer reversal otomatik değil (tercih: mahsup) | `refunds.js`, `disputes.js`, `payouts.js` |
| 5 | Destination charge'a geçilmeyecek | ✅ Geçilmedi | — |
| 6 | Fee reconciliation balance transaction üzerinden; fee'nin kime ait olduğu config ile belirlenir ve raporlanabilir | ✅ `order_payments.stripe_fee_cents/net`, `PLATFORM_STRIPE_FEE_BEARER` | `stripe-events.js` |
| 7 | DAC7: Stripe Platform Tax Reporting yalnızca yardımcı; resmî BZSt yükümlülüğü platformda; uydurma XML "resmî" diye adlandırılmayacak | ✅ XML "interne Vorschau" olarak etiketlendi, eksik alan listesi eklendi | `routes/dac7.js`, `settlement/reporting.js` |

## 13a. Sellercentral ekranları (kanonik)

- **Hesap hareketleri / Transactions** (`/admin-hub/v1/seller-ledger`): cutover sonrası her satır bir `seller_ledger_entries` kaydıdır ve bakiye gerçek ledger toplamıdır. Cutover öncesi hareketler tarihçe olarak görünür ama bakiyeyi etkilemez.
- **Zahlungen (superuser, `payout-overview`)**: dönem satışları payable'lardan gelir. "Auszahlung" o anda ödenebilir tutardır, yani manuel havalede onaylanması gereken tutarın aynısıdır. Durum settlement payout'undan okunur.
- **Manuel havale**: hem Zahlungen hem Transactions ekranında aynı modal kullanılır (`ManualTransferModal`): banka referansı + birebir tutar.
- **Settings → Settlement-Prüfung** (superuser): dikkat gereken payout'lar (retry), atanmamış Dashboard refund'ları (Zuordnen), carrier onayı olmayan teslimatlar (Zustellung bestätigen), bloke/sorunlu satıcılar (gerekçeyle sperren/freigeben; satıcıya bildirim gider, §11), başarısız webhook'lar (yeniden işle), siparişi oluşmamış ödemeler, satıcısı çözülemeyen kalemler.
- **Sipariş detayı** (superuser): "Abrechnung" kutusu satıcı bazlı payable'ları ve teslim onayını gösterir.
- **Zahlungen (satıcı)**: Stripe-Auszahlungskonto, hukuki yapı, Steuer-ID/TIN, Handelsregister.

## 14. Hukuki ve muhasebe kararları (2026-10-06)

Steuerberater ve avukat görüşü beklenmeden verilen kararlar. Gerekçeleri ve geri dönüş yolları:

1. **Komisyon KDV'si payout'tan kesilir.**
   - Gerekçe: Provisionsrechnung "Provision inkl. MwSt. (fällig)" ve "zzgl. MwSt. … dem Verkäufer belastet" yazıyordu, ama payout sadece net komisyonu düşüyordu. Bu durumda satıcının faturalanan KDV borcu hiç tahsil edilmiyordu ve Andertal her siparişte KDV'yi kendi cebinden ödüyordu (UStG §13a: vergi borçlusu Andertal).
   - Sözleşme §11 (Aufrechnung fälliger Gegenforderungen) ve §12 (Provision bei Zahlungseingang einbehalten) mahsuba izin veriyor.
2. **Komisyon faturasında KDV yeri** (§3a Abs. 2 UStG, B2B hizmeti; ifa yeri alıcının merkezi):
   - DE → %19
   - AB'de, VIES'te doğrulanmış USt-IdNr. var → reverse charge, faturada §13b ibaresi
   - AB'de, USt-IdNr. yok → işletme statüsü kanıtlanmadığı için temkinli olarak %19
   - AB dışı → Almanya'da vergiye tabi değil
   - Kleinunternehmer satıcıya da %19 fatura edilir (§19 UStG yalnızca satıcının kendi satışlarını etkiler).
   - Reverse charge yalnızca **VIES'te geçerli çıkmış ve mevcut USt-IdNr. ile birebir aynı** numaraya uygulanır.
     - Doğrulama saatlik döngüde yapılır; 30 günde bir veya numara değişince yenilenir.
     - Doğrulanmamış veya değişmiş numarada %19 uygulanır. Böylece Andertal hiçbir zaman tahsil etmediği KDV'nin borçlusu olmaz.
3. **İadede KDV düzeltmesi** (§17 UStG): komisyon iadesiyle aynı oranda KDV de iade edilir.
4. **Kaybedilen chargeback'te komisyon iadesi.** Sözleşme §12 chargeback'i düzenlemiyor. §305c Abs. 2 BGB'ye göre AGB'deki belirsizlik, metni yazan tarafın (Andertal) aleyhine yorumlanır. Ekonomik olarak da kaybedilen chargeback tam bir geri alım gibidir. Bu yüzden komisyon orantılı iade edilir. Değiştirmek için sözleşmeyi §23 ve P2B-VO Art. 3 (15 gün önceden bildirim) çerçevesinde güncellemek gerekir.
5. **Dispute ücreti ve Stripe işlem ücreti** satıcıya yansıtılmaz. §12: "Ein Entgelt, das in dieser Preisliste nicht ausgewiesen ist, wird nicht geschuldet." Preisliste bu ücretleri içermediği sürece ikisini de platform taşır. Yansıtmak isterseniz önce Preisliste'ye eklenmeli (P2B 15 gün), sonra ilgili env ayarı `seller` yapılmalı.
6. **Zurückbehalt (payout bloğu)**: §11'e göre sebep ve tutar satıcıya kalıcı bir ortamda bildirilir. Superuser bloğu gerekçe girmeden kaydedilemez ve bildirim otomatik gider.
7. **DAC7 / PStTG**:
   - Vergütung, ücretler düşülmüş tutardır (RL 2011/16/EU Anhang V Abschn. I C Nr. 9).
   - Rapor her yıl 31.01'e kadar BZSt'ye verilir ve satıcıya da aynı tarihe kadar iletilir.
   - Platform BZSt-Portal'da kayıtlı olmalıdır.
   - Sorgfaltspflichten: TIN ve adres doğrulaması; eksik veride hatırlatma, sonra hesap kısıtlaması (PStTG §25 vd.).
   - Bu ekran yalnızca hazırlık içindir.

## 13. Testler

`npm run test:settlement` (`SETTLEMENT_TEST_PG_URL` = gerçek bir test Postgres'i). Değişken yoksa DB testleri skip edilir ve bunu açıkça yazar.
Zorunlu 20 senaryonun tamamı, Stripe ek kuralları, KDV şemaları, DAC7 ve atanmamış refund kapsanıyor (43 entegrasyon testi + money/policy unit testleri). CI: `.github/workflows/ci.yml` → `settlement` job'u (postgres:16 servisiyle).
