# Sistem Monitoring BBM & Operasional Harian

Aplikasi berbasis web (Google Apps Script) untuk memudahkan pencatatan dan pemantauan operasional kendaraan dinas/harian, meliputi pencatatan kilometer (odometer), konsumsi bahan bakar (BBM), dan biaya tol secara terpusat.

## Fitur Utama

### Multi-Role Access (Role-Based)
- **SUPERADMIN:** Akses penuh ke seluruh cabang, semua history, data master, dan pengaturan aplikasi.
- **PIC CABANG:** Hanya bisa mengelola laporan untuk kendaraan dan supir di cabangnya sendiri.
- **Pembatasan Data per Cabang (Server-side, isolasi penuh):** seluruh fungsi pembaca **tidak lagi menerima `role`/`cabang` dari caller** — identitas di-derivasi dari token sesi di sisi server (`requireUser`), sehingga pemalsuan peran/cabang langsung via `google.script.run` batal. Untuk pengguna **selain SUPERADMIN**, endpoint data Flazz/Jalur/ringkasan transaksi menolak sesi tak valid atau hanya mengembalikan data cabang sendiri (mis. `getActiveVehicles`, `getActiveDrivers`, `getActiveBBMForCabang`, `getFlazzCards`, `getFlazzDashboardData`, `getJalurByTanggal`, `getRecentTransactions`, `getMonthlySummary`, `getPerformaSummary`); `getCabangList` dan `getAllUsers` kini **SUPERADMIN-only** (non-super ditolak). Diverifikasi test suite `__runAllTests` (17 assert, ALL PASS).
- **Pembatasan dropdown cabang (frontend):** pada formulir Master (**Kendaraan** & **Supir**), dropdown pilih cabang hanya menampilkan cabang miliknya bagi **PIC CABANG**; SUPERADMIN melihat semua cabang. Server tetap memverifikasi (`assertOwnWarehouse`) sehingga request dengan cabang asing ditolak.
- **Filter Supir mengikuti cabang (History Laporan):** pada History Laporan & Galeri Foto, saat SUPERADMIN memilih cabang pada filter *who*, dropdown filter supir otomatis disaring ke supir yang terdaftar di cabang tersebut (`refreshSupirFilter`) — tidak lagi menampilkan supir seluruh cabang sekaligus.
- **Foto dibatasi per cabang:** upload foto bukti (odometer, struk) diverifikasi jenis file (MIME gambar) dan disimpan ke folder Drive sesuai cabang transaksi; PIC tidak dapat menyimpan foto ke cabang lain.
- **PIC CABANG akses operasional terbatas (edit/hapus tetap SUPERADMIN-only):** PIC tetap bisa input laporan harian baru & membuat jalur pengiriman, serta mengelola master Supir/Kendaraan/Kartu Flazz cabangnya sendiri dan melihat semua view cabangnya. Aksi operasional berikut dikunci **SUPERADMIN** di sisi server (`assertSuperadminOnly`) dan tombolnya disembunyikan untuk PIC: edit/hapus laporan harian, edit/hapus jalur pengiriman, edit/hapus top-up, catat tol / penyerahan Flazz manual, hapus rekonsiliasi, hapus BBM dari Flazz, dan util editor destruktif (`cleanupOrphanPhotos`, `backfillJalurStatus`, `backfillFlazzCardName`, `debugFlazzCard`, `configureSpreadsheet`, `migrateLegacyPasswords` — dijaga token + guard SUPERADMIN). PIC CABANG kini dapat **mencatat top up** dan **melakukan rekonsiliasi** Flazz untuk kartu warehouse-nya sendiri (create-only; menu Top Up & Rekonsiliasi tampil untuk semua role), tetap di-scope oleh `assertFlazzAccess`.
- **Pengaman hapus master (anti kehilangan data):** menghapus **Supir/BBM/Cabang** kini **soft-delete** (status menjadi `Non-Aktif`; baris tetap tersimpan) agar riwayat penggunaan yang sudah tercatat tidak kehilangan referensi. Menghapus **Cabang** diblo-kir selama masih ada data terkait (Kendaraan, Supir, BBM, Pengguna, Penggunaan_BBM, Jalur_Pengiriman, Flazz_Card) yang merujuk kode cabang tersebut.
- **Kode cabang immutable:** mengubah kode cabang (primary key) pada edit master ditolak server - hanya nama/lokasi yang boleh diubah; kode duplikat juga ditolak.
- **Validasi kartu pada Edit Top-Up/Tol:** bila posisi Top-Up/Tol dipindahkan ke kartu lain, server memverifikasi kartu tujuan benar ada di master **dan** (untuk PIC) berada dalam cabang yang boleh diakses; kartu tak dikenal/tak berhak ditolak sebelum saldo dipindahkan.

### Mobile-First Responsive Design
- Bottom navigation bar (mobile) / **sidebar** (desktop).
- **Navigasi terkelompok per fungsi (sidebar desktop):** sidebar disusun berdasarkan alur proses operasional: **Dashboard** (posisi teratas) → **JALUR PENGIRIMAN** (Buat Jalur, Daftar Jalur, Summary Pengiriman) → **LAPORAN OPERASIONAL KENDARAAN** (Input Laporan, History Laporan, Galeri Foto, Performa Kendaraan) → **KARTU FLAZZ** (Top Up, Rekonsiliasi, List Flazz & Saldo, Riwayat Transaksi) → **ADMIN** (Data Master, Pengaturan). Urutan ini mencerminkan alur kerja harian: jadwal → input → monitoring.
- **Sub-menu tetap terbuka antar menu:** pada sidebar desktop, grup menu yang sedang aktif tidak tertutup otomatis saat berpindah antar item dalam grup yang sama (mis. tetap di grup JALUR PENGIRIMAN saat pindah Buat Jalur → Daftar Jalur); grup tertutup hanya saat berpindah ke menu dari grup lain.
- **Bottom navigation (mobile):** bar bawah berisi tombol **Dashboard** (langsung) serta tombol *drawer* **Jalur**, **Input**, **History**, dan **Flazz** yang membuka sub-menu di atas bar. Grup *drawer* sedikit berbeda dari sidebar desktop: **Input** berisi *Input Laporan* + *Performa Kendaraan*, sedangkan **History** berisi *History Laporan* + *Galeri Foto*. Tombol **Master** & **Pengaturan** tampil di bar bawah sesuai peran.
- Card-based form input bergaya modern dengan preview foto dan layout 2-kolom dinamis di perangkat Desktop/PC.
- Dashboard tampilan cards (mobile) atau table (desktop).
- Toast notification untuk semua aksi (bukan alert).
- **Dialog & validasi 100% custom UI:** seluruh dialog native browser (`confirm()`/`alert()`/`prompt()`) dan bubble validasi HTML5 (`reportValidity`, form tanpa `novalidate`) dihapus — diganti modal konfirmasi reusable `showConfirmModal` (pesan multi-baris `white-space: pre-line`) + toast, sehingga tampil konsisten di desktop & mobile.
- **Responsif viewport 360-414px:** tidak ada halaman terpotong horizontal — tabel detail Flazz dibungkus `table-responsive`, bottom-nav ramping dengan `overflow-x` (semua tombol SUPERADMIN reachable), pencarian "Daftar Kartu Flazz" tidak lagi fixed-width, panel instrumen & grid modal master memakai `col-12 col-md-6`/`col-sm-6`, dan header info pengguna di-truncate.

