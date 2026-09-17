1) Andertal SellerCentral içinde `Analysen` altında yeni bir **`Seller Health`** sayfası geliştirmeni istiyorum.

Amaç: Her satıcının genel performansını, müşteri deneyimini, operasyonel kalitesini, ürün/veri kalitesini, hukuki uyumluluğunu ve risk seviyesini **100 üzerinden tek bir Seller Health Score** ile ölçmek.

Bu sistemi basit bir puan kutusu gibi değil, profesyonel bir **seller performance & risk management dashboard** olarak tasarla.

## 1. Temel mantık

Her seller için:

* `Seller Health Score`: 0–100
* `Status`: puana göre otomatik hesaplanan seviye
* Her kriter için:

  * kriter adı
  * ağırlığı / maksimum puanı
  * seller'ın bu kriterden aldığı puan
  * durum göstergesi
  * detay aç/kapa
* Kriter satırına tıklanınca accordion açılmalı.
* Accordion içinde:

  * kriterin açıklaması
  * seller'ın mevcut değeri
  * hedef değer
  * aldığı puan
  * kaybettiği puan
  * puanı düşüren spesifik problemler
  * mümkünse ilgili sipariş/ürün/olay sayıları
  * son 30/60/90 günlük trend
* `Edit all` butonu ile tüm kriterlerin manuel konfigürasyonu/editlenmesi mümkün olmalı.
* Kriterlerin puan ağırlıkları merkezi şekilde değiştirilebilir olmalı.
* Sonuç her değişiklikte otomatik yeniden hesaplanmalı.

UI kesinlikle modern, premium, profesyonel ve Andertal SellerCentral tasarım sistemine uyumlu olmalı.

Schufa benzeri bir **score breakdown / risk overview** hissi olabilir, ancak birebir görsel kopyalama yapma. Kendi Andertal tasarım dilini kullan.

---

# 2. Score seviyeleri

Toplam skor maksimum 100.

Başlangıçta şu status sistemini kullan:

### 90–100

`Mükemmel`

Renk ve görünüm:

* güçlü pozitif durum
* “Top seller / Excellent health” benzeri destekleyici secondary label kullanılabilir.

### 80–89

`Çok iyi`

### 70–79

`İyi`

### 60–69

`Ortalama`

### 40–59

`Kötü`

### 0–39

`Riskli`

Ancak ayrıca puandan bağımsız bir **hard-risk / blocked condition** sistemi oluştur.

Örneğin:

* ciddi hukuki ihlal
* doğrulanmamış işletme
* sahte ürün şüphesi
* ciddi ödeme/fraud riski
* sistematik sipariş dolandırıcılığı
* tekrar tekrar ağır marketplace policy ihlali
* gerekli seller verification'ın tamamlanmamış olması

gibi durumlarda seller'ın status'u:

`Bloke`

olabilir.

Yani:

`Score = 92` olsa bile hard-block condition varsa:

**Status = Bloke**

Bu durumda skor yine 92 olarak gösterilebilir fakat üst tarafta kırmızı `BLOCKED` durumu açıkça gösterilmeli.

---

# 3. Ana skor kategorileri

Toplam 100 puanı anlamlı kategorilere böl.

Başlangıç ağırlık dağılımı:

### A. Product & Content Quality — 20 puan

### B. Legal & Compliance — 15 puan

### C. Order Fulfillment — 20 puan

### D. Shipping Performance — 15 puan

### E. Returns & Refunds — 10 puan

### F. Customer Satisfaction — 10 puan

### G. Seller Reliability & Communication — 5 puan

### H. Risk & Trust — 5 puan

Toplam:

`20 + 15 + 20 + 15 + 10 + 10 + 5 + 5 = 100`

Bu yapı hard-code edilmemeli. Database/config üzerinden değiştirilebilir olmalı.

---

# 4. Product & Content Quality — 20 puan

Bu kategori kendi içinde alt kriterlere ayrılmalı.

## 4.1 Product Content Completeness — 5 puan

Kontrol et:

