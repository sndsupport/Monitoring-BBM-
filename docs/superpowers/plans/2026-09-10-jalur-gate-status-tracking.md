# Jalur Pengiriman Gate + Status Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blokir pembuatan jalur pengiriman baru per kendaraan jika jalur sebelumnya (non-flazz belum laporan, flazz belum rekonsiliasi) belum selesai.

**Architecture:** Tambah kolom `status` dan `laporan_id` di sheet `Jalur_Pengiriman`. Status mengalir `BELUM_DIISI` → `SUDAH_LAPORAN` (saat laporan disimpan) → `SELESAI` (saat rekonsiliasi selesai, khusus jalur flazz). `saveJalur()` memanggil `checkIncompleteJalurForVehicle()` per kendaraan dan menolak save bila ada yang memblokir.

**Tech Stack:** Google Apps Script (backend), HTML/Bootstrap 5 (frontend), Google Sheets (database)

## Global Constraints

- Status constants: `BELUM_DIISI`, `SUDAH_LAPORAN`, `SELESAI`
- Non-flazz final = `SUDAH_LAPORAN`; flazz final = `SELESAI`
- Gate berlaku untuk semua role termasuk SUPERADMIN
- Gate hanya cek jalur dengan tanggal < tanggal input (strictly before)
- `is_deleted` = '1' di-skip pada semua query jalur
- Akses header kolom selalu dinamis via `jalurColIdx(sheet)` dan `idx['status'] !== undefined`
- Verifikasi sintaks tiap task memakai `node --check` pada file yang di-extract (`deploy.ps1` pattern)

---

### Task 1: Tambah Schema Fields ke Jalur_Pengiriman

**Files:**
- Modify: `src/DatabaseSetup.js:44`

**Interfaces:**
- Consumes: None
- Produces: Sheet `Jalur_Pengiriman` akan punya kolom `status` dan `laporan_id` (auto-migrated oleh `setupDatabase()`)

- [ ] **Step 1: Tambah fields ke schema**

`src/DatabaseSetup.js` baris 44, tambah `'status'` dan `'laporan_id'` di akhir headers:

```javascript
    { name: 'Jalur_Pengiriman', headers: ['id', 'tanggal', 'driver_id', 'nama_driver', 'driver2_id', 'nama_driver2', 'vehicle_id', 'plat_nomor', 'nama_kendaraan', 'jenis_kendaraan', 'rute_tujuan', 'kode_cabang', 'flazz_card_id', 'flazz_card_name', 'created_by', 'created_at', 'updated_at', 'is_deleted', 'status', 'laporan_id'] }
```

- [ ] **Step 2: Verifikasi migrasi**

Run: `node --check src/DatabaseSetup.js`
Expected: OK (tanpa output error)
Deploy atau panggil `setupDatabase()` dari Apps Script editor. Expected: sheet `Jalur_Pengiriman` mendapat 2 kolom baru di ujung kanan, data lama tidak berubah.

- [ ] **Step 3: Commit**

```bash
git add src/DatabaseSetup.js
git commit -m "feat(jalur): add status and laporan_id to schema"
```

---

### Task 2: Helper Functions di JalurOps.js

**Files:**
- Modify: `src/JalurOps.js` (tambahkan setelah `findJalurRow`, baris 45)

**Interfaces:**
- Consumes: `jalurSheet()`, `jalurColIdx(sheet)`, `findJalurRow(sheet, id)`, `getDB()`
- Produces:
  - `updateJalurStatus(jalurId, newStatus, laporanId)` → void
  - `findJalurByCriteria(criteria)` → `{ id, status, flazz_card_id, tanggalJalur, kode_cabang, nama_driver, plat_nomor, rowIndex } | null`, criteria = `{ tanggal?, vehicle_id?, nama_driver?, kode_cabang?, flazz_card_id? }`
  - `checkIncompleteJalurForVehicle(vehicleId, tanggal)` → `{ blocked, incompleteJalur | null }`

- [ ] **Step 1: Tambah updateJalurStatus + findJalurByCriteria**

