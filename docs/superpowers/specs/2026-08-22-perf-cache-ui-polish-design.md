# Optimasi Loading Per-Menu & Perapian UI/UX Design Document
## Sistem Monitoring BBM & Operasional Harian

**Tanggal:** 22 Agustus 2026
**Status:** Approved
**Approach:** Smart cache browser (stale-while-revalidate + prefetch paralel saat login) + optimasi backend tertarget — struktur sheet/database tidak berubah

---

## 1. Overview

### 1.1 Masalah
1. Setiap pindah menu/sub-tab memicu round-trip `google.script.run` (~1–3 detik) plus baca ulang penuh beberapa sheet Google Sheets.
2. Keluhan utama user: **menu Data Master lambat** — setiap klik sub-tab (Kendaraan/Cabang/Supir/BBM) mem-fetch ulang SEMUA data master, tanpa loading indicator, sehingga harus klik berkali-kali sebelum data muncul.
3. Tidak ada cache sama sekali; data master yang jarang berubah tetap diambil ulang tiap akses.
4. **Bug:** filter Warehouse & Bulan di menu History tidak berfungsi — `loadDashboard()` tidak pernah membaca nilai filter dan `getRecentTransactions` tidak menerima parameter filter.
5. Kalkulasi efisiensi rolling di `getRecentTransactions` berjalan O(n²) (filter+sort ulang per baris).
6. `loadAppSettings()` dipanggil dua kali saat init.
7. UI/UX: hapus data pakai `confirm()` native (kontra README: semua aksi via toast/modal), list Master tanpa loading state, istilah campur "Warehouse"/"Cabang", label step 2 form tertulis "Dasbor".

### 1.2 Solusi ringkas
Cache data di browser dengan pola stale-while-revalidate + prefetch paralel tepat setelah login; pindah menu/sub-tab merender instan dari cache. Backend dibaca lebih hemat (buka spreadsheet sekali per request, CacheService 5 menit untuk master dengan version-key, efisiensi one-pass). Filter History jadi lokal. Perapian UI: skeleton konsisten, modal konfirmasi reusable, istilah seragam "Cabang", label diperbaiki.

---

## 2. Keputusan Desain (hasil diskusi)

| Pertanyaan | Keputusan |
|---|---|
| Skenario delay yang diserang | Menu Master (keluhan utama) + seluruh perpindahan menu |
| Lokasi cache | Browser (`window.AppCache`) — sumber kebenaran tampilan |
| Strategi refresh | Stale-while-revalidate untuk History; fetch-once untuk Master; prefetch paralel saat login |
| Filter History | Diperbaiki sebagai filter lokal atas cache (data tetap limit 100 baris terakhir dari server) |
| Istilah seragam | **"Cabang"** (mengikuti nama sheet, kolom data, README) — menggantikan semua "Warehouse" di copy UI |
| Konfirmasi hapus | Satu modal Bootstrap reusable menggantikan `confirm()` native |
| Database/struktur sheet | TIDAK berubah |

---

## 3. Arsitektur Performa

### 3.1 Cache browser (js.html)

```js
window.AppCache = {
  master: { kendaraan: [], cabang: [], supir: [], bbm: [] },
  dashboard: [],
  masterLoadedAt: 0,
  dashboardLoadedAt: 0
};
```

- **Prefetch paralel saat login berhasil:** setelah `processInitialData` kembali dan form dirender, langsung tembak `refreshMasterData()` dan `refreshDashboardData()` secara paralel (dua panggilan `google.script.run` bersamaan). Saat user membuka menu Master/History, data sudah tersedia → render instan tanpa loading.
- **Sub-tab Master instan:** `switchMasterTab(tab)` hanya merender dari `AppCache.master`; fetch server HANYA jika cache kosong (mis. refresh halaman lalu langsung buka Master sebelum prefetch selesai — fallback: skeleton tampil).
- **History stale-while-revalidate:** buka History → render instan dari cache → refresh background. Jika hasil refresh berbeda, re-render tanpa flash kosong. Skeleton hanya untuk kondisi cache kosong.
- **Setelah CRUD master** (tambah/edit/hapus Kendaraan/Cabang/Supir/BBM): satu panggilan `refreshMasterData()` memperbarui seluruh cache lalu re-render tab aktif — menggantikan pola `loadMasterData(tab)` per aksi.
- **Setelah simpan laporan harian sukses:** paksa refresh cache history (background).
- **Hapus pemanggilan ganda** `loadAppSettings()` (saat ini dipanggil di `DOMContentLoaded` DAN di success handler `loadInitialData`).

### 3.2 Filter lokal History

- `loadDashboard(force)` membaca `#filter-cabang` dan `#filter-bulan`, memfilter `AppCache.dashboard` di browser:
  - `filter-cabang`: cocokkan `row.cabang_kode` (field baru dari server, lihat 3.3) terhadap kode yang dipilih; jika field kosong (data lama), fallback cocokkan nama cabang.
  - `filter-bulan` (input month `YYYY-MM`): cocokkan bulan-tahun dari tanggal transaksi.
- Perubahan filter → render ulang instan, tanpa panggilan server.
- `resetFilters()` mereset kedua kontrol + render ulang dari cache penuh.

### 3.3 Optimasi backend (SpreadsheetOps.js / Code.js)

1. **Satu koneksi per request:** fungsi-fungsi terkait (`getMasterData`, `getRecentTransactions`, dll.) memakai objek `ss` hasil `getDB()` yang sama untuk semua sheet yang dibaca — tidak ada `openById` berulang.
2. **CacheService untuk data master:**
   - Versi master disimpan di `PropertiesService` (`MASTER_VER`, angka naik).
   - Key cache: `master_<role>_<cabang>_v<MASTER_VER>`, TTL 300 detik.
   - Setiap operasi tulis master (insert/update/delete Cabang/Kendaraan/Supir/BBM) menaikkan `MASTER_VER` → cache lama otomatis orphaned → tidak ada data basi setelah simpan.
   - Payload dashboard TIDAK di-cache server-side (per role/cabang & sering berubah); cukup optimasi komputasi.
