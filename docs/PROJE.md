# BELUCHA – Proje Mimarisi ve Yapı Dokümanı

Bu doküman, projenin mimarisini, dizin yapısını ve önemli dosyaları tanımlar. ChatGPT veya başka bir araçla “gidişat doğru mu?” sorusunu sorarken referans olarak kullanılabilir.

---

## 1. Proje Hedefi


**Amazon / Shopify benzeri bir marketplace:**

- **Müşteri:** Tek bir mağazadan alışveriş (kategori, ürün, sepet).
- **Satıcı:** Kendi ürünlerini ekleyip yönetir (SellerCentral).
- **Platform sahibi:** Global kategoriler, banner, politika (Admin Hub / Super Admin).

**Temel mimari kural:** Admin Hub = kategoriler ve platform verileri için tek kaynak. Satıcılar kategori oluşturamaz, sadece atanmış koleksiyonlara ürün ekler.

---

## 2. Teknoloji Özeti

| Katman | Teknoloji |
|--------|-----------|
| Monorepo | npm workspaces + Turborepo |
| Backend | Medusa v2 (Node, Express), PostgreSQL veya SQLite |
| Mağaza (Shop) | Next.js 16, React 19, Tailwind, REST API |
| Satıcı paneli (SellerCentral) | Next.js 16, React 19, Tailwind, REST API (Medusa Admin API) |
| Platform Admin (SellerCentral) | Next.js 16, React, REST API (Admin Hub API) - Integrated into SellerCentral |
| Paylaşılan kod | `@belucha/ui`, `@belucha/lib`, `@belucha/config` |

**Not:** Eski stack (Payload CMS, MongoDB, GraphQL) dokümantasyonda ve bazı dosyalarda kalıntı olarak geçebilir; fiili veri akışı **Medusa REST + PostgreSQL** üzerinden.

---

## 3. Monorepo Yapısı

```
belucha/
├── apps/
│   └── (Platform Admin integrated into sellercentral)
│   ├── medusa-backend/     # API backend – port 9000
│   ├── sellercentral/      # Satıcı paneli – port 3002
│   └── shop/               # Müşteri mağazası – port 3000
├── packages/
│   ├── config/             # ESLint, Tailwind, TypeScript paylaşılan config
│   ├── lib/                # Auth, Stripe, SEO, Apollo (lib)
│   └── ui/                 # Button, Card, Input vb. paylaşılan UI
├── docs/                   # RAPOR.md, TASKS.md, PROJE.md
├── package.json            # Root workspaces + turbo
├── turbo.json              # Build/dev task tanımları
└── .github/workflows/      # CI (ci.yml)
```

**Workspaces (package.json):** `["apps/*", "packages/*", "apps/medusa-backend"]`

**Turborepo:** `build`, `dev`, `lint`, `clean` task’ları; Shop ve Sellercentral build’leri birbirine bağımlı değil, medusa-backend#dev ayrı tanımlı.

---

## 4. Uygulamalar (apps)

### 4.1 medusa-backend (Backend API)

- **Rol:** Tek backend. Ürün, koleksiyon, bölge (region), Admin Hub kategorileri ve banner’ları yönetir.
- **Başlatma:** `server.js` (configLoader + pgConnectionLoader sonrası MedusaAppLoader).
- **Port:** 9000 (env: `PORT`).
- **Veritabanı:** `medusa-config.js` → `DATABASE_URL` (PostgreSQL) veya `file:./medusa.db` (SQLite).

**Önemli dosyalar:**

| Dosya | Açıklama |
|-------|----------|
| `server.js` | Giriş noktası; config + PG yükleme, MedusaAppLoader, RegionService/AdminHubService loader, Express dinleme |
| `medusa-config.js` | DB URL, CORS (store_cors, admin_cors), JWT/cookie secret, redis_url |
| `api/admin-hub/categories/route.ts` | GET/POST kategoriler; tree=true, is_visible filtreleri |
| `api/admin-hub/categories/[id]/route.ts` | GET/PUT/DELETE tek kategori |
| `api/admin-hub/banners/` | Banner CRUD |
| `api/store/products/route.ts` | Ürün listesi; collection_id, category, region filtreleri |
| `api/admin/regions/` | Region CRUD, ürün–region ilişkisi |
| `api/admin/product-categories/route.ts` | Medusa product categories (opsiyonel kullanım) |
| `models/admin-hub-category.ts` | Entity: name, slug, parent_id, is_visible, has_collection, sort_order |
| `models/admin-hub-banner.ts` | Banner entity |
| `models/region.ts`, `product-region.ts` | Bölge ve ürün–bölge ilişkisi |
| `services/admin-hub-service.ts` | Kategori CRUD, getCategoryTree, syncCollectionForCategory (Medusa collection) |
| `services/region-service.ts` | Bölge ve ürün–bölge mantığı |
| `loaders/admin-hub-service-loader.ts` | AdminHubService’i container’a kaydetme |
| `loaders/region-service-loader.ts` | RegionService’i container’a kaydetme |
| `migrations/` | TypeORM/Medusa migration’lar (admin_hub_categories, admin_hub_banners, regions vb.) |
| `scripts/add-categories.js` | Admin Hub API ile toplu kategori ekleme |
| `render.yaml` | Render deploy şablonu (yorum satırı) |

