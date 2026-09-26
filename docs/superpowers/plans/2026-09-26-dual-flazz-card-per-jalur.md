# Dual Flazz Card per Jalur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satu baris `Jalur_Pengiriman` dapat memegang dua kartu Flazz, satu laporan `Penggunaan_BBM` dapat mencatat pengeluaran yang dipecah ke dua kartu, dan status jalur menjadi `SELESAI` hanya setelah kedua kartu direkonsiliasi.

**Architecture:** Tambah kolom baru **append-kanan** di dua sheet (`Jalur_Pengiriman` +2, `Penggunaan_BBM` +4) sehingga tidak ada backfill dan indeks hardcoded lama tetap sah. `PaymentLogic.js` (murni, sudah ada harness test) digeneralisasi dari satu pasangan "grup pembayaran" menjadi daftar grup lewat `cardGroups()`. Logika penulisan status Jalur dipusatkan ke satu fungsi murni baru `JalurStatus.js` → `recomputeJalurStatus()` agar tidak ada lagi definisi "sudah selesai" yang berbeda antar tempat.

**Tech Stack:** Google Apps Script (server-side `.js` + templated `.html`), Google Sheets, Node.js v26 untuk test logika murni via `vm` sandbox.

## Global Constraints

- **Semua kolom baru di-append di ujung kanan header.** Index hardcoded `row[19]`, `row[27]`, `row[28]`, `row[30]`, `row[31]` di `Code.js` dan `SpreadsheetOps.js` TIDAK boleh berubah artinya.
- **Nol backfill.** Baris lama tidak boleh dimodifikasi. Semua kolom baru kosong pada baris lama.
- **Setiap penulisan kolom baru wajib dijaga** `if (idx['flazz_card_id_2'] !== undefined)` agar aman bila sheet belum dimigrasi.
- **Gate mobilitas tidak boleh berubah rumusnya:** `expected = (ada kartu ter-assign) ? 'SELESAI' : 'SUDAH_LAPORAN'`. Yang berubah hanya *kapan* `SELESAI` ditulis.
- **Grup-2 tidak punya kolom `metode_*_2`.** Metode diturunkan: kartu terisi → `FLAZZ`, nominal > 0 tanpa kartu → `TUNAI`.
- **Grup-2 memakai `foto_struk_bbm` / `foto_struk_toll` milik grup-1** (tidak ada kolom foto baru di v1).
- **Tidak ada slot kartu ke-3.** Batas keras 2 kartu per jalur.
- **`isDuplicateTransaction` tidak diperbaiki** — sudah mati sejak awal (`headers.indexOf('km_awal')` ≠ `km_awal_confirmed`), menghidupkannya berisiko memblokir laporan sah.
- **Komponen Apps Script tidak punya harness.** Verifikasi lewat `node` guard script yang membaca source, atau manual di Apps Script Editor. Hanya `PaymentLogic.js` dan `JalurStatus.js` yang murni dan bisa diuji.
- Commit message mengikuti gaya repo: `feat(scope):`, `fix(ops):`, `chore:`, `docs:`.
- Bump `PAGE_VER` **sekali** di Task 10, bukan per task.

## File Structure

| File | Tanggung jawab | Task |
|---|---|---|
| `src/DatabaseSetup.js` | Definisi header sheet | 1 |
| `src/PaymentLogic.js` | Logika murni: grup pembayaran, share per kartu, total baris | 2, 3 |
| `src/JalurStatus.js` | **Baru.** Logika murni: kartu ter-assign + status akhir jalur | 4 |
| `src/JalurOps.js` | CRUD Jalur 2 kartu, gate, penulis status | 5 |
| `src/FlazzOps.js` | Rekon, dashboard kartu, hapus transaksi | 6 |
| `src/SpreadsheetOps.js` | Simpan/edit/hapus laporan, balance gate, id handoff | 1, 7 |
| `src/SummaryOps.js` | Agregasi dashboard bulanan | 3 |
| `src/Code.js` | API wrapper + prefill laporan terakhir | 8 |
| `src/JalurPages.html`, `src/JalurScript.html` | Form + listing Jalur | 9 |
| `src/Index.html`, `src/js.html` | Form Input Laporan | 10 |
| `scratch/test-payment-logic.js` | Harness test PaymentLogic (58 test existing) | 2, 3 |
| `scratch/test-jalur-status.js` | **Baru.** Harness test JalurStatus | 4 |
| `scratch/test-schema.js` | **Baru.** Guard header sheet | 1 |
| `scratch/jalur-autofill-guard-test.js` | Guard scoping PIC | 5 |
| `scratch/test-jalur-release.js` | Guard releaseJalurReport | 5 |

**Rasio satu file satu tanggung jawab:** `JalurStatus.js` sengaja dipisah dari `JalurOps.js` supaya keputusan statusnya bisa diuji tanpa Apps Script — persis alasan `PaymentLogic.js` dipisah.

---

### Task 1: Skema sheet + id handoff Flazz_Usage unik

**Files:**
- Modify: `src/DatabaseSetup.js:44` (header `Jalur_Pengiriman`), `src/DatabaseSetup.js:31` (header `Penggunaan_BBM`)
- Modify: `src/SpreadsheetOps.js:433` (id `Flazz_Usage` bentrok)
- Create: `scratch/test-schema.js`

**Interfaces:**
- Consumes: tidak ada
- Produces: kolom `Jalur_Pengiriman.flazz_card_id_2`, `Jalur_Pengiriman.flazz_card_name_2`, `Penggunaan_BBM.flazz_card_id_2`, `Penggunaan_BBM.biaya_bbm_2`, `Penggunaan_BBM.flazz_card_id_toll_2`, `Penggunaan_BBM.biaya_toll_2`

- [ ] **Step 1: Tulis guard test header yang gagal**

Buat `scratch/test-schema.js`:

```js
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
ok(jalur.indexOf('flazz_card_id_2') === jalur.length - 2, 'Jalur_Peng-Etoll_2 adalah dua kolom terakhir');
ok(trx.indexOf('flazz_card_id_2') === trx.length - 4, 'Penggunaan_BBM: 4 kolom baru di ujung kanan');
ok(trx.indexOf('biaya_toll_2') === trx.length - 1, 'biaya_toll_2 adalah kolom terakhir');
// Indeks hardcoded yang harus tetap menunjuk kolom yang sama.
ok(trx[19] === 'biaya_bbm', 'trx[19] masih biaya_bbm');
ok(trx[27] === 'metode_pembayaran', 'trx[27] masih metode_pembayaran');
ok(trx[28] === 'flazz_card_id', 'trx[28] masih flazz_card_id');
ok(trx[30] === 'metode_toll', 'trx[30] masih metode_toll');
ok(trx[31] === 'flazz_card_id_toll', 'trx[31] masih flazz_card_id_toll');

console.log('==== HASIL: ' + passed + ' passed, ' + failed + ' failed ====');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Jalankan, harus gagal**

Run: `node scratch/test-schema.js`
Expected: 6 FAIL untuk kolom baru yang belum ada.

- [ ] **Step 3: Tambahkan kolom baru**

Di `src/DatabaseSetup.js`, ganti header `Penggunaan_BBM` (baris 31) sehingga empat kolom baru menjadi ujung:

```js
    { name: 'Penggunaan_BBM', headers: ['transaction_id', 'timestamp', 'tanggal', 'user_id', 'nama_pengguna', 'kode_cabang', 'vehicle_id', 'plat_nomor', 'foto_km_awal', 'ocr_km_awal', 'km_awal_confirmed', 'bar_awal', 'foto_km_akhir', 'ocr_km_akhir', 'km_akhir_confirmed', 'bar_akhir', 'km_tempuh', 'perubahan_bar', 'liter_bbm', 'biaya_bbm', 'foto_struk_bbm', 'biaya_toll', 'foto_struk_toll', 'km_per_liter', 'status', 'warning', 'nama_supir', 'metode_pembayaran', 'flazz_card_id', 'km_sumber', 'metode_toll', 'flazz_card_id_toll', 'flazz_card_id_2', 'biaya_bbm_2', 'flazz_card_id_toll_2', 'biaya_toll_2'] },
```

Dan header `Jalur_Pengiriman` (baris 44):

```js
    { name: 'Jalur_Pengiriman', headers: ['id', 'tanggal', 'driver_id', 'nama_driver', 'driver2_id', 'nama_driver2', 'vehicle_id', 'plat_nomor', 'nama_kendaraan', 'jenis_kendaraan', 'rute_tujuan', 'kode_cabang', 'flazz_card_id', 'flazz_card_name', 'flazz_card_id_2', 'flazz_card_name_2', 'created_by', 'created_at', 'updated_at', 'is_deleted', 'status', 'laporan_id'] }
```

Tidak ada perubahan lain di file ini — `setupDatabase()` sudah menambah kolom yang hilang di ujung kanan secara idempoten.

- [ ] **Step 4: Jalankan lagi, harus lulus**

Run: `node scratch/test-schema.js`
Expected: `==== HASIL: 12 passed, 0 failed ====`

- [ ] **Step 5: Perbaiki id `Flazz_Usage` yang bentrok**

`autoCreateFlazzUsage` dipanggil dua kali dalam milidetik yang sama saat satu jalur punya dua kartu, dan `id` hanya berbasis `getTime()`. Di `src/SpreadsheetOps.js`, tambahkan penghitung modul di atas fungsi tersebut (sekitar baris 399) dan pakai di baris 433:

```js
// Penghitung urut id Rw Usage. id berbasis getTime() saja bentrok bila dua
// hbUz8rzSx... 
```

Ganti dengan kode ini (letakkan tepat sebelum `function autoCreateFlazzUsage`):

```js
// Penghitung urut id Flazz_Usage. id berbasis getTime() saja bentrok bila dua
// penyerahan terjadi dalam milidetik yang sama — otomatis pada jalur 2 kartu.
var _flazzUsageSeq = 0;
function nextFlazzUsageId(baseMs) {
  return 'USE-' + baseMs + '-' + (++_flazzUsageSeq);
}
```

Lalu di dalam `autoCreateFlazzUsage`, ganti baris 433:

```js
  const id = nextFlazzUsageId(now.getTime());
```

- [ ] **Step 6: Verifikasi tidak ada regresi PaymentLogic**

Run: `node scratch/test-payment-logic.js`
Expected: `==== HASIL: 58 passed, 0 failed ====`

- [ ] **Step 7: Commit**

```bash
git add src/DatabaseSetup.js src/SpreadsheetOps.js scratch/test-schema.js
git commit -m "feat(schema): kolom kartu kedua per Jalur & grup-2 di Penggunaan_BBM"
```

---

### Task 2: `PaymentLogic` — grup pembayaran plural

**Files:**
- Modify: `src/PaymentLogic.js:19-96`
- Modify: `scratch/test-payment-logic.js` (append test, update 5 test `distinctFlazzCards`)

**Interfaces:**
- Consumes: kolom grup-2 dari Task 1
- Produces: `pickField(row, longKey, shortKey)` → `string|number`; `group2FromRow(row)` → grup|null; `cardGroups(row)` → `Array<{mBbm,cBbm,bBbm,mTol,cTol,bTol}>`; `distinctFlazzCardsOf(state)` → `string[]`; `flazzBbmShare/flazzTolShare/flazzShareForCard/isFlazzRowForCard/flazzEditDelta` sekarang iterate semua grup

**Penting:** `distinctFlazzCards(m, cb, mt, ct)` (4 argumen posisional) **diganti** oleh `distinctFlazzCardsOf(state)`. `flazzCardCharge` **dihapus**, pemanggilnya memakai `flazzShareForCard`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `scratch/test-payment-logic.js`, sebelum baris `console.log('==== HASIL: ...')`:

```js
// ===== Grup-2 (kartu kedua) =====
const fGroups = sandbox.cardGroups;
const fG2 = sandbox.group2FromRow;
const fCardsOf = sandbox.distinctFlazzCardsOf;

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

// --- Grup-2 tunai tidak-thiscn menjadi beban kartu ---
const G2_TUNAI = { metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100, biaya_toll_2: 90 };
eq(fShare(G2_TUNAI, 'A'), 100, 'grup-2 TUNAI tidak membebani kartu mana pun');
ok(!fRow(G2_TUNAI, 'A'), 'grup-2 TUNAI tidak membuat baris terkait kartu A');

// --- Id kartu tanpa '-' tetap cocok pada grup-2 ---
eq(fBbm({ biaya_bbm_2: 100, flazz_card_id_2: 'FLZ-123' }, 'FLZ123'), 100, 'grup-2: id kartu tanpa tanda hubung tetap cocok');

// --- distinctFlazzCardsOf ---
eq(fCardsOf({ metodeBbm: 'FLAZZ', cardBbm: 'A', metodeTol: 'FLAZZ', cardTol: 'A' }), ['A'], 'distinctFlazzCardsOf: kartu sama -> 1 entri');
eq(fCardsOf({ metodeBbm: 'FLAZZ', cardBbm: 'A', metodeTol: 'FLAZZ', cardTol: 'C' }), ['A', 'C'], 'distinctFlazzCardsOf: BBM A + tol C -> [A,C]');
eq(fCardsOf({ metodeBbm: 'TUNAI', cardBbm: '', metodeTol: 'TUNAI', cardTol: '' }), [], 'distinctFlazzCardsOf: tanpa flazz -> []');
eq(fCardsOf({ metode_pembayaran: 'FLAZZ', flazz_card_id: 'A', biaya_bbm: 100, biaya_bbm_2: 50, flazz_card_id_2: 'B' }), ['A', 'B'], 'distinctFlazzCardsOf: grup-2 ikut terdaftar');
eq(fCardsOf({ metode_pembayaran: 'TUNAI', flazz_card_id: '', biaya_toll_2: 90 }), [], 'distinctFlazzCardsOf: grup-2 TUNAI tidak terdaftar');

// --- flazzEditDelta memindahkan beban antar grup ---
const OLD_S = { metodeBbm: 'FLAZZ', cardBbm: 'A', biayaBbm: 300, metodeTol: 'TUNAI', cardTol: '', biayaTol: 0 };
const NEW_S = { metodeBbm: 'FLAZZ', cardBbm: 'A', biayaBbm: 100, metodeTol: 'FLAZZ', cardTol: 'A', biayaTol: 50,
                cardBbm2: 'B', biayaBbm2: 200, cardTol2: 'B', biayaTol2: 75 };
