# Dropdown Supir Jalur BELUM_DIISI di Input Laporan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti field `#nama_supir` di form Input Laporan (input bebas-ketik + datalist) menjadi dropdown `<select>` yang hanya berisi supir dengan Jalur Pengiriman status `BELUM_DIISI` pada tanggal terpilih, meniru UX dropdown kartu Flazz di halaman Rekonsiliasi.

**Architecture:** Semua perubahan di sisi client. HTML form mengubah elemen input menjadi `select`. `js.html` menambahkan dua fungsi (`populateJalurDriverSelect`, `refreshJalurDriverOptions`), mengadaptasi `onLaporanDateChange`, menambah pemicu di `prefillFormFromLast`, melonggarkan `isSupirNameValid`, dan membersihkan fungsi datalist yang tak terpakai. Tanpa perubahan server (payload tetap `nama_supir` string).

**Tech Stack:** Google Apps Script (V8), Bootstrap 5 `form-select`, HTML5 `<select>`.

**Spec:** `docs/superpowers/specs/2026-09-16-dropdown-supir-jalur-design.md`

## Global Constraints

- Hanya file yang boleh berubah: `src/Index.html`, `src/js.html`, `src/Config.gs`.
- Tidak ada perubahan server (SpreadsheetOps.js, JalurOps.js, Code.js, FlazzOps.js, dll.) — mulai dan berakhir di sisi client.
- Nilai `payload.nama_supir` tetap nama supir (string); backend mencocokkan via `findJalurByCriteria` pada `nama_driver` (tidak diubah).
- `PAGE_VER` wajib dinaikkan (file UI berubah) → `20260916v2` → `20260916v3`.
- Tanpa deploy (keputusan user tetap berlaku).
- Cabang kerja: master (spesifikasi sudah dikomit di `be92347`). Jika diperlukan isolasi, buat branch `feat/dropdown-supir-laporan` dari master.
- Verifikasi sintaks: `js.html` berisi `<script>`, **tidak bisa** `node --check` langsung. Pakai helper: `node "$env:TEMP\extract-js.cjs" src\js.html "$env:TEMP\js_extract.js"` lalu `node --check "$env:TEMP\js_extract.js"`. `Index.html`/`Config.gs` serupa (Config.gs disalin ke `.js` karena ekstensi `.gs` ditolak `node --check`).
- Konvensi kode: var/function style ES5-leaning (kode sekitar ganti-ganti ES5/ES6; ikuti gaya sekitar), tidak menambah komentar kecuali perlu, tidak ada emoji.

---

### Task 1: Ganti HTML input → select + tambah fungsi dropdown

**Files:**
- Modify: `src/Index.html:261-262`
- Modify: `src/js.html` (di area fungsi `populateSupirDatalistFrom` baris 357-370 diganti)
- Test: `node "$env:TEMP\extract-js.cjs"` + `node --check`, plus harness kecil (lihat Step 5)

**Interfaces:**
- Consumes: `apiGetJalurDriversForDate(tgl, token)` (Code.js:462 → JalurOps.js:682) mengembalikan `{ success, list: [{ nama_driver, vehicle_id, flazz_card_id, flazz_card_name, kode_cabang }] }`.
- Produces: `populateJalurDriverSelect(list)` dan `refreshJalurDriverOptions()` — dipakai Task 2.

- [ ] **Step 1: Ganti elemen input menjadi select di `src/Index.html:261-262`**

Dari:

```html
<input id='nama_supir' class='form-control form-control-sm' list='supir-datalist' required autocomplete='off' placeholder='Ketik nama supir...' oninput='onSupirChange()' onchange='onLaporanDriverChange(); this.classList.remove("is-invalid"); updateLiveSummary()'>
<datalist id='supir-datalist'></datalist>
```

Menjadi:

```html
<select id='nama_supir' class='form-select form-select-sm' required onchange='onLaporanDriverChange(); this.classList.remove("is-invalid"); updateLiveSummary()'>
  <option value=''>Pilih Supir...</option>
</select>
```

Catatan: `required` tetap; `onchange` tetap memanggil `onLaporanDriverChange()` + `updateLiveSummary()`. `oninput='onSupirChange()'` dihapus (tidak relevan untuk select).

- [ ] **Step 2: Tambah `populateJalurDriverSelect` di `src/js.html`**

