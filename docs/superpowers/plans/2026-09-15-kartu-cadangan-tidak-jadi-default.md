# Kartu Cadangan Tidak Jadi Default Supir Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kartu Flazz CADANGAN (bebas, tanpa pemilik default) yang dipakai sementara dalam sebuah jalur oleh seorang supir TIDAK menjadi supir tersebut sebagai `default_driver_id` — baik setelah pembuatan jalur, laporan, maupun rekonsiliasi.

**Architecture:** Pisahkan SEMANTIK dua kolom `Flazz_Card` yang saat ini tergabung di satu field form kartu: `driver_id` (pemegang sementara, dikelola alur penggunaan/rekonsiliasi) vs `default_driver_id` (pemilik tetap, hanya berubah lewat intent eksplisit di form master). Tiga senjata: (1) form Edit Kartu tidak lagi mengisi dropdown dengan pemegang sementara; (2) server menolak mengubah default (dan tidak menimpa pemegang) saat kartu berstatus `SEDANG_DIGUNAKAN`; (3) backfill `setupDatabase` diperketat. Rekon (`saveFlazzReconUnlocked` baris 971 — pulihkan `driver_id` ke default) TIDAK diubah; akar bug bukan di sana.

**Tech Stack:** Google Apps Script (V8), Google Sheets sebagai DB, Bootstrap 5 (UI card form di `FlazzPages.html`).

## Global Constraints

- File yang boleh berubah: `src/FlazzScript.html`, `src/FlazzPages.html`, `src/FlazzOps.js`, `src/DatabaseSetup.js`, `src/Config.gs`, `src/TestRunner.js`. TIDAK ada perubahan schema sheet (`Flazz_Card` tetap punya 2 kolom `driver_id` + `default_driver_id`).
- TIDAK mengubah isi `autoCreateFlazzUsage` (SpreadsheetOps.js) maupun `saveFlazzReconUnlocked` (FlazzOps.js:873-982) — pemegang sementara & pemulihan ke default TETAP seperti sekarang.
- File UI berubah (`FlazzScript.html`, `FlazzPages.html`) → WAJIB naikkan `PAGE_VER` di `src/Config.gs` (cache `doGet` key `page:<PAGE_VER>`, TTL 6 jam).
- Verifikasi sintaks: `node --check <file.js>`; file `.gs` (Config.gs) harus disalin dulu ke `.js` di temp karena `node --check` tidak mengenali ekstensi `.gs`. Blok `<script>` di `.html` diekstrak lalu di-`node --check` (pola seperti plan 2026-09-14).
- Test GAS penuh (`__runAllTests`) dijalankan dari Apps Script editor; TIDAK ada test framework lokal.
- Aplikasi SEDANG DIPAKAI: jangan ubah alur login/simpan lain; deploy via `deploy.ps1` (git add/commit/push master → `clasp push -f` → `clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF`). Jangan commit file untracked `.opencode/`, `deploy.ps1`, `docs/superpowers/plans/*`.
- Gaya kode: `var`/`const` sesuai file sekitarnya, single quote, komentar Bahasa Indonesia.

---

### Task 1: Form Edit Kartu — dropdown hanya berisi supir DEFAULT, bukan pemegang sementara

**Files:**
- Modify: `src/FlazzScript.html:987`
- Modify: `src/FlazzPages.html:42-48` (label + hint, klarifikasi semantik)

**Interfaces:**
- Consumes: `card.default_driver_id` (dari `getFlazzCards`, FlazzOps.js:149) — string nama supir, kosong untuk kartu bebas.
- Produces: tidak ada API baru.

- [ ] **Step 1: Baca `src/FlazzScript.html:970-992`** (`editFlazzCard`) — konfirmasi baris prefill dropdown supir.

- [ ] **Step 2: Ganti prefill dropdown** — `src/FlazzScript.html:987` dari:

```javascript
  document.getElementById('f_driver_id').value = card.default_driver_id || card.driver_id || '';
```

menjadi:

```javascript
  document.getElementById('f_driver_id').value = card.default_driver_id || '';
```

(Hapus `|| card.driver_id`. Kartu bebas/cadangan — yang `default_driver_id`-nya kosong — akan menampilkan "-- Tidak Ada / Kartu Bebas --", sehingga menekan Simpan tanpa mengedit field itu TIDAK lagi mengikat pemegang sementara sebagai default.)

