# Sistem Monitoring BBM & Operasional Harian

Aplikasi berbasis web (Google Apps Script) untuk memudahkan pencatatan dan pemantauan operasional kendaraan dinas/harian, meliputi pencatatan kilometer (odometer), konsumsi bahan bakar (BBM), dan biaya tol secara terpusat.

## Fitur Utama

### Multi-Role Access (Role-Based)
- **SUPERADMIN:** Akses penuh ke seluruh cabang, semua history, data master, dan pengaturan aplikasi.
- **PIC CABANG:** Hanya bisa mengelola laporan untuk kendaraan dan supir di cabangnya sendiri.

### Mobile-First Responsive Design
- Bottom navigation bar (mobile) / **sidebar** (desktop).
- **Navigasi terkelompok per fungsi:** sidebar desktop disusun menjadi grup **INPUT / LISTING / LAPORAN / ADMIN** plus **Dashboard** di posisi teratas, sehingga menu inti (`Input Laporan`, `Buat Jadwal`, `Top Up Flazz`, `Rekonsiliasi Flazz`) dikelompokkan di INPUT, daftar/history di LISTING, dan ringkasan/laporan di LAPORAN.
- Card-based form input bergaya modern dengan preview foto dan layout 2-kolom dinamis di perangkat Desktop/PC.
- Dashboard tampilan cards (mobile) atau table (desktop).
- Toast notification untuk semua aksi (bukan alert).

### Dashboard Umum (Halaman Landing)
- Setelah login, aplikasi langsung masuk ke **Dashboard Umum** (menggantikan Dashboard Flazz sebagai landing page).
- **Greeting dinamis:** sapaan berdasarkan waktu (Selamat Pagi/Siang/Sore/Malam) beserta nama pengguna dan tanggal hari itu.
- **Akses Cepat (Quick Access):** tombol-tombol pintasan ke halaman utama (Input Laporan, History, Buat Jadwal, Galeri, Top Up, Rekonsiliasi, Performa, dan menu admin sesuai peran).
- **Galeri Foto Terbaru:** strip foto operasional terbaru dengan tautan "Lihat Semua" ke halaman Galeri.
- **Status Kartu Etoll:** ringkasan Total Kartu Aktif, Total Saldo, Top Up Terakhir, dan tabel status kartu saat ini (nomor, tipe, driver/kendaraan, saldo, status).
- History Laporan dipisah menjadi halaman sendiri (menu `History Laporan` di grup LISTING).

### Auto-Calculate BBM & Efisiensi Pintar
- Menghitung jarak tempuh otomatis (KM Akhir - KM Awal).
- Menghitung liter BBM otomatis (input nominal pengeluaran BBM, liter terhitung berdasarkan harga master).
- Menghitung total harga BBM secara dinamis jika diubah.
- **Smart Fuel Efficiency:** Menghitung efisiensi bahan bakar (KM/Liter) menggunakan rumus penurunan indikator Bar Bensin dan Kapasitas Tangki dari master Kendaraan. Bahkan jika hari itu tidak mengisi bensin (0 L), efisiensi tetap terhitung akurat berdasarkan penurunan Bar.

### Master Data Dinamis
- **Cabang:** Kode, nama, lokasi, status.
- **Kendaraan:** Plat nomor, nama, jenis (Mobil/Motor), kapasitas tangki, jumlah bar, standar KM/L, jenis indikator (digital/analog), cabang, tanggal pajak (tahunan, 5 tahunan, KIR), serta estimasi jarak satu tangki (`kapasitas_tangki × standar_km_l`).
  - Pada formulir *Input Laporan*, field **Bar Bensin Awal/Akhir** **otomatis disembunyikan** (dan tidak lagi wajib diisi) untuk kendaraan berindikator **bukan Digital Bar** (mis. `ANALOG_JARUM`/jarum, `TIDAK_ADA`). Bar hanya dihitung untuk indikator Digital Bar; untuk indikator jarum, konsumsi tetap memakai liter beli dari struk.
- **Supir:** Nama, cabang, dan relasi kendaraan default.
- **BBM:** Jenis, harga per liter.
- **Manajemen Lengkap (CRUD):** Tambah, Edit, dan Hapus (Delete) dengan Bootstrap Modals interaktif untuk semua kategori.

