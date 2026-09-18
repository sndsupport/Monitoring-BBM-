# Estimasi KM Jarak Tempuh Kendaraan Jarum — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Izinkan pencatatan km_tempuh **estimasi** (dari liter BBM × `standar_km_l`) untuk kendaraan `ANALOG_JARUM` saat odometer tidak terbaca/rusak, dengan penanda `km_sumber = ESTIMASI` yang transparan di riwayat.

**Architecture:** Checkbox "Odometer tidak terbaca (rusak)" per sisi KM (awal/akhir) hanya dirender untuk kendaraan jarum. Pada submit, payload membawa `km_awal_broken`/`km_akhir_broken`; server `saveTransactionEndOfDay` memakai `literKonsumsi × standar_km_l` dari master Kendaraan untuk mengisi km yang rusak (ditambat dari sisi yang diketahui / trx sebelumnya), menulis kolom baru `km_sumber`, dan UI menampilkan badge "ESTIMASI". Migrasi kolom `km_sumber` otomatis idempoten.

**Tech Stack:** Google Apps Script (V8), Bootstrap 5, vanilla JS, `google.script.run`.

## Global Constraints

- Fitur **hanya untuk** `jenis_indikator === 'ANALOG_JARUM'`; kendaraan lain 100% tidak berubah (km tetap `required`).
- Validasi input KM tetap ada; dikecualikan (opsional) hanya saat checkbox rusak tercentang.
- Nilai default `km_sumber = 'AKTUAL'`; hanya penyimpanan estimasi memakai `'ESTIMASI'`.
- `standar_km_l` = kolom 8 sheet Kendaraan; `kapasitas_tangki` = kolom 7.
- Endpoint simpan: `saveDailyTransaction(payload)` (Code.js:157) → `saveTransactionEndOfDay(payload)` (SpreadsheetOps.js:83).
- Baca riwayat: `getTransactionsByVehicle(role, userCabang)` — objek sekarang punya kunci `km_sumber`.
- Guard: jika toggle rusak aktif tapi `literKonsumsi <= 0` atau `standarKmL <= 0` → **throw** agar gagal simpan (toast error di client).
- **PENTING (working tree kotor):** `src/Code.js`, `src/Index.html`, `src/js.html` punya perubahan WIP tidak ber-komit yang TIDAK boleh ikut ter-commit. Untuk file itu, pakai teknik: `git stash push -- <file>` → edit file bersih → `git add` + `git commit --only <file>` → `git stash pop` (auto-merge; verifikasi tak ada `<<<<<<<`). `src/DatabaseSetup.js` & `src/SpreadsheetOps.js` dibersihkan identik.
- Uji sintaks: `node --check`. Tidak ada framework test; verifikasi manual per spec.

---

### Task 1: Kolom `km_sumber` + migrasi otomatis

**Files:**
- Modify: `src/DatabaseSetup.js:16`
- Modify: `src/SpreadsheetOps.js` (append `ensurePenggunaBBMColumns` di akhir file)
- Modify: `src/Code.js:51-68`

**Interfaces:**
- Produces: `ensurePenggunaBBMColumns()` — void, idempoten, memastikan header `km_sumber` ada di sheet `Penggunaan_BBM` (append + isi `AKTUAL` untuk baris lama).
- Consumes: `getDB()` (sudah ada).

- [ ] **Step 1: Tambah header di DatabaseSetup.js**

Di `src/DatabaseSetup.js:16`, ubah akhir daftar header `Penggunaan_BBM` dari:

```javascript
    { name: 'Penggunaan_BBM', headers: ['transaction_id', 'timestamp', 'tanggal', 'user_id', 'nama_pengguna', 'kode_cabang', 'vehicle_id', 'plat_nomor', 'foto_km_awal', 'ocr_km_awal', 'km_awal_confirmed', 'bar_awal', 'foto_km_akhir', 'ocr_km_akhir', 'km_akhir_confirmed', 'bar_akhir', 'km_tempuh', 'perubahan_bar', 'liter_bbm', 'biaya_bbm', 'foto_struk_bbm', 'biaya_toll', 'foto_struk_toll', 'km_per_liter', 'status', 'warning', 'nama_supir', 'metode_pembayaran', 'flazz_card_id', 'foto_indikator', 'level_bbm', 'confidence_bbm', 'level_status', 'keterangan'] },
```

