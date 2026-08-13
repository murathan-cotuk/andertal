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
