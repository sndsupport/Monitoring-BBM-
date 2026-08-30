# Modul Jalur Pengiriman — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan modul Jalur Pengiriman (2 tab: Buat Jadwal & Summary), plus badge sisa hari pajak kendaraan, mengikuti pola modul Flazz pada aplikasi Google Apps Script monitoring BBM.

**Architecture:** Backend Apps Script baru (`JalurOps.js`) dengan wrapper di `Code.js`, sheet baru `Jalur_Pengiriman` + kolom `tanggal_pajak` di `DatabaseSetup.js`. Frontend baru (`JalurPages.html` + `JalurScript.html`) di-include di `Index.html`, dinavigasi via `switchTab('jalur-*')`, menggunakan `html2canvas.min.js` lokal untuk pratinjau screenshot yang bisa disalin (Ctrl+V) ke WA.

**Tech Stack:** Google Apps Script, HTML, JavaScript (client), Bootstrap 5, Bootstrap Icons, html2canvas (file lokal).

## Global Constraints

- Spreadsheet ID yang dipakai seluruh backend: `1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8`.
- Semua akses sheet memakai pola **header-safe** (cari index kolom via baris header), bukan posisi kolom keras — karena kolom baru (`tanggal_pajak`) berada di ujung kanan.
- Soft-delete memakai kolom `is_deleted` (nilai `'1'`), bukan hapus baris permanen.
- Include JavaScript via `<?!= include('...'); ?>`. Posisi include di `Index.html`: `JalurPages` setelah `FlazzPages`, `JalurScript` di blok script (sebelum `js`).
- Nama file & fungsi konsisten: prefiks `Jalur` / `jalur`, id baris `JLR-<timestamp>`.
- `html2canvas` di-load sebagai `<script src>` file lokal; tidak memicu unduhan — hanya render canvas preview untuk disalin.
- Fitur screenshot TIDAK auto-download; admin menyalin (Ctrl+C) lalu Ctrl+V di WA.
- Navigasi & CRUD diakses oleh semua role (SUPERADMIN & PIC CABANG); PIC hanya melihat cabang sendiri.

---
## Struktur File

- `src/JalurOps.js` (baru) — backend CRUD jadwal + helper pajak.
- `src/JalurPages.html` (baru) — UI 2 tab + modal edit + modal preview screenshot.
- `src/JalurScript.html` (baru) — logika client.
- `src/Html2canvasLib.html` (baru) — library html2canvas di-embed client-side untuk screenshot preview.
- `src/DatabaseSetup.js` — sheet `Jalur_Pengiriman` + kolom `tanggal_pajak` + seed.
- `src/Code.js` — wrapper API Jalur + `tanggal_pajak` di master data.
- `src/SpreadsheetOps.js` — perluas `getActiveVehicles`/`insertKendaraan`/`updateKendaraan` dengan `tanggal_pajak`; helper hitung sisa hari.
- `src/Index.html` — navigasi sidebar + bottom-nav, include, field `tanggal_pajak` modal master.
- `src/js.html` — handler `switchTab('jalur-*')`, master kendaraan `tanggal_pajak`.
- `src/css.html` — style badge pajak & halaman jalur.
- `README.md` — dokumentasi.

---

### Task 1: Skema data (DatabaseSetup.js)

**Files:**
- Modify: `src/DatabaseSetup.js` — daftar `sheets`, `seedDummyData`.

**Interfaces:**
- Produces: sheet `Jalur_Pengiriman` dengan header `id | tanggal | driver_id | nama_driver | vehicle_id | plat_nomor | nama_kendaraan | jenis_kendaraan | rute_tujuan | kode_cabang | created_by | created_at | updated_at | is_deleted`; kolom `tanggal_pajak` di sheet `Kendaraan`.

- [ ] **Step 1: Tambah definisi sheet Jalur_Pengiriman**

Tambah satu objek ke array `sheets` (di `setupDatabase`), tepat setelah blok `// --- FLAZZ MODULE SHEETS ---` (setelah `Flazz_Reconciliation`):

```js
    { name: 'Jalur_Pengiriman', headers: ['id', 'tanggal', 'driver_id', 'nama_driver', 'vehicle_id', 'plat_nomor', 'nama_kendaraan', 'jenis_kendaraan', 'rute_tujuan', 'kode_cabang', 'created_by', 'created_at', 'updated_at', 'is_deleted'] }
```

- [ ] **Step 2: Tambah kolom tanggal_pajak ke header Kendaraan**

Pada objek sheet `Kendaraan`, tambahkan kolom `tanggal_pajak` di akhir array headers:

```js
    { name: 'Kendaraan', headers: ['vehicle_id', 'plat_nomor', 'nama_kendaraan', 'jenis_kendaraan', 'merk', 'model', 'kapasitas_tangki', 'jumlah_bar', 'standar_km_l', 'kode_cabang', 'status', 'jenis_indikator', 'tanggal_pajak'] },
```

- [ ] **Step 3: Tambah seed data tanggal_pajak**

Pada `seedDummyData`, baris `insertKendaraan` dummy `V-001` dan `V-002` diberi nilai `tanggal_pajak` (string `YYYY-MM-DD`):

```js
    kendaraanSheet.appendRow(['V-001', 'B 1234 CD', 'Avanza Operasional', 'Mobil', 'Toyota', 'Avanza', 45, 8, 12, 'CBG-JKT', 'Aktif', 'DIGITAL_BAR', '2026-09-15']);
    kendaraanSheet.appendRow(['V-002', 'B 5678 EF', 'Innova Operasional', 'Mobil', 'Toyota', 'Innova', 55, 8, 10, 'CBG-BDG', 'Aktif', 'DIGITAL_BAR', '2026-11-01']);
```

- [ ] **Step 4: Verifikasi**

Periksa baris kode yang diubah tidak merusak komentar/sintaks sekitarnya (file tetap valid JS). Tidak ada runner otomatis; verifikasi visual + `clasp push` saat seluruh backend selesai.

- [ ] **Step 5: Commit**

```bash
git add src/DatabaseSetup.js
git commit -m "feat: add Jalur_Pengiriman sheet and tanggal_pajak column"
```

---

### Task 2: Perluas master Kendaraan dengan tanggal_pajak (SpreadsheetOps.js)