menjadi (tambah `'km_sumber'` di paling akhir):

```javascript
    { name: 'Penggunaan_BBM', headers: ['transaction_id', 'timestamp', 'tanggal', 'user_id', 'nama_pengguna', 'kode_cabang', 'vehicle_id', 'plat_nomor', 'foto_km_awal', 'ocr_km_awal', 'km_awal_confirmed', 'bar_awal', 'foto_km_akhir', 'ocr_km_akhir', 'km_akhir_confirmed', 'bar_akhir', 'km_tempuh', 'perubahan_bar', 'liter_bbm', 'biaya_bbm', 'foto_struk_bbm', 'biaya_toll', 'foto_struk_toll', 'km_per_liter', 'status', 'warning', 'nama_supir', 'metode_pembayaran', 'flazz_card_id', 'foto_indikator', 'level_bbm', 'confidence_bbm', 'level_status', 'keterangan', 'km_sumber'] },
```

- [ ] **Step 2: Tambah `ensurePenggunaBBMColumns` di SpreadsheetOps.js**

Di akhir `src/SpreadsheetOps.js` (setelah function `setUserStatus` yang diakhiri `}`), append:

```javascript

function ensurePenggunaBBMColumns() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('km_sumber') === -1) {
    const newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue('km_sumber');
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, newCol, lastRow - 1, 1).setValue('AKTUAL');
  }
}
```

- [ ] **Step 3: Panggil dari processInitialData (Code.js)**

Di `src/Code.js:51-54`, ubah:

```javascript
function processInitialData(userInfo) {
  if (!userInfo || !userInfo.username) {
    return { error: 'Not logged in' };
  }
  var payload = {
```

menjadi:

```javascript
function processInitialData(userInfo) {
  if (!userInfo || !userInfo.username) {
    return { error: 'Not logged in' };
  }
  ensurePenggunaBBMColumns();
  var payload = {
```

- [ ] **Step 4: Syntax check**

```powershell
node --check src/DatabaseSetup.js; node --check src/SpreadsheetOps.js; node --check src/Code.js
```
Expected: exit 0, tanpa keluaran.

- [ ] **Step 5: Commit**

```bash
git add src/DatabaseSetup.js src/SpreadsheetOps.js src/Code.js
git commit -m "feat(bbm): kolom km_sumber + migrasi idempoten untuk estimasi KM jarum"
```
> Catatan: pastikan hasil `git status` hanya berisi perubahan fitur ini untuk ketiganya; `src/Code.js` mungkin perlu teknik stash (lihat Global Constraints) agar WIP tidak ikut.

---

### Task 2: Logika estimasi di `saveTransactionEndOfDay`

**Files:**
- Modify: `src/SpreadsheetOps.js:83-141` (dan baris row array akhir)

**Interfaces:**
- Consumes: payload kunci baru `km_awal_broken`, `km_akhir_broken` (boolean); `getLastTransactionForVehicle(vehicle_id)` → `{km_akhir, tanggal}` atau `null` (sudah ada); `buildOdoWarning` (sudah ada); `ensurePenggunaBBMColumns` (Task 1).
- Produces: baris tersimpan dengan `km_tempuh` estimasi dan `km_sumber = 'ESTIMASI'` pada kolom baru; **throw** `Error` bila estimasi tak tersedia.

- [ ] **Step 1: Ubah blok inisialisasi & kendaraan**

Di `src/SpreadsheetOps.js:88-124`, ganti seluruh blok ini:

