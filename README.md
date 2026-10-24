# Claude Günlük Kota

Birkaç kişinin ortak kullandığı bir Claude Max hesabı için **günlük kota tavanı**.

Anthropic yalnız haftalık kullanım yüzdesini gösterir. Bir kişi bir günde haftanın yarısını yerse geri kalanlar hafta sonuna kadar bekler. Bu araç haftalık kotayı güne böler: varsayılan olarak **günde en çok haftalık kotanın %15'i**. Tavan dolunca o cihazdaki Claude Code yeni mesaj göndermez.

- **macOS:** menü çubuğunda Claude simgesi; ışınlar günlük tavanın doluluğu kadar dolar.
- **Windows:** görev çubuğu tepsisinde aynı simge ve aynı panel.
- **Çekirdek:** iki sistemde de aynı Node.js kodu; bağımlılık yok.

## Nasıl çalışır

1. Gösterge dakikada bir Anthropic'in kullanım ucundan haftalık ve 5 saatlik yüzdeyi okur. Bu okuma kota harcamaz.
2. Her okuma bir gözlem olarak kaydedilir. İki gözlem arasındaki artış o aralığa eşit dağıtılır; aralık gece yarısını geçiyorsa artış iki güne süreye göre bölünür. Böylece kapalı kalan ya da yeni kurulan bir cihaz da günü doğru hesaplar.
3. Claude Code'a bir `UserPromptSubmit` kancası eklenir. Bugünün payı tavana ulaştıysa istek gönderilmez ve sebebi yazılır.
4. Devam etmek gerekirse mesaja **`kota devam`** yazılır: engel yalnız o cihazda ve o gün için kalkar.

Gün sınırı varsayılan olarak `Europe/Berlin` saatiyle 00:00'dır. Hesap ortak olduğu için yüzde herkesin toplam harcamasıdır.

## Gereksinim

- Node.js 18 ya da üstü
- Claude Code (masaüstü uygulaması, terminal ya da IDE eklentisi), hesapla giriş yapılmış
- macOS 13+ ve Xcode komut satırı araçları (`xcode-select --install`), ya da Windows 10/11

## Kurulum

### macOS

```bash
git clone https://github.com/TheWinderst/claude-gunluk-kota.git
cd claude-gunluk-kota
bash mac/kur.sh
```

### Windows

```powershell
git clone https://github.com/TheWinderst/claude-gunluk-kota.git
cd claude-gunluk-kota
powershell -NoProfile -ExecutionPolicy Bypass -File windows\kur.ps1
```

Kurulum çekirdeği `~/.gunluk-kota` klasörüne kopyalar, kancayı `~/.claude/settings.json` dosyasına ekler (önce yedek alır, diğer kancalara dokunmaz), göstergeyi derler ve açılışta başlatır.

### Kurulum seçenekleri

| macOS | Windows | Ne yapar |
|---|---|---|
| `--baslangic 2026-10-28` | `-Baslangic 2026-10-28` | Engel bu günden itibaren devreye girer; öncesinde yalnız ölçer |
| `--tavan 15` | `-Tavan 15` | Günlük tavan (haftalık kotanın yüzdesi) |
| `--paylasim-oku <gist>` | `-PaylasimOku <gist>` | Başka cihazın yayımladığı gözlemleri de kullanır |
| `--paylasim-yayinla <gist>` | | Bu cihazın gözlemlerini bir gist'e yazar |
| `--gosterge-yok` | `-GostergeYok` | Yalnız çekirdek ve kanca, simge yok |

## Kullanım

Simgeye tıklayınca panel açılır: bugün, 5 saatlik pencere, hafta ve son günler. Menüde **Şimdi ölç**, **Bugünlük engeli aç / Engeli geri koy** ve **Bugünkü sayacı sıfırla** var. Harcama %5, %10 ve %13'e ulaşınca bildirim gelir.

Komut satırı:

```bash
node ~/.gunluk-kota/cekirdek/kota.mjs            # özet
node ~/.gunluk-kota/cekirdek/kota.mjs olc        # şimdi ölç
node ~/.gunluk-kota/cekirdek/kota.mjs ac         # bugünlük engeli kaldır
node ~/.gunluk-kota/cekirdek/kota.mjs kapat      # engeli geri koy
node ~/.gunluk-kota/cekirdek/kota.mjs ayar       # ayarları göster
node ~/.gunluk-kota/cekirdek/kota.mjs ayar tavan 15
```

## Ayarlar (`~/.gunluk-kota/ayar.json`)

| Anahtar | Varsayılan | Anlamı |
|---|---|---|
| `tavan` | `15` | Günlük tavan, haftalık kotanın yüzdesi |
| `uyari` | `12` | Simgenin sarıya döndüğü eşik |
| `saatDilimi` | `Europe/Berlin` | Günün başladığı saat dilimi |
| `engel` | `true` | `false` olursa yalnız ölçer, engellemez |
| `baslangic` | `null` | Engelin başladığı gün (`YYYY-MM-DD`) |
| `acmaIfadeleri` | `["kota devam"]` | Engeli bugünlük kaldıran ifadeler |
| `bildirimEsikleri` | `[5, 10, 13]` | Bildirim gelen yüzdeler |
| `paylasim` | `{ "yayinla": null, "oku": null }` | İsteğe bağlı gist paylaşımı |

## Cihazlar arası paylaşım (isteğe bağlı)

Her cihaz yüzdeyi kendisi okur, yani paylaşım şart değildir. Ama bir cihaz gece kapalıysa gece yarısı çevresindeki harcamayı tahminle böler. Sürekli açık bir cihaz gözlemlerini gizli bir gist'e yayımlarsa diğer cihazlar o gözlemleri de hesaba katar ve hepsi aynı sonucu bulur. Yayımlayan cihazda `gh auth login` yapılmış olmalı ya da `GUNLUK_KOTA_GITHUB_TOKEN` tanımlı olmalı. Gist'te yalnız zaman damgaları ve yüzdeler durur.

## Gizlilik

Claude oturum anahtarı yalnız `api.anthropic.com` adresine gider; hiçbir dosyaya, günlüğe ya da çıktıya yazılmaz. Bütün veriler `~/.gunluk-kota` klasöründe kalır.

## Kaldırma

```bash
bash mac/kaldir.sh            # --hepsi verileri de siler
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows\kaldir.ps1
```

## Geliştirme

```bash
node --test cekirdek/test/
bash mac/derle.sh
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File windows\derle.ps1
```

## Lisans

MIT
