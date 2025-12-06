# Belucha Git Push Script - Otomatik (Hızlı)
# Kullanım: .\git-push.ps1 "commit mesajı"
# NOT: Güvenli iki aşamalı workflow için git-push-safe.ps1 kullanın

param(
    [string]$commitMessage = "update",
    [switch]$skipChecks = $false,
    [switch]$devOnly = $false
)

Write-Host "🚀 Git Push Başlatılıyor..." -ForegroundColor Cyan

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
$confirm = Read-Host "`n❓ Bu değişiklikleri commit edip push etmek istiyor musunuz? (Y/N)"
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

Write-Host "✅ Dev'e başarıyla push edildi!" -ForegroundColor Green

# 10. Eğer devOnly değilse, main'e merge et
if (-not $devOnly) {
    Write-Host "`n🔄 Main branch'ine geçiliyor..." -ForegroundColor Yellow
    git checkout main
    Check-ExitCode "Main branch'ine geçiş"
    
    Write-Host "`n🔀 Dev main'e merge ediliyor..." -ForegroundColor Yellow
    git merge dev --no-edit
    Check-ExitCode "Merge"
    
    # Merge commit mesajına skip checks ekle (eğer istenirse)
    if ($skipChecks) {
        Write-Host "`n⚠️  Merge commit mesajı güncelleniyor..." -ForegroundColor Yellow
        git commit --amend -m "Merge dev into main [skip ci]" --no-edit
    }
    
    Write-Host "`n📤 Main branch'ine push ediliyor..." -ForegroundColor Yellow
    git push origin main
    Check-ExitCode "Main'e push"
    
    Write-Host "✅ Main'e başarıyla push edildi!" -ForegroundColor Green
    
    # Dev'e geri dön
    Write-Host "`n🔄 Dev branch'ine geri dönülüyor..." -ForegroundColor Yellow
    git checkout dev
}

Write-Host "`n🎉 Tüm işlemler başarıyla tamamlandı!" -ForegroundColor Green
Write-Host "   ✅ Dev'e push edildi" -ForegroundColor Gray
if (-not $devOnly) {
    Write-Host "   ✅ Main'e merge edildi ve push edildi" -ForegroundColor Gray
}

