# 🚀 Hızlı Düzeltme Rehberi

## ✅ Yapılan Düzeltmeler

### 1. Tailwind Config Hatası Düzeltildi
- `apps/shop/tailwind.config.js` - Artık `@belucha/config` bağımlılığı yok
- `apps/sellercentral/tailwind.config.js` - Artık `@belucha/config` bağımlılığı yok

### 2. Environment Variables Kontrolü

Aşağıdaki dosyaların mevcut olduğundan emin olun:

#### `apps/cms/payload/.env.local`
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

#### `apps/shop/.env.local`
```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

#### `apps/sellercentral/.env.local`
```env
NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL=http://localhost:3001/api/graphql
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

## 🔧 Adım Adım Çözüm

### 1. MongoDB Kontrolü

**Local MongoDB kullanıyorsanız:**
```powershell
# MongoDB servisinin çalıştığından emin olun
Get-Service -Name MongoDB
```

**MongoDB Atlas kullanıyorsanız:**
- Connection string'inizde database adı (`/belucha`) olduğundan emin olun
- IP adresinizin whitelist'te olduğundan emin olun

### 2. Payload CMS'i Başlatma

```powershell
cd apps/cms/payload
npm run dev
```

**Beklenen çıktı:**
```
✅ Loaded .env from: ...
✅ MongoDB connection established
✅ Payload CMS initialized successfully
✅ Server running at http://localhost:3001
✅ Admin Panel: http://localhost:3001/admin
```

### 3. Shop App'i Başlatma

Yeni bir terminal:
```powershell
cd apps/shop
npm run dev
```

### 4. Sellercentral App'i Başlatma

Yeni bir terminal:
```powershell
cd apps/sellercentral
npm run dev
```

## ❌ Hala Sorun Varsa

### "Cannot GET /admin" Hatası

1. **Payload CMS çalışıyor mu?**
   - Terminal'de hata var mı kontrol edin
   - Port 3001 kullanımda mı kontrol edin

2. **MongoDB Bağlantısı:**
   ```powershell
   # MongoDB bağlantısını test edin
   # Local MongoDB için:
   mongosh mongodb://localhost:27017/belucha
   
   # Atlas için connection string'inizi test edin
   ```

3. **Environment Variables:**
   - `.env.local` dosyasının doğru konumda olduğundan emin olun
   - Değişkenlerin doğru yazıldığından emin olun

### Port Kullanımda Hatası

```powershell
# Port 3001'i kullanan process'i bul ve kapat
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Port 3000 için
Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Port 3002 için
Get-NetTCPConnection -LocalPort 3002 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## 📝 Test Checklist

- [ ] Payload CMS çalışıyor: http://localhost:3001/admin
- [ ] GraphQL endpoint çalışıyor: http://localhost:3001/api/graphql
- [ ] Shop app çalışıyor: http://localhost:3000
- [ ] Sellercentral app çalışıyor: http://localhost:3002
- [ ] MongoDB bağlantısı başarılı
- [ ] Environment variables doğru yapılandırılmış

## 🆘 Hala Çalışmıyorsa

1. Tüm terminal'leri kapatın
2. `node_modules` klasörlerini silin (opsiyonel)
3. `npm install` çalıştırın
4. `.env.local` dosyalarını kontrol edin
5. MongoDB bağlantısını test edin
6. Servisleri tek tek başlatın ve hata mesajlarını kontrol edin

