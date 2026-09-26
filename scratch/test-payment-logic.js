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
const fCardsOf = sandbox.distinctFlazzCardsOf;
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
eq(fCardsOf({ metodeBbm: 'FLAZZ', cardBbm: 'A', metodeTol: 'FLAZZ', cardTol: 'A' }), ['A'], 'distinctFlazzCardsOf: kartu sama -> 1 entri');
eq(fCardsOf({ metodeBbm: 'FLAZZ', cardBbm: 'A', metodeTol: 'FLAZZ', cardTol: 'C' }), ['A', 'C'], 'distinctFlazzCardsOf: BBM A + tol C -> [A,C]');
eq(fCardsOf({ metodeBbm: 'FLAZZ', cardBbm: 'A', metodeTol: 'TUNAI', cardTol: '' }), ['A'], 'distinctFlazzCardsOf: hanya BBM flazz -> [A]');
eq(fCardsOf({ metodeBbm: 'TUNAI', cardBbm: '', metodeTol: 'FLAZZ', cardTol: 'C' }), ['C'], 'distinctFlazzCardsOf: hanya tol flazz -> [C]');
eq(fCardsOf({ metodeBbm: 'TUNAI', cardBbm: '', metodeTol: 'TUNAI', cardTol: '' }), [], 'distinctFlazzCardsOf: tanpa flazz -> []');

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

// ===== Edit: field kosong = pembatalan eksplisit (form lengkap mengirim '' saat dibersihkan),
// sedangkan undefined/null = koreksi parsial (pertahankan nilai lama).
const fAmount = sandbox.parseEditAmount;
const fMethod = sandbox.parseEditMethod;
eq(fAmount('', 15000), 0, 'parseEditAmount: string kosong -> 0 (beli BBM dibatalkan)');
eq(fAmount(undefined, 15000), 15000, 'parseEditAmount: undefined -> pertahankan lama (koreksi parsial)');
eq(fAmount(null, 15000), 15000, 'parseEditAmount: null -> pertahankan lama');
eq(fAmount('0', 15000), 0, 'parseEditAmount: "0" -> 0');
eq(fAmount('5000', 15000), 5000, 'parseEditAmount: "5000" -> 5000');
eq(fMethod('', 'FLAZZ'), '', 'parseEditMethod: string kosong -> batal Flazz (metode dihapus)');
eq(fMethod(undefined, 'FLAZZ'), 'FLAZZ', 'parseEditMethod: undefined -> pertahankan lama');
eq(fMethod(null, 'FLAZZ'), 'FLAZZ', 'parseEditMethod: null -> pertahankan lama');
eq(fMethod('TUNAI', 'FLAZZ'), 'TUNAI', 'parseEditMethod: ganti ke TUNAI');
eq(fMethod(' FLAZZ ', 'TUNAI'), 'FLAZZ', 'parseEditMethod: trim whitespace');
// ===== Grup-2 (kartu kedua) =====
const fGroups = sandbox.cardGroups;
const fG2 = sandbox.group2FromRow;

// --- Back-compat: baris lama tidak punya kolom grup-2 sama sekali ---
eq(fG2({}), null, 'group2FromRow: baris lama (tanpa kolom grup-2) -> null');
eq(fG2({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100 }), null, 'group2FromRow: baris dengan grup-1 saja -> null');
eq(fG2({ biaya_bbm_2: 0, biaya_toll_2: 0, flazz_card_id_2: '', flazz_card_id_toll_2: '' }), null, 'group2FromRow: grup-2 semua kosong/0 -> null');
eq(fGroups({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100 }).length, 1, 'cardGroups: baris lama -> hanya 1 grup');

// --- Turunan metode grup-2 (D1) ---
eq(fG2({ biaya_bbm_2: 500, flazz_card_id_2: 'B' }), { mBbm: 'FLAZZ', cBbm: 'B', bBbm: 500, mTol: '', cTol: '', bTol: 0 }, 'group2FromRow: kartu + nominal -> FLAZZ');
eq(fG2({ biaya_bbm_2: 500, flazz_card_id_2: '' }), { mBbm: 'TUNAI', cBbm: '', bBbm: 500, mTol: '', cTol: '', bTol: 0 }, 'group2FromRow: nominal tanpa kartu -> TUNAI');
eq(fG2({ flazz_card_id_toll_2: 'C' }), { mBbm: '', cBbm: '', bBbm: 0, mTol: 'FLAZZ', cTol: 'C', bTol: 0 }, 'group2FromRow: hanya kartu tol tanpa nominal -> tetap FLAZZ');
eq(fG2({ biaya_toll_2: 700 }), { mBbm: '', cBbm: '', bBbm: 0, mTol: 'TUNAI', cTol: '', bTol: 700 }, 'group2FromRow: tol tunai -> TUNAI tanpa kartu');

// --- Kunci pendek (state object) juga dibaca ---
eq(fG2({ cardBbm2: 'B', biayaBbm2: 250 }), { mBbm: 'FLAZZ', cBbm: 'B', bBbm: 250, mTol: '', cTol: '', bTol: 0 }, 'group2FromRow: kunci pendek cardBbm2/biayaBbm2');