```javascript
  const transaction_id = 'TRX-' + new Date().getTime();
  let km_awal = parseFloat(payload.km_awal_confirmed) || 0;
  let km_akhir = parseFloat(payload.km_akhir_confirmed) || 0;
  let km_tempuh = km_akhir - km_awal;
  let liter = parseFloat(payload.liter_bbm) || 0;

  let userName = payload.userInfo.nama || payload.userInfo.username;

  let platNomor = 'PLAT-UNKNOWN';
  let trxCabang = payload.userInfo.cabang;
  let kapasitas = 0, jumlahBar = 0;
  const kendaraanSheet = ss.getSheetByName('Kendaraan');
  if (kendaraanSheet) {
    const kendaraanData = kendaraanSheet.getDataRange().getValues();
    for (let i = 1; i < kendaraanData.length; i++) {
      if (kendaraanData[i][0] === payload.vehicle_id) {
        platNomor = kendaraanData[i][1];
        trxCabang = kendaraanData[i][9] || trxCabang;
        kapasitas = parseFloat(kendaraanData[i][6]) || 0;
        jumlahBar = parseFloat(kendaraanData[i][7]) || 0;
        break;
      }
    }
  }

  let literPerBar = (kapasitas > 0 && jumlahBar > 0) ? (kapasitas / jumlahBar) : 0;
  let barAwal = parseFloat(payload.bar_awal) || 0;
  let barAkhir = parseFloat(payload.bar_akhir) || 0;
  let literKonsumsi = liter + ((barAwal - barAkhir) * literPerBar);
  if (literKonsumsi <= 0) literKonsumsi = liter;
  let efisiensi = literKonsumsi > 0 ? (km_tempuh / literKonsumsi).toFixed(2) : '';

  let warning = '';
  const prevTrx = getLastTransactionForVehicle(payload.vehicle_id);
  if (prevTrx && prevTrx.km_akhir !== null && km_awal !== prevTrx.km_akhir) {
    warning = buildOdoWarning(km_awal, prevTrx.km_akhir, prevTrx.tanggal);
  }
```

dengan:

```javascript
  const transaction_id = 'TRX-' + new Date().getTime();
  let km_awal = parseFloat(payload.km_awal_confirmed) || 0;
  let km_akhir = parseFloat(payload.km_akhir_confirmed) || 0;
  let km_tempuh = km_akhir - km_awal;
  let km_sumber = 'AKTUAL';
  let liter = parseFloat(payload.liter_bbm) || 0;

  let userName = payload.userInfo.nama || payload.userInfo.username;

  let platNomor = 'PLAT-UNKNOWN';
  let trxCabang = payload.userInfo.cabang;
  let kapasitas = 0, jumlahBar = 0, standarKmL = 0;
  const kendaraanSheet = ss.getSheetByName('Kendaraan');
  if (kendaraanSheet) {
    const kendaraanData = kendaraanSheet.getDataRange().getValues();
    for (let i = 1; i < kendaraanData.length; i++) {
      if (kendaraanData[i][0] === payload.vehicle_id) {
        platNomor = kendaraanData[i][1];
        trxCabang = kendaraanData[i][9] || trxCabang;
        kapasitas = parseFloat(kendaraanData[i][6]) || 0;
        jumlahBar = parseFloat(kendaraanData[i][7]) || 0;
        standarKmL = parseFloat(kendaraanData[i][8]) || 0;
        break;
      }
    }
  }

  let literPerBar = (kapasitas > 0 && jumlahBar > 0) ? (kapasitas / jumlahBar) : 0;
  let barAwal = parseFloat(payload.bar_awal) || 0;
  let barAkhir = parseFloat(payload.bar_akhir) || 0;
  let literKonsumsi = liter + ((barAwal - barAkhir) * literPerBar);
  if (literKonsumsi <= 0) literKonsumsi = liter;

  const prevTrx = getLastTransactionForVehicle(payload.vehicle_id);

  if (payload.km_awal_broken || payload.km_akhir_broken) {
    if (literKonsumsi <= 0 || standarKmL <= 0) {
      throw new Error('KM tidak terbaca tapi estimasi tidak tersedia (liter BBM / standar km/L kosong). Harap input KM asli.');
    }
    const estKm = Math.round(literKonsumsi * standarKmL);
    if (payload.km_awal_broken && payload.km_akhir_broken) {
      const anchor = (prevTrx && prevTrx.km_akhir !== null && prevTrx.km_akhir > 0) ? prevTrx.km_akhir : 0;
      km_awal = anchor;
      km_akhir = anchor + estKm;
    } else if (payload.km_akhir_broken) {
      km_akhir = km_awal + estKm;
    } else {
      km_awal = km_akhir - estKm;
      if (km_awal < 0) km_awal = 0;
    }
    km_tempuh = estKm;
    km_sumber = 'ESTIMASI';
  }

  let efisiensi = literKonsumsi > 0 ? (km_tempuh / literKonsumsi).toFixed(2) : '';

  let warning = '';
  if (prevTrx && prevTrx.km_akhir !== null && km_awal !== prevTrx.km_akhir) {
    warning = buildOdoWarning(km_awal, prevTrx.km_akhir, prevTrx.tanggal);
  }
```

