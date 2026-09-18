# Buka Kembali Edit & Hapus PIC di Daftar Jalur & History Laporan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengizinkan PIC CABANG mengedit & menghapus laporan BBM (History Laporan) dan jadwal jalur (Daftar Jalur) **hanya di cabangnya sendiri**, dengan SUPERADMIN tetap penuh.

**Architecture:** Buka kembali guard server dengan memanfaatkan helper scoping cabang yang sudah ada — buang `assertSuperadminOnly` di dua fungsi laporan (mengandalkan `assertTransactionAccess` yang sudah ada), dan ganti `assertSuperadminOnly` di dua fungsi jalur dengan `assertMasterAccess` + `assertOwnWarehouse(kode_cabang)` (pola `insertKendaraan`). Di frontend, tampilkan tombol & izinkan guard untuk `SUPERADMIN || PIC CABANG`. Tes keamanan diperbarui ke kontrak baru (lolos gate role, masih diblokir scoping lintas-cabang).

**Tech Stack:** Google Apps Script (server: `*.gs`; frontend: `js.html`/`JalurScript.html`), Google Sheets, Testing: `TestRunner.js` (suite in-sheet, dijalankan manual via Apps Script) + `node --check`/kompilasi `<script>` untuk sintaks.

## Global Constraints

- Commit **hanya** `src/*` dan `appsscript.json`. JANGAN commit `.opencode/`, `deploy.ps1`, `docs/superpowers/plans/*`.
- `PAGE_VER` di `src/Config.gs` harus naik bila ada perubahan UI → `20260917v5` (Task 5).
- Semua nilai user harus dirender lewat `esc()` (sudah berlaku; jangan regresikan).
- Branch kerja `master`; ikuti gaya commit repositori (`feat:`, `test:`, `docs:`, `fix:`).
- Verifikasi: `node --check` untuk tiap `.js`/`.gs` yang berubah; cek sintaks inline `<script>` di HTML yang berubah (perintah disediakan).
- Suite `__runAllTests` hanya bisa dijalankan manual via Apps Script **di project asli** (bukan clone spreadsheet/copy — snapshot kode di clone tidak mengikuti `clasp push`). Deploy terakhir dulu (`clasp push`), baru jalankan suite.
- Deploy: `clasp push -f` lalu `clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF -d "<desc>"` dari `D:\Monitoring BBM\src`. Version saat ini **@284**.

---

### Task 1: Backend laporan — buka akses PIC + perbarui tes laporan

**Files:**
- Modify: `src/SpreadsheetOps.js:944` (hapus guard), `src/SpreadsheetOps.js:1212` (hapus guard)
- Test: `src/TestRunner.js:160-161`

**Interfaces:**
- Consumes: `assertTransactionAccess(userInfo, branchId)` sudah ada (`SpreadsheetOps.js:1354`) — SUPERADMIN lolos; PIC hanya jika `branchId === userInfo.cabang`.
- Produces: `editDailyTransactionUnlocked(payload, userInfo, token)` dan `deleteDailyTransactionUnlocked(transactionId, userInfo, token)` tidak lagi menolak PIC murni karena role; scoping cabang tetap oleh `assertTransactionAccess` yang sudah dipanggil di dalam fungsi.

- [ ] **Step 1: Tulis perubahan tes yang gagal dulu (kontrak baru)**

Di `src/TestRunner.js`, ganti 2 baris blok "PIC read-only" (baris 160-161) yang sekarang:

```js
results.push(__expectDenied(function() { return editDailyTransactionUnlocked({}, pic); }, 'SUPERADMIN', 'PIC edit laporan -> ditolak'));
results.push(__expectDenied(function() { return deleteDailyTransactionUnlocked('###TAK-ADA###', pic); }, 'SUPERADMIN', 'PIC hapus laporan -> ditolak'));
```

menjadi:

```js
results.push(__expectDenied(function() { return editDailyTransactionUnlocked({}, pic); }, 'Transaksi tidak ditemukan', 'PIC edit laporan -> lolos gate role, divalidasi data'));
results.push(__expectDenied(function() { return deleteDailyTransactionUnlocked('###TAK-ADA###', pic); }, 'Transaksi tidak ditemukan', 'PIC hapus laporan -> lolos gate role, divalidasi data'));
results.push(__expectDenied(function() { return assertTransactionAccess(pic, 'CBG-BDG'); }, 'hanya dapat mengelola transaksi warehouse', 'PIC transaksi cabang lain -> ditolak scoping'));
try {
  assertTransactionAccess(pic, 'CBG-JKT');
  results.push(__expectEqual(true, true, 'PIC transaksi cabang sendiri -> lolos scoping'));
} catch (e) {
  results.push(__expectEqual(true, false, 'PIC transaksi cabang sendiri -> lolos scoping (gagal: ' + e.message + ')'));
}
```

- [ ] **Step 2: Jalankan sintaks**

Run: `node --check src\TestRunner.js`
Expected: tidak ada output, exit 0.

- [ ] **Step 3: Implementasi minimal — hapus 2 guard laporan**

`src/SpreadsheetOps.js` — di `editDailyTransactionUnlocked` hapus baris berikut (saat ini baris 944):

```js
    assertSuperadminOnly(userInfo, 'mengedit laporan BBM');
```

`src/SpreadsheetOps.js` — di `deleteDailyTransactionUnlocked` hapus baris berikut (saat ini baris 1212):

```js
    assertSuperadminOnly(userInfo, 'menghapus laporan BBM');
```

Jangan ubah apa pun yang lain. `assertTransactionAccess` di body (baris 1004 & 1256) yang menegakkan scoping tidak disentuh.

- [ ] **Step 4: Jalankan sintaks pada server yang berubah**