// --- Back-compat nilai: baris lama -> hasil identik dengan sebelum perubahan ---
eq(fBbm({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100 }, 'A'), 100, 'back-compat: flazzBbmShare baris lama tetap 100');
eq(fTol({ metode_toll: 'FLAZZ', flazz_card_id_toll: 'C', biaya_toll: 50 }, 'C'), 50, 'back-compat: flazzTolShare baris lama tetap 50');
eq(fRow({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', metode_toll: 'TUNAI', flazz_card_id_toll: '' }, 'A'), true, 'back-compat: isFlazzRowForCard baris lama tetap true');
eq(fCharge({ metodeBbm: 'FLAZZ', cardBbm: 'A', biayaBbm: 100, metodeTol: 'TUNAI', cardTol: '', biayaTol: 0 }, 'A'), 100, 'back-compat: flazzCardCharge baris lama tetap 100');

// --- Share per kartu pada 2 kelompok ---
const DUAL = { metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 300,
               metode_toll: 'FLAZZ', flazz_card_id_toll: 'A', biaya_toll: 50,
               biaya_bbm_2: 200, flazz_card_id_2: 'B',
               biaya_toll_2: 75, flazz_card_id_toll_2: 'B' };
eq(fBbm(DUAL, 'A'), 300, 'dual: kartu A hanya dapat BBM grup-1');
eq(fBbm(DUAL, 'B'), 200, 'dual: kartu B hanya dapat BBM grup-2');
eq(fTol(DUAL, 'A'), 50, 'dual: kartu A hanya dapat tol grup-1');
eq(fTol(DUAL, 'B'), 75, 'dual: kartu B hanya dapat tol grup-2');
eq(fShare(DUAL, 'A'), 350, 'dual: total kartu A = 300 + 50');
eq(fShare(DUAL, 'B'), 275, 'dual: total kartu B = 200 + 75');
eq(fGroups(DUAL).length, 2, 'dual: cardGroups -> 2 grup');

// --- Tol terbagi ke 2 kartu (kasus inti pengguna) ---
const TOL_SPLIT = { metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100,
                     metode_toll: 'FLAZZ', flazz_card_id_toll: 'A', biaya_toll: 40,
                     biaya_toll_2: 60, flazz_card_id_toll_2: 'B' };
eq(fTol(TOL_SPLIT, 'A'), 40, 'tol terbagi: kartu A dapat 40');
eq(fTol(TOL_SPLIT, 'B'), 60, 'tol terbagi: kartu B dapat 60');
ok(fRow(TOL_SPLIT, 'A'), 'tol terbagi: baris termasuk kartu A');
ok(fRow(TOL_SPLIT, 'B'), 'tol terbagi: baris juga termasuk kartu B');
ok(!fRow(TOL_SPLIT, 'C'), 'tol terbagi: kartu lain tetap false');

// --- Grup-2 tunai tidak boleh membebani kartu mana pun ---
const G2_TUNAI = { metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100, biaya_toll_2: 90 };
eq(fShare(G2_TUNAI, 'A'), 100, 'grup-2 TUNAI tidak membebani kartu A');
eq(fShare(G2_TUNAI, 'C'), 0, 'grup-2 TUNAI tidak fallen ke kartu lain');
ok(fRow(G2_TUNAI, 'A'), 'baris tetap terkait kartu A lewat BBM grup-1');
ok(!fRow(G2_TUNAI, 'C'), 'grup-2 TUNAI tidak membuat baris terkait kartu C');
eq(fCardsOf(G2_TUNAI), ['A'], 'grup-2 TUNAI tidak menambah daftar kartu');

// --- Id kartu tanpa '-' tetap cocok pada grup-2 ---
eq(fBbm({ biaya_bbm_2: 100, flazz_card_id_2: 'FLZ-123' }, 'FLZ123'), 100, 'grup-2: id kartu tanpa tanda hubung tetap cocok');

// --- distinctFlazzCardsOf ---
eq(fCardsOf({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100, biaya_bbm_2: 50, flazz_card_id_2: 'B' }), ['A', 'B'], 'distinctFlazzCardsOf: grup-2 ikut terdaftar');
eq(fCardsOf({ metode_pembayaran: 'TUNAI', flazz_card_id: '', biaya_toll_2: 90 }), [], 'distinctFlazzCardsOf: grup-2 TUNAI tidak terdaftar');

// --- flazzEditDelta memindahkan beban antar grup ---
const OLD_S = { metodeBbm: 'FLAZZ', cardBbm: 'A', biayaBbm: 300, metodeTol: 'TUNAI', cardTol: '', biayaTol: 0 };
const NEW_S = { metodeBbm: 'FLAZZ', cardBbm: 'A', biayaBbm: 100, metodeTol: 'FLAZZ', cardTol: 'A', biayaTol: 50,
                cardBbm2: 'B', biayaBbm2: 200, cardTol2: 'B', biayaTol2: 75 };
eq(fDelta(OLD_S, NEW_S, 'A'), 150, 'flazzEditDelta: kartu A naik 150 (300 -> 150)');
eq(fDelta(OLD_S, NEW_S, 'B'), -275, 'flazzEditDelta: kartu B turun 275 (0 -> 275)');
eq(fDelta(NEW_S, OLD_S, 'B'), 275, 'flazzEditDelta: pembalikan menghasilkan delta positif');

console.log('==== HASIL: ' + passed + ' passed, ' + failed + ' failed ====');
process.exit(failed === 0 ? 0 : 1);