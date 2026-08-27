# Desain: Fitur Edit & Hapus Transaksi Flazz dan BBM

**Tanggal:** 2026-08-27
**Status:** Disetujui untuk perencanaan

## 1. Latar Belakang & Masalah

Saldo kartu Flazz disimpan di `Flazz_Card.last_balance` dan diubah bertahap oleh transaksi:

| Aksi | Pengaruh ke `last_balance` | Sumber |
|------|---------------------------|--------|
| Top Up (`saveFlazzTopUp`) | `+= nominal` | FlazzOps.js |
| Tol (`saveFlazzTol`) | `-= nominal` | FlazzOps.js |
| BBM Flazz (`recordFlazzExpense`) | `-= biaya_bbm` | SpreadsheetOps.js |

Transaksi BBM Flazz disimpan di `Penggunaan_BBM` (kolom `metode_pembayaran = 'FLAZZ'`, `flazz_card_id`), sekaligus memotong saldo kartu.

Masalah yang ditemukan:
1. Salah input **nominal top up** → saldo kartu ikut salah dan tidak bisa dikoreksi lewat aplikasi.
2. **Riwayat Flazz** (Top Up, Tol, BBM) tidak punya tombol edit/hapus.
3. **History Laporan BBM** belum punya fitur edit/hapus transaksi BBM harian. Kasus "salah pilih metode pembayaran (FLAZZ vs TUNAI)" tidak bisa diperbaiki tanpa edit manual di sheet.
4. Menghapus baris top up manual di sheet **tidak** mengembalikan saldo kartu.

## 2. Tujuan

Memberikan kontrol penuh kepada admin untuk mengoreksi transaksi lewat aplikasi, dengan penyesuaian saldo kartu Flazz secara otomatis sehingga saldo dan laporan tetap konsisten.

## 3. Prinsip Penyesuaian Saldo

Gunakan pendekatan **selisih nominal** (bukan hitung ulang seluruh transaksi kartu). Artinya saldo kartu disesuaikan berdasarkan efek transaksi yang diedit/dihapus, tidak menghitung ulang semua transaksi lain.

Karena top up menambah dan tol/BBM mengurangi saldo, penyesuaian saldo:

| Operasi | Rumus pada `last_balance` |
|---------|---------------------------|
| Edit Top Up | `+= (nominal_baru - nominal_lama)` |
| Edit Tol / edit BBM | `+= (nominal_lama - nominal_baru)` |
| Hapus Top Up | `-= nominal_lama` |
| Hapus Tol | `+= nominal_lama` |
| Hapus BBM Flazz (total) | `+= biaya_bbm_lama` |
| BBM: ganti metode FLAZZ→non-FLAZZ | `+= biaya_bbm` (tidak lagi dipotong) |
| BBM: ganti metode non-FLAZZ→FLAZZ | `-= biaya_bbm` (kini dipotong) |

Pertimbangan nilai negatif: ikuti perilaku simpan saat ini yang mengizinkan saldo negatif; tidak menambah validasi saldo >= 0.

## 4. Ruang Lingkup

### 4.1 Riwayat Flazz (FlazzScript.html / renderFlazzHistory)

- **Top Up**: tombol **Edit** dan **Hapus**.
- **Tol**: tombol **Edit** dan **Hapus**.
- **BBM (Flazz)**: tombol **Hapus**.

### 4.2 History Laporan BBM (menu Dashboard / js.html)

- Tambah tombol **Edit** dan **Hapus** untuk tiap baris transaksi BBM harian.
- **Edit** memungkinkan mengubah termasuk `metode_pembayaran` (FLAZZ ↔ TUNAI/lainnya) dan nominal `biaya_bbm`, yang otomatis menyesuaikan saldo kartu Flazz bila relevan.
- **Hapus** menghapus baris `Penggunaan_BBM`; jika baris tersebut ber-metode FLAZZ, saldo kartu dikembalikan.

## 5. Backend (FlazzOps.js + Code.js + SpreadsheetOps.js)

### 5.1 Helper saldo kartu

```js
function getCardBalance(cardId)      // membaca last_balance dari Flazz_Card
function setCardBalance(cardId, val) // menulis last_balance + updated_at
```

Semua fungsi backend dibungkus `try/catch` dan mengembalikan `{ success, msg }`.

### 5.2 Top Up (FlazzOps.js)

- `editFlazzTopUp(payload)` — `{id, card_id, amount, notes, date}`.
  Baca baris lama (`card_id`, `amount`), update baris (nominal, notes, date), lalu `setCardBalance(card_id, last_balance + (newAmount - oldAmount))`.
