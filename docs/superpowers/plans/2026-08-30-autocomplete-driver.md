# Autocomplete Nama Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti dropdown driver menjadi input teks kosong dengan autocomplete (native `<datalist>`) di Input Laporan dan Buat Jadwal, dengan auto-fill kendaraan default saat driver dipilih, plus validasi nama driver saat simpan.

**Architecture:** Client-side menggunakan native HTML `<datalist>` + `<input list>`. Driver source dari `window.masterData.supir` (sudah difilter role/cabang di server). Resolusi nama→driver disimpan di atribut `data-driver-id` pada input. Tidak ada perubahan skema spreadsheet. Simpan data tetap sama (Input Laporan simpan nama, Buat Jadwal simpan `driver_id`).

**Tech Stack:** Google Apps Script, vanilla JS, Bootstrap 5, native HTML datalist.

## Global Constraints

- Tidak mengubah skema spreadsheet / backend; hanya perubahan UI + logika client (Index.html, JalurPages.html, js.html, JalurScript.html, css.html bila perlu).
- Data driver client: `window.masterData.supir` (objek: `id`, `nama`, `cabang`, `default_vehicle_id`); Input Laporan juga punya `allDrivers` (`window.allDrivers`).
- Input Laporan menyimpan **nama** driver; Buat Jadwal menyimpan **`driver_id`**.
- Semua input driver mulai **kosong**; field kendaraan **kosong** sampai driver dipilih.
- Pesan error memakai `showToast(msg, 'error')`.
- Setiap file HTML di-verifikasi dengan `node --check` pada isi `<script>`-nya (apps-script project tidak punya test runner).

---

### Task 1: Input Laporan — ubah field Nama Supir jadi autocomplete + hapus pre-fill driver/kendaraan

**Files:**
- Modify: `src/Index.html:214-217` (field `nama_supir`)
- Modify: `src/js.html:487-503` (prefill), `src/js.html:1028-1058` (`onSupirChange`, `filterFormByCabang`), `src/js.html:165-176` (populasi driver)

**Interfaces:**
- Produces: input `#nama_supir` (tipe text) dengan `list='supir-datalist'`; elemen `<datalist id='supir-datalist'>`; fungsi global `populateSupirDatalist()`, `resolveSupirFromInput()`, `applySupirAutofill()`, `getSupirSelectedName()`.

- [ ] **Step 1: Ubah HTML field Nama Supir**

Di `src/Index.html:214-217`, ganti blok `<select id='nama_supir' ...>` menjadi input text + datalist:

```html
<div class='col-md-6 mb-3'>
  <label class='form-label fw-bold text-muted small text-uppercase'>Nama Supir</label>
  <input id='nama_supir' class='form-control' list='supir-datalist' required autocomplete='off' placeholder='Ketik nama supir...' oninput='onSupirChange()'>
  <datalist id='supir-datalist'></datalist>
</div>
```

- [ ] **Step 2: Tambahkan helper autocomplete supir**

Di `src/js.html`, tambahkan fungsi-fungsi berikut (letakkan dekat `onSupirChange`):

```js
function populateSupirDatalist() {
  var dl = document.getElementById('supir-datalist');
  if (!dl) return;
  var src = (typeof allDrivers !== 'undefined' && allDrivers.length) ? allDrivers : ((window.masterData && window.masterData.supir) || []);
  var cabang = document.getElementById('input-cabang') ? document.getElementById('input-cabang').value : '';
  dl.innerHTML = '';
  src.forEach(function (d) {
    if (cabang && d.cabang !== cabang) return;
    var o = document.createElement('option');
    o.value = d.nama;
    dl.appendChild(o);
  });
}

function getSupirSelectedName() {
  return document.getElementById('nama_supir') ? document.getElementById('nama_supir').value : '';
}

function getSupirFromName(name) {
  var src = (typeof allDrivers !== 'undefined' && allDrivers.length) ? allDrivers : ((window.masterData && window.masterData.supir) || []);
  return src.find(function (d) { return d.nama === name; });
}

function applySupirAutofill() {
  var name = getSupirSelectedName().trim();
  var vehSel = document.getElementById('vehicle');
  var d = getSupirFromName(name);
  if (vehSel) vehSel.value = (d && d.default_vehicle_id) ? d.default_vehicle_id : '';
}
```

