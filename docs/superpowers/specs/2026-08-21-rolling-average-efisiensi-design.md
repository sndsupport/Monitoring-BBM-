# Rolling Average Efisiensi BBM (Rata-rata 7 Hari) Design Document
## Sistem Monitoring BBM & Operasional Harian

**Tanggal:** 21 Agustus 2026
**Status:** Approved
**Approach:** Hitung on-the-fly di tampilan (`getRecentTransactions`), database tidak berubah

---

## 1. Overview

### 1.1 Masalah
Efisiensi harian berbasis indikator bar bensin sangat fluktuatif (contoh nyata: 34 KM/L atau 6 KM/L) karena bar bensin tidak presisi/linear — turun drastis di satu hari, diam di hari lain.

### 1.2 Solusi
Dashboard menampilkan **rata-rata efisiensi 7 hari** per kendaraan, dengan tetap membaca pergerakan bar bensin dalam agregasi. Angka harian murni tetap tersimpan di kolom `km_per_liter` sebagai jejak audit (raw fact).

---

## 2. Keputusan Desain (hasil diskusi)

| Pertanyaan | Keputusan |
|---|---|
| Cara agregasi liter dalam window | **Metode 2:** jumlahkan `literKonsumsi` harian hasil formula yang sudah ada per transaksi (`literBeli + (barAwal−barAkhir)×literPerBar`) |
| Penyimpanan | **Tidak ada perubahan database.** Kolom `km_per_liter` tetap angka harian murni; `saveTransactionEndOfDay` TIDAK disentuh |
| Tempat komputasi | On-the-fly di `getRecentTransactions`; angka harian dari DB diabaikan untuk tampilan |
| Label tampilan | `9.57 KM/L (Rata-rata 7 Hari)` di table desktop & card mobile |
| Status Boros/Normal/Irit | Tetap memakai threshold yang sama terhadap `standar_km_l`, tapi kini dari nilai rata-rata |

Catatan: nama fungsi pada draf awal ("saveDailyTransaction") tidak eksis — fungsi simpan yang sebenarnya adalah `saveTransactionEndOfDay`, dan dengan keputusan ini tidak diubah sama sekali.

---

## 3. Formula

Untuk setiap baris tampilan (kendaraan V, tanggal D):

1. **Window:** semua transaksi V dengan tanggal dalam **[D−6, D]** (7 hari kalender, inklusif). Baris itu sendiri selalu termasuk, jadi minimal tampil konsumsi hariannya sendiri.
2. `totalKm = Σ km_tempuh`
3. `totalLiter = Σ literKonsumsi_i` (formula lama per transaksi, termasuk pembelian + konversi bar)
4. `efisiensi = totalKm / totalLiter` (2 desimal); jika `totalLiter ≤ 0` atau `totalKm ≤ 0` → `-`

### Catatan perilaku
- Jika bar naik tanpa pencatatan pembelian di satu hari, konsumsi harian bisa negatif — **tidak di-clamp**; rata-rata 7 hari yang menetralkannya.
- Selisih pembacaan bar antar hari (bar_akhir H1 ≠ bar_awal H2) terakumulasi di metode ini — diterima sebagai trade-off yang dipilih user karena tiap angka harian tetap interpretable dan sudah teruji di kode sekarang.

---

## 4. Perubahan Kode

### 4.1 `src/SpreadsheetOps.js` — hanya `getRecentTransactions`
- Helper baru `hitungEfisiensi7Hari(rowsKendaraan, tanggalD, literPerBar)` → `{ efisiensi: string, label: string }`.
- Bangun map sekali di awal: `vehicle_id (row[6]) → array barisnya` dari `data` yang memang sudah dimuat penuh (Opsi A — index per kendaraan, tanpa scan berulang).
- Blok perhitungan `efisiensiVal`/`statusEfisiensi` per baris diganti: panggil helper dengan map window, lalu tentukan status dari nilai rata-rata (threshold lama: `< standar` Boros, `≤ 1.3×standar` Normal, else Irit).
- Field baru di objek result: `efisiensi_label`.
- Perhitungan `liter` (konsumsi harian, kolom L di dashboard) TETAP dari formula harian lama — tidak berubah.

### 4.2 `src/js.html` — render label
- Table (desktop) dan card (mobile): setelah `X KM/L` ditambah `<small class='text-muted'>(Rata-rata 7 Hari)</small>` saat `row.efisiensi_label` ada.
- Badge Boros/Normal/Irit tetap lewat `efisiensiBadge()` yang sudah ada.

### 4.3 Tidak berubah
Semua sheet/kolom, `saveTransactionEndOfDay`, alur OCR, fitur warning odometer, master data.

---

## 5. Edge Cases

| Kasus | Perilaku |
|---|---|
| Kendaraan hanya 1 transaksi dalam window | Efisiensi = angka harian transaksi itu sendiri |
| Total liter ≤ 0 atau total KM ≤ 0 | Tampil `-` tanpa badge |
| Transaksi tanggal tidak valid / kosong | Baris diabaikan dari agregasi window |
| Baris history > 100 (di luar slice tampilan) | Tetap ikut terhitung sebagai bagian window kendaraan lain yang masih tampil |

---

## 6. Verifikasi

Tanpa test framework (GAS): `node --check src/SpreadsheetOps.js`, push via clasp, lalu uji manual:
1. Kendaraan dengan riwayat fluktuatif ekstrem (34 / 6 KM/L) → tampil angka stabil + label "(Rata-rata 7 Hari)".
2. Kendaraan baru 1 transaksi → angka = konsumsi hariannya sendiri.
3. Kolom `km_per_liter` di sheet masih berisi angka harian murni (tidak tertimpa rata-rata).
4. Badge Boros/Normal/Irit konsisten dengan nilai rata-rata vs `standar_km_l`.

---

## 7. Out of Scope

- Perubahan skema sheet / kolom baru
- Perhitungan rata-rata berbobot atau EMA
- Menyimpan angka rata-rata ke sheet
- Perubahan halaman/form input
