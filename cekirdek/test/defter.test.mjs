// defter.mjs testleri: dagitim algoritmasi (a-g), sikistirma, kirpma,
// pencere kimligi normallestirmesi, birlestirme.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dagit, birlestir, olcumEkle, olcumleriOku, pencereKimligi } from '../defter.mjs';
import { gunBaslangici } from '../zaman.mjs';

const TZ = 'Europe/Berlin';
const GUN = 86400000;
const yaklasik = (gercek, beklenen, msg) =>
  assert.ok(Math.abs(gercek - beklenen) < 1e-9, `${msg}: ${gercek} != ${beklenen}`);

// Berlin yerel saatinden unix ms: B('2026-10-22', 8, 30) = 08:30.
const B = (gun, sa, dk = 0) => gunBaslangici(gun, TZ) + sa * 3600000 + dk * 60000;
// Haftalik pencere kimligi: pencere basi verilen gunden 7 gun sonraki sifirlanma.
const P = (basiGun) => Math.round((gunBaslangici(basiGun, TZ) + 7 * GUN) / 600000) * 600;

test('dagit (a): surekli artan okumalar gunun payini net verir', () => {
  const r = P('2026-10-08');   // pencere 08.10 - 15.10 sinirlari disinda kalir
  const noktalar = [
    { t: B('2026-10-21', 23, 55), u: 10, r },                       // aksam capasi
    { t: B('2026-10-22', 0, 5), u: 10, r },
    { t: B('2026-10-22', 2, 0), u: 11, r },
    { t: B('2026-10-22', 4, 0), u: 12, r },
    { t: B('2026-10-22', 8, 0), u: 14, r },
    { t: B('2026-10-22', 12, 0), u: 17, r },
    { t: B('2026-10-22', 16, 0), u: 20, r },
    { t: B('2026-10-22', 20, 0), u: 23, r },
    { t: B('2026-10-22', 23, 0), u: 25, r },
  ];
  const d = dagit(noktalar, TZ);
  yaklasik(d['2026-10-22'], 15, '10 -> 25 artisin gunluk payi 15 olmali');
});

test('dagit (b): 3-4-3-4 dalgalanma yalniz net artisi sayar (1, 3 degil)', () => {
  const r = P('2026-10-08');
  const noktalar = [
    { t: B('2026-10-22', 0, 0), u: 3, r },
    { t: B('2026-10-22', 0, 10), u: 4, r },
    { t: B('2026-10-22', 0, 20), u: 3, r },
    { t: B('2026-10-22', 0, 30), u: 4, r },
    { t: B('2026-10-22', 0, 40), u: 3, r },
    { t: B('2026-10-22', 0, 50), u: 4, r },
  ];
  const d = dagit(noktalar, TZ);
  const bugun = d['2026-10-22'] || 0;
  yaklasik(bugun, 1, 'dalgalanmanin net artisi 1 olmali');
  assert.ok(bugun < 3, 'ham artislarin toplami (3) yanlislikla sayilmamali');
});

test('dagit (c): 22:00 - 08:00 boslugu +10 ilk gune 2, ikinci gune 8 verir', () => {
  const r = P('2026-10-08');
  const noktalar = [
    { t: B('2026-10-22', 22, 0), u: 0, r },
    { t: B('2026-10-23', 8, 0), u: 10, r },
  ];
  const d = dagit(noktalar, TZ);
  yaklasik(d['2026-10-22'], 2, 'ilk gun 2 saatlik pay');
  yaklasik(d['2026-10-23'], 8, 'ikinci gun 8 saatlik pay');
});

test('dagit (d): pencere gun ortasinda sifirlanirsa sabah payi + yeni pencere sayilir', () => {
  const r1 = P('2026-10-08');
  const r2 = Math.round((B('2026-10-22', 13, 0) + 7 * GUN) / 600000) * 600; // ogle sifirlanma
  const noktalar = [
    { t: B('2026-10-22', 0, 0), u: 30, r: r1 },
    { t: B('2026-10-22', 8, 0), u: 40, r: r1 },
    { t: B('2026-10-22', 14, 0), u: 5, r: r2 },
  ];
  const d = dagit(noktalar, TZ);
  yaklasik(d['2026-10-22'], (40 - 30) + 5, 'gun toplami (40 - 30) + 5 olmali');
});

