# Fase P1 — Performance & Data Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat aplikasi tetap responsif dan terpelihara untuk 12 cabang × 2 user/cabang pada satu Google Spreadsheet: konfigurasi terpusat, cache server-side, pembacaan range terbatas (hentikan full-scan), summary bulanan ter-materialisasi, audit log menyeluruh, dan backup otomatis harian.

**Architecture:** Seluruh akses spreadsheet dirutekan lewat `Config.gs` (+ `getDB()`), bukan literal ID. Data yang jarang berubah (master, ringkasan performa) di-cache di `CacheService`. Fungsi berat `getRecentTransactions`/`getPerformaSummary`/`getFlazzDashboardData` membongkar ulang hanya kolom/baris yang diperlukan. Ringkasan bulanan per cabang dimaterialisasi ke sheet `Dashboard` dan dihitung ulang saat mutasi (di dalam `withLock` dari Fase P0). Backup harian disalin otomatis via trigger.

**Tech Stack:** Google Apps Script V8, `CacheService`, `LockService` (dari P0), `PropertiesService`, SpreadsheetApp/DriveApp, `ScriptApp.newTrigger`.

## Global Constraints

- **Prasyarat: Fase P0 selesai** — semua entry point token-based, `withLock` terpasang, `getDB()` dipakai di `SpreadsheetOps`/`DatabaseSetup`.
- Semua fungsi yang dipanggil client tetap `token` di parameter terakhir (tidak boleh berubah namanya).
- Penggantian literal `openById` **tidak boleh** menyentuh file debug (`debug.js`, `debug_agus.js`) — file itu dijadwalkan hapus di P0.
- Cache `CacheService`: key selalu diawali prefix (`cfg:`, `master:`, `perf:`, `sum:`); TTL wajar (master 120 dtk, performa/summary 300 dtk).
- Setiap invalidasi cache dipanggil segera setelah mutasi yang bersangkutan berhasil, pada fungsi penulis yang sama (lewat wrapper di `Code.js` / di dalam fungsi `*Unlocked` untuk transaksi harian).
- `Dashboard` sheet memakai kolom: `cabang`, `periode` (`YYYY-MM`), `total_transaksi`, `total_liter`, `total_biaya_bbm`, `total_toll`, `updated_at`.
- Commit memakai gaya repo, bahasa Indonesia.

---

### Task 1: Konfigurasi terpusat (`Config.gs`) + hapus literal `openById`

**Files:**
- Create: `src/Config.gs`
- Modify: `src/SpreadsheetOps.js` (`getDB` :2-4)
- Modify: `src/FlazzOps.js` (22 literal)
- Modify: `src/JalurOps.js` (7 literal)

**Interfaces:**
- **Produces:** `spreadsheetId()` → ID aktif `PropertiesService.getScriptProperties()` key `SPREADSHEET_ID`, fallback konstanta `PROD_SPREADSHEET_ID`; `configureSpreadsheet(id)` (terminal, set property); `cacheGet(key)` / `cachePut(key, value, ttlSeconds)`.

- [ ] **Step 1: Buat `src/Config.gs`**

```javascript
// ==========================================
// KONFIGURASI TERPUSAT
// Spreadsheet ID via Script Properties; fallback ke produksi.
// ==========================================

var PROD_SPREADSHEET_ID = '1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8';

function spreadsheetId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id || PROD_SPREADSHEET_ID;
}

function configureSpreadsheet(id) {
  if (!id) return { success: false, msg: 'ID kosong' };
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', String(id).trim());
  return { success: true, msg: 'Spreadsheet aktif diubah ke ' + id };
}

// --- cache helpers (dipakai Task 2) ---
function cacheGet(key) {
  var v = CacheService.getScriptCache().get(key);
  return v ? JSON.parse(v) : null;
}

function cachePut(key, value, ttlSeconds) {
  CacheService.getScriptCache().put(key, JSON.stringify(value), ttlSeconds);
}
```

- [ ] **Step 2: Alihkan `getDB` ke `spreadsheetId()`**

Ganti `src/SpreadsheetOps.js:2-4`:

```javascript
function getDB() {
  return SpreadsheetApp.openById(spreadsheetId());
}
```

- [ ] **Step 3: Ganti literal di `FlazzOps.js` (22)**

Pola penggantian (cari & ganti, case-insensitive):
- `SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSheetByName(` → `getDB().getSheetByName(`
- `SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSpreadsheetTimeZone()` → `getDB().getSpreadsheetTimeZone()`
- `SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8')` (sisanya) → `getDB()`

Verifikasi tidak ada sisa: `Select-String -Path src\FlazzOps.js -Pattern "openById"` → 0 hasil.

- [ ] **Step 4: Ganti literal di `JalurOps.js` (7)**

Gunakan pola yang sama seperti Step 3 (ada dua `openById(...).getSheetByName(...)` di `:7` dan `:330`, dua `openById(...).getSpreadsheetTimeZone()` di `:91` dan `:273`, sisanya `getDB()`).

Verifikasi: `Select-String -Path src\JalurOps.js -Pattern "openById"` → 0 hasil.