Letakkan di area baris 357-370 (ganti `populateSupirDatalistFrom` — fungsi lama dihapus, lihat Step 4). Tambahkan setelah `window.__jalurDrivers = [];`:

```js
  // ─── Jalur-based driver selection ──────────────────────────────────────
  window.__jalurDrivers = [];

  // Isi dropdown supir hanya dengan supir yang punya jalur BELUM_DIISI pada tanggal terpilih.
  // Meniru pola dropdown kartu pada Rekonsiliasi: item yang belum dibereskan yang tampil.
  function populateJalurDriverSelect(list) {
    var sel = document.getElementById('nama_supir');
    if (!sel) return;
    sel.innerHTML = '<option value="">Pilih Supir...</option>';
    (list || []).forEach(function(j) {
      var opt = document.createElement('option');
      opt.value = j.nama_driver;            // server mencocokkan ini dengan nama_driver di Jalur
      opt.text = j.nama_driver;             // plat_nomor belum dikembalikan backend; opsional untuk Task lanjutan
      opt.setAttribute('data-vehicle-id', j.vehicle_id || '');
      opt.setAttribute('data-flazz-card-id', j.flazz_card_id || '');
      sel.appendChild(opt);
    });
  }
```

- [ ] **Step 3: Tambah `refreshJalurDriverOptions` di `src/js.html`** (satu baris setelah fungsi di Step 2)

```js
  // Hanya memuat dropdown supir jalur untuk tanggal terpilih (tanpa reset field lain).
  function refreshJalurDriverOptions() {
    var tglInput = document.getElementById('tanggal');
    var tgl = tglInput ? tglInput.value : '';
    if (!tgl) { populateJalurDriverSelect([]); return; }
    google.script.run
      .withFailureHandler(function(err) {
        console.error('Gagal load jalur drivers:', err);
        populateJalurDriverSelect([]);
      })
      .withSuccessHandler(function(res) {
        if (!res || !res.success || !res.list) { populateJalurDriverSelect([]); return; }
        window.__jalurDrivers = res.list;
        populateJalurDriverSelect(res.list);
      })
      .apiGetJalurDriversForDate(tgl, bbmToken());
  }
```

- [ ] **Step 4: Hapus `populateSupirDatalistFrom` (lama)**

Hapus seluruh fungsi `populateSupirDatalistFrom(names)` yang sekarang berada di `src/js.html:360-370` (berisi kode `function populateSupirDatalistFrom(names) { ... }` dengan `supir-datalist`). Fungsi baru Step 2/3 menggantikannya.

- [ ] **Step 5: Verifikasi sintaks & uji fungsi baru (harness)**

```powershell
node "$env:TEMP\extract-js.cjs" "D:\Monitoring BBM\src\js.html" "$env:TEMP\js_extract.js"
node --check "$env:TEMP\js_extract.js"
```

Expected: exit 0 tanpa output.

Lalu jalankan harness berikut. Simpan sebagai `$env:TEMP\harness-task1.cjs` (temp, tidak dikomit):

