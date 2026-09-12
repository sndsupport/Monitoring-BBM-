# Save Performance Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mempercepat "klik Simpan" (Laporan Harian & Simpan Jalur) dengan mengurangi baca-penuh sheet dan baca ganda di jalur simpan server.

**Architecture:** Reduce the number and size of `getDataRange().getValues()` calls made sequentially inside `saveJalur` (JalurOps.js) and `saveTransactionEndOfDayUnlocked` / `editDailyTransactionUnlocked` (SpreadsheetOps.js). Done by (1) caching master lookups (Kendaraan + Supir) server-side with short TTL + invalidation, (2) eliminating a double full read of Flazz_Usage, (3) limiting duplicate/odo scans to recent rows, (4) column-limited reads for Jalur lookups. No client-visible change.

**Tech Stack:** Google Apps Script (server), CacheService, Sheets API via SpreadsheetApp.

## Global Constraints

- Financial correctness: Flazz card **balances** are NEVER cached; only vehicle/driver metadata (nama, plat, cabang, pajak) is cached.
- Master snapshot TTL = 60 detik; invalidated via `invalidateMaster()` (pemanggil yang sudah ada di semua mutasi master) ditambah saat kartu Flazz diubah di master.
- Akses (assertOwnWarehouse / assertFlazzAccess / assertSuperadminOnly) TIDAK diubah — lookup di-cache hanya setelah validasi yang ada.
- Semua fungsi tetap `safeList`-compatible: kembalikan `[]`/`null` bila sheet tidak ada.
- Verifikasi: `node --check` tiap file server + `TestRunner.__runAllTests` di editor GAS + `clasp push`. Tidak mengubah API antarmuka `google.script.run`.
- File yang diubah: `src/CacheUtil.js`, `src/JalurOps.js`, `src/SpreadsheetOps.js`. Deploy tidak dilakukan otomatis — menunggu instruksi.

---

### Task 1: Master lookup snapshot cache (Kendaraan + Supir)

**Files:**
- Modify: `src/CacheUtil.js`
- Modify: `src/JalurOps.js`

**Interfaces:**
- Produces: `getMasterLookupMap()` di global scope → `{ vehicles:[{vehicle_id,plat_nomor,nama,jenis,cabang,tanggal_pajak,tanggal_pajak_5,tanggal_kir}], drivers:[{id,nama,cabang}] }`. Memakai cache `master:lookup` (TTL 60s, JSON). Konsumernya `jalurVehicleById`, `vehicleBranchById`, `jalurDriverNameById`, `driverBranchById`.

- [ ] **Step 1: Tambah kunci & invalidasi di `src/CacheUtil.js`**

Tambah di akhir file:

```js
function masterLookupCacheKey() {
  return 'master:lookup';
}

function invalidateMasterLookup() {
  var c = CacheService.getScriptCache();
  c.remove(masterLookupCacheKey());
}
```

Lalu dalam `invalidateMaster(role, cabang)`, tambah panggilan `invalidateMasterLookup();` (setelah baris `c.remove('bbm:SUPERADMIN');` kedua):

```js
function invalidateMaster(role, cabang) {
  var c = CacheService.getScriptCache();
  c.remove(masterCacheKey(role, cabang));
  c.remove('bbm:' + cabang);
  c.remove('bbm:SUPERADMIN');
  // SUPERADMIN melihat SEMUA cabang; tarik semua variasi
  c.remove(masterCacheKey('SUPERADMIN', ''));
  c.remove('bbm:' + cabang);
  c.remove('bbm:SUPERADMIN');
  invalidateMasterLookup();
}
```

- [ ] **Step 2: Implementasi `getMasterLookupMap()` di `src/JalurOps.js`**

Tambah fungsi baru (letakkan sebelum `jalurDriverNameById`):

