// Zaman dilimi yardimcilari: gun adi, gun baslangici (DST guvenli), gun
// aritmetigi ve bir arayligin gunlere bolunmesi. Saf fonksiyonlar.

// YYYY-MM-DD -> "YYYY-MM-DD" (en-CA bicimi zaten ISO kisadir).
export function gunAdi(ms, saatDilimi = 'Europe/Berlin') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: saatDilimi, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms));
}

// Bir andaki bolge ofseti (ms). Intl'den duz okuma "UTC'mis gibi" ayristirip
// gercek anla farki alinir.
function oflet(ms, saatDilimi) {
  const parca = new Intl.DateTimeFormat('en-US', {
    timeZone: saatDilimi, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const d = {};
  for (const p of parca) if (p.type !== 'literal') d[p.type] = p.value;
  const sa = d.hour === '24' ? 0 : Number(d.hour);   // bazi surumler 24:00 dondurur
  const utc = Date.UTC(Number(d.year), Number(d.month) - 1, Number(d.day), sa, Number(d.minute), Number(d.second));
  return utc - Math.floor(ms / 1000) * 1000;
}

// "YYYY-MM-DD" gununun saat dilimindeki 00:00 aninin unix ms degeri.
// Once kabaca UTC-gece yarisi tahmin edilir, oflet ile duzeltilir, 3 adimda
// yakinsar; sonunda gunAdi ile dogrulanir, tutmazsa +-3 saat taranir.
export function gunBaslangici(gun, saatDilimi = 'Europe/Berlin') {
  const [y, a, g] = gun.split('-').map(Number);
  if (!y || !a || !g) throw new Error(`gecersiz gun: ${gun}`);
  const utcGece = Date.UTC(y, a - 1, g);
  let aday = utcGece;
  for (let i = 0; i < 3; i++) {
    const duzeltilmis = utcGece - oflet(aday, saatDilimi);
    if (duzeltilmis === aday) break;
    aday = duzeltilmis;
  }
  if (gunAdi(aday, saatDilimi) === gun) return aday;
  // Nadir durumlarda (gece yarisine denk gelen DST gecisi) komsu saatleri tara.
  for (let s = -3; s <= 3; s++) {
    if (s === 0) continue;
    const c = aday + s * 3600000;
    if (gunAdi(c, saatDilimi) === gun && gunAdi(c - 1, saatDilimi) === gun) return c;
  }
  return aday;
}

function bicimlendir(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function sonrakiGun(gun) {
  const [y, a, g] = gun.split('-').map(Number);
  const d = new Date(Date.UTC(y, a - 1, g));
  d.setUTCDate(d.getUTCDate() + 1);
  return bicimlendir(d);
}

export function oncekiGun(gun) {
  const [y, a, g] = gun.split('-').map(Number);
  const d = new Date(Date.UTC(y, a - 1, g));
  d.setUTCDate(d.getUTCDate() - 1);
  return bicimlendir(d);
}

// [s, t) araliginin saat dilimindeki takvim gunlerine ms bazinda dagilimi.
// Donus: [{ gun: "YYYY-MM-DD", ms: <ortalasma ms> }], ms toplami t - s.
export function gunDilimleri(s, t, saatDilimi = 'Europe/Berlin') {
  if (!(t > s)) return [];
  const sonuc = [];
  let an = s;
  for (let i = 0; i < 400 && an < t; i++) {   // 400 gun ust sinir: koruma
    const gun = gunAdi(an, saatDilimi);
    const gunBas = gunBaslangici(gun, saatDilimi);
    const gunSon = gunBaslangici(sonrakiGun(gun), saatDilimi);
    const bit = Math.min(t, gunSon);
    sonuc.push({ gun, ms: bit - Math.max(an, gunBas) });
    an = bit;
  }
  return sonuc;
}
