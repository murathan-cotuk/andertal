# Andertal Ödeme ve Satıcı Ödemesi (Payout) Denetimi

> **Durum (2026-10-06):** Bu denetimdeki bulgular `docs/Odeme-Payout-Implementasyon.md` ile uygulandı (kanonik settlement, Stripe cevabındaki 7 madde = §G). Aşağıdaki metin denetim anının fotoğrafıdır.

*Tarih: 2026-10-06 · Kapsam: sadece kod okundu, hiçbir şey değiştirilmedi.*

Canlı veritabanı ve Stripe Dashboard görülmedi. Bu yüzden veriye bağlı her nokta "kodda görünen" ve "DB'de doğrulanmalı" diye ayrıldı.

## Özet: En kritik 6 bulgu

1. **"Stripe Connect kullanılmıyor" varsayımı kodda doğru değil.** Otomatik IBAN ödemesi, her satıcı için bir **Stripe Custom bağlı hesabı (connected account)** açıyor. Parayı önce oraya transfer ediyor, oradan satıcının IBAN'ına ödüyor. Bu, Stripe Connect'in "separate charges and transfers" modeli.
2. **Otomatik ödeme yeni siparişleri hiç görmüyor.** Ödeme sorgusu siparişleri `store_orders.seller_id`'ye göre grupluyor. Ama checkout artık her siparişi `seller_id = 'default'` ile kaydediyor; gerçek satıcı sipariş satırlarında duruyor. `'default'` adında bir satıcı hesabı kodda hiç oluşturulmuyor. Sonuç: çok satıcılı sepet döneminden beri otomatik ödeme fiilen çalışmıyor; ödemeler sadece manuel "ödendi" işaretiyle oluyor.
3. **İadelerde Stripe'tan para geri gitmiyor.** Retoure ekranında "erstattet" işaretlemek sadece veritabanını güncelliyor. Stripe iadesi elle Dashboard'dan yapılmalı. Ayrıca dönemsel ödeme formülü iadeleri **hiç düşmüyor**.
4. **Satıcı alacağı (€88) bir borç kaydı olarak tutulmuyor.** Bu tutar her ekranda o anki komisyon oranıyla yeniden hesaplanıyor. Yerleşik, kalıcı bir muhasebe kaydı (ledger) yok.
5. **Chargeback/dispute işlenmiyor.** Bu konuda tek bir webhook bile yok.
6. **Güvenlik açığı:** Giriş yapmış her satıcı herhangi bir siparişin `payment_status` ve `delivery_date` alanlarını değiştirebiliyor. Bu, 14 günlük beklemeyi atlatıp ödemeyi erkene çekmeye izin veriyor.

---

## 1. Stripe ile ilgili kod nerede?

