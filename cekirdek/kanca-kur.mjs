// Kanca kurucu: ~/.claude/settings.json icine UserPromptSubmit kancasini
// ekler / kaldirir. Idempotent: bizim girisimiz (args[0] .../cekirdek/kanca.mjs)
// varsa degistirilir, asla ikilenmez; baska her giris oldugu gibi korunur.
// Ilk yazmadan once dosya varsa yedegi alinir. Bozuk JSON'da hicbir sey
// degismeden Turkce hatayla cikilir.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { jsonYaz, jsonOku, kok } from './ayar.mjs';

// Kurulumun kaydettigi kalici node yolu (uygulama.json). process.execPath
// surum klasorunu verir (Homebrew'de Cellar/node/26.4.0); node guncellenince
// o yol kaybolur ve kanca sessizce olur. Kalici yol varsa o kullanilir.
function kaliciNode() {
  const n = jsonOku(path.join(kok(), 'uygulama.json'), null)?.node;
  return typeof n === 'string' && n && fs.existsSync(n) ? n : process.execPath;
}

export function kancaKur({
  ayarDosyasi = path.join(os.homedir(), '.claude', 'settings.json'),
  nodeYolu = kaliciNode(),
  kancaYolu = fileURLToPath(new URL('./kanca.mjs', import.meta.url)),
  kaldir = false,
} = {}) {
  nodeYolu = String(nodeYolu).replaceAll('\\', '/');
  kancaYolu = String(kancaYolu).replaceAll('\\', '/');

  let ayar = null;
  let dosyaVardi = false;
  try {
    const ham = fs.readFileSync(ayarDosyasi, 'utf8');
    dosyaVardi = true;
    ayar = JSON.parse(ham);
  } catch (e) {
    if (dosyaVardi) {
      // Dosya var ama JSON degil: dokunmadan cik.
      throw new Error(`settings.json okunamadı (geçersiz JSON?), hiçbir şey değişmedi: ${e.message}`);
    }
    ayar = {};
  }
  if (!ayar || typeof ayar !== 'object' || Array.isArray(ayar)) {
    ayar = {};
  }

  ayar.hooks = (ayar.hooks && typeof ayar.hooks === 'object' && !Array.isArray(ayar.hooks))
    ? ayar.hooks : {};
  const liste = Array.isArray(ayar.hooks.UserPromptSubmit)
    ? ayar.hooks.UserPromptSubmit : [];

  const bizimki = (giris) => {
    const args = giris?.hooks;
    if (!Array.isArray(args)) return false;
    return args.some((h) => typeof h?.args?.[0] === 'string'
      && (h.args[0].endsWith('/cekirdek/kanca.mjs')
        || h.args[0].endsWith('\\cekirdek\\kanca.mjs')));
  };

  let sonraki;
  if (kaldir) {
    sonraki = liste.filter((g) => !bizimki(g));
    if (sonraki.length === liste.length) return { degisti: false, kaldirildi: 0 };
  } else {
    const kalan = liste.filter((g) => !bizimki(g));
    sonraki = [...kalan, {
      hooks: [{
        type: 'command',
        command: nodeYolu,
        args: [kancaYolu],
        timeout: 15,
      }],
    }];
    if (sonraki.length === liste.length && JSON.stringify(liste) === JSON.stringify(sonraki)) {
      return { degisti: false };
    }
  }

  // Ilk yazma oncesi yedek (dosya zaten varsa).
  if (dosyaVardi) {
    const damga = new Date();
    const s = (n) => String(n).padStart(2, '0');
    const temel = `${ayarDosyasi}.yedek-gunluk-kota-`
      + `${damga.getFullYear()}${s(damga.getMonth() + 1)}${s(damga.getDate())}`
      + `-${s(damga.getHours())}${s(damga.getMinutes())}${s(damga.getSeconds())}`;
    // Ayni saniyede ikinci yazim ilk yedegi ezmesin: ad doluysa sira eki al.
    let ad = temel;
    for (let i = 2; fs.existsSync(ad); i++) ad = `${temel}-${i}`;
    fs.copyFileSync(ayarDosyasi, ad);
  }

  if (sonraki.length) ayar.hooks.UserPromptSubmit = sonraki;
  else delete ayar.hooks.UserPromptSubmit;
  if (!Object.keys(ayar.hooks).length) delete ayar.hooks;

  jsonYaz(ayarDosyasi, ayar);
  return kaldir
    ? { degisti: true, kaldirildi: liste.length - sonraki.length }
    : { degisti: true };
}