```js
// harness-task1.cjs — uji populateJalurDriverSelect + refreshJalurDriverOptions
const fs = require('fs');
const vm = require('vm');
let js = fs.readFileSync(process.env.TEMP + '\\js_extract.js', 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name);
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = src.indexOf('{', start);
  let depth = 0, inStr = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unterminated function ' + name);
}

function makeSelect() {
  const sel = { innerHTML: '', value: '', options: [] };
  sel.appendChild = function(opt) { sel.options.push(opt); };
  return sel;
}
const els = { nama_supir: makeSelect(), tanggal: { value: '' } };
const sandbox = {
  window: {},
  document: {
    getElementById: (id) => els[id] || null,
    createElement: (tag) => ({ tag, value: '', text: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } })
  },
  google: { script: { run: null } },
  bbmToken: () => 'tok',
  console: console
};
function makeRun() {
  const chain = {};
  chain.withFailureHandler = (fh) => { chain._fh = fh; return chain; };
  chain.withSuccessHandler = (sh) => { chain._sh = sh; return chain; };
  chain.apiGetJalurDriversForDate = (tgl, token) => {
    chain._tgl = tgl;
    setTimeout(() => { chain._sh({ success: true, list: [{ nama_driver: 'Yudiman', vehicle_id: 'V-1', flazz_card_id: 'FLZ-1' }] }); }, 0);
    return chain;
  };
  return chain;
}
sandbox.google.script.run = makeRun();

const code = extractFunction(js, 'populateJalurDriverSelect') + '\n' + extractFunction(js, 'refreshJalurDriverOptions');
vm.runInNewContext(code, sandbox, { filename: 'task1.vm.js' });

let pass = 0, fail = 0;
function check(cond, label) { if (cond) { pass++; console.log('PASS: ' + label); } else { fail++; console.log('FAIL: ' + label); } }

sandbox.populateJalurDriverSelect([{ nama_driver: 'Yudiman', vehicle_id: 'V-1', flazz_card_id: 'FLZ-1' }]);
check(els.nama_supir.options.length === 2, 'test1: options placeholder + 1');
check(els.nama_supir.options[1].value === 'Yudiman', 'test1: option value = Yudiman');
check(els.nama_supir.options[1].attrs['data-vehicle-id'] === 'V-1', 'test1: data-vehicle-id = V-1');

els.tanggal.value = '2026-09-16';
sandbox.refreshJalurDriverOptions();
setTimeout(() => {
  check((sandbox.window.__jalurDrivers || []).length === 1, 'test2: __jalurDrivers terisi dari success handler');
  check(els.nama_supir.options.length === 2, 'test2: select terisi opsi Yudiman');
  els.tanggal.value = '';
  sandbox.refreshJalurDriverOptions();
  check(els.nama_supir.options.length === 1, 'test3: tanggal kosong -> placeholder saja');
  console.log('==== harness task1: ' + pass + ' passed, ' + fail + ' failed ====');
  fs.writeFileSync(process.env.TEMP + '\\harness-task1-report.txt', 'task1: ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
}, 50);
```

Expected: `harness task1: 5 passed, 0 failed`.

- [ ] **Step 6: Commit**

```powershell
git add src/Index.html src/js.html
git commit -m "feat(laporan): dropdown supir hanya dari jalur BELUM_DIISI pada tanggal terpilih"
```

---

### Task 2: Adaptasi `onLaporanDateChange` + pemicu di prefill + longgarkan validasi + bersihkan fungsi lama

**Files:**
- Modify: `src/js.html:372-406` (`onLaporanDateChange`)
- Modify: `src/js.html:856-899` (`prefillFormFromLast` success handler)
- Modify: `src/js.html:2316-2320` (`isSupirNameValid`)
- Modify: `src/js.html:2167-2179` (`populateSupirDatalist`), `2181-2204` (`getSupirSelectedName`, `getSupirFromName`, `applySupirAutofill`, `onSupirChange`), `346`, `2338-2339`

**Interfaces:**
- Consumes: `refreshJalurDriverOptions()`, `populateJalurDriverSelect(list)` dari Task 1; `getSupirSelectedName()` (tetap ada untuk pemanggil lain).
- Produces: `onLaporanDateChange()` yang memperbarui dropdown supir per tanggal; `isSupirNameValid()` longgar (hanya cek value terisi); pemanggilan `refreshJalurDriverOptions()` di akhir prefill.

- [ ] **Step 1: Tulis test gagal untuk `isSupirNameValid`**

Buat harness `$env:TEMP\harness-task2.cjs` (temp, tidak dikomit) yang mengekstrak `isSupirNameValid` dari `js_extract.js` dan mengujinya dengan select mock:

```js
// harness-task2.cjs — uji isSupirNameValid (longgar berbasis jalur)
const fs = require('fs');
const vm = require('vm');
let js = fs.readFileSync(process.env.TEMP + '\\js_extract.js', 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name);
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = src.indexOf('{', start);
  let depth = 0, inStr = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unterminated function ' + name);
}

const sel = { value: '' };
const sandbox = {
  window: {},
  document: { getElementById: (id) => (id === 'nama_supir' ? sel : null) }
};
const code = extractFunction(js, 'isSupirNameValid');
vm.runInNewContext(code, sandbox, { filename: 'task2.vm.js' });

let pass = 0, fail = 0;
function check(cond, label) { if (cond) { pass++; console.log('PASS: ' + label); } else { fail++; console.log('FAIL: ' + label); } }

check(sandbox.isSupirNameValid() === false, 'select kosong -> false');
sel.value = 'Yudiman';
check(sandbox.isSupirNameValid() === true, 'select terisi -> true');
console.log('==== harness task2: ' + pass + ' passed, ' + fail + ' failed ====');
fs.writeFileSync(process.env.TEMP + '\\harness-task2-report.txt', 'task2: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
```

