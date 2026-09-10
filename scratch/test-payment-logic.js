// ==========================================
// TEST untuk src/PaymentLogic.js (pure logic pembayaran BBM vs tol FLAZZ)
// Jalankan: node scratch/test-payment-logic.js
// Memuat file produksi asli via vm (tanpa dependency Apps Script).
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'PaymentLogic.js');
if (!fs.existsSync(SRC)) {
  console.error('FAIL: src/PaymentLogic.js belum ada (harusnya file produksi dibuat setelah test ini merah).');
  process.exit(1);
}
const src = fs.readFileSync(SRC, 'utf8');
const sandbox = {};
vm.runInNewContext(src, sandbox, { filename: 'PaymentLogic.js' });

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('PASS: ' + label); }
  else { failed++; console.log('FAIL: ' + label); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  ok(a === b, label + (a === b ? '' : (' | actual=' + a + ' expected=' + b)));
}

const fBbm = sandbox.flazzBbmShare;
const fTol = sandbox.flazzTolShare;
const fShare = sandbox.flazzShareForCard;
const fRow = sandbox.isFlazzRowForCard;
const fCards = sandbox.distinctFlazzCards;
const fCharge = sandbox.flazzCardCharge;
const fDelta = sandbox.flazzEditDelta;
const fTolMethod = sandbox.resolveTollMethod;
const fTolCard = sandbox.resolveTollCard;

// BBM: kard A dapat bagian BBM
eq(fBbm({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100 }, 'A'), 100, 'flazzBbmShare: kartu A menerima biaya BBM 100');
eq(fBbm({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100 }, 'B'), 0, 'flazzBbmShare: kartu lain (B) tidak menerima');
eq(fBbm({ metode_pembayaran: 'TUNAI', flazz_card_id: '', biaya_bbm: 100 }, 'A'), 0, 'flazzBbmShare: BBM TUNAI -> 0 untuk semua kartu');
eq(fBbm({ metodell: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100 }, 'A'), 0, 'flazzBbmShare: row tanpa metode -> 0');

// TOL: kartu C menerima bagian tol walau BBM tunai
eq(fTol({ metode_toll: 'FLAZZ', flazz_card_id_toll: 'C', biaya_toll: 50 }, 'C'), 50, 'flazzTolShare: kartu C menerima tol 50');
eq(fTol({ metode_toll: 'FLAZZ', flazz_card_id_toll: 'C', biaya_toll: 50 }, 'A'), 0, 'flazzTolShare: kartu bukan pemilik tol -> 0');
eq(fTol({ metode_toll: 'TUNAI', flazz_card_id_toll: '', biaya_toll: 50 }, 'C'), 0, 'flazzTolShare: tol TUNAI -> 0');

// Total muatan kartu C = hanya tol (BBM tunai)
eq(fShare({ metode_pembayaran: 'TUNAI', flazz_card_id: '', biaya_bbm: 100, metode_toll: 'FLAZZ', flazz_card_id_toll: 'C', biaya_toll: 50 }, 'C'), 50, 'flazzShareForCard: BBM tunai + tol flazz -> kartu C dapat 50');
// Total kartu A = BBM saja
eq(fShare({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100, metode_toll: 'FLAZZ', flazz_card_id_toll: 'C', biaya_toll: 50 }, 'A'), 100, 'flazzShareForCard: kartu A dapat BBM 100 (bukan tol)');
// Satu kartu untuk keduanya
eq(fShare({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100, metode_toll: 'FLAZZ', flazz_card_id_toll: 'A', biaya_toll: 50 }, 'A'), 150, 'flazzShareForCard: kartu sama untuk BBM+tol -> 150');