- [ ] **Step 5: Verifikasi + commit**

Run: `clasp push`; `clasp run __runAllTests` → `{passed: 12, failed: 0}` (regresi). Di editor `spreadsheetId()` mengembalikan ID produksi.

```bash
git add src/Config.gs src/SpreadsheetOps.js src/FlazzOps.js src/JalurOps.js
git commit -m "refactor: konfigurasi spreadsheet terpusat di Config.gs, hilangkan literal openById di FlazzOps & JalurOps"
```

---

### Task 2: Cache server-side untuk master data & performa

**Files:**
- Create: `src/CacheUtil.js`
- Modify: `src/Code.js` (`processInitialData`, `getMasterData`, `getPerformaData`)
- Modify: `src/SpreadsheetOps.js` (master wrapper + transaksi mutasi) — hubungi invalidasi cache

**Interfaces:**
- **Consumes:** `cacheGet`, `cachePut` dari Config.gs.
- **Produces:** `invalidateMaster(role, cabang)`, `invalidatePerforma(role, cabang)`.

- [ ] **Step 1: Buat `src/CacheUtil.js`**

```javascript
// ==========================================
// CACHE UTIL — kunci & invalidasi
// ==========================================

function masterCacheKey(role, cabang) {
  return 'master:' + (role || '') + ':' + (cabang || '');
}

function performaCacheKey(role, cabang) {
  return 'perf:' + (role || '') + ':' + (cabang || '');
}

function invalidateMaster(role, cabang) {
  var c = CacheService.getScriptCache();
  c.remove(masterCacheKey(role, cabang));
  // SUPERADMIN melihat SEMUA cabang; tarik semua variasi
  c.remove(masterCacheKey('SUPERADMIN', ''));
}

function invalidatePerforma(role, cabang) {
  var c = CacheService.getScriptCache();
  c.remove(performaCacheKey(role, cabang));
  c.remove(performaCacheKey('SUPERADMIN', ''));
}
```

> Kelemahan `remove` per-key: variasi cabang PIC lain tetap basi sampai TTL-nya habis. Ini diterima (TTL pendek). Untuk ketelitian, simpan daftar key aktif di Script Cache tambahan — dihindari demi kesederhanaan.

- [ ] **Step 2: Cache di `getMasterData` dan `processInitialData`**

Di `src/Code.js`, ubah kedua fungsi menjadi:

```javascript
function getMasterData(token) {
  var user = requireUser(token);
  var ck = masterCacheKey(user.role, user.cabang);
  var hit = cacheGet(ck);
  if (hit) return hit;
  var payload = {
    vehicles: safeList(function() { return getActiveVehicles(user.role, user.cabang); }),
    drivers: safeList(function() { return getActiveDrivers(user.role, user.cabang); }),
    cabangList: safeList(function() { return getCabangList(); }),
    bbmList: safeList(function() { return getActiveBBM(); }),
    flazzCards: safeList(function() { return getFlazzCards(user.role, user.cabang); }),
    penggunaList: (user.role === 'SUPERADMIN') ? safeList(function() { return getAllUsers(); }) : []
  };
  var out = cleanSerializable(payload);
  cachePut(ck, out, 120);
  return out;
}
```

`processInitialData` — panggil `getMasterData` internal untuk data bersama dan tambahkan `user`/`username`/`role`/`cabang`:

```javascript
function processInitialData(token) {
  var user = requireUser(token);
  ensurePenggunaBBMColumns();
  var base = getMasterData(token);
  base.user = (user.nama || '');
  base.username = user.username;
  base.role = user.role;
  base.cabang = user.cabang;
  return cleanSerializable(base);
}
```

- [ ] **Step 3: Cache di `getPerformaData`**

```javascript
function getPerformaData(token) {
  var user = requireUser(token);
  var ck = performaCacheKey(user.role, user.cabang);
  var hit = cacheGet(ck);
  if (hit) return hit;
  var out = getPerformaSummary(user.role, user.cabang);
  cachePut(ck, out, 300);
  return out;
}
```

- [ ] **Step 4: Invalidasi pada mutasi**

Pada wrapper master di `src/Code.js`, tambahkan invalidasi **setelah** operasi master berhasil (untuk role penulis). Contoh `saveMasterKendaraan`:

```javascript
function saveMasterKendaraan(data, token) {
  var res = insertKendaraan(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
```

Terapkan pola yang sama (panggil `invalidateMaster('SUPERADMIN','')` setelah sukses) untuk: `saveMasterCabang`, `saveMasterKendaraan`, `saveMasterSupir`, `saveMasterBBM`, `saveMasterPengguna`, `updateMaster*`, `deleteMaster*`, `activateMasterPengguna`. Untuk mutasi transaksi harian (`saveDailyTransaction`, `apiEditDailyTransaction`, `apiDeleteDailyTransaction`) panggil `invalidatePerforma(roleUser, cabangUser)` dan pada Dashboard summary (Task 4). Catatan: `roleUser`/`cabangUser` diambil dari user yang sudah di-require dalam fungsi bersangkutan.

- [ ] **Step 5: Verifikasi + commit**

