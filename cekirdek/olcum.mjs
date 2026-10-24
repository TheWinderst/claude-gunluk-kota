// Olcum: Anthropic'in kotayi tuketmeyen GET /api/oauth/usage ucundesinden
// 5 saatlik ve 7 gunluk doluluk yuzdelerini okur. Anahtar once macOS Keychain,
// sonra <ev>/.claude/.credentials.json; ikisi de yoksa ya da API hata verirse
// yerel OpenUsage sunucusuna dusulur. Asla istisna firlatmaz; hata { hata }
// olarak doner. Anahtar hicbir yere yazilmaz, loglanmaz.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ayarOku, jsonOku, jsonYaz, onbellekYolu, VARSAYILANLAR } from './ayar.mjs';

const USAGE_UCU = 'https://api.anthropic.com/api/oauth/usage';

// Ucun utilization'i yuzde gelir (0..100); tek ondaliga yuvarla.
const yuzdeCevir = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};

// resets_at ISO-8601 gelir; unix saniyeye cevir.
const sifirCevir = (iso) => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};

// API yanitini { b5, b7, reset5, reset7, zaman } bicimine donusturur.
export function usageCevir(veri) {
  const b5 = yuzdeCevir(veri?.five_hour?.utilization);
  const b7 = yuzdeCevir(veri?.seven_day?.utilization);
  if (b5 === null && b7 === null) return { hata: 'kota alanları gelmedi' };
  return {
    b5,
    b7,
    reset5: sifirCevir(veri?.five_hour?.resets_at),
    reset7: sifirCevir(veri?.seven_day?.resets_at),
    zaman: new Date().toISOString(),
  };
}

// macOS'ta once Keychain (kullanici hesapli item, sonra hesapsiz eski item);
// Windows/Linux'ta Keychain yok, kimlik dogrudan dosyada durur.
function tokenBul(platform, ev) {
  if (platform === 'darwin') {
    for (const hesap of [os.userInfo().username, null]) {
      try {
        const arg = ['find-generic-password', '-s', 'Claude Code-credentials'];
        if (hesap) arg.push('-a', hesap);
        arg.push('-w');
        const ham = execFileSync('/usr/bin/security', arg, { encoding: 'utf8' });
        const t = JSON.parse(ham)?.claudeAiOauth?.accessToken;
        if (t) return t;
      } catch { /* bu hesap adiyla yok */ }
    }
  }
  try {
    const kimlik = jsonOku(path.join(ev, '.claude', '.credentials.json'), null);
    const oauth = kimlik?.claudeAiOauth;
    if (!oauth?.accessToken) return '';
    // expiresAt ms cinsinden; gecmisse pozitif bir sayiysa anahtar olmus sayilir.
    const bitis = Number(oauth.expiresAt);
    if (Number.isFinite(bitis) && bitis > 0 && bitis < Date.now()) {
      return { suresiDolu: true };
    }
    return oauth.accessToken;
  } catch {
    return '';
  }
}

// OpenUsage yerel sunucusu ayni yuzdeleri tutar. Yanit bir dizi; ilk ogenin
// 'lines' alanindaki 'progress' satirlarindan oturum 18.000.000 ms, hafta
// 604.800.000 ms penceresinden taninir. 'Fable' etiketli satir ayni pencereyi
// baska degerle tasir; kesinlikle kullanilmaz.
function openUsageSatirlariniAyikla(ham) {
  const satirlar = Array.isArray(ham) && Array.isArray(ham[0]?.lines) ? ham[0].lines : null;
  if (!satirlar) return { hata: 'yanıtta lines dizisi yok' };
  const progress = satirlar.filter((s) => s?.type === 'progress');
  const oturum = progress.find((s) => s.periodDurationMs === 18000000);
  let hafta = progress.find((s) => s.periodDurationMs === 604800000
    && String(s.label || '').toLowerCase() === 'weekly');
  if (!hafta) {
    hafta = progress.find((s) => s.periodDurationMs === 604800000
      && String(s.label || '').toLowerCase() !== 'fable');
  }
  if (!oturum && !hafta) return { hata: 'OpenUsage yanıtında kota satırı yok' };
  return usageCevir({
    five_hour: oturum ? { utilization: oturum.used, resets_at: oturum.resetsAt } : null,
    seven_day: hafta ? { utilization: hafta.used, resets_at: hafta.resetsAt } : null,
  });
}

