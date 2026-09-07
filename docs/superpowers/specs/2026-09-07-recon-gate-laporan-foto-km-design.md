# Enforced Gate Rekonsiliasi: Wajib Ada Laporan Valid Ber-Foto KM

> **Status:** Disetujui untuk diimplementasikan.
> **Tanggal:** 2026-09-07

## Ringkasan

Menambahkan **gate yang memaksa** pada step **Rekonsiliasi (step 3)** alur kerja BBM-Flazz: rekonsiliasi **tidak boleh diproses** untuk sebuah kartu otomatis selama **belum ada minimal 1 laporan valid** pada periode rekonsiliasi kartu tersebut. Laporan valid = baris `Penggunaan_BBM` ber-metode FLAZZ untuk kartu itu dengan **foto KM awal & akhir terisi** (beserta rincian/angka KM sesuai jenis indikator kendaraan). Tidak diwajibkan ada pengeluaran BBM/toll — kartu Flazz boleh dipakai tanpa beli BBM atau bayar tol, laporan tersebut tetap valid selama foto KM awal + akhir terisi dan memenuhi detail yang dipersyaratkan.

Enforcement dilakukan di **backend** (utama, selalu dijalankan) ditambah **frontend** (peringatan dini + blok sebelum submit).

## Konteks

- Alur kerja harian: **Step 1 = Jalur Pengiriman** → **Step 2 = Input Laporan** → **Step 3 = Rekonsiliasi Flazz**.
- Saat ini step 2 laporan **sudah** mewajibkan foto KM awal & akhir (`required` + `validateStep(2)` di `js.html:476-487`), sehingga laporan yang lolos form pasti punya foto KM.
- Namun `saveFlazzRecon` (`FlazzOps.js:538`) menghitung saldo sistem **murni dari ledger** dan **tidak memvalidasi** keberadaan laporan. Konsekuensinya step 3 bisa diproses tanpa ada laporan sama sekali — menghasilkan saldo sistem yang tidak mencerminkan pemakaian aktual (gap data integrity).
- Ledger & rekonsiliasi sudah memakai batas periode `sinceDate` = momen penyerahan kartu (`used_at` pada `Flazz_Usage`). Gate baru memakai batas periode yang sama agar konsisten.
- Tipe indikator kendaraan: sheet `Kendaraan` kolom ke-12 (index 11) `jenis_indikator`. Jarum = `ANALOG_JARUM`. Bar (digital) = selain jarum.

## Tujuan (enaknya kalau selesai)

1. Rekonsiliasi tidak bisa "mengecilkan" data pemakaian: wajib ada jejak laporan ber-foto KM di periode tersebut.
2. Kendaraan jarum tetap fleksibel (cukup foto KM; angka KM via slider level) — tidak diblokir oleh kriteria angka.
3. Baris laporan tanpa pengeluaran BBM/toll tetap valid selama foto KM awal+akhir terisi.
4. Pengguna mendapat umpan balik jelas di UI sebelum submit, dan backend tetap mencegah bypass.

## Lingkup (scope)

- **Di dalam:** gate di `saveFlazzRecon` (backend), helper baru `hasCompliantFlazzLaporan`, endpoint baru `checkReconGate`, status visual di form rekonsiliasi + blok sebelum submit (frontend).
- **Di luar lingkup:** perubahan step 1 (jalur) & step 2 (laporan) — form laporan sudah mewajibkan foto KM, tidak diubah. Perubahan ledger/topup/tol. Perubahan jenis indikator lain.

## Definisi Laporan Valid (gate)

Untuk kartu X, periode rekonsiliasi = `timestamp` baris `Penggunaan_BBM` lebih besar dari `sinceDate` (momen penyerahan kartu). Baris dianggap **valid** bila:

