# Sistem Monitoring BBM & Operasional Harian

Aplikasi berbasis web (Google Apps Script) untuk memudahkan pencatatan dan pemantauan operasional kendaraan dinas/harian, meliputi pencatatan kilometer (odometer), konsumsi bahan bakar (BBM), dan biaya tol secara terpusat.

## Fitur Utama

### Multi-Role Access (Role-Based)
- **SUPERADMIN:** Akses penuh ke seluruh cabang, semua history, data master, dan pengaturan aplikasi.
- **PIC CABANG:** Hanya bisa mengelola laporan untuk kendaraan dan supir di cabangnya sendiri.

### Mobile-First Responsive Design
- Bottom navigation bar (mobile) / top tabs (desktop).
- Card-based form input bergaya modern dengan preview foto dan layout 2-kolom dinamis di perangkat Desktop/PC.
- Dashboard tampilan cards (mobile) atau table (desktop).
- Toast notification untuk semua aksi (bukan alert).

### Auto-Calculate BBM & Efisiensi
- Menghitung jarak tempuh otomatis (KM Akhir - KM Awal).
- Menghitung liter BBM otomatis (input nominal pengeluaran BBM, liter terhitung otomatis berdasarkan harga master).
- Menghitung total harga BBM secara dinamis jika diubah.
- Menghitung efisiensi bahan bakar (KM/Liter).

### Master Data Dinamis
- **Cabang:** Kode, nama, lokasi, status.
- **Kendaraan:** Plat nomor, nama, jenis (Mobil/Motor), cabang.
- **Supir:** Nama, cabang, dan relasi kendaraan default.
- **BBM:** Jenis, harga per liter.
- **Manajemen Lengkap (CRUD):** Tambah, Edit, dan Hapus (Delete) dengan Bootstrap Modals interaktif untuk semua kategori.

### OCR Foto Odometer
- Upload foto odometer awal dan akhir.
- OCR otomatis mengekstrak angka KM dari foto.
- Modal preview hasil OCR dengan perhitungan otomatis sebelum simpan.

### Pengaturan Aplikasi (Superadmin)
- Upload logo aplikasi (tersimpan di Google Drive).
- Konfigurasi nama aplikasi, nama perusahaan, footer text.
- Filter cabang di form input untuk Superadmin (pilih cabang tertentu atau semua).
- Tema warna (Branding) kustom, seperti warna utama (primary color) hijau khas perusahaan.

### Data Tersimpan di Google Sheets
- Seluruh data operasional langsung terekam pada Google Sheets.
- Mudah untuk di-export, direkap, atau dihubungkan dengan Looker Studio.

## Cara Instalasi & Penggunaan (Google Apps Script)

### 1. Menyiapkan Spreadsheet
Pastikan Anda sudah memiliki file Google Spreadsheet kosong (atau menggunakan yang sudah disediakan).

### 2. Mengunggah Kode
Kode aplikasi ini dibuat untuk diunggah menggunakan [clasp](https://github.com/google/clasp) ke dalam *Google Apps Script* yang terikat dengan Spreadsheet Anda.

### 3. Setup Database Awal (Wajib)
Setelah semua kode berada di Editor Apps Script:
1. Buka file **`DatabaseSetup.gs`** di Editor Apps Script.
2. Pilih fungsi **`setupDatabase`** pada menu dropdown di atas editor, lalu tekan tombol **Run**.
   > Sistem akan membuat sheet `Cabang`, `Supir`, `BBM`, `Pengguna`, `Kendaraan`, `Penggunaan_BBM`, dan `Pengaturan`.
3. (Opsional) Jalankan **`seedDummyData`** untuk mengisi data percobaan.

### 4. Deploy Web App
1. Klik **Deploy** > **New deployment** di pojok kanan atas Apps Script Editor.
2. Pilih tipe **Web app**.
3. Atur "Execute as" ke **User accessing the web app** dan "Who has access" ke **Anyone**.
4. Klik **Deploy** dan salin URL Web App yang dihasilkan.

## Akun Login (Default Dummy)
Setelah menjalankan `seedDummyData()`:
- **SUPERADMIN:** Username: `snd` | Password: `snd123`
- **PIC Jakarta:** Username: `picjkt` | Password: `pic123`
- **PIC Bandung:** Username: `picbdg` | Password: `pic123`

## Struktur File

| File | Deskripsi |
|------|-----------|
| `Code.gs` | Backend utama, hubungkan UI dengan fungsi database. |
| `DatabaseSetup.gs` | Inisialisasi tabel dan struktur Google Sheets. |
| `SpreadsheetOps.gs` | CRUD ke Google Sheets. |
| `DriveOps.gs` | Penyimpanan foto ke Google Drive. |
| `OCRService.gs` | Ekstraksi teks dari foto odometer (OCR). |
| `Index.html` | Struktur UI utama (Bootstrap 5 + mobile-first). |
| `js.html` | Logika interaksi sisi client (JavaScript). |
| `css.html` | Gaya desain custom (responsive, mobile-first). |
| `Settings.html` | Halaman pengaturan aplikasi (logo, nama, perusahaan). |

---

*Dikembangkan untuk monitoring dan efisiensi operasional harian perusahaan.*
