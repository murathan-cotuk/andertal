# 🚂 Railway "Application failed to respond" Hatası Çözümü

## ❌ Sorun

```
Application failed to respond
This error appears to be caused by the application.
```

Bu hata, uygulamanın başlatılamadığı veya çöktüğü anlamına gelir.

---

## 🔍 Olası Nedenler

### 1. Port Sorunu
- Railway otomatik port yönetimi yapar
- `PORT` environment variable'ı Railway tarafından otomatik set edilir
- Server'ın `process.env.PORT` kullanması gerekir

### 2. MongoDB Bağlantı Hatası
- MongoDB bağlantısı başarısız
- Server init edilemiyor
- Process çöküyor

### 3. Environment Variables Eksik
- `PAYLOAD_SECRET` eksik
- `PAYLOAD_MONGO_URL` yanlış
- Server başlatılamıyor

### 4. Start Command Yanlış
- Start command doğru değil
- Server başlatılamıyor

---

## ✅ Çözüm Adımları

### Adım 1: Railway Loglarını Kontrol Edin

Railway Dashboard → Deployments → Son deployment → **View Logs**

**Arayacağınız hatalar:**
- MongoDB connection failed
- PAYLOAD_SECRET not found
- Port already in use
- Module not found
- Syntax errors

### Adım 2: Environment Variables Kontrolü

Railway Dashboard → Variables → Şu değişkenlerin olduğundan emin olun:

```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=https://beluchacms-production.up.railway.app
PAYLOAD_MONGO_URL=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
NODE_ENV=production
```

**Önemli:**
- `PORT` environment variable'ını **SİLMEYİN** - Railway otomatik set eder
- `PAYLOAD_PUBLIC_SERVER_URL` Railway'in verdiği URL olmalı
- `PAYLOAD_MONGO_URL` içinde gerçek MongoDB şifresi olmalı

### Adım 3: Server.js Port Kontrolü

Server.js dosyasında port'un doğru ayarlandığından emin olun:

```javascript
const port = process.env.PORT || 3001
```

Bu zaten doğru görünüyor. Railway `PORT` environment variable'ını otomatik set eder.

### Adım 4: Root Directory Kontrolü

Railway Dashboard → Settings → **Root Directory:**

```
apps/cms/payload
```

### Adım 5: Start Command Kontrolü

Railway Dashboard → Settings → **Start Command:**

```
node src/server.js
```

Veya boş bırakın (package.json'daki `start` script'i kullanılacak).

---

## 🔧 Hızlı Düzeltme

### 1. Railway Variables Güncelleme

Railway Dashboard → Variables → Şunları ekleyin/güncelleyin:

```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=https://beluchacms-production.up.railway.app
PAYLOAD_MONGO_URL=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
NODE_ENV=production
```

**Önemli Notlar:**
- `PORT` variable'ını **SİLMEYİN** - Railway otomatik yönetir
- MongoDB şifresinde özel karakterler varsa URL encode edin
- Connection string'de database adı (`/belucha`) olmalı

### 2. Redeploy

1. Variables'ı güncelledikten sonra
2. **Redeploy** butonuna tıklayın
3. Logları izleyin

### 3. Beklenen Başarılı Loglar

```
✅ Loaded .env from: ...
✅ PAYLOAD_SECRET loaded: ...
🔑 Secret key set: ...
✅ MongoDB connection established
✅ Payload CMS initialized successfully
✅ Routes registered: /admin, /api, /api/graphql
✅ Server running at http://0.0.0.0:XXXX
```

**Not:** Port numarası Railway tarafından otomatik atanır.

---

## 🐛 Yaygın Hatalar ve Çözümleri

### Hata: "MongoDB connection failed"

**Log'da görünecek:**
```
❌ Error initializing Payload CMS: MongoServerError: ...
```

**Çözüm:**
1. `PAYLOAD_MONGO_URL` değerini kontrol edin
2. MongoDB şifresinin doğru olduğundan emin olun
3. Connection string'de database adının (`/belucha`) olduğundan emin olun
4. MongoDB Atlas IP whitelist'i kontrol edin (0.0.0.0/0 ekleyin)

### Hata: "PAYLOAD_SECRET not found"

**Log'da görünecek:**
```
⚠️  PAYLOAD_SECRET not found in env, using default
```

**Çözüm:**
1. Railway Variables'da `PAYLOAD_SECRET` olduğundan emin olun
2. En az 32 karakter olduğundan emin olun
3. Redeploy yapın

### Hata: "Cannot find module"

**Log'da görünecek:**
```
Error: Cannot find module '...'
```

**Çözüm:**
1. Root Directory'in doğru olduğundan emin olun: `apps/cms/payload`
2. `package.json` dosyasının doğru konumda olduğundan emin olun
3. Dependencies'lerin kurulu olduğundan emin olun

### Hata: "Port already in use"

**Log'da görünecek:**
```
Error: listen EADDRINUSE: address already in use
```

**Çözüm:**
- Railway otomatik port yönetimi yapar
- `PORT` environment variable'ını kaldırmayın veya değiştirmeyin
- Railway'in set ettiği port'u kullanın

---

## 📋 Kontrol Listesi

### Railway Ayarları
- [ ] Root Directory: `apps/cms/payload`
- [ ] Start Command: `node src/server.js` (veya boş)
- [ ] Environment Variables eklendi:
  - [ ] `PAYLOAD_SECRET` (min 32 karakter)
  - [ ] `PAYLOAD_PUBLIC_SERVER_URL` (Railway URL'i)
  - [ ] `PAYLOAD_MONGO_URL` (gerçek şifre ile)
  - [ ] `NODE_ENV=production`
  - [ ] `PORT` variable'ı **SİLİNMEMELİ** (Railway otomatik yönetir)

### MongoDB
- [ ] Connection string doğru format
- [ ] Database adı (`/belucha`) var
- [ ] Gerçek şifre yazıldı
- [ ] MongoDB Atlas IP whitelist'te (0.0.0.0/0)

### Deploy
- [ ] Deploy yapıldı
- [ ] Loglar kontrol edildi
- [ ] Başarılı log mesajları görüldü
- [ ] URL test edildi

---

## 🧪 Test Etme

### 1. Railway Loglarını Kontrol Edin

Railway Dashboard → Deployments → Son deployment → **View Logs**

**Başarılı olursa şu mesajları görmelisiniz:**
```
✅ Loaded .env from: ...
✅ PAYLOAD_SECRET loaded: ...
🔑 Secret key set: ...
✅ MongoDB connection established
✅ Payload CMS initialized successfully
✅ Server running at http://0.0.0.0:XXXX
```

### 2. URL Testi

Railway'den aldığınız URL ile:

- **Admin Panel:** `https://beluchacms-production.up.railway.app/admin`
- **GraphQL API:** `https://beluchacms-production.up.railway.app/api/graphql`

**Beklenen:**
- Admin panel açılmalı veya ilk kullanıcı kayıt formu görünmeli
- GraphQL Playground açılmalı

---

## 🆘 Hala Çalışmıyorsa

### 1. Logları Paylaşın

Railway Dashboard → Deployments → Son deployment → **View Logs** → Tüm logları kopyalayın

### 2. Environment Variables Kontrolü

Railway Dashboard → Variables → Tüm değişkenleri kontrol edin

### 3. MongoDB Test

MongoDB Atlas Dashboard'da:
- Connection string'i test edin
- IP whitelist'i kontrol edin
- Database'in var olduğundan emin olun

---

**Son Güncelleme:** 2024