Run: `clasp push`; panggil `getMasterData(token)` dua kali → log (via `Logger`/Stackdriver) hanya satu pembacaan sheet; edit master → panggil lagi → data segar tanpa delay > TTL.

```bash
git add src/CacheUtil.js src/Code.js
git commit -m "feat: cache server-side untuk data master & performa + invalidasi saat mutasi"
```

---

### Task 3: Hentikan full-scan — baca hanya range yang dibutuhkan

**Files:**
- Create: `src/SheetRead.js`
- Modify: `src/SpreadsheetOps.js` (`getRecentTransactions` :483, `getPerformaSummary` :391)
- Modify: `src/FlazzOps.js` (`getFlazzDashboardData` :906)

**Interfaces:**
- **Produces:** `sheetHeaders(sheet)` → `{namaKolom: index}` (0-based); `readLastRows(sheet, n)` → array baris (tanpa header) untuk `n` baris terakhir dari kolom penuh; `readRowsCols(sheet, colIndexes)` → array baris hanya kolom terpilih, dari semua baris data; `colIndex(headers, ...nama)` → `{nama: idx}` atau `-1`.

- [ ] **Step 1: Buat `src/SheetRead.js`**

```javascript
// ==========================================
// PEMBACAAN SHEET EFISIEN (hindari getDataRange penuh)
// ==========================================

function sheetHeaders(sheet) {
  var lastCol = sheet.getLastColumn() || 0;
  if (lastCol === 0) return {};
  var h = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var ci = {};
  h.forEach(function(v, i) { if (v !== '') ci[String(v)] = i; });
  return ci;
}

// n baris terakhir, semua kolom, tanpa header (data.length = 0 bila kosong)
function readLastRows(sheet, n) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var start = Math.max(2, lastRow - n + 1);
  var count = lastRow - start + 1;
  return sheet.getRange(start, 1, count, sheet.getLastColumn()).getValues();
}

// Semua baris data, hanya kolom terpilih. colIndexes: array 0-based.
function readRowsCols(sheet, colIndexes) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var lastCol = sheet.getLastColumn();
  var out = [];
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = [];
    for (var j = 0; j < colIndexes.length; j++) row.push(data[i][colIndexes[j]]);
    out.push(row);
  }
  return out;
}

function colIndex(headers, names) {
  var m = {};
  names.forEach(function(nm) { m[nm] = headers[nm] !== undefined ? headers[nm] : -1; });
  return m;
}
```

> `readRowsCols` tetap membaca rentang penuh kolom internal (GAS harus membungkus range persegi), tapi kita tidak membawa semua kolom ke memori aplikasi — tetap separuh perolehan. Diterima sebagai langkah pertama.

- [ ] **Step 2: Ringankan `getRecentTransactions` — minimal-patch, output IDENTIK**

**Jangan tulis ulang fungsi ini.** Output-nya dibaca 3 handler client (`loadDashboard`, `loadDashboardGallery`, `renderDashboardData` di `src/js.html`) dengan field: `tanggal` (format `id-ID`), `timestamp` (ms), `sub_timestamp` (ms), `user`, `cabang`, `vehicle`, `km_tempuh`, `isi_bbm`, `liter`, `toll`, `biaya_bbm`, `efisiensi`, `status_efisiensi`, `efisiensi_label`, `warning`, `supir`, `transaction_id`, `metode_pembayaran`, `flazz_card_id`, `km_awal`, `km_akhir`, `km_sumber`, semua `foto_*` + versi `_thumb` (dari `driveThumbnail()`). Field-field itu dihasilkan oleh `hitungEfisiensi7Riwayat` + `dynamicWarning` + `driveThumbnail` per baris — mempertahankannya lebih aman daripada merombak schema.

Di `src/SpreadsheetOps.js` hanya 3 substitusi:

1. `:489` — ganti full-scan dengan 2000 baris terakhir:

```javascript
  const data = readLastRows(sheet, 2000);
```

   `readLastRows` mengembalikan baris data **tanpa header**; 2000 baris memberi konteks riwayat rolling-efisiensi 7 hari untuk kendaraan aktif.

2. `:514` — pembangunan `transaksiMap` mulai dari index 0 (karena tanpa baris header):

```javascript
  for (let i = 0; i < data.length; i++) {
```

3. `:537-538` — batas 200 baris tampilan menyesuaikan (tanpa baris header):

```javascript
  let start = data.length > 200 ? data.length - 200 : 0;
```

Semua sisanya (kalkulasi `literKonsumsi`, `hitungEfisiensi7Riwayat`, `dynamicWarning`, `driveThumbnail`, susunan `result.push`, sortir menurun) TIDAK berubah.

> Catatan perilaku: untuk kendaraan dengan riwayat > 2000 baris, efisiensi rolling dihitung ulang dari jendela 2000 baris terakhir (bukan seluruh histori). Untuk 200 baris tampilan terbaru kendaraan aktif, perbedaannya tidak terlihat.

> **Verifikasi kompatibilitas:** setelah `clasp push`, buka dashboard & galeri di mode incognito, pastikan jumlah, nama supir, tanggal, status efisiensi, dan foto tampil identik dengan sebelum perubahan.

