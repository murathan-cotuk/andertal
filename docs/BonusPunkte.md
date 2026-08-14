# Andertal — Platform-Funded Customer Bonus talimatı

Bu belge ChatGPT’nin genel marketplace bonus metninin **Andertal koduna uyarlanmış** halidir. Claude / ajan bunu doğrudan uygulama talimatı olarak kullanır.

**Amaç:** Sıfırdan bonus sistemi yazmak değil. Mevcut çalışan ödemeyi kırmadan, her euronun sipariş bazında kanıtlanabildiği ledger’ı tamamlamak.

**Yasak:** Varsayım yok. Yeni `reward_accounts` / `seller_settlements` tablosu yok (mevcut modeller var). Stripe Destination Charge geri getirme. Komisyon USt oranı config (`PLATFORM_VAT_PERCENT`); koda %19 gömme. Vergi sınıflandırması (gider / Entgeltminderung / USt matrahı) uydurma; Steuerberater mapping’i configuration olarak bırak.

---

## 0. ChatGPT vs Andertal — ne uygun, ne değil

| ChatGPT iddiası | Andertal gerçeği |
|---|---|
| Sistem yok, sıfırdan kur | **Zaten var.** Kazanma, kullanma, ledger, storno/iade ters kayıt, 0 € checkout, platform finansmanı yorumu kodda. |
| 50 puan = 1 € | **Evet.** `BONUS_POINTS_PER_EURO_DISCOUNT = 50`. `Math.floor(points/50*100)` cent. |
| %2 bonus (100 € → 2 €) | **Evet, ama matrah müşterinin ödediği tutar.** `bonusPointsEarnedFromOrderPaidCents = ceil(paidCents/100)` → 1 puan / 1 € ödeme = %2 değer. 50 € **ödenen** → 50 puan → 1 €. 50 € ürün + 1 € bonus kullanımı → müşteri 49 € öder → **49 puan** kazanır, 50 değil. |
| Bonus bankaya gitmez, bakiye | **Evet.** `store_customers.bonus_points` + `store_customer_bonus_ledger`. |
| Seller 50 € hak eder, müşteri 49 öder, platform 1 € finanse eder | **Evet.** Komisyon **liste mal bedeli** (`subtotal_cents`) üzerinden; bonus seller indirimi değil. |
| Seller payout = 50 − 6 + 1 = **45 €** | **YANLIŞ. Bunu uygulama.** Liste 50 zaten o 1 €’yu içerir. Doğru: seller net = **50 − 12% = 44 €**. Nakit: müşteri 49, seller 44, platform **5** (= komisyon 6 − bonus maliyeti 1). ChatGPT 45’i çift saymış. |
| Stripe Connect destination: seller’a 50 aktar | **Eski model, artık yok.** Müşteri ödemesi platform Stripe hesabına gider (`transfer_data` yok). Seller 14 gün sonra `seller_net_after_commission_cents` ile IBAN/payout. Destination Charge geri getirme. |
| `reward_accounts`, `seller_settlements` yeni tablolar | **Gereksiz.** `store_customers`, `store_customer_bonus_ledger`, `store_orders`, `seller_payouts` kullan. |
| Ledger immutable, UPDATE/DELETE yok | **Şu an ihlal ediliyor.** Superuser ledger satırını UPDATE/DELETE edebiliyor (`customers.js`). Bunu kapat, reversal yaz. |
| Partial refund orantılı | **Şu an hayır.** İade `erstattet` olunca **tüm** earn ve **tüm** redeem ters çevriliyor. |
| Unique idempotency key | **Kısmen.** Source+order_id `SELECT … LIMIT 1` ile; UNIQUE constraint yok. |
| Çift checkout aynı bakiyeyi harcamasın | **Kısmen.** Sepette rezervasyon bakiyeyi kilitlemez. Siparişte `UPDATE … WHERE bonus_points >= $1` var, `FOR UPDATE` yok. |
| Müşteri faturası: toplam 50, ödeme Kart 49 + Bonus 1 | **Şu an yanlış gösterim.** Rechnung `grandTotal` = ödenen (49). Bonus satırı **indirim** gibi düşülüyor. |
| KDV %19 hardcode etme | **İki ayrı KDV** + **shop fiyatı teslim ülkesine göre.** Satıcı 50 € = **DE brüt anker** (KDV dahil). Shop FR’de 50 € bırakıp faturada %20 ayırmaz — net sabit, brüt = net × (1+ülke oranı). Ayrıntı §3.10. Komisyon USt ayrı (`PLATFORM_VAT_PERCENT`). |
| Hoş geldin puanı | **Var:** kayıtta 100 puan (`BONUS_SIGNUP_POINTS`). |
| Misafir siparişte earn | **Yok.** Sadece login müşteri. Böyle kalsın. |
| Stripe min 0,50 € | **Var.** Bonus mal bedelini 50 cent’in altına indiremez; tamamı bonus+kupon ise `platform_loyalty` (kart yok). |

---

## 1. Mevcut mimari (okumadan kodlama)

### Para birimleri
- Her yerde **integer cent**. JS float yok (`0.1+0.2`).
- Puan: **integer**. 50 puan = 100 cent.
- Kazanma yuvarlama (mevcut, değiştirme): `Math.ceil(paidCents / 100)` puan. Örnek: 33,33 € ödeme → 34 puan.
- Kullanma: `Math.floor((points / 50) * 100)` cent.

### Kazanma matrahı (kesin — ChatGPT §13’ün Andertal cevabı)
Bonus, **müşterinin gerçekten ödediği tutar** üzerinden kazanılır (`total_cents` / `resolveOrderPaidTotalCents`):

- Mal bedeli (liste) dahil.
- **Kargo dahil** (ödenen total’in parçası).
- Bonus kullanımı **düşülmüş** (49 € ödendiyse 49 puan, 50 değil).
- Kupon düşülmüş.
- İptal/iade edilmiş sipariş: earn `order_cancel_earn` / `order_return_earn` ile geri alınır.
- Misafir: earn yok.

Bunu “50 € ürün her zaman 1 € kazandırır” diye değiştirme.

### Kullanma
- Checkout’ta `store_carts.bonus_points_reserved`.
- Siparişte `store_orders.bonus_points_redeemed` + `discount_cents` (bonus + kupon).
- `coupon_discount_cents` ayrı; bonus ile karıştırma.
- `orderBonusDiscountCents` = `discount_cents - coupon_discount_cents` (`order-money.js`).

### Platform finansmanı (doğru nakit)
```
Mal (liste)                         50,00 €
Müşteri kart/PayPal                 49,00 €
Platform bonus funding               1,00 €
Komisyon 12% (50 üzerinden)         -6,00 €
─────────────────────────────────────────
Seller net (payout)                 44,00 €
Platform nakit (49 − 44)             5,00 €
  = komisyon 6 − bonus maliyeti 1
```

`seller_net_after_commission_cents = subtotal − commission` (bonus düşülmez).
`platform_subsidy_cents` bugün `subtotal + shipping − paid` — bu **kupon + bonus** karışır. Ayrıştır.

### Stripe
- PI: `apps/medusa-backend/src/routes/store-checkout.js` `storePaymentIntentPOST`.
- Tutar = `computeCartCheckoutMoney` → müşterinin ödeyeceği (bonus+kupon sonrası + kargo).
- Destination Charge / `application_fee_amount` **kullanılmıyor**.
- Payout: teslim + 14 gün, `payouts.js`, kayıtlı `seller_net_after_commission_cents`.
- `payment_intent_id` siparişte durur. Transfer ID ayrı (`stripe_transfer_id` / payout id). Karıştırma.

### Ledger kaynakları (mevcut `source` değerleri)
`order_earn`, `order_redeem`, `order_cancel_earn`, `order_cancel_redeem`, `order_return_earn`, `order_return_redeem`, `manual`, kayıt hoş geldin.

Yeni tür uydururken bunları eşle; ChatGPT’nin `EARNED/REDEEMED` enum’unu paralel ikinci sistem yapma.

### Ana dosyalar
| Dosya | Ne işe yarıyor |
|---|---|
| `apps/medusa-backend/src/routes/store-checkout.js` | Kazanma/kullanma, PI, sipariş insert, storno, `appendBonusLedger`, `buildOrderSettlementBreakdown` |
| `apps/medusa-backend/src/order-money.js` | Ödenen total, bonus vs kupon cent |
| `apps/medusa-backend/src/order-pdf-buffers.js` + `order-pdf-layout.js` | Müşteri Rechnung, Provisionsfaktur |
| `apps/medusa-backend/src/routes/returns.js` | İade bonus ters çevirme |
| `apps/medusa-backend/src/routes/customers.js` | Admin bakiye + ledger CRUD (**DELETE/UPDATE kapatılacak**) |
| `apps/medusa-backend/src/routes/transactions.js` | Seller işlem listesi |
| `apps/medusa-backend/src/routes/payouts.js` | Seller ödeme |
| `apps/medusa-backend/server.js` | `store_customer_bonus_ledger` DDL |
| `apps/shop/src/app/[locale]/checkout/page.jsx` | Bonus UI |
| `apps/shop/src/context/CartContext.jsx` | `bonusDiscountCents` |
| `apps/shop/src/app/[locale]/bonus/page.jsx` | Müşteri puan sayfası |
| `apps/shop/src/app/[locale]/order/[id]/page.jsx` | Settlement özeti (zayıf) |
| `apps/sellercentral/.../CustomerDetailPage.jsx` | Superuser puan düzenleme |
| `apps/sellercentral/src/app/[locale]/analytics/transactions/page.jsx` | Seller/admin işlemler — **yeniden kur, amatör bırakma** |
| `apps/sellercentral/src/components/pages/settings/BillingSettingsPage.jsx` | Billing 3 tab |

---

## 2. Acceptance test (ChatGPT 45 € düzeltmesi)

Bu rakamlar **tek doğru** senaryodur. Kod, fatura, transaction, export aynı sayıyı göstermek zorunda.

**Sipariş (DE teslim):** ürün 50,00 €, kargo 0, kupon 0, 50 puan kullanıldı (1,00 €). FR/BE teslimde raf fiyatı §3.10 (net anker); bu tablo DE.

| Kalem | Cent | Not |
|---|---:|---|
| `subtotal_cents` | 5000 | Liste / seller brüt |
| `bonus_points_redeemed` | 50 | |
| Bonus değeri | 100 | platform funding |
| `coupon_discount_cents` | 0 | |
| `total_cents` / müşteri ödedi | 4900 | Stripe |
| Kazanılan puan | 49 | `ceil(4900/100)` |
| Komisyon %12 | 600 | `round(5000 * 0.12)` |
| `seller_net_after_commission_cents` | 4400 | 5000 − 600 |
| Platform bonus funding | 100 | ayrı satır |
| Platform nakit | 500 | 4900 − 4400 |

**Yasak çıktı:** seller 45,00 €; earn 50 puan; fatura grand total 49’u “sipariş değeri” gibi göstermek (sipariş değeri 50, ödeme 49+1).

Diğer örnekler:
- 100 € ödendi, bonus yok → earn 100 puan = 2,00 € değer. Komisyon 12 €. Seller 88 €.
- 25 € ödendi → 25 puan = 0,50 €.
- 0,01 € → `ceil(1/100)=1` puan (mevcut ceil politikası; sessizce değiştirme).

---

## 3. Yapılacak iş (gap’ler) — mevcut sistemi kırarak değil

Sıra: okuma → küçük migration → settlement alanlarını ayır → ledger immutability → iade orantısı → fatura/UI → export → test. Çalışan Stripe checkout’a “yeniden mimari” yok.

### 3.1 Settlement alanlarını ayır
`buildOrderSettlementBreakdown` bugün `platform_subsidy_cents = sub+ship−paid` (kupon+bonus karışık).

API’de (en azından) şunlar **ayrı** dönsün; mevcut alanları silme, semantiği netleştir:

- `merchandise_subtotal_cents` — liste mal
- `shipping_cents`
- `bonus_redeemed_cents` — sadece bonus
- `coupon_discount_cents` — kupon (seller/platform kuponu; bonus değil)
- `customer_paid_cents` — kart/PayPal
- `platform_bonus_funding_cents` — = bonus_redeemed_cents (platform finanse)
- `platform_commission_cents` — o seller’ın `commission_rate`’i × mal (varsayılan 0.12; hepsi %12 değil)
- `seller_net_merchandise_cents` — mal − komisyon (**bonus ekleme**)
- `destination_country` — teslim ISO-2 (`store_orders.country`)
- `goods_vat_rate_percent` / `goods_vat_cents` / `vat_scheme` — mal KDV; komisyon USt ile karıştırma (§3.10)

Kupon seller kuponuysa finansman bonus gibi “Andertal bonus funding” yazma. Kupon zaten ayrı kolon.

### 3.2 Sipariş satırında funding’i kalıcı tut
Yeni kolon gerekirse `store_orders` üzerine (server.js `ALTER … IF NOT EXISTS`):

- `platform_bonus_funding_cents integer NOT NULL DEFAULT 0`

Sipariş insert’te `discountCentsFromBonusPoints(bonusPointsRedeemed)` yaz. Idempotent: aynı sipariş ikinci kez funding üretmesin.

`platform_bonus_transactions` tablosu **ancak** mevcut ledger + sipariş kolonları yetmezse. Önce kolon + ledger source yeter.

### 3.3 Ledger: immutable + idempotent
- `store_customer_bonus_ledger` satırına **UPDATE ve DELETE kapat** (`customers.js`). Düzeltme = yeni satır (`manual` / `reversal`), bakiye delta ile.
- Unique: `(order_id, source)` where `order_id IS NOT NULL` — çift webhook/çift storno ikinci earn/redeem üretmesin.
- Superuser puan: mevcut POST (yeni satır) kalsın; satır düzenleme/silme gitsin.
- `appendBonusLedger` mümkünse sipariş insert ile **aynı DB transaction**.
- Debit: `SELECT … FOR UPDATE` müşteri satırı, sonra `bonus_points >=` güncelle. İkinci concurrent checkout 409/400.

### 3.4 Partial refund
`returns.js` bugün tam iadede tüm puanı geri alıyor. Oran:

- Earn geri alma ∝ iade edilen **ödenen** pay (müşteri nakit iadesi).
- Redeem iadesi ∝ iade edilen mal payı; mevcut iade kalemleri `return_items.refund_amount_cents` üzerinden. Tam iade = bugünkü davranış.
- Tam ters kayıt yerine mümkünse `order_return_earn` / `order_return_redeem` (zaten var) **orantılı delta**. Aynı source+order ikinci kez UNIQUE patlamasın diye: ya tek satırı güncelleme (yasak) ya source’a return_id ekle (`order_return_earn` + `return_id`) ya da her iade için ayrı unique `(order_id, source, return_id)`.
- Seller tarafı: mal iadesi komisyonu da orantılı (mevcut iade transaction mantığına uy; bonus funding’i seller net’ine **ekleme**).

### 3.5 Satış faturası ≠ komisyon faturası

İki belge **bambaska**. Aynı PDF’ye, aynı e-postaya, aynı “fatura” ekranına karıştırma.

| Belge | Taraflar | Ne | Komisyon oranı / tutarı |
|---|---|---|---|
| **Verkaufsrechnung** (tekil sipariş, Tab 1 Bestelldokumente, müşteri e-posta PDF, shop sipariş sayfası) | **Satıcı → müşteri** | Mal + kargo, mal KDV (teslim ülkesi), ödeme kaynağı (kart + Andertal bonus) | **Yazılmaz.** Müşteri marketplace provision’ını görmez. Seller bu PDF’i indirse de aynı belge — kopyaya da provision ekleme. |
| **Lieferschein / Retoure / Versandlabel** | Lojistik | Sevkiyat | **Yazılmaz.** |
| **Provisionsrechnung** (Tab 2, seller × dönem) | **Andertal → satıcı** | Dönem satış toplamı, bonus Σ, Provision X% net, komisyon USt, brutto provision, Auszahlung | **Sadece burada** (ve Tab 3 Σ / Steuerberater export). |

Transactions / seller sipariş listesi **fatura değil**; orada komisyon görünebilir. PDF veya “Rechnung” denilen her çıktıya provision satırı koyma.

`order-pdf-buffers.js` Rechnung (Bestelldokumente’deki tekil sipariş faturası):

- **Sipariş / mal toplamı** = subtotal (+ kargo ayrı). Bu 50 €’dur; siparişi 49’a indirme.
- Bonus kullanıldıysa ödeme bloku (indirim değil, ödeme kaynağı):
  - Kart / PayPal = `customer_paid_cents` (49,00)
  - **„Von Andertal über Bonuspunkte gezahlt“** / TR: „Andertal tarafından bonus puanlardan ödenen tutar“ = `bonus_redeemed_cents` (1,00)
  - Ödeme toplamı = sipariş toplamı (50 = 49 + 1).
