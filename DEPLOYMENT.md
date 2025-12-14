# 🚀 Belucha Deployment Rehberi

**Bu dosya tüm deployment işlemleri için tek kaynak rehberdir. Sürekli güncellenir.**

---

## 📋 İçindekiler

1. [Vercel Deploy Adım Adım](#vercel-deploy-adım-adım)
2. [Payload CMS Deployment](#payload-cms-deployment-önemli)
3. [Build Sorunları ve Çözümleri](#build-sorunları-ve-çözümleri)
4. [Environment Variables](#environment-variables)
5. [Sorun Giderme](#sorun-giderme)

---

## 🚀 Vercel Deploy Adım Adım

### Ön Hazırlık

- ✅ Kodunuz GitHub'da olmalı
- ✅ Tüm değişiklikler commit edilmiş olmalı
- ✅ Vercel hesabı (ücretsiz)

### Adım 1: Shop App'i Deploy Etme

#### 1.1 Vercel'de Proje Oluşturma

1. [vercel.com](https://vercel.com) → **Sign Up/Log In** (GitHub ile önerilir)
2. Dashboard → **"Add New..."** → **"Project"**
3. GitHub repository'nizi seçin (`belucha`)
4. **"Import"** tıklayın

#### 1.2 Proje Ayarları (ÖNEMLİ!)

**Configure Project** sayfasında:

**Root Directory:**
- **"Override"** tıklayın
- **`apps/shop`** yazın
- ⚠️ Bu ayar çok kritik!

**Build Command:**
```
cd ../.. && npm install && turbo run build --filter=@belucha/shop
```

**Output Directory:**
```
.next
```

**Install Command:**
```
cd ../.. && npm install
```

**Framework Preset:**
- **Next.js** (otomatik algılanmalı)

**Project Name:**
- `belucha-shop` (veya istediğiniz isim)

#### 1.3 Deploy Et

1. **"Deploy"** butonuna tıklayın
2. Build başlayacak (2-5 dakika)
3. Build loglarını izleyin

### Adım 2: Sellercentral App'i Deploy Etme

Aynı işlemi sellercentral için tekrarlayın:

1. **Yeni proje oluşturun** (aynı repository)
2. **Root Directory:** `apps/sellercentral`
3. **Build Command:** `cd ../.. && npm install && turbo run build --filter=@belucha/sellercentral`
4. **Output Directory:** `.next`
5. **Deploy** edin

### Adım 3: Build Loglarını Kontrol Etme

#### Başarı Kriterleri

✅ **Build başarılı:**
- Build loglarında `✓ Build completed` görünmeli
- Hata mesajı olmamalı

✅ **Doğru build command çalışıyor:**
- `turbo run build --filter=@belucha/shop` çalışıyor mu?
- Sadece shop app build ediliyor mu? (CMS build edilmemeli)

✅ **Site erişilebilir:**
- Deployment sayfasında **"Visit"** butonu görünmeli
- Site açılmalı

---

## 🔧 Build Sorunları ve Çözümleri

### Sorun 1: "unexpected argument '--no-deps' found"

**Hata:**
```
ERROR  unexpected argument '--no-deps' found
```

**Çözüm:** ✅ **Düzeltildi!** 
- `--no-deps` flag'i Turbo 2.x'te desteklenmiyor
- Build command'dan kaldırıldı
- `turbo.json` dosyasında shop ve sellercentral için `dependsOn: []` ayarlandı

**Doğru Build Command:**
```
cd ../.. && npm install && turbo run build --filter=@belucha/shop
```

### Sorun 2: "Cannot find module 'tailwindcss'"

**Çözüm:** ✅ **Düzeltildi!**
- `apps/shop/package.json` ve `apps/sellercentral/package.json` dosyalarında
- `tailwindcss`, `postcss`, `autoprefixer` `dependencies` içinde olmalı

### Sorun 3: "Found pipeline field instead of tasks"

**Çözüm:** ✅ **Düzeltildi!**
- `turbo.json` dosyasında `pipeline` yerine `tasks` kullanılmalı

### Sorun 4: "The file .next/routes-manifest.json couldn't be found"

**Çözüm:** ✅ **Düzeltildi!**
- Output directory `.next` olmalı, `apps/shop/.next` değil
- Root directory `apps/shop` olduğu için output directory relative olmalı

### Sorun 5: Build command hala eski format kullanıyor

**Çözüm:**
1. Vercel Dashboard → **Settings** → **Build & Development Settings**
2. Build Command'ı güncelleyin:
   ```
   cd ../.. && npm install && turbo run build --filter=@belucha/shop
   ```
3. Tekrar deploy edin

### Sorun 6: Turbo tüm paketleri build ediyor (CMS dahil)

**Çözüm:** ✅ **Düzeltildi!**
- `turbo.json` dosyasında shop ve sellercentral için `dependsOn: []` ayarlandı
- Böylece bağımlılıklar build edilmez

### Sorun 8: Sellercentral'da "Module not found: Can't resolve '@/components/...'"

**Hata:**
```
Module not found: Can't resolve '@/components/DashboardLayout'
Module not found: Can't resolve '@/components/DashboardHome'
```

**Çözüm:** ✅ **Düzeltildi!**
- Sellercentral'da `jsconfig.json` dosyası eksikti
- `apps/sellercentral/jsconfig.json` dosyası oluşturuldu
- Path alias'ları (`@/*`) yapılandırıldı
- Shop app'teki gibi aynı yapılandırma kullanıldı (`@/*` → `./src/*`)
- `@/components/DashboardLayout` → `./src/components/DashboardLayout` olarak çözülür

### Sorun 7: "Vulnerable version of Next.js detected" (CVE-2025-66478)

**Hata:**
```
Error: Vulnerable version of Next.js detected, please update immediately.
```

**Çözüm:** ✅ **Düzeltildi!**
- Next.js 16.0.3 → 16.0.10'a güncellendi (CVE-2025-66478 ve diğer güvenlik açıkları düzeltildi)
- `package.json` (root), `apps/shop/package.json`, `apps/sellercentral/package.json` dosyalarında
- `eslint-config-next` da 16.0.10'a güncellendi
- Vercel'in `npx fix-react2shell-next --fix` aracı kullanıldı

**Yapılacaklar:**
1. ✅ Next.js güncellendi (16.0.10)
2. Değişiklikleri commit edip push edin:
   ```bash
   git add .
   git commit -m "Fix: Update Next.js to 16.0.10 to fix CVE-2025-66478"
   git push origin dev
   ```
3. Vercel otomatik olarak yeni deploy başlatacak
4. Build başarılı olmalı

---

## 🔐 Environment Variables

### ⚠️ ÖNEMLİ: Vercel'de Nasıl Eklenir?

1. Vercel Dashboard → Projenizi seçin
2. **Settings** → **Environment Variables**
3. Her bir variable için:
   - **Key** ve **Value** girin
   - **Environment** seçin (Production, Preview, Development - hepsini seçin)
   - **Save** tıklayın
4. Değişikliklerden sonra **redeploy** yapın

---

### 📦 Shop App için (Vercel)

**Vercel Dashboard → Shop Projesi → Settings → Environment Variables**

| Key | Value | Açıklama |
|-----|-------|----------|
| `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` | `http://localhost:3001/api/graphql` | CMS GraphQL API URL'i (şimdilik localhost, CMS deploy edildikten sonra güncellenecek) |
| `NEXT_PUBLIC_SELLERCENTRAL_URL` | `https://sellercentral-xxx.vercel.app` | Sellercentral URL'iniz (Vercel'de deploy ettikten sonra aldığınız URL) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Stripe test key (opsiyonel - şimdilik eklemeyebilirsiniz) |

**Örnek:**
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
NEXT_PUBLIC_SELLERCENTRAL_URL=https://belucha-sellercentral.vercel.app
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

**Environment:** Production ✅ | Preview ✅ | Development ✅ (hepsini seçin)

---

### 📦 Sellercentral App için (Vercel)

**Vercel Dashboard → Sellercentral Projesi → Settings → Environment Variables**

| Key | Value | Açıklama |
|-----|-------|----------|
| `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` | `http://localhost:3001/api/graphql` | CMS GraphQL API URL'i (şimdilik localhost, CMS deploy edildikten sonra güncellenecek) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Stripe test key (opsiyonel - şimdilik eklemeyebilirsiniz) |

**Örnek:**
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

**Environment:** Production ✅ | Preview ✅ | Development ✅ (hepsini seçin)

---

### 📝 Adım Adım: Shop App için

1. **Vercel Dashboard** → Shop projenizi açın
2. **Settings** → **Environment Variables**
3. **Add New** tıklayın
4. **Key:** `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL`
5. **Value:** `http://localhost:3001/api/graphql`
6. **Environment:** Production, Preview, Development (hepsini seçin)
7. **Save**
8. **Add New** tekrar tıklayın
9. **Key:** `NEXT_PUBLIC_SELLERCENTRAL_URL`
10. **Value:** Sellercentral URL'iniz (örn: `https://belucha-sellercentral.vercel.app`)
11. **Environment:** Production, Preview, Development (hepsini seçin)
12. **Save**
13. **Deployments** → En son deployment'a gidin → **Redeploy** (veya yeni bir commit push edin)

---

### 📝 Adım Adım: Sellercentral App için

1. **Vercel Dashboard** → Sellercentral projenizi açın
2. **Settings** → **Environment Variables**
3. **Add New** tıklayın
4. **Key:** `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL`
5. **Value:** `http://localhost:3001/api/graphql`
6. **Environment:** Production, Preview, Development (hepsini seçin)
7. **Save**
8. **Deployments** → En son deployment'a gidin → **Redeploy** (veya yeni bir commit push edin)

---

### ⚠️ Önemli Notlar

1. **CMS Henüz Deploy Edilmedi:**
   - Şimdilik `http://localhost:3001/api/graphql` kullanın
   - Bu sadece test için çalışır (local development)
   - Production'da CMS deploy edildikten sonra gerçek URL'i güncelleyin

2. **Sellercentral URL'ini Bulma:**
   - Vercel Dashboard → Sellercentral projesi
   - **Deployments** → En son deployment
   - **Visit** butonunun yanındaki URL'i kopyalayın
   - Örnek: `https://belucha-sellercentral.vercel.app`

3. **Stripe Key (Opsiyonel):**
   - Şimdilik eklemeyebilirsiniz
   - Ödeme sistemi kurulduğunda ekleyeceksiniz
   - [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys) → API Keys → Publishable key

4. **CMS Deploy Edildikten Sonra:**
   - `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` değerini güncelleyin
   - Örnek: `https://belucha-cms.railway.app/api/graphql`
   - Her iki projede de (Shop ve Sellercentral) güncelleyin
   - Redeploy yapın

---

### 🔄 CMS Deploy Edildikten Sonra Güncelleme

**Shop App:**
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
```

**Sellercentral App:**
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
```

**Değişikliklerden sonra redeploy yapın!**

---

## 🐛 Sorun Giderme

### Build başarısız

1. **Build loglarını kontrol edin**
   - Deployment → Build Logs
   - Hata mesajını okuyun

2. **Settings'te build command'ı kontrol edin**
   - Settings → Build & Development Settings
   - Build Command doğru mu?

3. **Root directory doğru mu?**
   - Shop: `apps/shop`
   - Sellercentral: `apps/sellercentral`

### Site açılmıyor

1. **Environment variables'ları kontrol edin**
   - Settings → Environment Variables
   - Tüm değişkenler ekli mi?

2. **Console'da hata var mı?**
   - F12 → Console
   - Hata mesajlarını kontrol edin

3. **Network tab'ında API çağrıları başarılı mı?**
   - F12 → Network
   - GraphQL istekleri başarılı mı?

### "404 Not Found"

1. **Output directory `.next` olmalı**
2. **Root directory doğru mu kontrol edin**

### GraphQL hatası

1. **`NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` doğru mu?**
2. **Payload CMS çalışıyor mu?**
3. **CORS ayarları doğru mu?**

---

## 📝 Vercel Dashboard Ayarları Özeti

### Shop App

| Ayar | Değer |
|------|-------|
| Root Directory | `apps/shop` |
| Build Command | `cd ../.. && npm install && turbo run build --filter=@belucha/shop` |
| Output Directory | `.next` |
| Install Command | `cd ../.. && npm install` |
| Framework Preset | Next.js |

### Sellercentral App

| Ayar | Değer |
|------|-------|
| Root Directory | `apps/sellercentral` |
| Build Command | `cd ../.. && npm install && turbo run build --filter=@belucha/sellercentral` |
| Output Directory | `.next` |
| Install Command | `cd ../.. && npm install` |
| Framework Preset | Next.js |

---

## ✅ Deploy Sonrası Checklist

### Shop App
- [ ] Build başarılı
- [ ] Site erişilebilir
- [ ] Ana sayfa açılıyor
- [ ] Ürünler görünüyor
- [ ] Login/Register sayfaları çalışıyor
- [ ] Environment variables eklendi

### Sellercentral App
- [ ] Build başarılı
- [ ] Site erişilebilir
- [ ] Login sayfası açılıyor
- [ ] Dashboard açılıyor (login sonrası)
- [ ] Environment variables eklendi

---

## 🔄 Otomatik Deploy

Vercel otomatik olarak:
- `main` branch'e push → Production deploy
- Diğer branch'lere push → Preview deploy

**Branch Ayarları:**
- Settings → Git
- Production Branch: `main` (veya `dev`)
- Preview Deployments: Açık

---

## 📚 İlgili Dosyalar

- `turbo.json` - Turborepo config (shop ve sellercentral için `dependsOn: []` ayarlı)
- `apps/shop/vercel.json` - Shop app Vercel config
- `apps/sellercentral/vercel.json` - Sellercentral app Vercel config

---

---

## 🔗 CMS'in Sistemde Nasıl Çalıştığı (ÖNEMLİ!)

### 3 Ayrı Deployment, Tek Sistem

**Sistem Mimarisi:**

```
┌─────────────────┐         ┌─────────────────┐
│   Shop App      │         │  Sellercentral   │
│   (Vercel)      │         │     (Vercel)     │
│                 │         │                  │
│  Next.js App    │         │   Next.js App    │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │  GraphQL API              │  GraphQL API
         │  (HTTP Request)           │  (HTTP Request)
         │                           │
         └───────────┬───────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │    Payload CMS        │
         │    (Railway/Render)   │
         │                       │
         │  Express.js Server    │
         │  Port: 3001           │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │    MongoDB Atlas      │
         │    (Database)         │
         └───────────────────────┘
```

### Nasıl Çalışıyor?

1. **Shop App (Vercel):**
   - Kullanıcılar ürünleri görüntüler
   - Apollo Client ile Payload CMS'e GraphQL sorguları gönderir
   - `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` environment variable'ı kullanılır
   - Örnek: `https://belucha-cms.railway.app/api/graphql`

2. **Sellercentral (Vercel):**
   - Satıcılar ürün ekler/düzenler
   - Apollo Client ile Payload CMS'e GraphQL mutation'ları gönderir
   - Aynı CMS URL'ini kullanır

3. **Payload CMS (Railway/Render):**
   - Express.js server sürekli çalışır
   - GraphQL API sağlar: `/api/graphql`
   - Admin panel sağlar: `/admin`
   - MongoDB'ye bağlanır
   - Tüm verileri (Products, Sellers, Orders, vb.) yönetir

### Örnek İş Akışı

**Senaryo: Satıcı Ürün Ekliyor**

1. Satıcı Sellercentral'e giriş yapar (`https://sellercentral.vercel.app`)
2. "Ürün Ekle" formunu doldurur
3. Form submit edilir
4. Apollo Client GraphQL mutation gönderir:
   ```graphql
   mutation CreateProduct($data: JSON!) {
     createProducts(data: $data) {
       id
       title
       price
     }
   }
   ```
5. İstek Payload CMS'e gider (`https://belucha-cms.railway.app/api/graphql`)
6. Payload CMS MongoDB'ye kaydeder
7. Başarılı yanıt döner
8. Shop App'te ürün görünür (GraphQL query ile)

**Senaryo: Müşteri Ürün Görüntülüyor**

1. Müşteri Shop'a girer (`https://shop.vercel.app`)
2. Ana sayfa yüklenir
3. Apollo Client GraphQL query gönderir:
   ```graphql
   query GetProducts {
     Products {
       id
       title
       price
       seller {
         storeName
       }
     }
   }
   ```
4. İstek Payload CMS'e gider
5. Payload CMS MongoDB'den verileri çeker
6. Veriler Shop'a döner
7. Ürünler ekranda görünür

### Environment Variables Bağlantısı

**Shop App (Vercel):**
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
NEXT_PUBLIC_SELLERCENTRAL_URL=https://sellercentral.vercel.app
```

**Sellercentral (Vercel):**
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
```

**Payload CMS (Railway):**
```
PAYLOAD_SECRET=your-secret-key
PAYLOAD_PUBLIC_SERVER_URL=https://belucha-cms.railway.app
PAYLOAD_MONGO_URL=mongodb+srv://...
```

### Özet

- ✅ **3 ayrı deployment** (Shop, Sellercentral, CMS)
- ✅ **Tek veritabanı** (MongoDB Atlas)
- ✅ **GraphQL API** ile iletişim
- ✅ **Environment variables** ile URL'ler bağlanır
- ✅ **Her biri bağımsız** deploy edilir ve güncellenir

---

## 🗄️ Payload CMS Deployment (ÖNEMLİ!)

### Payload CMS Neden Vercel'de Deploy Edilmiyor?

**Kısa Cevap:** Payload CMS bir **Express.js** server'dır, **Next.js** değil. Vercel Next.js için optimize edilmiştir.

**Detaylı Açıklama:**

1. **Shop ve Sellercentral:**
   - Next.js uygulamaları
   - Vercel Next.js için optimize edilmiş
   - Serverless functions olarak çalışır
   - ✅ Vercel'de deploy edilir

2. **Payload CMS:**
   - Express.js + Node.js server
   - Sürekli çalışan bir backend servisi
   - MongoDB bağlantısı gerektirir
   - File uploads için persistent storage gerektirir
   - ❌ Vercel'de deploy edilmez (Serverless Functions uygun değil)

### Payload CMS Nerede Deploy Edilir?

**Önerilen Platformlar:**
- **Railway** (Önerilir - Kolay kurulum)
- **Render** (Ücretsiz tier mevcut)
- **Heroku** (Ücretli)
- **DigitalOcean App Platform**
- **AWS EC2 / ECS**
- **Google Cloud Run**

### Payload CMS Deployment Adımları (Railway Örneği)

#### 1. Railway Hesabı Oluşturma

1. [railway.app](https://railway.app) → **Sign Up** (GitHub ile)
2. **New Project** → **Deploy from GitHub repo**

#### 2. Proje Ayarları

**Root Directory:**
```
apps/cms/payload
```

**Build Command:**
```
npm install
```

**Start Command:**
```
npm start
```

**Port:**
```
3001
```
(Railway otomatik PORT environment variable'ı sağlar)

#### 3. Environment Variables

Railway Dashboard → Variables → Add:

```
PAYLOAD_SECRET=your-random-secret-key-here
PAYLOAD_PUBLIC_SERVER_URL=https://your-cms-url.railway.app
PAYLOAD_MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/belucha
PORT=3001
NODE_ENV=production
```

#### 4. MongoDB Atlas Kurulumu

1. [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas) → **Sign Up**
2. **Create Cluster** (Free tier yeterli)
3. **Database Access** → Yeni kullanıcı oluştur
4. **Network Access** → IP adresini ekle (0.0.0.0/0 = tüm IP'ler)
5. **Connect** → **Connect your application** → Connection string'i kopyala
6. Railway'de `PAYLOAD_MONGO_URL` olarak ekle

#### 5. Deploy ve Test

1. Railway otomatik olarak deploy başlatacak
2. Deploy tamamlandığında URL'i not edin (örn: `belucha-cms.railway.app`)
3. Admin panel: `https://belucha-cms.railway.app/admin`
4. GraphQL API: `https://belucha-cms.railway.app/api/graphql`

### Payload CMS Build Neden Skip Ediliyor?

`apps/cms/payload/package.json` dosyasında:
```json
"build": "echo 'Payload CMS build skipped - deploy to Railway/Render instead'"
```

**Neden?**
- Payload CMS build gerektirmez (Express.js server)
- Sadece `npm start` ile çalışır
- Vercel build sırasında CMS'i build etmeye çalışmasın diye skip ediliyor
- `turbo.json`'da `@belucha/cms#build` task'ı `cache: false` ve `outputs: []` olarak ayarlı

### Payload CMS Çalışma Mantığı

1. **Development:**
   ```bash
   cd apps/cms/payload
   npm run dev
   # Express server başlar, port 3001'de çalışır
   ```

2. **Production:**
   ```bash
   npm start
   # Payload CMS production mode'da başlar
   ```

3. **API Endpoints:**
   - Admin Panel: `/admin`
   - GraphQL API: `/api/graphql`
   - REST API: `/api/*`

### Shop ve Sellercentral'ın Payload CMS'e Bağlanması

1. **Payload CMS deploy edildikten sonra:**
   - URL'i alın (örn: `https://belucha-cms.railway.app`)

2. **Vercel'de Environment Variables güncelleyin:**
   - Shop App: `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql`
   - Sellercentral App: `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql`

3. **Redeploy:**
   - Vercel otomatik olarak yeni environment variable'ı kullanacak

### Özet: 3 Ayrı Deployment

| Uygulama | Platform | Neden? |
|----------|----------|--------|
| **Shop** | Vercel | Next.js app, Vercel optimize |
| **Sellercentral** | Vercel | Next.js app, Vercel optimize |
| **Payload CMS** | Railway/Render | Express.js server, sürekli çalışan servis |

---

## 🎯 Sonraki Adımlar

Deploy başarılı olduktan sonra:
1. ✅ Payload CMS'i deploy et (Railway/Render) - **ŞİMDİ YAPILMALI**
2. ✅ MongoDB Atlas kurulumu - **ŞİMDİ YAPILMALI**
3. ✅ Environment variables'ları güncelle (gerçek CMS URL'i)
4. ✅ Production'da test et

---

**Son Güncelleme:** 2024  
**Durum:** 
- ✅ Shop ve Sellercentral Vercel'de deploy ediliyor
- ⚠️ Payload CMS henüz deploy edilmedi (Railway/Render'da deploy edilmeli)
- ⚠️ MongoDB Atlas henüz kurulmadı