**Files:**
- Modify: `src/SpreadsheetOps.js` — `getActiveVehicles` (42-73), `insertKendaraan` (422-426), `updateKendaraan` (501-516).

**Interfaces:**
- Produces: `getActiveVehicles(role, userCabang)` mengembalikan objek kendaraan dengan tambahan field `tanggal_pajak`; `insertKendaraan(data)` dan `updateKendaraan(data)` mendukung `data.tanggal_pajak`.

- [ ] **Step 1: Ubah getActiveVehicles agar header-safe + sertakan tanggal_pajak**

Ganti isi `getActiveVehicles` dengan versi yang memetakan kolom via index header (karena kolom `tanggal_pajak` berada di ujung kanan, posisi keras tidak aman):

```js
function getActiveVehicles(role, userCabang) {
  const ss = getDB();
  if (!ss) return [];
  const sheet = ss.getSheetByName('Kendaraan');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const ci = {};
  headers.forEach((h, i) => { ci[String(h)] = i; });
  const iStatus = ci['status'];
  const iCabang = ci['kode_cabang'];
  const activeVehicles = [];

  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    if (iStatus !== undefined && String(row[iStatus]) === 'Aktif') {
      if (role !== 'SUPERADMIN' && iCabang !== undefined && row[iCabang] !== userCabang) continue;
      activeVehicles.push({
        vehicle_id: row[ci['vehicle_id']],
        plat_nomor: row[ci['plat_nomor']],
        nama: row[ci['nama_kendaraan']],
        jenis: (ci['jenis_kendaraan'] !== undefined && row[ci['jenis_kendaraan']]) || 'Mobil',
        merk: row[ci['merk']],
        model: row[ci['model']],
        kapasitas_tangki: row[ci['kapasitas_tangki']],
        jumlah_bar: row[ci['jumlah_bar']],
        standar_km_l: row[ci['standar_km_l']],
        cabang: row[ci['kode_cabang']],
        jenis_indikator: (ci['jenis_indikator'] !== undefined && row[ci['jenis_indikator']]) || 'DIGITAL_BAR',
        tanggal_pajak: (ci['tanggal_pajak'] !== undefined) ? row[ci['tanggal_pajak']] : ''
      });
    }
  }
  return activeVehicles;
}
```

- [ ] **Step 2: Perluas insertKendaraan dengan tanggal_pajak**

Ganti panggilan `appendRow` pada `insertKendaraan`:

```js
  ss.getSheetByName('Kendaraan').appendRow([id, data.plat, data.nama, data.jenis || 'Mobil', data.merk || '', data.model || '', data.kapasitas_tangki || '', data.jumlah_bar || '', data.standar_km_l || '', data.cabang, 'Aktif', data.jenis_indikator || 'DIGITAL_BAR', data.tanggal_pajak || '']);
```

- [ ] **Step 3: Perluas updateKendaraan dengan tanggal_pajak**

Baca bagian `updateKendaraan` (saat ini menulis ulang kolom-kolom kendaraan). Tambahkan penulisan `tanggal_pajak` dengan mencari index kolom `tanggal_pajak`:

```js
    // di dalam updateKendaraan, setelah penulisan baris (i+1):
      const hd = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const iPajak = hd.indexOf('tanggal_pajak');
      if (iPajak > -1) {
        sheet.getRange(i + 1, iPajak + 1).setValue(data.tanggal_pajak || '');
      }
```

Catatan: variabel indeks baris di `updateKendaraan` adalah `i` (loop `for (let i = 1; ...)`), sehingga baris ditulis pada `i + 1`. Tambahkan blok di atas tepat setelah `sheet.getRange(i + 1, 12).setValue(...)` dan sebelum `return { msg: ... }`.

- [ ] **Step 4: Verifikasi**

Baca ulang `src/SpreadsheetOps.js:42-73` dan `:422-426`, `:501-516` untuk memastikan tidak ada duplikasi variabel `iStatus`/`ci` yang bentrok dengan fungsi lain di file (beri nama unik jika perlu). File tetap JS valid.

- [ ] **Step 5: Commit**

```bash
git add src/SpreadsheetOps.js
git commit -m "feat: support tanggal_pajak in vehicle master"
```

---

### Task 3: Backend JalurOps.js + wrapper Code.js

**Files:**
- Create: `src/JalurOps.js`
- Modify: `src/Code.js` — tambah wrapper API di dekat wrapper Flazz.

**Interfaces:**
- Produces (dikonsumsi Task 4-5):
  - `saveJalur(payload, userInfo)` → `payload` = `{ tanggal, rows: [ {driver_id, vehicle_id, rute_tujuan}, ... ] }`; return `{ success, msg, saved }`.
  - `updateJalur(data, userInfo)` → `data` = `{ id, tanggal, driver_id, vehicle_id, rute_tujuan }`; return `{ success, msg }`.
  - `deleteJalur(id)` → return `{ success, msg }`.
  - `getJalurByTanggal(tanggal, userInfo)` → return `{ success, list, created_by }`, tiap item list = `{ id, tanggal, driver_id, nama_driver, vehicle_id, plat_nomor, nama_kendaraan, jenis_kendaraan, rute_tujuan, kode_cabang, sisa_hari_pajak, status_pajak }`.
  - Wrapper di Code.js: `apiSaveJalur`, `apiUpdateJalur`, `apiDeleteJalur`, `apiGetJalurByTanggal`.

- [ ] **Step 1: Tulis JalurOps.js lengkap**

Buat file `src/JalurOps.js` berisi helper header-safe dan seluruh fungsi CRUD:

```js
/**
 * JalurOps.js
 * Modul backend untuk Sistem Monitoring Jalur Pengiriman
 */

function jalurSheet() {
  return SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSheetByName('Jalur_Pengiriman');
}

function jalurColIdx(sheet) {
  const h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = {};
  h.forEach((x, i) => { idx[String(x)] = i; });
  return idx;
}

function findJalurRow(sheet, id) {
  const data = sheet.getDataRange().getValues();
  const idx = jalurColIdx(sheet);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idx['id']]) === String(id)) return { rowIndex: i + 1, row: data[i], idx: idx };
  }
  return null;
}

function getJalurCabangFor(userInfo) {
  if (userInfo && userInfo.role === 'SUPERADMIN') return null; // null = semua cabang
  return (userInfo && userInfo.cabang) || '';
}

function jalurDriverNameById(driverId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const s = ss.getSheetByName('Supir');
  if (!s) return '';
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(driverId)) return data[i][1];
  }
  return '';
}

function jalurVehicleById(vehicleId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const s = ss.getSheetByName('Kendaraan');
  if (!s) return null;
  const data = s.getDataRange().getValues();
  const h = data[0];
  const ci = {};
  h.forEach((x, i) => { ci[String(x)] = i; });
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ci['vehicle_id']]) === String(vehicleId)) {
      return {
        plat_nomor: data[i][ci['plat_nomor']],
        nama: data[i][ci['nama_kendaraan']],
        jenis: data[i][ci['jenis_kendaraan']] || 'Mobil',
        tanggal_pajak: (ci['tanggal_pajak'] !== undefined) ? data[i][ci['tanggal_pajak']] : ''
      };
    }
  }
  return null;
}

function jalurComputePajak(tanggalPajakStr) {
  if (!tanggalPajakStr) return { sisa_hari_pajak: null, status_pajak: 'TIDAK_ADA' };
  const due = new Date(String(tanggalPajakStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(due.getTime())) return { sisa_hari_pajak: null, status_pajak: 'TIDAK_ADA' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  let status = 'AMAN';
  if (days <= 0) status = 'LEWAT';
  else if (days <= 30) status = 'KRITIS';
  else if (days <= 60) status = 'WASPADA';
  return { sisa_hari_pajak: days, status_pajak: status };
}

function saveJalur(payload, userInfo) {
  try {
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan. Jalankan setupDatabase.');
    const tanggal = payload.tanggal;
    const rows = payload.rows || [];
    if (!tanggal || rows.length === 0) throw new Error('Tanggal dan minimal satu baris wajib diisi.');
    const idx = jalurColIdx(sheet);
    const createdBy = (userInfo && (userInfo.username || userInfo.nama)) || '';
    const kodeCabang = (userInfo && userInfo.cabang) || '';
    const now = new Date();
    let saved = 0;
    rows.forEach(r => {
      if (!r || !r.driver_id || !r.vehicle_id || !String(r.rute_tujuan || '').trim()) return;
      const vid = r.vehicle_id;
      const v = jalurVehicleById(vid);
      const row = new Array(Object.keys(idx).length).fill('');
      row[idx['id']] = 'JLR-' + now.getTime() + '-' + (saved++);
      row[idx['tanggal']] = tanggal;
      row[idx['driver_id']] = r.driver_id;
      row[idx['nama_driver']] = jalurDriverNameById(r.driver_id);
      row[idx['vehicle_id']] = vid;
      row[idx['plat_nomor']] = v ? v.plat_nomor : '';
      row[idx['nama_kendaraan']] = v ? v.nama : '';
      row[idx['jenis_kendaraan']] = v ? v.jenis : '';
      row[idx['rute_tujuan']] = String(r.rute_tujuan).trim();
      row[idx['kode_cabang']] = kodeCabang;
      row[idx['created_by']] = createdBy;
      row[idx['created_at']] = now;
      row[idx['updated_at']] = now;
      row[idx['is_deleted']] = '';
      sheet.appendRow(row);
    });
    return { success: true, msg: saved + ' jadwal pengiriman berhasil disimpan.', saved: saved };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function updateJalur(data, userInfo) {
  try {
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan.');
    const found = findJalurRow(sheet, data.id);
    if (!found) throw new Error('Jadwal tidak ditemukan.');
    const idx = found.idx;
    if (data.tanggal !== undefined) sheet.getRange(found.rowIndex, idx['tanggal'] + 1).setValue(data.tanggal);
    if (data.rute_tujuan !== undefined) sheet.getRange(found.rowIndex, idx['rute_tujuan'] + 1).setValue(String(data.rute_tujuan).trim());
    if (data.driver_id !== undefined) {
      sheet.getRange(found.rowIndex, idx['driver_id'] + 1).setValue(data.driver_id);
      sheet.getRange(found.rowIndex, idx['nama_driver'] + 1).setValue(jalurDriverNameById(data.driver_id));
    }
    if (data.vehicle_id !== undefined) {
      const v = jalurVehicleById(data.vehicle_id);
      sheet.getRange(found.rowIndex, idx['vehicle_id'] + 1).setValue(data.vehicle_id);
      sheet.getRange(found.rowIndex, idx['plat_nomor'] + 1).setValue(v ? v.plat_nomor : '');
      sheet.getRange(found.rowIndex, idx['nama_kendaraan'] + 1).setValue(v ? v.nama : '');
      sheet.getRange(found.rowIndex, idx['jenis_kendaraan'] + 1).setValue(v ? v.jenis : '');
    }
    sheet.getRange(found.rowIndex, idx['updated_at'] + 1).setValue(new Date());
    return { success: true, msg: 'Jadwal berhasil diperbarui.' };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function deleteJalur(id) {
  try {
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan.');
    const found = findJalurRow(sheet, id);
    if (!found) throw new Error('Jadwal tidak ditemukan.');
    if (found.idx['is_deleted'] !== undefined) {
      sheet.getRange(found.rowIndex, found.idx['is_deleted'] + 1).setValue('1');
    } else {
      sheet.deleteRow(found.rowIndex);
    }
    return { success: true, msg: 'Jadwal berhasil dihapus.' };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function getJalurByTanggal(tanggal, userInfo) {
  try {
    const sheet = jalurSheet();
    if (!sheet) return { success: false, msg: 'Sheet Jalur_Pengiriman tidak ditemukan.' };
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iTanggal = idx['tanggal'];
    const iDeleted = idx['is_deleted'];
    const iCabang = idx['kode_cabang'];
    const filteredCabang = getJalurCabangFor(userInfo);
    const list = [];
    data.forEach((row, i) => {
      if (i === 0) return;
      if (iTanggal !== undefined && String(row[iTanggal]) !== String(tanggal)) return;
      if (iDeleted !== undefined && String(row[iDeleted]) === '1') return;
      if (filteredCabang && row[iCabang] !== filteredCabang) return;
      const pajak = jalurComputePajak(row[idx['plat_nomor']] ? (jalurVehicleById(row[idx['vehicle_id']]) || {}).tanggal_pajak : '');
      list.push({
        id: row[idx['id']],
        tanggal: row[idx['tanggal']],
        driver_id: row[idx['driver_id']],
        nama_driver: row[idx['nama_driver']],
        vehicle_id: row[idx['vehicle_id']],
        plat_nomor: row[idx['plat_nomor']],
        nama_kendaraan: row[idx['nama_kendaraan']],
        jenis_kendaraan: row[idx['jenis_kendaraan']],
        rute_tujuan: row[idx['rute_tujuan']],
        kode_cabang: row[idx['kode_cabang']],
        created_by: row[idx['created_by']],
        sisa_hari_pajak: pajak.sisa_hari_pajak,
        status_pajak: pajak.status_pajak
      });
    });
    list.sort((a, b) => String(a.nama_driver || '').localeCompare(String(b.nama_driver || '')));
    const createdBy = list.length > 0 ? list[0].created_by : '';
    return { success: true, list: list, created_by: createdBy };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}
```