* title mevcut mu?
* description mevcut mu?
* bullet points mevcut mu?
* product attributes dolu mu?
* brand bilgisi mevcut mu?
* manufacturer bilgisi mevcut mu?
* GTIN/EAN mevcut mu?
* SKU mevcut mu?
* product images mevcut mu?
* yeterli image sayısı var mı?
* image resolution yeterli mi?
* category doğru mu?
* variant bilgileri eksiksiz mi?

Örnek negatif durum:

`37 products missing GTIN`
`12 products have incomplete attributes`

Accordion açıldığında bunlar listelenmeli.

---

## 4.2 Product Content Quality — 4 puan

Kontrol:

* çok kısa açıklamalar
* duplicate descriptions
* duplicate titles
* keyword stuffing
* anlamsız metinler
* HTML hataları
* yazım hataları
* düşük kaliteli görseller
* eksik görseller
* yanlış ürün bilgileri
* aşırı büyük/küçük title
* uygunsuz açıklama formatı

---

## 4.3 Product Data Accuracy — 3 puan

Kontrol:

* yanlış brand
* yanlış category
* yanlış dimensions
* yanlış weight
* yanlış availability
* yanlış price
* stok bilgisi ile gerçek stok arasında fark
* yanlış variant relationships

---

## 4.4 Legal Product Data — 5 puan

Özellikle Almanya/EU marketplace için:

* Hersteller
* Herstelleranschrift
* verantwortliche Person / responsible person
* GPSR bilgileri
* warnings
* age restrictions
* CE bilgileri
* safety documentation
* WEEE
* EPREL
* energy label
* battery information
* VerpackG ile ilgili bilgiler
* diğer kategoriye özel zorunlu bilgiler

Eksik olan her şeyi nedenleriyle göster.

Örnek:

`24 Produkte ohne Herstelleranschrift`
`8 Produkte mit fehlenden GPSR-Angaben`

---

## 4.5 Catalog Quality Signals — 3 puan

Kontrol:

* duplicate products
* duplicate EAN
* malformed SKU
* invalid variants
* broken product relations
* missing category mapping
* invalid attributes

---

# 5. Legal & Compliance — 15 puan

Bu kategori çok önemli.

Alt kriterler:

## 5.1 Seller Verification — 3 puan

* business verification
* identity verification
* bank verification
* tax information
* VAT data
* USt-IdNr.
* address verification
* legal entity information

---

## 5.2 Marketplace Compliance — 3 puan

* seller terms accepted
* marketplace agreement
* required declarations
* seller policies
* prohibited products
* restricted categories
* documentation

---

## 5.3 Product Compliance — 4 puan

* GPSR
* CE
* WEEE
* battery
* energy labels
* safety documents
* category-specific legal data

---

## 5.4 Legal Document Completeness — 2 puan

Seller'ın gerekli hukuk alanları:

* Impressum
* privacy-related data where applicable
* return policy
* shipping policy
* seller terms
* warranty information
* contact information

---

## 5.5 Compliance Violations — 3 puan

Negatif olaylar:

* prohibited product
* fake/counterfeit suspicion
* regulatory warning
* repeated policy breach
* legal complaint
* missing documents
* misleading product information

Bu bölümde sadece son skor değil, olay geçmişi de görünmeli.

---

# 6. Order Fulfillment — 20 puan

Bu kategori seller performansının ana bölümlerinden biri.

## 6.1 Order Processing Time — 6 puan

Ölç:

* average processing time
* median processing time
* 90th percentile processing time
* processing SLA breach rate

Kategori örneği:

`< 12h = excellent`
`12–24h = very good`
`24–48h = good`
`48–72h = average`
`> 72h = poor`

Ancak değerler hard-code edilmemeli.

Seller category / product category bazında farklı SLA tanımlanabilmeli.

---

## 6.2 Order Cancellation Rate — 4 puan

Ölç:

* seller-cancelled orders
* stock-out cancellations
* seller-caused cancellations
* cancellation rate

Customer-requested cancellations seller'ın score'unu düşürmemeli.

---

## 6.3 Order Defect Rate — 4 puan

* wrong product
* missing items
* damaged product
* incomplete order
* incorrect quantity
* incorrect variant
* unusable item
* seller caused issue

---

## 6.4 Order Confirmation Accuracy — 2 puan

* stock accuracy
* inventory sync quality
* accepted order vs available inventory
* order confirmation delay

---

## 6.5 SLA Compliance — 4 puan

