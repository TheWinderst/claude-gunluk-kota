// Paylasim (istege bagli): kendi olcumlerini GitHub gist'e yayinla, baskasinin
// gistini/URL'sini oku. Hatalar olc akisini asla bozmaz.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { delimiter } from 'node:path';
import { ayarOku, jsonOku, jsonYaz, yerelYolu, paylasimYolu, olcumlerYolu } from './ayar.mjs';

const GIST_API = 'https://api.github.com/gists';
const GUN_MS = 86400000;
const ARALIK_MS = 5 * 60000;   // iki yayin/okuma arasindaki en az sure

function yerelGuncelle(degisiklik) {
  const yerel = jsonOku(yerelYolu(), {});
  jsonYaz(yerelYolu(), { ...yerel, ...degisiklik });
  return { ...yerel, ...degisiklik };
}

// Son 8 gunun kendi "yerel" noktalarindan besleme kurar.
export function beslemeKur(simdi = Date.now()) {
  const tumu = jsonOku(olcumlerYolu(), { olcumler: [] }).olcumler || [];
  const ayar = ayarOku();
  return {
    surum: 1,
    uretici: 'claude-gunluk-kota',
    zaman: new Date(simdi).toISOString(),
    saatDilimi: ayar.saatDilimi || 'Europe/Berlin',
    olcumler: tumu
      .filter((p) => p && p.k !== 'paylasim' && Number.isFinite(p.t) && p.t >= simdi - 8 * GUN_MS)
      .map(({ t, u, r, b5, r5 }) => ({ t, u, r, b5: b5 ?? null, r5: r5 ?? null })),
  };
}

// Gelen her noktayi dogrula: sonlu sayilar, 0 <= u <= 100, t [simdi-11g,
// simdi+5dk] icinde (ms), r [simdi-8g, simdi+8g] icinde (saniye). Gecersiz
// sessizce atilir.
export function noktaDogrula(p, simdi = Date.now()) {
  const t = Number(p?.t);
  const u = Number(p?.u);
  const r = Number(p?.r);
  if (![t, u, r].every(Number.isFinite)) return false;
  if (u < 0 || u > 100) return false;
  if (t < simdi - 11 * GUN_MS || t > simdi + 5 * 60000) return false;
  const rs = simdi / 1000;
  if (r < rs - 8 * 86400 || r > rs + 8 * 86400) return false;
  return true;
}

const MAKS_NOKTA = 5000;

export function beslemeDogrula(besleme, simdi = Date.now()) {
  if (!besleme || besleme.surum !== 1 || !Array.isArray(besleme.olcumler)) return null;
  // Yabanci beslemeye tavan: 8 gunluk sikistirilmis gozlem birkac yuzu gecmez.
  return besleme.olcumler.slice(-MAKS_NOKTA).filter((p) => noktaDogrula(p, simdi));
}

function ozet(noktalar) {
  return createHash('sha256').update(JSON.stringify(noktalar)).digest('hex');
}

function githubToken(tokenFn) {
  if (process.env.GUNLUK_KOTA_GITHUB_TOKEN) return process.env.GUNLUK_KOTA_GITHUB_TOKEN;
  if (tokenFn) return tokenFn();
  // LaunchAgent ve tepsi uygulamasi kabuk PATH'ini almaz; gh'nin olagan
  // kurulum yerleri elle eklenir.
  const PATH = [process.env.PATH, '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(delimiter);
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token'], { timeout: 5000, env: { ...process.env, PATH } }, (hata, cikti) => {
      resolve(hata ? '' : String(cikti || '').trim());
    });
  });
}