Jalankan SEBELUM mengubah kode (`node "$env:TEMP\harness-task2.cjs"`). Dengan `isSupirNameValid` lama, test "select terisi -> true" kemungkinan GAGAL (fungsi lama mencoba `getSupirFromName('Yudiman')` dari master supir yang undefined di sandbox → ReferenceError atau false). Ini test gagal yang memvalidasi kebutuhan perubahan.

- [ ] **Step 2: Adaptasi `onLaporanDateChange` (baris 372-406)**

Hapus blok pengisian datalist. Dari:

```js
  function onLaporanDateChange() {
    var tglInput = document.getElementById('tanggal');
    var tgl = tglInput ? tglInput.value : '';
    var supirInput = document.getElementById('nama_supir');
    var selectVeh = document.getElementById('vehicle');
    var selectFlazzTol = document.getElementById('flazz_card_id_toll');

    if (supirInput) supirInput.value = '';
    if (selectVeh) selectVeh.selectedIndex = 0;
    if (selectFlazzTol) selectFlazzTol.value = '';
    var tolStripReset = document.getElementById('flazz_card_id_toll_strip');
    if (tolStripReset) tolStripReset.textContent = '-';
    var mtRadios = document.getElementsByName('metode_toll');
    for (var i = 0; i < mtRadios.length; i++) { mtRadios[i].checked = (mtRadios[i].value === 'TUNAI'); }
    if (typeof toggleTolFlazzCardSelection === 'function') toggleTolFlazzCardSelection();

    if (!tgl) { populateSupirDatalist(); return; }

    google.script.run
      .withFailureHandler(function(err) {
        console.error('Gagal load jalur drivers:', err);
        populateSupirDatalist();
      })
      .withSuccessHandler(function(res) {
        if (!res || !res.success || !res.list || !res.list.length) {
          populateSupirDatalist();
          return;
        }
        window.__jalurDrivers = res.list;
        var names = [];
        res.list.forEach(function(j) { names.push(j.nama_driver); });
        populateSupirDatalistFrom(names);
      })
      .apiGetJalurDriversForDate(tgl, bbmToken());
  }
```

Menjadi:

```js
  function onLaporanDateChange() {
    var tglInput = document.getElementById('tanggal');
    var supirInput = document.getElementById('nama_supir');
    var selectVeh = document.getElementById('vehicle');
    var selectFlazzTol = document.getElementById('flazz_card_id_toll');

    if (supirInput) supirInput.value = '';
    if (selectVeh) selectVeh.selectedIndex = 0;
    if (selectFlazzTol) selectFlazzTol.value = '';
    var tolStripReset = document.getElementById('flazz_card_id_toll_strip');
    if (tolStripReset) tolStripReset.textContent = '-';
    var mtRadios = document.getElementsByName('metode_toll');
    for (var i = 0; i < mtRadios.length; i++) { mtRadios[i].checked = (mtRadios[i].value === 'TUNAI'); }
    if (typeof toggleTolFlazzCardSelection === 'function') toggleTolFlazzCardSelection();

    refreshJalurDriverOptions();
  }
```

`tgl` tidak lagi dibaca langsung (di-handle `refreshJalurDriverOptions`); `var tgl = tglInput ? tglInput.value : '';` dihapus.

- [ ] **Step 3: Longgarkan `isSupirNameValid` (baris 2316-2320)**

Dari:

```js
  function isSupirNameValid() {
    var name = getSupirSelectedName().trim();
    if (!name) return false;
    return !!getSupirFromName(name);
  }
```

Menjadi:

```js
  function isSupirNameValid() {
    var sel = document.getElementById('nama_supir');
    return sel && sel.value !== '';
  }
```

- [ ] **Step 4: Tambahkan pemicu di akhir success handler `getLastLaporanPrefill`**

Di `src/js.html:897-899`, setelah `if (typeof updateLiveSummary === 'function') updateLiveSummary();` tambahkan:

```js
        // Isi dropdown supir jalur untuk tanggal terpilih tanpa mengganggu nilai prefill
        if (typeof refreshJalurDriverOptions === 'function') refreshJalurDriverOptions();
```

