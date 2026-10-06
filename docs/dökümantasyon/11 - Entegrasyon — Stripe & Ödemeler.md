**Stripe & Ödemeler**

*Ödeme Alma (Checkout) ve Para Dağıtımı (Payout) Mimarisi*

Andertal Marketplace — Teknik Dokümantasyon · 2026-10-06

## 1. Amaç

Andertal, çok satıcılı bir pazaryeri olarak müşteri ödemesini tek bir Stripe hesabında toplar, sonra bu tutarı satıcılara ve (yeni eklenen) affiliate'lere dağıtır. Bu doküman, ödeme alma (checkout) ve para dağıtma (payout) tarafındaki tüm Stripe entegrasyon noktalarını özetler.

## 2. Ödeme Alma (Checkout)

Müşteri ödemesi Stripe'ın Payment Element / Card Element bileşenleriyle alınır; kart bilgisi hiçbir zaman Andertal sunucularına dokunmaz (Stripe.js doğrudan Stripe'a gönderir). Çok satıcılı bir sepet tek bir Stripe PaymentIntent'te toplanır — her satıcının kendi kargo/komisyon hesaplaması ayrı yapılsa da müşteri tek bir ödeme işlemi görür. Kayıtlı ödeme yöntemleri (saved-payment-methods) desteklenir, böylece tekrarlayan müşteriler kart bilgisini yeniden girmez.

Özel bir yol: eğer bir siparişin tamamı bonus puan + kupon ile karşılanıyorsa (mal bedelinin geri kalanı sıfırsa), sistem Stripe'a hiç gitmeyen ayrı bir `platform_loyalty` ödeme yolunu kullanır — bu durumda kart bilgisi hiç istenmez (bkz. Bonus Puanları dokümanı, Bölüm 2, "Minimum Stripe tutarı" satırı: bonus, mal bedelini 0,50€'nun altına indiremez, tamamen bonus/kupon olan siparişler bu ayrı yolu kullanır).

## 3. Satıcılara Para Dağıtımı — Tek Kanonik Settlement Yolu

Ayrıntılı tasarım: `docs/Odeme-Payout-Implementasyon.md`. Özet:

- Model: **Separate Charges & Transfers**. Müşteri platform hesabına öder; Merchant of Record platformdur. Destination charge ve `on_behalf_of` kullanılmaz.
- Her sipariş kalemi için değişmez bir **seller payable** oluşur (satıcı = kalemin satıcısı, komisyon oranı sipariş anındaki snapshot). Tüm para olayları append-only **satıcı ledger'ına** yazılır.
- Teslimat **carrier (Sendcloud webhook / tracking API) veya superuser** tarafından onaylandıktan 14 gün sonra payable ödenebilir hale gelir. Açık iade, refund, dispute ya da satıcı bloğu varsa beklemede kalır.
- 2. ve 4. Cuma (Europe/Berlin) otomatik settlement çalışır. Satıcı başına tek payout; içinde **sipariş başına bir Stripe transferi** (`source_transaction` + `transfer_group ORDER_<id>`) gider. Fonlar connected account'ta available olunca (recipient için yaklaşık 24 saat) banka payout'u yapılır.
- Satıcının ödeme hesabı **Stripe Connect Custom, recipient service agreement, yalnızca transfers**. Satıcı hesabı SC → Einstellungen → Zahlungen ekranında kendisi açar ve Stripe sözleşmesini kendisi kabul eder (gerçek IP ve tarih kaydedilir). KYC Stripe-hosted onboarding ile tamamlanır.
- **Manuel havale** (Stripe dışı) yalnızca superuser tarafından, gerçek banka referansı ve tutarın birebir onayı ile kaydedilir; ledger ve audit log'a yazılır. Provisionsrechnung satırı elle "bezahlt" yapılamaz.
- Refund'lar gerçek Stripe refund'udur ve yalnızca Stripe `succeeded` dediğinde "erstattet" görünür. Payout'tan sonraki refund/chargeback satıcı bakiyesini negatife düşürebilir; bu tutar sonraki payout'tan mahsup edilir.
- **Affiliate** ödemeleri ayrıdır ve Stripe Connect **Express** ile yürür (bkz. Bölüm 6). Satıcı settlement'ı Express kullanmaz.

## 4. Manuel Superuser Müdahalesi

- `POST /admin-hub/v1/payouts/seller-iban-now` ("Überweisen"): tek satıcı için kanonik settlement'ı hemen çalıştırır.
- `POST /admin-hub/v1/settlement/payouts/:id/retry`: başarısız banka payout'unu kontrollerden geçirdikten sonra tekrar dener.
- `POST /admin-hub/v1/settlement/orders/:id/confirm-delivery`: superuser teslim onayı.
- `/admin-hub/v1/stripe-connect/transfer/:orderId`: **yalnızca settlement cutover'ından önceki legacy siparişler** için çalışır; settlement kapsamındaki siparişlerde 409 döner.

## 5. Vergi (KDV) Ayrımı — Karıştırılmaması Gereken İki Farklı Oran

İki tamamen farklı KDV hesabı vardır ve bunlar birbirine karıştırılmamalıdır:

1. **Mal/ürün KDV'si** — müşterinin ödediği ürün fiyatının içindeki KDV (ürün tipine ve varış ülkesine göre değişir, ör. gıdada indirimli oran). Bu, mevcut `goods-vat.js` motoru tarafından hesaplanır ve Sipariş Faturasında (Verkaufsrechnung) gösterilir — komisyon burada YER ALMAZ.
2. **Komisyon KDV'si** — Andertal'ın satıcıdan kestiği platform komisyonu (%12 varsayılan) üzerinden hesaplanan, tamamen ayrı bir KDV. Bu yalnızca Provisionsrechnung'da (komisyon faturası) görünür ve mal bedeliyle hiçbir ilişkisi yoktur.

Bu ayrım, Bonus Puanları dokümanındaki "aynı Euro'nun üç farklı görünümü" prensibiyle doğrudan bağlantılıdır: bir sipariş faturası mal KDV'sini gösterir, bir komisyon faturası komisyon KDV'sini gösterir — ikisi asla tek bir toplamda birleştirilmez.

## 6. Affiliate Ödeme Sistemi ile İlişki

Affiliate Platform (bkz. ayrı doküman) sisteminin ödeme motoru, tam olarak yukarıdaki "Stripe Connect Express" modelini bire bir mirasla yeniden kullanır (aynı Account Link + manuel takvim + dashboard-link deseni) — kod tekrarı yerine mevcut resolveStripeSecretKeyFromPlatform / loadPlatformCheckoutRow yardımcı fonksiyonları doğrudan içe aktarılarak (import edilerek) kullanılmıştır.
