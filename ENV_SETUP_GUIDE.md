# 📋 .env.local Dosyaları - Detaylı Kurulum Rehberi

Bu rehber, Belucha projesi için tüm `.env.local` dosyalarının nasıl oluşturulacağını adım adım açıklar.

---

## 🎯 Genel Bakış

Projede **3 adet** `.env.local` dosyası oluşturmanız gerekiyor:

1. **Payload CMS** - `apps/cms/payload/.env.local`
2. **Shop App** - `apps/shop/.env.local`
3. **Sellercentral App** - `apps/sellercentral/.env.local`

---

## 📁 1. Payload CMS - `.env.local` Dosyası

### Konum
```
belucha/
└── apps/
    └── cms/
        └── payload/
            └── .env.local  ← Buraya
```

### Adım Adım Oluşturma

#### Adım 1: Dosyayı Oluşturun

**Windows (PowerShell):**
```powershell
cd C:\Users\Lenovo\Desktop\Ortam\Yazilim\belucha\apps\cms\payload
notepad .env.local
```

**Veya VS Code ile:**
```powershell
cd apps\cms\payload
code .env.local
```

#### Adım 2: İçeriği Yapıştırın

**MongoDB Atlas Kullanıyorsanız (Önerilen):**

```env
# Payload CMS Secret Key (Minimum 32 karakter)
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890

# Payload CMS Public URL
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001

# Server Port
PORT=3001

# MongoDB Connection String - ÖNEMLİ: <db_password> yerine gerçek şifrenizi yazın!
PAYLOAD_MONGO_URL=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ_BURAYA@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority

# Alternatif MongoDB Variables (Payload CMS bunları da kabul eder)
MONGODB_URI=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ_BURAYA@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
DATABASE_URI=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ_BURAYA@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

**Local MongoDB Kullanıyorsanız:**

```env
# Payload CMS Secret Key (Minimum 32 karakter)
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890

# Payload CMS Public URL
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001

# Server Port
PORT=3001

# Local MongoDB Connection String
PAYLOAD_MONGO_URL=mongodb://localhost:27017/belucha
```

#### Adım 3: MongoDB Connection String Düzeltmesi

**MongoDB Atlas'tan aldığınız connection string:**
```
mongodb+srv://belucha:<db_password>@belucha.dijx1dj.mongodb.net/?appName=Belucha
```

**Düzeltilmiş hali (`.env.local` dosyasına yazacağınız):**
```
mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

**Değişiklikler:**
1. `<db_password>` → Gerçek MongoDB şifrenizi yazın
2. `/?appName=Belucha` → `/belucha?retryWrites=true&w=majority` olarak değiştirin
   - Database adı eklendi: `/belucha`
   - Standart parametreler eklendi: `?retryWrites=true&w=majority`

#### Adım 4: Özel Karakterler İçin URL Encoding

Eğer MongoDB şifrenizde özel karakterler varsa (örn: `!`, `@`, `#`, `%`), bunları URL encode etmeniz gerekir:

| Karakter | URL Encoded |
|----------|-------------|
| `!` | `%21` |
| `@` | `%40` |
| `#` | `%23` |
| `$` | `%24` |
| `%` | `%25` |
| `&` | `%26` |
| `+` | `%2B` |
| `=` | `%3D` |

**Örnek:**
- Şifre: `MyP@ssw0rd!`
- Encoded: `MyP%40ssw0rd%21`
- Connection string: `mongodb+srv://belucha:MyP%40ssw0rd%21@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority`

#### Adım 5: Dosyayı Kaydedin

- `Ctrl + S` ile kaydedin
- Dosya adının `.env.local` olduğundan emin olun (`.env.local.txt` değil!)

#### Adım 6: Doğrulama

Dosyanın doğru oluşturulduğunu kontrol edin:

```powershell
# PowerShell'de
Get-Content apps\cms\payload\.env.local
```

**Beklenen çıktı:**
```
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001
PORT=3001
PAYLOAD_MONGO_URL=mongodb+srv://belucha:ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

---

## 📁 2. Shop App - `.env.local` Dosyası

### Konum
```
belucha/
└── apps/
    └── shop/
        └── .env.local  ← Buraya
```

### Adım Adım Oluşturma

#### Adım 1: Dosyayı Oluşturun

```powershell
cd C:\Users\Lenovo\Desktop\Ortam\Yazilim\belucha\apps\shop
notepad .env.local
```

#### Adım 2: İçeriği Yapıştırın

```env
# Payload CMS GraphQL Endpoint
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql

# Stripe Publishable Key (Test mode için pk_test_ ile başlar)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

**Not:** Stripe key'iniz yoksa şimdilik `pk_test_your_key_here` bırakabilirsiniz, sonra güncellersiniz.

#### Adım 3: Dosyayı Kaydedin

- `Ctrl + S` ile kaydedin

#### Adım 4: Doğrulama

```powershell
Get-Content apps\shop\.env.local
```

**Beklenen çıktı:**
```
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

---

## 📁 3. Sellercentral App - `.env.local` Dosyası

### Konum
```
belucha/
└── apps/
    └── sellercentral/
        └── .env.local  ← Buraya
```

### Adım Adım Oluşturma

#### Adım 1: Dosyayı Oluşturun

```powershell
cd C:\Users\Lenovo\Desktop\Ortam\Yazilim\belucha\apps\sellercentral
notepad .env.local
```

#### Adım 2: İçeriği Yapıştırın

```env
# Payload CMS GraphQL Endpoint
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql

