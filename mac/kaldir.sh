#!/bin/bash
# Gunluk kota gostergesini kaldirir: kancayi siler, LaunchAgent'i bootout
# edip dosyasini siler, uygulamayi siler.
#
#   bash mac/kaldir.sh [--ev DIZIN] [--claude-ayar DOSYA] [--hepsi]
#
# --hepsi: veri kokunun tamamini (olcumler, ayarlar) silmek icin sorar.

set -euo pipefail

KOK="$HOME/.gunluk-kota"
CLAUDE_AYAR=""
HEPSI=false

KULLANIM="Kullanım: bash mac/kaldir.sh [--ev DIZIN] [--claude-ayar DOSYA] [--hepsi]"

while [ $# -gt 0 ]; do
    case "$1" in
        --ev) KOK="${2:?$KULLANIM}"; shift 2 ;;
        --claude-ayar) CLAUDE_AYAR="${2:?$KULLANIM}"; shift 2 ;;
        --hepsi) HEPSI=true; shift ;;
        *) echo "Bilinmeyen seçenek: $1" >&2; echo "$KULLANIM" >&2; exit 2 ;;
    esac
done

# Fiziksel yol.
if [ -d "$KOK" ]; then
    KOK="$(cd "$KOK" && pwd -P)"
fi

# Kancayi kaldiracak node: once kurulumun kaydettigi yol, sonra adaylar.
NODE=""
KAYITLI_NODE="$(sed -n 's/.*"node"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$KOK/uygulama.json" 2> /dev/null || true)"
if [ -n "$KAYITLI_NODE" ] && [ -x "$KAYITLI_NODE" ]; then NODE="$KAYITLI_NODE"; fi
if [ -z "$NODE" ]; then
    ADAY="$(command -v node 2> /dev/null || true)"
    [ -n "$ADAY" ] && [ -x "$ADAY" ] && NODE="$ADAY"
fi
if [ -z "$NODE" ] && [ -x /opt/homebrew/bin/node ]; then NODE=/opt/homebrew/bin/node; fi
if [ -z "$NODE" ] && [ -x /usr/local/bin/node ]; then NODE=/usr/local/bin/node; fi
if [ -z "$NODE" ] && [ -x /usr/bin/node ]; then NODE=/usr/bin/node; fi

# 1) UserPromptSubmit kancasi.
if [ -n "$NODE" ] && [ -f "$KOK/cekirdek/kota.mjs" ]; then
    if [ -n "$CLAUDE_AYAR" ]; then
        "$NODE" "$KOK/cekirdek/kota.mjs" kanca-kur --kaldir --ayar-dosyasi "$CLAUDE_AYAR" \
            || echo "Kanca kaldırılamadı (üstteki hataya bak)." >&2
    else
        "$NODE" "$KOK/cekirdek/kota.mjs" kanca-kur --kaldir \
            || echo "Kanca kaldırılamadı (üstteki hataya bak)." >&2
    fi
else
    echo "Kanca kaldırılamadı (node ya da çekirdek yok); gerekirse elle sil."
fi

# 2) LaunchAgent.
ETIKET="com.claude-gunluk-kota.gosterge"
if [ -f "$HOME/Library/LaunchAgents/$ETIKET.plist" ]; then
    launchctl bootout "gui/$(id -u)/$ETIKET" 2> /dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$ETIKET.plist"
    echo "LaunchAgent kaldırıldı"
else
    echo "LaunchAgent zaten yok"
fi

# 3) Gösterge uygulaması.
if [ -d "$KOK/GunlukKota.app" ]; then
    rm -rf "$KOK/GunlukKota.app"
    echo "Gösterge kaldırıldı"
else
    echo "Gösterge zaten yok"
fi

# 4) --hepsi: tüm veriler.
if [ "$HEPSI" = true ]; then
    printf "Tüm veriler silinsin mi? (e/h) "
    CEVAP=""
    read -r CEVAP || CEVAP="h"   # EOF / girdi yok: hayir say
    case "$CEVAP" in
        e|E) rm -rf "$KOK"; echo "Veri kökü silindi: $KOK" ;;
        *)   echo "Veriler korundu: $KOK" ;;
    esac
fi

echo "Kaldırma tamam."
