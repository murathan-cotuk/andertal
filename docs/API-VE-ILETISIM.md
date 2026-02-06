# API’ler nerede, üç uygulama nasıl iletişim kuruyor?

## 1. Özet: Üç uygulama iletişimi

```
                    ┌─────────────────────────────────────────┐
                    │     MEDUSA BACKEND (port 9000)           │
                    │     apps/medusa-backend/                 │
                    │                                         │
                    │  • REST API (store + admin + admin-hub)  │
                    │  • PostgreSQL / SQLite                   │
                    │  • CORS: STORE_CORS (shop), ADMIN_CORS   │
                    │    (sellercentral)                      │
                    └──────────────┬──────────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       │
┌──────────────────────┐  ┌──────────────────────┐        │
│  SHOP (port 3000)    │  │  SELLERCENTRAL       │        │
│  apps/shop/          │  │  (port 3002)         │        │
│                      │  │  apps/sellercentral/  │        │
│  • Müşteri mağazası  │  │                      │        │
│  • Kategori/ürün     │  │  • Satıcı paneli     │        │
│    listeleme, sepet   │  │  • Ürün CRUD        │        │
│                      │  │  • Kategori/banner   │        │
│  İletişim:           │  │    (Admin Hub)       │        │
│  • medusa-client.js  │  │                      │        │
│  • /store/* API      │  │  İletişim:           │        │
│  • .env:             │  │  • medusa-admin-     │        │
│    NEXT_PUBLIC_      │  │    client.js         │        │
│    MEDUSA_BACKEND_   │  │  • /admin/*          │        │
│    URL               │  │  • /admin-hub/v1/*   │        │
│                      │  │  • .env:             │        │
│                      │  │    NEXT_PUBLIC_      │        │
│                      │  │    MEDUSA_BACKEND_   │        │
│                      │  │    URL               │        │
└──────────────────────┘  └──────────────────────┘        │
                                                                
Shop ve Sellercentral birbirine HTTP ile bağlanmaz; ikisi de  
sadece Medusa Backend’e istek atar.                          
```

---

## 2. API’lerin yazıldığı dosyalar (Medusa Backend)

Tüm API route’ları **`apps/medusa-backend/api/`** altında. URL yolu = klasör yolu.

| Endpoint (URL) | Dosya | Açıklama |
|----------------|-------|----------|
| **STORE (mağaza – CORS: shop origin)** |
| `GET/POST /store/products` | `api/store/products/route.ts` | Ürün listesi; `region`, `category`, `collection_id` filtreleri |
| `GET /store/categories` | `api/store/categories/route.ts` | Public kategori ağacı (Navbar); `tree=true`, `is_visible=true` |
| **ADMIN (satıcı/panel – CORS: sellercentral)** |
| `GET /admin/product-categories` | `api/admin/product-categories/route.ts` | (Deprecated) Medusa product categories |
| `GET/POST /admin/regions` | `api/admin/regions/route.ts` | Bölge listesi / oluşturma |
| `POST/DELETE /admin/regions/:id/products` | `api/admin/regions/[id]/products/route.ts` | Ürün–bölge ilişkisi |
| **ADMIN HUB (platform – kategoriler/banner, CORS: sellercentral)** |
| `GET/POST /admin-hub/v1/categories` | `api/admin-hub/v1/categories/route.ts` | Kategori listesi / oluşturma; `tree`, `is_visible` |
| `GET/PUT/DELETE /admin-hub/v1/categories/:id` | `api/admin-hub/v1/categories/[id]/route.ts` | Tek kategori |
| `GET/POST /admin-hub/v1/banners` | `api/admin-hub/v1/banners/route.ts` | Banner listesi / oluşturma |
| `GET/PUT/DELETE /admin-hub/v1/banners/:id` | `api/admin-hub/v1/banners/[id]/route.ts` | Tek banner |
| (Eski path) `admin-hub/categories`, `admin-hub/banners` | `api/admin-hub/categories/`, `api/admin-hub/banners/` | v1 ile aynı mantık, farklı path |

**Not:** Medusa core’un kendi endpoint’leri de var: `/admin/products`, `/admin/collections`, `/store/carts`, `/store/auth` vb. Bunlar framework tarafından sunulur; yukarıdaki tablo sadece **projede yazdığımız** route’ları gösterir.

---

## 3. Sellercentral: Hangi dosya ne kullanıyor?

