# Tab Pengguna di Data Master — CRUD Akun dari Aplikasi

Date: 2026-09-06
Status: Approved (design) / To-be-verified (implementation)

## Problem

Akun Pengguna saat ini hanya bisa dibuat/diubah langsung di sheet `Pengguna` (tidak ada UI). Superadmin butuh mengelola akun dari aplikasi: tambah, ubah, dan nonaktifkan akun PIC/SUPERADMIN lain.

## Requirement (dari user)

- Tabel master baru **"Pengguna"** di halaman **Data Master** dengan CRUD penuh.
- Tab Pengguna **hanya tampil untuk user SUPERADMIN** (tidak untuk PIC CABANG).
- Tambah user dari aplikasi; akun baru langsung bisa login.

## Design

### Visibilitas

- Tombol tab baru `data-tab="pengguna"` di `#master-tabs` (`src/Index.html`).
- Disembunyikan untuk role selain SUPERADMIN, mengikuti pola penyembunyian tab Cabang/BBM di `src/js.html` (~baris 155–164).

### Model data (sheet `Pengguna` — skema tetap)

Header: `['user_id', 'username', 'password', 'nama', 'role', 'kode_cabang', 'status']`

| Field | Create | Edit | Rule |
|---|---|---|---|
| `user_id` | auto `U-<timestamp>` | — | unik, dibuat server |
| `username` | wajib | wajib | **unik** (validasi server, case-insensitive) |
| `password` | wajib | opsional | kosong saat edit = tidak diubah; disimpan plaintext (konsisten dengan `authenticateUser`) |
| `nama` | wajib | wajib | |
| `role` | wajib | wajib | `SUPERADMIN` \| `PIC CABANG` |
| `kode_cabang` | per role | per role | wajib untuk `PIC CABANG`; opsional (boleh kosong) untuk `SUPERADMIN` |
| `status` | `Aktif` | `Aktif`/`Non-Aktif` | soft-delete |

- `authenticateUser` (**tidak diubah**): login tetap membandingkan password plaintext dan `status === 'Aktif'`.

### Backend (`src/SpreadsheetOps.js`)

- `getAllUsers()` — baca semua baris via indeks header (`headers.indexOf`), kembalikan `{user_id, username, nama, role, cabang, status}`. **Tidak pernah mengembalikan kolom `password`**.
- `insertUser(data)`:
  - validasi username unik (`String(u).toLowerCase()`);
  - validasi: role valid, `kode_cabang` wajib bila role `PIC CABANG`, password tidak kosong, nama tidak kosong;
  - `appendRow([id, username, password, nama, role, cabang, 'Aktif'])` → `{msg: 'Pengguna Berhasil Ditambahkan'}`.
- `updateUser(data)`:
  - cari baris via `user_id`;
  - update nama, role, kode_cabang; jika `data.password` tidak kosong → update password juga;
  - guardrail: tidak bisa mengubah akun sendiri menjadi `PIC CABANG` bila itu SUPERADMIN aktif terakhir (lihat guardrail);
  - validasi username unik (kecuali milik sendiri) + `kode_cabang` wajib bila `PIC CABANG`.
- `setUserStatus(userId, status)`:
  - validasi: tidak bisa menonaktifkan akun sendiri; tidak boleh membuat status SUPERADMIN jadi 0 aktif;
  - set kolom `status`.

### Wrapper API (`src/Code.js`)

- `saveMasterPengguna(data)`, `updateMasterPengguna(data)`, `deleteMasterPengguna(userId)` (soft-delete → `setUserStatus(id,'Non-Aktif')`).
- `getMasterData` dan `processInitialData`: tambah key `penggunaList: []` untuk role selain SUPERADMIN, `getAllUsers()` untuk SUPERADMIN. (Tidak ada password di payload.)

### UI (`src/Index.html`, `src/js.html`)

- `src/Index.html`:
  - Nav-tab button `Pengguna` (ikon `bi-people`), `data-tab="pengguna"` → `switchMasterTab("pengguna")`.
  - `<div id='master-pengguna'>`: card *Daftar Pengguna* + tombol *Tambah Pengguna* (`#modal-pengguna`), list di `#list-pengguna`.
  - Modal `#modal-pengguna`: hidden `m_edit_id_pengguna`, input `m_username_pengguna`, `m_password_pengguna` (password; edit → leave blank = keep), `m_nama_pengguna`, select `m_role_pengguna` (`SUPERADMIN`/`PIC CABANG`), select `m_cabang_pengguna` (diisi dari `window.masterData.cabang`, opsi kosong → label "— (Superadmin)"), tombol simpan.
- `src/js.html`:
  - `renderPenggunaList(users)` — avatar inisial, nama, username, badge role, cabang, badge status (Aktif hijau / Non-Aktif abu), tombol Edit / (Nonaktifkan | Aktifkan kembali).
  - `prepareAddPengguna()` — reset form, isi select cabang dari `window.masterData.cabang`.
  - `addMasterPengguna()` / `editPengguna(id)` / `saveEditPengguna()` / `setPenggunaStatus(id, status)`.
  - `loadMasterData`: `else if (tab === 'pengguna') renderPenggunaList(data.penggunaList || [])`.
  - Sembunyikan tab Pengguna untuk role != SUPERADMIN (blok `userRole !== 'SUPERADMIN'` di `processInitialData`).

### Guardrail

- Tidak bisa menonaktifkan atau mengubah-role akun sendiri.
- Selalu harus ada ≥1 SUPERADMIN aktif; tolak aksi yang membuat 0.

## Files touched

- `src/SpreadsheetOps.js` (getAllUsers, insertUser, updateUser, setUserStatus)
- `src/Code.js` (wrappers + `penggunaList` di getMasterData/processInitialData)
- `src/Index.html` (tab, section master-pengguna, modal)
- `src/js.html` (render/CRUD/hide tab)

## Verification

- `node --check` untuk semua `<script>` block di `src/js.html` dan `src/Index.html` (exit 0).
- Manual (deploy ulang dengan clasp):
  - login SUPERADMIN → tab Pengguna tampil; login PIC → tab Pengguna tidak tampil.
  - Tambah akun PIC baru (username unik) → langsung bisa login dengan akun tsb.
  - Edit akun: ganti nama/role/cabang; password kosong → password lama tetap berlaku.
  - Tambah/ubah username duplikat → ditolak dengan pesan.
  - Nonaktifkan akun → tidak bisa login; Aktifkan kembali → bisa login lagi.
  - Nonaktifkan akun sendiri / SUPERADMIN terakhir → ditolak.