# Desain: Ganti Foto & KM Odometer saat Edit History Laporan

**Tanggal:** 2026-09-01
**Status:** Disetujui untuk perencanaan

## 1. Latar Belakang & Masalah

Saat ini menu **History Laporan** (Dashboard) sudah punya tombol Edit pada tiap baris transaksi BBM harian yang membuka modal `#modal-edit-daily`. Modal tersebut hanya berisi field **numerik/teks** (Nama Supir, KM Awal, KM Akhir, Jenis BBM, Biaya, Liter, Metode Pembayaran, Kartu Flazz, Biaya Tol).

Masalah: bila terjadi salah input **KM awal/KM akhir** atau **photo odometer**, tidak ada cara mengganti/mengoreksinya lewat aplikasi. Foto odometer hanya di-set saat pembuatan laporan (`processDailyImages` → upload Drive + OCR). Jadi edit di History Laporan **belum termasuk** mengubah photo odometer.

## 2. Tujuan

Menambahkan kemampuan di modal Edit History Laporan untuk:
1. Mengganti **photo odometer awal** dan **photo odometer akhir** (file upload baru dengan preview photo yang ada saat ini).
2. Mengisi **angka KM awal / KM akhir secara manual** (field yang sudah ada; tidak pakai OCR).

Yang diganti hanya **transaksi yang sedang diedit**; tidak memengaruhi kendaraan lain.

## 3. Ruang Lingkup

### 3.1 Frontend (`Index.html` + `js.html`)

- Tambah dua seksi foto di modal `#modal-edit-daily`:
  - **Foto Odometer Awal**: preview photo yang ada + input file untuk mengganti.
  - **Foto Odometer Akhir**: preview photo yang ada + input file untuk mengganti.
- `editDaily(id)` diisi untuk menampilkan preview photo yang sudah ada (dari `row.foto_odo_awal` / `row.foto_odo_akhir`).
- `previewPhoto()` yang sudah ada dipakai untuk menampilkan preview file baru yang dipilih.
- `saveEditDaily(e)` membaca file base64 + nama file bila ada file baru yang dipilih, dan mengirimkannya ke backend.

### 3.2 Backend (`SpreadsheetOps.js` + `Code.js`)

- `editDailyTransaction(payload)` diperluas:
  - Jika payload berisi `foto_odo_awal`/`foto_odo_akhir` (base64), upload ke Drive (folder `KM_Awal`/`KM_Akhir`), lalu simpan URL baru ke kolom `foto_odo_awal`/`foto_odo_akhir`.
  - Hapus file photo lama dari Drive.
- Tambah helper untuk menghapus file photo dari Drive (belum ada di DriveOps.js — hanya ada `uploadImageToDrive`).
- Tambah wrapper API bila perlu.

## 4. Alur Data

```
User klik Edit → modal terbuka, preview photo lama tampil
        ↓
User pilih file baru (opsional, salah satu atau keduanya) + isi KM awal/akhir manual
        ↓
saveEditDaily → payload { transaction_id, km_awal, km_akhir, ...,
                          foto_odo_awal?: base64, foto_odo_awal_name?: string,
                          foto_odo_akhir?: base64, foto_odo_akhir_name?: string }
        ↓
editDailyTransaction:
  - upload foto baru (jika ada) ke Drive/KM_Awal atau KM_Akhir → URL baru
  - hapus file photo lama (jika ada yang diganti)
  - update baris spreadsheet (KM, dll) + hapus photo lama
        ↓
loadDashboard() → data & photo terbaru
```

## 5. Backend Details

### 5.1 Helper hapus file (DriveOps.js)

```js
function deleteDriveFileById(fileId) {
  try {
    if (!fileId) return { success: true };
    DriveApp.getFileById(fileId).setTrashed(true);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
```

Kolom `foto_odo_awal`/`foto_odo_akhir` di spreadsheet berisi **URL Google Drive** (bukan fileId). Diperlukan ekstraksi fileId dari URL bila ingin menghapus file. Google Drive URL bentuknya `https://drive.google.com/file/d/<FILE_ID>/view...`. Bila kolom memang menyimpan URL, ekstrak `<FILE_ID>` dari pola `/file/d/<id>/`. Jika ID tidak bisa diekstrak (mis. berisi thumbnail URL atau type lain), lewati penghapusan tanpa error.