**API özeti:**

- **Admin Hub:** `GET/POST /admin-hub/categories`, `GET/PUT/DELETE /admin-hub/categories/:id`, banner route’ları.
- **Store:** `GET /store/products?collection_id=...&category=...&region=...`
- **Admin (Medusa):** `GET/POST /admin/regions`, `GET/POST /admin/product-categories` vb.

---

### 4.2 shop (Müşteri Mağazası)

- **Rol:** Müşteriye dönük tek mağaza; ürün listeleme, kategori/collection sayfaları, ürün detay.
- **Port:** 3000.
- **Veri:** Backend’e `NEXT_PUBLIC_MEDUSA_BACKEND_URL` ile REST (medusa-client.js).

**Önemli dosyalar:**

| Dosya | Açıklama |
|-------|----------|
| `src/app/page.jsx` | Ana sayfa |
| `src/app/collections/[slug]/page.jsx` | Koleksiyon sayfası (kategori slug); admin-hub + store/products |
| `src/app/product/[slug]/page.jsx` | Ürün detay |
| `src/app/category/[slug]/page.jsx` | Kategori sayfası |
| `src/components/Navbar.jsx` | Kategori ağacı (GET /admin-hub/categories?tree=true&is_visible=true), menü linkleri |
| `src/components/Footer.jsx`, `Hero.jsx`, `ProductGrid.jsx`, `SlimBar.jsx` | Layout ve liste |
| `src/lib/medusa-client.js` | Backend REST client (ürünler, health vb.) |
| `src/hooks/useMedusa.js`, `useMedusaAuth.js` | Medusa ve auth hook’ları |
| `vercel.json` | Vercel build (monorepo root’a göre install + turbo filter) |

**Kategori akışı:** Navbar, Admin Hub’dan tree alır; `has_collection === true` olanlar `/collections/:slug` linkine gider. Collection sayfası aynı slug ile store/products ve kategori bilgisini çeker.

---

### 4.3 sellercentral (Satıcı Paneli)

- **Rol:** Satıcı ürün ekler, sipariş/envanter/rapor sayfalarına erişir. Kategorileri **sadece görüntüler** (Admin Hub’dan); ürün oluştururken Medusa collection atar.
- **Port:** 3002.
- **Veri:** `NEXT_PUBLIC_MEDUSA_BACKEND_URL` + `medusa-admin-client.js` (Admin API + Admin Hub API).

**Önemli dosyalar:**

| Dosya | Açıklama |
|-------|----------|
| `src/app/layout.jsx` | Root layout, Providers |
| `src/app/page.jsx` | Dashboard giriş |
| `src/app/products/page.jsx`, `single-upload/page.jsx` vb. | Ürün listesi, tekli/toplu yükleme |
| `src/app/categories/page.jsx` | Kategorileri listeleme (Admin Hub veya Medusa product-categories’e bağlı olabilir) |
| `src/components/DashboardLayout.jsx` | Satıcı layout, sidebar |
| `src/components/Providers.jsx` | Apollo/React context (GraphQL kalıntısı olabilir) |
| `src/lib/medusa-admin-client.js` | Backend Admin + Admin Hub REST (getProducts, createProduct, getAdminHubCategories vb.) |
| `src/components/pages/BrandPage.jsx`, `OrdersPage.jsx`, `InventoryPage.jsx` | gql/useQuery kullanıyor; GraphQL endpoint yoksa hata/placeholder |

**Not:** Birçok sayfa hâlâ `gql` / `useQuery` içeriyor; gerçek veri Medusa REST’ten. Tam geçiş yapılmadığı için karmaşıklık var.

---

### 4.4 Platform Admin (SellerCentral Settings)

