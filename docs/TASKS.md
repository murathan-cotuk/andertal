# 📋 YAPILACAKLAR LİSTESİ - FOKUS MODU

**Son Güncelleme:** 2026-02-04  
**Mod:** 🎯 Bitirme Modu - Tek Hedef: Admin Hub → SellerCentral → Shop Veri Akışı

---

## 🎯 TEK HEDEF (Duvara Yaz)

**Admin Hub'dan kategori ekleyeyim → SellerCentral ürün eklerken onu seçebileyim → Shop'ta o kategoriye göre ürün göreyim**

Bunu başarmadan auth, banner, rate limit, CLI, deploy konuşmak YASAK.

---

## 🔧 Backend Konfigürasyon Notları

### CORS Ayarları

**ÖNEMLİ:** `admin_cors` backend URL'i DEĞİL, frontend origin'leri olmalı!

**Production (Render Environment Variables):**
```
ADMIN_CORS=https://belucha-admin.vercel.app,https://belucha-sellercentral.vercel.app
STORE_CORS=https://belucha-shop.vercel.app
```

**Development (.env.local):**
```
ADMIN_CORS=http://localhost:7001,http://localhost:3002
STORE_CORS=http://localhost:3000
```

**Yanlış:**
```
ADMIN_CORS=https://belucha-medusa-backend.onrender.com/admin  ❌
```

**Doğru:**
```
ADMIN_CORS=https://belucha-admin.vercel.app,https://belucha-sellercentral.vercel.app  ✅
```

---

## 🔧 Migration Sorunları ve Çözümler

### Medusa CLI Migration Çalışmıyorsa

**Sorun:** `npx medusa migrations run` hata veriyor (ör. `ERR_INVALID_ARG_TYPE`, `Cannot find module 'ajv/dist/core'`)

**Çözüm 1: Script ile (TypeORM)**
```bash
cd apps/medusa-backend
npm run run-migrations
```

**Çözüm 2: SQL ile (PostgreSQL)**
```sql
ALTER TABLE admin_hub_categories
ADD COLUMN IF NOT EXISTS is_visible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS has_collection boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
```

**Not:** Medusa v2 bazen kendi ORM'ini kullandığı için TypeORM migration script'i uyumlu olmayabilir. O durumda SQL ile manuel ekleme yapın.

---

## 🚩 FAZ 1 — "SİSTEM ÇALIŞIYOR MU?" (BUGÜN BİTECEK)

### 1️⃣ Backend Başlatma Sorunu Çöz

**Sorun:** `loadMedusaApp is not a function`

**Yapılacak:**
1. Medusa v2 paketini kontrol et
2. Doğru import yolunu bul
3. Backend'i başlat

**Test:**
```bash
cd apps/medusa-backend
node server.js
```

**Beklenen:** Backend başlamalı, hata olmamalı

---

### 2️⃣ Migration Kontrolü (Basit Yöntem)

**Yapılacak:**
1. Backend başladıktan sonra PostgreSQL'e bağlan
2. Şu SQL komutunu çalıştır:
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name LIKE 'admin_hub%';
   ```

**Veya Render Dashboard'dan:**
1. Render Dashboard → PostgreSQL Database → Connect → psql
2. Şu komutu çalıştır:
   ```sql
   \dt admin_hub*
   ```

**Beklenen:**
- `admin_hub_categories` tablosu görünmeli
- `admin_hub_banners` tablosu görünmeli

**Eğer tablolar YOKSA:**
- Migration'lar otomatik çalışmamış
- Manuel migration çalıştır veya synchronize kullan

---

### 3️⃣ Admin Hub API Test

**Yapılacak:**
1. Backend çalışıyor olmalı (`node server.js`)
2. PowerShell'de şu komutu çalıştır:
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:9000/admin-hub/categories" -Method POST -ContentType "application/json" -Body '{"name":"Test Category","slug":"test-category"}' -UseBasicParsing
   ```

**Sonra PostgreSQL'de kontrol et:**
```sql
SELECT * FROM admin_hub_categories WHERE slug = 'test-category';
```

**Beklenen:**
- API 201 dönmeli
- DB'de kayıt görünmeli

---

## 🚩 FAZ 2 — "KATEGORİ ÜRÜNE BAĞLI MI?" (EN KRİTİK NOKTA)

### 4️⃣ SellerCentral Test

**Yapılacak:**
1. SellerCentral'ı başlat: `cd apps/sellercentral && npm run dev`
2. `http://localhost:3002/products/single-upload` aç
3. Admin Hub kategorileri görünüyor mu kontrol et
4. Kategori seçip ürün ekle
5. Ürün metadata'sını kontrol et (metadata.admin_category_id var mı?)

---

### 5️⃣ Store/Products Category Filtresi Test

**Yapılacak:**
```powershell
# Kategoriye göre filtrele
Invoke-WebRequest -Uri "http://localhost:9000/store/products?category=test-category" -UseBasicParsing
```

**Beklenen:**
- Ürünler kategoriye göre filtrelenmiş olmalı

---

## 🚩 FAZ 3 — SHOP GERÇEKTEN GÖRÜYOR MU?

### 6️⃣ Shop App Category Filtresi

**Yapılacak:**
1. Shop app'i başlat: `cd apps/shop && npm run dev`
2. Kategori filtresi ekle
3. `GET /store/products?category=slug` endpoint'ini kullan
4. Ürünleri kategoriye göre göster