### Dashboard Umum (Halaman Landing)
- Setelah login, aplikasi langsung masuk ke **Dashboard Umum** (menggantikan Dashboard Flazz sebagai landing page).
- **Greeting dinamis:** sapaan berdasarkan waktu (Selamat Pagi/Siang/Sore/Malam) beserta nama pengguna dan tanggal hari itu.
- **Akses Cepat (Quick Access):** tombol-tombol pintasan ke halaman utama (Input Laporan, History Laporan, Buat Jalur, Daftar Jalur, Galeri Foto, Top Up Flazz, Rekonsiliasi Flazz, Performa Kendaraan, serta Data Master & Pengaturan sesuai peran).
- **Smart Warning (Peringatan Cerdas):** Banner peringatan otomatis berwarna kuning akan muncul jika terdapat kartu Flazz yang masih berstatus **SEDANG_DIGUNAKAN**, untuk mengingatkan admin melakukan rekonsiliasi (dengan tautan langsung ke menu Rekonsiliasi). Peringatan akan hilang setelah semua kartu beres direkonsiliasi.
- **Galeri Foto Terbaru:** strip foto operasional terbaru (maks. 6 foto) dengan tautan "Lihat Semua" ke halaman Galeri Foto.
- **Status Kartu Etoll:** tiga kartu ringkasan (**Total Kartu Aktif**, **Total Saldo Seluruh Kartu**, **Top Up Terakhir**) plus tabel status kartu saat ini (nomor, tipe, driver/kendaraan, saldo, status) dengan tombol *Refresh*.
- History Laporan menjadi halaman sendiri (menu `History Laporan` di grup **LAPORAN OPERASIONAL KENDARAAN**).

### Auto-Calculate BBM & Efisiensi Pintar
- Menghitung jarak tempuh otomatis (KM Akhir - KM Awal).
- Menghitung liter BBM otomatis (input nominal pengeluaran BBM, liter terhitung berdasarkan harga master).
- Menghitung total harga BBM secara dinamis jika diubah.
- **Smart Fuel Efficiency:** Menghitung efisiensi bahan bakar (KM/Liter) menggunakan rumus penurunan indikator Bar Bensin dan Kapasitas Tangki dari master Kendaraan. Bahkan jika hari itu tidak mengisi bensin (0 L), efisiensi tetap terhitung akurat berdasarkan penurunan Bar.
- **Estimasi KM Kendaraan Jarum (Odometer Rusak):** untuk kendaraan berindikator `ANALOG_JARUM` yang odometernya tidak terbaca, KM dihitung **estimasi** dari pemakaian BBM: `literKonsumsi = liter_beli + penurunan level × kapasitas_tangki` (skala penurunan level = selisih slider 0-100% / 100 untuk jarum, atau bar/`jumlah_bar` untuk Digital Bar). Hasilnya `estKm = literKonsumsi × standar_km_l`, disimpan dengan penanda `km_sumber = 'ESTIMASI'` (transaksi normal = `'AKTUAL'`) sehingga riwayat tetap bisa dibedakan.

### Master Data Dinamis
- **Cabang:** Kode, nama, lokasi, status.
- **Kendaraan:** Plat nomor, nama, jenis (Mobil/Motor), kapasitas tangki, jumlah bar, standar KM/L, jenis indikator (digital/analog), cabang, tanggal pajak (tahunan, 5 tahunan, KIR), serta estimasi jarak satu tangki (`kapasitas_tangki × standar_km_l`).
  - Pada formulir *Input Laporan*, penampilan field level BBM menyesuaikan jenis indikator:
    - **Digital Bar:** input angka **Bar Bensin Awal/Akhir** (maksimal sesuai `jumlah_bar`).
    - **ANALOG_JARUM:** diganti **slider Level Bensin 0-100%** (E=0, F=100) untuk merekam posisi jarum saat berangkat (`bar_awal`) dan pulang (`bar_akhir`); server menghitung konsumsi dengan skala `jumlah_bar = 100`.
    - **TIDAK_ADA / DIGITAL_ANGKA / LAINNYA:** field level BBM disembunyikan sepenuhnya; konsumsi BBM hanya dari liter beli.
  - **Cabang transaksi mengikuti kendaraan:** saat laporan BBM disimpan, kode cabang transaksi diambil dari cabang **kendaraan** (bukan cabang user), sehingga SUPERADMIN/PIC yang memasukkan laporan kendaraan lintas cabang tetap tercatat pada cabang yang benar.
- **Supir:** Nama, cabang, dan relasi kendaraan default.
- **BBM:** Jenis, harga per liter. **Harga dapat di-override per cabang** — baris dengan `kode_cabang` terisi berhak atas harga yang lebih spesifik dari harga global (kosong = global). Formulir input laporan otomatis memakai daftar jenis & harga sesuai cabang pengguna/transaksi via `getActiveBBMForCabang`.
- **Manajemen Lengkap (CRUD):** Tambah, Edit, dan Hapus (Delete) dengan Bootstrap Modals interaktif untuk semua kategori.

