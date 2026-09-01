# Ganti Foto & KM Odometer di History Laporan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memungkinkan pengguna mengganti foto odometer awal/akhir dan mengoreksi angka KM awal/akhir secara manual saat mengedit transaksi BBM di menu History Laporan.

**Architecture:** Perluas modal edit `#modal-edit-daily` dengan dua input file foto (awal & akhir) + preview. `saveEditDaily` mengirim base64 foto baru bila ada. `editDailyTransaction` di backend meng-upload foto baru ke Drive (folder `KM_Awal`/`KM_Akhir`), menghapus foto lama, dan menulis URL baru ke spreadsheet.

**Tech Stack:** Google Apps Script (V8), HTML/Bootstrap 5, Google Drive API (Apps Script), clasp.

## Global Constraints

- Platform: Google Apps Script web app; semua fungsional di `src/`.
- Kolom foto di spreadsheet: `foto_odo_awal` = index 8, `foto_odo_akhir` = index 12 (dari `getRecentTransactions`).
- Nilai KM diisi manual; **tidak** memakai OCR pada fitur edit.
- Foto lama dihapus dari Drive (best-effort); jika ekstraksi fileId gagal, lewati tanpa gagalkan simpan.
- Fungsi backend dibungkus try/catch dan mengembalikan `{ success, msg }`.
- Semua fungsi global antar-file dapat saling memanggil (pola Apps Script library).
- Presisi liter & KM mengikuti perilaku simpan yang sudah ada.

---

### Task 1: Helper hapus file Drive + ekstraksi fileId (backend)

**Files:**
- Modify: `src/DriveOps.js` (tambah fungsi di akhir file)

**Interfaces:**
- Produces:
  - `function deleteDriveFileById(fileId) → { success: boolean, error?: string }` — menghapus (trash) file Drive.
  - `function extractDriveFileId(urlOrId) → string` — mengekstrak ID dari URL Drive atau mengembalikan input bila sudah berupa ID.

- [ ] **Step 1: Tambah helper di DriveOps.js**

```js
function extractDriveFileId(urlOrId) {
  if (!urlOrId) return '';
  let s = String(urlOrId);
  let m = s.match(/\/file\/d\/([\w-]+)/);       // https://drive.google.com/file/d/<ID>/view
  if (m) return m[1];
  m = s.match(/[-\w]{25,}/);                      // fallback: pola ID standalone/thumbnail
  return m ? m[0] : '';
}

function deleteDriveFileById(fileId) {
  try {
    if (!fileId) return { success: true };
    DriveApp.getFileById(fileId).setTrashed(true);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
```

- [ ] **Step 2: Validasi syntax**

Run: `node --check src/DriveOps.js`
Expected: output kosong (sukses), tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add src/DriveOps.js
git commit -m "feat: tambah helper hapus file drive & ekstraksi fileId"
```

---

### Task 2: Perluas `editDailyTransaction` untuk upload & hapus foto (backend)

**Files:**
- Modify: `src/SpreadsheetOps.js:548-650` (`editDailyTransaction`)

**Interfaces:**
- Consumes: `uploadImageToDrive(base64, filename, subfolder) → { success, fileUrl, fileId }` (DriveOps.js), `deleteDriveFileById(fileId)`, `extractDriveFileId(urlOrId)` (Task 1).
- Produces: payload `editDailyTransaction` kini menerima field opsional `foto_odo_awal` (base64), `foto_odo_awal_name` (string), `foto_odo_akhir` (base64), `foto_odo_akhir_name` (string).

- [ ] **Step 1: Tambah lookup header foto di awal fungsi**

Di dalam `editDailyTransaction`, tepat setelah deklarasi `idxStamp` (line 566), tambahkan:

```js
    const idxFotoAwal = headers.indexOf('foto_odo_awal');
    const idxFotoAkhir = headers.indexOf('foto_odo_akhir');
