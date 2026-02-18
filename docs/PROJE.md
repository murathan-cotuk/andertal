# BELUCHA – Proje

## Render (Medusa backend)

Repo'da `workspaces` kullanıldığı için Node modülleri **repo root** (`/opt/render/project/src/node_modules`) üzerinden yüklenir. Root Directory = `apps/medusa-backend` olsa bile bu böyledir. Bu yüzden patch'in **repo root**'taki `node_modules` üzerinde, **build sırasında** uygulanması gerekir.

**Render ayarları (mevcut deploy’un çalışıyorsa değiştirme):** Root Directory boş, Build Command: `npm install && node apps/medusa-backend/scripts/patch-link-modules.js`, Start Command: `node apps/medusa-backend/server.js`. Environment: `DATABASE_URL`, `CORS_ORIGINS`. Render’dan yana sorun yoksa bu ayarları değiştirmene gerek yok.

**Kategori / Admin Hub:** Loader JS’e taşındı (Render’da .ts require sorunu önlenir); route’lar her zaman kayıtlı. Hâlâ 503 alıyorsan `admin_hub_categories` tablosu yoktur: `node apps/medusa-backend/scripts/run-migrations.js` (DATABASE_URL Render’daki PostgreSQL ile) bir kez çalıştır.

**Eski ayar (Root = apps/medusa-backend)** bu monorepo’da MODULE_NOT_FOUND verebilir; çünkü yükleme root’taki node_modules üzerinden olur ve orası build sırasında patch’lenmiyor.

## Mimari karar – Kategori sayfaları ve CMS

Kategori sayfaları hem ürün listesi hem içerik sayfası (landing) olacak; ayrı bir CMS (Payload vb.) şu an eklenmedi. **Seçenek 1** uygulandı: **Admin Hub kategorileri genişletildi** – SEO (seo_title, seo_description), banner (banner_image_url) ve uzun içerik (long_content) alanları eklendi. Kategori verisi ve bu içerik alanları sadece Admin Hub üzerinden yönetiliyor. Siteyi kullanmaya başlamadan önce Payload (veya başka headless CMS) değerlendirilecek.

**Yetkilendirme:** Admin Hub (`/admin-hub/*` – kategoriler, bannerlar, navbar/landing/SEO içeriği) **sadece Super Admin (platform sahibi)** tarafından yönetilir. Seller’lar kategori oluşturamaz; navbar, landing, SEO ve banner içeriğine erişemez. Seller Central’da seller’lar sadece ürün ve sipariş sayfalarını kullanır. İleride auth eklendiğinde Admin Hub route’ları super-admin rolüne kısıtlanacak.

## Medusa veri modeli ve API

- **Region:** Bölge (kargo, fiyat); backend'de custom RegionService ile product–region eşlemesi. Store: `/store/products?region=DE`.
- **Product / Variant / Inventory / Price list:** Medusa core; ürün listesi ve detay store/admin API üzerinden.
- **Sales Channel:** Medusa core; storefront hangi kanalda yayında ise ona göre filtre.
- **Admin Hub (Categories, Banners):** Platform sahibi (Super Admin) yönetimi; store'da `/store/categories` (tree, slug). Kategoride seo_title, seo_description, long_content, banner_image_url alanları var. Admin'de `/admin-hub/v1/categories`, `/admin-hub/v1/banners`.

**Kategori akışı (kodda nasıl sağlanıyor)**  
- **Depolama:** Kategoriler Render PostgreSQL’de **`admin_hub_categories`** tablosunda (DB: medusa_seoj).  
- **Kategori ID:** Sen ayarlamazsın. PostgreSQL her INSERT’te **UUID** üretir (`uuid_generate_v4()`). Model: `apps/medusa-backend/models/admin-hub-category.ts` (`@PrimaryGeneratedColumn("uuid")`).  
- **Oluşturma:** Seller Central **Content → Categories** sayfasında “Add category” → `createAdminHubCategory()` → POST `/admin-hub/v1/categories` → backend `adminHubService.createCategory()` → TypeORM `save()` → INSERT; ID DB’de atanır.  
- **Listeleme:** Aynı sayfa ve **/categories** → `getAdminHubCategories()` → GET `/admin-hub/v1/categories?active=true` → `adminHubService.listCategories()` → SELECT → JSON’da `categories` döner.  
- Sonuç: API’de `categories` dönüyorsa akış doğrudur; ID hep veritabanından gelir.

