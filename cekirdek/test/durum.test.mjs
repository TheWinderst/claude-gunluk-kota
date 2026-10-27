// durum.mjs testleri: sozlesme alanlari, aktif/asildi/engel/bypass, kaynak.
import test from 'node:test';
import assert from 'node:assert/strict';
import { durumHesapla } from '../durum.mjs';
import { gunBaslangici } from '../zaman.mjs';

const TZ = 'Europe/Berlin';
const GUN = 86400000;
const B = (gun, sa, dk = 0) => gunBaslangici(gun, TZ) + sa * 3600000 + dk * 60000;
const P = (basiGun) => Math.round((gunBaslangici(basiGun, TZ) + 7 * GUN) / 600000) * 600;

const SOZLESME_ALANLARI = [
  'surum', 'gun', 'saatDilimi', 'harcanan', 'tavan', 'kalan', 'uyariEsigi',
  'uyari', 'asildi', 'baslangic', 'aktif', 'bypass', 'engel', 'son7g',
  'son5s', 'reset5', 'reset7', 'kaynak', 'olcumZamani', 'hata', 'gecmis',
  'gozlemSayisi', 'paylasim',
];

function taban(uzerine = {}) {
  return {
    simdi: B('2026-10-24', 20, 0),
    ayar: {
      tavan: 15, uyari: 12, saatDilimi: TZ, engel: true, baslangic: null,
      acmaIfadeleri: ['kota devam'], bildirimEsikleri: [5, 10, 13],
      openUsageUrl: '', paylasim: { yayinla: null, oku: null },
    },
    yerel: {},
    noktalar: [],
    ...uzerine,
  };
}

test('durum JSON sozlesme alanlari ve tipleri birebir', () => {
  const r = P('2026-10-10');
  const d = durumHesapla(taban({
    noktalar: [
      { t: B('2026-10-24', 0, 0), u: 10, r, b5: 30, r5: 1792843199, k: 'yerel' },
      { t: B('2026-10-24', 19, 0), u: 19.3, r, b5: 55, r5: 1792843199, k: 'yerel' },
    ],
  }));
  assert.deepEqual(Object.keys(d).sort(), [...SOZLESME_ALANLARI].sort());
  assert.equal(d.surum, 1);
  assert.equal(d.gun, '2026-10-24');
  assert.equal(typeof d.harcanan, 'number');
  assert.equal(d.harcanan, 9.3);
  assert.equal(d.tavan, 15);
  assert.equal(d.kalan, 5.7);
  assert.equal(d.uyariEsigi, 12);
  assert.equal(d.uyari, false);         // 9.3 < 12
});

test('uyari / asildi esikleri', () => {
  const r = P('2026-10-10');
  const yap = (u) => durumHesapla(taban({
    noktalar: [
      { t: B('2026-10-24', 0, 0), u: 0, r, b5: null, r5: null, k: 'yerel' },
      { t: B('2026-10-24', 19, 0), u, r, b5: null, r5: null, k: 'yerel' },
    ],
  }));
  assert.equal(yap(5).uyari, false);
  assert.equal(yap(5).asildi, false);
  assert.equal(yap(12).uyari, true);    // esik dahil
  assert.equal(yap(14.9).asildi, false);
  assert.equal(yap(15).asildi, true);   // tavan dahil
});

test('aktif: baslangic oncesi kapali, baslangic gunu ve sonrasi acik', () => {
  const r = P('2026-10-10');
  const noktalar = [
    { t: B('2026-10-24', 0, 0), u: 0, r, k: 'yerel' },
    { t: B('2026-10-24', 19, 0), u: 20, r, k: 'yerel' },   // harcanan 20 -> asildi
  ];
  const once = durumHesapla(taban({ noktalar, ayar: { ...taban().ayar, baslangic: '2026-10-28' } }));
  assert.equal(once.aktif, false);
  assert.equal(once.asildi, true);
  assert.equal(once.engel, false, 'baslangic oncesi asilsa da engel yok');

  const tamGun = durumHesapla(taban({
    noktalar,
    simdi: B('2026-10-28', 9, 0),
    ayar: { ...taban().ayar, baslangic: '2026-10-28' },
  }));
  assert.equal(tamGun.aktif, true, 'baslangic gunu aktif');

  const ayarKapali = durumHesapla(taban({
    noktalar,
    ayar: { ...taban().ayar, engel: false },
  }));
  assert.equal(ayarKapali.aktif, false, 'engel=false aktifligi kapatir');
  assert.equal(ayarKapali.engel, false);
});

test('engel yalniz aktif && asildi && !bypass iken', () => {
  const r = P('2026-10-10');
  const noktalar = [
    { t: B('2026-10-24', 0, 0), u: 0, r, k: 'yerel' },
    { t: B('2026-10-24', 19, 0), u: 20, r, k: 'yerel' },
  ];
  const d = durumHesapla(taban({ noktalar }));
  assert.equal(d.asildi, true);
  assert.equal(d.engel, true);

  const bp = durumHesapla(taban({ noktalar, yerel: { bypassGun: '2026-10-24' } }));
  assert.equal(bp.bypass, true);
  assert.equal(bp.engel, false, 'bypass varken engel kalkar');

  const baskaGun = durumHesapla(taban({ noktalar, yerel: { bypassGun: '2026-10-23' } }));
  assert.equal(baskaGun.bypass, false, 'dunku bypass bugune etkisiz');
});