```js
function getMasterLookupMap() {
  var c = CacheService.getScriptCache();
  var k = masterLookupCacheKey();
  var hit = c.get(k);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* rusak -> build ulang */ }
  }
  var ss = getDB();
  var out = { vehicles: [], drivers: [] };
  var sD = ss.getSheetByName('Supir');
  if (sD) {
    var dData = sD.getDataRange().getValues();
    for (var di = 1; di < dData.length; di++) {
      out.drivers.push({ id: String(dData[di][0] || ''), nama: dData[di][1], cabang: String(dData[di][2] || '') });
    }
  }
  var sK = ss.getSheetByName('Kendaraan');
  if (sK) {
    var kData = sK.getDataRange().getValues();
    var h = kData[0];
    var ci = {};
    h.forEach(function(x, idx) { ci[String(x)] = idx; });
    for (var ki = 1; ki < kData.length; ki++) {
      out.vehicles.push({
        vehicle_id: String(kData[ki][ci['vehicle_id']] || ''),
        plat_nomor: kData[ki][ci['plat_nomor']],
        nama: kData[ki][ci['nama_kendaraan']],
        jenis: kData[ki][ci['jenis_kendaraan']] || 'Mobil',
        cabang: (ci['kode_cabang'] !== undefined) ? String(kData[ki][ci['kode_cabang']] || '') : '',
        tanggal_pajak: (ci['tanggal_pajak'] !== undefined) ? kData[ki][ci['tanggal_pajak']] : '',
        tanggal_pajak_5: (ci['tanggal_pajak_5_tahunan'] !== undefined) ? kData[ki][ci['tanggal_pajak_5_tahunan']] : '',
        tanggal_kir: (ci['tanggal_kir'] !== undefined) ? kData[ki][ci['tanggal_kir']] : ''
      });
    }
  }
  var payload = JSON.stringify(out);
  try { c.put(k, payload, 60); } catch (e) { /* quota TTL/ukuran: abaikan */ }
  return out;
}
```

- [ ] **Step 3: Alihkan lookup supir ke snapshot**

Ganti `jalurDriverNameById` dan `driverBranchById` agar membaca dari `getMasterLookupMap()`:

```js
function jalurDriverNameById(driverId) {
  var map = getMasterLookupMap();
  for (var i = 0; i < map.drivers.length; i++) {
    if (map.drivers[i].id === String(driverId)) return map.drivers[i].nama;
  }
  return '';
}

function driverBranchById(driverId) {
  if (!driverId) return '';
  var map = getMasterLookupMap();
  for (var i = 0; i < map.drivers.length; i++) {
    if (map.drivers[i].id === String(driverId)) return map.drivers[i].cabang;
  }
  return '';
}
```

- [ ] **Step 4: Alihkan lookup kendaraan ke snapshot**

Ganti `jalurVehicleById` (JalurOps.js:215) agar membaca dari map:

```js
function jalurVehicleById(vehicleId) {
  var map = getMasterLookupMap();
  for (var i = 0; i < map.vehicles.length; i++) {
    var v = map.vehicles[i];
    if (v.vehicle_id === String(vehicleId)) {
      return {
        plat_nomor: v.plat_nomor,
        nama: v.nama,
        jenis: v.jenis,
        cabang: v.cabang,
        tanggal_pajak: v.tanggal_pajak,
        tanggal_pajak_5: v.tanggal_pajak_5,
        tanggal_kir: v.tanggal_kir
      };
    }
  }
  return null;
}
```

Cek juga `vehicleBranchById` (dipakai saveJalur) — bila masih `getDataRange` penuh, alihkan memakai `getMasterLookupMap()` dengan pola yang sama (return `v ? v.cabang : ''`).

- [ ] **Step 5: Verifikasi & commit**

```powershell
node --check src\JalurOps.js; node --check src\CacheUtil.js
```

Expected: tidak ada output error.

```bash
git add src/CacheUtil.js src/JalurOps.js
git commit -m "perf: cache master lookup (kendaraan & supir) untuk jalur simpan"
```

---

### Task 2: Hilangkan baca ganda Flazz_Usage di Simpan Jalur

**Files:**
- Modify: `src/JalurOps.js` (`saveJalur`, `autoCreateFlazzUsage`, `flazzCardHasGiveren`)

**Interfaces:**
- Produces: `autoCreateFlazzUsage(...)` sekarang **return boolean** `hadExisting` (true bila kartu sudah berstatus DIBERIKAN sebelum penciptaan/penyerahan). Tidak ada pemanggil lain yang bergantung pd nilai return lama (sebelumnya undefined).