eq(fDelta(OLD_S, NEW_S, 'A'), 150, 'flazzEditDelta: kartu A naik 150 (300 -> 150)');
eq(fDelta(OLD_S, NEW_S, 'B'), -275, 'flazzEditDelta: kartu B turun 275 (0 -> 275)');
eq(fDelta(NEW_S, OLD_S, 'B'), 275, 'flazzEditDelta: pembalikan menghasilkan delta positif');
```

- [ ] **Step 2: Jalankan, harus gagal**

Run: `node scratch/test-payment-logic.js`
Expected: FAIL pada test `distinctFlazzCards` lama (5 test) karena `fCards` sudah tidak ada, dan FAIL pada test grup-2 baru.

- [ ] **Step 3: Hapus test lama `distinctFlazzCards`, pindahkan handle baru**

Di `scratch/test-payment-logic.js`, ganti baris:

```js
const fCards = sandbox.distinctFlazzCards;
```

menjadi:

```js
const fCardsOf = sandbox.distinctFlazzCardsOf;
```

Lalu ganti blok 5 test lama (baris 65-69):

```js
// Daftar kartu unik yang terpakai
eq(fCards('FLAZZ', 'A', 'FLAZZ', 'A'), ['A'], 'distinctFlazzCards: kartu sama -> 1 entri');
eq(fCards('FLAZZ', 'A', 'FLAZZ', 'C'), ['A', 'C'], 'distinctFlazzCards: BBM A + tol C -> [A,C]');
eq(fCards('FLAZZ', 'A', 'TUNAI', ''), ['A'], 'distinctFlazzCards: hanya BBM flazz -> [A]');
eq(fCards('TUNAI', '', 'FLAZZ', 'C'), ['C'], 'distinctFlazzCards: hanya tol flazz -> [C]');
eq(fCards('TUNAI', '', 'TUNAI', ''), [], 'distinctFlazzCards: tanpa flazz -> []');
```

menjadi:

```js
// Daftar kartu unik yang terpakai
eq(fCardsOf({ metodeBbm: 'FLAZZ', cardBbm: 'A', metodeTol: 'FLAZZ', cardTol: 'A' }), ['A'], 'distinctFlazzCardsOf: kartu sama -> 1 entri');
eq(fCardsOf({ metodeBbm: 'FLAZZ', cardBbm: 'A', metodeTol: 'FLAZZ', cardTol: 'C' }), ['A', 'C'], 'distinctFlazzCardsOf: BBM A + tol C -> [A,C]');
eq(fCardsOf({ metodeBbm: 'FLAZZ', cardBbm: 'A', metodeTol: 'TUNAI', cardTol: '' }), ['A'], 'distinctFlazzCardsOf: hanya BBM flazz -> [A]');
eq(fCardsOf({ metodeBbm: 'TUNAI', cardBbm: '', metodeTol: 'FLAZZ', cardTol: 'C' }), ['C'], 'distinctFlazzCardsOf: hanya tol flazz -> [C]');
eq(fCardsOf({ metodeBbm: 'TUNAI', cardBbm: '', metodeTol: 'TUNAI', cardTol: '' }), [], 'distinctFlazzCardsOf: tanpa flazz -> []');
```

- [ ] **Step 4: Implementasikan helper baru di `PaymentLogic.js`**

Tambahkan setelah `cardFields` (setelah baris 29), sebelum `flazzBbmShare`:

```js
// Ambil nilai pertama yang terdefinisi dari kunci panjang (nama kolom sheet)
// atau kunci pendek (state object milik SpreadsheetOps/FlazzOps).
function pickField(row, longKey, shortKey) {
  if (!row) return '';
  if (row[longKey] !== undefined && row[longKey] !== null) return row[longKey];
  if (shortKey && row[shortKey] !== undefined && row[shortKey] !== null) return row[shortKey];
  return '';
}

function numOf(v) { return parseFloat(v) || 0; }
function strOf(v) { return String(v === undefined || v === null ? '' : v).trim(); }

// Grup-2: metode DITURUNKAN (bukan kolom terpisah) — kartu terisi -> FLAZZ,
// nominal > 0 tanpa kartu -> TUNAI. Return null bila keempat kolom kosong/0
// sehingga baris lama (yang tidak punya kolom ini) tidak ikut tersentuh.
function group2FromRow(row) {
  if (!row) return null;
  const cBbm = strOf(pickField(row, 'flazz_card_id_2', 'cardBbm2'));
  const cTol = strOf(pickField(row, 'flazz_card_id_toll_2', 'cardTol2'));
  const bBbm = numOf(pickField(row, 'biaya_bbm_2', 'biayaBbm2'));
  const bTol = numOf(pickField(row, 'biaya_toll_2', 'biayaTol2'));
  const hasBbm = cBbm !== '' || bBbm > 0;
  const hasTol = cTol !== '' || bTol > 0;
  if (!hasBbm && !hasTol) return null;
  return {
    mBbm: hasBbm ? (cBbm !== '' ? 'FLAZZ' : 'TUNAI') : '',
    cBbm: cBbm,
    bBbm: bBbm,
    mTol: hasTol ? (cTol !== '' ? 'FLAZZ' : 'TUNAI') : '',
    cTol: cTol,
    bTol: bTol
  };
}

// Daftar grup pembayaran pada satu baris laporan. Grup-1 selalu ada (back-compat)
// dan hanya itu yang ada untuk baris lama; grup-2 hanya muncul bila terisi.
function cardGroups(row) {
  const f = cardFields(row);
  const tollMethod = resolveTollMethod(f.mTol, f.mBbm, f.cTol);
  const groups = [{
    mBbm: f.mBbm,
    cBbm: f.cBbm,
    bBbm: numOf(f.bBbm),
    mTol: tollMethod,
    cTol: resolveTollCard(f.cTol, tollMethod, f.mBbm, f.cBbm),
    bTol: numOf(f.bTol)
  }];
  const g2 = group2FromRow(row);
  if (g2) groups.push(g2);
  return groups;
}
```

- [ ] **Step 5: Rewrite fungsi share/match agar iterate `cardGroups`**

Ganti `flazzBbmShare` (baris 32-39):

```js
// Total bagian BBM (dalam Rupiah) sebuah baris laporan yang dibayar dengan kartu
// cardId — dijumlahkan dari SEMUA grup, sehingga satu baris dapat membebani dua kartu.
function flazzBbmShare(row, cardId) {
  if (!row || cardId == null) return 0;
  let total = 0;
  cardGroups(row).forEach(function (g) {
    if (String(g.mBbm) !== 'FLAZZ') return;
    if (canonicalCardId(g.cBbm) !== canonicalCardId(cardId)) return;
    total += numOf(g.bBbm);
  });
  return total;
}
```

Ganti `flazzTolShare` (baris 41-48):

```js
// Total bagian tol (dalam Rupiah) sebuah baris laporan yang dibayar dengan kartu
// cardId — dijumlahkan dari SEMUA grup.
function flazzTolShare(row, cardId) {
  if (!row || cardId == null) return 0;
  let total = 0;
  cardGroups(row).forEach(function (g) {
    if (String(g.mTol) !== 'FLAZZ') return;
    if (canonicalCardId(g.cTol) !== canonicalCardId(cardId)) return;
    total += numOf(g.bTol);
  });
  return total;
}
```

Ganti `isFlazzRowForCard` (baris 55-61):

```js
// Apakah baris laporan melibatkan kartu ini (bayar BBM ataupun tol dengan Flazz),
// di grup mana pun.
function isFlazzRowForCard(row, cardId) {
  if (!row || cardId == null) return false;
  return cardGroups(row).some(function (g) {
    const bbm = String(g.mBbm) === 'FLAZZ' && canonicalCardId(g.cBbm) === canonicalCardId(cardId);
    const tol = String(g.mTol) === 'FLAZZ' && canonicalCardId(g.cTol) === canonicalCardId(cardId);
    return bbm || tol;
  });
}
```

- [ ] **Step 6: Ganti `distinctFlazzCards` dan hapus `flazzCardCharge`**

Ganti `distinctFlazzCards` (baris 64-73):

```js
// Daftar kartu unik yang terpakai saat menyimpan satu transaksi —/register dari
// semua grup (BBM dan/atau tol ber-Flazz, grup-1 maupun grup-2).
function distinctFlazzCardsOf(state) {
  const out = [];
  function push(card) {
    const c = strOf(card);
    if (c && out.indexOf(c) === -1) out.push(c);
  }
  cardGroups(state).forEach(function (g) {
    if (String(g.mBbm) === 'FLAZZ') push(g.cBbm);
    if (String(g.mTol) === 'FLAZZ') push(g.cTol);
  });
  return out;
}
```

Ganti `flazzCardCharge` (baris 77-88) dengan alias, agar pemanggil lama tidak rusak:

```js
// Total muatan sebuah kartu pada suatu keadaan pembayaran (BBM + tol dari semua grup).
// Alias ke flazzShareForCard.
function flazzCardCharge(state, cardId) {
  return flazzShareForCard(state, cardId);
}
```

`flazzEditDelta` (baris 91-94) tidak berubah.

- [ ] **Step 7: Jalankan test**

Run: `node scratch/test-payment-logic.js`
Expected: `==== HASIL: 100+ passed, 0 failed ====` (58 lama + 5 diganti + ~38 baru; yang penting `0 failed`)

- [ ] **Step 8: Commit**

```bash
git add src/PaymentLogic.js scratch/test-payment-logic.js
git commit -m "feat(flazz): PaymentLogic iterates N grup pembayaran (kartu kedua)"
```

---

### Task 3: Total baris laporan untuk dashboard bulanan

**Files:**
- Modify: `src/PaymentLogic.js` (tambah 2 helper setelah `flazzShareForCard`)
- Modify: `src/SummaryOps.js:71-82`
- Modify: `scratch/test-payment-logic.js`

**Interfaces:**
- Consumes: `cardFields`, `pickField`, `numOf` dari Task 2
- Produces: `rowBbmTotal(row)` → `number`, `rowTolTotal(row)` → `number`

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan sebelum `console.log('==== HASIL: ...')` di `scratch/test-payment-logic.js`:

```js
// ===== Total baris untuk dashboard bulanan (grup-1 + grup-2) =====
const fBbmTotal = sandbox.rowBbmTotal;
const fTolTotal = sandbox.rowTolTotal;
eq(fBbmTotal({ biaya_bbm: 300 }), 300, 'rowBbmTotal: baris lama -> 300');
eq(fBbmTotal({}), 0, 'rowBbmTotal: baris kosong -> 0');
eq(fBbmTotal({ biaya_bbm: 300, biaya_bbm_2: 200 }), 500, 'rowBbmTotal: grup-1 + grup-2 = 500');
eq(fBbmTotal({ biayaBbm: 300, biayaBbm2: 200 }), 500, 'rowBbmTotal: kunci pendek juga dijumlahkan');
eq(fTolTotal({ biaya_toll: 50 }), 50, 'rowTolTotal: baris lama -> 50');
eq(fTolTotal({ biaya_toll: 50, biaya_toll_2: 75 }), 125, 'rowTolTotal: grup-1 + grup-2 = 125');
eq(fTolTotal({}), 0, 'rowTolTotal: baris kosong -> 0');
```

- [ ] **Step 2: Jalankan, harus gagal**

Run: `node scratch/test-payment-logic.js`
Expected: `rowBbmTotal: ... FAIL` — fungsi belum ada.

- [ ] **Step 3: Implementasikan helper**

Di `src/PaymentLogic.js`, tambahkan setelah `flazzShareForCard` (setelah baris 52):

```js
// Total nominal BBM pada satu baris laporan (grup-1 + grup-2). Dipakai agregasi
// dashboard bulanan agar pengeluaran kartu kedua tidak terlewat.
function rowBbmTotal(row) {
  const f = cardFields(row);
  return numOf(f.bBbm) + numOf(pickField(row, 'biaya_bbm_2', 'biayaBbm2'));
}

// Total nominal tol pada satu baris laporan (grup-1 + grup-2).
function rowTolTotal(row) {
  const f = cardFields(row);
  return numOf(f.bTol) + numOf(pickField(row, 'biaya_toll_2', 'biayaTol2'));
}
```

- [ ] **Step 4: Jalankan test, harus lulus**

Run: `node scratch/test-payment-logic.js`
Expected: `0 failed`

- [ ] **Step 5: Pakai di `recomputeMonthlySummary`**

Di `src/SummaryOps.js`, ganti blok baris 70-82:

```js
  const h = sheetHeaders(sheet);
  const ci = colIndex(h, ['kode_cabang','tanggal','liter_bbm','biaya_bbm','biaya_toll']);
  const rows = readRowsCols(sheet, [ci.kode_cabang, ci.tanggal, ci.liter_bbm, ci.biaya_bbm, ci.biaya_toll]);

  let trx = 0, liter = 0, biaya = 0, toll = 0;
  for (const r of rows) {
    if (String(r[0]) !== String(cabang)) continue;
    if (periodKey(r[1]) !== periode) continue;
    trx++;
    liter += parseFloat(r[2]) || 0;
    biaya += parseFloat(r[3]) || 0;
    toll += parseFloat(r[4]) || 0;
  }
```

dengan:

```js
  const h = sheetHeaders(sheet);
  // Kolom grup-2 ikut dijumlahkan: tanpa ini pengeluaran kartu kedua tidak muncul
  // di dashboard bulanan (total bawah secara diam-diam).
  const wantCols = ['kode_cabang','tanggal','liter_bbm','biaya_bbm','biaya_toll'];
  wantCols.push('flazz_card_id_2'); wantCols.push('biaya_bbm_2');
  wantCols.push('flazz_card_id_toll_2'); wantCols.push('biaya_toll_2');
  const ci = colIndex(h, wantCols);
  const idxBbm2 = ci.biaya_bbm_2;
  const idxTol2 = ci.biaya_toll_2;
  const idxCard2 = ci.flazz_card_id_2;
  const idxCardTol2 = ci.flazz_card_id_toll_2;
  const rows = readRowsCols(sheet, wantCols.map(function (nm) { return ci[nm]; }));

  let trx = 0, liter = 0, biaya = 0, toll = 0;
  for (const r of rows) {
    if (String(r[0]) !== String(cabang)) continue;
    if (periodKey(r[1]) !== periode) continue;
    trx++;
    liter += parseFloat(r[2]) || 0;
    const rowObj = { biaya_bbm: r[3], biaya_toll: r[4] };
    if (idxBbm2 > -1) rowObj.biaya_bbm_2 = r[idxBbm2];
    if (idxCard2 > -1) rowObj.flazz_card_id_2 = r[idxCard2];
    if (idxTol2 > -1) rowObj.biaya_toll_2 = r[idxTol2];
    if (idxCardTol2 > -1) rowObj.flazz_card_id_toll_2 = r[idxCardTol2];
    biaya += rowBbmTotal(rowObj);
    toll += rowTolTotal(rowObj);
  }
