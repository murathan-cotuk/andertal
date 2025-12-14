# 🔧 Belucha Setup Checklist

Bu dosya, projenin ilk kurulumu için gerekli adımları içerir.

## ✅ 1. Environment Variables (.env.local dosyaları)

### A) Payload CMS - `apps/cms/payload/.env.local`

Bu dosyayı oluşturun:

```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001
PORT=3001
PAYLOAD_MONGO_URL=mongodb://localhost:27017/belucha
```

**MongoDB Atlas kullanıyorsanız:**
```env
PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3001
PORT=3001
PAYLOAD_MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/belucha?retryWrites=true&w=majority
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/belucha?retryWrites=true&w=majority
DATABASE_URI=mongodb+srv://username:password@cluster.mongodb.net/belucha?retryWrites=true&w=majority
```

### B) Shop App - `apps/shop/.env.local`

```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

### C) Sellercentral App - `apps/sellercentral/.env.local`

```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

### D) Root - `.env.local` (opsiyonel, Stripe server-side için)

```env
STRIPE_SECRET_KEY=sk_test_your_key_here
```

## ✅ 2. MongoDB Kurulumu

### Seçenek A: Local MongoDB

1. MongoDB'yi bilgisayarınıza kurun
2. MongoDB servisini başlatın
3. `.env.local` dosyasında `mongodb://localhost:27017/belucha` kullanın

### Seçenek B: MongoDB Atlas (Önerilen)

1. [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) hesabı oluşturun
2. Cluster oluşturun (Free tier yeterli)
3. Database User oluşturun
4. Network Access'te IP adresinizi ekleyin (0.0.0.0/0 tüm IP'ler için)
5. Connection string'i kopyalayın ve `.env.local` dosyasına ekleyin
6. **ÖNEMLİ:** Connection string'e database adını ekleyin: `/belucha`

## ✅ 3. Dependencies Kurulumu

Root dizinde:

```bash
npm install
```

Bu komut tüm workspace'lerdeki paketleri kurar.

## ✅ 4. Servisleri Başlatma

### Development Mode (Tüm servisler)

Root dizinde:

```bash
npm run dev
```

Bu komut:
- Payload CMS'i port 3001'de başlatır
- Shop app'i port 3000'de başlatır
- Sellercentral app'i port 3002'de başlatır

### Tek Tek Başlatma

**Payload CMS:**
```bash
cd apps/cms/payload
npm run dev
```

**Shop App:**
```bash
cd apps/shop
npm run dev
```

**Sellercentral App:**
```bash
cd apps/sellercentral
npm run dev
```

## ✅ 5. İlk Admin Kullanıcısı Oluşturma

1. Payload CMS çalıştıktan sonra: http://localhost:3001/admin
2. İlk kullanıcı kaydı formu açılacak
3. Email ve password girin
4. Admin panel'e giriş yapın

## ✅ 6. Test

### Payload CMS
- ✅ http://localhost:3001/admin - Admin panel açılıyor mu?
- ✅ http://localhost:3001/api/graphql - GraphQL endpoint çalışıyor mu?

### Shop App
- ✅ http://localhost:3000 - Ana sayfa açılıyor mu?
- ✅ http://localhost:3000/login - Login sayfası açılıyor mu?

### Sellercentral App
- ✅ http://localhost:3002 - Dashboard açılıyor mu?

## ❌ Yaygın Hatalar ve Çözümleri

### Hata: "Cannot find module '@belucha/config/tailwind/next'"
**Çözüm:** Tailwind config dosyaları güncellendi, artık bu hatayı vermemeli.

### Hata: "Cannot GET /admin"
**Çözüm:** 
1. Payload CMS'in çalıştığından emin olun
2. `.env.local` dosyasının doğru konumda olduğunu kontrol edin
3. MongoDB bağlantısını kontrol edin

### Hata: "MongoDB connection failed"
**Çözüm:**
1. MongoDB'nin çalıştığından emin olun (local ise)
2. MongoDB Atlas kullanıyorsanız, IP adresinizin whitelist'te olduğundan emin olun
3. Connection string'de database adının olduğundan emin olun (`/belucha`)

### Hata: "Port already in use"
**Çözüm:**
```powershell
# Port 3001'i kullanan process'i bul ve kapat
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## 📝 Notlar

- `.env.local` dosyaları git'e commit edilmemeli (zaten .gitignore'da)
- Her app'in kendi `.env.local` dosyası olmalı
- MongoDB connection string'de database adı (`/belucha`) mutlaka olmalı
- PAYLOAD_SECRET minimum 32 karakter olmalı