Perhatian: **jangan** panggil `onLaporanDateChange()` di sini — itu mereset kendaraan/tol yang baru diisi prefill.

- [ ] **Step 5: Bersihkan fungsi datalist lama yang sudah mati**

5a. Hapus pemanggilan `populateSupirDatalist();` di baris **346** (di dalam success handler `.processInitialData`). Fungsi ini dan `supir-datalist` sudah tidak ada lagi; pemanggilan akan throw ReferenceError jika fungsi dihapus. Ganti baris 346 menjadi garis kosong (atau hapus baris, jangan menyentuh `refreshSupirFilter();` di 347).

5b. Hapus pemanggilan `populateSupirDatalist();` dan `applySupirAutofill();` di `filterFormByCabang` (baris **2338-2339**). Ganti dengan panggilan `refreshJalurDriverOptions()`:

Dari:

```js
    populateSupirDatalist();
    applySupirAutofill();
    onVehicleChange();
```

Menjadi:

```js
    refreshJalurDriverOptions();
    onVehicleChange();
```

5c. Hapus definisi fungsi yang tidak lagi dipakai dari `src/js.html`:
- `populateSupirDatalist()` (baris 2167-2179)
- `getSupirSelectedName()` (baris 2181-2183) — periksa pemanggil lain sebelum hapus: `getSupirSelectedName` hanya dipakai `applySupirAutofill` (2195) dan `isSupirNameValid` (2317). Setelah Step 3+5b keduanya tidak lagi memakainya. `getSupirFromName` (2185-2192) dipakai `applySupirAutofill` (2197) dan `isSupirNameValid` (2319) — juga mati.
- `applySupirAutofill()` (baris 2194-2200)
- `onSupirChange()` (baris 2202-2204)
- `getSupirSelectedName()`, `getSupirFromName()` jika tidak ada pemanggil tersisa.

PENTING: Sebelum menghapus `getSupirSelectedName`/`getSupirFromName`, jalankan grep untuk memastikan tidak ada pemanggil lain:

```powershell
Select-String -Path "D:\Monitoring BBM\src\js.html" -Pattern "getSupirSelectedName|getSupirFromName|applySupirAutofill|populateSupirDatalist|onSupirChange"
```

Hanya hapus fungsi yang tidak lagi dirujuk. Baris yang tersisa di antara keduanya (jika ada kode lain) jangan dihapus.

- [ ] **Step 6: Jalankan test & verifikasi sintaks**

```powershell
node "$env:TEMP\extract-js.cjs" "D:\Monitoring BBM\src\js.html" "$env:TEMP\js_extract.js"
node --check "$env:TEMP\js_extract.js"
node "$env:TEMP\harness-task2.cjs"
```

Expected: `node --check` exit 0; harness task 2: `harness task2: 2 passed, 0 failed` (select kosong → false, select terisi → true). Pastikan tidak ada sisa referensi fungsi terhapus (grep Step 5 selesai tanpa kecocokan untuk fungsi yang dihapus kecuali di baris komentar).

- [ ] **Step 7: Commit**

```powershell
git add src/js.html
git commit -m "fix(laporan): dropdown supir mengikuti tanggal terpilih, validasi longgar berbasis jalur"
```

---

### Task 3: Alur submit form (regresi check) + verifikasi payload

**Files:**
- Verify (jangan diubah): `src/js.html:1171` (payload), `src/js.html:1080-1085` (validasi submit), `src/Index.html` (form)

**Interfaces:**
- Consumes: perubahan Task 1-2.
- Produces: konfirmasi alur `processDailyReport` → `payload.nama_supir` = nilai select (nama supir string).

- [ ] **Step 1: Verifikasi payload tetap nama supir**

Periksa `src/js.html:1171`:

```js
nama_supir: document.getElementById('nama_supir').value,
```

Dengan select, `.value` mengembalikan nilai opsi terpilih = `nama_driver` (string). Tidak ada perubahan yang diperlukan. Pastikan baris ini **tidak diubah**.

- [ ] **Step 2: Verifikasi validasi submit tetap berjalan**

Periksa `src/js.html:1085`: `isSupirNameValid()` (kini melonggar, hanya cek value non-kosong). Dengan select `required`, browser Forms juga memblokir submit bila value='' (placeholder terpilih). Tidak ada perubahan.

- [ ] **Step 3: Uji regresi alur dropdown → autofill kendaraan/tol**