- [ ] **Step 3: Ringankan `getPerformaSummary`**

Ikuti kalkulasi rolling-efisiensi `hitungEfisiensi7Riwayat` yang bekerja pada array baris data (bukan header). Di `src/SpreadsheetOps.js`:

1. Ganti `const data = sheet.getDataRange().getValues();` (`:397`) menjadi:

```javascript
  const data = readLastRows(sheet, 5000);
```

2. Ganti indeks awal loop pembangunan `transaksiMap` (`:422`) — karena `readLastRows` mengembalikan **hanya baris data tanpa header**:

```javascript
  for (let i = 0; i < data.length; i++) {
    const vid = data[i][6];
    if (!vid) continue;
    if (role !== 'SUPERADMIN' && data[i][5] !== userCabang) continue;
    if (!transaksiMap[vid]) transaksiMap[vid] = [];
    transaksiMap[vid].push(data[i]);
  }
```

3. Biarkan sisa fungsi (sortir `transaksiMap`, loop `result`, `hitungEfisiensi7Riwayat`) tidak berubah — ia hanya membaca array baris lewat indeks posisi kolom yang sudah memakai urutan header `Penggunaan_BBM` (`kode_cabang`=5, `vehicle_id`=6, dst).

> Tujuan lanjutan (opsional, di luar scope task ini): merombak `getPerformaSummary` memakai `sheetHeaders`/`colIndex` penuh. Tidak wajib karena batas 5000 baris terakhir sudah menghilangkan full-scan dan transaksi terbaru paling relevan untuk efisiensi 7 hari.

- [ ] **Step 4: Ringankan `getFlazzDashboardData`**

Semua panggilan `getSheetData('Flazz_Card'|'Flazz_TopUp'|'Flazz_Tol'|'Flazz_Usage'|'Flazz_Reconciliation')` dan body filter di bawahnya memakai **objek ber-property = nama header**. Pertahankan bentuk output itu persis; cukup ganti sumber bacaannya.

1. Ganti definisi helper `getSheetData` (`src/FlazzOps.js:909-925`) agar memakai `readRowsCols` (bukan `getDataRange`), tetap mengembalikan objek dengan nama properti sesuai header:

```javascript
  function getSheetData(sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    const lastCol = sheet.getLastColumn() || 0;
    if (lastCol === 0) return [];
    const hArr = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const h = sheetHeaders(sheet);
    const cols = hArr.map(function(nm) { return h[String(nm)] !== undefined ? h[String(nm)] : -1; });
    const rows = readRowsCols(sheet, cols);
    let result = [];
    for (let i = 0; i < rows.length; i++) {
      let row = rows[i];
      let obj = {};
      for (let j = 0; j < hArr.length; j++) {
        obj[hArr[j]] = (row[j] instanceof Date) ? row[j].toISOString() : row[j];
      }
      result.push(obj);
    }
    return result;
  }
```

2. Bagian `Penggunaan_BBM` (`:948-984`) — sumber data terbesar aplikasi. Ganti full-scan dengan header + 5000 baris terakhir (loop dari `0` karena `readLastRows` mengembalikan baris data **tanpa header**):

```javascript
    const headers = sheetHeaders(bbmSheet);
    const trxIdx = headers.indexOf('transaction_id');
    const metodeIdx = headers.indexOf('metode_pembayaran');
    const cardIdx = headers.indexOf('flazz_card_id');
    const tglIdx = headers.indexOf('tanggal');
    const stampIdx = headers.indexOf('timestamp');
    const bbmIdx = headers.indexOf('biaya_bbm');
    const tollIdx = headers.indexOf('biaya_toll');
    const evidenceIdx = headers.indexOf('foto_struk_bbm');
    const tollEvidenceIdx = headers.indexOf('foto_struk_toll');
    const driverIdx = headers.indexOf('nama_supir');
    const vehicleIdx = headers.indexOf('plat_nomor');

    const bbmData = readLastRows(bbmSheet, 5000);
    for (let i = 0; i < bbmData.length; i++) {
      let row = bbmData[i];
      if (metodeIdx > -1 && row[metodeIdx] === 'FLAZZ' && cardIds.includes(row[cardIdx])) {
        bbmFlazz.push({
           transaction_id: row[trxIdx],
           tanggal: (row[tglIdx] instanceof Date) ? row[tglIdx].toISOString() : row[tglIdx],
           timestamp: (stampIdx > -1 && row[stampIdx] instanceof Date) ? row[stampIdx].toISOString() : (stampIdx > -1 ? row[stampIdx] : ''),
           card_id: row[cardIdx],
           amount: parseFloat(row[bbmIdx]) || 0,
           toll_amount: tollIdx > -1 ? (parseFloat(row[tollIdx]) || 0) : 0,
           evidence: row[evidenceIdx],
           toll_evidence: tollEvidenceIdx > -1 ? row[tollEvidenceIdx] : '',
           driver: row[driverIdx],
           vehicle: row[vehicleIdx]
        });
      }
    }
```