- [ ] **Step 3: Sesuaikan `onSupirChange`** — panggil autofill dan ikutkan validasi nama

Di `src/js.html:1028-1036`, ganti seluruh fungsi dengan:

```js
function onSupirChange() {
  applySupirAutofill();
}
```

Tambahkan helper validasi (dipakai saat simpan laporan):

```js
function isSupirNameValid() {
  var name = getSupirSelectedName().trim();
  if (!name) return false;
  return !!getSupirFromName(name);
}
```

- [ ] **Step 4: Populasi datalist saat driver dimuat**

Setelah `allDrivers = data.drivers || []` (sekitar `src/js.html:257`), panggil:

```js
populateSupirDatalist();
```

- [ ] **Step 5: Sesuaikan `filterFormByCabang`**

Di `src/js.html:1038-1058`, ganti pengisian `selectSupir` (blok `selectSupir.innerHTML...filteredD.forEach`) — hapus bagian select supir, sisakan pengisian select kendaraan, lalu panggil `populateSupirDatalist()` dan `applySupirAutofill()`:

```js
function filterFormByCabang() {
  var cabang = document.getElementById('input-cabang').value;
  var selectVeh = document.getElementById('vehicle');
  selectVeh.innerHTML = '';
  var filteredV = cabang ? allVehicles.filter(function (v) { return v.cabang === cabang; }) : (allVehicles || []);
  filteredV.forEach(function (v) {
    var opt = document.createElement('option');
    opt.value = v.vehicle_id;
    opt.text = v.plat_nomor + ' - ' + v.nama;
    selectVeh.appendChild(opt);
  });
  populateSupirDatalist();
  applySupirAutofill();
}
```

- [ ] **Step 6: Hapus pre-fill driver & kendaraan**

Di `src/js.html:499-502`, hapus baris yang mengisi `vehicle` (`vehSel.value = p.vehicle_id`) dan `nama_supir` (`supirSel.value = p.nama_supir`). Biarkan tanggal & field lain tetap terisi.

- [ ] **Step 7: Validasi nama supir saat simpan laporan**

Fungsi simpan laporan sedang menyusun `formDataPayload` di `src/js.html:567`. Masukkan validasi di dalam blok `try` yang sama, **tepat sebelum pembentukan `formDataPayload`** (sebelum `let bbmSelect = ...` di `src/js.html:561`):

```js
try {
  if (!isSupirNameValid()) { showToast('Nama supir tidak valid, pilih dari daftar', 'error'); return; }
  let bbmSelect = document.getElementById('jenis_bbm');
  ...
```

- [ ] **Step 8: Verifikasi parse**

```powershell
$c = Get-Content -Raw "src\js.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\js_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "js.html OK" }
$c2 = Get-Content -Raw "src\Index.html"; $m2 = [regex]::Matches($c2, '(?s)<script[^>]*>(.*?)</script>'); $i=0; foreach($x in $m2){ $i++; $t2="$env:TEMP\idx_$i.js"; Set-Content -Path $t2 -Value $x.Groups[1].Value -Encoding UTF8; node --check $t2; if($?){ "Index.html #$i OK" } }
```

Expected: semua `OK` (tanpa error).

- [ ] **Step 9: Commit**

```bash
git add src/Index.html src/js.html
git commit -m "feat: autocomplete driver pada input laporan + auto-fill kendaraan"
```

---

### Task 2: Buat Jadwal — ubah field Driver di tiap baris jadi autocomplete

