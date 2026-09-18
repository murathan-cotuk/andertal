# ANDERTAL — LANDING PAGE CONTAINER TEMPLATE SYSTEM 2.0 + HOMEPAGE

## 0. GÖREVİN ÖZÜ

Andertal SellerCentral içindeki mevcut **Landing Page / Container Template sistemini baştan sona analiz et, profesyonelleştir ve ardından bu sistem üzerinde Andertal'ın gerçek homepage'ini oluştur.**

### ÇOK ÖNEMLİ SCOPE

Bu görev **sadece homepage geliştirme görevi değildir.**

SellerCentral'da oluşturulan:

* Homepage
* Category Landing Pages
* Campaign Pages
* Brand Pages
* Deals Pages
* SEO Landing Pages
* Seasonal Pages
* gelecekte oluşturulacak diğer Landing Page'ler

aynı **Container Template altyapısını** kullanmaktadır.

Dolayısıyla asıl hedef:

> **Global, reusable, data-driven ve profesyonel bir Landing Page Container Template System oluşturmak.**

Homepage ise bu sistemin kullanılarak oluşturulacağı **ilk ve ana örnek sayfa** olacaktır.

İstenen mimari:

```text
SellerCentral
    ↓
Landing Pages
    ↓
Any Landing Page
    ↓
Container Instances
    ↓
Container Templates
    ↓
Reusable Renderers
```

Homepage bu sistemin dışında özel olarak hardcode edilmiş bir React sayfası OLMAMALIDIR.

Homepage tamamen Landing Page + Container Instance sistemi üzerinden oluşturulmalıdır.

---

# 1. İLK AŞAMA — MEVCUT SİSTEMİ AUDIT ET

Önce hiçbir kodu değiştirme.

Mevcut sistemi detaylı şekilde incele.

Özellikle:

### SellerCentral

Araştır:

* Landing Page yönetimi
* `landing-page` ekranı
* mevcut container yönetimi
* mevcut Container Template yapısı
* template seçimi
* template configuration
* ordering / sorting
* duplicate
* delete
* enable/disable
* preview
* draft/publish
* page selection
* superuser permissions
* API çağrıları
* ilgili types/interfaces
* validation
* mevcut i18n sistemi

### Backend / Database

Varsa incele:

* landing page modelleri
* container modelleri
* template modelleri
* page → container ilişkisi
* container → template ilişkisi
* content/configuration storage
* ordering
* publishing
* migration yapısı

### Shop / Frontend

Landing page'lerin gerçek kullanıcı tarafında nasıl render edildiğini incele.

Özellikle:

* container renderer
* template renderer
* product fetching
* category fetching
* brand fetching
* collections
* image handling
* responsive rendering
* SEO
* caching
* server/client component ayrımı

### Audit sonunda bana şunları raporla:

1. Mevcut architecture
2. Mevcut data model
3. Mevcut template sistemi
4. Mevcut Landing Page flow
5. Mevcut renderer yapısı
6. Mevcut problemler
7. Nelerin yeniden kullanılabileceği
8. Nelerin refactor edilmesi gerektiği
9. Gerekli migration olup olmadığı
10. Backward compatibility riskleri
11. Önerdiğin yeni architecture
12. Dosya bazında yapılacak değişiklikler

**Bu audit aşamasında kod değiştirme.**

---

# 2. ANA MİMARİ HEDEF

Yeni sistem şu mantıkta çalışmalı:

```text
Landing Page
    │
    ├── Container Instance #1
    │       └── Template: Hero
    │
    ├── Container Instance #2
    │       └── Template: Category Showcase
    │
    ├── Container Instance #3
    │       └── Template: Product Carousel
    │
    ├── Container Instance #4
    │       └── Template: Editorial
    │
    └── Container Instance #5
            └── Template: Deals
```

Bir **Container Template**, tekrar tekrar kullanılabilen bir layout + configuration tanımıdır.

Bir **Container Instance**, belirli bir Landing Page üzerinde kullanılan template'in gerçek instance'ıdır.

Örneğin:

```text
Template:
Product Carousel

Instance:
Homepage → "Trending Products"

Configuration:
source = best_sellers
category = null
limit = 6
title = "Trending now"
```

Başka bir sayfada aynı template:

```text
Category Page → "Phone Accessories"

source = category
category = phone-accessories
limit = 8
title = "Popular accessories"
```

şeklinde kullanılabilmelidir.

