# 🔧 Deployment API Bağlantı Sorunları Çözümü

## ❌ Sorunlar

1. **Server Configuration Error**
   - "There is a problem with the server configuration"
   - `/api/auth/error?error=Configuration` hatası

2. **Yanlış URL Yönlendirme**
   - `sellercentral.vercel.app` yerine `belucha-sellercentral.vercel.app` kullanılmalı

3. **API Bağlantıları Çalışmıyor**
   - GraphQL endpoint'leri erişilemiyor
   - Environment variables production'da eksik/yanlış

---

## 🔍 Sorun Analizi

### 1. Environment Variables Eksik

**Sorun:** Production'da `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` doğru ayarlanmamış.

**Çözüm:** Vercel'de environment variables ekleyin.

### 2. Payload CMS Production URL'i Eksik

**Sorun:** Payload CMS'in production URL'i bilinmiyor.

**Çözüm:** Payload CMS'i deploy edin ve URL'ini environment variable olarak ekleyin.

### 3. NextAuth Configuration Hatası

**Sorun:** `/api/auth/error` hatası NextAuth'tan geliyor ama NextAuth konfigürasyonu eksik.

**Çözüm:** NextAuth konfigürasyonunu ekleyin veya kaldırın.

---

## ✅ Çözüm Adımları

### Adım 1: Payload CMS'i Deploy Edin

Payload CMS'i bir hosting servisine deploy edin (Railway, Render, Vercel Serverless Functions, vb.)

**Örnek Production URL:**
```
https://belucha-cms.railway.app
```

### Adım 2: Vercel Environment Variables Ekleyin

#### Shop App için (Vercel Dashboard):

1. Vercel Dashboard → Shop App → Settings → Environment Variables
2. Şu değişkenleri ekleyin:

```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
```

#### Sellercentral App için (Vercel Dashboard):

1. Vercel Dashboard → Sellercentral App → Settings → Environment Variables
2. Şu değişkenleri ekleyin:

```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
```

**Önemli:**
- `NEXT_PUBLIC_*` ile başlayan değişkenler client-side'da kullanılabilir
- Production, Preview, Development için ayrı ayrı ekleyin
- Değişikliklerden sonra redeploy yapın

### Adım 3: NextAuth Hatasını Düzeltin

Eğer NextAuth kullanmıyorsanız, `/api/auth` route'larını kaldırın veya oluşturun.

**Seçenek 1: NextAuth Kaldırma (Eğer kullanmıyorsanız)**

NextAuth kullanmıyorsanız, bu route'ları oluşturmayın.

**Seçenek 2: NextAuth Ekleme (Eğer kullanmak istiyorsanız)**

NextAuth konfigürasyonu ekleyin.

---

## 🔧 Hızlı Düzeltme

### 1. Vercel Environment Variables Kontrolü

Vercel Dashboard'da her iki app için de şu değişkenlerin olduğundan emin olun:

```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://YOUR_PAYLOAD_CMS_URL/api/graphql
```

### 2. Payload CMS CORS Ayarları

Payload CMS'in `payload.config.js` dosyasına CORS ayarları ekleyin:

```javascript
export default buildConfig({
  // ... diğer ayarlar
  cors: [
    'https://belucha-shop.vercel.app',
    'https://belucha-sellercentral.vercel.app',
    'https://sellercentral.vercel.app', // Eski URL
    'http://localhost:3000',
    'http://localhost:3002',
  ],
  // ...
})
```

### 3. URL Yönlendirme Düzeltmesi

Shop app'te sellercentral linkini düzeltin:

```jsx
// Yanlış
<a href="https://sellercentral.vercel.app">Seller Central</a>

// Doğru
<a href="https://belucha-sellercentral.vercel.app">Seller Central</a>
```

---

## 📋 Checklist

### Payload CMS
- [ ] Payload CMS deploy edildi
- [ ] Production URL alındı (örn: `https://belucha-cms.railway.app`)
- [ ] CORS ayarları eklendi
- [ ] Environment variables ayarlandı

### Shop App (Vercel)
- [ ] `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` environment variable eklendi
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` environment variable eklendi
- [ ] Redeploy yapıldı
- [ ] Sellercentral linki düzeltildi

### Sellercentral App (Vercel)
- [ ] `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` environment variable eklendi
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` environment variable eklendi
- [ ] Redeploy yapıldı
- [ ] NextAuth konfigürasyonu eklendi/kaldırıldı

---

## 🚀 Adım Adım Deployment

### 1. Payload CMS Deploy

**Railway kullanarak:**

1. Railway.app'e gidin
2. New Project → Deploy from GitHub
3. Repository'yi seçin
4. Root Directory: `apps/cms/payload`
5. Environment Variables ekleyin:
   ```env
   PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
   PAYLOAD_PUBLIC_SERVER_URL=https://belucha-cms.railway.app
   PAYLOAD_MONGO_URL=mongodb+srv://belucha:ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
   PORT=3001
   ```
6. Deploy edin
7. Production URL'i alın: `https://belucha-cms.railway.app`

### 2. Shop App Deploy (Vercel)

1. Vercel Dashboard → Shop App → Settings → Environment Variables
2. Ekleyin:
   ```env
   NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_key
   ```
3. Redeploy yapın

### 3. Sellercentral App Deploy (Vercel)

1. Vercel Dashboard → Sellercentral App → Settings → Environment Variables
2. Ekleyin:
   ```env
   NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_key
   ```
3. Redeploy yapın

---

## 🔍 Test Etme

### 1. GraphQL Endpoint Testi

**Shop App:**
- Browser console'da: `process.env.NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` kontrol edin
- Network tab'de GraphQL isteklerini kontrol edin

**Sellercentral App:**
- Browser console'da: `process.env.NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` kontrol edin
- Network tab'de GraphQL isteklerini kontrol edin

### 2. API Bağlantı Testi

```javascript
// Browser console'da test
fetch('https://belucha-cms.railway.app/api/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '{ __typename }' })
})
.then(r => r.json())
.then(console.log)
```

---

## ❌ Hala Sorun Varsa

### Hata: "CORS policy"

**Çözüm:** Payload CMS'de CORS ayarlarını ekleyin (yukarıda belirtildi)

### Hata: "404 Not Found" (GraphQL)

**Çözüm:**
- Payload CMS'in çalıştığından emin olun
- `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` doğru mu kontrol edin
- URL'de `/api/graphql` var mı kontrol edin

### Hata: "/api/auth/error"

**Çözüm:**
- NextAuth kullanmıyorsanız, bu route'u oluşturmayın
- Veya NextAuth konfigürasyonunu ekleyin

---

**Son Güncelleme:** 2024

