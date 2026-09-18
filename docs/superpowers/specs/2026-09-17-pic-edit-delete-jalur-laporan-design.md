# Buka Kembali Edit & Hapus untuk PIC CABANG di Daftar Jalur & History Laporan

> **Status:** Disetujui untuk diimplementasikan.
> **Tanggal:** 2026-09-17

## Ringkasan

Memunculkan kembali aksi **Edit** dan **Hapus** untuk role **PIC CABANG** pada dua menu operasional: **Daftar Jalur** (Jalur_Pengiriman) dan **History Laporan** (Penggunaan_BBM). PIC CABANG dapat mengedit/menghapus **hanya data warehouse miliknya sendiri**; **SUPERADMIN tetap penuh** untuk semua cabang. Dampak kaskade yang sudah ada (pengembalian saldo/status kartu etoll Flazz, balance-gate, hard-delete, audit log, sinkronisasi status jalur) **tetap berlaku** tanpa perubahan.

Enforcement tetap di **backend** (utama) + **frontend** (visibilitas tombol & guard client).

## Konteks

- Sesi `2026-09-11-security-readonly-ui` menjadikan PIC CABANG read-only untuk aksi operasional: edit/hapus laporan harian & edit/hapus jalur dikunci **SUPERADMIN-only** lewat `assertSuperadminOnly`.
- Sesi `2026-09-12-topup-recon-all-roles` membuka kembali aksi **create** top up & rekonsiliasi untuk PIC dengan pola: hapus `assertSuperadminOnly`, biarkan helper scoping cabang yang sudah ada menegakkan batas. Permintaan ini memakai **pola yang sama** untuk edit/hapus.
- Temuan saat eksplorasi:
  - `editDailyTransactionUnlocked` dan `deleteDailyTransactionUnlocked` (SpreadsheetOps.js) **sudah** memanggil `assertTransactionAccess(userInfo, branchId)` di dalam tubuh fungsi (baris 1004 & 1256) — SUPERADMIN penuh, PIC hanya cabang transaksi. Satu-satunya penghalang PIC adalah `assertSuperadminOnly` di baris 944 dan 1212.
  - `updateJalur` dan `deleteJalur` (JalurOps.js) **hanya** punya `assertSuperadminOnly` (425, 512). `findJalurRow` sudah mengembalikan `kode_cabang`, sehingga scoping PIC bisa dipasang segera setelah row ditemukan. `getJalurByTanggal` sudah men-scope tampilan PIC ke cabangnya sendiri.
  - Tombol & guard client semuanya di-gate `userRole === 'SUPERADMIN'`: render #daftar jalur (`JalurScript.html:327`), guard `jalurEdit`/`jalurSaveEdit`/`jalurDelete` (`JalurScript.html:491/535/566`), render History Laporan (tabel `js.html:1950` & kartu `js.html:1989`), guard `editDaily` (`js.html:2133`), `enterEditMode` (`js.html:2142`), `deleteDaily` (`js.html:2460`).
  - Data yang dirender PIC sudah di-scope server-side (`getDashboardData`, `getJalurByTanggal`), sehingga menampilkan tombol untuk PIC aman — PIC hanya melihat baris cabangnya sendiri.
  - Struktur role hanya dua: `PIC CABANG` dan `SUPERADMIN`.
  - TestRunner saat ini mengasumsikan kontrak lama: TestRunner.js:160-161 & 165-166 menegaskan "PIC edit/hapus laporan & jalur -> ditolak (SUPERADMIN)".

## Tujuan

1. PIC CABANG dapat **mengedit & menghapus** laporan BBM dan jadwal jalur **di cabangnya sendiri**.
2. SUPERADMIN tetap penuh (semua cabang) tanpa perubahan perilaku.
3. Scoping cabang tetap dijamin server-side: lintas-cabang **selalu ditolak**.
4. Dampak kaskade existing (kartu Flazz, balance-gate, audit, sync jalur) tidak berubah.
5. Aksi operasional lain (hapus BBM dari Flazz, serah kartu, top-up tol manual, util editor, dsb.) **tetap SUPERADMIN-only**.

## Lingkup (scope)

- **Di dalam:**
  - Backend laporan: hapus 2 `assertSuperadminOnly` (editDailyTransactionUnlocked:944, deleteDailyTransactionUnlocked:1212) → scoping oleh `assertTransactionAccess` yang sudah ada.
  - Backend jalur: ganti `assertSuperadminOnly` di `updateJalur` (425) & `deleteJalur` (512) dengan `assertMasterAccess` + `assertOwnWarehouse(kode_cabang jalur)` bila bukan SUPERADMIN.
  - Frontend jalur: helper `jalurCanOperate()` (SUPERADMIN || PIC CABANG); render tombol (:327) + guard (:491/:535/:566).
  - Frontend laporan: tampilkan tombol untuk PIC (:1950/:1989); guard `editDaily`/`enterEditMode`/`deleteDaily` (:2133/:2142/:2460) izinkan PIC.
  - Tes: perbarui 4 asersi kontrak lama + tambah asersi unit scoping lintas-cabang.
  - `PAGE_VER` dinaikkan; bullet keamanan `README.md` diperbarui.