- **Rol:** Platform sahibi. Global kategoriler ve banner'ları yönetir (Admin Hub API).
- **Erişim:** SellerCentral → Settings → Categories/Banners/Platform
- **Veri:** `NEXT_PUBLIC_MEDUSA_BACKEND_URL` + Admin Hub API (`/admin-hub/v1/categories`, `/admin-hub/v1/banners`).

**Önemli dosyalar:**

| Dosya | Açıklama |
|-------|----------|
| `src/app/settings/categories/page.jsx` | Category Management (CRUD, single + bulk) |
| `src/app/settings/banners/page.jsx` | Banner Management |
| `src/app/settings/platform/page.jsx` | Platform Settings |
| `src/components/pages/settings/CategoriesPage.jsx` | Category management component |
| `src/components/pages/settings/BannersPage.jsx` | Banner management component |
| `src/components/pages/settings/PlatformSettingsPage.jsx` | Platform settings component |

**Not:** Platform admin features are integrated into SellerCentral. Medusa admin is for products/orders/channels, this is for platform taxonomy and banners.

---

## 5. Packages (Paylaşılan Kod)

### 5.1 @belucha/ui

- **İçerik:** Button, Card, Input vb. bileşenler.
- **Konum:** `packages/ui/src/` (Button.jsx, Card.jsx, Input.jsx, index.jsx).
- **Kullanım:** Shop, SellerCentral, Admin `"@belucha/ui": "*"` ile kullanır.

### 5.2 @belucha/lib

- **İçerik:** Auth (AuthContext, roleGuards, tokenService), Stripe client, SEO helpers. Apollo client export’u da var (kullanım azalıyor).
- **Konum:** `packages/lib/src/` (auth/, stripe/, seo/, apollo/).
- **Kullanım:** Shop ve SellerCentral’da auth ve diğer yardımcılar.

### 5.3 @belucha/config

- **İçerik:** Paylaşılan ESLint (next.js), Tailwind (base, next.js), TypeScript (base, nextjs, react-library).
- **Konum:** `packages/config/` (eslint/, tailwind/, tsconfig/).
- **Kullanım:** Uygulamalar extend eder.

---

## 6. Veri Akışı (Özet)

1. **Kategori (Admin Hub):**  
   SellerCentral (Settings → Categories) → `POST /admin-hub/v1/categories` (name, slug, is_visible, has_collection) → Backend AdminHubService → DB + istenirse Medusa collection sync (handle = slug).

2. **Mağaza tarafı:**  
   Shop Navbar → `GET /admin-hub/categories?tree=true&is_visible=true` → Menüde sadece `has_collection` true olanlar `/collections/:slug` linkine sahip.  
   Collection sayfası → `GET /admin-hub/categories` (veya slug ile) + `GET /store/products?collection_id=:slug` → Ürünler listelenir.

3. **Satıcı tarafı:**  
   SellerCentral → Medusa Admin API (ürün CRUD) + Admin Hub API (kategori listesi). Ürün oluştururken collection atanır; Medusa collection handle = Admin Hub kategori slug ile eşleşir.

4. **İki kategori kavramı:**  
   - **Admin Hub categories:** Platform taxonomy (navigation, collection sayfaları).  
   - **Medusa product categories:** Medusa’nın kendi product category’leri; projede “tek kaynak Admin Hub” deniyor, bu yüzden Medusa product-categories ikincil veya ileride kaldırılabilir.

---

## 7. Konfigürasyon ve Ortam

- **turbo.json:** `globalEnv`: NODE_ENV, NEXT_PUBLIC_MEDUSA_BACKEND_URL, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY. Build task’larında env geçer.
- **Backend env (medusa-backend):** DATABASE_URL, PORT, STORE_CORS, ADMIN_CORS, JWT_SECRET, COOKIE_SECRET, REDIS_URL (opsiyonel).
- **Frontend env (shop, sellercentral, admin):** NEXT_PUBLIC_MEDUSA_BACKEND_URL (zorunlu). Shop’ta NEXT_PUBLIC_SELLERCENTRAL_URL da kullanılıyor.
- **Deploy:** Backend → Render (Node, server.js). Shop, SellerCentral, Admin → Vercel (ayrı projeler; root directory ve turbo filter ile build).

**Render ortam değişkenleri (Medusa backend):**

