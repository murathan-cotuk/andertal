# 🧪 Region + Product Entegrasyon Test Senaryosu

**Amaç:** Sellercentral → Medusa → PostgreSQL → Shop App veri akışını doğrulamak

**Gereksinimler:**
- Medusa backend çalışıyor (`medusa develop`)
- Migration'lar çalıştırılmış (`medusa migrations run`)
- PostgreSQL/SQLite bağlantısı aktif

---

## 📋 Test Senaryosu

### 1️⃣ Region Oluşturma

**Endpoint:** `POST /admin/regions`

**Request:**
```bash
curl -X POST http://localhost:9000/admin/regions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Germany",
    "code": "DE",
    "currency_code": "EUR"
  }'
```

**Beklenen Response:**
```json
{
  "region": {
    "id": "uuid",
    "name": "Germany",
    "code": "DE",
    "currency_code": "EUR",
    "created_at": "2026-02-04T...",
    "updated_at": "2026-02-04T..."
  }
}
```

**Kontrol:**
- ✅ Status: 201
- ✅ Region ID dönüyor
- ✅ Code unique (tekrar aynı code ile oluşturulmamalı)

---

### 2️⃣ Region Listeleme

**Endpoint:** `GET /admin/regions`

**Request:**
```bash
curl http://localhost:9000/admin/regions
```

**Beklenen Response:**
```json
{
  "regions": [
    {
      "id": "uuid",
      "name": "Germany",
      "code": "DE",
      "currency_code": "EUR"
    }
  ],
  "count": 1
}
```

**Kontrol:**
- ✅ Status: 200
- ✅ Oluşturulan region listede görünüyor

---

### 3️⃣ Product Oluşturma (Medusa Core)

**Endpoint:** `POST /admin/products`

**Request:**
```bash
curl -X POST http://localhost:9000/admin/products \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Product",
    "description": "Test product description",
    "handle": "test-product",
    "is_giftcard": false,
    "status": "published",
    "images": [],
    "options": [],
    "variants": [
      {
        "title": "Default Variant",
        "sku": "TEST-SKU-001",
        "prices": [
          {
            "amount": 1000,
            "currency_code": "EUR"
          }
        ],
        "inventory_quantity": 10
      }
    ]
  }'
```

**Beklenen Response:**
```json
{
  "product": {
    "id": "prod_...",
    "title": "Test Product",
    "handle": "test-product",
    "status": "published",
    "variants": [...]
  }
}
```

**Kontrol:**
- ✅ Status: 200/201
- ✅ Product ID dönüyor
- ✅ Product Medusa'nın products tablosuna yazıldı

**Not:** Product ID'yi kaydet (sonraki adımda kullanılacak)

---

### 4️⃣ Product'ı Region'a Bağlama

**Endpoint:** `POST /admin/regions/:regionId/products`

**Request:**
```bash
# Region ID'yi 1. adımdan al
# Product ID'yi 3. adımdan al

curl -X POST http://localhost:9000/admin/regions/{REGION_ID}/products \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "PRODUCT_ID"
  }'
```

**Beklenen Response:**
```json
{
  "relation": {
    "id": "uuid",
    "product_id": "prod_...",
    "region_id": "uuid",
    "created_at": "2026-02-04T..."
  }
}
```

**Kontrol:**
- ✅ Status: 201
- ✅ product_regions tablosuna kayıt eklendi
- ✅ Aynı product + region tekrar eklenememeli (unique constraint)

---

### 5️⃣ Store Products (Region Filtreleme)

**Endpoint:** `GET /store/products?region=DE`

**Request:**
```bash
curl "http://localhost:9000/store/products?region=DE"
```

**Beklenen Response:**
```json
{
  "products": [
    {
      "id": "prod_...",
      "title": "Test Product",
      "handle": "test-product",
      "status": "published",
      "variants": [...]
    }
  ],
  "count": 1,
  "region": "DE"
}
```

**Kontrol:**
- ✅ Status: 200
- ✅ Sadece DE region'ına bağlı product görünüyor
- ✅ Product detayları Medusa ProductService'ten geliyor

---

### 6️⃣ Store Products (Region Olmadan)

**Endpoint:** `GET /store/products`

**Request:**
```bash
curl "http://localhost:9000/store/products"
```

**Beklenen Response:**
```json
{
  "products": [
    {
      "id": "prod_...",
      "title": "Test Product",
      ...
    }
  ],
  "count": 1
}
```

**Kontrol:**
- ✅ Status: 200
- ✅ Tüm ürünler görünüyor (region filtresi yok)

---

### 7️⃣ Farklı Region Testi

**Adımlar:**
1. Yeni region oluştur: `FR` (France)
2. Yeni product oluştur
3. Product'ı `FR` region'ına bağla
4. `GET /store/products?region=DE` → Sadece DE'deki product görünmeli
5. `GET /store/products?region=FR` → Sadece FR'deki product görünmeli
6. `GET /store/products` → Her iki product görünmeli

---

## 🔍 Veritabanı Kontrolleri

### PostgreSQL/SQLite Kontrolü

**Regions Tablosu:**
```sql
SELECT * FROM regions;
```

**Product Regions Tablosu:**
```sql
SELECT pr.*, r.code as region_code, r.name as region_name
FROM product_regions pr
INNER JOIN regions r ON pr.region_id = r.id;
```

**Products Tablosu (Medusa):**
```sql
SELECT id, title, handle, status FROM product;
```

---

## ✅ Başarı Kriterleri

1. ✅ Region oluşturulabiliyor
2. ✅ Product Medusa core üzerinden oluşturulabiliyor
3. ✅ Product-Region ilişkisi kurulabiliyor
4. ✅ Store endpoint region'a göre filtreliyor
5. ✅ Veriler PostgreSQL'de kalıcı
6. ✅ Server restart'ta veriler korunuyor
7. ✅ Shop app region parametresi ile doğru ürünleri görüyor

---

## 🐛 Hata Senaryoları

### Region Code Unique Kontrolü
```bash
# Aynı code ile iki region oluşturulmamalı
curl -X POST http://localhost:9000/admin/regions \
  -H "Content-Type: application/json" \
  -d '{"name": "Germany 2", "code": "DE", "currency_code": "EUR"}'

# Beklenen: 400/500 error - "Region with code DE already exists"
```

### Product-Region Unique Kontrolü
```bash
# Aynı product + region ikinci kez eklenememeli
curl -X POST http://localhost:9000/admin/regions/{REGION_ID}/products \
  -H "Content-Type: application/json" \
  -d '{"product_id": "EXISTING_PRODUCT_ID"}'

# Beklenen: Mevcut relation dönmeli veya hata
```

### Region Olmayan Product
```bash
# Region'a bağlı olmayan product, region filtresinde görünmemeli
GET /store/products?region=DE
# Beklenen: Sadece DE'ye bağlı product'lar
```

---

## 📝 Test Notları

- **Medusa ProductService:** Tüm product işlemleri Medusa core üzerinden
- **RegionService:** Custom service, container'da register edilmiş
- **Veri Kalıcılığı:** PostgreSQL'de saklanıyor, restart'ta korunuyor
- **API Contract:** Medusa v2 native format

---

**Sonraki Adım:** Shop app'te region parametresi ile test et
