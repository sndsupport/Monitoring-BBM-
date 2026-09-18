# Plan: Edit Laporan via Form Input (bukan Modal)

**Status:** Draft
**Tanggal:** 2026-09-16
**Deploy:** semua perubahan di-push ke deployment `AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF` (web link sama).

## Tujuan

Mengubah aksi **Edit** di History Laporan agar tidak lagi membuka popup modal `modal-edit-daily`, melainkan **kembali ke form Input Laporan** dengan seluruh field form terisi data transaksi lama. User mengedit langsung di form utama, lalu menyimpan.

Aksi **Hapus** tetap memakai popup konfirmasi (tidak berubah).

## Desain

- Flag global client: `window.__editingTxId` (transaction_id sedang diedit) dan `window.__editingSupir` (nama supir laporan) .
- `editDaily(id)` → alihkan ke `loadEditInForm(id)`.
- `loadEditInForm(id)`:
  1. lookup row di `window.__recent`.
  2. set `__editingTxId` & `__editingSupir`.
  3. set `tanggal` lalu `switchTab('form')` (men-trigger refresh dropdown supir).
  4. isi semua field form dari row (vehicle, km, bar, liter, biaya, jenis, metode, kartu, foto).
  5. tampilkan banner edit-mode; ubah teks tombol & judul ringkasan.
- `populateJalurDriverSelect` otomatis menambahkan `__editingSupir` bila tak ada di daftar jalur BELUM_DIISI.
- `processDailyReport()` bercabang: bila `__editingTxId` → jalur `processDailyEditReport()` memanggil `apiEditDailyTransaction` (bukan `processDailyImages`+`saveDailyTransaction`).
- Pembatalan: `cancelEditForm()` membersihkan state edit & reset form.

## Field form → payload edit (server `editDailyTransaction`)

| Form                  | Payload edit  | Server menulis?                                      |
|-----------------------|---------------|------------------------------------------------------|
| nama_supir            | nama_supir    | Ya (`SpreadsheetOps.js:1005`)                        |
| tanggal               | tanggal       | Ya (`SpreadsheetOps.js:1072`)                        |
| km_awal_val           | km_awal       | Ya (`SpreadsheetOps.js:1007`)                        |
| km_akhir_val          | km_akhir      | Ya (`SpreadsheetOps.js:1010`)                        |
| biaya_bbm             | biaya_bbm     | Ya (`SpreadsheetOps.js:993`)                         |
| biaya_toll            | biaya_toll    | Ya (`SpreadsheetOps.js:994`)                         |
| liter_bbm             | liter_bbm     | Ya (`SpreadsheetOps.js:1002`)                        |
| metode_pembayaran     | metode_pembayaran | Ya (`SpreadsheetOps.js:991`)                     |
| flazz_card_id         | flazz_card_id | Ya (`SpreadsheetOps.js:992`)                         |
| metode_toll           | metode_toll   | Ya (`SpreadsheetOps.js:995`)                         |
| flazz_card_id_toll    | flazz_card_id_toll | Ya (`SpreadsheetOps.js:996`)                     |
| foto_odo_awal (baru)  | foto_odo_awal | Ya, hanya bila ada file baru (`SpreadsheetOps.js:1053`) |
| foto_odo_akhir (baru) | foto_odo_akhir | Ya, hanya bila ada file baru (`SpreadsheetOps.js:1062`) |
| **bar_awal**          | bar_awal      | **BELUM** — perlu ditambahkan                       |
| **bar_akhir**         | bar_akhir     | **BELUM** — perlu ditambahkan                       |

## Tugas

- [ ] **T1 — Server: `getRecentTransactions` menambahkan `bar_awal`, `bar_akhir`, `vehicle_id` ke result object** (`SpreadsheetOps.js:799`). Nilai sudah dihitung (barAwal/barAkhir di `:749-750`), `vehicle_id` = `row[6]`. Tambah 3 field ini ke `result.push({...})`. **Tidak boleh mengganggu field lain.**
- [ ] **T2 — Server: `editDailyTransactionUnlocked` menulis `bar_awal` & `bar_akhir`.** Tambah `idxBarAwal = headers.indexOf('bar_awal')`, `idxBarAkhir = headers.indexOf('bar_akhir')` di blok header (`SpreadsheetOps.js:867-884`). Setelah blok km (`:1012`), tulis bila payload mengirim: `sheet.getRange(rowIndex, idxBarAwal+1).setValue(parseFloat(payload.bar_awal) || 0)` dan sama untuk akhirs. Server tetap hanya SUPERADMIN.
- [ ] **T3 — Client: `loadEditInForm(id)` + `cancelEditForm()` + `enterEditMode`/`exitEditMode` helpers** (`js.html`).
- [ ] **T4 — Client: `processDailyEditReport()`** — jalur edit di `processDailyReport`: payload format edit, compress foto baru bila ada, panggil `apiEditDailyTransaction(payload, bbmToken())`, pada sukses flush cache + reset + keluar edit mode + `loadDashboard()`.
- [ ] **T5 — Client: `populateJalurDriverSelect` menambah `__editingSupir` bila belum ada** (`js.html:361`).
- [ ] **T6 — UI: banner edit-mode + label tombol "Simpan Perubahan"** (`Index.html`). Tambah div banner (hidden default) di atas form; teks `btn-review` sementara "Tinjau & Simpan Perubahan"; judul `modal-ringkasan-label` sementara "Ringkasan Perubahan".
- [ ] **T7 — `resetDailyForm` membersihkan state edit + foto required + label tombol kembali normal.**
- [ ] **T8 — Bump `PAGE_VER` (Config.gs) `20260916v4` → `20260916v5`; `clasp push`, deploy ulang ke deployment yang sama; verifikasi manual + cek tidak ada fungsi lama yang rusak.**

## Catatan risiko
- Edit tetap SUPERADMIN-only (server `assertSuperadminOnly`).
- Foto lama dipertahankan; hanya diganti bila user pilih file baru.
- `km_awal_broken`/`km_akhir_broken` & estimasi TIDAK diubah (baris sudah punya km; nilai prefill dipakai apa adanya). Server set `km_sumber='AKTUAL'` saat km berubah (perilaku ekstensial `editDailyTransaction` selama ini).
- Dropdown supir tetap berbasis jalur BELUM_DIISI saat mode belum dimulai; hanya saat edit-mode `__editingSupir` ditambahkan agar bisa tersimpan.