**Kategoriler nerede, hangi API?**  
Kategoriler **Admin Hub** tarafında: veritabanı tablosu `admin_hub_categories`, servis `AdminHubService`. API: `GET /admin-hub/v1/categories` (liste; query: `active`, `tree`, `slug`). Seller Central ürün eklerken bu API ile kategorileri çeker; dropdown’da seçilen kategori ID’si ürünün `metadata.admin_category_id` alanına yazılır. Shop, `GET /store/categories` ile aynı kategorileri kullanır (slug ile sayfa açar). Yani tek kaynak Admin Hub; Seller Central ve Shop aynı backend API’ye bağlı.

**Ürün ekleme ve bağlantılar:**  
Seller Central’dan eklenen ürün `POST /admin/products` ile Medusa’ya gider. Ürün oluşturulurken seçilen Admin Hub kategori ID’si `metadata.admin_category_id` olarak saklanır. Shop’ta ürün listesi `GET /store/products?category=<slug>` ile kategoriye göre filtrelenebilir (backend’de kategori slug ↔ Admin Hub eşlemesi yapılıyor). Yani: kategori ve ürün verisi backend’de; ID’ler API üzerinden birbirine bağlı.

**Kategori landing sayfası ve uygulamalar arası bağ:**  
- **Kategori nerede yazılı:** Sadece **Admin Hub** (Super Admin). Veritabanı: `admin_hub_categories`. API: `GET/POST/PUT/DELETE /admin-hub/v1/categories`. Kategori adı, slug, SEO (seo_title, seo_description), banner (banner_image_url), uzun metin (long_content) hep bu tabloda.  
- **Landing sayfası:** Shop’ta her kategori için bir “landing” sayfası var: **`/category/[slug]`** (CategoryTemplate). Bu sayfa aynı Admin Hub kaydını kullanır: `GET /store/categories?slug=...` ile kategori çekilir; başlık, banner, long_content, ürün listesi (`GET /store/products?category=<slug>`) bu tek kaynaktan gelir. Ayrı bir “kategori landing” uygulaması yok; tek sayfa hem liste hem içerik.  
- **Birbirine ve uygulamalara bağlı mı:** Evet. Tek kaynak Admin Hub. Seller Central’daki kategori dropdown’u `GET /admin-hub/v1/categories` ile aynı listeyi gösterir (isim, id). Shop’taki kategori sayfası ve navbar aynı kategorileri `GET /store/categories` ile kullanır. Yani kategori isimleri ve landing içeriği (SEO, banner, metin) tüm uygulamalarda aynı API/veritabanına bağlı; bir yerde güncellenince her yerde güncel görünür.

**Shop (storefront)** kullandığı endpoint'ler:
- `GET /store/products` — liste (query: `category`, `collection_id`, `region`).
- `GET /store/products/:idOrHandle` — tek ürün (id veya handle).
- `GET /store/categories` — kategori listesi / tree (`?tree=true`, `?slug=...`).

**Seller Central (admin)** kullandığı endpoint'ler:
- `GET /admin/products` — ürün listesi (Inventory/Products sayfası).
- `GET /admin/orders` — sipariş listesi (Orders sayfası); `GET /admin/orders/:id` tek sipariş.
- Admin Hub: `/admin-hub/v1/categories`, `/admin-hub/v1/banners`.

API base URL: `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (env).

## Aşama 1 – Tamamlanan

- **Shop:** Ana sayfa, `category/[slug]`, `collections/[slug]`, `product/[slug]` verisi Medusa store API'den (products, categories, tek ürün). Loading ve hata durumları gösteriliyor.
- **Seller Central:** Ürün listesi (Inventory) ve sipariş listesi (Orders) Medusa admin API'den; liste + sipariş detay linki (`/orders/:id`). Boş veri ve API hata mesajları handle ediliyor.

## Migration çalıştırma

Admin Hub kategori içerik alanları (seo_title, seo_description, long_content, banner_image_url) için migration: `cd apps/medusa-backend && node scripts/run-migrations.js` (veya projede tanımlı migration komutu). Yeni migration: `1696500000005-AddCategoryContentFields.ts`.

## Test ürünü oluşturma ve Shop'ta kontrol

Backend çalışırken test ürünü oluşturmak için: `node apps/medusa-backend/scripts/create-test-product.js`. Render kullanılıyorsa `BASE_URL=https://...` veya `MEDUSA_BACKEND_URL` ile backend URL'i verilebilir. Ayrıntılar için **docs/TEST.md** dosyasına bakın.

## Vercel Environment Variables

Tüm veri Medusa üzerinden kullanıldığı için **Payload CMS** artık kullanılmıyor. Vercel'da `NEXT_PUBLIC_PAYLOAD_ADMIN_URL` ve `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` değişkenleri gerekmez; istersen Vercel proje ayarlarından silebilirsin.