- [ ] **Step 2: Panggil `ensurePenggunaBBMColumns` di awal save**

Di `src/SpreadsheetOps.js:83-86`, ubah:

```javascript
function saveTransactionEndOfDay(payload) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return { success: false, error: 'Sheet tidak ditemukan.' };
```

menjadi:

```javascript
function saveTransactionEndOfDay(payload) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return { success: false, error: 'Sheet tidak ditemukan.' };
  ensurePenggunaBBMColumns();
```

- [ ] **Step 3: Tambahkan `km_sumber` di baris insert**

Di `src/SpreadsheetOps.js:139`, ubah akhir array row:

```javascript
    payload.keterangan || ''
  ];
```

menjadi:

```javascript
    payload.keterangan || '',
    km_sumber
  ];
```

- [ ] **Step 4: Syntax check**

```powershell
node --check src/SpreadsheetOps.js
```
Expected: exit 0, tanpa keluaran.

- [ ] **Step 5: Commit**

```bash
git add src/SpreadsheetOps.js
git commit -m "feat(bbm): hitung km_tempuh estimasi saat odometer jarum tidak terbaca"
```

---

### Task 3: Baca `km_sumber` & edit → AKTUAL

**Files:**
- Modify: `src/SpreadsheetOps.js:505-537` (result obj `getTransactionsByVehicle`)
- Modify: `src/SpreadsheetOps.js:604-614` (blok km di `updateTrx`)

**Interfaces:**
- Consumes: Task 1 kolom `km_sumber` (index 34 di data mentah).
- Produces: objek riwayat punya `km_sumber` (`'AKTUAL'` default); `updateTrx` menulis `km_sumber='AKTUAL'` saat km diedit.

- [ ] **Step 1: Ekspos `km_sumber` di getTransactionsByVehicle**

Di `src/SpreadsheetOps.js:525-526`, ubah:

```javascript
      km_awal: parseFloat(row[10]) || 0,
      km_akhir: parseFloat(row[14]) || 0,
```

menjadi:

```javascript
      km_awal: parseFloat(row[10]) || 0,
      km_akhir: parseFloat(row[14]) || 0,
      km_sumber: row[34] ? String(row[34]) : 'AKTUAL',
```

- [ ] **Step 2: Edit km → `km_sumber` jadi AKTUAL di updateTrx**

Di `src/SpreadsheetOps.js:611-614`, ubah:

```javascript
    // Recalculate km_tempuh
    const newKmAwal = payload.km_awal !== undefined ? parseFloat(payload.km_awal) : parseFloat(sheet.getRange(rowIndex, idxKmAwal + 1).getValue());
    const newKmAkhir = payload.km_akhir !== undefined ? parseFloat(payload.km_akhir) : parseFloat(sheet.getRange(rowIndex, idxKmAkhir + 1).getValue());
    sheet.getRange(rowIndex, idxKmTempuh + 1).setValue((newKmAkhir || 0) - (newKmAwal || 0));
```