### Kartu & Transaksi Flazz
- Kelola **Kartu Flazz**: nomor kartu, **nama kartu**, **tipe fisik** (`BCA_FLAZZ`, `MANDIRI_EMONEY`, `BRI_BRIZZI`, `BNI_TAPCASH`), **kategori kartu** (peran: `UTAMA`/`CADANGAN`), saldo, cabang, **Supir Pemegang (Default)**, dan status. Nilai supir pemegang default disimpan di kolom `default_driver_id` sehingga tidak hilang saat kartu diserahkan/dikembalikan.
- Catat **Isi Ulang (Top-Up)**, **Pengeluaran Tol**, dan **Rekonsiliasi** saldo, serta pantau **Penggunaan** kartu.
- **Top Up Praktis:** Proses Top Up tidak lagi mewajibkan unggah bukti foto untuk menyederhanakan alur admin.
- **Validasi Top-Up sebelum konfirmasi:** tombol **Proses Top Up** menolak dengan toast bila belum memilih kartu (`Pilih kartu terlebih dahulu.`) atau nominal kosong/tidak valid (`Masukkan nominal top up yang valid.`) — modal tinjau hanya muncul saat data lengkap & valid.
- **Alur input disederhanakan:** biaya tol kini dimasukkan **langsung di formulir *Input Laporan* harian** (bagian "Tol"), bukan lewat menu terpisah. Saat laporan BBM disimpan dengan pembayaran Flazz, sistem otomatis mencatat pengeluaran BBM **dan** tol ke kartu, sekaligus **otomatis membuat catatan penyerahan kartu ke supir** (`Flazz_Usage`, status `DIBERIKAN`) bila kartu belum sedang digunakan — sehingga tidak perlu input manual. Menu/form input manual *Penggunaan* dan *Tol* sudah dihapus dari UI, tetapi riwayat pemantauannya tetap tersedia di tab Riwayat Flazz. **Koreksi (edit) atas laporan yang sudah FLAZZ tidak membuat catatan penyerahan ulang** dan tidak mengubah status kartu (menghindari kartu yang sudah dikembalikan kembali berstatus `SEDANG_DIGUNAKAN` hanya karena diedit).
- **Edit laporan = koreksi yang aman (server-side):** mengedit laporan **tidak menghapus kartu secara diam-diam** — saat pembayaran FLAZZ dan form tidak mengirim `flazz_card_id`, kartu lama dipertahankan (tidak ada refund saldo otomatis); menjadi FLAZZ wajib memilih kartu yang sah (harus ada di master dan, untuk PIC, berada dalam cabang yang boleh diakses); koreksi yang membuat saldo kartu **negatif ditolak** dengan pesan jelas. Perubahan nominal menyelaraskan **saldo kartu** dan **`opening_balance`** pada `Flazz_Usage` berstatus `DIBERIKAN` (keduanya diputar selisih), sementara **`timestamp` laporan dipertahankan** agar periode ledger tidak bergeser. Semantik *edit = koreksi parsial*: field nominal yang tidak dikirim mempertahankan nilai lama, bukan diubah jadi 0.
- **Gate Rekonsiliasi cocok dengan penyerahan otomatis:** `used_at` penyerahan yang dibuat otomatis disamakan dengan **timestamp laporan** (bukan waktu simpan), dan gate menerima laporan dengan timestamp **`>= used_at`**. Akibatnya laporan yang justru menciptakan penyerahan kartunya sendiri tetap diakui sebagai periode berjalan — **tidak ada lagi laporan ber-FLAZZ yang meminta diinput ulang setelah diedit** padahal datanya sudah ada di sheet.
- Transaksi top-up/tol (termasuk saat diedit) otomatis mencatat **tanggal + jam asli** saat transaksi dibuat/diubah — bukan sekadar tanggal tengah malam. Data tanggal yang hanya berisi tanggal ditampilkan tanpa jam palsu `00:00`.
- **Penautan `Flazz_Usage` ke sumber (ref_type/ref_id):** setiap catatan penyerahan kartu kini menyimpan sumber-nya (`TRX` = laporan BBM harian, `JALUR` = jadwal pengiriman). Saat **transaksi harian BBM-FLAZZ dihapus** atau **kartu dilepas dari laporan**, hanya penyerahan milik transaksi itu yang dikembalikan (`DIKEMBALIKAN`) — penyerahan yang dibuat oleh **Jalur Pengiriman** tidak terganggu, sehingga tidak ada lagi kartu "menggantung" setelah laporan dihapus.
- **Status Kartu Etoll di Dashboard Umum:** ringkasan **Total Kartu Aktif**, **Total Saldo**, dan **Top Up Terakhir** beserta tabel status kartu kini tampil pada Dashboard Umum (halaman landing), bukan halaman terpisah.
- **Full Reconciliation:** sistem menghitung saldo sistem otomatis dari ledger per periode pemakaian sejak kartu diserahkan (saldo awal + top-up − BBM − tol), lalu dibandingkan dengan saldo fisik → status **`SESUAI`** / **`PERLU_PEMERIKSAAN`**, menandai kartu tersedia kembali, menyimpan riwayat rekonsiliasi, dan **memulihkan supir pemegang ke nilai default** (`default_driver_id`). Pratinjau "Saldo Di Sistem" di form memakai rumus ledger yang sama dengan server, sehingga angka yang terlihat sebelum disimpan == angka yang tersimpan.
- **Soft-delete & Reaktivasi:** kartu dapat dinonaktifkan (status `NONAKTIF`) dan dimunculkan kembali dengan tombol "Aktifkan Kembali" di Data Master. Transaksi top-up/tol juga dapat di-soft-delete dengan pengembalian saldo otomatis.
- **Validasi:** nomor kartu unik, nominal top-up/tol > 0, saldo tidak boleh negatif, dan nama kartu wajib untuk kartu `UTAMA`.
- **Sinkronisasi Nama Kartu ke Jalur:** saat nama kartu etoll diubah, nama baru otomatis diterapkan (**backfill**) ke seluruh baris `Jalur_Pengiriman` yang memakai kartu tersebut, sehingga nama kartu tetap konsisten di semua riwayat — memudahkan request top-up saldo ke finance.
- **Pre-fill formulir laporan:** form *Input Laporan* otomatis terisi tanggal hari ini serta data laporan harian terakhir (kendaraan, supir, bar BBM, biaya/liter, metode bayar, dll.).
- **Performa Kendaraan:** efisiensi BBM (KM/Liter) dihitung per kendaraan dalam **jendela bergulir 7 transaksi terakhir**, ditampilkan per periode dengan penilaian terhadap standar (`Di bawah standar` / `Sesuai standar` / `Di atas standar`). Data di-cache di sisi client agar perpindahan tab cepat dan otomatis di-refresh setelah aksi simpan/hapus.
- **Limiter field Kapasitas Bar:** saat mengganti kendaraan pada formulir, nilai **Bar Bensin Awal/Akhir** diberi batas maksimal (max) sesuai `jumlah_bar` kendaraan agar tidak melebihi kapasitas.
- **Daftar Jalur difilter tanggal:** halaman Daftar Jalur Pengiriman kini memiliki kartu filter tanggal + tombol *Tampilkan* untuk mempersempit listing (lihat juga menu Jalur Pengiriman).
- **Loading state Edit Top-Up/Tol:** tombol simpan modal Edit Top-Up & Edit Tol menampilkan spinner + dinonaktifkan saat proses berjalan, lalu pulih kembali setelah selesai/gagal.
- **Aksesibilitas (a11y):** tombol ikon (history, jalur, kartu flazz, top-up/tol/hapus), tombol tutup modal, dan tombol lain diberi `aria-label` yang informatif untuk pembaca layar.
- **List Flazz (Laporan Per Kartu):** menu **List Flazz & Saldo** menampilkan ringkasan **Saldo Awal, Total Pengeluaran, dan Saldo Akhir** per kartu dengan filter **rentang tanggal (Dari Tanggal s/d Sampai Tanggal)** — default sama menampilkan hari ini bila kedua input kosong, dan bila salah satu kosong dianggap sama dengan yang lain. Klik kartu membuka **detail modal** (Top Up, Rincian Pengeluaran Tol+BBM, Rekonsiliasi Harian) yang seluruh tabelnya ikut difilter sesuai periode terpilih, lengkap dengan **Total Top Up Periode** dan **Total Pengeluaran Periode** di baris paling bawah. Tombol **Cetak A4** mencetak laporan finance per periode yang sama — header "Periode: awal s/d akhir", summary box per periode (Saldo Awal, Total Top Up, Pengeluaran BBM, Pengeluaran Tol, Total Pengeluaran, Saldo Akhir), serta tabel Top Up/Rincian/Rekonsiliasi yang difilter rentang dengan tfoot total. Margin cetak kiri-kanan diperlebar ke 0,5 cm agar muat lebih banyak kolom.
- **Saldo Awal dari Rekonsiliasi:** pada listing dan laporan cetak, **Saldo Awal** memakai `opening_balance` dari record Rekonsiliasi pada tanggal tersebut (akurat terhadap selisih/saldo fisik), dengan fallback ke rumus `saldo_akhir + pengeluaran − topup` bila belum ada rekonsiliasi.
- **Pengeluaran termasuk tol dari transaksi BBM:** total pengeluaran harian (kolom *Pengeluaran*, summary A4, dan rumus saldo awal fallback) menjumlahkan **biaya BBM + biaya tol** dari laporan `Penggunaan_BBM` ber-metode `FLAZZ` bersama pengeluaran Tol mandiri (`Flazz_Tol`) — konsisten dengan perhitungan ledger server, sehingga saldo awal tidak kekurangan nominal tol.
- **Fallback saldo awal bila opening rekonsiliasi 0:** jika record Rekonsiliasi tanggal tersebut punya `opening_balance` **0** (mis. rekonsiliasi tanggal laporan dikerjakan belakangan sehingga usage yang direkam tidak relevan), listing & cetak memakai rumus fallback `saldo_akhir + pengeluaran − topup` alih-alih menampilkan 0 yang menyesatkan.
- **Rekonsiliasi backend merekonstruksi saldo awal:** saat menyimpan Rekonsiliasi (`saveFlazzRecon`), bila `opening_balance` dari `Flazz_Usage` bernilai 0/kosong, saldo awal direkonstruksi dari ledger (`saldo kini + pengeluaran periode − topup periode`) agar tersimpan nilai yang bermakna, bukan 0.
- **Pencocokan tanggal aman zona waktu:** seluruh filter tanggal (BBM, Tol, Top Up, Rekonsiliasi) di listing/print membandingkan tanggal dalam zona waktu lokal, sehingga transaksi yang dicatat pada tanggal tertentu tidak hilang karena pergeseran UTC.
- **Gate Rekonsiliasi (Laporan Valid):** Rekonsiliasi Flazz diblokir selama belum ada minimal **1 laporan FLAZZ yang valid** pada periode kartu — syaratnya foto **KM Awal & KM Akhir** terisi (untuk kendaraan berindikator Digital Bar juga mensyaratkan KM aktual > 0; untuk jarum cukup foto). Pengeluaran BBM/tol **boleh 0** dan laporan tetap valid selama foto KM ada. Gate diterapkan **backend + frontend**: form menampilkan status hijau/merah dan menonaktifkan tombol simpan bila syarat belum terpenuhi, dan server menolak rekonsiliasi meski dipaksa via API.
- **Tindakan pada Selisih (Adjust / Abai):** form Rekonsiliasi menyediakan pilihan **"Ubah saldo sistem mengikuti saldo fisik (Adjust)"** atau **"Abaikan selisih (Saldo sistem tetap)"**; saat status `SESUAI` tindakan otomatis **Abai**, saat ada selisih otomatis **Adjust**. Selisih ≤ Rp1 dianggap sesuai. Bila Adjust/SESUAI, saldo kartu diset ke saldo fisik; setelah rekonsiliasi kartu kembali `TERSEDIA` dan supir pemegang dipulihkan ke nilai default.

