# Top Up & Rekonsiliasi Flazz untuk Semua Role (PIC CABANG) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuka akses operasional **mencatat Top Up** dan **melakukan Rekonsiliasi** Flazz untuk **PIC CABANG** (create-only, kartu warehouse-nya sendiri) sehingga menu-nya muncul di semua role — edit/hapus tetap SUPERADMIN-only.

**Architecture:** Hapus guard `assertSuperadminOnly` di dua fungsi server `saveFlazzTopUpUnlocked`/`saveFlazzReconUnlocked` — `assertFlazzAccess` yang sudah ada (baris berikutnya) tetap menegakkan scoping cabang. Buka tiga titik navigasi di `js.html` (sidebar, bottom-nav, `switchTab`) dan dua guard form di `FlazzScript.html`. Data dropdown kartu untuk PIC sudah di-scope server-side via `apiGetFlazzDashboardData`, sehingga PIC hanya melihat kartu cabangnya.

**Tech Stack:** Google Apps Script (backend `FlazzOps.js`, frontend `js.html`/`FlazzScript.html`), Google Sheets (database), test suite `TestRunner.js` (`__runAllTests`), README.

## Global Constraints

- Hanya hapus guard untuk **create top up** dan **create rekonsiliasi**. Edit/hapus top up (`editFlazzTopUpUnlocked`, `deleteFlazzTopUpUnlocked`), hapus rekonsiliasi, `saveFlazzUsage` (serah manual), `saveFlazzTol`, dan `deleteFlazzBBMUnlocked` **TIDAK diubah** — tetap `assertSuperadminOnly`.
- `assertFlazzAccess` (FlazzOps.js:107) TIDAK diubah: SUPERADMIN penuh; PIC hanya pada kartu dengan `flazzCardBranch(cardId) === userInfo.cabang`.
- Verifikasi sintaks tiap file `.html` yang diubah: ekstrak blok `<script>` dan jalankan `node --check` (pola `deploy.ps1`). `js.html` punya 1 blok script; `FlazzScript.html` blok index 0 berisi fungsi-fungsi target.
- Commit terpisah per task di branch saat ini (`feat/security-hardening`). Deploy (`clasp push` + `clasp deploy`) TIDAK dilakukan di plan ini — hanya setelah instruksi user saat aplikasi tidak dipakai.
- Konten UI bisa berbahasa Indonesia; jangan menambah komentar baru pada kode.

---

### Task 1: Backend — buka akses create top up & rekonsiliasi untuk PIC

**Files:**
- Modify: `src/FlazzOps.js:281` (hapus guard `saveFlazzTopUpUnlocked`)
- Modify: `src/FlazzOps.js:826` (hapus guard `saveFlazzReconUnlocked`)

**Interfaces:**
- Consumes: `assertFlazzAccess(userInfo, branchId)` (FlazzOps.js:107) — tetap ada setelah guard dihapus.
- Produces: `saveFlazzTopUpUnlocked(payload)` dan `saveFlazzReconUnlocked(payload)` tidak lagi melempar `assertSuperadminOnly`; untuk PIC, akses dijamin `assertFlazzAccess` (kartu harus sekabang dengan `payload.userInfo.cabang`).

- [ ] **Step 1: Hapus guard SUPERADMIN di `saveFlazzTopUpUnlocked`**

Sebelum (FlazzOps.js:281):
```js
  try {
    assertSuperadminOnly(payload.userInfo, 'mencatat top up Flazz');
    const ss = getDB();
```
Sesudah:
```js
  try {
    const ss = getDB();
```
Catatan: baris `assertFlazzAccess(payload.userInfo, flazzCardBranch(payload.card_id));` (FlazzOps.js:287) **tetap**.

- [ ] **Step 2: Hapus guard SUPERADMIN di `saveFlazzReconUnlocked`**

Sebelum (FlazzOps.js:826):
```js
  try {
    assertSuperadminOnly(payload.userInfo, 'melakukan rekonsiliasi Flazz');
    const ss = getDB();
```
Sesudah:
```js
  try {
    const ss = getDB();
```
Catatan: baris `assertFlazzAccess(payload.userInfo, flazzCardBranch(payload.card_id));` (FlazzOps.js:832) **tetap**.

- [ ] **Step 3: Verifikasi sintaks**