menjadi:

```javascript
    // Recalculate km_tempuh
    const newKmAwal = payload.km_awal !== undefined ? parseFloat(payload.km_awal) : parseFloat(sheet.getRange(rowIndex, idxKmAwal + 1).getValue());
    const newKmAkhir = payload.km_akhir !== undefined ? parseFloat(payload.km_akhir) : parseFloat(sheet.getRange(rowIndex, idxKmAkhir + 1).getValue());
    sheet.getRange(rowIndex, idxKmTempuh + 1).setValue((newKmAkhir || 0) - (newKmAwal || 0));
    if (payload.km_awal !== undefined || payload.km_akhir !== undefined) {
      const idxSumber = headers.indexOf('km_sumber');
      if (idxSumber > -1) sheet.getRange(rowIndex, idxSumber + 1).setValue('AKTUAL');
    }
```

- [ ] **Step 3: Syntax check**

```powershell
node --check src/SpreadsheetOps.js
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/SpreadsheetOps.js
git commit -m "feat(bbm): ekspos km_sumber ke riwayat; edit km menyetel ulang AKTUAL"
```

---

### Task 4: Form — checkbox "Odometer tidak terbaca" (Index.html + js.html)

**Files:**
- Modify: `src/Index.html:274-280` (Keberangkatan) & `:309-315` (Kepulangan)
- Modify: `src/js.html` (fungsi `onVehicleChange` ±1413-1443; `resetDailyForm` ±565-570; payload `saveDailyForm` ±685-708; tambah fungsi `toggleOdoBroken`)

**Interfaces:**
- Consumes: Task 2 payload kunci `km_awal_broken`/`km_akhir_broken`.
- Produces: id DOM `chk_km_awal`, `chk_km_akhir`, wrapper `odometer-rusak-awal`, `odometer-rusak-akhir`; fungsi `toggleOdoBroken(side)`.

- [ ] **Step 1: Markup checkbox — Keberangkatan**

Di `src/Index.html` setelah blok input `km_awal_val` (baris 278-280), sisipkan:

```html
                        <div class='form-check mt-2' id='odometer-rusak-awal' style='display:none;'>
                          <input class='form-check-input' type='checkbox' id='chk_km_awal' onchange='toggleOdoBroken("awal")'>
                          <label class='form-check-label' for='chk_km_awal'><small>Odometer tidak terbaca (rusak) — km dihitung estimasi</small></label>
                        </div>
```

- [ ] **Step 2: Markup checkbox — Kepulangan**

Di `src/Index.html` setelah blok input `km_akhir_val` (baris 311-313), sisipkan:

```html
                        <div class='form-check mt-2' id='odometer-rusak-akhir' style='display:none;'>
                          <input class='form-check-input' type='checkbox' id='chk_km_akhir' onchange='toggleOdoBroken("akhir")'>
                          <label class='form-check-label' for='chk_km_akhir'><small>Odometer tidak terbaca (rusak) — km dihitung estimasi</small></label>
                        </div>
```

- [ ] **Step 3: Tambah fungsi `toggleOdoBroken` di js.html**

Sisipkan sebelum `function onVehicleChange()` (js.html ±1413):

```javascript
  function toggleOdoBroken(side) {
    var chk = document.getElementById('chk_km_' + side);
    var inp = document.getElementById('km_' + side + '_val');
    var group = document.getElementById('odometer-rusak-' + side);
    if (!chk || !inp) return;
    inp.required = !chk.checked;
    if (group) group.classList.toggle('border-warning', chk.checked);
  }
```

- [ ] **Step 4: onVehicleChange — tampilkan/sembunyikan checkbox**

Di `onVehicleChange`, tepat setelah `var hide = indikator !== 'DIGITAL_BAR';` tambahkan:

```javascript
    // Toggle checkbox "odometer rusak" hanya untuk kendaraan jarum
    var isJarum = indikator === 'ANALOG_JARUM';
    ['odometer-rusak-awal', 'odometer-rusak-akhir'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = isJarum ? '' : 'none';
    });
    if (!isJarum) {
      ['chk_km_awal', 'chk_km_akhir'].forEach(function (id) {
        var c = document.getElementById(id);
        if (c) c.checked = false;
      });
      toggleOdoBroken('awal');
      toggleOdoBroken('akhir');
    }
```

- [ ] **Step 5: Reset wajib pada resetDailyForm**

Di `src/js.html:599-600` (setelah `km_awal_val`/`km_akhir_val` dikosongkan), tambahkan:

```javascript
    var chkAwal = document.getElementById('chk_km_awal');
    var chkAkhir = document.getElementById('chk_km_akhir');
    if (chkAwal) { chkAwal.checked = false; toggleOdoBroken('awal'); }
    if (chkAkhir) { chkAkhir.checked = false; toggleOdoBroken('akhir'); }
```

- [ ] **Step 6: Payload submit — flag broken**

Di `src/js.html:691-692`, ubah:

```javascript
        km_awal_val: document.getElementById('km_awal_val').value,
        km_akhir_val: document.getElementById('km_akhir_val').value,
```

menjadi:

```javascript
        km_awal_val: document.getElementById('km_awal_val').value,
        km_akhir_val: document.getElementById('km_akhir_val').value,
        km_awal_broken: document.getElementById('chk_km_awal') ? document.getElementById('chk_km_awal').checked : false,
        km_akhir_broken: document.getElementById('chk_km_akhir') ? document.getElementById('chk_km_akhir').checked : false,
```

- [ ] **Step 7: Syntax check client script**

Ekstrak & cek semua `<script>` inline dari `src/index.html` & `src/js.html`:

```powershell
$tmp = "$env:TEMP\kmjarum_check"; New-Item -ItemType Directory -Force -Path $tmp | Out-Null; Get-ChildItem $tmp -Filter *.js | Remove-Item -Force
$i = 0
foreach ($f in @('src/Index.html','src/js.html')) {
  $c = Get-Content -LiteralPath $f -Raw
  [regex]::Matches($c, '(?is)<script(?![^>]*src=)[^>]*>(.*?)</script>') | ForEach-Object {
    $i++
    $name = "$tmp\$([IO.Path]::GetFileNameWithoutExtension($f))_$i.js"
    Set-Content -LiteralPath $name -Value $_.Groups[1].Value -Encoding UTF8
  }
}
foreach ($f in (Get-ChildItem $tmp -Filter *.js)) { node --check $f.FullName; if ($LASTEXITCODE -ne 0) { exit 1 } }
Write-Output "SYNTAX OK"
```
Expected: `SYNTAX OK`, exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/Index.html src/js.html
git commit -m "feat(bbm): checkbox odometer rusak per sisi KM untuk kendaraan jarum"
```
> Teknik stash wajib untuk `src/Index.html` & `src/js.html` supaya WIP tidak ikut (lihat Global Constraints).

---

### Task 5: Badge ESTIMASI di riwayat

**Files:**
- Modify: `src/js.html:1005-1040` (render riwayat: baris 1012 & 1040)

**Interfaces:**
- Consumes: `row.km_sumber` dari Task 3.
- Produces: helper `kmEstBadge(row)` + tampil di dua spot.

- [ ] **Step 1: Tambah helper badge**

Sisipkan sebelum `pageData.forEach` render riwayat (dekat `odoWarningBadgeHtml`, js.html ±999):

```javascript
  function kmEstBadge(row) {
    return (row.km_sumber === 'ESTIMASI') ? " <span class='badge bg-warning text-dark'>ESTIMASI</span>" : '';
  }
```

- [ ] **Step 2: Tabel riwayat**

Di `src/js.html:1012`, ubah:

```javascript
        "<td class='text-center text-nowrap'>" + row.km_tempuh + " KM</td>" +
```

menjadi:

```javascript
        "<td class='text-center text-nowrap'>" + row.km_tempuh + " KM" + kmEstBadge(row) + "</td>" +
