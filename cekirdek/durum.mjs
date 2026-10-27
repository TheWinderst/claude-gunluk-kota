// Durum: tum kayitlardan durum JSON'unu (sozlesme) kurar.
// durumHesapla saf, durum() dosyalardan okuyan sarmalayicidir.

import { ayarOku, jsonOku, yerelYolu, paylasimYolu, onbellekYolu } from './ayar.mjs';
import { olcumleriOku, birlestir, dagit } from './defter.mjs';
import { gunAdi, oncekiGun, sonrakiGun, gunBaslangici } from './zaman.mjs';

const TAZE_MS = 10 * 60000;   // 10 dk: taze olcum sayilma siniri

const yuvarla = (n) => Math.round(n * 10) / 10;

// Saf hesap. Girdi: { simdi, ayar, yerel, noktalar (birlesik, sirali),
// sonHata }. Cikti: sozlesmedeki durum JSON'u, ayni alan adlari ve tiplerle.
export function durumHesapla({ simdi, ayar, yerel, noktalar, sonHata = null }) {
  const tz = ayar.saatDilimi || 'Europe/Berlin';
  const gun = gunAdi(simdi, tz);
  const liste = [...(noktalar || [])].sort((a, b) => a.t - b.t);
  // Gecmis gun, o gunun sonunda gecerli pencerenin dagitimindan okunur:
  // sifirlama gunu eski haftanin gece harcamasi yeni haftanin payina eklenmez.
  const pencereler = new Map();
  const gecmisPay = (g) => {
    const son = gunBaslangici(sonrakiGun(g), tz);
    let p = null;
    for (let i = liste.length - 1; i >= 0; i--) if (liste[i].t < son) { p = liste[i]; break; }
    if (!p) return 0;
    if (!pencereler.has(p.r)) {
      pencereler.set(p.r, dagit(liste.filter((q) => q.r === p.r), tz, { sifirla: yerel?.sifirla || null }));
    }
    return pencereler.get(p.r)[g] || 0;
  };

  // Bugunun payi yalniz GUNCEL pencerenin noktalarindan: sifirlama gunu (or.
  // Carsamba 08:00) gece yarisindan once eski haftaya yapilan harcama yeni
  // haftanin gunluk payindan dusmez. Gecmis tum noktalardan hesaplanir.
  const guncelR = liste.length ? liste[liste.length - 1].r : null;
  const guncel = guncelR == null ? liste : liste.filter((p) => p.r === guncelR);
  const bugunDagilan = dagit(guncel, tz, { sifirla: yerel?.sifirla || null });
  const harcanan = yuvarla(bugunDagilan[gun] || 0);
  const tavan = ayar.tavan;
  const uyariEsigi = ayar.uyari;
  const uyari = harcanan >= uyariEsigi;
  const asildi = harcanan >= tavan;
  const aktif = !!ayar.engel && (ayar.baslangic == null || gun >= ayar.baslangic);
  const bypass = yerel?.bypassGun === gun;
  const engel = aktif && asildi && !bypass;

  const enYeni = liste.length ? liste[liste.length - 1] : null;
  let kaynak = null;
  if (enYeni) {
    const taze = simdi - enYeni.t <= TAZE_MS;
    if (!taze) kaynak = 'bayat';
    else kaynak = enYeni.k === 'paylasim' ? 'paylasim' : 'olcum';
  }

  // Gecmis: bugunden onceki en cok 14 gun; degeri 0'dan buyuk ya da en eski
  // gozlemin gununden itibaren gozlem kapsaminda olan gunler.
  const gecmis = {};
  const enEskiGun = enYeni ? gunAdi(liste[0].t, tz) : null;
  let gunIter = oncekiGun(gun);
  for (let i = 0; i < 14; i++) {
    const deger = yuvarla(gecmisPay(gunIter));
    const kapsam = enEskiGun && gunIter >= enEskiGun;
    if (deger > 0 || kapsam) gecmis[gunIter] = deger;
    gunIter = oncekiGun(gunIter);
  }

  return {
    surum: 1,
    gun,
    saatDilimi: tz,
    harcanan,
    tavan,
    kalan: yuvarla(Math.max(0, tavan - harcanan)),
    uyariEsigi,
    uyari,
    asildi,
    baslangic: ayar.baslangic ?? null,
    aktif,
    bypass,
    engel,
    son7g: enYeni ? enYeni.u : null,
    son5s: enYeni ? enYeni.b5 : null,
    reset5: enYeni ? enYeni.r5 : null,
    reset7: enYeni ? enYeni.r : null,
    kaynak,
    olcumZamani: enYeni ? new Date(enYeni.t).toISOString() : null,
    hata: sonHata ?? null,
    gecmis,
    gozlemSayisi: liste.length,
    paylasim: {
      yayin: ayar.paylasim?.yayinla?.gist ?? null,
      okuma: ayar.paylasim?.oku ?? null,
    },
  };
}

// Dosyalardan yukleyip durum kurar. Aga cikmaz.
export function durum() {
  const ayar = ayarOku();
  const yerel = jsonOku(yerelYolu(), {});
  const olcumler = olcumleriOku().olcumler;
  const paylasim = jsonOku(paylasimYolu(), null);
  const noktalar = birlestir(olcumler, paylasim?.olcumler || []);
  const onbellek = jsonOku(onbellekYolu(), null);
  return durumHesapla({
    simdi: Date.now(),
    ayar,
    yerel,
    noktalar,
    sonHata: onbellek?.hata ?? null,
  });
}
