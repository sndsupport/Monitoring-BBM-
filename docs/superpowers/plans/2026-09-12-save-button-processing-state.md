# State "Memproses" pada Tombol Simpan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semua tombol Simpan di aplikasi menampilkan state "Memproses..."/"Menyimpan..." (spinner + disabled) saat diklik dan kembali normal setelah selesai.

**Architecture:** Menerapkan pola standar `btn.dataset.origHtml` + `innerHTML` spinner (sama seperti `FlazzScript.html`) pada 6 handler di `src/js.html` yang saat ini tidak punya feedback: `saveEditDaily`, `addMasterCabang`, `addMasterKendaraan`, `addMasterSupir`, `addMasterBBM`, `saveMasterPenggunaForm`. Ditambah `id` pada tombol submit modal edit di `Index.html`. Tidak ada perubahan server-side.

**Tech Stack:** Google Apps Script (client-side JS dalam file HTML template), Bootstrap 5.

## Global Constraints

- File yang diubah: `src/js.html`, `src/Index.html` (hanya tombol edit modal).
- Teks state: "Memproses..." untuk edit transaksi; "Menyimpan..." untuk master CRUD.
- `saveEditDaily`: restore tombol hanya di `withFailureHandler` (modal auto-close saat sukses). Master CRUD: restore di success DAN failure.
- Verifikasi sintaks: `node --check` pada blok `<script>` (pola `deploy.ps1`).
- Commit terpisah per task, pesan commit style repo (`feat:`/`fix:`).

---

### Task 1: Tombol Simpan modal Edit Transaksi BBM

**Files:**
- Modify: `src/Index.html:1239`
- Modify: `src/js.html:1857-1898`

**Interfaces:**
- Produces: elemen `#btn-save-edit` di modal `modal-edit-daily` (dipakai Task 2? tidak — hanya dipakai sendiri).

- [ ] **Step 1: Tambahkan id pada tombol submit modal edit**

Di `src/Index.html:1239`, ubah:

```html
<button type="submit" class="btn btn-primary">Simpan</button>
```

menjadi:

```html
<button type="submit" class="btn btn-primary" id="btn-save-edit">Simpan</button>
```

- [ ] **Step 2: Tambahkan state memproses di `saveEditDaily`**

Di `src/js.html`, dalam `saveEditDaily(e)` (mulai baris 1857), ganti seluruh blok `google.script.run` (baris 1887-1898) dengan versi yang menyetel state tombol sebelum panggil dan merestore saat gagal/error custom:

```js
    let btnEdit = document.getElementById('btn-save-edit');
    let editOrig = btnEdit.innerHTML;
    btnEdit.dataset.origHtml = editOrig;
    btnEdit.disabled = true;
    btnEdit.innerHTML = "<span class='spinner-border spinner-border-sm'></span> Memproses...";
    google.script.run.withSuccessHandler(res => {
      if(res.success){
         showToast(res.msg, 'success');
         bootstrap.Modal.getInstance(document.getElementById('modal-edit-daily')).hide();
         if (typeof flazzDataCache !== 'undefined') flazzDataCache = null; // Flush cache
         window.__dashForce = true;
         window.__perfForce = true;
         loadDashboard();
         if (typeof loadFlazzDataWrapper === 'function') loadFlazzDataWrapper(true);
      }
      else {
        btnEdit.disabled = false;
        btnEdit.innerHTML = (btnEdit.dataset && btnEdit.dataset.origHtml) || editOrig;
        showToast(res.msg, 'error');
      }
    }).withFailureHandler(err => {
      btnEdit.disabled = false;
      btnEdit.innerHTML = (btnEdit.dataset && btnEdit.dataset.origHtml) || editOrig;
      showToast('Gagal: ' + err.message, 'error');
    }).apiEditDailyTransaction(payload, bbmToken());
```

- [ ] **Step 3: Verifikasi sintaks**

Dari root repo, jalankan:

```powershell
$c = Get-Content -Raw "src\js.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\js_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "js.html OK" }
```

