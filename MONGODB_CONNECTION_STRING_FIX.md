# 🔧 MongoDB Connection String Düzeltme Rehberi

## 📋 Mevcut Durum

MongoDB Atlas'tan aldığınız connection string:
```
mongodb+srv://belucha:<db_password>@belucha.dijx1dj.mongodb.net/?appName=Belucha
```

## ✅ Düzeltilmiş Hali

`.env.local` dosyasına yazacağınız doğru format:
```
mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

---

## 🔍 Adım Adım Düzeltme

### Adım 1: MongoDB Şifrenizi Bulun

1. MongoDB Atlas Dashboard'a gidin: https://cloud.mongodb.com
2. **Database Access** (Sol menü) → **Database Users**
3. `belucha` kullanıcısını bulun
4. **Edit** butonuna tıklayın
5. Şifreyi görüntüleyin veya yeni şifre oluşturun

### Adım 2: Connection String'i Düzeltin

**Örnek:**
- MongoDB şifreniz: `MyP@ssw0rd123`

**Düzeltilmiş connection string:**
```
mongodb+srv://belucha:MyP@ssw0rd123@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

**Özel karakterler varsa URL encode edin:**
- Şifre: `MyP@ssw0rd!`
- Encoded: `MyP%40ssw0rd%21`
- Connection string: `mongodb+srv://belucha:MyP%40ssw0rd%21@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority`

### Adım 3: Database Adını Ekleyin

**Önemli:** Connection string'de `/belucha` database adı olmalı!

**❌ YANLIŞ:**
```
mongodb+srv://belucha:şifre@belucha.dijx1dj.mongodb.net/?appName=Belucha
```

**✅ DOĞRU:**
```
mongodb+srv://belucha:şifre@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

### Adım 4: .env.local Dosyasını Güncelleyin

1. `apps/cms/payload/.env.local` dosyasını açın
2. `PAYLOAD_MONGO_URL` satırını bulun
3. Düzeltilmiş connection string'i yapıştırın
4. Dosyayı kaydedin

**Örnek .env.local içeriği:**
```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001
PORT=3001
PAYLOAD_MONGO_URL=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
MONGODB_URI=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
DATABASE_URI=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

---

## 🔐 Özel Karakterler ve URL Encoding

Eğer MongoDB şifrenizde özel karakterler varsa, bunları URL encode etmeniz gerekir:

| Karakter | URL Encoded | Örnek |
|----------|-------------|-------|
| `@` | `%40` | `user@pass` → `user%40pass` |
| `!` | `%21` | `pass!` → `pass%21` |
| `#` | `%23` | `pass#` → `pass%23` |
| `$` | `%24` | `pass$` → `pass%24` |
| `%` | `%25` | `pass%` → `pass%25` |
| `&` | `%26` | `pass&` → `pass%26` |
| `+` | `%2B` | `pass+` → `pass%2B` |
| `=` | `%3D` | `pass=` → `pass%3D` |

**Online URL Encoder:**
- https://www.urlencoder.org/

---

## ✅ Doğrulama

### 1. Dosyayı Kontrol Edin

```powershell
Get-Content apps\cms\payload\.env.local
```

**Kontrol edilecekler:**
- ✅ `<db_password>` yerine gerçek şifre var mı?
- ✅ Connection string'de `/belucha` database adı var mı?
- ✅ `?retryWrites=true&w=majority` parametreleri var mı?

### 2. Payload CMS'i Başlatın

```powershell
cd apps\cms\payload
npm run dev
```

**Beklenen çıktı:**
```
✅ Loaded .env from: ...
✅ MongoDB connection established
✅ Payload CMS initialized successfully
✅ Server running at http://localhost:3001
```

**Eğer hata görüyorsanız:**
- Connection string'i tekrar kontrol edin
- MongoDB şifresinin doğru olduğundan emin olun
- IP whitelist'i kontrol edin (MongoDB Atlas)

---

## 🆘 Hala Çalışmıyorsa

### MongoDB Atlas IP Whitelist

1. MongoDB Atlas Dashboard → **Network Access**
2. **Add IP Address**
3. `0.0.0.0/0` ekleyin (tüm IP'ler için) veya kendi IP'nizi ekleyin
4. **Confirm** butonuna tıklayın

### Connection String Test

MongoDB Compass veya mongosh ile test edin:

```bash
mongosh "mongodb+srv://belucha:ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority"
```

Başarılı olursa, connection string doğrudur.

---

## 📝 Özet

1. ✅ MongoDB şifrenizi bulun
2. ✅ Connection string'de `<db_password>` yerine gerçek şifreyi yazın
3. ✅ Database adını ekleyin: `/belucha`
4. ✅ Parametreleri ekleyin: `?retryWrites=true&w=majority`
5. ✅ Özel karakterler varsa URL encode edin
6. ✅ `.env.local` dosyasını kaydedin
7. ✅ Payload CMS'i başlatın ve test edin

---

**Son Güncelleme:** 2024

