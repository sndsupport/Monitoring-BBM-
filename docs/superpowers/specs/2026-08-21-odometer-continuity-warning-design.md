# Odometer Continuity Warning Design Document
## Sistem Monitoring BBM & Operasional Harian

**Tanggal:** 21 Agustus 2026
**Status:** Approved
**Approach:** Server-side validation saat simpan transaksi (Opsi A)

---

## 1. Overview

### 1.1 Tujuan
Mendeteksi indikasi kendaraan dipakai di luar jam kerja dengan membandingkan:
- **KM akhir** transaksi terakhir sebuah kendaraan, vs
- **KM awal** transaksi berikutnya untuk kendaraan yang sama.

Logika: KM akhir kemarin seharusnya menjadi KM awal hari ini. Jika KM awal baru > KM akhir terakhir, berarti odometer bertambah di antara dua transaksi → ada pemakaian yang tidak tercatat (di luar jam kerja).

### 1.2 Keputusan Desain (hasil diskusi)
| Pertanyaan | Keputusan |
|---|---|
| Perilaku saat selisih terdeteksi | Transaksi **tetap disimpan**, ditandai warning di sheet & dashboard |
| Kendaraan tanpa transaksi sebelumnya | Tidak ada warning (tidak ada pembanding) |
| Transaksi terakhir sudah beberapa hari lalu | **Tetap warning** jika ada selisih |
| Sumber angka KM | Murni dari OCR foto (user tidak input manual), validasi cukup di backend |

---

## 2. Perubahan per File

### 2.1 `src/SpreadsheetOps.js`

**a) Fungsi helper baru: `getLastTransactionForVehicle(vehicleId)`**
- Baca sheet `Penggunaan_BBM`, scan dari baris bawah ke atas.
- Return transaksi pertama (terbaru) yang `vehicle_id` (kolom index 6) sama.
- Return `null` jika tidak ada.
- Data yang dikembalikan: `{ km_akhir, tanggal }` dari kolom `km_akhir_confirmed` (index 14) dan `tanggal` (index 2).

**b) Modifikasi `saveTransactionEndOfDay(payload)`**
- Setelah menghitung `km_awal`, panggil `getLastTransactionForVehicle(payload.vehicle_id)`.
- Jika transaksi sebelumnya ADA dan `km_awal !== prev.km_akhir` (perbandingan numerik via `parseFloat`):
  - Isi kolom `warning` (index 25) dengan pesan:

    ```
    SELISIH ODO: KM akhir terakhir {prev_km} ({prev_tanggal}), KM awal {km_awal}, selisih {selisih} KM - indikasi pemakaian di luar jam kerja
    ```

  - Angka diformat `toLocaleString('id-ID')`, tanggal format `id-ID`.
  - Selisih = `km_awal - prev.km_akhir` (boleh negatif; tetap ditampilkan).
- Jika tidak ada transaksi sebelumnya ATAU nilainya sama persis → `warning` tetap string kosong `''`.
- Baris yang di-append menulis nilai warning tersebut di index 25 (menggantikan `''` yang sekarang hard-coded).

### 2.2 Dashboard / History

**a) `getRecentTransactions(role, userCabang)`**
- Tambahkan field `warning: row[25] || ''` ke objek result.

**b) `src/js.html` — render history**
- **Table (desktop):** jika `row.warning` ada, tampilkan badge kuning ⚠ (`bi-exclamation-triangle`) di samping nama kendaraan dengan atribut `title` berisi pesan lengkap.
- **Card (mobile):** jika `row.warning` ada, tampilkan strip peringatan kecil di card body (ikon segitiga + teks pesan, style `text-warning small`) karena tooltip tidak praktis di layar sentuh.

---

## 3. Data Flow

```
User upload foto odo awal/akhir → OCR → konfirmasi → submit
        ↓
saveTransactionEndOfDay()
        ↓
getLastTransactionForVehicle(vehicle_id)
        ↓
[ada transaksi lama?] ──tidak──→ warning = ''
        ↓ ya
[km_awal == km_akhir_lama?] ──ya──→ warning = ''
        ↓ tidak
warning = "SELISIH ODO: ..." → appendRow (kolom warning terisi)
        ↓
Dashboard memuat warning → badge/strip ⚠ di table & card
```

---

## 4. Edge Cases

| Kasus | Perilaku |
|---|---|
| Transaksi pertama untuk kendaraan | Tidak ada warning |
| KM awal < KM akhir terakhir (odo mundur) | Tetap warning, selisih tampil minus |
| Beberapa transaksi kendaraan sama dalam sehari | Pembanding = transaksi terbaru (scan bottom-up), bukan per tanggal kalender |
| Transaksi lama (sebelum fitur ini) | Tetap tanpa warning, tidak dimodifikasi |
| OCR menghasilkan angka beda tipis | Tetap dianggap selisih (exact match); PIC yang menilai lewat foto |

---

## 5. Verifikasi

Tidak ada test framework di repo ini (Google Apps Script). Verifikasi manual:
1. Push kode via clasp, buka web app.
2. Simpan transaksi untuk kendaraan X dengan km akhir = 45.230.
3. Simpan transaksi baru kendaraan X dengan km awal = 45.230 → kolom `warning` kosong, dashboard tanpa badge.
4. Simpan transaksi lagi dengan km awal = 45.500 → kolom `warning` terisi pesan selisih 270 KM, dashboard menampilkan badge ⚠ (table) dan strip warning (card).
5. Cek kendaraan Y tanpa riwayat → transaksi pertama tanpa warning.

---

## 6. Out of Scope

- Pemblokiran input atau popup interaktif saat OCR (sudah diputuskan: simpan + tandai).
- Notifikasi email/push ke admin.
- Validasi jam operasional berbasis timestamp input.
- Retroactive warning untuk data lama.