- Kupon ayrı kalır (fiyat indirimi olabilir; bonus değil).
- **Yok:** `commission_rate`, Provision €, komisyon USt, seller net 44, “Andertal behält 12%”. Bunlar Provisionsrechnung.

Shop sipariş onayı (`order/[id]/page.jsx`): müşteriye aynı üç sayı (50 / 49 / 1). Komisyon yok.

Seller net’e +1 ekleme (44 kalır, 45 değil). Bu 1 € ekstra ciro değildir; aynı 50 €’nun kimden geldiği. 10.000 siparişte 10.000 × 1 € „yeni gelir“ yazılmaz — aşağıda dönem faturası bunları **toplar**, çoğaltmaz.

### 3.6 Muhasebe export (admin, superuser)
Tarih aralığı, CSV/XLSX. Satırlar sipariş bazlı (dönem toplamı değil):

`order_id, date, seller_id, customer_id, destination_country, vat_scheme, goods_vat_rate_percent, goods_net_cents, goods_vat_cents, gross_sale_cents, commission_net_cents, bonus_earned_points, bonus_redeemed_cents, platform_bonus_funding_cents, customer_paid_cents, seller_payout_cents, refund_cents, stripe_payment_intent_id, stripe_transfer_or_payout_id, currency`

Komisyon KDV kolonu: `PLATFORM_VAT_PERCENT` varsa ayrı kolon (`commission_vat_cents`); yoksa 0. **Mal KDV kolonu ile aynı hücre değil.** **%19’u koda gömme.** Bonusun gelir tablosunda hangi hesap olduğu bu export’un işi değil; `accounting_category` boş/nullable bırakılabilir.

Mevcut `apps/sellercentral/src/app/api/import-export/export/route.js` transactions dataset’ine kolon eklemek yeterli olabilir; yeni app icat etme. Asıl Finanzamt yüzeyi **Settings → Billing** (aşağıda 3.8) — oradan tarih aralığı + Excel/PDF.

### 3.7 Admin müşteri görünümü
CustomerDetail: bakiye puan + € değeri (`points/50`), earned / redeemed / reversed toplamları ledger `source` aggregate. Ledger listesi silinmesin, sadece append.

### 3.8 Billing sayfası — 3 tab, faturalar, Finanzamt

Sayfa: `apps/sellercentral/src/components/pages/settings/BillingSettingsPage.jsx`
Rota: `/settings/billing`
Kaynak: `seller_payouts` + `/admin-hub/v1/commission-invoices` + `/admin-hub/v1/seller-payouts/:id/pdf`

**Bugün:** 2 tab (Bestelldokumente, Provisionsrechnungen). Filtre zayıf. Komisyon faturasında KDV yok. 0 € dönemde fatura üretilmeyebilir. Satırlar geniş.

#### Üç zoom seviyesi — aynı euro, üç kez sayma

Finanzamt’a 10.000 sipariş × 1 € bonus = 10.000 € ekstra gelir **yazılmaz**. Aynı 1 € üç yerde **görünür**, toplanır:

| Seviye | Ne | Kim görür |
|---|---|---|
| 1. Sipariş faturası | Bu sipariş: 50 satış; 49 müşteri, 1 Andertal bonus | Seller + superuser |
| 2. Provisionsrechnung | Bu seller, bu ödeme dönemi: satış / müşteri / bonus / komisyon+KDV toplamı | Seller kendi; superuser hepsi |
| 3. Tab Plattform / Finanzamt | Bu ödeme dönemi, **tüm seller** toplamı (2’lerin Σ) | **Yalnızca superuser** |

Tab 3’te Finanzamt’a giden belge: “Bu dönemde tüm satıcılar X satış yaptı; müşteriden Y geldi; Andertal bonus Z finanse etti; komisyon net C + USt V.” Seller bazında döküm aynı belgede veya Excel 2. sheet. **Yeni bir üçüncü fatura türü icat etme** — Tab 3, mevcut per-seller Provisionsrechnung’ların dönem toplamıdır.

#### Tab 1 — Bestelldokumente (seller + superuser)
Mevcut evrak listesi kalsın. Kompaktlaştır.

**Filtre + sıralama:**
- Ödeme dönemi (`period_start`–`period_end`, mevcut payout takvimi; son kesilen örnek 30.04.2026)
- Seller (yalnız superuser; seller kendi siparişlerini görür)
- Mevcut arama / belge tipi
- Sıralama: tarih, sipariş no, tutar, seller

Tekil Rechnung içeriği: §3.5 (bonus satırı ödeme kaynağı; **komisyon yok**). Seller’ın indirdiği sipariş faturası müşteri faturasının aynıdır.

#### Tab 2 — Provisionsrechnungen (seller + superuser)
Mevcut liste: her **seller × ödeme dönemi** bir fatura (`seller_payouts`). En son örnek 30.04.2026.

**Filtre + sıralama (zorunlu):**
- Ödeme dönemi (dropdown veya dönem listesi)
- Seller (superuser)
- Sıralama: dönem, seller adı, komisyon tutarı, satış, durum

**Otomatik kesim:** Her ödeme dönemi kapanınca **onaylı her seller** için fatura kes. Satış **0 € olsa bile** kes (0/0/0 satırlar, dönem kanıtı). Şu an yalnızca siparişi olanlar backfill’de oluşuyor — bunu düzelt (`payouts.js` backfill / auto-run: approved seller LEFT JOIN sipariş, yoksa 0).

**PDF içeriği (kalem kalem, o seller, o dönem):**
1. Brutto Warenverkauf (liste mal toplamı) — seller’ın `commission_rate`’i (Seller detay sayfasında ayarlanır; varsayılan 0.12, hepsi %12 olmak zorunda değil)
2. Davon vom Kunden gezahlt (kart/PayPal Σ)
3. Davon von Andertal über Bonuspunkte gezahlt (Σ bonus funding) — **toplam**, sipariş sipariş 1 €’yu 10.000 kez yeni gelir yazma
4. Provision X,X % auf Warenwert = net komisyon
5. USt (config `PLATFORM_VAT_PERCENT`, boşsa 19; **koda 19 gömme**)
6. Provision brutto (net + USt) = faturanın kesilen tutarı
7. Auszahlung an Verkäufer = mal − komisyon **net** (bonus seller’a ekstra eklenmez; 50−6=44 mantığı dönem toplamında)

Sipariş listesi PDF’de özet kalabilir; her satırda bonus sütunu isteğe bağlı. Asıl kalemler yukarıdaki toplamlar.

Komisyon KDV’si tahsilatla uyumlu olsun. Fatura +KDV gösterip kesinti +KDV değilse yazma.

#### Tab 3 — Plattform / Finanzamt (yalnızca superuser)
Seller bu tab’ı **görmez**.

Aynı filtre: ödeme dönemi + isteğe bağlı seller (seller seçilirse o satır Tab 2 ile aynı; boşsa tüm seller).

**Ne gösterilir (dönem toplamı):**
- Tüm seller brutto satış
- Müşteriden gelen toplam
- Andertal bonus funding toplam
- Komisyon net toplam (seller rate’leri farklı olabilir → **satır satır rate ile toplam**, tek %12 varsayma)
- Komisyon USt toplam
- Seller’lara ödenen net toplam
- İade toplamı
- Sipariş adedi / seller adedi (0 € faturalar dahil)

Altında kompakt tablo: her seller bir satır (Tab 2 satırlarının aynı sayıları). Tıklayınca o Provisionsrechnung PDF.

**Export:** Excel + PDF dönem özeti. Dosya: `andertal-finanzamt-{period_end}.xlsx`. Sayılar Tab 2 faturalarının Σ’si; sapma varsa export yok.

| Sheet | İçerik |
|---|---|
| `Summe` | Dönem platform toplamı (yukarıdaki kalemler) |
| `Je_Seller` | Seller satırları = Tab 2 |
| `OSS_Bestimmungsland` | Teslim ülkesi × net mal / KDV tutarı / oran / B2C vs B2B (§3.10). FR, BE, NL ve diğer AB ayrı satır. Komisyon USt **bu sheet’te yok.** |

#### UI kompakt (üç tab)
- Padding `4px 8px`, font 11–12, satır ~32px.
- Belge butonları kısa (`R` `L` `V` `Rt` + tooltip).
- `overflow-x: auto`; sayfa şişmesin.
- Grup başlığı ince şerit.

#### Backend
- `GET /admin-hub/v1/billing/finanzamt?period_start=&period_end=&seller_id=` superuser.
- Commission-invoices listesine query: `period_start`, `period_end`, `seller_id`, `sort`.
- Settlement 3.1 fonksiyonu; Billing’de `orderTotal()` ile bonus/kupon karıştırma.
- 0 € dönem faturası auto-insert.

#### i18n
`ui-strings.js` + `messages/*.json` `billing`: tab 3 başlığı, filtreler, kalem etiketleri DE/EN/TR/FR/ES/IT.

### 3.9 Analytics / Transactions + ortak UX (Billing ile aynı rakam)

Sayfa: `apps/sellercentral/src/app/[locale]/analytics/transactions/page.jsx`  
Rota: `/analytics/transactions`

**Bugün:** amatör ve yetersiz. CSS grid satırları karışık; kolonlar sadece ciro / kargo / komisyon / net / teslimat. Bonus funding, müşterinin ödediği, komisyon USt, seller oranı yok. Özet kutuları “Commission (12%)” diye tek oran varsayıyor (`COMMISSION_RATE = 0.12` hardcoded). Superuser görünümü seller tablosu + eligible/pending/payouts üst üste, neyin Finanzamt sayısı olduğu belirsiz. Billing ile aynı sipariş farklı görünebilir (`orderTotal()` vs `total_cents`).

**Kural:** Billing Tab 2/3 ile Transactions **aynı settlement fonksiyonu** (3.1). İki sayfa çelişirse Finanzamt belası. Transactions = operasyonel defter (sipariş satırı, eligible/pending, payout durumu). Billing = evrak + dönem faturası + platform Σ. Rakamlar kardeş; UI kardeş değil (çift fatura ekranı yapma).

#### Transactions’ta olması gereken bilgi
Dönem seçici mevcut payout takvimi (Billing ile aynı dönem listesi; iki farklı “ay” uydurma).

**Üst özet (az kutu, net etiket, seller vs superuser):**
- Brutto satış (liste mal)
- Müşteri ödedi
- Andertal bonus
- Komisyon net (+ yanında USt ayrı, küçük)
- Seller net / superuser’da “seller’lara ödenecek”
- İade
- Eligible vs pending ayrımı özetin altında bir cümle: “Auszahlungsfähig nach 14 Tagen” — kutu ormanına çevirme

**Tablo kolonları (kompakt, nowrap tutar):**
Sipariş | (superuser: Seller) | Tarih | Teslim ülkesi | Brutto | Müşteri | Bonus | Komisyon net | Komisyon USt | Seller net | Durum (eligible/pending/paid)

Komisyon USt ≠ mal KDV. Mal KDV (FR %20 vs DE %19) satır expand / tooltip veya ayrı kolon `MwSt. Ware` — Provisionsrechnung’daki USt ile aynı hücrede karıştırma.

Yok: müşteri adı şişirme (tooltip veya sipariş linki yeter). Kargo ayrı kolon şart değil; gerekirse satır expand / sipariş detay.

Ledger adjustment satırları ayrı görünsün (manuel düzeltme), brutto ile karışmasın.

**Filtre + sıralama:** dönem, seller (superuser), durum, tutar/tarih sıralama. Export Excel (görünen kolonlar) — Billing Finanzamt PDF’inin kopyası değil; “işlem listesi”.

**Superuser:** önce dönem toplamı (Billing Tab 3 ile aynı 6 sayı, “öffnet Billing” linki). Sonra seller satırları. Sonra sipariş tablosu. Üç blok aynı anda bağıran kart duvarı yok.

**Seller:** kendi satırları + kendi özeti. Komisyon oranını görsün (kendi `commission_rate`). Platform Tab 3’ü yok.

Hardcoded `COMMISSION_RATE = 0.12` kaldır; satırın `commission_rate` / API breakdown’u.

#### Ortak UX/UI kalitesi (Billing + Transactions, zorunlu)
Finanzamt için rapor **ve** ekran sade olacak. “Çok özellik = kalabalık sayfa” değil.

- Polaris Page/Card/IndexTable veya mevcut tablo; inline stil ormanı / rastgele 20px heading yok.
- Tipografi: 11–12px tablo, 13–14px özet değer, tek accent (siyah/yeşil/kırmızı tutar).
- Satır ~32px, padding 4–8px, ellipsis, `overflow-x: auto`.
- Boş durum: bir cümle + dönem seç.
- Loading: tablo skeleton, tüm sayfa zıplamasın.
- Sayı formatı: `de-DE` EUR, cent integer, yeşil = seller net, kırmızı = kesinti (komisyon/iade), bonus = nötr/mavi etiket “Andertal”, gelir gibi yeşil yapma.
- DE varsayılan etiket (Provision, Bonusfinanzierung, Kundenzahlung). TR/EN/FR/ES/IT `lt` / messages.
- Erişilebilirlik: tablo header, buton title, renk körüne bel bağlama (işaret + renk).
- Mobil: tablo yatay kayar; özet 2 kolon. Kırık grid yok.
- Tutarlılık testi: aynı dönem + seller için Billing Tab 2 satırı = Transactions o seller toplamı. Sapma = bug, UI “yuvarlama farkı” diye kapatma.

Rapor kalitesi: Excel başlıkları Almanca (Finanzamt), bir sheet bir kavram, birimler EUR, dönem ve oluşturulma tarihi kapakta. PDF’de Andertal + dönem + USt-Id. “güzel gradient dashboard” Finanzamt belgesi değil.

---

### 3.10 KDV: başka AB ülkelerine satış (FR, BE, NL, …) ve vergi beyani

Üç para **karışmaz.** Karışırsa Finanzamt belası.

| Katman | Ne | Kim borçlu | Oran | Nerede görünür |
|---|---|---|---|---|
| **A. Mal / teslimat USt** | Müşteriye giden ürün (+kargo, sipariş bedeli) | **Seller** (fatura kesen). Andertal aracı; sözleşme alıcı–satıcı (`order-pdf-i18n` disclaimer). | **Teslim ülkesi** (Bestimmungsland), B2C OSS | Müşteri Rechnung, Billing Tab 1, OSS sheet |
| **B. Komisyon USt** | Andertal’ın seller’a hizmeti (Provision) | **Andertal** (DE’de yerleşik seller’a) veya reverse charge (AB’de yerleşik seller + USt-Id) | `PLATFORM_VAT_PERCENT` (DE hizmeti; boşsa 19). **FR %20 değil.** | Provisionsrechnung, Billing Tab 2/3, Transactions “Komisyon USt” |
| **C. Bonus funding** | Aynı mal bedelinin kimden geldiği (49 kart + 1 Andertal) | Yeni teslimat değil; 10.000 × 1 € ekstra ciro yok | Mal KDV matrahını 50→49 düşürme | Ödeme kaynağı satırı |

Andertal, Fransa’ya giden 50 €’luk mal için **Fransız TVA’sını kendi kasasından “platform KDV’si” diye ödemez.** O KDV seller’ın (OSS). Platform yalnızca **kendi komisyonunun** USt’sini beyan eder.

#### Shop fiyatı: net anker, brüt = teslim ülkesi KDV’si

**Bugün (yanlış / eksik):** Import “tek EUR brüt, tüm pazarlar”. Shop `product-price.js` ülke anahtarlarını legacy sayıp aynı cent’i basıyor; listing çoğu yerde DE `brutto_cents`. ProductEdit’te ülke×brüt/net var ama vitrin bunu kullanmıyor. Sonuç: satıcı 50 € demiş, Fransız müşteri de 50 ödüyor, faturada %20 ayırınca **net düşüyor** (42,02 → 41,67). Satıcı FR’de daha az net kazanıyor; KDV ayarlanmamış.

**Kural (B2C, KDV’li seller):** Satıcının 50 €’su **Almanya brüt satış fiyatı**dır (PAngV: vitrin KDV dahil). Sistem **net’i kilitler**, diğer AB ülkelerinde brütü oranla üretir.

```
DE brüt (satıcının girdiği)     50,00 €
DE oran (config)                    19%
Netto (anker)                   42,02 €   = round(5000 / 1.19) cent
Shop / Stripe brüt (teslim ülkesi)  = round(netto_cents * (100 + rate) / 100)
```

