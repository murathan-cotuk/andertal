# 🚂 Railway Deployment - Payload CMS Düzeltmesi

## ❌ Sorun

```
Unknown command: "start"
npm error Lifecycle script `start` failed
```

**Neden:** Payload CMS v3'te `payload start` komutu yok! `node src/server.js` kullanılmalı.

---

## ✅ Çözüm

### 1. package.json Düzeltildi

`start` script'i güncellendi:

**Önce (Yanlış):**
```json
"start": "cross-env PAYLOAD_CONFIG_PATH=src/payload.config.js NODE_ENV=production payload start"
```

**Sonra (Doğru):**
```json
"start": "node src/server.js"
```

### 2. Railway Environment Variables

Railway'de şu environment variables'ları ekleyin:

```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=https://belucha-cms.railway.app
PAYLOAD_MONGO_URL=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
PORT=3001
NODE_ENV=production
```

**Önemli:**
- `PAYLOAD_PUBLIC_SERVER_URL` Railway'in verdiği URL olmalı
- `PAYLOAD_MONGO_URL` içinde gerçek MongoDB şifresi olmalı
- Database adı (`/belucha`) connection string'de olmalı

### 3. Railway Start Command

Railway'de **Start Command** ayarını kontrol edin:

**Doğru Start Command:**
```
node src/server.js
```

Veya boş bırakın (package.json'daki `start` script'i kullanılacak).

---

## 🚀 Railway Deployment Adımları

### Adım 1: Railway'de Service Ayarları

1. Railway Dashboard → Service → Settings
2. **Start Command** bölümünü kontrol edin:
   - Boş bırakın (package.json'daki `start` script'i kullanılacak)
   - Veya: `node src/server.js` yazın

### Adım 2: Environment Variables Ekleyin

Railway Dashboard → Service → Variables:

```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=https://belucha-cms.railway.app
PAYLOAD_MONGO_URL=mongodb+srv://belucha:ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
PORT=3001
NODE_ENV=production
```

**Önemli Notlar:**
- `PAYLOAD_PUBLIC_SERVER_URL` Railway'in verdiği URL olmalı (deploy sonrası alacaksınız)
- İlk deploy'da geçici bir URL verin, sonra güncelleyin
- MongoDB şifresinde özel karakterler varsa URL encode edin

### Adım 3: Root Directory Ayarları

Railway Dashboard → Service → Settings → **Root Directory:**

```
apps/cms/payload
```

### Adım 4: Deploy

1. **Deploy** butonuna tıklayın
2. Logları izleyin
3. Başarılı olursa, Railway size bir URL verecek (örn: `https://belucha-cms.railway.app`)

### Adım 5: URL'i Güncelleyin

1. Railway'den aldığınız URL'i kopyalayın
2. Railway Variables'da `PAYLOAD_PUBLIC_SERVER_URL`'i güncelleyin
3. Redeploy yapın

---

## 🔍 Beklenen Log Çıktısı

Deploy başarılı olduğunda şu logları görmelisiniz:

```
✅ Loaded .env from: ...
✅ PAYLOAD_SECRET loaded: ...
🔑 Secret key set: ...
✅ MongoDB connection established
✅ Payload CMS initialized successfully
✅ Routes registered: /admin, /api, /api/graphql
✅ Server running at http://0.0.0.0:3001
```

**Not:** Railway otomatik olarak port'u ayarlar, `PORT` environment variable'ını kullanır.

---

## 🧪 Test Etme

### 1. Payload CMS Test

Railway'den aldığınız URL ile:

- **Admin Panel:** `https://belucha-cms.railway.app/admin`
- **GraphQL API:** `https://belucha-cms.railway.app/api/graphql`

### 2. Vercel Environment Variables Güncelleme

Payload CMS deploy edildikten sonra, Vercel'deki environment variables'ı güncelleyin:

**Shop App:**
```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
```

**Sellercentral App:**
```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=https://belucha-cms.railway.app/api/graphql
```

Sonra redeploy yapın.

---

## ❌ Hala Sorun Varsa

### Hata: "MongoDB connection failed"

**Çözüm:**
- `PAYLOAD_MONGO_URL` değerini kontrol edin
- MongoDB şifresinin doğru olduğundan emin olun
- Connection string'de database adının (`/belucha`) olduğundan emin olun
- MongoDB Atlas IP whitelist'i kontrol edin

### Hata: "PAYLOAD_SECRET not found"

**Çözüm:**
- Railway Variables'da `PAYLOAD_SECRET` olduğundan emin olun
- En az 32 karakter olduğundan emin olun

### Hata: "Port already in use"

**Çözüm:**
- Railway otomatik port yönetimi yapar
- `PORT` environment variable'ını kaldırın veya Railway'in verdiği port'u kullanın

---

## 📋 Özet Checklist

- [x] `package.json`'daki `start` script'i düzeltildi
- [ ] Railway'de Root Directory ayarlandı: `apps/cms/payload`
- [ ] Railway'de Start Command ayarlandı: `node src/server.js` (veya boş)
- [ ] Railway Variables eklendi:
  - [ ] `PAYLOAD_SECRET`
  - [ ] `PAYLOAD_PUBLIC_SERVER_URL` (deploy sonrası güncellenecek)
  - [ ] `PAYLOAD_MONGO_URL` (gerçek şifre ile)
  - [ ] `PORT=3001`
  - [ ] `NODE_ENV=production`
- [ ] Deploy yapıldı
- [ ] Railway URL'i alındı
- [ ] `PAYLOAD_PUBLIC_SERVER_URL` güncellendi
- [ ] Redeploy yapıldı
- [ ] Payload CMS test edildi
- [ ] Vercel environment variables güncellendi
- [ ] Vercel redeploy yapıldı

---

**Son Güncelleme:** 2024

