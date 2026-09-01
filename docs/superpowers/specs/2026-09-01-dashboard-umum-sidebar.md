# Desain: Susun Ulang Sidebar + Dashboard Umum

Tanggal: 2026-09-01

## Tujuan
1. Susun ulang menu sidebar desktop menurut fungsi (INPUT / LISTING / LAPORAN / ADMIN), sesuai arahan "input input aja, listing listing aja, laporan laporan aja".
2. Buat **Dashboard Umum** (bukan hanya flazz) sebagai ringkasan lintas modul, dan jadikan halaman landing setelah login.

## Keputusan (dikonfirmasi user)
- Kerjakan susun ulang sidebar DAN dashboard umum sekaligus.
- Dashboard Umum **menggantikan** Dashboard Flazz (halaman flazz-dashboard dihapus; konten status kartu etoll tampil di dalam Dashboard Umum).
- Isi Dashboard Umum: greeting dinamis, tombol quick access, galeri foto, dan tabel status kartu etoll.
- History Laporan dipisah dari Dashboard menjadi halaman/id sendiri.

## Susunan Sidebar Desktop (baru)
```
DASHBOARD (Dashboard Umum) — tab-dashboard, landing page
INPUT
  Input Laporan            tab-form
  Buat Jadwal              tab-jalur-buat
  Top Up Flazz             tab-flazz-topup
  Rekonsiliasi Flazz       tab-flazz-recon
LISTING
  History Laporan          tab-history (id baru, dipisah dari dashboard)
  Daftar Jadwal            tab-jalur-listing
  Riwayat Flazz            tab-flazz-history
  Galeri Foto              tab-gallery
LAPORAN
  Ringkasan Performa Kendaraan   tab-performa
  Summary Pengiriman       tab-jalur-summary
ADMIN
  Data Master              nav-master (superadmin & PIC cabang)
  Pengaturan               nav-settings (superadmin)
```

Hooks yang dipertahankan: `tab-*` id + `switchTab`, `nav-master`/`nav-settings`/`btn-nav-*` (visibilitas role), `sidebar-link`/`btn-nav` active toggling (js.html:364-371).

## Perubahan Halaman / Logika

### Index.html
- Sidebar `#menu-tabs`: susun ulang menjadi grup dengan `sidebar-heading` (INPUT/LISTING/LAPORAN/ADMIN), Dashboard di posisi pertama.
- `page-dashboard`: ganti isi menjadi Dashboard Umum:
  - Greeting dinamis (`#dash-greeting`).
  - Quick access buttons (`#dash-quick-access`).
  - Galeri foto terbaru (`#dash-gallery-content`).
  - Status kartu etoll: container `flazz-summary-cards` + `flazz-dashboard-table` (+ `flazz-dashboard-loading` / `flazz-dashboard-content`) untuk diisi `renderFlazzDashboardCards`/`renderFlazzMasterTable`.
- Halaman History Laporan baru: ubah `page-dashboard` (lama) menjadi `page-dashboard-history` dengan heading tetap "Riwayat Operasional"; tabel `dashboard-tbody` + pagination dipertahankan.
- Bottom nav (mobile): tambah tombol Dashboard (`data-tab="dashboard"`); sisanya sesuaikan.
- FlazzPages.html: hapus blok `page-flazz-dashboard` (diganti Dashboard Umum).

### js.html
- `switchTab`:
  - `tab='dashboard'` → tampil `page-dashboard` (Dashboard Umum) + panggil `renderDashboard()`.
  - `tab='history'` → tampil `page-dashboard-history` + panggil loader History (`loadDashboard`/`loadHistory`).
  - `tab='gallery'` tetap.
- Fungsi baru `renderDashboard()`:
  - Greeting dinamis (Selamat Pagi/Siang/Sore/Malam) berdasarkan jam, nama dari `userInfo.user`.
  - Muat data BBM/history melalui `getDashboardData(userInfo)` → simpan ke `window.__dashData` untuk galeri.
  - Render galeri foto terbaru (ringkas, reuse field foto dari `__dashData`).
  - Panggil `loadFlazzDataWrapper(true)` untuk mengisi status kartu etoll.
- Landing page: ganti `switchTab('form')` (baris 268) menjadi `switchTab('dashboard')` setelah login dan `prefillFormFromLast` tetap dipanggil (tanpa ubah halaman).

## Data / Backend
- Tidak ada perubahan schema. Memakai fungsi backend yang ada:
  - `getDashboardData` (riwayat/history BBM, Code.js:171) — untuk data galeri.
  - `getFlazzDashboardData` (FlazzOps.js:736) — status kartu etoll.
  - `getPerformaSummary` (opsional) — tidak dipakai di iterasi awal.

## Verifikasi / Deploy
- `node --check` semua blok script yang berubah (pola regex dari `src/deploy.ps1`).
- Commit + push ke branch `feature/autocomplete-driver`.
- `clasp push -f`; `clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF`.
- `clasp status` bersih.