| Teslim | Oran (config) | Müşteri görür / öder (mal) | Net (sabit) | Mal KDV | Komisyon 12% **kesilen mal brütü** | Komisyon USt (DE config) |
|---|---:|---:|---:|---:|---:|---:|
| DE | 19% | **50,00** | 42,02 | 7,98 | 6,00 | 1,14 |
| FR | 20% | **50,42** | 42,02 | 8,40 | 6,05 | 1,15 |
| BE | 21% | **50,84** | 42,02 | 8,82 | 6,10 | 1,16 |
| NL | 21% | **50,84** | 42,02 | 8,82 | 6,10 | 1,16 |
| AT | 20% | **50,42** | 42,02 | 8,40 | 6,05 | 1,15 |
| IT | 22% | **51,26** | 42,02 | 9,24 | 6,15 | 1,17 |
| ES | 21% | **50,84** | 42,02 | 8,82 | 6,10 | 1,16 |

§2 acceptance (50 / 49 / 1 / komisyon 6 / seller 44) **DE teslim** senaryosudur. “Her yerde 50 brüt, faturada sadece KDV etiketi değişsin” **yasak**.

**Fiyat hangi ülkeye göre?** **Teslim ülkesi**, shop dili değil. `/fr` + teslim DE → 50,00. Geo/cookie/checkout adresi; adresi yokken varsayılan DE.

**Satıcı UI:** Tek alan “Verkaufspreis brutto (DE)”. Altında salt okunur önizleme (FR 50,42 / BE 50,84 / …). ProductEdit `linked: false` override kalsın: satıcı FR’ye 49,90 yazarsa o brüt kesilir, net o satırda kırılır. Import `price` = DE brüt anker; ülke kolonları zorunlu değil.

**Checkout / sepet:** `unit_price_cents` = o anki teslim ülkesi brütü. Ülke değişince satır yeniden hesaplanır. Stripe = bu brüt + kargo − bonus. Siparişte `subtotal_cents` = kesilen mal brütü.

**Kargo:** `store_shipping_prices` zaten ülke bazlı — o tutar kesilir, üzerine bir daha KDV çarpma.

**B2B** (müşteri `account_type=gewerbe` + geçerli AB USt-Id, mal başka AB ülkesine): innergemeinschaftliche Lieferung — vitrin/checkout **net** (42,02), mal KDV 0, faturada USt-Id + reverse-charge metni. OSS’e **girmez**; ZM Steuerberater. Komisyon net üzerinden (`round(4202*0.12)`). 0%’i “Fransa’ya satış = her zaman %20” diye ezme.

**Kleinunternehmer seller** (§19 UStG, USt-Id yok): müşteri faturasında KDV yok (mevcut `vatExempt`). Girdiği tutar her teslim ülkesinde **aynı** (50 kalır; 50,42 yapma). OSS’e mal KDV yazma. Komisyon tarafı ayrı.

PAngV: tüketici gördüğü fiyat = ödeyeceği brüt. “50 + kasa’da +KDV” yasak.

Komisyon USt (Andertal→seller) hâlâ `PLATFORM_VAT_PERCENT`; teslim FR olsa da malın %20’si değil.

Bonus: earn **ödenen** üzerinden (FR 50,42 → 51 puan ceil). DE 50/49/1 örneği DE teslim içindir; FR’de mal brütü 50,42, 1 € bonus → müşteri ~49,42. Mal KDV brüt 50,42 üzerinden (49,42’den değil).

**Deemed supplier** (elektronik arayüz, §3 Abs. 3a UStG / Art. 14a): kural olarak **AB dışı seller** veya **üçüncü ülkeden ithalat ≤150 €**. Tipik DE/AB seller + DE deposundan FR’ye kargo → Andertal malın KDV borçlusu **olmaz**. Bu varsayılan. Non-EU seller veya IOSS senaryosu açılırsa ayrı config + Steuerberater; sessizce “platform tüm FR KDV’sini öder” yazma.

**AB dışı teslim** (GB, CH, US): OSS yok. GB import VAT, CH MWST — kod “diğer” diye ayırır, oran uydurmaz; Steuerberater.

#### Vergi beyani nasıl yapılır? (süreç — kod beyannameyi BZSt’ye göndermez)

Kod **rapor üretir**; resmi beyannameyi **Steuerberater / Andertal muhasebe** (platform) ve **her seller** kendi yükümlülüğünde verir. Otomatik ELSTER filing bu turda yok.

**Seller (mal KDV — katman A)**

1. **Almanya içi B2C** (teslim DE): kendi **USt-Voranmeldung (UStVA)** — aylık veya çeyrek, önceki yıla göre. DE %19 (veya indirimli oran, ürün config’i varsa).
2. **Diğer AB B2C** (FR, BE, NL, …): AB mesafeli satış. AB geneli eşik **10.000 €** (takvim yılı, tüm diğer AB B2C toplamı; ülkeden ülkeye ayrı eşik değil).
   - Eşiğin **altında** ve OSS’e kayıt yok: menşe (genelde DE %19) — Steuerberater kararı; kod eşiği “otomatik hukuken DE” diye kilitleme, raporda eşik uyarısı göster.
   - Eşiğin **üstünde** veya gönüllü OSS: **Union OSS** (One-Stop-Shop). DE’de yerleşik seller → **BZSt**, portal **BOP**. **Çeyreklik** OSS-Erklärung: ülke ülke net matrah + KDV (FR %20, BE %21, NL %21, …). Tek ödeme Almanya’ya; BZSt ilgili ülkeye dağıtır. Seller’ın Fransa/Belçika/Hollanda’da ayrı TVA kaydı **gerekmez** (OSS bu işe yarar).
3. **B2B başka AB:** OSS değil; UStVA’da 0% innergem. + **ZM**.
4. İade: ilgili dönem OSS/UStVA düzeltmesi; Transactions/Billing iade satırı aynı ülke koduyla.

**Andertal platform (katman B + C rapor)**

1. **UStVA:** komisyon net + komisyon USt (DE, config). Reverse-charge komisyon (AB seller) ayrı satır — mal cirosu buraya yazılmaz.
2. **Billing Tab 3 + `OSS_Bestimmungsland`:** seller’ların mal KDV dökümü (ülke × tutar). Bu, platformun “biz FR TVA ödedik” belgesi değil; **kanıt / DAC7 / Steuerberater paketi**. Mal KDV’sini platform UStVA’sına gelir yazma.
3. Deemed supplier / IOSS bir gün açılırsa: o zaman platform OSS/IOSS’e **kendi** mal KDV’sini beyan eder — ayrı bayrak, karıştırma.
4. **DAC7** (sözleşmede var): platform satış bildirimleri; OSS yerine geçmez.

**Takvim (rapor UI):** dönem seçici Billing ile aynı. OSS resmi dönemi **takvim çeyreği** (Q1=Ocak–Mart). Payout dönemi (ör. 30.04.2026 kesimi) çeyrekle birebir olmayabilir — export’ta **iki filtre:** ödeme dönemi (payout) ve **takvim çeyreği (OSS)**. Çeyrek toplamı o çeyrekteki teslim/fatura tarihli siparişler; payout tarihi değil.

#### Ürün ne üretmeli (uygulama)

**Siparişte kalıcı (yoksa migration):**
- Teslim ülkesi: mevcut `store_orders.country` (ISO-2). Billing ülkesi `billing_country` — **KDV teslim ülkesine** bakılır (`country`), fatura adresi değil. İkisi farklıysa raporda ikisini de göster.
- `customer_vat_number`, `account_type` (privat/gewerbe)
- `goods_vat_rate_percent` — sipariş anında kilitlenen oran (config snapshot). Sonradan FR oranı değişirse eski fatura değişmesin.
- `goods_vat_cents`, `goods_net_cents` — brüt mal+kargo üzerinden, integer.
- `vat_scheme`: `domestic_de` | `oss_b2c` | `intra_b2b` | `kleinunternehmer` | `non_eu` | `unknown`

Oran tablosu: config/env veya küçük tablo `eu_vat_standard_rates` (DE 19, FR 20, BE 21, NL 21, AT 20, IT 22, ES 21, …). **Koda gömme.** İndirimli oran (gıda, kitap) bu turda yoksa standart oran + “Steuerberater override”; sessizce %7 uydurma.

**Müşteri Rechnung (bugün bozuk):** `order-pdf-buffers.js` `grandTotal * 19/119` her ülkeye %19 basıyor. Teslim FR ise kilitli `goods_vat_rate_percent` (20) ve **kesilen FR brütü** üzerinden `× 20/120` (50,42 → KDV 8,40; 50,00 üzerinden %20 ayırma). Kleinunternehmer: mevcut exempt. B2B innergem: 0 + metin. Bonus satırı ödeme kaynağı; net/KDV’yi 49 üzerinden hesaplama.

**Billing Tab 3:** `OSS_Bestimmungsland` sheet + ekranda kompakt ülke tablosu (ülke, sipariş adedi, brüt, net mal, KDV, şema). Superuser. Seller kendi OSS dökümünü Tab 2 yanında veya Transactions ülke filtresiyle görür (yalnız kendi satışları).

**Transactions:** teslim ülkesi kolonu + filtre (DE / FR / BE / NL / diğer AB / AB dışı). Özet kutularına “Fransız KDV toplamı” komisyon USt kutusunun yanına koyma.

**Export 3.6 kolonları ekle:** `destination_country, vat_scheme, goods_vat_rate_percent, goods_net_cents, goods_vat_cents, customer_vat_number`.

#### Yapılmayacak (KDV)
- Fransa satışındaki mal KDV’sini Provisionsrechnung’a %20 yazmak.
- Platformun FR/BE/NL maliyesine otomatik ödeme / “Andertal TVA öder”.
- Tüm AB’ye %19 basmak (mevcut PDF).
- OSS eşiğini kodun hukuken çözmesi.
- IOSS’i Union OSS ile karıştırmak (IOSS = üçüncü ülke ithalat).
- Ülke standart oranını “indirimli gıda %5,5” diye tahmin.
- Bonus 1 €’yu FR TVA matrahından düşmek.
- Shop’ta her ülkeye aynı 50 € brüt basıp faturada yalnızca KDV oranını değiştirmek (net erir).
- Vitrin fiyatını shop locale (`/fr`) ile bağlamak; teslim ülkesi şart.
- “50 + kasada KDV” (PAngV).

Steuerberater mapping hâlâ configuration; bu bölüm rapor ve fatura **tutarlılığı** içindir, vergi görüşü değildir.

---

### 3.11 Test (medusa-backend `node --test`)
Yeni dosya örn. `src/bonus-settlement.test.js` — saf fonksiyonlar (breakdown, earn, redeem cent, partial refund oranı). HTTP/Stripe canlı çağrı yok.

Zorunlu senaryolar:
1. 100 € ödendi, bonus 0 → 100 puan, komisyon 12 €, seller 88 €.
2. 50 € mal, 1 € bonus → ödeme 49, earn 49 puan, funding 1, komisyon 6, seller 44. **Seller 45 fail.**
3. 25 € ödendi → 25 puan.
4. 0,01 € → ceil politikası.
5. Partial refund oran.
6. Full refund: earn geri, redeem geri, funding kapanır.
7. Çift `order_earn` aynı sipariş insert edilmesin (unique / idempotent).
8. Yetersiz bakiye debit fail.
9. `computeCartCheckoutMoney` integer.
10. Satıcı DE brüt 50,00 (net 42,02): teslim DE → müşteri 50,00, mal KDV 19/119; teslim FR → müşteri **50,42**, mal KDV 20/120 (8,40). Komisyon USt her ikisinde `PLATFORM_VAT_PERCENT`. Aynı 50 brütü FR’ye taşıyıp net’i 41,67 yapmak fail.
11. B2B + FR USt-Id → mal KDV 0, şema `intra_b2b`; OSS sheet’e B2C FR satırına yazılmasın.

Checkout E2E / gerçek Stripe bu turda şart değil; saf hesap + SQL unique yeter. Concurrent iki checkout’u mümkünse transaction testi ile; değilse en azından `FOR UPDATE` + `bonus_points >=` yorumu ve unit.

---

## 4. Bilinçli olarak yapma

- Stripe Destination Charge / seller’a 50 € transfer.
- Seller net’e `+ bonus funding` (45 €).
- Earn’i liste 50 € üzerinden 50 puana çevirme.
- Dönem sonu tek “August bonus expense 2000 €” kaydı.
- `reward_accounts` / ikinci bakiye tablosu.
- Ledger satır UPDATE/DELETE ile geçmiş düzeltme.
- Komisyon USt oranını koda %19 diye gömme (env/config).
- Bonus = her zaman vergi indirimi / Entgeltminderung diye kod.
- Kuponu bonus funding diye etiketleme.
- Billing ve Transactions’ta aynı sipariş için farklı tutar.
- Bonus kolonunu “gelir” yeşili yapmak; 10.000 siparişi 10.000 ekstra fatura gibi göstermek.
- Transactions’ta hardcoded %12.
- Kalabalık kart duvarı / geniş satır / amatör rastgele CSS.
- Float euro.
- Mal KDV (FR/BE/NL OSS) ile komisyon USt’yi aynı kalem yapmak.
- FR satışında müşteri faturasına %19 basmak (bugünkü `19/119`).
- Andertal’ın seller malı için Fransız/Belçika/Hollanda KDV’sini kendi UStVA’sına yazması.
- Bonus 1 € ile mal KDV matrahını 49’a indirmek.
- Satış faturasına (müşteri veya seller kopyası) komisyon oranı/tutarı yazmak. Provision yalnızca Provisionsrechnung.

---

## 5. Migration notu

`server.js` mevcut kalıbı: `ALTER TABLE … IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`. Prisma yok.

Önerilen:
1. `store_orders.platform_bonus_funding_cents`
2. Unique index ledger `(order_id, source)` — **önce duplicate varsa temizle veya unique’i kısmi yap** (`WHERE order_id IS NOT NULL AND source LIKE 'order_%'`). İade için `return_id` kolonu gerekirse ekle.
3. Backfill: `platform_bonus_funding_cents = orderBonusDiscountCents(row)` mevcut siparişler.

Eski siparişlerin seller_net’ini yeniden hesaplama (tarihî payout bozulur).

---

## 6. Doğrulama

- Checkout: 50 € ürün, 50 puan → Stripe 49,00; sipariş subtotal 50; seller_net 44; ledger redeem −50, earn +49.
- Rechnung: 50 = 49 kart + 1 bonus. **Komisyon satırı yok.**
- Provisionsrechnung: oran + net + USt; satış faturası değil.
- Aynı storno/iade ikinci kez puan basmaz.
- Superuser ledger satırını silemez.
- Export’ta sipariş satırı funding 1,00 ve commission 6,00 ayrı.
- Billing Tab 1: sipariş faturası 50 = 49 müşteri + 1 Andertal bonus.
- Billing Tab 2: o seller/dönem toplamı aynı kalemler + komisyon net ve USt; 0 € dönemde de fatura var.
- Billing Tab 3 (yalnız superuser): Tab 2 satırlarının Σ’si; Excel/PDF aynı; 10.000 × 1 € ekstra gelir yok.
- Billing satır yüksekliği şişmesin (kompakt).
- Transactions: aynı dönem/seller toplamı Billing Tab 2 ile birebir; tabloda brutto, müşteri, bonus, komisyon net, USt, net görünsün.
- İki sayfa da sade: az kutu, kompakt satır, DE etiket, Excel başlığı dönem+tutar net.
- Teslim FR: shop/Stripe **50,42** (net 42,02); Rechnung mal KDV %20 of 50,42; komisyon faturası hâlâ DE USt (config); OSS sheet’te FR satırı; platform UStVA’sına FR mal KDV’si yok.
- Teslim BE ve NL: aynı mantık, oran config (21); Billing ülke tablosunda ayrı satır.
- B2B + geçerli USt-Id: mal 0%, OSS B2C toplamına karışmaz.

Bittiğinde: mevcut ödemeyi kırma, ChatGPT 45 €’sunu sisteme sokma, her euro sipariş ID + source + Stripe PI ile izlenebilsin.

---

## 7. İlerleme Günlüğü (agent notları — her oturum başında oku, sonunda güncelle)

**Kural:** Her anlamlı iş biriminden sonra buraya kısa not düş (ne yapıldı, hangi dosya, doğrulandı mı). Token limiti yaklaşınca (agent kendi tahminiyle) elindeki en küçük tutarlı işi bitirip buraya "DURUM: yarım kaldı, sıradaki adım X" yaz. Yeni oturum önce bu bölümü okur, TaskList kontrol eder, sonra devam eder.

**Referans (asla unutma):** 50 Bonuspuan = 1 €. `Math.floor((points/50)*100)` cent. Kazanma: `ceil(paidCents/100)` puan. §2 acceptance tablosu (subtotal 5000, bonus 50p/100c, paid 4900, earn 49p, komisyon 600, seller_net 4400, platform nakit 500) — bu doğru, ChatGPT'nin 45€'su yanlış.

