const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ===== Predikat 1: autofill kendaraan hanya jika id ada di daftar opsi (JalurScript.html) =====
// Model dari perbaikan jalurAutofillFromDriver: hanya isi vehSel bila defVeh muncul di opsi.
function canAutofillVehicle(defVeh, optionValues) {
  if (!defVeh) return false;
  return optionValues.some(function (v) { return String(v) === String(defVeh); });
}

assert.strictEqual(canAutofillVehicle('V-1', ['V-1', 'V-2']), true, 'default ada di opsi -> autofill');
assert.strictEqual(canAutofillVehicle('V-9', ['V-1', 'V-2']), false, 'default TIDAK ada di opsi -> JANGAN autofill (kasus bug)');
assert.strictEqual(canAutofillVehicle('', ['V-1']), false, 'default kosong -> no-op');
assert.strictEqual(canAutofillVehicle('V-1', []), false, 'opsi kosong -> no-op');
assert.strictEqual(canAutofillVehicle('V-1', ['v-1']), false, 'beda case tetap TIDAK autofill (strict)');

// ===== Predikat 2: pesan assertOwnWarehouse ter-label (JalurOps + SpreadsheetOps) =====
function assertOwnWarehouse(cabangUser, candidate, label) {
  const cu = String(cabangUser || '');
  if (!cu || String(candidate || '') !== cu) {
    if (label) return 'Akses ditolak: ' + label + ' tidak berada di warehouse ' + cu + '.';
    return 'Akses ditolak: Anda hanya dapat mengelola data warehouse ' + cu + '.';
  }
  return 'OK';
}

assert.strictEqual(assertOwnWarehouse('CBY', 'TSM', 'kendaraan'), 'Akses ditolak: kendaraan tidak berada di warehouse CBY.', 'label kendaraan menunjuk elemen');
assert.strictEqual(assertOwnWarehouse('CBY', '', 'driver utama'), 'Akses ditolak: driver utama tidak berada di warehouse CBY.', 'driver kosong -> label driver utama');
assert.strictEqual(assertOwnWarehouse('CBY', 'CBY', 'kendaraan'), 'OK', 'data konsisten -> lolos');
assert.strictEqual(assertOwnWarehouse('CBY', 'TSM'), 'Akses ditolak: Anda hanya dapat mengelola data warehouse CBY.', 'tanpa label -> pesan lama TIDAK berubah');
assert.strictEqual(assertOwnWarehouse('CBY', '', 'kartu etoll'), 'Akses ditolak: kartu etoll tidak berada di warehouse CBY.', 'kartu etoll label');

// ===== Hitung deny untuk pesan/elemen pada saveJalur (model: urutan cek) =====
function saveJalurDeny(userCabang, vCabang, d1Cabang, d2Cabang, etollOk) {
  // urutan cek JalurOps.js:305-311 (label ditambahkan)
  if (assertOwnWarehouse(userCabang, vCabang, 'kendaraan') !== 'OK') return 'kendaraan';
  if (assertOwnWarehouse(userCabang, d1Cabang, 'driver utama') !== 'OK') return 'driver utama';
  if (d2Cabang && assertOwnWarehouse(userCabang, d2Cabang, 'driver kedua') !== 'OK') return 'driver kedua';
  if (!etollOk && assertOwnWarehouse(userCabang, 'X', 'kartu etoll') !== 'OK') return 'kartu etoll';
  return 'OK';
}
assert.strictEqual(saveJalurDeny('CBY', 'TSM', 'CBY', '', true), 'kendaraan', 'kendaraan asing -> deny di elemen kendaraan');
assert.strictEqual(saveJalurDeny('CBY', 'CBY', 'CBY', '', true), 'OK', 'semua konsisten -> simpan sukses');

// ===== Dual-card: kedua kartu wajib milik cabang sendiri =====
const dual = fs.readFileSync(path.join(__dirname, '..', 'src', 'JalurOps.js'), 'utf8');
assert.ok(dual.indexOf('assertFlazzAccess(userInfo, flazzCardBranch(r.etoll_card_id))') > -1,
  'saveJalur: kartu pertama di-scope assertFlazzAccess');
assert.ok(dual.indexOf('assertFlazzAccess(userInfo, flazzCardBranch(r.etoll_card_id_2))') > -1,
  'saveJalur: kartu kedua juga di-scope assertFlazzAccess');
assert.ok(dual.indexOf('flazz_card_id_2') > -1, 'JalurOps membaca kolom flazz_card_id_2');
assert.ok(dual.indexOf('recomputeJalurStatus') > -1, 'JalurOps mendefinisikan recomputeJalurStatus');
assert.ok(dual.indexOf('jalurFinalStatus') > -1, 'JalurOps memakai jalurFinalStatus');
assert.ok(dual.indexOf('oldCards.indexOf(c) === -1') > -1,
  'updateJalur memakai symmetric difference (kartu lama tidak dikembalikan bila masih dipakai)');
assert.ok(dual.indexOf('canonicalCardId(criteria.flazz_card_id)') > -1,
  'findJalurByCriteria mencocokkan kartu secara canonical');
assert.ok(dual.indexOf("canonicalCardId(data[i][colOf['flazz_card_id_2']])") > -1,
  'findJalurByCriteria: slot-2 ikut dicocokkan, kartu kedua dikenali');

// Gate mobilitas TIDAK boleh berubah rumusnya (regresi Silahlintas).
const gateHits = dual.match(/finalStatus = latest\.flazz_card_id \? 'SELESAI' : 'SUDAH_LAPORAN'/g) || [];
assert.strictEqual(gateHits.length, 2, 'gate "ada kartu -> SELESAI" tetap 2x, rumusnya tidak berubah');

console.log('jalur-autofill-guard-test: ALL PASS');