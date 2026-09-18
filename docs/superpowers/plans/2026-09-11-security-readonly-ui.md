# Security Isolation + PIC Read-Only + Native Dialog & Mobile Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal (3 bagian):**
1. Tutup celah kebocoran data lintas cabang (fungsi data bisa dipanggil langsung via `google.script.run` dengan `role`/`cabang` palsu).
2. Ubah aksi operasional role **PIC CABANG** menjadi read-only (SUPERADMIN-only), kecuali data master (Supir/Kendaraan/Kartu Flazz) tetap bisa edit/hapus.
3. Ganti dialog native browser (`confirm()`, bubble validasi HTML5) menjadi custom UI, dan perbaiki halaman yang terpotong di mobile.

**Cakupan read-only (keputusan user):**
- Tetap bisa PIC: input laporan harian baru (create), membuat jalur pengiriman, CRUD master Supir/Kendaraan/Kartu Flazz (cabang sendiri), semua view cabang sendiri.
- SUPERADMIN-only: edit/hapus laporan, edit/hapus jalur, topup/tol/rekonsiliasi/penyerahan Flazz, hapus BBM dari Flazz, util editor destruktif.
- Label status jalur: badge `Belum Diisi` diganti `Terjadwal` (pilihan user) — berlaku di app dan screenshot.

**Tech Stack:** Google Apps Script (backend), HTML/Bootstrap 5 (frontend), Google Sheets (database). Deploy pakai `clasp` (scriptId `1PqcQpoii2I5f_XAJ4wJBF7ljf46GO7R8YuXYcWHl7cxZ8jeKE6i0LOlJ`, deployment `AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF`).

## Global Constraints

- Semua `requireUser(token)` mengambil role/cabang dari server (SessionAuth.js) — jangan pernah menerima `role`/`cabang` dari parameter caller di fungsi yang ter-expose.
- Helper auth: `assertMasterAccess` (SpreadsheetOps.js:1168), `assertSuperadminOnly` (:1175), `assertOwnWarehouse` (:1181), `assertTransactionAccess` (:1206), `assertFlazzAccess` (FlazzOps.js:107).
- Jalur created by SUPERADMIN harus di-stempel `kode_cabang` dari kendaraan (bukan `userInfo.cabang` yang `''`), agar gate laporan `BELUM_DIISI` tetap cocok.
- Deploy TIDAK dilakukan sementara aplikasi sedang digunakan; tunggu instruksi user (jam non-pakai).
- Verifikasi sintaks tiap task: `node --check` pada file `.js` dan konten `<script>` hasil ekstrak dari `.html` (pola `deploy.ps1`).
- Commit terpisah per bagian, branch `feat/security-hardening`; push + `clasp push` + `clasp deploy` setelah tiap bagian yang siap.

---

### Task 1: Tutup celah isolasi cabang (Bagian A)

**Files:**
- Modify: `src/SpreadsheetOps.js`, `src/FlazzOps.js`, `src/JalurOps.js`, `src/Code.js`

**Interfaces:**
- Consumes: `requireUser(token)`, helper auth di atas.
- Produces: Fungsi pembaca tidak lagi menerima param `role`/`cabang` dari caller; pemalsuan akses langsung via `google.script.run` batal.

