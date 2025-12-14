# 🔧 404 Not Found Hatası Çözümü

## ❌ Sorun

```
Failed to load resource: the server responded with a status of 404 (Not Found)
```

Bu hata, Payload CMS'in düzgün başlatılmadığı veya route'ların kayıtlı olmadığı anlamına gelir.

---

## 🔍 Olası Nedenler

### 1. Payload CMS Çalışmıyor
- Server başlatılmamış
- Port 3001 kullanımda değil
- Process çökmüş

### 2. MongoDB Bağlantı Hatası
- MongoDB bağlantısı başarısız
- Payload CMS init edilememiş
- Route'lar kayıt edilmemiş

### 3. Config Dosyası Hatası
- `payload.config.js` hatalı
- Collections yüklenememiş
- GraphQL endpoint devre dışı

### 4. Environment Variables Eksik
- `PAYLOAD_SECRET` okunamıyor
- `PAYLOAD_MONGO_URL` yanlış
- Payload init edilemiyor

---

## ✅ Çözüm Adımları

### Adım 1: Payload CMS'in Çalıştığını Kontrol Et

```powershell
# Port 3001'i kontrol et
Get-NetTCPConnection -LocalPort 3001 -State Listen
```

**Eğer port boşsa:**
```powershell
cd apps\cms\payload
npm run dev
```

### Adım 2: Terminal Çıktısını Kontrol Et

Payload CMS başlatıldığında şu mesajları görmelisiniz:

```
✅ Loaded .env from: ...
✅ PAYLOAD_SECRET loaded: ...
🔑 Secret key set: ...
✅ MongoDB connection established
✅ Payload CMS initialized successfully
✅ Routes registered: /admin, /api, /api/graphql
✅ Server running at http://localhost:3001
✅ Admin Panel: http://localhost:3001/admin
✅ GraphQL API: http://localhost:3001/api/graphql
```

**Eğer hata görüyorsanız:**
- MongoDB bağlantı hatası → `.env.local` dosyasındaki `PAYLOAD_MONGO_URL` kontrol edin
- PAYLOAD_SECRET hatası → `.env.local` dosyasındaki `PAYLOAD_SECRET` kontrol edin
- Config hatası → `src/payload.config.js` dosyasını kontrol edin

### Adım 3: GraphQL Endpoint'i Test Et

**Tarayıcıda:**
- http://localhost:3001/api/graphql

**Beklenen:** GraphQL Playground açılmalı

**Eğer 404 görüyorsanız:**
- Payload CMS çalışmıyor demektir
- Terminal'deki hata mesajını kontrol edin

### Adım 4: Admin Panel'i Test Et

**Tarayıcıda:**
- http://localhost:3001/admin

**Beklenen:** Admin panel açılmalı veya ilk kullanıcı kayıt formu görünmeli

**Eğer 404 görüyorsanız:**
- Payload CMS init edilememiş demektir
- MongoDB bağlantısını kontrol edin

---

## 🔧 Detaylı Sorun Giderme

### Hata: "MongoDB connection failed"

**Çözüm:**
1. `.env.local` dosyasındaki `PAYLOAD_MONGO_URL` değerini kontrol edin
2. Connection string'de database adının (`/belucha`) olduğundan emin olun
3. MongoDB şifresinin doğru olduğundan emin olun
4. MongoDB Atlas kullanıyorsanız, IP whitelist'i kontrol edin

**Doğru format:**
```env
PAYLOAD_MONGO_URL=mongodb+srv://belucha:ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

### Hata: "PAYLOAD_SECRET not found"

**Çözüm:**
1. `.env.local` dosyasının doğru konumda olduğundan emin olun: `apps/cms/payload/.env.local`
2. `PAYLOAD_SECRET` değişkeninin en az 32 karakter olduğundan emin olun
3. Dosya adının `.env.local` olduğundan emin olun (`.env.local.txt` değil!)

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

---

## 🚀 Hızlı Test Komutu

Tüm kontrolleri tek seferde yapmak için:

```powershell
# 1. Port kontrolü
$port = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($port) {
    Write-Host "✅ Port 3001 aktif" -ForegroundColor Green
} else {
    Write-Host "❌ Port 3001 boş - Payload CMS çalışmıyor!" -ForegroundColor Red
    Write-Host "Başlatmak için: cd apps\cms\payload && npm run dev" -ForegroundColor Yellow
}

# 2. .env.local kontrolü
if (Test-Path "apps\cms\payload\.env.local") {
    Write-Host "✅ .env.local mevcut" -ForegroundColor Green
} else {
    Write-Host "❌ .env.local bulunamadı!" -ForegroundColor Red
}

# 3. GraphQL endpoint testi
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/graphql" -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ GraphQL endpoint erişilebilir" -ForegroundColor Green
} catch {
    Write-Host "❌ GraphQL endpoint erişilemiyor: $($_.Exception.Message)" -ForegroundColor Red
}
```

---

## 📝 CSP Uyarısı (Önemsiz)

```
Connecting to 'http://localhost:3001/.well-known/appspecific/com.chrome.devtools.json' 
violates the following Content Security Policy directive
```

**Bu uyarı önemli değil!** Chrome DevTools'un bir özelliği ve uygulamanın çalışmasını etkilemez. Görmezden gelebilirsiniz.

---

## ✅ Özet Checklist

- [ ] Payload CMS çalışıyor mu? (Port 3001 aktif mi?)
- [ ] `.env.local` dosyası mevcut mu?
- [ ] `PAYLOAD_SECRET` tanımlı mı?
- [ ] `PAYLOAD_MONGO_URL` doğru mu?
- [ ] MongoDB bağlantısı başarılı mı?
- [ ] Terminal'de hata var mı?
- [ ] GraphQL endpoint erişilebilir mi? (http://localhost:3001/api/graphql)
- [ ] Admin panel erişilebilir mi? (http://localhost:3001/admin)

---

**Son Güncelleme:** 2024