- **Di luar lingkup:** struktur sheet, ledger/opening-balance, gate rekon, alur Flazz usage, hard-delete jalur, definisi role, alur edit form (`processDailyEditReport`). Semua aksi yang masih SUPERADMIN-only di FlazzScript/FlazzOps tidak diubah.

## Desain Detail

### 1. Backend laporan — `src/SpreadsheetOps.js`

Hapus baris:
- `editDailyTransactionUnlocked`: `assertSuperadminOnly(userInfo, 'mengedit laporan BBM');` (baris 944).
- `deleteDailyTransactionUnlocked`: `assertSuperadminOnly(userInfo, 'menghapus laporan BBM');` (baris 1212).

`assertTransactionAccess(userInfo, ...)` (baris 1004 & 1256) yang sudah ada:
- SUPERADMIN → lolos.
- PIC CABANG → dibandingkan `branchId` (dari kartu/vehicle baris laporan tersebut) dengan `userInfo.cabang`; beda → `Akses ditolak: Anda hanya dapat mengelola transaksi warehouse <cabang>.`

Tidak ada perubahan lain di fungsi ini.

### 2. Backend jalur — `src/JalurOps.js`

Pola mengikuti `insertKendaraan` (SpreadsheetOps.js:1383).

`updateJalur` (baris 425) — ganti:
```js
assertSuperadminOnly(userInfo, 'memperbarui jadwal pengiriman');
```
menjadi:
```js
const updateRole = assertMasterAccess(userInfo, 'memperbarui jadwal pengiriman');
```
Setelah `findJalurRow` menghasilkan `found`, tambahkan:
```js
if (updateRole !== 'SUPERADMIN') {
  assertOwnWarehouse(userInfo, (idx['kode_cabang'] !== undefined) ? String(found.row[idx['kode_cabang']] || '') : '', 'Jadwal pengiriman');
}
```
Urutan penting: `findJalurRow` dipanggil dulu untuk mendapat `found` (sebelum scoping), agar pesan error untuk id tak-ada tetap "Jadwal tidak ditemukan." dan tidak bocor indikasi cabang.

`deleteJalur` (baris 512) — ganti:
```js
assertSuperadminOnly(userInfo, 'menghapus jadwal pengiriman');
```
menjadi:
```js
const deleteRole = assertMasterAccess(userInfo, 'menghapus jadwal pengiriman');
```
Setelah `findJalurRow` menghasilkan `found`, tambahkan blok scoping yang sama.

Dampak yang tetap berjalan: `returnFlazzUsage(cardId)` saat ganti/hapus kartu, balance-gate kendaraan baru pada edit, hard-delete baris, `logAudit`.

### 3. Frontend jalur — `src/JalurScript.html`

Tambah helper kecil (dekat `jalurActiveCabang`):
```js
function jalurCanOperate() {
  return typeof userRole !== 'undefined' && (userRole === 'SUPERADMIN' || userRole === 'PIC CABANG');
}
```

Ganti penggunaan:
- Render kolom aksi (:327): `(jalurCanOperate() ? '<button ... jalurEdit(...) /><button ... jalurDelete(...) />' : '-')`.
- `jalurEdit` (:491): `if (!jalurCanOperate()) { showToast('Akses ditolak: hanya SUPERADMIN.', 'error'); return; }`.
- `jalurSaveEdit` (:535): sama.
- `jalurDelete` (:566): sama.

Catatan: tampilan PIC sudah ter-scope server-side, jadi tombol yang tampil selalu untuk jalur cabang PIC tersebut.

### 4. Frontend laporan — `src/js.html`

Tabel History (baris 1950):
```js
(userRole === 'SUPERADMIN' || userRole === 'PIC CABANG'
  ? '<button ... editDaily(...)/> <button ... deleteDaily(...)/>'
  : '-')
```
Kartu History (baris 1989): sama.

Guard client:
- `editDaily` (:2133): ubah `if (userRole !== 'SUPERADMIN')` → `if (userRole !== 'SUPERADMIN' && userRole !== 'PIC CABANG')`.
- `enterEditMode` (:2142): sama.
- `deleteDaily` (:2460): sama.

### 5. Tes — `src/TestRunner.js` (`__runSecurityIsolationTests`)

Ganti 4 asersi di baris 160-161 dan 165-166 menjadi kontrak baru:

```js
// PIC kini lolos gate role (bukan lagi SUPERADMIN-only); data tak-ada berhenti di validasi humanreadable.
results.push(__expectDenied(function() { return editDailyTransactionUnlocked({}, pic); }, 'Transaksi tidak ditemukan', 'PIC edit laporan -> lolos gate role, divalidasi data'));
results.push(__expectDenied(function() { return deleteDailyTransactionUnlocked('###TAK-ADA###', pic); }, 'Transaksi tidak ditemukan', 'PIC hapus laporan -> lolos gate role, divalidasi data'));
results.push(__expectDenied(function() { return updateJalur({ id: '###TAK-ADA###' }, picToken); }, 'Jadwal tidak ditemukan', 'PIC update jalur -> lolos gate role, divalidasi data'));
results.push(__expectDenied(function() { return deleteJalur('###TAK-ADA###', picToken); }, 'Jadwal tidak ditemukan', 'PIC hapus jalur -> lolos gate role, divalidasi data'));

// Scoping cabang tetap menolak lintas-cabang (inti keamanan kontrak baru).
results.push(__expectDenied(function() { return assertTransactionAccess(pic, 'CBG-BDG'); }, 'hanya dapat mengelola transaksi warehouse', 'PIC transaksi cabang lain -> ditolak scoping'));
try {
  assertTransactionAccess(pic, 'CBG-JKT');
  results.push(__expectEqual(true, true, 'PIC transaksi cabang sendiri -> lolos scoping'));
} catch (e) {
  results.push(__expectEqual(true, false, 'PIC transaksi cabang sendiri -> lolos scoping (gagal: ' + e.message + ')'));
}
results.push(__expectDenied(function() {
  if (assertMasterAccess(pic, 'uji') !== 'SUPERADMIN') assertOwnWarehouse(pic, 'CBG-BDG', 'Jadwal pengiriman');
}, 'tidak berada di warehouse', 'PIC jalur cabang lain -> ditolak scoping'));
try {
  assertOwnWarehouse(pic, 'CBG-JKT');
  results.push(__expectEqual(true, true, 'PIC jalur cabang sendiri -> lolos scoping'));
} catch (e) {
  results.push(__expectEqual(true, false, 'PIC jalur cabang sendiri -> lolos scoping (gagal: ' + e.message + ')'));
}
```

Catatan implementasi:
- `editDailyTransactionUnlocked({}, pic)` → setelah gate role dibuka, `transaction_id` undefined tidak cocok dengan baris mana pun → `Transaksi tidak ditemukan.` (bukti PIC tidak lagi diblokir role, melainkan divalidasi data).
- `deleteDailyTransactionUnlocked`/`updateJalur`/`deleteJalur` dengan id fiktif → error "Tidak ditemukan" analog.
- Scoping lintas-cabang diuji langsung terhadap helper (`assertTransactionAccess`; jalur memakai `assertMasterAccess` + `assertOwnWarehouse`).

### 6. Dokumentasi & versi

- `Config.gs`: `PAGE_VER` → `20260917v5`.
- `README.md`: perbarui bullet keamanan PIC — PIC kini dapat **edit & hapus laporan harian dan jadwal jalur hanya untuk cabangnya sendiri**; SUPERADMIN penuh; lintas-cabang ditolak server-side. Aksi operasional lain yang masih SUPERADMIN-only tidak berubah.

## Verifikasi

- `node --check` pada file JS yang berubah.
- Jalankan suite via Apps Script di project asli (`__runAllTests`) dengan spreadsheet test; semua grup hijau. (Guard PROD tetap berlaku — jika dijalankan di PROD, blokir akan muncul; gunakan spreadsheet test bila perlu.)
- Manual SUPERADMIN: edit/hapus laporan & jalur lintas cabang tetap berfungsi penuh; tombol tetap tampil di semua cabang.
- Manual PIC CABANG: tombol Edit/Hapus tampil di Daftar Jalur & History Laporan hanya untuk data cabangnya; aksi berhasil untuk cabang sendiri; mencoba cabang lain via API → ditolak "hanya dapat mengelola transaksi warehouse <cabang>" (laporan) / "tidak berada di warehouse <cabang>" (jalur).

## Risiko & mitigasi

- **Risiko PIC menghapus laporan ber-Flazz** → kembalikan saldo kartu: diizinkan (keputusan user); audit log tetap mencatat pelaku.
- **Konsistensi pesan error scoping jalur** untuk id tak-ada vs cabang beda: mitigasi dengan urutan find-then-scope agar id tak-ada selalu "Jadwal tidak ditemukan.".
- **UI bocor tombol antar-cabang** pada render lama (cache canvas): data sudah scoped server-side; tombol hanya merender baris yang tampil.