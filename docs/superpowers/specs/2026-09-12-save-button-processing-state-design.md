# Desain: State "Memproses" pada Tombol Simpan

Tanggal: 2026-09-12

## Masalah

Tombol Simpan pada sebagian form tidak memberi umpan balik visual saat diklik
sedang diproses, sehingga pengguna bisa mengklik berulang kali (double submit)
atau mengira aplikasi hang. Beberapa form bahkan tidak mengubah state tombol
sama sekali.

## Ruang Lingkup

Standarkan tombol Simpan agar saat diklik menjadi non-aktif disertai spinner
dan teks "Menyimpan..." / "Memproses...", lalu kembali normal setelah selesai
(sukses atau gagal).

Form yang **belum** punya state memproses meliputi:

1. `saveEditDaily` — tombol submit modal Edit Transaksi BBM (History Laporan).
   Saat ini tanpa feedback sama sekali.
2. Master CRUD (hanya `disabled`, tanpa teks/spinner):
   - `addMasterCabang` — `btn-add-cabang`
   - `addMasterKendaraan` — `btn-add-vehicle`
   - `addMasterSupir` — `btn-add-supir`
   - `addMasterBBM` — `btn-add-bbm`
   - `saveMasterPenggunaForm` — `btn-save-pengguna`

Form di luar daftar di atas (input laporan harian, Flazz topup/recon/edit/card,
jalur) sudah punya state memproses dan **tidak** diubah.

## Pola Standar

Ikuti pola yang sudah dipakai di `FlazzScript.html`:

```js
let btn = document.getElementById('...');
let orig = btn.innerHTML;
btn.dataset.origHtml = orig;
btn.disabled = true;
btn.innerHTML = "<span class='spinner-border spinner-border-sm'></span> Menyimpan...";

google.script.run
  .withSuccessHandler(res => {
    btn.disabled = false;
    btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || orig;
    // ... sukses
  })
  .withFailureHandler(err => {
    btn.disabled = false;
    btn.innerHTML = (btn.dataset && btn.dataset.origHtml) || orig;
    // ... gagal
  })...
```

Ketentuan:

- Teks: "Menyimpan..." untuk simpan master, "Memproses..." untuk edit transaksi.
- `saveEditDaily`: restore tombol hanya di `withFailureHandler` (modal auto-close
  saat sukses sehingga tidak perlu restore).
- Master CRUD: restore tombol di `withSuccessHandler` dan `withFailureHandler`
  (modal di-close manual setelah sukses).
- Perubahan hanya di `src/js.html`; tidak ada perubahan server-side.

## Penanganan Error

- Gagal: restore tombol + `showToast('Gagal: ' + err.message, 'error')` seperti
  perilaku existing.

## Pengujian

- `node --check` pada file JS/HTML (pola `deploy.ps1`) memastikan tidak ada
  syntax error.
- Verifikasi manual live: klik Simpan pada masing-masing form → tombol
  menampilkan spinner + teks "Menyimpan..."/"Memproses...", auto-restore.

## File yang Diubah

- `src/js.html` (6 handler: saveEditDaily, addMasterCabang, addMasterKendaraan,
  addMasterSupir, addMasterBBM, saveMasterPenggunaForm)