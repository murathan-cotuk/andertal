# Payload CMS Next.js Migration - Detaylı Rapor

**Tarih:** 2026-01-19  
**Migration:** Standalone Express Server → Next.js Plugin Integration  
**Durum:** 🔄 Medusa + Payload Hibrit Sistem Kurulumu Başladı

---

## 🎯 YENİ YÖN: Medusa + Payload Hibrit Sistem (2026-01-19)

### 📋 Karar
Payload CMS Next.js entegrasyonu sorunlu. **Medusa (e-commerce) + Payload (marketplace logic)** hibrit sistem kurulacak.

### 🏗️ Mimari

```
┌─────────────────────────────────────────────────────┐
│                    MEDUSA                            │
│  (E-Commerce Core - %100 Çalışıyor)                 │
│  ✅ Products (base data)                            │
│  ✅ Cart & Checkout                                 │
│  ✅ Orders                                          │
│  ✅ Payment (Stripe)                                │
│  ✅ Customers (base auth)                           │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│                   PAYLOAD CMS                        │
│  (Marketplace Logic & Content)                      │
│  ✅ Seller Profiles (custom)                        │
│  ✅ Seller Onboarding                               │
│  ✅ Role-based permissions                          │
│  ✅ Commission tracking                             │
│  ✅ Product metadata (extended)                     │
└─────────────────────────────────────────────────────┘
```

### ✅ Yapılan İşlemler (Aşama 2: Payload Standalone)

1. **Payload Config Basitleştirildi**
   - Dosya: `apps/cms/payload/src/payload.config.js`
   - Sadece `sellers` collection kaldı
   - Diğer collection'lar kaldırıldı (Products, Categories, vb.)