**Files:**
- Modify: `src/JalurPages.html` (template baris `jalur-row-driver`)
- Modify: `src/JalurScript.html` (`jalurRenderDriverOptions`, `jalurAddRow`, `jalurSave`, `jalurAutoFillVehicle`, `jalurEdit`)

**Interfaces:**
- Consumes: dari Task 1 — keyword pola datalist+input; data `window.masterData.supir`.
- Produces: input `.jalur-row-driver` (text) dengan `list='jalur-supir-datalist'`; `<datalist id='jalur-supir-datalist'>`; fungsi `jalurPopulateDriverDatalist()`, `jalurResolveDriverId(input)`, `jalurResolveDefaultVehicle(input)`, `jalurValidateRow(row)`.

- [ ] **Step 1: Tambah datalist + ubah template baris**

Di `src/JalurPages.html`, dalam kontainer `#jalur-rows`, tambahkan `<datalist id='jalur-supir-datalist'></datalist>` (di dalam `#jalur-rows`, cukup sekali), dan ubah field driver pada template baris dari `<select class='form-select jalur-row-driver'></select>` menjadi:

```html
<input class='form-control jalur-row-driver' list='jalur-supir-datalist' autocomplete='off' placeholder='Ketik nama driver...' oninput='jalurAutofillFromDriver(this)'>
```

Ubah juga field driver pada **modal edit** (`src/JalurPages.html:87`) dari `<select id='jalur-edit-driver' class='form-select' required></select>` menjadi:

```html
<input id='jalur-edit-driver' class='form-control' list='jalur-supir-datalist' autocomplete='off' placeholder='Ketik nama driver...' required>
```

- [ ] **Step 2: Tambah helper driver di JalurScript**

Di `src/JalurScript.html`, ganti `jalurRenderDriverOptions` menjadi `jalurPopulateDriverDatalist` dan tambah helper:

```js
function jalurPopulateDriverDatalist() {
  var dl = document.getElementById('jalur-supir-datalist');
  if (!dl) return;
  var drivers = (window.masterData && window.masterData.supir) || [];
  dl.innerHTML = '';
  drivers.forEach(function (d) {
    var o = document.createElement('option');
    o.value = d.nama;
    o.setAttribute('data-driver-id', d.id);
    if (d.default_vehicle_id) o.setAttribute('data-default-vehicle', d.default_vehicle_id);
    dl.appendChild(o);
  });
}

function jalurFindDriverByName(name) {
  var drivers = (window.masterData && window.masterData.supir) || [];
  return drivers.find(function (d) { return d.nama === name; });
}

function jalurResolveDriverId(inputEl) {
  var name = inputEl ? (inputEl.value || '').trim() : '';
  var d = jalurFindDriverByName(name);
  return d ? d.id : '';
}

function jalurResolveDefaultVehicle(inputEl) {
  var name = inputEl ? (inputEl.value || '').trim() : '';
  var d = jalurFindDriverByName(name);
  return (d && d.default_vehicle_id) ? d.default_vehicle_id : '';
}

function jalurAutofillFromDriver(driverInput) {
  var row = driverInput.closest('.jalur-row');
  if (!row) return;
  var vehSel = row.querySelector('.jalur-row-vehicle');
  var defVeh = jalurResolveDefaultVehicle(driverInput);
  if (vehSel) vehSel.value = defVeh || '';
}

function jalurValidateRow(row) {
  var driverInput = row.querySelector('.jalur-row-driver');
  var name = driverInput ? (driverInput.value || '').trim() : '';
  if (!name) return false;
  return !!jalurFindDriverByName(name);
}
```

- [ ] **Step 3: Update `jalurAddRow`**

Di `src/JalurScript.html`, ganti isi `jalurAddRow` agar render field driver sebagai input text (bukan select), isi dropdown kendaraan, dan panggil `jalurPopulateDriverDatalist()` saat init. Hapus pemanggilan `jalurRenderDriverOptions(...)` dan `jalurRenderVehicleOptions(...)` yang lama; gunakan helper pengisi kendaraan yang ada (`jalurRenderVehicleOptions` tetap dipakai untuk select kendaraan):