Buat `$env:TEMP\harness-task3.cjs` (temp, tidak dikomit), mengekstrak `onLaporanDriverChange` dari `js_extract.js` bersama stub dependensinya:

```js
// harness-task3.cjs — uji onLaporanDriverChange autofill kendaraan + kartu tol
const fs = require('fs');
const vm = require('vm');
let js = fs.readFileSync(process.env.TEMP + '\\js_extract.js', 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name);
  if (start === -1) throw new Error('function ' + name + ' not found');
  let i = src.indexOf('{', start);
  let depth = 0, inStr = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unterminated function ' + name);
}

function makeSelect(options) {
  const sel = { value: '', options: options || [], selectedIndex: -1 };
  return sel;
}
const vehOptions = [{ value: 'V-1' }, { value: 'V-2' }];
const tolRadios = [{ value: 'TUNAI', checked: false }, { value: 'FLAZZ', checked: false }];
const els = {
  nama_supir: { value: 'Yudiman' },
  vehicle: makeSelect(vehOptions),
  flazz_card_id_toll: { value: '' },
  flazz_card_id_toll_strip: { textContent: '-' }
};
const sandbox = {
  window: { __jalurDrivers: [{ nama_driver: 'Yudiman', vehicle_id: 'V-1', flazz_card_id: 'FLZ-1', flazz_card_name: 'Kartu Utama' }] },
  document: {
    getElementById: (id) => els[id] || null,
    querySelectorAll: (sel_) => (sel_ === 'input[name="metode_toll"]' ? tolRadios : [])
  },
  onVehicleChange: function() { sandbox._vehChanged = true; },
  toggleTolFlazzCardSelection: function() { sandbox._tolToggled = true; },
  updateLiveSummary: function() { sandbox._summarized = true; },
  console: console
};
const code = extractFunction(js, 'onLaporanDriverChange');
vm.runInNewContext(code, sandbox, { filename: 'task3.vm.js' });

let pass = 0, fail = 0;
function check(cond, label) { if (cond) { pass++; console.log('PASS: ' + label); } else { fail++; console.log('FAIL: ' + label); } }

sandbox.onLaporanDriverChange();
check(els.nama_supir.value === 'Yudiman', 'nama_supir terisi');
check(els.vehicle.value === 'V-1', 'vehicle terisi V-1 (matched)');
check(els.flazz_card_id_toll.value === 'FLZ-1', 'kartu tol terisi FLZ-1');
check(els.flazz_card_id_toll_strip.textContent === 'Kartu Utama', 'strip nama kartu terisi');
check(tolRadios[1].checked === true && tolRadios[0].checked === false, 'radio tol = FLAZZ');
check(sandbox._vehChanged === true, 'onVehicleChange terpanggil');
console.log('==== harness task3: ' + pass + ' passed, ' + fail + ' failed ====');
fs.writeFileSync(process.env.TEMP + '\\harness-task3-report.txt', 'task3: ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
```

Jalankan: `node "$env:TEMP\harness-task3.cjs"`. Expected: `harness task3: 6 passed, 0 failed`. Konfirmasi bahwa `onLaporanDriverChange` tidak berubah dan berfungsi dengan select supir.

- [ ] **Step 4: Commit (hanya jika ada perubahan; biasanya tanpa perubahan)**

Tidak ada file berubah → tidak perlu commit. Lewati.

---

### Task 4: Bump PAGE_VER + verifikasi akhir seluruh file berubah

**Files:**
- Modify: `src/Config.gs:10`

**Interfaces:**
- Consumes: `PAGE_VER` — key `page:<PAGE_VER>` di cache `doGet` (TTL 6 jam). Wajib naik agar perubahan `Index.html` & `js.html` terkirim ke pengguna.
- Produces: `PAGE_VER = '20260916v3'`.

- [ ] **Step 1: Naikkan PAGE_VER**

`src/Config.gs:10`: `var PAGE_VER = '20260916v3';`

- [ ] **Step 2: Verifikasi sintaks semua file berubah**

```powershell
node "$env:TEMP\extract-js.cjs" "D:\Monitoring BBM\src\js.html" "$env:TEMP\js_extract.js"
node --check "$env:TEMP\js_extract.js"
Copy-Item "D:\Monitoring BBM\src\Config.gs" "$env:TEMP\config_check.js"
node --check "$env:TEMP\config_check.js"
```

