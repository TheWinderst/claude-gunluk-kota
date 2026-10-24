// zaman.mjs testleri: gun adi, DST guvenli gun baslangici, gun dilimleri.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gunAdi, gunBaslangici, sonrakiGun, oncekiGun, gunDilimleri } from '../zaman.mjs';

const TZ = 'Europe/Berlin';

test('gunAdi Berlin gece yarisi cevresinde dogru gun verir', () => {
  // Yaz saatinde (CEST, UTC+2) gece yarisi 22:00Z.
  assert.equal(gunAdi(Date.UTC(2026, 9, 23, 21, 59, 59), TZ), '2026-10-23');
  assert.equal(gunAdi(Date.UTC(2026, 9, 23, 22, 0, 0), TZ), '2026-10-24');
  // Kis saatinde (CET, UTC+1) gece yarisi 23:00Z.
  assert.equal(gunAdi(Date.UTC(2026, 9, 25, 22, 59, 59), TZ), '2026-10-25');
  assert.equal(gunAdi(Date.UTC(2026, 9, 25, 23, 0, 0), TZ), '2026-10-26');
});

test('gunBaslangici DST bitis gunu 25 saat uzun (25.10.2026)', () => {
  const a = gunBaslangici('2026-10-25', TZ);
  const b = gunBaslangici('2026-10-26', TZ);
  assert.equal(b - a, 25 * 3600000);
  assert.equal(gunAdi(a, TZ), '2026-10-25');
  assert.equal(gunAdi(a - 1, TZ), '2026-10-24');
});

test('gunBaslangici DST baslangic gunu 23 saat kisa (29.03.2026)', () => {
  const a = gunBaslangici('2026-03-29', TZ);
  const b = gunBaslangici('2026-03-30', TZ);
  assert.equal(b - a, 23 * 3600000);
  assert.equal(gunAdi(a, TZ), '2026-03-29');
});

test('gunBaslangici normal gunde 24 saat', () => {
  assert.equal(
    gunBaslangici('2026-07-15', TZ) - gunBaslangici('2026-07-14', TZ),
    24 * 3600000,
  );
});

test('sonrakiGun / oncekiGun tarih aritmetigi', () => {
  assert.equal(sonrakiGun('2026-10-31'), '2026-11-01');
  assert.equal(sonrakiGun('2026-12-31'), '2027-01-01');
  assert.equal(sonrakiGun('2028-02-28'), '2028-02-29');   // artik yil
  assert.equal(oncekiGun('2026-03-01'), '2026-02-28');
  assert.equal(oncekiGun(sonrakiGun('2026-05-20')), '2026-05-20');
});

test('gunDilimleri gece yarisini kesen araligi zamana gore boler', () => {
  // 22:00 -> 08:00 Berlin: ilk gune 2 saat, ikinci gune 8 saat.
  const s = Date.UTC(2026, 9, 22, 20, 0, 0);   // 22:00 CEST
  const t = Date.UTC(2026, 9, 23, 6, 0, 0);    // 08:00 CEST
  assert.deepEqual(gunDilimleri(s, t, TZ), [
    { gun: '2026-10-22', ms: 2 * 3600000 },
    { gun: '2026-10-23', ms: 8 * 3600000 },
  ]);
});

test('gunDilimleri tek gunun icindeki aralikta tek dilim verir', () => {
  const s = Date.UTC(2026, 9, 22, 10, 0, 0);
  const t = Date.UTC(2026, 9, 22, 12, 30, 0);
  assert.deepEqual(gunDilimleri(s, t, TZ), [
    { gun: '2026-10-22', ms: 2.5 * 3600000 },
  ]);
});

test('gunDilimleri bos ya da ters aralikta bos doner', () => {
  assert.deepEqual(gunDilimleri(1000, 1000, TZ), []);
  assert.deepEqual(gunDilimleri(2000, 1000, TZ), []);
});
