/**
 * Guard test Task 6 - FlazzOps rekon & hapus transaksi harus sadar kartu kedua.
 * Source-level guard (file dibaca sbg teks) + cek helper murni.
 * Jalankan: node scratch/flazz-dual-card-guard-test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const flazz = read('FlazzOps.js');
const payment = read('PaymentLogic.js');
const status = read('JalurStatus.js');
const jalur = read('JalurOps.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function count(src, re) { return (src.match(re) || []).length; }

// G1: tidak ada lagi penulisan status jalur langsung dari FlazzOps.
check('G1a tidak ada updateJalurStatus(SELESAI) langsung',
  !/updateJalurStatus\(\s*jalurMatch\.id\s*,\s*'SELESAI'/.test(flazz));
check('G1b tidak ada updateJalurStatus(SUDAH_LAPORAN) langsung',
  !/updateJalurStatus\(\s*jalurMatch\.id\s*,\s*'SUDAH_LAPORAN'/.test(flazz));
check('G1c tidak ada updateJalurStatus sama sekali di FlazzOps',
  !/updateJalurStatus\(/.test(flazz));
check('G1d tepat 2 pemanggilan recomputeJalurStatus (rekon simpan + hapus rekon)',
  count(flazz, /recomputeJalurStatus\(/g) === 2);

// G2: definisi completion terpusat di JalurStatus.js (D3).
check('G2a JalurStatus punya jalurCardIds + jalurFinalStatus',
  /function jalurCardIds\(/.test(status) && /function jalurFinalStatus\(/.test(status));
check('G2b jalurCardIds membaca dua slot dan men-dedup id yang sama',
  /\[flazzCardId, flazzCardId2\]/.test(status) &&
  /out\.indexOf\(s\) === -1/.test(status));
check('G2c jalurFinalStatus: tanpa laporan -> BELUM_DIISI',
  /return 'BELUM_DI_URI'/.test(status) || /return 'BELUM_DIISI'/.test(status));
check('G2d jalurFinalStatus: SELESAI hanya bila semua kartu punya rekon >= tanggal jalur',
  /for \(let i = 0; i < cards\.length; i\+\+\)/.test(status) &&
  /if \(!r \|\| r < tgl\) return 'SUDAH_LAPORAN'/.test(status) &&
  /return 'SELESAI'/.test(status));
check('G2e jalur tanpa kartu tetap SUDAH_LAPORAN (kompatibilitas lama)',
  /if \(!cards\.length\) return 'SUDAH_LAPORAN'/.test(status));

// G2f: gate mobilitas tetap 2 kemunculan, masih membaca slot-1 (tidak diubah semantik).
check('G2f gate mobilitas tetap 2 kemunculan di JalurOps',
  count(jalur, /finalStatus = latest\.flazz_card_id \? 'SELESAI' : 'SUDAH_LAPORAN'/g) === 2);
check('G2g penulisan status jalur di JalurOps hanya lewat recomputeJalurStatus',
  count(jalur, /recomputeJalurStatus\(/g) >= 1);

// G3: backfill nama kartu menutup kolom kedua.
check('G3a backfillFlazzCardName membaca flazz_card_id_2 + flazz_card_name_2',
  /flazz_card_id_2/.test(flazz) && /flazz_card_name_2/.test(flazz));
check('G3b backfill tetap best-effort (tidak melempar)',
  /Backfill bersifat best-effort/.test(flazz));
check('G3c backfill memproses dua pasangan kolom',
  /pairs\.length/.test(flazz) && /for \(let p = 0; p < pairs\.length; p\+\+\)/.test(flazz));

// G4: dashboard Flazz ikut menghitung grup-2.
check('G4a dashboard membaca 4 kolom grup-2',
  /flazz_card_id_2/.test(flazz) && /biaya_bbm_2/.test(flazz) &&
  /flazz_card_id_toll_2/.test(flazz) && /biaya_toll_2/.test(flazz));
check('G4b dashboard memakai cardGroups (bukan baca kolom manual per baris)',
  /cardGroups\(rowObj\)/.test(flazz));
check('G4c dashboard tidak lagi memanggil resolveTollMethod/resolveTollCard langsung',
  !/resolveTollMethod\(metodeTollIdx/.test(flazz) &&
  !/resolveTollCard\(cardTollIdx/.test(flazz));

// G5: hapus transaksi ditangani untuk seluruh kartu + nominal grup-2.
check('G5a hapus transaksi memakai distinctFlazzCardsOf',
  /distinctFlazzCardsOf\(payState\)/.test(flazz) &&
  !/distinctFlazzCards\(payState\./.test(flazz));
check('G5b detach juga melepas kolom kartu kedua',
  /if \(idxCard2 > -1\) sheet\.getRange\(rowIndex, idxCard2 \+ 1\)\.setValue\(''\)/.test(flazz) &&
  /if \(idxCardToll2 > -1\) sheet\.getRange\(rowIndex, idxCardToll2 \+ 1\)\.setValue\(''\)/.test(flazz));
check('G5c ringkasan bulanan memakai rowBbmTotal/rowTolTotal',
  /rowBbmTotal\(\{[\s\S]{0,90}biaya_bbm_2/.test(flazz) &&
  /rowTolTotal\(\{[\s\S]{0,90}biaya_toll_2/.test(flazz));
check('G5d log audit menyimpan field grup-2',
  /flazz_card_id_2: payState\.cardBbm2/.test(flazz));

// G6: kolom baru dibaca aman bila sheet belum dimigrasi.
check('G6a pembacaan kolom grup-2 di hapus-transaksi dijaga idx > -1',
  /if \(idxCard2 > -1\) payState\.cardBbm2 =/.test(flazz) &&
  /if \(idxBbm2 > -1\) payState\.biayaBbm2 =/.test(flazz) &&
  /if \(idxCardToll2 > -1\) payState\.cardTol2 =/.test(flazz) &&
  /if \(idxToll2 > -1\) payState\.biayaTol2 =/.test(flazz));
check('G6b pembacaan kolom grup-2 di dashboard dijaga idx > -1',
  count(flazz, /if \((?:card2Idx|bbm2Idx|cardToll2Idx|toll2Idx) > -1\) rowObj\./g) === 4);

// G7: helper PaymentLogic konsisten.
check('G7a PaymentLogic menyediakan cardGroups + distinctFlazzCardsOf',
  /function cardGroups\(/.test(payment) && /function distinctFlazzCardsOf\(/.test(payment));
check('G7b alias lama distinctFlazzCards sudah dihapus',
  !/function distinctFlazzCards\(/.test(payment));

// G8: tidak ada karakter CJK/"mojibake" yang tersisip di FlazzOps.js.
const cjk = flazz.split(/\r?\n/).map((l, i) => [i + 1, l])
  .filter(([, l]) => /[\u3000-\u9fff\uff00-\uffef]/.test(l));
check('G8a FlazzOps.js bebas karakter CJK (label ' + cjk.length + ')',
  cjk.length === 0);
if (cjk.length) cjk.forEach(([n, l]) => console.log('      baris ' + n + ': ' + l.trim()));

console.log('');
console.log('HASIL: ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