`src/JalurOps.js`, setelah `findJalurRow` (baris 45), tambahkan:

```javascript
function updateJalurStatus(jalurId, newStatus, laporanId) {
  try {
    const sheet = jalurSheet();
    if (!sheet) return;
    const found = findJalurRow(sheet, jalurId);
    if (!found) return;
    const idx = found.idx;
    if (idx['status'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['status'] + 1).setValue(newStatus);
    }
    if (laporanId && idx['laporan_id'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['laporan_id'] + 1).setValue(laporanId);
    }
    if (idx['updated_at'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['updated_at'] + 1).setValue(new Date());
    }
  } catch (e) {
    Logger.log('updateJalurStatus error: ' + e.toString());
  }
}

function findJalurByCriteria(criteria) {
  try {
    const sheet = jalurSheet();
    if (!sheet || sheet.getLastRow() <= 1) return null;
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iDeleted = idx['is_deleted'];
    let best = null;
    for (let i = 1; i < data.length; i++) {
      if (iDeleted !== undefined && String(data[i][iDeleted]) === '1') continue;
      let match = true;
      let rowTgl = '';
      if (idx['tanggal'] !== undefined) {
        const rawTgl = data[i][idx['tanggal']];
        if (rawTgl instanceof Date) {
          const tz = getDB().getSpreadsheetTimeZone();
          rowTgl = Utilities.formatDate(rawTgl, tz, 'yyyy-MM-dd');
        } else {
          rowTgl = String(rawTgl).substring(0, 10);
        }
      }
      if (criteria.tanggal && rowTgl !== String(criteria.tanggal).substring(0, 10)) match = false;
      if (match && criteria.vehicle_id && String(data[i][idx['vehicle_id']]) !== String(criteria.vehicle_id)) match = false;
      if (match && criteria.nama_driver && String(data[i][idx['nama_driver']] || '') !== String(criteria.nama_driver)) match = false;
      if (match && criteria.kode_cabang && String(data[i][idx['kode_cabang']] || '') !== String(criteria.kode_cabang)) match = false;
      if (match && criteria.flazz_card_id) {
        const cardVal = (idx['flazz_card_id'] !== undefined) ? String(data[i][idx['flazz_card_id']] || '') : '';
        if (cardVal !== String(criteria.flazz_card_id)) match = false;
      }
      if (match) {
        const rec = {
          id: data[i][idx['id']],
          status: (idx['status'] !== undefined) ? String(data[i][idx['status']] || 'BELUM_DIISI') : 'BELUM_DIISI',
          flazz_card_id: (idx['flazz_card_id'] !== undefined) ? String(data[i][idx['flazz_card_id']] || '') : '',
          tanggalJalur: rowTgl,
          kode_cabang: (idx['kode_cabang'] !== undefined) ? String(data[i][idx['kode_cabang']] || '') : '',
          nama_driver: (idx['nama_driver'] !== undefined) ? String(data[i][idx['nama_driver']] || '') : '',
          plat_nomor: (idx['plat_nomor'] !== undefined) ? String(data[i][idx['plat_nomor']] || '') : '',
          rowIndex: i + 1
        };
        // Kembalikan record TERAKHIR yang cocok (baris paling bawah = paling baru).
        best = rec;
      }
    }
    return best;
  } catch (e) {
    Logger.log('findJalurByCriteria error: ' + e.toString());
    return null;
  }
}
```

- [ ] **Step 2: Tambah checkIncompleteJalurForVehicle**

`src/JalurOps.js`, tambahkan setelah `findJalurByCriteria`:

```javascript
function checkIncompleteJalurForVehicle(vehicleId, tanggal) {
  try {
    const sheet = jalurSheet();
    if (!sheet || sheet.getLastRow() <= 1) return { blocked: false, incompleteJalur: null };
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iDeleted = idx['is_deleted'];
    const inputTgl = String(tanggal || '').substring(0, 10);
    let latest = null;
    for (let i = 1; i < data.length; i++) {
      if (iDeleted !== undefined && String(data[i][iDeleted]) === '1') continue;
      if (String(data[i][idx['vehicle_id']]) !== String(vehicleId)) continue;
      let rowTgl = data[i][idx['tanggal']];
      if (rowTgl instanceof Date) {
        const tz = getDB().getSpreadsheetTimeZone();
        rowTgl = Utilities.formatDate(rowTgl, tz, 'yyyy-MM-dd');
      } else {
        rowTgl = String(rowTgl).substring(0, 10);
      }
      if (!inputTgl || rowTgl >= inputTgl) continue;
      if (!latest || rowTgl > latest.tanggal) {
        latest = {
          id: data[i][idx['id']],
          tanggal: rowTgl,
          plat_nomor: (idx['plat_nomor'] !== undefined) ? String(data[i][idx['plat_nomor']] || '') : '',
          status: (idx['status'] !== undefined) ? String(data[i][idx['status']] || 'BELUM_DIISI') : 'BELUM_DIISI',
          flazz_card_id: (idx['flazz_card_id'] !== undefined) ? String(data[i][idx['flazz_card_id']] || '') : ''
        };
      }
    }
    if (!latest) return { blocked: false, incompleteJalur: null };
    const finalStatus = latest.flazz_card_id ? 'SELESAI' : 'SUDAH_LAPORAN';
    const blocked = latest.status !== finalStatus;
    return { blocked: blocked, incompleteJalur: blocked ? latest : null };
  } catch (e) {
    Logger.log('checkIncompleteJalurForVehicle error: ' + e.toString());
    return { blocked: false, incompleteJalur: null };
  }
}
```

- [ ] **Step 3: Verifikasi sintaks**

Run: `node --check src/JalurOps.js`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add src/JalurOps.js
git commit -m "feat(jalur): add updateJalurStatus, findJalurByCriteria, checkIncompleteJalurForVehicle"
```

---

### Task 3: Set Status Awal + Gate di saveJalur

**Files:**
- Modify: `src/JalurOps.js:109-176` (dalam `saveJalur`)

**Interfaces:**
- Consumes: `checkIncompleteJalurForVehicle(vehicleId, tanggal)` (Task 2), `idx['status']`, `idx['laporan_id']`
- Produces: Baris jalur baru berisi `status='BELUM_DIISI'`, `laporan_id=''`; save ditolak bila gate blocked

- [ ] **Step 1: Tambah gate sebelum loop rows**

Dalam `saveJalur`, setelah `const idx = jalurColIdx(sheet);` (baris 120), tambahkan blok gate:

```javascript
    const ungatedVehicles = [];
    rows.forEach(function (r) {
      if (!r || !r.driver_id || !r.vehicle_id || !String(r.rute_tujuan || '').trim()) return;
      if (ungatedVehicles.indexOf(String(r.vehicle_id)) === -1) ungatedVehicles.push(String(r.vehicle_id));
    });
    const blockers = [];
    ungatedVehicles.forEach(function (vid) {
      const check = checkIncompleteJalurForVehicle(vid, tanggal);
      if (check.blocked && check.incompleteJalur) blockers.push(check.incompleteJalur);
    });
    if (blockers.length) {
      const detail = blockers.map(function (b) {
        const aksi = b.flazz_card_id ? 'rekonsiliasi saldo flazz' : 'input laporan';
        return 'Kendaraan ' + (b.plat_nomor || b.id) + ' (jalur ' + b.tanggal + ', status ' + b.status + ') masih belum selesai. Harap ' + aksi + ' terlebih dahulu.';
      }).join(' ');
      throw new Error('Jalur baru diblokir: ' + detail);
    }
```

- [ ] **Step 2: Set status awal di row**

Dalam `saveJalur`, setelah `row[idx['is_deleted']] = '';` (baris 155) dan sebelum `sheet.appendRow(row);` (baris 156), tambahkan:

```javascript
      if (idx['status'] !== undefined) row[idx['status']] = 'BELUM_DIISI';
      if (idx['laporan_id'] !== undefined) row[idx['laporan_id']] = '';
```

- [ ] **Step 3: Verifikasi sintaks**

Run: `node --check src/JalurOps.js`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add src/JalurOps.js
git commit -m "feat(jalur): set initial status and gate saveJalur on incomplete previous jalur"
```

