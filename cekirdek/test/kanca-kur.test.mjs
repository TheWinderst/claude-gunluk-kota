// kanca-kur.mjs testleri: gecici settings.json uzerinde kur/kaldir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kancaKur } from '../kanca-kur.mjs';

const KANCA_YOLU = '/tmp/gunluk-kota/cekirdek/kanca.mjs';

function sahneKur(ayar) {
  const dizin = fs.mkdtempSync(path.join(os.tmpdir(), 'gunluk-kota-kur-'));
  const dosya = path.join(dizin, 'settings.json');
  if (ayar !== undefined) fs.writeFileSync(dosya, typeof ayar === 'string' ? ayar : JSON.stringify(ayar));
  return { dizin, dosya };
}

const BASKA_KANCA = {
  matcher: '.*',
  hooks: [{ type: 'command', command: '/usr/bin/say', args: ['merhaba'] }],
};

test('kur: baska kancaya dokunmaz, idempotent, yedek alir', () => {
  const { dizin, dosya } = sahneKur({
    model: 'opus',
    hooks: { UserPromptSubmit: [BASKA_KANCA], PreToolUse: [{ hooks: [{ type: 'command', command: 'x' }] }] },
  });
  try {
    kancaKur({ ayarDosyasi: dosya, nodeYolu: '/usr/local/bin/node', kancaYolu: KANCA_YOLU });
    kancaKur({ ayarDosyasi: dosya, nodeYolu: '/usr/local/bin/node', kancaYolu: KANCA_YOLU });   // ikinci kur
    const yazilan = JSON.parse(fs.readFileSync(dosya, 'utf8'));

    assert.equal(yazilan.model, 'opus', 'ilgisiz ust alan korunmali');
    assert.deepEqual(yazilan.hooks.PreToolUse, [{ hooks: [{ type: 'command', command: 'x' }] }],
      'baska hook turu korunmali');
    assert.deepEqual(yazilan.hooks.UserPromptSubmit[0], BASKA_KANCA,
      'baska UserPromptSubmit kancasi oldugu gibi kalmali');

    const bizim = yazilan.hooks.UserPromptSubmit.filter((g) => Array.isArray(g.hooks)
      && g.hooks.some((h) => h.args?.[0] === KANCA_YOLU));
    assert.equal(bizim.length, 1, 'bizim girisimiz tam bir tane olmali');
    assert.equal(bizim[0].hooks[0].type, 'command');
    assert.equal(bizim[0].hooks[0].command, '/usr/local/bin/node');
    assert.equal(bizim[0].hooks[0].timeout, 15);

    const yedekler = fs.readdirSync(dizin).filter((a) => a.startsWith('settings.json.yedek-gunluk-kota-'));
    assert.equal(yedekler.length, 1, 'ilk yazmada tek yedek alinmali');
  } finally {
    fs.rmSync(dizin, { recursive: true, force: true });
  }
});

test('kur: dosya yoksa olusturur', () => {
  const { dizin, dosya } = sahneKur(undefined);
  try {
    kancaKur({ ayarDosyasi: dosya, nodeYolu: 'node', kancaYolu: KANCA_YOLU });
    const yazilan = JSON.parse(fs.readFileSync(dosya, 'utf8'));
    assert.equal(yazilan.hooks.UserPromptSubmit.length, 1);
    const yedekler = fs.readdirSync(dizin).filter((a) => a.includes('yedek'));
    assert.equal(yedekler.length, 0, 'dosya yokken yedek alinmaz');
  } finally {
    fs.rmSync(dizin, { recursive: true, force: true });
  }
});

test('kaldir: yalniz bizimkini goturur, digerleri kalir', () => {
  const { dizin, dosya } = sahneKur({
    hooks: { UserPromptSubmit: [
      BASKA_KANCA,
      { hooks: [{ type: 'command', command: 'node', args: [KANCA_YOLU], timeout: 15 }] },
    ] },
  });
  try {
    const s = kancaKur({ ayarDosyasi: dosya, kaldir: true });
    assert.equal(s.degisti, true);
    assert.equal(s.kaldirildi, 1);
    const yazilan = JSON.parse(fs.readFileSync(dosya, 'utf8'));
    assert.deepEqual(yazilan.hooks.UserPromptSubmit, [BASKA_KANCA]);

    const bos = kancaKur({ ayarDosyasi: dosya, kaldir: true });
    assert.equal(bos.degisti, false, 'ikinci kaldirma degisiklik yapmaz');
  } finally {
    fs.rmSync(dizin, { recursive: true, force: true });
  }
});