---

# 3. CONTAINER TEMPLATE LIBRARY

SellerCentral'da superuser'ın kullanabileceği profesyonel bir:

**Container Template Library**

oluştur.

Template'ler mümkün olduğunca reusable ve configurable olmalı.

Örnek template ailesi:

### Hero Templates

* Hero — Full Width
* Hero — Image + Content
* Hero — Featured Product
* Hero — Editorial
* Hero — Split Layout

### Product Templates

* Product Carousel
* Product Grid
* Featured Product + Products
* Best Sellers
* New Arrivals
* Recommended Products
* Deals / Discount Products

### Category Templates

* Category Showcase
* Category Grid
* Featured Categories
* Compact Category Strip

### Brand Templates

* Brand Showcase
* Brand Logo Strip
* Featured Brands

### Editorial / Promotional Templates

* Editorial Split
* Promo Banner
* Featured Collection
* Campaign Banner

### Trust / Information

* Trust Bar
* Marketplace Benefits
* Service / Benefit Cards

Bunlar örnektir.

Mevcut architecture'a uygunsa bunları oluştur.

Gereksiz şekilde onlarca template üretme.

Önemli olan:

> Az ama gerçekten kaliteli, reusable ve composable template'ler.

---

# 4. TEMPLATE CONFIGURATION

Template'ler hardcoded içerik kullanmamalı.

Örneğin Product Carousel:

```text
title
subtitle
source
category
collection
products
limit
sort
show_price
show_rating
show_discount
show_seller
show_badge
link
```

gibi configuration seçeneklerine sahip olabilir.

Hero:

```text
eyebrow
title
description
image
mobile_image
primary_cta
secondary_cta
alignment
layout
background
```

Category Showcase:

```text
title
categories
source
limit
image
display_style
```

gibi çalışabilir.

Configuration yapısını mevcut projeye en uygun şekilde tasarla.

Her template'in kendine ait güçlü bir configuration schema'sı olmalı.

Validation uygulanmalı.

---

# 5. DYNAMIC DATA

Template'ler gerçek Andertal datasıyla çalışmalı.

Örneğin ürün kaynakları:

```text
manual selection
best sellers
new arrivals
category
collection
discounted products
recommended
```

Kategori kaynakları:

```text
manual
parent category
featured categories
```

Brand:

```text
manual
featured brands
```

gibi olabilir.

Ürünleri template içine hardcode etme.

Kategori isimlerini hardcode etme.

Brand isimlerini hardcode etme.

Homepage'e özel fake data oluşturma.

Mevcut catalog/data/API altyapısını kullan.

---

# 6. SELLERCENTRAL EDITOR UX

Mevcut Landing Page editor'ünü modern bir page builder mantığına getir.

Superuser:

1. Landing Page seçebilmeli
2. Container Template Library açabilmeli
3. Template'i preview edebilmeli
4. Sayfaya ekleyebilmeli
5. Configuration yapabilmeli
6. Sırasını değiştirebilmeli
7. Duplicate edebilmeli
8. Disable/enable edebilmeli
9. Delete edebilmeli
10. Preview yapabilmeli
11. Draft olarak kaydedebilmeli
12. Publish edebilmeli

Mümkünse drag & drop ordering kullan.

Ama mevcut teknolojiye gereksiz dependency ekleme.

Mevcut yapı daha uygunsa mevcut altyapıyı geliştir.

---

# 7. TEMPLATE PREVIEW

Template Library içinde her template'in görsel preview'u olmalı.

Superuser template'i seçtiğinde:

```text
[Template Preview]

Template Name
Description

[Add to Page]
```

gibi anlaşılır bir UI görmeli.

Preview mümkün olduğunca gerçek sistemde kullanılan component ile render edilmeli.

Ayrı bir sahte preview sistemi yapıp gerçek render ile farklılaşmasına izin verme.

---

# 8. GLOBAL VISUAL SYSTEM

En önemli konulardan biri bu.

Şu an container'lar arka arkaya geldiğinde:

```text
BOX
BOX
BOX
BOX
BOX
```

gibi görünüyorsa bunu düzelt.

Andertal marketplace:

* modern
* premium
* dense
* trustworthy
* European
* professional
* commercial

görünmeli.

Amazon'daki marketplace information density ve discovery mantığını al.

Ama Amazon'u kopyalama.

Andertal'ın kendi visual identity'sini oluştur.

---