Seller'ın tanımlı marketplace SLA'larına uyumu.

Örneğin:

* processing SLA
* dispatch SLA
* stock accuracy
* response SLA

---

# 7. Shipping Performance — 15 puan

## 7.1 Dispatch Time — 4 puan

Sipariş → kargoya teslim süresi.

---

## 7.2 Delivery Time — 4 puan

Kargoya teslim → müşteriye ulaşma süresi.

---

## 7.3 On-Time Delivery Rate — 3 puan

Ölç:

`on_time_deliveries / delivered_orders`

---

## 7.4 Tracking Quality — 2 puan

* tracking number exists
* valid carrier
* tracking updates available
* fake/invalid tracking
* tracking uploaded too late

---

## 7.5 Shipping Incident Rate — 2 puan

* lost shipment
* damaged shipment
* delayed shipment
* undeliverable shipment

---

# 8. Returns & Refunds — 10 puan

## 8.1 Return Rate — 3 puan

Ancak return reason'lara göre ayrıştır.

Seller'ın kontrol edemediği:

* customer remorse
* wrong size
* changed mind

ile seller kaynaklı:

* wrong item
* defective item
* misleading description
* damaged product
* missing parts

aynı şekilde değerlendirilmemeli.

---

## 8.2 Return Processing Time — 3 puan

Ölç:

`return received → refund completed`

---

## 8.3 Refund SLA Compliance — 2 puan

Yasal / marketplace refund sürelerine uyum.

---

## 8.4 Refund Error Rate — 2 puan

* wrong refund amount
* duplicate refund
* missing refund
* delayed refund

---

# 9. Customer Satisfaction — 10 puan

## 9.1 Product Rating — 4 puan

Average rating.

Ancak sadece average kullanma.

Örnek:

* 4.8+
* 4.5–4.79
* 4.2–4.49
* 4.0–4.19
* <4.0

Ayrıca review count'u da hesaba kat.

10 review ile 4.9 ile 10.000 review ile 4.9 aynı confidence değerine sahip olmamalı.

---

## 9.2 Negative Review Rate — 2 puan

Özellikle 1–2 yıldız oranı.

---

## 9.3 Customer Complaint Rate — 2 puan

* formal complaints
* customer support escalations
* repeated complaint topics

---

## 9.4 Customer Satisfaction Trend — 2 puan

Son:

* 30 gün
* 90 gün
* 12 ay

trend karşılaştırması.

Trend kötüleşiyorsa score üzerinde etkisi olmalı.

---

# 10. Seller Reliability & Communication — 5 puan

## 10.1 Seller Response Time — 2 puan

Seller'ın mesajlara / support requests'e cevap süresi.

---

## 10.2 Response Rate — 1 puan

---

## 10.3 Issue Resolution Time — 1 puan

---

## 10.4 Seller Activity / Availability — 1 puan

Örneğin:

* prolonged inactivity
* frequent stock mismatches
* integration offline
* ERP sync failures

---

# 11. Risk & Trust — 5 puan

## 11.1 Fraud Signals — 2 puan

* suspicious order patterns
* unusual refund patterns
* payment-related issues
* suspicious seller activity

---

## 11.2 Chargeback Rate — 1 puan

---

## 11.3 Policy Violation History — 1 puan

---

## 11.4 Trust Signals — 1 puan

Pozitif:

* long marketplace history
* high completed order count
* verified company
* stable performance
* low complaint rate
* verified inventory

---

# 12. Score hesaplama sistemi

Scoring engine modüler olmalı.

Her kriter:

```ts
{
  id,
  categoryId,
  name,
  description,
  maxPoints,
  currentValue,
  targetValue,
  score,
  status,
  severity,
  calculationType,
  config
}
```

Örneğin:

```ts
{
  id: "return_rate",
  maxPoints: 3,
  calculationType: "THRESHOLD",
  config: {
    excellent: 0.03,
    good: 0.05,
    average: 0.08,
    poor: 0.12
  }
}
```

Ancak bu sadece örnek. Kategorilere göre doğru eşikler tanımlanabilir.

---

# 13. Score'un sadece ortalama olmaması

Naif bir average kullanma.

Özellikle çok kötü davranışları cezalandıran bir sistem oluştur.

