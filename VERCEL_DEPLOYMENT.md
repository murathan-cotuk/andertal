# Vercel Deployment Rehberi - Belucha

Bu rehber, Belucha monorepo projesini Vercel'e deploy etmek için adım adım talimatlar içerir.

## 📋 Genel Bakış

Belucha projesi 3 ayrı uygulamadan oluşur:
1. **Shop App** - Müşteri tarafı (Next.js)
2. **Sellercentral App** - Satıcı dashboard (Next.js)
3. **Payload CMS** - Backend API (Node.js/Express)

**Önemli**: Her uygulama için **ayrı Vercel projesi** oluşturmanız gerekiyor!

---

## 🚀 Adım 1: Shop App Deployment

### 1.1 Vercel'de Yeni Proje Oluştur

1. [Vercel Dashboard](https://vercel.com/dashboard) → **Add New Project**
2. GitHub repository'nizi seçin
3. **Project Name**: `belucha-shop` (veya istediğiniz isim)

### 1.2 Framework ve Build Ayarları

**Root Directory** ayarını yapın:
- Settings → General → Root Directory
- **Değer**: `apps/shop`

**Build Settings** (otomatik algılanmalı, yoksa manuel ekleyin):
- Framework Preset: **Next.js**
- Build Command: `cd ../.. && npm install && npm run build --filter=@belucha/shop`
- Output Directory: `apps/shop/.next`
- Install Command: `cd ../.. && npm install`

### 1.3 Environment Variables

Settings → Environment Variables → Add:

```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://your-cms-url.com/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... (veya pk_test_...)
```

**Önemli**: 
- Production, Preview ve Development için aynı değerleri ekleyin
- `NEXT_PUBLIC_` prefix'i olan değişkenler client-side'da kullanılabilir

### 1.4 Deploy

1. **Deploy** butonuna tıklayın
2. Build loglarını kontrol edin
3. Deployment tamamlandığında URL'i not edin (örn: `belucha-shop.vercel.app`)

---

## 🚀 Adım 2: Sellercentral App Deployment

### 2.1 Vercel'de Yeni Proje Oluştur

1. Vercel Dashboard → **Add New Project** (yeni proje!)
2. **Aynı GitHub repository'yi** seçin
3. **Project Name**: `belucha-sellercentral`

### 2.2 Framework ve Build Ayarları

**Root Directory**:
- Settings → General → Root Directory
- **Değer**: `apps/sellercentral`

**Build Settings**:
- Framework Preset: **Next.js**
- Build Command: `cd ../.. && npm install && npm run build --filter=@belucha/sellercentral`
- Output Directory: `apps/sellercentral/.next`
- Install Command: `cd ../.. && npm install`

### 2.3 Environment Variables

Settings → Environment Variables → Add:

```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://your-cms-url.com/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... (veya pk_test_...)
```

### 2.4 Deploy

1. **Deploy** butonuna tıklayın
2. Build loglarını kontrol edin
3. URL'i not edin (örn: `belucha-sellercentral.vercel.app`)

---

## 🚀 Adım 3: Payload CMS Deployment

Payload CMS'i Vercel Serverless Functions veya Railway/Render'a deploy edebilirsiniz.

### Seçenek A: Railway (Önerilen)

1. [Railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** seçin
3. Repository'yi seçin
4. **Root Directory**: `apps/cms/payload`
5. **Start Command**: `npm start`
6. **Build Command**: `npm run build`

**Environment Variables** (Railway → Variables):
```
PAYLOAD_SECRET=your-random-secret-key-min-32-chars
PAYLOAD_PUBLIC_SERVER_URL=https://your-cms-url.railway.app
PAYLOAD_MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/belucha
PORT=3001
NODE_ENV=production
```

### Seçenek B: Render

1. [Render.com](https://render.com) → **New Web Service**
2. GitHub repo'yu bağla
3. **Root Directory**: `apps/cms/payload`
4. **Build Command**: `npm run build`
5. **Start Command**: `npm start`
6. **Environment**: Node

**Environment Variables** (Render → Environment):
```
PAYLOAD_SECRET=your-random-secret-key-min-32-chars
PAYLOAD_PUBLIC_SERVER_URL=https://your-cms-url.onrender.com
PAYLOAD_MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/belucha
PORT=3001
NODE_ENV=production
```

### Seçenek C: Vercel Serverless Functions

**Not**: Payload CMS tam olarak serverless uyumlu olmayabilir. Railway/Render önerilir.

---

## 🔧 Adım 4: MongoDB Atlas Kurulumu

1. [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) → **Create Free Cluster**
2. Cluster oluştur (AWS, Azure veya GCP)
3. **Database Access** → **Add New Database User**
   - Username ve password oluştur
   - Database User Privileges: **Atlas admin**
4. **Network Access** → **Add IP Address**
   - **Allow Access from Anywhere** (`0.0.0.0/0`) (production için daha güvenli IP kısıtlaması yapın)
5. **Connect** → **Connect your application**
6. Connection string'i kopyala:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/belucha?retryWrites=true&w=majority
   ```
7. Bu string'i Payload CMS environment variable'ına ekle

---

## 🔐 Adım 5: Environment Variables Özeti

### Shop App (Vercel)
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://your-cms-url.com/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Sellercentral App (Vercel)
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://your-cms-url.com/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Payload CMS (Railway/Render)
```
PAYLOAD_SECRET=your-random-secret-key-min-32-chars
PAYLOAD_PUBLIC_SERVER_URL=https://your-cms-url.com
PAYLOAD_MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/belucha
PORT=3001
NODE_ENV=production
```

---

## ✅ Adım 6: Deployment Sonrası Kontroller

### 6.1 Payload CMS Kontrolü

1. CMS URL'inize gidin: `https://your-cms-url.com/admin`
2. Admin panel açılıyor mu kontrol edin
3. GraphQL endpoint'i test edin: `https://your-cms-url.com/api/graphql`

### 6.2 Shop App Kontrolü

1. Shop URL'inize gidin
2. Ana sayfa yükleniyor mu?
3. Ürünler görünüyor mu?
4. Browser console'da hata var mı kontrol edin

### 6.3 Sellercentral App Kontrolü

1. Sellercentral URL'inize gidin
2. Login sayfası açılıyor mu?
3. Dashboard yükleniyor mu?

---

## 🐛 Yaygın Sorunlar ve Çözümleri

### Sorun 1: "Only sellercentral shows up"

**Sebep**: Root directory yanlış ayarlanmış

**Çözüm**:
1. Vercel Dashboard → Project Settings → General
2. Root Directory'yi kontrol edin
3. Shop için: `apps/shop`
4. Sellercentral için: `apps/sellercentral`

### Sorun 2: Build fails with "Cannot find module"

**Sebep**: Workspace dependencies yüklenmemiş

**Çözüm**:
1. Build Command'ı kontrol edin
2. `cd ../.. && npm install` komutunun çalıştığından emin olun
3. Root'ta `.npmrc` dosyası oluşturun:
   ```
   shamefully-hoist=true
   ```

### Sorun 3: GraphQL connection errors

**Sebep**: Payload CMS URL'i yanlış veya CORS sorunu

**Çözüm**:
1. `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` environment variable'ını kontrol edin
2. Payload CMS'in çalıştığından emin olun
3. CORS ayarlarını Payload CMS'de kontrol edin (`payload.config.js`)

### Sorun 4: "Module not found" errors

**Sebep**: Path aliases (`@/`) çalışmıyor

**Çözüm**:
1. `apps/shop/jsconfig.json` dosyasının olduğundan emin olun
2. `apps/sellercentral/jsconfig.json` dosyası gerekebilir
3. Next.js config'de path alias'ları kontrol edin

### Sorun 5: Font yüklenmiyor

**Sebep**: Google Fonts import sorunu

**Çözüm**:
1. `globals.css` dosyasında `@import` en üstte olmalı
2. `next.config.js`'de font optimizasyonu kontrol edin

---

## 📝 Deployment Checklist

### Shop App
- [ ] Vercel projesi oluşturuldu
- [ ] Root directory: `apps/shop`
- [ ] Build command doğru
- [ ] Environment variables eklendi
- [ ] Deploy başarılı
- [ ] Site çalışıyor

### Sellercentral App
- [ ] Vercel projesi oluşturuldu (ayrı proje!)
- [ ] Root directory: `apps/sellercentral`
- [ ] Build command doğru
- [ ] Environment variables eklendi
- [ ] Deploy başarılı
- [ ] Site çalışıyor

### Payload CMS
- [ ] Railway/Render projesi oluşturuldu
- [ ] Root directory: `apps/cms/payload`
- [ ] MongoDB Atlas cluster oluşturuldu
- [ ] Environment variables eklendi
- [ ] Deploy başarılı
- [ ] Admin panel çalışıyor
- [ ] GraphQL endpoint çalışıyor

### MongoDB
- [ ] Atlas cluster oluşturuldu
- [ ] Database user oluşturuldu
- [ ] Network access ayarlandı
- [ ] Connection string alındı

---

## 🔄 Güncelleme Süreci

Kod değişikliklerinden sonra:

1. **Git'e push et**:
   ```bash
   git add .
   git commit -m "Update"
   git push origin main
   ```

2. **Vercel otomatik deploy eder**
   - Her push'ta otomatik deploy
   - Preview deployment'lar oluşturulur
   - Production'a manuel merge gerekebilir

3. **Payload CMS'i güncelle**:
   - Railway/Render otomatik deploy eder
   - Veya manuel redeploy yapın

---

## 🌐 Custom Domain Ekleme

### Shop App için:
1. Vercel Dashboard → Project → Settings → Domains
2. Domain ekle: `shop.yourdomain.com`
3. DNS kayıtlarını yapılandırın

### Sellercentral App için:
1. Vercel Dashboard → Project → Settings → Domains
2. Domain ekle: `seller.yourdomain.com`
3. DNS kayıtlarını yapılandırın

### Payload CMS için:
1. Railway/Render'da custom domain ekleyin
2. DNS kayıtlarını yapılandırın
3. Environment variable'ı güncelleyin: `PAYLOAD_PUBLIC_SERVER_URL`

---

## 📊 Monitoring ve Logs

### Vercel
- **Deployments**: Her deployment'ın loglarını görüntüleyin
- **Analytics**: Traffic ve performance metrikleri
- **Logs**: Real-time log görüntüleme

### Railway/Render
- **Logs**: Application loglarını görüntüleyin
- **Metrics**: CPU, Memory kullanımı
- **Alerts**: Hata durumunda bildirimler

---

## 🆘 Destek

Sorun yaşarsanız:
1. Build loglarını kontrol edin
2. Environment variables'ları doğrulayın
3. MongoDB bağlantısını test edin
4. Browser console'da hataları kontrol edin
5. Payload CMS GraphQL endpoint'ini test edin

---

## 📚 Ek Kaynaklar

- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Render Documentation](https://render.com/docs)
- [Payload CMS Documentation](https://payloadcms.com/docs)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com)

---

**Son Güncelleme**: 2024