# 9. LAYOUT RHYTHM

Tüm template'ler ortak bir layout sistemi kullanmalı.

Örneğin:

```text
Page
 └── Content Max Width
       └── Container
             └── Content
```

Ortak:

* max-width
* horizontal padding
* vertical spacing
* typography
* heading hierarchy
* responsive breakpoints

kullan.

Her template kendi kafasına göre farklı width kullanmasın.

Yaklaşık:

```text
Desktop max-width: ~1440px
Large section spacing: 72–96px
Normal section spacing: 48–72px
Mobile section spacing: 24–32px
```

gibi bir visual rhythm oluştur.

Mevcut design system varsa önce onu incele ve mümkün olduğunca onun üzerinden ilerle.

---

# 10. ANDERTAL COLORS

Mevcut brand identity:

```text
Primary: #1B8880
Accent:  #FF971C
Dark:    #1A1A1A
```

Bu renkleri bilinçli kullan.

Her container'ı renkli kutuya dönüştürme.

Özellikle:

* beyaz / neutral backgrounds
* dark text
* subtle borders
* controlled accent usage
* product imagery

ön planda olsun.

---

# 11. CARD SYSTEM

Product card, category card, brand card vb. component'leri standardize et.

Özellikle Product Card:

```text
Image
Brand / badge
Title
Rating
Price
Old price
Discount
Availability
Seller (gerekiyorsa)
```

gibi alanları destekleyebilir.

Ama her şeyi her zaman göstermek zorunda değil.

Configuration'a göre göster.

### Çok önemli:

Uzun ürün isimleri layout'u bozmamalı.

Örneğin:

```text
Apple iPhone 17 Pro Max Original Silicone
Protective Case with MagSafe...
```

gibi uzun title'lar diğer card'ları aşağı itmemeli.

Card yüksekliği ve text line clamp kontrol edilmeli.

Tüm gridlerde:

* aynı image ratio
* aynı card height logic
* aynı spacing
* aynı typography

kullan.

---

# 12. RESPONSIVE

Her template:

* desktop
* tablet
* mobile

için tasarlanmalı.

Mobile'da:

* horizontal overflow olmamalı
* carousel düzgün çalışmalı
* text taşmamalı
* CTA'lar erişilebilir olmalı
* image aspect ratio bozulmamalı

Mobile için desktop tasarımını küçültmek yerine gerektiğinde layout değiştir.

---

# 13. ACCESSIBILITY

Yeni component'lerde:

* semantic HTML
* keyboard navigation
* visible focus states
* alt text
* aria labels
* proper heading hierarchy
* reduced motion

gibi temel accessibility standartlarına uy.

---

# 14. PERFORMANCE

Next.js architecture'a uygun şekilde:

* Server Components mümkün olduğunca kullanılmalı
* Client Components sadece gerektiğinde
* `next/image`
* lazy loading
* minimal client-side JS
* carousel için kontrollü client-side code
* gereksiz rerender yok
* mevcut caching stratejisini bozma

uygula.

---

# 15. SEO

Landing Page sistemi SEO'yu bozmamalı.

Özellikle:

* semantic headings
* crawlable content
* image alt text
* internal links
* metadata
* canonical logic
* server-rendered content

korunmalı.

Mevcut SEO architecture'ını önce incele.

---

# 16. LEGACY / BACKWARD COMPATIBILITY

Bu çok önemli.

Mevcut Landing Page'ler ve mevcut Container verileri bozulmamalı.

Şunları yapma:

* destructive migration
* database reset
* mevcut landing page'leri silme
* mevcut container datalarını silme
* mevcut page IDs değiştirme
* eski content'i kaybetme

Gerekirse migration yap ama:

```text
old data
   ↓
compatible migration
   ↓
new system
```

mantığında çalış.

Legacy container'lar yeni sistem tarafından render edilemiyorsa önce compatibility layer oluştur.

---

# 17. HOMEPAGE — İKİNCİ AŞAMA

Container Template System tamamlandıktan sonra **Andertal homepage'ini bu sistem kullanılarak oluştur.**

Tekrar:

> Homepage özel hardcoded React layout olmamalıdır.

Homepage:

```text
Landing Page = Homepage

Container Instance #1
→ Hero

Container Instance #2
→ Popular Categories

Container Instance #3
→ Featured Products

Container Instance #4
→ Editorial / Campaign

Container Instance #5
→ Deals

Container Instance #6
→ Brand Showcase

Container Instance #7
→ New Arrivals

Container Instance #8
→ Category Discovery

Container Instance #9
→ Trust / Marketplace Benefits
```