test('kaynak: olcum / paylasim / bayat / null', () => {
  const r = P('2026-10-10');
  const simdi = B('2026-10-24', 20, 0);

  const tazeYerel = durumHesapla(taban({
    simdi,
    noktalar: [{ t: simdi - 60000, u: 10, r, k: 'yerel' }],
  }));
  assert.equal(tazeYerel.kaynak, 'olcum');

  const tazePaylasim = durumHesapla(taban({
    simdi,
    noktalar: [{ t: simdi - 60000, u: 10, r, k: 'paylasim' }],
  }));
  assert.equal(tazePaylasim.kaynak, 'paylasim');

  const bayat = durumHesapla(taban({
    simdi,
    noktalar: [{ t: simdi - 20 * 60000, u: 10, r, k: 'yerel' }],
  }));
  assert.equal(bayat.kaynak, 'bayat');

  const hic = durumHesapla(taban({ simdi, noktalar: [] }));
  assert.equal(hic.kaynak, null);
  assert.equal(hic.olcumZamani, null);
  assert.equal(hic.son7g, null);
  assert.equal(hic.gozlemSayisi, 0);
});

test('son7g/son5s/reset5/reset7 en yeni noktadan, gecmis yuvarlanmis gelir', () => {
  const r = P('2026-10-10');
  const d = durumHesapla(taban({
    noktalar: [
      { t: B('2026-10-22', 0, 0), u: 5, r, b5: 10, r5: 1792800000, k: 'yerel' },
      { t: B('2026-10-22', 23, 0), u: 10, r, b5: 12, r5: 1792800000, k: 'yerel' },
      { t: B('2026-10-24', 19, 0), u: 9, r, b5: 41, r5: 1792843199, k: 'yerel' },
    ],
  }));
  assert.equal(d.son7g, 9);
  assert.equal(d.son5s, 41);
  assert.equal(d.reset5, 1792843199);
  assert.equal(d.reset7, r);
  assert.equal(d.olcumZamani, new Date(B('2026-10-24', 19, 0)).toISOString());
  assert.equal(d.harcanan, 0, '24.10 dusus gormus, yeni pay yok');
  assert.equal(d.gecmis['2026-10-22'], 5, '+5 tamamen 22.10 icinde');
  assert.equal(d.gecmis['2026-10-23'], 0);
  assert.ok(Object.keys(d.gecmis).length <= 14);
});

test('hata alani son olcum hatasini tasir, kalan asiri asimda 0da kalir', () => {
  const r = P('2026-10-10');
  const d = durumHesapla(taban({
    noktalar: [
      { t: B('2026-10-24', 0, 0), u: 0, r, k: 'yerel' },
      { t: B('2026-10-24', 19, 0), u: 40, r, k: 'yerel' },
    ],
    sonHata: 'deneme hatası',
  }));
  assert.equal(d.hata, 'deneme hatası');
  assert.equal(d.kalan, 0);
});

test('sifirlama gunu: eski pencerenin gece harcamasi yeni haftanin gunluk payina sayilmaz', async () => {
  const { durumHesapla } = await import('../durum.mjs');
  const { gunBaslangici } = await import('../zaman.mjs');
  const { pencereKimligi } = await import('../defter.mjs');
  const tz = 'Europe/Berlin';
  const gece = gunBaslangici('2026-10-28', tz);
  const sa = (h) => gece + h * 3600000;
  const rEski = pencereKimligi(sa(8) / 1000);
  const rYeni = pencereKimligi(sa(8) / 1000 + 7 * 86400);
  const noktalar = [
    { t: sa(0.001), u: 90, r: rEski, b5: null, r5: null, k: 'yerel' },
    { t: sa(7.98), u: 99, r: rEski, b5: null, r5: null, k: 'yerel' },
    { t: sa(8.5), u: 3, r: rYeni, b5: null, r5: null, k: 'yerel' },
    { t: sa(9), u: 7, r: rYeni, b5: null, r5: null, k: 'yerel' },
  ];
  const ayar = { tavan: 15, uyari: 12, saatDilimi: tz, engel: true, baslangic: '2026-10-28', paylasim: {} };
  const d = durumHesapla({ simdi: sa(9), ayar, yerel: {}, noktalar });
  assert.equal(d.harcanan, 7);
  assert.equal(d.engel, false);
});

test('gecmis: sifirlama gunu ertesi gun yalniz yeni haftanin payini gosterir', async () => {
  const { durumHesapla } = await import('../durum.mjs');
  const { gunBaslangici } = await import('../zaman.mjs');
  const { pencereKimligi } = await import('../defter.mjs');
  const tz = 'Europe/Berlin';
  const gece = gunBaslangici('2026-10-28', tz);
  const sa = (h) => gece + h * 3600000;
  const rEski = pencereKimligi(sa(8) / 1000);
  const rYeni = pencereKimligi(sa(8) / 1000 + 7 * 86400);
  const noktalar = [
    { t: sa(0.001), u: 80, r: rEski, b5: null, r5: null, k: 'yerel' },
    { t: sa(7.98), u: 93, r: rEski, b5: null, r5: null, k: 'yerel' },
    { t: sa(8.5), u: 3, r: rYeni, b5: null, r5: null, k: 'yerel' },
    { t: sa(20), u: 15, r: rYeni, b5: null, r5: null, k: 'yerel' },
    { t: sa(24 + 9), u: 16, r: rYeni, b5: null, r5: null, k: 'yerel' },
  ];
  const ayar = { tavan: 15, uyari: 12, saatDilimi: tz, engel: true, baslangic: '2026-10-28', paylasim: {} };
  const d = durumHesapla({ simdi: sa(24 + 9), ayar, yerel: {}, noktalar });
  assert.ok(d.gecmis['2026-10-28'] < 16, `28.10 gecmisi: ${d.gecmis['2026-10-28']}`);
});