```powershell
node --check .\src\FlazzOps.js; if($?){ "FlazzOps.js OK" }
```
Expected: `FlazzOps.js OK` tanpa error.

- [ ] **Step 4: Pastikan tidak ada guard SUPERADMIN tersisa di kedua fungsi**

```powershell
rg -n "assertSuperadminOnly" .\src\FlazzOps.js
```
Expected: baris 334 (edit top up), 403 (hapus top up), 451 (tol), 510 (edit tol), 578 (hapus tol), 1179 (serah manual), 1620 (hapus BBM Flazz) masih ada; baris 281 & 826 sudah hilang.

- [ ] **Step 5: Commit**

```bash
git add src/FlazzOps.js
git commit -m "feat(flazz): buka akses create top up & rekonsiliasi untuk PIC (scoping cabang via assertFlazzAccess)"
```

---

### Task 2: Frontend navigasi — tampilkan menu Top Up & Rekonsiliasi untuk semua role

**Files:**
- Modify: `src/js.html:188-191` (hapus penyembunyian sidebar)
- Modify: `src/js.html:438-440` (hapus filter bottom-nav)
- Modify: `src/js.html:524-526` (hapus guard `switchTab`)

**Interfaces:**
- Consumes: tab `flazz-topup` & `flazz-recon` di sidebar (Index.html:166-171), `BOTTOM_NAV_DRAWERS.flazz` (js.html:427-428), quick-access (js.html:1261-1262).
- Produces: Semua role bisa membuka halaman `flazz-topup` dan `flazz-recon`; quick-access dashboard langsung berfungsi tanpa perubahan.

- [ ] **Step 1: Hapus penyembunyian sidebar untuk PIC**

Sebelum (js.html:188-191, di dalam blok `if (userRole !== 'SUPERADMIN')` setelah sembunyikan tab master):
```js
           let tabFlazzTopup = document.getElementById('tab-flazz-topup');
           if (tabFlazzTopup) tabFlazzTopup.style.display = 'none';
           let tabFlazzRecon = document.getElementById('tab-flazz-recon');
           if (tabFlazzRecon) tabFlazzRecon.style.display = 'none';
         }
```
Sesudah:
```js
         }
```
Catatan: blok penyembunyian tab master (`btnCabang`, `btnBBM`, `btnPengguna`) di atas TETAP.

- [ ] **Step 2: Hapus filter bottom-nav**

Sebelum (js.html:438-440):
```js
    if (key === 'flazz' && userRole !== 'SUPERADMIN') {
      items = items.filter(function(it) { return it.tab !== 'flazz-topup' && it.tab !== 'flazz-recon'; });
    }
```
Sesudah: (baris tersebut dihapus seluruhnya — langsung lanjut ke `drawer.innerHTML = items.map(...)`).

- [ ] **Step 3: Hapus guard `switchTab`**

Sebelum (js.html:524-526):
```js
    if ((tab === 'flazz-topup' || tab === 'flazz-recon') && userRole !== 'SUPERADMIN') {
      showToast('Akses ditolak: hanya SUPERADMIN.', 'error');
      return;
    }
```
Sesudah: (baris tersebut dihapus seluruhnya — langsung lanjut ke sembunyikan halaman).

- [ ] **Step 4: Verifikasi sintaks**

```powershell
$c = Get-Content -Raw "src\js.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\js_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "js.html OK" }
```
Expected: `js.html OK` tanpa error.

- [ ] **Step 5: Commit**

```bash
git add src/js.html
git commit -m "feat(ui): tampilkan menu Top Up & Rekonsiliasi Flazz untuk semua role"
```

---

### Task 3: Frontend form — izinkan PIC menyimpan top up & rekonsiliasi

**Files:**
- Modify: `src/FlazzScript.html:498` (guard `saveFlazzTopUpForm`)
- Modify: `src/FlazzScript.html:545` (guard `saveFlazzReconForm`)

**Interfaces:**
- Consumes: `saveFlazzTopUpForm(e)` (FlazzScript.html:496) & `saveFlazzReconForm(e)` (:543) — payload dikirim ke `apiSaveFlazzTopUp`/`apiSaveFlazzRecon`.
- Produces: PIC dapat menyimpan top up & rekonsiliasi lewat form; `isSuper` (FlazzScript.html:155) dan guard SUPERADMIN pada `editTopUp` (:817), `deleteTopUp` (:831), `deleteRecon` (:911) TIDAK diubah → tombol edit/hapus riwayat tetap disembunyikan & diblokir untuk PIC.

