#!/bin/bash
# Gunluk kota gostergesini kurar: cekirdegi KOK'e kopyalar, kancayi kurar,
# uygulamayi derleyip yerlestirir, LaunchAgent'i kurar.
#
#   bash mac/kur.sh [--baslangic YYYY-MM-DD] [--tavan N]
#                   [--paylasim-oku ID_VEYA_URL] [--paylasim-yayinla GIST_ID]
#                   [--gosterge-yok] [--ev DIZIN] [--claude-ayar DOSYA]
#                   [--launchagent-yok]

set -euo pipefail

MAC_DIZINI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KOK_KAYNAGI="$(cd "$MAC_DIZINI/.." && pwd)"

BASLANGIC=""
TAVAN=""
PAYLASIM_OKU=""
PAYLASIM_YAYINLA=""
GOSTERGE_YOK=false
EV=""
CLAUDE_AYAR=""
LAUNCHAGENT_YOK=false

KULLANIM="Kullanım: bash mac/kur.sh [--baslangic YYYY-MM-DD] [--tavan N] [--paylasim-oku ID_VEYA_URL] [--paylasim-yayinla GIST_ID] [--gosterge-yok] [--ev DIZIN] [--claude-ayar DOSYA] [--launchagent-yok]"

while [ $# -gt 0 ]; do
    case "$1" in
        --baslangic) BASLANGIC="${2:?$KULLANIM}"; shift 2 ;;
        --tavan) TAVAN="${2:?$KULLANIM}"; shift 2 ;;
        --paylasim-oku) PAYLASIM_OKU="${2:?$KULLANIM}"; shift 2 ;;
        --paylasim-yayinla) PAYLASIM_YAYINLA="${2:?$KULLANIM}"; shift 2 ;;
        --gosterge-yok) GOSTERGE_YOK=true; shift ;;
        --ev) EV="${2:?$KULLANIM}"; shift 2 ;;
        --claude-ayar) CLAUDE_AYAR="${2:?$KULLANIM}"; shift 2 ;;
        --launchagent-yok) LAUNCHAGENT_YOK=true; shift ;;
        *) echo "Bilinmeyen seçenek: $1" >&2; echo "$KULLANIM" >&2; exit 2 ;;
    esac
done

# 1) Node >= 18 bul (mutlak yol). Aday 18+ ise mutlak yolunu basar;
# degilse hicbir sey basmaz.
nodeCoz() {
    ADAY="$1"
    [ -n "$ADAY" ] && [ -x "$ADAY" ] || return 0
    MAJOR="$("$ADAY" --version 2>/dev/null | sed -e 's/^v//' -e 's/\..*//')"
    case "$MAJOR" in ''|*[!0-9]*) return 0 ;; esac
    [ "$MAJOR" -ge 18 ] || return 0
    printf '%s\n' "$(cd "$(dirname "$ADAY")" && pwd)/$(basename "$ADAY")"
}
NODE="$(nodeCoz "$(command -v node 2>/dev/null || true)")"
[ -n "$NODE" ] || NODE="$(nodeCoz /opt/homebrew/bin/node)"
[ -n "$NODE" ] || NODE="$(nodeCoz /usr/local/bin/node)"
[ -n "$NODE" ] || NODE="$(nodeCoz /usr/bin/node)"
if [ -z "$NODE" ]; then
    echo "Node 18+ bulunamadı. Kurmak için: brew install node" >&2
    exit 1
fi
echo "Node bulundu: $NODE ($("$NODE" --version))"

# 2) Veri kökü.
KOK="${EV:-$HOME/.gunluk-kota}"
if [ ! -d "$KOK_KAYNAGI/cekirdek" ]; then
    echo "Çekirdek bulunamadı: $KOK_KAYNAGI/cekirdek" >&2
    exit 1
fi
mkdir -p "$KOK/cekirdek"
KOK="$(cd "$KOK" && pwd -P)"
export GUNLUK_KOTA_EV="$KOK"
echo "Veri kökü: $KOK"

