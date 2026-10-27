// UserPromptSubmit kancasi: gunluk kota tavani asilinca yeni istegi engeller.
// Akis: (1) istek acma ifadesi iceriyorsa bugunluk bypass ac ve gec;
// (2) durumu yukle, en son YEREL nokta 3 dakikadan eskiyse once hizli olcup
// deftere isle; (3) engel kolundaysa blok karari yaz; degilse sessiz cik.
// Herhangi bir hata durumunda HICBIR sey yazmadan 0 ile cikilir (fail-open:
// bozuk sayac isi asla durduramaz). Modele baglam enjekte edilmez.

import { ayarOku, jsonOku, jsonYaz, yerelYolu } from './ayar.mjs';
import { olcumleriOku, olcumEkle } from './defter.mjs';
import { durum } from './durum.mjs';
import { olc } from './olcum.mjs';
import { gunAdi } from './zaman.mjs';

// Turkce buyuk/kucuk harf uyumu: once tr yereliyle kucult (I -> ı, İ -> i),
// sonra ı -> i (karsilastirma alfabetesi), bosluklari normallestir.
function normalize(metin) {
  return String(metin)
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ifade yalniz kisa mesajda ve tam kelime olarak sayilir: engel metnini ya da
// README'yi yapistirmak, "kota devamlilik" gibi kelimeler engeli kaldirmaz;
// sesle yazilan "tamam kota devam" gecer.
const ACMA_EN_UZUN = 60;
const harfMi = (c) => /[\p{L}\p{N}]/u.test(c);
function acmaIfadesiMi(prompt, ifadeler) {
  const p = normalize(prompt);
  return (ifadeler || []).some((ifade) => {
    const i = ifade ? normalize(ifade) : '';
    if (!i || p.length > Math.max(ACMA_EN_UZUN, i.length + 30)) return false;
    for (let k = p.indexOf(i); k >= 0; k = p.indexOf(i, k + 1)) {
      if (!harfMi(p.charAt(k - 1)) && !harfMi(p.charAt(k + i.length))) return true;
    }
    return false;
  });
}

function bugunlukBypassAc() {
  const ayar = ayarOku();
  const gun = gunAdi(Date.now(), ayar.saatDilimi || 'Europe/Berlin');
  const yerel = jsonOku(yerelYolu(), {});
  jsonYaz(yerelYolu(), { ...yerel, bypassGun: gun });
}

// Sayi bicimi yalniz bu mesajda Turkce virgullu: 15.2 -> "15,2".
function turkceSayi(n) {
  const s = Number(n);
  return Number.isInteger(s) ? String(s) : String(s).replace('.', ',');
}

function blokMesaji(d) {
  return 'GÜNLÜK KOTA DOLDU\n\n'
    + `Bugün (${d.gun}) haftalık kotadan %${turkceSayi(d.harcanan)} harcandı; günlük tavan %${turkceSayi(d.tavan)}.\n`
    + 'İstek gönderilmedi.\n\n'
    + 'Devam etmek için yalnız "kota devam" yaz: engel yalnız bu cihazda ve bugün için kalkar.\n'
    + `Sayaç 00:00'da (${d.saatDilimi}) yenilenir.`;
}

// En son yerel nokta 3 dakikadan eskiyse hizli olcum yapip deftere isle.
async function tazele() {
  const olcumler = olcumleriOku().olcumler;
  const sonYerel = [...olcumler].reverse().find((p) => p.k === 'yerel');
  if (sonYerel && Date.now() - sonYerel.t <= 3 * 60000) return;
  const sonuc = await olc({ zamanAsimiMs: 6000 });
  if (!sonuc?.hata) olcumEkle(sonuc);
}

async function calis(ham) {
  let girdi = {};
  try {
    girdi = JSON.parse(ham);
  } catch { /* bos ya da bozuk girdi olabilir */ }
  const prompt = String(girdi?.prompt || '');

  const ayar = ayarOku();
  if (prompt && acmaIfadesiMi(prompt, ayar.acmaIfadeleri)) {
    try { bugunlukBypassAc(); } catch { /* onemli degil */ }
    process.stdout.write('{}');
    return;
  }

  try { await tazele(); } catch { /* olcum yazilamadi: eldeki veriyle karar */ }

  const d = durum();
  if (d.engel) {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: blokMesaji(d),
    }));
  }
}

let ham = '';
process.stdin.setEncoding('utf8');
process.stdin.on('error', () => process.exit(0));
process.stdin.on('data', (c) => { ham += c; });
process.stdin.on('end', () => {
  calis(ham).catch(() => process.exit(0));
});