- `metode_pembayaran === 'FLAZZ'`, dan
- `flazz_card_id === X`, dan
- `timestamp (kolom index 1) > sinceDate`, dan
- **Tipe Bar / Digital** (`jenis_indikator !== 'ANALOG_JARUM'`):
  - `foto_km_awal` (index 8) terisi non-kosong, **dan**
  - `foto_km_akhir` (index 12) terisi non-kosong, **dan**
  - `km_awal_confirmed` (index 10) > 0, **dan**
  - `km_akhir_confirmed` (index 14) > 0.
- **Tipe Jarum / Analog** (`jenis_indikator === 'ANALOG_JARUM'`):
  - `foto_km_awal` (index 8) terisi non-kosong, **dan**
  - `foto_km_akhir` (index 12) terisi non-kosong.
  - (Angka KM tidak dipersyaratkan; KM jarum dicatat via slider level.)

Bila ≥ 1 baris memenuhi seluruh kriteria di atas → gate lolos. Pengeluaran (`biaya_bbm`, `biaya_toll`) boleh 0.

Catatan: baris dengan `km_sumber === 'ESTIMASI'` **tidak** lolos gate untuk tipe Bar karena angka KM-nya bukan aktual. Untuk tipe Jarum, kriteria angka tidak ada sehingga baris estimasi tetap dapat lolos selama foto KM terisi.

## Desain Detail

### 1. Backend — `src/FlazzOps.js`

**Helper baru** `hasCompliantFlazzLaporan(cardId, sinceDate, ss)`:

- Baca `Penggunaan_BBM` (via `ss.getSheetByName`), ambil `headers` dari baris pertama.
- Map kolom dengan `headers.indexOf(...)`: `metode_pembayaran`, `flazz_card_id`, `timestamp`, `vehicle_id`, `foto_km_awal`, `foto_km_akhir`, `km_awal_confirmed`, `km_akhir_confirmed`.
- Baca `Kendaraan` sekali untuk peta `vehicle_id → jenis_indikator` (kolom `vehicle_id` index 0, `jenis_indikator` index 11). Fallback `DIGITAL_BAR` bila tidak ketemu.
- Loop baris `>= 1`:
  - `metode === 'FLAZZ'` && `flazz_card_id === cardId` && `timestamp > sinceDate` (pakai logika `after()` seperti `computeFlazzLedger`).
  - `type = peta[vehicle_id]`.
  - `isJarum = type === 'ANALOG_JARUM'`.
  - `photoAwal = String(foto_km_awal).trim()`; `photoAkhir = String(foto_km_akhir).trim()`.
  - `hasPhotos = photoAwal !== '' && photoAkhir !== ''`.
  - `hasKm = parseFloat(km_awal_confirmed) > 0 && parseFloat(km_akhir_confirmed) > 0`.
  - Jika `isJarum`: valid bila `hasPhotos`.
  - Jika bukan jarum: valid bila `hasPhotos && hasKm`.
  - Jika valid → return `true` segera.
- Return `false` bila tidak ada baris memenuhi.

**Integrasi di `saveFlazzRecon`** (`FlazzOps.js:538`): setelah `sinceDate` dihitung (baris 581), sebelum `computeFlazzLedger`:

```js
if (!hasCompliantFlazzLaporan(payload.card_id, sinceDate, ss)) {
  throw new Error('Rekonsiliasi diblokir: belum ada laporan valid dengan foto KM awal & akhir pada periode kartu. Harap input laporan dahulu.');
}
```

**Endpoint global baru** `checkReconGate(cardId)` (dalam scope global `FlazzOps.js`, agar bisa dipanggil via `google.script.run`):

- Buka `ss`, cari `Flazz_Usage` DIBERIKAN terbaru untuk kartu (pola sama seperti `saveFlazzRecon`) → `sinceDate`.
- Jalankan `hasCompliantFlazzLaporan(cardId, sinceDate, ss)`.
- Kembalikan `{ eligible: bool, reason: string }`:
  - `eligible:true` → reason singkat.
  - `eligible:false` → reason yang menjelaskan kriteria yang belum terpenuhi.

### 2. Wrapper API — `src/Code.js`