test('dagit (e): taze kurulum ilk okumayi bugune yigmaz, pencereye yayar', () => {
  const t = B('2026-10-22', 12, 0);
  const r = Math.round((t + 4 * GUN) / 600000) * 600;   // pencere 3 gun once baslamis
  const d = dagit([{ t, u: 30, r }], TZ);
  const gece = gunBaslangici('2026-10-22', TZ);
  yaklasik(d['2026-10-22'], (30 * (t - gece)) / (t - (r * 1000 - 7 * GUN)),
    'bugun yalniz gecenin payini almali');
  assert.ok(d['2026-10-22'] < 30, 'taze kurulum 30 ile bloklamamali');
});

test('dagit (f): elle sifirlama 12:00 oncesini saymaz', () => {
  const r = P('2026-10-08');
  const noktalar = [
    { t: B('2026-10-22', 0, 0), u: 10, r },
    { t: B('2026-10-22', 12, 0), u: 20, r },
    { t: B('2026-10-22', 18, 0), u: 25, r },
  ];
  const sifirsz = dagit(noktalar, TZ);
  yaklasik(sifirsz['2026-10-22'], 15, 'sifirlama yokken gunun tamami sayilir');
  const sf = dagit(noktalar, TZ, { sifirla: { gun: '2026-10-22', an: B('2026-10-22', 12, 0) } });
  yaklasik(sf['2026-10-22'], 5, 'sifirlama sonrasi yalniz 12:00 sonrasi (5) sayilir');
});

test('dagit (g): DST gunu gercek milisaniye ile yayar (25 saat)', () => {
  const r = P('2026-10-08');
  const bas = gunBaslangici('2026-10-25', TZ);    // 00:00 CEST
  const son = gunBaslangici('2026-10-26', TZ);    // 00:00 CET, tam 25 saat sonra
  assert.equal(son - bas, 25 * 3600000);
  const d = dagit([
    { t: bas, u: 0, r },
    { t: son, u: 25, r },
  ], TZ);
  yaklasik(d['2026-10-25'], 25, '25 saatlik gunun tamami 25.10.2026 olmali');
  yaklasik(d['2026-10-26'] || 0, 0, 'ertesi gune tasmamali');
});

test('dagit (g2): 23 saatlik DST gunu (29.03.2026)', () => {
  const r = Math.round((gunBaslangici('2026-03-15', TZ) + 7 * GUN) / 600000) * 600;
  const d = dagit([
    { t: gunBaslangici('2026-03-29', TZ), u: 0, r },
    { t: gunBaslangici('2026-03-30', TZ), u: 23, r },
  ], TZ);
  yaklasik(d['2026-03-29'], 23, '23 saatlik gunun tamami 29.03.2026 olmali');
});

test('pencere kimligi 10 dakikaya normallesir', () => {
  assert.equal(pencereKimligi(1793170799), 1793170800);
  assert.equal(pencereKimligi(1793170800), 1793170800);
  assert.equal(pencereKimligi(1793170801), 1793170800);
});

// --- Dosya islemleri (gecici KOK ile) ---
test('olcumEkle: esit deger dizisi ilk ve son noktayi saklar, eskiler kirpilir', () => {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-test-'));
  process.env.GUNLUK_KOTA_EV = kok;
  try {
    const simdi = Date.parse('2026-10-22T12:00:00Z');
    const sonuc = { b7: 40, reset7: 1793170799, b5: 10, reset5: 1792843199 };
    olcumEkle(sonuc, simdi);
    olcumEkle(sonuc, simdi + 60000);
    let d = olcumleriOku();
    assert.equal(d.olcumler.length, 2, 'iki farkli anda iki nokta');
    olcumEkle(sonuc, simdi + 120000);   // ucuncu ayni deger -> ortadaki dusmeli
    d = olcumleriOku();
    assert.equal(d.olcumler.length, 2, 'esit dizide yalniz ilk ve son kalmali');
    assert.equal(d.olcumler[0].t, simdi);
    assert.equal(d.olcumler[1].t, simdi + 120000);
    assert.equal(d.olcumler[0].r, 1793170800, 'reset 10 dk gruba normallesmeli');
    assert.equal(d.olcumler[0].k, 'yerel');

    // 10 gundan eski nokta kirpilir.
    olcumEkle({ b7: 41, reset7: 1793170799 }, simdi + 11 * GUN);
    d = olcumleriOku();
    assert.ok(d.olcumler.every((p) => p.t >= simdi + 11 * GUN - 10 * GUN),
      '10 gundan eski nokta atilmali');
    assert.equal(d.olcumler.length, 1);
  } finally {
    delete process.env.GUNLUK_KOTA_EV;
    fs.rmSync(kok, { recursive: true, force: true });
  }
});

