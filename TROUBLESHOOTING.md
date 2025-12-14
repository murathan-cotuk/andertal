# 🔧 Sorun Giderme Rehberi

## ❌ Hata: "GraphQL 404 Not Found"

### Belirtiler
- Browser console'da: `Failed to load resource: the server responded with a status of 404 (Not Found)`
- GraphQL endpoint'e erişilemiyor: http://localhost:3001/api/graphql

### Olası Nedenler ve Çözümler

#### 1. Payload CMS Çalışmıyor

**Kontrol:**
```powershell
# Payload CMS'in çalıştığından emin olun
cd apps\cms\payload
npm run dev
```

**Beklenen çıktı:**
```
✅ Loaded .env from: ...
✅ MongoDB connection established
✅ Payload CMS initialized successfully
✅ Server running at http://localhost:3001
✅ GraphQL API: http://localhost:3001/api/graphql
```

**Eğer hata görüyorsanız:**
- Terminal'deki hata mesajını okuyun
- Genellikle MongoDB bağlantı hatası olur

#### 2. MongoDB Bağlantı Hatası

**Hata mesajı:**
```
❌ Error initializing Payload CMS: MongoServerError: ...
```

**Çözüm:**

1. **`.env.local` dosyasını kontrol edin:**
   ```powershell
   Get-Content apps\cms\payload\.env.local
   ```

2. **Connection string formatını kontrol edin:**
   ```env
   # ❌ YANLIŞ
   PAYLOAD_MONGO_URL=mongodb+srv://belucha:şifre@cluster.mongodb.net/?appName=Belucha
   
   # ✅ DOĞRU
   PAYLOAD_MONGO_URL=mongodb+srv://belucha:şifre@cluster.mongodb.net/belucha?retryWrites=true&w=majority
   ```

3. **MongoDB Atlas IP Whitelist:**
   - MongoDB Atlas Dashboard → Network Access
   - Add IP Address → `0.0.0.0/0` ekleyin (veya kendi IP'nizi)

4. **Şifre kontrolü:**
   - `<db_password>` yerine gerçek şifrenizi yazdınız mı?
   - Şifrede özel karakterler varsa URL encode edin

#### 3. Port Kullanımda

**Hata mesajı:**
```
❌ Port 3001 is already in use.
```

**Çözüm:**
```powershell
# Port 3001'i kullanan process'i kapat
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

#### 4. Environment Variables Yüklenmemiş

**Kontrol:**
```powershell
cd apps\cms\payload
npm run dev
```

**Eğer şu mesajı görüyorsanız:**
```
⚠️  PAYLOAD_SECRET not found in env, using default
```

**Çözüm:**
- `.env.local` dosyasının doğru konumda olduğundan emin olun: `apps/cms/payload/.env.local`
- Dosya adının `.env.local` olduğundan emin olun (`.env.local.txt` değil!)

---

## ❌ Hata: "Content Security Policy" (CSP)

### Belirtiler
```
Connecting to 'http://localhost:3001/.well-known/appspecific/com.chrome.devtools.json' 
violates the following Content Security Policy directive: "default-src 'none'".
```

### Açıklama
Bu hata **Chrome DevTools** ile ilgili bir uyarıdır ve **önemli değildir**. Uygulamanın çalışmasını etkilemez.

### Çözüm
**Hiçbir şey yapmanıza gerek yok.** Bu sadece bir uyarıdır ve görmezden gelebilirsiniz.

---

## ❌ Hata: "Cannot GET /admin"

### Belirtiler
- http://localhost:3001/admin açılmıyor
- "Cannot GET /admin" hatası görüyorsunuz

### Olası Nedenler

#### 1. Payload CMS Başlatılmamış

**Çözüm:**
```powershell
cd apps\cms\payload
npm run dev
```

#### 2. MongoDB Bağlantısı Başarısız

**Kontrol:**
- Terminal'de MongoDB bağlantı hatası var mı?
- `.env.local` dosyasındaki `PAYLOAD_MONGO_URL` doğru mu?

**Çözüm:**
- MongoDB connection string'i kontrol edin
- MongoDB servisinin çalıştığından emin olun (local MongoDB ise)
- MongoDB Atlas kullanıyorsanız, IP whitelist'i kontrol edin

#### 3. İlk Kullanıcı Oluşturulmamış

**Açıklama:**
Payload CMS ilk kez başlatıldığında, admin kullanıcısı oluşturmanız gerekir.

**Çözüm:**
1. Payload CMS çalışıyor olmalı
2. http://localhost:3001/admin adresine gidin
3. İlk kullanıcı kayıt formu açılacak
4. Email ve password girin
5. Admin panel'e giriş yapın

---

## ❌ Hata: "Tailwind Config" veya "Cannot find module"

### Belirtiler
```
Error: Cannot find module '@belucha/config/tailwind/next'
```

### Çözüm
✅ **Bu hata düzeltildi!** Tailwind config dosyaları güncellendi.

Eğer hala görüyorsanız:
```powershell
# Node modules'ı yeniden yükleyin
npm install
```

---

## 🔍 Genel Kontrol Listesi

### 1. Dosya Kontrolü

```powershell
# Tüm .env.local dosyalarının varlığını kontrol edin
Get-ChildItem -Recurse -Filter ".env.local" | Select-Object FullName
```

**Beklenen:**
- `apps/cms/payload/.env.local`
- `apps/shop/.env.local`
- `apps/sellercentral/.env.local`

### 2. MongoDB Bağlantı Testi

**MongoDB Atlas kullanıyorsanız:**
- Connection string'de database adı var mı? (`/belucha`)
- IP adresiniz whitelist'te mi?
- Şifre doğru mu?

**Local MongoDB kullanıyorsanız:**
```powershell
# MongoDB servisinin çalıştığını kontrol edin
Get-Service -Name MongoDB
```

### 3. Port Kontrolü

```powershell
# Hangi portlar kullanımda?
Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in 3000,3001,3002} | Select-Object LocalPort,OwningProcess
```

### 4. Servis Başlatma Sırası

**Doğru sıra:**
1. ✅ Payload CMS (port 3001)
2. ✅ Shop App (port 3000)
3. ✅ Sellercentral App (port 3002)

---

## 📞 Hala Sorun Varsa

1. **Terminal çıktılarını kontrol edin:**
   - Hangi serviste hata var?
   - Hata mesajı ne diyor?

2. **Log dosyalarını kontrol edin:**
   - Payload CMS terminal çıktısı
   - Next.js terminal çıktısı

3. **Environment variables'ı doğrulayın:**
   ```powershell
   # Payload CMS
   Get-Content apps\cms\payload\.env.local
   
   # Shop App
   Get-Content apps\shop\.env.local
   
   # Sellercentral App
   Get-Content apps\sellercentral\.env.local
   ```

4. **MongoDB bağlantısını test edin:**
   - MongoDB Atlas Dashboard'da cluster durumunu kontrol edin
   - Connection string'i test edin

---

**Son Güncelleme:** 2024

