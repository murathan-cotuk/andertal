# 🔧 Payload CMS - Tüm Sorunların Çözümü

Bu dokümantasyon, Payload CMS'de yaşanan tüm sorunların çözümlerini içerir.

---

## ✅ 1. Payload Secret Hatası Çözüldü 

### Sorun
```
Error: missing secret key. A secret key is needed to secure Payload
```

### Çözüm
`server.js` dosyasında `.env.local` dosyası yükleniyor ve `PAYLOAD_SECRET` kontrol ediliyor:

```javascript
// .env.local dosyası yükleniyor
dotenv.config({ path: envPath, override: false })

// PAYLOAD_SECRET kontrolü ve set edilmesi
const secret = process.env.PAYLOAD_SECRET || 'beluchaSecret123'
if (!process.env.PAYLOAD_SECRET) {
  console.warn('⚠️  PAYLOAD_SECRET not found in env, using default')
  process.env.PAYLOAD_SECRET = secret
}

// payload.init() öncesi tekrar set ediliyor
process.env.PAYLOAD_SECRET = secretKey
```

**Kontrol:**
- ✅ `.env.local` dosyası `apps/cms/payload/.env.local` konumunda
- ✅ `PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890` (min 32 karakter)

---

## ✅ 2. Paket Versiyon Sorunları Çözüldü

### Sorun
```
Mismatching "payload" dependency versions found: 
@payloadcms/richtext-lexical@3.64.0 (Please change this to 3.68.3)
```

### Çözüm
Tüm Payload paketleri **3.68.3** versiyonuna güncellendi:

```json
{
  "dependencies": {
    "@payloadcms/db-mongodb": "^3.68.3",
    "@payloadcms/plugin-stripe": "^3.68.3",
    "@payloadcms/richtext-lexical": "^3.68.3",
    "payload": "^3.68.3"
  }
}
```

**Yapılacaklar:**
```powershell
cd apps\cms\payload
npm install
```

---

## ✅ 3. Payload Config Sorunu Çözüldü

### Sorun
```
TypeError: Cannot read properties of null (reading 'config')
```

### Çözüm
`server.js` dosyasında config doğru şekilde import ediliyor:

```javascript
import config from './payload.config.js'

await payload.init({
  secret: secretKey,
  express: app,
  config,  // Config doğru şekilde geçiliyor
  onInit: async () => {
    // ...
  },
})
```

**Kontrol:**
- ✅ `src/payload.config.js` dosyası mevcut
- ✅ Config doğru export ediliyor: `export default buildConfig({...})`
- ✅ Server.js'de doğru import ediliyor: `import config from './payload.config.js'`

---

## ✅ 4. Port Çakışması Kontrolü

### Sorun
Port 3001 kullanımda, server başlatılamıyor.

### Çözüm
Port kontrolü ve temizleme komutu:

```powershell
# Port 3001'i kullanan process'i kapat
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Alternatif:**
`.env.local` dosyasında farklı port kullanın:
```env
PORT=3002
```

---

## ✅ 5. React Child Hatası (JSX Object Render)

### Sorun
```
Objects are not valid as a React child
```

### Çözüm
JSX içinde object'leri doğrudan render etmeyin. İki yöntem:

**Yöntem 1: Array.map() kullanın**
```jsx
// ❌ YANLIŞ
<div>{someObject}</div>

// ✅ DOĞRU
<div>{Object.entries(someObject).map(([key, value]) => (
  <div key={key}>{key}: {value}</div>
))}</div>
```

**Yöntem 2: JSON.stringify() kullanın**
```jsx
// ✅ DOĞRU (debug için)
<div>{JSON.stringify(someObject, null, 2)}</div>
```

**Yöntem 3: Object'in property'lerini kullanın**
```jsx
// ✅ DOĞRU
<div>{someObject.name}</div>
<div>{someObject.email}</div>
```

---

## 🚀 Payload CMS Başlatma Adımları

### Adım 1: Paketleri Güncelle
```powershell
cd apps\cms\payload
npm install
```

### Adım 2: Port Kontrolü
```powershell
# Port 3001 boş mu kontrol et
Get-NetTCPConnection -LocalPort 3001 -State Listen

# Eğer doluysa temizle
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Adım 3: .env.local Kontrolü
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

### Adım 4: Payload CMS'i Başlat
```powershell
cd apps\cms\payload
npm run dev
```

**Beklenen çıktı:**
```
✅ Loaded .env from: ...
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
- **Admin Panel:** http://localhost:3001/admin
- **GraphQL API:** http://localhost:3001/api/graphql

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

Tüm Payload paketleri 3.68.3 versiyonunda olmalı.

### Hata: "Cannot read properties of null (reading 'config')"
**Çözüm:**
1. `src/payload.config.js` dosyasının mevcut olduğundan emin olun
2. Config'in doğru export edildiğinden emin olun: `export default buildConfig({...})`
3. Server.js'de doğru import edildiğinden emin olun: `import config from './payload.config.js'`

### Hata: "Port 3001 already in use"
**Çözüm:**
```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Hata: "MongoDB connection failed"
**Çözüm:**
1. `.env.local` dosyasındaki `PAYLOAD_MONGO_URL` değerini kontrol edin
2. Connection string'de database adının (`/belucha`) olduğundan emin olun
3. MongoDB şifresinin doğru olduğundan emin olun
4. MongoDB Atlas kullanıyorsanız, IP whitelist'i kontrol edin

---

## 📝 Özet Checklist

- [x] Payload Secret hatası çözüldü
- [x] Paket versiyonları 3.68.3'e güncellendi
- [x] Payload Config doğru import ediliyor
- [x] Port kontrolü ve temizleme komutu hazır
- [x] React Child hatası için çözümler belirtildi
- [ ] `npm install` çalıştırıldı
- [ ] Payload CMS başarıyla başlatıldı
- [ ] Admin panel erişilebilir: http://localhost:3001/admin
- [ ] GraphQL endpoint çalışıyor: http://localhost:3001/api/graphql

---

**Son Güncelleme:** 2024