- [ ] **Step 1: Hapus guard di `saveFlazzTopUpForm`**

Sebelum (FlazzScript.html:498):
```js
  e.preventDefault();
  if (typeof userRole !== 'undefined' && userRole !== 'SUPERADMIN') { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
  var tCard = document.getElementById('t_card_id');
```
Sesudah:
```js
  e.preventDefault();
  var tCard = document.getElementById('t_card_id');
```

- [ ] **Step 2: Hapus guard di `saveFlazzReconForm`**

Sebelum (FlazzScript.html:545):
```js
  e.preventDefault();
  if (typeof userRole !== 'undefined' && userRole !== 'SUPERADMIN') { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }
  let cardId = document.getElementById('r_card_id').value;
```
Sesudah:
```js
  e.preventDefault();
  let cardId = document.getElementById('r_card_id').value;
```

- [ ] **Step 3: Verifikasi sintaks**

```powershell
$c = Get-Content -Raw "src\FlazzScript.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\flazz_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "FlazzScript.html OK" }
```
Expected: `FlazzScript.html OK` tanpa error.

- [ ] **Step 4: Pastikan guard SUPERADMIN lain tetap ada**

```powershell
rg -n "hanya SUPERADMIN" .\src\FlazzScript.html
```
Expected: masih ada 9 kemunculan (editTopUp, deleteTopUp, deleteRecon, dan baris yang tidak terkait create topup/recon) — baris 498 & 545 sudah hilang.

- [ ] **Step 5: Commit**

```bash
git add src/FlazzScript.html
git commit -m "feat(ui): izinkan PIC menyimpan top up & rekonsiliasi Flazz"
```

---

### Task 4: Tes — perbarui kontrak keamanan top up PIC

**Files:**
- Modify: `src/TestRunner.js:141`

**Interfaces:**
- Consumes: `__expectDenied(call, needle, label)` (TestRunner.js:101) — menerima Error atau `{success:false}` yang pesannya mengandung `needle`.
- Produces: Assert mencerminkan kontrak baru: PIC tanpa kartu ditolak oleh **scoping cabang** (`assertFlazzAccess`), bukan oleh `assertSuperadminOnly`.

- [ ] **Step 1: Ubah baris 141**

Sebelum (TestRunner.js:141):
```js
  results.push(__expectDenied(function() { return saveFlazzTopUpUnlocked({ userInfo: pic }); }, 'SUPERADMIN', 'PIC top up Flazz -> ditolak'));
```
Sesudah:
```js
  results.push(__expectDenied(function() { return saveFlazzTopUpUnlocked({ userInfo: pic }); }, 'Akses ditolak: Anda hanya dapat mengelola kartu warehouse', 'PIC top up tanpa kartu -> ditolak scoping cabang'));
```
Catatan: dengan payload kosong, `flazzCardBranch(undefined)` mengembalikan `''`, lalu `assertFlazzAccess` membandingkan `''` dengan `pic.cabang='CBG-JKT'` → melempar `Akses ditolak: Anda hanya dapat mengelola kartu warehouse CBG-JKT.` Assert lain di task ini (`deleteFlazzTopUpUnlocked` → SUPERADMIN) tetap.

- [ ] **Step 2: Verifikasi seluruh test suite konsisten**

```powershell
rg -n "top up Flazz|saveFlazzTopUpUnlocked" .\src\TestRunner.js
```
Expected: hanya 1 kemunculan `saveFlazzTopUpUnlocked` (baris 141, dengan needle scoping cabang). Tidak ada `saveFlazzReconUnlocked` yang diuji ditolak.

- [ ] **Step 3: Commit**

```bash
git add src/TestRunner.js
git commit -m "test: kontrak PIC top up = ditolak oleh scoping cabang, bukan SUPERADMIN"
```

---

### Task 5: Dokumentasi — perbarui README

**Files:**
- Modify: `README.md` baris ~14 (paragraf keamanan PIC read-only)

