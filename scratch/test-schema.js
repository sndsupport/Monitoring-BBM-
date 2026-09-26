// Guard: header sheet wajib memuat kolom kartu kedua.
// Jalankan: node scratch/test-schema.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'DatabaseSetup.js');
if (!fs.existsSync(SRC)) {
  console.error('FAIL: src/DatabaseSetup.js belum ada');
  process.exit(1);
}
const sandbox = {};
vm.runInNewContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'DatabaseSetup.js' });

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('PASS: ' + label); }
  else { failed++; console.log('FAIL: ' + label); }
}
function headersOf(name) {
  const row = (sandbox.DATABASE_SCHEMA || []).find(function (s) { return s.name === name; });
  return row ? row.headers : null;
}

const jalur = headersOf('Jalur_Pengiriman') || [];
const trx = headersOf('Penggunaan_BBM') || [];

ok(jalur.indexOf('flazz_card_id_2') > -1, 'Jalur_Pengiriman punya flazz_card_id_2');
ok(jalur.indexOf('flazz_card_name_2') > -1, 'Jalur_Pengiriman punya flazz_card_name_2');
ok(trx.indexOf('flazz_card_id_2') > -1, 'Penggunaan_BBM punya flazz_card_id_2');
ok(trx.indexOf('biaya_bbm_2') > -1, 'Penggunaan_BBM punya biaya_bbm_2');
ok(trx.indexOf('flazz_card_id_toll_2') > -1, 'Penggunaan_BBM punya flazz_card_id_toll_2');
ok(trx.indexOf('biaya_toll_2') > -1, 'Penggunaan_BBM punya biaya_toll_2');

// Kolom baru harus APPEND-KANAN agar indeks hardcoded lama tetap sah.
ok(jalur.indexOf('flazz_card_id_2') === jalur.length - 2, 'Jalur_Pengiriman: 2 kolom baru di ujung kanan');
ok(jalur.indexOf('flazz_card_name_2') === jalur.length - 1, 'Jalur_Pengiriman: flazz_card_name_2 kolom terakhir');
ok(trx.indexOf('flazz_card_id_2') === trx.length - 4, 'Penggunaan_BBM: 4 kolom baru di ujung kanan');
ok(trx.indexOf('biaya_toll_2') === trx.length - 1, 'Penggunaan_BBM: biaya_toll_2 kolom terakhir');
// Indeks hardcoded yang harus tetap menunjuk kolom yang sama.
ok(trx[19] === 'biaya_bbm', 'trx[19] masih biaya_bbm');
ok(trx[27] === 'metode_pembayaran', 'trx[27] masih metode_pembayaran');
ok(trx[28] === 'flazz_card_id', 'trx[28] masih flazz_card_id');
ok(trx[30] === 'metode_toll', 'trx[30] masih metode_toll');
ok(trx[31] === 'flazz_card_id_toll', 'trx[31] masih flazz_card_id_toll');

console.log('==== HASIL: ' + passed + ' passed, ' + failed + ' failed ====');
process.exit(failed ? 1 : 0);
