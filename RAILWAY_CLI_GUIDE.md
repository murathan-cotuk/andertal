# 🚂 Railway CLI Kullanım Rehberi

## 📋 Railway CLI Kurulumu

```powershell
npm i -g @railway/cli
```

---

## 🔐 Railway Login

Railway CLI'ye giriş yapmak için:

```powershell
railway login
```

Bu komut:
1. Tarayıcınızı açacak
2. Railway hesabınızla giriş yapmanızı isteyecek
3. Terminal'e token döndürecek

**Not:** Eğer zaten giriş yaptıysanız, bu adımı atlayabilirsiniz.

---

## 🔗 Projeyi Railway'e Bağlama

### Yöntem 1: Project ID ile Link

```powershell
cd apps/cms/payload
railway link -p 9bffb670-e263-4c23-8f21-fea559263c92
```

**Project ID nereden bulunur?**
- Railway Dashboard → Project Settings → General → Project ID

### Yöntem 2: Interaktif Link

```powershell
cd apps/cms/payload
railway link
```

Bu komut:
1. Railway hesabınızdaki projeleri listeleyecek
2. Bağlamak istediğiniz projeyi seçmenizi isteyecek

---

## 📤 Environment Variables Yönetimi

### Variables Listesi

```powershell
railway variables
```

### Variable Ekleme

```powershell
railway variables set PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
railway variables set PAYLOAD_PUBLIC_SERVER_URL=https://beluchacms-production.up.railway.app
railway variables set PAYLOAD_MONGO_URL=mongodb+srv://belucha:ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
railway variables set NODE_ENV=production
```

### Variable Silme

```powershell
railway variables unset VARIABLE_NAME
```

### Tüm Variables'ı Görüntüleme

```powershell
railway variables
```

---

## 🚀 Deploy İşlemleri

### Manuel Deploy

```powershell
railway up
```

Bu komut:
1. Mevcut dizindeki kodu Railway'e deploy eder
2. Build ve start işlemlerini başlatır

### Deploy Loglarını İzleme

```powershell
railway logs
```

### Deploy Loglarını Canlı İzleme

```powershell
railway logs --follow
```

---

## 📊 Railway CLI Komutları

### Genel Komutlar

```powershell
# Railway CLI versiyonu
railway --version

# Yardım
railway --help

# Login durumu
railway whoami

# Proje bilgileri
railway status
```

### Service Yönetimi

```powershell
# Service listesi
railway service

# Service seçme
railway service select SERVICE_NAME

# Service oluşturma
railway service create SERVICE_NAME
```

### Environment Yönetimi

```powershell
# Environment listesi
railway environment

# Environment seçme
railway environment select ENVIRONMENT_NAME

# Environment oluşturma
railway environment create ENVIRONMENT_NAME
```

---

## 🔧 Railway Projesi Ayarları

### Root Directory Ayarlama

Railway Dashboard → Service → Settings → Root Directory:
```
apps/cms/payload
```

### Start Command Ayarlama

Railway Dashboard → Service → Settings → Start Command:
```
node src/server.js
```

Veya boş bırakın (package.json'daki `start` script'i kullanılacak).

---

## 📝 Örnek Workflow

### 1. İlk Kurulum

```powershell
# Railway CLI kurulumu
npm i -g @railway/cli

# Login
railway login

# Projeyi bağla
cd apps/cms/payload
railway link -p 9bffb670-e263-4c23-8f21-fea559263c92
```

### 2. Environment Variables Ekleme

```powershell
railway variables set PAYLOAD_SECRET=beluchaSecret123456789012345678901234567890
railway variables set PAYLOAD_PUBLIC_SERVER_URL=https://beluchacms-production.up.railway.app
railway variables set PAYLOAD_MONGO_URL=mongodb+srv://belucha:ŞİFRENİZ@belucha.dijx1dj.mongodb.net/belucha?retryWrites=true&w=majority
railway variables set NODE_ENV=production
```

### 3. Deploy

```powershell
railway up
```

### 4. Logları İzleme

```powershell
railway logs --follow
```

---

## 🐛 Sorun Giderme

### "Unauthorized" Hatası

```powershell
railway login
```

### "Project not found" Hatası

```powershell
# Proje listesini kontrol et
railway projects

# Doğru project ID ile link et
railway link -p PROJECT_ID
```

### "Service not found" Hatası

```powershell
# Service listesini kontrol et
railway service

# Doğru service'i seç
railway service select SERVICE_NAME
```

---

## 📚 Railway CLI Dokümantasyonu

Daha fazla bilgi için:
- [Railway CLI Docs](https://docs.railway.app/develop/cli)
- [Railway Dashboard](https://railway.app)

---

**Son Güncelleme:** 2024