Expected: `js.html OK`. (Perubahan di `Index.html:` hanya markup `id` — tidak ada blok script yang berubah.)

- [ ] **Step 4: Commit**

```bash
git add src/Index.html src/js.html
git commit -m "feat: tombol simpan edit transaksi menampilkan state memproses"
```

---

### Task 2: Tombol Simpan master CRUD (Cabang, Kendaraan, Supir, BBM, Pengguna)

**Files:**
- Modify: `src/js.html:2263-2387` (addMasterCabang, addMasterKendaraan, addMasterSupir, addMasterBBM)
- Modify: `src/js.html:2730-2753` (saveMasterPenggunaForm)

**Interfaces:**
- Consumes: pola `btn.dataset.origHtml` dari Task 1 (konsep sama).
- Produces: tombol `#btn-add-cabang`, `#btn-add-vehicle`, `#btn-add-supir`, `#btn-add-bbm`, `#btn-save-pengguna` menampilkan "Menyimpan..." saat diproses.

- [ ] **Step 1: Tambahkan state di `addMasterCabang` (js.html:2263)**

Ganti blok pembuka:

```js
  function addMasterCabang() {
    let btn = document.getElementById('btn-add-cabang');
    btn.disabled = true;
```

menjadi:

```js
  function addMasterCabang() {
    let btn = document.getElementById('btn-add-cabang');
    let btnOrig = btn.innerHTML;
    btn.dataset.origHtml = btnOrig;
    btn.disabled = true;
    btn.innerHTML = "<span class='spinner-border spinner-border-sm'></span> Menyimpan...";
```

Lalu ganti kedua blok restore (success & failure), dari:

```js
    google.script.run.withSuccessHandler(res => {
      showToast(res.msg, 'success');
      btn.disabled = false;
      document.getElementById('form-cabang').reset();
      loadMasterData('cabang');
      closeBootstrapModal('modal-cabang');
    }).withFailureHandler(err => {
      showToast('Gagal: ' + err.message, 'error');
      btn.disabled = false;
    })[editId ? 'updateMasterCabang' : 'saveMasterCabang'](data, bbmToken());
```

menjadi:

```js
    google.script.run.withSuccessHandler(res => {
      showToast(res.msg, 'success');
      btn.disabled = false;
      btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
      document.getElementById('form-cabang').reset();
      loadMasterData('cabang');
      closeBootstrapModal('modal-cabang');
    }).withFailureHandler(err => {
      showToast('Gagal: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
    })[editId ? 'updateMasterCabang' : 'saveMasterCabang'](data, bbmToken());
```

- [ ] **Step 2: Tambahkan state di `addMasterKendaraan` (js.html:2285)**

Pola identik Task 2 Step 1 tetapi dengan:
- tombol: `btn-add-vehicle`
- form reset: `form-kendaraan`
- load: `loadMasterData('kendaraan')`
- modal: `modal-kendaraan`
- panggil: `[editId ? 'updateMasterKendaraan' : 'saveMasterKendaraan']`

Blok pembuka baru:

```js
  function addMasterKendaraan() {
    let btn = document.getElementById('btn-add-vehicle');
    let btnOrig = btn.innerHTML;
    btn.dataset.origHtml = btnOrig;
    btn.disabled = true;
    btn.innerHTML = "<span class='spinner-border spinner-border-sm'></span> Menyimpan...";
```

Blok restore baru:

```js
    google.script.run.withSuccessHandler(res => {
      showToast(res.msg, 'success');
      btn.disabled = false;
      btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
      document.getElementById('form-kendaraan').reset();
      loadMasterData('kendaraan');
      closeBootstrapModal('modal-kendaraan');
    }).withFailureHandler(err => {
      showToast('Gagal: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
    })[editId ? 'updateMasterKendaraan' : 'saveMasterKendaraan'](data, bbmToken());
```

- [ ] **Step 3: Tambahkan state di `addMasterSupir` (js.html:2316)**