Run: `node --check src\SpreadsheetOps.js`
Expected: tidak ada output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/SpreadsheetOps.js src/TestRunner.js
git commit -m "feat(ops): buka akses edit & hapus laporan BBM untuk PIC (scoping via assertTransactionAccess)"
```

---

### Task 2: Backend jalur — buka akses PIC + perbarui tes jalur

**Files:**
- Modify: `src/JalurOps.js:422-429` (area guard `updateJalur`), `src/JalurOps.js:509-517` (area guard `deleteJalur`)
- Test: `src/TestRunner.js:165-166`

**Interfaces:**
- Consumes:
  - `assertMasterAccess(userInfo, action)` (`SpreadsheetOps.js:1320`) → `'SUPERADMIN'` | `'PIC CABANG'` | throw.
  - `assertOwnWarehouse(userInfo, cabang, label)` (`SpreadsheetOps.js:1333`) → throw bila `cabang !== userInfo.cabang`.
  - `findJalurRow(sheet, id)` (`JalurOps.js:38`) → `{ rowIndex, row, idx }` dengan `idx['kode_cabang']` tersedia.
- Produces: `updateJalur(data, token)` / `deleteJalur(id, token)`: SUPERADMIN lolos penuh; PIC hanya jika `kode_cabang` jalur === `userInfo.cabang`. Id tidak dikenal → tetap `Jadwal tidak ditemukan.` sebelum cek scoping.

- [ ] **Step 1: Tulis perubahan tes yang gagal dulu (kontrak baru)**

Di `src/TestRunner.js`, ganti 2 baris berikut (baris 165-166) yang sekarang:

```js
results.push(__expectDenied(function() { return updateJalur({ id: '###TAK-ADA###' }, picToken); }, 'SUPERADMIN', 'PIC update jalur -> ditolak'));
results.push(__expectDenied(function() { return deleteJalur('###TAK-ADA###', picToken); }, 'SUPERADMIN', 'PIC hapus jalur -> ditolak'));
```

menjadi:

```js
results.push(__expectDenied(function() { return updateJalur({ id: '###TAK-ADA###' }, picToken); }, 'Jadwal tidak ditemukan', 'PIC update jalur -> lolos gate role, divalidasi data'));
results.push(__expectDenied(function() { return deleteJalur('###TAK-ADA###', picToken); }, 'Jadwal tidak ditemukan', 'PIC hapus jalur -> lolos gate role, divalidasi data'));
results.push(__expectDenied(function() {
  if (assertMasterAccess(pic, 'uji') !== 'SUPERADMIN') assertOwnWarehouse(pic, 'CBG-BDG', 'Jadwal pengiriman');
}, 'tidak berada di warehouse', 'PIC jalur cabang lain -> ditolak scoping'));
try {
  assertOwnWarehouse(pic, 'CBG-JKT');
  results.push(__expectEqual(true, true, 'PIC jalur cabang sendiri -> lolos scoping'));
} catch (e) {
  results.push(__expectEqual(true, false, 'PIC jalur cabang sendiri -> lolos scoping (gagal: ' + e.message + ')'));
}
```

- [ ] **Step 2: Jalankan sintaks**

Run: `node --check src\TestRunner.js`
Expected: tidak ada output, exit 0.

- [ ] **Step 3: Implementasi minimal — ganti guard `updateJalur`**

`src/JalurOps.js` baris 422-429. Dari:

```js
function updateJalur(data, token) {
  try {
    const userInfo = requireUser(token);
    assertSuperadminOnly(userInfo, 'memperbarui jadwal pengiriman');
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan.');
    const found = findJalurRow(sheet, data.id);
    if (!found) throw new Error('Jadwal tidak ditemukan.');
    const idx = found.idx;
```

menjadi:

```js
function updateJalur(data, token) {
  try {
    const userInfo = requireUser(token);
    const updateRole = assertMasterAccess(userInfo, 'memperbarui jadwal pengiriman');
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan.');
    const found = findJalurRow(sheet, data.id);
    if (!found) throw new Error('Jadwal tidak ditemukan.');
    const idx = found.idx;
    if (updateRole !== 'SUPERADMIN') {
      assertOwnWarehouse(userInfo, (idx['kode_cabang'] !== undefined) ? String(found.row[idx['kode_cabang']] || '') : '', 'Jadwal pengiriman');
    }
```

- [ ] **Step 4: Implementasi minimal — ganti guard `deleteJalur`**

`src/JalurOps.js` baris 509-517. Dari:

```js
function deleteJalur(id, token) {
  try {
    const userInfo = requireUser(token);
    assertSuperadminOnly(userInfo, 'menghapus jadwal pengiriman');
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan.');
    const found = findJalurRow(sheet, id);
    if (!found) throw new Error('Jadwal tidak ditemukan.');
    const idx = found.idx;
```

menjadi:

```js
function deleteJalur(id, token) {
  try {
    const userInfo = requireUser(token);
    const deleteRole = assertMasterAccess(userInfo, 'menghapus jadwal pengiriman');
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan.');
    const found = findJalurRow(sheet, id);
    if (!found) throw new Error('Jadwal tidak ditemukan.');
    const idx = found.idx;
    if (deleteRole !== 'SUPERADMIN') {
      assertOwnWarehouse(userInfo, (idx['kode_cabang'] !== undefined) ? String(found.row[idx['kode_cabang']] || '') : '', 'Jadwal pengiriman');
    }
```

- [ ] **Step 5: Jalankan sintaks**

Run: `node --check src\JalurOps.js` dan `node --check src\TestRunner.js`
Expected: keduanya tidak ada output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/JalurOps.js src/TestRunner.js
git commit -m "feat(ops): buka akses edit & hapus jalur untuk PIC (scoping via assertOwnWarehouse)"
```

---

### Task 3: UI jalur — tampilkan & izinkan tombol untuk PIC

**Files:**
- Modify: `src/JalurScript.html:140-145` (tambah helper), `src/JalurScript.html:327` (render tombol), `src/JalurScript.html:491` (`jalurEdit`), `src/JalurScript.html:535` (`jalurSaveEdit`), `src/JalurScript.html:566` (`jalurDelete`)

**Interfaces:**
- Consumes: variabel global `userRole` (dari sesi login). Server `getJalurByTanggal` sudah men-scope daftar PIC ke cabangnya — tombol yang dirender selalu untuk baris cabang PIC.
- Produces: helper `jalurCanOperate()` dipakai seluruh elemen UI jalur di file ini.

- [ ] **Step 1: Tambah helper `jalurCanOperate()`**

Di `src/JalurScript.html`, segera setelah definisi `jalurActiveCabang()` (sekitar baris 139-145), tambahkan:

```js
function jalurCanOperate() {
  return typeof userRole !== 'undefined' && (userRole === 'SUPERADMIN' || userRole === 'PIC CABANG');
}
```

- [ ] **Step 2: Render kolom aksi — izinkan PIC**

`src/JalurScript.html:327`. Dari:

```js
            '<td class="text-end">' + (typeof userRole !== 'undefined' && userRole === 'SUPERADMIN'
```

menjadi:

```js
            '<td class="text-end">' + (jalurCanOperate()
```

- [ ] **Step 3: Guard `jalurEdit` — izinkan PIC**

`src/JalurScript.html:491`. Dari:

```js
  if (typeof userRole !== 'undefined' && userRole !== 'SUPERADMIN') { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

menjadi:

```js
  if (!jalurCanOperate()) { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

- [ ] **Step 4: Guard `jalurSaveEdit` — izinkan PIC**

`src/JalurScript.html:535`. Dari:

```js
  if (typeof userRole !== 'undefined' && userRole !== 'SUPERADMIN') { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

menjadi:

```js
  if (!jalurCanOperate()) { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

- [ ] **Step 5: Guard `jalurDelete` — izinkan PIC**

`src/JalurScript.html:566`. Dari:

```js
  if (typeof userRole !== 'undefined' && userRole !== 'SUPERADMIN') { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

menjadi:

```js
  if (!jalurCanOperate()) { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

- [ ] **Step 6: Validasi sintaks inline script**

Run (dari `D:\Monitoring BBM`):

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('src/JalurScript.html','utf8');const re=/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;let m,c=0;while((m=re.exec(s))){new Function(m[1]);c++;}console.log('OK scripts:',c);"
```

Expected: `OK scripts: 1` (atau jumlah blok inline), tanpa error kompilasi.

- [ ] **Step 7: Commit**

```bash
git add src/JalurScript.html
git commit -m "feat(ui): tampilkan & izinkan aksi edit/hapus jalur untuk PIC"
```

---

### Task 4: UI laporan — tampilkan & izinkan tombol untuk PIC

**Files:**
- Modify: `src/js.html:1950` (render tabel), `src/js.html:1989` (render kartu), `src/js.html:2133` (`editDaily`), `src/js.html:2142` (`enterEditMode`), `src/js.html:2460` (`deleteDaily`)

**Interfaces:**
- Consumes: variabel global `userRole`; `getDashboardData` (server) sudah men-scope daftar History Laporan PIC ke cabangnya.
- Produces: tombol Edit/Hapus laporan tampil & jalan untuk `SUPERADMIN || PIC CABANG`.

- [ ] **Step 1: Render tabel History — izinkan PIC**

`src/js.html:1950`. Dari:

```js
          (userRole === 'SUPERADMIN'
            ? "<button class='btn btn-sm btn-outline-primary' title='Edit Laporan' aria-label='Edit laporan' onclick='editDaily(" + JSON.stringify(row.transaction_id) + ")'><i class='bi bi-pencil'></i></button> " +
```

menjadi:

```js
          (userRole === 'SUPERADMIN' || userRole === 'PIC CABANG'
            ? "<button class='btn btn-sm btn-outline-primary' title='Edit Laporan' aria-label='Edit laporan' onclick='editDaily(" + JSON.stringify(row.transaction_id) + ")'><i class='bi bi-pencil'></i></button> " +
```

- [ ] **Step 2: Render kartu History — izinkan PIC**

`src/js.html:1989`. Dari:

```js
          (userRole === 'SUPERADMIN'
            ? "<div class='d-flex justify-content-end gap-2 mt-2'>" +
```

menjadi:

```js
          (userRole === 'SUPERADMIN' || userRole === 'PIC CABANG'
            ? "<div class='d-flex justify-content-end gap-2 mt-2'>" +
```

- [ ] **Step 3: Guard `editDaily` — izinkan PIC**

`src/js.html:2133`. Dari:

```js
    if (userRole !== 'SUPERADMIN') { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

menjadi:

```js
    if (userRole !== 'SUPERADMIN' && userRole !== 'PIC CABANG') { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

- [ ] **Step 4: Guard `enterEditMode` — izinkan PIC**

`src/js.html:2142`. Dari:

```js
    if (userRole !== 'SUPERADMIN') return;
```

menjadi:

```js
    if (userRole !== 'SUPERADMIN' && userRole !== 'PIC CABANG') return;
```

- [ ] **Step 5: Guard `deleteDaily` — izinkan PIC**

`src/js.html:2460`. Dari:

```js
    if (userRole !== 'SUPERADMIN') { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

menjadi:

```js
    if (userRole !== 'SUPERADMIN' && userRole !== 'PIC CABANG') { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
```

- [ ] **Step 6: Validasi sintaks inline script**

Run (dari `D:\Monitoring BBM`):

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('src/js.html','utf8');const re=/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g;let m,c=0;while((m=re.exec(s))){new Function(m[1]);c++;}console.log('OK scripts:',c);"
```

Expected: `OK scripts: <N>` tanpa error kompilasi.

- [ ] **Step 7: Commit**

```bash
git add src/js.html
git commit -m "feat(ui): tampilkan & izinkan aksi edit/hapus laporan untuk PIC"
```

---

### Task 5: Versi, README, verifikasi penuh, deploy

**Files:**
- Modify: `src/Config.gs` (PAGE_VER), `README.md` (bullet keamanan PIC)

**Interfaces:**
- Consumes: hasil Task 1-4.
- Produces: versi UI `20260917v5`, dokumentasi keamanan terbaru, deployment **@285**.

- [ ] **Step 1: Naikkan PAGE_VER**

`src/Config.gs` — ubah:

```js
const PAGE_VER = '20260917v4';
```

menjadi:

```js
const PAGE_VER = '20260917v5';
```

- [ ] **Step 2: Perbarui bullet keamanan README**

Di `README.md`, pada paragraf/bullet keamanan PIC yang menyebut "edit/hapus laporan harian, edit/hapus jalur pengiriman ... dikunci SUPERADMIN", sesuaikan kalimatnya. Contoh pernyataan baru (sesuaikan dengan tulisan asli bullet-nya):

```text
PIC CABANG kini dapat MENGEDIT & MENGHAPUS laporan harian dan jadwal jalur pengiriman untuk cabangnya sendiri; SUPERADMIN penuh untuk semua cabang. Akses lintas-cabang tetap ditolak server-side. Aksi operasional lain (hapus BBM dari Flazz, serah kartu manual, top-up tol manual, dsb.) tetap SUPERADMIN-only.
```

- [ ] **Step 3: Verifikasi sintaks seluruh file yang berubah**

Run:

```bash
node --check src\Config.gs
node --check src\SpreadsheetOps.js
node --check src\JalurOps.js
node --check src\TestRunner.js
```

Expected: semua tidak ada output, exit 0.

- [ ] **Step 4: Push + jalankan suite kontrak di Apps Script**

```bash
cd src
clasp push -f
```

Expected: tidak ada error push.

Lalu di Apps Script editor **project asli** (bukan clone spreadsheet/copy), jalankan `__runAllTests`:
- 4 asersi lama ("PIC edit/hapus laporan & jalur -> ditolak SUPERADMIN") sudah tidak ada.
- Asersi baru "lolos gate role, divalidasi data" + scoping lintas-cabang diblokir → PASS.
- Grup keamanan lainnya (token palsu, pemalsuan role, top-up/rekon) tetap hijau.

Catatan: bila proyek sedang menunjuk ke PROD (`spreadsheetId()`), guard PROD bisa memblokir suite; gunakan spreadsheet test (set Script Property `SPREADSHEET_ID` = spreadsheet test) bila perlu, lalu hapus property setelah selesai.

- [ ] **Step 5: Smoke manual kontrak baru**

- Login SUPERADMIN: History Laporan & Daftar Jalur lintas cabang → tombol Edit/Hapus berfungsi penuh.
- Login PIC cabang X: tombol Edit/Hapus tampil; edit & hapus laporan/jalur cabang X berhasil; hash/cabang lain tidak tampil dan akses API lintas-cabang ditolak.

- [ ] **Step 6: Deploy**

```bash
clasp push -f
clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF -d "buka akses edit & hapus laporan+jalur untuk PIC (scoping cabang)"
```

Expected: deployment id `@285` aktif.

- [ ] **Step 7: Commit penutup**

```bash
git add src/Config.gs README.md
git commit -m "docs: PIC dapat edit & hapus laporan/jalur cabang sendiri; bump PAGE_VER v5"
```