**Interfaces:**
- Consumes: bullet keamanan "PIC CABANG read-only..." (README.md:14).
- Produces: README menyatakan PIC kini dapat mencatat top up & rekonsiliasi cabangnya sendiri; edit/hapus tetap SUPERADMIN.

- [ ] **Step 1: Perbarui bullet keamanan PIC**

Sebelum (README.md:14, ekstrak kalimat terkait):
```
Aksi operasional berikut dikunci **SUPERADMIN** di sisi server (`assertSuperadminOnly`) dan tombolnya disembunyikan untuk PIC: edit/hapus laporan harian, edit/hapus jalur pengiriman, top-up/tol/rekonsiliasi/penyerahan Flazz, hapus BBM dari Flazz, dan util editor destruktif (`cleanupOrphanPhotos`, ...
```
Sesudah:
```
Aksi operasional berikut dikunci **SUPERADMIN** di sisi server (`assertSuperadminOnly`) dan tombolnya disembunyikan untuk PIC: edit/hapus laporan harian, edit/hapus jalur pengiriman, edit/hapus top-up, catat tol / penyerahan Flazz manual, hapus rekonsiliasi, hapus BBM dari Flazz, dan util editor destruktif (`cleanupOrphanPhotos`, ...
```
Tambahkan pada paragraf yang sama (atau kalimat baru setelahnya):
```
PIC CABANG kini dapat **mencatat top up** dan **melakukan rekonsiliasi** Flazz untuk kartu warehouse-nya sendiri (create-only; menu Top Up & Rekonsiliasi tampil untuk semua role), tetap di-scope oleh `assertFlazzAccess`.
```
Catatan: ganti juga penyebutan "top-up/rekonsiliasi/penyerahan Flazz" jika ada di diskripsi lain di README (baris 10, 14, 34) agar tidak kontradiktif. Baris 34 (smart warning & tautan Rekonsiliasi) tidak perlu diubah.

- [ ] **Step 2: Pastikan tidak ada kalimat kontradiktif**

```powershell
rg -n "top-up|top up|rekonsiliasi|SUPERADMIN" .\README.md
```
Expected: tidak ada kalimat yang menyatakan top-up/rekonsiliasi sepenuhnya SUPERADMIN-only.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: PIC dapat mencatat top up & rekonsiliasi cabangnya; edit/hapus tetap SUPERADMIN"
```

---

### Task 6: Verifikasi akhir

- [ ] **Step 1: Verifikasi sintaks seluruh file yang diubah**

```powershell
node --check .\src\FlazzOps.js; node --check .\src\TestRunner.js
```
```powershell
$c = Get-Content -Raw "src\js.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\js_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "js.html OK" }
```
```powershell
$c = Get-Content -Raw "src\FlazzScript.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\flazz_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t; if($?){ "FlazzScript.html OK" }
```
Expected: semua output `OK`, tanpa error.

- [ ] **Step 2: Jalankan test suite di Apps Script (`__runAllTests`)**

Deploy/push manual hanya jika user mengizinkan & aplikasi tidak dipakai:
```bash
clasp push -f
```
Buka Apps Script → run `__runAllTests` → Expected: ALL PASS (assert top up PIC kini menggunakan needle scoping cabang).

- [ ] **Step 3: Manual test (SUPERADMIN)**

Top Up & Rekonsiliasi tampil di sidebar/bottom-nav/quick-access; simpan top up & rekonsiliasi berfungsi penuh; tombol edit/hapus tetap ada.

- [ ] **Step 4: Manual test (PIC CABANG)**

1. Login PIC cabang X → menu **Top Up Flazz** & **Rekonsiliasi Flazz** tampil di sidebar desktop, bottom-nav mobile, dan Quick Access dashboard.
2. Form Top Up: dropdown kartu hanya berisi kartu cabang X → simpan berhasil.
3. Form Rekonsiliasi: dropdown kartu hanya kartu cabang X yang `SEDANG_DIGUNAKAN` → simpan berhasil (gate laporan valid tetap berlaku).
4. Tab Riwayat → tombol **Edit/Hapus Top Up** dan **Hapus Rekonsiliasi** tetap tersembunyi; akses langsung `editTopUp`/`deleteRecon` via console tetap ditolak "hanya SUPERADMIN".
5. Menu **Tol** manual & **Serah Kartu** manual tetap terkunci SUPERADMIN (tidak muncul/tetap ditolak).