```

- [ ] **Step 2: Tambah blok upload & hapus foto sebelum return**

Di dalam `editDailyTransaction`, tepat setelah blok `if (isFlazz) { autoCreateFlazzUsage... }` (line 641-644) dan **sebelum** `return { success: true, ... }` (line 646), sisipkan:

```js
    // Ganti foto odometer awal jika ada file baru
    if (payload.foto_odo_awal && idxFotoAwal > -1) {
      const up = uploadImageToDrive(payload.foto_odo_awal, payload.foto_odo_awal_name || 'odo_awal.jpg', 'KM_Awal');
      if (!up.success) return { success: false, msg: 'Upload foto odometer awal gagal: ' + up.error };
      const oldVal = sheet.getRange(rowIndex, idxFotoAwal + 1).getValue();
      const oldId = extractDriveFileId(oldVal);
      if (oldId) deleteDriveFileById(oldId);
      sheet.getRange(rowIndex, idxFotoAwal + 1).setValue(up.fileUrl);
    }
    // Ganti foto odometer akhir jika ada file baru
    if (payload.foto_odo_akhir && idxFotoAkhir > -1) {
      const up = uploadImageToDrive(payload.foto_odo_akhir, payload.foto_odo_akhir_name || 'odo_akhir.jpg', 'KM_Akhir');
      if (!up.success) return { success: false, msg: 'Upload foto odometer akhir gagal: ' + up.error };
      const oldVal = sheet.getRange(rowIndex, idxFotoAkhir + 1).getValue();
      const oldId = extractDriveFileId(oldVal);
      if (oldId) deleteDriveFileById(oldId);
      sheet.getRange(rowIndex, idxFotoAkhir + 1).setValue(up.fileUrl);
    }
```

- [ ] **Step 3: Validasi syntax**

Run: `node --check src/SpreadsheetOps.js`
Expected: output kosong (sukses), tidak ada error.

- [ ] **Step 4: Commit**

```bash
git add src/SpreadsheetOps.js
git commit -m "feat: dukung upload & hapus foto odometer saat edit transaksi"
```

---

### Task 3: Tambah input foto + preview di modal edit (frontend HTML)

**Files:**
- Modify: `src/Index.html:992-1035` (`#modal-edit-daily`)

**Interfaces:**
- Produces: elemen `ed_foto_odo_awal`, `ed_preview_odo_awal`, `ed_foto_odo_akhir`, `ed_preview_odo_akhir`.

- [ ] **Step 1: Tambah dua seksi foto di modal edit**

Di dalam `#modal-edit-daily`, tepat setelah blok `ed_km_akhir` (line 1006, sebelum `Jenis BBM / Harga`), sisipkan:

```html
              <div class="mb-2">
                <label class="form-label small">Foto Odometer Awal</label>
                <div class="d-flex align-items-center gap-2">
                  <img id="ed_preview_odo_awal" src="" alt="Foto awal" class="rounded border"
                       style="width:80px;height:60px;object-fit:cover;display:none;">
                  <input type="file" id="ed_foto_odo_awal" accept="image/*" class="form-control form-control-sm"
                         onchange="previewEditPhoto(this, 'ed_preview_odo_awal')">
                </div>
              </div>
              <div class="mb-2">
                <label class="form-label small">Foto Odometer Akhir</label>
                <div class="d-flex align-items-center gap-2">
                  <img id="ed_preview_odo_akhir" src="" alt="Foto akhir" class="rounded border"
                       style="width:80px;height:60px;object-fit:cover;display:none;">
                  <input type="file" id="ed_foto_odo_akhir" accept="image/*" class="form-control form-control-sm"
                         onchange="previewEditPhoto(this, 'ed_preview_odo_akhir')">
                </div>
              </div>
```

- [ ] **Step 2: Validasi syntax HTML di script blok**

