# Desain: Navigasi Accordion, Filter SUPERADMIN, Status Kartu di List Flazz, Dropdown Etoll per Cabang

**Tanggal:** 2026-09-07
**Status:** Disetujui untuk perencanaan

## 1. Latar Belakang & Masalah

Sistem saat ini punya 4 kebutuhan terpisah yang menyentuh lapisan UI yang sama (sidebar, bottom-nav, dan halaman Flazz/Jalur/Data Master):

1. **Status kartu tidak tampil di List Flazz & Saldo** — tabel `renderFlazzListingTable` (FlazzScript.html:870) menampilkan No, Nomor Kartu, Nama, Driver, Saldo Awal, Pengeluaran, Saldo Akhir. Kolom **status kartu** (TERSEDIA / SEDANG_DIGUNAKAN / NONAKTIF) hanya muncul di modal detail, tidak di tabel utama.
2. **Superadmin tidak punya filter warehouse & tanggal** — ada `shared-filter-card` (Index.html:490) dengan `filter-cabang` + `filter-date-start/end`, tapi hanya ditampilkan untuk tab `history` dan `gallery`. Sub menu List Flazz & Saldo, Riwayat Transaksi (tiap tab), Daftar Jalur, dan Data Master (tiap tab) tidak punya filter warehouse; data bertanggal tidak bisa difilter dari-sampai.
3. **Kartu etoll di Buat Jalur hanya autofill kartu default** — field `jalur-row-etoll-name` (JalurScript.html:148-150) berupa text readonly yang hanya berisi kartu `default_driver_id` supir, tidak bisa memilih kartu cadangan saat kartu utama sedang proses top-up. Juga tidak difilter per cabang.
4. **Navigasi belum accordion** — sidebar (Index.html:117-180) dan bottom-nav (Index.html:78-113) berbentuk daftar datar/kelompok statis. Tidak ada menu utama yang membuka/tutup sub menu; sub menu menu lain tidak auto-hide saat menu lain diklik.

**Race condition (belum dihandle):** `loadFlazzDataWrapper` (FlazzScript.html:52) memakai `flazzDataCache` + `google.script.run` tanpa request-ID token. Saat user cepat berpindah tab Flazz atau memicu reload berulang, beberapa request berjalan paralel; respons yang **selesai terakhir** (bukan yang dipanggil terakhir) menimpa cache → data dari tab/warehouse salah bisa tampil.

## 2. Tujuan

1. Menampilkan **status kartu** (TERSEDIA / SEDANG_DIGUNAKAN / NONAKTIF) sebagai kolom badge di tabel **List Flazz & Saldo**.
2. Menyediakan **filter warehouse** untuk superadmin di: List Flazz & Saldo, Riwayat Transaksi (tiap tab), Daftar Jalur, Data Master (tiap tab). Filter **tanggal dari-sampai** hanya untuk data bertanggal (Riwayat Transaksi tiap tab, Daftar Jalur).
3. Mengubah field kartu etoll di **Buat Jalur** menjadi **dropdown semua kartu aktif**, difilter **per cabang** yang dipilih (atau semua cabang saat superadmin memilih "Semua Warehouse"), dengan **default = kartu default supir**, sehingga kartu cadangan bisa dipilih saat kartu utama sedang top-up.
4. Merestrukturisasi navigasi menjadi **accordion** (sidebar + bottom-nav): menu utama yang bisa diklik membuka sub menu, dan **auto-hide** sub menu menu lain saat menu berbeda diklik. Menu "Operasional Kendaraan" di-**rename** menjadi **"Laporan Operasional Kendaraan"**.
5. Memperbaiki **race condition** pemuatan data Flazz via request-ID token.

## 3. Ruang Lingkup

### 3.1 Navigasi Accordion (Fitur 4)