- [ ] **Step 1: Refactor reader — derivasi `role/cabang` dari token di fungsi yang sama**
  - `getActiveVehicles(role, userCabang)` SpreadsheetOps.js:61 → `getActiveVehicles(token)`, `var u = requireUser(token)` di dalam.
  - `getPerformaSummary(role, userCabang)` SpreadsheetOps.js:536 → `getPerformaSummary(token)`.
  - `getActiveDrivers(role, userCabang)` SpreadsheetOps.js:1232 → `getActiveDrivers(token)`.
  - `getCabangList()` SpreadsheetOps.js:47 → `getCabangList(token)`, SUPERADMIN-only (tolak non-super).
  - `getAllUsers()` SpreadsheetOps.js:1514 → `getAllUsers(token)`, SUPERADMIN-only.
  - `getActiveBBMForCabang(cabang)` SpreadsheetOps.js:1297 → `getActiveBBMForCabang(token)`.
  - `getFlazzCards(userRole, cabangId)` FlazzOps.js:148 → `getFlazzCards(token)`.
  - `getFlazzDashboardData(userRole, cabangId)` FlazzOps.js:1332 → `getFlazzDashboardData(token)`.
  - `getJalurByTanggal(tanggal, userInfo, opts)` JalurOps.js:425 → `getJalurByTanggal(tanggal, token, opts)`.
  - Update semua call-site di `src/Code.js` (processInitialData ~:176-190, getRestricted ~:187-302, getMonthlySummary flow ~:204-206, getPerformaSummary ~:217) agar meneruskan `token`/`user` dari `requireUser` yang sudah ada — jangan ubah logika filter yaitu per-cabang.

- [ ] **Step 2: `getMonthlySummary`** — pastikan jalur client (SummaryOps.js:64) hanya bisa lewat wrapper yang `requireUser`; langsung panggil tetap link ke sesi.

- [ ] **Step 3: `apiCheckReconGate`** Code.js:353 — pakai hasil `requireUser(token)` → `assertFlazzAccess(user, flazzCardBranch(cardId))` sebelum `checkReconGate(cardId)`.

- [ ] **Step 4: `deleteFlazzBBMUnlocked` cabang TUNAI** FlazzOps.js:1545 — ganti `assertMasterAccess` menjadi `assertTransactionAccess(userInfo, delCabang)` agar PIC hanya bisa hapus/detach laporan cabang sendiri.

- [ ] **Step 5: `saveJalur`/`updateJalur`** JalurOps.js:249/337 — validasi referensi asing:
  - `vehicle_id` dalam cabang user: `assertOwnWarehouse(userInfo, vehicleBranchById(vid))` untuk non-super.
  - `driver_id` se-cabang (ikuti pola validasi kendaraan).
  - `etoll_card_id`/`flazz_card_id` lewat `assertFlazzAccess(userInfo, flazzCardBranch(cardId))` sebelum `autoCreateFlazzUsage`.
  - SUPERADMIN: stempel `kode_cabang` baris jalur dari kendaraan (`jalurVehicleById(vid)`), bukan `userInfo.cabang`.

- [ ] **Step 6: `saveTransactionEndOfDayUnlocked`** SpreadsheetOps.js ~:124-141 — untuk PIC tambah `assertOwnWarehouse(userInfo, vehicleBranchById(payload.vehicle_id))` sebelum `trxCabang` di-override kendaraan (SUPERADMIN bebas).

- [ ] **Step 7: `getAppSettings`** Code.js:533 — TIDAK diubah (terverifikasi `DatabaseGetAppSettings` DatabaseSetup.js:175-201 hanya mengembalikan branding publik). Pastikan tetap hanya branded.

- [ ] **Step 8: Gate util editor destruktif** — tambah guard SUPERADMIN+token (fungsi tetap bisa dijalankan dari editor Apps Script):
  - `cleanupOrphanPhotos`, `backfillJalurStatus`, `backfillFlazzCardName`, `debugFlazzCard`, `configureSpreadsheet`, `migrateLegacyPasswords`.

---

### Task 2: PIC read-only operasional (Bagian B)

**Files:**
- Modify: `src/SpreadsheetOps.js`, `src/FlazzOps.js`, `src/JalurOps.js`, `src/js.html`, `src/FlazzScript.html`, `src/FlazzPages.html`, `src/JalurScript.html`, `src/JalurPages.html`

**Interfaces:**
- Consumes: `assertSuperadminOnly(userInfo, action)` SpreadsheetOps.js:1175.
- Produces: Aksi operasional hanya bisa SUPERADMIN; master tetap PIC.

