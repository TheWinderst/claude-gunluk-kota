# GunlukKota kaldirma betigi: kancayi kaldirir, gostergeyi durdurur, acilis kaydini siler.
# kullanim: powershell -NoProfile -ExecutionPolicy Bypass -File kaldir.ps1 [-Ev <dizin>] [-ClaudeAyar <settings.json>] [-Hepsi]
param(
    [string]$Ev,
    [string]$ClaudeAyar,
    [switch]$Hepsi
)

$ErrorActionPreference = "Stop"
$kook = $Ev
if (-not $kook) { $kook = Join-Path $env:USERPROFILE ".gunluk-kota" }
if ($Ev) { $env:GUNLUK_KOTA_EV = $Ev }

# --- 1) Kanca kaldir
$kota = Join-Path $kook "cekirdek\kota.mjs"
$nodeYolu = $null
$uygulamaJson = Join-Path $kook "uygulama.json"
if (Test-Path $uygulamaJson) {
    try {
        $u = Get-Content -LiteralPath $uygulamaJson -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($u.node) { $nodeYolu = $u.node }
    } catch { }
}
if (-not $nodeYolu) {
    $c = Get-Command node -ErrorAction SilentlyContinue
    if ($c) { $nodeYolu = $c.Source }
}
if ((Test-Path $kota) -and $nodeYolu) {
    $arglar = @("kanca-kur", "--kaldir")
    if ($ClaudeAyar) { $arglar += "--ayar-dosyasi"; $arglar += $ClaudeAyar }
    & $nodeYolu $kota @arglar
    Write-Host "1/4 Kanca kaldirildi"
} else {
    Write-Host "1/4 Kanca kaldirilamadi (cekirdek ya da node yok)"
}

# --- 2) Gostergeyi durdur (yalniz KOK altindaki kendi exe'si)
Get-Process -Name "GunlukKota" -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -eq (Join-Path $kook "GunlukKota.exe") } catch { $false }
} | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "2/4 Gosterge durduruldu"

# --- 3) Acilis kaydini sil
try {
    $runAnahtar = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Microsoft\Windows\CurrentVersion\Run", $true)
    if ($runAnahtar -and $null -ne $runAnahtar.GetValue("ClaudeGunlukKota")) {
        $runAnahtar.DeleteValue("ClaudeGunlukKota")
        $runAnahtar.Close()
        Write-Host "3/4 Acilista baslat kaydi silindi"
    } else {
        if ($runAnahtar) { $runAnahtar.Close() }
        Write-Host "3/4 Acilis kaydi zaten yok"
    }
} catch {
    Write-Host "3/4 Acilis kaydi silinemedi: $($_.Exception.Message)"
}

# --- 4) Tum veriler
if ($Hepsi) {
    $cevap = Read-Host "Tum veriler silinsin mi? $kook (E/H)"
    if ($cevap -eq "E" -or $cevap -eq "e") {
        if (Test-Path $kook) { Remove-Item -Recurse -Force $kook }
        Write-Host "4/4 Silindi: $kook"
    } else {
        Write-Host "4/4 Silme iptal edildi"
    }
} else {
    Write-Host "4/4 Veri klasoru birakildi (tumunu silmek icin -Hepsi)"
}
