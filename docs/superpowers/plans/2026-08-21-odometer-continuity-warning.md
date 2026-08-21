# Odometer Continuity Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mendeteksi indikasi pemakaian kendaraan di luar jam kerja dengan membandingkan KM awal transaksi baru vs KM akhir transaksi terakhir kendaraan yang sama, lalu menandai selisih sebagai warning di sheet dan dashboard.

**Architecture:** Validasi dilakukan server-side di `saveTransactionEndOfDay()` sebelum baris di-append ke sheet `Penggunaan_BBM`. Helper baru mencari transaksi terakhir per `vehicle_id`, membandingkan nilai, dan mengisi kolom `warning` (index 25) yang sudah ada. Dashboard mengambil field `warning` lewat `getRecentTransactions()` dan menampilkannya sebagai badge (table desktop) dan strip peringatan (card mobile).

**Tech Stack:** Google Apps Script (V8), Google Sheets sebagai DB, Bootstrap 5 + Bootstrap Icons untuk UI.

## Global Constraints

- Semua perubahan backend di `src/SpreadsheetOps.js` (bukan file .gs lain; project sudah distandardisasi ke `.js`).
- Kolom `warning` = index 25 pada sheet `Penggunaan_BBM` (lihat header di `src/DatabaseSetup.js:16`); JANGAN menambah kolom baru.
- Transaksi dengan selisih TETAP DISIMPAN (`status` tetap `'COMPLETED'`) — tidak ada pemblokiran.
- Perbandingan KM memakai nilai numerik hasil `parseFloat`, exact match (tanpa toleransi).
- Pesan warning berbahasa Indonesia, format angka `toLocaleString('id-ID')`.
- Transaksi tanpa riwayat sebelumnya → `warning` tetap `''`.
- Tidak ada test framework di repo; verifikasi otomatis terbatas pada `node --check` (syntax) + verifikasi manual via clasp/web app.
- Jangan mengubah struktur/urutan kolom lain pada `row` yang di-append.

---

### Task 1: Backend — helper pencarian transaksi terakhir + penulisan kolom warning

**Files:**
- Modify: `src/SpreadsheetOps.js` (tambah helper setelah `driveThumbnail`, sekitar line 127; ubah `saveTransactionEndOfDay` line 74–121)

**Interfaces:**
- Consumes: `getDB()` (sudah ada, SpreadsheetOps.js:2), `payload.vehicle_id` dan `payload.km_awal_confirmed` dari `saveTransactionEndOfDay`.
- Produces:
  - `getLastTransactionForVehicle(vehicleId)` → `{ km_akhir: number, tanggal: Date|string }` atau `null`
  - `buildOdoWarning(kmAwalBaru: number, prevKmAkhir: number, prevTanggal: Date|string)` → `string`
  - Kolom index 25 pada row baru berisi pesan warning atau `''`.

- [ ] **Step 1: Baca file dan pastikan posisi edit**

Buka `src/SpreadsheetOps.js`. Konfirmasi `saveTransactionEndOfDay` berada di line ~74 dan `driveThumbnail` di line ~123. Konfirmasi baris yang di-append saat ini (line 111–118) berisi `..., efisiensi, 'COMPLETED', '', payload.nama_supir` — string kosong `''` itulah kolom warning (index 25) yang akan diganti.

- [ ] **Step 2: Tambahkan dua fungsi helper**

Sisipkan tepat sebelum fungsi `driveThumbnail`:

```javascript
function getLastTransactionForVehicle(vehicleId) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][6] === vehicleId) { // vehicle_id = kolom index 6
      return {
        km_akhir: parseFloat(data[i][14]) || 0, // km_akhir_confirmed = index 14
        tanggal: data[i][2]                     // tanggal = index 2
      };
    }
  }
  return null;
}

function buildOdoWarning(kmAwalBaru, prevKmAkhir, prevTanggal) {
  const selisih = kmAwalBaru - prevKmAkhir;
  const tgl = prevTanggal instanceof Date
    ? prevTanggal.toLocaleDateString('id-ID')
    : String(prevTanggal || '-');
  return 'SELISIH ODO: KM akhir terakhir ' + prevKmAkhir.toLocaleString('id-ID') +
    ' (' + tgl + '), KM awal ' + kmAwalBaru.toLocaleString('id-ID') +
    ', selisih ' + selisih.toLocaleString('id-ID') +
    ' KM - indikasi pemakaian di luar jam kerja';
}
```

- [ ] **Step 3: Hitung warning di `saveTransactionEndOfDay`**

Di dalam `saveTransactionEndOfDay`, setelah baris `let efisiensi = ...` (line ~109) tambahkan:

```javascript
  let warning = '';
  const prevTrx = getLastTransactionForVehicle(payload.vehicle_id);
  if (prevTrx && km_awal !== prevTrx.km_akhir) {
    warning = buildOdoWarning(km_awal, prevTrx.km_akhir, prevTrx.tanggal);
  }
```

- [ ] **Step 4: Tulis warning ke kolom index 25**

Ubah array `row` pada `sheet.appendRow(row)`. Ganti elemen `'COMPLETED', '', payload.nama_supir` menjadi `'COMPLETED', warning, payload.nama_supir`. Hasil akhir blok row:

```javascript
  let row = [
    transaction_id, new Date(), payload.tanggal, payload.userInfo.username, userName, trxCabang, payload.vehicle_id, platNomor,
    payload.serverData.files.odo_awal, payload.serverData.km_awal, km_awal, payload.bar_awal,
    payload.serverData.files.odo_akhir, payload.serverData.km_akhir, km_akhir, payload.bar_akhir,
    km_tempuh, (payload.bar_awal - payload.bar_akhir), liter, payload.biaya_bbm,
    payload.serverData.files.struk_bbm || '', payload.biaya_toll, payload.serverData.files.struk_toll || '',
    efisiensi, 'COMPLETED', warning, payload.nama_supir
  ];
```

- [ ] **Step 5: Verifikasi syntax**

Run: `node --check src/SpreadsheetOps.js`
Expected: keluar tanpa output (exit code 0). `node --check` hanya memeriksa syntax, global GAS seperti `SpreadsheetApp` tidak masalah.

- [ ] **Step 6: Commit**

```bash
git add src/SpreadsheetOps.js
git commit -m "feat: flag odometer gap vs last transaction in warning column"
```

---

### Task 2: Dashboard — ikutkan field warning dan tampilkan badge/strip

**Files:**
- Modify: `src/SpreadsheetOps.js` — objek result di `getRecentTransactions` (line ~184–199)
- Modify: `src/js.html` — render table history (line ~490–506), render card history (line ~508–545)

**Interfaces:**
- Consumes: kolom `warning` index 25 dari sheet (ditulis Task 1).
- Produces: field `warning: string` pada tiap item hasil `getRecentTransactions`; helper client `odoWarningBadgeHtml(warning)` dan `escapeAttr(str)` di `js.html`.

- [ ] **Step 1: Tambahkan field `warning` di `getRecentTransactions`**

Pada objek yang di-push ke `result` (setelah `status_efisiensi: statusEfisiensi,`), tambahkan:

```javascript
      warning: row[25] || '',
```

- [ ] **Step 2: Verifikasi syntax SpreadsheetOps.js**

Run: `node --check src/SpreadsheetOps.js`
Expected: exit code 0.

- [ ] **Step 3: Tambahkan helper escape + badge di `js.html`**

Letakkan di samping `efisiensiBadge` (sekitar line 559):

```javascript
  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  }

  function odoWarningBadgeHtml(warning) {
    if (!warning) return '';
    return " <span class='badge bg-warning' title='" + escapeAttr(warning) + "'><i class='bi bi-exclamation-triangle'></i></span>";
  }

  function odoWarningStripHtml(warning) {
    if (!warning) return '';
    return "<div class='text-warning small mb-2'><i class='bi bi-exclamation-triangle me-1'></i>" + escapeAttr(warning) + "</div>";
  }
```

- [ ] **Step 4: Tampilkan badge di table (desktop)**

Pada loop pertama `data.forEach` (render `<tr>`), ganti cell kendaraan:

```javascript
            "<td>" + row.vehicle + odoWarningBadgeHtml(row.warning) + "</td>" +
```

(sebelumnya: `"<td>" + row.vehicle + "</td>" +`)

- [ ] **Step 5: Tampilkan strip di card (mobile)**

Pada loop kedua `data.forEach` (render card), ganti baris nama kendaraan:

```javascript
              "<div class='mb-2'><strong>" + row.vehicle + "</strong></div>" +
              odoWarningStripHtml(row.warning) +
```

(sebelumnya hanya `"<div class='mb-2'><strong>" + row.vehicle + "</strong></div>" +`)

- [ ] **Step 6: Commit**

```bash
git add src/SpreadsheetOps.js src/js.html
git commit -m "feat: show odometer gap warning badge on dashboard history"
```

---

### Task 3: Verifikasi manual end-to-end (perlu akses clasp & web app)

**Files:**
- Tidak ada perubahan kode. Deploy & uji.

**Interfaces:**
- Consumes: semua kode dari Task 1–2 sudah di-commit.
- Produces: konfirmasi fitur bekerja sesuai spec bagian 5.

- [ ] **Step 1: Push ke Apps Script**

Run (dari folder `src/`): `clasp push`
Expected: `Pushed N files.` Jika belum login clasp, minta user menjalankan `clasp login` terlebih dulu.

- [ ] **Step 2: Uji skenario A — tanpa riwayat**

Buka web app, simpan transaksi untuk kendaraan yang BELUM punya transaksi.
Expected: tersimpan normal, kolom `warning` kosong, dashboard tanpa badge ⚠.

- [ ] **Step 3: Uji skenario B — KM cocok**

Simpan transaksi kedua untuk kendaraan sama dengan KM awal (hasil OCR foto) PERSIS sama dengan KM akhir transaksi pertama.
Expected: tersimpan normal, kolom `warning` kosong, dashboard tanpa badge.

- [ ] **Step 4: Uji skenario C — KM selisih (indikasi dipakai di luar jam kerja)**

Simpan transaksi ketiga dengan KM awal LEBIH BESAR dari KM akhir transaksi kedua (mis. selisih 270).
Expected: kolom `warning` di sheet `Penggunaan_BBM` terisi pesan `SELISIH ODO: KM akhir terakhir ... (tanggal), KM awal ..., selisih ... KM - indikasi pemakaian di luar jam kerja`; dashboard menampilkan badge ⚠ kuning di kolom kendaraan (table desktop) dan strip teks kuning di card (mobile).

- [ ] **Step 5: Commit (jika ada perbaikan)**

Jika ada bug yang ditemukan dan diperbaiki:

```bash
git add -A
git commit -m "fix: adjust odometer warning after manual verification"
```

Jika semua lolos tanpa perubahan, task selesai tanpa commit.
