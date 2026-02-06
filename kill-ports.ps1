# Kill processes using ports 3000, 3001, and 3002
# Usage: .\kill-ports.ps1

Write-Host "🧹 Port temizleme başlıyor..." -ForegroundColor Yellow
Write-Host ""

$ports = @(3000, 3001, 3002)
$killedCount = 0

foreach ($port in $ports) {
    Write-Host "Port $port kontrol ediliyor..." -ForegroundColor Cyan

    # Get-NetTCPConnection dil bağımsız (LISTEN = dinlemede)
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $pids) {
            try {
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($process) {
                    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                    Write-Host "  ✅ Process $processId ($($process.ProcessName)) kapatıldı" -ForegroundColor Green
                    $killedCount++
                }
            } catch {
                Write-Host "  ⚠️ Process $processId kapatılamadı: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "  ✅ Port $port boş" -ForegroundColor Green
    }
}

# Son 30 dakikada başlatılan node process'lerini de temizle
Write-Host "`nSon 30 dakikada başlatılan node process'leri temizleniyor..." -ForegroundColor Cyan
$recentNodes = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { 
    $_.StartTime -gt (Get-Date).AddMinutes(-30) 
}

if ($recentNodes) {
    $recentNodes | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "  ✅ $($recentNodes.Count) node process kapatıldı" -ForegroundColor Green
    $killedCount += $recentNodes.Count
} else {
    Write-Host "  ✅ Temizlenecek node process yok" -ForegroundColor Green
}

Write-Host "`n✅ Toplam $killedCount process kapatıldı" -ForegroundColor Green
Write-Host "✅ Port temizleme tamamlandı!`n" -ForegroundColor Green

