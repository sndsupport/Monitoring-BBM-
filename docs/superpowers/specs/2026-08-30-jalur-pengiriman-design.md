# Desain: Modul Jalur Pengiriman

**Tanggal:** 2026-08-30
**Status:** Disetujui

## Ringkasan
Modul baru untuk mencatat dan menampilkan jadwal pengiriman harian (tanggal, driver, kendaraan, rute tujuan), dengan summary per tanggal yang dapat di-screenshot untuk dibagikan ke WhatsApp grup operasional, serta badge peringatan sisa hari pajak tahunan kendaraan.

## Tujuan
- Mencatat siapa (driver), kendaraan apa, dan ke rute mana pada tanggal tertentu.
- Menampilkan listing jadwal per tanggal dalam format yang rapi untuk di-share ke grup WhatsApp op (via screenshot / teks).
- Memberi peringatan visual sisa hari pajak tahunan (STNK) setiap kendaraan.

## 1. Skema Data

### Sheet baru `Jalur_Pengiriman`
Ditambahkan ke daftar `sheets` pada `setupDatabase()` di `DatabaseSetup.js`:

```
id | tanggal | driver_id | nama_driver | vehicle_id | plat_nomor | nama_kendaraan | jenis_kendaraan | rute_tujuan | kode_cabang | created_by | created_at | updated_at | is_deleted
```

- `id`: unik, auto-generate `JLR-<timestamp>`.
- `tanggal`: tanggal pengiriman (YYYY-MM-DD).
- `driver_id` & `nama_driver`: diambil dari master Supir.
- `vehicle_id`, `plat_nomor`, `nama_kendaraan`, `jenis_kendaraan`: snapshot dari master Kendaraan saat dibuat (agar tidak berubah jika master diubah).
- `rute_tujuan`: teks tujuan.
- `kode_cabang`: cabang dari user pembuat.
- `created_by`: username/nama user pembuat.
- `created_at` / `updated_at`: timestamp.
- `is_deleted`: soft-delete (boolean/text).

### Kolom baru di master `Kendaraan`
`tanggal_pajak` (tanggal jatuh tempo pajak tahunan/STNK). Ditambahkan idempotent di ujung kanan sheet lama oleh `setupDatabase`.

## 2. Backend (Apps Script)

### File baru `JalurOps.js`
Mengikuti pola header-safe dari `FlazzOps.js`:
- `saveJalur(data, userInfo)` — insert satu/beberapa baris; di-loop untuk payload array.
- `updateJalur(data)` — edit baris berdasarkan `id`.
- `deleteJalur(id)` — soft-delete (`is_deleted = true`).
- `getJalurByTanggal(tanggal, userInfo)` — ambil jadwal untuk satu tanggal; filter `is_deleted != true` dan `kode_cabang` sesuai role; untuk setiap kendaraan hitung sisa hari pajak dari master Kendaraan (`tanggal_pajak`).

### Wrapper di `Code.js`
- `apiSaveJalur`, `apiUpdateJalur`, `apiDeleteJalur`, `apiGetJalurByTanggal` (mirip wrapper Flazz).
- Sertakan `tanggal_pajak` dalam payload `getMasterData` / `getActiveVehicles`.

### `SpreadsheetOps.js`
- Perluas `getActiveVehicles` untuk menyertakan `tanggal_pajak` (dicari via header index, bukan posisi keras, karena kolom baru berada di ujung kanan).
- Perluas `insertKendaraan` dan `updateKendaraan` untuk mendukung `tanggal_pajak`.

## 3. Frontend — Modul 2 Tab

### File baru `JalurPages.html` (UI)
**Tab 1 — Buat Jadwal:**
- Card "Buat Jadwal Pengiriman".
- Input tanggal (wajib).
- Daftar baris dinamis: `+ Tambah baris` menambah sekumpulan kolom → Driver (dropdown dari master Supir), Kendaraan (dropdown dari master Kendaraan), Rute Tujuan (text).
- Tombol **Simpan**: kirim semua baris; validasi minimal 1 baris terisi lengkap.

