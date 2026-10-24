// Yapilandirma ve yollar. KOK = GUNLUK_KOTA_EV ortam degiskeni ya da
// ~/.gunluk-kota. Tum JSON yazmalari gecici dosya + rename ile atomiktir.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Kok dizin cagri aninda cozulur (testler ayni surecte farkli KOK kullanir).
export function kok() {
  return process.env.GUNLUK_KOTA_EV || path.join(os.homedir(), '.gunluk-kota');
}

export const ayarYolu = () => path.join(kok(), 'ayar.json');
export const olcumlerYolu = () => path.join(kok(), 'olcumler.json');
export const onbellekYolu = () => path.join(kok(), 'onbellek.json');
export const yerelYolu = () => path.join(kok(), 'yerel.json');
export const paylasimYolu = () => path.join(kok(), 'paylasim.json');
export const bildirimYolu = () => path.join(kok(), 'bildirim.json');
export const cekirdekDizini = () => path.join(kok(), 'cekirdek');

export const VARSAYILANLAR = {
  tavan: 15,
  uyari: 12,
  saatDilimi: 'Europe/Berlin',
  engel: true,
  baslangic: null,
  acmaIfadeleri: ['kota devam'],
  bildirimEsikleri: [5, 10, 13],
  openUsageUrl: 'http://127.0.0.1:6736/v1/usage/claude',
  paylasim: { yayinla: null, oku: null },
};

// Genel amacli guvenli okuma: dosya yoksa ya da bozuksa fallback doner.
export function jsonOku(dosya, varsayilan = null) {
  try {
    return JSON.parse(fs.readFileSync(dosya, 'utf8'));
  } catch {
    return varsayilan;
  }
}

// Atomik yazma: once ayni dizinde .tmp-<pid>-<rastgele>, sonra rename.
export function jsonYaz(dosya, deger) {
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  // Var olan dosyanin izinleri korunur (or. settings.json 600); yeni dosya 600.
  let mod = 0o600;
  try { mod = fs.statSync(dosya).mode & 0o777; } catch { /* dosya yok */ }
  fs.writeFileSync(gecici, JSON.stringify(deger, null, 2), { mode: mod });
  fs.chmodSync(gecici, mod);
  fs.renameSync(gecici, dosya);
}

// Ayarlari oku: ust uste VARSAYILANLAR ile birlestirir, bozuk dosya sorun etmez.
export function ayarOku() {
  const kayitli = jsonOku(ayarYolu(), {});
  const birlesik = { ...VARSAYILANLAR, ...(kayitli && typeof kayitli === 'object' ? kayitli : {}) };
  birlesik.paylasim = {
    ...VARSAYILANLAR.paylasim,
    ...((kayitli && typeof kayitli.paylasim === 'object' && kayitli.paylasim) || {}),
  };
  return birlesik;
}

export function ayarYaz(ayar) {
  jsonYaz(ayarYolu(), ayar);
}