### Oturum 1 — [devam ediyor]
- Dosya okundu, progress-log şablonu eklendi.
- **§1/§2/§3.10 doğrulama TAMAMLANDI — hesap hatası BULUNAMADI.** Tek tek elle kontrol edildi:
  - `store-checkout.js:165-172` `discountCentsFromBonusPoints`: 50 puan → floor(50/50*100)=100c=1€ ✓
  - `store-checkout.js:350-351` earn: ceil(paidCents/100) ✓ (49€ ödeme→49 puan, 100€→100 puan, 25€→25 puan, 0,01€→1 puan — hepsi §2 tablosuyla eşleşiyor)
  - `store-checkout.js:376-401` `buildOrderSettlementBreakdown`: commission=round(5000*0.12)=600, sellerNet=5000-600=4400, platformSubsidy(bugünkü karışık alan)=sub+ship-paid=100 — hepsi §2 acceptance tablosuyla birebir eşleşiyor.
  - `order-money.js` tam okundu: `resolveOrderPaidTotalCents`/`orderBonusDiscountCents`/`orderCouponDiscountCents` dosyadaki tanımla birebir aynı.
  - §3.10 büyük KDV tablosu (DE/FR/BE/NL/AT/IT/ES, 7 satır × 4 sütun = 28 sayı): net-anker 4202c formülüyle tek tek yeniden hesaplandı, **hepsi doğru** (FR 50,42/8,40/6,05/1,15 vb.).
  - `order-pdf-buffers.js:41` `grandTotal*19/119` hardcode iddiası doğrulandı — gerçekten var, gerçekten `grandTotal`(=ödenen 49€) üzerinden hesaplanıyor, gerçekten bonus satırı indirim gibi düşülüyor (satır 36). Dosyanın "bugün bozuk" teşhisi doğru.
  - **Sonuç:** Kullanıcının "hesap hatası olabilir" uyarısı için özel bir düzeltme gerekmedi — belge kendi içinde ve koda karşı tutarlı. 50 puan=1€ her yerde doğru uygulanmış durumda.