| Değişken | Açıklama |
|----------|----------|
| `DATABASE_URL` | Render PostgreSQL bağlantı URL'i (SSL'li). Render DB uygun. |
| `PORT` | Render'ın verdiği port (genelde otomatik; `medusa start -p ${PORT:-9000}` kullanılıyor) |
| `NODE_ENV` | `production` (Render'da doğru) |
| `STORE_CORS` | Shop frontend origin (production URL; Shop Vercel) |
| `ADMIN_CORS` | Admin frontend origin (SellerCentral Vercel) |
| `AUTH_CORS` | Auth origin'leri (login/token Shop veya SellerCentral'dan kullanılacaksa tanımla) |
| `JWT_SECRET` | Güçlü, rastgele değer (production'da mutlaka güçlü kullan) |
| `COOKIE_SECRET` | Güçlü, rastgele değer (production'da mutlaka güçlü kullan) |
| `REDIS_URL` | Opsiyonel. Medusa v2 event/job için; boşsa in-memory (tek instance için genelde yeterli) |
| `DATABASE_TYPE` | Opsiyonel (URL zaten `postgresql://` ise gerekmez) |

**Öneriler:**

- **AUTH_CORS:** Medusa auth (login/token) Shop veya SellerCentral'dan kullanılacaksa bu origin'leri ekle. Medusa virgülle ayrılmış kabul eder; örnek:  
  `AUTH_CORS=https://belucha-shop.vercel.app,https://belucha-sellercentral.vercel.app`
- **REDIS_URL:** Production'da event/job için Redis kullanılacaksa doldur; yoksa boş bırakıp in-memory ile devam edilebilir (tek instance için genelde yeterli).
- **JWT_SECRET / COOKIE_SECRET:** Production'da güçlü, rastgele değerler kullan.

Build/Start: Root Directory boş (repo kökü) veya `apps/medusa-backend`; kökte `npm install` çalışıyorsa workspace'ler yükleneceği için backend bağımlılıkları da dahil edilir.

**Vercel (Shop / SellerCentral):**

- **SellerCentral:** `NEXT_PUBLIC_MEDUSA_BACKEND_URL` = Render backend (doğru). Medusa için REST kullanıldığından `NEXT_PUBLIC_GRAPHQL_ENDPOINT` boş olabilir. `NEXT_PUBLIC_SHOP_URL` ve Payload değişkenleri tutarlı tutulmalı.
- **Shop:** `NEXT_PUBLIC_MEDUSA_BACKEND_URL` = Render; `NEXT_PUBLIC_SELLERCENTRAL_URL` = SellerCentral. Payload URL'leri tutarlı tutulmalı.

---

## 8. Bilinen Karmaşıklıklar / Kalıntılar

- **GraphQL / Apollo:** SellerCentral’da Brand, Inventory, Orders vb. sayfalar hâlâ `gql`/`useQuery` kullanıyor; endpoint yok. Ya REST’e geçilecek ya da placeholder yapılacak.
- **İki kategori kaynağı:** Admin Hub + Medusa product-categories; tek kaynak (Admin Hub) kullanılırsa mimari daha net olur.
- **README / env örnekleri:** Eski Payload/MongoDB/GraphQL referansları var; güncel stack Medusa + REST + PostgreSQL.
- **Medusa admin paketleri:** Root veya frontend’te @medusajs/admin, admin-ui gereksiz olabilir; sadece medusa-backend’te tutulabilir.

---

## 9. Dosya Ağacı (Özet)

```
belucha/
├── apps/
│   └── sellercentral/src/app/settings/  → categories/, banners/, platform/ (platform admin)
│   ├── medusa-backend/
│   │   ├── api/                 → admin-hub, store, admin route’ları
│   │   ├── loaders/             → admin-hub, region service loader
│   │   ├── models/              → admin-hub-category, banner, region, product-region
│   │   ├── services/            → admin-hub-service, region-service
│   │   ├── migrations/          → TypeORM/Medusa migrations
│   │   ├── server.js, medusa-config.js
│   ├── sellercentral/src/
│   │   ├── app/                 → dashboard, products, orders, categories, settings vb.
│   │   ├── components/         → DashboardLayout, pages/*, Providers
│   │   └── lib/                 → medusa-admin-client.js
│   └── shop/src/
│       ├── app/                 → page, collections/[slug], product/[slug], account, login vb.
│       ├── components/         → Navbar, Footer, ProductGrid, Hero, SlimBar
│       └── lib/                 → medusa-client.js
├── packages/
│   ├── config/                  → eslint, tailwind, tsconfig
│   ├── lib/src/                 → auth, stripe, seo, apollo
│   └── ui/src/                  → Button, Card, Input
├── docs/                        → PROJE.md, RAPOR.md, TASKS.md
├── package.json, turbo.json
└── .github/workflows/ci.yml
```

---

## 10. Mimari Değerlendirme ve Sadeleştirme

Bu bölüm, dış değerlendirme (örn. ChatGPT) sonucu oluşturulmuş verdict ve aksiyon listesidir. “Gidişat doğru mu?” sorusuna verilen yanıt özetlenir; sadeleştirme yaparken referans alınır.

### 🟢 Genel Verdict

- **Mimari:** Mantıklı, ölçeklenebilir, marketplace mantığı doğru.
- **Admin Hub fikri:** Çok sağlam (Amazon kafası); kategoriler/banner için tek kaynak doğru karar.
- **Medusa kullanımı:** Headless commerce engine (ürün, sipariş, region, collection, pricing) – doğru ayrım; CMS gibi kullanılmıyor.
- **Monorepo + Turborepo:** Shop / SellerCentral / Admin / Backend ayrı deploy, kod paylaşımı (ui, lib, config) – net senior mimari.
- **Durum:** “Yanlış yoldasın” değil; “profesyonel ama sadeleştirilebilir”. Şu an ~%20 fazlalık ve ileride yavaşlatacak mimari borç var.

### ✅ En güçlü taraflar

1. **Admin Hub = tek kaynak** – Satıcı kaosunu bitirir, SEO ve navigation deterministic; multi-country / multi-brand için uygun.
2. **Medusa = commerce core, Admin Hub = business logic, Next.js = presentation** – Ayrım temiz.
3. **Monorepo + ayrı deploy** – Marketplace için mantıklı; UI/lib/config ortak.

### ⚠️ Asıl problemler (dürüst)

1. **Medusa lifecycle’a fazla manuel müdahale**  
   - `server.js` içinde service resolve, loader manuel çağırma.  
   - Medusa v2 güncellemesi / plugin / worker ekleme ile kırılma riski.  
   - **Hedef:** server.js sadece bootstrap (MedusaAppLoader + listen); servis register işi Medusa’ya bırakılmalı; loader’lar doğru yerde ama manuel çağırma yanlış abstraction.

2. **İki kategori sistemi**  
   - Admin Hub categories (gerçek) vs Medusa product-categories (opsiyonel) – pratikte API’ler ve route’lar ikisi de duruyor; 3 ay sonra karışır.  
   - **Net karar:** Ya Medusa product-categories tamamen kapat (route’ları sil, migration’ları dondur), ya da Admin Hub → Medusa product-category 1:1 sync (o zaman Admin Hub sadece UI). Arası tehlikeli.

3. **SellerCentral GraphQL kalıntıları**  
   - `gql`, `useQuery`, Apollo Provider var; backend’te GraphQL yok. Yeni geliştirici ve context switch yorar.  
   - **Tavsiye:** Tamamen sil, hard placeholder yap veya tek bir `legacy/` altına taşı; “yarı çalışıyor” kalmasın.

4. **Platform Admin route yapısı** ✅
   - **Yapıldı:** `sellercentral/src/app/settings/categories/`, `banners/`, `platform/`
   - Platform admin features integrated into SellerCentral Settings menu

### 🧹 Sadeleştirme checklist (altın liste)

Uygulandıkça işaretlenebilir.

**Backend**

- [ ] `server.js` → sadece bootstrap (config + PG + MedusaAppLoader + listen).
- [ ] Manuel `container.resolve` / loader çağrıları KALDIR; servis kayıt Medusa’ya bırakılsın.
- [ ] Medusa product-categories ya tamamen sil (route + kullanım) ya salt read-only yap; karar dokümante edilsin.
- [ ] Health / readiness Medusa config veya standart modülden garanti edilsin.

**SellerCentral**

- [ ] GraphQL / Apollo tamamen kaldır veya `legacy/` altına taşı.
- [ ] Tüm veri akışı sadece REST → Medusa Admin API (+ Admin Hub API).

**Genel**

- [ ] README + env örnekleri güncellensin; Payload / Mongo referansları silinsin.
- [ ] Admin Hub API version’lansın (örn. `/admin-hub/v1/...`).

**Platform Admin (SellerCentral)** ✅

- [x] Route yapısı: `settings/categories/`, `settings/banners/`, `settings/platform/`
- [x] Platform admin features integrated into SellerCentral

### 🚀 Büyük resim

Bu mimari SaaS’a, multi-vendor’a, white-label’a dönebilir. Yanlış yolda değil; “deneysel” evreden “ürünleşme” evresine geçişte daha az esneklik, daha net kurallar ve gereksiz teknoloji kalıntılarının temizlenmesi kazanım sağlar.

---

Bu doküman, mimari tartışma ve sadeleştirme kararları için tek referanstır. Checklist maddeleri TASKS.md veya Cursor Agent talimatlarına bölünerek uygulanabilir.
