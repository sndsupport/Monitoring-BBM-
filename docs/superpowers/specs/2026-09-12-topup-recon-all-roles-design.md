# Top Up & Rekonsiliasi Flazz untuk Semua Role (PIC CABANG)

> **Status:** Disetujui untuk diimplementasikan.
> **Tanggal:** 2026-09-12

## Ringkasan

Memunculkan menu dan mengizinkan aksi **Top Up Flazz** dan **Rekonsiliasi Flazz** bagi **semua role** dengan cara membuka akses operasional untuk **PIC CABANG** (SUPERADMIN sudah punya akses penuh). PIC CABANG dapat **mencatat top up** dan **melakukan rekonsiliasi** untuk kartu Flazz di **warehouse miliknya sendiri**. Aksi **edit/hapus** top up dan hapus rekonsiliasi tetap **SUPERADMIN-only**.

Enforcement tetap di **backend** (utama) + **frontend** (visibilitas menu & guard form).

## Konteks

- Saat ini menu **Top Up Flazz** dan **Rekonsiliasi Flazz** hanya untuk SUPERADMIN:
  - `src/js.html:188-191` menyembunyikan tombol sidebar untuk non-superadmin.
  - `src/js.html:438-440` memfilter item bottom-nav.
  - `src/js.html:524-526` memblokir `switchTab` untuk kedua tab.
  - `src/FlazzScript.html:498` & `:545` guard `saveFlazzTopUpForm` / `saveFlazzReconForm`.
  - `src/FlazzOps.js:281` (`saveFlazzTopUpUnlocked`) dan `:826` (`saveFlazzReconUnlocked`) memanggil `assertSuperadminOnly`.
- Struktur role hanya dua: `PIC CABANG` dan `SUPERADMIN` (dropdown master pengguna di `Index.html:1101-1102`) — "semua role" = keduanya.
- Kedua fungsi server **sudah** memanggil `assertFlazzAccess(userInfo, flazzCardBranch(card_id))` setelah `assertSuperadminOnly`, sehingga scoping cabang untuk non-superadmin sudah terpasang dan tinggal memanfaatkannya.
- Data dropdown kartu pada form top up/rekonsiliasi (`populateFlazzDropdowns`, `FlazzScript.html:302-327`) berasal dari `apiGetFlazzDashboardData` yang sudah di-scope server-side per cabang untuk non-superadmin — PIC hanya melihat kartu cabangnya sendiri.
- Quick Access dashboard (`js.html:1261-1262`) sudah menampilkan kedua tombol untuk semua role; setelah guard `switchTab` dibuka, tautan langsung berfungsi.

## Tujuan

1. PIC CABANG dapat mencatat top up dan melakukan rekonsiliasi Flazz untuk kartu cabangnya sendiri.
2. Menu Top Up & Rekonsiliasi tampil konsisten di sidebar desktop, bottom-nav mobile, dan Quick Access dashboard.
3. Edit/hapus top up, hapus rekonsiliasi, dan aksi destruktif lain tetap terkunci SUPERADMIN.
4. Scoping cabang tetap dijamin server-side (`assertFlazzAccess`).

## Lingkup (scope)

- **Di dalam:** buka akses create (`saveFlazzTopUp`, `saveFlazzRecon`) untuk PIC di server; buka navigasi (sidebar, bottom-nav, switchTab, quick access); hapus guard form create; perbarui test & README.
- **Di luar lingkup:** edit/hapus top up, hapus rekonsiliasi, serah kartu manual (`saveFlazzUsage`), catat tol manual, hapus transaksi BBM Flazz — semua tetap SUPERADMIN-only. Tidak ada perubahan pada ledger, gate rekonsiliasi, atau data flow.

## Desain Detail

### 1. Backend — `src/FlazzOps.js`

**`saveFlazzTopUpUnlocked` (baris 281):** hapus `assertSuperadminOnly(payload.userInfo, 'mencatat top up Flazz');`. `assertFlazzAccess(payload.userInfo, flazzCardBranch(payload.card_id))` (baris 287) tetap, sehingga: SUPADMIN penuh; PIC hanya pada kartu dengan cabang sama dengan `userInfo.cabang`.

