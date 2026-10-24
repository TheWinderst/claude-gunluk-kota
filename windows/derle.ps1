# GunlukKota gostergesini derler.
# Windows ile gelen csc.exe (.NET Framework 4.x, C# 5) kullanilir; ek kurulum gerekmez.
# kullanim: powershell -NoProfile -ExecutionPolicy Bypass -File derle.ps1 [-Cikti <exe yolu>]
param([string]$Cikti = "")

$ErrorActionPreference = "Stop"
if ($Cikti -eq "") { $Cikti = Join-Path $PSScriptRoot "build\GunlukKota.exe" }
$kaynak = Join-Path $PSScriptRoot "GunlukKota.cs"
if (-not (Test-Path $kaynak)) { Write-Host "HATA: Kaynak dosya yok: $kaynak"; exit 1 }
$klasor = Split-Path $Cikti -Parent
if ($klasor -and -not (Test-Path $klasor)) { New-Item -ItemType Directory -Path $klasor -Force | Out-Null }

$adaylar = @(
    (Join-Path $env:windir "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
    (Join-Path $env:windir "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)
$csc = $null
foreach ($a in $adaylar) { if (Test-Path $a) { $csc = $a; break } }
if ($null -eq $csc) { Write-Host "HATA: csc.exe bulunamadi; .NET Framework 4.x gerekli."; exit 1 }

Write-Host "Derleyici: $csc"
& $csc /nologo /target:winexe /optimize+ /codepage:65001 "/out:$Cikti" `
    /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll `
    "$kaynak"
if ($LASTEXITCODE -ne 0) { Write-Host "HATA: Derleme basarisiz (csc cikis kodu $LASTEXITCODE)."; exit 1 }
Write-Host "Derlendi: $Cikti"
exit 0
