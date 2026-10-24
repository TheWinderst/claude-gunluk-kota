#!/bin/bash
# GunlukKota menu cubugu gostergesini derler.
#   bash mac/derle.sh [cikti_dizini]     (varsayilan: mac/build)
# Cikti: <cikti_dizini>/GunlukKota.app
# Imzasiz derleme bu Mac'te acilista coker; o yuzden ad-hoc imzalanir.

set -euo pipefail

MAC_DIZINI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CIKTI="${1:-$MAC_DIZINI/build}"
APP="$CIKTI/GunlukKota.app"
ICERIK="$APP/Contents"

# Kaynak denetimi.
if [ ! -f "$MAC_DIZINI/GunlukKota.swift" ]; then
    echo "Kaynak dosya yok: $MAC_DIZINI/GunlukKota.swift" >&2
    exit 1
fi
if [ ! -f "$MAC_DIZINI/ClaudeLogo.swift" ]; then
    echo "Kaynak dosya yok: $MAC_DIZINI/ClaudeLogo.swift" >&2
    exit 1
fi

rm -rf "$APP"
mkdir -p "$ICERIK/MacOS"

cat > "$ICERIK/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.claude-gunluk-kota.gosterge</string>
    <key>CFBundleName</key>
    <string>Claude Günlük Kota</string>
    <key>CFBundleDisplayName</key>
    <string>Claude Günlük Kota</string>
    <key>CFBundleExecutable</key>
    <string>GunlukKota</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSUIElement</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
</dict>
</plist>
PLIST

swiftc -O "$MAC_DIZINI/GunlukKota.swift" "$MAC_DIZINI/ClaudeLogo.swift" -o "$ICERIK/MacOS/GunlukKota"

[ -x "$ICERIK/MacOS/GunlukKota" ] || { echo "Derleme çıktısı yok: $ICERIK/MacOS/GunlukKota" >&2; exit 1; }

codesign --force --deep -s - "$APP"

echo "Derlendi: $APP"
