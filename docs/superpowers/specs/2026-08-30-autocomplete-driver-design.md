# Design: Autocomplete Nama Driver

**Date:** 2026-08-30
**Status:** Approved

## Ringkasan

Mengganti dropdown (select) driver menjadi **input teks kosong dengan autocomplete** (native `<datalist>`) di dua tempat:

1. **Input Laporan** (field `Nama Supir`).
2. **Buat Jadwal** (field `Driver` pada tiap baris input).

Tujuan: field driver mulai kosong, hanya menunjukkan saran driver saat pengguna mengetik, dan memicu pengisian otomatis kendaraan default ketika driver dipilih.

## Konteks Saat Ini

- **Input Laporan**: dropdown `<select id='nama_supir'>` diisi nama driver (`opt.value = d.nama`). Di-pre-fill dari laporan terakhir (bersama kendaraan, tanggal, dll). `onSupirChange()` membaca nama terpilih → mencari driver → mengisi `vehicle` dengan `default_vehicle_id`. `filterFormByCabang()` memfilter driver per cabang. Saat simpan, `nama_supir` disimpan sebagai **nama** driver.
- **Buat Jadwal**: tiap baris punya `<select class='jalur-row-driver'>` diisi driver (value = `d.id` → butuh `driver_id`) dengan atribut `data-default-vehicle`. `jalurAutoFillVehicle()` mengisi `.jalur-row-vehicle` saat driver berubah. Saat simpan (`jalurSave`), `driver_id` diambil dari value select.
- Data driver dari server (`getActiveDrivers`) berisi `id`, `nama`, `cabang`, `default_vehicle_id`, dan sudah difilter berdasarkan role & cabang user (disediakan via `getMasterData` → `window.masterData.supir`).

## Perilaku yang Diinginkan (disetujui)

### Input Laporan
- Field `Nama Supir` menjadi **input teks kosong** + autocomplete (ketik → saran).
- **Saat memilih supir** → field `Kendaraan` otomatis terisi kendaraan default supir tersebut.
- **Sebelum memilih supir** → field `Kendaraan` **tetap kosong** (tidak di-pre-fill dari laporan terakhir untuk kondisi ini).
- Filter per cabang tetap berlaku (daftar saran menyesuaikan cabang terpilih).
- Validasi saat simpan: nama yang dimasukkan harus cocok dengan daftar driver; jika tidak valid (free-text), simpan ditolak + toast. Nilai yang disimpan adalah nama driver yang kanonik.

### Buat Jadwal
- Field `Driver` di tiap baris menjadi **input teks kosong** + autocomplete.
- **Saat memilih driver** → field `Kendaraan` di baris yang sama otomatis terisi kendaraan default.
- Field `Kendaraan` tetap berupa **dropdown** (bisa diubah manual).
- Validasi saat simpan: nama driver harus cocok dengan daftar; jika tidak dikenal, baris ditolak + toast. `driver_id` disimpan dari driver yang cocok.

## Pendekatan Teknis

- Memakai **native HTML `<datalist>` + `<input list='...'>`** (nol dependency tambahan).
- Source driver: `window.masterData.supir` (sudah difilter role/cabang di server).
- Setiap input driver diberi atribut data untuk menyimpan id driver terpilih (mis. `data-driver-id`) sebagai hasil resolusi nama → id.
- Validasi dilakukan di sisi client sebelum simpan; pesan error via `showToast`.

## File yang Diubah

- `src/Index.html` — field `nama_supir`: dari `<select>` jadi `<input list>` + elemen `<datalist>`.
- `src/JalurPages.html` — field `jalur-row-driver` di tiap baris: dari `<select>` jadi `<input list>` + `<datalist>`.
- `src/js.html` — logika: populasikan datalist, resolusi pilihan (nama → driver → isi `vehicle` / simpan id), hapus pre-fill driver & kendaraan (Input Laporan), validasi & penolakan free-text saat simpan, `onSupirChange`/`filterFormByCabang` disesuaikan.
- `src/JalurScript.html` — logika: datalist driver, resolusi pilihan per baris, isi otomatis `.jalur-row-vehicle`, validasi & penolakan baris tidak valid saat simpan.
- `src/css.html` — (jika perlu) penyesuaian penampilan kecil; umumnya tidak wajib karena memakai class Bootstrap.
- `README.md` — dokumentasi fitur.

## Catatan Penyimpanan Data

- **Input Laporan**: tetap menyimpan **nama** driver (`nama_supir`), tidak berubah skema.
- **Buat Jadwal**: tetap menyimpan **`driver_id`**, tidak berubah skema.
- Tidak ada perubahan skema spreadsheet.
