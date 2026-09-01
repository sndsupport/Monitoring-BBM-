# Desain: Integrasi Etoll ke Pembuatan Jalur Pengiriman + Tombol Batal

**Tanggal:** 2026-09-01
**Status:** Disetujui untuk perencanaan

## 1. Latar Belakang & Masalah

Setiap pagi kartu etoll (Flazz) diserahkan ke driver sesuai jadwal pengiriman. Saat ini penyerahan otomatis **hanya** terjadi ketika Input Laporan BBM disimpan dengan metode FLAZZ (`autoCreateFlazzUsage`, SpreadsheetOps.js:172). Tidak ada cara menyerahkan kartu saat membuat Jalur Pengiriman. Akibatnya status kartu baru berubah setelah laporan BBM masuk, bukan sejak pagi saat jalur dibuat.

## 2. Tujuan

Menyerahkan kartu etoll secara otomatis **pada saat pembuatan Jalur Pengiriman**, sehingga status kartu berubah dari TERSEDIA → SEDANG_DIGUNAKAN sejak pagi. Menu Input Laporan tetap dipakai untuk mencatat pengeluaran oleh pemegang kartu.

Tambahan: tombol **Batal** di samping tombol **Simpan Jadwal** pada form buat jalur (ukuran disamakan).

## 3. Prinsip Anti-Double

`autoCreateFlazzUsage` bersifat **idempoten**: jika kartu sudah punya catatan `DIBERIKAN` yang belum dikembalikan → `return early` (tidak membuat penyerahan baru). Karena itu, pemicu penyerahan melalui jalur dan melalui laporan BBM **tidak menghasilkan double penyerahan**.

Untuk mencegah kartu menggantung saat jalur diedit/dihapus, perlu fungsi bantu **`returnFlazzUsage(cardId)`** (mirip logika `saveFlazzRecon` pada FlazzOps.js:617-630).

## 4. Ruang Lingkup

### 4.1 Schema `Jalur_Pengiriman` (DatabaseSetup.js)
- Tambah kolom **`flazz_card_id`** dan **`flazz_card_name`** di akhir header (idempoten via `setupDatabase`).

### 4.2 Frontend — Form Buat Jadwal (JalurPages.html + JalurScript.html)
- **Field etoll per baris** untuk driver 1 (dropdown).
- **Auto-fill**: saat driver 1 dipilih → field etoll baris itu terisi otomatis dengan kartu default driver (`Flazz_Card.default_driver_id` = nama driver).
- Driver tanpa kartu default → dropdown menampilkan kartu `TERSEDIA` untuk pilih manual (kartu cadangan).
- Hanya **driver 1** yang punya field etoll (driver 2 tidak).
- **Tombol Batal** di samping **Simpan Jadwal**, ukuran sama, mereset form jalur.
- **Listing & Summary**: tampilkan kartu etoll yang diserahkan per baris.

### 4.3 Backend (Code.js, FlazzOps.js, JalurOps.js)
- `getMasterData` (Code.js): tambah **`flazzCards`** agar modul Jalur memiliki data kartu.
- **`returnFlazzUsage(cardId)`** (FlazzOps.js, baru): cari `DIBERIKAN` terbaru kartu → set `DIKEMBALIKAN` + `returned_at`; `Flazz_Card.status` → `TERSEDIA`; pulihkan `driver` dari `default_driver_id`.
- `saveJalur` (JalurOps.js): simpan `flazz_card_id`/`flazz_card_name` per baris + panggil `autoCreateFlazzUsage(cardId, namaDriver, vehicleId)` untuk tiap baris berkartu.
- `updateJalur` (JalurOps.js): jika kartu berubah → `returnFlazzUsage(kartuLama)` + `autoCreateFlazzUsage(kartuBaru)`; jika kartu dihapus → `returnFlazzUsage(kartuLama)`.
- `deleteJalur` (JalurOps.js): jika baris punya kartu → `returnFlazzUsage(cardId)`.
- `getJalurByTanggal` (JalurOps.js): kembalikan `flazz_card_id`/`flazz_card_name`.

## 5. Alur Data

```
Buat Jalur (pilih driver 1 → field etoll auto-fill kartu default / pilih cadangan)
    ↓ simpan
saveJalur: tulis flazz_card_id di baris Jalur_Pengiriman
    + autoCreateFlazzUsage(cardId, namaDriver, vehicleId)
    → Flazz_Usage DIBERIKAN, Flazz_Card.status = SEDANG_DIGUNAKAN
    ↓ (hari berjalan)
Laporan BBM pakai kartu sama → autoCreateFlazzUsage return early (tidak double)

Edit jalur ganti kartu → returnFlazzUsage(kartuLama) + autoCreateFlazzUsage(kartuBaru)
Edit jalur lepas kartu → returnFlazzUsage(kartuLama)
Hapus jalur punya kartu → returnFlazzUsage(cardId)  (kartu → TERSEDIA)
Recon/penutupan → alur yang ada (tidak berubah)
```

## 6. Interaksi Antar-Modul

`saveJalur` / `updateJalur` / `deleteJalur` (JalurOps.js) memanggil `autoCreateFlazzUsage` (SpreadsheetOps.js) dan `returnFlazzUsage` (FlazzOps.js, baru). Semua file dimuat sebagai Apps Script library bersamaan sehingga fungsi global saling memanggil.

## 7. Konversi Identitas

- Jalur `driver_id` = master Supir **ID** (DRV-xxx).
- `Flazz_Card.driver_id` / `default_driver_id` = **nama** driver.
- Saat autofill & mengisi `autoCreateFlazzUsage`, gunakan **nama driver** (dari `nama_driver` pada baris) untuk mencocokkan kartu dan sebagai argumen `autoCreateFlazzUsage`.

## 8. Batasan & Catatan

- Penyerahan hanya untuk driver yang terdaftar sebagai **driver 1** pada jalur.
- Jika kartu default tidak tersedia (masih `DIBERIKAN` / proses admin belum selesai) → tampilkan peringatan; simpan tetap lanjut untuk baris lain yang valid.
- Tidak mengubah alur recon/penutupan yang ada.
- Menu Input Laporan tetap menjadi pencatat pengeluaran oleh pemegang kartu.

## 9. Pengujian

1. Buat jalur dengan driver berkartu default → kartu `DIBERIKAN`, status `SEDANG_DIGUNAKAN`, card id tampil di listing/summary.
2. Laporan BBM pakai kartu sama → tidak double penyerahan.
3. Edit jalur ganti kartu → kartu lama `DIKEMBALIKAN`/`TERSEDIA`, kartu baru `DIBERIKAN`.
4. Edit jalur lepas kartu → kartu lama `DIKEMBALIKAN`/`TERSEDIA`.
5. Hapus jalur punya kartu → kartu `DIKEMBALIKAN`/`TERSEDIA`.
6. Driver tanpa kartu default → field kosong, bisa pilih cadangan, atau simpan tanpa kartu.
7. Tombol Batal mereset form; ukuran sama dengan tombol Simpan Jadwal.