### Kartu & Transaksi Flazz
- Kelola **Kartu Flazz**: nomor kartu, **nama kartu**, **tipe fisik** (`BCA_FLAZZ`, `MANDIRI_EMONEY`, `BRI_BRIZZI`, `BNI_TAPCASH`), **kategori kartu** (peran: `UTAMA`/`CADANGAN`), saldo, cabang, **Supir Pemegang (Default)**, dan status. Nilai supir pemegang default disimpan di kolom `default_driver_id` sehingga tidak hilang saat kartu diserahkan/dikembalikan.
- Catat **Isi Ulang (Top-Up)**, **Pengeluaran Tol**, dan **Rekonsiliasi** saldo, serta pantau **Penggunaan** kartu.
- **Alur input disederhanakan:** biaya tol kini dimasukkan **langsung di formulir *Input Laporan* harian** (bagian "Tol"), bukan lewat menu terpisah. Saat laporan BBM disimpan dengan pembayaran Flazz, sistem otomatis mencatat pengeluaran BBM **dan** tol ke kartu, sekaligus **otomatis membuat catatan penyerahan kartu ke supir** (`Flazz_Usage`, status `DIBERIKAN`) bila kartu belum sedang digunakan — sehingga tidak perlu input manual. Menu/form input manual *Penggunaan* dan *Tol* sudah dihapus dari UI, tetapi riwayat pemantauannya tetap tersedia di tab Riwayat Flazz.
- Transaksi top-up/tol (termasuk saat diedit) otomatis mencatat **tanggal + jam asli** saat transaksi dibuat/diubah — bukan sekadar tanggal tengah malam. Data tanggal yang hanya berisi tanggal ditampilkan tanpa jam palsu `00:00`.
- **Status Kartu Etoll di Dashboard Umum:** ringkasan **Total Kartu Aktif**, **Total Saldo**, dan **Top Up Terakhir** beserta tabel status kartu kini tampil pada Dashboard Umum (halaman landing), bukan halaman terpisah.
- **Full Reconciliation:** sistem menghitung saldo sistem otomatis dari ledger per periode pemakaian sejak kartu diserahkan (saldo awal + top-up − BBM − tol), lalu dibandingkan dengan saldo fisik → status **`SESUAI`** / **`PERLU_PEMERIKSAAN`**, menandai kartu tersedia kembali, menyimpan riwayat rekonsiliasi, dan **memulihkan supir pemegang ke nilai default** (`default_driver_id`). Pratinjau "Saldo Di Sistem" di form memakai rumus ledger yang sama dengan server, sehingga angka yang terlihat sebelum disimpan == angka yang tersimpan.
- **Soft-delete:** kartu dinonaktifkan (status `NONAKTIF`) alih-alih dihapus permanen; top-up/tol juga di-soft-delete dengan pengembalian saldo otomatis. Data finansial tidak pernah dihapus permanen.
- **Validasi:** nomor kartu unik, nominal top-up/tol > 0, saldo tidak boleh negatif, dan nama kartu wajib untuk kartu `UTAMA`.
- **Pre-fill formulir laporan:** form *Input Laporan* otomatis terisi tanggal hari ini serta data laporan harian terakhir (kendaraan, supir, bar BBM, biaya/liter, metode bayar, dll.).
- **Performa:** Data dimuat sekali lalu di-cache di sisi client agar perpindahan tab menu Flazz cepat, dan otomatis di-refresh setelah aksi simpan/hapus.
- **List Flazz (Laporan Per Kartu):** menu **List Flazz** menampilkan ringkasan **Saldo Awal, Total Pengeluaran, dan Saldo Akhir** per kartu dengan filter tanggal. Klik kartu membuka **detail modal** (Top Up, Rincian Pengeluaran Tol+BBM, Rekonsiliasi Harian) dan tombol **Cetak A4** untuk mencetak laporan lengkap (header kartu, summary harian, tabel Top Up/Rincian/Rekonsiliasi) langsung dari browser.
- **Saldo Awal dari Rekonsiliasi:** pada listing dan laporan cetak, **Saldo Awal** memakai `opening_balance` dari record Rekonsiliasi pada tanggal tersebut (akurat terhadap selisih/saldo fisik), dengan fallback ke rumus `saldo_akhir + pengeluaran − topup` bila belum ada rekonsiliasi.
- **Pengeluaran termasuk tol dari transaksi BBM:** total pengeluaran harian (kolom *Pengeluaran*, summary A4, dan rumus saldo awal fallback) menjumlahkan **biaya BBM + biaya tol** dari laporan `Penggunaan_BBM` ber-metode `FLAZZ` bersama pengeluaran Tol mandiri (`Flazz_Tol`) — konsisten dengan perhitungan ledger server, sehingga saldo awal tidak kekurangan nominal tol.
- **Fallback saldo awal bila opening rekonsiliasi 0:** jika record Rekonsiliasi tanggal tersebut punya `opening_balance` **0** (mis. rekonsiliasi tanggal laporan dikerjakan belakangan sehingga usage yang direkam tidak relevan), listing & cetak memakai rumus fallback `saldo_akhir + pengeluaran − topup` alih-alih menampilkan 0 yang menyesatkan.
- **Rekonsiliasi backend merekonstruksi saldo awal:** saat menyimpan Rekonsiliasi (`saveFlazzRecon`), bila `opening_balance` dari `Flazz_Usage` bernilai 0/kosong, saldo awal direkonstruksi dari ledger (`saldo kini + pengeluaran periode − topup periode`) agar tersimpan nilai yang bermakna, bukan 0.
- **Pencocokan tanggal aman zona waktu:** seluruh filter tanggal (BBM, Tol, Top Up, Rekonsiliasi) di listing/print membandingkan tanggal dalam zona waktu lokal, sehingga transaksi yang dicatat pada tanggal tertentu tidak hilang karena pergeseran UTC.