```

- [ ] **Step 3: Kartu riwayat**

Di `src/js.html:1040`, ubah:

```javascript
                "<div class='stats-value'>" + row.km_tempuh + " KM</div>" +
```

menjadi:

```javascript
                "<div class='stats-value'>" + row.km_tempuh + " KM" + kmEstBadge(row) + "</div>" +
```

- [ ] **Step 4: Syntax check client script**

Jalankan ulang perintah ekstraksi (Step 7 Task 4). Expected: `SYNTAX OK`.

- [ ] **Step 5: Commit**

```bash
git add src/js.html
git commit -m "feat(bbm): badge ESTIMASI pada km_tempuh di riwayat"
```
> Teknik stash wajib untuk `src/js.html` (Global Constraints).

---

### Task 6: Deploy & verifikasi manual

**Files:**
- Deploy: `src/` via clasp.

**Interfaces:**
- Menggunakan: seluruh perubahan Task 1-5.

- [ ] **Step 1: Push & buat version baru**

```bash
cd src
npx @google/clasp push
npx @google/clasp deploy
```
Catat `<deploymentId>` dan `<version>` dari output `Deployed <id> @<version>`.

- [ ] **Step 2: Arahkan ulang link produksi & hapus deployment duplikat**

```bash
npx @google/clasp undeploy <deploymentId>   # hapus deployment baru yang kebetulan dibuat
npx @google/clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF --versionNumber <version>
```
Link tetap: `https://script.google.com/macros/s/AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF/exec`

- [ ] **Step 3: Uji browser — jarum**

Login (kendaraan jarum misal `J-` sesuatu): Data Harian → pilih kendaraan ANALOG_JARUM → checkbox "Odometer tidak terbaca" tampil di kedua sisi → centang salah satu/both → km kosongkan → isi BBM (isi_bensin Ya + liter/biaya) → Simpan sukses → di riwayat km_tempuh = estimasi disertai badge **ESTIMASI**.

- [ ] **Step 4: Uji browser — guard estimasi tak tersedia**

Kendaraan jarum, centang rusak, TAPI isi_bensin Tidak (liter kosong) → Simpan → toast error "KM tidak terbaca tapi estimasi tidak tersedia…", tidak tersimpan.

- [ ] **Step 5: Uji browser — non-jarum tak berubah**

Kendaraan digital bar / angka / tidak ada → checkbox tidak muncul, km tetap required; simpan normal seperti sekarang.

- [ ] **Step 6: Uji browser — edit trx estimasi**

Buka edit trx ber-badge ESTIMASI → isi km awal & akhir asli → Simpan → km_tempuh dihitung ulang dari km asli, badge hilang (sumber AKTUAL).

- [ ] **Step 7: Uji browser — rantai odometer**

Buat 2 trx jarum berurutan (dua-duanya rusak) → km_akhir trx pertama (estimasi) menjadi anchor trx kedua; tidak ada error aneh, keduanya tersimpan.

---

## Self-Review Checklist

1. **Spec coverage:** checkbox per-sisi ✓ (Task 4); estimasi `literKonsumsi × standar_km_l` + guard ✓ (Task 2); kolom `km_sumber` + migrasi idempoten ✓ (Task 1); badge riwayat ✓ (Task 5); edit → AKTUAL ✓ (Task 3); interaksi laporan lain aman ✓ (Task 2/3 — km_tempuh read index & rantai odo tetap sama); non-jarum tak berubah ✓ (Task 4 Step 4).
2. **Placeholder scan:** semua step berisi kode lengkap; tidak ada TBD/TODO.
3. **Type consistency:** payload kunci `km_awal_broken`/`km_akhir_broken` konsisten (Task 4 → Task 2); `km_sumber` string `'AKTUAL'|'ESTIMASI'` konsisten (Task 1/2/3/5); helper `kmEstBadge(row)` & `toggleOdoBroken(side)` konsisten pemakaiannya.
4. **Risiko working tree:** disikapi via Global Constraints (teknik stash untuk Code.js/Index.html/js.html).