### Input KM & Laporan Cepat
- **Syarat Jalur Pengiriman (BELUM_DIISI):** laporan harian **hanya bisa disimpan** jika sudah ada entri Jalur Pengiriman berstatus **BELUM_DIISI** untuk kombinasi kendaraan + supir + cabang pada tanggal yang sama. Cek dijalankan **paling awal** — sebelum baris apa pun ditulis ke sheet / saldo Flazz dipotong — sehingga laporan yang ditolak tidak meninggalkan data parsial. Jalur ditandai **SUDAH_LAPORAN** hanya setelah baris laporan benar-benar tersimpan dan proses Flazz selesai.
- Upload foto odometer awal dan akhir secara langsung di formulir Input Laporan.
- **Input Fleksibel:** Pengguna dapat mengisi kolom KM manual tanpa harus melewati modal konfirmasi OCR. Aplikasi tidak lagi mengunci alur dengan mewajibkan klik tombol konfirmasi OCR.
- **Bebas Upload Struk:** Tidak perlu lagi repot mengunggah foto fisik struk BBM dan Tol di setiap laporan harian. Cukup ketik nominalnya.
- **Odometer Tidak Terbaca (Rusak):** pada kendaraan `ANALOG_JARUM` muncul checkbox **"Odometer tidak terbaca (rusak)"** terpisah untuk KM Awal dan KM Akhir. Jika dicentang, KM itu dihitung otomatis: `akhir = awal + estKm`, `awal = akhir − estKm`, atau bila kedua sisi rusak, me-referensi `km_akhir` transaksi terakhir sebagai anchor lalu ditambah `estKm`.
- **Konfirmasi Simpan Tanpa KM:** jika estimasi tidak mungkin dihitung (Standar KM/L kendaraan kosong **ATAU** tidak ada penurunan level dan tidak ada liter BBM), aplikasi meminta **konfirmasi** terlebih dahulu. Bila disetujui, laporan tetap tersimpan dengan `km_tempuh = 0` dan penanda `km_sumber = 'ESTIMASI'`; bila dibatalkan, simpan dibatalkan.
- **Pesan Error Spesifik:** kegagalan simulasi KM dibedakan penyebabnya ("Standar KM/L belum diisi" vs "liter BBM kosong") agar mudah diperbaiki.
- **Busy State + Watchdog:** tombol *Simpan* menampilkan **"Memproses..."** (spinner + dinonaktifkan saat RPC berjalan, mencegah double-submit). Safety timer 2 menit otomatis mengembalikan tombol, me-reset flag anti double-submit (`__bbmSubmitting`), dan memperingatkan pengguna bila proses macet — mencegah "loading forever".
- **Reset form menyeluruh (setelah simpan/batal):** seluruh field *Input Laporan* dikosongkan eksplisit — supir, kendaraan, jenis BBM, biaya, liter, biaya tol, metode kembali ke **Tunai**, kartu Flazz (BBM & tol) kembali ke **"Pilih Kartu..."**, bar/slider/KM, foto dashboard, dan `isi_bensin` — tanpa bergantung pada `form.reset()` untuk select yang options-nya dibangun secara dinamis di runtime.