- [ ] **Step 1: Server — pasang `assertSuperadminOnly` di:**
  - `editDailyTransactionUnlocked` SpreadsheetOps.js:802 (sebelum semua proses edit).
  - `deleteDailyTransactionUnlocked` SpreadsheetOps.js:1059.
  - `updateJalur` JalurOps.js:337, `deleteJalur` JalurOps.js:395.
  - `saveFlazzTopUp` FlazzOps.js:269, `editFlazzTopUp` :321, `deleteFlazzTopUp` :389.
  - `saveFlazzTol` FlazzOps.js:436, `editFlazzTol` :494, `deleteFlazzTol` :561.
  - `saveFlazzRecon` FlazzOps.js:808.
  - `saveFlazzUsage` FlazzOps.js:1160 (penyerahan manual; penyerahan auto dari jalur tetap berjalan).
  - `deleteFlazzBBMUnlocked` FlazzOps.js:1545.
- [ ] **Step 2: `saveJalur` TETAP** `assertMasterAccess` (PIC boleh buat jalur) — jangan diubah.
- [ ] **Step 3: UI — sembunyikan tombol non-SUPERADMIN:**
  - `js.html`: tombol edit/hapus transaksi (table + card view, sekitar baris 1624-1780); tetap via `userRole !== 'SUPERADMIN'`.
  - `FlazzScript.html`/`FlazzPages.html`: tombol topup/tol/recon (form + edit + delete).
  - `JalurScript.html`/`JalurPages.html`: tombol edit/hapus jalur (listing & detail).
  - Form "Buat Kartu"; tetap tampil untuk PIC.

---

### Task 3: Dialog native → custom (Bagian D)

**Files:**
- Modify: `src/Index.html`, `src/js.html`, `src/FlazzScript.html`, `src/JalurScript.html`, `src/FlazzPages.html`

**Interfaces:**
- Consumes: modal konfirmasi baru `modal-confirm` (id di Index.html), helper di `js.html`.
- Produces: Zero dialog native browser; semua konfirmasi/validasi custom UI.

- [ ] **Step 1: Bangun `modal-confirm` reusable** di Index.html + helper `showConfirmModal(options, onConfirm)` di js.html (pola pending-callback; `white-space: pre-line` untuk pesan multiline). Belum ada di codebase (audit: 0 match).
- [ ] **Step 2: Ganti 16 × `confirm()`:**
  - `js.html` :688 (`confirmResetForm`), :991 (`processDailyReport` KM-tak-terbaca; pertahankan reset tombol submit/`__bbmSubmitting` saat cancel, logika :992-995), :1769 (`deleteDaily`), :2395 (`deleteKendaraan`), :2406 (`deleteCabang`), :2416 (`deleteSupir`), :2426 (`deleteBBM`), :2544 (`setPenggunaStatus`).
  - `FlazzScript.html` :502 (`saveFlazzTopUpForm`, pesan multi-baris dinamis), :835 (`deleteTopUp`), :878 (`deleteTol`), :886 (`deleteRecon`, pesan panjang), :893 (`deleteBBMFlazz`), :964 (`deleteFlazzCardClient`), :975 (`activateFlazzCardClient`).
  - `JalurScript.html` :551 (`jalurDelete`).
- [ ] **Step 3: Matikan bubble validasi HTML5:**
  - Tambah `novalidate` pada 13 form: Index.html login-form :46, daily-form :216, form-kendaraan :817, form-cabang :916, form-supir :962, form-bbm :1008, form-pengguna :1084, edit-daily :1150; FlazzPages.html form-flazz-card :10, form-flazz-topup :69, form-flazz-recon :108, (edit) :270, :297. (0 `novalidate` saat ini — audit.)
  - Ganti `reportValidity()` js.html :872 (`openReviewModal`) dan :899 (`processDailyReport`) dengan validasi manual + `showToast`.
- [ ] **Step 4: Grep zero-zone:** `confirm(`, `alert(`, `prompt(`, `reportValidity(` → 0 di sisi client.

---

### Task 4: Mobile responsive (Bagian E)

**Files:**
- Modify: `src/css.html`, `src/Index.html`, `src/FlazzScript.html`