- [ ] **Step 1: Buat `autoCreateFlazzUsage` me-return `hadExisting`**

Pada `autoCreateFlazzUsage` (SpreadsheetOps.js:350, dipakai JalurOps dan SpreadsheetOps), tambahkan return di tiap path:

```js
  // Cek apakah kartu sudah punya catatan DIBERIKAN (sedang dipakai)
  const uData = usageSheet.getDataRange().getValues();
  const uHeaders = uData[0];
  const uCard = uHeaders.indexOf('card_id');
  const uStatus = uHeaders.indexOf('status');
  let hadExisting = false;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][uCard]) === String(cardId) && (uStatus < 0 || uData[i][uStatus] === 'DIBERIKAN')) {
      hadExisting = true;
      break;
    }
  }
  if (hadExisting) return true; // sudah digunakan, jangan buat ulang
```

Dan pada akhir fungsi tambahkan `return false;` (bila tidak terdeteksi status lama). (Fungsi sebelumnya `return;` pada path awal — ubah jadi `return true`.)

- [ ] **Step 2: Pakai return-nya di `saveJalur`**

Ganti di `saveJalur` (JalurOps.js:346-352):

```js
      if (r.etoll_card_id) {
        const hadUsage = autoCreateFlazzUsage(r.etoll_card_id, namaDriver, vid, 'JALUR', jalurId);
        if (hadUsage) {
          warnings.push('Kartu etoll "' + (r.etoll_card_name || r.etoll_card_id) + '" masih dipakai (belum dikembalikan) untuk ' + (namaDriver || r.driver_id) + '. Proses admin sebelumnya belum selesai.');
        }
      }
```

Hapus pemakaian `flazzCardHasGiveren` (sediakan fallback: bila ada caller lain yang masih memakai `flazzCardHasGiveren`, biarkan fungsi tetap ada tapi samakan dengan `autoCreateFlazzUsage(...) === true`). Pastikan tidak ada referencia `flazzCardHasGiveren` tersisa selain keputusan.

- [ ] **Step 3: Verifikasi & commit**

```powershell
node --check src\JalurOps.js; node --check src\SpreadsheetOps.js
```

Expected: tidak ada output error.

```bash
git add src/JalurOps.js src/SpreadsheetOps.js
git commit -m "perf: hilangkan baca ganda Flazz_Usage saat simpan jalur"
```

---

### Task 3: Batasi pemindaian duplikat & transaksi terakhir (Penggunaan_BBM)

**Files:**
- Modify: `src/SpreadsheetOps.js` (`isDuplicateTransaction`, `getLastTransactionForVehicle`)

**Interfaces:**
- Produces: perilaku identik; hanya membatasi scan ke N baris terakhir sheet.

- [ ] **Step 1: Batasi `isDuplicateTransaction` ke 200 baris terakhir**

Di `isDuplicateTransaction` (SpreadsheetOps.js:308), ganti pengambilan data:

```js
    const lastRow = sheet.getLastRow();
    const scanCount = Math.min(200, Math.max(0, lastRow - 1));
    const startRow = Math.max(2, lastRow - scanCount + 1);
    const headersW = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowsW = lastRow >= startRow
      ? sheet.getRange(startRow, 1, lastRow - startRow + 1, sheet.getLastColumn()).getValues()
      : [];
    const data = [headersW].concat(rowsW);
```

Loop perbandingan tetap sama (`for (let i = data.length - 1; i >= 1; i--)`). Catatan: deteksi hanya relevan utk baris baru (bawah sheet), jadi batasan 200 baris aman.

- [ ] **Step 2: Batasi `getLastTransactionForVehicle` ke 300 baris terakhir**

Ganti pengambilan data di `getLastTransactionForVehicle` (SpreadsheetOps.js:475):

```js
  const lastRow = sheet.getLastRow();
  const scanCount = Math.min(300, Math.max(0, lastRow - 1));
  const startRow = Math.max(2, lastRow - scanCount + 1);
  const data = lastRow >= startRow
    ? sheet.getRange(startRow, 1, lastRow - startRow + 1, sheet.getLastColumn()).getValues()
    : [];
```

