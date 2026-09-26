// ==========================================
// TEST untuk src/JalurStatus.js (logika murni status Jalur)
// Jalankan: node scratch/test-jalur-status.js
// Memuat PaymentLogic.js + JalurStatus.js ke sandbox yang sama (JalurStatus
// memakai canonicalCardId dari PaymentLogic).
// ==========================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
['PaymentLogic.js', 'JalurStatus.js'].forEach(function (name) {
  const p = path.join(__dirname, '..', 'src', name);
  if (!fs.existsSync(p)) {
    console.error('FAIL: src/' + name + ' belum ada (test ini seharusnya merah sebelum implementasi).');
    process.exit(1);
  }
  vm.runInNewContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: name });
});

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('PASS: ' + label); }
  else { failed++; console.log('FAIL: ' + label); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  ok(a === b, label + (a === b ? '' : (' | actual=' + a + ' expected=' + b)));
}

const fCards = sandbox.jalurCardIds;
const fFinal = sandbox.jalurFinalStatus;

// --- jalurCardIds ---
eq(fCards('A', ''), ['A'], 'jalurCardIds: hanya slot 1');
eq(fCards('', 'B'), ['B'], 'jalurCardIds: hanya slot 2');
eq(fCards('A', 'B'), ['A', 'B'], 'jalurCardIds: dua slot terisi');
eq(fCards('', ''), [], 'jalurCardIds: tidak ada kartu');
eq(fCards(null, undefined), [], 'jalurCardIds: null/undefined aman');
eq(fCards('A', 'A'), ['A'], 'jalurCardIds: kartu sama didedupe');
eq(fCards('  A  ', ' B '), ['A', 'B'], 'jalurCardIds: whitespace dipangkas');
eq(fCards('  ', null), [], 'jalurCardIds: whitespace-only dianggap kosong');

// --- Belum ada laporan ---
eq(fFinal('', ['A'], '2026-09-20', { A: '2026-09-20' }), 'BELUM_DIISI',
  'jalurFinalStatus: tanpa laporan -> BELUM_DIISI');
eq(fFinal('', [], '2026-09-20', {}), 'BELUM_DIISI', 'jalurFinalStatus: tanpa laporan & tanpa kartu -> BELUM_DIISI');

// --- Tanpa kartu: hanya bisa SUDAH_LAPORAN (identik dengan perilaku lama) ---
eq(fFinal('TRX1', [], '2026-09-20', {}), 'SUDAH_LAPORAN', 'jalurFinalStatus: jalur tanpa kartu -> SUDAH_LAPORAN');

// --- Satu kartu ---
eq(fFinal('TRX1', ['A'], '2026-09-20', {}), 'SUDAH_LAPORAN', '1 kartu: rekon belum ada -> SUDAH_LAPORAN');
eq(fFinal('TRX1', ['A'], '2026-09-20', { A: '2026-09-19' }), 'SUDAH_LAPORAN', '1 kartu: rekon sebelum tanggal jalur -> SUDAH_LAPORAN');
eq(fFinal('TRX1', ['A'], '2026-09-20', { A: '2026-09-20' }), 'SELESAI', '1 kartu: rekon pada tanggal jalur -> SELESAI');
eq(fFinal('TRX1', ['A'], '2026-09-20', { A: '2026-09-25' }), 'SELESAI', '1 kartu: rekon setelah tanggal jalur -> SELESAI');
eq(fFinal('TRX1', ['A'], '2026-09-20', { B: '2026-09-25' }), 'SUDAH_LAPORAN', '1 kartu: rekon kartu lain tidak dihitung');

// --- Dua kartu: WAJIB dua-duanya (inti fitur) ---
eq(fFinal('TRX1', ['A', 'B'], '2026-09-20', { A: '2026-09-25' }), 'SUDAH_LAPORAN', '2 kartu: hanya A rekon -> SUDAH_LAPORAN');
eq(fFinal('TRX1', ['A', 'B'], '2026-09-20', { B: '2026-09-25' }), 'SUDAH_LAPORAN', '2 kartu: hanya B rekon -> SUDAH_LAPORAN');
eq(fFinal('TRX1', ['A', 'B'], '2026-09-20', { A: '2026-09-25', B: '2026-09-25' }), 'SELESAI', '2 kartu: keduanya rekon -> SELESAI');
eq(fFinal('TRX1', ['A', 'B'], '2026-09-20', { A: '2026-09-25', B: '2026-09-19' }), 'SUDAH_LAPORAN', '2 kartu: rekon B sebelum tanggal jalur -> SUDAH_LAPORAN');
eq(fFinal('TRX1', ['A', 'B'], '2026-09-20', { A: '2026-09-25' }), 'SUDAH_LAPORAN', '2 kartu: rekon B hilang -> SUDAH_LAPORAN');

// --- Kunci rekon dinormalisasi (tanpa tanda hubung) ---
eq(fFinal('TRX1', ['FLZ-123'], '2026-09-20', { FLZ123: '2026-09-20' }), 'SELESAI', 'kunci rekon canonical (tanpa "-") tetap cocok');

// --- Tanggal dengan jam tidak boleh merusak perbandingan ---
eq(fFinal('TRX1', ['A'], '2026-09-20', { A: '2026-09-20 08:30:00' }), 'SELESAI', 'rekon dengan jam -> tetap SELESAI');
eq(fFinal('TRX1', ['A'], '2026-09-20T00:00:00.000Z', { A: '2026-09-20' }), 'SELESAI', 'tanggal jalur berformat lengkap -> tetap SELESAI');
eq(fFinal('TRX1', ['A'], '', { A: '2026-09-20' }), 'SELESAI', 'tanggal jalur kosong + ada rekon -> SELESAI');

console.log('==== HASIL: ' + passed + ' passed, ' + failed + ' failed ====');
process.exit(failed ? 1 : 0);
