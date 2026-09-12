# Desain — Panel "Peringatan Dini" di Dashboard

**Tanggal:** 2026-09-12
**Status:** Disetujui (brainstorm, 3 bagian)

## Tujuan

Perkaya halaman Dashboard (landing) dengan panel "Peringatan Dini" yang menampilkan dua kategori:
1. Kendaraan dengan pajak/KIR mendekati/melewati jatuh tempo (LEWAT ≤0 hari, KRITIS ≤30, WASPADA ≤60).
2. Kartu etoll berstatus aktif dengan saldo < **Rp100.000**.

Scoping sesuai role: PIC CABANG hanya melihat warehouse-nya; SUPERADMIN melihat semua warehouse dengan filter cabang.

## Keputusan (hasil tanya-jawab)

- Cakupan: perkaya halaman Dashboard yang sudah ada (bukan halaman baru).
- Fokus: peringatan dini (pajak/KIR + saldo kartu menipis).
- Ambang saldo menipis: **tetap < Rp100.000** (Rp100.000 persis = aman).
- Pendekatan: **B** — endpoint server baru `getDashboardWarnings(token)` + panel baru di landing, mengikuti pola `getPerformaData`/`getDashboardData`.

## Arsitektur

- `src/WarningsCore.js` — logika murni tanpa GAS (node-testable): `warnVehicleAlerts`, `warnWorst`, `warnCardIsLow`, `warnSortPajak`, `warnMinSisa`, `WARN_LEVEL`.
- `src/WarningOps.js` — `warningsSummary(token)`: baca vehicle (getActiveVehicles, scoped) + kartu (getFlazzCards, scoped), bangun payload, sort.
- `src/Code.js` — wrapper `getDashboardWarnings(token)` + cache `dashwarnCacheKey` (TTL 300 dtk, pola performa).
- `src/CacheUtil.js` — tambah `dashwarnCacheKey(role, cabang)`.
- `src/Index.html` — markup kartu "Peringatan Dini" di `page-dashboard` (setelah Akses Cepat, sebelum Status Kartu Etoll).
- `src/js.html` — `loadDashboardWarnings(force)`, `renderDashboardWarnings()`, helper render; dipanggil dari `renderDashboard()` (line 1238 area).
- Hook refresh otomatis setelah sukses top-up/rekonsiliasi/jalur di `FlazzScript.html` & `JalurScript.html`.

## Reuse

- `jalurComputePajak(tgl)` (JalurOps.js:239) untuk ketiga sub-status: Pajak tahunan, Pajak 5 tahunan, KIR. Ambang: `days<=0` LEWAT, `<=30` KRITIS, `<=60` WASPADA, lain AMAN, tanpa tanggal TIDAK_ADA.
- Kendaraan masuk daftar jika minimal satu sub-status ∈ {LEWAT, KRITIS, WASPADA}; AMAN & TIDAK_ADA dilewati.
- Kartu: `status.toUpperCase() !== 'NONAKTIF'` DAN `parseFloat(last_balance) < 100000`.

## Payload

```
getDashboardWarnings(token) => {
  pajakKIR: [{ vehicle_id, plat_nomor, nama_kendaraan, jenis, cabang,
               alerts: [{tipe:'PAJAK'|'PAJAK5'|'KIR', status, sisa_hari, tanggal}], worst }],
  saldo:   [{ id, card_number, card_name, card_type, cabang, last_balance, status }]
}
```
- Sort pajakKIR: LEWAT → KRITIS → WASPADA, lalu sisa hari terendah naik.
- Sort saldo: `last_balance` naik.
- Tanggal dikirim `yyyy-MM-dd` (konversi via `warnDateStr` + timezone spreadsheet).

## Akses & cache

- PIC: hanya `u.cabang` (server-enforced); tanpa cabang → `[]` tanpa throw.
- SUPERADMIN: semua cabang; filter cabang client-side (pola `renderPerforma`), select hanya tampil jika cabang > 1.
- Cache: `dashwarn:<role>:<cabang>` TTL 300 dtk; invalidasi opsional (TTL cukup, konsisten performa).

## UI Panel

- Header: ikon `bi-shield-exclamation`, judul "Peringatan Dini", badge count total, tombol Refresh, select filter cabang (SUPERADMIN).
- Grup kiri "Pajak & KIR Kendaraan": baris `plat — nama` + badge per alert (LEWAT=merah, KRITIS=oranye, WASPADA=kuning) berisi label (Pajak/Pajak 5th/KIR) + "sisa X hari · tanggal" + badge cabang (SUPERADMIN). Klik → `switchTab('jalur-listing')`.
- Grup kanan "Saldo Kartu Etoll < Rp100.000": `nama_kartu — ***XXXX — tipe`, saldo Rp merah. Klik → `switchTab('flazz-topup')`.
- Empty state per grup: teks "Semua aman ...".
- Loading skeleton; kegagalan server → toast + pesan kosong, dashboard tetap jalan.

## Pengujian

- Node scratch `warnings-core-test.js` (gitignored) untuk `WarningsCore` — TDD failing-first.
- `TestRunner.__runWarningsTests()` (editor): boundary saldo 99.999 vs 100.000, NONAKTIF dilewati, pajak lewat/jauh, `worst=LEWAT`, kontrak endpoint SUPERADMIN/PIC/token palsu.
- `node --check` semua file baru/teredit.
- Deploy versi baru @251 (link sama); verifikasi live PIC + SUPERADMIN + boundary Rp100.000.