2. **Basit Server Oluşturuldu**
   - Dosya: `apps/cms/payload/src/server-simple.js`
   - Debug log'ları kaldırıldı
   - CORS eklendi (Medusa port'ları dahil)

3. **Package.json Güncellendi**
   - `cors` paketi eklendi
   - `dev` script `server-simple.js` kullanıyor

### ✅ Tamamlanan İşlemler

#### Aşama 2: Payload Standalone (TAMAMLANDI)
- [x] Config basitleştirildi (sadece sellers collection)
- [x] Server basitleştirildi (server-simple.js)
- [x] CORS paketi eklendi
- [x] Environment variable loading düzeltildi
- [x] Clean install yapıldı
- [x] Server başlatıldı (port 3001)
- [x] Health endpoint test edildi (200 OK)
- [x] Admin panel test edildi

**Dosyalar:**
- `apps/cms/payload/src/server-simple.js` - Basit Express server
- `apps/cms/payload/src/payload.config.js` - Basitleştirilmiş config (sadece sellers)
- `apps/cms/payload/src/payload.config-old.js` - Eski config (backup)

**Durum:**
- ✅ Payload CMS standalone mode'da çalışıyor
- ✅ Health: http://localhost:3001/health (200 OK)
- ✅ Admin: http://localhost:3001/admin (Redirect - normal)

### ⏳ Yapılacaklar

#### Aşama 1: Medusa (KURULMALI - PostgreSQL Hatası)
- [ ] Medusa backend kurulumu (create-medusa-app)
- [x] İlk deneme yapıldı (PostgreSQL hatası alındı)
- [ ] SQLite ile tekrar denenecek
- [ ] Backend başlatıldı (port 9000)
- [ ] Admin panel açıldı (port 7001)
- [ ] Test admin user oluşturuldu
- [ ] Test product eklendi

**Medusa Kurulum Komutu:**
```bash
cd C:\Users\Lenovo\Desktop\Ortam\Yazilim\belucha
npx create-medusa-app@latest medusa-backend
```

**Sorulara Cevap:**
- Project name: `medusa-backend`
- **Database: `SQLite` ⚠️ ÖNEMLİ: PostgreSQL değil!** (PostgreSQL kurulu değil)
- Admin: `Yes`
- Storefront: `Yes` (Next.js Starter Storefront)

**⚠️ PostgreSQL Hatası:**
- İlk denemede PostgreSQL seçildi
- "Couldn't connect to PostgreSQL" hatası alındı
- **Çözüm:** SQLite seçilmeli

**Beklenen:**
- Backend: http://localhost:9000
- Admin: http://localhost:7001
- Storefront: http://localhost:8000

#### Aşama 3: Entegrasyon
- [ ] Medusa shop başlatma
- [ ] Product sync hazırlığı
- [ ] Webhook setup

---

# Payload CMS Next.js Migration - Detaylı Rapor

**Tarih:** 2026-01-19  
**Migration:** Standalone Express Server → Next.js Plugin Integration  
**Durum:** ✅ Manuel Route Implementation Tamamlandı, ⚠️ Test Edilmeli

---

## 🎯 SON HAMLE - Manuel Route Implementation (2026-01-19)

### 📋 Durum
`withPayload` wrapper'ı çalışmadı. Payload CMS'in dokümantasyonunda bile sorunlar var.  
**Çözüm:** Manuel route'lar oluşturuldu. `withPayload` wrapper'ı kaldırıldı.

---

### ✅ Yapılan İşlemler

#### 1. withPayload Wrapper KALDIRILDI
- **Dosya:** `apps/shop/next.config.js`
- **Değişiklik:** `withPayload` wrapper'ı kaldırıldı
- **Sonuç:** Sadece Sentry wrapper kaldı
- **Kod:**
  ```javascript
  // ÖNCE:
  const { withPayload } = require("@payloadcms/next/withPayload");
  const payloadConfig = withPayload(nextConfig);
  module.exports = withSentryConfig(payloadConfig, { ... });
  
  // SONRA:
  // withPayload KALDIRILDI
  module.exports = withSentryConfig(nextConfig, { ... });
  ```

#### 2. Manuel Admin Route Oluşturuldu
- **Dosya:** `apps/shop/src/app/(payload)/admin/[[...segments]]/page.tsx`
- **İçerik:**
  ```typescript
  import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
  import { importMap } from '../../importMap'
  import config from '@payload-config'
  
  type Args = {
    params: { segments: string[] }
    searchParams: { [key: string]: string | string[] }
  }
  
  export const generateMetadata = ({ params, searchParams }: Args) =>
    generatePageMetadata({ config, params, searchParams })
  
  const Page = ({ params, searchParams }: Args) =>
    RootPage({ config, params, searchParams, importMap })
  
  export default Page
  ```
- **Sonuç:** ✅ Admin route manuel olarak oluşturuldu

#### 3. Import Map Oluşturuldu
- **Dosya:** `apps/shop/src/app/(payload)/importMap.js`
- **İçerik:**
  ```javascript
  export const importMap = {}
  ```
- **Açıklama:** Boş object, Payload internal olarak doldurur
- **Sonuç:** ✅ Import map eklendi

#### 4. Manuel GraphQL Route Oluşturuldu
- **Dosya:** `apps/shop/src/app/api/graphql/route.ts`
- **İçerik:**
  ```typescript
  import { getPayloadHMR } from '@payloadcms/next/utilities'
  import config from '@payload-config'
  
  export const POST = async (req: Request) => {
    const payload = await getPayloadHMR({ config })
    return payload.handleGraphQL(req)
  }
  
  export const GET = async (req: Request) => {
    const payload = await getPayloadHMR({ config })
    return payload.handleGraphQL(req)
  }
  ```
- **Sonuç:** ✅ GraphQL route manuel olarak oluşturuldu

#### 5. Path Aliases Güncellendi
- **Dosya:** `apps/shop/tsconfig.json`
- **Eklenen:**
  ```json
  {
    "compilerOptions": {
      "paths": {
        "@/*": ["./src/*"],
        "@/payload.config": ["./src/payload.config.ts"],
        "@payload-config": ["./src/payload.config.ts"]
      }
    }
  }
  ```
- **Dosya:** `apps/shop/next.config.js`
- **Webpack Alias Eklendi:**
  ```javascript
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src'),
      '@payload-config': path.resolve(__dirname, './src/payload.config.ts'),
    };
    return config;
  }
  ```
- **Sonuç:** ✅ Path aliases güncellendi

#### 6. Cache Temizlendi
- **Komut:** `.next` klasörü silindi
- **Sonuç:** ✅ Cache temizlendi

---

### 📁 Oluşturulan Dosyalar

```
apps/shop/src/app/
├── (payload)/
│   ├── admin/
│   │   └── [[...segments]]/
│   │       └── page.tsx          ✅ YENİ (Manuel Admin Route)
│   └── importMap.js              ✅ YENİ (Import Map)
└── api/
    └── graphql/
        └── route.ts              ✅ YENİ (Manuel GraphQL Route)
```

---

### 🔧 Değiştirilen Dosyalar

1. **`apps/shop/next.config.js`**
   - ❌ `withPayload` wrapper kaldırıldı
   - ✅ Webpack alias eklendi: `@payload-config`
   - ✅ Sentry org/project güncellendi: `murathan-cotuk` / `belucha-shop`

2. **`apps/shop/tsconfig.json`**
   - ✅ `@payload-config` path alias eklendi

---

### ⏳ Test Edilmeli

#### 1. Server Başlat
```bash
cd apps/shop
npm run dev
```

#### 2. Admin Panel Test
- **URL:** http://localhost:3000/admin
- **Beklenen:** Admin login sayfası açılmalı
- **Durum:** ⏳ Test edilmeli

#### 3. GraphQL Test
```bash
curl -X POST http://localhost:3000/api/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```
- **Beklenen:** GraphQL response gelmeli
- **Durum:** ⏳ Test edilmeli

---

### 📊 Beklenen Sonuç

#### ✅ Başarı Senaryosu
1. ✅ Server başlar (http://localhost:3000)
2. ✅ Admin panel açılır (http://localhost:3000/admin)
3. ✅ GraphQL API çalışır (http://localhost:3000/api/graphql)
4. ✅ Route registration sorunu çözülür (Manuel route'lar ile)

#### ⚠️ Olası Sorunlar
1. ⚠️ `getPayloadHMR` fonksiyonu bulunamayabilir
2. ⚠️ `payload.handleGraphQL` method'u olmayabilir
3. ⚠️ `RootPage` component'i import edilemeyebilir
4. ⚠️ `importMap` yapısı yanlış olabilir

---

### 🔍 Debug İpuçları

#### Admin Panel Açılmıyorsa
1. Console'da hata var mı kontrol et
2. `RootPage` import'u çalışıyor mu kontrol et
3. `importMap` doğru mu kontrol et
4. `@payload-config` path alias çalışıyor mu kontrol et

#### GraphQL Endpoint Çalışmıyorsa
1. `getPayloadHMR` fonksiyonu var mı kontrol et
2. `payload.handleGraphQL` method'u var mı kontrol et
3. Request body doğru mu kontrol et
4. Network tab'da request'leri kontrol et

---

### ✅ Checklist

- [x] withPayload wrapper kaldırıldı
- [x] Manuel admin route oluşturuldu
- [x] Import map oluşturuldu
- [x] Manuel GraphQL route oluşturuldu
- [x] tsconfig.json güncellendi (@payload-config path)
- [x] next.config.js güncellendi (withPayload kaldırıldı, webpack alias eklendi)
- [x] Cache temizlendi (.next silindi)
- [ ] Server başlatıldı
- [ ] Admin panel test edildi
- [ ] GraphQL endpoint test edildi
- [x] Rapor yazıldı

---

### 🎯 Sonuç

**Manuel route implementation tamamlandı.**

**Durum:**
- ✅ withPayload wrapper kaldırıldı
- ✅ Manuel admin route oluşturuldu
- ✅ Manuel GraphQL route oluşturuldu
- ✅ Path aliases güncellendi
- ✅ Cache temizlendi
- ⏳ Test edilmeli

**Sonraki Adım:**
- Server'ı başlat
- Admin panel'i test et (http://localhost:3000/admin)
- GraphQL endpoint'i test et (http://localhost:3000/api/graphql)
- Sonuçları raporla

---

**Rapor Hazırlayan:** Cursor AI  
**Son Güncelleme:** 2026-01-19  
**Versiyon:** 2.0 (Manuel Route Implementation)