### Smart OCR Odometer
- Upload foto odometer awal dan akhir.
- OCR cerdas otomatis menyaring angka *speedometer* (batas kecepatan) dan hanya mengekstrak angka panjang KM dari foto odometer.
- Modal preview hasil OCR dengan perhitungan otomatis sebelum disimpan.

### Galeri Foto Operasional
- Menampilkan foto odometer, struk BBM, struk tol, dan indikator BBM.
- **Filter Pintar:** Terdapat filter dropdown untuk menyeleksi dan memfokuskan tampilan pada jenis foto tertentu secara cerdas.

### Jalur Pengiriman
- **Autocomplete Driver:** field driver (Input Laporan & Buat Jadwal) berupa input teks dengan dropdown *autocomplete*; memilih driver otomatis memicu *pre-fill* untuk kendaraan (secara default), sementara data form lainnya otomatis menyesuaikan *history* terakhir supir tersebut.
- **Dua Driver per Kendaraan:** Mendukung penugasan hingga 2 driver sekaligus (Driver 1 & Driver 2 opsional) untuk jalur/pengiriman jarak jauh, terutama untuk gudang pusat.
- **Buat Jadwal:** form multi-baris untuk mencatat jadwal pengiriman harian — tanggal, driver 1, driver 2, kendaraan, dan rute tujuan. Satu tanggal bisa menampung banyak baris/entri sekaligus.
- **Daftar Jadwal & Manajemen:** halaman khusus `Daftar Jadwal Pengiriman` (tanpa filter tanggal) yang meload seluruh data *history* jadwal. Mendukung fitur **Edit & Hapus** baris jadwal (soft-delete).
- **Summary per Tanggal (Read-only):** halaman *Summary* bersih tanpa tombol aksi (cocok untuk dokumentasi/laporan screenshot), dilengkapi dengan format *header* rapi (Jalur Pengiriman, Tanggal Pengiriman, Dibuat oleh [Nama Admin]).
- **Screenshot Praktis:** tombol *Screenshot* merender tabel *summary* menjadi pratinjau gambar (menggunakan *html2canvas* lokal) yang bisa **disalin (Ctrl+C)** dan ditempel (Ctrl+V) langsung ke WhatsApp tanpa harus mengunduh file secara manual.
- **Reminder Dokumen Lengkap:** Mengintegrasikan 3 data jatuh tempo dokumen dari master Kendaraan: **Pajak Tahunan**, **Pajak 5 Tahunan**, dan **KIR** (khusus mobil). *Listing summary* akan memunculkan *badge* status (aman/waspada/kritis/lewat) untuk setiap kendaraan yang bertugas.

### Deteksi Level BBM (AI/Gemini)
- Foto **indikator bensin analog** dianalisis otomatis dengan **Gemini API** untuk menentukan level BBM dan tingkat keyakinan (confidence), dengan status kesesuaian.
- **Config:** Simpan kunci API pada **Script Properties** dengan key `GEMINI_API_KEY` (tidak disimpan di repositori). Model yang digunakan: `gemini-3.6-flash`.

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
1. Buka file **`DatabaseSetup.js`** di Editor Apps Script.
2. Pilih fungsi **`setupDatabase`** pada menu dropdown di atas editor, lalu tekan tombol **Run**.
   > Sistem akan membuat semua sheet: `Cabang`, `Supir`, `BBM`, `Pengguna`, `Kendaraan` (termasuk kolom `tanggal_pajak`), `Penggunaan_BBM`, `Pengisian_BBM`, `Foto_Evidence`, `Audit_Log`, `Konfigurasi`, `Dashboard`, `Pengaturan`, sheet modul Flazz (`Flazz_Card`, `Flazz_Usage`, `Flazz_TopUp`, `Flazz_Tol`, `Flazz_Reconciliation`), serta sheet `Jalur_Pengiriman`.
   > `setupDatabase` bersifat **idempotent**: untuk sheet yang sudah ada, ia hanya menambahkan kolom yang belum ada (mis. `card_name`, `card_role`, `is_deleted`) di ujung kanan tanpa menggeser data lama. Jalankan ulang setelah setiap pembaruan skema untuk menerapkan kolom baru ke sheet lama.