Hapus blok lama `const bbmData = bbmSheet.getDataRange().getValues(); if (bbmData.length > 1) { const headers = bbmData[0]; ... }` yang lama.

> **Verifikasi:** simulasikan di editor dengan `apiGetFlazzDashboardData(token)` → struktur `{cards, topups, tols, tolHistory, usages, recons, bbmFlazz}` identik (bandingkan kunci + nilai sampel objek dengan versi lama).

- [ ] **Step 5: Verifikasi + commit**

```bash
git add src/SheetRead.js src/SpreadsheetOps.js src/FlazzOps.js
git commit -m "perf: hentikan getDataRange penuh pada dashboard/performa/flazz; baca kolom & baris terbatas"
```

---

### Task 4: Summary bulanan ter-materialisasi (sheet `Dashboard`) + hook client

**Files:**
- Create: `src/SummaryOps.js`
- Modify: `src/SpreadsheetOps.js` (panggil recompute di dalam `saveTransactionEndOfDayUnlocked`, `editDailyTransactionUnlocked`, `deleteDailyTransactionUnlocked`)
- Modify: `src/Code.js` (`getDashboardData` → sertakan summary; `apiGetSummaryData`)
- Modify: `src/js.html` (render ringkasan bulan ini)

**Interfaces:**
- **Produces:** `periodKey(dateOrStr)` → `'YYYY-MM'`; `initDashboardSchema()` (terminal, pastikan header `Dashboard` = kolom ringkasan); `recomputeMonthlySummary(cabang, periode)` → `{cabang, periode, total_transaksi, total_liter, total_biaya_bbm, total_toll}`; `getMonthlySummary(cabang, periode)` (cache `/sum:` TTL 300).

- [ ] **Step 1: Buat `src/SummaryOps.js`**

```javascript
// ==========================================
// RINGKASAN BULANAN PER CABANG (sheet Dashboard)
// ==========================================

var DASH_COLS = ['cabang','periode','total_transaksi','total_liter','total_biaya_bbm','total_toll','updated_at'];

function periodKey(dateOrStr) {
  if (!dateOrStr) return '';
  var d = dateOrStr instanceof Date ? dateOrStr : new Date(dateOrStr);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function initDashboardSchema() {
  const ss = getDB();
  const dash = ss.getSheetByName('Dashboard');
  if (!dash) return { success: false, msg: 'Sheet Dashboard tidak ditemukan' };
  dash.getRange(1, 1, 1, DASH_COLS.length).setValues([DASH_COLS]);
  dash.getRange(1, 1, 1, DASH_COLS.length).setFontWeight('bold').setBackground('#f3f3f3');
  dash.setFrozenRows(1);
  // Kosongkan baris data legacy bila ada (schema lama 'Metrics'/'Value' tidak pernah terisi di produksi)
  if (dash.getLastRow() > 1) dash.getRange(2, 1, dash.getLastRow() - 1, DASH_COLS.length).clearContent();
  return { success: true, msg: 'Schema Dashboard disiapkan' };
}

function recomputeMonthlySummary(cabang, periode) {
  if (!cabang || !periode) return null;
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  const dash = ss.getSheetByName('Dashboard');
  if (!sheet || !dash) return null;

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

  const dashH = sheetHeaders(dash);
  const dashIdx = colIndex(dashH, DASH_COLS);
  const dashRows = readRowsCols(dash, DASH_COLS.map(function(nm) { return dashIdx[nm]; }));
  let rowIndex = -1;
  for (let i = 0; i < dashRows.length; i++) {
    if (String(dashRows[i][0]) === String(cabang) && String(dashRows[i][1]) === periode) { rowIndex = i + 2; break; }
  }
  const value = [cabang, periode, trx, Math.round(liter * 100) / 100, Math.round(biaya * 100) / 100, Math.round(toll * 100) / 100, new Date()];
  if (rowIndex > -1) {
    dash.getRange(rowIndex, 1, 1, DASH_COLS.length).setValues([value]);
  } else {
    dash.appendRow(value);
  }
  CacheService.getScriptCache().remove('sum:' + cabang + ':' + periode);
  return { cabang: cabang, periode: periode, total_transaksi: trx, total_liter: liter, total_biaya_bbm: biaya, total_toll: toll };
}

function getMonthlySummary(cabang, periode) {
  if (!cabang || !periode) return null;
  const ck = 'sum:' + cabang + ':' + periode;
  const hit = cacheGet(ck);
  if (hit) return hit;
  const ss = getDB();
  const dash = ss.getSheetByName('Dashboard');
  if (!dash) return null;
  const h = sheetHeaders(dash);
  const idx = colIndex(h, DASH_COLS);
  const rows = readRowsCols(dash, DASH_COLS.map(function(nm) { return idx[nm]; }));
  let found = null;
  for (const r of rows) {
    if (String(r[0]) === String(cabang) && String(r[1]) === periode) {
      found = { cabang: r[0], periode: r[1], total_transaksi: r[2], total_liter: r[3], total_biaya_bbm: r[4], total_toll: r[5] };
      break;
    }
  }
  if (found) cachePut(ck, found, 300);
  return found;
}
```