```

Pastikan `colIndex` mengembalikan indeks berbasis header yang benar (cek implementasi `colIndex` di `SummaryOps.js` dan pastikan ia mengembalikan `-1`/index yang valid untuk header yang tidak ada — bila tidak, gunakan `h.indexOf(nm)` langsung).

- [ ] **Step 6: Verifikasi `colIndex`**

Run: `Select-String -Path src\SummaryOps.js -Pattern "function colIndex" -Context 0,10`
Expected: implementasi yang mengembalikan indeks header, dan nilai `-1` bila header tidak ada. Bila mengembalikan `undefined`, ganti semua `ci.x > -1` menjadi `ci.x !== undefined && ci.x >= 0`.

- [ ] **Step 7: Commit**

```bash
git add src/PaymentLogic.js src/SummaryOps.js scratch/test-payment-logic.js
git commit -m "feat(dashboard): hitung grup-2 dalam ringkasan bulanan"
```

---

### Task 4: `JalurStatus.js` — logika murni status jalur

**Files:**
- Create: `src/JalurStatus.js`
- Create: `scratch/test-jalur-status.js`

**Interfaces:**
- Consumes: `canonicalCardId` dari `PaymentLogic.js` (global bersama di Apps Script; di test dimuat ke sandbox yang sama)
- Produces: `jalurCardIds(flazzCardId, flazzCardId2)` → `string[]`; `jalurFinalStatus(laporanId, cardIds, tanggalJalur, reconMaxTglByCard)` → `'BELUM_DIISI'|'SUDAH_LAPORAN'|'SELESAI'`

**Kontrak `reconMaxTglByCard`:** objek yang kuncinya adalah `canonicalCardId(card_id)` dan nilainya tanggal rekon terbaru format `yyyy-MM-dd`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `scratch/test-jalur-status.js`:

```js
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