- [ ] **Step 2: Tambah wrapper di Code.js**

Tambah di `Code.js` di dekat bagian `// ==== FLAZZ API WRAPPERS` (setelahnya, sebelum akhir file):

```js
// ==========================================
// JALUR PENGIRIMAN API WRAPPERS
// ==========================================
function apiSaveJalur(payload, userInfo) { return saveJalur(payload, userInfo); }
function apiUpdateJalur(data, userInfo) { return updateJalur(data, userInfo); }
function apiDeleteJalur(id) { return deleteJalur(id); }
function apiGetJalurByTanggal(tanggal, userInfo) { return getJalurByTanggal(tanggal, userInfo); }
```

- [ ] **Step 3: Verifikasi sintaks**

Jalankan untuk memastikan tidak ada error parse pada file JS:

```bash
node --check src/JalurOps.js
```

Catatan: `node` diharapkan tersedia; bila tidak, lakukan verifikasi visual. (Perlu cek ketersediaan dahulu — `node --version`.)

- [ ] **Step 4: Commit**

```bash
git add src/JalurOps.js src/Code.js
git commit -m "feat: add JalurOps backend and API wrappers"
```

---

### Task 4: Frontend JalurPages.html + JalurScript.html

**Files:**
- Create: `src/JalurPages.html`
- Create: `src/JalurScript.html`

**Interfaces:**
- Consumes: `apiSaveJalur`, `apiUpdateJalur`, `apiDeleteJalur`, `apiGetJalurByTanggal`, `window.masterData`, global `userInfo`, `showToast`, `switchTab`.
- Produces: elemen page `page-jalur-buat`, `page-jalur-summary`, modal `modal-jalur-edit`, modal `modal-jalur-shot`; fungsi global `loadJalurWrapper()`, `jalurAddRow()`, `jalurSave()`, `jalurShowSummary()`, `jalurTakeScreenshot()`, `jalurShareWA()`, `jalurEdit(id)`, `jalurDelete(id)`, `jalurCloseEdit()`.

- [ ] **Step 1: Tulis JalurPages.html**

Buat `src/JalurPages.html` berisi dua page tab, modal edit, modal screenshot, dan pratinjau summary:

```html
<!-- HALAMAN JALUR PENGIRIMAN -->
<div id='page-jalur-buat' style='display:none;' class='fade-in'>
  <h4 class='mb-3 text-primary fw-bold'><i class='bi bi-truck me-2'></i>Buat Jadwal Pengiriman</h4>
  <div class='card shadow-sm border-0 rounded-4 mb-4'>
    <div class='card-header bg-white border-bottom-0 pt-4 pb-0'>
      <h5 class='mb-0 text-primary fw-bold'><i class='bi bi-calendar-event me-2'></i>Form Jadwal</h5>
    </div>
    <div class='card-body'>
      <div class='mb-3'>
        <label class='form-label fw-bold text-muted small text-uppercase'>Tanggal Pengiriman</label>
        <input type='date' id='jalur-tanggal' class='form-control' required>
      </div>
      <div id='jalur-rows'></div>
      <button type='button' class='btn btn-outline-primary w-100 rounded-4 fw-bold mb-2' onclick='jalurAddRow()'>
        <i class='bi bi-plus-circle me-1'></i> Tambah Baris
      </button>
      <button type='button' class='btn btn-primary w-100 rounded-4 shadow-sm fw-bold' onclick='jalurSave()'>
        <i class='bi bi-check-circle me-1'></i> Simpan Jadwal
      </button>
    </div>
  </div>
</div>

<div id='page-jalur-summary' style='display:none;' class='fade-in'>
  <h4 class='mb-3 text-primary fw-bold'><i class='bi bi-clipboard-data me-2'></i>Summary Jalur Pengiriman</h4>
  <div class='card shadow-sm border-0 rounded-4 mb-4'>
    <div class='card-body'>
      <div class='row g-2 align-items-end'>
        <div class='col-12 col-md-4'>
          <label class='form-label fw-bold text-muted small text-uppercase'>Filter Tanggal</label>
          <input type='date' id='jalur-filter-tanggal' class='form-control'>
        </div>
        <div class='col-12 col-md-8 d-flex flex-wrap gap-2'>
          <button class='btn btn-primary rounded-4 fw-bold' onclick='jalurShowSummary()'><i class='bi bi-search me-1'></i>Tampilkan</button>
          <button class='btn btn-outline-primary rounded-4 fw-bold' onclick='jalurTakeScreenshot()'><i class='bi bi-camera me-1'></i>Screenshot</button>
          <button class='btn btn-outline-success rounded-4 fw-bold' onclick='jalurShareWA()'><i class='bi bi-whatsapp me-1'></i>Bagikan WA</button>
        </div>
      </div>
    </div>
  </div>
  <div id='jalur-summary-loaded' style='display:none;'>
    <div id='jalur-shot' class='card shadow-sm border-0 rounded-4 mb-3'>
      <div class='card-header'>
        <div class='d-flex flex-wrap justify-content-between align-items-center'>
          <div class='fw-bold text-primary'><i class='bi bi-truck me-1'></i>Jalur Pengiriman</div>
          <div class='text-muted small'>Tanggal Pengiriman: <span id='jalur-summary-tanggal' class='fw-semibold'></span></div>
          <div class='text-muted small'>Dibuat oleh: <span id='jalur-summary-created' class='fw-semibold'>-</span></div>
        </div>
      </div>
      <div class='card-body p-0'>
        <div class='table-responsive'>
          <table class='table table-hover align-middle mb-0'>
            <thead class='table-light'>
              <tr>
                <th>Kendaraan</th>
                <th>Driver</th>
                <th>Rute Tujuan</th>
                <th>Pajak</th>
                <th class='text-end'>Aksi</th>
              </tr>
            </thead>
            <tbody id='jalur-summary-table'></tbody>
          </table>
        </div>
      </div>
    </div>
    <div class='text-muted small mb-2' id='jalur-summary-none' style='display:none;'></div>
  </div>
</div>

<!-- Modal Edit Jadwal -->
<div class='modal fade' id='modal-jalur-edit' tabindex='-1'>
  <div class='modal-dialog modal-dialog-centered'>
    <div class='modal-content border-0 rounded-4 shadow'>
      <div class='modal-header bg-primary text-white border-0'>
        <h5 class='modal-title fw-bold'><i class='bi bi-pencil me-2'></i>Edit Jadwal Pengiriman</h5>
        <button type='button' class='btn-close btn-close-white' data-bs-dismiss='modal'></button>
      </div>
      <div class='modal-body p-4'>
        <input type='hidden' id='jalur-edit-id'>
        <div class='mb-3'>
          <label class='form-label text-muted small fw-bold'>Tanggal</label>
          <input type='date' id='jalur-edit-tanggal' class='form-control' required>
        </div>
        <div class='mb-3'>
          <label class='form-label text-muted small fw-bold'>Driver</label>
          <select id='jalur-edit-driver' class='form-select' required></select>
        </div>
        <div class='mb-3'>
          <label class='form-label text-muted small fw-bold'>Kendaraan</label>
          <select id='jalur-edit-vehicle' class='form-select' required></select>
        </div>
        <div class='mb-3'>
          <label class='form-label text-muted small fw-bold'>Rute Tujuan</label>
          <input type='text' id='jalur-edit-rute' class='form-control' required placeholder='ex: Gudang A - Toserba B'>
        </div>
        <button type='button' class='btn btn-primary w-100 rounded-4 fw-bold' onclick='jalurSaveEdit()'><i class='bi bi-check me-1'></i>Simpan</button>
      </div>
    </div>
  </div>
</div>

<!-- Modal Preview Screenshot -->
<div class='modal fade' id='modal-jalur-shot' tabindex='-1'>
  <div class='modal-dialog modal-dialog-centered modal-lg'>
    <div class='modal-content border-0 rounded-4 shadow'>
      <div class='modal-header'>
        <h5 class='modal-title fw-bold'><i class='bi bi-camera me-2'></i>Preview Screenshot</h5>
        <button type='button' class='btn-close' data-bs-dismiss='modal'></button>
      </div>
      <div class='modal-body p-3 text-center'>
        <p class='text-muted small' style='font-size:0.75rem'>Klik kanan pada gambar &raquo; Salin gambar, lalu Ctrl+V di WhatsApp. (Tidak otomatis diunduh).</p>
        <div id='jalur-shot-canvas' class='border rounded-3 p-2 d-inline-block' style='max-width:100%'></div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Tulis JalurScript.html**

Buat `src/JalurScript.html` (fungsi-fungsi global; di-include setelah `FlazzScript`, sebelum `js`):

```html
<script>
function loadJalurWrapper() {}

function jalurRenderDriverOptions(selectId, selected) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const drivers = (window.masterData && window.masterData.supir) || [];
  sel.innerHTML = drivers.map(function(d) {
    return '<option value="' + d.id + '"' + (d.id === selected ? ' selected' : '') + '>' + d.nama + '</option>';
  }).join('');
}

function jalurRenderVehicleOptions(selectId, selected) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const vehicles = (window.masterData && window.masterData.kendaraan) || [];
  sel.innerHTML = vehicles.map(function(v) {
    return '<option value="' + v.vehicle_id + '"' + (v.vehicle_id === selected ? ' selected' : '') + '>' + v.plat_nomor + ' - ' + v.nama + ' (' + v.jenis + ')</option>';
  }).join('');
}

function jalurRowTemplate() {
  return '<div class="row g-2 mb-2 align-items-end jalur-row">' +
    '<div class="col-12 col-md-4"><label class="form-label text-muted small text-uppercase fw-bold">Driver</label>' +
    '<select class="form-select jalur-row-driver"></select></div>' +
    '<div class="col-12 col-md-4"><label class="form-label text-muted small text-uppercase fw-bold">Kendaraan</label>' +
    '<select class="form-select jalur-row-vehicle"></select></div>' +
    '<div class="col-12 col-md-4"><label class="form-label text-muted small text-uppercase fw-bold">Rute Tujuan</label>' +
    '<div class="input-group"><input type="text" class="form-control jalur-row-rute" placeholder="ex: Gudang A - Toko B">' +
    '<button type="button" class="btn btn-outline-danger" onclick="this.closest(\'.jalur-row\').remove()"><i class="bi bi-x"></i></button></div></div>' +
  '</div>';
}

function jalurAddRow() {
  const container = document.getElementById('jalur-rows');
  container.insertAdjacentHTML('beforeend', jalurRowTemplate());
  const last = container.lastElementChild;
  jalurRenderDriverOptions(last.querySelector('.jalur-row-driver').id = 'jalur-drv-' + Date.now());
  jalurRenderVehicleOptions(last.querySelector('.jalur-row-vehicle').id = 'jalur-vhc-' + Date.now());
}

function jalurInitForm() {
  document.getElementById('jalur-rows').innerHTML = '';
  const t = document.getElementById('jalur-tanggal');
  if (!t.value) t.value = new Date().toISOString().slice(0, 10);
  jalurAddRow();
}

