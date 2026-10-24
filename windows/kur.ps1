# GunlukKota kurulum betigi: cekirdegi kurar, kanca kurar, gostergeyi derler.
# kullanim: powershell -NoProfile -ExecutionPolicy Bypass -File kur.ps1
#           [-Baslangic 2026-10-28] [-Tavan 15] [-PaylasimOku <gist ya da url>]
#           [-Ev <dizin>] [-ClaudeAyar <settings.json yolu>] [-GostergeYok] [-OtomatikBaslatYok] [-CalistirmaYok]
param(
    [string]$Baslangic,
    [double]$Tavan = 0,
    [string]$PaylasimOku,
    [string]$Ev,
    [string]$ClaudeAyar,
    [switch]$GostergeYok,
    [switch]$OtomatikBaslatYok,
    [switch]$CalistirmaYok
)

$ErrorActionPreference = "Stop"

function NodeBul {
    $c = Get-Command node -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $p = Join-Path $env:ProgramFiles "nodejs\node.exe"
    if (Test-Path $p) { return $p }
    return $null
}
function NodeSurumTamam([string]$yol) {
    if (-not $yol -or -not (Test-Path $yol)) { return $false }
    try { $v = (& $yol --version 2>$null) } catch { return $false }
    if ($v -match '^v(\d+)\.') { return [int]$Matches[1] -ge 18 }
    return $false
}

# --- 1) Node.js 18+
$nodeYolu = NodeBul
if (-not (NodeSurumTamam $nodeYolu)) {
    Write-Host "Node.js 18+ bulunamadi. Kurmak icin: winget install OpenJS.NodeJS.LTS"
    $cevap = Read-Host "Node.js simdi kurulsun mu? (E/H)"
    if ($cevap -eq "E" -or $cevap -eq "e") {
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        $nodeYolu = NodeBul
        if (-not (NodeSurumTamam $nodeYolu)) { Write-Host "HATA: Kurulum sonrasi Node.js hala bulunamadi."; exit 1 }
    } else { exit 1 }
}
Write-Host "1/7 Node bulundu: $nodeYolu"

# --- 2) Cekirdek kur (test klasoru haric, yalniz *.mjs)
$kook = $Ev
if (-not $kook) { $kook = Join-Path $env:USERPROFILE ".gunluk-kota" }
if ($Ev) { $env:GUNLUK_KOTA_EV = $Ev }
$cekirdekHedef = Join-Path $kook "cekirdek"
New-Item -ItemType Directory -Path $cekirdekHedef -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot "..\cekirdek\*.mjs") -Destination $cekirdekHedef -Force
$kota = Join-Path $cekirdekHedef "kota.mjs"
if (-not (Test-Path $kota)) { Write-Host "HATA: Cekirdek bulunamadi (cekirdek\kota.mjs yok)."; exit 1 }
Write-Host "2/7 Cekirdek kuruldu: $cekirdekHedef"

# --- 3) Ayarlar
if ($Baslangic) {
    & $nodeYolu $kota ayar baslangic ('"' + $Baslangic + '"')
    if ($LASTEXITCODE -ne 0) { Write-Host "HATA: baslangic ayarlanamadi."; exit 1 }
    Write-Host "3/7 baslangic = $Baslangic"
} elseif ($Tavan -gt 0 -or $PaylasimOku) {
    Write-Host "3/7 ayarlar guncelleniyor"
} else {
    Write-Host "3/7 ayarlar degismedi"
}
if ($Tavan -gt 0) {
    & $nodeYolu $kota ayar tavan $Tavan
    if ($LASTEXITCODE -ne 0) { Write-Host "HATA: tavan ayarlanamadi."; exit 1 }
    Write-Host "    tavan = $Tavan"
}
if ($PaylasimOku) {
    $pd = '{"yayinla":null,"oku":"' + $PaylasimOku + '"}'
    & $nodeYolu $kota ayar paylasim $pd
    if ($LASTEXITCODE -ne 0) { Write-Host "HATA: paylasim ayarlanamadi."; exit 1 }
    Write-Host "    paylasim.oku = $PaylasimOku"
}

# --- 4) uygulama.json (gostergenin node yolu)
$nodeKaclis = $nodeYolu.Replace('\', '\\').Replace('"', '\"')
[IO.File]::WriteAllText((Join-Path $kook "uygulama.json"), '{"node": "' + $nodeKaclis + '"}')
Write-Host "4/7 uygulama.json yazildi"

# --- 5) Kanca kur
$kancaArglar = @("kanca-kur")
if ($ClaudeAyar) { $kancaArglar += "--ayar-dosyasi"; $kancaArglar += $ClaudeAyar }
& $nodeYolu $kota @kancaArglar
if ($LASTEXITCODE -ne 0) { Write-Host "HATA: Kanca kurulamadi."; exit 1 }
Write-Host "5/7 Kanca kuruldu"

# --- 6) Gosterge
if (-not $GostergeYok) {
    $hedefExe = Join-Path $kook "GunlukKota.exe"
    Get-Process -Name "GunlukKota" -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -eq $hedefExe } catch { $false }
    } | Stop-Process -Force -ErrorAction SilentlyContinue
    $derleBetik = Join-Path $PSScriptRoot "derle.ps1"
    & $derleBetik -Cikti $hedefExe
    if ($LASTEXITCODE -ne 0) { Write-Host "HATA: Gosterge derlenemedi."; exit 1 }
    if (-not $OtomatikBaslatYok) {
        $runAnahtar = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Microsoft\Windows\CurrentVersion\Run")
        $runAnahtar.SetValue("ClaudeGunlukKota", '"' + $hedefExe + '"')
        $runAnahtar.Close()
    }
    if (-not $CalistirmaYok) { Start-Process -FilePath $hedefExe }
    Write-Host "6/7 Gosterge hazir: $hedefExe"
} else {
    Write-Host "6/7 Gosterge atlandi (-GostergeYok)"
}

# --- 7) Ilk olcum
$olcCikti = (& $nodeYolu $kota olc 2>$null) | Out-String
if ($olcCikti.Trim().Length -gt 0) { Write-Host $olcCikti.Trim() }
try {
    $durumSatiri = (& $nodeYolu $kota durum --json 2>$null) | Select-Object -Last 1
    $d = $durumSatiri | ConvertFrom-Json
    if ($d.hata -and ($d.hata -match "oturum")) {
        Write-Host "Ipucu: Terminalde bir kez 'claude' calistirip giris yapmaniz gerekiyor."
    }
} catch { }
Write-Host "7/7 Ilk olcum yapildi"