3. (Opsional) Jalankan **`seedDummyData`** untuk mengisi data percobaan.

### 4. Pengembangan & Deploy dengan clasp
Proyek ini dikembangkan dan di-deploy menggunakan **clasp** dari folder `src`:

```bash
cd src

# Login & inisialisasi (sekali saja)
clasp login
clasp create --type standalone

# Push semua kode ke Apps Script
clasp push

# Buat deployment Web App baru (versi baru setiap perubahan)
clasp deploy -d "deskripsi perubahan"
```

> **Menjaga URL Web App tetap sama:** Untuk memperbarui ke link yang sudah dipakai tanpa mengganti URL, deploy ulang ke **deployment ID yang sama**:
> ```bash
> clasp deploy --deploymentId <DEPLOYMENT_ID> -d "deskripsi perubahan"
> ```
> Deployment ID diambil dari hasil `clasp deploy` / daftar `clasp deployments`.

> **Catatan:** Setiap `clasp push` diikuti `clasp deploy` menghasilkan deployment baru. Kotak capaian deployment dibatasi (maksimal 20); jika penuh, hapus deployment lama dengan `clasp undeploy <deploymentId>` lalu buat yang baru.

### 5. Menghubungkan ke Spreadsheet
Ubah konstanta **Spreadsheet ID** di `DatabaseSetup.js` (dan `SpreadsheetOps.js`/`Code.js` jika diperlukan) dengan ID Spreadsheet Anda, lalu jalankan `setupDatabase`.

### 6. Deploy Web App (Manual dari Editor)
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
| `Code.js` | Backend utama, hubungkan UI dengan fungsi database; wrapper API, deteksi level BBM (Gemini), dan pre-fill formulir (`getLastLaporanPrefill`). |
| `DatabaseSetup.js` | Inisialisasi tabel & struktur Google Sheets + migrasi kolom idempotent. |
| `SpreadsheetOps.js` | CRUD ke Google Sheets. |
| `DriveOps.js` | Penyimpanan foto ke Google Drive. |
| `OCRService.js` | Ekstraksi teks dari foto odometer (OCR). |
| `FlazzOps.js` | CRUD kartu & transaksi Flazz (header-safe), soft-delete, dan logika rekonsiliasi penuh ke Google Sheets (termasuk rekonstruksi saldo awal dari ledger bila opening usage 0). |
| `JalurOps.js` | CRUD jadwal pengiriman (header-safe) + helper perhitungan sisa hari pajak kendaraan. |
| `Index.html` | Struktur UI utama (Bootstrap 5 + mobile-first), halaman Dashboard Umum, & navigasi. |
| `js.html` | Logika interaksi sisi client (JavaScript), termasuk rendering Dashboard Umum & pre-fill formulir laporan. |
| `css.html` | Gaya desain custom (responsive, mobile-first). |
| `Settings.html` | Halaman pengaturan aplikasi (logo, nama, perusahaan, footer). |
| `FlazzPages.html` | Halaman UI modul Flazz (dashboard, kartu, top-up, rekonsiliasi, riwayat). |
| `FlazzScript.html` | Logika interaksi sisi client untuk modul Flazz (termasuk tab riwayat & rekonsiliasi, edit top-up/tol, List Flazz, pencocokan tanggal aman zona waktu, dan cetak laporan A4). |
| `JalurPages.html` | Halaman UI modul Jalur Pengiriman (buat jadwal & summary per tanggal). |
| `JalurScript.html` | Logika interaksi sisi client untuk modul Jalur Pengiriman (render jadwal, screenshot, share WA). |
| `Html2canvasLib.html` | Library html2canvas lokal (di-embed client-side) untuk pratinjau screenshot summary agar bisa disalin ke WhatsApp. |

## Konfigurasi Tambahan

| Key | Lokasi | Keterangan |
|-----|--------|------------|
| `GEMINI_API_KEY` | **Script Properties** | Kunci API Gemini untuk deteksi level BBM (model `gemini-3.6-flash`). Tidak boleh disimpan di repositori. |

**Spreadsheet ID** dikonfigurasi di `FlazzOps.js` (`SpreadsheetApp.openById`) dan via `getDB()` di `SpreadsheetOps.js` / `DatabaseSetup.js`.

---

*Dikembangkan untuk monitoring dan efisiensi operasional harian perusahaan.*
