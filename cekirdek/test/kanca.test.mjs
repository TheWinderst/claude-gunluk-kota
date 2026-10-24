// kanca.mjs testleri: alt surec olarak calistirilir, gecici KOK ile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KOK_DIZIN = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const KANCA = path.join(KOK_DIZIN, 'kanca.mjs');
const TZ = 'Europe/Berlin';

function gecisiKur(noktalar, ayarUzerine = {}) {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-kanca-'));
  const now = Date.now();
  // Bugunun gece yarisi (Berlin) ve o andaki pencere.
  const gece = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(now));
  const [y, a, g] = gece.split('-').map(Number);
  const geceMs = Date.UTC(y, a - 1, g, 1);   // kabaca; asagida nokta zamani onemli
  fs.writeFileSync(path.join(kok, 'olcumler.json'), JSON.stringify({
    surum: 1,
    olcumler: noktalar.map((n) => ({
      t: geceMs + n.saat * 3600000,
      u: n.u,
      r: Math.round((geceMs + 8 * 86400000) / 600000) * 600,
      b5: null,
      r5: null,
      k: 'yerel',
    })).concat([{
      t: now,                       // en son nokta SIMDI: taze, olcum tetiklenmez
      u: noktalar[noktalar.length - 1].u,
      r: Math.round((geceMs + 8 * 86400000) / 600000) * 600,
      b5: null,
      r5: null,
      k: 'yerel',
    }]),
  }));
  fs.writeFileSync(path.join(kok, 'ayar.json'), JSON.stringify({
    tavan: 15, uyari: 12, saatDilimi: TZ, engel: true, baslangic: null,
    acmaIfadeleri: ['kota devam'], bildirimEsikleri: [5, 10, 13],
    openUsageUrl: '', paylasim: { yayinla: null, oku: null },
    ...ayarUzerine,
  }));
  // Sabit olcum kancasi: hicbir durumda aga cikmasin.
  const ornek = path.join(kok, 'ornek.json');
  fs.writeFileSync(ornek, JSON.stringify({
    five_hour: { utilization: 1, resets_at: '2026-10-24T13:59:59+00:00' },
    seven_day: { utilization: 3, resets_at: '2026-10-28T06:59:59+00:00' },
  }));
  return { kok, ornek };
}

function kancaCalistir(kok, ornek, prompt) {
  return new Promise((resolve) => {
    const ev = { ...process.env, GUNLUK_KOTA_EV: kok, GUNLUK_KOTA_ORNEK_JSON: ornek };
    execFile(process.execPath, [KANCA], {
      env: ev,
      timeout: 20000,
    }, (hata, cikti, hataCikti) => {
      resolve({
        kod: hata && hata.code !== undefined ? hata.code : 0,
        cikti: String(cikti || ''),
        hataCikti: String(hataCikti || ''),
      });
    }).stdin.end(prompt === undefined ? '' : JSON.stringify({ prompt }));
  });
}

test('kanca: tavan altinda sessiz gecer', async () => {
  const { kok, ornek } = gecisiKur([{ saat: 0, u: 0 }, { saat: 6, u: 5 }]);
  try {
    const r = await kancaCalistir(kok, ornek, 'selam, bir sey yapsana');
    assert.equal(r.kod, 0);
    assert.equal(r.cikti, '', 'tavan altinda hic cikti olmamali');
  } finally {
    fs.rmSync(kok, { recursive: true, force: true });
  }
});

test('kanca: tavan asildiysa blok karari ve Turkce mesaj', async () => {
  const { kok, ornek } = gecisiKur([{ saat: 0, u: 0 }, { saat: 6, u: 18 }]);
  try {
    const r = await kancaCalistir(kok, ornek, 'bir sey daha yapsana');
    assert.equal(r.kod, 0);
    const karar = JSON.parse(r.cikti);
    assert.equal(karar.decision, 'block');
    assert.ok(karar.reason.includes('GÜNLÜK KOTA DOLDU'), 'mesaj basligi eksik');
    assert.ok(karar.reason.includes('İstek gönderilmedi.'));
    assert.ok(karar.reason.includes('"kota devam"'));
    assert.ok(karar.reason.includes(TZ));
  } finally {
    fs.rmSync(kok, { recursive: true, force: true });
  }
});

test('kanca: acma ifadesi bypass acar, sonraki normal istek bloklanmaz', async () => {
  const { kok, ornek } = gecisiKur([{ saat: 0, u: 0 }, { saat: 6, u: 18 }]);
  try {
    const ac = await kancaCalistir(kok, ornek, 'Kota  Devam lütfen');
    assert.equal(ac.kod, 0);
    assert.equal(ac.cikti, '{}', 'acma ifadesinde tam olarak {} donmeli');
    const yerel = JSON.parse(fs.readFileSync(path.join(kok, 'yerel.json'), 'utf8'));
    assert.ok(yerel.bypassGun, 'bugunun bypass gunu yazilmali');

    const sonra = await kancaCalistir(kok, ornek, 'simdi normal bir istek yolla');
    assert.equal(sonra.kod, 0);
    assert.equal(sonra.cikti, '', 'bypass acikken normal istek bloklanmamali');
  } finally {
    fs.rmSync(kok, { recursive: true, force: true });
  }
});

test('kanca: baslangic gelecekteyse asilsa da engellemez', async () => {
  const yarin = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const { kok, ornek } = gecisiKur([{ saat: 0, u: 0 }, { saat: 6, u: 18 }], { baslangic: yarin });
  try {
    const r = await kancaCalistir(kok, ornek, 'yine dene bakalim');
    assert.equal(r.kod, 0);
    assert.equal(r.cikti, '');
  } finally {
    fs.rmSync(kok, { recursive: true, force: true });
  }
});

test('kanca: bozuk olcumler.json sessizce yutulur (fail-open)', async () => {
  const { kok, ornek } = gecisiKur([{ saat: 0, u: 0 }]);
  try {
    fs.writeFileSync(path.join(kok, 'olcumler.json'), '{bu gecersiz json');
    const r = await kancaCalistir(kok, ornek, 'bozuk defterle gel');
    assert.equal(r.kod, 0);
    assert.equal(r.cikti, '', 'bozuk veri is durdurmaz, blok da uretmez');
  } finally {
    fs.rmSync(kok, { recursive: true, force: true });
  }
});