Sinkronkan header sheet `Dashboard` di `DatabaseSetup.js` (dari `['Metrics','Value']` menjadi `DASH_COLS`): ganti entri (schema lama tidak terpakai di produksi dan dikosongkan oleh `initDashboardSchema`):

```javascript
    { name: 'Dashboard', headers: ['cabang', 'periode', 'total_transaksi', 'total_liter', 'total_biaya_bbm', 'total_toll', 'updated_at'] },
```

Setelah deploy, jalankan `initDashboardSchema()` sekali dari editor.

- [ ] **Step 2: Hubungkan ke mutasi transaksi**

Di `src/SpreadsheetOps.js`, dalam `saveTransactionEndOfDayUnlocked`, tepat setelah `appendRow` sukses (dan sebelum return), tambahkan:

```javascript
  try { recomputeMonthlySummary(trxCabang, periodKey(payload.tanggal)); } catch (e) { console.error('summary gagal: ' + e); }
```

Untuk `editDailyTransactionUnlocked`: panggil `recomputeMonthlySummary(oldCabang, periodKey(oldTgl))` dan `recomputeMonthlySummary(newCabang, periodKey(newTgl))` setelah update range (akses baris lama & baru dari `data` yang sudah dibaca). Untuk `deleteDailyTransactionUnlocked`: panggil untuk cabang/periode transaksi yang dihapus.

> Nilai `old`/`new` diambil dari data baris yang sudah dibaca fungsi tersebut; pastikan `trxCabang`/`payload.tanggal` tersedia di scope.

- [ ] **Step 3: Endpoint & integrasi dashboard**

Di `src/Code.js`, modifikasi `getDashboardData` agar menyertakan ringkasan bulan berjalan:

```javascript
function getDashboardData(token) {
  var user = requireUser(token);
  var trans = getRecentTransactions(user.role, user.cabang);
  var periode = periodKey(new Date());
  var monthly = [];
  try {
    if (user.role === 'SUPERADMIN') {
      getCabangList().forEach(function(c) { monthly.push(getMonthlySummary(c.kode, periode)); });
    } else {
      monthly.push(getMonthlySummary(user.cabang, periode));
    }
  } catch (e) { monthly = []; }
  return { transactions: trans, monthly: monthly.filter(function(x) { return !!x; }) };
}
```

> **Penting:** client saat ini membaca `getDashboardData` sebagai array (`window.__dashData = allData` lalu `.filter(...)`/`.forEach`). Ubah client di Step 4 agar memakai `res.transactions`; nama field transaksi tetap sama.

- [ ] **Step 4: Hook client `js.html` + container di `Index.html`**

`getDashboardData` dibaca **3 handler** di `js.html` — semuanya harus berubah dari asumsi array ke `res.transactions`:

1. **`Index.html`** — pasang container ringkasan tepat sebelum elemen `#dashboard-cards` (`:625`), implisit `display:none` sampai terisi:

```html
              <div id='ringkasan-bulan-ini' class='row g-2 mb-3' style='display:none;'></div>
              <div class='d-md-none' id='dashboard-cards'></div>
```

2. **`loadDashboardGallery`** (`js.html` ±`:1160-1193`) — ganti handler:

```javascript
      .withSuccessHandler(function(res) {
        const allData = (res && res.transactions) ? res.transactions : [];
        window.__dashData = allData;
        let items = allData.filter(r => r.foto_odo_awal || r.foto_odo_akhir || r.foto_struk_bbm || r.foto_struk_toll || r.foto_indikator);
        items = items.slice(0, 6);
        /* ...render galeri seperti asli (tidak berubah)... */
      })
```

3. **`loadDashboard`** (`js.html` ±`:1222-1243`) — ganti handler:

```javascript
      .withSuccessHandler(function(res) {
        loadingState.style.display = 'none';
        if(galleryLoading) galleryLoading.style.display = 'none';
        const allData = (res && res.transactions) ? res.transactions : [];
        let data = allData.filter(function(row) {
          if (filterCabang && row.cabang !== filterCabang) return false;
          if (filterSupir && row.supir !== filterSupir) return false;
          if (startTimestamp && row.timestamp < startTimestamp) return false;
          if (endTimestamp && row.timestamp > endTimestamp) return false;
          return true;
        });
        window.__recent = data;
        window.__dashData = data;
        window.__dashPage = 1;
        renderMonthlySummary((res && res.monthly) || []);
        renderDashboardData();
      })
```

   `renderDashboardData` (membaca `window.__dashData`) TIDAK diubah — tetap array.

4. **Tambahkan** fungsi render di scope `js.html`: **`renderMonthlySummary`** (di bawah); di-render lewat template literal — nilai `cabang` dari DB. Untuk sekarang cukup, nilai user-controlled lain dipasang `esc()` penuh di Fase P2.