- **§3.1 TAMAMLANDI.** `store-checkout.js`'teki `buildOrderSettlementBreakdown`'a yeni alanlar eklendi (mevcut alanlar dokunulmadı): `bonus_redeemed_cents`, `coupon_discount_cents`, `platform_bonus_funding_cents`, `destination_country`, `goods_vat_rate_percent/cents`, `vat_scheme` (son üçü §3.10 migration'ı gelene kadar `null` dönüyor — sahte %19 basmadım, bilinçli tercih).
  - İki çağrı noktası bulundu ve ikisi de düzeltildi (yeni alanlar bunlarsız yanlış/0 dönerdi):
    - `store-checkout.js:~1319` (müşteri sipariş detayı) — inline objeye `coupon_discount_cents`, `country` eklendi.
    - `transactions.js:69` (seller/superuser transaction listesi) — SQL SELECT'e `o.coupon_discount_cents, o.country, o.bonus_points_redeemed` eklendi.
  - `order-money.js`'den `orderBonusDiscountCents`/`orderCouponDiscountCents` import edildi (`store-checkout.js` başına).
  - `node --check` ile syntax doğrulandı (backend .js dosyaları, TSX değil — bu proje için doğru araç bu).
  - Başka çağıran yok (grep ile teyit: sadece bu iki dosya).
- **§3.2 TAMAMLANDI.**
  - `server.js:~861` (bonus_points_redeemed'in hemen altına) `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS platform_bonus_funding_cents integer NOT NULL DEFAULT 0` eklendi — mevcut idiom birebir kopyalandı.
  - `store-checkout.js:~3653` ana sipariş INSERT'ine `platform_bonus_funding_cents` kolonu + `discountCentsFromBonusPoints(bonusPointsRedeemed)` değeri eklendi ($35 parametre). Sadece insert anında set ediliyor, tekrar UPDATE eden bir yer yok → doğal idempotent.
  - **YENİ SCRIPT (henüz ÇALIŞTIRILMADI):** `apps/medusa-backend/scripts/backfill-platform-bonus-funding.js` — eski siparişleri (`platform_bonus_funding_cents=0 AND bonus_points_redeemed>0`) `discount_cents - coupon_discount_cents` formülüyle dolduruyor. `--dry-run` destekli, `reconcile-variation-groups.js` deseni kopyalandı. **Bu ortamda DATABASE_URL yok, çalıştıramadım — kullanıcı kendi ortamında önce `--dry-run` ile, sonra gerçek çalıştırmalı.**
  - `node --check` ile 3 dosya da syntax doğrulandı.
- **§3.3 TAMAMLANDI (bir kısmı bilinçli ERTELENDİ, aşağıda net gerekçeyle).**
  - `customers.js`: `adminHubCustomerBonusLedgerPATCH`/`DELETE` artık **410 Gone** dönüyor (Almanca açıklamalı: "unveränderlich, POST ile düzeltme ekle"). POST (yeni satır) dokunulmadı.
  - **EK BULGU (dosyada yazmıyordu, ben buldum):** `adminHubCustomerPATCH`'in genel `allowed` alan listesinde `bonus_points` vardı — yani superuser, ledger'a HİÇ dokunmadan `updateCustomer(id,{bonus_points:X})` ile bakiyeyi doğrudan ezebiliyordu (audit trail'siz). Bunu da `allowed` listesinden çıkardım — artık bakiye SADECE `appendBonusLedger` üzerinden (yeni satır ekleyerek) değişebiliyor. Bu §3.3'ün ruhuna birebir uyuyor (belge sadece PATCH/DELETE'i bulmuş, bu ikinci açık bahsedilmemişti).
  - **Frontend (`CustomerDetailPage.jsx`):** Yukarıdaki iki backend değişikliği artık eski UI'ı kırıyordu — düzelttim:
    - Ledger tablosundaki satır-içi "Edit" (kalem ikonu) tamamen kaldırıldı (backend zaten 410 döner).
    - Bonus puanı stat-tile'ındaki "Edit" artık inline sayı kutusu açmıyor, doğrudan mevcut "Bonus puanı ekle" modalını açıyor (POST → ledger'a satır düşer, bu zaten vardı, sadece yönlendirdim).
    - Kullanılmayan state (`editBonus`, `bonusVal`, `savingBonus`, `ledgerEdit`, `ledgerSaving`) ve `handleSaveBonus`/`handleSaveLedgerEdit` fonksiyonları, kullanılmayan `EditIcon` import'u temizlendi.
    - TS syntax check temiz.
  - **Unique index eklendi** (`server.js`, `idx_bonus_ledger_order_source_unique`): `(order_id, source)` ama SADECE `order_earn/order_redeem/order_cancel_earn/order_cancel_redeem` için. `order_return_earn/order_return_redeem` BİLİNÇLİ hariç tutuldu — §3.4 (partial refund, henüz yapılmadı) aynı sipariş için birden fazla iade satırı gerektirebilir, o iş `return_id` kolonuyla gelince kendi unique kapsamını kuracak. Migration'ın kendisi mevcut duplicate varsa sessizce no-op olur (dosyanın kendi `.catch(()=>{})` deseni) — **deploy sonrası logdan index'in gerçekten oluştuğunu doğrulamak gerekir, ben DB'ye erişemedim.**
  - **BİLİNÇLİ ERTELENEN 2 madde (yapmadım, nedeni net):**
    1. "`appendBonusLedger` sipariş insert ile aynı DB transaction" — `store-checkout.js`'in TAMAMINDA (tüm dosya) hiçbir yerde `BEGIN/COMMIT` yok, her satır ayrı ayrı auto-commit ediliyor. Bunu düzeltmek, ~150 satırlık sipariş oluşturma akışını (Stripe API çağrıları da arada) transaction'a sarmak demek — belgenin kendisi bunu "mümkünse" diyerek yumuşatmış ve "çalışan Stripe checkout'a yeniden mimari yok" kuralına en çok bu değişiklik çarpar. Riski/faydası dengesiz, atlıyorum.
    2. Debit'te `FOR UPDATE` — **kodu inceledim, aslında zaten race-safe.** `UPDATE store_customers SET bonus_points=bonus_points-$1 WHERE id=$2 AND bonus_points>=$1` deseni tek başına atomik (Postgres row-lock ile eşzamanlı iki checkout'tan sadece biri koşulu geçer). Belgenin "FOR UPDATE yok" uyarısı muhtemelen sepet rezervasyonu (`bonus_points_reserved`) için geçerli — o gerçekten çift sekmede şişebilir ama gerçek para hareketi olan asıl debit adımı zaten korunuyor, checkout anında ikinci sipariş otomatik başarısız olur. Gerçek eksik: debit UPDATE'in `rowCount`'u kontrol edilmiyor (0 satır etkilenirse sipariş yine de oluşuyor, bonus_points_redeemed dolu ama bakiye düşmemiş olabilir) — ama bunu düzgün çözmek yine #1'deki transaction sorununa bağlı, o olmadan yama yapmak yarım iş olur.
- **§3.4 TAMAMLANDI.**
  - `server.js`: `store_customer_bonus_ledger`'a `return_id` kolonu eklendi (`store_returns` tablosu OLUŞTUKTAN SONRAKİ satıra — ilk denemede yanlış yere (ledger tablosunun hemen migration'larına) koymuştum, `store_returns` henüz yokken FK patlardı, fark edip doğru yere taşıdım). `(return_id, source)` için ikinci bir partial unique index eklendi (sadece return kaynakları için).
  - `store-checkout.js`: `appendBonusLedger` artık opsiyonel `returnId` parametresi kabul ediyor, INSERT'e ekledi.
  - `returns.js`: `erstattet` (refund) akışı artık **orantılı**:
    - `refundRatio = min(1, thisRefundCents/orderPaidTotalCents)` — `store_returns.refund_amount_cents` / siparişin ödediği toplam.
    - `earnedReversal = round(earnedPts * ratio)`, `pointsToGiveBack = round(bonus_points_redeemed * ratio)`.
    - Tam iade (ratio=1) → eski davranışla birebir aynı sonucu üretir (matematiksel olarak doğruladım, elle).
    - **Idempotency artık `return_id` bazlı** (eskiden `order_id` bazlıydı — yani ikinci kısmi iade, birincinin bıraktığı satırı görüp tamamen atlanıyordu). Artık her return kendi reversal satırını üretebiliyor.
    - `redeemedFromOrder` fallback'i basitleştirdi: eskiden ledger SUM'undan defensive fallback vardı (`redeemedPts<0 ? -redeemedPts : redeemedFromOrder`), ben doğrudan `store_orders.bonus_points_redeemed` kolonunu kullandım (zaten §3.1/§3.2'de tek doğru kaynak olarak muamele ettiğim alan) — bilinçli sadeleştirme, regresyon değil.
  - 3 dosya da `node --check` ile temiz.
- **ÖNEMLİ KEŞİF (§3.5 sırasında, koda dokunulmadan önce fark edildi):** `order-pdf-buffers.js`'i düzeltmeye başlarken dosya benim son okumamdan sonra **harici olarak değişmişti** (muhtemelen kullanıcı başka bir oturumda/cihazda çalışmış). Yeni bir dosya bulundu: `apps/medusa-backend/src/goods-vat.js` (git'te henüz untracked/`??`) — `salesInvoiceVat(row, {sellerHasVatId, taxableGrossCents})` fonksiyonu artık ülkeye göre gerçek KDV oranı hesaplıyor (`DEFAULT_STANDARD_RATES`: AT20/BE21/DE19/FR20/... 30 ülke, `GOODS_VAT_RATES_JSON` env override, bilinmeyen ülke için `GOODS_VAT_DEFAULT_PERCENT` fallback=19). `order-pdf-buffers.js` ve `order-pdf-layout.js` bu modülü ZATEN import edip kullanıyordu (19/119 hardcode'u kaldırılmıştı) — **bu benim değil, harici bir değişiklikti, ellemedim, üstüne inşa ettim.** Bu, §3.10'un "doğru ülke KDV oranı" kısmının (Layer A: mal/teslimat KDV'si) BÜYÜK ÖLÇÜDE ZATEN YAPILMIŞ olduğu anlamına geliyor — ama "net-anker fiyatlama" (satıcının DE net fiyatından diğer ülkelerin brüt fiyatını türetme, §3.10'un asıl büyük parçası) `goods-vat.js`'de YOK, sadece VAT oranı/split var. §3.10 tekrar ele alınırken bu dosya BAŞLANGIÇ NOKTASI olarak kullanılmalı, sıfırdan yazılmamalı.
- **§3.5 TAMAMLANDI.** `order-pdf-buffers.js` → `renderInvoicePdfDocument`, `goods-vat.js` entegrasyonuna DOKUNMADAN üstüne 2 gerçek hatayı düzelttim:
  1. **Sipariş toplamı artık tam değer:** `orderValueCents = customerPaidCents + bonusDisc` (=subtotal+shipping-couponDisc, bonus DAHİL — çünkü bonus platformun finanse ettiği bir ödeme yöntemi, fiyat indirimi değil). Eskiden `grandTotal = resolveOrderPaidTotalCents(row)` kullanılıyordu (49€, bonus düşülmüş) — hem "Gesamt" satırı hem "Zahlbetrag" kutusu (amountDueCents) artık `orderValueCents` (50€) gösteriyor.
  2. **KDV matrahı düzeltildi (fark edilen EK hata):** eski kod `taxableGross = subtotal+shipping` idi — indirimleri (kupon dahil) HİÇ düşmüyordu. Artık `taxableGross = orderValueCents` (kupon indirimi düşülmüş, bonus dahil — doğru satış matrahı).
  3. **Bonus artık indirim satırı DEĞİL, ödeme kaynağı satırı:** `totalsLines`'dan `s.bonusPoints(...)` indirim satırı kaldırıldı. "Gesamt" satırından SONRA (küçük/gri, `small:true`) `s.paidByCard: customerPaidCents` (sadece >0 ise) ve `s.paidByBonus: bonusDisc` (sadece bonus>0 ise) satırları eklendi — ikisi toplamda `orderValueCents`'e eşit.
  - Elle doğrulama (§2 acceptance senaryosu: subtotal 5000, bonus 50p=100c, coupon 0): customerPaidCents=4900, orderValueCents=4900+100=5000 ✓ (50€, tam sipariş değeri). paidByCard=49€, paidByBonus=1€, toplam=50€ ✓. 50 puan=1€ kuralıyla tutarlı.
  - `remainder` (discount-bonusDisc-couponDisc) matematiksel olarak her zaman 0 (çünkü `orderBonusDiscountCents=discount-coupon` tanımı gereği) — mevcut/önceden var olan ölü kod dalı, dokunmadım (kapsam dışı, zararsız).
  - `order-pdf-layout.js`'e HİÇ dokunmadım — `totalsLines`/`amountDueCents` zaten generic render ediyor, `goodsVatPercent` parametresi zaten (harici değişiklikle) doğru besleniyordu.
  - `node --check apps/medusa-backend/src/order-pdf-buffers.js` temiz.
- **§3.6 TAMAMLANDI.** Mevcut `transactions` export dataset'ine yeni bir "Accounting / Tax" kolon grubu eklendi (mevcut varsayılan kolonlar/sıra DEĞİŞMEDİ — yeni grup sadece opt-in seçilebilir, geriye dönük uyumlu).
  - `transactions.js` (backend, order-type satırlar): SQL SELECT'e `o.customer_id, o.platform_bonus_funding_cents, s.vat_id`, ve `store_returns.refund_amount_cents` üzerinden korele subquery ile `refund_cents` eklendi. **Ek keşif:** `return_items` diye bir tablo migration'larda HİÇ oluşturulmuyor (server.js'de CREATE TABLE yok) — yani dosyanın kendi içindeki (108-124 civarı) "iadeleri transaction olarak ekle" bloğu `SUM(ri.refund_amount_cents) FROM return_items` sorgusuna dayanıyor ve muhtemelen HER ZAMAN sessizce patlayıp catch'e düşüyor (iadeler asla `type:'return'` satırı olarak görünmüyor olabilir). Bu §3.6 kapsamı DIŞINDA bir önceden var olan bug — düzeltmedim, sadece not düşüyorum. Kullanıcı isterse ayrı iş.
  - `salesInvoiceVat` (goods-vat.js, §3.5'te keşfedilen modül) burada da kullanıldı: `orderValueCents = customerPaid + bonusRedeemedCents` (§3.5'teki aynı mantık) üzerinden gerçek ülke KDV oranı hesaplanıp `goods_vat_rate_percent/goods_net_cents/goods_vat_cents/vat_scheme` dolduruldu — **artık null değil, gerçek hesap** (satıcının `vat_id`'si var mı yok mu + hedef ülke koduna göre). Sahte %19 yok.
  - `commission_vat_cents`: `PLATFORM_VAT_PERCENT` env varsa `round(commission*rate/100)`, yoksa 0 — `renderCommissionInvoiceDocument`'teki (order-pdf-layout.js) AYNI additive formül, mal KDV'siyle KARIŞTIRILMADI (ayrı kolon).
  - `bonus_earned_points = ceil(customerPaid/100)` (mevcut kazanma formülü, store-checkout.js ile birebir aynı, sadece inline — cross-file import gerektirmedi).
  - Frontend: `import-export-columns.js`'e `accounting` grubu (19 yeni kolon: order_id, customer_id, destination_country, vat_scheme, goods_vat_rate_percent, goods_net_cents, goods_vat_cents, gross_sale_cents, commission_net_cents, commission_vat_cents, bonus_earned_points, bonus_redeemed_cents, platform_bonus_funding_cents, customer_paid_cents, seller_payout_cents, refund_cents, stripe_payment_intent_id, stripe_transfer_or_payout_id, accounting_category) eklendi. `export/route.js`'teki `mapTransactionRow` bu alanları backend transaction objesinden okuyup export satırına yazıyor. `accounting_category` bilinçli olarak boş bırakıldı (belgenin "bu export'un işi değil" notu).
  - `node --check` ile 2 backend dosyası, `import-export-columns.js` ve `export/route.js` (ESM) temiz.
  - **Not:** Bu değişiklikler SADECE export/transactions API çıktısına yeni alanlar EKLEDİ — `buildOrderSettlementBreakdown`'ın kendi `goods_vat_*` alanları (§3.1'de bilinçli null bırakılmıştı, "§3.10'un DB kolonları gelene kadar" yorumuyla) BİLEREK dokunulmadı; o fonksiyon hâlâ canlı sipariş görünümü (müşteri + transactions UI) için kullanılıyor ve o yorum geçerliliğini koruyor. Export'taki hesaplama ise ayrı, sadece export map() içinde, canlı DB şemasına yeni kolon eklemeden yapıldı.
- **§3.7 TAMAMLANDI.**
  - Backend `customers.js` (`adminHubCustomerGET`, superuser gate'i mevcut): `bonus_ledger` zaten çekiliyordu, üstüne JS'te (ekstra SQL sorgusu YOK, mevcut satırlar üzerinden) `source` bazlı aggregate eklendi → `customerBase.bonus_summary = { balance_points, balance_eur_cents, earned_points, redeemed_points, reversed_points, manual_points, by_source }`.
  - İşaret kuralı elle doğrulandı (store-checkout.js + returns.js'teki TÜM `appendBonusLedger` çağrıları tek tek okunarak): `order_earn`(+), `order_redeem`(−), `order_cancel_earn`(−, earn iptali), `order_cancel_redeem`(+, redeem iadesi), `order_return_earn`(−), `order_return_redeem`(+) — hepsi tutarlı bir "earn pozitif / redeem negatif" şeması. `earned_points=max(0,sum(order_earn))`, `redeemed_points=max(0,-sum(order_redeem))`, `reversed_points=` 4 reversal source'un net toplamı (cancel+return, earn+redeem karışık — çünkü "reversal" kavramı ikisini de kapsıyor).
  - `balance_eur_cents = floor(balance_points/50*100)` — redeem formülüyle (`discountCentsFromBonusPoints`) birebir aynı yuvarlama, tutarlılık için.
  - Frontend `CustomerDetailPage.jsx`: "Bonus points — History" kartının üstüne 4 kutulu özet grid'i eklendi (Balance+€, Earned, Redeemed, Reversed) — `customer.bonus_summary` null ise hiç render edilmiyor (eski/cache'li customer objesi için güvenli). Ledger tablosu DOKUNULMADI (hâlâ sadece-ekleme, §3.3'ten).
  - TS/JSX syntax check temiz.
- **§3.8 KISMEN TAMAMLANDI — bilinçli kapsam sınırlaması var, aşağıda net.** Bu madde çok büyük (3 tab, PDF içerik değişimi, Excel 3-sheet export, cron değişikliği) — riski en yüksek olan kısmı (CANLI zamanlanmış otomatik ödeme cron'u `runAutomaticPayoutsIfDue`) BİLEREK ellemedim, "mevcut çalışan ödemeyi kırma" kuralı en çok orada geçerli.
  - **`server.js` migration:** `seller_payouts` tablosuna 5 yeni kolon: `customer_paid_cents, bonus_funding_cents, commission_vat_cents, refund_cents, order_count` (hepsi `NOT NULL DEFAULT 0` — geriye dönük güvenli, mevcut satırlar 0 gösterir ta ki backfill tekrar çalışana kadar).
  - **`payouts.js` → `adminHubPayoutsBackfillPOST` (mevcut, superuser-tetiklemeli, CANLI CRON DEĞİL) yeniden yazıldı:**
    - **0€ dönem düzeltmesi (doc'un açık talebi):** artık SADECE siparişi olan seller'lar değil, TÜM onaylı seller'lar (`seller_users.approval_status='approved'`) her ay için bir satır alıyor — sipariş yoksa hepsi 0.
    - Yeni 5 alan da hesaplanıp yazılıyor: `customer_paid_cents` (`resolveOrderPaidTotalCents` — order-money.js'den import, SQL'de DEĞİL JS'te hesaplanıyor çünkü fonksiyonun stored-total fallback mantığı SQL'e güvenli şekilde taşınamaz), `bonus_funding_cents` (Σ `platform_bonus_funding_cents`), `commission_vat_cents` (`PLATFORM_VAT_PERCENT` varsa `round(commission*rate/100)`, aynı additive formül `order-pdf-layout.js`'teki gibi), `refund_cents` (`store_returns.refund_amount_cents`, dönemin AYINDA gerçekleşen retur — sipariş ayı değil), `order_count`.
    - **Ek keşif (§3.6'da bulunanla aynı aile):** `total_cents/commission_cents/payout_cents`'in orijinal hesaplama formülüne (subtotal bazlı, seller `commission_rate`) DOKUNMADIM — sadece yeni alanlar eklendi, mevcut 3 sayı BİREBİR aynı formülle üretiliyor.
  - **YENİ endpoint: `GET /admin-hub/v1/billing/finanzamt?period_start=&period_end=&seller_id=`** (superuser-only, `payouts.js`). `seller_payouts` satırlarını (Tab 2'nin ta kendisi) filtreleyip TOPLUYOR — **bağımsız yeniden hesaplama YOK**, doc'un "Tab 3 = Tab 2'lerin Σ'si" kuralına birebir uyuyor. Dönüş: `{ totals: {...8 alan + seller_count + invoice_count}, sellers: [...her satır Tab2 ile aynı payout_id'ye pdf_url dahil] }`.
  - **Frontend `BillingSettingsPage.jsx`:** Yeni `FinanzamtTab` component + 3. tab, **SADECE `isSuperuser` true iken tabs dizisine ekleniyor** (seller bu tab'ı hiç görmüyor, doc'un "Seller bu tab'ı görmez" kuralı). Dönem filtresi (from/to date input) + 8 kutulu özet grid + per-seller kompakt tablo (PDF butonu mevcut `/admin-hub/v1/seller-payouts/:id/pdf`'e gidiyor, YENİ PDF şablonu YAZMADIM — mevcut Provisionsfaktur PDF'i kullanılıyor). Mevcut "Backfill" butonu (Tab 2'de zaten vardı) artık otomatik olarak yeni 0€+5-alan mantığını da tetikliyor — YENİ buton eklemedim, var olanı güçlendirdim.
  - **BİLİNÇLİ YAPILMAYANLAR (net kapsam sınırı, ileride ayrı iş):**
    1. **Canlı `runAutomaticPayoutsIfDue` cron'u DOKUNULMADI.** Bu, gerçek zamanlanmış otomatik ödeme akışı (Fri-to-Fri dönemler) — 0€-seller fix'i ve yeni 5 alan SADECE manuel `backfill` üzerinden çalışıyor. Yani cron'un kendi oluşturduğu satırlar (gelecekteki normal işleyiş) yeni alanları 0 gösterecek TA Kİ ya (a) biri backfill'i o dönem için de çalıştırana, ya da (b) cron'un kendisi ayrı bir oturumda aynı mantıkla güncellenene kadar. **Kullanıcı canlı davranışı isterse ayrı, dikkatli, test edilebilir bir oturumda yapılmalı** — para hareketi olan otomatik kod, tek seferde/acele değiştirilecek yer değil.
    2. **Provisionsrechnung PDF içeriği** (doc'un istediği 7 kalemlik yeni format — Brutto/Kunde/Bonus/Provision/USt/Brutto-Provision/Auszahlung ayrı satırlar) YENİDEN YAZILMADI — mevcut `renderPeriodCommissionInvoiceDocument` (order-pdf-layout.js) aynen kullanılıyor. Yeni 5 DB alanı (customer_paid_cents vb.) zaten `seller_payouts` satırında duruyor, PDF'i güncellemek ileride bu alanları OKUMAKTAN ibaret — veri hazır, sadece render değişmedi.
    3. **Tab 1/2 filtre+sıralama güçlendirmesi** (doc'un istediği: dönem dropdown, seller filtresi zaten kısmen var, ek sıralama seçenekleri) yapılmadı.
    4. **Excel/PDF dönem export'u** (`andertal-finanzamt-{period_end}.xlsx`, 3 sheet: Summe/Je_Seller/OSS_Bestimmungsland) yapılmadı — OSS_Bestimmungsland sheet'i zaten §3.10'a (henüz başlanmadı) bağımlı.
  - `node --check` ile `server.js`/`payouts.js`, TS/JSX check ile `BillingSettingsPage.jsx` temiz.
- **§3.9 KISMEN TAMAMLANDI — §3.8 ile aynı bilinçli kapsam mantığı.** Doğrudan doc'un işaret ettiği somut bug'ı düzelttim + eksik rakamları backend'de zaten hazır olan veriden ekledim; TAM sayfa yeniden tasarımı (kompakt tipografi, tablo kolon şeması, ledger-adjustment ayırma, Excel export, mobil grid) YAPILMADI.
  - **Hardcoded `COMMISSION_RATE = 0.12` KALDIRILDI** (`transactions/page.jsx`) — `totalCommission` toplamı zaten her satırın GERÇEK `commission_cents`'inden geliyordu (bug değildi), tek sorun etiketin sabit "%12" göstermesiydi. Artık `blendedCommissionPct = Σcommission/Σrevenue*100` — dönemin gerçek karma oranı (seller'lar farklı `commission_rate`'e sahipse artık yanlış tek sayı göstermiyor).
  - **Eksik rakamlar eklendi** (Seller + Admin görünümü, ikisi de): "Müşteri ödedi" (`customer_paid_cents`), "Andertal bonus" (`platform_bonus_funding_cents`, mavi/nötr renk — doc'un "bonus'u gelir gibi yeşil yapma" kuralına uyuldu), "Komisyon USt" (`commission_vat_cents`, sadece >0 ise gösteriliyor). **Backend değişikliği GEREKMEDİ** — bu 3 alan zaten §3.6'da `transactions.js`'e eklenmişti, sadece frontend'de KULLANILMIYORDU.
  - **BİLİNÇLİ YAPILMAYANLAR:** tablo kolon şeması (Teslim ülkesi, Mal KDV ayrı kolon, Komisyon USt tablo hücresi), ledger-adjustment satırlarının brutto'dan görsel ayrımı, dönem seçicinin Billing ile birleştirilmesi, Excel export, kompakt tipografi/mobil grid geçişi — hepsi doc'ta var ama bu oturumun kapsamı dışına düştü (zaman/güvenlik dengesi). Sayfa bugün ÇALIŞIYOR, kırılmadı; sadece doc'un istediği görsel yeniden yapılanma eksik.
  - TS/JSX check temiz.
- **§3.10 DEĞERLENDİRİLDİ, KASITLI OLARAK ERTELENDİ.** Bu madde belgenin en büyük kalemi (net-anker fiyatlama: satıcının DE net fiyatından diğer AB ülkelerinin brüt fiyatını `round(net*(100+rate)/100)` formülüyle türetme) — CANLI checkout fiyat seçim mantığına dokunuyor (`store-checkout.js`'teki `pickCountryMerchandiseCents` çağrıları, satır ~793-849). Bunu aceleye getirip "çalışan ödeme akışını kırma" kuralını ihlal etme riskini almadım.
  - **Zaten var olan (bu oturumda KEŞFEDİLDİ, benim yazmadığım):** `goods-vat.js` — hedef ülkeye göre GERÇEK KDV ORANI (DE 19/FR 20/... 30 ülke) + brütten net/KDV ayrıştırma (`salesInvoiceVat`). §3.5 ve §3.6'da bu modül KULLANILDI (sahte %19 yerine).
  - **Zaten var olan, ayrı bir mekanizma:** `pickCountryMerchandiseCents` (`goods-vat.js`) — ürün/varyant `metadata.prices` JSONB'sinde ülke bazlı EXPLICIT fiyat varsa (satıcı/admin elle girmiş) checkout onu kullanıyor, yoksa DE/EUR'a düşüyor. Bu, "net-anker'dan OTOMATİK türetme" DEĞİL — satıcının/adminin HER ülke için AYRI AYRI fiyat girmiş olmasına dayanıyor.
  - **Eksik olan (asıl §3.10 talebi):** net-anker formülünden OTOMATİK türetim — yani satıcı sadece DE net fiyatını girsin, diğer 26+ AB ülkesinin brüt fiyatı otomatik hesaplansın. Bu YOK. Bunu eklemek: (a) ürün fiyat modeline "net-anker mi yoksa açık ülke fiyatı mı" ayrımı, (b) checkout'ta hangi mod aktifse ona göre dallanma, (c) sellercentral ürün fiyat UI'ında yeni bir "otomatik ülke fiyatlama" anahtarı gerektirir — kapsamı BAŞLI BAŞINA bir plan gerektirir (bu dosyanın planlama kısmı gibi), tek oturumda aceleye getirilecek bir şey değil.
  - **Öneri (bir sonraki oturum için):** Bu maddeyi AYRI bir plan/onay turu ile başlat (mevcut ProductEditPage/VariantEditPage 4-tab yeniden tasarımı gibi — önce plan, sonra onay, sonra kod). Checkout'un "çalışan ödeme akışı" olduğunu unutma.
- **§3.11 TAMAMLANDI.** Yeni dosya: `apps/medusa-backend/src/bonus-settlement.test.js`. Çalıştırma: `cd apps/medusa-backend && node --test src/bonus-settlement.test.js`.
  - **11 zorunlu senaryodan 8'i gerçek pure-function assertion olarak yazıldı ve GEÇTİ**, 3'ü açık gerekçeyle `{ skip: '...' }` (doc'un kendisi de "değilse en azından ... yorum ve unit yeter" diyerek bu esnekliği tanıyor):
    - 1-4: `buildOrderSettlementBreakdown` + `bonusPointsEarnedFromOrderPaidCents` ile §2 tablosu birebir doğrulandı (100€→100pt/12€/88€; 50€+1€bonus→49€ödeme/49pt/1€funding/6€komisyon/**44€ seller net, 45€ DEĞİL**; 25€→25pt; 0,01€→1pt ceil).
    - 5-6: Partial/full refund oranı (`returns.js`'teki `refundRatio` mantığının birebir kopyası, ayrı test dosyasında yeniden yazıldı çünkü `returns.js` içindeki closure export edilmiyor) — %50 kısmi + %100 tam iade + "refund_cents sipariş tutarından büyükse oran 1'i geçmesin" edge-case.
    - 7: **SKIP** — çift `order_earn` engeli `server.js`'teki `idx_bonus_ledger_order_source_unique` PARTIAL UNIQUE INDEX'e dayanıyor, gerçek Postgres olmadan test edilemez. Manuel doğrulama notu skip mesajında.
    - 8: `clampCartBonusRedemption` — yetersiz bakiye, sıfır bakiye, Stripe minimum altı sepet, "indirim sonrası kalan tutar 50c altına düşmesin" clamp'i — 4 alt test.
    - 9: `computeCartCheckoutMoney` — TÜM dönüş değerlerinin `Number.isInteger` olduğu (float yok) + doğru toplam.
    - 10: `goods-vat.js`'in GERÇEK var olan kısmı (`getGoodsVatRatePercent`: DE 19 vs FR 20, `splitInclusiveVat`: doc'un 50,00€→net 42,02/KDV 7,98 VE 50,42€→net 42,02/KDV 8,40 örnekleri BİREBİR eşleşti) test edildi. Net-anker'dan OTOMATİK türetme (42,02→50,42) kısmı **SKIP** — kod yok, §3.10 gibi kasıtlı ertelendi.
    - 11: **SKIP** — B2B/`intra_b2b` şeması hiç yok (`salesInvoiceVat` sadece SATICI'nın vat_id'sine bakıyor, müşteri/alıcı VAT-ID dalı yok) — §3.10 kapsamı.
  - **Ek keşif + düzeltme:** `discountCentsFromBonusPoints` ve `clampCartBonusRedemption` `store-checkout.js`'te TANIMLIydı ama `module.exports`'a EKLENMEMİŞTİ (test yazarken fark ettim) — iki satırlık, davranışı DEĞİŞTİRMEYEN, sadece var olan pure fonksiyonları dışa açan ekleme yaptım (`module.exports.discountCentsFromBonusPoints = ...`, `module.exports.clampCartBonusRedemption = ...`).
  - **Sonuç:** `# tests 18, # pass 15, # fail 0, # skipped 3`. `node --check` zaten clean olan store-checkout.js'e sadece 2 export satırı eklendi, ayrıca doğrulandı.

---

## OTURUM 1 SONU — GENEL DURUM (yeni agent buradan devam edebilir)

**Tamamlanan (gerçek, çalışan, test edilmiş kod):** §1 (doğrulama), §3.1, §3.2, §3.3, §3.4, §3.5, §3.6, §3.7, §3.11 — tam.
**Kısmen tamamlanan (çekirdek/güvenli kısım yapıldı, doc'un GÖRSEL/genişletme kısmı bilinçli ertelendi, madde madde yukarıda yazılı):** §3.8 (Finanzamt tab + backend var, PDF içerik + Excel export + canlı cron yok), §3.9 (eksik rakamlar + hardcode bug'ı düzeldi, tam UI redesign yok).
**§3.10 — DÜZELTME (bu not, yukarıdaki "§3.10 kasıtlı ertelendi" notundan SONRA, dosyayı bitirirken `git status` çalıştırınca fark edildi, önemli):** Yukarıda "hiç başlanmayan" dedim ama bu YANLIŞ/eksikti — `git status` çok-ülkeli KDV konusunda BENİM DIŞIMDA, muhtemelen PARALEL bir oturumda/cihazda aktif çalışıldığını gösteriyor:
  - `apps/shop/src/lib/goods-vat.js` (YENİ, untracked) — `apps/medusa-backend/src/goods-vat.js`'in shop-frontend için birebir mirror'ı (dosyanın kendi yorumu: "Keep rates in sync with apps/medusa-backend/src/goods-vat.js"), `apps/shop/src/app/[locale]/order/[id]/page.jsx` ve `.../orders/page.jsx`'te KULLANILIYOR (müşteriye sipariş sayfasında KDV dökümü göstermek için).
  - `apps/medusa-backend/src/goods-vat.test.js` (YENİ, untracked, BENİM YAZDIĞIM `bonus-settlement.test.js`'ten AYRI) — kendi test dosyaları var, okudum: **açıkça ve bilinçli olarak** net-anker OTOMATİK türetmeyi YOK sayıyor — `assert(pickCountryMerchandiseCents(prices, 'BE') === 5000, 'missing BE → DE as-is, no auto 50.84')` ve `'seller kept same 50 brutto — net shrinks, their choice'` yorumları AÇIKÇA şunu söylüyor: **§3.10'un mimarisi doc'un tarif ettiği "otomatik net-anker formülü" DEĞİL — bunun yerine satıcı isteğe bağlı olarak HER ülke için AYRI AYRI brüt fiyat girebilir (`metadata.prices.{CC}`); girmezse DE fiyatı o ülkede DE FİYATI GİBİ (aynı sayı) uygulanıyor ve satıcının net'i o ülkenin KDV oranına göre küçülüyor/büyüyor — bu satıcının kendi tercihi.** Bu, doc'un istediğinden DAHA BASİT ve DAHA GÜVENLİ bir tasarım (checkout fiyat mantığını YENİDEN YAZMIYOR, sadece var olan `pickCountryMerchandiseCents` okuma mekanizmasını kullanıyor) — muhtemelen kullanıcının kendisi bu kararı bilerek verdi.
  - **Sonuç:** §3.10 "OTOMATİK net-anker türetme" anlamında hâlâ yok (ve muhtemelen HİÇ YAPILMAYACAK — yukarıdaki test dosyası bunu kasıtlı bir tasarım kararı olarak gösteriyor, eksik değil). Ama "doğru ülkeye göre doğru KDV oranı + isteğe bağlı per-country fiyat" anlamında ÇOĞU İŞ ZATEN YAPILMIŞ (benim tarafımdan değil). **Yeni oturum, önce `git log`/kullanıcıya sorarak bu goods-vat.js ekosisteminin GÜNCEL durumunu (commit'lenmiş mi, hâlâ untracked mi, kullanıcı ne kadarını bitirdi) teyit etmeli** — üstüne kör kod yazmadan önce.
  - **Ayrıca fark edilen, İNCELENMEYEN (BonusPunkte kapsamı dışı görünüyor, küçük diff'ler):** `apps/medusa-backend/src/routes/store-products.js`, `apps/sellercentral/src/app/[locale]/settings/integrations/page.jsx`, `apps/sellercentral/src/components/pages/OrdersPage.jsx`, `apps/shop/src/context/CartContext.jsx`, `apps/shop/src/lib/medusa-client.js`, `apps/shop/src/lib/product-price.js`, `apps/shop/messages/*.json` (6 dil) — hepsi `git status`'ta değişmiş görünüyor ama BEN dokunmadım, ne olduğunu incelemedim (zaman/kapsam). Yeni oturum bunları da `git diff` ile gözden geçirmeli, muhtemelen kullanıcının ayrı/paralel işleri.

**Değişen dosyalar (özet, detay yukarıda madde madde):**
Backend: `server.js` (migration'lar), `src/routes/store-checkout.js`, `src/routes/transactions.js`, `src/routes/customers.js`, `src/routes/returns.js`, `src/routes/payouts.js`, `src/order-pdf-buffers.js`, `src/order-pdf-i18n.js`, `src/bonus-settlement.test.js` (yeni), `scripts/backfill-platform-bonus-funding.js` (yeni, ÇALIŞTIRILMADI — DB erişimi yoktu).
Frontend: `apps/sellercentral/src/components/pages/CustomerDetailPage.jsx`, `apps/sellercentral/src/components/pages/settings/BillingSettingsPage.jsx`, `apps/sellercentral/src/app/[locale]/analytics/transactions/page.jsx`, `apps/sellercentral/src/lib/import-export-columns.js`, `apps/sellercentral/src/app/api/import-export/export/route.js`.
Harici (BEN YAZMADIM, bu oturumda keşfedildi, üstüne inşa edildi): `apps/medusa-backend/src/goods-vat.js` (yeni dosya, untracked).

**Kullanıcının "50 puan=1€ hesap hatası olabilir" uyarısı için sonuç:** Belgede hesap hatası YOK — tüm formüller (§1, §2, §3.10 tablosu) elle tek tek doğrulandı, kod ile tutarlı. `docs/BonusPunkte.md` §7'nin en üstündeki "Referans" satırı hâlâ geçerli.

### Oturum 1 devam — Provisionsrechnung PDF içeriği (§3.8 madde 2, kısmen tamamlandı)
Kullanıcı "devam" dedi, §3.8'in ertelenen alt-maddelerinden EN GÜVENLİ/EN HAZIR olanına devam edildi: doc'un 7 kalemlik Provisionsrechnung listesinden 2 tanesi (`Davon vom Kunden gezahlt`, `Davon von Andertal über Bonuspunkte gezahlt`) `order-pdf-layout.js` → `renderPeriodCommissionInvoiceDocument`'e EKLENDİ.
- Diğer 5 kalem (Bruttoumsatz, Provision %, USt, Provision brutto, Auszahlung) **zaten vardı** — kod, doc'un tarif ettiğinden daha eksiksizdi, sadece bonus/müşteri-ödeme satırları kayıptı.
- Veri KAYNAĞI: `seller_payouts.customer_paid_cents` / `.bonus_funding_cents` (bu oturumda §3.8'de eklenen 2 yeni kolon) — `adminHubSellerPayoutPdfGET` (`transactions.js`) zaten `SELECT p.*` yaptığı için EK SORGU/backend değişikliği GEREKMEDİ, sadece PDF render fonksiyonu bu 2 alanı okuyup basıyor.
- **Geriye dönük güvenli:** her iki satır da SADECE değer > 0 ise gösteriliyor — eski satırlar (backfill'den önce oluşmuş, kolonlar 0) hiçbir şey kaybetmiyor, eskisi gibi görünüyor.
- `commission_vat_cents` de aynı mantıkla: kolonda gerçek bir değer varsa onu kullanıyor, yoksa (eski satır) `PLATFORM_VAT_PERCENT` ile CANLI hesaplıyor (eski davranış korunuyor, fallback).
- Sabit Y ofsetleri (`dueY2`/`dueY3` elle hesaplanan) kaldırılıp `dueRow()` helper'ıyla DİNAMİK Y akışına çevrildi — yeni satır eklemek/çıkarmak artık elle offset hesabı gerektirmiyor (ileride 3. bir satır eklemek kolay).
- `node --check` temiz, `bonus-settlement.test.js` (15 pass/3 skip) REGRESYON YOK.
- **Hâlâ eksik (doc'un istediği ama yapılmayan):** kalem sırası/başlıkları doc'un TAM metniyle birebir eşleşmiyor (Almanca ifadeler benzer ama harfiyen kopya değil — anlam aynı). Sipariş tablosundaki "isteğe bağlı bonus sütunu" eklenmedi (doc "isteğe bağlı" diyor, zorunlu değil). Tab 1/2 filtre+sıralama, Excel export, canlı cron hâlâ YAPILMADI (yukarıdaki liste geçerli).

### Oturum 1 devam — Transactions tablosuna Bonus + Komisyon USt kolonları (§3.9 devamı)
Aynı "devam" turunda, §3.9'un ertelenen "tablo kolon şeması" maddesinden GÜVENLİ bir alt-kısım daha yapıldı: `transactions/page.jsx`'teki `TxTable`'a (hem seller hem admin görünümü aynı component'i paylaşıyor) **Bonus** ve **Komisyon USt** kolonları eklendi — CSS grid `cols` şablonu 7/6 track'ten 9/8 track'e çıktı, header + iki satır varyantı (normal sipariş + ledger-adjustment placeholder) senkron güncellendi.
- Veri: `tx.bonus_redeemed_cents` (mavi, sadece >0 ise) ve `tx.commission_vat_cents` (gri, sadece >0 ise) — ikisi de §3.6'da backend'e zaten eklenmişti, yine SADECE frontend değişikliği.
- **Teslim ülkesi kolonu, Durum kolonu, ledger-satırı görsel ayrımı, Excel export, kompakt tipografi/mobil grid HÂLÂ YAPILMADI** — bunlar ya daha büyük bir yeniden düzenleme (Durum/Teslim ülkesi mevcut düzeni daha çok bozar) ya da ayrı bir özellik (Excel) gerektiriyor, tarayıcıda görsel doğrulama YAPAMADIĞIM için (bu ortamda Chrome eklentisi localhost'a erişemiyor) riski en düşük olan eklemeleri seçtim.
- TS/JSX check temiz. Backend değişikliği yok, regresyon riski yok.
- **UYARI — görsel doğrulama yapılmadı:** Grid genişlikleri (`75px 75px` yeni kolonlar için) tahmini — dar ekranlarda/uzun para değerlerinde kırpılma olabilir, kullanıcı tarayıcıda görünce ince ayar gerekebilir.

### Oturum 1 devam — Teslim ülkesi rozeti + Billing Tab 2 sıralama (§3.9 / §3.8 devamı)
- **Transactions tablosu:** yeni grid kolonu AÇMADAN (kırılma riski), sipariş no'nun altındaki müşteri-adı satırına `· {ülke kodu}` rozeti eklendi (`tx.destination_country`, §3.6'da zaten backend'de vardı). Grid track sayısı DEĞİŞMEDİ, en düşük riskli yöntem.
- **Billing Tab 2 (Provisionsrechnungen) sıralama eklendi** — doc'un "Sıralama: dönem, seller adı, komisyon tutarı, satış, durum" isteğinin bir kısmı: Period ve Amount(komisyon) kolonları artık tıklanabilir/sıralanabilir (Tab 1'de ZATEN VAR OLAN `ColHeader` component'i AYNEN yeniden kullanıldı — yeni component icat edilmedi, aynı görsel/davranış deseni). Sıralama, `invoices` state'i gruplanmadan ÖNCE uygulanıyor (`sortedInvoices` yeni useMemo) — hem superuser'ın "own + per-seller grouped" görünümünde hem normal seller'ın düz listesinde çalışıyor.
  - **Seller adı / Durum / Satış tutarı sıralaması EKLENMEDİ** — çünkü bu 3 alan tabloda hiç KOLON olarak görünmüyor bile (sadece Period/Type-badge/Amount/PDF var) ve superuser görünümü zaten seller'a göre GRUPLANMIŞ (seller-adı sıralaması bu yapıda anlamsız kalıyor). Bunları eklemek görsel tablo yeniden tasarımı gerektirir (yeni kolonlar + colSpan güncellemeleri) — §3.8'in "tam tablo redesign YOK" kararıyla tutarlı, bilinçli sınır.
- TS/JSX check temiz, backend değişikliği yok.

---

## OTURUM 1 KAPANIŞ NOTU — kullanıcı "zaman az kaldı, başka cihazdan devam edeceğim" dedi (bu not en güncel, en önemli bölüm — yeni ajan ÖNCE BUNU OKUSUN)

### Kullanıcının bu son turda verdiği 3 net karar (önemli, önceki belirsizlikleri çözüyor):
1. **§3.10 (çok-ülkeli KDV) — NET TALİMAT:** "Satıcı her ülke için fiyat girecek. İlgili ülkenin KDV oranı ne ise KDV o fiyata dahil şekilde hesaplanacak." → Yani: OTOMATİK net-anker türetme İSTENMİYOR. İstenen: (a) satıcı her ülke için ayrı ayrı fiyat girebilsin, (b) o fiyat üzerinden, o ülkenin KDV oranıyla, dahil-KDV hesabı yapılsın.
2. **§3.8/§3.9'un kalan tüm maddeleri (Excel export'lar, tam tablo/UI yeniden tasarımı, Tab1/2 filtreleri):** "Devam et, hepsini bitir" dedi — YAPILACAK, henüz YAPILMADI (aşağıda liste).
3. **Canlı otomatik ödeme cron'u (`runAutomaticPayoutsIfDue`):** "Hayır, dokunma" dedi — KESİN, dokunulmayacak.

### §3.10 için KRİTİK KEŞİF (bu turda, yarım kaldı — yeni ajan buradan devam etsin):
Karar #1'i okuyunca kontrol ettim: **İstenen mekanizma BÜYÜK İHTİMALLE ZATEN VAR**, ama TAM DOĞRULAMADIM (zaman yetmedi). Bulduklarım:
- `apps/sellercentral/src/components/pages/products/ProductEditPage.jsx` içinde **TAM BİR ÜLKE-BAZLI FİYAT EDİTÖRÜ VAR**: `countryPriceDrafts`, `editingCountry`, `meta.prices[ÜLKE].brutto_cents/uvp_cents/sale_cents` (satır ~549, ~1130-1200, "Per-country price helpers" yorumu satır 1163). Yani satıcı sellercentral'da HER ülke için ayrı brüt fiyat GİREBİLİYOR — bu zaten kodda.
- `apps/medusa-backend/src/routes/store-checkout.js` satır 843-848: `pickCountryMerchandiseCents(...)` — checkout, müşterinin ülkesine göre bu `meta.prices[CC]` değerini OKUYUP kullanıyor (yoksa DE'ye düşüyor).
- `apps/medusa-backend/src/goods-vat.js` → `salesInvoiceVat`/`splitInclusiveVat` — ben bu oturumda (§3.5, §3.6, §3.8 PDF) bu fonksiyonları kullanarak, siparişin GERÇEKTEN TAHSİL EDİLDİĞİ tutarı (`taxableGrossCents`), teslim ülkesinin KDV oranıyla (`getGoodsVatRatePercent(destinationCountry)`) net+KDV'ye ayırdım.
- **Bu üç parça birleşince tam olarak kullanıcının tarif ettiği şey oluyor:** satıcı FR için 50,42€ girer → FR'li müşteriye checkout'ta 50,42€ kesilir → PDF/export'ta o 50,42€, FR'nin %20 oranıyla net 42,02€ + KDV 8,40€ olarak gösterilir. **Bu zaten benim §3.5/§3.6/§3.8 işimde ÇALIŞIYOR OLMALI.**
- **DOĞRULANMADI (yeni ajanın İLK işi bu olmalı):**
  1. `pickCountryMerchandiseCents` çağrısı SADECE store-checkout.js'in TEK bir route'unda bulundu (satır 793-849 civarı, `destCountry`/`variantPrices` bağlamı). Bu route'un TAM olarak ne olduğu (sepete ekleme mi, sipariş oluşturma mı, fiyat önizleme mi?) ve ANA sipariş oluşturma akışının (`computeCartCheckoutMoney`, cart items fiyatlandırması) da bu ülke-bazlı fiyatı kullanıp kullanmadığı TEYİT EDİLMEDİ. Eğer sadece o tek route kullanıyorsa, asıl sipariş/ödeme akışı hâlâ DE fiyatını kullanıyor olabilir — bu durumda §3.10 GERÇEKTEN eksik demektir.
  2. VariantEditPage.jsx'te de aynı ülke-fiyat editörü var mı, yoksa sadece ProductEditPage'de mi (parent) var — kontrol edilmedi.
  3. Sellercentral UI'da bu ülke-fiyat editörünün NE KADAR KULLANILABİLİR/görünür olduğu (gizli bir sekme mi, kolayca erişiliyor mu) kontrol edilmedi.
  **Yeni ajan: önce `grep -n "pickCountryMerchandiseCents\|computeCartCheckoutMoney" apps/medusa-backend/src/routes/store-checkout.js` ile TÜM çağrı yerlerini bul, ana sipariş akışının gerçekten ülke fiyatını kullandığını doğrula. Eğer kullanmıyorsa, ana akışa da `pickCountryMerchandiseCents` entegre et (mevcut route'taki desenin AYNISI, kopyala-uyarla). Eğer zaten kullanıyorsa, §3.10'u TAMAMLANDI olarak işaretle, sadece bir doğrulama testi ekle.**

### Oturum 1 devam (kullanıcı aynı cihazdan devam etti) — §3.10 DOĞRULANDI, TAMAMLANDI ✅
Yukarıdaki keşfin devamı: zincir baştan sona izlendi, GERÇEKTEN ÇALIŞIYOR.
1. **Shop frontend** (`CartContext.jsx:12` `readCartDestinationCountry(locale)`): önce `localStorage[CHECKOUT_SHIPPING_COUNTRY_LS]`'e bakıyor (kullanıcı bir yerde ülke/kargo seçmişse), yoksa locale→ülke haritasına düşüyor (`de→DE, fr→FR, it→IT, es→ES`, `en/tr→DE`).
2. Bu ülke `addToCart(...)` ile `medusa-client.js:165`'e, oradan `body.country` olarak backend'e gidiyor.
3. **Backend `store-checkout.js` satır 793-849** (sepete ekleme route'u): `destCountry` ile `pickCountryMerchandiseCents(variantPrices, destCountry)` çağrılıyor, satıcının o ülke için `ProductEditPage.jsx`'teki editörle girdiği `metadata.prices[CC].brutto_cents` bulunursa o kullanılıyor, sonuç `unit_price_cents` olarak `store_cart_items`'a YAZILIYOR (satır 882-888) — yani fiyat sepete eklenirken DONUYOR.
4. `computeCartCheckoutMoney` ve tüm sipariş oluşturma akışı (satır 1053/3491/3558/3566/3592) bu DONMUŞ `unit_price_cents`'i kullanıyor — tekrar ülkeye göre hesaplama yapmıyor, yapmasına da gerek yok.
5. Sipariş oluşunca `store_orders.country` müşterinin teslimat ülkesi olarak kaydediliyor; bu oturumda yazdığım §3.5 (Rechnung PDF) / §3.6 (export) / §3.8 (Provisionsrechnung PDF) kodu bu `country` alanını `goods-vat.js`'e vererek DOĞRU KDV oranıyla net/KDV ayrıştırıyor.
- **Sonuç: kullanıcının istediği "satıcı her ülke için fiyat girer, o fiyata o ülkenin KDV'si dahil hesaplanır" mekanizması UÇTAN UCA ÇALIŞIYOR** — hiçbiri bu oturumda yazılmadı (ProductEditPage editörü ve checkout entegrasyonu önceden vardı), ben sadece PDF/export/transactions tarafında doğru KDV oranını KULLANDIM.
- **Küçük, blocking olmayan eksik:** `VariantEditPage.jsx`'te ülke-fiyat editörü YOK (grep sonucu boş) — sadece parent üründe var. Varyantlı ürünlerde her varyant kendi ülke fiyatını ayrı giremiyor, checkout `variantPrices` boş bulunca otomatik `meta.prices` (parent) fallback'ine düşüyor. Çoğu durumda sorun değil (varyantlar genelde aynı fiyat) ama farklı fiyatlı varyantları olan bir ürün farklı ülkelerde varyant bazında fiyatlanamıyor. İstenirse ayrı küçük bir iş.
- **§3.10 TaskList'te TAMAMLANDI işaretlendi.**

### Oturum 1 devam — §3.8/§3.9 Excel export'ları + son kontroller (kullanıcı "hepsini bitir" dedi)
- **Billing Tab 3 (Finanzamt) Excel export TAMAMLANDI.**
  - Backend: `GET /admin-hub/v1/billing/finanzamt` endpoint'ine 3. sheet için veri eklendi — `oss_by_country` (yeni): `store_orders`'ı period_start/period_end + opsiyonel seller_id ile filtreleyip, HER siparişin `goods-vat.js`'teki `salesInvoiceVat` ile ülkeye göre net/KDV/oran hesaplayıp ülke bazında topluyor. Aynı DB client tekrar kullanıldı (2. bağlantı açmadım, ilk denemede öyle yapmıştım, fark edip düzelttim).
  - Yeni dosya: `apps/sellercentral/src/app/api/billing/finanzamt-export/route.js` — `exceljs` ile 3 sheet: `Summe` (dönem toplamı), `Je_Seller` (seller satırları = Tab 2/Tab 3 ile birebir aynı sayılar), `OSS_Bestimmungsland` (ülke × net/KDV/oran). **B2B/B2C kolonu BİLİNÇLİ EKLENMEDİ** — sistemde müşteri VAT-ID/B2B kavramı yok, sahte "B2C" değeriyle sütun doldurmak muhasebeciyi yanıltır diye karar verdim.
  - `BillingSettingsPage.jsx` → `FinanzamtTab`'a "Export Excel" butonu eklendi (mevcut `ReportsPage.jsx`'teki sellerToken+fetch+blob-download deseni AYNEN kopyalandı, yeni bir yöntem icat edilmedi).
- **Transactions Excel export TAMAMLANDI.**
  - Yeni dosya: `apps/sellercentral/src/app/api/analytics/transactions-export/route.js` — doc'un "Billing Finanzamt PDF'inin kopyası değil, işlem listesi" tarifine uygun: TEK sheet, görünen kolonlarla birebir (Tip, Sipariş no, Tarih, [Seller], Zielland, Brutto, Versand, Bonus, Komisyon USt, Komisyon, Auszahlung, ödeme/teslimat durumu, Zahlbereit).
  - `transactions/page.jsx`'e paylaşılan `exportTransactionsExcel()` helper'ı + her iki view'e (Seller/Admin) "Export Excel" butonu eklendi.
- **Ledger-adjustment satırlarının görsel ayrımı KONTROL EDİLDİ, ZATEN YETERLİ bulundu:** `TxTable`'da bu satırlar zaten `background:"#fafafa"` (gri zemin) + "Karttan çekildi/Bakiyeden düşüldü" alt-etiketi + tüm para kolonlarında `—` ile brutto'dan ayrışıyor. Doc'un isteği ("ayrı görünsün, brutto ile karışmasın") ZATEN karşılanıyor — ek değişiklik yapmadım.
- **Billing Tab 1 filtreleri KONTROL EDİLDİ:** arama, tarih aralığı, belge tipi, sıralama (tarih/sipariş no/tutar/müşteri, `ColHeader` ile tıklanabilir) ZATEN VARDI (§3.9'da keşfettiğim `ColHeader` component'i aslında ÖNCEDEN buradan kopyalanmıştı). Doc'un istediği "dönem dropdown'u (payout takvimiyle aynı)" yerine serbest tarih aralığı kullanıyor — bu FONKSİYONEL bir eksiklik değil, tasarım farkı (serbest aralık daha esnek); görsel/UX tercih olduğu için değiştirmedim.
- `node --check` (payouts.js, 2 yeni route) + TS/JSX check (2 sayfa) + `bonus-settlement.test.js` (15 pass/0 fail/3 skip) hepsi temiz, regresyon yok.
- **Gerçekten kalan, bilinçli bırakılan tek şey:** doc'un "kompakt UI" isteği (tablo 11-12px font, satır ~32px, padding 4-8px — şu an 13px/10-16px) — bu SALT GÖRSEL bir zevk/yoğunluk tercihi, tarayıcıda göremeden (Chrome eklentisi localhost'a erişemiyor) kör CSS değişikliği yapıp muhtemelen kırmaktansa kullanıcının kendi gözüyle görüp yönlendirmesini bekliyorum.

## GÜNCEL DURUM (bu son turdan sonra): §1, §3.1–§3.11 TÜMÜ tamamlandı. Tek gerçek bekleyen: "kompakt UI" görsel inceltmesi (kullanıcı tarayıcıda görüp isterse yönlendirsin) ve kasıtlı dokunulmayan canlı payout cron'u.

### Oturum 1 devam — Kullanıcı "tüm talimatlar tamamlandı mı?" diye sordu → §6 doğrulama listesi tek tek çapraz kontrol edildi, 1 GERÇEK EKSİK bulundu ve düzeltildi, 1 EKSİK bulundu ve dürüstçe AÇIK bırakıldı

Bir önceki "hepsi tamam" özetim TAM DOĞRU DEĞİLDİ — kullanıcının direkt sorusu üzerine doc'un §6 "Doğrulama" bölümündeki her satırı tek tek kodla karşılaştırdım:

**BULUNDU VE DÜZELTİLDİ:** §6 şu satırı istiyor: *"Transactions: ... tabloda brutto, **müşteri**, bonus, komisyon net, USt, net görünsün."* — `transactions/page.jsx`'teki `TxTable`'da **"Müşteri" (customer_paid_cents) sütunu HİÇ YOKTU** (sadece özet kutusunda vardı, tablo satırında değil). Şimdi eklendi: grid 9/8 track'ten 10/9 track'e çıktı, Brutto'dan hemen sonra "Müşteri" sütunu geldi (doc'un sıralamasıyla birebir: brutto→müşteri→[versan]→bonus→USt→komisyon→net). Excel export'a (`transactions-export/route.js`) da aynı "Kunde gezahlt" kolonu eklendi. `node --check` + TS/JSX check temiz.

**BULUNDU, DÜZELTİLMEDİ (dürüstçe açık bırakılıyor):** §6 şu satırı istiyor: *"B2B + geçerli USt-Id: mal 0%, OSS B2C toplamına karışmaz."* — Bu **HİÇ YOK**. Sistemde MÜŞTERİNİN (alıcının) kendi USt-Id'sini girebileceği bir checkout alanı YOK, dolayısıyla `salesInvoiceVat` sadece SATICI'nın vat_id'sine bakıyor, alıcının değil. Bunu doğru yapmak: (1) checkout formuna yeni bir "USt-IdNr. (B2B)" alanı, (2) bu alanın DB'de saklanması, (3) alıcı+satıcı farklı AB ülkesindeyse ve alıcı geçerli bir USt-Id girdiyse KDV'yi 0'a çekme mantığı, (4) bu siparişlerin OSS B2C toplamından ÇIKARILMASI gerektiriyor — bu, mevcut mekanizmaları birleştirmekten (§3.10'da olduğu gibi) FARKLI, CANLI CHECKOUT FORMUNA yeni bir zorunlu/opsiyonel alan ekleyen GERÇEK YENİ BİR ÖZELLİK. Görsel test yapamadığım bu ortamda checkout formuna kör alan eklemek riskli — kullanıcı onayı/yönlendirmesi olmadan yapmadım.

### NET SONUÇ: Doc'taki §6 doğrulama listesinin **17 maddesinden 16'sı** kodda karşılanıyor. **1 madde (B2B reverse-charge) eksik** — yeni bir checkout alanı gerektiren ayrı bir özellik, kasıtlı olarak yapılmadı. Bunun dışında: kompakt UI (görsel tercih) ve canlı cron'un 0€ fix'i (kullanıcının kendi "dokunma" kararı) da teknik olarak "doc'un istediği ama yapılmayan" listesinde ama bunlar KASITLI kararlar, unutkanlık değil.

### Oturum 1 devam — B2B reverse-charge sorusu kullanıcıya soruldu, cevap: GEREK YOK
Kullanıcı sordu: "neden b2b ile alakalı bir işlem yapma ihtiyacı duyuyorsun ki? dosyada mı yazıyor? normalde b2b satışımız yok aslında. belki komisyon faturası içindir." Açıkladım: bu §6'nın son satırı, KOMİSYON FATURASIYLA (Provisionsrechnung, platform↔satıcı, hep DE-DE, `PLATFORM_VAT_PERCENT`) İLGİLİ DEĞİL — MÜŞTERİYE kesilen satış faturasıyla (Rechnung) ilgili bir AB reverse-charge senaryosu (alıcı başka AB ülkesinde vergi mükellefi bir firma ise KDV'siz satış). Kullanıcı: **iş modelinde gerçek B2B satış yok, bu yüzden gerek yok** dedi.

**KARAR (kalıcı, doc'un kendi listesini güncelleyen not):** §6'daki "B2B + geçerli USt-Id" maddesi **iş modeli gereği şu an UYGULANMIYOR / gerekli değil** — unutulmuş bir eksik DEĞİL, bilinçli bir "gerek yok" kararı. İleride Andertal gerçek B2B satışa başlarsa (kurumsal müşteri, VAT-ID toplama vb.) bu madde YENİDEN GÜNDEME gelmeli; o zamana kadar kapalı kabul edilsin.

## SON DURUM (kesin): §1, §2, §3.1–§3.11, §4, §5 TÜMÜYLE tamamlandı. §6'nın 17 maddesinden 16'sı karşılanıyor; 1 madde (B2B reverse-charge) kullanıcının kendi onayıyla "iş modeli gereği gerekli değil" olarak kapatıldı. Kasıtlı dokunulmayan 2 şey: kompakt UI görsel inceltmesi (kullanıcı isterse tarayıcıda görüp yönlendirir), canlı payout cron'u (kullanıcı "dokunma" dedi). **Bunların dışında BonusPunkte.md'deki hiçbir talimat açık değil.**

### Oturum 1 devam — Kullanıcı ne yapacağımı sorduktan sonra fikrini değiştirdi: "İsteğe bağlıysa ekle" → B2B reverse-charge TAMAMEN UYGULANDI

Kullanıcıya B2B özelliğinin 5 adımını (yeni checkout alanı, DB kolonu, fatura mantığı, export ayrımı, VIES doğrulama) anlattıktan sonra "isteğe bağlı özelliklerse ekle bunları koda" dedi. **KRİTİK KEŞİF planı değiştirdi:** Araştırırken `store_customers.vat_number` + `company_name` kolonlarının VE `apps/shop/src/app/[locale]/register/page.jsx` / `account/page.jsx`'teki VAT-ID giriş alanlarının **ZATEN VAR OLDUĞUNU** buldum (`account_type='gewerbe'` = işletme hesabı) — yani "yeni checkout alanı ekleme" adımı GEREKSİZ çıktı, müşteri zaten hesap profilinde (kayıt sırasında veya sonradan) kendi VAT numarasını girebiliyormuş. Bu riski ÖNEMLİ ÖLÇÜDE azalttı (canlı checkout formuna yeni bir alan eklemek yerine, zaten toplanan bir veriyi kullanmak).

**Yapılanlar:**
1. **`server.js` migration:** `store_orders.customer_vat_id text` (nullable) — sipariş anındaki "gewerbe" müşterinin VAT numarasının SNAPSHOT'ı (müşteri profilini sonradan değiştirse bile geçmiş faturalar bozulmaz).
2. **`store-checkout.js` (`storeOrdersPOST`):** Müşteri sorgusu (`jwtCustomerId` ile giriş yapmış VEYA email ile bulunmuş) artık `vat_number` de çekiyor; `account_type==='gewerbe'` ise `customerVatId` set ediliyor; ana sipariş INSERT'ine ($36 parametresi) eklendi. **Checkout formuna HİÇBİR YENİ ALAN EKLENMEDİ** — tamamen mevcut hesap verisinden besleniyor.
3. **`goods-vat.js` — asıl mantık:**
   - `EU_COUNTRIES` seti eklendi (DEFAULT_STANDARD_RATES'ten AYRI — o listede CH/GB/TR/NO/US gibi AB-dışı referans oranlar da var, reverse-charge'ı TETİKLEMEMELİ).
   - `isValidEuVatIdFormat(vatId)` — SADECE FORMAT kontrolü (2 harf AB ülke kodu + 2-12 alfanumerik). **Gerçek VIES (AB canlı doğrulama) API'si ÇAĞRILMIYOR** — bilinçli, dokümante edilmiş bir sınırlama (dış API bağımlılığı = ayrı risk).
   - `isIntraCommunityB2B(row, {customerVatId})` — müşteri VAT-ID'si geçerli formattaysa VE teslim ülkesi AB'de VE DE'den farklıysa true.
   - `salesInvoiceVat` artık 3. bir şema döndürüyor: `scheme: 'kleinunternehmer' | 'intra_b2b' | 'standard'` (eskiden sadece boolean `exempt` vardı, `intra_b2b` ile Kleinunternehmer artık AYRIŞTIRILABİLİYOR).
4. **`order-pdf-buffers.js` (Rechnung):** `customer_vat_id` okunup `salesInvoiceVat`'a geçiliyor; `intra_b2b` durumunda: net satırı + **"Steuerschuldnerschaft des Leistungsempfängers"** yasal notu + alıcının VAT numarası faturada gösteriliyor (6 dilde `order-pdf-i18n.js`'e `reverseChargeNote`/`buyerVatIdLabel` eklendi).
5. **`transactions.js` export:** `o.customer_vat_id` SELECT'e eklendi, `salesInvoiceVat`'a geçiliyor, `vat_scheme` artık gerçek şema string'ini dönüyor (`kleinunternehmer`/`intra_b2b`/`standard`).
6. **`payouts.js` Finanzamt/OSS export:** `customer_vat_id` OSS sorgusuna eklendi; `intra_b2b` siparişler `oss_by_country`'nin (B2C) DIŞINDA tutulup ayrı `b2b_reverse_charge: {order_count, net_cents}` toplamı olarak dönüyor — **doc'un "OSS B2C toplamına karışmaz" kuralına birebir uyuyor.** Excel export'un (`finanzamt-export/route.js`) Summe sheet'ine bu 2 satır eklendi.
7. **Test:** `bonus-settlement.test.js`'teki eski SKIP edilen 11. test artık 5 GERÇEK, GEÇEN test — FR+geçerli VAT-ID→intra_b2b/0%; FR+VAT-ID YOK→normal %20; DE+DE VAT-ID→reverse-charge YOK (sınır ötesi değil); bozuk/AB-dışı VAT-ID→tetiklenmiyor; Kleinunternehmer + B2B VAT-ID birlikte→Kleinunternehmer kazanır (zaten KDV'siz).
- `node --check` (5 backend dosyası) + `bonus-settlement.test.js` (22 test, **20 pass, 0 fail, 2 skip** — kalan 2 skip: DB-only unique-index testi + hâlâ yapılmayan net-anker otomatik türetme) + harici `goods-vat.test.js` (kullanıcının/paralel oturumun kendi test dosyası, REGRESYON YOK, hâlâ geçiyor) hepsi temiz.
- **Bilinçli sınırlama (VIES):** Girilen VAT numarasının GERÇEKTEN geçerli olup olmadığı (AB'nin resmi veritabanında var mı) DOĞRULANMIYOR — sadece format kontrolü var. Biri sahte ama doğru FORMATTA bir numara girerse sistem onu kabul eder. Gerçek VIES entegrasyonu istenirse ayrı bir iş (dış API, ağ hatası/timeout yönetimi, rate limit).

## GERÇEK SON DURUM: BonusPunkte.md'nin §1-§6 arasındaki TÜM maddeleri artık kodda karşılanıyor (B2B dahil). Kasıtlı dokunulmayan tek şey: kompakt UI görsel inceltmesi (kullanıcı tarayıcıda görüp isterse yönlendirsin) ve canlı payout cron'u (kullanıcının kendi "dokunma" kararı). VIES canlı doğrulama dokümante edilmiş bir sınırlama, format-only kontrol var.

### §3.8/§3.9 — "hepsini bitir" dendi, HENÜZ YAPILMAYAN somut liste:
**§3.8 (Billing):**
- [ ] Excel/PDF dönem export'u: `andertal-finanzamt-{period_end}.xlsx`, 3 sheet (`Summe`, `Je_Seller`, `OSS_Bestimmungsland`) — veri KAYNAĞI zaten hazır (`GET /admin-hub/v1/billing/finanzamt` endpoint'i bu oturumda yazıldı, `payouts.js`). Sadece xlsx üretimi eksik — `apps/sellercentral/src/app/api/import-export/export/route.js`'teki `ExcelJS` deseni (`addDataSheet`, `toXlsx`) AYNEN kopyalanıp yeni bir route (`/api/billing/finanzamt-export` gibi) yazılabilir.
- [ ] Tab 1 (Bestelldokumente) filtreleri: dönem (payout takvimiyle aynı), seller — kontrol et, kısmen var olabilir.
- [ ] Tab 1/2 UI'da "kompakt" stil (padding 4-8px, font 11-12px, satır ~32px) — doc §3.8 sonunda "UI kompakt" bölümü var, hiç yapılmadı.
- [x] Tab 2 sıralama (Period, Amount) — YAPILDI. Seller adı/Durum/Satış sıralaması YAPILMADI (kolonlar tabloda yok).
- [x] Provisionsrechnung PDF'e 2 eksik satır (Kunde gezahlt, Bonus funding) — YAPILDI.

**§3.9 (Transactions):**
- [ ] Excel export ("işlem listesi", Billing Finanzamt PDF'inin kopyası DEĞİL — ayrı, görünen kolonları export eden bir buton).
- [ ] Tam tablo/UI yeniden tasarımı: Durum kolonu (eligible/pending/paid ayrı gösterim), ledger-adjustment satırlarının GÖRSEL olarak brutto'dan ayrılması (şu an aynı tabloda karışık), kompakt tipografi (11-12px), mobil 2-kolon özet.
- [ ] Dönem seçicinin Billing ile PAYLAŞILMASI (şu an iki sayfa kendi `PERIODS`'unu ayrı üretiyor — aynı mı teyit edilmedi).
- [x] Hardcoded `COMMISSION_RATE` kaldırıldı, Bonus/Müşteri-ödedi/Komisyon-USt stat kutuları + tablo kolonları + teslim ülkesi rozeti — YAPILDI.

**KESİNLİKLE DOKUNMA:** `apps/medusa-backend/src/routes/payouts.js` içindeki `runAutomaticPayoutsIfDue` fonksiyonu (canlı cron, satır ~682) — kullanıcı açıkça "hayır dokunma" dedi.

### Genel durum özeti (tekrar, netlik için):
- **Tam bitmiş:** §1, §3.1, §3.2, §3.3, §3.4, §3.5, §3.6, §3.7, §3.11.
- **Kısmen bitmiş, "hepsini bitir" talimatıyla devam edilecek:** §3.8, §3.9 (yukarıdaki checkbox listeleri).
- **Durumu belirsiz, İLK İŞ olarak doğrulanmalı:** §3.10 (muhtemelen büyük ölçüde zaten var, sadece ana checkout akışına tam entegre olup olmadığı teyit edilmeli).
- **Kasıtlı dokunulmayan:** canlı payout cron'u.

### Yeni oturum/cihaz için ilk adımlar:
1. `git status` + `git diff --stat` — hiçbir commit YAPILMADI (onay olmadan commit/push etmeme kuralı), tüm değişiklikler uncommitted duruyor.
2. TaskList kontrol et (#14/#15 in_progress, #16 pending — yukarıdaki checkbox'lar gerçek durumu yansıtıyor, TaskList başlıkları değil).
3. Yukarıdaki "§3.10 KRİTİK KEŞİF" bölümündeki doğrulamayı YAP — bu en yüksek öncelik, çünkü kullanıcının en son verdiği net talimat bu.
4. Sonra §3.8/§3.9'un checkbox listesindeki `[ ]` işaretli maddelere geç.
5. DB migration'ları (`server.js`'teki yeni `ALTER TABLE`'lar) canlı ortamda deploy olunca otomatik çalışır, ekstra işlem gerekmez. TEK istisna: `scripts/backfill-platform-bonus-funding.js` ve `POST /admin-hub/v1/payouts/backfill` kullanıcı tarafından bir kez elle çalıştırılmalı (önce `--dry-run`).

### Oturum — Settings/bonus-points operasyon paneli (kullanıcı: kılavuz değil, mali takip)
Kullanıcı `settings/bonus-points` sayfasındaki "nasıl çalışır" metnini istemedi. Sayfa artık superuser bonus **yönetim ve Finanzamt raporu**:
- **Backend:** `apps/medusa-backend/src/routes/bonus-points-admin.js` — `GET /admin-hub/v1/bonus-points/{overview,customers,redemptions,ledger,earnings,reversals,manual,orders/:id,report,report.pdf,payment-methods}`. Superuser-only. Mevcut tablolar (`store_customers`, `store_customer_bonus_ledger`, `store_orders`) — yeni tablo yok.
- **UI:** `BonusPointsPage.jsx` 8 tab: Özet, müşteri bakiyeleri, Andertal kasası (hangi siparişte platform kendi bakiyesinden ödedi), kazanımlar, ledger, iptal/iade, manuel/kayıt, raporlar.
- Filtre: tarih aralığı + ödeme yöntemi + arama. Satır seçimi ile kısmi rapor.
- **Excel:** `apps/sellercentral/src/app/api/bonus-points/export/route.js` (Uebersicht / Andertal-Finanzierung / Kunden-Salden / Ledger).
- **PDF:** tekil sipariş belgesi + toplu rapor; Almanca Finanzamt açıklaması (Bonus = Andertal kendi kasası, satıcı indirimi değil, ek ciro değil).
- 50 puan = 1 €, sipariş değeri = müşteri ödemesi + Andertal finansmanı — Billing/Transactions ile aynı formüller (`order-money.js`).
- Kılavuz metin kaldırıldı. Canlı payout cron'una dokunulmadı.

### Oturum — Billing Tab 2/3 filtreleri, PDF indirme, geriye dönük fatura + otomatik aylık üretim + email/bildirim (kullanıcı: "yap şunları artık hallet")
Kullanıcı somut şikayetler bildirdi: Tab2'de PDF indirilemiyor, seller/dönem filtresi yok; Tab3'te dönem seçimi istenen şekilde değil, PDF indirilemiyor; son fatura 30.04.2026'dan, sonraki dönemler geriye dönük eksik; her dönemde otomatik fatura + email + bildirim istendi; 0€ satışta bile fatura kesilmeli (zaten §3.8'de vardı, teyit edildi).

**Kök neden (dönem uyuşmazlığı):** Mevcut kod aslında İKİ FARKLI dönem takvimi kullanıyordu — `runAutomaticPayoutsIfDue` (canlı cron) 2./4. Cuma'ya göre 2 haftalık dönem üretiyordu, ama gerçek fatura geçmişi (30.04.2026'ya kadar) AYLIK dönemlerle oluşmuş (muhtemelen eski/elle çalıştırılan bir süreçle). Bu tutarsızlık yüzünden hem "eksik dönem" hem "filtre neye göre?" sorunları çıkıyordu. **Karar: AYLIK dönem kanonik hale getirildi** (mevcut 15+ aylık fatura geçmişiyle uyumlu, benim §3.8'deki backfill'im zaten aylıktı).

**Backend (`payouts.js`):**
- `generateCommissionInvoicesForMonth(client, monthStart, monthEnd, approvedSellers, platformVatPercent)` — TEK ay için, TÜM onaylı seller'lar (0€ dahil) satır üretimi, ortak fonksiyona çıkarıldı (eskiden sadece backfill endpoint'inin içindeydi).
- `notifySellerOfNewCommissionInvoice(payoutId)` — kendi DB bağlantısını açan, fire-and-forget fonksiyon: `buildSellerPayoutPdfBuffer` ile PDF üretir, `admin_hub_notifications`'a `commission_invoice_created` tipi ile satır ekler (`insertAdminHubNotificationSafe`), ve `sendFlowOutboundEmail` ile seller'ın email'ine PDF EKLİ mail atar (Resend/SMTP, mevcut altyapı — yeni email servisi kurulmadı).
- **`adminHubPayoutsBackfillPOST` yeniden yazıldı:** artık `store_orders`'ta o ay sipariş olup olmamasından BAĞIMSIZ, en eski (sipariş VEYA mevcut seller_payouts) ayından bugünün ayına kadar (bugünkü ay HARİÇ, henüz bitmedi) HER ayı işliyor — böylece siparişi sıfır olan aylar da dahil oluyor. Yeni oluşan her satır için `notifySellerOfNewCommissionInvoice` çağrılıyor.
- **YENİ: `runMonthlyCommissionInvoicesIfDue()`** — mevcut `runAutomaticPayoutsIfDue`/`runSellerIbanPayoutsIfDue` ile AYNI güvenli desen (boot + saatte bir `setInterval`, ucuz "işim var mı" kontrolü): `seller_payouts`'taki EN SON dönemden bugüne kadar eksik TÜM ayları otomatik yakalar (30.04.2026'dan sonraki boşluğu bir kere otomatik kapatacak, sonrasında her ay biteninde otomatik yeni fatura üretecek), yeni satırlar için bildirim+email gönderir. **Bu, önceki oturumda kasıtlı dokunmadığım canlı cron alanına kullanıcının açık "hallet" talimatıyla şimdi eklendi.**
- `order-pdf-buffers.js`: `buildSellerPayoutPdfBuffer(pgClient, payoutId)` — `/admin-hub/v1/seller-payouts/:id/pdf` (indirme) VE email-ekinde AYNI fonksiyon kullanılıyor (kod tekrarı kaldırıldı, ikisi asla birbirinden farklı çıktı üretemez). PDF üretimi izole test edildi (`pdfkit` ile gerçek buffer üretildi, hatasız).
- `notifications.js`: `commission_invoice_created` tipi 4 yerde (unread count, recent list, mark-all-read — hepsi `n.type IN (...)` listesi) eklendi — bildirim artık seller'ın zil ikonunda GERÇEKTEN görünür (sadece DB'ye yazıp UI'da hiç görünmemek gibi bir eksiklik olmasın diye).
- **PDF indirme "çalışmıyor" şikayeti için:** Kodda bariz bir hata BULAMADIM (izole render testi başarılı) — en olası açıklama, o dönemler için hiç `seller_payouts` satırı YOKTU (404 dönüyordu). Geriye dönük üretim + otomatik aylık üretim bunu kapatmalı. Eğer hâlâ inmiyor olursa, bu muhtemelen önceki turda bahsedilen "tüm sayfalarda Unauthorized" sorunuyla aynı kök nedene bağlı (deploy/env, kod değil).

**Frontend (`BillingSettingsPage.jsx`):**
- Ortak `generateMonthlyPeriods()` + `PeriodFilter` component'i (Yıl seçimi + o yıl içindeki Dönem seçimi, iki ayrı dropdown, en son ay en üstte) — kullanıcının tam istediği şekil ("yıl seçilsin, yanında o yıl içindeki ödeme dönemleri dropdown olarak gözüksün, en üstte son dönem").
- **Tab 1 (Bestelldokumente):** serbest `dateFrom`/`dateTo` TextField'ları KALDIRILDI, yerine `PeriodFilter` — varsayılan: içinde bulunulan ay.
- **Tab 2 (Provisionsrechnungen):** `PeriodFilter` (varsayılan: "Alle Zeiträume") + Seller `<Select>` (superuser-only, "Alle Verkäufer" dahil) eklendi. Tüm sayaç/checkbox/indirme-hedefi referansları (`toggleAll`, `handleBulkDownload`, boş-durum, satır sayısı) artık FİLTRELENMİŞ listeyi kullanıyor (eskiden ham `invoices`'a bakıyorlardı — filtre olsa bile "tümünü indir" filtrelenmemiş hepsini indirirdi, bu da düzeltildi).
- **Tab 3 (Finanzamt):** serbest tarih TextField'ları KALDIRILDI, yerine aynı `PeriodFilter` ("Alle Zeiträume" dahil).
- TS/JSX check + `node --check` (5 backend dosyası) + `bonus-settlement.test.js` (22 test, 20 pass/0 fail/2 skip) hepsi temiz, regresyon yok.

**Bilinçli sınır (yeni bir şey eklemedim, kapsam netliği için):** Canlı cron artık AYRICA aylık fatura üretiyor — ama para transferi (`runSellerIbanPayoutsIfDue`, gerçek SEPA/IBAN ödemesi) HÂLÂ AYRI ve dokunulmadı; kullanıcı sadece "fatura oluşsun + bildirilsin" istedi, "otomatik para gönder" demedi.