| Amaç | Kullanılan dosya / client | Çağrılan API’ler (özet) |
|------|---------------------------|--------------------------|
| **Client (tek yer)** | `src/lib/medusa-admin-client.js` | Base URL: `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (varsayılan localhost:9000). Tüm sellercentral istekleri bu client üzerinden. |
| **Client’i kim kullanıyor?** | | |
| Ürün listesi / CRUD | `ProductsPage.jsx`, `SingleUploadPage.jsx`, `InventoryPage.jsx` | `getMedusaAdminClient()` → `.getProducts()`, `.getProduct()`, `.createProduct()`, `.updateProduct()`, `.deleteProduct()` → `/admin/products` (Medusa core) |
| Kategoriler (Admin Hub) | `CategoriesPage.jsx`, `categories/page.jsx` | `getMedusaAdminClient().getAdminHubCategories()` → `/admin-hub/v1/categories` |
| Banner’lar | `BannersPage.jsx` | Doğrudan `fetch(MEDUSA_BACKEND_URL + '/admin-hub/v1/banners')` |
| Koleksiyonlar | `DashboardHome.jsx`, client içi `getCollections()` | `/admin-hub/v1/categories?active=true` (has_collection=true filtreli) |

**InventoryPage.jsx hatası:** Sayfa `getMedusaAdminClient()` çağırıyor; client `medusa-admin-client.js` içinde export ediliyor. Hata genelde şunlardan biri olur: (1) `@/lib/medusa-admin-client` path’i çözülemiyor, (2) client oluşturulurken `NEXT_PUBLIC_MEDUSA_BACKEND_URL` yok/yanlış. `.env.local` içinde `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000` olduğundan emin ol; import `import { getMedusaAdminClient } from '@/lib/medusa-admin-client'` şeklinde olmalı.

---

## 4. Shop: Hangi dosya ne kullanıyor?

| Amaç | Kullanılan dosya / client | Çağrılan API’ler (özet) |
|------|---------------------------|--------------------------|
| **Client (tek yer)** | `src/lib/medusa-client.js` | Base URL: `NEXT_PUBLIC_MEDUSA_BACKEND_URL`. Tüm shop istekleri bu client veya aynı base URL ile fetch. |
| **Client’i kim kullanıyor?** | | |
| Kategori ağacı (Navbar) | `Navbar.jsx` | `fetch(MEDUSA_BACKEND_URL + '/store/categories?tree=true&is_visible=true')` |
| Ürün listesi / detay | `useMedusa.js`, `ProductTemplate.jsx`, `CategoryTemplate.jsx` | `getMedusaClient().getProducts()`, `getProduct()` → `/store/products`, `/store/products/:id` |
| Koleksiyon sayfası | `app/collections/[slug]/page.jsx` | `fetch(MEDUSA_BACKEND_URL + '/store/products?collection_id=' + slug)` |
| Sepet / Auth | `medusa-client.js` (createCart, addToCart, loginCustomer, getCustomer) | `/store/carts`, `/store/auth/token`, `/store/customers/me` (Medusa core) |
| Kategoriler (client metodu) | `medusa-client.js` → `getCategories()` | `GET /store/categories` (bizim yazdığımız route) |

---

## 5. Ortam değişkenleri (iletişim için gerekli)

| Uygulama | Değişken | Örnek | Açıklama |
|----------|----------|--------|----------|
| Shop | `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | `http://localhost:9000` | Backend’e istek adresi |
| Sellercentral | `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | `http://localhost:9000` | Backend’e istek adresi |
| Medusa Backend | `STORE_CORS` | `http://localhost:3000` | Shop origin’e izin |
| Medusa Backend | `ADMIN_CORS` | `http://localhost:3002` | Sellercentral origin’e izin |

---

## 6. Kısa özet

- **API’lerin yazıldığı yer:** Sadece **`apps/medusa-backend/api/`** (ve Medusa core’un kendi route’ları).
- **Shop:** `apps/shop/src/lib/medusa-client.js` + bazı sayfalarda doğrudan `fetch(…/store/…)`; hedef **/store/*** ve Medusa core store API.
- **Sellercentral:** `apps/sellercentral/src/lib/medusa-admin-client.js`; hedef **/admin/*** ve **/admin-hub/v1/***.
- **Üç uygulama:** Shop ve Sellercentral yalnızca Medusa Backend ile konuşur; birbirleriyle doğrudan API iletişimi yok.
