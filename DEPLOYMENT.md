# 🚀 Belucha Deployment Rehberi

**Bu dosya tüm deployment işlemleri için tek kaynak rehberdir. Sürekli güncellenir.**

---

## 📋 İçindekiler

1. [Vercel Deploy Adım Adım](#vercel-deploy-adım-adım)
2. [Build Sorunları ve Çözümleri](#build-sorunları-ve-çözümleri)
3. [Environment Variables](#environment-variables)
4. [Sorun Giderme](#sorun-giderme)

---

## 🚀 Vercel Deploy Adım Adım

### Ön Hazırlık

- ✅ Kodunuz GitHub'da olmalı
- ✅ Tüm değişiklikler commit edilmiş olmalı
- ✅ Vercel hesabı (ücretsiz)

### Adım 1: Shop App'i Deploy Etme

#### 1.1 Vercel'de Proje Oluşturma

1. [vercel.com](https://vercel.com) → **Sign Up/Log In** (GitHub ile önerilir)
2. Dashboard → **"Add New..."** → **"Project"**
3. GitHub repository'nizi seçin (`belucha`)
4. **"Import"** tıklayın

#### 1.2 Proje Ayarları (ÖNEMLİ!)

**Configure Project** sayfasında:

**Root Directory:**
- **"Override"** tıklayın
- **`apps/shop`** yazın
- ⚠️ Bu ayar çok kritik!

**Build Command:**
```
cd ../.. && npm install && turbo run build --filter=@belucha/shop
```

**Output Directory:**
```
.next
```

**Install Command:**
```
cd ../.. && npm install
```

**Framework Preset:**
- **Next.js** (otomatik algılanmalı)

**Project Name:**
- `belucha-shop` (veya istediğiniz isim)

#### 1.3 Deploy Et

1. **"Deploy"** butonuna tıklayın
2. Build başlayacak (2-5 dakika)
3. Build loglarını izleyin

### Adım 2: Sellercentral App'i Deploy Etme

Aynı işlemi sellercentral için tekrarlayın:

1. **Yeni proje oluşturun** (aynı repository)
2. **Root Directory:** `apps/sellercentral`
3. **Build Command:** `cd ../.. && npm install && turbo run build --filter=@belucha/sellercentral`
4. **Output Directory:** `.next`
5. **Deploy** edin

### Adım 3: Build Loglarını Kontrol Etme

#### Başarı Kriterleri

✅ **Build başarılı:**
- Build loglarında `✓ Build completed` görünmeli
- Hata mesajı olmamalı

✅ **Doğru build command çalışıyor:**
- `turbo run build --filter=@belucha/shop` çalışıyor mu?
- Sadece shop app build ediliyor mu? (CMS build edilmemeli)

✅ **Site erişilebilir:**
- Deployment sayfasında **"Visit"** butonu görünmeli
- Site açılmalı

---

## 🔧 Build Sorunları ve Çözümleri

### Sorun 1: "unexpected argument '--no-deps' found"

**Hata:**
```
ERROR  unexpected argument '--no-deps' found
```

**Çözüm:** ✅ **Düzeltildi!** 
- `--no-deps` flag'i Turbo 2.x'te desteklenmiyor
- Build command'dan kaldırıldı
- `turbo.json` dosyasında shop ve sellercentral için `dependsOn: []` ayarlandı

**Doğru Build Command:**
```
cd ../.. && npm install && turbo run build --filter=@belucha/shop
```

### Sorun 2: "Cannot find module 'tailwindcss'"

**Çözüm:** ✅ **Düzeltildi!**
- `apps/shop/package.json` ve `apps/sellercentral/package.json` dosyalarında
- `tailwindcss`, `postcss`, `autoprefixer` `dependencies` içinde olmalı

### Sorun 3: "Found pipeline field instead of tasks"

**Çözüm:** ✅ **Düzeltildi!**
- `turbo.json` dosyasında `pipeline` yerine `tasks` kullanılmalı

### Sorun 4: "The file .next/routes-manifest.json couldn't be found"

**Çözüm:** ✅ **Düzeltildi!**
- Output directory `.next` olmalı, `apps/shop/.next` değil
- Root directory `apps/shop` olduğu için output directory relative olmalı

### Sorun 5: Build command hala eski format kullanıyor

**Çözüm:**
1. Vercel Dashboard → **Settings** → **Build & Development Settings**
2. Build Command'ı güncelleyin:
   ```
   cd ../.. && npm install && turbo run build --filter=@belucha/shop
   ```
3. Tekrar deploy edin

### Sorun 6: Turbo tüm paketleri build ediyor (CMS dahil)

**Çözüm:** ✅ **Düzeltildi!**
- `turbo.json` dosyasında shop ve sellercentral için `dependsOn: []` ayarlandı
- Böylece bağımlılıklar build edilmez

---

## 🔐 Environment Variables

### Shop App için

**Settings → Environment Variables → Add:**

**Key:** `NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL`  
**Value:** `https://your-cms-url.com/api/graphql` (veya şimdilik `http://localhost:3001/api/graphql`)  
**Environment:** Production, Preview, Development (hepsini seçin)

**Key:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`  
**Value:** `pk_test_...` (Stripe test key)  
**Environment:** Production, Preview, Development

### Sellercentral App için

Aynı environment variables'ları ekleyin.

> **Not**: Payload CMS henüz deploy edilmediyse, şimdilik localhost URL'i kullanabilirsiniz (sadece test için).

---

## 🐛 Sorun Giderme

### Build başarısız

1. **Build loglarını kontrol edin**
   - Deployment → Build Logs
   - Hata mesajını okuyun

2. **Settings'te build command'ı kontrol edin**
   - Settings → Build & Development Settings
   - Build Command doğru mu?

3. **Root directory doğru mu?**
   - Shop: `apps/shop`
   - Sellercentral: `apps/sellercentral`

### Site açılmıyor

1. **Environment variables'ları kontrol edin**
   - Settings → Environment Variables
   - Tüm değişkenler ekli mi?

2. **Console'da hata var mı?**
   - F12 → Console
   - Hata mesajlarını kontrol edin

3. **Network tab'ında API çağrıları başarılı mı?**
   - F12 → Network
   - GraphQL istekleri başarılı mı?

### "404 Not Found"

1. **Output directory `.next` olmalı**
2. **Root directory doğru mu kontrol edin**

### GraphQL hatası

1. **`NEXT_PUBLIC_PAYLOAD_GRAPHQL_URL` doğru mu?**
2. **Payload CMS çalışıyor mu?**
3. **CORS ayarları doğru mu?**

---

## 📝 Vercel Dashboard Ayarları Özeti

### Shop App

| Ayar | Değer |
|------|-------|
| Root Directory | `apps/shop` |
| Build Command | `cd ../.. && npm install && turbo run build --filter=@belucha/shop` |
| Output Directory | `.next` |
| Install Command | `cd ../.. && npm install` |
| Framework Preset | Next.js |

### Sellercentral App

| Ayar | Değer |
|------|-------|
| Root Directory | `apps/sellercentral` |
| Build Command | `cd ../.. && npm install && turbo run build --filter=@belucha/sellercentral` |
| Output Directory | `.next` |
| Install Command | `cd ../.. && npm install` |
| Framework Preset | Next.js |

---

## ✅ Deploy Sonrası Checklist

### Shop App
- [ ] Build başarılı
- [ ] Site erişilebilir
- [ ] Ana sayfa açılıyor
- [ ] Ürünler görünüyor
- [ ] Login/Register sayfaları çalışıyor
- [ ] Environment variables eklendi

### Sellercentral App
- [ ] Build başarılı
- [ ] Site erişilebilir
- [ ] Login sayfası açılıyor
- [ ] Dashboard açılıyor (login sonrası)
- [ ] Environment variables eklendi

---

## 🔄 Otomatik Deploy

Vercel otomatik olarak:
- `main` branch'e push → Production deploy
- Diğer branch'lere push → Preview deploy

**Branch Ayarları:**
- Settings → Git
- Production Branch: `main` (veya `dev`)
- Preview Deployments: Açık

---

## 📚 İlgili Dosyalar

- `turbo.json` - Turborepo config (shop ve sellercentral için `dependsOn: []` ayarlı)
- `apps/shop/vercel.json` - Shop app Vercel config
- `apps/sellercentral/vercel.json` - Sellercentral app Vercel config

---

## 🎯 Sonraki Adımlar

Deploy başarılı olduktan sonra:
1. ✅ Payload CMS'i deploy et (Railway/Render)
2. ✅ MongoDB Atlas kurulumu
3. ✅ Environment variables'ları güncelle (gerçek CMS URL'i)
4. ✅ Production'da test et

---

**Son Güncelleme:** 2024  
**Durum:** Vercel build sorunları çözüldü. `--no-deps` flag'i kaldırıldı, `turbo.json` güncellendi.
