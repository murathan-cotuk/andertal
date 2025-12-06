# Belucha Git Workflow Script
# Kullanım: .\git-workflow.ps1

param(
    [string]$commitMessage = "update"
)

Write-Host "🔄 Git Workflow Başlatılıyor..." -ForegroundColor Cyan

# 1. Dev branch'ine geç
Write-Host "`n1️⃣ Dev branch'ine geçiliyor..." -ForegroundColor Yellow
git checkout dev
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Dev branch'ine geçilemedi!" -ForegroundColor Red
    exit 1
}

# 2. Değişiklikleri ekle
Write-Host "`n2️⃣ Değişiklikler ekleniyor..." -ForegroundColor Yellow
git add .
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "⚠️  Commit edilecek değişiklik yok." -ForegroundColor Yellow
} else {
    # 3. Commit yap
    Write-Host "`n3️⃣ Commit yapılıyor: '$commitMessage'..." -ForegroundColor Yellow
    git commit -m $commitMessage
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Commit başarısız!" -ForegroundColor Red
        exit 1
    }
    
    # 4. Dev'e push et
    Write-Host "`n4️⃣ Dev branch'ine push ediliyor..." -ForegroundColor Yellow
    git push origin dev
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Push başarısız!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Dev'e push edildi!" -ForegroundColor Green
}

# 5. Main branch'ine geç
Write-Host "`n5️⃣ Main branch'ine geçiliyor..." -ForegroundColor Yellow
git checkout main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Main branch'ine geçilemedi!" -ForegroundColor Red
    exit 1
}

# 6. Dev'i main'e merge et (mesaj olmadan)
Write-Host "`n6️⃣ Dev main'e merge ediliyor..." -ForegroundColor Yellow
git merge dev --no-edit
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Merge başarısız! Çakışmaları kontrol edin." -ForegroundColor Red
    exit 1
}

# 7. Main'e push et
Write-Host "`n7️⃣ Main branch'ine push ediliyor..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push başarısız!" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Tüm işlemler tamamlandı!" -ForegroundColor Green
Write-Host "   - Dev'e push edildi" -ForegroundColor Gray
Write-Host "   - Main'e merge edildi ve push edildi" -ForegroundColor Gray