Daftarkan endpoint baru mengikuti pola wrapper lain di file ini (mis. pembungkus `saveFlazzRecon`). Pastikan `processInitialData` / apa pun yang membangun `flazzDataCache` **tidak berubah** (kompatibel).

Contoh:

```js
function apiCheckReconGate(cardId) {
  return checkReconGate(cardId);
}
```

### 3. Frontend — `src/FlazzPages.html`

Tambahkan elemen status di form rekonsiliasi (di dekat dropdown kartu / sebelum tombol submit), contoh:

```html
<div id="recon-gate-status" class="alert py-2" style="display:none;"></div>
```

### 4. Frontend — `src/FlazzScript.html`

- Di `onReconCardSelect()` (FlazzScript.html:270): setelah menghitung saldo sistem, panggil `google.script.run.apiCheckReconGate(cardId)`:
  - `eligible:true` → hijau: "Laporan valid terdeteksi — rekonsiliasi bisa diproses." Aktifkan tombol submit.
  - `eligible:false` → merah: "Belum ada laporan valid dengan foto KM awal & akhir pada periode ini. Rekonsiliasi diblokir." Nonaktifkan tombol submit (dan/atau tampilkan pesan).
  - Kartu kosong → sembunyikan status, tombol dalam keadaan default.
- Di `saveFlazzReconForm()` (FlazzScript.html:394): sebelum submit, jalankan cek gate (boleh async) sebagai **lapisan kedua**. Jika tidak eligible → `showToast('Rekonsiliasi diblokir: ...', 'error')` & berhenti. Ini mencegah bypass bila status tidak sempat diperbarui.

## Alur Data

```
onReconCardSelect(cardId)
   → apiCheckReconGate(cardId) [server]
        → hasCompliantFlazzLaporan(cardId, sinceDate, ss)
            → scan Penggunaan_BBM (FLAZZ + cardId + timestamp>sinceDate)
               → cek foto KM awal/akhir (+ KM aktual untuk tipe Bar) via tipe kendaraan
            → eligible true/false
   → tampilkan status hijau/merah + enable/disable submit

saveFlazzReconForm → cek gate (2nd layer) → saveFlazzRecon (server)
   → hasCompliantFlazzLaporan(...) → false → throw → {success:false, msg}
```

## Error Handling

| Skenario | Perilaku |
|----------|----------|
| Tidak ada laporan FLAZZ di periode | Backend throw → toast error "Rekonsiliasi diblokir: belum ada laporan valid...". Frontend status merah, submit disabled. |
| Ada laporan FLAZZ tapi tanpa foto KM | Tidak lolos kriteria foto → diblokir (tipe apa pun). |
| Ada foto KM tapi tipe Bar tanpa KM aktual > 0 (estimasi) | Tidak lolos (tipe Bar). Untuk jarum, lolos (foto cukup). |
| Laporan FLAZZ tanpa pengeluaran BBM/toll (boleh 0) | **Lolos** — tidak diwajibkan pengeluaran. |
| `sinceDate` null / usage tidak ditemukan | Batas periode null → semua transaksi dianggap dalam periode (konsisten dgn ledger). |
| `vehicle_id` laporan tidak ada di Kendaraan | Dianggap `DIGITAL_BAR` (perlu foto + KM aktual) — konservatif aman. |

## Verifikasi (manual, setelah deploy)

1. Pilih kartu tanpa laporan di periode → status merah, tombol nonaktif, submit menampilkan toast blokir.
2. Buat laporan FLAZZ lengkap foto KM awal+akhir (+ KM aktual utk tipe Bar), tanpa pengeluaran → status hijau, rekonsiliasi bisa diproses.
3. Tipe Bar, laporan ber-foto tapi KM estimasi (`km_sumber=ESTIMASI`) → tetap diblokir.
4. Tipe Jarum, laporan ber-foto (KM lewat level) → lolos.
5. Bypass frontend (panggil `saveFlazzRecon` langsung) → backend tetap menolak.
