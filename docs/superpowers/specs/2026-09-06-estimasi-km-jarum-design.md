# Estimasi KM Jarak Tempuh untuk Kendaraan Jarum (ANALOG_JARUM)

> **Status:** Disetujui untuk diimplementasikan.
> **Tanggal:** 2026-09-06

## Ringkasan

Menambahkan kemampuan mencatat KM jarak tempuh **estimasi** untuk kendaraan berjenis indikator **ANALOG_JARUM** saat odometer tidak terbaca/rusak. Form tetap mewajibkan input KM (anti lupa), tetapi ada pilihan "Odometer tidak terbaca (rusak)" per sisi (awal/akhir) agar validasi bisa lolos dan sistem menghitung km_tempuh dari konsumsi BBM.

## Konteks

- Kendaraan jarum menyembunyikan field Bar Bensin Awal/Akhir (`onVehicleChange`, js.html). Konsumsi untuk jarum bersumber dari `liter_bbm` (liter isi = biaya ÷ harga/liter).
- `km_tempuh = km_akhir - km_awal` (SpreadsheetOps.js:91). Input KM Awal/Akhir bersifat `required` (Index.html:278, 313).
- Master Kendaraan sudah punya `kapasitas_tangki` (kolom 7) dan `standar_km_l` (kolom 8) — DatabaseSetup.js:15.
- `literKonsumsi = liter + ((barAwal - barAkhir) * literPerBar)` (SpreadsheetOps.js:116); untuk jarum nilai bar = 0 → `literKonsumsi = liter`.

## Tujuan (enaknya kalau selesai)

1. Supir/petugas dengan odometer rusak tidak terkunci oleh validasi KM.
2. Tapi validasi tetap ada — dikecualikan hanya bila secara eksplisit menandai "tidak terbaca".
3. km_tempuh yang diperkirakan transparan: tersimpan dengan penanda, tertampil badge, tidak dikira angka asli.
4. Tidak mengubah perilaku kendaraan selain ANALOG_JARUM.

## Lingkup (scope)

- **Hanya** kendaraan `jenis_indikator === 'ANALOG_JARUM'`.
- Form input (Index.html + js.html) untuk checkbox "tidak terbaca" per sisi KM.
- Perhitungan estimasi di `saveDailyReport` (SpreadsheetOps.js).
- Kolom baru `km_sumber` pada sheet `Penggunaan_BBM` + migrasi otomatis.
- Badge "ESTIMASI" pada riwayat transaksi.
- Edit transaksi: km diperbaiki → `km_sumber = AKTUAL`, km_tempuh dihitung ulang.
- **Di luar lingkup:** perubahan login, Flazz, tol, biaya, laporan performa (dipakai apa adanya), fitur untuk jenis indikator lain, OCR odometer.

## Formula Estimasi

```
estKm = round(literKonsumsi × standar_km_l)
```

- `standar_km_l` dari master Kendaraan (kolom 8).
- `literKonsumsi` dari `saveDailyReport` (liter_bbm + selisih bar × literPerBar). Untuk jarum ≈ `liter_bbm`.
- **Guard:** jika `literKonsumsi <= 0` ATAU `standar_km_l <= 0` → tolak simpan dengan pesan error, minta input KM asli (data estimasi tidak tersedia).
- `km_tempuh = estKm`; `km_per_liter = standar_km_l` (konsekuensi wajar, transparan via badge).

## Desain Detail

### 1. Form (Index.html)

- Di bawah input `km_awal_val` (bagian Keberangkatan): checkbox **`chk_km_awal`** "Odometer tidak terbaca (rusak)".
- Di bawah input `km_akhir_val` (bagian Kepulangan): checkbox **`chk_km_akhir`**.
- Keduanya **divisible/di-render hanya saat kendaraan terpilih berjenis ANALOG_JARUM** (`onVehicleChange`):
  - Jarum: checkbox tampil; jika dicentang → input terkait `required=false` + hint "km tidak terbaca — dihitung estimasi"; jika tidak dicentang → `required=true`.
  - Bukan jarum: checkbox disembunyikan, input KM tetap `required`.

### 2. Payload Submisi (js.html `saveDailyForm`)

- Tambah boolean `km_awal_broken` / `km_akhir_broken` dari `chk_km_awal.checked` / `chk_km_akhir.checked`.
- `km_awal_val` / `km_akhir_val` boleh kosong saat sisi terkait dicentang rusak.
- `km_awal_confirmed` / `km_akhir_confirmed` tetap diisi nilai (boleh kosong).

### 3. Hitung di Server (`saveDailyReport`, SpreadsheetOps.js)

