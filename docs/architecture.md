Belucha E-Commerce Mimari Analiz Raporu
Projeni inceledim. Amazon benzeri bir marketplace için güzel bir başlangıç ama birkaç kritik mimari sorun var. Şimdi domain'lere ayırıp, patlaması muhtemel yerleri göstereyim.

🎯 Domain Analizi ve Sorumluluklar
1. Authentication & Authorization Domain
Sorumluluk:

User authentuication (Customer, Seller)
JWT token yönetimi
Session management
Role-based access control

Şu anki durum:

❌ Authentication logic her app'te duplicate edilmiş
❌ localStorage direkt kullanılıyor (güvenlik riski)
❌ Token refresh yok
❌ Role kontrolü yokmuş gibi görünüyor

Olması gereken:
packages/lib/auth/
├── AuthContext.jsx          # Shared context
├── useAuth.js               # Shared hook
├── tokenService.js          # Token management
└── roleGuards.js            # Role-based guards
Domain Kuralları:

Shop app: Sadece Customer auth kullanabilir
Sellercentral app: Sadece Seller auth kullanabilir
CMS: Her ikisini de authenticate edebilir ama AYRI collection'lar
Token refresh logic shared package'da olmalı
LocalStorage'a direkt erişim yasak, service üzerinden gitmeli

Kritik Risk:

Şu an her app kendi auth'unu yönetiyor. Bir değişiklik 3 yerde yapılmalı. Token format değişirse her şey patlar.


2. Catalog Domain (Product Management)
Sorumluluk:

Product CRUD
Category hierarchy
Brand management
Inventory management
Product variants
Media handling

Şu anki durum:

✅ Payload CMS'te merkezi
❌ Inventory logic dağınık (variant inventory vs base inventory)
❌ SKU generation logic frontend'te (!)
❌ Product validation rules her yerde farklı olabilir

Olması gereken:
CMS (Payload):
└── collections/
    ├── products.js          # Product schema & hooks
    ├── categories.js        # Category hierarchy
    ├── brands.js
    └── media.js

packages/lib/catalog/
├── productValidation.js     # Shared validation
├── skuGenerator.js          # SKU generation logic
├── inventoryCalculator.js   # Inventory calculation
└── variantMapper.js         # Variant normalization
Domain Kuralları:

SKU generation: Backend'de (CMS hooks), frontend'te değil
Inventory updates: Sadece CMS veya Order domain yapabilir
Product creation: Sadece Seller app yapabilir
Product listing: Shop app sadece published status görebilir
Variant pricing: Ana ürün fiyatını override edebilir ama validation gerekli

Kritik Risk:

SKU generation frontend'te! Aynı SKU ile birden fazla ürün oluşturulabilir. İki seller aynı title'ı kullanırsa sistem çöker.


3. Seller Domain
Sorumluluk:

Seller onboarding
Store management
Seller analytics
Commission tracking
Payout management (Stripe Connect)

Şu anki durum:

✅ CMS'te Seller collection var
❌ Store builder yapısı belirsiz (Store Page ne yapıyor?)
❌ Commission calculation logic yok
❌ Seller → Product ilişkisi tek yönlü (seller products'larını listeyemiyor olabilir)

Olması gereken:
CMS (Payload):
└── collections/
    ├── sellers.js           # Seller profile & auth
    └── stores.js            # Store builder data (yeni!)

packages/lib/seller/
├── commissionCalculator.js  # Commission logic
├── payoutScheduler.js       # Payout timing rules
└── sellerAnalytics.js       # Analytics aggregation

Sellercentral App:
└── pages/
    ├── inventory/           # Sadece seller'ın products'ları
    ├── orders/              # Sadece seller'ın orders'ları
    ├── analytics/           # Sadece seller'ın data'sı
    └── store/               # Store builder UI
Domain Kuralları:

Seller sadece kendi product'larını görebilir/düzenleyebilir
Commission rate: CMS'te seller record'unda (değiştirilebilir)
Payout: Sadece completed orders için hesaplanır
Store builder: CMS'te store collection, Sellercentral'da UI
Seller analytics: Order domain'den data çeker, kendi hesaplar

Kritik Risk:

Seller → Product filtering yok gibi görünüyor. GraphQL query'de seller ID filter edilmezse A seller'ı B seller'ın ürünlerini görebilir/düzenleyebilir.


4. Order Domain
Sorumluluk:

Order creation & management
Order status lifecycle
Commission calculation
Return handling
Order analytics

Şu anki durum:

⚠️ Order collection var ama logic belirsiz
❌ Checkout flow yok (Shop app'te)
❌ Order → Seller → Payout flow tanımsız
❌ Inventory reservation yok

Olması gereken:
CMS (Payload):
└── collections/
    └── orders.js
        ├── orderItems (array)
        │   ├── product (relation)
        │   ├── seller (relation)
        │   ├── quantity
        │   ├── price
        │   └── commission
        ├── customer (relation)
        ├── status (enum)
        ├── totalAmount
        ├── commissionAmount
        └── payoutStatus

packages/lib/order/
├── orderStateMachine.js     # Order status transitions
├── inventoryReserver.js     # Reserve inventory on order
├── commissionSplitter.js    # Split payment to sellers
└── refundCalculator.js      # Refund logic
Domain Kuralları:

Order creation: Customer checkout flow tetikler
Inventory: Order created → inventory reserved
Payment: Stripe charge → %10 commission ayrılır
Order fulfilled → Seller'a payout başlar
Return: Inventory geri eklenir, commission reverse edilir
Order sadece Customer veya ilgili Seller görebilir

Kritik Risk:

Order lifecycle logic yok. Inventory reservation yok. İki kişi son ürünü aynı anda alabilir. Stripe Connect entegrasyonu eksik görünüyor.


5. Payment Domain
Sorumluluk:

Stripe payment processing
Stripe Connect (seller payouts)
Commission calculation
Refund handling
Payout scheduling

Şu anki durum:

⚠️ Stripe plugin var ama config belirsiz
❌ Checkout flow yok
❌ Seller payout flow tanımsız
❌ Commission %10 fixed (flexible olmalı)

Olması gereken:
CMS (Payload):
└── collections/
    ├── sellers.js
    │   └── stripeAccountId   # Stripe Connect
    └── payouts.js (yeni!)
        ├── seller (relation)
        ├── order (relation)
        ├── amount
        ├── commission
        ├── status
        └── paidAt

packages/lib/payment/
├── stripeCheckout.js        # Customer checkout
├── stripeConnect.js         # Seller onboarding
├── payoutScheduler.js       # Payout timing
└── commissionCalculator.js  # Commission logic
Domain Kuralları:

Customer payment: Direkt platform hesabına
Commission: Order created'da hesaplanır
Payout: Order completed'dan X gün sonra (örn: 7 gün)
Seller onboarding: Stripe Connect express/custom account
Platform: %10 commission alır (flexible olmalı)
Refund: Customer + Seller payback, commission reverse

Kritik Risk:

Stripe Connect entegrasyonu eksik. Seller'lara ödeme yapacak sistem yok. Commission %10 fixed, seller bazında değişmeli.


6. Customer Domain
Sorumluluk:

Customer profile
Wishlist
Order history
Address management
Customer analytics

Şu anki durum:

⚠️ Customer collection var ama field'lar belirsiz
❌ Customer profile sayfası minimal
❌ Wishlist yok
❌ Address management yok

Olması gereken:
CMS (Payload):
└── collections/
    ├── customers.js
    │   ├── addresses (array)
    │   ├── defaultAddress
    │   └── stripeCustomerId
    └── wishlists.js (yeni!)
        ├── customer (relation)
        └── products (array)

Shop App:
└── pages/
    └── account/
        ├── profile/
        ├── orders/
        ├── addresses/
        └── wishlist/
Domain Kuralları:

Customer: Sadece kendi data'sını görebilir
Wishlist: Customer'a özel
Address: Checkout'ta kullanılır
Customer analytics: Order domain'den aggregate edilir

Kritik Risk:

Customer profile eksik. Address yok, checkout yapılamaz.


🏗️ Monorepo Yapısı Değerlendirmesi
✅ Doğru Olan Şeyler:

Turborepo kullanımı: Build cache + incremental build iyi
Shared packages: UI ve lib package'ları doğru yerde
Separate apps: Shop ve Sellercentral ayrılması doğru
Headless CMS: Payload merkezi backend olarak iyi

❌ Riskli/Yanlış Olan Şeyler:

GraphQL API çalışmıyor (!): Tüm sistem çökmüş durumda
Authentication duplicate: Her app kendi auth'unu yönetiyor
Business logic frontend'te: SKU generation, validation vs.
No API gateway: CMS direkt expose edilmiş
Shared package structure belirsiz: lib içinde ne var?
No service layer: CMS = database + API + business logic hepsi birlikte


🚨 "Şu An Büyürse Patlar" Listesi
1. Authentication System (KRİTİK - ÇOK YÜKSEK RİSK)
Sorun:

Her app kendi token'ını yönetiyor
Token refresh yok
Role-based access control yok
LocalStorage direkt kullanılıyor

Patlama senaryosu:

Seller, shop app'ten login olup customer gibi davranabilir
Token format değişirse her şey durur
XSS attack ile token çalınabilir
3 app'i sync tutmak imkansız hale gelir

Çözüm:
packages/lib/auth/
└── Tüm auth logic buraya taşınmalı
    - Shared AuthContext
    - Token service (httpOnly cookie'ye geç)
    - Role guards
    - Refresh token logic

2. Business Logic Frontend'te (YÜKSEK RİSK)
Sorun:

SKU generation Sellercentral'da (!)
Product validation frontend'te
Commission calculation yok

Patlama senaryosu:

Aynı SKU ile birden fazla ürün oluşturulabilir
Validation bypass edilebilir (PostMan ile direkt GraphQL'e istek)
Frontend güncellenmezse eskiler çalışmaz

Çözüm:
CMS (Payload):
└── collections/products.js
    └── hooks: {
        beforeCreate: [generateSKU, validateProduct],
        beforeUpdate: [validateInventory]
      }

3. No Order Lifecycle (KRİTİK - ÇOK YÜKSEK RİSK)
Sorun:

Order flow yok
Inventory reservation yok
Commission tracking yok
Seller payout yok

Patlama senaryosu:

Son ürün 2 kişiye satılabilir
Seller'a ödeme yapılamaz
Refund yapılamaz
Fraud detection yok

Çözüm:
CMS (Payload):
└── collections/orders.js
    └── hooks: {
        beforeCreate: [reserveInventory, calculateCommission],
        afterCreate: [chargeCustomer, notifySeller],
        beforeUpdate: [validateStatusTransition]
      }

4. Direct CMS Exposure (ORTA-YÜKSEK RİSK)
Sorun:

CMS direkt expose edilmiş
No API gateway
No rate limiting
No request validation

Patlama senaryosu:

DDoS attack direkt CMS'e gelir
GraphQL query complexity attack
Malicious seller tüm platform'u yavaşlatabilir
Data scraping çok kolay

Çözüm:
Öneri:
API Gateway (BFF Pattern)
├── Shop API (Next.js API routes)
├── Seller API (Next.js API routes)
└── CMS (Internal only)

Veya:
GraphQL Gateway (Apollo Federation/Mesh)
└── Rate limiting
└── Query complexity analysis
└── Authentication middleware

5. No Data Access Layer (YÜKSEK RİSK)
Sorun:

GraphQL query'leri direkt frontend'te
No seller filtering
No permission checks

Patlama senaryosu:
graphql# Seller A, Seller B'nin ürünlerini görebilir:
query {
  Products {
    docs {
      id
      seller {
        storeName
        email
      }
    }
  }
}
```

**Çözüm:**
```
CMS (Payload):
└── collections/products.js
    └── access: {
        read: ({ req }) => {
          if (req.user.collection === 'sellers') {
            return { seller: { equals: req.user.id } }
          }
          return { status: { equals: 'published' } }
        }
      }
```

---

### 6. **Stripe Connect Eksik (KRİTİK - ÇOK YÜKSEK RİSK)**

**Sorun:**
- Seller'lara ödeme yapılamıyor
- Commission tracking yok
- Payout scheduling yok

**Patlama senaryosu:**
- Seller'lar ürün satıyor ama para alamıyorlar (!)
- Platform commission alamıyor
- Refund yapılamıyor
- Legal sorun (escrow gerekebilir)

**Çözüm:**
```
1. Seller onboarding: Stripe Connect Account oluştur
2. Customer checkout: Platform Stripe account'a charge et
3. Order completed: Seller'a transfer yap (90% seller, 10% platform)
4. Refund: Split refund (hem customer'a hem seller'a)
```

---

### 7. **No Observability (ORTA RİSK)**

**Sorun:**
- No logging
- No monitoring
- No error tracking
- No analytics

**Patlama senaryosu:**
- Production'da bug var, log yok
- GraphQL query yavaş, neden bilinmiyor
- User error'ları görünmüyor
- Performance regression tespit edilemiyor

**Çözüm:**
```
Minimum:
- Sentry (error tracking)
- LogRocket / Datadog (session replay)
- Apollo Studio (GraphQL monitoring)
- Vercel Analytics (frontend metrics)
```

---

## 🎯 Domain Arası Kesin Kurallar

### Rule 1: Authentication Separation
```
❌ YASAK:
- Shop app'ten Seller auth yapma
- Seller app'ten Customer auth yapma
- Token'ları karıştırma

✅ DOĞRU:
- Her domain kendi collection'ı
- Shared auth package kullan
- Role-based middleware
```

### Rule 2: Data Access Boundaries
```
❌ YASAK:
- Shop app, seller data'ya direkt erişemez
- Seller app, başka seller'ın data'sına erişemez
- Frontend'te business logic yapma

✅ DOĞRU:
- CMS access control kullan
- GraphQL query filtering
- Backend hooks/middleware
```

### Rule 3: Business Logic Placement
```
❌ YASAK:
- SKU generation frontend'te
- Validation sadece frontend'te
- Commission calculation frontend'te

✅ DOĞRU:
- Kritik logic CMS hooks'ta
- Validation hem frontend hem backend
- Shared packages sadece utility
```

### Rule 4: Order → Inventory → Payment Flow
```
❌ YASAK:
- Order create → direkt inventory düş
- Payment fail → inventory kaybolur
- Refund → inventory geri eklenmez

✅ DOĞRU:
- Order create → inventory reserve
- Payment success → inventory commit
- Payment fail → inventory release
- Refund → inventory restore
```

### Rule 5: Commission & Payout
```
❌ YASAK:
- Commission fixed %10
- Seller direkt para alır
- Refund seller'dan kesme

✅ DOĞRU:
- Commission seller bazında flexible
- Platform escrow (X gün)
- Payout scheduled (weekly/monthly)
- Refund split (customer + seller + platform)
```

---

## 🔧 Önerilen Mimari (Özet)
```
┌─────────────────────────────────────────────────────────┐
│                    API GATEWAY (BFF)                     │
│  (Rate limiting, Auth, Query complexity, Caching)       │
└─────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐      ┌─────▼─────┐      ┌────▼────┐
   │  Shop   │      │Seller     │      │  CMS    │
   │  App    │      │Central    │      │(Internal)│
   │(Customer)│      │(Seller)   │      │         │
   └─────────┘      └───────────┘      └────┬────┘
                                              │
                                        ┌─────▼─────┐
                                        │  MongoDB  │
                                        │  Atlas    │
                                        └───────────┘
```

**Katmanlar:**
1. **Presentation Layer**: Shop + Sellercentral (Next.js)
2. **API Gateway Layer**: BFF pattern (Next.js API routes veya Apollo Gateway)
3. **Business Logic Layer**: CMS hooks + Shared packages
4. **Data Access Layer**: Payload CMS (GraphQL + REST)
5. **Database Layer**: MongoDB Atlas

**Kritik Package Structure:**
```
packages/
├── auth/              # Authentication (shared)
├── catalog/           # Product logic (shared)
├── order/             # Order logic (shared)
├── payment/           # Stripe logic (shared)
├── seller/            # Seller logic (shared)
├── customer/          # Customer logic (shared)
└── ui/                # UI components (shared)

🎬 Sonuç
Güzel yanlar:

Monorepo yapısı doğru
Payload CMS merkezi backend olarak iyi seçim
App separation doğru (Shop vs Sellercentral)

Kritik sorunlar:

GraphQL API çalışmıyor → Tüm sistem çökmüş
Authentication her yerde duplicate → Security risk
Business logic frontend'te → Validation bypass edilebilir
Order lifecycle yok → Inventory chaos, seller ödeme alamıyor
Stripe Connect eksik → Legal problem
Data access control yok → Seller A, Seller B'yi görebilir

Öncelikli 3 adım:

GraphQL API'yi düzelt (yoksa proje ölü)
Authentication'ı shared package'a taşı
Order lifecycle + Stripe Connect'i ekle

Bu mimariyle büyümek çok zor. Refactoring şart.