- `deleteFlazzTopUp(id)` — baca `card_id`, `amount`; hapus baris; `setCardBalance(card_id, last_balance - oldAmount)`.

### 5.3 Tol (FlazzOps.js)

- `editFlazzTol(payload)` — `{id, card_id, amount, notes, date}`.
  Update baris; `setCardBalance(card_id, last_balance + (oldAmount - newAmount))`.
- `deleteFlazzTol(id)` — hapus baris; `setCardBalance(card_id, last_balance + oldAmount)`.

### 5.4 BBM Flazz (FlazzOps.js, bekerja di Penggunaan_BBM)

- `deleteFlazzBBM(transaction_id, mode)` — `mode` = `'full'` (hapus baris + `last_balance += biaya_bbm`) atau `'detach'` (lepas dari Flazz: set `metode_pembayaran=''` & `flazz_card_id=''`, `last_balance += biaya_bbm`, baris tetap).
  Validasi: pastikan baris ada dan `metode_pembayaran === 'FLAZZ'` sebelum menyesuaikan saldo.

### 5.5 Transaksi BBM harian (SpreadsheetOps.js)

- `editDailyTransaction(payload)` — menerima seluruh field yang dapat diedit (metode_pembayaran, biaya_bbm, dsb). Menghitung selisih pengaruh Flazz:
  - jika berubah FLAZZ→non-FLAZZ: `last_balance += biaya_bbm`
  - jika berubah non-FLAZZ→FLAZZ: `last_balance -= biaya_bbm`
  - jika tetap FLAZZ dan nominal berubah: `last_balance += (old_biaya - new_biaya)`
  Update baris di `Penggunaan_BBM`.
- `deleteDailyTransaction(transaction_id)` — baca baris; jika FLAZZ, kembalikan saldo; hapus baris `Penggunaan_BBM`.

### 5.6 Wrapper API (Code.js)

Tambahkan wrapper `apiXxx` untuk tiap fungsi backend di atas agar bisa dipanggil dari `google.script.run`.

## 6. Frontend

### 6.1 Riwayat Flazz (FlazzScript.html)

- Di `renderFlazzHistory`:
  - Tab topup/tol: tambah kolom "Aksi" dengan tombol Edit & Hapus.
  - Tab bbm: tambah kolom "Aksi" dengan tombol Hapus.
- **Edit**: isi modal/kontrol dengan data terkini, simpan → panggil `editFlazzTopUp` / `editFlazzTol`.
- **Hapus**: konfirmasi (`confirm`), lalu panggil fungsi hapus; untuk BBM Flazz tampilkan pilihan mode (hapus total / lepas dari Flazz).
- Setelah sukses: `showToast` + `loadFlazzDataWrapper()`.

### 6.2 History Laporan BBM (js.html)

- Pada render tabel/kartu history, tambahkan tombol Edit & Hapus per baris.
- **Edit**: isi form (termasuk dropdown `metode_pembayaran` & `flazz_card_id`) dengan data terkini, simpan → panggil `editDailyTransaction`.
- **Hapus**: konfirmasi → panggil `deleteDailyTransaction`.

## 7. Interaksi antar-modul

`editDailyTransaction` / `deleteDailyTransaction` di SpreadsheetOps.js perlu memanggil helper saldo dari FlazzOps. Karena semua file di-load sebagai library Apps Script bersamaan, fungsi global dapat saling memanggil (pola yang sama dipakai `recordFlazzExpense`). Guard `typeof x === 'function'` dipakai bila perlu defensif.

## 8. Batasan & Catatan

- Tidak mengubah skema sheet.
- Baris lama (yang pernah salah input) tidak otomatis diperbaiki; hanya transaksi yang diedit/dihapus lewat fitur.
- Pilihan "lepas dari Flazz saja" untuk BBM menjaga laporan BBM harian tetap utuh (skenario driver tidak isi BBM atau hanya salah metode bayar).
- Pilihan "hapus total baris" menghapus data BBM harian hari itu (skenario transaksi BBM sepenuhnya salah).

## 9. Pengujian

- Edit nominal top up → saldo kartu berubah sesuai selisih; riwayat ter-update.
- Hapus top up → saldo berkurang nominal; baris hilang dari riwayat & dashboard.
- Edit nominal tol → saldo menyesuaikan terbalik.
- Hapus tol → saldo dikembalikan.
- Edit metode BBM FLAZZ→TUNAI di History Laporan → saldo Flazz dikembalikan; baris tetap di laporan.
- Hapus BBM Flazz (full) → baris hilang, saldo dikembalikan.
- Hapus BBM Flazz (detach) → baris tetap, metode bayar kosong, saldo dikembalikan.
- Data master, kendaraan, supir tidak terpengaruh.
