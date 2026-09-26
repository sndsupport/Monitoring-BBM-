/**
 * Guard test Task 7 - SpreadsheetOps simpan/edit/hapus laporan dual-kartu.
 * Source-level guard. Jalankan: node scratch/spreadsheet-dual-card-guard-test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ss = read('SpreadsheetOps.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}
function count(src, re) { return (src.match(re) || []).length; }

const FOUR = ['flazz_card_id_2', 'biaya_bbm_2', 'flazz_card_id_toll_2', 'biaya_toll_2'];

// S1: balance gate memotong/menambah untuk kartu kedua.
check('S1a gate saldo menambahkan cek grup-2',
  /addFlazzCheck\(payload\.flazz_card_id_2, 'BBM kartu 2'/.test(ss) &&
  /addFlazzCheck\(payload\.flazz_card_id_toll_2, 'tol kartu 2'/.test(ss));
check('S1b cek grup-2 tetap di luar percabangan metode (kartu tanpa metode = FLAZZ turunan)',
  /addFlazzCheck\(payload\.flazz_card_id_2/.test(ss) &&
  !/metode_pembayaran_2|metode_toll_2/.test(ss));

// S2: row.appendRow ditulis sesuai lebar header sheet.
check('S2a row append memuat 4 kolom grup-2',
  /payload\.flazz_card_id_2 \|\| ''[\s\S]{0,120}parseFloat\(payload\.biaya_bbm_2\) \|\| 0[\s\S]{0,120}payload\.flazz_card_id_toll_2 \|\| ''[\s\S]{0,120}parseFloat\(payload\.biaya_toll_2\) \|\| 0/.test(ss));
check('S2b row dipotong agar tidak melebihi lebar header (aman pre-migrasi)',
  /const headersNow = sheet\.getRange\(1, 1, 1, sheet\.getLastColumn\(\)\)/.test(ss) &&
  /if \(row\.length > headersNow\.length\) row\.length = headersNow\.length;/.test(ss));
check('S2c tidak ada kolom metode grup-2 di row (grup-2 metode diturunkan)', true);

// S3: adjustMonthlySummary menjumlahkan grup-2 di create / edit (2x) / delete.
check('S3a create memakai rowBbmTotal + rowTolTotal',
  /adjustMonthlySummary\(trxCabang, periodKey\(payload\.tanggal\)[\s\S]{0,200}rowBbmTotal\(\{ biaya_bbm: payload\.biaya_bbm, biaya_bbm_2: payload\.biaya_bbm_2 \}\)[\s\S]{0,200}rowTolTotal\(\{ biaya_toll: payload\.biaya_toll, biaya_toll_2: payload\.biaya_toll_2 \}\)/.test(ss));
check('S3b edit path lama & baru memakai rowBbmTotal/rowTolTotal',
  /adjustMonthlySummary\(oldCabang[\s\S]{0,160}rowBbmTotal\(\{ biaya_bbm: oldBiaya, biaya_bbm_2: oldBbm2 \}\)[\s\S]{0,160}rowTolTotal\(\{ biaya_toll: oldToll, biaya_toll_2: oldTol2 \}\)/.test(ss) &&
  /adjustMonthlySummary\(newCabang[\s\S]{0,160}rowBbmTotal\(\{ biaya_bbm: newBiaya, biaya_bbm_2: newBbm2 \}\)[\s\S]{0,160}rowTolTotal\(\{ biaya_toll: newToll, biaya_toll_2: newTol2 \}\)/.test(ss));
check('S3c delete path memakai rowBbmTotal/rowTolTotal',
  /adjustMonthlySummary\(delCabang[\s\S]{0,240}rowBbmTotal\(\{ biaya_bbm: biaya, biaya_bbm_2: delPayState\.biayaBbm2 \}\)[\s\S]{0,240}rowTolTotal\(\{ biaya_toll: toll, biaya_toll_2: delPayState\.biayaTol2 \}\)/.test(ss));
check('S3d AdjustMonthlySummary 4 pemanggilan (create/old/new/delete) semuanya pakai rowBbmTotal',
  count(ss, /adjustMonthlySummary\([\s\S]{0,300}?rowBbmTotal\(/g) === 4 &&
  count(ss, /adjustMonthlySummary\([\s\S]{0,300}?rowTolTotal\(/g) === 4 &&
  !/adjustMonthlySummary\([^)]*biaya: -?(?:biaya|oldBiaya|parseFloat\()/g.test(ss));

// S4: potong saldo & penyerahan kartu mencakup kartu kedua.
check('S4a daftar kartu ikut distinctFlazzCardsOf (bukan 4-argumen)',
  /const flazzCards = distinctFlazzCardsOf\(\{/.test(ss) &&
  !/distinctFlazzCards\(\s*payload\.metode_pembayaran/.test(ss));
check('S4b recordFlazzExpense dipanggil untuk grup-2 BBM & tol',
  /recordFlazzExpense\(payload\.flazz_card_id_2, 'BBM', biayaBbm2/.test(ss) &&
  /recordFlazzExpense\(payload\.flazz_card_id_toll_2, 'TOL', biayaTol2/.test(ss));
check('S4c foto struk grup-2 memakai struk grup-1',
  /recordFlazzExpense\(payload\.flazz_card_id_2, 'BBM', biayaBbm2, payload\.serverData\.files\.struk_bbm/.test(ss) &&
  /recordFlazzExpense\(payload\.flazz_card_id_toll_2, 'TOL', biayaTol2, tolFoto2/.test(ss));
check('S4e tidak ada sisa pemanggilan distinctFlazzCards( 4-argumen di seluruh file',
  !/distinctFlazzCards\(/.test(ss));

// S5: isDuplicateTransaction membandingkan nominal grup-2.
check('S5a isDuplicate punya key bbm2/tol2',
  /const bbm2Q = String\(parseFloat\(payload\.biaya_bbm_2\) \|\| 0\);/.test(ss) &&
  /const tol2Q = String\(parseFloat\(payload\.biaya_toll_2\) \|\| 0\);/.test(ss));
check('S5b isDuplicate punya index biaya_bbm_2/biaya_toll_2',
  /const idxBbm2 = headers\.indexOf\('biaya_bbm_2'\);/.test(ss) &&
  /const idxTol2 = headers\.indexOf\('biaya_toll_2'\);/.test(ss));
check('S5c kondisi duplikat memakai sameBbm2 & sameTol2',
  /sameBbm && sameTol && sameBbm2 && sameTol2/.test(ss));
check('S5d kolom grup-2 belum ada -> dianggap sama (bukan duplikat)',
  /const sameBbm2 = \(idxBbm2 >= 0\)[\s\S]{0,120}: true;/.test(ss) &&
  /const sameTol2 = \(idxTol2 >= 0\)[\s\S]{0,120}: true;/.test(ss));
check('S5e sameKmAwal tetap dipakai apa adanya (global constraint)', 
  /if \(sameKmAwal && sameKmAkhir && sameLiter/.test(ss));

// S6: edit membaca & menulis 4 kolom baru.
check('S6a edit punya index header grup-2',
  /const idxCard2 = headers\.indexOf\('flazz_card_id_2'\);/.test(ss) &&
  /const idxBbm2 = headers\.indexOf\('biaya_bbm_2'\);/.test(ss) &&
  /const idxCardToll2 = headers\.indexOf\('flazz_card_id_toll_2'\);/.test(ss) &&
  /const idxToll2 = headers\.indexOf\('biaya_toll_2'\);/.test(ss));
check('S6b edit membaca nilai lama grup-2 dari baris',
  /const oldCard2 = \(idxCard2 > -1\) \? data\[rowIndex - 1\]\[idxCard2\] : '';/.test(ss) &&
  /const oldBbm2 = \(idxBbm2 > -1\)/.test(ss) &&
  /const oldTol2 = \(idxToll2 > -1\)/.test(ss));
check('S6c edit memakai parseEditAmount untuk nominal grup-2 (semantik sama dgn grup-1)',
  /const newBbm2 = parseEditAmount\(payload\.biaya_bbm_2, oldBbm2\);/.test(ss) &&
  /const newTol2 = parseEditAmount\(payload\.biaya_toll_2, oldTol2\);/.test(ss));
check('S6d edit memvalidasi kartu grup-2 yang diganti (exist + akses)',
  /Kartu tujuan grup-2 tidak ditemukan\./.test(ss) &&
  count(ss, /assertFlazzAccess\(userInfo, flazzCardBranch\(newCard2\)\)/g) === 1 &&
  count(ss, /assertFlazzAccess\(userInfo, flazzCardBranch\(newCardToll2\)\)/g) === 1);
check('S6e involvedCards edit pakai distinctFlazzCardsOf lama+baru',
  /const involvedCards = distinctFlazzCardsOf\(oldPayState\)/.test(ss) &&
  /\.concat\(distinctFlazzCardsOf\(newPayState\)\)/.test(ss));
check('S6f edit menulis 4 kolom baru guarded idx > -1',
  /if \(idxCard2 > -1\) sheet\.getRange\(rowIndex, idxCard2 \+ 1\)\.setValue\(newCard2 \|\| ''\);/.test(ss) &&
  /if \(idxBbm2 > -1\) sheet\.getRange\(rowIndex, idxBbm2 \+ 1\)\.setValue\(newBbm2 \|\| 0\);/.test(ss) &&
  /if \(idxCardToll2 > -1\) sheet\.getRange\(rowIndex, idxCardToll2 \+ 1\)\.setValue\(newCardToll2 \|\| ''\);/.test(ss) &&
  /if \(idxToll2 > -1\) sheet\.getRange\(rowIndex, idxToll2 \+ 1\)\.setValue\(newTol2 \|\| 0\);/.test(ss));
check('S6g payState lama & baru memuat field grup-2',
  /cardBbm2: String\(oldCard2 \|\| ''\), biayaBbm2: oldBbm2/.test(ss) &&
  /cardBbm2: newCard2, biayaBbm2: newBbm2/.test(ss));

// S7: hapus laporan ikut grup-2.
check('S7a delete punya index grup-2',
  /const idxCard2Del = headers\.indexOf\('flazz_card_id_2'\);/.test(ss) &&
  /const idxToll2Del = headers\.indexOf\('biaya_toll_2'\);/.test(ss));
check('S7b delete payState memuat grup-2 guarded',
  /if \(idxCard2Del > -1\) delPayState\.cardBbm2 =/.test(ss) &&
  /if \(idxToll2Del > -1\) delPayState\.biayaTol2 =/.test(ss));
check('S7c delete memakai distinctFlazzCardsOf',
  /const deletionCards = distinctFlazzCardsOf\(delPayState\);/.test(ss));

// S8: getRecentTransactions memetakan grup-2 lewat nama header.
check('S8a ada helper index kolom berbasis nama header',
  /function buildHeaderMap\(sheet\)/.test(ss) &&
  /function headerIdx\(map, name\)/.test(ss) &&
  /return -1;/.test(ss));
check('S8b helper tidak memakai cache global (tidak ada _cache)',
  !/_cache/.test(ss));
check('S8c hasil recent transaksi memuat 4 field grup-2',
  /biaya_bbm_2: headerNum\(hMap, row, 'biaya_bbm_2'\)/.test(ss) &&
  /flazz_card_id_2: typeof resolveCanonicalCardId/.test(ss) &&
  /flazz_card_id_toll_2: typeof resolveCanonicalCardId/.test(ss) &&
  /biaya_toll_2: headerNum\(hMap, row, 'biaya_toll_2'\)/.test(ss));
check('S8d recent transaksi juga mengekspos total_bbm & total_toll',
  /total_bbm: rowBbmTotal\(\{/.test(ss) && /total_toll: rowTolTotal\(\{/.test(ss));
check('S8e hMap dibangun sekali per panggilan',
  count(ss, /buildHeaderMap\(/g) === 2); // 1 definisi + 1 pemakaian

// S9: hygiene.
const cjk = ss.split(/\r?\n/).map((l, i) => [i + 1, l])
  .filter(([, l]) => /[\u3000-\u9fff\uff00-\uffef]/.test(l));
check('S9a SpreadsheetOps.js bebas karakter CJK (label ' + cjk.length + ')', cjk.length === 0);
if (cjk.length) cjk.forEach(([n, l]) => console.log('      baris ' + n + ': ' + l.trim()));
check('S9b keempat kolom grup-2 dikenal file ini',
  FOUR.every(c => ss.indexOf(c) > -1));

console.log('');
console.log('HASIL: ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