**Struktur menu utama:**
```
Dashboard
JALUR PENGIRIMAN ▸
  └ Buat Jalur
  └ Daftar Jalur
  └ Summary Pengiriman
LAPORAN OPERASIONAL KENDARAAN ▸   ← rename dari "Operasional Kendaraan"
  └ Input Laporan
  └ History Laporan
  └ Galeri Foto
  └ Performa Kendaraan
KARTU FLAZZ ▸
  └ Top Up Flazz
  └ Rekonsiliasi Flazz
  └ List Flazz & Saldo
  └ Riwayat Transaksi
ADMIN (superadmin only)
  └ Data Master
  └ Pengaturan
```

- **Sidebar (Index.html:117-180):** ubah setiap grup heading + item menjadi `menu-group` berisi tombol utama `menu-toggle` + `<div class='menu-sub'>` berisi sub-link. Fungsi global baru **`toggleNavMenu(groupId)`** menutup semua grup lain lalu toggle grup yang diklik (auto-hide). Klik sub-link → `switchTab()` + tutup grup aktif.
- **Bottom-nav (Index.html:78-113):** ubah dari tombol datar menjadi tombol utama yang membuka panel sub-menu (accordion ke atas / drawer). Menu utama: **Dashboard, Laporan Operasional Kendaraan, Kartu Flazz, Jalur Pengiriman** (+ Master/Pengaturan jika superadmin). Memakai `toggleNavMenu` yang sama; tap sub menu → `switchTab()` + tutup panel.
- Fungsi `switchTab()` (js.html:406) tetap menjadi penentu halaman aktif; accordion hanya mengelola visibilitas sub menu.
- `nav-master` & `nav-settings` tetap tersembunyi untuk non-superadmin.

### 3.2 Status Kartu di List Flazz & Saldo (Fitur 1)

- FlazzScript.html `renderFlazzListingTable` (baris 870-943): tambah kolom **Status** setelah Driver.
- Badge: `SEDANG_DIGUNAKAN` → `bg-warning`, `TERSEDIA` → `bg-success`, `NONAKTIF` → `bg-secondary`, memakai `c.status`.
- Update `<thead>` tabel List Flazz & Saldo di FlazzPages.html (daftar kolom bertambah).
- Gaya sama dengan kolom status di `renderFlazzDashboardCards`/`renderFlazzMasterTable`.

### 3.3 Filter SUPERADMIN (Fitur 2)

**Prinsip:** hanya tampil untuk `userRole === 'SUPERADMIN'`. Sumber daftar warehouse = `masterData.cabangList` (dari `getCabangList()`, SpreadsheetOps.js:28). Data master lain (vehicles/drivers/cards) dimuat ulang mengikuti cabang yang dipilih.

| Lokasi | Filter Warehouse | Filter Tanggal dari-sampai |
|--------|------------------|---------------------------|
| List Flazz & Saldo | Ya (filter `branch_id`) | Tidak (data kartu tidak bertanggal) |
| Riwayat Transaksi: Tiap tab (TopUp/Tol/BBM/Pemakaian/Rekonsiliasi) | Ya (filter `branch_id`) | Ya (filter `date`/`tanggal`) |
| Daftar Jalur | Ya (filter cabang) | Ya (filter tanggal) |
| Data Master: Tiap tab (kendaraan/supir/flazz/pengguna; cabang menampilkan semua) | Ya (filter per cabang) | Tidak |
| Buat Jalur (dropdown etoll) — fitur 3 | Ya (dipakai filter dropdown) | Tidak |

**Akses non-superadmin:** filter tidak ditampilkan; data terfilter otomatis `userInfo.cabang` di backend (sudah ada: `getActiveVehicles`, `getFlazzCards`, dll).

**Penting — cakupan `input-cabang`:** `input-cabang-filter`/`input-cabang` (Index.html:217-220) berada di dalam `#step-1` form harian (`page-form`) sehingga **tidak terlihat** di halaman Jalur, Flazz, atau Data Master. Karena itu tiap halaman yang butuh filter diberi **widget warehouse sendiri** (select), di-populate dari `masterData.cabangList`, ditampilkan hanya saat `userRole === 'SUPERADMIN'`. Nilai terpilih berlaku untuk area tersebut; tidak bergantung pada `input-cabang` form.