Pola identik dengan tombol `btn-add-supir`, form `form-supir`, `loadMasterData('supir')`, modal `modal-supir`, panggil `[editId ? 'updateMasterSupir' : 'saveMasterSupir']`:

```js
  function addMasterSupir() {
    let btn = document.getElementById('btn-add-supir');
    let btnOrig = btn.innerHTML;
    btn.dataset.origHtml = btnOrig;
    btn.disabled = true;
    btn.innerHTML = "<span class='spinner-border spinner-border-sm'></span> Menyimpan...";
```

```js
    google.script.run.withSuccessHandler(res => {
      showToast(res.msg, 'success');
      btn.disabled = false;
      btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
      document.getElementById('form-supir').reset();
      loadMasterData('supir');
      closeBootstrapModal('modal-supir');
    }).withFailureHandler(err => {
      showToast('Gagal: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
    })[editId ? 'updateMasterSupir' : 'saveMasterSupir'](data, bbmToken());
```

- [ ] **Step 4: Tambahkan state di `addMasterBBM` (js.html:2368)**

Pola identik dengan tombol `btn-add-bbm`, form `form-bbm`, `loadMasterData('bbm')`, modal `modal-bbm`, panggil `[editId ? 'updateMasterBBM' : 'saveMasterBBM']`:

```js
  function addMasterBBM() {
    let btn = document.getElementById('btn-add-bbm');
    let btnOrig = btn.innerHTML;
    btn.dataset.origHtml = btnOrig;
    btn.disabled = true;
    btn.innerHTML = "<span class='spinner-border spinner-border-sm'></span> Menyimpan...";
```

```js
    google.script.run.withSuccessHandler(res => {
      showToast(res.msg, 'success');
      btn.disabled = false;
      btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
      document.getElementById('form-bbm').reset();
      loadMasterData('bbm');
      closeBootstrapModal('modal-bbm');
    }).withFailureHandler(err => {
      showToast('Gagal: ' + err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
    })[editId ? 'updateMasterBBM' : 'saveMasterBBM'](data, bbmToken());
```

- [ ] **Step 5: Tambahkan state di `saveMasterPenggunaForm` (js.html:2730)**

Ganti mulai `let btn = document.getElementById('btn-save-pengguna'); btn.disabled = true;` menjadi:

```js
    let btn = document.getElementById('btn-save-pengguna');
    let btnOrig = btn.innerHTML;
    btn.dataset.origHtml = btnOrig;
    btn.disabled = true;
    btn.innerHTML = "<span class='spinner-border spinner-border-sm'></span> Menyimpan...";
```

Ganti blok handler menjadi:

```js
    google.script.run
      .withSuccessHandler(function(res) {
        showToast(res.msg, 'success');
        btn.disabled = false;
        btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
        loadMasterData('pengguna');
        closeBootstrapModal('modal-pengguna');
      })
      .withFailureHandler(function(err) {
        showToast('Gagal: ' + err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || btnOrig;
      })[editId ? 'updateMasterPengguna' : 'saveMasterPengguna'](data, bbmToken());
```

- [ ] **Step 6: Verifikasi sintaks**

```powershell
$c = Get-Content -Raw "src\js.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\js_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "js.html OK" }
```

Expected: `js.html OK`. Pastikan kata `btnOrig` dideklarasi persis satu kali per handler (tidak bentrok dengan nama lain di scope yang sama).

- [ ] **Step 7: Commit**

```bash
git add src/js.html
git commit -m "feat: tombol simpan master CRUD menampilkan state memproses"
```

---

## Verifikasi Akhir (setelah deploy)

1. Login sebagai SUPERADMIN.
2. Buka History Laporan → Edit transaksi → klik Simpan: tombol jadi disabled + spinner "Memproses...", modal menutup, data ter-update.
3. Buka tab Master → buka modal Cabang/Kendaraan/Supir/BBM/Pengguna untuk tambah/edit → klik Simpan: tombol "Menyimpan...", lalu kembali normal & modal tertutup.
4. Buat interupsi (contoh: matikan koneksi) → failure handler merestore tombol dan menampilkan toast error.