Expected: exit 0 untuk keduanya.

- [ ] **Step 3: Commit**

```powershell
git add src/Config.gs
git commit -m "chore(version): PAGE_VER 20260916v3 - dropdown supir hanya jalur BELUM_DIISI"
```

- [ ] **Step 4: Buat ringkasan verifikasi akhir**

Tulis ke `docs/superpowers/plans/2026-09-16-dropdown-supir-jalur.md` (file ini) bagian "Verifikasi Akhir" (append) berisi: daftar commit, hasil node --check, hasil harness task 1-3, daftar fungsi yang dihapus/diubah. Lalu commit file plan:

```powershell
git add docs/superpowers/plans/2026-09-16-dropdown-supir-jalur.md
git commit -m "docs: verifikasi akhir dropdown supir laporan"
```

---

## Verifikasi Akhir

Disi pada Task 4 Step 4 — **SELESAI**

**Commit (master..HEAD):**
- `5a51039` feat(laporan): dropdown supir hanya dari jalur BELUM_DIISI pada tanggal terpilih
- `0624302` fix(laporan): dropdown supir mengikuti tanggal terpilih, validasi longgar berbasis jalur
- `605e27d` chore(version): PAGE_VER 20260916v3 - dropdown supir hanya jalur BELUM_DIISI

**Cek sintaks:**
- `node --check js_extract.js` (js.html) → exit 0
- `node --check config_check.js` (Config.gs) → exit 0

**Hasil harness (temp, tidak dikomit):**
- `harness-task1.cjs`: 6 passed, 0 failed (populateJalurDriverSelect + refreshJalurDriverOptions, incl. tanggal kosong)
- `harness-task2.cjs`: 2 passed, 0 failed (isSupirNameValid longgar)
- `harness-task3.cjs`: 6 passed, 0 failed (onLaporanDriverChange autofill + toggle; awalnya 1 gagal karena mock `selectedIndex`→`value` tidak tersinkron di harness, bukan kode)

**Fungsi dihapus (mati setelah Task 2):** `populateSupirDatalist`, `populateSupirDatalistFrom`, `getSupirSelectedName`, `getSupirFromName`, `applySupirAutofill`, `onSupirChange` (per plan Step 5c + verifikasi grep tanpa pemanggil tersisa).

**Fungsi baru:** `populateJalurDriverSelect(list)`, `refreshJalurDriverOptions()`

**Fungsi diubah:** `onLaporanDateChange` (ganti datalist → `refreshJalurDriverOptions()`), `isSupirNameValid` (hanya cek value non-kosong), success handler `getLastLaporanPrefill` (+ pemicu `refreshJalurDriverOptions()`), `filterFormByCabang` (panggil `refreshJalurDriverOptions()`).

**Payload:** `nama_supir: document.getElementById('nama_supir').value` (js.html:1176) — tidak berubah, kini mengembalikan nilai select = `nama_driver`.

## Self-Review

**1. Spec coverage:**
- §1 HTML select — Task 1 Step 1. ✅
- §2a populateJalurDriverSelect — Task 1 Step 2. ✅
- §2b onLaporanDateChange adapt — Task 2 Step 2. ✅
- §2c onLaporanDriverChange tak berubah — Task 3 Step 3 (verifikasi regresi). ✅
- §2d refreshJalurDriverOptions + prefill trigger — Task 1 Step 3 + Task 2 Step 4. ✅
- §2e isSupirNameValid longgar — Task 2 Step 3. ✅
- §2f getSupirSelectedName tak berubah — Task 2 Step 5c (dicek pemanggilnya, tetap bila ada konsumen). ✅
- §2g bersihkan fungsi mati — Task 2 Step 5. ✅
- §3 no server change — global constraint. ✅
- §4 kontrak data nama_driver — Task 1 Step 2. ✅
- §5 kontrak UI — Task 2 semuanya. ✅
- §6 PAGE_VER — Task 4. ✅

**2. Placeholder scan:** Tidak ada TBD/TODO; semua step berisi kode aktual.

**3. Type consistency:** `populateJalurDriverSelect(list)` dan `refreshJalurDriverOptions()` konsisten dipakai di Task 1/2/3. `isSupirNameValid` mengembalikan boolean. `onLaporanDriverChange` tak diubah — tetap memakai `window.__jalurDrivers`. Konsisten.