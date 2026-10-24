#!/usr/bin/env node
// Gunluk kota CLI. Komutlar:
//   (yok)                        insan okuru icin ozet
//   durum [--json]               kayitli veriden durum (ag yok)
//   olc [--json] [--sessiz]      olc, deftere isle, paylasim varsa islet, durum bas
//   ac | kapat                   bugunluk bypass ac/kapa
//   sifirla                      bugunku sayaci simdikiden itibaren sifirla
//   ayar [<anahtar> <json-deger>]
//   kanca-kur [--kaldir] [--ayar-dosyasi <yol>]
//   yayinla                      paylasimi simdi zorla yayinla

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ayarOku, ayarYaz, jsonOku, jsonYaz, yerelYolu } from './ayar.mjs';
import { olcumEkle } from './defter.mjs';
import { durum } from './durum.mjs';
import { olc } from './olcum.mjs';
import { akisYap, yayinla } from './paylasim.mjs';
import { kancaKur } from './kanca-kur.mjs';
import { gunAdi } from './zaman.mjs';

const KULLANIM = [
  'Kullanım: node kota.mjs <komut>',
  '',
  '  (yok)                    günün özeti',
  '  durum [--json]           kayıtlı veriden durum',
  '  olc [--json] [--sessiz]  ölç, işle, durum bas',
  '  ac / kapat               bugünlük engeli aç / kapat',
  '  sifirla                  bugünkü sayacı şimdikinden itibaren sıfırla',
  '  ayar [<anahtar> <değer>] yapılandırmayı görüntüle / ayarla',
  '  kanca-kur [--kaldir] [--ayar-dosyasi <yol>]',
  '  yayinla                  paylaşımı şimdi yayınla',
].join('\n');

const sayi = (n) => (n === null || n === undefined ? '?' : String(n));

function insanOzeti(d) {
  const dolu = Math.max(0, Math.min(20, Math.round((d.harcanan / d.tavan) * 20)));
  const bar = '█'.repeat(dolu) + '░'.repeat(20 - dolu);
  const satirlar = [
    `Gün      : ${d.gun} (${d.saatDilimi})`,
    `Bugün    : %${d.harcanan} / %${d.tavan}  ${bar}`,
    `Kalan    : %${d.kalan}`,
    `5 saat   : %${sayi(d.son5s)}   7 gün: %${sayi(d.son7g)}  (${d.kaynak || 'ölçüm yok'})`,
  ];
  if (d.bypass) satirlar.push('DURUM    : bugünlük bypass açık');
  else if (d.asildi) satirlar.push('DURUM    : tavan aşıldı' + (d.aktif ? '' : ' (engel kapalı)'));
  else if (d.uyari) satirlar.push('DURUM    : uyarı eşiğinde');
  if (d.hata) satirlar.push(`Son hata : ${d.hata}`);
  // En yeni 7 gun, yeniden eskiye.
  const gecmis = Object.entries(d.gecmis).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  if (gecmis.length) {
    satirlar.push('');
    satirlar.push('Son günler:');
    for (const [gun, v] of gecmis) satirlar.push(`  ${gun}  %${v}`);
  }
  return satirlar.join('\n');
}

function yerelGuncelle(degistir) {
  const yerel = jsonOku(yerelYolu(), {});
  jsonYaz(yerelYolu(), degistir(yerel) || yerel);
}

async function ana() {
  const argv = process.argv.slice(2);
  const komut = argv[0] && !argv[0].startsWith('--') ? argv[0] : '';
  const bayrak = (ad) => argv.includes(ad);
  const bayrakDeger = (ad) => {
    const i = argv.indexOf(ad);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };

  if (komut === '') {
    console.log(insanOzeti(durum()));
    return 0;
  }
  if (komut === 'durum') {
    if (bayrak('--json')) console.log(JSON.stringify(durum()));
    else console.log(insanOzeti(durum()));
    return 0;
  }
  if (komut === 'olc') {
    const sonuc = await olc();
    if (!sonuc.hata) olcumEkle(sonuc);
    try {
      await akisYap();
    } catch { /* paylasim hatasi olcumu bozmaz */ }
    if (!bayrak('--sessiz')) {
      const d = durum();
      if (bayrak('--json')) console.log(JSON.stringify(d));
      else console.log(insanOzeti(d));
    }
    return 0;   // olcum bassa da cikis 0; hata durum JSON'unda tasınır
  }
  if (komut === 'ac') {
    const ayar = ayarOku();
    const gun = gunAdi(Date.now(), ayar.saatDilimi || 'Europe/Berlin');
    yerelGuncelle((y) => ({ ...y, bypassGun: gun }));
    console.log(`Bugünlük (${gun}) bypass açıldı.`);
    return 0;
  }
  if (komut === 'kapat') {
    yerelGuncelle((y) => {
      delete y.bypassGun;
      return y;
    });
    console.log('Bypass kapatıldı.');
    return 0;
  }
  if (komut === 'sifirla') {
    const ayar = ayarOku();
    const gun = gunAdi(Date.now(), ayar.saatDilimi || 'Europe/Berlin');
    yerelGuncelle((y) => ({ ...y, sifirla: { gun, an: Date.now() } }));
    console.log(`Bugünkü (${gun}) sayaç şimdikinden itibaren sıfırlandı.`);
    return 0;
  }
  if (komut === 'ayar') {
    if (argv.length < 3) {
      console.log(JSON.stringify(ayarOku(), null, 2));
      return 0;
    }
    const anahtar = argv[1];
    let deger = argv[2];
    try {
      deger = JSON.parse(deger);
    } catch { /* düz metin olarak kalsın */ }
    const ayar = ayarOku();
    if (deger === null) delete ayar[anahtar];
    else ayar[anahtar] = deger;
    ayarYaz(ayar);
    console.log(`${anahtar} = ${JSON.stringify(deger)}`);
    return 0;
  }
  if (komut === 'kanca-kur') {
    try {
      const sonuc = kancaKur({
        ayarDosyasi: bayrakDeger('--ayar-dosyasi') || undefined,
        kaldir: bayrak('--kaldir'),
      });
      console.log(sonuc.degisti
        ? 'Kanca güncellendi.'
        : 'Değişiklik gerekmedi (kanca zaten istenen durumda).');
    } catch (e) {
      console.error(String(e?.message || e));
      return 1;
    }
    return 0;
  }
  if (komut === 'yayinla') {
    const sonuc = await yayinla({ zorla: true });
    if (sonuc.tamam) console.log(`Paylaşıldı (${sonuc.sayi} nokta).`);
    else if (sonuc.atlandi) console.log('Atlandı.');
    else console.error(sonuc.hata || 'Yayınlama başarısız.');
    return sonuc.hata ? 1 : 0;
  }

  console.error(KULLANIM);
  return 2;
}

// Dogrudan calistirildiysa komutu islet ve cikis kodunu uygula.
// Karsilastirma gercek yol uzerinden yapilir: /tmp -> /private/tmp gibi
// sembol baglanti yollarda argv[1] ile import.meta.url farkli gorunurdu
// ve CLI sessizce hicbir sey yapmadan cikiyordu.
function dogrudanMi() {
  try {
    return Boolean(process.argv[1])
      && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (dogrudanMi()) {
  process.exit(await ana());
}
