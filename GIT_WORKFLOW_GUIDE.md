# Git Workflow Rehberi - Belucha

Bu rehber, Belucha projesinde git kullanımı için en iyi yöntemleri açıklar.

## 🚀 Hızlı Başlangıç

### ⭐ Önerilen: Güvenli İki Aşamalı Yöntem

```powershell
.\git-push-safe.ps1 "feat: yeni özellik eklendi"
```

**Bu yöntem:**
1. ✅ Dev'e commit ve push eder
2. ⏸️ **SİZİ BEKLETİR** - Kontrol için zaman verir
3. ✅ Onayladığınızda main'e merge ve push eder
4. ✅ Hata kontrolü yapar

**Avantajları:**
- 🛡️ Daha güvenli (kontrol şansı verir)
- 🔍 Dev'de test edebilirsiniz
- ⚠️ Sorun varsa main'e geçmez
- ✅ Production'a sadece test edilmiş kod gider

### ⚡ Hızlı Yöntem: Otomatik (Dikkatli Kullanın)

```powershell
.\git-push.ps1 "fix: küçük düzeltme"
```

**Bu yöntem:**
- Dev'e push eder
- Hemen main'e merge eder
- Kontrol beklemez

**Kullanım:**
- Küçük, riski düşük değişiklikler için
- Hızlı hotfix'ler için
- Test edilmiş değişiklikler için

---

## 📋 Kullanım Senaryoları

### Senaryo 1: Güvenli Push (ÖNERİLEN)

```powershell
.\git-push-safe.ps1 "feat: yeni özellik eklendi"
```

**Adımlar:**
1. Dev'e commit ve push
2. ⏸️ **DURUR** - Siz kontrol edersiniz
3. GitHub'da dev branch'ini kontrol edin
4. Vercel deployment'ı kontrol edin
5. Enter'a basın (devam etmek için)
6. Main'e merge ve push

### Senaryo 2: GitHub Checks'i Atlama

Eğer GitHub checks sorun çıkarıyorsa:

```powershell
.\git-push-safe.ps1 "fix: hata düzeltildi" -skipChecks
```

**Ne yapar:**
- Dev'e push (skip checks ile)
- Kontrol için bekler
- Main'e merge (skip checks ile)

### Senaryo 3: Sadece Dev'e Push

Main'e merge etmeden sadece dev'e push:

```powershell
.\git-push.ps1 "wip: çalışma devam ediyor" -devOnly
```

---

## 🔧 Manuel Git Komutları

Eğer script kullanmak istemiyorsanız:

### 1. Dev'e Push (Aşama 1)

```powershell
git checkout dev
git add .
git commit -m "commit mesajı"
git push origin dev
```

### 2. Kontrol Et

- GitHub'da dev branch'ini kontrol et
- Vercel deployment'ı kontrol et
- Test et

### 3. Main'e Merge ve Push (Aşama 2)

```powershell
git checkout main
git merge dev --no-edit
git push origin main
git checkout dev
```

### 4. GitHub Checks'i Atlama

```powershell
git commit -m "mesaj [skip ci]"
git push
```

---

## 🎯 En İyi Pratikler

### 1. Commit Mesajları

**İyi commit mesajları:**
```
feat: yeni özellik eklendi
fix: hata düzeltildi
docs: dokümantasyon güncellendi
style: kod formatı düzeltildi
refactor: kod yeniden düzenlendi
test: test eklendi
chore: build/config güncellendi
```

**Kötü commit mesajları:**
```
update
fix
test
asdf
```

### 2. İki Aşamalı Workflow Kullanın

**Neden?**
- ✅ Production'a sadece test edilmiş kod gider
- ✅ Sorun varsa main'e geçmez
- ✅ Dev'de test edebilirsiniz
- ✅ Daha güvenli

**Ne zaman otomatik kullanılır?**
- Küçük, riski düşük değişiklikler
- Hızlı hotfix'ler
- Zaten test edilmiş değişiklikler

### 3. Sık Commit Yapın

- Küçük, anlamlı commit'ler yapın
- Her commit tek bir değişiklik içermeli
- Günlük çalışmanızı commit edin

### 4. Dev Branch Kullanın

- `dev` branch'inde çalışın
- `main` branch'ine sadece merge ile geçin
- Feature branch'leri kullanabilirsiniz

### 5. Push Öncesi Kontrol

```powershell
# Değişiklikleri kontrol et
git status

# Diff'i görüntüle
git diff

# Commit geçmişini görüntüle
git log --oneline -10
```

---

## 🐛 Sorun Giderme

### Sorun 1: "Working tree clean"

**Sebep**: Commit edilecek değişiklik yok