**Tab 2 — Summary/Listing:**
- Card header: **Jalur Pengiriman** | **Tanggal Pengiriman** | **Dibuat oleh**.
- Kontrol: input filter tanggal (single), tombol **Tampilkan**, tombol **Screenshot**, tombol **Bagikan WA**.
- Bagian data: list baris jadwal untuk tanggal terpilih. Tiap baris menampilkan:
  - Ikon jenis kendaraan (mobil/motor), plat nomor, nama kendaraan.
  - Nama driver.
  - Rute tujuan.
  - **Badge "Pajak habis dalam X hari"** (merah ≤30 hari, kuning ≤60 hari, normal jika aman). Berasal dari `tanggal_pajak` kendaraan.
  - Tombol **edit** & **hapus** (hapus dengan konfirmasi).
- **Screenshot**: pakai library `html2canvas` (version 1.4.1) yang di-embed dalam file HTML `Html2canvasLib.html` dan disuntikkan via `include()` (karena file `.js` di Apps Script bersifat server-side, bukan aset statis client); render card summary jadi `canvas` → tampilkan sebagai **pratinjau** (modal/panel) yang dapat disalin (Ctrl+C / klik kanan → Salin gambar), lalu **Ctrl+V di WhatsApp**. TIDAK ada unduhan otomatis.
- **Bagikan WA**: tombol membuka `https://wa.me/?text=<teks summary terformat>`.

### File baru `JalurScript.html` (logika)
- Render tab, render dropdown driver/kendaraan, render daftar baris dinamis (tambah/hapus baris).
- `saveJalur()`, `loadSummary()`, `takeScreenshot()`, `shareWA()`.
- Integrasi `switchTab` (dari `js.html`) melalui stub `loadJalurWrapper`.

## 4. Integrasi `Index.html`
- Item navigasi sidebar desktop + bottom-nav mobile **Jalur Pengiriman** (semua role).
- Include `JalurPages` dan `JalurScript`.
- Halaman `page-jalur-*` (buat & summary).
- Field input `tanggal_pajak` (date) pada modal master Kendaraan.

## 5. `js.html`
- Handler `switchTab('jalur-...')`.
- Logika master Kendaraan: tambah `tanggal_pajak` pada `addMasterKendaraan` / `editMasterKendaraan` / payload simpan.

## 6. `css.html`
- Style untuk badge pajak (warna status), halaman Jalur, dan pratinjau screenshot.

## 7. Dependensi
- `html2canvas` version 1.4.1 di-embed sebagai `<script>` dalam file HTML `Html2canvasLib.html` (bukan file `.js` server-side, agar berfungsi offline di sisi client).

## 8. File yang Diubah / Ditambahkan
**Ditambahkan:**
- `src/JalurOps.js`
- `src/JalurPages.html`
- `src/JalurScript.html`
- `src/Html2canvasLib.html`

**Diubah:**
- `src/DatabaseSetup.js` — sheet `Jalur_Pengiriman` + kolom `tanggal_pajak`.
- `src/Code.js` — wrapper API + `tanggal_pajak` di master.
- `src/SpreadsheetOps.js` — getActiveVehicles / insert / update kendaraan + helper pajak.
- `src/Index.html` — navigasi, include, master pajak.
- `src/js.html` — switchTab, master pajak, render jalur.
- `src/css.html` — style.
- `README.md` — dokumentasi.

## 9. Navigasi & Akses
- Sidebar desktop + bottom-nav mobile, diakses oleh semua role (SUPERADMIN & PIC CABANG).
- PIC hanya melihat data cabangnya sendiri.

## 10. Catatan Screenshot
Tombol Screenshot TIDAK memicu unduhan otomatis. Hasil render `canvas` ditampilkan sebagai pratinjau; admin menyalin (Ctrl+C) lalu menempel (Ctrl+V) langsung di aplikasi WhatsApp.