- [ ] **Step 3: Perjelas label form** — `src/FlazzPages.html:42-47` ganti blok:

```html
          <div class='mb-3'>
            <label class='form-label text-muted small fw-bold'>Supir Pemegang (Default)</label>
            <select id='f_driver_id' class='form-select'>
               <option value="">-- Tidak Ada / Kartu Bebas --</option>
            </select>
            <small class="text-muted" style="font-size:0.75rem">Kosongkan jika ini kartu cadangan atau bisa dipakai siapa saja.</small>
          </div>
```

menjadi:

```html
          <div class='mb-3'>
            <label class='form-label text-muted small fw-bold'>Supir Default (Pemilik Tetap)</label>
            <select id='f_driver_id' class='form-select'>
               <option value="">-- Tidak Ada / Kartu Bebas --</option>
            </select>
            <small class="text-muted" style="font-size:0.75rem">Kosongkan jika ini kartu cadangan atau bisa dipakai siapa saja. Pemegang sementara saat kartu dipakai dikelola otomatis oleh alur jalur/rekonsiliasi, bukan field ini.</small>
          </div>
```

- [ ] **Step 4: Verifikasi sintaks** — ekstrak blok `<script>` `FlazzScript.html`, simpan ke `%TEMP%` sebagai `.js`, lalu:

Run: `node --check "%TEMP%\jalur_script_check.js"` (nama file terserah, mis. `flazzscript_check.js`)
Expected: tidak ada output (exit 0). Juga cek `FlazzPages.html` tidak punya JS inline yang berubah.

- [ ] **Step 5: Commit**

```bash
git add src/FlazzScript.html src/FlazzPages.html
git commit -m "fix(flazz): dropdown form kartu hanya isi supir default - pemegang sementara tidak jadi default"
```

---

### Task 2: Server guard — default tidak berubah & pemegang tidak tertimpa saat kartu SEDANG_DIGUNAKAN

**Files:**
- Modify: `src/FlazzOps.js` — sekitar baris 209-229 (`saveFlazzCard`/update) + definisi helper baru
- Modify: `src/TestRunner.js` — tambah `__runFlazzDefaultGuardTests` + daftarkan di `__runAllTests` (baris 245)

**Interfaces:**
- Consumes: `findFlazzCardRow(sheet, id)` (FlazzOps.js:50) — mengembalikan `{ rowIndex, row, colIdx }`; `getFlazzCardColIdx` colIdx `DRIVER`, `DEFAULT_DRIVER`, `STATUS` (FlazzOps.js:32-46).
- Produces: `flazzAllowDefaultChange(curStatus, curDefault, newDefault)` — fungsi murni `boolean`, dipakai oleh `saveFlazzCard` update dan diuji di `TestRunner`.

- [ ] **Step 1: Tulis test gagal** — tambahkan fungsi baru di `src/TestRunner.js` (sebelum `__runAllTests`, baris ~236):

