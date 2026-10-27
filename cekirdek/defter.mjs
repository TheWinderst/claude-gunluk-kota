// Defter: olcumlerin gozlem kaydi ve gunluk dagitim.
//
// olcumler.json = { surum: 1, olcumler: [ { t, u, r, b5, r5, k } ] }
//   t: olcum aninin unix ms degeri, u: haftalik yuzde, r: pencere kimligi,
//   b5/r5: 5 saatlik yuzde ve sifirlanmasi (yoksa null), k: "yerel"|"paylasim".
//
// DAGITIM (cekirdek algoritma, saf): sunucu yalniz "haftalik yuzde simdi X"
// der; iki olcum arasindaki artis o aralikta bir yerde olmustur. Artis
// araliga UNIFORM yayilir, gece yarisini kesen aralik zamana gore bolunur.
// Pencere basina kosan maksimum (M[r]) sayesinde 3-4-3-4 dalgalanmasi iki
// kez sayilmaz (12.08.2026'da ham farklarin toplanmasi %13'luk haftayi %59
// gostermisti; o yol kalici kaldirildi).

import { jsonOku, jsonYaz, olcumlerYolu } from './ayar.mjs';
import { gunAdi, gunDilimleri } from './zaman.mjs';

const GUN_MS = 86400000;
// Ayni pencerede bu kadar puanlik dusus sifirlama sayilir (titreme 1 puandir).
const ICERDE_SIFIRLAMA = 3;

// reset7 (unix saniye) -> pencere kimligi: 10 dakikaya yuvarlanir, boylece
// ms titremesi sahte yeni pencere yaratmaz.
export const pencereKimligi = (reset7) => Math.round(reset7 / 600) * 600;

export function olcumleriOku() {
  const d = jsonOku(olcumlerYolu(), null);
  if (d && Array.isArray(d.olcumler)) return { surum: 1, olcumler: d.olcumler };
  return { surum: 1, olcumler: [] };
}

// Basarili bir olcumu deftere isler: ekle, sikistir, 10 gundan eskileri at.
export function olcumEkle(sonuc, simdi = Date.now()) {
  // Haftalik alan yoksa nokta yazilmaz: Number(null) === 0 sahte "%0" yazip
  // engeli sessizce kaldiriyordu. Sifirlama ani yalniz %0'da eksik olabilir.
  const u = sonuc?.b7;
  if (typeof u !== 'number' || !Number.isFinite(u)) return olcumleriOku();
  const reset7 = sonuc?.reset7;
  if (!(typeof reset7 === 'number' && Number.isFinite(reset7)) && u > 0) return olcumleriOku();
  const r = pencereKimligi(typeof reset7 === 'number' && Number.isFinite(reset7) ? reset7 : 0);
  const yeni = {
    t: simdi,
    u,
    r,
    b5: Number.isFinite(Number(sonuc?.b5)) ? Number(sonuc.b5) : null,
    r5: Number.isFinite(Number(sonuc?.reset5)) ? Number(sonuc.reset5) : null,
    k: 'yerel',
  };
  const defter = olcumleriOku();
  const list = defter.olcumler;
  const n = list.length;
  // Sikistirma: yeni nokta son noktayla ve onun da onundeki noktayla ayni
  // (u, r) tasimali; o zaman son nokta yenisiyle degistirilir. Boylece her
  // esit deger dizisi yalniz ilk ve son noktasini saklar.
  if (n >= 2
    && list[n - 1].u === yeni.u && list[n - 1].r === yeni.r
    && list[n - 2].u === yeni.u && list[n - 2].r === yeni.r) {
    list[n - 1] = yeni;
  } else {
    list.push(yeni);
  }
  const kirpilmis = list.filter((p) => p.t >= simdi - 10 * GUN_MS);
  const yazilacak = { surum: 1, olcumler: kirpilmis };
  jsonYaz(olcumlerYolu(), yazilacak);
  return yazilacak;
}