**Implementasi:**

1. **Riwayat Transaksi (FlazzScript.html):** di atas konten tab history, tambah bar filter (warehouse + dari-sampai) yang tampil hanya saat `userRole === 'SUPERADMIN'` dan tab `history` aktif. `renderHistSection(type)` memfilter `data.topups/tolHistory/bbmFlazz/usages/recons` berdasarkan `branch_id` + rentang tanggal sebelum paginasi. Perlu pastikan tiap item punya `branch_id` (atau `card_id` → lookup ke `data.cards[].branch_id`) dan field tanggal (`date`/`tanggal`/`timestamp`).
2. **List Flazz & Saldo (FlazzScript.html):** tambah widget warehouse sendiri (mis. `flazz-filter-cabang`). `loadFlazzDataWrapper` harus meneruskan cabang terpilih dari widget itu ke `apiGetFlazzDashboardData` (backend `getFlazzDashboardData` sudah menerima `cabang` dan memfilter `branch_id`). Saat filter berubah → muat ulang data (cache di-reset bila cabang berubah).
3. **Daftar Jalur (JalurScript.html `jalurShowListing`):** tambah filter warehouse + tanggal dari-sampai. Filter client-side pada data yang sudah dimuat, atau kirim cabang+tanggal ke backend `getJalurByTanggal`/`loadJalurListings` bila diperlukan. Perlu verifikasi bentuk data (cabang dari `kode_cabang`).
4. **Data Master (js.html `loadMasterData`/render):** filter warehouse pada tab kendaraan/supir/flazz/pengguna (render filter per cabang). Tab cabang & BBM menampilkan semua. Karena `getMasterData` sudah meneruskan `userInfo.cabang` (Code.js:57-66), untuk superadmin perlu reload master data dengan cabang terpilih → kirim `cabang` (bukan `userInfo.cabang`) ke endpoint saat superadmin mengganti filter.

**Perbaikan race condition (Fitur 2):**
- Tambah `let __flazzRequestId = 0;` global.
- Setiap `loadFlazzDataWrapper()`: `const rid = ++__flazzRequestId;`.
- Di `withSuccessHandler`: `if (rid !== __flazzRequestId) return;` sebelum menimpa `flazzDataCache`/render. Begitu juga `jalurShowListing` dan pemuatan data master memakai pola yang sama (token per panggilan) agar tidak saling menimpa saat cepat berganti.

### 3.4 Dropdown Kartu Etoll per Cabang (Fitur 3)

- Ubah field readonly text (`jalur-row-etoll-name`, JalurScript.html:148-150) menjadi `<select class='jalur-row-etoll'>`.
- Isi dropdown = **semua kartu aktif** (`masterData.flazzCards`, filter status `!== 'NONAKTIF'`), **difilter per cabang** (mengikuti widget warehouse Jalur, mis. `jalur-filter-cabang`):
  - Non-superadmin → kartu dengan `branch_id === cabang user`.
  - Superadmin + cabang spesifik di widget warehouse Jalur → kartu `branch_id === cabang`.
  - Superadmin + "Semua Warehouse" → semua kartu.
- **Default** = kartu default supir (`default_driver_id` match) — via `jalurSetEtollDisplay` yang sudah ada (set `select.value`).
- Label opsi kartu: `card_name (card_number)` + badge `card_role` (UTAMA/CADANGAN) bila perlu.
- Tambah opsi placeholder `""` → "Pilih Kartu Etoll...". Bila tidak ada kartu default, biarkan kosong.
- **Modal Edit** (`jalur-edit-etoll`, JalurPages.html:164-167): ubah jadi `<select>` berisi semua kartu (filter per cabang sama), preset ke `flazz_card_id` tersimpan.
- `jalurSave`/`jalurSaveEdit`/`updateJalur` tetap membaca nilai dari `select.value` + teks opsi terpilih (untuk `etoll_card_name`).
- Hint bila kartu default berstatus `SEDANG_DIGUNAKAN` atau sedang proses top-up: tetap muncul di dropdown, tapi admin bisa memilih kartu cadangan (dropdown memungkinkan). Tidak menambah logika blok.