Örneğin:

Seller:

* Product quality: 18/20
* Compliance: 15/15
* Orders: 19/20
* Shipping: 14/15
* Returns: 9/10
* Reviews: 8/10
* Communication: 5/5
* Risk: 5/5

Toplam:

`93/100`

Ama seller'ın hard compliance violation'ı varsa:

`Score: 93`
`Status: BLOCKED`

Bu ayrımı UI'da açıkça göster.

---

# 14. UI ana görünümü

Sayfanın üst kısmında büyük bir score card:

```text
SELLER HEALTH

93 / 100

MÜKEMMEL

↑ 4 puan son 30 gün

Low Risk
```

Altında:

* score trend chart
* last 30 days
* last 90 days
* previous period comparison

---

# 15. Category cards

Ana bölüm:

```text
Product & Content Quality        18 / 20
██████████████████░░

Legal & Compliance               15 / 15
███████████████████

Order Fulfillment                19 / 20
███████████████████░

Shipping Performance             14 / 15
██████████████████░

Returns & Refunds                 9 / 10
██████████████████

Customer Satisfaction             8 / 10
████████████████

Seller Reliability                5 / 5

Risk & Trust                      5 / 5
```

Her satır clickable accordion olmalı.

---

# 16. Accordion

Örneğin:

### Order Fulfillment — 19 / 20

Açıldığında:

```text
Order Processing Time               5.6 / 6
22.4h average
Target < 24h

Cancellation Rate                  3.8 / 4
0.9%

Order Defect Rate                  4 / 4
0.7%

Order Confirmation Accuracy        2 / 2
99.8%

SLA Compliance                     4 / 4
98.9%
```

Bir kriterin üzerine tıklanınca daha derine inilebilmeli.

Örneğin:

### Product Content Completeness — 4.2 / 5

```text
1,284 active products

1,247 complete
37 incomplete
```

Aşağıda:

```text
37 products with missing GTIN

12 products without manufacturer address
8 products with missing product images
17 products with incomplete attributes
```

Her hata mümkün olduğunca:

**View products →**

butonuyla ilgili ürün listesine götürmeli.

---

# 17. “Problems” bölümü

Sayfanın üst tarafında ayrıca:

### Issues affecting your score

Örneğin:

```text
⚠ 37 products missing mandatory legal data        -1.4 pts
⚠ Average processing time increased to 31h        -0.8 pts
⚠ Return processing SLA breached 14 times         -0.5 pts
⚠ Rating dropped from 4.7 to 4.4                  -0.7 pts
```

En önemli problemler yukarıda görünmeli.

---

# 18. Edit all

Sağ üst:

`Edit all`

butonu.

Buna basıldığında admin/configuration mode açılmalı.

Buradan:

* criterion enabled/disabled
* maximum points
* weight
* thresholds
* target values
* severity
* hard-block condition
* calculation type

değiştirilebilmeli.

Örneğin:

```text
Order Processing Time

Maximum points: 6
Excellent: < 12h
Good: < 24h
Average: < 48h
Poor: > 72h
```

Edit sonrası:

`Save changes`

ve:

`Reset to defaults`

olmalı.

---

# 19. Edit yetkisi

Normal seller kullanıcısı score konfigürasyonunu değiştiremez.

Sadece:

* super admin
* marketplace admin
* authorized analyst

düzenleyebilir.

Seller kendi score'unu yalnızca **görüntüleyebilmeli**.

---

# 20. History / Audit Log

Score değişikliklerinin geçmişi tutulmalı.

Örneğin:

```text
Seller Health Score History

Sep 17     93
Sep 10     91
Sep 03     89
Aug 27     94
Aug 20     95
```

Ayrıca manuel configuration değişiklikleri loglanmalı:

```text
Admin changed:
Return Rate max points
10 → 8

Changed by:
Murathan

Date:
17.09.2026
```

---

# 21. Trend sistemi

Score yalnızca mevcut snapshot olmamalı.

Her seller için günlük snapshot kaydet:

```text
seller_health_daily
```

Böylece:

* 7 day trend
* 30 day trend
* 90 day trend
* all-time trend

gösterilebilir.

---

# 22. Fairness / normalization

Bazı seller'lar:

* 20 sipariş
* 10.000 sipariş

aynı değerlendirilmemeli.

Özellikle:

* reviews
* cancellations
* returns
* defect rate
* chargebacks

gibi oran bazlı kriterlerde minimum sample size kullan.

Örneğin:

`< 20 orders`
→ düşük confidence

`20–100`
→ medium confidence

`100+`
→ high confidence

UI'da:

`Low confidence · 14 orders`

gibi gösterilebilir.

Yeni seller'ları haksız yere cezalandırma.

---

# 23. Yeni seller sistemi

Yeni seller için:

```text
Not enough data
```

durumu olmalı.

Skoru zorla 0 verme.

Örneğin:

```text
Seller Health
— / 100

New seller
Collecting data
```

Sonra yeterli data oluşunca gerçek score hesaplanmaya başlamalı.

---

# 24. Seller comparison

İleride hazırlanabilmesi için altyapıyı hazır bırak.

Örneğin:

* seller percentile
* category percentile
* marketplace average
* category average

hesaplanabilmeli.

Ancak ilk versiyonda zorunlu değil.

---

# 25. Data kaynakları

Seller Health mümkün olduğunca mevcut Andertal verilerinden hesaplanmalı.

Kullanılabilecek kaynaklar:

* orders
* order items
* products
* product attributes
* product compliance data
* inventory
* shipments
* tracking events
* returns
* refunds
* reviews
* customer messages
* support tickets
* disputes
* chargebacks
* seller verification
* seller documents
* ERP sync status
* marketplace policy violations

Mock data kullanıp bırakma.

Mevcut database modellerini analiz et ve mümkün olduğunca gerçek veriye bağla.

Eksik data modeli varsa bunu açıkça belirle ve gerekli migration/model/API'leri oluştur.

---

# 26. Backend mimarisi

Score hesaplamasını frontend'e gömme.

Merkezi bir backend service oluştur.

Örneğin:

```text
SellerHealthService
```

Metotlar:

```ts
calculateSellerHealth(sellerId)
calculateCategoryScore(...)
calculateCriterionScore(...)
getSellerHealthHistory(...)
getSellerHealthIssues(...)
evaluateHardBlockConditions(...)
```

API örneği:

```http
GET /api/sellers/:sellerId/health
GET /api/sellers/:sellerId/health/history
GET /api/sellers/:sellerId/health/issues
PATCH /api/admin/seller-health/config
```

---

# 27. Caching / performance

Seller Health sayfası her açıldığında yüz binlerce order'ı tekrar tarama.

Bunun yerine:

* aggregate queries
* materialized / cached metrics
* scheduled calculations
* incremental updates

kullan.

Örneğin günlük full recalculation + önemli eventlerde incremental update.

---

# 28. Event-driven güncelleme

Aşağıdaki eventlerde seller score güncellenebilmeli:

* order created
* order confirmed
* order cancelled
* order shipped
* order delivered
* return created
* refund issued
* review created
* dispute created
* compliance issue created
* product updated
* tracking updated

Ancak her eventte tüm score'u ağır şekilde yeniden hesaplama.

İhtiyaç varsa ilgili metric'i incrementally güncelle.

---

# 29. Status renkleri

UI'da anlamlı status kullan:

* Excellent
* Very Good
* Good
* Average
* Poor
* Risky
* Blocked

Ancak sadece renge güvenme.

Her zaman:

* ikon
* label
* score

birlikte göster.

Accessibility'yi koru.

---

# 30. Seller Health detay ekranı

Ana seller health sayfasına ek olarak gelecekte:

```text
Overview
Performance
Products
Compliance
Orders
Shipping
Returns
Reviews
Risk
History
```

tab yapısına dönüştürülebilecek şekilde component yapısını tasarla.

İlk implementasyonda sadece `Overview` gerekli.

---

# 31. Önemli ürün kararı

Seller Health sadece seller'ı cezalandıran bir sistem gibi görünmemeli.

Her negatif kriter için:

```text
Problem
Current value
Target
Points lost
How to improve
```

göster.

Örneğin:

```text
Return processing time

Current: 4.8 days
Target: < 2 days

Points: 1.2 / 3

Points lost: -1.8

Why:
14 refunds exceeded the 3-day SLA

How to improve:
Process returned items within 48 hours.
```