---

### Task 4: Return Status di getJalurByTanggal

**Files:**
- Modify: `src/JalurOps.js:309-331` (dalam `getJalurByTanggal`)

**Interfaces:**
- Consumes: Kolom `status`, `laporan_id` dari sheet
- Produces: Setiap item list berisi `status` dan `laporan_id`

- [ ] **Step 1: Tambah status dan laporan_id ke response**

Dalam `getJalurByTanggal`, di blok `list.push({...})`, setelah `flazz_card_name:` (baris 323) tambahkan:

```javascript
        status: (idx['status'] !== undefined) ? (row[idx['status']] || 'BELUM_DIISI') : 'BELUM_DIISI',
        laporan_id: (idx['laporan_id'] !== undefined) ? (row[idx['laporan_id']] || '') : '',
```

- [ ] **Step 2: Verifikasi sintaks**

Run: `node --check src/JalurOps.js`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add src/JalurOps.js
git commit -m "feat(jalur): return status and laporan_id in getJalurByTanggal"
```

---

### Task 5: Update Status Setelah Laporan Disimpan

**Files:**
- Modify: `src/SpreadsheetOps.js` (dalam `saveTransactionEndOfDayUnlocked`, setelah blok flazz selesai, sebelum `logAudit` baris 262)

**Interfaces:**
- Consumes: `findJalurByCriteria` (Task 2), `updateJalurStatus` (Task 2), `payload.tanggal`, `payload.vehicle_id`, `payload.nama_supir`, `trxCabang`, `transaction_id`
- Produces: Jalur yang cocok mendapat `status='SUDAH_LAPORAN'` dan `laporan_id=transaction_id`

- [ ] **Step 1: Tambah update status setelah blok flazz**

Dalam `saveTransactionEndOfDayUnlocked`, setelah blok flazz (kurung `}` baris 260) dan sebelum `logAudit(...)` baris 262, tambahkan:

```javascript
  // Update status jalur pengiriman terkait laporan yang baru disimpan
  try {
    const matchedJalur = findJalurByCriteria({
      tanggal: payload.tanggal,
      vehicle_id: payload.vehicle_id,
      nama_driver: payload.nama_supir,
      kode_cabang: trxCabang
    });
    if (matchedJalur && matchedJalur.status !== 'SELESAI') {
      updateJalurStatus(matchedJalur.id, 'SUDAH_LAPORAN', transaction_id);
    }
  } catch (e) {
    Logger.log('Gagal update status jalur: ' + e.toString());
  }
```

- [ ] **Step 2: Verifikasi sintaks**

Run: `node --check src/SpreadsheetOps.js`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add src/SpreadsheetOps.js
git commit -m "feat(jalur): set status SUDAH_LAPORAN when laporan submitted"
```

---

### Task 6: Update Status Setelah Rekonsiliasi Flazz

**Files:**
- Modify: `src/FlazzOps.js` (dalam `saveFlazzReconUnlocked`, setelah blok usage DIKEMBALIKAN baris 923, sebelum `logAudit` baris 925)

**Interfaces:**
- Consumes: `findJalurByCriteria` (Task 2), `updateJalurStatus` (Task 2), `payload.card_id`, `usageInfo`
- Produces: Jalur yang memakai kartu yang sama mendapat `status='SELESAI'`

- [ ] **Step 1: Tambah update status sebelum logAudit**

Dalam `saveFlazzReconUnlocked`, setelah blok `if (usageSheet && usageInfo)` (baris 916-923) dan sebelum `logAudit(...)` baris 925, tambahkan:

```javascript
    // Update status jalur pengiriman terkait kartu yang baru direkonsiliasi
    try {
      const jalurMatch = findJalurByCriteria({ flazz_card_id: payload.card_id });
      const usageTgl = (usageInfo && usageInfo.date instanceof Date)
        ? Utilities.formatDate(usageInfo.date, getDB().getSpreadsheetTimeZone(), 'yyyy-MM-dd')
        : (usageInfo && usageInfo.date ? String(usageInfo.date).substring(0, 10) : '');
      if (jalurMatch && jalurMatch.status !== 'SELESAI' && (!usageTgl || !jalurMatch.tanggalJalur || jalurMatch.tanggalJalur === usageTgl)) {
        updateJalurStatus(jalurMatch.id, 'SELESAI', '');
      }
    } catch (e) {
      Logger.log('Gagal update status jalur dari rekon: ' + e.toString());
    }
```