Run (dari `deploy.ps1`, hanya bagian Index.html):
```powershell
$c2 = Get-Content -Raw "src\Index.html"; $m2 = [regex]::Matches($c2, '(?s)<script[^>]*>(.*?)</script>'); $i=0; foreach($x in $m2){ $i++; $t2="$env:TEMP\idx_$i.js"; Set-Content -Path $t2 -Value $x.Groups[1].Value -Encoding UTF8; node --check $t2; if($?){ "Index.html #$i OK" } }
```
Expected: semua script blok "OK" (tidak ada error syntax JS).

- [ ] **Step 3: Commit**

```bash
git add src/Index.html
git commit -m "feat: tambah input ganti foto odometer di modal edit history"
```

---

### Task 4: Sinkronkan preview & payload di `js.html` (frontend JS)

**Files:**
- Modify: `src/js.html`:
  - Tambah fungsi `previewEditPhoto` (dekat `previewPhoto`, line 374).
  - `editDaily(id)` (line 1081-1118): set preview foto lama.
  - `saveEditDaily(e)` (line 1140-1163): baca & kirim base64 foto baru.

**Interfaces:**
- Consumes: elemen dari Task 3; `getBase64(file)` (sudah ada di js.html:562); `row.foto_odo_awal`, `row.foto_odo_akhir`, `row.foto_odo_awal_thumb`, `row.foto_odo_akhir_thumb` (dari data dashboard).
- Produces: payload `editDailyTransaction` opsional berisi `foto_odo_awal`, `foto_odo_awal_name`, `foto_odo_akhir`, `foto_odo_akhir_name`.

- [ ] **Step 1: Tambah fungsi `previewEditPhoto`**

Tepat setelah `previewPhoto` (line 386, sebelum `validateStep`), sisipkan:

```js
  function previewEditPhoto(input, previewId) {
    if (input.files && input.files[0]) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = document.getElementById(previewId);
        if (img) { img.src = e.target.result; img.style.display = 'block'; }
      };
      reader.readAsDataURL(input.files[0]);
    }
  }
```

- [ ] **Step 2: Set preview foto lama di `editDaily`**

Di dalam `editDaily(id)`, tepat sebelum `new bootstrap.Modal(...).show()` (line 1117), sisipkan:

```js
    var pA = document.getElementById('ed_preview_odo_awal');
    if (pA) {
      if (row.foto_odo_awal) { pA.src = row.foto_odo_awal_thumb || row.foto_odo_awal; pA.style.display = 'block'; }
      else { pA.src = ''; pA.style.display = 'none'; }
      document.getElementById('ed_foto_odo_awal').value = '';
    }
    var pK = document.getElementById('ed_preview_odo_akhir');
    if (pK) {
      if (row.foto_odo_akhir) { pK.src = row.foto_odo_akhir_thumb || row.foto_odo_akhir; pK.style.display = 'block'; }
      else { pK.src = ''; pK.style.display = 'none'; }
      document.getElementById('ed_foto_odo_akhir').value = '';
    }
```

- [ ] **Step 3: Ubah `saveEditDaily` jadi async & kirim base64 foto**

Ganti seluruh fungsi `saveEditDaily(e)` (baris 1140-1163) dengan:

```js
  async function saveEditDaily(e){
    e.preventDefault();
    let payload = {
      transaction_id: document.getElementById('ed_trx').value,
      nama_supir: document.getElementById('ed_nama_supir').value,
      km_awal: document.getElementById('ed_km_awal').value,
      km_akhir: document.getElementById('ed_km_akhir').value,
      biaya_bbm: document.getElementById('ed_biaya').value,
      biaya_toll: document.getElementById('ed_biaya_toll') ? document.getElementById('ed_biaya_toll').value : 0,
      liter_bbm: document.getElementById('ed_liter').value,
      metode_pembayaran: document.getElementById('ed_metode').value,
      flazz_card_id: document.getElementById('ed_metode').value === 'FLAZZ' ? document.getElementById('ed_flazz_card_id').value : ''
    };
    let fAwal = document.getElementById('ed_foto_odo_awal');
    if (fAwal && fAwal.files && fAwal.files[0]) {
      payload.foto_odo_awal = await getBase64(fAwal.files[0]);
      payload.foto_odo_awal_name = fAwal.files[0].name;
    }
    let fAkhir = document.getElementById('ed_foto_odo_akhir');
    if (fAkhir && fAkhir.files && fAkhir.files[0]) {
      payload.foto_odo_akhir = await getBase64(fAkhir.files[0]);
      payload.foto_odo_akhir_name = fAkhir.files[0].name;
    }
    google.script.run.withSuccessHandler(res => {
      if(res.success){ 
         showToast(res.msg, 'success'); 
         bootstrap.Modal.getInstance(document.getElementById('modal-edit-daily')).hide(); 
         if (typeof flazzDataCache !== 'undefined') flazzDataCache = null; // Flush cache
         loadDashboard();
         if (typeof loadFlazzDataWrapper === 'function') loadFlazzDataWrapper(true);
      }
      else showToast(res.msg, 'error');
    }).apiEditDailyTransaction(payload);
  }
```