Bu Andertal'ın seller retention'ını ciddi şekilde iyileştirir.

---

# 32. “Why is my score not higher?” sistemi

Seller bir tooltip/modal açıp görebilmeli:

```text
Why is my score 78?

You currently lose 22 points because:

Product content             -5
Order processing            -4
Shipping                    -3
Returns                     -2
Customer reviews            -4
Compliance                  -2
Risk                         0
```

Her satır clickable olmalı.

---

# 33. Puanların şeffaflığı

Seller'a görünür modda mümkün olduğunca transparent ol.

Örneğin:

```text
Order processing score: 4.8 / 6

Based on:
1,284 fulfilled orders
Average processing time: 18.4h
SLA compliance: 96.7%
```

Böylece seller neden o puanı aldığını anlayabilir.

Admin tarafında daha fazla detay gösterilebilir.

---

# 34. Fraud / manipulation protection

Seller score'unu manipüle etmek mümkün olmamalı.

Özellikle:

* fake reviews
* repeated cancellations
* artificial order patterns
* duplicated products
* manipulated tracking
* suspicious refunds

için ayrı risk sinyalleri tutulmalı.

---

# 35. İlk versiyon

İlk versiyonda tüm gelecek fonksiyonları implement etmeye çalışma.

Öncelikli olarak çalışan bir MVP oluştur:

1. Seller Health page
2. Total score
3. Status
4. 8 ana kategori
5. Her kategori altında kriterler
6. Accordion details
7. Problems affecting score
8. Edit all
9. Configurable weights
10. Score history
11. Real database data
12. Loading/empty/error states
13. Responsive UI

Sonrasında daha detaylı fraud/compliance engine genişletilebilir.

---

# 36. Tasarım talimatı

Tasarım:

* Andertal SellerCentral ile aynı design system
* premium
* clean
* enterprise
* fazla renk kullanma
* gereksiz gradient kullanma
* dashboard kalabalık olmasın
* whitespace iyi kullan
* score görsel olarak güçlü olsun
* tablo ve accordion okunabilir olsun
* mobile responsive olsun
* dark mode varsa mevcut sisteme uyumlu olsun

Andertal marka renkleri:

* Primary teal: `#1b8880`
* Accent orange: `#ff971c`
* Charcoal: `#1A1A1A`

Accent renklerini aşırı kullanma.

Risk / warning / success renkleri semantic design token'lar üzerinden gelsin.

---

# 37. Teknik yaklaşım

Kod yazmadan önce mevcut repository'yi analiz et.

Özellikle:

* seller modelleri
* order modelleri
* shipment modelleri
* return modelleri
* review modelleri
* compliance modelleri
* product modelleri
* admin layout
* existing analytics pages
* existing charts
* existing table components
* API patterns
* authentication / authorization
* design system

incelenmeli.

Mevcut component'leri mümkün olduğunca yeniden kullan.

Yeni bir paralel design system oluşturma.

---

# 38. Sonuç

Bu sistemin amacı yalnızca:

`93/100`

göstermek değil.

Amaç:

**“Andertal bu seller'a neden 93 verdi, puanını hangi olaylar düşürdü ve seller ne yaparsa 97'ye çıkabilir?”**

sorusunu tek ekranda cevaplamak.

Bu nedenle implementation'ı:

**Score + Breakdown + Problems + Evidence + Trends + Configuration**

mantığıyla oluştur.

Önce mevcut kod tabanını analiz et.

Ardından:

1. hangi modeller/API'ler mevcut
2. hangileri eksik
3. hangi veriler doğrudan kullanılabilir
4. hangi migration'lar gerekli
5. hangi component'ler yeniden kullanılabilir

bunları tespit et.

Sonra Seller Health'i uçtan uca implement et.

Her aşamada gereksiz mock data bırakma; mevcut gerçek veriyi kullan. Eksik veri için migration/model gerekiyorsa oluştur.

Son olarak test et:

* 100 score
* 0 score
* blocked seller
* new seller / insufficient data
* missing compliance
* high returns
* poor reviews
* slow processing
* multiple simultaneous issues
* no orders
* seller with huge order volume

senaryolarını doğrula.