Loop naik (`for (let i = data.length - 1; i >= 1; i--)`) dan index kolom (`data[i][6]`, `[14]`, `[2]`) tetap — pastikan kolom indeks TIDAK berubah karena `startRow >= 2` (header tidak ikut dalam `data`).

- [ ] **Step 3: Verifikasi & commit**

```powershell
node --check src\SpreadsheetOps.js
```

```bash
git add src/SpreadsheetOps.js
git commit -m "perf: batasi scan duplikat & transaksi terakhir ke baris terbaru"
```

---

### Task 4: Kolom-limited baca untuk lookup Jalur

**Files:**
- Modify: `src/JalurOps.js` (`findJalurByCriteria`, `checkIncompleteJalurForVehicle`, `findJalurRow`)

**Interfaces:**
- Produces: hasil identik; hanya membaca kolom yang diperlukan (via `readRowsCols` dari `SheetRead.js` bila tersedia, atau range kolom terbatas).

- [ ] **Step 1: Kolom-limited `findJalurRow`**

Bila `readRowsCols` tersedia (cek `src/SheetRead.js`), ganti:

```js
function findJalurRow(sheet, id) {
  const idx = jalurColIdx(sheet);
  const cols = [];
  ['id','tanggal','status','laporan_id','updated_at','vehicle_id','nama_driver','flazz_card_id','kode_cabang','plat_nomor'].forEach(function(k) {
    if (idx[k] !== undefined) cols.push(idx[k]);
  });
  const data = readRowsCols(sheet, cols);
  const colOf = {};
  cols.forEach(function(c, pos) { colOf[c] = pos; });
  for (let i = 0; i < data.length; i++) {
    if (colOf['id'] !== undefined && String(data[i][colOf['id']]) === String(id)) {
      const row = {};
      cols.forEach(function(c) { row[idx[c]] = data[i][colOf[c]]; });
      return { rowIndex: (i + 1) + 1, row: row, idx: idx };
    }
  }
  return null;
}
```

Perhatikan: bila `readRowsCols` mengembalikan baris data **tanpa header**, `rowIndex` = `i + 2` (baris sheet mulai posisi 2). Sesuaikan dengan kontrak `readRowsCols` yang sebenarnya (periksa implementasinya dulu). Jika `readRowsCols` tidak cocok, gunakan `sheet.getRange(2, minCol+1, lastRow-1, maxCol-minCol+1)` lalu petakan indeks relatif — pastikan nilai kembalian `row`/`rowIndex` identik dengan lama.

- [ ] **Step 2: Kolom-limited `findJalurByCriteria`**

Terapkan pola yang sama (map `idx` → kolom relatif ke `readRowsCols`), pertahankan seluruh logika match (`is_deleted`, `tanggal`, `vehicle_id`, `nama_driver`, `kode_cabang`, `flazz_card_id`) dan semantik "kembalikan record terakhir yang cocok".

- [ ] **Step 3: Kolom-limited `checkIncompleteJalurForVehicle`**

Terapkan pola sama; pertahankan kriteria pengecekan (vehicle_id + tanggal + status belum selesai / kartu flazz belum rekon).

- [ ] **Step 4: Verifikasi & commit**

```powershell
node --check src\JalurOps.js
```

```bash
git add src/JalurOps.js
git commit -m "perf: kolom-terbatas pada lookup sheet Jalur"
```

---

## Deferred (tidak di task ini)

- **#5 — Gabung upload foto + simpan jadi satu round-trip** (`processDailyImages` + `saveDailyTransaction`): perubahan klien+server+tes yang lebih besar; ditunda.
- **Server cache `getFlazzDashboardData`** (menu Flazz/dashboard): di luar alur simpan; masuk plan pindah-menu terpisah.

## Verifikasi Akhir (setelah deploy)

1. `__runAllTests` di editor GAS: hijau.
2. Manual: simpan jalur 5+ baris (pastikan tidak ada warning kartu yang hilang/tredup), input laporan harian dengan foto (deteksi duplikat tetap jalan — simpan 2x laporan identik → pesan duplikat muncul), edit laporan tetap benar, saldo Flazz akurat.
3. Ukur durasi tombol "Memproses..." antes vs sesudah bila memungkinkan.