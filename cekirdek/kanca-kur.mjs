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
    // Windows PowerShell 5.1'in yazdigi BOM ve bos dosya gecerli sayilir.
    const ham = fs.readFileSync(ayarDosyasi, 'utf8').replace(/^\uFEFF/, '');
    dosyaVardi = true;
    ayar = ham.trim() === '' ? {} : JSON.parse(ham);
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

  const bizimKanca = (h) => typeof h?.args?.[0] === 'string'
    && (h.args[0].endsWith('/cekirdek/kanca.mjs')
      || h.args[0].endsWith('\\cekirdek\\kanca.mjs'));
  // Gruptan yalniz bizim kancamiz cikar; ayni gruptaki baska kancalar korunur,
  // yalniz bizimkini tasiyan grup duser.
  const ayikla = (gruplar) => gruplar.flatMap((g) => {
    if (!Array.isArray(g?.hooks) || !g.hooks.some(bizimKanca)) return [g];
    const kalan = g.hooks.filter((h) => !bizimKanca(h));
    return kalan.length ? [{ ...g, hooks: kalan }] : [];
  });
  const bizimSayi = liste.reduce(
    (n, g) => n + (Array.isArray(g?.hooks) ? g.hooks.filter(bizimKanca).length : 0), 0);

  let sonraki;
  if (kaldir) {
    if (!bizimSayi) return { degisti: false, kaldirildi: 0 };
    sonraki = ayikla(liste);
  } else {
    sonraki = [...ayikla(liste), {
      hooks: [{
        type: 'command',
        command: nodeYolu,
        args: [kancaYolu],
        timeout: 15,
      }],
    }];
    if (JSON.stringify(liste) === JSON.stringify(sonraki)) {
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
    ? { degisti: true, kaldirildi: bizimSayi }
    : { degisti: true };
}
