# Belucha Git Push Script - Güvenli İki Aşamalı Yöntem
# Kullanım: .\git-push-safe.ps1 "commit mesajı"

param(
    [string]$commitMessage = "update",
    [switch]$skipChecks = $false
)

Write-Host "🚀 Güvenli Git Push Başlatılıyor..." -ForegroundColor Cyan
Write-Host "📋 İki Aşamalı Workflow: Dev → Kontrol → Main" -ForegroundColor Yellow

# Hata kontrolü için function
function Check-ExitCode {
    param([string]$stepName)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ $stepName başarısız! (Exit Code: $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

# 1. Mevcut branch'i kontrol et
$currentBranch = git branch --show-current
Write-Host "`n📍 Mevcut branch: $currentBranch" -ForegroundColor Yellow

# 2. Git status kontrolü
Write-Host "`n📊 Git durumu kontrol ediliyor..." -ForegroundColor Yellow
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "⚠️  Commit edilecek değişiklik yok." -ForegroundColor Yellow
    Write-Host "✅ Working tree temiz, push edilecek bir şey yok." -ForegroundColor Green
    exit 0
}

# 3. Değişiklikleri göster
Write-Host "`n📝 Değişiklikler:" -ForegroundColor Yellow
git status --short

# 4. Kullanıcıya onay sor
$confirm = Read-Host "`n❓ Bu değişiklikleri commit edip dev'e push etmek istiyor musunuz? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "❌ İşlem iptal edildi." -ForegroundColor Red
    exit 0
}

# 5. Dev branch'ine geç (eğer değilse)
if ($currentBranch -ne "dev") {
    Write-Host "`n🔄 Dev branch'ine geçiliyor..." -ForegroundColor Yellow
    git checkout dev
    Check-ExitCode "Dev branch'ine geçiş"
}

# 6. Değişiklikleri ekle
Write-Host "`n➕ Değişiklikler ekleniyor..." -ForegroundColor Yellow
git add .
Check-ExitCode "Git add"

# 7. Commit mesajına skip checks ekle (eğer istenirse)
$finalMessage = $commitMessage
if ($skipChecks) {
    $finalMessage = "$commitMessage [skip ci]"
    Write-Host "⚠️  Skip checks aktif: GitHub Actions atlanacak" -ForegroundColor Yellow
}

# 8. Commit yap
Write-Host "`n💾 Commit yapılıyor: '$finalMessage'..." -ForegroundColor Yellow
git commit -m $finalMessage
Check-ExitCode "Git commit"

# 9. Dev'e push et
Write-Host "`n📤 Dev branch'ine push ediliyor..." -ForegroundColor Yellow
git push origin dev
Check-ExitCode "Dev'e push"

Write-Host "`n✅ Dev'e başarıyla push edildi!" -ForegroundColor Green

# 10. Kullanıcıya kontrol için bekle
Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "⏸️  AŞAMA 1 TAMAMLANDI - KONTROL ZAMANI" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Şimdi yapmanız gerekenler:" -ForegroundColor Yellow
Write-Host "   1. GitHub'da dev branch'ini kontrol edin" -ForegroundColor White
Write-Host "   2. Vercel deployment'ı kontrol edin (varsa)" -ForegroundColor White
Write-Host "   3. GitHub checks'leri kontrol edin" -ForegroundColor White
Write-Host "   4. Test edin (mümkünse)" -ForegroundColor White
Write-Host ""
Write-Host "🔗 GitHub URL:" -ForegroundColor Yellow
$repoUrl = git config --get remote.origin.url
if ($repoUrl) {
    $repoUrl = $repoUrl -replace '\.git$', ''
    $repoUrl = $repoUrl -replace 'git@github\.com:', 'https://github.com/'
    $repoUrl = $repoUrl -replace 'https://github\.com/', 'https://github.com/'
    Write-Host "   $repoUrl/tree/dev" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "⏳ Devam etmek için hazır olduğunuzda Enter'a basın..." -ForegroundColor Yellow
Write-Host "   (İptal etmek için Ctrl+C)" -ForegroundColor Gray
Read-Host

# 11. Main'e merge için onay
Write-Host ""
Write-Host "❓ Dev branch'i kontrol edildi ve her şey iyi mi?" -ForegroundColor Yellow
Write-Host "   Main'e merge edip push etmek istiyor musunuz? (Y/N)" -ForegroundColor Yellow
$mergeConfirm = Read-Host

if ($mergeConfirm -ne "Y" -and $mergeConfirm -ne "y") {
    Write-Host "`n⏸️  Main'e merge edilmedi. Dev branch'inde kalındı." -ForegroundColor Yellow
    Write-Host "   İstediğiniz zaman 'git checkout main && git merge dev' ile merge edebilirsiniz." -ForegroundColor Gray
    exit 0
}

# 12. Main branch'ine geç
Write-Host "`n🔄 Main branch'ine geçiliyor..." -ForegroundColor Yellow
git checkout main
Check-ExitCode "Main branch'ine geçiş"

# 13. Dev'i main'e merge et
Write-Host "`n🔀 Dev main'e merge ediliyor..." -ForegroundColor Yellow
git merge dev --no-edit
Check-ExitCode "Merge"

# 14. Merge commit mesajına skip checks ekle (eğer istenirse)
if ($skipChecks) {
    Write-Host "`n⚠️  Merge commit mesajı güncelleniyor..." -ForegroundColor Yellow
    git commit --amend -m "Merge dev into main [skip ci]" --no-edit
}

# 15. Main'e push et
Write-Host "`n📤 Main branch'ine push ediliyor..." -ForegroundColor Yellow
git push origin main
Check-ExitCode "Main'e push"

Write-Host "`n✅ Main'e başarıyla push edildi!" -ForegroundColor Green

# 16. Dev'e geri dön
Write-Host "`n🔄 Dev branch'ine geri dönülüyor..." -ForegroundColor Yellow
git checkout dev

# 17. Özet
Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Green
Write-Host "🎉 TÜM İŞLEMLER BAŞARIYLA TAMAMLANDI!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Green
Write-Host ""
Write-Host "✅ Dev'e push edildi" -ForegroundColor Gray
Write-Host "✅ Kontrol yapıldı" -ForegroundColor Gray
Write-Host "✅ Main'e merge edildi ve push edildi" -ForegroundColor Gray
Write-Host "✅ Dev branch'ine geri dönüldü" -ForegroundColor Gray
Write-Host ""

