# Menu Switch / Dashboard Flazz Refresh Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghilangkan "sedikit loading" saat berpindah menu — khususnya kembali ke Dashboard yang saat ini memaksa refetch data Flazz penuh setiap kali.

**Architecture:** `renderDashboard()` (js.html:1220) memanggil `loadFlazzDataWrapper(true)` — flag `force=true` membuat tiap kunjungan ke Dashboard selalu fetch ulang `apiGetFlazzDashboardData` (baca 4+ sheet, tanpa cache server). Semua operasi yang mengubah saldo Flazz (topup/rekon/edit/delete/save card) **sudah** me-reset `flazzDataCache = null`, sehingga cache klien selalu segar saat kembali ke Dashboard. Perbaikan: jangan force refetch — pakai cache klien; tambah refresh diam-diam (background) sekali per sesi agar tidak basi di sesi panjang.

**Tech Stack:** Google Apps Script client-side JS (js.html), CacheService.

## Global Constraints

- Tidak menyentuh server-side. File: `src/js.html` hanya.
- Semua mutasi Flazz (topup, rekon, edit/delete laporan, save/edit card, simpan jalur dengan kartu) wajib tetap me-reset `flazzDataCache = null` — periksa saat implementasi.
- Refresh diam-diam harus non-blocking (tidak menampilkan spinner `flazz-dashboard-loading` penuh) dan tidak mengganggu render cepat dari cache.
- Verifikasi: `node --check` blok `<script>` js.html (pola `deploy.ps1`). Deploy menunggu instruksi.

---

### Task 1: Hentikan force-refetch Flazz saat render Dashboard

**Files:**
- Modify: `src/js.html:1238`

**Interfaces:**
- Produces: `renderDashboard()` memakai `loadFlazzDataWrapper()` (tanpa force) sehingga dashboard cepat dari `flazzDataCache`.

- [ ] **Step 1: Ubah pemanggilan**

Di `renderDashboard()` (Js.html:1238), ganti:

```js
    if (typeof loadFlazzDataWrapper === 'function') loadFlazzDataWrapper(true);
```

menjadi:

```js
    if (typeof loadFlazzDataWrapper === 'function') loadFlazzDataWrapper();
```

- [ ] **Step 2: Refresh diam-diam (background) sekali per sesi**

Tambahkan penjaga + sekali-invoke setelah render cepat, agar data Flazz dashboard tidak basi di sesi panjang tanpa mutasi:

```js
    // Dashboard: render cepat dari cache; sekali per sesi refresh diam-diam di background.
    if (!window.__flazzBgWarmed) {
      window.__flazzBgWarmed = true;
      try {
        if (typeof loadFlazzDataWrapper === 'function') loadFlazzDataWrapper(true);
      } catch (e) { /* abaikan */ }
    }
```

Catatan implementasi: hasil refresh background akan menimpa `flazzDataCache` + me-render (tidak memblokir karena sudah ada isi). Pastikan pemanggilan `loadFlazzDataWrapper(true)` di background tidak memunculkan `flazz-dashboard-loading` yang menutup konten — bentuk pemanggilannya bisa di-flag (mis. di dalam `loadFlazzDataWrapper` hindari menampilkan `flazz-dashboard-loading` saat `force && flazzDataCache`), atau render ulang cache dahulu. Pilih implementasi terkecil yang tidak mengganti DOM loading saat data sudah ada.

- [ ] **Step 3: Verifikasi & commit**

```powershell
$c = Get-Content -Raw "src\js.html"; $m = [regex]::Matches($c, '(?s)<script[^>]*>(.*?)</script>'); $t = "$env:TEMP\js_chk.js"; Set-Content -Path $t -Value $m[0].Groups[1].Value -Encoding UTF8; node --check $t
```

Expected: tidak ada output error.

```bash
git add src/js.html
git commit -m "perf: dashboard tidak force-refetch flazz; refresh background sekali per sesi"
```

---

## Deferred

- **Server cache `getFlazzDashboardData`** (TTL 60–120s + invalidasi topup/rekon/edit/delete/card/jalur): mengurangi trip server juga untuk kunjungan pertama menu Flazz. Diputuskan terpisah karena menyentuh finansial (saldo).

## Verifikasi Akhir (setelah deploy)

1. Buka dashboard → pindah history/master → kembali dashboard: tidak ada lagi spinner Flazz (langsung tampil).
2. Sesi panjang (>60s) tanpa mutasi: angka saldo dashboard tetap direfresh oleh background sekali.
3. Setelah topup/rekon/edit: `flazzDataCache` null → dashboard fetch ulang (angka baru muncul).