# 3) Çekirdeği kopyala (yalnız *.mjs; test/ değil).
cp "$KOK_KAYNAGI"/cekirdek/*.mjs "$KOK/cekirdek/"
echo "Çekirdek kuruldu → $KOK/cekirdek"

# 4) Seçenekleri ayarlara işle.
if [ -n "$TAVAN" ]; then
    case "$TAVAN" in ''|*[!0-9.]*) echo "Geçersiz tavan: $TAVAN" >&2; exit 1 ;; esac
    "$NODE" "$KOK/cekirdek/kota.mjs" ayar tavan "$TAVAN" > /dev/null
    echo "Tavan: %$TAVAN"
fi
if [ -n "$BASLANGIC" ]; then
    "$NODE" "$KOK/cekirdek/kota.mjs" ayar baslangic "\"$BASLANGIC\"" > /dev/null
    echo "Başlangıç günü: $BASLANGIC"
fi
if [ -n "$PAYLASIM_YAYINLA" ] || [ -n "$PAYLASIM_OKU" ]; then
    YAYIN='null'
    OKU='null'
    if [ -n "$PAYLASIM_YAYINLA" ]; then
        YAYIN="{\"gist\":\"$PAYLASIM_YAYINLA\",\"dosya\":\"gunluk-kota.json\"}"
    fi
    if [ -n "$PAYLASIM_OKU" ]; then
        OKU="\"$PAYLASIM_OKU\""
    fi
    "$NODE" "$KOK/cekirdek/kota.mjs" ayar paylasim "{\"yayinla\":$YAYIN,\"oku\":$OKU}" > /dev/null
    echo "Paylaşım ayarlandı"
fi

# 5) Göstergenin node yolu: launchd PATH içinde /opt/homebrew/bin tutmaz.
printf '{"node":"%s"}\n' "$NODE" > "$KOK/uygulama.json"
echo "Uygulama yapılandırması → $KOK/uygulama.json"

# 6) UserPromptSubmit kancası.
if [ -n "$CLAUDE_AYAR" ]; then
    "$NODE" "$KOK/cekirdek/kota.mjs" kanca-kur --ayar-dosyasi "$CLAUDE_AYAR"
else
    "$NODE" "$KOK/cekirdek/kota.mjs" kanca-kur
fi

# 7) Göstergeyi derle, KOK'e taşı; LaunchAgent.
if [ "$GOSTERGE_YOK" = false ]; then
    GECICI="$(mktemp -d)"
    bash "$MAC_DIZINI/derle.sh" "$GECICI" > /dev/null
    rm -rf "$KOK/GunlukKota.app"
    mv "$GECICI/GunlukKota.app" "$KOK/GunlukKota.app"
    rm -rf "$GECICI"
    echo "Gösterge kuruldu → $KOK/GunlukKota.app"

    if [ "$LAUNCHAGENT_YOK" = false ]; then
        ETIKET="com.claude-gunluk-kota.gosterge"
        PLIST_DIZINI="$HOME/Library/LaunchAgents"
        PLIST="$PLIST_DIZINI/$ETIKET.plist"
        mkdir -p "$PLIST_DIZINI"
        # --ev verildiyse uygulama o kökü GUNLUK_KOTA_EV ile bilmeli.
        if [ -n "$EV" ]; then
            ENV_SATIRI="<key>EnvironmentVariables</key><dict><key>GUNLUK_KOTA_EV</key><string>$KOK</string></dict>"
        else
            ENV_SATIRI=""
        fi
        sed -e "s|__APP__|$KOK/GunlukKota.app/Contents/MacOS/GunlukKota|g" \
            -e "s|__ENV_SATIRI__|$ENV_SATIRI|g" \
            "$MAC_DIZINI/$ETIKET.plist.sablon" > "$PLIST"
        plutil -lint "$PLIST" > /dev/null
        launchctl bootout "gui/$(id -u)/$ETIKET" 2> /dev/null || true
        launchctl bootstrap "gui/$(id -u)" "$PLIST"
        echo "LaunchAgent kuruldu → $PLIST"
    fi
fi

# 8) İlk ölçüm ve özet.
"$NODE" "$KOK/cekirdek/kota.mjs" olc