| Konu | Dosya ve fonksiyon | Durum |
|---|---|---|
| PaymentIntent | `routes/store-checkout.js` → `storePaymentIntentPOST` (~1100–1330) | Ödeme platformun kendi hesabına alınıyor. `transfer_data`, `application_fee_amount`, `on_behalf_of` **yok**. |
| Stripe Customer | `store-checkout.js` (~1192, 1271), `routes/saved-payment-methods.js` | Giriş yapmış müşteri için oluşturuluyor; kayıtlı kart desteği var. |
| Charge / sipariş oluşturma | `store-checkout.js` → `storeOrdersPOST` (~3530–3960) | Sipariş, tarayıcı `POST /store/orders` çağırınca oluşuyor. Öncesinde PaymentIntent `succeeded` mi diye kontrol ediliyor. |
| Webhook | `routes/webhooks.js` → `/webhook/stripe` | İşlenen olaylar: `payment_intent.succeeded` (sadece durum alanları), `checkout.session.completed` (kampanya), `charge.refunded`, `payout.paid`, `payout.failed` |
| Refund (iptal) | `store-checkout.js` (~3340–3515), müşteri iptali | `stripe.refunds.create` ile **tam iade**, sadece gönderimden önce. |
| Refund (iade) | `routes/returns.js` → `adminHubReturnPATCH` (150–304) | **Stripe çağrısı yok**, sadece DB. |
| Kısmi iade | `store_returns.refund_amount_cents` | Sadece DB alanı; Stripe'a hiçbir şey gönderilmiyor. |
| Dispute / chargeback | – | **Hiç yok.** |
| Connect: Custom hesap | `payouts.js` → `attemptSellerIbanPayout` (1166), `seller-account.js` (59–142, IBAN kaydedilince) | **Aktif kod.** |
| Connect: Express hesap | `routes/stripe-connect.js` (onboard/status/dashboard) | Kod var; dokümana göre ekran sadece superuser'a açık. |
| Transfer | `payouts.js:1216` (Custom hesaba), `stripe-connect.js:322` (eski model, `source_transaction`'lı) | |
| Transfer reversal | `webhooks.js:255` | Sadece eski "legacy transfer" modelinde. |
| Payout | `payouts.js:1223` (Custom hesaptan IBAN'a), `stripe-connect.js:283` (destination modeli) | |
| Balance transaction / Stripe ücreti | – | **Hiç okunmuyor**, Stripe ücreti hiçbir yerde kaydedilmiyor. |
| Application fee / destination charge | `stripe-connect.js`, `webhooks.js` (eski dallar) | Yeni ödemelerde **kullanılmıyor** (`docs/BonusPunkte.md:79` de bunu söylüyor). |
| Zamanlanmış işler | `payouts.js:1343–1355`: açılışta bir kez + `setInterval` ile saatte bir | BullMQ veya cron yok, işler sunucu sürecinin içinde çalışıyor. |
| Etiket ücreti | `seller-billing.js` → `chargeSellerForLabel` | Satıcı bakiyesinden düşülüyor veya satıcının kartından çekiliyor. |
| Affiliate ödemeleri | `modules/affiliate-platform/payout-scheduler.js` | Express transfer; `AFFILIATE_PAYOUTS_ENABLED` ile kapalı. |

## 2. Para gerçekte nasıl akıyor?

```
Müşteri → Stripe PaymentIntent (platformun hesabı, transfer yok)
→ POST /store/orders: store_orders oluşur
   (seller_id='default', payment_status='bezahlt', stripe_payout_status='pending')
   satıcı bilgisi store_order_items.seller_id'de
→ Para Andertal'in Stripe bakiyesinde bekliyor
→ ÜÇ AYRI, BİRBİRİNE BAĞLI OLMAYAN "ödeme" yolu:
```

| Yol | Ne yapıyor | Gerçekte ne oluyor |
|---|---|---|
| **A. Otomatik IBAN** (`runSellerIbanPayoutsIfDue`, ayın 2. ve 4. Cuması) | Teslimattan 14 gün geçmiş ve açık iadesi olmayan siparişleri seçiyor. Satıcının Custom hesabına transfer yapıyor, oradan IBAN'a ödüyor. | Siparişleri `o.seller_id` üzerinden satıcı tablosuna bağlıyor; değer hep `'default'` olduğu için **yeni siparişlerde hiçbir şey ödenmiyor** (kodda böyle, DB'de doğrulanmalı). |
| **B. Dönem tablosu** (`runMonthlyCommissionInvoicesIfDue` → `generateCommissionInvoicesForMonth`) | Her 15 günde satıcı başına bir `seller_payouts` kaydı (durum "offen"), Provisionsrechnung PDF'i ve e-posta oluşturuyor. Hesap sipariş satırlarından yapılıyor, bu kısım doğru. | Dönemi **sipariş tarihine (`created_at`)** göre kesiyor; 14 günü ve iadeleri hesaba katmıyor. |
| **C. Manuel "ödendi"** (`adminHubPayoutsMarkPaidPOST`) | Superuser bankadan havale yapıp kaydı "bezahlt" işaretliyor. | Tutar elle giriliyor; gerçek bir transferle eşleşme kontrolü yok. |

Doküman ile kod arasındaki farklar:
- **`docs/dökümantasyon/11 …Stripe.md`:** "superuser havale yapıp işaretler" diyor. Kod ise ayrıca otomatik Stripe Custom transferi yapıyor, ve doküman Custom hesaplardan hiç bahsetmiyor.
- **`docs/BonusPunkte.md:21`:** "satıcıya 14 gün sonra `seller_net_after_commission_cents` ile ödenir" diyor. Kodda bu alan sipariş sahibi `'default'` için hesaplanıyor, yani bütün sepet toplamı eksi varsayılan %12. Satıcı bazında doğru değil.
- **Satıcı sözleşmesi §11 (`seller-agreement-de.js`):** "Zahlungsdienstleister ist derzeit Stripe Connect … Zahlungen im Namen des Verkäufers … Eingang beim Zahlungsdienstleister gilt als Eingang beim Verkäufer" diyor. Kodda ise ödeme satıcı adına değil, platformun normal ödemesi olarak alınıyor (`on_behalf_of` yok, destination charge yok).

## 3. Stripe Connect gerçekten kullanılıyor mu?

- **Custom hesaplar: evet, aktif.**
  - Satıcı IBAN kaydettiğinde açılıyor (`seller-account.js:97`); ödeme sırasında hesap yoksa yine açılıyor (`payouts.js:1189`).
  - Hesap kimliği `seller_users.stripe_custom_account_id` alanında tutuluyor.
  - Hesap açılırken `tos_acceptance` alanını platform kendisi dolduruyor: `payouts.js`'de IP olarak `127.0.0.1` gönderiliyor. Hesap türü sabit olarak "individual", ülke sabit olarak DE. Satıcının kimlik doğrulama (KYC) bilgileri gönderilmiyor.
- **Express hesaplar:** kod var (`stripe-connect.js`), dokümana göre normal satıcılara kapalı. `seller_users.stripe_account_id` alanında tutuluyor.
- **Diğer sorular:**
  - Ödeme satıcı adına mı oluşturuluyor? **Hayır.**
  - Application fee kullanılıyor mu? **Hayır.**
  - Platform bakiyesinden satıcıya transfer var mı? **Evet:** `transfers.create` ile Custom hesaba. `source_transaction` ve `transfer_group` kullanılmıyor.

Sonuç: Mevcut kod "separate charges and transfers + Custom recipient account" modeline benziyor. "Stripe'ı hiç kullanmadan bankadan IBAN ödemesi" modeli değil.

## 4. Satıcının parası muhasebede nasıl tutuluyor?

| Kavram | Durum |
|---|---|
| Satıcı alacağı / bakiyesi | Ayrı bir tablo **yok**. `getSellerAvailableCents` (`seller-billing.js:13`) = satıcının **bugüne kadarki tüm cirosu** + düzeltmeler. Yapılmış ödemeleri, iadeleri ve komisyonu düşmüyor; yani hep artıyor. |
| Seller ledger | `seller-ledger.js`: **her istekte siparişlerden yeniden hesaplanan bir görünüm**, kalıcı bir muhasebe defteri değil. Komisyon o anki satıcı oranıyla hesaplanıyor. |
| Kalıcı kayıtlar | `seller_ledger_adjustments` (etiket ücretleri, düzeltmeler), `seller_payouts` (dönem tablosu ve ödeme durumu) |
| Bekleyen / ödenebilir ayrımı | Sadece ekranda gösterim için (`payouts.js` overview, 14 gün koşulu). Kayıt olarak yok. |
| İade ve chargeback rezervi | **Yok.** |
| Stripe ücreti | **Yok.** |

**€100 örneği:** €88'lik satıcı alacağı hiçbir yerde **satıcıya borç kaydı olarak tutulmuyor**. Sadece `order`, `order_items` ve satıcının komisyon oranı tutuluyor; €88 her raporda o anki orana göre yeniden hesaplanıyor. Satıcının oranı değişirse eski siparişlerin tutarı da değişir. Sözleşme §12 ise "işlem anındaki fiyat listesi geçerlidir" diyor. Sipariş anındaki tek sabit değer `seller_net_after_commission_cents`, o da satıcı bazında değil (bkz. Bölüm 2).

## 5. Muhasebe ayrımı: satıcının parası mı, Andertal'in geliri mi?

Teknik olarak **ayrılmamış**.
- **Komisyon geliri** sadece rapor ve PDF düzeyinde ayrı görünüyor: Provisionsrechnung, `seller_payouts.commission_cents` ve `commission_vat_cents`, Finanzamt export (`/billing/finanzamt`).
- **Platform hesabına gelen €100'ün kayıtları:**
  - €100'ün tamamı `store_orders.total_cents`.
  - €88'in "satıcıya borç" olarak kaydı yok.
  - €12'nin gelir kaydı sadece hesaplanmış bir değer.
  - Stripe ücretinin kaydı yok.
- **İyi tarafı:** belgelerde ve PDF metinlerinde ayrım doğru yazılmış. Örneğin `order-pdf-layout.js:1310`: "Andertal ist Vermittler … Warenwert ist Umsatz des Verkäufers".

## 6. Vergi hedefi açısından eksikler

Her akışın ayrı tutulup tutulmadığı:

| Akış | Durum |
|---|---|
| Satıcıya borç | ❌ kayıt yok |
| Komisyon geliri | ⚠️ hesaplanmış, kalıcı değil |
| Satıcı hesaplaşması | ⚠️ dönem tablosu var ama gerçek para hareketine bağlı değil |
| Tam iade | ⚠️ sadece iptal Stripe'ta gerçek; retoure iadesi sadece DB |
| Kısmi iade | ❌ ödeme formülü düşmüyor |
| İptal | ✅ |
| Chargeback | ❌ yok |
| Başarısız payout | ⚠️ sadece siparişte işaretleniyor, `seller_payouts`'a yansımıyor, tekrar deneme veya bildirim yok |
| Payout geri alma | ❌ yok |

## 7. 14 günlük bekleme

- **Var, ve teslimat tarihinden başlıyor:** `payoutEligibleOrderSql` (`payouts.js:943`) şartı `delivery_date <= now() - 14 days`.
- **Teslimat tarihi nerede yazılıyor:**
  - Sendcloud webhook'u (`webhooks.js:94`)
  - Takip modülü (`shipment-tracking.js:114, 439`)
  - Manuel "zugestellt" işaretleme (`orders.js:440`)
- **Ama sadece otomatik yolda (A) uygulanıyor.** Dönem tablosu (B) `created_at`'e göre çalışıyor, ve fiilen kullanılan manuel ödeme o tabloyu esas alıyor.
- **Tarih alanları:**

  | Kavram | Durum |
  |---|---|
  | Sipariş tarihi | var (`created_at`) |
  | Ödeme tarihi | ayrı alan yok |
  | Teslimat tarihi | var (`delivery_date`) |
  | Return window başlangıç/bitiş | ayrı alan yok, hesaplanıyor |
  | `payout_eligible_at`, `scheduled_at` | **yok** |
  | `completed_at` | sadece `seller_payouts.paid_at` |
- **Risk:** `PATCH /admin-hub/v1/orders/:id` (`orders.js:412`) yetki kontrolü yapmıyor. Herhangi bir satıcı `delivery_date`'i geçmişe çekebilir.

## 8. İade ve geri ödeme senaryoları

| Senaryo | Kodun davranışı |
|---|---|
| 14 gün dolmadan €100 tam iade (retoure) | `order_status = 'refunded'` → otomatik yoldan çıkıyor. **Ama Stripe iadesini biri elle yapmalı.** Dönem tablosu ve satıcı ödemesi **hâlâ €100'ü sayıyor** (`payment_status` hâlâ "bezahlt", formül iadeyi düşmüyor). |
| €100 siparişte €40 kısmi iade | Ledger'da −€40 ve +€4,80 komisyon iadesi görünüyor. Ama dönem ödeme formülü iadeyi düşmüyor → satıcı tam tutarı alabilir. Otomatik yolda ise sipariş komple dışarıda kalıyor → kalan €60 hiç ödenmiyor. |
| Ödeme yapıldıktan sonra iade | Geri alma yok, negatif bakiye yok (formül sonucu en az 0'a sabitleniyor), uyarı yok. Webhook sadece eski destination modelinde log yazıyor. |
| Komisyon | Sözleşme §12 kısmi iadede oransal komisyon iadesi vaat ediyor. Bu sadece ledger görünümünde var, ödeme tutarına yansımıyor. |

Ayrıca: iade sorguları siparişi "satıcıya ait mi" diye kontrol ediyor (`sqlOrderOwnedBySeller`), `store_returns.seller_id`'ye bakmıyor. Çok satıcılı bir siparişte A satıcısının iadesi B satıcısının ledger'ında da görünebilir.

## 9. Chargeback / dispute

Hiç işlenmiyor. Satıcı bakiyesi etkilenmiyor, zararın tamamı fiilen Andertal'de kalıyor. Satıcıdan geri alma, bekleyen paradan mahsup ve negatif bakiye mekanizmalarının hiçbiri yok. Buna rağmen sözleşme §11 "offener Chargeback" durumunda para tutabileceğimizi söylüyor.

## 10. IBAN ile ödeme

- **Nerede tutuluyor:** `seller_users.iban`, `payment_account_holder`, `payment_bic`, `payment_bank_name`.
- **Doğrulama:** sadece MOD-97 sağlama kontrolü (yazım hatasını yakalar). Hesap sahibinin satıcıyla aynı kişi olduğuna dair kontrol yok.
- **Ödeme yolu:**
  - Otomatik: Stripe Custom hesap → Stripe payout ile SEPA.
  - Manuel: banka havalesi + DB işareti.
  - Başka bir ödeme sağlayıcısı veya SEPA XML (pain.001) yok.
- **Satıcı onayı:** `approval_status` ve kimlik doğrulama adımları var. Ama Stripe tarafındaki KYC yapılmıyor (Custom hesaplar KYC bilgisi olmadan açılıyor).

## 11. Mimari karşılaştırma (hukuki görüş değil)

- **Mevcut kod:** platformun normal ödemesi → para platform bakiyesinde → Custom hesaba transfer → oradan payout. Yani teknik olarak "separate charges and transfers + Custom recipient". Para teslimat ve 14 gün sonrasına kadar platform bakiyesinde bekliyor.
- **Klasik Connect "destination charge":** ödeme alınırken para satıcının hesabına yönlendirilir, komisyon `application_fee` ile alınır, iade ve chargeback satıcı hesabından geri alınır, Stripe ücreti satıcıda da kalabilir. Bekleme süresi satıcının hesabındaki ödeme takvimiyle yönetilir.
- **Mevcut koddaki fark:** paranın hangi satıcıya ait olduğu Stripe'ta değil, bizim DB'mizde. Ama DB bunu kalıcı bir borç kaydı olarak tutmuyor.

## 12. Sözleşme ve fatura hazırlığı

| Belge | Durum |
|---|---|
| Satıcı sözleşmesi | ✅ (`seller-agreement-de.js`, `seller-agreement-contract.js`; kabul/imza/IP/versiyon alanları `seller_users`'da) |
| Müşteri faturası | ✅ satıcı adına (`order-pdf-buffers.js:116`, `order-pdf-i18n.js:151`: "Vertragspartner … ausschließlich der Verkäufer") |
| Komisyon faturası | ✅ sipariş başına Provisionsfaktura (`orders.js`) ve dönemsel Provisionsrechnung (`payouts.js`, `order-pdf-layout.js`); komisyon KDV oranı `PLATFORM_VAT_PERCENT` ayarından |
| Platform aracı ifadesi | ✅ PDF metinlerinde |
| Satıcı ödeme dökümü | ⚠️ var, ama yukarıdaki hesap hatalarıyla |
| "Merchant of record" alanı veya ayarı | ❌ yok, sadece metin |

## 13. PStTG / DAC7

**Tutulanlar:** `company_name`, `store_name`, `tax_id`, `vat_id`, `business_address` (jsonb), `iban`, `email`, `authorized_person_name`, `documents`, `lucid_number`. Rapor: `routes/dac7.js`.

**Eksikler:**
- Doğum tarihi (gerçek kişi satıcılar için)
- Vergi numarasının ülkesi
- Ticaret sicil numarası (ayrı alan olarak)
- Çeyrek bazında kırılım: ciro, ücretler, işlem sayısı
- İadelerin düşülmesi
- Kesilen vergi/ücret ayrımı
- Resmi BZSt/DIP formatı: mevcut XML kendi formatımız (`urn:oecd:ties:dac:v1` adı uydurma)

**Hata:** önizleme (`/dac7/report`) hâlâ `o.seller_id` ile çalışıyor, yani yanlış. Export (`/dac7/export`) satır bazında, doğru.

---

## 14. Sonuç

### A. Şu an sistemde gerçekten olan
Ödeme platforma, siparişler platform adına (`'default'`), satıcı bilgisi satırlarda. Üç kopuk ödeme yolu: otomatik Custom/IBAN (yeni siparişlerde çalışmıyor), dönemsel Provisionsrechnung tablosu, manuel "ödendi" işareti. Ledger her seferinde yeniden hesaplanan bir görünüm. İptal iadesi Stripe'ta gerçek; retoure iadesi sadece DB'de. Dispute yok. DAC7 export'u kısmen var. Kod konumları yukarıdaki tablolarda.

### B. 🟢 Hedef modelle uyumlu olanlar
- Para platform bakiyesinde bekliyor.
- 14 gün teslimat tarihinden sayılıyor (otomatik yolda).
- Satıcı sipariş satırlarında kayıtlı (`store_order_items.seller_id`).
- Komisyon faturası ve PDF'lerdeki "aracı" ifadesi.
- Satıcı adına müşteri faturası.
- Komisyon KDV'si ayrı.
- Etiket ücretinin satıcıdan mahsubu.
- Müşteri iptalinde Stripe iadesi.
- Kargo ücreti satıcı bazında ayrılıyor (`shipping_by_seller`).

### C. 🟡 Riskli veya eksik olanlar
- Kalıcı satıcı alacak kaydı yok.
- Komisyon oranı sipariş anında kaydedilmiyor.
- Stripe ücreti kaydı yok.
- `payout.failed` işlemi eksik.
- Ödeme ve tarih alanları (`eligible_at` vb.) yok.
- IBAN sahibi doğrulaması yok.
- DAC7 alanları ve çeyreklik kırılım eksik.
- Doküman ve sözleşme metinleri koddan farklı.
- Çok satıcılı iadelerin satıcıya atanması belirsiz.
- Zamanlanmış işler sunucu sürecinin içinde (`setInterval`); yeniden başlatma veya birden fazla sunucu kopyası durumunda takip zayıf.

### D. 🔴 Kritik problemler
1. Otomatik ödeme `o.seller_id = 'default'` yüzünden yeni siparişleri görmüyor. Görseydi de tutar satıcı bazında değil (bütün sepet).
2. Dönem ödeme formülü iadeleri düşmüyor ve 14 günü uygulamıyor. Elle ödeme bu tabloya dayanıyor → iade edilmiş mal için satıcıya ödeme riski.
3. Retoure iadesi Stripe'a gitmiyor. Dashboard'dan yapılan iade de siparişe veya satıcıya yansımıyor (platform modeli siparişleri için webhook hiçbir şey yapmıyor).
4. `PATCH /admin-hub/v1/orders/:id` yetki kontrolü yok: ödeme durumu ve teslimat tarihi değiştirilebiliyor.
5. Chargeback hiç işlenmiyor.
6. İki gerçek ödeme yolu (otomatik Stripe + manuel havale) birbirinden habersiz → **çifte ödeme riski**.
7. Custom hesaplar KYC olmadan ve platformun doldurduğu `tos_acceptance` ile açılıyor (IP `127.0.0.1`).

### E. İlk satıştan önce düzeltilmesi gerekenler (öncelik sırasıyla)
1. Sipariş PATCH yetkisi: sadece superuser veya sipariş sahibi; ödeme durumu ve teslimat tarihi sadece superuser değiştirebilsin.
2. **Tek ödeme yolu** seçilsin; diğeri kapatılsın (çifte ödeme riskini ortadan kaldırır).
3. Ödeme anında satır/satıcı bazında **kalıcı kayıt**: brüt, komisyon oranı ve tutarı, satıcı alacağı, kargo, durum (bekliyor → ödenebilir → ödendi).
4. Ödeme hesabı bu kayıttan yapılsın: teslimat + 14 gün, açık iade yok, iadeler oransal düşülmüş.
5. İade akışı: retoure "erstattet" işaretlenince Stripe iadesi yapılsın (veya Dashboard iadesi webhook ile eşleştirilsin), kayda ters kayıt düşülsün; ödeme sonrası iadede negatif bakiye / mahsup.
6. `charge.dispute.*` webhook'ları: kayıt, satıcı payının bloke edilmesi, sonuçlandırma.
7. Stripe hesap modeli konusunda Stripe'tan net cevap (aşağıda G) ve buna göre Custom hesap / onay / KYC düzeltmesi.
8. DAC7 eksik alanları ve önizleme hatası.

### F. Steuerberater'a sorulacaklar (Almanca)
1. Unser Zahlungsfluss: Kundenzahlungen gehen vollständig auf das Stripe-Konto der Andertal (kein Destination Charge, kein `on_behalf_of`). Die Verkäuferanteile verbleiben bis Lieferung + 14 Tage im Stripe-Guthaben und werden danach per SEPA ausgezahlt. Wie ist der Bruttozufluss bei uns buchhalterisch zu behandeln – als durchlaufender Posten / Verbindlichkeit gegenüber Verkäufern, mit Erlös nur in Höhe der Provision?
2. Unsere Kundenrechnungen weisen den Verkäufer als Vertragspartner und Leistungserbringer aus, Andertal als Vermittler. Reicht das in Verbindung mit dem Zahlungsfluss über unser Konto, damit die Warenumsätze nicht als unsere Umsätze gelten (Kommission vs. Vermittlung, § 3 Abs. 3 UStG)?
3. Welche Buchungslogik und Konten empfehlen Sie für: Verbindlichkeit Verkäufer, Provisionserlös, Stripe-Gebühren, Rückerstattungen, Teilrückerstattungen, Chargebacks und Auszahlungen?
4. Wer trägt die Stripe-Gebühr steuerlich – ist sie bei uns Aufwand oder anteilig dem Verkäufer zu belasten? Ist die Weiterbelastung umsatzsteuerpflichtig?
5. Provision: Bemessungsgrundlage ist der Bruttowarenpreis inkl. USt. Ist das so korrekt, und welche Rechnungsanforderungen gelten für unsere Provisionsrechnungen an EU- bzw. Nicht-EU-Verkäufer (Reverse Charge)?
6. Bei Rückerstattungen nach bereits erfolgter Auszahlung entsteht eine Forderung gegen den Verkäufer. Wie wird diese gebucht, und wie ist die korrigierte Provisionsrechnung (Gutschrift/Storno) zu erstellen?
7. Bonuspunkte und Coupons finanziert Andertal. Wie sind sie bei uns zu behandeln (Entgeltminderung des Verkäufers vs. eigener Aufwand)?
8. § 22f UStG / § 25e UStG Haftung: Welche Nachweise müssen wir vor der ersten Auszahlung zwingend vorliegen haben?
9. PStTG: Welche Daten (Geburtsdatum, TIN-Ausstellungsstaat, Handelsregisternummer, Quartalswerte) müssen wir erheben, und ab wann melden wir über das BZSt-Portal?
10. Benötigen wir für das Halten von Verkäufergeldern bis zu 14 Tage nach Lieferung aus Ihrer Sicht eine aufsichtsrechtliche Prüfung (ZAG), oder ist das eine Frage an einen Rechtsanwalt?

### G. Stripe'a sorulacaklar (İngilizce)
1. We charge customers on our platform account (no `transfer_data`, no `on_behalf_of`), hold the seller share in our balance until delivery + 14 days, then transfer to a per-seller **Custom** connected account and pay out to the seller's IBAN. Is this "separate charges and transfers" setup permitted for our marketplace in Germany, and is our current platform profile approved for it?
2. For Custom accounts that only receive transfers (no card payments): which `service_agreement` (full vs. recipient) and which capabilities apply? What KYC data must we collect, and how must `tos_acceptance` be captured (real seller IP/date vs. platform-filled)?
3. Is there a maximum period we may hold funds in our platform balance before transferring to the connected account? Do you recommend `source_transaction` / `transfer_group` per order?
4. Refunds and disputes after the transfer: should we use transfer reversals or debit the connected account, and how do negative balances on Custom accounts work?
5. Would you recommend destination charges with `application_fee_amount` and a delayed payout schedule instead? What changes regarding refunds, disputes, fees and Merchant of Record?
6. How should Stripe fees be attributed per order for reconciliation (balance transactions per charge / transfer / payout)?
7. Does Stripe provide DAC7 reporting support for Connect platforms in Germany, or do we report ourselves?

### H. Önerilen hedef mimari (mevcut koda göre)

```
Müşteri
↓ Stripe PaymentIntent (platform; transfer_group=order_id; Stripe ücreti balance transaction'dan kaydedilir)
↓ Order Payment (store_orders + payment_succeeded_at; webhook ile doğrulanmış)
↓ Seller Payable: satır/satıcı başına kalıcı kayıt
   brüt, komisyon oranı ve tutarı (snapshot), satıcı alacağı, kargo payı,
   durum = pending; ayrıca seller_ledger_entries (append-only, çift taraflı)
↓ 14 günlük koruma: eligible_at = delivered_at + 14 gün
   (teslimat tarihi sadece taşıyıcı veya superuser tarafından değiştirilebilir)
↓ İade / dispute: ters kayıtlar (oransal komisyon dahil), dispute'ta bloke,
   ödeme sonrası negatif bakiye ve sonraki ödemeden mahsup
↓ Komisyon: ödenebilir olunca gelir olarak kesinleşir,
   Provisionsrechnung bu kayıtlardan üretilir
↓ Seller Settlement: tek bir payout_run → payout_items, idempotent,
   gerçek para hareketinin kimliği (transfer/payout id veya SEPA referansı) kaydedilir
↓ Ödeme yolu (tek seçim):
   (a) Stripe Connect: doğru KYC'li Custom/Express hesap → transfer (source_transaction) → payout
   (b) Banka SEPA: pain.001 dışa aktarım + mutabakat
   payout.paid / payout.failed webhook'ları settlement kaydına bağlanır
```

Denetim tamamlandı; uygulama (implementation) aşamasına geçilmedi.
