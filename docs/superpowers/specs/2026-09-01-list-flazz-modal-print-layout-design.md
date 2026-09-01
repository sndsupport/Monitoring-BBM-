# List Flazz — Modal & Print: Layout Laporan (tanpa tab)

Date: 2026-09-01
Status: Approved (design) / To-be-verified (implementation)

## Problem

Modal detail kartu Flazz saat ini memakai tab (Top Up / Tol / BBM / Pemakaian / Rekonsiliasi). Karena isi harus bisa dicetak A4 untuk pengajuan top-up ke finance, tab tidak cocok: hanya tab aktif yang terlihat & ikut tercetak, dan data pengeluaran + rekonsiliasi tidak muncul utuh di hasil cetak.

## Requirement (dari user)

- Modal berubah menjadi layout laporan, **tanpa tab** — semua tabel tersusun berurutan dan langsung terlihat.
- Judul modal & header cetak: **"Laporan Penggunaan Kartu Flazz - {nomor etoll}"**.
- Info kartu tetap: Nama Kartu, Tipe, Driver, Cabang, **Saldo Saat Ini**.
- Tabel yang ditampilkan (modal & cetak):
  1. **Top Up** — Tanggal, Nominal, Bukti, Catatan.
  2. **Rincian Pengeluaran** — gabungan Tol + BBM: Tanggal, Jenis (Tol/BBM), Supir/Kendaraan, Nominal.
  3. **Rekonsiliasi Harian** — Tanggal, Saldo Awal, Top Up, BBM+Tol, Saldo Sistem, Saldo Fisik, Selisih, Status.
- **Pemakaian TIDAK ditampilkan** di modal maupun cetak.
- Filter tanggal tetap di menu List Flazz (tidak ada filter di popup). Baris mengikuti tanggal yang dipilih; jika kosong → semua riwayat kartu.
- Cetak A4 membuka window baru (seperti sekarang), dengan header + info + Saldo Saat Ini + 3 tabel di atas.

## Implementation notes

- File utama: `src/FlazzScript.html`.
  - `showFlazzDetailModal` / `showFlazzDetailTab` / `renderFlazzDetailHistory` (baris ~883–1007) → ganti: hapus tab markup & `showFlazzDetailTab`, render 3 tabel langsung (Top Up, Pengeluaran gabungan Tol+BBM, Rekonsiliasi), filter baris dengan `$('#flazz-listing-date').value` bila terisi.
  - `printFlazzA4()` (baris ~1014–1096) → header `Laporan Penggunaan Kartu Flazz - {nomor}`; tetap info + Saldo Saat Ini; ganti ringkasan saldo-hari-itu + detail pengeluaran hari-itu menjadi: ringkasan opsional SALDO AWAL hari itu (formula Task 3) boleh dipertahankan, lalu 3 tabel lengkap mengikuti filter tanggal yang sama.
- `src/FlazzPages.html`: tanpa perubahan struktur (footer/body modal dipakai apa adanya); hanya jika perlu.
- Tidak ada perubahan backend/GAS.

## Verification

- `node --check` pada semua `<script>` block `src/FlazzScript.html` (exit 0).
- Manual: buka modal → judul benar, 3 tabel tampil tanpa klik, Pemakaian tidak ada; ganti tanggal di menu → baris ikut berubah; Cetak A4 → window baru berisi header + 3 tabel, auto print.