3. **Efisiensi one-pass di `getRecentTransactions`:**
   - Map `vehicle_id → array transaksi` sudah ada; tambah langkah: sort DESC sekali per kendaraan.
   - `hitungEfisiensi7Riwayat` diganti varian one-pass: array transaksi per kendaraan di-sort DESC **sekali** di awal; untuk tiap baris tanggal D, ambil 7 transaksi pertama dengan tanggal ≤ D dari array ter-sort tersebut. Perilaku identik dengan kode sekarang (filter tanggal ≤ D → sort desc → slice 7 transaksi terakhir, tanpa batas kalender [D−6, D]); formula literKonsumsi dan hasil numerik tidak berubah.
4. **Field baru `cabang_kode`** pada tiap row hasil `getRecentTransactions` (dari `row[5]`) untuk filter lokal yang akurat.

### 3.4 Yang TIDAK diubah
- Struktur & isi sheet database, urutan kolom, format ID transaksi/master.
- Formula harian `literKonsumsi`, rumus efisiensi, threshold status Boros/Normal/Irit.
- Limit 100 baris terakhir di dashboard.
- Alur OCR/upload foto dan `saveTransactionEndOfDay`.
- Login/auth.

---

## 4. Perubahan UI/UX

### 4.1 Loading state konsisten
- **List Master (4 tab):** skeleton shimmer (pola CSS `.skeleton` yang sudah ada) saat fetch pertama; setelah cache terisi, pindah tab tanpa loading.
- **History:** skeleton existing dipertahankan, hanya untuk cache kosong.
- Tombol aksi tetap pola spinner + disabled yang sudah ada.

### 4.2 Modal konfirmasi reusable
- Satu modal baru `#confirm-modal` di Index.html: judul, pesan dinamis, tombol "Batal" + "Ya, Hapus" (danger).
- Fungsi `askConfirm(title, message, onYes)` — menyimpan callback; dipasang di `deleteKendaraan`, `deleteCabang`, `deleteSupir`, `deleteBBM` menggantikan `confirm()`.
- Gaya konsisten modal master existing (rounded, header berwarna).

### 4.3 Seragam istilah "Cabang"
Semua copy UI diganti: label "Pilih Warehouse" → "Pilih Cabang", opsi "Semua Warehouse" → "Semua Cabang", judul list/tab/modal master "Warehouse" → "Cabang", alert role ("Warehouse: X" → "Cabang: X"), placeholder (`CBG-JKT`, `Jakarta`), aria-label tombol.

### 4.4 Label & copy kecil
- Step indicator form: step 2 "Dasbor" → "Perjalanan".
- Empty state list Master: ikon + teks konsisten antar tab.
- Pesan gagal muat: toast error + area list menampilkan tombol "Coba Lagi".

---

## 5. Error Handling

| Skenario | Perilaku |
|---|---|
| Fetch gagal, cache ADA | Data cache tetap tampil + toast "Gagal memperbarui data, menampilkan data tersimpan" |
| Fetch gagal, cache KOSONG | Area list/skeleton diganti pesan error + tombol "Coba Lagi" (memanggil ulang refresh) |
| Respons lama datang belakangan (race) | Penomoran request (`requestSeq` per jenis data) — respons versi lama diabaikan |
| Semua panggilan server baru | `withFailureHandler` wajib terpasang — tidak ada silent fail |

---

## 6. Verifikasi

Project Apps Script tanpa test runner, maka:

1. **Syntax check otomatis:** ekstrak konten `<script>` dari `js.html` & `Settings.html` + file `.js` backend → `node --check` (validasi sintaks murni).
2. **Checklist manual (user jalankan setelah `clasp push`):**
   - Login → buka Master: data tampil tanpa delay (prefetch sempat jalan).
   - Pindah 4 sub-tab Master: instan, tanpa spinner.
   - Tambah/edit/hapus Kendaraan, Cabang, Supir, BBM: konfirmasi via modal (bukan confirm native), list ter-update otomatis.
   - Buka History: tampil instan dari prefetch; refresh background tidak membuat layar kosong.
   - Filter Cabang & Bulan: hasil instan & benar; Reset Filter bekerja.
   - Simpan laporan harian → buka History: transaksi baru muncul.
   - Logout → login user PIC: hanya data cabangnya; menu Master/Pengaturan tersembunyi.
3. **Deploy** dilakukan user via clasp setelah review — agent TIDAK push tanpa izin.

---

## 7. Berkas yang Berubah

| Berkas | Jenis perubahan |
|---|---|
| `src/js.html` | AppCache, prefetch paralel, render-from-cache, filter lokal, requestSeq, modal konfirmasi wiring, istilah/label, hapus loadAppSettings ganda |
| `src/Index.html` | Modal `#confirm-modal`, skeleton list Master, copy "Warehouse"→"Cabang", label step 2, empty state |
| `src/css.html` | Style skeleton list & modal konfirmasi (kecil, ikut pola existing) |
| `src/SpreadsheetOps.js` | Helper ss-shared, CacheService master + MASTER_VER invalidation, efisiensi one-pass, field `cabang_kode` |
| `src/Code.js` | Invalidasi MASTER_VER di wrapper CRUD master (save/update/delete), sisanya wrapper tidak berubah |
| `src/Settings.html` | Tidak berubah logika; hanya ikut verifikasi sintaks |
