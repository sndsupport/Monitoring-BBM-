# Jalur Pengiriman Gate: Blokir Jalur Baru Jika Jalur Sebelumnya Belum Selesai

**Tanggal:** 2026-09-10
**Status:** Approved
**Depends on:** Jalur Pengiriman Status Tracking (`.opencode/plans/2026-09-09-jalur-pengiriman-status-tracking.md`)

## Goal

Memblokir pembuatan jalur pengiriman baru jika kendaraan yang sama masih punya jalur
sebelumnya yang belum selesai (belum input laporan untuk non-flazz, atau belum
rekonsiliasi flazz untuk jalur flazz).

## Status Model (dari status tracking plan)

| Status | Meaning | Final untuk |
|--------|---------|-------------|
| `BELUM_DIISI` | Jalur dibuat, belum ada laporan | - |
| `SUDAH_LAPORAN` | Laporan sudah di-submit | Non-flazz jalur |
| `SELESAI` | Rekonsiliasi flazz selesai | Flazz jalur |

Status disimpan sebagai kolom baru `status` pada sheet `Jalur_Pengiriman`, bersama satu
kolom `laporan_id` (transaction_id laporan yang menautkan jalur). Untuk jalur non-flazz
status berhenti di `SUDAH_LAPORAN`; untuk flazz lanjut ke `SELESAI` setelah rekonsiliasi.

## Gate Logic

### Fungsi: `checkIncompleteJalurForVehicle(vehicle_id, tanggal)`

```
Input: vehicle_id (string), tanggal (string, YYYY-MM-DD)
Output: { blocked: boolean, incompleteJalur: object|null }

Logic:
1. Query sheet Jalur_Pengiriman
2. Filter: vehicle_id cocok, tanggal < input tanggal, is_deleted != '1'
3. Sort by tanggal DESC
4. Ambil jalur pertama (paling baru sebelum tanggal input)
5. Cek status:
   - Non-flazz (flazz_card_id kosong): blocked jika status !== 'SUDAH_LAPORAN'
   - Flazz (flazz_card_id ada): blocked jika status !== 'SELESAI'
6. Return { blocked, incompleteJalur }
```

`incompleteJalur` membawa `{ id, tanggal, plat_nomor, status, flazz_card_id }` agar pesan
error bisa menampilkan detail.

### Integrasi di `saveJalur()`

Di awal `saveJalur()` (setelah validasi dasar, sebelum loop rows):

1. Kumpulkan unique `vehicle_id` dari payload rows
2. Untuk setiap vehicle_id, panggil `checkIncompleteJalurForVehicle(vid, tanggal)`
3. Kalau ada yang blocked (1 atau lebih kendaraan), throw error yang mengumpulkan daftar
   semua kendaraan yang memblokir agar user bisa sekaligus melihatnya.

Gate berlaku untuk semua role (termasuk SUPERADMIN).

### Error Message Format

```
Jalur baru untuk kendaraan B 1234 CD tidak bisa dibuat.
Jalur sebelumnya (tanggal 2026-09-09, status: BELUM_DIISI) belum selesai.
Harap input laporan terlebih dahulu.
```

```
Jalur baru untuk kendaraan B 1234 CD tidak bisa dibuat.
Jalur sebelumnya (tanggal 2026-09-09, status: SUDAH_LAPORAN) belum selesai.
Harap lakukan rekonsiliasi saldo flazz terlebih dahulu.
```

Pesan non-flazz vs flazz ditentukan dari nilai `flazz_card_id` jalur yang memblokir.

## Edge Cases

| Kasus | Handling |
|-------|----------|
| Kendaraan belum punya jalur sebelumnya | Tidak diblokir |
| Jalur sebelumnya sudah di-delete | Tidak diblokir (hard delete di `deleteJalur`) |
| Payload beberapa kendaraan | Cek satu per satu, 1 blocked = seluruh save ditolak |
| SUPERADMIN | Tetap diblokir |
| Tanggal input = tanggal jalur sebelumnya | Cek jalur dengan tanggal < input (strictly before) |
| Kolom status belum ada (sebelum setupDatabase migrasi) | `checkIncompleteJalurForVehicle` membaca header dinamis; hilang → dianggap kosong, `status` fallback `BELUM_DIISI` |

Validasi tambahan: `saveJalur` mengabaikan baris payload yang tidak lengkap
(`!driver_id || !vehicle_id || !rute_tujuan`) seperti perilaku eksisting, dan baris kosong
semacam itu tidak ikut men-trigger gate.

## Update Status

Status jalur diperbarui otomatis pada dua titik:

1. **Saat laporan di-submit** (`saveTransactionEndOfDayUnlocked` di `SpreadsheetOps.js`):
   cocokkan jalur via `(tanggal, vehicle_id, nama_driver` = `payload.nama_supir, kode_cabang)`;
   bila ketemu dan status bukan `SELESAI`, set `SUDAH_LAPORAN` + `laporan_id`.
2. **Saat rekonsiliasi flazz selesai** (`saveFlazzReconUnlocked` di `FlazzOps.js`):
   cocokkan jalur via `flazz_card_id` sama dengan kartu yang direkonsiliasi; bila ketemu
   dan status belum `SELESAI`, set `SELESAI`.

Kedua titik dibungkus try/catch sehingga kegagalan `>= terpisah` tidak menggagalkan
operasi utama (laporan/recon tetap tersimpan).

## Backfill Status

Fungsi `backfillJalurStatus()` (panggilan manual sekali dari editor Apps Script) mengisi
`status`+`laporan_id` untuk seluruh baris `Jalur_Pengiriman` yang kolomnya masih kosong,
dengan cara:

- Tidak ada laporan yang cocok → `BELUM_DIISI`
- Ada laporan, tanpa kartu flazz → `SUDAH_LAPORAN`
- Ada laporan, ada kartu flazz, dan sudah ada `Flazz_Reconciliation` untuk kartu tersebut
  (tanggal recon >= tanggal jalur) → `SELESAI`
- Ada laporan, ada kartu flazz, tapi belum ada recon → `SUDAH_LAPORAN`

Pencocokan laporan memakai `(tanggal, vehicle_id, nama_supir)` di `Penggunaan_BBM`.

## UX

- Server return `{ success: false, msg: "..." }` — sudah ditangani klien via
  `showToast(res.msg, 'error')` di `jalurSave()` (tidak ada perubahan kode klien untuk gate).
- Status badge di listing & summary menampilkan status jalur (dari status tracking plan).

## File Changes

| File | Action | Change |
|------|--------|--------|
| `src/DatabaseSetup.js` | Modify | Jalur_Pengiriman schema + `status`, `laporan_id` |
| `src/JalurOps.js` | Add | `checkIncompleteJalurForVehicle`, `updateJalurStatus`, `findJalurByCriteria`, `backfillJalurStatus` |
| `src/JalurOps.js` | Modify | `saveJalur()` gate + set status awal; `getJalurByTanggal()` return status |
| `src/SpreadsheetOps.js` | Modify | Update status setelah laporan disimpan |
| `src/FlazzOps.js` | Modify | Update status setelah rekonsiliasi |
| `src/JalurPages.html` | Modify | Kolom Status di tabel listing & summary |
| `src/JalurScript.html` | Modify | Badge status di listing & summary |

## Out of Scope

- Perubahan alur edit/delete jalur (hard delete tetap berjalan tanpa reset status)
- Edit/delete laporan tidak meregresi status jalur (status diperbarui satu arah saat save)
- Pemblokiran untuk laporan BBM (bukan jalur) — hanya jalur yang di-gate