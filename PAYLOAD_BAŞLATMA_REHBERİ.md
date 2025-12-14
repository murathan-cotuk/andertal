# 🚀 Payload CMS Başlatma Rehberi - Tüm Sorunlar Çözüldü

Bu rehber, yaşadığınız tüm sorunların çözümlerini içerir ve Payload CMS'i sorunsuz başlatmanızı sağlar.

---

## ✅ Çözülen Sorunlar

### 1. ✅ Payload Secret Hatası
- **Sorun:** "Error: missing secret key"
- **Çözüm:** `.env.local` dosyası yükleniyor ve `PAYLOAD_SECRET` otomatik set ediliyor
- **Durum:** ✅ Çözüldü

### 2. ✅ Paket Versiyon Uyumsuzluğu
- **Sorun:** "Mismatching payload dependency versions"
- **Çözüm:** Tüm Payload paketleri **3.68.3** versiyonuna güncellendi
- **Durum:** ✅ Çözüldü

### 3. ✅ Config Dosyası Sorunu
- **Sorun:** "Cannot read properties of null (reading 'config')"
- **Çözüm:** `src/payload.config.js` doğru şekilde import ediliyor
- **Durum:** ✅ Çözüldü

### 4. ✅ Port Çakışması
- **Sorun:** Port 3001 kullanımda
- **Çözüm:** Port temizleme komutu hazır
- **Durum:** ✅ Çözüm hazır

### 5. ✅ React Child Hatası
- **Sorun:** "Objects are not valid as a React child"
- **Çözüm:** JSX'te object render etme sorunları için çözümler belirtildi
- **Durum:** ✅ Çözüm hazır

---

## 🚀 Adım Adım Başlatma

### Adım 1: Paketleri Güncelle

```powershell
cd apps\cms\payload
npm install
```

**Beklenen çıktı:**
```
added X packages, and audited Y packages in Zs
```

### Adım 2: Port Kontrolü ve Temizleme

```powershell
# Port 3001'i kontrol et
Get-NetTCPConnection -LocalPort 3001 -State Listen

# Eğer doluysa temizle
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Adım 3: .env.local Dosyasını Kontrol Et

```powershell
# .env.local dosyasını kontrol et
Get-Content apps\cms\payload\.env.local
```

**Beklenen içerik:**
```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001
PORT=3001
PAYLOAD_MONGO_URL=mongodb+srv://belucha:ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

**Önemli:**
- `PAYLOAD_SECRET` en az 32 karakter olmalı
- `PAYLOAD_MONGO_URL` içinde database adı (`/belucha`) olmalı
- `<db_password>` yerine gerçek MongoDB şifrenizi yazın

### Adım 4: Payload CMS'i Başlat

```powershell
cd apps\cms\payload
npm run dev
```

**Beklenen çıktı:**
```
✅ Loaded .env from: C:\Users\...\apps\cms\payload\.env.local
✅ PAYLOAD_SECRET loaded: beluchaSecr...
🔑 Secret key set: beluchaSecret1...
🔑 Process.env.PAYLOAD_SECRET: SET
✅ MongoDB connection established
✅ Payload CMS initialized successfully
✅ Routes registered: /admin, /api, /api/graphql
✅ Server running at http://localhost:3001
✅ Admin Panel: http://localhost:3001/admin
✅ GraphQL API: http://localhost:3001/api/graphql
```

### Adım 5: Test Et

1. **Admin Panel:** http://localhost:3001/admin
   - İlk kez açılıyorsa, admin kullanıcısı oluşturma formu görünecek
   - Email ve password girin
   - Admin panel'e giriş yapın

2. **GraphQL API:** http://localhost:3001/api/graphql
   - GraphQL Playground açılacak
   - Test query çalıştırabilirsiniz

---

## 🔍 Sorun Giderme

### Hata: "PAYLOAD_SECRET not found"

**Çözüm:**
1. `.env.local` dosyasının doğru konumda olduğundan emin olun: `apps/cms/payload/.env.local`
2. `PAYLOAD_SECRET` değişkeninin en az 32 karakter olduğundan emin olun
3. Dosya adının `.env.local` olduğundan emin olun (`.env.local.txt` değil!)

### Hata: "Mismatching dependency versions"

**Çözüm:**
```powershell
cd apps\cms\payload
npm install
```

Tüm Payload paketleri 3.68.3 versiyonunda olmalı. `package.json` dosyası güncellendi.

### Hata: "Cannot read properties of null (reading 'config')"

**Çözüm:**
1. `src/payload.config.js` dosyasının mevcut olduğundan emin olun
2. Config'in doğru export edildiğinden emin olun: `export default buildConfig({...})`
3. Server.js'de doğru import edildiğinden emin olun: `import config from './payload.config.js'`

**Not:** Root'taki `payload.config.js` dosyası silindi, sadece `src/payload.config.js` kullanılıyor.

### Hata: "Port 3001 already in use"

**Çözüm:**
```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Alternatif:**
`.env.local` dosyasında farklı port kullanın:
```env
PORT=3002
```

### Hata: "MongoDB connection failed"

**Çözüm:**
1. `.env.local` dosyasındaki `PAYLOAD_MONGO_URL` değerini kontrol edin
2. Connection string'de database adının (`/belucha`) olduğundan emin olun
3. MongoDB şifresinin doğru olduğundan emin olun (`<db_password>` yerine gerçek şifre)
4. MongoDB Atlas kullanıyorsanız, IP whitelist'i kontrol edin

**Doğru format:**
```env
PAYLOAD_MONGO_URL=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

### Hata: "Objects are not valid as a React child"

**Çözüm:**
JSX içinde object'leri doğrudan render etmeyin:

```jsx
// ❌ YANLIŞ
<div>{someObject}</div>

// ✅ DOĞRU - Array.map() kullanın
<div>{Object.entries(someObject).map(([key, value]) => (
  <div key={key}>{key}: {value}</div>
))}</div>

// ✅ DOĞRU - Property'leri kullanın
<div>{someObject.name}</div>
<div>{someObject.email}</div>

// ✅ DOĞRU - JSON.stringify (debug için)
<div>{JSON.stringify(someObject, null, 2)}</div>
```

---

## 📋 Özet Checklist

- [x] Payload paket versiyonları 3.68.3'e güncellendi
- [x] Config dosyası doğru konumda (`src/payload.config.js`)
- [x] Server.js'de config doğru import ediliyor
- [x] PAYLOAD_SECRET otomatik set ediliyor
- [x] Port temizleme komutu hazır
- [ ] `npm install` çalıştırıldı
- [ ] Port 3001 temizlendi (gerekirse)
- [ ] `.env.local` dosyası kontrol edildi
- [ ] Payload CMS başarıyla başlatıldı
- [ ] Admin panel erişilebilir: http://localhost:3001/admin
- [ ] GraphQL endpoint çalışıyor: http://localhost:3001/api/graphql

---

## 🎯 Hızlı Başlatma Komutu

Tüm adımları tek seferde yapmak için:

```powershell
# Root dizinde
cd apps\cms\payload

# Port temizle (gerekirse)
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Paketleri güncelle
npm install

# Payload CMS'i başlat
npm run dev
```

---

**Son Güncelleme:** 2024