**Interfaces:**
- Consumes: Bootstrap 5 grid & `table-responsive`.
- Produces: Tidak ada halaman terpotong horizontal di viewport 360-414px.

- [ ] **Step 1: Flazz detail modal** — bungkus 3 tabel hasil generate di `showFlazzDetailModal()` (FlazzScript.html:1184/1188/1192) dengan `<div class="table-responsive">`; modal: FlazzPages.html:391 (`modal-flazz-detail`).
- [ ] **Step 2: Bottom-nav** (Index.html:81-115; css.html:538-558 `flex:1 1 0; min-width:44px`) — label ikon-only di layar kecil (`d-none d-sm-inline` gaya) + `overflow-x:auto` agar semua 7 tombol SUPERADMIN reachable.
- [ ] **Step 3: Pencarian "Daftar Kartu Flazz"** Index.html:1031 `style="width:260px"` — hapus fixed width → `flex-wrap` + `flex-grow:1`; parent `card-header` css.html:222-224 (`overflow:hidden` css.html:211).
- [ ] **Step 4: Margin negatif `.card`** css.html:803 — `overflow-x:hidden` pada `.app-shell` atau koreksi width (`width:calc(100% + 32px)`).
- [ ] **Step 5: Panel Instrumen Awal/Akhir** Index.html:259/300 `col-6`×2 → `col-12 col-md-6`; inner `col-6` (:271/282/312/323) tetap.
- [ ] **Step 6: Grid modal master** Index.html:835-856 `col-6`/`col-4` → `col-12 col-sm-6 col-md-4`.
- [ ] **Step 7: `#user-info`** Index.html:21; css.html:183 — `text-truncate` + `min-width:0`.
- [ ] **Step 8: Base font ≤576px** css.html:127 (`html{font-size:75%}`) — naikkan untuk legibilitas (opsional).

---

### Task 5: Label status jalur (Bagian F)

**Files:**
- Modify: `src/JalurScript.html`

**Interfaces:**
- Consumes: `jalurStatusBadge()` JalurScript.html:461-466 (dipakai :315 listing & :376 summary/screenshot).
- Produces: Kolom Status di app dan screenshot bertuliskan "Terjadwal" (bukan "Belum Diisi").

- [ ] **Step 1:** Ubah badge `BELUM_DIISI` dari `Belum Diisi` menjadi `Terjadwal` di `jalurStatusBadge()` (pertahankan ikon, warna, dan status `SELESAI`/`SUDAH_LAPORAN`).
- [ ] **Step 2:** `#jalur-shot` & `jalurTakeScreenshot()` (JalurScript.html:580-592) tidak diubah — label baru otomatis ikut tershoot.

---

### Task 6: Verifikasi & peluncuran (Bagian C/G)

- [ ] **Step 1:** `node --check` semua file `.js` yang diubah + konten `<script>` yang diekstrak dari `.html` yang diubah.
- [ ] **Step 2:** Tambah/pakai `TestRunner.js`: reader dengan `role:'SUPERADMIN'` palsu → ditolak/hanya cabang sendiri; PIC edit laporan → Error.
- [ ] **Step 3:** Manual cross-cabang: 2 akun PIC (cabang beda) + 1 SUPERADMIN — dashboard/history/Flazz/jalur terisolasi; SUPERADMIN bisa lintas cabang; jalur buatan SUPERADMIN → bisa input laporan.
- [ ] **Step 4:** Manual mobile 360-414px — login, dashboard, Input (panel instrumen), History, Edit Laporan, Flazz (detail + master), Jalur, Master CRUD, Settings: tidak ada terpotong; bottom-nav semua reachable; semua dialog/validasi custom (bukan bubble browser).
- [ ] **Step 5:** Screenshot jalur → tampilan bersih, kolom Status = "Terjadwal".
- [ ] **Step 6:** Commit terpisah per bagian; `git push`; `clasp push`; `clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF -d "..."` — HANYA saat aplikasi tidak digunakan (tunggu instruksi user).