**Çözüm**: 
- Değişiklik yaptığınızdan emin olun
- Dosyaları kaydettiğinizden emin olun

### Sorun 2: "Merge conflict"

**Sebep**: Dev ve main arasında çakışma var

**Çözüm**:
```powershell
# Çakışmaları çöz
git merge dev
# Çakışmaları düzelt
git add .
git commit -m "Merge dev into main"
```

### Sorun 3: "GitHub checks failing"

**Sebep**: CI/CD check'leri başarısız

**Çözüm**:
```powershell
# Checks'i atla
.\git-push-safe.ps1 "mesaj" -skipChecks
```

Veya:
```powershell
git commit -m "mesaj [skip ci]"
```

### Sorun 4: "Permission denied"

**Sebep**: Git credentials eksik

**Çözüm**:
```powershell
# Git config kontrol et
git config --global user.name "İsminiz"
git config --global user.email "email@example.com"

# SSH key ekle veya HTTPS kullan
```

---

## 📊 Git Workflow Özeti

### Güvenli İki Aşamalı Workflow

```
┌─────────┐
│  Local  │
│ Changes │
└────┬────┘
     │
     ▼
┌─────────┐     git add .      ┌──────────┐
│  Staged │ ◄───────────────── │  Local   │
│ Changes │                     │ Changes  │
└────┬────┘                     └──────────┘
     │
     ▼
┌─────────┐     git commit     ┌──────────┐
│  Local  │ ◄───────────────── │  Staged  │
│  Repo   │                     │ Changes  │
└────┬────┘                     └──────────┘
     │
     ▼
┌─────────┐     git push       ┌──────────┐
│  Dev    │ ◄───────────────── │  Local   │
│ Branch  │                     │  Repo    │
└────┬────┘                     └──────────┘
     │
     ▼
┌─────────┐
│ ⏸️ BEKLE │  ← KONTROL ZAMANI
│ Kontrol │     (GitHub, Vercel, Test)
└────┬────┘
     │
     ▼ (Onay verilirse)
┌─────────┐     git merge       ┌──────────┐
│  Main   │ ◄───────────────── │   Dev    │
│ Branch  │                     │  Branch  │
└─────────┘                     └──────────┘
```

---

## 🔐 Güvenlik

### 1. .env Dosyalarını Commit Etmeyin

```bash
# .gitignore'da olmalı
.env
.env.local
.env*.local
```

### 2. Secrets'ları Commit Etmeyin

- API keys
- Passwords
- Private keys
- Database credentials

### 3. Büyük Dosyaları Commit Etmeyin

- Video dosyaları
- Büyük image'ler
- Binary dosyalar

---

## 📚 Ek Komutlar

### Git Status

```powershell
# Detaylı status
git status

# Kısa status
git status --short
```

### Git Log

```powershell
# Son 10 commit
git log --oneline -10

# Grafik görünüm
git log --oneline --graph --all -20
```

### Git Diff

```powershell
# Staged değişiklikler
git diff --staged

# Unstaged değişiklikler
git diff

# Belirli bir dosya
git diff apps/shop/src/app/page.jsx
```

### Git Reset

```powershell
# Son commit'i geri al (değişiklikler kalır)
git reset --soft HEAD~1

# Son commit'i geri al (değişiklikler silinir)
git reset --hard HEAD~1
```

---

## 🎓 Öğrenme Kaynakları

- [Git Documentation](https://git-scm.com/doc)
- [GitHub Guides](https://guides.github.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

## ✅ Checklist

### Dev'e Push Öncesi

- [ ] Değişiklikler test edildi (mümkünse)
- [ ] Commit mesajı anlamlı
- [ ] .env dosyaları commit edilmedi
- [ ] Secrets commit edilmedi
- [ ] Büyük dosyalar commit edilmedi

### Main'e Merge Öncesi

- [ ] Dev branch'i GitHub'da kontrol edildi
- [ ] Vercel deployment başarılı (varsa)
- [ ] GitHub checks başarılı (veya skip edildi)
- [ ] Test edildi (mümkünse)
- [ ] Her şey iyi görünüyor

---

## 🆘 Hızlı Referans

### Güvenli Push (Önerilen)
```powershell
.\git-push-safe.ps1 "feat: yeni özellik"
```

### Hızlı Push (Dikkatli)
```powershell
.\git-push.ps1 "fix: küçük düzeltme"
```

### Checks'i Atla
```powershell
.\git-push-safe.ps1 "mesaj" -skipChecks
```

### Sadece Dev'e
```powershell
.\git-push.ps1 "wip: çalışma" -devOnly
```

---

**Son Güncelleme**: 2024