---

## ✅ YAPILANLAR

1. ✅ Admin Hub backend entity'leri (Category, Banner)
2. ✅ AdminHubService (CRUD)
3. ✅ Admin Hub API endpoint'leri (`/admin-hub/*`)
4. ✅ Migration dosyaları
5. ✅ Store/products category filtresi
6. ✅ SellerCentral Admin Hub entegrasyonu
7. ✅ Product metadata.admin_category_id desteği
8. ✅ Test script'leri
9. ✅ Admin Hub frontend text input eklendi
10. ✅ PostgreSQL SSL desteği eklendi

---

## 📝 KATEGORİ EKLEME YÖNTEMLERİ

### Yöntem 1: Admin Hub Frontend (Text Input) ✅ YENİ
1. `http://localhost:7001` aç
2. Categories sekmesine git
3. "Add Single Category" formunu doldur:
   - Name: Electronics
   - Slug: electronics
   - Description: (opsiyonel)
4. "Add Category" butonuna tıkla

### Yöntem 2: Admin Hub Frontend (JSON Bulk)
1. `http://localhost:7001` aç
2. Categories sekmesine git
3. "Bulk Add Categories (JSON)" formuna JSON yapıştır
4. "Add Categories (Bulk)" butonuna tıkla

### Yöntem 3: Script (Kod Sayfası)
**Dosya:** `apps/medusa-backend/scripts/add-categories.js`

**Yapılacak:**
1. Dosyayı aç: `apps/medusa-backend/scripts/add-categories.js`
2. `CATEGORIES` array'ine kategorilerini ekle (satır 22-46):
   ```javascript
   const CATEGORIES = [
     {
       name: "Electronics",
       slug: "electronics",
       description: "Electronic products",
     },
     {
       name: "Clothing",
       slug: "clothing",
       description: "Clothing and apparel",
     },
     // Daha fazla kategori ekle...
   ]
   ```
3. Script'i çalıştır:
   ```bash
   cd apps/medusa-backend
   node scripts/add-categories.js
   ```

### Yöntem 4: API (curl/PowerShell)
```powershell
Invoke-WebRequest -Uri "http://localhost:9000/admin-hub/categories" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"name":"Electronics","slug":"electronics","description":"Electronic products"}' `
  -UseBasicParsing
```

---

## ⏳ YAPILACAKLAR (SADECE BUNLAR)

1. **Backend başlatma sorunu çöz** (loadMedusaApp hatası)
2. **Migration kontrolü** (PostgreSQL'de tablolar var mı?)
3. **Admin Hub API test** (POST /admin-hub/categories çalışıyor mu?)
4. **SellerCentral test** (Kategoriler görünüyor mu? Ürün ekleniyor mu?)
5. **Store/products category test** (Filtreleme çalışıyor mu?)
6. **Shop app category entegrasyonu** (FAZ 3)

---

## ⛔ ŞİMDİLİK DOKUNMAYACAĞIMIZ ŞEYLER

Bunları bilerek erteliyoruz:

- ❌ JWT / Auth
- ❌ Banner
- ❌ Rate limit
- ❌ Medusa CLI fix
- ❌ Production deploy
- ❌ Admin Hub login UI

Bunlar çalışan bir ürünün lüksleri.

---

## 🧪 TEST SENARYOSU

### Senaryo 1: Backend Başlatma
```bash
cd apps/medusa-backend
node server.js
```

**Beklenen:**
- ✅ Backend başlamalı
- ✅ Hata olmamalı

### Senaryo 2: Migration Kontrolü
PostgreSQL'de:
```sql
\dt admin_hub*
```

**Beklenen:**
- ✅ admin_hub_categories tablosu var
- ✅ admin_hub_banners tablosu var

### Senaryo 3: Admin Hub API
```powershell
Invoke-WebRequest -Uri "http://localhost:9000/admin-hub/categories" -Method POST -ContentType "application/json" -Body '{"name":"Test","slug":"test"}' -UseBasicParsing
```

**Beklenen:**
- ✅ Kategori oluşturuldu
- ✅ DB'de kayıt var

### Senaryo 4: End-to-End
1. Admin Hub'dan kategori ekle (Text Input veya JSON)
2. SellerCentral'da ürün ekle (kategori seç)
3. Shop'ta kategoriye göre filtrele: `GET /store/products?category=slug`

**Beklenen:**
- ✅ Ürün metadata'sında `admin_category_id` var
- ✅ Shop'ta kategoriye göre ürünler görünüyor

---

## 📊 DURUM RAPORU (Her Test Sonrası Güncelle)

### Backend Durumu
- [ ] Backend başladı mı? (loadMedusaApp hatası çözüldü mü?)
- [ ] admin_hub_categories tablosu var mı?
- [ ] admin_hub_banners tablosu var mı?

### API Durumu
- [ ] POST /admin-hub/categories çalışıyor mu?
- [ ] DB'ye yazıyor mu?

### Entegrasyon Durumu
- [ ] SellerCentral Admin Hub kategorilerini görüyor mu?
- [ ] Product create'de metadata.admin_category_id ekleniyor mu?
- [ ] Store/products?category=slug çalışıyor mu?
- [ ] Shop app kategoriye göre ürün gösteriyor mu?

---

**Sonraki Adım:** Backend başlatma sorununu çöz (loadMedusaApp hatası)