// Gist'e yayinla. ayar.paylasim.yayinla = { gist, dosya } zorunlu. Vade: son
// yayindan beri >= 5 dk gectiyse VE kendi nokta kumesi degistiyse (zorla
// hariç). Donus: { tamam } ya da { hata } ya da { atlandi }.
export async function yayinla({ zorla = false, fetchFn = fetch, tokenFn = null } = {}) {
  const ayar = ayarOku();
  const hedef = ayar.paylasim?.yayinla;
  if (!hedef?.gist) return { hata: 'paylaşım yapılandırılmamış (ayar.paylasim.yayinla)' };
  const dosya = hedef.dosya || 'gunluk-kota.json';
  const simdi = Date.now();
  const yerel = jsonOku(yerelYolu(), {});

  // Vade: son yayindan beri >= 5 dk VE kendi nokta kumesi degismis olmali.
  const besleme = beslemeKur(simdi);
  if (!zorla) {
    const gecen = yerel.yayinZaman ? simdi - Date.parse(yerel.yayinZaman) : Infinity;
    if (gecen < ARALIK_MS) return { atlandi: true };
    if (yerel.yayinOzet === ozet(besleme.olcumler)) return { atlandi: true, degismedi: true };
  }
  const token = await githubToken(tokenFn);
  if (!token) return { hata: 'GitHub anahtarı yok: GUNLUK_KOTA_GITHUB_TOKEN ya da gh auth token gerekli' };

  let r;
  try {
    r = await fetchFn(`${GIST_API}/${hedef.gist}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'claude-gunluk-kota',
      },
      body: JSON.stringify({ files: { [dosya]: { content: JSON.stringify(besleme) } } }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return { hata: `gist'e ulaşılamadı: ${e.message || e}` };
  }
  if (!r.ok) return { hata: `gist HTTP ${r.status}` };
  yerelGuncelle({ yayinZaman: new Date(simdi).toISOString(), yayinOzet: ozet(besleme.olcumler) });
  return { tamam: true, sayi: besleme.olcumler.length };
}

// Baskalarinin beslemesini oku: ayar.paylasim.oku = gist kimligi, URL ya da
// bunlarin listesi (iki yonlu paylasim: her cihaz kendi gist'ini yayinlar,
// otekilerinkini okur). Dogrulanmis noktalar KOK/paylasim.json'a kaynak kaynak
// yazilir; o tur ulasilamayan kaynagin onceki noktalari korunur.
// Donus: { sayi } | { hata }.
export async function oku({ fetchFn = fetch } = {}) {
  const ayar = ayarOku();
  const kaynaklar = [].concat(ayar.paylasim?.oku || []).filter((k) => typeof k === 'string' && k);
  if (!kaynaklar.length) return { hata: 'okuma kaynağı yapılandırılmamış (ayar.paylasim.oku)' };
  const simdi = Date.now();
  const onceki = jsonOku(paylasimYolu(), null);
  const eskiKaynaklar = (onceki && typeof onceki.kaynaklar === 'object' && onceki.kaynaklar) || {};
  const yeniKaynaklar = {};
  const hatalar = [];
  for (const kaynak of kaynaklar) {
    const s = await tekKaynakOku(kaynak, fetchFn, simdi);
    if (s.hata) {
      hatalar.push(`${kaynak}: ${s.hata}`);
      const eski = eskiKaynaklar[kaynak];
      if (eski && Array.isArray(eski.olcumler)) {
        yeniKaynaklar[kaynak] = { ...eski, olcumler: beslemeDogrula({ surum: 1, olcumler: eski.olcumler }, simdi) || [] };
      }
    } else {
      yeniKaynaklar[kaynak] = { alindi: new Date(simdi).toISOString(), olcumler: s.olcumler };
    }
  }
  const birlesik = Object.values(yeniKaynaklar).flatMap((k) => k.olcumler);
  if (!Object.keys(yeniKaynaklar).length) return { hata: hatalar.join('; ') };
  jsonYaz(paylasimYolu(), { alindi: new Date(simdi).toISOString(), kaynaklar: yeniKaynaklar, olcumler: birlesik });
  yerelGuncelle({ okumaZaman: new Date(simdi).toISOString() });
  return hatalar.length ? { sayi: birlesik.length, hata: hatalar.join('; ') } : { sayi: birlesik.length };
}

async function tekKaynakOku(kaynak, fetchFn, simdi) {
  let yanit;
  try {
    if (/^http:\/\//i.test(kaynak)) return { hata: 'paylaşım adresi https olmalı' };
    const url = /^https:\/\//i.test(kaynak) ? kaynak : `${GIST_API}/${kaynak}`;
    yanit = await fetchFn(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'claude-gunluk-kota' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return { hata: `paylaşım kaynağına ulaşılamadı: ${e.message || e}` };
  }
  if (!yanit.ok) return { hata: `paylaşım HTTP ${yanit.status}` };
  let ham;
  try {
    ham = await yanit.json();
  } catch (e) {
    return { hata: `paylaşım JSON okunamadı: ${e.message || e}` };
  }

  // Gist yanıtı: dosyalar arasından besleme olarak ayristirilan ilkini al.
  let aday;
  if (ham && typeof ham === 'object' && ham.files && !Array.isArray(ham)) {
    for (const dosya of Object.values(ham.files)) {
      if (typeof dosya?.content !== 'string') continue;
      try {
        const cozulen = JSON.parse(dosya.content);
        if (cozulen?.surum === 1 && Array.isArray(cozulen.olcumler)) { aday = cozulen; break; }
      } catch { /* bu dosya besleme degil */ }
    }
  } else {
    aday = ham;
  }
  const gecerli = beslemeDogrula(aday, simdi);
  if (!gecerli) return { hata: 'paylaşımda geçerli besleme yok' };
  return { olcumler: gecerli };
}

// olc akisindan cagrilir: vade dolmissa oku + yayinla dene, hatalar yutulur.
export async function akisYap({ fetchFn = fetch, tokenFn = null } = {}) {
  const ayar = ayarOku();
  const yerel = jsonOku(yerelYolu(), {});
  const simdi = Date.now();
  const sonuc = {};
  if (ayar.paylasim?.oku) {
    const vade = yerel.okumaZaman ? simdi - Date.parse(yerel.okumaZaman) : Infinity;
    if (vade >= ARALIK_MS) {
      try {
        sonuc.okuma = await oku({ fetchFn });
      } catch (e) {
        sonuc.okuma = { hata: String(e?.message || e) };
      }
    }
  }
  if (ayar.paylasim?.yayinla?.gist) {
    try {
      sonuc.yayin = await yayinla({ fetchFn, tokenFn });
    } catch (e) {
      sonuc.yayin = { hata: String(e?.message || e) };
    }
  }
  return sonuc;
}