test('birlestir: yakini ve ayni degerli dublelari atar, yerel kazanir', () => {
  const yerel = [
    { t: 1000000, u: 10, r: 500, b5: 3, r5: 400, k: 'yerel' },
  ];
  const paylasim = [
    { t: 1000500, u: 10, r: 500, b5: 3, r5: 400 },          // dt=500 < 1000 -> at
    { t: 1000500, u: 11, r: 500 },                            // u farkli -> kalir
    { t: 3000000, u: 12, r: 600 },                            // uzak -> kalir
  ];
  const b = birlestir(yerel, paylasim);
  assert.equal(b.length, 3);
  assert.equal(b[0].k, 'yerel');
  assert.equal(b[1].k, 'paylasim');
  assert.equal(b[1].u, 11);
  assert.deepEqual(b.map((p) => p.t).sort((a, c) => a - c), [1000000, 1000500, 3000000]);
});

test('dagit: ayni pencerede belirgin dusus (plan yukseltme) sifirlama sayilir, titreme sayilmaz', () => {
  const tz = 'Europe/Berlin';
  const gece = gunBaslangici('2026-10-24', tz);
  const r = pencereKimligi(gece / 1000 + 4 * 86400);
  const sa = (h) => gece + h * 3600000;
  const n = [
    { t: sa(0.001), u: 90, r },
    { t: sa(10), u: 99, r },
    { t: sa(11), u: 2, r },   // 5x -> 20x: %99 -> %2, resets_at ayni
    { t: sa(12), u: 5, r },
    { t: sa(13), u: 4, r },   // 1 puanlik titreme: sifirlama DEGIL
    { t: sa(14), u: 5, r },
  ];
  const g = dagit(n, tz);
  // 9 (90->99) + 2 (sifirlamadan sonra) + 3 (2->5) = 14; ilk noktanin bugune dusen payi ihmal edilir.
  assert.ok(g['2026-10-24'] >= 14 && g['2026-10-24'] < 14.05, String(g['2026-10-24']));
});

test('dagit: tek hatali dusuk okuma haftanin tamamini bugune yazmaz (Opus denetimi 28.10.2026)', () => {
  const tz = 'Europe/Berlin';
  const gece = gunBaslangici('2026-10-29', tz);
  const r = pencereKimligi(gece / 1000 + 5 * 86400);
  const sa = (h) => gece + h * 3600000;
  const dizi = (degerler) => degerler.map((u, i) => ({ t: sa(1 + i), u, r, k: 'yerel' }));
  const g1 = dagit(dizi([20, 20, 17, 20, 21]), tz)['2026-10-29'];
  assert.ok(g1 < 21.01, `20,20,17,20,21: ${g1}`);
  const g2 = dagit(dizi([40, 37, 40, 37, 40]), tz)['2026-10-29'];
  assert.ok(g2 < 40.01, `40,37,40,37,40: ${g2}`);
});

test('dagit: iki kaynagin saat farki sahte sifirlama uretmez', () => {
  const tz = 'Europe/Berlin';
  const gece = gunBaslangici('2026-10-29', tz);
  const r = pencereKimligi(gece / 1000 + 5 * 86400);
  const dk = (m) => gece + 9 * 3600000 + m * 60000;
  // Saatte %6 harcama; paylasim (gist) noktalari 40 dk geriden gelir.
  const n = [];
  for (let m = 0; m <= 240; m += 10) {
    n.push({ t: dk(m), u: 30 + Math.floor((m / 60) * 6), r, k: 'yerel' });
    n.push({ t: dk(m) + 1500, u: 30 + Math.floor((Math.max(0, m - 40) / 60) * 6), r, k: 'paylasim' });
  }
  const g = dagit(n, tz)['2026-10-29'];
  assert.ok(g < 54.01, `saat farkli iki kaynak: ${g}`);
});

test('olcumEkle: haftalik alan bos gelirse sahte %0 yazilmaz', () => {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-defter-'));
  process.env.GUNLUK_KOTA_EV = kok;
  try {
    olcumEkle({ b7: 40, reset7: 1793170800, b5: 1, reset5: 1793141999 }, Date.now() - 60000);
    olcumEkle({ b7: null, reset7: null, b5: 2, reset5: 1793141999 }, Date.now());
    olcumEkle({ b7: 12, reset7: null, b5: 2, reset5: null }, Date.now());
    const l = olcumleriOku().olcumler;
    assert.equal(l.length, 1, JSON.stringify(l));
    assert.equal(l[0].u, 40);
  } finally {
    delete process.env.GUNLUK_KOTA_EV;
    fs.rmSync(kok, { recursive: true, force: true });
  }
});