### Galeri Foto Operasional
- Menampilkan foto odometer serta struk BBM/tol (foto indikator BBM dihapus dari alur laporan).
- **Filter Pintar:** Terdapat filter dropdown untuk menyeleksi dan memfokuskan tampilan pada jenis foto tertentu secara cerdas.
- **Pembersihan Foto Orphan:** Jika foto di Google Drive sudah dihapus tetapi URL-nya masih tersisa di kolom sheet (sehingga foto "hantu" masih tampil di galeri), jalankan fungsi **`cleanupOrphanPhotos`** di editor Apps Script untuk mengosongkan kolom foto yang file-nya tidak lagi ditemukan di Drive. Gunakan **`diagnoseOrphanPhotos`** terlebih dahulu untuk melihat daftar baris yang terdampak sebelum membersihkan.
- **Validasi & Kompresi Foto:** foto di-compress di sisi client (skala maks. 1280px, kualitas JPEG ~0.7) sebelum dikirim untuk menghemat storage dan mempercepat upload; server menolak file non-gambar (validasi MIME) sehingga ekstensi berbahaya tidak tersimpan.

### Jalur Pengiriman
- **Autocomplete Driver:** field driver (Input Laporan & Buat Jalur) berupa input teks dengan dropdown *autocomplete*; memilih driver otomatis memicu *pre-fill* untuk **kendaraan** (kendaraan default) **dan kartu etoll default** miliknya, sementara data form lainnya otomatis menyesuaikan *history* terakhir supir tersebut.
- **Dua Driver per Kendaraan:** Mendukung penugasan hingga 2 driver sekaligus (Driver 1 & Driver 2 opsional) untuk jalur/pengiriman jarak jauh, terutama untuk gudang pusat.
- **Buat Jalur:** form multi-baris untuk mencatat jadwal pengiriman harian — tanggal, driver 1, driver 2, kendaraan, kartu etoll (opsional), dan rute tujuan. Satu tanggal bisa menampung banyak baris/entri sekaligus.
- **Busy state & reset otomatis:** tombol **"Simpan Jadwal"** menampilkan **"Memproses..."** (spinner + dinonaktifkan) saat menyimpan, mencegah double-submit; setelah simpan berhasil, **tanggal pengiriman otomatis di-reset ke hari ini** agar siap mengisi jadwal baru.
- **Daftar Jalur & Manajemen:** halaman `Daftar Jalur Pengiriman` dengan **filter rentang tanggal (Dari/Sampai) + filter cabang** (SUPERADMIN) dan tombol *Tampilkan*. Mendukung fitur **Edit & Hapus** baris jadwal (**hard delete**: baris benar-benar dihapus dari sheet, bukan sekadar ditandai).
- **Summary per Tanggal (Read-only):** halaman *Summary* bersih tanpa tombol aksi (cocok untuk dokumentasi/laporan screenshot), dilengkapi dengan format *header* rapi (Jalur Pengiriman, Tanggal Pengiriman, Dibuat oleh [Nama Admin]).
- **Screenshot Praktis:** tombol *Screenshot* merender tabel *summary* menjadi pratinjau gambar (menggunakan *html2canvas* lokal) yang bisa **disalin (Ctrl+C)** dan ditempel (Ctrl+V) langsung ke WhatsApp; tersedia pula tombol **bagi ke WA** yang menyusun ringkasan teks per baris (`wa.me`).
- **Label status "Terjadwal":** badge status jalur `BELUM_DIISI` kini bertuliskan **Terjadwal** (ikon & warna tetap) di listing maupun screenshot summary untuk makna yang lebih netral/progresif; status `SUDAH_LAPORAN`/`SELESAI` tidak berubah.
- **Reminder Dokumen Lengkap:** Mengintegrasikan 3 data jatuh tempo dokumen dari master Kendaraan: **Pajak Tahunan**, **Pajak 5 Tahunan**, dan **KIR** (khusus mobil). Listing/summary memunculkan *badge* status (**TIDAK_ADA / LEWAT / KRITIS / WASPADA / AMAN**) untuk setiap kendaraan yang bertugas.

