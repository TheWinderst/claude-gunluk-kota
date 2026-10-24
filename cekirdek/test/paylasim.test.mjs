// paylasim.mjs testleri: besleme kurma/dogrulama, gist yayini, gist okuma,
// durumda kaynak "paylasim". Tum ag cagrilari enjekte edilmis fetch ile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beslemeKur, beslemeDogrula, noktaDogrula, yayinla, oku } from '../paylasim.mjs';
import { durum } from '../durum.mjs';

const GUN = 86400000;

function kokKur({ olcumler = [], ayarUzerine = {}, yerel = null } = {}) {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-paylasim-'));
  fs.writeFileSync(path.join(kok, 'ayar.json'), JSON.stringify({
    tavan: 15, uyari: 12, saatDilimi: 'Europe/Berlin', engel: true, baslangic: null,
    acmaIfadeleri: ['kota devam'], bildirimEsikleri: [5, 10, 13],
    openUsageUrl: '',
    paylasim: { yayinla: null, oku: null, ...ayarUzerine },
  }));
  fs.writeFileSync(path.join(kok, 'olcumler.json'), JSON.stringify({
    surum: 1, olcumler,
  }));
  if (yerel) fs.writeFileSync(path.join(kok, 'yerel.json'), JSON.stringify(yerel));
  process.env.GUNLUK_KOTA_EV = kok;
  return kok;
}

const temizle = (kok) => {
  delete process.env.GUNLUK_KOTA_EV;
  delete process.env.GUNLUK_KOTA_GITHUB_TOKEN;
  fs.rmSync(kok, { recursive: true, force: true });
};

test('noktaDogrula gecersiz noktalari atar', () => {
  const now = Date.now();
  const gecerli = { t: now - 3600000, u: 10, r: Math.round((now + 3 * GUN) / 1000 / 600) * 600 };
  assert.equal(noktaDogrula(gecerli, now), true);
  assert.equal(noktaDogrula({ ...gecerli, u: 150 }, now), false, 'u > 100');
  assert.equal(noktaDogrula({ ...gecerli, u: -1 }, now), false, 'u < 0');
  assert.equal(noktaDogrula({ ...gecerli, t: now - 12 * GUN }, now), false, 'cok eski t');
  assert.equal(noktaDogrula({ ...gecerli, t: now + 10 * 60000 }, now), false, 'cok ileri t');
  assert.equal(noktaDogrula({ ...gecerli, r: Math.round((now + 9 * GUN) / 1000 / 600) * 600 }, now), false,
    'pencere cok ileride');
  assert.equal(noktaDogrula({ ...gecerli, u: 'abc' }, now), false, 'sonlu degil');
  assert.equal(noktaDogrula(null, now), false);
});

test('beslemeKur son 8 gunun yerel noktalarini, yalniz besleme alanlarini verir', () => {
  const now = Date.now();
  const kok = kokKur({
    olcumler: [
      { t: now - 9 * GUN, u: 5, r: 1, b5: 1, r5: 1, k: 'yerel' },        // cok eski: atilir
      { t: now - 2 * GUN, u: 20, r: 2, b5: 3, r5: 4, k: 'yerel' },
      { t: now - 1000, u: 21, r: 2, b5: null, r5: null, k: 'paylasim' }, // paylasim: yayinlanmaz
    ],
  });
  try {
    const b = beslemeKur(now);
    assert.equal(b.surum, 1);
    assert.equal(b.uretici, 'claude-gunluk-kota');
    assert.equal(b.saatDilimi, 'Europe/Berlin');
    assert.equal(b.olcumler.length, 1);
    assert.deepEqual(b.olcumler[0], { t: now - 2 * GUN, u: 20, r: 2, b5: 3, r5: 4 });
  } finally {
    temizle(kok);
  }
});