function jalurSave() {
  const tanggal = document.getElementById('jalur-tanggal').value;
  if (!tanggal) { showToast('Pilih tanggal pengiriman', 'error'); return; }
  if (!(window.masterData && window.masterData.supir && window.masterData.supir.length)) {
    showToast('Data master belum siap', 'error'); return;
  }
  const rows = [];
  document.querySelectorAll('#jalur-rows .jalur-row').forEach(function(r) {
    const driverId = r.querySelector('.jalur-row-driver').value;
    const vehicleId = r.querySelector('.jalur-row-vehicle').value;
    const rute = r.querySelector('.jalur-row-rute').value;
    if (driverId && vehicleId && rute.trim()) rows.push({ driver_id: driverId, vehicle_id: vehicleId, rute_tujuan: rute.trim() });
  });
  if (!rows.length) { showToast('Isi minimal satu baris lengkap', 'error'); return; }
  google.script.run
    .withSuccessHandler(function(res) {
      showToast(res.msg, res.success ? 'success' : 'error');
      if (res.success) jalurInitForm();
    })
    .withFailureHandler(function(err) { showToast('Gagal menyimpan: ' + err.message, 'error'); })
    .apiSaveJalur({ tanggal: tanggal, rows: rows }, userInfo);
}

function jalurPajakBadge(status, days) {
  if (status === 'TIDAK_ADA') return '<span class="badge bg-secondary">Pajak -</span>';
  if (status === 'LEWAT') return '<span class="badge bg-dark">Pajak lewat ' + Math.abs(days) + ' hari</span>';
  if (status === 'KRITIS') return '<span class="badge bg-danger">Pajak habis dalam ' + days + ' hari</span>';
  if (status === 'WASPADA') return '<span class="badge bg-warning text-dark">Pajak habis dalam ' + days + ' hari</span>';
  return '<span class="badge bg-success">Pajak habis dalam ' + days + ' hari</span>';
}

function jalurShowSummary() {
  const tanggal = document.getElementById('jalur-filter-tanggal').value;
  if (!tanggal) { showToast('Pilih tanggal untuk menampilkan', 'error'); return; }
  google.script.run
    .withSuccessHandler(function(res) {
      const loaded = document.getElementById('jalur-summary-loaded');
      if (!res.success || !res.list || !res.list.length) {
        loaded.style.display = 'block';
        document.getElementById('jalur-shot').style.display = 'none';
        document.getElementById('jalur-summary-none').style.display = 'block';
        document.getElementById('jalur-summary-none').textContent = 'Belum ada jadwal pengiriman pada ' + tanggal + '.';
        return;
      }
      document.getElementById('jalur-shot').style.display = '';
      document.getElementById('jalur-summary-none').style.display = 'none';
      document.getElementById('jalur-summary-tanggal').textContent = tanggal;
      document.getElementById('jalur-summary-created').textContent = res.created_by || '-';
      const tbody = document.getElementById('jalur-summary-table');
      tbody.innerHTML = res.list.map(function(it) {
        return '<tr>' +
          '<td><i class="bi ' + (it.jenis_kendaraan === 'Motor' ? 'bi-bicycle' : 'bi-truck') + ' me-2 text-primary"></i>' + it.plat_nomor + ' <span class="text-muted small">' + it.nama_kendaraan + '</span></td>' +
          '<td>' + it.nama_driver + '</td>' +
          '<td>' + it.rute_tujuan + '</td>' +
          '<td>' + jalurPajakBadge(it.status_pajak, it.sisa_hari_pajak) + '</td>' +
          '<td class="text-end"><button class="btn btn-sm btn-outline-primary me-1" onclick="jalurEdit(\'' + it.id + '\')"><i class="bi bi-pencil"></i></button>' +
          '<button class="btn btn-sm btn-outline-danger" onclick="jalurDelete(\'' + it.id + '\')"><i class="bi bi-trash"></i></button></td>' +
        '</tr>';
      }).join('');
      loaded.style.display = 'block';
    })
    .withFailureHandler(function(err) { showToast('Gagal memuat: ' + err.message, 'error'); })
    .apiGetJalurByTanggal(tanggal, userInfo);
}

function jalurEdit(id) {
  const rows = document.querySelectorAll('#jalur-summary-table tr');
  let rec = null;
  rows.forEach(function(tr) {
    if (JSON.stringify(rec)) return;
  });
  // Muat ulang data lewat pemanggilan API lalu isi modal secara sederhana:
  const tanggal = document.getElementById('jalur-filter-tanggal').value;
  google.script.run
    .withSuccessHandler(function(res) {
      if (!res.success || !res.list) return;
      const it = res.list.find(function(x) { return String(x.id) === String(id); });
      if (!it) return;
      document.getElementById('jalur-edit-id').value = it.id;
      document.getElementById('jalur-edit-tanggal').value = it.tanggal;
      jalurRenderDriverOptions('jalur-edit-driver', it.driver_id);
      jalurRenderVehicleOptions('jalur-edit-vehicle', it.vehicle_id);
      document.getElementById('jalur-edit-rute').value = it.rute_tujuan;
      new bootstrap.Modal(document.getElementById('modal-jalur-edit')).show();
    })
    .apiGetJalurByTanggal(tanggal, userInfo);
}

function jalurSaveEdit() {
  const id = document.getElementById('jalur-edit-id').value;
  const data = {
    id: id,
    tanggal: document.getElementById('jalur-edit-tanggal').value,
    driver_id: document.getElementById('jalur-edit-driver').value,
    vehicle_id: document.getElementById('jalur-edit-vehicle').value,
    rute_tujuan: document.getElementById('jalur-edit-rute').value
  };
  google.script.run
    .withSuccessHandler(function(res) {
      showToast(res.msg, res.success ? 'success' : 'error');
      if (res.success) {
        bootstrap.Modal.getInstance(document.getElementById('modal-jalur-edit')).hide();
        jalurShowSummary();
      }
    })
    .withFailureHandler(function(err) { showToast('Gagal: ' + err.message, 'error'); })
    .apiUpdateJalur(data, userInfo);
}

function jalurDelete(id) {
  if (!confirm('Yakin ingin menghapus jadwal ini?')) return;
  google.script.run
    .withSuccessHandler(function(res) {
      showToast(res.msg, res.success ? 'success' : 'error');
      jalurShowSummary();
    })
    .withFailureHandler(function(err) { showToast('Gagal menghapus: ' + err.message, 'error'); })
    .apiDeleteJalur(id);
}

function jalurSummaryText() {
  const rows = document.querySelectorAll('#jalur-summary-table tr');
  const tanggal = document.getElementById('jalur-summary-tanggal').textContent;
  const created = document.getElementById('jalur-summary-created').textContent;
  let text = 'JALUR PENGIRIMAN\nTanggal: ' + tanggal + '\nDibuat oleh: ' + created + '\n\n';
  rows.forEach(function(tr) {
    const tds = tr.querySelectorAll('td');
    if (tds.length >= 4) {
      text += '- ' + tds[0].textContent.trim() + ' | Driver: ' + tds[1].textContent.trim() + ' | Rute: ' + tds[2].textContent.trim() + '\n';
    }
  });
  return text;
}