// Gate: laporan BBM tunai + tol flazz termasuk kartu C
ok(fRow({ metode_pembayaran: 'TUNAI', flazz_card_id: '', metode_toll: 'FLAZZ', flazz_card_id_toll: 'C' }, 'C'), 'isFlazzRowForCard: laporan BBM tunai + tol flazz -> true utk kartu C');
ok(!fRow({ metode_pembayaran: 'TUNAI', flazz_card_id: '', metode_toll: 'FLAZZ', flazz_card_id_toll: 'C' }, 'D'), 'isFlazzRowForCard: kartu lain -> false');
ok(fRow({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', metode_toll: 'TUNAI', flazz_card_id_toll: '' }, 'A'), 'isFlazzRowForCard: BBM flazz saja -> true utk kartu A');
ok(!fRow({ metode_pembayaran: 'TUNAI', flazz_card_id: '', metode_toll: 'TUNAI', flazz_card_id_toll: '' }, 'A'), 'isFlazzRowForCard: seluruhnya tunai -> false');

// Daftar kartu unik yang terpakai
eq(fCards('FLAZZ', 'A', 'FLAZZ', 'A'), ['A'], 'distinctFlazzCards: kartu sama -> 1 entri');
eq(fCards('FLAZZ', 'A', 'FLAZZ', 'C'), ['A', 'C'], 'distinctFlazzCards: BBM A + tol C -> [A,C]');
eq(fCards('FLAZZ', 'A', 'TUNAI', ''), ['A'], 'distinctFlazzCards: hanya BBM flazz -> [A]');
eq(fCards('TUNAI', '', 'FLAZZ', 'C'), ['C'], 'distinctFlazzCards: hanya tol flazz -> [C]');
eq(fCards('TUNAI', '', 'TUNAI', ''), [], 'distinctFlazzCards: tanpa flazz -> []');

// Edit: BBM pindah kartu A->B, tol tetap di A
const oldS = { metodeBbm: 'FLAZZ', cardBbm: 'A', biayaBbm: 100, metodeTol: 'FLAZZ', cardTol: 'A', biayaTol: 50 };
const newS = { metodeBbm: 'FLAZZ', cardBbm: 'B', biayaBbm: 120, metodeTol: 'FLAZZ', cardTol: 'A', biayaTol: 50 };
eq(fDelta(oldS, newS, 'A'), 100, 'flazzEditDelta: kartu A mengembalikan biaya BBM lama (100) karena tol tetap');
eq(fDelta(oldS, newS, 'B'), -120, 'flazzEditDelta: kartu B dipotong biaya BBM baru (120)');
// Delete: hanya kembalikan bagian kartu
eq(fDelta(oldS, { metodeBbm: 'TUNAI', cardBbm: '', biayaBbm: 0, metodeTol: 'TUNAI', cardTol: '', biayaTol: 0 }, 'A'), 150, 'flazzEditDelta: hapus -> kartu A dikembalikan 150');
ok(fCharge(oldS, 'A') === 150, 'flazzCardCharge: muatan kartu A lama = 150');

// Resolusi metode & kartu tol (kompatibilitas baris lama)
eq(fTolMethod('FLAZZ', 'TUNAI', undefined), 'FLAZZ', 'resolveTollMethod: BBM tunai + metode tol eksplisit FLAZZ -> FLAZZ');
eq(fTolMethod('TUNAI', 'FLAZZ', undefined), 'TUNAI', 'resolveTollMethod: BBM flazz + metode tol eksplisit TUNAI -> TUNAI');
eq(fTolMethod(undefined, 'FLAZZ', undefined), 'FLAZZ', 'resolveTollMethod: form lama BBM flazz tanpa metode tol -> FLAZZ (infer)');
eq(fTolMethod(undefined, 'TUNAI', undefined), 'TUNAI', 'resolveTollMethod: tanpa metode tol + BBM tunai + tanpa kartu -> TUNAI');
eq(fTolMethod('', 'FLAZZ', undefined), 'FLAZZ', 'resolveTollMethod: string kosong dianggap belum dikirim');
eq(fTolCard('', 'FLAZZ', 'FLAZZ', 'A'), 'A', 'resolveTollCard: tol flazz tanpa kartu + BBM flazz -> pakai kartu BBM');
eq(fTolCard('C', 'FLAZZ', 'TUNAI', ''), 'C', 'resolveTollCard: kartu tol eksplisit C diutamakan');
eq(fTolCard('', 'FLAZZ', 'TUNAI', ''), '', 'resolveTollCard: tol flazz tanpa kartu & BBM tunai -> kosong (harus pilih)');
eq(fTolCard('C', 'TUNAI', 'FLAZZ', 'A'), '', 'resolveTollCard: metode tol TUNAI -> kartu kosong');

// ===== Id kartu lama tanpa karakter '-' (mis. "FLZ1788404474583" vs master "FLZ-1788404474583")
const cano = sandbox.canonicalCardId;
eq(cano('FLZ-1788404474583'), 'FLZ1788404474583', 'canonicalCardId: id master vs tanpa strip -> bentuk sama');
eq(cano('FLZ1788404474583'), 'FLZ1788404474583', 'canonicalCardId: id tanpa strip tetap sama');
eq(fRow({ metode_pembayaran: 'TUNAI', flazz_card_id: '', metode_toll: 'FLAZZ', flazz_card_id_toll: 'FLZ1788404474583' }, 'FLZ-1788404474583'), true, 'isFlazzRowForCard: baris tanpa strip cocok dgn id master');
eq(fBbm({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'FLZ1788404474583', biaya_bbm: 100 }, 'FLZ-1788404474583'), 100, 'flazzBbmShare: id tanpa strip diakui kartu master');
eq(fTol({ metode_toll: 'FLAZZ', flazz_card_id_toll: 'FLZ1788404777777', biaya_toll: 50 }, 'FLZ-1788404474583'), 0, 'flazzTolShare: id beda tetap tidak cocok');
eq(fCharge({ metodeBbm: 'FLAZZ', cardBbm: 'FLZ1788404474583', biayaBbm: 100, metodeTol: 'TUNAI', cardTol: '', biayaTol: 0 }, 'FLZ-1788404474583'), 100, 'flazzCardCharge: muatan memakai id tanpa strip');

// ===== Helper harus menerima objek baris (kunci panjang) DAN objek state (kunci pendek)
eq(fRow({ metodeBbm: 'TUNAI', cardBbm: '', metodeTol: 'FLAZZ', cardTol: 'C' }, 'C'), true, 'isFlazzRowForCard: state kunci pendek -> true');
eq(fTol({ metodeBbm: 'TUNAI', cardBbm: '', metodeTol: 'FLAZZ', cardTol: 'C', biayaTol: 50 }, 'C'), 50, 'flazzTolShare: state kunci pendek -> 50');
eq(fBbm({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100, metode_toll: 'TUNAI', flazz_card_id_toll: '', biaya_toll: 0 }, 'A'), 100, 'flazzBbmShare: baris kunci panjang tetap jalan');
eq(fCharge({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100, metode_toll: 'FLAZZ', flazz_card_id_toll: 'C', biaya_toll: 50 }, 'C'), 50, 'flazzCardCharge: baris kunci panjang -> kartu C dapat tol 50');

// ===== Fix: metode_toll kosong tapi flazz_card_id_toll terisi
eq(fTolMethod(undefined, 'TUNAI', 'C'), 'FLAZZ', 'resolveTollMethod: BBM tunai + card tol terisi -> FLAZZ (infer dari kartu)');
eq(fTolMethod('', 'TUNAI', 'C'), 'FLAZZ', 'resolveTollMethod: metode tol kosong + card tol terisi -> FLAZZ');
eq(fTolMethod(undefined, 'TUNAI', ''), 'TUNAI', 'resolveTollMethod: BBM tunai + tanpa kartu tol -> TUNAI');
eq(fTolMethod('FLAZZ', 'TUNAI', 'C'), 'FLAZZ', 'resolveTollMethod: metode eksplisit FLAZZ tetap diutamakan');
eq(fTolMethod('TUNAI', 'FLAZZ', 'A'), 'TUNAI', 'resolveTollMethod: metode eksplisit TUNAI tetap diutamakan');
eq(fTolMethod(undefined, 'TUNAI', '  '), 'TUNAI', 'resolveTollMethod: kartu tol whitespace-only tidak dianggap FLAZZ');

console.log('==== HASIL: ' + passed + ' passed, ' + failed + ' failed ====');
process.exit(failed === 0 ? 0 : 1);