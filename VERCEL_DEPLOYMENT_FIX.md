# 🚀 Vercel Deployment - API Bağlantı Sorunları Çözümü

## ❌ Sorunlar

1. **Server Configuration Error**
   - `/api/auth/error?error=Configuration` hatası
   - NextAuth konfigürasyonu eksik veya yanlış

2. **Yanlış URL Yönlendirme**
   - `sellercentral.vercel.app` yerine `belucha-sellercentral.vercel.app` kullanılmalı

3. **API Bağlantıları Çalışmıyor**
   - GraphQL endpoint'leri erişilemiyor
   - `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` production'da eksik/yanlış

---

## ✅ Çözüm Adımları

### 1. Payload CMS'i Deploy Edin (ÖNEMLİ!)

Payload CMS henüz deploy edilmemiş. Önce bunu yapmalısınız.

**Seçenek A: Railway (Önerilen)**

1. Railway.app'e gidin: https://railway.app
2. New Project → Deploy from GitHub
3. Repository'yi seçin
4. **Root Directory:** `apps/cms/payload`
5. **Start Command:** `npm run start` veya `node src/server.js`
6. Environment Variables ekleyin:

```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=https://belucha-cms.railway.app
PAYLOAD_MONGO_URL=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
PORT=3001
NODE_ENV=production
```

7. Deploy edin
8. Production URL'i alın: `https://belucha-cms.railway.app` (veya kendi domain'iniz)

**Seçenek B: Render**

1. Render.com'a gidin
2. New → Web Service
3. GitHub repository'yi bağlayın
4. **Root Directory:** `apps/cms/payload`
5. **Build Command:** `npm install`
6. **Start Command:** `npm run start`
7. Environment Variables ekleyin (yukarıdaki gibi)
8. Deploy edin

### 2. Vercel Environment Variables Ekleyin

#### Shop App için:

1. Vercel Dashboard → Shop App → Settings → Environment Variables
2. **Production** için ekleyin:

```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
NEXT_PUBLIC_SELLERCENTRAL_URL=https://belucha-sellercentral.vercel.app
```

3. **Preview** ve **Development** için de aynı değerleri ekleyin
4. **Save** butonuna tıklayın
5. **Redeploy** yapın

#### Sellercentral App için:

1. Vercel Dashboard → Sellercentral App → Settings → Environment Variables
2. **Production** için ekleyin:

```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
```

3. **Preview** ve **Development** için de aynı değerleri ekleyin
4. **Save** butonuna tıklayın
5. **Redeploy** yapın

### 3. Payload CMS CORS Ayarları

Payload CMS'in `payload.config.js` dosyasına CORS ayarları eklendi. Deploy ederken bu ayarlar aktif olacak.

### 4. NextAuth Hatasını Düzeltin

Eğer NextAuth kullanmıyorsanız, `/api/auth` route'larını oluşturmayın.

**Eğer NextAuth kullanmak istiyorsanız:**

1. NextAuth paketini kurun:
```bash
cd apps/sellercentral
npm install next-auth
```

2. NextAuth konfigürasyonu oluşturun: `apps/sellercentral/src/app/api/auth/[...nextauth]/route.js`

**Eğer NextAuth kullanmıyorsanız:**

- `/api/auth` route'larını oluşturmayın
- Bu hata görmezden gelinebilir (sadece bir uyarı)

---

## 🔧 Hızlı Düzeltme Checklist

### Payload CMS
- [ ] Payload CMS deploy edildi (Railway/Render)
- [ ] Production URL alındı (örn: `https://belucha-cms.railway.app`)
- [ ] Environment variables ayarlandı
- [ ] CORS ayarları eklendi
- [ ] GraphQL endpoint test edildi: `https://belucha-cms.railway.app/api/graphql`

### Shop App (Vercel)
- [ ] `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` environment variable eklendi
- [ ] `NEXT_PUBLIC_SELLERCENTRAL_URL` environment variable eklendi
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` environment variable eklendi
- [ ] Redeploy yapıldı
- [ ] Footer'daki sellercentral linki düzeltildi (kod güncellendi)

### Sellercentral App (Vercel)
- [ ] `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` environment variable eklendi
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` environment variable eklendi
- [ ] Redeploy yapıldı
- [ ] NextAuth konfigürasyonu eklendi/kaldırıldı

---

## 🧪 Test Etme

### 1. Payload CMS Test

Tarayıcıda:
- https://belucha-cms.railway.app/api/graphql
- GraphQL Playground açılmalı

### 2. Shop App Test

- https://belucha-shop.vercel.app
- Browser console'da: `process.env.NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` kontrol edin
- Network tab'de GraphQL isteklerini kontrol edin

### 3. Sellercentral App Test

- https://belucha-sellercentral.vercel.app/login
- Login sayfası açılmalı
- Browser console'da hata olmamalı

---

## 📝 Önemli Notlar

1. **Environment Variables:**
   - `NEXT_PUBLIC_*` ile başlayan değişkenler client-side'da kullanılabilir
   - Production, Preview, Development için ayrı ayrı ekleyin
   - Değişikliklerden sonra **mutlaka redeploy yapın**

2. **Payload CMS URL:**
   - Payload CMS'in production URL'ini alın
   - Bu URL'i tüm frontend app'lerde `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` olarak kullanın
   - Format: `https://your-cms-url.com/api/graphql`

3. **CORS:**
   - Payload CMS'de CORS ayarları eklendi
   - Frontend app'lerin URL'lerini CORS listesine ekleyin

4. **NextAuth:**
   - Eğer kullanmıyorsanız, `/api/auth` route'larını oluşturmayın
   - Hata görünse bile uygulama çalışabilir

---

## 🆘 Hala Sorun Varsa

### Hata: "CORS policy"

**Çözüm:**
- Payload CMS'de CORS ayarlarını kontrol edin
- Frontend app URL'lerini CORS listesine ekleyin

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