```javascript
// Kebijakan perubahan supir default kartu (guard pure):
// kartu yang sedang dipakai (SEDANG_DIGUNAKAN) TIDAK boleh diubah default-nya,
// sehingga pemegang sementara tidak bisa 'nempel' jadi default via form/edit.
function __runFlazzDefaultGuardTests() {
  var results = [];
  // Skenario bug: kartu cadangan dipakai sementara (default kosong) - mencoba set supir -> harus DITOLAK
  results.push(__expectEqual(flazzAllowDefaultChange('SEDANG_DIGUNAKAN', '', 'Yudiman'), false, 'kartu dipakai, default kosong, set supir -> tolak'));
  results.push(__expectEqual(flazzAllowDefaultChange('SEDANG_DIGUNAKAN', '', 'Andi'), false, 'kartu dipakai, default kosong, set supir lain -> tolak'));
  // Tidak ada perubahan nilai -> diizinkan (no-op, tidak menyentuh apa pun)
  results.push(__expectEqual(flazzAllowDefaultChange('SEDANG_DIGUNAKAN', '', ''), true, 'kartu dipakai, default kosong, simpan tanpa ubah -> izinkan'));
  results.push(__expectEqual(flazzAllowDefaultChange('SEDANG_DIGUNAKAN', 'Yudiman', 'Yudiman'), true, 'kartu dipakai, default sama -> izinkan'));
  // Kartu BEBAS (tidak dipakai) -> bebas mengubah default
  results.push(__expectEqual(flazzAllowDefaultChange('TERSEDIA', '', 'Yudiman'), true, 'kartu tersedia, default kosong, set supir -> izinkan'));
  results.push(__expectEqual(flazzAllowDefaultChange('TERSEDIA', 'Andi', 'Yudiman'), true, 'kartu tersedia, ganti default -> izinkan'));
  // Sheet lama tanpa status (string kosong) -> tidak diblokir
  results.push(__expectEqual(flazzAllowDefaultChange('', '', 'Yudiman'), true, 'tanpa status -> izinkan'));
  return __summarize(results);
}
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: dari Apps Script editor, `__runAllTests()` (belum didaftarkan, jadi gagal karena `flazzAllowDefaultChange` belum ada / ReferenceError saat pertama kali `__runFlazzDefaultGuardTests` dipanggil).
Expected: test baris guard-nya merah/error; `__runAllTests` belum memanggil fungsi ini (langkah 4), jadi pertama kali jalankan `__runFlazzDefaultGuardTests()` langsung.

- [ ] **Step 3: Implementasi helper + guard** — `src/FlazzOps.js`, tambahkan definisi helper tepat SETELAH `getFlazzCardColIdx` (baris ~47):

```javascript
// Kebijakan perubahan supir default kartu (pure, diuji di TestRunner).
// Kartu yang sedang dipakai TIDAK boleh diubah default-nya; pemegang sementara
// (driver_id) tidak boleh menjadi default tanpa intent eksplisit dari form master.
function flazzAllowDefaultChange(curStatus, curDefault, newDefault) {
  const status = String(curStatus || '');
  if (status === 'SEDANG_DIGUNAKAN') {
    return String(newDefault || '') === String(curDefault || '');
  }
  return true;
}
```

Lalu ubah blok update `saveFlazzCard` (`src/FlazzOps.js:209-223`) dari:

```javascript
    if (cardData.id) {
      // Update existing
      const found = findFlazzCardRow(sheet, cardData.id);
      if (!found) throw new Error('Kartu tidak ditemukan.');
      assertFlazzAccess(userInfo, found.row[found.colIdx.BRANCH]);
      const r = found.rowIndex, c = colIdx;
      sheet.getRange(r, c.CARD_NUMBER + 1).setValue(cardNumber);
      if (c.CARD_NAME !== undefined) sheet.getRange(r, c.CARD_NAME + 1).setValue(cardData.card_name || '');
      sheet.getRange(r, c.CARD_TYPE + 1).setValue(cardData.card_type);
      if (c.CARD_ROLE !== undefined) sheet.getRange(r, c.CARD_ROLE + 1).setValue(cardData.card_role || 'CADANGAN');
      sheet.getRange(r, c.BRANCH + 1).setValue(cardData.branch_id);
      sheet.getRange(r, c.DRIVER + 1).setValue(cardData.driver_id || '');
      if (c.DEFAULT_DRIVER !== undefined) sheet.getRange(r, c.DEFAULT_DRIVER + 1).setValue(cardData.driver_id || '');
      sheet.getRange(r, c.NOTES + 1).setValue(cardData.notes || '');
      sheet.getRange(r, c.UPDATED + 1).setValue(now);
```

menjadi:

```javascript
    if (cardData.id) {
      // Update existing
      const found = findFlazzCardRow(sheet, cardData.id);
      if (!found) throw new Error('Kartu tidak ditemukan.');
      assertFlazzAccess(userInfo, found.row[found.colIdx.BRANCH]);
      const r = found.rowIndex, c = colIdx;
      const curStatus = String(found.row[found.colIdx.STATUS] || '');
      const curDefault = (c.DEFAULT_DRIVER !== undefined) ? String(found.row[c.DEFAULT_DRIVER] || '') : '';
      const newDefault = String(cardData.driver_id || '');
      if (!flazzAllowDefaultChange(curStatus, curDefault, newDefault)) {
        throw new Error('Kartu masih dipakai (SEDANG_DIGUNAKAN). Kembalikan kartu dahulu sebelum mengubah supir default.');
      }
      sheet.getRange(r, c.CARD_NUMBER + 1).setValue(cardNumber);
      if (c.CARD_NAME !== undefined) sheet.getRange(r, c.CARD_NAME + 1).setValue(cardData.card_name || '');
      sheet.getRange(r, c.CARD_TYPE + 1).setValue(cardData.card_type);
      if (c.CARD_ROLE !== undefined) sheet.getRange(r, c.CARD_ROLE + 1).setValue(cardData.card_role || 'CADANGAN');
      sheet.getRange(r, c.BRANCH + 1).setValue(cardData.branch_id);
      // Pemegang (DRIVER) & default dikelola alur penggunaan kartu selama kartu dipakai;
      // dari form hanya ditulis saat kartu BEBAS (tidak SEDANG_DIGUNAKAN).
      if (curStatus !== 'SEDANG_DIGUNAKAN') {
        sheet.getRange(r, c.DRIVER + 1).setValue(cardData.driver_id || '');
        if (c.DEFAULT_DRIVER !== undefined) sheet.getRange(r, c.DEFAULT_DRIVER + 1).setValue(cardData.driver_id || '');
      }
      sheet.getRange(r, c.NOTES + 1).setValue(cardData.notes || '');
      sheet.getRange(r, c.UPDATED + 1).setValue(now);
```

- [ ] **Step 4: Daftarkan test di `__runAllTests`** — `src/TestRunner.js:245`, tambah baris setelah `r = __runCacheParsingTests();`:

```javascript
  r = __runFlazzDefaultGuardTests();
```

- [ ] **Step 5: Jalankan test sampai hijau**

Run: dari Apps Script editor panggil `__runFlazzDefaultGuardTests()` lalu `__runAllTests()`.
Expected: `flazzAllowDefaultChange` 7 kasus PASS; `__runAllTests` selesai "==== ALL TESTS DONE ====" tanpa merah.

- [ ] **Step 6: Verifikasi sintaks**

Run: `node --check src/FlazzOps.js` dan ekstrak blok `<script>` `TestRunner.js` (sudah file `.js`, langsung):
```bash
node --check src/FlazzOps.js
node --check src/TestRunner.js
```
Expected: exit 0 untuk keduanya.

- [ ] **Step 7: Commit**

```bash
git add src/FlazzOps.js src/TestRunner.js
git commit -m "fix(flazz): blok ubah supir default saat kartu SEDANG_DIGUNAKAN - pemegang sementara tak jadi default"
```

---

### Task 3: Perketat backfill `setupDatabase` — hanya isi default saat kartu TERSEDIA

**Files:**
- Modify: `src/DatabaseSetup.js:93-96`

**Interfaces:**
- Consumes: kolom `Flazz_Card` `default_driver_id`, `driver_id`, `status` (DatabaseSetup.js:39) — momentum one-time migration, jarang dijalankan manual.
- Produces: tidak ada API baru; backfill lebih konservatif + log.

- [ ] **Step 1: Baca `src/DatabaseSetup.js:84-99`** — konfirmasi blok backfill di dalam `setupDatabase()` (TIDAK pernah dipanggil otomatis oleh kode aplikasi; hanya via editor/setup manual, tapi tetap dikunci).

- [ ] **Step 2: Ganti kondisi backfill** — dari:

```javascript
      for (let i = 1; i < fData.length; i++) {
        if (String(fData[i][iDefault] || '') === '' && String(fData[i][iStatus]) !== 'SEDANG_DIGUNAKAN') {
          fCard.getRange(i + 1, iDefault + 1).setValue(fData[i][iDriver] || '');
        }
      }
```

menjadi:

```javascript
      for (let i = 1; i < fData.length; i++) {
        const backfillVal = String(fData[i][iDriver] || '');
        if (String(fData[i][iDefault] || '') === '' && String(fData[i][iStatus]) === 'TERSEDIA' && backfillVal) {
          Logger.log('setupDatabase backfill default_driver_id Flazz_Card baris ' + (i + 1) + ' -> ' + backfillVal);
          fCard.getRange(i + 1, iDefault + 1).setValue(backfillVal);
        }
      }
```

(Syarat diperketat: status harus `TERSEDIA` — bukan sekadar "≠ SEDANG_DIGUNAKAN" — dan `driver_id` tidak kosong. Kartu yang statusnya bukan TERSEDIA (mis. `BELUM_DIPAKAI`, `SEDANG_DIGUNAKAN`, `NONAKTIF`) tidak disentuh.)

- [ ] **Step 3: Verifikasi sintaks**

Run: salin `src/DatabaseSetup.js` sementara? Sudah `.js` — langsung `node --check src/DatabaseSetup.js`.
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/DatabaseSetup.js
git commit -m "fix(db): backfill default_driver_id hanya untuk kartu status TERSEDIA"
```

---

### Task 4: Bump PAGE_VER, verifikasi akhir, deploy

**Files:**
- Modify: `src/Config.gs:10`

**Interfaces:**
- Consumes: `PAGE_VER` — key `page:<PAGE_VER>` di cache `doGet` (TTL 6 jam). Wajib naik agar perubahan `FlazzScript.html` & `FlazzPages.html` terkirim ke pengguna.
- Produces: rilis ke deployment `AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF`.

- [ ] **Step 1: Naikkan `PAGE_VER`** — `src/Config.gs:10` dari `var PAGE_VER = '20260915v2';` menjadi `var PAGE_VER = '20260915v3';`.

- [ ] **Step 2: Verifikasi sintaks semua file berubah**

Run: `node --check src/Config.gs` gagal karena ekstensi — salin dulu ke temp lalu cek, plus semua file JS:
```bash
Copy-Item src/Config.gs "$env:TEMP\config_check.js"
node --check "$env:TEMP\config_check.js"
node --check src/FlazzOps.js
node --check src/TestRunner.js
node --check src/DatabaseSetup.js
```
Expected: exit 0 semua.

- [ ] **Step 3: Uji skenario-bug manual di deployment baru** (setelah deploy):

1. Buat kartu cadangan (default kosong) di menu Flazz.
2. Buat Jalur untuk supir yang memakai kartu CADANGAN itu (kartu utama supir saldo habis).
3. Input laporan + selesaikan rekonsiliasi kartu tsb.
4. Buka sheet `Flazz_Card`: pastikan kartu cadangan menampilkan `driver_id` kosong (dikembalikan rekon) dan **`default_driver_id` TETAP kosong**.
   Expected: `default_driver_id` kosong — bug tidak terulang.
5. Buka Edit Kartu kartu cadangan tsb: dropdown supir harus "-- Tidak Ada / Kartu Bebas --" (bukan nama supir), Simpan dengan mengubah catatan saja: `default_driver_id` tetap kosong.
6. Coba akses Edit Kartu saat kartu berstatus SEDANG_DIGUNAKAN dengan mengubah supir default: Simpan harus ditolak, toast error "Kartu masih dipakai (SEDANG_DIGUNAKAN)...".

- [ ] **Step 4: Commit + push + deploy**

```bash
git add src/Config.gs
git commit -m "chore(version): PAGE_VER 20260915v3 - fix kartu cadangan tidak menjadi default"
git push origin master
# workdir: src
clasp push -f
clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF -d "fix(flazz): kartu cadangan tidak jadi default - prefill form + guard SEDANG_DIGUNAKAN + backfill TERSEDIA"
```

- [ ] **Step 5: Verifikasi pasca-deploy** — buka URL deployment di incognito, login sebagai PIC cabang, jalankan Step 3 (skenario-bug) sekali lagi di versi rilis.

---

## Self-Review

**Spec coverage:**
- Bug "kartu non-default jadi default setelah rekon" → Task 1 (prefill), Task 2 (guard server), Task 3 (backfill) menutup SEMUA penulis `default_driver_id` yang ada (FlazzOps.js:221, DatabaseSetup.js:95; create di FlazzOps.js:241 tetap intent eksplisit).
- Pemegang sementara tidak tertimpa → guard `curStatus !== 'SEDANG_DIGUNAKAN'` di Task 2.
- Konvensi repo (PAGE_VER, node --check, deploy.ps1, tat19200000 gaya) → Task 4 + Global Constraints.

**Placeholder scan:** Tidak ada TBD/TODO; semua langkah punya kode/command eksplisit.

**Type consistency:** `flazzAllowDefaultChange(curStatus, curDefault, newDefault)` → `boolean` konsisten di helper (Task 2 Step 3), update `saveFlazzCard`, dan test (Task 2 Step 1). `card.default_driver_id` konsisten di Task 1. `page:<PAGE_VER>` konsisten dengan Config.gs:10.