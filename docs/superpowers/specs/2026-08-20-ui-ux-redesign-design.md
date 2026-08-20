# UI/UX Redesign Design Document
## Sistem Monitoring BBM & Operasional Harian

**Tanggal:** 20 Agustus 2026
**Status:** Draft
**Approach:** Bootstrap Mobile-First Refactor

---

## 1. Overview

### 1.1 Tujuan
Melakukan revisi dan penyempurnaan UI/UX aplikasi agar:
- Lebih modern
- Mobile-first
- Sederhana digunakan PIC CABANG
- Tetap nyaman digunakan SUPERADMIN

### 1.2 Scope
- Revisi UI/UX tanpa mengubah fitur yang sudah ada
- Penambahan fitur konfigurasi logo
- Optimasi untuk mobile devices
- Peningkatan user experience

### 1.3 Source of Truth
README.md yang diberikan user adalah kondisi aplikasi TERKINI dan menjadi source of truth untuk struktur, fitur, role, dan teknologi aplikasi.

---

## 2. Design Approach

### 2.1 Selected Approach: Bootstrap Mobile-First Refactor

**Mengapa:**
1. Perubahan minimal - Tetap pakai Bootstrap yang sudah familiar
2. Mudah di-maintain - Tidak perlu learning curve baru
3. Kompatibel dengan Google Apps Script - Tidak ada issues
4. Cukup untuk mobile-first - Card-based, bottom nav, card list dashboard sudah mencukupi

### 2.2 Technology Stack
- **Framework:** Bootstrap 5.3.0
- **Custom CSS:** Mobile-first optimizations
- **Icons:** Bootstrap Icons
- **Animations:** CSS transitions
- **Storage:** Google Sheets + Drive

---

## 3. Navigation & Layout Structure

### 3.1 Mobile Navigation (Bottom Nav Bar)

```
┌─────────────────────────────────────────┐
│              Header/Navbar              │
│         BBM Operasional - User Info     │
├─────────────────────────────────────────┤
│                                         │
│           [Main Content Area]           │
│                                         │
├─────────────────────────────────────────┤
│  📝 Input    │  📊 History  │  ⚙️ Master │
│    Laporan   │    Laporan   │    Data    │
└─────────────────────────────────────────┘
```

