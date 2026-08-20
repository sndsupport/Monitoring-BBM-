# Sistem Monitoring BBM & Operasional Harian

Aplikasi berbasis web (Google Apps Script) untuk memudahkan pencatatan dan pemantauan operasional kendaraan dinas/harian, meliputi pencatatan kilometer (odometer), konsumsi bahan bakar (BBM), dan biaya tol secara terpusat.

## 🌟 Fitur Utama
1. **Multi-Role Access (Role-Based)**
   - **SUPERADMIN:** Memiliki akses global tanpa batas ke seluruh cabang. Bisa melihat semua history kendaraan dan mengelola seluruh data master.
   - **PIC CABANG:** Hanya bisa mengelola dan melihat kendaraan serta supir yang berada di cabang yang bersangkutan.
2. **Auto-Calculate BBM & Efisiensi**
   - Menghitung jarak tempuh secara otomatis (KM Akhir - KM Awal).
   - Menghitung total harga BBM otomatis (berdasarkan jumlah liter × harga master BBM).
   - Menghitung efisiensi bahan bakar (KM/Liter).
3. **Master Data Dinamis**
   - Mendukung penambahan cabang, supir, dan kendaraan.
   - Mendukung penyesuaian/penambahan jenis dan harga BBM (contoh: Solar, Pertalite, Pertamax).
4. **Data Tersimpan di Google Sheets**
   - Seluruh data operasional langsung terekam pada Google Sheets sehingga mudah untuk di-*export*, direkap, atau dihubungkan dengan Google Data Studio / Looker.

## 🛠️ Cara Instalasi & Penggunaan (Google Apps Script)

### 1. Menyiapkan Spreadsheet
Pastikan Anda sudah memiliki file Google Spreadsheet kosong (atau menggunakan yang sudah disediakan).

### 2. Mengunggah Kode
Kode aplikasi ini dibuat untuk diunggah menggunakan [clasp](https://github.com/google/clasp) ke dalam *Google Apps Script* yang terikat dengan Spreadsheet Anda.

### 3. Setup Database Awal (Wajib)
Setelah semua kode (*script*) berada di Editor Apps Script, ikuti langkah berikut untuk membuat kerangka database:
1. Buka file **`DatabaseSetup.gs`** di Editor Apps Script.
2. Pilih fungsi **`setupDatabase`** pada menu tarik-turun (*dropdown*) di atas editor, lalu tekan tombol **Run (Jalankan)**.
   > Sistem akan otomatis membuat *sheet* (tabel) yang dibutuhkan seperti `Cabang`, `Supir`, `BBM`, `Pengguna`, `Kendaraan`, dan `Penggunaan_BBM`.
3. (Opsional) Jika Anda ingin mengisinya dengan data percobaan (*dummy*), jalankan fungsi **`seedDummyData`**.

### 4. Deploy Web App
1. Klik tombol **Deploy** > **New deployment** di pojok kanan atas Apps Script Editor.
2. Pilih tipe **Web app**.
3. Atur "Execute as" ke **User accessing the web app** (atau akun Anda sendiri, tergantung preferensi) dan "Who has access" ke **Anyone**.
4. Klik **Deploy** dan salin URL Web App yang dihasilkan.

## 👥 Akun Login (Default Dummy)
Jika Anda sudah menjalankan `seedDummyData()`, Anda bisa login menggunakan akun berikut:
- **SUPERADMIN:** Username: `snd` | Password: `snd123`
- **PIC Jakarta:** Username: `picjkt` | Password: `pic123`
- **PIC Bandung:** Username: `picbdg` | Password: `pic123`

## 📂 Struktur File
- `Code.gs` : Backend utama yang menghubungkan UI (HTML) dengan fungsi database.
- `DatabaseSetup.gs` : Skrip untuk inisialisasi tabel dan struktur awal Google Sheets.
- `SpreadsheetOps.gs` : Skrip pengelola fungsi CRUD (*Create, Read, Update, Delete*) ke Google Sheets.
- `DriveOps.gs` & `OCRService.gs` : Penunjang untuk penyimpanan foto dan ekstraksi teks (bila OCR digunakan).
- `Index.html` : Struktur kerangka antarmuka pengguna (UI) menggunakan Bootstrap 5.
- `js.html` : Logika interaksi sisi-*client* (Frontend JavaScript).
- `css.html` : Gaya desain tambahan aplikasi.

---
*Dikembangkan secara khusus untuk monitoring dan efisiensi operasional harian perusahaan.*