gibi bir composition olabilir.

Ancak bunun son halini mevcut gerçek catalog/data ve Andertal'ın tasarımına göre sen belirle.

Amaç:

> Kullanıcı Andertal.com'a girdiğinde bunun gerçek bir Avrupa marketplace'i olduğunu ilk bakışta hissetmeli.

---

# 18. HOMEPAGE DESIGN PRINCIPLES

Homepage:

* güçlü hero
* hızlı category discovery
* yüksek product density
* deals
* brands
* discovery
* editorial content
* trust

sunmalı.

Ama:

```text
Hero
↓
Card Box
↓
Card Box
↓
Card Box
↓
Card Box
```

gibi monoton bir yapı oluşturma.

Visual rhythm oluştur.

Bazı section'lar full-width olabilir.

Bazıları max-width olabilir.

Bazıları borderless olabilir.

Bazıları editorial olabilir.

Bazıları product-heavy olabilir.

Sayfanın tamamında aynı card pattern'ini tekrar etme.

---

# 19. HOMEPAGE CONTENT

Gerçek sistemde bulunan:

* products
* categories
* brands
* collections
* prices
* discounts
* images

kullanılabiliyorsa bunları kullan.

Fake:

```text
Product A
Product B
Brand X
Brand Y
```

oluşturma.

Admin configuration ile hangi ürün/kategori/brand gösterilecekse oradan gelsin.

Homepage'i daha sonra SellerCentral'dan değiştirebilmeliyim.

Örneğin:

```text
Hero'yu kaldır
Deals'i yukarı taşı
Brand Showcase'i kaldır
New Arrivals ekle
```

gibi değişiklikler kod değiştirmeden yapılabilmeli.

---

# 20. I18N

Yeni user-facing text'leri hardcode etme.

Mevcut i18n architecture'ını kullan.

Andertal'ın desteklediği diller için:

* German
* English
* Turkish

uyumlu olacak şekilde geliştir.

Template configuration'daki kullanıcı tarafından girilen içerikler mevcut localization architecture'a uygunsa localized content desteklemeli.

---

# 21. ADMIN EXPERIENCE

Superuser'ın sistemle çalışması kolay olmalı.

Kötü:

```text
JSON editor
```

ile her şeyi elle yazmak zorunda kalmak.

İyi:

```text
Title
[________________]

Source
[ Best Sellers ▼ ]

Limit
[ 6 ]

Products
[ Select products ]

Display
[ Show rating ✓ ]
[ Show discount ✓ ]
```

gibi kontrollü form UI.

JSON/raw configuration sadece gerektiğinde advanced option olabilir.

---

# 22. TEMPLATE REGISTRY

Mümkün olduğunca temiz bir template architecture oluştur.

Örneğin mantıksal olarak:

```text
Template
 ├── metadata
 ├── configuration schema
 ├── editor configuration
 └── renderer
```

şeklinde düşünülebilir.

Template renderer ile editor configuration birbirinden gereksiz şekilde kopuk olmasın.

Yeni bir template eklemek mümkün olduğunca:

```text
register template
→ define schema
→ define editor
→ define renderer
```

mantığında yapılabilsin.

Ancak bunu mevcut architecture'a bakmadan zorla uygulama.

Önce mevcut yapıya uyumlu en doğru çözümü belirle.

---

# 23. CODE QUALITY

Kod:

* typed
* reusable
* modular
* maintainable
* clean

olmalı.

Aynı UI logic'ini 5 farklı template'te kopyalama.

Ortak component'leri extract et.

Örneğin:

```text
ProductCard
ProductGrid
ProductCarousel
SectionHeader
ContainerShell
ResponsiveImage
CTA
PriceDisplay
Badge
```

gibi reusable primitives oluşturulabilir.

Ama gereksiz abstraction da yapma.

---

# 24. DO NOT BREAK EXISTING SYSTEMS

Bu task sırasında aşağıdakilere dokunma:

* authentication
* seller management
* checkout
* payments
* Stripe
* inventory
* ERP integrations
* order processing
* seller permissions
* compliance
* unrelated backend systems

Bunlara yalnızca Landing Page sisteminin çalışması için gerçekten zorunluysa dokun.

---

# 25. GIT / SAFETY