- [ ] **Step 2: Verifikasi sintaks**

Run: `node --check src/FlazzOps.js`
Expected: OK

- [ ] **Step 3: Commit**

```bash
git add src/FlazzOps.js
git commit -m "feat(jalur): set status SELESAI after flazz reconciliation"
```

---

### Task 7: Badge Status di Listing & Summary

**Files:**
- Modify: `src/JalurPages.html:74-80` (listing header), `src/JalurPages.html:134-143` (summary header)
- Modify: `src/JalurScript.html:307-318` (listing row), `src/JalurScript.html:366-379` (summary row), `src/JalurScript.html` (helper baru sebelum `jalurPajakBadge` baris 459)

**Interfaces:**
- Consumes: `it.status` dari `getJalurByTanggal` (Task 4)
- Produces: Kolom + badge status di kedua tabel

- [ ] **Step 1: Tambah helper jalurStatusBadge**

`src/JalurScript.html`, sebelum `function jalurPajakBadge` (baris 459), tambahkan:

```javascript
function jalurStatusBadge(status) {
  var s = String(status || 'BELUM_DIISI');
  if (s === 'SELESAI') return '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Selesai</span>';
  if (s === 'SUDAH_LAPORAN') return '<span class="badge bg-info text-dark"><i class="bi bi-clipboard-check me-1"></i>Sudah Laporan</span>';
  return '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>Belum Diisi</span>';
}
```

- [ ] **Step 2: Tambah kolom Status di listing header**

`src/JalurPages.html`, tabel listing, tambahkan setelah `<th>Etoll</th>` (baris 78):

```html
                <th>Etoll</th>
                <th>Status</th>
                <th>Pajak</th>
```

- [ ] **Step 3: Render badge di listing row**

`src/JalurScript.html`, dalam listing row (baris 314-315), ganti:

```javascript
            '<td>' + esc(it.flazz_card_name || '-') + '</td>' +
            '<td>' + jalurStatusBadge(it.status) + '</td>' +
            '<td>' + jalurPajakBadge(it.status_pajak, it.sisa_hari_pajak) + '</td>' +
```

- [ ] **Step 4: Tambah kolom Status di summary header**

`src/JalurPages.html`, tabel summary, tambahkan setelah `<th>Etoll</th>` (baris 139):

```html
                <th>Etoll</th>
                <th>Status</th>
                <th>Pajak Tahunan</th>
```

- [ ] **Step 5: Render badge di summary row**

`src/JalurScript.html`, dalam summary row (baris 374-375), ganti:

```javascript
            '<td>' + esc(it.flazz_card_name || '-') + '</td>' +
            '<td>' + jalurStatusBadge(it.status) + '</td>' +
            '<td>' + jalurPajakBadge(it.status_pajak, it.sisa_hari_pajak, 'Pajak') + '</td>' +
```

- [ ] **Step 6: Verifikasi sintaks + konsistensi nama helper**

Pastikan langkah 1 dan 3 memakai nama helper yang sama: `jalurStatusBadge`.

Run: `node --check` pada script yang di-extract dari `src/JalurScript.html` dan `src/JalurPages.html` (pola `deploy.ps1`).
Expected: OK

- [ ] **Step 7: Commit**

```bash
git add src/JalurPages.html src/JalurScript.html
git commit -m "feat(jalur): add status badge to listing and summary"
```

---

### Task 8: Backfill Status untuk Jalur Lama

**Files:**
- Modify: `src/JalurOps.js` (tambah `backfillJalurStatus` di akhir file)

**Interfaces:**
- Consumes: Sheet `Jalur_Pengiriman`, `Penggunaan_BBM`, `Flazz_Reconciliation`
- Produces: `backfillJalurStatus()` → `{ success, msg }`