```javascript
  function renderMonthlySummary(monthly) {
    let cont = document.getElementById('ringkasan-bulan-ini');
    if (!cont) return;
    if (!monthly || monthly.length === 0 || !monthly[0].total_transaksi) {
      cont.style.display = 'none';
      return;
    }
    cont.style.display = 'block';
    let rows = [];
    monthly.forEach(function(m) {
      let biaya = parseFloat(m.total_biaya_bbm) || 0;
      let toll = parseFloat(m.total_toll) || 0;
      rows.push(
        '<div class="col-6 col-md-3 mb-2">' +
          '<div class="border rounded p-2 bg-light">' +
            '<div class="text-muted small">' + esc(m.cabang) + '</div>' +
            '<div class="fw-bold">' + m.total_transaksi + ' transaksi</div>' +
            '<div class="small">' + (m.total_liter || 0) + ' L BBM</div>' +
            '<div class="small">Rp ' + biaya.toLocaleString('id-ID') + ' + tol ' + toll.toLocaleString('id-ID') + '</div>' +
          '</div>' +
        '</div>');
    });
    cont.innerHTML = rows.join('');
  }
```

   (`esc()` akan didefinisikan di Fase P2 Task 3 Step 1; untuk sementara definisikan satu baris pengganti `function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }` di scope js.html agar aman menunggu P2.)

- [ ] **Step 5: Verifikasi + commit**

Run: `clasp push`; cek baris baru di sheet `Dashboard` setelah 1 transaksi; dashboard web menampilkan kartu ringkasan; `getDashboardData(token)` mengembalikan objek `{transactions, monthly}`.

```bash
git add src/SummaryOps.js src/SpreadsheetOps.js src/Code.js src/js.html src/Index.html
git commit -m "feat: ringkasan bulanan per cabang ter-materialisasi + tampil di dashboard"
```

---

### Task 5: Audit log menyeluruh

**Files:**
- Modify: `src/AuditOps.js` (perluas)
- Modify: `src/SpreadsheetOps.js` (master & transaksi mutasi)
- Modify: `src/FlazzOps.js` (topup/tol/recon/usage & edit/delete)
- Modify: `src/JalurOps.js` (save/update/delete)

**Interfaces:**
- **Consumes:** `logAudit(user, action, modul, keterangan, dataSebelum, dataSesudah)` dari P0 Task 9.
- **Produces:** audit log terisi untuk semua mutasi utama (arget: "siapa mengubah apa, kapan, cabang mana").

- [ ] **Step 1: Standarkan pemanggilan**

Di `SpreadsheetOps.js` (fungsi `*Unlocked` dari P0 Task 8), tambahkan `logAudit` di akhir operasi sukses:
- `saveTransactionEndOfDayUnlocked` → `logAudit(userInfo, 'CREATE', 'transaksi', 'TRX ' + transaction_id, null, {cabang, vehicle, km_tempuh, liter, biaya})`
- `editDailyTransactionUnlocked` → `logAudit(userInfo, 'EDIT', 'transaksi', payload.transaction_id, sebelum, sesudah)`
- `deleteDailyTransactionUnlocked` → `logAudit(userInfo, 'DELETE', 'transaksi', transactionId, sebelum, null)`
- `insertKendaraan`/`insertSupir`/`insertCabang`/`insertBBM`/`insertUser`/`updateUser`/`update*`/`delete*ById` → `logAudit(userInfo, 'CREATE|EDIT|DELETE', 'master', id/plat/nama, ...)`

`saveTransactionEndOfDay` menerima `payload.userInfo` (hasil require server dari P0) — gunakan itu.

- [ ] **Step 2: `FlazzOps.js` & `JalurOps.js`**

Dalam `saveFlazzTopUpUnlocked`, `saveFlazzTolUnlocked`, `saveFlazzReconUnlocked`, `saveFlazzUsageUnlocked` dan pasangan edit/delete, tambahkan `logAudit(payload.userInfo || userInfo, 'CREATE|EDIT|DELETE', 'flazz', id, ...)` setelah sukses. Untuk `JalurOps.js` gunakan `userInfo` yang sudah dikirim wrapper (P0).

> Guard `logAudit` sudah try/catch internal — aman ditambahkan tanpa mengubah alur.

- [ ] **Step 3: Verifikasi + commit**

Run: `clasp push`; lakukan 1 simpan transaksi, 1 topup, 1 buat jalur, 1 edit pengguna → sheet `Audit_Log` bertambah minimum 4 baris dengan `user_id`, `action`, `modul` yang benar.

```bash
git add src/AuditOps.js src/SpreadsheetOps.js src/FlazzOps.js src/JalurOps.js
git commit -m "feat: audit log menyeluruh untuk semua mutasi master, transaksi, flazz, jalur"
```

---

### Task 6: Backup otomatis harian + prosedur restore

**Files:**
- Create: `src/BackupOps.js`
- Modify: `README.md`

**Interfaces:**
- **Produces:** `setupBackupTrigger()` (terminal, sekali di editor) → trigger berbasis waktu harian pukul 02:00 Asia/Jakarta; `runDailyBackup()` → `{backupFolderUrl, spreadsheetCopyId, photosCopied, retained}`; `pruneBackups(keep)`.

- [ ] **Step 1: Buat `src/BackupOps.js`**

