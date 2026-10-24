// olcum.mjs testleri: sabit dosya, OpenUsage ayiklama, suresi dolmus
// anahtar, anahtarin onbellege yazilmamasi. Hicbir test aga cikmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { olc } from '../olcum.mjs';

function kokKur(ayarUzerine = {}) {
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-olcum-'));
  fs.writeFileSync(path.join(kok, 'ayar.json'), JSON.stringify({
    tavan: 15, uyari: 12, saatDilimi: 'Europe/Berlin', engel: true, baslangic: null,
    acmaIfadeleri: ['kota devam'], bildirimEsikleri: [5, 10, 13],
    openUsageUrl: 'http://127.0.0.1:6736/v1/usage/claude',
    paylasim: { yayinla: null, oku: null },
    ...ayarUzerine,
  }));
  process.env.GUNLUK_KOTA_EV = kok;
  return kok;
}

function temizle(kok) {
  delete process.env.GUNLUK_KOTA_EV;
  delete process.env.GUNLUK_KOTA_ORNEK_JSON;
  fs.rmSync(kok, { recursive: true, force: true });
}

test('sabit dosyadan olcum normallesmis degerler doner, onbellege yazar', async () => {
  const kok = kokKur();
  const ornek = path.join(kok, 'ornek.json');
  fs.writeFileSync(ornek, JSON.stringify({
    five_hour: { utilization: 59, resets_at: '2026-10-24T13:59:59+00:00' },
    seven_day: { utilization: 99, resets_at: '2026-10-28T06:59:59+00:00' },
  }));
  process.env.GUNLUK_KOTA_ORNEK_JSON = ornek;
  try {
    const sonuc = await olc({ fetchFn: () => { throw new Error('aga cikilmamali'); } });
    assert.equal(sonuc.hata, undefined);
    assert.equal(sonuc.b5, 59);
    assert.equal(sonuc.b7, 99);
    assert.equal(sonuc.reset5, 1792850399);   // 2026-10-24T13:59:59Z
    assert.equal(sonuc.reset7, 1793170799);   // 2026-10-28T06:59:59Z
    assert.equal(typeof sonuc.zaman, 'string');

    const onbellek = JSON.parse(fs.readFileSync(path.join(kok, 'onbellek.json'), 'utf8'));
    assert.equal(onbellek.b7, 99);
    assert.equal(onbellek.reset7, 1793170799);
  } finally {
    temizle(kok);
  }
});

test('OpenUsage: weekly satiri kullanilir, Fable satiri yok sayilir', async () => {
  const kok = kokKur();
  const ev = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-ev-'));   // credentials yok
  // macOS disinda varsayilan OpenUsage adresi denenmez; elle verilen adres denenir.
  fs.writeFileSync(path.join(kok, 'ayar.json'), JSON.stringify({ openUsageUrl: 'http://127.0.0.1:6736/v1/usage/claude?test=1' }));
  try {
    const cagrilar = [];
    const sonuc = await olc({
      platform: 'linux',      // Keychain'e hic bakma
      ev,
      fetchFn: async (url) => {
        cagrilar.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ([{
            lines: [
              { type: 'progress', periodDurationMs: 18000000, used: 23.4, resetsAt: '2026-10-24T13:59:59+00:00' },
              { type: 'progress', periodDurationMs: 604800000, label: 'Fable', used: 77, resetsAt: '2026-10-28T06:59:59+00:00' },
              { type: 'progress', periodDurationMs: 604800000, label: 'weekly', used: 42, resetsAt: '2026-10-28T06:59:59+00:00' },
            ],
          }]),
        };
      },
    });
    assert.deepEqual(cagrilar, ['http://127.0.0.1:6736/v1/usage/claude?test=1'],
      'anahtar yok: yalniz OpenUsage cagrilmali');
    assert.equal(sonuc.b7, 42, 'weekly satiri; Fable (77) degil');
    assert.equal(sonuc.b5, 23.4);
    assert.equal(sonuc.reset7, 1793170799);
  } finally {
    temizle(kok);
    fs.rmSync(ev, { recursive: true, force: true });
  }
});

