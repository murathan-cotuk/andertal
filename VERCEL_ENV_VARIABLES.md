# 🚀 Vercel Environment Variables Kurulumu

## 📋 Özet

Vercel'deki **Shop** ve **Sellercentral** uygulamaları için gerekli environment variables'ları bu rehberde bulabilirsiniz.

**Payload CMS URL:** `https://beluchacms-production.up.railway.app`

---

## 🛍️ Shop App için (Vercel)

### Vercel Dashboard → Shop Projesi → Settings → Environment Variables

Aşağıdaki değişkenleri ekleyin:

| Key | Value | Açıklama |
|-----|-------|----------|
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://beluchacms-production.up.railway.app/api/graphql
NEXT_PUBLIC_SELLERCENTRAL_URL=https://belucha-sellercentral.vercel.app
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

### Adım Adım Ekleme

1. **Vercel Dashboard** → Shop projenizi açın
2. **Settings** → **Environment Variables** sekmesine gidin
3. **Add New** butonuna tıklayın

**1. NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL**
- **Key:** `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL`
- **Value:** `https://beluchacms-production.up.railway.app/api/graphql`
- **Environment:** ✅ Production, ✅ Preview, ✅ Development (hepsini seçin)
- **Save**

**2. NEXT_PUBLIC_SELLERCENTRAL_URL**
- **Key:** `NEXT_PUBLIC_SELLERCENTRAL_URL`
- **Value:** `https://belucha-sellercentral.vercel.app` (veya kendi sellercentral URL'iniz)
- **Environment:** ✅ Production, ✅ Preview, ✅ Development (hepsini seçin)
- **Save**

**3. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY** (Opsiyonel)
- **Key:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **Value:** Stripe publishable key'iniz (test veya live)
- **Environment:** ✅ Production, ✅ Preview, ✅ Development (hepsini seçin)
- **Save**

---

## 🏪 Sellercentral App için (Vercel)

### Vercel Dashboard → Sellercentral Projesi → Settings → Environment Variables

Aşağıdaki değişkenleri ekleyin:

| Key | Value | Açıklama |
|-----|-------|----------|
| `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` | `https://beluchacms-production.up.railway.app/api/graphql`
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` veya `pk_live_...`

### Adım Adım Ekleme

1. **Vercel Dashboard** → Sellercentral projenizi açın
2. **Settings** → **Environment Variables** sekmesine gidin
3. **Add New** butonuna tıklayın

**1. NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL**
- **Key:** `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL`
- **Value:** `https://beluchacms-production.up.railway.app/api/graphql`
- **Environment:** ✅ Production, ✅ Preview, ✅ Development (hepsini seçin)
- **Save**

**2. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY** (Opsiyonel)
- **Key:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- **Value:** Stripe publishable key'iniz (test veya live)
- **Environment:** ✅ Production, ✅ Preview, ✅ Development (hepsini seçin)
- **Save**

---

## 📝 Örnek Environment Variables

### Shop App

```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://beluchacms-production.up.railway.app/api/graphql
NEXT_PUBLIC_SELLERCENTRAL_URL=https://belucha-sellercentral.vercel.app
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

### Sellercentral App

```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://beluchacms-production.up.railway.app/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
```

---

## ⚠️ Önemli Notlar

### 1. NEXT_PUBLIC_ Prefix

**ÖNEMLİ:** Tüm client-side environment variables `NEXT_PUBLIC_` ile başlamalıdır!

Next.js'te client-side'da kullanılacak değişkenler `NEXT_PUBLIC_` prefix'i ile başlamalıdır. Aksi takdirde browser'da erişilemez.

### 2. Environment Seçimi

**Production, Preview ve Development** için aynı değerleri ekleyin.

Vercel'de her environment için ayrı değerler ayarlayabilirsiniz, ancak şimdilik hepsi için aynı değerleri kullanabilirsiniz.

### 3. Redeploy Gerekliliği

Environment variables ekledikten veya güncelledikten sonra **mutlaka redeploy yapın**!

Vercel Dashboard → Deployments → Son deployment → **Redeploy**

### 4. Payload CMS URL Güncellemesi

Eğer Railway'de Payload CMS URL'i değişirse:

1. Railway Dashboard → Service → Settings → **Public Domain** bölümünden yeni URL'i kopyalayın
2. Vercel'de her iki projede de `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` değerini güncelleyin
3. Redeploy yapın

---

## ✅ Kontrol Listesi

### Shop App
- [ ] `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` eklendi
- [ ] `NEXT_PUBLIC_SELLERCENTRAL_URL` eklendi
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` eklendi (opsiyonel)
- [ ] Tüm environment'lar için değerler ayarlandı (Production, Preview, Development)
- [ ] Redeploy yapıldı

### Sellercentral App
- [ ] `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` eklendi
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` eklendi (opsiyonel)
- [ ] Tüm environment'lar için değerler ayarlandı (Production, Preview, Development)
- [ ] Redeploy yapıldı

---

## 🧪 Test Etme

### 1. Browser Console'da Kontrol

Deploy sonrası browser console'da test edin:

```javascript
// Shop App'de
console.log('GraphQL URL:', process.env.NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL)
console.log('Sellercentral URL:', process.env.NEXT_PUBLIC_SELLERCENTRAL_URL)

// Sellercentral App'de
console.log('GraphQL URL:', process.env.NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL)
```

**Beklenen:**
- GraphQL URL: `https://beluchacms-production.up.railway.app/api/graphql`
- Sellercentral URL (sadece shop'ta): `https://belucha-sellercentral.vercel.app`

### 2. Network Tab'de Kontrol

Browser DevTools → Network tab → GraphQL isteklerini kontrol edin:

- **Request URL:** `https://beluchacms-production.up.railway.app/api/graphql`
- **Status:** `200 OK`

### 3. GraphQL Endpoint Testi

Browser console'da:

```javascript
fetch('https://beluchacms-production.up.railway.app/api/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '{ __typename }' })
})
.then(r => r.json())
.then(console.log)
```

**Beklenen:** `{ data: { __typename: 'Query' } }`

---

## 🐛 Sorun Giderme

### Hata: "GraphQL endpoint not found"

**Sorun:** `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` yanlış veya eksik.

**Çözüm:**
1. Vercel Dashboard → Environment Variables'ı kontrol edin
2. URL'in doğru olduğundan emin olun: `https://beluchacms-production.up.railway.app/api/graphql`
3. Redeploy yapın

### Hata: "CORS policy"

**Sorun:** Payload CMS CORS ayarları eksik.

**Çözüm:**
1. Railway'de Payload CMS'in `payload.config.js` dosyasında CORS ayarlarını kontrol edin
2. Vercel URL'lerini CORS listesine ekleyin:
   - `https://belucha-shop.vercel.app`
   - `https://belucha-sellercentral.vercel.app`

### Hata: "Environment variable not found"

**Sorun:** Variable eklenmiş ama redeploy yapılmamış.

**Çözüm:**
1. Vercel Dashboard → Deployments → **Redeploy** yapın
2. Environment variables'ın doğru environment'lar için ayarlandığından emin olun

---

## 📚 İlgili Rehberler

- `RAILWAY_ENV_SETUP.md` - Railway environment variables kurulumu
- `VERCEL_DEPLOYMENT_FIX.md` - Vercel deployment sorunları çözümü
- `RAILWAY_APPLICATION_FAILED_FIX.md` - Railway application failed hatası çözümü

---

**Son Güncelleme:** 2024