### Deteksi Level BBM (AI/Gemini) — dihapus dari alur laporan
- Foto **indikator bensin** + deteksi AI (Gemini) **tidak lagi menjadi bagian dari alur *Input Laporan* harian**. Kolom `foto_indikator`, `level_bbm`, `confidence_bbm`, `level_status`, dan `keterangan` dihapus dari sheet `Penggunaan_BBM` beserta seluruh pipeline-nya (upload, deteksi, pre-fill, galeri, filter).
- Pencatatan level kini **murni manual & terstruktur per jenis indikator**: **Digital Bar** pakai input Bar Awal/Akhir, **ANALOG_JARUM** pakai slider Level 0-100% (lihat *Auto-Calculate BBM & Efisiensi Pintar*).
- Fungsi backend `detectFuelLevel`/`apiDetectFuelLevel` masih tersedia di kode untuk penggunaan manual/editor (kunci `GEMINI_API_KEY` di Script Properties), tetapi **tidak dipanggil dari UI laporan**.

### Pengaturan Aplikasi (Superadmin)
- Upload logo aplikasi (tersimpan di Google Drive).
- Konfigurasi nama aplikasi, nama perusahaan, footer text.
- Filter cabang di form input untuk Superadmin (pilih cabang tertentu atau semua).
- Tema warna (Branding) kustom, seperti warna utama (primary color) hijau khas perusahaan.

### Keamanan Sesi
- **Login berbasis token server-side:** `doLogin` memvalidasi username+password, lalu menciptakan token sesi acak (12 jam, `SESSION_TTL_SECONDS`) yang disimpan di `CacheService` bersama identitas pengguna (`session:<token>`). Semua panggilan API dikirimkan parameter token; setiap endpoint memanggil `requireUser(token)` **di sisi server** untuk menentukan role/cabang — identitas tidak lagi dikirim/dipercaya dari client (`userInfo`).
- **Password ter-hash:** password disimpan sebagai `SHA-256` dengan salt (`salt$hash`); password legacy plaintext otomatis di-migrasi saat login pertama (satu kali), lalu pengguna mendapat pengingat via toast (`must_change`). Pengubahan/reset password dilakukan **SUPERADMIN** lewat Data Master → Pengguna (Edit); tidak ada halaman ganti-password mandiri bagi pengguna sendiri.
- **Akses publik aman:** Web App terdeploy sebagai `ANYONE_ANONYMOUS` aman karena seluruh fungsi butuh token sesi; satu-satunya fungsi tanpa token adalah `getAppSettings` yang hanya mengembalikan data non-sensitif. `USER_DEPLOYING` dipertahankan agar kode menulis spreadsheet & Drive milik deployer.
- **Rate limiting & audit:** login dibatasi (5×/5 menit per username), deteksi Gemini 30×/24 jam per user, dan peristiwa login/logout/update akun tercatat ke sheet `Audit_Log`.
- **Sesi berbasis localStorage:** token sesi disimpan di `localStorage` (`bbm_token`) bersama informasi tampilan (`bbm_user`); masa berlaku token 12 jam (`SESSION_TTL_SECONDS` di server, `SESSION_MAX_AGE_MS` di client). **Auto-logout idle 2 menit sudah dihapus** — aplikasi tidak lagi keluar otomatis saat tidak aktif; sesi berakhir sesuai TTL token (masa berlaku 12 jam dari login).
- **Escape output (anti-XSS):** seluruh data dinamis dirender client melalui fungsi `esc()`/`escUrl()`; nilai yang disisipkan ke atribut (mis. `onclick` dengan data JSON) memakai `JSON.stringify` agar karakter khusus seperti tanda kutip atau `<script>` tidak dieksekusi. Catatan: meta `Content-Security-Policy` via `addMetaTag` **tidak didukung** Google Apps Script (ditolak saat render), sehingga tidak digunakan.
- **Pemantauan kesehatan harian (HealthOps):** `dailyHealthReport()` mengirim ringkasan kesehatan sistem ke alamat email pada kolom `email` pengguna **SUPERADMIN** (kolom dibuat `setupDatabase`). Aktifkan dengan `setupDailyHealthTrigger()` (dijalankan manual sekali di editor); `sendAdminAlert` digunakan untuk sinyal kondisi abnormal.

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
   > `setupDatabase` bersifat **idempotent**: untuk sheet yang sudah ada, ia hanya menambahkan kolom yang belum ada (mis. `card_name`, `card_role`, `is_deleted`) di ujung kanan tanpa menggeser data lama. Khusus sheet `Penggunaan_BBM`, kolom yang sudah di-deprecate (`foto_indikator`, `level_bbm`, `confidence_bbm`, `level_status`, `keterangan`) **otomatis dihapus**; migrasi ini idempotent dan juga dipicu otomatis oleh `ensurePenggunaBBMColumns` saat penyimpanan/inisialisasi pertama.
3. Pilih fungsi **`createSuperadmin`** pada menu dropdown di atas editor, lalu klik **Run** untuk membuat akun **SUPERADMIN pertama**, lalu isi `user_id`, `username`, `nama`, dan `password` (tersimpan sebagai hash SHA-256) saat diminta.
   > (`seedDummyData` kini **hanya membuat akun PIC cabang** — akun SUPERADMIN `admin` tidak lagi bagian dari seed. Gunakan `createSuperadmin` untuk membangun akun admin dari nol.)