## 4. Alur Data Filter (Fitur 2)

```
Superadmin pilih warehouse di filter
    ↓
loadMasterData reload (vehicles/drivers/cards) dengan cabang terpilih
loadFlazzDataWrapper reload dgn cabang terpilih (cache reset bila berubah)
    ↓ render mengikuti cabang
Riwayat Transaksi: renderHistSection filter branch_id + rentang tanggal per tab
List Flazz & Saldo: tabel hanya kartu cabang terpilih
Daftar Jalur: jalurShowListing filter cabang + tanggal
Data Master: render tiap tab filter cabang
    ↓
Race condition dihindari: setiap request berkas requestId; handler hanya
apply bila id === __flazzRequestId (respons lama diabaikan)
```

## 5. Interaksi Antar-Modul

- `toggleNavMenu` (baru di js.html) dipakai sidebar & bottom-nav (Index.html), menjaga auto-hide antar menu.
- Filter Flazz memakai `masterData.cabangList` + `loadFlazzDataWrapper` (FlazzScript.html) + `getFlazzDashboardData` (FlazzOps.js, sudah menerima `cabang`).
- Filter Data Master memakai `getMasterData` (Code.js) yang diperluas menerima cabang terpilih untuk superadmin.
- Dropdown etoll per cabang memakai `masterData.flazzCards` + widget warehouse Jalur (`jalur-filter-cabang`, JalurScript.html).
- `renderFlazzListingTable` (FlazzScript.html) diubah untuk kolom status.

## 6. Batasan & Catatan

- Perubahan terbatas pada UI & data flow; **tidak** menyentuh schema spreadsheet (kecuali `getMasterData` menerima argumen cabang — perubahan fungsi, bukan kolom baru).
- Filter **hanya** untuk role `SUPERADMIN`; non-superadmin tetap auto-filter via backend terhadap `userInfo.cabang`.
- Daftar warehouse diambil dari sheet `Cabang` (`getCabangList`), bukan hardcoded.
- Tidak ada perubahan pada alur recon/penutupan, penyimpanan BBM, atau laporan harian.
- Bottom-nav mobile dibuat konsisten (accordion/drawer) — sub menu tidak pernah tampil bersamaan dengan menu utama lain.

## 7. Pengujian

1. Superadmin login → di List Flazz & Saldo tampil kolom Status (badge). Filter warehouse menyaring kartu per cabang.
2. Superadmin di Riwayat Transaksi → filter warehouse + tanggal dari-sampai menyaring tiap tab (TopUp/Tol/BBM/Pemakaian/Rekonsiliasi) sesuai data.
3. Superadmin di Daftar Jalur → filter warehouse + tanggal dari-sampai bekerja.
4. Superadmin di Data Master → tiap tab kendaraan/supir/flazz/pengguna menyaring per cabang; tab cabang & bbm menampilkan semua.
5. Buat Jalur: dropdown etoll hanya berisi kartu cabang terpilih (superadmin "Semua Warehouse" → semua kartu); default = kartu supir; cadangan bisa dipilih.
6. Edit Jadwal: dropdown etoll preset ke kartu tersimpan; kartu cabang terfilter.
7. Navigasi: klik "Jalur Pengiriman" membuka sub menu & menutup sub menu group lain; "Laporan Operasional Kendaraan" rename & accordion bekerja di sidebar & bottom-nav.
8. Race condition: cepat berpindah antar tab Flazz bertingkat → tidak ada data dari tab sebelumnya menimpa; hanya pemanggilan terbaru yang dirender.
9. Non-superadmin (PIC CABANG): filter tidak tampil; data tetap terfilter cabang user.