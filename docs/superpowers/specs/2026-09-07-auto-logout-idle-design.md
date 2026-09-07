# Desain: Auto Logout Setelah 5 Menit Tidak Aktif

Tanggal: 2026-09-07

## Latar Belakang

Aplikasi Monitoring BBM saat ini hanya mengandalkan `localStorage` (`bbm_user` dengan `__ts` maksimal 12 jam) untuk sesi. Tidak ada mekanisme logout otomatis ketika aplikasi dibiarkan terbuka tanpa aktivitas, sehingga layar tetap menampilkan data aplikasi bila pengguna pergi. Dibutuhkan auto logout berbasis idle untuk keamanan.

## Keputusan Desain

1. **Lokasi implementasi**: Frontend saja (`src/js.html` untuk logika + `src/Index.html` untuk elemen modal). Tidak ada perubahan backend.
2. **Durasi idle**: 5 menit (300.000 ms) tanpa aktivitas.
3. **Perilaku saat idle habis**: Tampilkan modal peringatan dengan countdown 60 detik. Apabila countdown habis, aplikasi logout otomatis. Apabila pengguna berinteraksi (termasuk menekan "Lanjutkan"), sesi dilanjutkan dan timer direset.

## Arsitektur / Komponen

### Timer idle (`src/js.html`)

- Konstanta `IDLE_TIMEOUT_MS = 5 * 60 * 1000` dan `IDLE_COUNTDOWN_MS = 60 * 1000`.
- Fungsi `resetIdleTimer()` — membatalkan `setInterval`/`setTimeout` yang berjalan, lalu memulai ulang timeout idle 5 menit.
- Event listener aktivitas pengguna yang memicu `resetIdleTimer()`:
  - `click`, `keydown`, `keyup`
  - `mousemove` (debounce: maksimal 1 reset per detik)
  - `touchstart`, `scroll`, `focus`
- Aktivitas pada elemen apa pun di `document` (dan `focus` pada `window`).

### Kapan timer berjalan

- Sesi aktif (sudah login): timer dimulai saat `loadInitialData` berhasil.
- Sesi juga di-pause/di-clear saat:
  - `logout()` dipanggil — clear semua timer dan sembunyikan modal.
  - Halaman login (tidak ada sesi) — timer tidak dijalankan sama sekali.

### Modal peringatan (`src/Index.html`)

- Elemen Bootstrap modal baru `#modal-idle-warning` ditempatkan di dekat akhir `body`.
- Isi pesan: "Aplikasi tidak digunakan selama 5 menit. Anda akan logout otomatis dalam X detik." dengan teks countdown dinamis.
- Tombol "Lanjutkan Sesi" — menutup modal dan memanggil `resetIdleTimer()`.
- Modal tidak bersifat dismissible secara kebetulan (backdrop static) agar tidak mudah terlewat; namun penutupan via tombol "Lanjutkan" tetap diperbolehkan.

### Alur countdown (`src/js.html`)

1. `showIdleWarning()` — menampilkan modal, menginisialisasi `countdown = 60`.
2. Interval 1 detik memperbarui teks countdown.
3. Setiap detik, bila terjadi aktivitas pengguna (`resetIdleTimer` dipanggil), modal ditutup dan countdown dibatalkan.
4. Saat `countdown <= 0`, panggil `logout()`.

### Gaya CSS

- Menggunakan class Bootstrap yang sudah tersedia (`modal`, `modal-dialog`, `modal-content`, dsb) dengan sedikit penyesuaian inline agar konsisten dengan tampilan aplikasi. Tidak menambah file CSS baru.

## Alur Data

```
PENGGUNA AKTIF (5 menit terakhir ada event)
  → resetIdleTimer() → timeout baru 5 menit

IDLE 5 MENIT TANPA EVENT
  → showIdleWarning() → countdown 60 detik (interval 1 dtk)
    → ada event/lanjutkan → tutup modal, resetIdleTimer()
    → countdown habis → logout()

LOGIN
  → loadInitialData() → resetIdleTimer()
```

## Error Handling

- `logout()` idempoten; di bagian awal fungsi, seluruh timer idel dan interval countdown dibatalkan untuk mencegah kebocoran interval.
- `showToast` (jika dipanggil) tidak diperlukan; cukup modal.

## Pengujian

Karena tidak ada framework test otomatis di repo, verifikasi manual di browser:

1. Login → biarkan idle 5 menit → modal muncul dengan countdown menurun.
2. Tekan "Lanjutkan Sesi" pada detik ke-30 → modal tertutup, sesi tetap, timer reset (lagi 5 menit).
3. Biarkan countdown habis → aplikasi kembali ke halaman login dan `localStorage.bbm_user` terhapus.
4. Aktivitas normal (klik/ketik/scroll) → timer ter-reset, tidak muncul modal.
5. Susunan halaman login → tidak ada timer berjalan (tidak ada error di konsol).
6. Hapus jalur dari "Daftar Jalur" → baris benar-benar hilang dari sheet `Jalur_Pengiriman` (perbaikan hard delete).

## Lingkup / Di Luar Lingkup

Di dalam lingkup:
- Auto logout idle 5 menit dengan peringatan countdown 60 detik.
- Perbaikan `deleteJalur` menjadi hard delete (menghapus baris fisik dari sheet).

Di luar lingkup:
- Perubahan kebijakan sesi `SESSION_MAX_AGE_MS` 12 jam.
- Logout menyeluruh lintas tab (multi-tab awareness).
- Pengaturan durasi idle yang dikonfigurasi pengguna.