- [ ] **Step 4: Validasi syntax**

Run (dari root):
```powershell
$c = Get-Content -Raw "src\js.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\js_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "js.html OK" }
```
Expected: `js.html OK` (tidak ada error syntax).

- [ ] **Step 5: Commit**

```bash
git add src/js.html
git commit -m "feat: sinkronkan preview & kirim foto odometer baru saat edit history"
```

---

### Task 5: Verifikasi penuh, commit, push & deploy (Ops)

**Files:**
- Run seluruh cek syntax dari `deploy.ps1`.

**Interfaces:**
- Consumes: seluruh perubahan Task 1-4.

- [ ] **Step 1: Jalankan verifikasi syntax lengkap**

Run:
```powershell
$c = Get-Content -Raw "src\js.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\js_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "js.html OK" }
$c2 = Get-Content -Raw "src\Index.html"; $m2 = [regex]::Matches($c2, '(?s)<script[^>]*>(.*?)</script>'); $i=0; foreach($x in $m2){ $i++; $t2="$env:TEMP\idx_$i.js"; Set-Content -Path $t2 -Value $x.Groups[1].Value -Encoding UTF8; node --check $t2; if($?){ "Index.html #$i OK" } }
node --check src/Code.js; if($?){ "Code.js OK" }
node --check src/SpreadsheetOps.js; if($?){ "SpreadsheetOps.js OK" }
node --check src/DriveOps.js; if($?){ "DriveOps.js OK" }
```
Expected: semua "OK", tidak ada error.

- [ ] **Step 2: Stage & commit semua file src yang berubah**

```bash
git add src/
git commit -m "feat: ganti foto & km odometer saat edit history laporan"
```
> Catatan: file `src/` yang sudah termodifikasi sejak sebelumnya (Code.js, DatabaseSetup.js, FlazzOps.js, FlazzPages.html, FlazzScript.html, js.html, Index.html, JalurOps.js, JalurPages.html, JalurScript.html, SpreadsheetOps.js, README.md) ikut ter-stage karena sudah ada di working tree. Jangan commit file scratch (`apply_jalur.py`, `deploy.ps1`, `scratch_head_spreadsheetops.js`, `src/debug.js`, `temp.js`) — tambahkan ke `.gitignore` atau biarkan untracked.

- [ ] **Step 3: Push ke remote**

```bash
git push origin feature/autocomplete-driver
```
Expected: push sukses ke `https://github.com/sndsupport/Monitoring-BBM-.git`.

- [ ] **Step 4: Deploy via clasp (dari direktori src/)**

Run (workdir = `src`):
```powershell
clasp push -f
clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF -d "Deploy Edit Foto Odometer"
```
Expected: `clasp push` berhasil push semua file; `clasp deploy` mengembalikan versi deployment baru (link web tetap sama).

- [ ] **Step 5: Konfirmasi deployment**

Run: `clasp deployments`
Expected: daftar deployment menampilkan ID yang sama (`AKfycbx...`) dengan versi terbaru.