```javascript
// ==========================================
// BACKUP HARIAN — spreadsheet + folder foto Drive
// ==========================================

function setupBackupTrigger() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'runDailyBackup';
  });
  if (triggers.length === 0) {
    ScriptApp.newTrigger('runDailyBackup')
      .timeBased()
      .atHour(2)
      .everyDays(1)
      .inTimezone('Asia/Jakarta')
      .create();
  }
  return { success: true, msg: triggers.length === 0 ? 'Trigger harian 02:00 dibuat.' : 'Trigger sudah ada.' };
}

function _copyFolder(src, dest) {
  let n = 0;
  const files = src.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const nf = dest.createFile(f.getBlob().setName(f.getName()));
    nf.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    n++;
  }
  return n;
}

function pruneBackups(keep) {
  const root = getFolderByNameOrCreate('BBM_BACKUP');
  let folders = [];
  const it = root.getFolders();
  while (it.hasNext()) folders.push(it.next());
  folders.sort(function(a, b) { return a.getName().localeCompare(b.getName()); });
  let deleted = 0;
  while (folders.length > keep) {
    const old = folders.shift();
    old.setTrashed(true);
    deleted++;
  }
  return deleted;
}

function runDailyBackup() {
  try {
    const now = new Date();
    const stamp = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd');
    const backupRoot = getFolderByNameOrCreate('BBM_BACKUP');

    // 1) Salin spreadsheet
    const ss = getDB();
    const copy = ss.copy('Backup BBM ' + stamp);
    const copyFile = DriveApp.getFileById(copy.getId());

    // 2) Pindahkan ke subfolder tanggal
    const folder = backupRoot.createFolder(stamp);
    copyFile.moveTo(folder);
    copy.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

    // 3) Salin folder foto 'BBM_OPERASIONAL' (rekursif satu level + root)
    let photosCopied = 0;
    const srcRoot = getFolderByNameOrCreate('BBM_OPERASIONAL');
    const photosFolder = folder.createFolder('BBM_OPERASIONAL');
    const subFolders = srcRoot.getFolders();
    while (subFolders.hasNext()) {
      const sub = subFolders.next();
      const target = photosFolder.createFolder(sub.getName());
      photosCopied += _copyFolder(sub, target);
    }
    const rootFiles = srcRoot.getFiles();
    while (rootFiles.hasNext()) {
      const f = rootFiles.next();
      const nf = photosFolder.createFile(f.getBlob().setName(f.getName()));
      nf.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      photosCopied++;
    }

    // 4) Prune: simpan 14 terakhir
    const retained = pruneBackups(14);

    Logger.log('Backup selesai: ' + folder.getUrl());
    return { success: true, backupFolderUrl: folder.getUrl(), spreadsheetCopyId: copy.getId(), photosCopied: photosCopied, retained: retained };
  } catch (e) {
    Logger.log('Backup gagal: ' + e);
    return { success: false, msg: e.toString() };
  }
}
```

- [ ] **Step 2: Verifikasi**

Run: `clasp push`; di editor jalankan `runDailyBackup()`; cek folder `BBM_BACKUP/<hari ini>` berisi salinan spreadsheet + folder foto, akses PRIVATE; jalankan 2× lagi → `pruneBackups(14)` tidak menghapus apa pun.

- [ ] **Step 3: Proteksi dan dokumentasi**

Tambahkan di `README.md` — sub-bagian "Backup & Pemulihan":
1. Cara menjalankan `setupBackupTrigger()` di editor.
2. RPO (Recovery Point Objective): maksimal 24 jam.
3. Langkah restore: buka salinan di `BBM_BACKUP/<tanggal>` → copy ID → jalankan `configureSpreadsheet(ID_BARU)` → uji login → arahkan kembali deploy atau spreadsheet produksi.
4. Catatan: `BBM_BACKUP` dibuat PRIVATE; jangan dibagikan publik.

- [ ] **Step 4: Commit**

```bash
git add src/BackupOps.js README.md
git commit -m "feat: backup harian otomatis (spreadsheet + foto) + prune 14 hari + panduan restore"
```

---

## Self-Check P1

- [ ] Tidak ada lagi literal `openById('1FU7...')` di file produksi (`SpreadsheetOps`, `FlazzOps`, `JalurOps`, `DatabaseSetup`, `Code.js`) — verifikasi `Select-String`.
- [ ] `getMasterData`/`getPerformaData` memakai cache; mutasi meng-invalidasi.
- [ ] `getRecentTransactions`, `getPerformaSummary`, `getFlazzDashboardData` tidak lagi `getDataRange()` penuh.
- [ ] Field output `getRecentTransactions` identik dengan versi lama (kompatibel client).
- [ ] Sheet `Dashboard` terisi setelah mutasi; `getDashboardData(token)` → `{transactions, monthly}` dan ringkasan tampil di dashboard.
- [ ] `Audit_Log` terisi untuk semua mutasi.
- [ ] Trigger backup aktif & diuji satu kali manual; tidak ada placeholder/baris rusak di `BackupOps.js`.

**Fase P1 selesai = performa stabil & data terpelihara untuk 12 cabang pada satu spreadsheet.**