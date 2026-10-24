// kota.mjs CLI testleri: alt surec olarak calistirilir, sabit olcum ile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOTA = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'kota.mjs');

const SOZLESME_ALANLARI = [
  'surum', 'gun', 'saatDilimi', 'harcanan', 'tavan', 'kalan', 'uyariEsigi',
  'uyari', 'asildi', 'baslangic', 'aktif', 'bypass', 'engel', 'son7g',
  'son5s', 'reset5', 'reset7', 'kaynak', 'olcumZamani', 'hata', 'gecmis',
  'gozlemSayisi', 'paylasim',
];

function sahneKur() {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-cli-'));
  const ornek = path.join(kok, 'ornek.json');
  fs.writeFileSync(ornek, JSON.stringify({
    five_hour: { utilization: 59, resets_at: '2026-10-24T13:59:59+00:00' },
    seven_day: { utilization: 99, resets_at: '2026-10-28T06:59:59+00:00' },
  }));
  return { kok, ornek };
}

function calistir(kok, ornek, arglar, betik = KOTA) {
  return new Promise((resolve) => {
    execFile(process.execPath, [betik, ...arglar], {
      env: { ...process.env, GUNLUK_KOTA_EV: kok, GUNLUK_KOTA_ORNEK_JSON: ornek },
      timeout: 20000,
    }, (hata, cikti, hataCikti) => {
      resolve({
        kod: hata && hata.code !== undefined ? hata.code : 0,
        cikti: String(cikti || ''),
        hataCikti: String(hataCikti || ''),
      });
    });
  });
}

const temizle = (kok) => fs.rmSync(kok, { recursive: true, force: true });

test('olc --json: sozlesmenin tum alanlariyla tek satir JSON basar', async () => {
  const { kok, ornek } = sahneKur();
  try {
    const r = await calistir(kok, ornek, ['olc', '--json']);
    assert.equal(r.kod, 0, `hata cikisi: ${r.hataCikti}`);
    const satirlar = r.cikti.trim().split('\n');
    assert.equal(satirlar.length, 1, 'JSON tek satir olmali');
    const d = JSON.parse(satirlar[0]);
    assert.deepEqual(Object.keys(d).sort(), [...SOZLESME_ALANLARI].sort());
    assert.equal(d.son7g, 99);
    assert.equal(d.son5s, 59);
    assert.equal(d.kaynak, 'olcum');
    assert.equal(d.hata, null);
    // Olcum deftere islenmis olmali.
    const defter = JSON.parse(fs.readFileSync(path.join(kok, 'olcumler.json'), 'utf8'));
    assert.equal(defter.olcumler.length, 1);
  } finally {
    temizle(kok);
  }
});

test('ac: bugunluk bypass acar, durum --json bypass true gorur', async () => {
  const { kok, ornek } = sahneKur();
  try {
    const ac = await calistir(kok, ornek, ['ac']);
    assert.equal(ac.kod, 0);

    const d = await calistir(kok, ornek, ['durum', '--json']);
    assert.equal(d.kod, 0);
    const durum = JSON.parse(d.cikti);
    assert.equal(durum.bypass, true);

    const kapat = await calistir(kok, ornek, ['kapat']);
    assert.equal(kapat.kod, 0);
    const d2 = JSON.parse((await calistir(kok, ornek, ['durum', '--json'])).cikti);
    assert.equal(d2.bypass, false);
  } finally {
    temizle(kok);
  }
});

test('ayar tavan 20 kalici olur, ayar yazimi JSON deger alir', async () => {
  const { kok, ornek } = sahneKur();
  try {
    const r = await calistir(kok, ornek, ['ayar', 'tavan', '20']);
    assert.equal(r.kod, 0);
    const kayitli = JSON.parse(fs.readFileSync(path.join(kok, 'ayar.json'), 'utf8'));
    assert.equal(kayitli.tavan, 20);

    const baslangic = await calistir(kok, ornek, ['ayar', 'baslangic', '"2026-10-28"']);
    assert.equal(baslangic.kod, 0);
    const k2 = JSON.parse(fs.readFileSync(path.join(kok, 'ayar.json'), 'utf8'));
    assert.equal(k2.baslangic, '2026-10-28');

    const goster = await calistir(kok, ornek, ['ayar']);
    assert.equal(JSON.parse(goster.cikti).tavan, 20);
  } finally {
    temizle(kok);
  }
});

test('bilinmeyen komut Turkce kullanim metniyle cikis 2 verir', async () => {
  const { kok, ornek } = sahneKur();
  try {
    const r = await calistir(kok, ornek, ['boyle-komut-yok']);
    assert.equal(r.kod, 2);
    assert.ok(r.hataCikti.includes('Kullanım'), 'kullanim metni stderrde olmali');
  } finally {
    temizle(kok);
  }
});

test('(yok) komutu insan ozeti basar, bar icerir', async () => {
  const { kok, ornek } = sahneKur();
  // Kucuk sabit: bar kismi dolu gelsin (hem █ hem ░).
  fs.writeFileSync(ornek, JSON.stringify({
    five_hour: { utilization: 4, resets_at: '2026-10-24T13:59:59+00:00' },
    seven_day: { utilization: 3, resets_at: '2026-10-28T06:59:59+00:00' },
  }));
  try {
    await calistir(kok, ornek, ['olc', '--sessiz']);
    const r = await calistir(kok, ornek, []);
    assert.equal(r.kod, 0);
    assert.ok(r.cikti.includes('█') && r.cikti.includes('░'), '20 karakter bar olmali');
    assert.ok(r.cikti.includes('Bugün'));
  } finally {
    temizle(kok);
  }
});

test('sembol baglanti dizinden cagrilinca durum --json yine calisir', async () => {
  const { kok, ornek } = sahneKur();
  // /tmp -> /private/tmp gibi yollarda argv[1] ile import.meta.url farkli
  // gorunur; dogrudan calisma denetimi realpath ile karsilastirmali.
  const bag = path.join(kok, 'cekirdek-bag');
  fs.symlinkSync(path.dirname(KOTA), bag, 'dir');
  try {
    const r = await calistir(kok, ornek, ['durum', '--json'], path.join(bag, 'kota.mjs'));
    assert.equal(r.kod, 0, `hata cikisi: ${r.hataCikti}`);
    const d = JSON.parse(r.cikti.trim());
    assert.equal(d.gun !== undefined, true, 'durum JSON basmali');
  } finally {
    temizle(kok);   // rm -rf baglantiyi izlemez, yalniz baglantiyi siler
  }
});