test('kaldir: son kanca kalan hooks alanini temiz birakir', () => {
  const { dizin, dosya } = sahneKur({
    hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node', args: ['C:\\x\\cekirdek\\kanca.mjs'] }] }] },
  });
  try {
    kancaKur({ ayarDosyasi: dosya, kaldir: true });
    const yazilan = JSON.parse(fs.readFileSync(dosya, 'utf8'));
    assert.equal(yazilan.hooks, undefined);
  } finally {
    fs.rmSync(dizin, { recursive: true, force: true });
  }
});

test('bozuk JSON: hata firlatir, dosya degismez', () => {
  const { dizin, dosya } = sahneKur('{ gecersiz');
  try {
    assert.throws(() => kancaKur({ ayarDosyasi: dosya, kancaYolu: KANCA_YOLU }), /okunamadı/);
    assert.equal(fs.readFileSync(dosya, 'utf8'), '{ gecersiz', 'dosya bayt bayt ayni kalmali');
    const yedekler = fs.readdirSync(dizin).filter((a) => a.includes('yedek'));
    assert.equal(yedekler.length, 0, 'hata durumunda yedek de alinmaz');
  } finally {
    fs.rmSync(dizin, { recursive: true, force: true });
  }
});

test('kur/kaldir: ayni gruptaki baska kanca korunur', () => {
  const karisik = { hooks: [
    { type: 'command', command: '/usr/bin/say', args: ['merhaba'] },
    { type: 'command', command: '/usr/local/bin/node', args: [KANCA_YOLU], timeout: 15 },
  ] };
  const { dizin, dosya } = sahneKur({ hooks: { UserPromptSubmit: [karisik] } });
  try {
    kancaKur({ ayarDosyasi: dosya, nodeYolu: '/usr/local/bin/node', kancaYolu: KANCA_YOLU });
    let yazilan = JSON.parse(fs.readFileSync(dosya, 'utf8')).hooks.UserPromptSubmit;
    const say = (l) => l.flatMap((g) => g.hooks).filter((h) => h.command === '/usr/bin/say').length;
    const bizim = (l) => l.flatMap((g) => g.hooks).filter((h) => h.args?.[0] === KANCA_YOLU).length;
    assert.equal(say(yazilan), 1, 'kurulumda baska kanca kalmali');
    assert.equal(bizim(yazilan), 1, 'bizim kanca tek olmali');

    const r = kancaKur({ ayarDosyasi: dosya, kancaYolu: KANCA_YOLU, kaldir: true });
    assert.equal(r.kaldirildi, 1);
    yazilan = JSON.parse(fs.readFileSync(dosya, 'utf8')).hooks.UserPromptSubmit;
    assert.equal(say(yazilan), 1, 'kaldirmada baska kanca kalmali');
    assert.equal(bizim(yazilan), 0);
  } finally {
    fs.rmSync(dizin, { recursive: true, force: true });
  }
});

test('kur: BOMlu ve bos settings.json gecerli sayilir', () => {
  for (const ham of ['\uFEFF{"model":"ornek"}', '']) {
    const { dizin, dosya } = sahneKur(ham);
    try {
      kancaKur({ ayarDosyasi: dosya, nodeYolu: '/usr/local/bin/node', kancaYolu: KANCA_YOLU });
      const yazilan = JSON.parse(fs.readFileSync(dosya, 'utf8'));
      if (ham) assert.equal(yazilan.model, 'ornek');
      assert.equal(yazilan.hooks.UserPromptSubmit.length, 1);
    } finally {
      fs.rmSync(dizin, { recursive: true, force: true });
    }
  }
});