**`saveFlazzReconUnlocked` (baris 826):** hapus `assertSuperadminOnly(payload.userInfo, 'melakukan rekonsiliasi Flazz');`. `assertFlazzAccess` (baris 832) tetap.

Fungsi lain tidak diubah: `editFlazzTopUpUnlocked` (:334), `deleteFlazzTopUpUnlocked` (:403), `deleteFlazzRecon` (guard di sekitar `apiDeleteFlazzRecon`), `saveFlazzUsageUnlocked` (:1179), `deleteBBMFlazzTransaction` (:1620).

### 2. Navigasi — `src/js.html`

- Hapus blok penyembunyian sidebar (baris 188-191): `tabFlazzTopup.style.display = 'none'` dan `tabFlazzRecon.style.display = 'none'` di bawah `if (userRole !== 'SUPERADMIN')`.
- `drawBottomNav` (baris 438-440): hapus filter `if (key === 'flazz' && userRole !== 'SUPERADMIN')` yang menyaring `flazz-topup`/`flazz-recon`.
- `switchTab` (baris 524-526): hapus guard `if ((tab === 'flazz-topup' || tab === 'flazz-recon') && userRole !== 'SUPERADMIN')`.

Quick Access (`renderDashboardQuickAccess`, baris 1261-1262) tidak perlu diubah — tombol sudah ada untuk semua role.

### 3. Guard form — `src/FlazzScript.html`

- `saveFlazzTopUpForm` (baris 498): hapus guard `if (typeof userRole !== 'undefined' && userRole !== 'SUPERADMIN') { ... return; }`.
- `saveFlazzReconForm` (baris 545): hapus guard serupa.

Guard SUPERADMIN lain di FlazzScript tetap: `editTopUp` (:817), `deleteTopUp` (:831), `deleteRecon` (:911), termasuk penyembunyian tombol edit/hapus pada render riwayat berbasis `isSuper` (:703-705, :757, :758).

### 4. Tes — `src/TestRunner.js`

Ubah baris 141:

```js
results.push(__expectDenied(function() { return saveFlazzTopUpUnlocked({ userInfo: pic }); }, 'SUPERADMIN', 'PIC top up Flazz -> ditolak'));
```

menjadi (kartu kosong → ditolak oleh scoping cabang, bukan SUPERADMIN):

```js
results.push(__expectDenied(function() { return saveFlazzTopUpUnlocked({ userInfo: pic }); }, 'Akses ditolak: Anda hanya dapat mengelola kartu warehouse', 'PIC top up tanpa kartu -> ditolak scoping cabang'));
```

Catatan: `flazzCardBranch('')` mengembalikan cabang kosong yang tidak sama dengan `CBG-JKT`, sehingga `assertFlazzAccess` menolak. Baris lain (`deleteFlazzTopUpUnlocked` diciutkan SUPERADMIN) tetap.

### 5. Dokumentasi — `README.md`

Perbarui paragraf keamanan di bullet yang menyatakan operasi top-up/rekonsiliasi dikunci SUPERADMIN (baris ~14): PIC CABANG kini dapat **mencatat top up** dan **melakukan rekonsiliasi** untuk kartu warehouse-nya sendiri; **edit/hapus top up** dan **hapus rekonsiliasi** tetap SUPERADMIN-only. Aksi operasional lain (tol manual, serah kartu manual, edit/hapus laporan/jalur, dst.) tetap SUPERADMIN-only.

## Verifikasi

- Jalankan test suite `__runAllTests` via Apps Script — semua assert pass (jumlah assert bertambah/berkurang sesuai perubahan).
- Manual (SUPERADMIN): menu & aksi top up/rekonsiliasi tetap berfungsi penuh.
- Manual (PIC CABANG): menu Top Up & Rekonsiliasi tampil di sidebar, bottom-nav, dan Quick Access; dapat mencatat top up & rekonsiliasi kartu cabangnya; kartu dari cabang lain tidak muncul di dropdown; tombol edit/hapus tetap tersembunyi; aksi tol manual & serah kartu tetap ditolak.