# Stripe Publishable Key (Test mode için pk_test_ ile başlar)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

#### Adım 3: Dosyayı Kaydedin

- `Ctrl + S` ile kaydedin

#### Adım 4: Doğrulama

```powershell
Get-Content apps\sellercentral\.env.local
```

---

## ✅ Tüm Dosyaları Kontrol Etme

Tüm `.env.local` dosyalarının oluşturulduğunu kontrol edin:

```powershell
# Root dizinde
cd C:\Users\Lenovo\Desktop\Ortam\Yazilim\belucha

# Tüm .env.local dosyalarını listele
Get-ChildItem -Recurse -Filter ".env.local" | Select-Object FullName
```

**Beklenen çıktı:**
```
FullName
--------
C:\Users\Lenovo\Desktop\Ortam\Yazilim\belucha\apps\cms\payload\.env.local
C:\Users\Lenovo\Desktop\Ortam\Yazilim\belucha\apps\shop\.env.local
C:\Users\Lenovo\Desktop\Ortam\Yazilim\belucha\apps\sellercentral\.env.local
```

---

## 🔍 Hata Ayıklama

### Hata: "GraphQL 404 Not Found"

**Neden:** Payload CMS çalışmıyor veya MongoDB bağlantısı başarısız.

**Çözüm:**

1. **Payload CMS'in çalıştığından emin olun:**
   ```powershell
   cd apps\cms\payload
   npm run dev
   ```

2. **Beklenen çıktı:**
   ```
   ✅ Loaded .env from: ...
   ✅ MongoDB connection established
   ✅ Payload CMS initialized successfully
   ✅ Server running at http://localhost:3001
   ✅ Admin Panel: http://localhost:3001/admin
   ✅ GraphQL API: http://localhost:3001/api/graphql
   ```

3. **Eğer MongoDB bağlantı hatası görüyorsanız:**
   - `.env.local` dosyasındaki `PAYLOAD_MONGO_URL` değerini kontrol edin
   - MongoDB şifresinin doğru olduğundan emin olun
   - Connection string'de database adının (`/belucha`) olduğundan emin olun
   - MongoDB Atlas kullanıyorsanız, IP adresinizin whitelist'te olduğundan emin olun

### Hata: "MongoDB connection failed"

**Çözüm:**

1. **MongoDB Atlas IP Whitelist:**
   - MongoDB Atlas Dashboard'a gidin
   - Network Access → Add IP Address
   - `0.0.0.0/0` ekleyin (tüm IP'ler için) veya kendi IP'nizi ekleyin

2. **Connection String Kontrolü:**
   ```env
   # ❌ YANLIŞ (database adı yok)
   PAYLOAD_MONGO_URL=mongodb+srv://belucha:şifre@cluster.mongodb.net/?appName=Belucha
   
   # ✅ DOĞRU (database adı var: /belucha)
   PAYLOAD_MONGO_URL=mongodb+srv://belucha:şifre@cluster.mongodb.net/belucha?retryWrites=true&w=majority
   ```

3. **Şifre Kontrolü:**
   - MongoDB Atlas → Database Access
   - Kullanıcı adı ve şifreyi kontrol edin
   - Şifrede özel karakterler varsa URL encode edin

### Hata: "Port 3001 already in use"

**Çözüm:**

```powershell
# Port 3001'i kullanan process'i kapat
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 📝 Özet Checklist

- [ ] `apps/cms/payload/.env.local` oluşturuldu
- [ ] `PAYLOAD_SECRET` en az 32 karakter
- [ ] `PAYLOAD_MONGO_URL` doğru format (database adı `/belucha` var)
- [ ] MongoDB şifresi doğru yazıldı (`<db_password>` yerine gerçek şifre)
- [ ] `apps/shop/.env.local` oluşturuldu
- [ ] `apps/sellercentral/.env.local` oluşturuldu
- [ ] Tüm dosyalar `.env.local` olarak kaydedildi (`.txt` değil!)
- [ ] Payload CMS başlatıldı ve MongoDB bağlantısı başarılı
- [ ] GraphQL endpoint çalışıyor: http://localhost:3001/api/graphql

---

## 🚀 Sonraki Adımlar

1. Tüm `.env.local` dosyalarını oluşturduktan sonra:
   ```powershell
   # Payload CMS'i başlat
   cd apps\cms\payload
   npm run dev
   ```

2. Başarılı olduğunu kontrol edin:
   - Tarayıcıda: http://localhost:3001/admin
   - GraphQL endpoint: http://localhost:3001/api/graphql

3. Diğer servisleri başlatın:
   ```powershell
   # Yeni terminal - Shop App
   cd apps\shop
   npm run dev
   
   # Yeni terminal - Sellercentral App
   cd apps\sellercentral
   npm run dev
   ```

---

## ⚠️ Önemli Notlar

1. **`.env.local` dosyaları git'e commit edilmemeli** (zaten `.gitignore`'da)
2. **Her app'in kendi `.env.local` dosyası olmalı**
3. **MongoDB connection string'de database adı (`/belucha`) mutlaka olmalı**
4. **`PAYLOAD_SECRET` minimum 32 karakter olmalı**
5. **Dosya adı `.env.local` olmalı, `.env.local.txt` değil!**

---

**Son Güncelleme:** 2024

