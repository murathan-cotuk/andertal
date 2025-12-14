# 🔧 MongoDB Connection String Güncelleme

## 📋 Mevcut Durum

MongoDB paketi kurulu ✅
- `mongodb` paketi `package.json`'a eklendi
- `npm install` tamamlandı

## ⚠️ Connection String Düzeltmesi Gerekli

### Mevcut Connection String (MongoDB Atlas'tan aldığınız):
```
mongodb+srv://belucha:<db_password>@belucha.dijx1dj.mongodb.net/?appName=Belucha
```

### Düzeltilmiş Hali (.env.local dosyasına yazılacak):
```
mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

---

## 🔍 Adım Adım Düzeltme

### Adım 1: MongoDB Şifresini Bulun

1. MongoDB Atlas Dashboard'a gidin: https://cloud.mongodb.com
2. **Database Access** (Sol menü) → **Database Users**
3. `belucha` kullanıcısını bulun
4. **Edit** butonuna tıklayın
5. Şifreyi görüntüleyin veya yeni şifre oluşturun

### Adım 2: .env.local Dosyasını Açın

```powershell
# VS Code ile aç
code apps\cms\payload\.env.local

# Veya Notepad ile
notepad apps\cms\payload\.env.local
```

### Adım 3: Connection String'i Düzeltin

**Bulun:**
```env
PAYLOAD_MONGO_URL=mongodb+srv://belucha:<db_password>@belucha.dijx1dj.mongodb.net/?appName=Belucha
```

**Değiştirin:**
```env
PAYLOAD_MONGO_URL=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
MONGODB_URI=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
DATABASE_URI=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

**Değişiklikler:**
1. ✅ `<db_password>` → Gerçek MongoDB şifrenizi yazın
2. ✅ `/?appName=Belucha` → `/belucha?retryWrites=true&w=majority`
   - Database adı eklendi: `/belucha`
   - Standart parametreler eklendi: `?retryWrites=true&w=majority`

### Adım 4: Özel Karakterler İçin URL Encoding

Eğer MongoDB şifrenizde özel karakterler varsa:

| Karakter | URL Encoded |
|----------|-------------|
| `@` | `%40` |
| `!` | `%21` |
| `#` | `%23` |
| `$` | `%24` |
| `%` | `%25` |
| `&` | `%26` |

**Örnek:**
- Şifre: `MyP@ssw0rd!`
- Encoded: `MyP%40ssw0rd%21`
- Connection string: `mongodb+srv://belucha:MyP%40ssw0rd%21@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority`

### Adım 5: Dosyayı Kaydedin

- `Ctrl + S` ile kaydedin
- Dosya adının `.env.local` olduğundan emin olun

---

## ✅ Test Etme

### Adım 1: Payload CMS'i Başlatın

```powershell
cd apps\cms\payload
npm run dev
```

### Beklenen Çıktı:

```
✅ Loaded .env from: ...
✅ PAYLOAD_SECRET loaded: ...
🔑 Secret key set: ...
✅ MongoDB connection established
✅ Payload CMS initialized successfully
✅ Routes registered: /admin, /api, /api/graphql
✅ Server running at http://localhost:3001
```

**Eğer MongoDB bağlantı hatası görüyorsanız:**
- Connection string'deki şifreyi kontrol edin
- Database adının (`/belucha`) olduğundan emin olun
- MongoDB Atlas IP whitelist'i kontrol edin

---

## 🔐 MongoDB Atlas IP Whitelist

1. MongoDB Atlas Dashboard → **Network Access**
2. **Add IP Address**
3. `0.0.0.0/0` ekleyin (tüm IP'ler için) veya kendi IP'nizi ekleyin
4. **Confirm** butonuna tıklayın

---

## 📝 Özet Checklist

- [x] `mongodb` paketi kuruldu
- [x] `npm install` tamamlandı
- [ ] MongoDB şifresi bulundu
- [ ] `.env.local` dosyası açıldı
- [ ] `PAYLOAD_MONGO_URL` güncellendi
- [ ] Gerçek şifre yazıldı
- [ ] Database adı (`/belucha`) eklendi
- [ ] Parametreler (`?retryWrites=true&w=majority`) eklendi
- [ ] Dosya kaydedildi
- [ ] Payload CMS başlatıldı
- [ ] MongoDB bağlantısı başarılı

---

**Son Güncelleme:** 2024