**Spesifikasi:**
- Fixed bottom di mobile (< 768px)
- Icon + Label untuk setiap tab
- Active state: Warna biru (#0d6efd) dengan indicator
- Inactive state: Abu-abu (#6c757d)
- Touch target: Minimum 48px height
- Z-index: Di atas konten lain

### 3.2 Desktop Navigation (Top Tabs)

```
┌─────────────────────────────────────────┐
│  BBM Operasional    │ User (Role) [Logout] │
├─────────────────────────────────────────┤
│  [Input Laporan] [History] [Data Master] │
├─────────────────────────────────────────┤
│           [Main Content Area]           │
└─────────────────────────────────────────┘
```

**Spesifikasi:**
- Tetap tabs di desktop (> 768px)
- Horizontal layout seperti sekarang
- Tabs di bawah header

---

## 4. Login Page Design

### 4.1 Mobile Login

```
┌─────────────────────────────────────────┐
│                                         │
│         ┌─────────────────────┐         │
│         │                     │         │
│         │    [LOGO IMAGE]     │         │
│         │                     │         │
│         └─────────────────────┘         │
│                                         │
│       Monitoring BBM Operasional        │
│                                         │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │  Username                         │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │                             │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Password                         │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │                             │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │         MASUK               │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 4.2 Desktop Login

```
┌─────────────────────────────────────────┐
│                                         │
│    ┌─────────────────────────────────┐  │
│    │         Login Sistem BBM        │  │
│    │  ┌───────────────────────────┐  │  │
│    │  │ Username                  │  │  │
│    │  │ ┌───────────────────────┐ │  │  │
│    │  │ └───────────────────────┘ │  │  │
│    │  │                           │  │  │
│    │  │ Password                  │  │  │
│    │  │ ┌───────────────────────┐ │  │  │
│    │  │ └───────────────────────┘ │  │  │
│    │  │                           │  │  │
│    │  │ ┌───────────────────────┐ │  │  │
│    │  │ │       MASUK           │ │  │  │
│    │  │ └───────────────────────┘ │  │  │
│    │  └───────────────────────────┘  │  │
│    └─────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 4.3 Spesifikasi Login

**Storage (Google Sheets):**
- Sheet baru: `Pengaturan`
- Kolom: `key`, `value`
- Data: `logo_url`, `app_name`, `company_name`

**API Endpoints:**
```javascript
// Ambil pengaturan (termasuk logo)
getAppSettings()

// Simpan pengaturan (Superadmin only)
saveAppSettings(data)

// Upload logo ke Google Drive
uploadLogo(file)
```

**Logo Display Logic:**
```javascript
// Fallback jika tidak ada logo
if (settings.logo_url) {
  // Tampilkan logo dari Drive
  logoImg.src = settings.logo_url;
} else {
  // Tampilkan icon default atau inisial
  logoContainer.innerHTML = '<i class="bi bi-fuel-pump"></i>';
}
```

**Input Fields:**
- Height: 48px (mobile), 40px (desktop)
- Font-size: 16px (mencegah zoom di iOS)
- Border: 1px solid #dee2e6
- Border-radius: 8px
- Focus state: Border biru (#0d6efd) + box-shadow

**Button:**
- Full-width
- Height: 52px
- Background: Gradient biru (#0d6efd ke #0b5ed7)
- Font: Bold, 16px

**Logo Upload Settings:**
- Max logo size: 200KB
- Recommended dimensions: 200x200px (square) atau 200x80px (landscape)
- Format: PNG, JPG, atau SVG
- Storage: Google Drive, URL disimpan di Sheets
- Fallback: Icon Bootstrap (`bi-fuel-pump`) jika tidak ada logo

---

## 5. Input Form (Laporan Operasional)

### 5.1 Mobile Input Form - Card-Based

```
┌─────────────────────────────────────────┐
│  📝 Input Laporan                       │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  🚗 Data Kendaraan & Supir        │  │
│  │  ─────────────────────────────    │  │
│  │                                   │  │
│  │  Kendaraan:                        │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ B 1234 CD - Avanza          ▼│  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Supir:                            │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Budi Santoso                ▼│  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Tanggal:                          │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 20/08/2026                  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  🚢 Keberangkatan (Awal)         │  │
│  │  ─────────────────────────────    │  │
│  │                                   │  │
│  │  Bar Bensin Awal:                 │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 8                           │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  📷 Foto Dasbor Awal:             │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │     [Tap untuk upload]      │  │  │
│  │  │     📷                      │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  🏠 Kepulangan (Akhir)           │  │
│  │  ─────────────────────────────    │  │
│  │                                   │  │
│  │  Bar Bensin Akhir:                │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 5                           │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  📷 Foto Dasbor Akhir:            │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │     [Tap untuk upload]      │  │  │
│  │  │     📷                      │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  ⛽ Pengeluaran BBM (Opsional)   │  │
│  │  ─────────────────────────────    │  │
│  │                                   │  │
│  │  Ada struk BBM hari ini?          │  │
│  │  ┌───────┐  ┌───────┐            │  │
│  │  │ Tidak │  │  Ya   │            │  │
│  │  └───────┘  └───────┘            │  │
│  │                                   │  │
│  │  [Jika Ya muncul:]                │  │
│  │  Jenis BBM:                       │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Pertalite (Rp 10,000/L)    ▼│  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Jumlah Liter:                    │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 25.5                        │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Total Biaya: Rp 255,000          │  │
│  │  (auto-calculated)                │  │
│  │                                   │  │
│  │  📷 Foto Struk:                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │     [Tap untuk upload]      │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  🛣️ Toll (Opsional)              │  │
│  │  ─────────────────────────────    │  │
│  │                                   │  │
│  │  Ada struk Toll hari ini?         │  │
│  │  ┌───────┐  ┌───────┐            │  │
│  │  │ Tidak │  │  Ya   │            │  │
│  │  └───────┘  └───────┘            │  │
│  │                                   │  │
│  │  [Jika Ya muncul:]                │  │
│  │  Total Biaya Toll:                │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ 50000                       │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  📷 Foto Struk:                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │     [Tap untuk upload]      │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  PROSES FOTO & SIMPAN      │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 5.2 Spesifikasi Input Form

**Card Design:**
- Border: None, gunakan shadow halus
- Border-radius: 12px
- Padding: 16px
- Margin bottom: 16px antar card
- Header card: Icon + Judul dengan border-bottom tipis

**Input Fields:**
- Height: 48px (mobile), 40px (desktop)
- Font-size: 16px (mencegah zoom iOS)
- Border: 1px solid #dee2e6
- Border-radius: 8px
- Focus state: Border biru (#0d6efd) + box-shadow

**Toggle Buttons (Ya/Tidak):**
- Group: Dalam satu container
- Active: Warna biru (#0d6efd)
- Inactive: Warna abu (#e9ecef)
- Border-radius: 8px
- Height: 44px

**Photo Upload Area:**
- Dashed border untuk area upload
- Height: 120px
- Icon: Camera icon besar di tengah
- Text: "Tap untuk upload"
- Preview: Setelah upload, tampilkan thumbnail
- Max file size: 5MB

**Submit Button:**
- Full-width
- Height: 52px
- Background: Gradient biru (#0d6efd ke #0b5ed7)
- Font: Bold, 16px
- Loading state: Spinner + "Memproses..."

**Responsive Behavior:**
- Mobile (< 768px): Full-width cards, stacked
- Tablet (768px - 1024px): 2 columns untuk some fields
- Desktop (> 1024px): Max-width 800px, centered

---

## 6. Dashboard (History Laporan)

### 6.1 Mobile Dashboard - Card List View

```
┌─────────────────────────────────────────┐
│  📊 History Laporan                     │
├─────────────────────────────────────────┤
│                                         │
│  🔍 Filter: [Semua Cabang ▼] [Bulan ▼] │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  📅 20 Agustus 2026              │  │
│  │  📍 Jakarta                      │  │
│  │  ─────────────────────────────   │  │
│  │                                   │  │
│  │  🚗 B 1234 CD - Avanza            │  │
│  │  👤 Budi Santoso                  │  │
│  │                                   │  │
│  │  ┌─────────┐  ┌─────────┐         │  │
│  │  │ KM: 150 │  │ BBM: 25L│         │  │
│  │  └─────────┘  └─────────┘         │  │
│  │                                   │  │
│  │  ⛽ Efisiensi: 6.0 KM/L           │  │
│  │  🛣️ Toll: Rp 50,000              │  │
│  │                                   │  │
│  │  📷 [Awal] [Akhir] [Struk BBM]   │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [Muat Lebih Banyak...]                 │
│                                         │
└─────────────────────────────────────────┘
```

### 6.2 Desktop Dashboard - Table View

```
┌─────────────────────────────────────────┐
│  📊 Riwayat Operasional Kendaraan       │
├─────────────────────────────────────────┤
│                                         │
│  Filter: [Semua Cabang ▼] [Bulan ▼]    │
│                                         │
│  ┌──────┬──────┬──────┬──────┬──────┐   │
│  │ Tgl  │Cabang│Supir │Kend. │ KM   │   │
│  ├──────┼──────┼──────┼──────┼──────┤   │
│  │20/08 │ JKT  │Budi  │Avanza│ 150  │   │
│  │19/08 │ BDG  │Ahmad │Innova│ 200  │   │
│  │18/08 │ JKT  │Dedi  │Brio  │ 120  │   │
│  └──────┴──────┴──────┴──────┴──────┘   │
│                                         │
│  ┌──────┬──────┬──────┬──────┬──────┐   │
│  │ BBM  │Efis. │Toll  │Total │Foto  │   │
│  ├──────┼──────┼──────┼──────┼──────┤   │
│  │ 25L  │6.0   │50K   │300K  │[Lihat│   │
│  │ 30L  │6.7   │75K   │375K  │[Lihat│   │
│  │ 20L  │6.0   │0     │200K  │[Lihat│   │
│  └──────┴──────┴──────┴──────┴──────┘   │
│                                         │
│  ← 1 2 3 4 5 →                         │
│                                         │
└─────────────────────────────────────────┘
```

### 6.3 Spesifikasi Dashboard

**Filter Section:**
- Position: Di bawah header
- Layout: Horizontal scroll di mobile
- Components:
  - Dropdown Cabang (Semua / Pilih Cabang)
  - Dropdown Bulan/Tanggal
  - Tombol Reset

**Mobile Card Design:**
- Card shadow: 0 2px 8px rgba(0,0,0,0.1)
- Border-radius: 12px
- Padding: 16px
- Margin bottom: 12px
- Header card: Tanggal + Cabang dengan background abu (#f8f9fa)

**Data Display (Mobile):**
- Kendaraan: Bold, font 16px
- Supir: Regular, font 14px
- Stats boxes: Dalam container flex, background abu
- Stats labels: Kecil, abu (#6c757d)
- Stats values: Bold, 16px

**Photo Links (Mobile):**
- Style: Buttons kecil dengan icon kamera
- Layout: Horizontal row
- Spacing: Gap 8px
- Action: Buka foto di tab baru

**Desktop Table:**
- Style: Bootstrap table-striped
- Header: Dark (#343a40), text white
- Font-size: 14px
- Alignment: Center untuk angka
- Responsive: Horizontal scroll di tablet

**Pagination:**
- Mobile: "Muat Lebih Banyak" button
- Desktop: Numbered pagination
- Items per page: 10 (mobile), 20 (desktop)

**Empty State:**
- Icon: Folder kosong
- Text: "Belum ada data operasional"
- Description: "Data akan muncul setelah Anda mengisi laporan"

---

## 7. Data Master (Superadmin Only)

### 7.1 Mobile Data Master - Tabbed Interface

```
┌─────────────────────────────────────────┐
│  ⚙️ Data Master                         │
├─────────────────────────────────────────┤
│                                         │
│  [Kendaraan] [Cabang] [Supir] [BBM]    │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ═══ TAB: Kendaraan ═══                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  ➕ Tambah Kendaraan Baru         │  │
│  │  ─────────────────────────────   │  │
│  │                                   │  │
│  │  Plat Nomor:                       │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ B 1234 CD                   │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Nama Kendaraan:                  │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Toyota Avanza               │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Cabang:                          │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Jakarta                     ▼│  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │       SIMPAN KENDARAAN      │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  📋 Daftar Kendaraan (12)        │  │
│  │  ─────────────────────────────   │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ B 1234 CD - Avanza          │  │  │
│  │  │ 📍 Jakarta    [Edit] [Hapus]│  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 7.2 Desktop Data Master - Side by Side

```
┌─────────────────────────────────────────┐
│  ⚙️ Data Master                         │
├─────────────────────────────────────────┤
│                                         │
│  [Kendaraan] [Cabang] [Supir] [BBM]    │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐  ┌───────────────────┐ │
│  │ Form Input  │  │ Daftar Data       │ │
│  │             │  │                   │ │
│  │ Plat: [...] │  │ B 1234 CD - Avanza│ │
│  │ Nama: [...] │  │   [Edit] [Hapus]  │ │
│  │ Cabang: [▼] │  │                   │ │
│  │             │  │ D 5678 EF - Innova│ │
│  │ [SIMPAN]    │  │   [Edit] [Hapus]  │ │
│  │             │  │                   │ │
│  └─────────────┘  └───────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

### 7.3 Spesifikasi Data Master

**Tab Navigation:**
- Style: Horizontal tabs dengan icons
- Icons:
  - Kendaraan: 🚗
  - Cabang: 📍
  - Supir: 👤
  - BBM: ⛽
- Active tab: Blue underline (#0d6efd)
- Mobile: Scrollable horizontal

**Form Card:**
- Header: Icon + "Tambah [Nama] Baru"
- Border-left: 4px solid color per tab:
  - Kendaraan: Blue (#0d6efd)
  - Cabang: Green (#198754)
  - Supir: Purple (#6f42c1)
  - BBM: Red (#dc3545)

**List Card:**
- Header: "Daftar [Nama] (count)"
- Items: List dengan border-bottom
- Actions: Edit (blue) dan Hapus (red) buttons
- Empty state: "Belum ada data [nama]"

**Form Inputs:**
- Same specs as Input Form section
- Validation: Required field indicator (merah)
- Success feedback: Alert hijau "Berhasil disimpan!"

**Edit Mode:**
- Klik Edit: Form terisi dengan data yang dipilih
- Button berubah: "Simpan" → "Update"
- Cancel button: Muncul untuk batal edit

**Delete Confirmation:**
- Modal: "Hapus [nama] ini?"
- Warning: "Data yang dihapus tidak dapat dikembalikan"
- Buttons: "Batal" (abu) dan "Hapus" (merah)

**Responsive Layout:**
- Mobile (< 768px): Stacked - Form di atas, List di bawah
- Desktop (> 768px): Side by side - Form kiri, List kanan

---

## 8. Pengaturan Aplikasi (Superadmin Only)

### 8.1 Settings Page

```
┌─────────────────────────────────────────┐
│  ⚙️ Pengaturan Aplikasi                │
├─────────────────────────────────────────┤
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  🖼️ Logo Aplikasi                 │  │
│  │  ─────────────────────────────   │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │                             │  │  │
│  │  │      [Current Logo]         │  │  │
│  │  │                             │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Format: PNG, JPG, SVG            │  │
│  │  Max ukuran: 200KB                │  │
│  │  Rekomendasi: 200x200px           │  │
│  │                                   │  │
│  │  [Pilih Logo Baru]                │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  📝 Info Aplikasi                 │  │
│  │  ─────────────────────────────   │  │
│  │                                   │  │
│  │  Nama Aplikasi:                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Monitoring BBM Operasional  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Nama Perusahaan:                 │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ PT. ABC Indonesia           │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Footer Text:                     │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ © 2026 PT. ABC Indonesia    │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │  [Simpan Pengaturan]              │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 8.2 Spesifikasi Pengaturan

**Logo Upload:**
- Drag & drop atau click
- Preview: Real-time preview sebelum save
- Auto-save: Tidak, harus klik "Simpan"
- Access: Hanya Superadmin

---

## 9. OCR Modal & Processing States

### 9.1 Mobile OCR Modal

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │  ✅ Konfirmasi Hasil Bacaan      │  │
│  │  ─────────────────────────────   │  │
│  │                                   │  │
│  │  Sistem telah mendeteksi angka    │  │
│  │  dari foto. Periksa kembali!      │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ KM Keberangkatan (Awal):    │  │  │
│  │  │ ┌─────────────────────────┐ │  │  │
│  │  │ │ 125,450                 │ │  │  │
│  │  │ └─────────────────────────┘ │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ KM Kepulangan (Akhir):      │  │  │
│  │  │ ┌─────────────────────────┐ │  │  │
│  │  │ │ 125,600                 │ │  │  │
│  │  │ └─────────────────────────┘ │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  📊 Ringkasan:                    │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ Jarak Tempuh: 150 KM       │  │  │
│  │  │ BBM: 25L @ Rp 10,000       │  │  │
│  │  │ Total BBM: Rp 250,000      │  │  │
│  │  │ Toll: Rp 50,000            │  │  │
│  │  │ ═══════════════════════    │  │  │
│  │  │ TOTAL: Rp 300,000          │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │    💾 SIMPAN DATA PERMANEN  │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 9.2 Processing States

**Upload & OCR Processing:**
```
┌─────────────────────────────────────────┐
│                                         │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │  ⏳ Memproses...                  │  │
│  │  ─────────────────────────────   │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │                             │  │  │
│  │  │      [Spinner Animation]    │  │  │
│  │  │                             │  │  │
│  │  │   Upload foto & proses OCR  │  │  │
│  │  │                             │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  │  Status:                          │  │
│  │  ✓ Upload foto odometer awal     │  │
│  │  ✓ Upload foto odometer akhir    │  │
│  │  ⏳ Membaca angka dari foto...   │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 9.3 Spesifikasi OCR Modal

**Modal Design:**
- Backdrop: Semi-transparent black (rgba(0,0,0,0.5))
- Modal card: White, border-radius 16px
- Padding: 24px
- Max-width: 400px (mobile), 500px (desktop)
- Close button: Top-right, red (X)

**Input Fields (OCR Results):**
- Height: 56px (lebih besar untuk easy editing)
- Font-size: 18px, bold
- Text-align: Center
- Border: 2px solid (#dee2e6)
- Focus: Border hijau (#198754) untuk menunjukkan sudah terbaca

**Summary Box:**
- Background: Light blue (#e7f1ff)
- Border: 1px solid (#b6d4fe)
- Border-radius: 8px
- Padding: 16px
- Total: Bold, larger font (20px)

**Save Button:**
- Full-width
- Height: 52px
- Background: Green (#198754)
- Font: Bold, 16px
- Icon: 💾 sebelum teks

**Loading Overlay:**
- Full-screen: Position fixed
- Background: rgba(255,255,255,0.9)
- Spinner: Bootstrap spinner-border
- Text: Status update (uploading, processing, saving)

---

## 10. Global Components

### 10.1 Toast Notifications

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ ✅ Berhasil! Laporan tersimpan.   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ ❌ Gagal! Terjadi kesalahan.      │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 10.2 Empty States

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │      [Icon Folder Kosong]         │  │
│  │                                   │  │
│  │   Belum ada data operasional      │  │
│  │                                   │  │
│  │   Data akan muncul setelah Anda   │  │
│  │   mengisi laporan harian.         │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 10.3 Confirmation Dialogs

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌───────────────────────────────────┐  │
│  │                                   │  │
│  │  ⚠️ Konfirmasi Hapus              │  │
│  │  ─────────────────────────────   │  │
│  │                                   │  │
│  │  Apakah Anda yakin ingin menghapus│  │
│  │  data ini?                         │  │
│  │                                   │  │
│  │  Data yang dihapus tidak dapat    │  │
│  │  dikembalikan.                     │  │
│  │                                   │  │
│  │  [Batal]           [Hapus]        │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

### 10.4 Spesifikasi Global Components

**Toast Notifications:**
- Position: Top-right (mobile: top center)
- Animation: Slide in from right, fade out
- Duration: 3 detik untuk success, 5 detik untuk error
- Max-width: 350px
- Shadow: 0 4px 12px rgba(0,0,0,0.15)

**Empty States:**
- Icon: 64px, abu (#adb5bd)
- Text: 18px, abu (#6c757d)
- Description: 14px, abu lebih muda (#adb5bd)
- Centered: Vertical dan horizontal

**Confirmation Dialogs:**
- Modal: Centered, max-width 400px
- Icon: Warning icon (⚠️) atau delete icon (🗑️)
- Buttons:
  - Cancel: Outline abu
  - Confirm: Solid color (hijau untuk save, merah untuk delete)

---

## 11. Responsive Behavior & Animations

### 11.1 Breakpoints

```
Mobile:    < 768px   → Single column, bottom nav, card list
Tablet:    768-1024px → 2 columns, top tabs, mixed layout
Desktop:   > 1024px  → Full layout, side-by-side, max-width 1200px
```

### 11.2 Mobile-Specific Optimizations

**Touch Targets:**
- Minimum: 44px x 44px (Apple HIG) / 48px x 48px (Material Design)
- Spacing: 8px antar touch targets
- Padding: Tambahkan padding di area clickable

**Input Fields:**
- Height: 48px (bukan 40px)
- Font-size: 16px (mencegah auto-zoom di iOS)
- Tap area: Full-width untuk dropdown

**Scroll Behavior:**
- Smooth scroll: Untuk navigasi internal
- Momentum scroll: iOS-friendly (-webkit-overflow-scrolling: touch)
- Hide scrollbar: Di mobile untuk tab navigation

**Fixed Elements:**
- Bottom nav: Position fixed, z-index 1000
- Header: Position sticky, z-index 999
- Modal: Position fixed, full-screen di mobile

### 11.3 Animations & Transitions

**Page Transitions:**
```css
/* Fade in */
.page-enter {
  opacity: 0;
  transform: translateY(10px);
}
.page-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 300ms, transform 300ms;
}
```

**Card Animations:**
```css
/* Hover effect (desktop only) */
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0,0,0,0.1);
}

/* Active state (mobile) */
.card:active {
  transform: scale(0.98);
}
```

**Button States:**
```css
.btn {
  transition: all 200ms ease;
}
.btn:active {
  transform: scale(0.95);
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

**Loading Animations:**
```css
/* Spinner */
.spinner-border {
  animation: spinner-border 0.75s linear infinite;
}

/* Pulse for skeleton loading */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.skeleton {
  animation: pulse 1.5s ease-in-out infinite;
}
```

**Modal Animations:**
```css
/* Backdrop fade */
.modal-backdrop {
  transition: opacity 300ms;
}

/* Modal slide up (mobile) */
@media (max-width: 768px) {
  .modal-dialog {
    transform: translateY(100%);
    transition: transform 300ms ease-out;
  }
  .modal.show .modal-dialog {
    transform: translateY(0);
  }
}
```

### 11.4 Performance Optimizations

**Image Handling:**
- Lazy loading: Load images when visible
- Thumbnail: Generate thumbnails untuk list view
- Compression: Compress before upload (max 1MB)
- Format: WebP jika supported, fallback ke JPG

**Data Loading:**
- Skeleton loading: Tampilkan placeholder saat load
- Pagination: Load 10 items di mobile, 20 di desktop
- Debounce: Untuk search/filter input (300ms)
- Cache: Cache data selama 5 menit

**Touch Optimizations:**
- No 300ms delay: Gunakan touch-action: manipulation
- Prevent zoom: Input font-size 16px
- Scroll performance: Gunakan transform bukan top/left

---

## 12. Color Palette & Typography

### 12.1 Color Palette

```
Primary:      #0d6efd (Biru)
Primary Dark: #0b5ed7
Primary Light:#c2d1ff

Success:      #198754 (Hijau)
Danger:       #dc3545 (Merah)
Warning:      #ffc107 (Kuning)
Info:         #0dcaf0 (Biru Muda)

Gray Scale:
- Gray 100: #f8f9fa (Background)
- Gray 200: #e9ecef (Border)
- Gray 300: #dee2e6 (Input border)
- Gray 400: #ced4da (Placeholder)
- Gray 500: #adb5bd (Muted text)
- Gray 600: #6c757d (Secondary text)
- Gray 700: #495057 (Body text)
- Gray 800: #343a40 (Dark text)
- Gray 900: #212529 (Header bg)

White:        #ffffff
Black:        #000000
```

### 12.2 Typography

```css
/* Font Family */
body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* Font Sizes */
h1 { font-size: 2rem; }      /* 32px */
h2 { font-size: 1.5rem; }    /* 24px */
h3 { font-size: 1.25rem; }   /* 20px */
h4 { font-size: 1.125rem; }  /* 18px */
h5 { font-size: 1rem; }      /* 16px */
h6 { font-size: 0.875rem; }  /* 14px */

body { font-size: 1rem; }        /* 16px */
small { font-size: 0.875rem; }   /* 14px */

/* Font Weights */
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

/* Line Heights */
- Tight: 1.25
- Normal: 1.5
- Relaxed: 1.75
```

### 12.3 Spacing System

```
4px   → xs
8px   → sm
12px  → md
16px  → lg
20px  → xl
24px  → 2xl
32px  → 3xl
40px  → 4xl
48px  → 5xl
```

### 12.4 Border Radius

```
4px   → Small (buttons, inputs)
8px   → Medium (cards, dropdowns)
12px  → Large (modals)
16px  → XL (full-round on mobile)
```

---

## 13. Ringkasan Desain

### 13.1 Fitur yang Dipertahankan

✅ Multi-role access (Superadmin & PIC Cabang)
✅ Auto-calculate BBM & efisiensi
✅ Master data dinamis
✅ Data tersimpan di Google Sheets
✅ OCR untuk foto odometer
✅ Login/Logout functionality

### 13.2 Fitur yang Ditambahkan

🆕 Bottom navigation bar (mobile)
🆕 Card-based layout
🆕 Configurable logo
🆕 Pengaturan aplikasi
🆕 Toast notifications
🆕 Skeleton loading
🆕 Better empty states
🆕 Confirmation dialogs
🆕 Responsive table/card toggle

### 13.3 Technology Stack

- **Framework:** Bootstrap 5.3.0
- **Custom CSS:** Mobile-first optimizations
- **Icons:** Bootstrap Icons
- **Animations:** CSS transitions
- **Storage:** Google Sheets + Drive

---

## 14. Implementation Notes

### 14.1 File Structure Changes

**Existing Files to Modify:**
- `Index.html` - Add bottom nav, restructure layout
- `css.html` - Add mobile-first CSS
- `js.html` - Add new navigation logic, settings API

**New Files to Create:**
- `Settings.html` - Settings page (Superadmin)
- `settings.js` - Settings JavaScript logic

### 14.2 API Changes

**New Endpoints:**
```javascript
// Settings
getAppSettings()
saveAppSettings(data)
uploadLogo(file)

// Enhanced Dashboard
getDashboardDataWithFilter(filters)
```

**Modified Endpoints:**
- `processInitialData()` - Add settings data
- `loadDashboard()` - Add filter support

### 14.3 Database Changes

**New Sheet:**
- `Pengaturan` - Application settings
  - Columns: `key`, `value`, `updated_at`

**Modified Sheets:**
- None (maintain existing structure)

---

## 15. Testing Considerations

### 15.1 Mobile Testing

- Test on iOS Safari (iPhone, iPad)
- Test on Android Chrome
- Test touch interactions
- Test zoom behavior
- Test bottom nav accessibility

### 15.2 Desktop Testing

- Test on Chrome, Firefox, Edge
- Test responsive breakpoints
- Test keyboard navigation
- Test large screen layouts

### 15.3 Cross-browser Testing

- Bootstrap 5 compatibility
- CSS animations support
- LocalStorage support
- File upload support

---

## 16. Future Enhancements (Out of Scope)

- PWA support
- Offline mode
- Push notifications
- Dark mode
- Multi-language support
- Advanced analytics dashboard

---

**Document Version:** 1.0
**Last Updated:** 20 Agustus 2026
**Author:** UI/UX Design Team