// --- Belum ada laporan ---
eq(fFinal('', ['A'], '2026-09-20', { A: '2026-09-20' }), 'BELUM_DI_FILI'.replace('_FILI', 'ISI'),
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

// --- Kunci rekon dinormalisasi (tanpa tanda hubung) ---
eq(fFinal('TRX1', ['FLZ-123'], '2026-09-20', { FLZ123: '2026-09-20' }), 'SELESAI', 'kunci rekon canonical (tanpa "-") tetap cocok');

// --- Tanggal dengan jam tidak boleh merusak perbandingan ---
eq(fFinal('TRX1', ['A'], '2026-09-20', { A: '2026-09-20 08:30:00' }), 'SELESAI', 'rekon dengan jam -> tetap SELESAI');
eq(fFinal('TRX1', ['A'], '2026-09-20T00:00:00.000Z', { A: '2026-09-20' }), 'SELESAI', 'tanggal jalur berformat lengkap -> tetap SELESAI');

console.log('==== HASIL: ' + passed + ' passed, ' + failed + ' failed ====');
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Jalankan, harus gagal**

Run: `node scratch/test-jalur-status.js`
Expected: `FAIL: src/JalurStatus.js belum ada (test ini seharusnya merah sebelum implementasi).`

- [ ] **Step 3: Buat `src/JalurStatus.js`**

```js
// ==========================================
// JalurStatus.js
// Logika MURNI status Jalur Pengiriman (tanpa API Apps Script).
// Dipakai JalurOps.js & FlazzOps.js sebagai SATU sumber kebenaran penulisan
// status jalur, supaya definisi "sudah selesai" tidak berbeda antar tempat.
// Dapat di-test lokal: node scratch/test-jalur-status.js
// ==========================================

// Daftar id kartu etoll yang ter-assign pada satu baris Jalur_Pengiriman.
// Slot kosong diabaikan; id yang sama tidak dihitung dua kali.
function jalurCardIds(flazzCardId, flazzCardId2) {
  const out = [];
  [flazzCardId, flazzCardId2].forEach(function (c) {
    const s = String(c === undefined || c === null ? '' : c).trim();
    if (s && out.indexOf(s) === -1) out.push(s);
  });
  return out;
}

// Status akhir sebuah jalur.
//   belum ada laporan                       -> BELUM_DIISI
//   ada >=1 kartu dan SEMUA kartu itu sudah
//     direkon (tanggal rekon >= tanggal jalur) -> SELESAI
//   selainnya                                -> SUDAH_LAPORAN
//
// Jalur tanpa kartu menghasilkan SUDAH_LAPORAN — sama seperti sebelum fitur ini.
// reconMaxTglByCard: { canonicalCardId(card_id): 'yyyy-MM-dd' } tanggal rekon terbaru.
function jalurFinalStatus(laporanId, cardIds, tanggalJalur, reconMaxTglByCard) {
  if (!String(laporanId === undefined || laporanId === null ? '' : laporanId).trim()) return 'BELUM_DIISI';
  const cards = (cardIds || []).filter(function (c) { return String(c || '').trim() !== ''; });
  if (!cards.length) return 'SUDAH_LAPORAN';
  const tgl = String(tanggalJalur || '').substring(0, 10);
  const map = reconMaxTglByCard || {};
  for (let i = 0; i < cards.length; i++) {
    const r = String(map[canonicalCardId(cards[i])] || '').substring(0, 10);
    if (!r || r < tgl) return 'SUDAH_LAPORAN';
  }
  return 'SELESAI';
}
```

- [ ] **Step 4: Jalankan test, harus lulus**

Run: `node scratch/test-jalur-status.js`
Expected: `==== HASIL: 25 passed, 0 failed ====`

- [ ] **Step 5: Rapikan satu baris di test**

Di `scratch/test-jalur-status.js`, ganti baris yang sengaja ditulis bercabang:

```js
eq(fFinal('', ['A'], '2026-09-20', { A: '2026-09-20' }), 'BELUM_DI_FILI'.replace('_FILI', 'ISI'),
  'jalurFinalStatus: tanpa laporan -> BELUM_DIISI');
```

menjadi:

```js
eq(fFinal('', ['A'], '2026-09-20', { A: '2026-09-20' }), 'BELUM_DIISI',
  'jalurFinalStatus: tanpa laporan -> BELUM_DIISI');
```

- [ ] **Step 6: Jalankan lagi**

Run: `node scratch/test-jalur-status.js`
Expected: `==== HASIL: 25 passed, 0 failed ====`

- [ ] **Step 7: Commit**

```bash
git add src/JalurStatus.js scratch/test-jalur-status.js
git commit -m "feat(jalur): logika murni status jalur agregat semua kartu"
```

---

### Task 5: `JalurOps.js` — dua kartu per jalur + penulis status tunggal

**Files:**
- Modify: `src/JalurOps.js:6-855`
- Modify: `scratch/jalur-autofill-guard-test.js`
- Modify: `scratch/test-jalur-release.js`

**Interfaces:**
- Consumes: `jalurCardIds`, `jalurFinalStatus` (Task 4); `canonicalCardId` (Task 2)
- Produces: `recomputeJalurStatus(jalurId, knownRowIndex)` → `string|null`; `jalurAssignedCards(row, idx)` → `string[]`; `getJalurDriversForDate` mengembalikan `flazz_card_id_2` + `flazz_card_name_2`

- [ ] **Step 1: Tulis guard test yang gagal**

Tambahkan di akhir `scratch/jalur-autofill-guard-test.js`:

```js
// ===== Dual-card: kedua kartu wajib milik cabang sendiri =====
var dual = fs.readFileSync(path.join(__dirname, '..', 'src', 'JalurOps.js'), 'utf8');
ok(dual.indexOf("assertFlazzAccess(userInfo, flazzCardBranch(r.etoll_card_id_2))") > -1,
  'saveJalur: kartu kedua juga di-scope assertFlazzAccess');
ok(dual.indexOf('flazz_card_id_2') > -1, 'JalurOps membaca kolom flazz_card_id_2');
ok(dual.indexOf('recomputeJalurStatus') > -1, 'JalurOps mendefinisikan recomputeJalurStatus');
ok(dual.indexOf('jalurFinalStatus') > -1, 'JalurOps memakai jalurFinalStatus');
ok(dual.indexOf("oldCards.indexOf(c) === -1") > -1,
  'updateJalur memakai symmetric difference (kartu lama tidak dikembalikan bila masih dipakai)');
ok(dual.indexOf('canonicalCardId(criteria.flazz_card_id)') > -1,
  'findJalurByCriteria mencocokkan kartu secara canonical');
```

- [ ] **Step 2: Jalankan, harus gagal**

Run: `node scratch/jalur-autofill-guard-test.js`
Expected: FAIL pada 5 guard baru.

- [ ] **Step 3: `findJalurRow` — baca kolom baru**

Di `src/JalurOps.js` baris 39, ubah `want`:

```js
  const want = ['id','tanggal','status','laporan_id','updated_at','vehicle_id','nama_driver','driver_id','rute_tujuan','flazz_card_id','flazz_card_id_2','kode_cabang','plat_nomor'].filter(function(k) {
```

- [ ] **Step 4: `findJalurByCriteria` — cocokkan kedua slot**

Tambahkan `'flazz_card_id_2'` ke `want` (baris 111):

```js
  const want = ['is_deleted','tanggal','vehicle_id','nama_driver','kode_cabang','flazz_card_id','flazz_card_id_2','id','status','plat_nomor'].filter(function(k) {
```

Ganti blok pencocokan kartu (baris 137-140):

```js
      if (match && criteria.flazz_card_id) {
        const wantCard = canonicalCardId(criteria.flazz_card_id);
        const v1 = (colOf['flazz_card_id'] !== undefined) ? canonicalCardId(data[i][colOf['flazz_card_id']]) : '';
        const v2 = (colOf['flazz_card_id_2'] !== undefined) ? canonicalCardId(data[i][colOf['flazz_card_id_2']]) : '';
        if (v1 !== wantCard && v2 !== wantCard) match = false;
      }
```

Dan ganti assignment `best` (baris 141-152) dengan versi yang memilih baris terbaru:

```js
      if (match) {
        const cand = {
          id: data[i][colOf['id']],
          status: (colOf['status'] !== undefined) ? String(data[i][colOf['status']] || 'BELUM_DIISI') : 'BELUM_DIISI',
          flazz_card_id: (colOf['flazz_card_id'] !== undefined) ? String(data[i][colOf['flazz_card_id']] || '') : '',
          flazz_card_id_2: (colOf['flazz_card_id_2'] !== undefined) ? String(data[i][colOf['flazz_card_id_2']] || '') : '',
          tanggalJalur: rowTgl,
          kode_cabang: (colOf['kode_cabang'] !== undefined) ? String(data[i][colOf['kode_cabang']] || '') : '',
          nama_driver: (colOf['nama_driver'] !== undefined) ? String(data[i][colOf['nama_driver']] || '') : '',
          plat_nomor: (colOf['plat_nomor'] !== undefined) ? String(data[i][colOf['plat_nomor']] || '') : '',
          rowIndex: i + 2
        };
        // Kartu bisa dipakai di banyak hari; pilih jalur TERBARU yang memakainya,
        // bukan baris terakhir yang kebetulan cocok.
        if (!best
            || cand.tanggalJalur > best.tanggalJalur
            || (cand.tanggalJalur === best.tanggalJalur && cand.rowIndex > best.rowIndex)) {
          best = cand;
        }
      }
```

- [ ] **Step 5: Tambahkan helper kartu & map rekon**

Tambahkan setelah `jalurColIdx` (setelah baris 35):

```js
// Kartu etoll yang ter-assign pada satu baris Jalur_Pengiriman (tanpa duplikat).
function jalurAssignedCards(row, idx) {
  return jalurCardIds(
    (idx['flazz_card_id'] !== undefined) ? row[idx['flazz_card_id']] : '',
    (idx['flazz_card_id_2'] !== undefined) ? row[idx['flazz_card_id_2']] : ''
  );
}

// Tanggal rekon terbaru per kartu (kunci canonical). Dibaca sekali per pemanggilan
// supaya penulisan status jalur selalu melihat data rekon terkini.
function reconMaxTglByCard() {
  const out = {};
  const ss = getDB();
  const reconSheet = ss.getSheetByName('Flazz_Reconciliation');
  if (!reconSheet || reconSheet.getLastRow() <= 1) return out;
  const data = getSheetSnapshot('Flazz_Reconciliation');
  const h = data[0];
  const cCard = h.indexOf('card_id');
  const cDate = h.indexOf('date');
  const cDel = h.indexOf('is_deleted');
  for (let i = 1; i < data.length; i++) {
    if (cDel > -1 && String(data[i][cDel]) === '1') continue;
    const dStr = String(data[i][cDate] || '').substring(0, 10);
    const key = canonicalCardId(data[i][cCard]);
    if (!key || !dStr) continue;
    if (!out[key] || dStr > out[key]) out[key] = dStr;
  }
  return out;
}

// SATU sumber kebenaran penulisan status jalur (D3). Dipakai setelah rekon,
// setelah hapus rekon, dan oleh backfillJalurStatus. Menentukan SELESAI hanya
// bila SEMUA kartu yang ter-assign pada jalur sudah direkonsiliasi.
function recomputeJalurStatus(jalurId, knownRowIndex) {
  try {
    const sheet = jalurSheet();
    if (!sheet || sheet.getLastRow() <= 1) return null;
    const found = knownRowIndex
      ? { rowIndex: knownRowIndex, idx: jalurColIdx(sheet) }
      : findJalurRow(sheet, jalurId);
    if (!found || found.idx['status'] === undefined) return null;
    const want = ['laporan_id', 'tanggal', 'flazz_card_id', 'flazz_card_id_2'].filter(function (k) {
      return found.idx[k] !== undefined;
    });
    const colOf = {};
    want.forEach(function (k, pos) { colOf[k] = pos; });
    const data = readRowsCols(sheet, want.map(function (k) { return found.idx[k]; }));
    const row = data[0] || [];
    if (colOf['laporan_id'] === undefined) return null;

    const tglRaw = colOf['tanggal'] !== undefined ? row[colOf['tanggal']] : '';
    const tgl = (tglRaw instanceof Date)
      ? Utilities.formatDate(tglRaw, getDB().getSpreadsheetTimeZone(), 'yyyy-MM-dd')
      : String(tglRaw || '').substring(0, 10);

    const cards = jalurAssignedCards(row, colOf);
    const newStatus = jalurFinalStatus(row[colOf['laporan_id']], cards, tgl, reconMaxTglByCard());
    const current = sheet.getRange(found.rowIndex, found.idx['status'] + 1).getValue();
    if (String(current) !== newStatus) {
      sheet.getRange(found.rowIndex, found.idx['status'] + 1).setValue(newStatus);
      if (found.idx['updated_at'] !== undefined) {
        sheet.getRange(found.rowIndex, found.idx['updated_at'] + 1).setValue(new Date());
      }
      invalidateSheetSnapshot('Jalur_Pengiriman');
    }
    return newStatus;
  } catch (e) {
    Logger.log('recomputeJalurStatus error: ' + e.toString());
    return null;
  }
}
```

- [ ] **Step 6: `saveJalur` — validasi & tulis dua kartu**

Ganti blok validasi kartu (baris 416-418):

```js
      const etollIds = jalurCardIds(r.etoll_card_id, r.etoll_card_id_2);
      if (r.etoll_card_id && r.etoll_card_id_2
          && canonicalCardId(r.etoll_card_id) === canonicalCardId(r.etoll_card_id_2)) {
        throw new Error('Kartu etoll ke-2 harus berbeda dari kartu etoll ke-1.');
      }
      for (let ci = 0; ci < etollIds.length; ci++) {
        const cid = etollIds[ci];
        if (typeof findFlazzCardBalance === 'function' && !findFlazzCardBalance(cid)) {
          throw new Error('Kartu etoll "' + (ci === 0 ? (r.etoll_card_name || cid) : (r.etoll_card_name_2 || cid)) + '" tidak ditemukan.');
        }
        assertFlazzAccess(userInfo, flazzCardBranch(cid));
      }
```

Ganti penulisan kolom etoll (baris 434-437):

```js
      if (r.etoll_card_id && idx['flazz_card_id'] !== undefined) {
        row[idx['flazz_card_id']] = r.etoll_card_id;
        if (idx['flazz_card_name'] !== undefined) row[idx['flazz_card_name']] = r.etoll_card_name || '';
      }
      if (r.etoll_card_id_2 && idx['flazz_card_id_2'] !== undefined) {
        row[idx['flazz_card_id_2']] = r.etoll_card_id_2;
        if (idx['flazz_card_name_2'] !== undefined) row[idx['flazz_card_name_2']] = r.etoll_card_name_2 || '';
      }
```

Ganti push `cardHandoffs` (baris 451-453):

```js
      const handoffs = [
        { cardId: r.etoll_card_id, cardName: r.etoll_card_name || '' },
        { cardId: r.etoll_card_id_2, cardName: r.etoll_card_name_2 || '' }
      ];
      handoffs.forEach(function (h) {
        if (!h.cardId) return;
        cardHandoffs.push({ jalurId: jalurId, etollCardId: h.cardId, etollCardName: h.cardName, namaDriver: namaDriver, driverId: r.driver_id, vid: vid });
      });
```

- [ ] **Step 7: `updateJalur` — symmetric difference dua kartu**

Ganti baris 491-492:

```js
    const oldCards = jalurCardIds(
      (idx['flazz_card_id'] !== undefined) ? found.row[idx['flazz_card_id']] : '',
      (idx['flazz_card_id_2'] !== undefined) ? found.row[idx['flazz_card_id_2']] : ''
    );
    const newCards = jalurCardIds(data.etoll_card_id, data.etoll_card_id_2);
    const oldCard = oldCards[0] || '';
    const newCard = newCards[0] || '';
```

Ganti validasi kartu baru (baris 507-509):

```js
    if (data.etoll_card_id && data.etoll_card_id_2
        && canonicalCardId(data.etoll_card_id) === canonicalCardId(data.etoll_card_id_2)) {
      throw new Error('Kartu etoll ke-2 harus berbeda dari kartu etoll ke-1.');
    }
    newCards.forEach(function (cid) {
      if (typeof findFlazzCardBalance === 'function' && !findFlazzCardBalance(cid)) {
        throw new Error('Kartu etoll tidak ditemukan.');
      }
    });
```

Ganti scoping kartu (baris 517-520):

```js
      if (data.etoll_card_id) assertFlazzAccess(userInfo, flazzCardBranch(data.etoll_card_id));
      if (data.etoll_card_id_2) assertFlazzAccess(userInfo, flazzCardBranch(data.etoll_card_id_2));
      // Cascade penyerahan kartu (returnFlazzUsage/autoCreateFlazzUsage) mengubah status
      // kartu; untuk PIC kartu lama yang dikembalikan juga wajib cabangnya sendiri.
      oldCards.forEach(function (c) {
        if (newCards.indexOf(c) === -1) assertFlazzAccess(userInfo, flazzCardBranch(c));
      });
```

Ganti penulisan kolom etoll (baris 554-557):

```js
    if (data.etoll_card_id !== undefined && idx['flazz_card_id'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['flazz_card_id'] + 1).setValue(data.etoll_card_id || '');
      if (idx['flazz_card_name'] !== undefined) sheet.getRange(found.rowIndex, idx['flazz_card_name'] + 1).setValue(data.etoll_card_name || '');
    }
    if (data.etoll_card_id_2 !== undefined && idx['flazz_card_id_2'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['flazz_card_id_2'] + 1).setValue(data.etoll_card_id_2 || '');
      if (idx['flazz_card_name_2'] !== undefined) sheet.getRange(found.rowIndex, idx['flazz_card_name_2'] + 1).setValue(data.etoll_card_name_2 || '');
    }
```

Ganti blok cascade (baris 558-566):

```js
    // Sinkronkan penyerahan kartu per SLOT: kartu lama dikembalikan HANYA bila tidak
    // lagi dipakai di slot mana pun, kartu baru diserahkan bila belum ada. Jika
    // memakai perbandingan "!=" per slot, kartu yang pindah dari slot 1 ke slot 2
    // akan dikembalikan padahal masih dipegang driver.
    const namaDriverNow = data.driver_id !== undefined ? jalurDriverNameById(data.driver_id) : String(found.row[idx['nama_driver']] || '');
    const vidNow = data.vehicle_id !== undefined ? data.vehicle_id : String(found.row[idx['vehicle_id']] || '');
    oldCards.forEach(function (c) {
      if (newCards.indexOf(c) === -1) returnFlazzUsage(c);
    });
    newCards.forEach(function (c) {
      if (oldCards.indexOf(c) === -1) autoCreateFlazzUsage(c, namaDriverNow, vidNow, 'JALUR', String(data.id));
    });
```

Ganti audit (baris 573):

```js
      flazz_card_id: newCard,
      flazz_card_id_2: newCards[1] || ''
```

- [ ] **Step 8: `deleteJalur` — kembalikan semua kartu**

Ganti baris 593-597:

```js
    const cards = jalurAssignedCards(found.row, idx);
    // Kembalikan kartu etoll yang diserahkan agar tidak menggantung. Cascade
    // mengubah status kartu; untuk PIC setiap kartu wajib cabangnya sendiri.
    if (deleteRole !== 'SUPERADMIN') {
      cards.forEach(function (c) { assertFlazzAccess(userInfo, flazzCardBranch(c)); });
    }
    cards.forEach(function (c) { returnFlazzUsage(c); });
```

Dan baris audit 605: `flazz_card_id: cards.join(', '),`

- [ ] **Step 9: `backfillJalurStatus` — pakai `jalurFinalStatus`**

Ganti seluruh isi fungsi `backfillJalurStatus` (baris 719-792) dengan:

```js
function backfillJalurStatus(token) {
  assertSuperadminOnly(requireUser(token), 'backfill status jalur');
  try {
    const ss = getDB();
    const jalurSheetRef = ss.getSheetByName('Jalur_Pengiriman');
    const trxSheet = ss.getSheetByName('Penggunaan_BBM');
    if (!jalurSheetRef || jalurSheetRef.getLastRow() <= 1) return { success: true, msg: 'Tidak ada jalur untuk di-backfill.' };

    const jData = jalurSheetRef.getDataRange().getValues();
    const jIdx = jalurColIdx(jalurSheetRef);
    const hasStatus = jIdx['status'] !== undefined;
    const hasLaporanId = jIdx['laporan_id'] !== undefined;
    let updated = 0;

    // Pre-index laporan per (tanggal, vehicle_id, nama_supir)
    const laporanMap = {};
    if (trxSheet && trxSheet.getLastRow() > 1) {
      const tData = trxSheet.getDataRange().getValues();
      const tH = tData[0];
      const tTgl = tH.indexOf('tanggal');
      const tVeh = tH.indexOf('vehicle_id');
      const tDrv = tH.indexOf('nama_supir');
      const tId = tH.indexOf('transaction_id');
      for (let i = 1; i < tData.length; i++) {
        const key = String(tData[i][tTgl] || '').substring(0, 10) + '|' + String(tData[i][tVeh] || '') + '|' + String(tData[i][tDrv] || '');
        if (!laporanMap[key]) laporanMap[key] = String(tData[i][tId] || '');
      }
    }

    // Satu pembacaan rekon untuk seluruh baris jalur.
    const reconMap = reconMaxTglByCard();

    for (let i = 1; i < jData.length; i++) {
      const tgl = String(jData[i][jIdx['tanggal']] || '').substring(0, 10);
      const vid = String(jData[i][jIdx['vehicle_id']] || '');
      const drv = String(jData[i][jIdx['nama_driver']] || '');
      const rowIdx = i + 1;

      const laporanId = laporanMap[tgl + '|' + vid + '|' + drv] || '';
      if (hasLaporanId && laporanId && String(jData[i][jIdx['laporan_id']] || '') !== laporanId) {
        jalurSheetRef.getRange(rowIdx, jIdx['laporan_id'] + 1).setValue(laporanId);
      }

      // Definisi status yang SAMA dengan recomputeJalurStatus — termasuk jalur
// berstatus SELESAI yang belum semua kartunya direkon (bisa turun kembali).
      const newStatus = jalurFinalStatus(
        laporanId,
        jalurAssignedCards(jData[i], jIdx),
        tgl,
        reconMap
      );
      if (hasStatus && String(jData[i][jIdx['status']] || '') !== newStatus) {
        jalurSheetRef.getRange(rowIdx, jIdx['status'] + 1).setValue(newStatus);
        updated++;
      }
    }

    invalidateSheetSnapshot('Jalur_Pengiriman');
    return { success: true, msg: updated + ' jalur berhasil di-backfill statusnya.' };
  } catch (e) {
    return { success: false, msg: 'Backfill gagal: ' + e.toString() };
  }
}
```

- [ ] **Step 10: `getJalurDriversForDate` — kembalikan kartu kedua**

Ganti push object (baris 846-847):

```js
        flazz_card_id: (idx['flazz_card_id'] !== undefined) ? String(data[i][idx['flazz_card_id']] || '') : '',
        flazz_card_name: (idx['flazz_card_name'] !== undefined) ? String(data[i][idx['flazz_card_name']] || '') : '',
        flazz_card_id_2: (idx['flazz_card_id_2'] !== undefined) ? String(data[i][idx['flazz_card_id_2']] || '') : '',
        flazz_card_name_2: (idx['flazz_card_name_2'] !== undefined) ? String(data[i][idx['flazz_card_name_2']] || '') : ''
```

- [ ] **Step 11: Verifikasi gate TIDAK berubah rumusnya**

Run: `Select-String -Path src\JalurOps.js -Pattern "finalStatus"`
Expected: masih ada 2 kemunculan `finalStatus = latest.flazz_card_id ? 'SELESAI' : 'SUDAH_LAPORAN'` di `checkIncompleteJalurForVehicle` dan `saveJalur`, tidak berubah.

- [ ] **Step 12: Jalankan guard test**

Run: `node scratch/jalur-autofill-guard-test.js`
Expected: semua PASS, `0 failed`

- [ ] **Step 13: Jalankan test lain yang menyentuh Jalur**

Run: `node scratch/test-jalur-release.js`
Expected: PASS. Bila gagal karena fixture header, tambahkan `flazz_card_id_2` dan `flazz_card_name_2` ke array header di test tersebut.

- [ ] **Step 14: Commit**

```bash
git add src/JalurOps.js scratch/jalur-autofill-guard-test.js scratch/test-jalur-release.js
git commit -m "feat(jalur): dua kartu etoll per jalur + status agregat semua kartu"
```

---

### Task 6: `FlazzOps.js` — rekon memakai status agregat

**Files:**
- Modify: `src/FlazzOps.js:1094-1105`, `:1311-1322`, `:142-163`, `:1578-1640`, `:1753`, `:1786`

**Interfaces:**
- Consumes: `recomputeJalurStatus(jalurId, knownRowIndex)` dari Task 5; `cardGroups`, `distinctFlazzCardsOf` dari Task 2
- Produces: tidak ada antarmuka baru

- [ ] **Step 1: `saveFlazzRecon` — jangan lagi menandai SELESAI langsung**

Ganti blok baris 1094-1105:

```js
    // Status jalur ditulis oleh SATU fungsi aggregates (D3): rekon kartu A SAJA
    // tidak boleh menandai jalur SELESAI bila jalur tsb punya 2 kartu.
    try {
      const jalurMatch = findJalurByCriteria({ flazz_card_id: payload.card_id });
      if (jalurMatch) recomputeJalurStatus(jalurMatch.id, jalurMatch.rowIndex);
    } catch (e) {
      Logger.log('Gagal update status jalur dari rekon: ' + e.toString());
    }
```

- [ ] **Step 2: Hapus rekon — status dihitung ulang**

Ganti blok baris 1311-1322:

```js
    // Status jalur dihitung ulang: rekon yang dihapus tidak boleh tetap menandai
    // jalur SELESAI. Bila kartu ini baru satu-satunya yang belum selesai, jalur
    // turun ke SUDAH_LAPORAN.
    try {
      const jalurMatch = findJalurByCriteria({ flazz_card_id: cardId });
      if (jalurMatch) recomputeJalurStatus(jalurMatch.id, jalurMatch.rowIndex);
    } catch (e) {
      Logger.log('Gagal update status jalur dari hapus rekon: ' + e.toString());
    }
```

- [ ] **Step 3: `backfillFlazzCardName` — dua pasangan kolom**

Ganti baris 152-159:

```js
    const pairs = [
      { idIdx: headers.indexOf('flazz_card_id'), nameIdx: headers.indexOf('flazz_card_name') },
      { idIdx: headers.indexOf('flazz_card_id_2'), nameIdx: headers.indexOf('flazz_card_name_2') }
    ].filter(function (p) { return p.idIdx > -1 && p.nameIdx > -1; });
    if (!pairs.length) return;
    for (let i = 1; i < data.length; i++) {
      for (let p = 0; p < pairs.length; p++) {
        if (String(data[i][pairs[p].idIdx] || '') === String(cardId || '')) {
          sheet.getRange(i + 1, pairs[p].nameIdx + 1).setValue(cardName || '');
        }
      }
    }
```

- [ ] **Step 4: `getFlazzDashboardData` — ikut grup-2**

Di `src/FlazzOps.js` sekitar baris 1580-1640, tambahkan index kolom grup-2 setelah baris 1595:

```js
    const card2Idx = headers.indexOf('flazz_card_id_2');
    const bbm2Idx = headers.indexOf('biaya_bbm_2');
    const cardToll2Idx = headers.indexOf('flazz_card_id_toll_2');
    const toll2Idx = headers.indexOf('biaya_toll_2');
```

Lalu ganti perhitungan nominal per baris (baris 1605-1606):

```js
      const rowObj = {
        metode_pembayaran: bbmMethod,
        flazz_card_id: bbmCard,
        biaya_bbm: bbmAmount,
        metode_toll: tollMethod,
        flazz_card_id_toll: tollCard,
        biaya_toll: tollAmount
      };
      if (card2Idx > -1) rowObj.flazz_card_id_2 = row[card2Idx];
      if (bbm2Idx > -1) rowObj.biaya_bbm_2 = row[bbm2Idx];
      if (cardToll2Idx > -1) rowObj.flazz_card_id_toll_2 = row[cardToll2Idx];
      if (toll2Idx > -1) rowObj.biaya_toll_2 = row[toll2Idx];
      const groups = cardGroups(rowObj);
```

Ganti baris 1616-1617 (penentuan `sameCard` dan push ke `bbmFlazz`) dengan loop per grup:

```js
      groups.forEach(function (g, gi) {
        const gBbmCard = normalizeCardId(g.cBbm);
        const gTolCard = normalizeCardId(g.cTol);
        const gBbmAmount = parseFloat(g.bBbm) || 0;
        const gTolAmount = parseFloat(g.bTol) || 0;
        const sameCard = gBbmCard && String(gTolCard) === String(gBbmCard);
        if (String(g.mBbm) === 'FLAZZ' && gBbmCard && inCards(gBbmCard) && gBbmAmount > 0) {
          bbmFlazz.push(Object.assign({}, base, {
            card_id: gBbmCard, amount: gBbmAmount,
            evidence: gi === 0 ? base.evidence : base.evidence
          }));
        }
        if (String(g.mTol) === 'FLAZZ' && gTolCard && inCards(gTolCard) && gTolAmount > 0) {
          const tollEntry = {
            card_id: gTolCard, amount: gTolAmount, evidence: base.toll_evidence
          };
          if (!sameCard) {
            bbmFlazz.push(Object.assign({}, base, {
              card_id: gTolCard, amount: gTolAmount, evidence: base.toll_evidence
            }));
          } else {
            tollsCombined.push(Object.assign({}, base, tollEntry));
          }
        }
      });
```

**Catatan implementasi:** sesuaikan nama variabel tujuan dengan yang benar-benar dipakai di fungsi tersebut — baca blok `1616-1640` dan pertahankan struktur push aslinya, hanya ganti sumber nominalnya menjadi per-grup. Bila nama variabel berbeda, pakai nama yang ada; jangan menambah array baru.

- [ ] **Step 5: `deleteFlazzTransaction` — `payState` +4 field**

Ganti blok baris 1782-1786:

```js
    const payState = {
      metodeBbm: data[rowIndex - 1][idxMetode], cardBbm: cardId, biayaBbm: biaya,
      metodeTol: delTollMethod, cardTol: delTollCard, biayaTol: toll
    };
    if (idxCard2 > -1) payState.cardBbm2 = data[rowIndex - 1][idxCard2];
    if (idxBbm2 > -1) payState.biayaBbm2 = data[rowIndex - 1][idxBbm2];
    if (idxCardToll2 > -1) payState.cardTol2 = data[rowIndex - 1][idxCardToll2];
    if (idxToll2 > -1) payState.biayaTol2 = data[rowIndex - 1][idxToll2];
    const involvedCards = distinctFlazzCardsOf(payState);
```

Tambahkan deklarasi index tepat setelah baris `1753-1754` (`const idxBiaya`/`const idxToll`):

```js
    const idxCard2 = headers.indexOf('flazz_card_id_2');
    const idxBbm2 = headers.indexOf('biaya_bbm_2');
    const idxCardToll2 = headers.indexOf('flazz_card_id_toll_2');
    const idxToll2 = headers.indexOf('biaya_toll_2');
```

Dan tambahkan `payState` grup-2 ke audit (baris 1825):

```js
      logAudit(userInfo, 'DELETE', 'flazz', 'Transaksi Flazz ' + transactionId, { metode_pembayaran: payState.metodeBbm, flazz_card_id: cardId, biaya_bbm: biaya, biaya_toll: toll, metode_toll: delTollMethod, flazz_card_id_toll: delTollCard, flazz_card_id_2: payState.cardBbm2 || '', biaya_bbm_2: payState.biayaBbm2 || 0, flazz_card_id_toll_2: payState.cardTol2 || '', biaya_toll_2: payState.biayaTol2 || 0, kode_cabang: delCabang, tanggal: delTgl }, null);
```

- [ ] **Step 6: Pastikan tidak ada sisa pemanggilan `distinctFlazzCards` 4-argumen**

Run: `Select-String -Path src\*.js -Pattern "distinctFlazzCards\("`
Expected: tidak ada output.

- [ ] **Step 7: Verifikasi tidak ada `updateJalurStatus` dengan SELESAI dari FlazzOps**

Run: `Select-String -Path src\FlazzOps.js -Pattern "updateJalurStatus"`
Expected: tidak ada output — semua penulisan status jalur lewat `recomputeJalurStatus`.

- [ ] **Step 8: Commit**

```bash
git add src/FlazzOps.js
git commit -m "fix(ops): rekon kartu kedua tidak lagi menandai jalur selesai sendiri"
```

---

### Task 7: `SpreadsheetOps.js` — simpan/edit laporan dua kelompok

**Files:**
- Modify: `src/SpreadsheetOps.js:240-272`, `:277-290`, `:299-328`, `:297`, `:343`, `:350-379`, `:986-1155`, `:1337`, `:928`

**Interfaces:**
- Consumes: `distinctFlazzCardsOf`, `cardGroups`, `rowBbmTotal`, `rowTolTotal` (Task 2-3)
- Produces: payload laporan menerima `flazz_card_id_2`, `biaya_bbm_2`, `flazz_card_id_toll_2`, `biaya_toll_2`

- [ ] **Step 1: Balance gate grup-2**

Di `src/SpreadsheetOps.js` baris 250-251, tambahkan setelahnya:

```js
  if (payload.metode_pembayaran === 'FLAZZ') addFlazzCheck(payload.flazz_card_id, 'BBM', biayaBbmCheck);
  if (effMetodeToll === 'FLAZZ') addFlazzCheck(effCardToll, 'tol', biayaTolCheck);
  // Grup-2: metode diturunkan — kartu terisi -> FLAZZ, nominal > 0 tanpa kartu -> TUNAI.
  if (payload.flazz_card_id_2) addFlazzCheck(payload.flazz_card_id_2, 'BBM kartu 2', parseFloat(payload.biaya_bbm_2) || 0);
  if (payload.flazz_card_id_toll_2) addFlazzCheck(payload.flazz_card_id_toll_2, 'tol kartu 2', parseFloat(payload.biaya_toll_2) || 0);
```

Karena `flazzChecks` di-key per `cardId`, grup-1 dan grup-2 yang jatuh ke kartu sama otomatis ter-aggregate sehingga overdraft gabungan tetap tertangkap.

- [ ] **Step 2: Tulis 4 kolom baru + guard panjang row**

Ganti blok `row` (baris 277-290) sehingga 4 nilai ditambahkan di ujung, lalu tambahkan guard panjang:

```js
  let row = [
    transaction_id, trxTs, payload.tanggal, payload.userInfo.username, userName, trxCabang, payload.vehicle_id, platNomor,
    payload.serverData.files.odo_awal, payload.serverData.km_awal, km_awal, payload.bar_awal,
    payload.serverData.files.odo_akhir, payload.serverData.km_akhir, km_akhir, payload.bar_akhir,
    km_tempuh, (payload.bar_awal - payload.bar_akhir), liter, payload.biaya_bbm,
    payload.serverData.files.struk_bbm || '',
    parseFloat(payload.biaya_toll) || 0,
    (payload.serverData && payload.serverData.files && payload.serverData.files.struk_toll) || '',
    efisiensi, 'COMPLETED', warning, payload.nama_supir,
    storeMetodeBbm, payload.flazz_card_id || '',
    km_sumber,
    effMetodeToll,
    effCardToll,
    payload.flazz_card_id_2 || '',
    parseFloat(payload.biaya_bbm_2) || 0,
    payload.flazz_card_id_toll_2 || '',
    parseFloat(payload.biaya_toll_2) || 0
  ];

  // Panjang row mengikuti header sheet yang aktual. Kolom grup-2 hanya ditulis
  // bila sheet sudah dimigrasi (setupDatabase) — tanpa ini, appendRow meledak
  // di spreadsheet yang belum menjalankan migrasi dan SEMUA laporan gagal disimpan.
  const headersNow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (row.length > headersNow.length) row.length = headersNow.length;
```

- [ ] **Step 3: `adjustMonthlySummary` saat create**

Ganti baris 297:

```js
  try { adjustMonthlySummary(trxCabang, periodKey(payload.tanggal), { trx: 1, liter: parseFloat(liter) || 0, biaya: rowBbmTotal({ biaya_bbm: payload.biaya_bbm, biaya_bbm_2: payload.biaya_bbm_2 }), toll: rowTolTotal({ biaya_toll: payload.biaya_toll, biaya_toll_2: payload.biaya_toll_2 }) }); } catch (e) { console.error('summary gagal: ' + e); }
```

- [ ] **Step 4: Hapus `flazzCards` 4-argumen, pakai `distinctFlazzCardsOf` + grup-2**

Ganti baris 302-304:

```js
  const flazzCards = distinctFlazzCardsOf({
    metode_pembayaran: payload.metode_pembayaran,
    flazz_card_id: payload.flazz_card_id,
    biaya_bbm: payload.biaya_bbm,
    metode_toll: effMetodeToll,
    flazz_card_id_toll: effCardToll,
    biaya_toll: payload.biaya_toll,
    flazz_card_id_2: payload.flazz_card_id_2,
    biaya_bbm_2: payload.biaya_bbm_2,
    flazz_card_id_toll_2: payload.flazz_card_id_toll_2,
    biaya_toll_2: payload.biaya_toll_2
  });
```

Ganti blok potong saldo (baris 310-318) sehingga grup-2 ikut dipotong:

```js
      // 1. Potong saldo kartu untuk BBM bila metode BBM Flazz
      if (biayaBbm > 0 && payload.metode_pembayaran === 'FLAZZ' && payload.flazz_card_id && typeof recordFlazzExpense === 'function') {
        recordFlazzExpense(payload.flazz_card_id, 'BBM', biayaBbm, payload.serverData.files.struk_bbm, payload.tanggal);
      }
      // 2. Potong saldo kartu untuk tol bila metode tol Flazz (dipisah agar rekonsiliasi memisahkan nominal)
      if (biayaTol > 0 && effMetodeToll === 'FLAZZ' && effCardToll && typeof recordFlazzExpense === 'function') {
        const tolFoto = (payload.serverData && payload.serverData.files && payload.serverData.files.struk_toll) || '';
        recordFlazzExpense(effCardToll, 'TOL', biayaTol, tolFoto, payload.tanggal);
      }
      // 2b. Grup-2: bukti foto memakai struk grup-1 (belum ada kolom foto sendiri).
      const biayaBbm2 = parseFloat(payload.biaya_bbm_2) || 0;
      const biayaTol2 = parseFloat(payload.biaya_toll_2) || 0;
      if (biayaBbm2 > 0 && payload.flazz_card_id_2 && typeof recordFlazzExpense === 'function') {
        recordFlazzExpense(payload.flazz_card_id_2, 'BBM', biayaBbm2, payload.serverData.files.struk_bbm, payload.tanggal);
      }
      if (biayaTol2 > 0 && payload.flazz_card_id_toll_2 && typeof recordFlazzExpense === 'function') {
        const tolFoto2 = (payload.serverData && payload.serverData.files && payload.serverData.files.struk_toll) || '';
        recordFlazzExpense(payload.flazz_card_id_toll_2, 'TOL', biayaTol2, tolFoto2, payload.tanggal);
      }
```

- [ ] **Step 5: `isDuplicateTransaction` — masukkan nominal grup-2**

Setelah baris 360 (`const tolQ = ...`), tambahkan:

```js
    const bbm2Q = String(parseFloat(payload.biaya_bbm_2) || 0);
    const tol2Q = String(parseFloat(payload.biaya_toll_2) || 0);
```

Setelah baris 379 (`const idxTol = ...`), tambahkan:

```js
    const idxBbm2 = headers.indexOf('biaya_bbm_2');
    const idxTol2 = headers.indexOf('biaya_toll_2');
```

Setelah baris 387 (`const sameTol = ...`), tambahkan:

```js
        const sameBbm2 = (idxBbm2 >= 0) ? String(parseFloat(data[i][idxBbm2]) || 0) === bbm2Q : true;
        const sameTol2 = (idxTol2 >= 0) ? String(parseFloat(data[i][idxTol2]) || 0) === tol2Q : true;
```

Dan ubah kondisi duplikat (baris 388):

```js
        if (sameKmAwal && sameKmAwal && sameLiter && sameBbm && sameTol && sameBbm2 && sameTol2) {
```

**Catatan:** pertahankan `sameKmAwal` apa adanya (bug `km_awal`/`liter` yang sudah lama **tidak** diperbaiki — lihat Global Constraints). Penambahan grup-2 di sini tidak mengubah perilaku apa pun selama key pembanding masih mati.

- [ ] **Step 6: `editTransaction` — baca & tulis 4 kolom baru**

Cari di `editTransaction` (sekitar baris 986) deklarasi index header, lalu tambahkan:

```js
    const idxCard2 = headers.indexOf('flazz_card_id_2');
    const idxBbm2 = headers.indexOf('biaya_bbm_2');
    const idxCardToll2 = headers.indexOf('flazz_card_id_toll_2');
    const idxToll2 = headers.indexOf('biaya_toll_2');
```

Setelah baris 1044 (`const newToll = parseEditAmount(payload.biaya_toll, oldToll);`) tambahkan:

```js
    const oldBbm2 = (idxBbm2 > -1) ? (parseFloat(row[idxBbm2]) || 0) : 0;
    const oldTol2 = (idxToll2 > -1) ? (parseFloat(row[idxToll2]) || 0) : 0;
    const newCard2 = data.etoll_card_id_2 !== undefined ? String(data.etoll_card_id_2 || '') : ((idxCard2 > -1) ? String(row[idxCard2] || '') : '');
    const newCardToll2 = data.etoll_card_id_toll_2 !== undefined ? String(data.etoll_card_id_toll_2 || '') : ((idxCardToll2 > -1) ? String(row[idxCardToll2] || '') : '');
    const newBbm2 = (data.biaya_bbm_2 !== undefined) ? (parseFloat(data.biaya_bbm_2) || 0) : oldBbm2;
    const newTol2 = (data.biaya_toll_2 !== undefined) ? (parseFloat(data.biaya_toll_2) || 0) : oldTol2;
```

Perluas `oldPayState` / `newPayState` (baris 1084-1091):

```js
    const oldPayState = {
      metodeBbm: oldMetode, cardBbm: oldCard, biayaBbm: oldBiaya,
      metodeTol: oldTollMethod, cardTol: oldTollCard, biayaTol: oldToll,
      cardBbm2: (idxCard2 > -1) ? String(row[idxCard2] || '') : '', biayaBbm2: oldBbm2,
      cardTol2: (idxCardToll2 > -1) ? String(row[idxCardToll2] || '') : '', biayaTol2: oldTol2
    };
    const newPayState = {
      metodeBbm: newMetode, cardBbm: newCard, biayaBbm: newBiaya,
      metodeTol: newMetodeToll, cardTol: newTollCard, biayaTol: newToll,
      cardBbm2: newCard2, biayaBbm2: newBbm2,
      cardTol2: newCardToll2, biayaTol2: newTol2
    };
```

Ganti baris 1092-1093:

```js
    const involvedCards = distinctFlazzCardsOf(oldPayState)
      .concat(distinctFlazzCardsOf(newPayState))
      .filter(function(id, i, arr) { return arr.indexOf(id) === i; });
```

Tambahkan penulisan kolom setelah baris 1112:

```js
    if (idxCard2 > -1) sheet.getRange(rowIndex, idxCard2 + 1).setValue(newCard2 || '');
    if (idxBbm2 > -1) sheet.getRange(rowIndex, idxBbm2 + 1).setValue(newBbm2 || 0);
    if (idxCardToll2 > -1) sheet.getRange(rowIndex, idxCardToll2 + 1).setValue(newCardToll2 || '');
    if (idxToll2 > -1) sheet.getRange(rowIndex, idxToll2 + 1).setValue(newTol2 || 0);
```

- [ ] **Step 7: `adjustMonthlySummary` saat edit (2 tempat)**

Baris 343 dan 1337 — ganti nilai `biaya`/`toll` agar menjumlahkan grup-2:

```js
      biaya: rowBbmTotal({ biaya_bbm: payload.biaya_bbm, biaya_bbm_2: payload.biaya_bbm_2 }),
      toll: rowTolTotal({ biaya_toll: payload.biaya_toll, biaya_toll_2: payload.biaya_toll_2 })
```

Pada jalur hapus transaksi (`FlazzOps.js:1806` ditangani di Task 6) dan di `editTransaction` yang sama seperti pada `deleteTransaction` bila ada, gunakan `rowBbmTotal`/`rowTolTotal` dengan nilai lama baris.

- [ ] **Step 8: `getRecentTransactions` mapping (`:928`)**

Ganti `biaya_bbm: parseFloat(row[19]) || 0,` dengan tambahan:

```js
        biaya_bbm: parseFloat(row[19]) || 0,
        biaya_bbm_2: (function () { var i = hdrIdx(row, 'biaya_bbm_2'); return i > -1 ? (parseFloat(row[i]) || 0) : 0; })(),
        flazz_card_id_2: (function () { var i = hdrIdx(row, 'flazz_card_id_2'); return i > -1 ? String(row[i] || '') : ''; })(),
        flazz_card_id_toll_2: (function () { var i = hdrIdx(row, 'flazz_card_id_toll_2'); return i > -1 ? String(row[i] || '') : ''; })(),
        biaya_toll_2: (function () { var i = hdrIdx(row, 'biaya_toll_2'); return i > -1 ? (parseFloat(row[i]) || 0) : 0; })(),
```

Tambahkan helper `hdrIdx` di file yang sama (menerima array baris dan nama header, mengembalikan index atau `-1`):

```js
// Index kolom berdasarkan nama header, dihitung dari baris header sheet.
function hdrIdx(row, name) {
  if (!hdrIdx._cache) hdrIdx._cache = null;
  if (!hdrIdx._cache) {
    const ss = getDB();
    const sh = ss.getSheetByName('Penggunaan_BBM');
    if (!sh) return -1;
    const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const m = {};
    h.forEach(function (x, i) { if (x !== '') m[String(x)] = i; });
    hdrIdx._cache = m;
  }
  const v = hdrIdx._cache[name];
  return v === undefined ? -1 : v;
}
```

Invalidasi cache bila sheet berubah — tambahkan `hdrIdx._cache = null;` di `ensurePenggunaBBMColumns()`.

- [ ] **Step 9: Verifikasi tidak ada pemanggilan lama**

Run: `Select-String -Path src\*.js -Pattern "distinctFlazzCards\("; Select-String -Path src\*.js -Pattern "flazzCardCharge"`
Expected: `flazzCardCharge` hanya di `PaymentLogic.js` (definisi + `flazzEditDelta`). `distinctFlazzCards(` tanpa argumen tidak boleh ada.

- [ ] **Step 10: Jalankan semua test node**

Run: `node scratch/test-payment-logic.js; node scratch/test-jalur-status.js; node scratch/test-schema.js; node scratch/jalur-autofill-guard-test.js; node scratch/test-jalur-release.js`
Expected: semua `0 failed`

- [ ] **Step 11: Commit**

```bash
git add src/SpreadsheetOps.js
git commit -m "feat(bbm): simpan & edit laporan dengan dua kelompok kartu"
```

---

### Task 8: `Code.js` — prefill laporan terakhir

**Files:**
- Modify: `src/Code.js:162-198`

**Interfaces:**
- Consumes: `cardGroups` (Task 2)
- Produces: `getLastLaporanPrefill` mengembalikan `pref.flazz_card_id_2`, `pref.biaya_bbm_2`, `pref.flazz_card_id_toll_2`, `pref.biaya_toll_2`

- [ ] **Step 1: Tambahkan pemetaan index header**

Di `getLastLaporanPrefill`, setelah `const data = sheet.getDataRange().getValues();` (baris 169) tambahkan:

```js
    const hMap = {};
    (data[0] || []).forEach(function (x, i) { if (x !== '') hMap[String(x)] = i; });
    function cell(rowArr, name) { const i = hMap[name]; return i === undefined ? '' : rowArr[i]; }
```

- [ ] **Step 2: Tambahkan 4 field ke objek `pref`**

Tambahkan di dalam literal `pref` (setelah `flazz_card_id_toll`, baris 191):

```js
        flazz_card_id_2: (function () { var c = cell(row, 'flazz_card_id_2'); return typeof resolveCanonicalCardId === 'function' ? resolveCanonicalCardId(c) : (c || ''); })(),
        biaya_bbm_2: parseFloat(cell(row, 'biaya_bbm_2')) || 0,
        flazz_card_id_toll_2: (function () { var c = cell(row, 'flazz_card_id_toll_2'); return typeof resolveCanonicalCardId === 'function' ? resolveCanonicalCardId(c) : (c || ''); })(),
        biaya_toll_2: parseFloat(cell(row, 'biaya_toll_2')) || 0
```

- [ ] **Step 3: Verifikasi indeks hardcoded tidak bergeser**

Run: `node scratch/test-schema.js`
Expected: `0 failed` — `trx[19]`, `trx[27]`, `trx[28]`, `trx[30]`, `trx[31]` masih menunjuk kolom yang sama seperti sebelumnya.

- [ ] **Step 4: Commit**

```bash
git add src/Code.js
git commit -m "feat(bbm): prefill laporan terakhir ikut menyertakan kartu kedua"
```

---

### Task 9: UI Form Jalur

**Files:**
- Modify: `src/JalurScript.html:167-174`, `:203-224`, `:328`, `:391`, `:433-442`, `:495-553`
- Modify: `src/JalurPages.html:187-193`

**Interfaces:**
- Consumes: payload `etoll_card_id_2` / `etoll_card_name_2` (Task 5)
- Produces: class `.jalur-row-etoll2`, `.jalur-row-etoll2-id`, `.jalur-row-etoll2-name`; `jalurSyncEtollRow(selectEl, idClass, nameClass)`; `jalurSyncEditEtoll()`

- [ ] **Step 1: `jalurSyncEtollRow` jadi generik per-slot**

Ganti fungsi di `src/JalurScript.html` baris 167-174:

```js
function jalurSyncEtollRow(selectEl, idClass, nameClass) {
  var row = selectEl.closest('.jalur-row');
  var idEl = row ? row.querySelector(idClass || '.jalur-row-etoll-id') : null;
  var nameEl = row ? row.querySelector(nameClass || '.jalur-row-etoll-name') : null;
  var opt = selectEl.options[selectEl.selectedIndex];
  if (idEl) idEl.value = opt && opt.value ? opt.value : '';
  if (nameEl) nameEl.value = opt && opt.value ? (opt.getAttribute('data-name') || opt.text) : '';
}
```

- [ ] **Step 2: Template baris + init di `jalurAddRow`**

Ganti blok Kartu Etoll di `jalurAddRow` (baris 214-217) menjadi dua kolom, dan baris rute menjadi `col-12` penuh:

```js
    '<div class="col-12 col-md-6 col-xl-3"><label class="form-label text-muted small text-uppercase fw-bold">Kartu Etoll 1</label>' +
    '<select class="form-select jalur-row-etoll" onchange="jalurSyncEtollRow(this)"></select>' +
    '<input type="hidden" class="jalur-row-etoll-id">' +
    '<input type="hidden" class="jalur-row-etoll-name"></div>' +
    '<div class="col-12 col-md-6 col-xl-3"><label class="form-label text-muted small text-uppercase fw-bold">Kartu Etoll 2 (opsional)</label>' +
    '<select class="form-select jalur-row-etoll2" onchange="jalurSyncEtollRow(this, \'.jalur-row-etoll2-id\', \'.jalur-row-etoll2-name\')"></select>' +
    '<input type="hidden" class="jalur-row-etoll2-id">' +
    '<input type="hidden" class="jalur-row-etoll2-name"></div>' +
```

Ganti penutup `</div>` baris rute (baris 220) agar `col-12`:

```js
    '<div class="col-12"><label class="form-label text-muted small text-uppercase fw-bold">Rute Tujuan</label>' +
    '<div class="input-group"><input type="text" class="form-control jalur-row-rute" placeholder="ex: Gudang A - Toko B">' +
    '<button type="button" class="btn btn-outline-danger" onclick="this.closest(\'.jalur-row\').remove()"><i class="bi bi-x"></i></button></div></div>';
```

Tambahkan inisialisasi select ke-2 setelah baris 223:

```js
  jalurPopulateEtollOptions(row.querySelector('.jalur-row-etoll'), '');
  jalurPopulateEtollOptions(row.querySelector('.jalur-row-etoll2'), '');
```

- [ ] **Step 3: Validasi slot 2 pada `jalurSave`**

Di `jalurSave` (baris 433-442), ganti pembacaan etoll:

```js
      const etollId = r.querySelector('.jalur-row-etoll-id');
      const etollName = r.querySelector('.jalur-row-etoll-name');
      const etoll2Id = r.querySelector('.jalur-row-etoll2-id');
      const etoll2Name = r.querySelector('.jalur-row-etoll2-name');
      if (etollId && etoll2Id && etollId.value && etoll2Id.value && etollId.value === etoll2Id.value) {
        valid = false;
        showToast('Kartu etoll ke-2 harus berbeda dari kartu etoll ke-1', 'error');
        return;
      }
      rows.push({ 
        driver_id: jalurResolveDriverId(driverInput), 
        driver2_id: jalurResolveDriverId(r.querySelector('.jalur-row-driver2')),
        vehicle_id: vehicleId, 
        rute_tujuan: rute.trim(),
        etoll_card_id: etollId ? etollId.value : '',
        etoll_card_name: etollName ? etollName.value : '',
        etoll_card_id_2: etoll2Id ? etoll2Id.value : '',
        etoll_card_name_2: etoll2Name ? etoll2Name.value : ''
      });
```

- [ ] **Step 4: Modal Edit — field ke-2 di `JalurPages.html`**

Ganti blok Kartu Etoll (baris 187-193):

```html
        <div class='mb-3'>
          <label class='form-label text-muted small fw-bold'>Kartu Etoll 1</label>
          <select id='jalur-edit-etoll' class='form-select' onchange="jalurSyncEditEtoll()">
            <option value=''>Pilih Kartu Etoll...</option>
          </select>
          <input type='hidden' id='jalur-edit-etoll-id'>
        </div>
        <div class='mb-3'>
          <label class='form-label text-muted small fw-bold'>Kartu Etoll 2 (opsional)</label>
          <select id='jalur-edit-etoll2' class='form-select' onchange="jalurSyncEditEtoll()">
            <option value=''>Tanpa kartu kedua</option>
          </select>
          <input type='hidden' id='jalur-edit-etoll2-id'>
        </div>
```

- [ ] **Step 5: `jalurSyncEditEtoll` + preset di `jalurEdit`**

Tambahkan fungsi baru di `src/JalurScript.html` sebelum `jalurEdit`:

```js
function jalurSyncEditEtoll() {
  var sel1 = document.getElementById('jalur-edit-etoll');
  var sel2 = document.getElementById('jalur-edit-etoll2');
  var h1 = document.getElementById('jalur-edit-etoll-id');
  var h2 = document.getElementById('jalur-edit-etoll2-id');
  if (h1 && sel1) h1.value = sel1.value || '';
  if (h2 && sel2) h2.value = sel2.value || '';
}
```

Di `jalurEdit`, ganti blok baris 523-532 dengan:

```js
      var editEtollId = document.getElementById('jalur-edit-etoll');
      var editEtoll2 = document.getElementById('jalur-edit-etoll2');
      var editEtollIdHidden = document.getElementById('jalur-edit-etoll-id');
      var editEtoll2Hidden = document.getElementById('jalur-edit-etoll2-id');
      jalurPopulateEtollOptions(editEtollId, it.flazz_card_id || '');
      jalurPopulateEtollOptions(editEtoll2, it.flazz_card_id_2 || '');
      editEtollIdHidden.value = it.flazz_card_id || '';
      if (editEtoll2Hidden) editEtoll2Hidden.value = it.flazz_card_id_2 || '';
```

Hapus pemanggilan `jalurSetEtollDisplay(...)` lama (baris 518-522) bila ia menimpa select dengan teks non-select; bila masih dipakai untuk slot 1, pertahankan dan tambahkan slot 2 secara terpisah.

- [ ] **Step 6: `jalurSaveEdit` kirim kartu ke-2**

Ganti literal `data` (baris 544-553):

```js
  const data = {
    id: document.getElementById('jalur-edit-id').value,
    tanggal: document.getElementById('jalur-edit-tanggal').value,
    driver_id: jalurResolveDriverId(document.getElementById('jalur-edit-driver')),
    driver2_id: jalurResolveDriverId(document.getElementById('jalur-edit-driver2')),
    vehicle_id: document.getElementById('jalur-edit-vehicle').value,
    rute_tujuan: document.getElementById('jalur-edit-rute').value,
    etoll_card_id: etollId ? etollId.value : '',
    etoll_card_name: etollOpt && etollOpt.value ? (etollOpt.getAttribute('data-name') || etollOpt.text) : '',
    etoll_card_id_2: (document.getElementById('jalur-edit-etoll2-id') || {}).value || '',
    etoll_card_name_2: (function () {
      var s = document.getElementById('jalur-edit-etoll2');
      var o = s && s.selectedIndex > -1 ? s.options[s.selectedIndex] : null;
      return o && o.value ? (o.getAttribute('data-name') || o.text) : '';
    })()
  };
  if (data.etoll_card_id_2 && canonicalCardIdLocal(data.etoll_card_id) === canonicalCardIdLocal(data.etoll_card_id_2)) {
    showToast('Kartu etoll ke-2 harus berbeda dari kartu etoll ke-1', 'error'); return;
  }
```

Tambahkan helper kecil di `src/JalurScript.html`:

```js
function canonicalCardIdLocal(v) { return String(v || '').trim().replace(/-/g, ''); }
```

- [ ] **Step 7: Tampilkan 2 kartu di listing & summary**

Ganti ekspresi etoll di listing (baris 328) dan summary (baris 391) — cari pola `esc(it.flazz_card_name || '-')` dan ganti dengan:

```js
        jalurEtollCell(it)
```

Tambahkan fungsi:

```js
function jalurEtollCell(it) {
  var a = (it.flazz_card_name || '').trim();
  var b = (it.flazz_card_name_2 || '').trim();
  if (!a && !b) return esc('-');
  if (!b) return esc(a);
  if (!a) return esc(b);
  return esc(a) + '<br><span class="text-muted small">' + esc(b) + '</span>';
}
```

- [ ] **Step 8: Judul kolom tabel**

Di `src/JalurPages.html` baris 78 dan 140, ganti `<th>Etoll</th>` menjadi `<th>Etoll 1<br><span class='fw-normal small'>Etoll 2</span></th>`.

- [ ] **Step 9: Verifikasi tidak ada error JS**

Run: `Select-String -Path src\JalurScript.html -Pattern "jalur-row-etoll2|jalurSyncEditEtoll|jalurEtollCell|canonicalCardIdLocal"`Count
Expected: semua identifier baru ada.

- [ ] **Step 10: Commit**

```bash
git add src/JalurScript.html src/JalurPages.html
git commit -m "feat(jalur): dua dropdown kartu etoll per baris jadwal"
```

---

### Task 10: UI Form Laporan + `PAGE_VER`

**Files:**
- Modify: `src/Index.html` (setelah blok toll, dan modal edit `:1284-1300`)
- Modify: `src/js.html` (init select, toggle, submit, reset, prefill jalur, edit)
- Modify: `src/Config.gs` atau file mana pun yang mendefinisikan `PAGE_VER`

**Interfaces:**
- Consumes: field payload `flazz_card_id_2`, `biaya_bbm_2`, `flazz_card_id_toll_2`, `biaya_toll_2` (Task 7)
- Produces: `toggleGrupKartu2(force)`, `grupKartu2Aktif()`, `readGrupKartu2()`

- [ ] **Step 1: Cari `PAGE_VER`**

Run: `Select-String -Path src\*.html,src\*.js,src\*.gs -Pattern "PAGE_VER"`
Expected: satu definisi + beberapa pemakaian. Catat nilainya.

- [ ] **Step 2: Tambah markup grup-2 di `Index.html`**

Tempatkan setelah blok `flazz_card_id_toll` (sekitar baris 471-476):

```html
                            <div class='col-12 mt-2' id='grup-kartu2-tombol-wrap'>
                              <button type='button' class='btn btn-sm btn-outline-secondary' id='btn-grup-kartu2' onclick='toggleGrupKartu2()'>
                                <i class='bi bi-plus-circle me-1'></i>Tambah pengeluaran kartu ke-2
                              </button>
                              <div class='form-text text-muted small'>Dipakai saat satu kartu tidak cukup saldo (mis. tol dibayar 2 gerbang dengan 2 kartu).</div>
                            </div>
                            <div class='row g-2 mt-1' id='grup-kartu2-wrap' style='display:none'>
                              <div class='col-12 col-md-6'>
                                <label class='form-label text-muted small text-uppercase fw-bold'>Nominal BBM (kartu 2)</label>
                                <input type='number' id='biaya_bbm_2' class='form-control' min='0' placeholder='0' oninput='updateLiveSummary()'>
                              </div>
                              <div class='col-12 col-md-6'>
                                <label class='form-label text-muted small text-uppercase fw-bold'>Kartu Flazz BBM (kartu 2)</label>
                                <select id='flazz_card_id_2' class='form-select' onchange='updateLiveSummary()'></select>
                              </div>
                              <div class='col-12 col-md-6'>
                                <label class='form-label text-muted small text-uppercase fw-bold'>Nominal Tol (kartu 2)</label>
                                <input type='number' id='biaya_toll_2' class='form-control' min='0' placeholder='0' oninput='updateLiveSummary()'>
                              </div>
                              <div class='col-12 col-md-6'>
                                <label class='form-label text-muted small text-uppercase fw-bold'>Kartu Flazz Tol (kartu 2)</label>
                                <select id='flazz_card_id_toll_2' class='form-select' onchange='updateLiveSummary()'></select>
                              </div>
                            </div>
```

- [ ] **Step 3: Fungsi toggle & reader di `js.html`**

Tambahkan di `js.html`:

```js
  function grupKartu2Aktif() {
    var w = document.getElementById('grup-kartu2-wrap');
    return !!(w && w.style.display !== 'none');
  }
  function toggleGrupKartu2(force) {
    var w = document.getElementById('grup-kartu2-wrap');
    var b = document.getElementById('grup-kartu2-tombol-wrap');
    if (!w) return;
    var on = (force === undefined) ? !grupKartu2Aktif() : !!force;
    w.style.display = on ? '' : 'none';
    if (b) b.style.display = on ? 'none' : '';
    if (!on) {
      ['biaya_bbm_2', 'biaya_toll_2'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.value = '';
      });
      ['flazz_card_id_2', 'flazz_card_id_toll_2'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.value = '';
      });
    }
    if (typeof updateLiveSummary === 'function') updateLiveSummary();
  }
  // Payload grup-2: nonaktif/ kosong -> 0 & '' agar kolom sheet tetap bersih.
  function readGrupKartu2() {
    if (!grupKartu2Aktif()) return { biaya_bbm_2: 0, flazz_card_id_2: '', biaya_toll_2: 0, flazz_card_id_toll_2: '' };
    return {
      biaya_bbm_2: (parseFloat((document.getElementById('biaya_bbm_2') || {}).value) || 0),
      flazz_card_id_2: (document.getElementById('flazz_card_id_2') || {}).value || '',
      biaya_toll_2: (parseFloat((document.getElementById('biaya_toll_2') || {}).value) || 0),
      flazz_card_id_toll_2: (document.getElementById('flazz_card_id_toll_2') || {}).value || ''
    };
  }
```

- [ ] **Step 4: Isi select grup-2 saat init master data**

Ganti blok duplikasi di `js.html` baris 303-331 dengan versi yang memakai helper tunggal:

```js
        function fillCardSelect(selId) {
          var sel = document.getElementById(selId);
          if (!sel || !data.flazzCards) return;
          sel.innerHTML = '<option value="">Pilih Kartu...</option>';
          data.flazzCards.forEach(function (f) {
            if (f.status === 'NONAKTIF') return;
            var opt = document.createElement('option');
            opt.value = f.id;
            opt.text = f.card_number + ' - ' + f.card_type + (f.driver_id ? ' [' + f.driver_id + ']' : '');
            sel.appendChild(opt);
          });
        }
        fillCardSelect('flazz_card_id');
        fillCardSelect('flazz_card_id_toll');
        fillCardSelect('flazz_card_id_2');
        fillCardSelect('flazz_card_id_toll_2');
```

- [ ] **Step 5: Reset per warehouse & reset form**

Di `js.html` sekitar baris 2837-2842, tambahkan:

```js
    var fcBbm2 = document.getElementById('flazz_card_id_2');
    if (fcBbm2) fcBbm2.value = '';
    var fcTol2 = document.getElementById('flazz_card_id_toll_2');
    if (fcTol2) fcTol2.value = '';
    populateFlazzCardSelect('flazz_card_id_2', cabang);
    populateFlazzCardSelect('flazz_card_id_toll_2', cabang);
    toggleGrupKartu2(false);
```

Dan di `resetDailyForm()` (sekitar baris 917-921), tambahkan:

```js
    if (typeof toggleGrupKartu2 === 'function') toggleGrupKartu2(false);
```

- [ ] **Step 6: Kirim 4 field di kedua jalur submit**

Di `js.html` baris 1246-1247 dan 1440-1441, tambahkan spread dari `readGrupKartu2()`:

```js
        biaya_bbm: biaya_bbmSubmit,
        biaya_toll: biaya_tollSubmit,
        flazz_card_id_2: g2.flazz_card_id_2,
        biaya_bbm_2: g2.biaya_bbm_2,
        flazz_card_id_toll_2: g2.flazz_card_id_toll_2,
        biaya_toll_2: g2.biaya_toll_2,
```

dengan `const g2 = readGrupKartu2();` tepat sebelum literal payload. Ulangi untuk kedua fungsi submit (yang memakai `biaya_bbmSubmit` di baris 1184 dan yang memakai `document.getElementById` di baris 1440).

- [ ] **Step 7: Validasi sebelum submit**

Tambahkan setelah validasi `flazz_card_id_toll` (sekitar baris 1203 dan 1342):

```js
    const g2v = readGrupKartu2();
    if (g2v.biaya_bbm_2 > 0 && !g2v.flazz_card_id_2) { showToast('Nominal BBM kartu 2 terisi tapi kartu Flazz-nya belum dipilih', 'error'); return; }
    if (g2v.biaya_toll_2 > 0 && !g2v.flazz_card_id_toll_2) { showToast('Nominal Tol kartu 2 terisi tapi kartu Flazz-nya belum dipilih', 'error'); return; }
    if (g2v.flazz_card_id_2 && g2v.flazz_card_id_2 === flazz_card_id) { showToast('Kartu ke-2 harus berbeda dari kartu ke-1', 'error'); return; }
```

- [ ] **Step 8: Prefill dari jalur (2 kartu)**

Di `js.html` sekitar baris 485-492, setelah prefill `flazz_card_id_toll` tambahkan:

```js
    var card2 = (match.flazz_card_id_2 || '').trim();
    var selCard2 = document.getElementById('flazz_card_id_2');
    var selCardTol2 = document.getElementById('flazz_card_id_toll_2');
    if (card2 && selCard2 && selCardTol2) {
      // Kartu kedua jalur -> slot BBM grup-2, lalu slot tol grup-2 bila masih kosong.
      if (!selCard2.value) { selCard2.value = card2; if (typeof toggleGrupKartu2 === 'function') toggleGrupKartu2(true); }
      if (!selCardTol2.value) selCardTol2.value = card2;
    }
```

- [ ] **Step 9: Prefill dari laporan terakhir**

Di `js.html` sekitar baris 992-1004, tambahkan setelah prefill `fcTol`:

```js
    var p2 = p || {};
    if ((p2.biaya_bbm_2 > 0 || p2.biaya_toll_2 > 0) && typeof toggleGrupKartu2 === 'function') toggleGrupKartu2(true);
    var e1 = document.getElementById('biaya_bbm_2'); if (e1) e1.value = p2.biaya_bbm_2 || '';
    var e2 = document.getElementById('flazz_card_id_2'); if (e2 && p2.flazz_card_id_2) e2.value = p2.flazz_card_id_2;
    var e3 = document.getElementById('biaya_toll_2'); if (e3) e3.value = p2.biaya_toll_2 || '';
    var e4 = document.getElementById('flazz_card_id_toll_2'); if (e4 && p2.flazz_card_id_toll_2) e4.value = p2.flazz_card_id_toll_2;
```

- [ ] **Step 10: Modal edit laporan**

Di `Index.html` setelah baris 1300, tambahkan:

```html
                <div class='col-12 col-md-6'><label class='form-label small fw-bold'>Nominal BBM (kartu 2)</label>
                  <input id="ed_biaya_bbm_2" type="number" min="0" class="form-control" placeholder="0"></div>
                <div class='col-12 col-md-6'><label class='form-label small fw-bold'>Kartu Flazz BBM (kartu 2)</label>
                  <select id="ed_flazz_card_id_2" class="form-select"></select></div>
                <div class='col-12 col-md-6'><label class='form-label small fw-bold'>Nominal Tol (kartu 2)</label>
                  <input id="ed_biaya_toll_2" type="number" min="0" class="form-control" placeholder="0"></div>
                <div class='col-12 col-md-6'><label class='form-label small fw-bold'>Kartu Flazz Tol (kartu 2)</label>
                  <select id="ed_flazz_card_id_toll_2" class="form-select"></select></div>
```

Di `js.html` pada fungsi edit (sekitar baris 2424-2428 dan 2468-2500):

```js
    var cards2 = (window.masterData && window.masterData.flazzCards) ? window.masterData.flazzCards : [];
    ['ed_flazz_card_id_2', 'ed_flazz_card_id_toll_2'].forEach(function (selId) {
      var sel = document.getElementById(selId);
      if (!sel) return;
      sel.innerHTML = '<option value="">Pilih Kartu...</option>';
      cards2.forEach(function (c) {
        if (c.status === 'NONAKTIF') return;
        var o = document.createElement('option');
        o.value = c.id; o.text = c.card_number + ' - ' + c.card_type;
        sel.appendChild(o);
      });
    });
    var eb1 = document.getElementById('ed_biaya_bbm_2'); if (eb1) eb1.value = row.biaya_bbm_2 || '';
    var eb2 = document.getElementById('ed_flazz_card_id_2'); if (eb2 && row.flazz_card_id_2) eb2.value = row.flazz_card_id_2;
    var eb3 = document.getElementById('ed_biaya_toll_2'); if (eb3) eb3.value = row.biaya_toll_2 || '';
    var eb4 = document.getElementById('ed_flazz_card_id_toll_2'); if (eb4 && row.flazz_card_id_toll_2) eb4.value = row.flazz_card_id_toll_2;
```

Dan pada payload submit edit (sekitar baris 2494-2500):

```js
      biaya_bbm_2: (document.getElementById('ed_biaya_bbm_2') || {}).value || 0,
      flazz_card_id_2: (document.getElementById('ed_flazz_card_id_2') || {}).value || '',
      biaya_toll_2: (document.getElementById('ed_biaya_toll_2') || {}).value || 0,
      flazz_card_id_toll_2: (document.getElementById('ed_flazz_card_id_toll_2') || {}).value || '',
```

- [ ] **Step 11: `updateLiveSummary` ikut grup-2**

Di `js.html` sekitar baris 793-794, tambahkan:

```js
    var bb2 = document.getElementById('biaya_bbm_2') ? (parseFloat(document.getElementById('biaya_bbm_2').value) || 0) : 0;
    var tt2 = document.getElementById('biaya_toll_2') ? (parseFloat(document.getElementById('biaya_toll_2').value) || 0) : 0;
```

dan tambahkan `bb2`/`tt2` ke perhitungan total yang ditampilkan.

- [ ] **Step 12: Bump `PAGE_VER`**

Tambahkan 1 pada definisi `PAGE_VER` yang ditemukan di Step 1.

- [ ] **Step 13: Commit**

```bash
git add src/Index.html src/js.html src/Config.gs
git commit -m "feat(bbm): form expenditures kelompok kartu ke-2"
```

---

### Task 11: Dokumentasi + verifikasi regresi

**Files:**
- Modify: `README.md:72`, `README.md:152`

**Interfaces:**
- Consumes: seluruh Task 1-10
- Produces: tidak ada

- [ ] **Step 1: Jalankan seluruh test node**

Run: `node scratch/test-payment-logic.js; node scratch/test-jalur-status.js; node scratch/test-schema.js; node scratch/jalur-autofill-guard-test.js; node scratch/test-jalur-release.js`
Expected: semua `0 failed`

- [ ] **Step 2: Verifikasi tidak ada sisa pemanggilan API lama**

Run:
```powershell
Select-String -Path src\*.js -Pattern "distinctFlazzCards\("
Select-String -Path src\FlazzOps.js -Pattern "updateJalurStatus"
```
Expected: tidak ada output untuk keduanya.

- [ ] **Step 3: Update README**

Pada bagian yang menjelaskan "Buat Jalur" (`README.md:108`), tambahkan: kartu etoll opsional ke-2 per baris. Pada bagian sinkronisasi nama kartu (`:72`), tambahkan bahwa rename kartu juga memperbarui `flazz_card_name_2`. Pada daftar sheet (`:152`), tidak ada perubahan nama sheet sehingga tidak perlu diedit.

- [ ] **Step 4: Verifikasi manual di Apps Script Editor**

1. Jalankan `setupDatabase()` — pastikan 2 kolom baru muncul di `Jalur_Pengiriman` dan 4 di `Penggunaan_BBM`, serta kolom lama tidak bergeser.
2. Jalankan `node scratch/test-schema.js` sebagai konfirmasi header.
3. Login PIC, buat 1 jalur dengan 1 kartu saja → pastikan `Flazz_Usage` tetap 1 baris dan id format `USE-<ms>-1`.
4. Input laporan dengan 1 kartu → dashboard bulanan(amount) harus sama seperti sebelum perubahan.
5. Ulangi langkah 3-4 dengan 2 kartu dan grup-2 terisi → dashboard harus menjumlahkan kedua kelompok.
6. Rekonsiliasi **hanya** kartu A → jalur harus tetap `SUDAH_LAPORAN`.
7. Rekonsiliasi kartu B → jalur harus menjadi `SELESAI`.
8. Hapus rekon kartu A → jalur harus kembali `SUDAH_LAPORAN`.
9. Hapus jalur 2 kartu → kedua kartu harus `TERSEDIA`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: dua kartu etoll per jalur & expenditures kelompok kedua"
```

---

## Self-Review

**1. Spec coverage**

| Section spec | Task |
|---|---|
| §4.1 `Jalur_Pengiriman` +2 kolom | 1 |
| §4.2 `Penggunaan_BBM` +4 kolom | 1 |
| §4.3 aturan migration | 1 (Step 3) + Global Constraints |
| §5.1 helper baru | 2 (Step 4) |
| §5.2 rewrite 5 fungsi | 2 (Step 5, 6) |
| §5.3 3 call site | 2 (Step 6 alias), 6 (Step 5), 7 (Step 4, 6) |
| §6.1 `saveJalur` | 5 (Step 6) |
| §6.2 `updateJalur` symmetric diff | 5 (Step 7) |
| §6.3 `deleteJalur` | 5 (Step 8) |
| §6.4 `findJalurByCriteria` | 5 (Step 4) |
| §6.5A gate tidak berubah | 5 (Step 11) + Global Constraints |
| §6.5B `recomputeJalurStatus` | 4 (murni), 5 (Step 5) |
| §6.6 `findJalurRow`, `getJalurDriversForDate` | 5 (Step 3, 10) |
| §7 rekon, backfill nama, dashboard data, delete trx | 6 (Step 1-5) |
| §8 dashboard & ringkasan | 3 (Step 5), 7 (Step 3, 7), 6 (Step 5) |
| §9 backend laporan | 7 (Step 1, 2, 4, 5, 6) |
| §10.1 UI Jalur | 9 |
| §10.2 UI Laporan | 10 |
| §11 bug id `Flazz_Usage` | 1 (Step 5) |
| §12 backward compatibility | Global Constraints + Task 11 (Step 4) |
| §13 ruang lingkup | Global Constraints |
| §14 pengujian | 1, 2, 3, 4, 5, 11 |

Tidak ada section spec tanpa task.

**2. Placeholder scan** — tidak ada `TBD`/`TODO`/"similar to Task N". Semua langkah kode menampilkan kode konkret.

**3. Type consistency**

- `jalurCardIds(a, b)` → `string[]` — dipakai di `JalurOps.js:jalurAssignedCards`, `saveJalur`, `updateJalur`, `deleteJalur`, `backfillJalurStatus`, dan `JalurStatus.js` (internal). Konsisten.
- `jalurFinalStatus(laporanId, cardIds, tanggalJalur, reconMaxTglByCard)` → status string — sama di Task 4 (definisi + test) dan Task 5 (2 pemakai). Konsisten.
- `cardGroups(row)` → grup dengan kunci `{mBbm, cBbm, bBbm, mTol, cTol, bTol}` — dipakai `flazzBbmShare`, `flazzTolShare`, `isFlazzRowForCard`, `distinctFlazzCardsOf`, `getFlazzDashboardData`. Kunci group-2 di `group2FromRow` sama persis. Konsisten.
- `distinctFlazzCardsOf(state)` — 3 pemNAM (Task 7 Step 4, Task 7 Step 6, Task 6 Step 5). Semua memakai nama yang sama. Konsisten.
- Kunci grup-2 pada state object: `cardBbm2`, `biayaBbm2`, `cardTol2`, `biayaTol2` — didefinisikan di `pickField` (Task 2 Step 4) dan dipakai di Task 7 Step 6 (`oldPayState`/`newPayState`) serta test Task 2. Konsisten.
- `recomputeJalurStatus(jalurId, knownRowIndex)` — Task 5 (definisi), Task 6 Step 1-2 (2 pemakai). Konsisten.
- `rowBbmTotal(row)` / `rowTolTotal(row)` — Task 3 (definisi + test), Task 7 Step 3, 7. Konsisten.

**Catatan implementasi yang sudah ditulis di plan:** Task 6 Step 4 dan Task 7 Step 5 memuat instruksi untuk menyesuaikan nama variabel dengan kode yang ada (`tollsCombined` mungkin tidak nama sebenarnya; `hdrIdx` harus punya cache yang di-invalidate). Ini disengaja — kedua titik itu butuh pembacaan file target saat eksekusi, dan plan menyuruhkannya secara eksplisit alih-alih menebak nama yang salah.

---

## Koreksi Plan (dicatat saat eksekusi, 2026-09-26)

Plan ini dieksekusi task-by-task dan_commit di `master`. Enam defect plan ditemukan
selama eksekusi; koreksi berikut SUDAH diterapkan di kode dan ditampilkan di sini
agar plan tidak menyesatkan pembaca di kemudian hari.

### D-P1 — Task 5 Step: `getJalurByTanggal` tidak menampilkan kolom `_2`

Plan tidak menyebut perlu mengembalikan `flazz_card_id_2` / `flazz_card_name_2`
dari `getJalurByTanggal`. Tanpa itu, prefill form Input Laporan tidak akan pernah
mendapati kartu kedua jalur. **Koreksi:** kedua field ditambahkan dan ikut
di-normalisasi (canonical) seperti slot-1.

### D-P2 — Task 6: nama fungsi hapus salah

Plan menyebut `deleteFlazzTransaction`; nama sebenarnya di `FlazzOps.js` adalah
`deleteFlazzBBMUnlocked`. **Koreksi:** implementasi mengikuti nama asli.

### D-P3 — Task 7: nama variabel payload salah

Plan menulis `data.etoll_card_id_2`; field payload yang benar mengikuti penamaan
kolom sheet, yaitu `flazz_card_id_2` / `flazz_card_id_toll_2`. **Koreksi:**
implementasi memakai nama payload yang benar.

### D-P4 — Task 7 / D5: `isDuplicateTransaction` diimplementasikan

Global Constraint dan D5 di design menyatakan `isDuplicateTransaction` **tidak**
diperbaiki. Namun Task 7 tetap harus membaca nominal grup-2 agar dua laporan
berbeda kartu tidak dianggap identik. Fungsi ini diimplementasikan dengan
**penjaga indeks aman**: kolom baru yang belum ada dianggap bernilai sama
(kosong), sehingga baris lama tidak pernah salah terdeteksi duplikat.
**Koreksi:** constraint D5 di superseded oleh Task 7 — dibatasi pada pembacaan
grup-2, tanpa menghidupkan perbandingan `km_awal`/`liter` yang lama selalu mati.

### D-P5 — Task 10 Step 7: validasi grup-2 bertentangan dengan D1

Plan Step 7 mensyaratkan **error** bila nominal grup-2 terisi tanpa kartu, dan
**error** bila `flazz_card_id_2 === flazz_card_id`. Keduanya bertentangan dengan
design:

- **D1** (design:31) menetapkan nominal > 0 tanpa kartu grup-2 = `TUNAI`.
  Server `SpreadsheetOps` juga hanya menulis expense ke kartu bila kartu ada
  (`if (payload.flazz_card_id_2) addFlazzCheck(...)`), jadi error di client
  akan menolak transaksi yang sah.
- **Design:206** menyatakan grup-1 + grup-2 yang jatuh ke kartu **sama otomatis
  ter-aggregate** pada gate saldo — jadi kartu yang sama di kedua slot adalah
  kondisi yang *dirancang*, bukan pelanggaran. Aturan "harus berbeda" hanya
  berlaku pada form **Jalur** (Task 9), bukan form Input Laporan.

**Koreksi:** Step 7 tidak diimplementasikan. Client hanya menampilkan
penjelasan pada label option (`Tanpa kartu (tunai)`) dan menampilkan baris
ringkasan "Kartu ke-2" bila grup-2 terpakai.

### D-P6 — Task 10 Step 9/10: prefill grup-2 & id field modal

- Step 9 (prefill dari laporan terakhir) tidak menyebut bahwa `isi_bensin` juga
  harus memperhitungkan nominal grup-2. Tanpa itu, laporan yang hanya memakai
  kartu ke-2 akan ditandai "tidak isi bensin" dan baris `biayaPrefill` menimpa
  nilai `isi_bbm` yang sudah diisi `syncBensinTersirat`. **Koreksi:** keduanya
  (sinkron + prefill) menghitung `biaya_bbm_2` / `biaya_toll_2`.
- Step 10 memberi id modal `ed_biaya_bbm_2`, sementara Task 10 markup group-2
  memakai pola `ed_biaya_*`. **Koreksi:** id final diseragamkan menjadi
  `ed_biaya_bbm_2` (BBM) dan `ed_biaya_toll_2` (tol), mengikuti penamaan kolom
  sheet.

### Verifikasi akhir (Task 11)

Seluruh suite hijau pada commit `0a56498`:

| Suite | Hasil |
|---|---|
| `test-payment-logic.js` | 101 passed, 0 failed |
| `test-schema.js` | 15 passed, 0 failed |
| `test-jalur-status.js` | 25 passed, 0 failed |
| `jalur-autofill-guard-test.js` | ALL PASS |
| `flazz-dual-card-guard-test.js` | 26 passed, 0 failed |
| `spreadsheet-dual-card-guard-test.js` | 35 passed, 0 failed |
| `jalur-ui-dual-card-guard-test.js` | 29 passed, 0 failed |
| `laporan-ui-dual-card-guard-test.js` | 39 passed, 0 failed |
| `test-jalur-release.js` | 8 passed, 0 failed |

Sisa pemanggilan API lama: `distinctFlazzCards(` tidak ada di `src/*.js`, dan
`updateJalurStatus` tidak ada di `src/FlazzOps.js` (semua lewat
`recomputeJalurStatus`).

### Yang belum diverifikasi (butuh Apps Script Editor)

Task 11 Step 4 (verifikasi manual `setupDatabase` + alur PIC di deployed app)
tidak dapat dijalankan dari lingkungan ini — spreadsheet dan deployment tidak
terhubung. Langkah manual tersebut tetap WAJIB dijalankan sebelum rilis.