async function openUsageCek(url, zamanAsimiMs, fetchFn) {
  let r;
  try {
    r = await fetchFn(url, { signal: AbortSignal.timeout(zamanAsimiMs) });
  } catch (e) {
    return { hata: `ulaşılamadı: ${e.message || e}` };
  }
  if (!r.ok) return { hata: `HTTP ${r.status}` };
  let ham;
  try {
    ham = await r.json();
  } catch (e) {
    return { hata: `JSON okunamadı: ${e.message || e}` };
  }
  return openUsageSatirlariniAyikla(ham);
}

// Ana olcum. Sonuc basariliysa KOK/onbellek.json'a yazilir; hata olduysa
// onbellekteki onceki sayisal degerler korunur, uzerine hata + sonDeneme eklenir.
export async function olc({
  zamanAsimiMs = 20000,
  fetchFn = fetch,
  platform = process.platform,
  ev = os.homedir(),
} = {}) {
  let sonuc;
  try {
    // Test kancasi: sabit dosya verilmisse aga cikmadan onu olc.
    if (process.env.GUNLUK_KOTA_ORNEK_JSON) {
      sonuc = usageCevir(jsonOku(process.env.GUNLUK_KOTA_ORNEK_JSON, null));
    } else {
      sonuc = await canliOlc(zamanAsimiMs, fetchFn, platform, ev);
    }
  } catch (e) {
    sonuc = { hata: `olçüm hatası: ${e.message || e}` };
  }
  try {
    onbellekYaz(sonuc);
  } catch { /* onbellek sart degil */ }
  return sonuc;
}

async function canliOlc(zamanAsimiMs, fetchFn, platform, ev) {
  const token = tokenBul(platform, ev);
  let sonuc;
  if (token && !token.suresiDolu) {
    let r = null;
    try {
      r = await fetchFn(USAGE_UCU, {
        headers: {
          authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'content-type': 'application/json',
          'user-agent': 'claude-code/2.1.237',
        },
        signal: AbortSignal.timeout(zamanAsimiMs),
      });
    } catch (e) {
      sonuc = { hata: `anthropic'e ulaşılamadı: ${e.message || e}` };
    }
    if (r) {
      if (r.status === 401 || r.status === 403) {
        sonuc = { hata: `Claude oturumu geçersiz (${r.status}), claude login gerekiyor` };
      } else if (!r.ok) {
        sonuc = { hata: `anthropic ${r.status}` };
      } else {
        sonuc = usageCevir(await r.json());
      }
    }
  } else if (token && token.suresiDolu) {
    sonuc = { hata: 'Claude oturumu süresi dolmuş: terminalde bir kez claude çalıştırıp giriş yap' };
  } else {
    sonuc = { hata: 'Claude oturum anahtarı bulunamadı' };
  }

  if (sonuc.hata) {
    // Ana yol yattiysa ayni olcum yerel OpenUsage'tan denenir; ikisi de
    // yatarsa hata metni iki sebebi birden tasir.
    // OpenUsage yalniz macOS uygulamasidir: baska sistemde varsayilan adres
    // denenmez, yoksa hata metninde olmayan bir uygulama gorunur.
    const openUsageUrl = ayarOku().openUsageUrl;
    const varsayilanDisarida = platform !== 'darwin' && openUsageUrl === VARSAYILANLAR.openUsageUrl;
    if (typeof openUsageUrl === 'string' && openUsageUrl && !varsayilanDisarida) {
      const ou = await openUsageCek(openUsageUrl, zamanAsimiMs, fetchFn);
      if (!ou.hata) return ou;
      return { hata: `${sonuc.hata}; OpenUsage: ${ou.hata}` };
    }
  }
  return sonuc;
}

// Hata sonucunda onceki iyi degerleri koru: hata ve sonDeneme disindaki tum
// alanlar eski onbellekten tasinir. Boylece ust uste hatalarda gosterge
// sessizce sifira dusmez, 'bayat' kolu calismaya devam eder.
function onbellekYaz(sonuc) {
  const dosya = onbellekYolu();
  if (!sonuc.hata) {
    jsonYaz(dosya, sonuc);
    return;
  }
  const eski = jsonOku(dosya, null);
  const temel = {};
  for (const k of Object.keys(eski || {})) {
    if (k !== 'hata' && k !== 'sonDeneme') temel[k] = eski[k];
  }
  jsonYaz(dosya, { ...temel, hata: sonuc.hata, sonDeneme: new Date().toISOString() });
}