function jalurShareWA() {
  const text = encodeURIComponent(jalurSummaryText());
  window.open('https://wa.me/?text=' + text, '_blank');
}

function jalurTakeScreenshot() {
  const shot = document.getElementById('jalur-shot');
  if (!shot || shot.style.display === 'none') { showToast('Tampilkan dulu jadwal pada tanggal yang dipilih', 'error'); return; }
  if (typeof html2canvas === 'undefined') { showToast('Library screenshot belum dimuat', 'error'); return; }
  html2canvas(shot, { scale: 2, backgroundColor: '#ffffff' }).then(function(canvas) {
    const container = document.getElementById('jalur-shot-canvas');
    container.innerHTML = '';
    canvas.style.maxWidth = '100%';
    container.appendChild(canvas);
    new bootstrap.Modal(document.getElementById('modal-jalur-shot')).show();
  }).catch(function(e) { showToast('Gagal screenshot: ' + e, 'error'); });
}
</script>
```

Catatan: pastikan definisi fungsi di atas berada di cakupan global (bukan di dalam IIFE), karena dipanggil dari atribut `onclick`.

- [ ] **Step 3: Verifikasi** — baca ulang untuk memastikan tidak ada fungsi duplikat dengan `js.html`, dan semua elemen id disebut di HTML ada.

- [ ] **Step 4: Commit**

```bash
git add src/JalurPages.html src/JalurScript.html
git commit -m "feat: add Jalur Pengiriman frontend pages and script"
```

---

### Task 5: Integrasi Index.html (navigasi + include + master pajak)

**Files:**
- Modify: `src/Index.html` — bottom-nav (74-96), sidebar (101-147), area include halaman (~804-806), blok script (~879-881), modal master kendaraan (~615-624).

**Interfaces:**
- Produces: elemen `tab-jalur-buat`, `tab-jalur-summary`, `btn-nav-jalur`, include `JalurPages` & `JalurScript`, field `m_tanggal_pajak` di modal kendaraan.

- [ ] **Step 1: Tambah bottom-nav item (mobile)**

Di dalam `#bottom-nav`, setelah tombol `gallery` (sebelum `btn-nav-master`):

```html
          <button class='btn-nav' onclick='switchTab("jalur-buat")' data-tab='jalur-buat'>
            <i class='bi bi-truck'></i>
            <span>Jalur</span>
          </button>
```

- [ ] **Step 2: Tambah sidebar item (desktop)**

Di dalam sidebar, setelah item `Galeri Foto` (`tab-gallery`) dan sebelum heading `FLAZZ`:

```html
          <div class='sidebar-heading text-muted mt-3 mb-1 px-3 fw-bold' style='font-size:0.75rem'>JALUR</div>
          <a class='nav-link sidebar-link' id='tab-jalur-buat' href='#' onclick='switchTab("jalur-buat")'>
            <i class='bi bi-pencil-square'></i> <span>Buat Jadwal</span>
          </a>
          <a class='nav-link sidebar-link' id='tab-jalur-summary' href='#' onclick='switchTab("jalur-summary")'>
            <i class='bi bi-clipboard-data'></i> <span>Summary Pengiriman</span>
          </a>
```

- [ ] **Step 3: Tambah include halaman & script**

Setelah `<?!= include('FlazzPages'); ?>` (~line 805):

```html
      <?!= include('JalurPages'); ?>
```

Setelah `<?!= include('FlazzScript'); ?>` dan sebelum `<?!= include('js'); ?>` (~line 880-881):

```html
    <?!= include('JalurScript'); ?>
```

Dan load `html2canvas` sebelum `JalurScript` (tambahkan include setelah baris `bootstrap.bundle.min.js`, ~line 879):

```html
    <?!= include('Html2canvasLib'); ?>
    <?!= include('JalurScript'); ?>
```

- [ ] **Step 4: Tambah field tanggal_pajak di modal master kendaraan**

Di `form-kendaraan`, setelah field `Jenis Indikator BBM` (`m_jenis_indikator`) dan sebelum `m_cabang`:

```html
                        <div class='mb-3'>
                          <label class='form-label'>Tanggal Jatuh Tempo Pajak</label>
                          <input type='date' id='m_tanggal_pajak' class='form-control'>
                        </div>
```

- [ ] **Step 5: Verifikasi** — pastikan atribut `id` baru unik dan tidak bentrok.

- [ ] **Step 6: Commit**

```bash
git add src/Index.html
git commit -m "feat: integrate Jalur Pengiriman navigation and master tax field"
```

---

### Task 6: js.html — switchTab jalur + master kendaraan tanggal_pajak

**Files:**
- Modify: `src/js.html` — `switchTab` (~296-341), `addMasterKendaraan` (~1154), `editKendaraan` (cari lokasi), render/payload master.

**Interfaces:**
- Produces: `switchTab('jalur-*')` menampilkan `page-jalur-*`; `addMasterKendaraan`/`editKendaraan` membaca & mengirim `tanggal_pajak`; form diisi ulang dengan `tanggal_pajak` saat edit.
- Consumes: `userInfo`, `window.masterData`, `showToast`.

- [ ] **Step 1: Tambah handler switchTab untuk jalur**

Dalam `switchTab`, tambahkan di bagian logika menampilkan halaman (setelah blok `tab.startsWith('flazz-')`):

```js
    } else if (tab === 'jalur-buat') {
      document.getElementById('page-jalur-buat').style.display = 'block';
      if (typeof jalurInitForm === 'function') jalurInitForm();
    } else if (tab === 'jalur-summary') {
      document.getElementById('page-jalur-summary').style.display = 'block';
      if (typeof jalurShowSummary === 'function') jalurShowSummary();
    }
```

Catatan: ajuga tambahkan penutupan halaman jalur pada bagian atas fungsi (yang menyembunyikan semua page). Sisipkan baris ini setelah loop `flazzPages.forEach`:

```js
    let jalurPages = ['buat', 'summary'];
    jalurPages.forEach(p => {
       let el = document.getElementById('page-jalur-' + p);
       if(el) el.style.display = 'none';
    });
```