### 5.2 Perluasan `editDailyTransaction(payload)` (SpreadsheetOps.js)

Setelah menulis KM dan kolom lain, tambahkan:

```
if (payload.foto_odo_awal) {
  const up = uploadImageToDrive(payload.foto_odo_awal, payload.foto_odo_awal_name, 'KM_Awal');
  if (!up.success) throw new Error('Upload foto odometer awal gagal: ' + up.error);
  deleteDriveFileById(extractId(baris lama idx foto_odo_awal));  // hapus foto lama
  sheet.getRange(rowIndex, idxFotoAwal+1).setValue(up.fileUrl);
}
if (payload.foto_odo_akhir) { ... analog, folder 'KM_Akhir' ... }
```

Header `foto_odo_awal`/`foto_odo_akhir` dicari via `headers.indexOf(...)` (konsisten dengan kolom lain).

### 5.3 Wrapper API (Code.js)

Jika `editDailyTransaction` sudah menjadi fungsi backend yang bisa dipanggil via `google.script.run`, wrapper `apiEditDailyTransaction` sudah ada — cukup pastikan payload mengalir tanpa perubahan.

## 6. Frontend Details

### 6.1 Modal edit (`Index.html`)

Di dalam `#modal-edit-daily` (setelah field KM Awal & KM Akhir) tambahkan:

```html
<div class="mb-2">
  <label class="form-label small">Foto Odometer Awal</label>
  <div class="d-flex align-items-center gap-2">
    <img id="ed_preview_odo_awal" src="" class="rounded border"
         style="width:80px;height:60px;object-fit:cover;display:none;">
    <input type="file" id="ed_foto_odo_awal" accept="image/*"
           onchange="previewPhoto(this,'ed-preview-odo-awal')">
  </div>
</div>
<div class="mb-2"> <label>Foto Odometer Akhir</label> ... analog ... </div>
```

Catatan: `previewPhoto()` menargetkan `input.closest('.photo-upload')` dan `span`. Karena modal edit tidak menggunakan struktur `.photo-upload` yang sama, tambahkan varian preview yang sesuai atau sesuaikan markup. Foto lama ditampilkan sebagai preview awal (dari `row.foto_odo_awal_thumb || row.foto_odo_awal`).

### 6.2 `saveEditDaily` (js.html)

Baca file dari `ed_foto_odo_awal`/`ed_foto_odo_akhir`; bila ada `files[0]`, konversi ke data URL (reuse pola `processDailyReport`) dan masukkan ke payload:

```js
// helper untuk konversi file ke base64
function fileToBase64(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}
```

Karena `saveEditDaily` bersifat sinkron memanggil `google.script.run`, buat versi `async` dan tunggu konversi file sebelum memanggil backend.

## 7. Interaksi antar-modul

- `editDailyTransaction` di SpreadsheetOps.js memanggil `uploadImageToDrive` (DriveOps.js) dan `deleteDriveFileById` (DriveOps.js). Semua file di-load sebagai Apps Script library secara bersamaan → fungsi global dapat saling memanggil (pola yang sama sudah dipakai di `processDailyImages`).
- Penghapusan photo lama bersifat best-effort: jika ekstraksi fileId gagal, lewati tanpa membatalkan simpan.

## 8. Batasan & Catatan

- Tidak mengubah skema sheet; kolom `foto_odo_awal`/`foto_odo_akhir` sudah ada.
- Tidak menambahkan OCR; angka KM awal/akhir diisi manual (sesuai keputusan user).
- Photo hanya diganti untuk transaksi yang sedang diedit; transaksi lain tidak terpengaruh.
- Jika file photo lama tidak dapat dihapus (ID tak terdeteksi), simpan tetap berhasil (photo lama tertinggal, tidak error).

## 9. Pengujian

- Edit KM awal/akhir tanpa ganti foto → baris ter-update, photo tetap, `km_tempuh` dihitung ulang.
- Ganti photo odometer akhir dengan file baru (tanpa/bersama mengubah KM) → URL baru tersimpan di spreadsheet, photo lama terhapus dari Drive, preview di galeri menampilkan foto baru.
- Ganti photo odometer awal dengan file baru → analog.
- Ganti keduanya sekaligus → kedua URL ter-update, kedua file lama terhapus.
- Tidak mengganti photo (field file kosong) → tidak ada upload/hapus, flow berjalan seperti sebelumnya.