- [ ] **Step 1: Tambah backfillJalurStatus di akhir JalurOps.js**

```javascript
function backfillJalurStatus() {
  try {
    const ss = getDB();
    const jalurSheetRef = ss.getSheetByName('Jalur_Pengiriman');
    const trxSheet = ss.getSheetByName('Penggunaan_BBM');
    const reconSheet = ss.getSheetByName('Flazz_Reconciliation');
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

    // Pre-index tanggal recon terbaru per kartu
    const reconMaxTgl = {};
    if (reconSheet && reconSheet.getLastRow() > 1) {
      const rData = reconSheet.getDataRange().getValues();
      const rH = rData[0];
      const rCard = rH.indexOf('card_id');
      const rDate = rH.indexOf('date');
      for (let i = 1; i < rData.length; i++) {
        const dStr = String(rData[i][rDate] || '').substring(0, 10);
        const cId = String(rData[i][rCard] || '');
        if (!reconMaxTgl[cId] || dStr > reconMaxTgl[cId]) reconMaxTgl[cId] = dStr;
      }
    }

    for (let i = 1; i < jData.length; i++) {
      const tgl = String(jData[i][jIdx['tanggal']] || '').substring(0, 10);
      const vid = String(jData[i][jIdx['vehicle_id']] || '');
      const drv = String(jData[i][jIdx['nama_driver']] || '');
      const cardId = (jIdx['flazz_card_id'] !== undefined) ? String(jData[i][jIdx['flazz_card_id']] || '') : '';
      const current = (jIdx['status'] !== undefined) ? String(jData[i][jIdx['status']] || '') : '';
      if (current === 'SELESAI') continue;

      const laporanId = laporanMap[tgl + '|' + vid + '|' + drv] || '';
      let newStatus = 'BELUM_DIISI';
      if (laporanId) {
        if (cardId && reconMaxTgl[cardId] && reconMaxTgl[cardId] >= tgl) newStatus = 'SELESAI';
        else newStatus = 'SUDAH_LAPORAN';
      }

      const rowIdx = i + 1;
      if (hasStatus && String(jData[i][jIdx['status']] || '') !== newStatus) {
        jalurSheetRef.getRange(rowIdx, jIdx['status'] + 1).setValue(newStatus);
        updated++;
      }
      if (hasLaporanId && laporanId && String(jData[i][jIdx['laporan_id']] || '') !== laporanId) {
        jalurSheetRef.getRange(rowIdx, jIdx['laporan_id'] + 1).setValue(laporanId);
      }
    }

    return { success: true, msg: updated + ' jalur berhasil di-backfill statusnya.' };
  } catch (e) {
    return { success: false, msg: 'Backfill gagal: ' + e.toString() };
  }
}
```

- [ ] **Step 2: Verifikasi backfill** (manual via editor Apps Script)

Panggil `backfillJalurStatus()` dari editor setelah deployment. Expected: jalur lama mendapat
status berdasarkan laporan/recon yang ada.

- [ ] **Step 3: Verifikasi sintaks**

Run: `node --check src/JalurOps.js`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add src/JalurOps.js
git commit -m "feat(jalur): backfill status for existing jalur records"
```

---

## Self-Review Checklist

1. **Spec coverage:** Schema (T1) ✓, helpers term `flazz_card_id`/`tanggalJalur` (T2) ✓, init status + gate (T3) ✓, return status (T4) ✓, laporan trigger (T5) ✓, recon trigger (T6) ✓, badge UI listing & summary (T7) ✓, backfill (T8) ✓
2. **Placeholder scan:** Tidak ada TBD/TODO. Semua code block lengkap.
3. **Type consistency:** `checkIncompleteJalurForVehicle` di T2 dipakai di T3. `findJalurByCriteria` di T2/T5/T6 konsisten (sudah mendukung `flazz_card_id` dan `tanggalJalur` sejak T2). `updateJalurStatus` konsisten (T2 → T5, T6).

**Urutan eksekusi disarankan:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.