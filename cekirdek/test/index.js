// `node --test cekirdek/test/` dizin biçimi için giriş dosyası.
// Node v26 koşucusu dizin argümanını içini aramadan tek modül gibi
// çalıştırıyor; CJS çözümlemesi dizin için index.js arar. Bu giriş
// 8 test dosyasını sırayla yükleyip aynı alt süreçte koşar.
// Çıplak `node --test` keşfi bu dosyayı bir test dosyası olarak da
// bulur; kendi başına koşulduğunda (argv[1] index.js ile biter) içi
// boş geçer, çift koşum olmaz.
'use strict';

const dosyalar = [
  'zaman.test.mjs',
  'defter.test.mjs',
  'durum.test.mjs',
  'kanca.test.mjs',
  'kanca-kur.test.mjs',
  'olcum.test.mjs',
  'paylasim.test.mjs',
  'cli.test.mjs',
];

async function main() {
  for (const dosya of dosyalar) {
    await import('./' + dosya);
  }
}

const dizinGirisi = process.argv[1] === undefined
  || !process.argv[1].endsWith('index.js');

if (dizinGirisi) {
  main().catch((hata) => {
    console.error(hata);
    process.exitCode = 1;
  });
}