test('suresi dolmus credentials.json: bilinen Turkce hata metni', async () => {
  const kok = kokKur({ openUsageUrl: '' });   // dusus yolu kapali
  const ev = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-ev-'));
  fs.mkdirSync(path.join(ev, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(ev, '.claude', '.credentials.json'), JSON.stringify({
    claudeAiOauth: { accessToken: 'sk-ant-gizli', expiresAt: Date.now() - 1000 },
  }));
  try {
    const sonuc = await olc({
      platform: 'linux',
      ev,
      fetchFn: async () => { throw new Error('aga cikilmamali'); },
    });
    assert.equal(sonuc.hata,
      'Claude oturumu süresi dolmuş: terminalde bir kez claude çalıştırıp giriş yap');
  } finally {
    temizle(kok);
    fs.rmSync(ev, { recursive: true, force: true });
  }
});

test('gecerli anahtar Bearer ile gider, onbellege asla yazilmaz', async () => {
  const kok = kokKur();
  const ev = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-ev-'));
  fs.mkdirSync(path.join(ev, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(ev, '.claude', '.credentials.json'), JSON.stringify({
    claudeAiOauth: { accessToken: 'sk-ant-COK-GIZLI', expiresAt: Date.now() + 3600000 },
  }));
  try {
    let gelenBasliklar = null;
    const sonuc = await olc({
      platform: 'linux',
      ev,
      fetchFn: async (url, secenek) => {
        gelenBasliklar = secenek.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            five_hour: { utilization: 10, resets_at: '2026-10-24T13:59:59+00:00' },
            seven_day: { utilization: 13, resets_at: '2026-10-28T06:59:59+00:00' },
          }),
        };
      },
    });
    assert.equal(sonuc.b7, 13);
    assert.equal(gelenBasliklar.authorization, 'Bearer sk-ant-COK-GIZLI');
    assert.equal(gelenBasliklar['anthropic-beta'], 'oauth-2025-04-20');
    assert.equal(gelenBasliklar['user-agent'], 'claude-code/2.1.237');

    const onbellekMetin = fs.readFileSync(path.join(kok, 'onbellek.json'), 'utf8');
    assert.ok(!onbellekMetin.includes('sk-ant-COK-GIZLI'), 'anahtar onbellege yazilmamali');
    assert.ok(!onbellekMetin.includes('authorization'), 'istek basliklari da yazilmamali');
  } finally {
    temizle(kok);
    fs.rmSync(ev, { recursive: true, force: true });
  }
});

test('hata durumunda onbellekteki eski iyi degerler korunur', async () => {
  const kok = kokKur({ openUsageUrl: 'http://127.0.0.1:1/yok' });
  const ev = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-ev-'));
  try {
    // Once iyi bir olcum yaz.
    const ornek = path.join(kok, 'ornek.json');
    fs.writeFileSync(ornek, JSON.stringify({
      five_hour: { utilization: 30, resets_at: '2026-10-24T13:59:59+00:00' },
      seven_day: { utilization: 40, resets_at: '2026-10-28T06:59:59+00:00' },
    }));
    process.env.GUNLUK_KOTA_ORNEK_JSON = ornek;
    await olc({ platform: 'linux', ev });
    delete process.env.GUNLUK_KOTA_ORNEK_JSON;

    // Simdi her sey yatsin.
    const sonuc = await olc({
      platform: 'linux',
      ev,
      fetchFn: async () => { throw new Error('bağlantı yok'); },
    });
    assert.ok(sonuc.hata, 'hata donmeli');
    const onbellek = JSON.parse(fs.readFileSync(path.join(kok, 'onbellek.json'), 'utf8'));
    assert.equal(onbellek.b7, 40, 'eski iyi deger korunmali');
    assert.equal(onbellek.b5, 30);
    assert.equal(onbellek.hata, sonuc.hata);
    assert.ok(onbellek.sonDeneme, 'son deneme zamani yazilmali');
  } finally {
    temizle(kok);
    fs.rmSync(ev, { recursive: true, force: true });
  }
});