// Yerel ve paylasimdan gelen noktalari BELLEKTE birlestirir (paylasim noktasi
// hicbir zaman olcumler.json'a yazilmaz). Birlesim = birligi, t'ye gore
// sirala; |dt| < 1000 ms, ayni u ve ayni r'li bir nokta zaten varsa dusur
// (yerel kazanir: once yerel eklenir).
export function birlestir(yerelListe, paylasimListe) {
  const sonuc = [];
  const ekle = (p, k) => {
    const t = Number(p?.t);
    const u = Number(p?.u);
    const r = Number(p?.r);
    if (!Number.isFinite(t) || !Number.isFinite(u) || !Number.isFinite(r)) return;
    if (sonuc.some((q) => q.u === u && q.r === r && Math.abs(q.t - t) < 1000)) return;
    sonuc.push({
      t, u, r,
      b5: Number.isFinite(Number(p?.b5)) ? Number(p.b5) : null,
      r5: Number.isFinite(Number(p?.r5)) ? Number(p.r5) : null,
      k,
    });
  };
  for (const p of yerelListe || []) ekle(p, 'yerel');
  for (const p of paylasimListe || []) ekle(p, 'paylasim');
  sonuc.sort((a, b) => a.t - b.t);
  return sonuc;
}

// GUNLUK DAGITIM (saf). Girdi: t'ye gore sirali noktalar, saat dilimi,
// { simdi?, sifirla?: { gun, an } }. Cikti: { "YYYY-MM-DD": yuzde }.
export function dagit(noktalar, saatDilimi = 'Europe/Berlin', secenek = {}) {
  const gunler = {};
  const M = {};                       // pencere basina kosan maksimum
  const MK = {};                      // kaynak+pencere basina maksimum (sifirlama tespiti)
  const sf = secenek.sifirla || null; // { gun: "YYYY-MM-DD", an: <ms> }
  let prev = null;
  const sirali = [...(noktalar || [])].sort((a, b) => a.t - b.t);

  const ekle = (gun, miktar) => {
    gunler[gun] = Math.max(0, (gunler[gun] || 0) + miktar);
  };

  const isle = (inc, s, t) => {
    if (!(inc > 0)) return;
    if (t - s <= 0) {
      // Sifir uzunluklu aralik: tamamindan t'nin gunu alir.
      ekle(gunAdi(t, saatDilimi), inc);
      return;
    }
    let dilimler = gunDilimleri(s, t, saatDilimi);
    if (sf && Number.isFinite(sf.an)) {
      // Elle sifirlama: yalniz o gun icin araligin `an`'dan SONRAKI bolumu
      // sayilir; sabah kisim hicbir gune yazilmaz.
      const sonra = gunDilimleri(Math.max(s, sf.an), t, saatDilimi);
      const harita = new Map(sonra.map((d) => [d.gun, d.ms]));
      dilimler = dilimler.map((d) => (d.gun === sf.gun
        ? { gun: d.gun, ms: harita.get(d.gun) ?? 0 }
        : d));
    }
    for (const d of dilimler) {
      if (d.ms > 0) ekle(d.gun, (inc * d.ms) / (t - s));
    }
  };

  for (const p of sirali) {
    const { u, t, r } = p;
    let s;
    let inc;
    if (!prev || prev.r !== r) {
      // Y pencere (ya da ilk nokta): pencere basindan ya da onceki noktadan basla.
      const ws = r * 1000 - 7 * GUN_MS;
      s = prev ? Math.max(ws, prev.t) : ws;
      inc = Math.max(0, u - (M[r] ?? 0));
    } else {
      s = prev.t;
      const mk = MK[`${p.k || 'yerel'}|${r}`] ?? 0;
      if (u <= mk - ICERDE_SIFIRLAMA && u <= mk / 2) {
        // Pencere ayni ama yuzde belirgin dustu: plan yukseltme ya da genel
        // sifirlama (24.10.2026: Max 5x -> 20x gecisinde %99 -> %2 oldu,
        // resets_at degismedi). Taban sifirlanir; yeni yuzde sifirlamadan
        // sonraki harcamadir. Dusus yalniz ayni kaynagin kendi dizisinde ve
        // yarinin altina inince sayilir: tek hatali okuma ya da iki makinenin
        // saat farki (gist gecikmesi) haftanin tamamini bugune yazmasin.
        M[r] = 0;
        for (const a of Object.keys(MK)) if (a.endsWith(`|${r}`)) MK[a] = 0;
      }
      inc = Math.max(0, u - (M[r] ?? 0));
    }
    M[r] = Math.max(M[r] ?? 0, u);
    MK[`${p.k || 'yerel'}|${r}`] = Math.max(MK[`${p.k || 'yerel'}|${r}`] ?? 0, u);
    isle(inc, s, t);
    prev = p;
  }
  return gunler;
}