test('yayinla: PATCH gist atar, vade kitli tekrar atlar', async () => {
  const now = Date.now();
  const kok = kokKur({
    olcumler: [{ t: now - 60000, u: 42, r: 500, b5: 1, r5: 2, k: 'yerel' }],
    ayarUzerine: { yayinla: { gist: 'abc123', dosya: 'gunluk-kota.json' } },
  });
  process.env.GUNLUK_KOTA_GITHUB_TOKEN = 'ghp_test';
  try {
    const cagrilar = [];
    const fetchFn = async (url, secenek) => {
      cagrilar.push({ url, secenek });
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const s1 = await yayinla({ fetchFn });
    assert.equal(s1.tamam, true);
    assert.equal(s1.sayi, 1);

    assert.equal(cagrilar[0].url, 'https://api.github.com/gists/abc123');
    assert.equal(cagrilar[0].secenek.method, 'PATCH');
    assert.equal(cagrilar[0].secenek.headers.authorization, 'Bearer ghp_test');
    const govde = JSON.parse(cagrilar[0].secenek.body);
    const besleme = JSON.parse(govde.files['gunluk-kota.json'].content);
    assert.equal(besleme.olcumler[0].u, 42);
    assert.ok(!govde.files['gunluk-kota.json'].content.includes('ghp_test'),
      'anahtar besleme icerigine sizmamali');

    const yerel = JSON.parse(fs.readFileSync(path.join(kok, 'yerel.json'), 'utf8'));
    assert.ok(yerel.yayinZaman, 'yayin zamani yazilmali');
    assert.ok(yerel.yayinOzet, 'nokta ozeti yazilmali');

    // Hemen tekrar: noktalar degismedi -> atla, yeni cagri yok.
    const s2 = await yayinla({ fetchFn });
    assert.equal(s2.atlandi, true);
    assert.equal(cagrilar.length, 1);

    // zorla: yine gider.
    const s3 = await yayinla({ fetchFn, zorla: true });
    assert.equal(s3.tamam, true);
    assert.equal(cagrilar.length, 2);
  } finally {
    temizle(kok);
  }
});

test('oku: gist yanitindan besleme ayiklanir, gecersizler dusulur, paylasim.json yazilir', async () => {
  const now = Date.now();
  const kok = kokKur({
    olcumler: [{ t: now - 60000, u: 42, r: Math.round((now + 3 * GUN) / 1000 / 600) * 600, b5: 1, r5: 2, k: 'yerel' }],
    ayarUzerine: { oku: 'def456' },
  });
  try {
    const besleme = {
      surum: 1, uretici: 'baska-makine', zaman: new Date(now).toISOString(),
      saatDilimi: 'Europe/Berlin',
      olcumler: [
        { t: now - 300000, u: 55, r: Math.round((now + 2 * GUN) / 1000 / 600) * 600, b5: 7, r5: 8 },
        { t: now - 300000, u: 999, r: 1 },   // gecersiz u
        { t: 'x', u: 10, r: 1 },             // gecersiz t
      ],
    };
    const fetchFn = async (url) => {
      assert.equal(url, 'https://api.github.com/gists/def456');
      return {
        ok: true, status: 200,
        json: async () => ({
          files: {
            'notlar.txt': { content: 'bu besleme degil' },
            'gunluk-kota.json': { content: JSON.stringify(besleme) },
          },
        }),
      };
    };
    const s = await oku({ fetchFn });
    assert.equal(s.sayi, 1, 'yalniz gecerli nokta kalmali');

    const kayit = JSON.parse(fs.readFileSync(path.join(kok, 'paylasim.json'), 'utf8'));
    assert.ok(kayit.alindi);
    assert.equal(kayit.olcumler.length, 1);
    assert.equal(kayit.olcumler[0].u, 55);
  } finally {
    temizle(kok);
  }
});

test('durum: en yeni nokta paylasimdan geldiyse kaynak paylasimdir', () => {
  const now = Date.now();
  const r = Math.round((now + 3 * GUN) / 1000 / 600) * 600;
  const kok = kokKur({
    olcumler: [{ t: now - 7200000, u: 10, r, b5: 1, r5: 2, k: 'yerel' }],
  });
  try {
    fs.writeFileSync(path.join(kok, 'paylasim.json'), JSON.stringify({
      alindi: new Date(now).toISOString(),
      olcumler: [{ t: now - 60000, u: 12, r, b5: 3, r5: 4 }],
    }));
    const d = durum();
    assert.equal(d.kaynak, 'paylasim');
    assert.equal(d.son7g, 12);
    assert.equal(d.gozlemSayisi, 2);
  } finally {
    temizle(kok);
  }
});