- Ambil `standar_km_l` dari data kendaraan (tambahkan saat loop lookup kendaraan).
- Jika `payload.km_awal_broken || payload.km_akhir_broken`:
  - Validasi guard (liter/standar) seperti di atas.
  - `estKm = Math.round(literKonsumsi * standar_km_l)`.
  - Tentukan nilai km:
    - Keduanya rusak: `km_awal_est = prevTrx.km_akhir` (bila ada, fallback 0); `km_akhir_est = km_awal_est + estKm`.
    - Hanya akhir rusak: `km_akhir_est = km_awal + estKm` (km_awal dari input).
    - Hanya awal rusak: `km_awal_est = km_akhir - estKm` (bila negatif → 0); km_akhir dari input.
  - `km_tempuh = estKm`.
  - `km_sumber = 'ESTIMASI'`.
- Normal (tanpa toggle): `km_sumber = 'AKTUAL'`, logika lama tidak berubah.

### 4. Skema & Migrasi

- `DatabaseSetup.js`: tambah `'km_sumber'` di header `Penggunaan_BBM` (paling akhir).
- `SpreadsheetOps.js`: function baru `ensurePenggunaBBMColumns()`:
  - Jika header `km_sumber` belum ada → append kolom + isi default `AKTUAL` untuk baris lama.
  - Idempoten (aman dipanggil berulang).
- Dipanggil sekali dari `processInitialData` dan `saveDailyReport` (sudah ada sejak lama; aman).
- Baris insert `saveDailyReport` disesuaikan (kolom `km_sumber` di index akhir).

### 5. Baca & Tampilan

- `getTransactionsByVehicle` (SpreadsheetOps.js ~512-536) & `getRecentTransactions` (~393+) ikut mengembalikan `km_sumber`.
- Riwayat transaksi (js.html ~1012, 1040): jika `km_sumber === 'ESTIMASI'` → badge kecil `<span class="badge bg-warning text-dark">ESTIMASI</span>` di samping km_tempuh.
- Detail/edit modal: tampilkan km sesuai nilai tersimpan; tidak ada perubahan wajib.

### 6. Edit Transaksi (`updateTrx`, SpreadsheetOps.js ~604-614)

- Saat user mengedit & nilai `km_awal`/`km_akhir` di-submit: tulis nilai baru, hitung ulang `km_tempuh`, set `km_sumber = 'AKTUAL'` (karena km asli terisi valid).
- Edit modal tetap `required` untuk km (perbaikan odometer = data nyata).

### 7. Interaksi dengan Laporan Lain (terverifikasi)

- **Performa 7-trip (`hitungEfisiensi7Riwayat`)**: menjumlah km_tempuh (index 16) & liter (index 18); km = estKm masuk natural, km/L ≈ standar → label "sesuai standar". Transparan via badge.
- **Rantai odometer (`getLastTransactionForVehicle`)**: km_akhir estimasi tersimpan numerik → peringatan SELISIH ODO mengikuti aturan lama.
- **Flazz/toll/biaya**: tidak tersentuh.
- **"Est. jarak satu tangki"** di list kendaraan: independen, tidak berubah.
- Kendaraan bukan ANALOG_JARUM: perilaku 100% seperti sekarang.

## Alur Data

```
Form (jarum, chk_km_awal/akhir checked)
  → saveDailyForm: km_awal_broken/km_akhir_broken + km_awal_val/km_akhir_val (boleh kosong)
  → saveDailyReport (server):
       standar = Kendaraan.standar_km_l
       literKonsumsi = liter + (bar delta × literPerBar)   // jarum: = liter
       guard literKonsumsi>0 && standar>0
       estKm = round(literKonsumsi × standar)
       tentukan km_awal/km_akhir (anchor sesuai kasus)
       km_tempuh = estKm, km_sumber = 'ESTIMASI'
  → insert row (+ kolom km_sumber)
  → riwayat menampilkan badge ESTIMASI
Edit trx (km diperbaiki) → km_sumber = 'AKTUAL', km_tempuh = km_akhir - km_awal
```

## Error Handling

| Skenario | Perilaku |
|----------|----------|
| Toggle aktif, `liter_bbm` kosong / isi_bensin Tidak | Error toast: estimasi butuh liter terpakai; minta input KM asli |
| Toggle aktif, `standar_km_l` kosong/0 di master | Error toast: set standar km/L kendaraan dulu atau input KM asli |
| Kedua toggle, tidak ada trx sebelumnya | km_awal_est = 0 sebagai anchor awal |
| Bukan jarum | Checkbox tidak tampil; validasi lama |

## Verifikasi (manual, setelah deploy)

1. Kendaraan jarum: checkbox tampil; centang salah satu/both → input km bisa kosong, simpan sukses, km_tempuh = estKm, badge ESTIMASI muncul di riwayat.
2. Kendaraan jarum, toggle aktif & isi_bensin Tidak/bar kosong → error toast, tidak tersimpan.
3. Kendaraan digital bar / angka / tidak ada → checkbox tidak muncul, km tetap required.
4. Edit trx estimasi, isi km benar → km_sumber jadi AKTUAL, km_tempuh terhitung ulang, badge hilang.
5. Trx berikutnya dengan km asli → tidak ada error aneh pada rantai odometer.