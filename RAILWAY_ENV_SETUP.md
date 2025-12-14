# 🔐 Railway Environment Variables Kurulumu

## 📋 Gerekli Environment Variables

Railway Dashboard → Service → Variables sekmesine şu değişkenleri ekleyin:

```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=https://beluchacms-production.up.railway.app
PAYLOAD_MONGO_URL=mongodb+srv://belucha:belucha@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
NODE_ENV=production
```

---

## 🚀 Railway CLI ile Ekleme

Eğer Railway CLI'ye login olduysanız:

```powershell
cd apps/cms/payload
railway variables set PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
railway variables set PAYLOAD_PUBLIC_SERVER_URL=https://beluchacms-production.up.railway.app
railway variables set PAYLOAD_MONGO_URL=mongodb+srv://belucha:belucha@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
railway variables set NODE_ENV=production
```

---

## 🌐 Railway Dashboard ile Ekleme

### Adım 1: Railway Dashboard'a Giriş

1. [Railway Dashboard](https://railway.app) → Projenize gidin
2. Service'i seçin (`@belucha/cms`)

### Adım 2: Variables Sekmesine Gidin

1. Sol menüden **Variables** sekmesine tıklayın
2. **New Variable** butonuna tıklayın

### Adım 3: Variables Ekleme

Her bir variable için:

**1. PAYLOAD_SECRET**
- **Name:** `PAYLOAD_SECRET`
- **Value:** `beluchaSecret123456789012345678901234567890`
- **Add** butonuna tıklayın

**2. PAYLOAD_PUBLIC_SERVER_URL**
- **Name:** `PAYLOAD_PUBLIC_SERVER_URL`
- **Value:** `https://beluchacms-production.up.railway.app`
- **Add** butonuna tıklayın

**3. PAYLOAD_MONGO_URL**
- **Name:** `PAYLOAD_MONGO_URL`
- **Value:** `mongodb+srv://belucha:belucha@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority`
- **Add** butonuna tıklayın

**4. NODE_ENV**
- **Name:** `NODE_ENV`
- **Value:** `production`
- **Add** butonuna tıklayın

---

## ⚠️ Önemli Notlar

### PORT Variable'ı

**ÖNEMLİ:** `PORT` environment variable'ını **SİLMEYİN** veya **DEĞİŞTİRMEYİN**!

Railway otomatik olarak `PORT` variable'ını set eder. Bu variable'ı silerseniz veya değiştirirseniz, uygulama başlatılamaz.

### PAYLOAD_PUBLIC_SERVER_URL

İlk deploy'da Railway size geçici bir URL verecek. Deploy tamamlandıktan sonra:

1. Railway Dashboard → Service → Settings → **Public Domain** bölümünden gerçek URL'i kopyalayın
2. Variables'da `PAYLOAD_PUBLIC_SERVER_URL` değerini güncelleyin
3. Redeploy yapın

### MongoDB Connection String

Connection string formatı:
```
mongodb+srv://KULLANICI_ADI:ŞİFRE@CLUSTER.mongodb.net/DATABASE_ADI?retryWrites=true&w=majority
```

**Sizin durumunuz:**
- Kullanıcı Adı: `belucha`
- Şifre: `belucha`
- Cluster: `belucha.dijx1dj.mongodb.net`
- Database: `belucha`

**Tam Connection String:**
```
mongodb+srv://belucha:belucha@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

---

## ✅ Kontrol Listesi

Deploy öncesi kontrol edin:

- [ ] `PAYLOAD_SECRET` eklendi (min 32 karakter)
- [ ] `PAYLOAD_PUBLIC_SERVER_URL` eklendi (Railway URL'i)
- [ ] `PAYLOAD_MONGO_URL` eklendi (gerçek şifre ile)
- [ ] `NODE_ENV=production` eklendi
- [ ] `PORT` variable'ı **SİLİNMEDİ** (Railway otomatik yönetir)
- [ ] MongoDB Atlas IP whitelist'te `0.0.0.0/0` var

---

## 🔄 Deploy Sonrası

Variables eklendikten sonra:

1. **Redeploy** butonuna tıklayın
2. **Logs** sekmesinden deploy'u izleyin
3. Başarılı log mesajlarını kontrol edin:
   ```
   ✅ MongoDB connection established
   ✅ Payload CMS initialized successfully
   ✅ Server running on port XXXX
   ```

---

## 🐛 Sorun Giderme

### MongoDB Connection Failed

**Log'da görünecek:**
```
❌ Error initializing Payload CMS: MongoServerError: ...
```

**Çözüm:**
1. `PAYLOAD_MONGO_URL` değerini kontrol edin
2. Şifrenin doğru olduğundan emin olun
3. Connection string'de database adının (`/belucha`) olduğundan emin olun
4. MongoDB Atlas → Network Access → IP whitelist'te `0.0.0.0/0` olduğundan emin olun

### PAYLOAD_SECRET Not Found

**Log'da görünecek:**
```
⚠️  PAYLOAD_SECRET not found in env, using default
```

**Çözüm:**
1. Railway Variables'da `PAYLOAD_SECRET` olduğundan emin olun
2. En az 32 karakter olduğundan emin olun
3. Redeploy yapın

---

**Son Güncelleme:** 2024