Kesinlikle:

```text
git reset --hard
git clean -fd
database reset
mass delete
```

gibi destructive işlemler yapma.

Mevcut kullanıcı değişikliklerini ezme.

Mevcut branch/state'i koru.

Önce mevcut kodu anla.

---

# 26. UYGULAMA SIRASI

Şu sırayı takip et:

### PHASE 1 — AUDIT

Kod değişikliği yapmadan:

* architecture
* models
* APIs
* components
* renderers
* existing templates
* landing page editor
* shop rendering

analiz et.

Audit raporunu hazırla.

---

### PHASE 2 — ARCHITECTURE PLAN

Audit sonucuna göre:

* hangi dosyalar değişecek
* hangi componentler oluşturulacak
* hangi componentler refactor edilecek
* data model değişecek mi
* migration gerekli mi
* legacy compatibility nasıl sağlanacak

belirle.

---

### PHASE 3 — TEMPLATE SYSTEM

Global Container Template sistemini geliştir.

Önce reusable infrastructure.

Sonra template'ler.

---

### PHASE 4 — SELLERCENTRAL EDITOR

Template Library + configuration UI + ordering + duplicate + delete + preview + publish/draft akışını geliştir.

---

### PHASE 5 — SHOP RENDERING

Template renderer'ları gerçek storefront üzerinde düzgün şekilde çalıştır.

---

### PHASE 6 — HOMEPAGE

Yeni sistem üzerinde gerçek Andertal homepage'ini oluştur.

Homepage tamamen:

```text
Landing Page
+
Container Instances
+
Container Templates
```

ile kurulmalı.

---

### PHASE 7 — QA

Kontrol et:

* desktop
* tablet
* mobile
* empty states
* missing images
* missing products
* long titles
* no products
* unpublished pages
* legacy pages
* SEO
* accessibility
* performance
* i18n

---

# 27. EMPTY STATES

Örneğin Best Sellers için hiç ürün yoksa:

```text
0 product
0 product
0 product
```

gösterme.

Template:

* gracefully hide
* fallback source
* veya uygun empty state

kullanmalı.

Boş içerik yüzünden homepage kırılmamalı.

---

# 28. BAŞARI KRİTERİ

İş tamamlandığında şu mümkün olmalı:

### SellerCentral

```text
Landing Pages
    ↓
Homepage
    ↓
Add Container
    ↓
Template Library
```

buradan herhangi bir template seçebileyim.

Örneğin:

```text
Product Carousel
```

ekleyeyim.

Sonra:

```text
Title: Best Sellers
Source: Best Sellers
Limit: 6
```

yapayım.

Save.

Homepage'e gelsin.

Aynı template'i:

```text
Category Page
Campaign Page
Brand Page
SEO Page
```

üzerinde de kullanabileyim.

---

# 29. EN ÖNEMLİ SONUÇ

Son sistem şu olmamalı:

```text
Homepage React Component
    ↓
hardcoded sections
```

Olması gereken:

```text
Landing Page System
        ↓
Container Instances
        ↓
Reusable Container Templates
        ↓
Dynamic Data
        ↓
Reusable Renderers
```

Homepage sadece bu sistemin oluşturduğu bir composition olmalı.

---

# 30. SON TALİMAT

Önce **PHASE 1 AUDIT** yap.

Audit tamamlanmadan büyük çaplı kod değişikliğine başlama.

Audit raporunda özellikle:

* mevcut sistemin ne kadarının kullanılabileceğini
* nerede refactor gerektiğini
* hangi değişikliklerin riskli olduğunu
* backward compatibility'nin nasıl korunacağını

açıkça belirt.

Daha sonra implementasyona geç.

**Amaç sadece çalışan bir page builder yapmak değil.**

Amaç:

> **Andertal'ın bundan sonraki tüm Landing Page'lerini besleyecek, profesyonel, reusable, scalable ve görsel olarak güçlü bir Container Template altyapısı kurmak ve bu altyapıyı kullanarak gerçek Andertal Homepage'ini üretmek.**

Mevcut projeyi bozma.

Mevcut datayı koru.

Mevcut architecture'a mümkün olduğunca uy.

Gereksiz yere yeni teknoloji veya dependency ekleme.

Ve en önemlisi:

**Homepage'i hardcode etme. Homepage'i yeni Landing Page / Container Template sisteminin gerçek bir kullanıcısı olarak oluştur.**