```js
function jalurAddRow() {
  const container = document.getElementById('jalur-rows');
  const row = document.createElement('div');
  row.className = 'row g-2 mb-2 align-items-end jalur-row';
  row.innerHTML =
    '<div class="col-12 col-md-4"><label class="form-label text-muted small text-uppercase fw-bold">Driver</label>' +
    '<input class="form-control jalur-row-driver" list="jalur-supir-datalist" autocomplete="off" placeholder="Ketik nama driver..." oninput="jalurAutofillFromDriver(this)"></div>' +
    '<div class="col-12 col-md-4"><label class="form-label text-muted small text-uppercase fw-bold">Kendaraan</label>' +
    '<select class="form-select jalur-row-vehicle"></select></div>' +
    '<div class="col-12 col-md-4"><label class="form-label text-muted small text-uppercase fw-bold">Rute Tujuan</label>' +
    '<div class="input-group"><input type="text" class="form-control jalur-row-rute" placeholder="ex: Gudang A - Toko B">' +
    '<button type="button" class="btn btn-outline-danger" onclick="this.closest(\'.jalur-row\').remove()"><i class="bi bi-x"></i></button></div></div>';
  container.appendChild(row);
  jalurRenderVehicleOptions(row.querySelector('.jalur-row-vehicle'));
}
```

- [ ] **Step 4: Update `jalurInitForm`**

Di `src/JalurScript.html`, pastikan `jalurInitForm` memanggil `jalurPopulateDriverDatalist()` di dalam callback `jalurEnsureMaster` sebelum `jalurAddRow()`:

```js
function jalurInitForm() {
  jalurEnsureMaster(function() {
    jalurPopulateDriverDatalist();
    const rows = document.getElementById('jalur-rows');
    if (!rows) return;
    rows.innerHTML = '';
    const t = document.getElementById('jalur-tanggal');
    if (t && !t.value) t.value = new Date().toISOString().slice(0, 10);
    jalurAddRow();
  });
}
```

- [ ] **Step 5: Update `jalurSave` untuk validasi & ambil driver_id dari nama**

Di `src/JalurScript.html`, ganti loop validasi baris pada `jalurSave` agar: setiap baris memvalidasi nama driver via `jalurValidateRow`; jika tidak valid, tampilkan toast dan `return`. Amati kode saat ini yang membaca `r.querySelector('.jalur-row-driver').value` sebagai `driverId`. Ganti resolusi `driverId` dengan `jalurResolveDriverId(...)`:

```js
const rows = [];
let valid = true;
document.querySelectorAll('#jalur-rows .jalur-row').forEach(function(r) {
  const driverInput = r.querySelector('.jalur-row-driver');
  const vehicleId = r.querySelector('.jalur-row-vehicle').value;
  const rute = r.querySelector('.jalur-row-rute').value;
  if (driverInput && (driverInput.value || '').trim() && vehicleId && rute.trim()) {
    if (!jalurValidateRow(r)) { valid = false; return; }
    rows.push({ driver_id: jalurResolveDriverId(driverInput), vehicle_id: vehicleId, rute_tujuan: rute.trim() });
  }
});
if (!valid) { showToast('Ada nama driver yang tidak dikenal, pilih dari daftar', 'error'); return; }
if (!rows.length) { showToast('Isi minimal satu baris lengkap', 'error'); return; }
```

- [ ] **Step 6: Update modal edit (`jalurEdit` & `jalurSaveEdit`)**

Di `src/JalurScript.html` `jalurEdit`, ganti `jalurRenderDriverOptions(document.getElementById('jalur-edit-driver'), it.driver_id)` menjadi set nilai input text ke nama driver, dan panggil `jalurPopulateDriverDatalist()` sebelum membuka modal:

```js
jalurPopulateDriverDatalist();
document.getElementById('jalur-edit-driver').value = it.nama_driver || jalurDriverNameById(it.driver_id) || '';
jalurRenderVehicleOptions(document.getElementById('jalur-edit-vehicle'), it.vehicle_id);
```

Tambah helper `jalurDriverNameById` (di samping helper lain Task 2):

```js
function jalurDriverNameById(id) {
  var drivers = (window.masterData && window.masterData.supir) || [];
  var d = drivers.find(function (x) { return String(x.id) === String(id); });
  return d ? d.nama : '';
}
```

Di `jalurSaveEdit`, `#jalur-edit-driver` kini input text berisi **nama**. Ganti resolusi `driver_id` dari nama alih-alih membaca value langsung:

```js
var driverId = jalurResolveDriverId(document.getElementById('jalur-edit-driver'));
if (!driverId) { showToast('Nama driver tidak valid, pilih dari daftar', 'error'); return; }
var data = {
  id: document.getElementById('jalur-edit-id').value,
  tanggal: document.getElementById('jalur-edit-tanggal').value,
  driver_id: driverId,
  vehicle_id: document.getElementById('jalur-edit-vehicle').value,
  rute_tujuan: document.getElementById('jalur-edit-rute').value
};
```

- [ ] **Step 7: Verifikasi parse**

```powershell
$c = Get-Content -Raw "src\JalurScript.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\jalur_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "JalurScript OK" }
$c2 = Get-Content -Raw "src\JalurPages.html"; $m2 = [regex]::Matches($c2, '(?s)<script[^>]*>(.*?)</script>'); foreach($x in $m2){ $t2="$env:TEMP\jp_chk.js"; Set-Content -Path $t2 -Value $x.Groups[1].Value -Encoding UTF8; node --check $t2; if($?){ "JalurPages inline OK" } }
```

Expected: semua `OK` (tanpa error).

- [ ] **Step 8: Commit**

```bash
git add src/JalurPages.html src/JalurScript.html
git commit -m "feat: autocomplete driver pada buat jadwal + auto-fill kendaraan"
```

---

### Task 3: Verifikasi end-to-end + deploy (clasp)

**Files:** none (opsi README di Task 4)

- [ ] **Step 1: Cek semua file project lolos parse**

```powershell
node --check src/JalurOps.js; node --check src/Code.js; node --check src/SpreadsheetOps.js; node --check src/DatabaseSetup.js
```

Expected: tidak ada error.

- [ ] **Step 2: Push ke Apps Script**

```bash
clasp push -f
```

Expected: `Pushed N files`, termasuk `Index.html`, `js.html`, `JalurPages.html`, `JalurScript.html`.

- [ ] **Step 3: Deploy ke deployment live (link yang sama)**

```bash
clasp deploy --deploymentId AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF
```

Expected: `Deployed ... @N`.

- [ ] **Step 4: Uji manual** — buka link, verifikasi di **Input Laporan**: field Nama Supir kosong & area kendaraan kosong; ketik nama supir → muncul saran; pilih → kendaraan terisi; ketik nama tidak dikenal lalu simpan → ditolak. Verifikasi di **Buat Jadwal**: tiap baris field driver kosong; pilih driver → kendaraan terisi; simpan baris dengan nama driver tidak dikenal → ditolak.

---

### Task 4: Update README

**Files:** Modify: `README.md`

- [ ] **Step 1: Tambahkan catatan autocomplete driver**

Pada bagian fitur yang relevan (dekat dokumentasi Input Laporan / Jalur Pengiriman), tambahkan baris ringkas:

```markdown
- **Autocomplete Driver:** field driver (Input Laporan & Buat Jadwal) berupa input teks dengan autocomplete; memilih driver otomatis mengisi kendaraan default. Field driver & kendaraan mulai kosong.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: autocomplete driver"
```
