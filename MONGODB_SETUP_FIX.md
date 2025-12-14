# 🔧 MongoDB Kurulum ve Bağlantı Düzeltmesi

## ✅ Yapılan İşlemler

### 1. MongoDB Driver Paketi Eklendi
- `mongodb` paketi `package.json`'a eklendi
- `npm install` çalıştırıldı

### 2. Connection String Düzeltmesi

**MongoDB Atlas'tan aldığınız connection string:**
```
mongodb+srv://belucha:<db_password>@belucha.dijx1dj.mongodb.net/?appName=Belucha
```

**Düzeltilmiş hali (`.env.local` dosyasına yazılacak):**
```
mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

**Değişiklikler:**
1. `<db_password>` → Gerçek MongoDB şifrenizi yazın
2. `/?appName=Belucha` → `/belucha?retryWrites=true&w=majority` olarak değiştirin
   - Database adı eklendi: `/belucha`
   - Standart parametreler eklendi: `?retryWrites=true&w=majority`

---

## 📝 .env.local Dosyasını Güncelleyin

`apps/cms/payload/.env.local` dosyasını açın ve şu satırı bulun:

```env
PAYLOAD_MONGO_URL=mongodb+srv://belucha:<db_password>@belucha.dijx1dj.mongodb.net/?appName=Belucha
```

Şu şekilde değiştirin:

```env
PAYLOAD_MONGO_URL=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
MONGODB_URI=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
DATABASE_URI=mongodb+srv://belucha:GERÇEK_ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
```

**Önemli:**
- `GERÇEK_ŞİFRENİZ` yerine MongoDB Atlas'taki gerçek şifrenizi yazın
- Şifrede özel karakterler varsa URL encode edin:
  - `@` → `%40`
  - `!` → `%21`
  - `#` → `%23`

---

## 🔍 MongoDB Şifresini Bulma

1. MongoDB Atlas Dashboard'a gidin: https://cloud.mongodb.com
2. **Database Access** (Sol menü) → **Database Users**
3. `belucha` kullanıcısını bulun
4. **Edit** butonuna tıklayın
5. Şifreyi görüntüleyin veya yeni şifre oluşturun

---

## ✅ Test Etme

### Adım 1: .env.local Dosyasını Güncelleyin
- `PAYLOAD_MONGO_URL` değerini düzeltin
- Gerçek şifreyi yazın
- Database adını (`/belucha`) ekleyin

### Adım 2: Payload CMS'i Başlatın

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

## 📋 Özet Checklist

- [x] `mongodb` paketi `package.json`'a eklendi
- [x] `npm install` çalıştırıldı
- [ ] `.env.local` dosyasındaki `PAYLOAD_MONGO_URL` güncellendi
- [ ] Gerçek MongoDB şifresi yazıldı
- [ ] Database adı (`/belucha`) eklendi
- [ ] MongoDB Atlas IP whitelist kontrol edildi
- [ ] Payload CMS başarıyla başlatıldı
- [ ] MongoDB bağlantısı başarılı

---

**Son Güncelleme:** 2024