- [ ] **Step 2: Perluas addMasterKendaraan dengan tanggal_pajak**

Baca fungsi `addMasterKendaraan` (di `js.html`). Dalam objek payload yang dikirim ke `saveMasterKendaraan`, tambahkan `tanggal_pajak`:

```js
      tanggal_pajak: document.getElementById('m_tanggal_pajak').value || ''
```

- [ ] **Step 3: Perluas editKendaraan + simpan nilai edit**

Pada fungsi yang mengisi modal kendaraan saat edit (`editKendaraan`), isi `m_tanggal_pajak` dari data kendaraan:

```js
      document.getElementById('m_tanggal_pajak').value = (v.tanggal_pajak || '').slice(0, 10) || '';
```

Pada fungsi yang mengirim update kendaraan (payload `updateMasterKendaraan`), tambahkan `tanggal_pajak` yang sama seperti Step 2.

- [ ] **Step 4: Verifikasi** — cek tidak ada `getElementById('m_tanggal_pajak')` tanpa elemen target (elemen ADAH di Task 5 step 4).

- [ ] **Step 5: Commit**

```bash
git add src/js.html
git commit -m "feat: wire jalur tabs and master vehicle tax field in client"
```

---

### Task 7: css.html — style badge & halaman jalur

**Files:**
- Modify: `src/css.html` (tambahkan aturan di akhir file `<style>`).

**Interfaces:**
- Produces: class style untuk badge pajak & elemen jalur (opsional jika sudah cukup, tetapi standarisasi warna).

- [ ] **Step 1: Tambah CSS**

Tambah di dalam `<style>` `css.html`:

```css
/* Jalur Pengiriman */
#jalur-shot .badge { font-size: 0.7rem; }
.badge.bg-danger { background-color: var(--bs-danger) !important; color: #fff; }
.badge.bg-warning { background-color: var(--bs-warning) !important; color: #000; }
.badge.bg-success { background-color: var(--bs-success) !important; color: #fff; }
```

- [ ] **Step 2: Verifikasi** — pastikan aturan tidak merusak gaya lain (hanya menambah).

- [ ] **Step 3: Commit**

```bash
git add src/css.html
git commit -m "style: add jalur badge styles"
```

---

### Task 8: html2canvas sebagai client-side include

**Files:**
- Create: `src/Html2canvasLib.html`

**Interfaces:**
- Produces: global `html2canvas` di halaman (dipakai `jalurTakeScreenshot`).

> **Catatan teknis:** File `.js` di Google Apps Script diperlakukan sebagai **server-side** dan TIDAK disajikan sebagai aset statis ke client. Karena itu html2canvas harus di-embed sebagai `<script>` di dalam file HTML (`Html2canvasLib.html`) dan disuntikkan via `<?!= include('Html2canvasLib'); ?>`. Library hanya berjalan di sisi client.

- [ ] **Step 1: Unduh html2canvas sebagai sumber**

```powershell
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" -OutFile "$env:TEMP\html2canvas.min.js"
```

- [ ] **Step 2: Bungkus ke dalam file HTML include**

Buat `src/Html2canvasLib.html` berisi `<script>` + isi minified + `</script>` (tanpa ekstra whitespace berlebih):

```powershell
$body = Get-Content -Raw "$env:TEMP\html2canvas.min.js"
Set-Content -Path "D:\Monitoring BBM\src\Html2canvasLib.html" -Value ("<script>" + $body + "</script>") -Encoding UTF8 -NoNewline
```

- [ ] **Step 3: Include di Index.html**

Pada bagian blok script (setelah `bootstrap.bundle.min.js`, sebelum `FlazzScript`):

```html
    <?!= include('Html2canvasLib'); ?>
```

- [ ] **Step 4: Verifikasi** — pastikan `Html2canvasLib.html` berisi tepat 1 `<script>` & 1 `</script>`, tanpa `<?` (scriptlet), dan JS di dalamnya lolos `node --check`.

- [ ] **Step 5: Commit**

```bash
git add src/Html2canvasLib.html src/Index.html
git commit -m "vendor: add html2canvas client-side include for screenshot preview"
```

---

### Task 9: Verifikasi end-to-end + deploy

**Files:**
- Run: `src/` (clasp)

- [ ] **Step 1: Cek ketersediaan node & clasp**

```bash
node --version
```

```bash
cd src; clasp --version
```

- [ ] **Step 2: Parse-check seluruh JS**

```bash
node --check src/JalurOps.js
node --check src/Code.js
node --check src/SpreadsheetOps.js
node --check src/DatabaseSetup.js
```

- [ ] **Step 3: Push & deploy**

```bash
cd src
clasp push
clasp deploy -d "feat: jalur pengiriman module"
```

- [ ] **Step 4: Verifikasi manual di Web App**
- Jalankan `setupDatabase` di editor untuk menerapkan sheet & kolom baru.
- Login, buka menu **Jalur &rarr; Buat Jadwal**, isi tanggal + 1 baris (driver, kendaraan, rute), simpan.
- Buka **Summary Pengiriman**, pilih tanggal yang sama, klik **Tampilkan** &rarr; baris muncul dgn nama driver, kendaraan, rute, dan badge pajak.
- Klik **Screenshot** &rarr; modal pratinjau muncul; klik kanan &rarr; Salin gambar; Ctrl+V di WA berhasil.
- Klik **Bagikan WA** &rarr; terbuka wa.me dengan teks summary terisi.
- Master &rarr; Kendaraan &rarr; edit: field tanggal pajak tersimpan & badge sisa hari sesuai.

- [ ] **Step 5: Komit README (Task 10) & commit akhir**

```bash
git add .
git commit -m "docs: document Jalur Pengiriman module"
```

---

### Task 10: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Tambah deskripsi fitur**

Tambahkan bagian fitur "Jalur Pengiriman" pada `README.md` (setelah bagian Flazz), dan tambahkan baris pada tabel `Struktur File` untuk `JalurOps.js`, `JalurPages.html`, `JalurScript.html`, `html2canvas.min.js`, dan sebutkan kolom `tanggal_pajak` pada sheet `Kendaraan` di bagian setup database (baris sheet list).

- [ ] **Step 2: Verifikasi & commit**

```bash
git add README.md
git commit -m "docs: document Jalur Pengiriman module"
```