4. (Opsional) Jalankan **`seedDummyData`** untuk mengisi data percobaan.
5. (Disarankan) Setelah database terbentuk: jalankan sekali **`initDriveFolders()`** dan **`fixPhotoPermissions()`** (membuat struktur folder foto per cabang di Drive & memperbaiki izin agar galeri tampil), isi kolom **`email`** pada akun SUPERADMIN di sheet `Pengguna` (dipakai laporan kesehatan harian), lalu jalankan **`setupDailyHealthTrigger()`** agar `dailyHealthReport` terkirim otomatis.

> **Password legacy:** akun yang dibuat `seedDummyData` di versi lama (mis. `pic123`) masih tersimpan sebagai **plaintext legacy**. Saat user login pertama kali, sistem otomatis me-migrasinya ke hash dan menampilkan toast pengingat (`must_change`); pengguna disarankan meminta SUPERADMIN mengganti password-nya lewat Data Master → Pengguna (Edit). Jalankan `migrateLegacyPasswords()` di editor untuk konversi massal tanpa menunggu login.

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
3. Biarkan pengaturan mengikuti `src/appsscript.json`: **"Execute as" = Me (deployer / `USER_DEPLOYING`)** dan **"Who has access" = Anyone (`ANYONE_ANONYMOUS`)**.
4. Klik **Deploy** dan salin URL Web App yang dihasilkan.

## Akun Login (Saran Dummy)
Setelah `seedDummyData()`:
- **PIC Jakarta:** Username: `picjkt` | Password: `pic123`
- **PIC Bandung:** Username: `picbdg` | Password: `pic123`

Both seeded via `seedDummyData` kini sudah tersimpan sebagai **hash SHA-256** (bukan plaintext legacy). Password tetap disarankan segera diganti oleh SUPERADMIN (Data Master → Pengguna → Edit).

Akun SUPERADMIN dibuat terpisah lewat `createSuperadmin()` (bukan dari seed). Akun `admin`/`snd` tidak lagi eksis di kode maupun seed.

## Struktur File

| File | Deskripsi |
|------|-----------|
| `Code.js` | Backend utama; wrapper API berbasis token, pre-fill formulir (`getLastLaporanPrefill`), dan `doGet` merender UI (tanpa meta CSP karena tidak didukung GAS). |
| `AuditOps.js` | Pencatatan audit terpusat (login/logout, update akun, galat signifikan) ke sheet `Audit_Log`. |
| `BackupOperations.js` | Backup harian otomatis: `runDailyBackup()` (menyalin **seluruh sheet database** lewat `getBackupSheets()`, sumber nama dari `DATABASE_SHEETS`), `performBackup` (pure), `pruneBackups`, `diagnoseBackup`, dan `setupBackupTrigger`. |
| `CacheUtil.js` | Util cache `CacheService` + anti-race (single-flight) untuk data master/lookup; dipakai `SheetRead` & endpoint ringkasan. |
| `Config.gs` | Konstanten konfigurasi (`PROD_SPREADSHEET_ID`), `spreadsheetId()`, dan `configureSpreadsheet(ID)` untuk mengarahkan aplikasi ke salinan backup. |
| `DatabaseSetup.js` | Definisi skema (`DATABASE_SHEETS` & `DATABASE_SCHEMA`, single source of truth), inisialisasi tabel & struktur Google Sheets (termasuk kolom `email` pada `Pengguna` untuk laporan kesehatan) + migrasi kolom idempotent. |
| `DriveOps.js` | Penyimpanan foto ke Google Drive dengan validasi tipe gambar (MIME) & scope folder per cabang (`uploadImageToDrive`, `initDriveFolders`, `fixPhotoPermissions`). |
| `FlazzOps.js` | CRUD kartu & transaksi Flazz (header-safe), soft-delete, dan logika rekonsiliasi penuh ke Google Sheets. |
| `HealthOps.js` | Laporan kesehatan harian (`dailyHealthReport`) & notifikasi email admin (`superadminEmails`, `sendAdminAlert`) + `setupDailyHealthTrigger` (manual). |
| `JalurOps.js` | CRUD jalur pengiriman (header-safe) + helper sisa hari pajak kendaraan. |
| `Locks.js` | `LockService` untuk operasi tulis sensitif (transaksi, rekonsiliasi) agar aman dari tab ganda. |
| `RateLimit.js` | Rate limiting login (5×/5 menit) & deteksi Gemini (30×/24 jam). |
| `SessionAuth.js` | Token sesi server (`requireUser`, `SESSION_TTL_SECONDS`), hash password `SHA-256` + salt, migrasi password legacy. |
| `SheetRead.js` | Helper `readRowsCols` (baca kolom terbatas) agar cache konsisten & hemat kuota. |
| `SpreadsheetOps.js` | CRUD ke Google Sheets + enforcement cabang server-side (`assertOwnWarehouse`) + harga BBM per cabang + penerapan syarat Jalur Pengiriman `BELUM_DIISI` sebelum laporan harian disimpan. |
| `SummaryOps.js` | Materialisasi ringkasan bulanan per cabang ke tab `Dashboard` (sumber halaman dashboard & performa). |
| `TestRunner.js` | Test suite internal — jalankan **`__runAllTests`** dari editor Apps Script; mencakup rangkaian isolasi keamanan (`__runSecurityIsolationTests`, 17 assert, ALL PASS) untuk pembaca token-derived & aksi operasional SUPERADMIN-only, plus uji autentikasi, backup sheets, dan edit usage. |
| `Index.html` | Struktur UI utama (Bootstrap 5 + mobile-first): halaman Dashboard Umum, sidebar desktop + bottom nav mobile (grup/drawer), & navigasi. |
| `js.html` | Logika interaksi sisi client: render dashboard & formulir, pre-fill laporan, form indikator-aware (bar digital/slider jarum), dropdown cabang dibatasi peran (`cabangOptionsForRole`), sub-menu sidebar tetap terbuka, drawer bottom-nav, kompresi foto, watchdog 2 menit. |
| `css.html` | Gaya desain custom (responsive, mobile-first). |
| `Settings.html` | Halaman pengaturan aplikasi (logo, nama, perusahaan, footer). |
| `FlazzPages.html` | Halaman UI modul Flazz (dashboard, kartu, top-up, rekonsiliasi, riwayat, list & saldo). |
| `FlazzScript.html` | Logika interaksi sisi client untuk modul Flazz (termasuk tab riwayat & rekonsiliasi, gate laporan valid, tindakan Adjust/Abai, edit top-up/tol, List Flazz dengan filter rentang tanggal, pencocokan tanggal aman zona waktu, dan cetak laporan A4 per periode); dropdown cabang mengikuti peran pengguna. |
| `JalurPages.html` | Halaman UI modul Jalur Pengiriman (buat jalur, daftar jalur, summary per tanggal). |
| `JalurScript.html` | Logika interaksi sisi client untuk modul Jalur Pengiriman (render jalur, autocomplete driver, screenshot, share WA); filter/kolom cabang tampil hanya untuk SUPERADMIN. |
| `Html2canvasLib.html` | Library html2canvas lokal (di-embed client-side) untuk pratinjau screenshot summary agar bisa disalin ke WhatsApp. |

## Backup & Pemulihan

Backup harian otomatis menyalin **seluruh sheet database** (dari `DATABASE_SHEETS`: `Cabang`, `Supir`, `BBM`, `Pengguna`, `Kendaraan`, `Penggunaan_BBM`, `Pengisian_BBM`, `Foto_Evidence`, `Audit_Log`, `Konfigurasi`, `Dashboard`, `Pengaturan`, `Flazz_Card`, `Flazz_Usage`, `Flazz_TopUp`, `Flazz_Tol`, `Flazz_Reconciliation`, `Jalur_Pengiriman`) ke spreadsheet baru bernama `Monitoring_BBM_backup_<YYYY-MM-DD>` di dalam folder **`BBM_BACKUP`** (dibuat PRIVATE), lalu memangkas (prune) hanya menyimpan **14 backup terakhir**. Hasil backup di-cache dengan prefix `backup:` (TTL 300 detik).

> **Catatan:** daftar sheet yang di-backup disinkronkan otomatis dari `DATABASE_SHEETS` (`getBackupSheets()`), sehingga tidak ada lagi nama sheet warisan (`SESSION`/`PENGENDARA`) yang tidak ada di skema. Jika suatu sheet belum dibuat di spreadsheet, baris tersebut dilewati dan `runDailyBackup` melaporkan *"Backup parsial: N dari M sheet ter-copy"*.

### 1. Menyalakan Backup Otomatis (Manual dari Editor)
Fungsi `setupBackupTrigger()` **tidak dijalankan otomatis**. Untuk mengaktifkan, jalankan manual sekali dari editor Apps Script:
- Buka **`BackupOperations.js`** di Editor Apps Script.
- Pilih fungsi **`setupBackupTrigger`** pada dropdown di atas editor, lalu tekan **Run**.
- Fungsi akan membuat trigger berbasis waktu harian pukul **02:00 Asia/Jakarta** yang memanggil `runDailyBackup`. Jika trigger sudah ada, tidak dibuat duplikat.

> Alternatif: backup bisa juga dipicu manual kapan saja lewat `runDailyBackup()` di editor, atau lewat route **POST `/doPost`** dengan action `backup` (khusus SUPERADMIN, memakai token sesi) yang mengembalikan `kode: 'ok' | 'ramje' | 'copies'`. Route `diagnose_backup` menampilkan info backup terakhir.

### 2. RPO (Recovery Point Objective)
Maksimal **24 jam** — data yang hilang tidak dapat dipulihkan melebihi rentang backup harian terakhir.

### 3. Langkah Restore
1. Buka folder **`BBM_BACKUP`** di Google Drive, lalu pilih salinan spreadsheet dengan tanggal yang diinginkan (`Monitoring_BBM_backup_<tanggal>`).
2. Buka salinan tersebut dan **copy Spreadsheet ID** dari URL.
3. Jalankan fungsi **`configureSpreadsheet(ID_BARU)`** di editor Apps Script (lihat `Config.gs`) untuk mengarahkan aplikasi ke salinan backup.
4. **Uji login** dengan akun yang sudah ada untuk memastikan data terbaca benar.
5. Arahkan kembali deploy / spreadsheet produksi sesuai kebutuhan.

### 4. Catatan Keamanan
- Folder **`BBM_BACKUP`** dibuat dengan akses **PRIVATE**; jangan pernah membagikannya publik.
- Backup menyalin **seluruh sheet** (operasional + master) dalam satu file, lintas cabang — termasuk `Penggunaan_BBM`, `Jalur_Pengiriman`, dan semua sheet Flazz (topup/tol/recon).

### Keterbatasan Diketahui (Known Limitation)
- Backup yang tersalin memuat data lintas cabang dalam satu file; belum dipisah per cabang. Ringkasan bulanan di tab `Dashboard` dihitung **per cabang** (baris `cabang + periode`).
- Aplikasi menampung **12 cabang dalam satu spreadsheet**; data operasional lintas cabang tersimpan di sheet yang sama sehingga backup juga menyeluruh. Namun seluruh endpoint sudah menerapkan **enforce cabang server-side** bagi non-SUPERADMIN, sehingga pemisahan pencatatan per cabang sudah terjamin pada lapisan aplikasi.

## Konfigurasi Tambahan

| Key | Lokasi | Keterangan |
|-----|--------|------------|
| `GEMINI_API_KEY` | **Script Properties** | Kunci API Gemini untuk util deteksi level BBM manual/editor (model `gemini-3.6-flash`); **tidak lagi dipakai alur Input Laporan**. Tidak boleh disimpan di repositori. |

**Spreadsheet ID** dikonfigurasi di `Config.gs` (`PROD_SPREADSHEET_ID`), dipakai `getDB()` via `spreadsheetId()` dan nilainya bisa diganti sementara dengan `configureSpreadsheet(ID)`.

---

*Dikembangkan untuk monitoring dan efisiensi operasional harian perusahaan.*
