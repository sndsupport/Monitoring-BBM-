# Navigasi Accordion, Filter SUPERADMIN, Status Kartu, Dropdown Etoll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 fitur yang sudah disetujui (accordion navigasi + rename, kolom status kartu di List Flazz, filter warehouse/tanggal untuk SUPERADMIN + race-fix, dropdown kartu etoll per cabang di Buat Jalur), lalu push & deploy SEMUA perubahan (termasuk fix keamanan yang belum di-commit) ke deployment web yang sama.

**Architecture:** Perubahan murni frontend (Index.html, js.html, FlazzScript.html, FlazzPages.html, JalurScript.html, JalurPages.html, css.html) + 2 file backend kecil (JalurOps.js, Code.js). Satu helper global `fillCabangSelect` + widget warehouse superadmin per halaman, filter di-render/client-side dari data yang sudah dimuat, dan race-condition dihindari dengan request-ID token per panggilan `google.script.run`. Deployment tetap via `clasp push` + `clasp deploy` ke deployment id yang sama.

**Tech Stack:** Google Apps Script (HtmlService + `google.script.run`), Bootstrap 5, Bootstrap Icons, vanilla JS. Verifikasi syntax via Node (`node --check`).

## Global Constraints

- **Filter hanya untuk `userRole === 'SUPERADMIN'`.** Non-superadmin (`PIC CABANG`) tidak melihat widget filter; data tetap auto-filter backend via `userInfo.cabang`.
- **Daftar warehouse diambil dari `window.masterData.cabang`** (`getCabangList()` → `{kode, nama}`), bukan hardcoded.
- **Nilai filter berlaku per area** (widget sendiri per halaman; tidak bergantung pada `input-cabang` form #step-1).
- Status kartu badge: `SEDANG_DIGUNAKAN`→`bg-warning`, `TERSEDIA`→`bg-success`, `NONAKTIF`→`bg-secondary` (konsisten dgn `renderFlazzMasterTable`/`renderFlazzDashboardCards`).
- **Perubahan terbatas UI & data-flow; tidak menyentuh schema spreadsheet** (kecuali fungsi `getJalurByTanggal` — perubahan argumen, bukan kolom baru).
- **Verifikasi tiap task:** `node --check` untuk .js yang diubah + ekstraksi blok `<script>` dari .html yang diubah lalu `node --check`, plus uji manual di browser (link deploy hasil Task 0/9). Commands ada di tiap task (Helper Verifikasi di bawah).
- **JANGAN commit file untracked:** `.opencode/`, `apply_jalur.py`, `deploy.ps1`, `docs/superpowers/plans/2026-09-01-list-flazz.md`, `docs/superpowers/plans/2026-09-06-estimasi-km-jarum.md`, `docs/superpowers/plans/2026-09-06-pengguna-master-crud.md`, `scratch_head_spreadsheetops.js`, `temp.js`, dan file temp hasil verifikasi.
- Deployment id target: `AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF` (workdir sempre `D:\Monitoring BBM\src`).

### Helper Verifikasi (diulang di tiap task yang mengubah file)

Check JS:
```
node --check src/SpreadsheetOps.js
node --check src/FlazzOps.js
node --check src/JalurOps.js
node --check src/Code.js
```

Check HTML (contoh FlazzScript; ganti nama file sesuai task):
```
powershell -Command "$h=Get-Content -Raw src\FlazzScript.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_flazz.js -Encoding UTF8; node --check temp_flazz.js; Remove-Item temp_flazz.js"
```

---
---

### Task 0: Commit fix keamanan yang belum di-commit (prasyarat deploy bersih)

Perubahan hardening role/cabang (Code.js, FlazzOps.js, FlazzScript.html, JalurOps.js, JalurScript.html, SpreadsheetOps.js, js.html) sudah selesai di working tree tapi belum di-commit/deploy. Commit dulu agar riwayat bersih sebelum fitur.

**Files:** (sudah berubah di working tree — tidak ada edit baru di task ini)
- `src/Code.js`, `src/FlazzOps.js`, `src/FlazzScript.html`, `src/JalurOps.js`, `src/JalurScript.html`, `src/SpreadsheetOps.js`, `src/js.html`

- [ ] **Step 1: Lihat status & diff stat**

Run (workdir `D:\Monitoring BBM`):
```
git status
git diff --stat
```
Expected: file di atas tampil sebagai `M` (modified), dengan total ±+213/−71 (perlu cek cepat diff stat). Tidak ada file untracked yang harus ikut commit.

- [ ] **Step 2: Commit hanya file perubahan keamanan**

```
git add src/Code.js src/FlazzOps.js src/FlazzScript.html src/JalurOps.js src/JalurScript.html src/SpreadsheetOps.js src/js.html
git commit -m "fix: validasi otorisasi role & cabang pada operasi master, flazz, dan jalur"
```

Expected: commit baru sukses; `git status` hanya menyisakan untracked (yang TIDAK di-commit), `git log --oneline -5` menunjukkan commit baru.

- [ ] **Step 3: (Opsional, hanya jika ingin verifikasi cepat sebelum fitur)** push + deploy terpisah — SKIP, karena user minta deploy semua perubahan sekaligus. Lanjut ke Task 1.

---
---

### Task 1: Sidebar accordion + rename "Laporan Operasional Kendaraan" (Fitur 4 — desktop)

Restrukturisasi sidebar Index.html dari daftar datar menjadi `menu-group` + `menu-toggle` + `menu-sub`, dengan auto-hide antar grup via fungsi global `toggleNavMenu`. Nama grup "OPERASIONAL KENDARAAN" di-rename menjadi "LAPORAN OPERASIONAL KENDARAAN". Grup ADMIN digabung: link "Pengaturan" menjadi child dari grup yang sama dan disembunyikan via `id='nav-settings'` (tetap `d-none` sampai superadmin login — js.html:231 sudah melakukan `classList.remove('d-none')`).

**Files:**
- Modify: `src/Index.html:117-172`
- Modify: `src/css.html` (tambahkan CSS accordion setelah blok `.sidebar-logout-btn:hover` ±line 664)
- Modify: `src/js.html` (tambahkan `toggleNavMenu` global dekat `switchTab` ±line 406)

- [ ] **Step 1: Tulis CSS accordion di css.html**

Sisipkan setelah blok `.sidebar-logout-btn:hover { ... }` (css.html ±line 664):

```css
  /* ============ NAVIGATION ACCORDION (sidebar) ============ */
  .menu-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--color-border);
  }

  .menu-group:first-of-type { margin-top: 0; padding-top: 0; border-top: none; }

  .menu-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    text-align: left;
    cursor: pointer;
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .menu-toggle:hover { color: var(--color-primary-dark); background: var(--color-primary-light); }

  .menu-chevron {
    font-size: 11px;
    transition: transform var(--transition-fast);
  }

  .menu-group.open .menu-chevron { transform: rotate(180deg); }

  .menu-sub {
    display: none;
    flex-direction: column;
    gap: 2px;
    padding-left: 8px;
    margin-top: 2px;
  }

  .menu-group.open .menu-sub { display: flex; }
```

- [ ] **Step 2: Verifikasi css.html** — sintaks CSS tidak dicompile; cukup baca ulang untuk memastikan penempatan blok benar (sebelum penutup `</style>`).

- [ ] **Step 3: Tulis `toggleNavMenu` di js.html**

Sisipkan tepat di atas `function switchTab(tab) {` (js.html ±line 406):

```js
  // Accordion navigasi sidebar & bottom-nav: tutup semua grup lain lalu toggle grup yang diklik (auto-hide).
  function toggleNavMenu(groupId) {
    var target = document.getElementById(groupId);
    if (!target) return;
    var wasOpen = target.classList.contains('open');
    document.querySelectorAll('.menu-group.open').forEach(function(g) { g.classList.remove('open'); });
    if (!wasOpen) target.classList.add('open');
  }
```

- [ ] **Step 4: Tutup grup accordion saat pindah tab** — sisipkan di akhir `switchTab`, tepat sebelum `window.scrollTo({ top: 0, behavior: 'smooth' });` (js.html ±483):

```js
    document.querySelectorAll('.menu-group.open').forEach(function(g) { g.classList.remove('open'); });
```

- [ ] **Step 5: Restrukturisasi sidebar di Index.html**

Ganti seluruh blok `<nav class='app-sidebar top-tabs d-none d-md-flex' id='menu-tabs'> ... </nav>` (Index.html:117-180) dengan markup accordion berikut:

```html
        <nav class='app-sidebar top-tabs d-none d-md-flex' id='menu-tabs'>
          <a class='nav-link sidebar-link' id='tab-dashboard' href='javascript:void(0)' onclick='switchTab("dashboard")'>
            <i class='bi bi-grid-1x2'></i> <span>Dashboard</span>
          </a>

          <div class='menu-group' id='group-jalur'>
            <button type='button' class='menu-toggle' onclick='toggleNavMenu("group-jalur")'>
              <span>JALUR PENGIRIMAN</span><i class='bi bi-chevron-down menu-chevron'></i>
            </button>
            <div class='menu-sub'>
              <a class='nav-link sidebar-link' id='tab-jalur-buat' href='javascript:void(0)' onclick='switchTab("jalur-buat")'>
                <i class='bi bi-calendar-plus'></i> <span>Buat Jalur</span>
              </a>
              <a class='nav-link sidebar-link' id='tab-jalur-listing' href='javascript:void(0)' onclick='switchTab("jalur-listing")'>
                <i class='bi bi-list-ul'></i> <span>Daftar Jalur</span>
              </a>
              <a class='nav-link sidebar-link' id='tab-jalur-summary' href='javascript:void(0)' onclick='switchTab("jalur-summary")'>
                <i class='bi bi-clipboard-data'></i> <span>Summary Pengiriman</span>
              </a>
            </div>
          </div>

          <div class='menu-group' id='group-operasional'>
            <button type='button' class='menu-toggle' onclick='toggleNavMenu("group-operasional")'>
              <span>LAPORAN OPERASIONAL KENDARAAN</span><i class='bi bi-chevron-down menu-chevron'></i>
            </button>
            <div class='menu-sub'>
              <a class='nav-link sidebar-link' id='tab-form' href='javascript:void(0)' onclick='switchTab("form")'>
                <i class='bi bi-pencil-square'></i> <span>Input Laporan</span>
              </a>
              <a class='nav-link sidebar-link' id='tab-history' href='javascript:void(0)' onclick='switchTab("history")'>
                <i class='bi bi-clock-history'></i> <span>History Laporan</span>
              </a>
              <a class='nav-link sidebar-link' id='tab-gallery' href='javascript:void(0)' onclick='switchTab("gallery")'>
                <i class='bi bi-images'></i> <span>Galeri Foto</span>
              </a>
              <a class='nav-link sidebar-link' id='tab-performa' href='javascript:void(0)' onclick='switchTab("performa")'>
                <i class='bi bi-speedometer2'></i> <span>Performa Kendaraan</span>
              </a>
            </div>
          </div>

          <div class='menu-group' id='group-flazz'>
            <button type='button' class='menu-toggle' onclick='toggleNavMenu("group-flazz")'>
              <span>KARTU FLAZZ</span><i class='bi bi-chevron-down menu-chevron'></i>
            </button>
            <div class='menu-sub'>
              <a class='nav-link sidebar-link' id='tab-flazz-topup' href='javascript:void(0)' onclick='switchTab("flazz-topup")'>
                <i class='bi bi-wallet2'></i> <span>Top Up Flazz</span>
              </a>
              <a class='nav-link sidebar-link' id='tab-flazz-recon' href='javascript:void(0)' onclick='switchTab("flazz-recon")'>
                <i class='bi bi-check2-all'></i> <span>Rekonsiliasi Flazz</span>
              </a>
              <a class='nav-link sidebar-link' id='tab-flazz-listing' href='javascript:void(0)' onclick='switchTab("flazz-listing")'>
                <i class='bi bi-credit-card'></i> <span>List Flazz & Saldo</span>
              </a>
              <a class='nav-link sidebar-link' id='tab-flazz-history' href='javascript:void(0)' onclick='switchTab("flazz-history")'>
                <i class='bi bi-journal-text'></i> <span>Riwayat Transaksi</span>
              </a>
            </div>
          </div>

          <div class='menu-group d-none sidebar-admin-group' id='nav-master'>
            <button type='button' class='menu-toggle' onclick='toggleNavMenu("nav-master")'>
              <span>ADMIN</span><i class='bi bi-chevron-down menu-chevron'></i>
            </button>
            <div class='menu-sub'>
              <a class='nav-link sidebar-link' id='tab-master' href='javascript:void(0)' onclick='switchTab("master")'>
                <i class='bi bi-database'></i> <span>Data Master</span>
              </a>
              <a class='nav-link sidebar-link d-none' id='tab-settings' href='javascript:void(0)' onclick='switchTab("settings")'>
                <i class='bi bi-sliders'></i> <span>Pengaturan</span>
              </a>
            </div>
          </div>

          <div class='sidebar-footer'>
            <div class='sidebar-user' id='sidebar-user-info'></div>
            <button type='button' class='sidebar-logout-btn' onclick='logout()'>
              <i class='bi bi-box-arrow-right'></i> <span>Logout</span>
            </button>
          </div>
        </nav>
```

Catatan: id `tab-settings` dipindah ke link "Pengaturan" dan diberi `d-none`. js.html:231 `document.getElementById('nav-settings').classList.remove('d-none')` — **pindahkan id `nav-settings` ke link tersebut** agar superadmin menampilkan teks "Pengaturan" (lihat Step 6). `nav-master` tetap menjadi wrapper grup (id dipakai js.html:213). Elemen `.tab-flazz-*` lama (topup/recon/listing/history) dihapus karena sudah masuk `menu-sub` — pastikan tidak ada referensi css `#tab-flazz-*` lain di js.html yang bermasalah (switchTab memakai `document.getElementById('tab-' + tab)` → `activeTab.classList.add('active')`; karena `tab-settings` kini `a` dgn class `sidebar-link`, tetap berfungsi).

- [ ] **Step 6: Sesuaikan id `nav-settings` di js.html**

Di js.html `loadInitialData` (baris ±230-232):

```js
        if (userRole === 'SUPERADMIN') {
          document.getElementById('nav-settings').classList.remove('d-none');
```

Ubah menjadi mengarah ke link (bukan wrapper grup yang sudah digabung):

```js
        if (userRole === 'SUPERADMIN') {
          var navSettingsLink = document.getElementById('nav-settings');
          if (navSettingsLink) navSettingsLink.classList.remove('d-none');
```

**Wajib:** tambahkan `id='nav-settings'` pada link "Pengaturan" di Index.html (Step 5), yaitu:

```html
<a class='nav-link sidebar-link d-none' id='nav-settings' id='tab-settings' href='javascript:void(0)' onclick='switchTab("settings")'>
```

(gunakan `id='nav-settings'` sebagai id utama, dan tambahkan atribut `id='tab-settings'` — **JavaScript `getElementById` hanya mengembalikan satu; karena `tab-settings` terpisah dalam `switchTab`, gunakan `id='tab-settings'` pada elemen dan `id='nav-settings'` TIDAK BOLEH duplikat.** Solusi benar: beri `id='tab-settings'` pada `<a>`, lalu di `loadInitialData` ganti ke `document.querySelector('#nav-master a#tab-settings').classList.remove('d-none')` — lihat kode final di bawah.)

Kode final `loadInitialData` SUPERADMIN block (ganti baris 230-237):

```js
        if (userRole === 'SUPERADMIN') {
          document.getElementById('nav-master').classList.remove('d-none');
          var settingsLink = document.querySelector('#nav-master a#tab-settings');
          if (settingsLink) settingsLink.classList.remove('d-none');
          document.getElementById('btn-nav-settings').style.display = 'flex';
          var inputCabangFilter = document.getElementById('input-cabang-filter');
          if (inputCabangFilter) inputCabangFilter.style.display = 'block';
          var wrapperFilterCabang = document.getElementById('wrapper-filter-cabang');
          if (wrapperFilterCabang) wrapperFilterCabang.style.display = 'block';
        }
```

Dan di Index.html (Step 5), link Pengaturan hanya:

```html
<a class='nav-link sidebar-link d-none' id='tab-settings' href='javascript:void(0)' onclick='switchTab("settings")'>
  <i class='bi bi-sliders'></i> <span>Pengaturan</span>
</a>
```

(Pastikan **tidak ada** `id='nav-settings'` di markup — diganti query `#nav-master a#tab-settings`.)

- [ ] **Step 7: Verifikasi syntax**

Run:
```
node --check src/Code.js
powershell -Command "$h=Get-Content -Raw src\Index.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_index.js -Encoding UTF8; node --check temp_index.js; Remove-Item temp_index.js"
powershell -Command "$h=Get-Content -Raw src\js.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_js.js -Encoding UTF8; node --check temp_js.js; Remove-Item temp_js.js"
powershell -Command "$h=Get-Content -Raw src\css.html; $m=[regex]::Matches($h,'<style>([\s\S]*?)</style>'); $s=($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10); ($s.Length) | Out-Null; Write-Output ('style length: ' + $s.Length)"
```
Expected: semua PASS (`node --check` tanpa output error; css.html memunculkan length > 0).

- [ ] **Step 8: Uji manual (browser, deploy sementara tidak perlu — cukup jalankan clasp push terlebih dahulu bila mau preview; TAPI sesuai keputusan, deploy ditunda ke Task 9)**

Catatan dalam rencana: task ini diuji menyeluruh bersama Task 9 setelah semua fitur selesai (agar satu deploy mencakup semuanya). Uji cepat bisa dilakukan via `clasp open`? Standar GAS: pilih fungsi `doGet` → preview. **Keputusan mengikuti user: deploy sekaligus di Task 9.**

- [ ] **Step 9: Commit**

```
git add src/Index.html src/css.html src/js.html
git commit -m "feat: navigasi accordion sidebar + rename Laporan Operasional Kendaraan"
```

---
---

### Task 2: Bottom-nav mobile drawer + auto-hide (Fitur 4 — mobile)

Ubah bottom-nav dari tombol datar menjadi 3 tombol utama yang membuka panel sub-menu (drawer) + tombol langsung Dashboard/Master/Pengaturan. Memakai `toggleNavMenu` yang sama untuk konsistensi auto-hide.

**Files:**
- Modify: `src/Index.html:77-113` (bottom nav)
- Modify: `src/css.html` (CSS drawer bottom-nav)
- Modify: `src/js.html` (data drawer + fungsi `toggleBottomDrawer`/`closeBottomDrawer`, panggil `closeBottomDrawer` di awal `switchTab`)

- [ ] **Step 1: Tulis CSS drawer bottom-nav di css.html**

Tambahkan setelah blok `.btn-nav:hover { ... }` (css.html ±576):

```css
  /* ============ BOTTOM NAV DRAWER (mobile accordion) ============ */
  .bottom-nav { overflow: visible; }

  .bottom-nav-drawer-wrap {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    max-height: 60vh;
    overflow-y: auto;
    background: #fff;
    border-top: 1px solid var(--color-border);
    box-shadow: 0 -4px 12px rgba(20, 40, 28, 0.08);
    padding: 8px;
    z-index: 1001;
  }

  .bottom-nav-drawer { display: flex; flex-direction: column; gap: 4px; }

  .btn-nav.bnd-item {
    flex: none;
    width: 100%;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    text-align: left;
  }

  .btn-nav.bnd-item.active {
    background: var(--color-primary-light);
  }
```

- [ ] **Step 2: Ubah markup bottom-nav di Index.html**

Ganti seluruh blok `<nav class='bottom-nav ...'> ... </nav>` (Index.html:78-113):

```html
      <nav class='bottom-nav fixed-bottom bg-white border-top d-md-none' id='bottom-nav' style='display:none;'>
        <div class='bottom-nav-drawer-wrap' id='bottom-nav-drawer-wrap' style='display:none;'>
          <div class='bottom-nav-drawer' id='bottom-nav-drawer'></div>
        </div>
        <div class='d-flex justify-content-around align-items-center h-100'>
          <button class='btn-nav active' onclick='switchTab("dashboard")' data-tab='dashboard'>
            <i class='bi bi-grid-1x2'></i>
            <span>Dashboard</span>
          </button>
          <button class='btn-nav' onclick='toggleBottomDrawer("jalur")' data-drawer='jalur'>
            <i class='bi bi-truck'></i>
            <span>Jalur</span>
          </button>
          <button class='btn-nav' onclick='toggleBottomDrawer("operasional")' data-drawer='operasional'>
            <i class='bi bi-pencil-square'></i>
            <span>Input</span>
          </button>
          <button class='btn-nav' onclick='toggleBottomDrawer("history")' data-drawer='history'>
            <i class='bi bi-clock-history'></i>
            <span>History</span>
          </button>
          <button class='btn-nav' onclick='toggleBottomDrawer("flazz")' data-drawer='flazz'>
            <i class='bi bi-credit-card'></i>
            <span>Flazz</span>
          </button>
          <button class='btn-nav' onclick='switchTab("master")' data-tab='master' id='btn-nav-master' style='display:none;'>
            <i class='bi bi-gear'></i>
            <span>Master</span>
          </button>
          <button class='btn-nav' onclick='switchTab("settings")' data-tab='settings' id='btn-nav-settings' style='display:none;'>
            <i class='bi bi-sliders'></i>
            <span>Pengaturan</span>
          </button>
        </div>
      </nav>
```

Konfigurasi drawer: "jalur" → sub Buat/Daftar/Summary; "operasional" → sub Input Laporan/Performa Kendaraan; "history" → sub History Laporan/Galeri Foto; "flazz" → sub Top Up/Rekonsiliasi/List/Riwayat.

- [ ] **Step 3: Tulis config drawer + `toggleBottomDrawer`/`closeBottomDrawer` di js.html**

Sisipkan tepat setelah `function toggleNavMenu(groupId) {...}` (dari Task 1):

```js
  // Sub-menu mobile (drawer di atas bottom-nav). Memakai data-tab yang sama dengan switchTab.
  var BOTTOM_NAV_DRAWERS = {
    jalur: [
      { tab: 'jalur-buat', label: 'Buat Jalur', icon: 'bi-calendar-plus' },
      { tab: 'jalur-listing', label: 'Daftar Jalur', icon: 'bi-list-ul' },
      { tab: 'jalur-summary', label: 'Summary Pengiriman', icon: 'bi-clipboard-data' }
    ],
    operasional: [
      { tab: 'form', label: 'Input Laporan', icon: 'bi-pencil-square' },
      { tab: 'performa', label: 'Performa Kendaraan', icon: 'bi-speedometer2' }
    ],
    history: [
      { tab: 'history', label: 'History Laporan', icon: 'bi-clock-history' },
      { tab: 'gallery', label: 'Galeri Foto', icon: 'bi-images' }
    ],
    flazz: [
      { tab: 'flazz-topup', label: 'Top Up Flazz', icon: 'bi-wallet2' },
      { tab: 'flazz-recon', label: 'Rekonsiliasi Flazz', icon: 'bi-check2-all' },
      { tab: 'flazz-listing', label: 'List Flazz & Saldo', icon: 'bi-credit-card' },
      { tab: 'flazz-history', label: 'Riwayat Transaksi', icon: 'bi-journal-text' }
    ]
  };

  function drawBottomNav(key) {
    var drawer = document.getElementById('bottom-nav-drawer');
    if (!drawer) return;
    var items = BOTTOM_NAV_DRAWERS[key] || [];
    drawer.innerHTML = items.map(function(it) {
      return "<button class='btn-nav bnd-item' data-tab='" + it.tab + "' onclick='switchTab(\"" + it.tab + "\")'>" +
        "<i class='bi " + it.icon + "'></i><span>" + it.label + '</span></button>';
    }).join('');
  }

  function toggleBottomDrawer(key) {
    var wrap = document.getElementById('bottom-nav-drawer-wrap');
    if (!wrap) return;
    var isOpen = wrap.style.display === 'block' && (wrap.dataset.key || '') === key;
    closeBottomDrawer();
    if (isOpen) return;
    drawBottomNav(key);
    wrap.style.display = 'block';
    wrap.dataset.key = key;
  }

  function closeBottomDrawer() {
    var wrap = document.getElementById('bottom-nav-drawer-wrap');
    if (!wrap) return;
    wrap.style.display = 'none';
    wrap.dataset.key = '';
  }
```

- [ ] **Step 4: Tutup drawer di awal `switchTab`**

Di `function switchTab(tab) {` (js.html:406), tambahkan baris pertama body:

```js
    closeBottomDrawer();
```

(juga `document.querySelectorAll('.menu-group.open')...remove` sudah ditambahkan di akhir switchTab pada Task 1 Step 4 — biarkan.)

- [ ] **Step 5: Verifikasi syntax**

Run:
```
powershell -Command "$h=Get-Content -Raw src\Index.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_index.js -Encoding UTF8; node --check temp_index.js; Remove-Item temp_index.js"
powershell -Command "$h=Get-Content -Raw src\js.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_js.js -Encoding UTF8; node --check temp_js.js; Remove-Item temp_js.js"
```
Expected: PASS.

- [ ] **Step 6: Uji manual (ditunda ke Task 9 bersama deploy)**

- [ ] **Step 7: Commit**

```
git add src/Index.html src/css.html src/js.html
git commit -m "feat: bottom-nav drawer accordion untuk mobile (auto-hide antar menu)"
```

---
---

### Task 3: Kolom Status Kartu di List Flazz & Saldo (Fitur 1)

Tambah kolom Status (badge) setelah kolom Driver di tabel List Flazz & Saldo.

**Files:**
- Modify: `src/FlazzPages.html:334-343` (thead)
- Modify: `src/FlazzScript.html:928-940` (baris tabel di `renderFlazzListingTable`)

- [ ] **Step 1: Tambah `<th>Status</th>` di thead**

Di `src/FlazzPages.html`, blok thead `flazz-listing-table` (baris 334-343), ubah dari:

```html
                <th class='text-center' style='width:50px;'>No</th>
                <th>Nomor Kartu</th>
                <th>Nama Kartu</th>
                <th>Driver</th>
                <th class='text-end'>Saldo Awal</th>
                <th class='text-end'>Pengeluaran</th>
                <th class='text-end'>Saldo Akhir</th>
```

menjadi:

```html
                <th class='text-center' style='width:50px;'>No</th>
                <th>Nomor Kartu</th>
                <th>Nama Kartu</th>
                <th>Driver</th>
                <th>Status</th>
                <th class='text-end'>Saldo Awal</th>
                <th class='text-end'>Pengeluaran</th>
                <th class='text-end'>Saldo Akhir</th>
```

- [ ] **Step 2: Tambah sel Status di `renderFlazzListingTable`**

Di `src/FlazzScript.html` `renderFlazzListingTable`, di dalam `forEach` (baris 897-942), ubah dari:

```js
      let tr = document.createElement('tr');
      tr.innerHTML = `
      <td class='text-center text-muted'>${idx + 1}</td>
      <td>
        <a href='#' class='fw-bold text-primary text-decoration-underline' onclick="showFlazzDetailModal('${cardId}'); return false;">
          ${c.card_number}
        </a>
      </td>
      <td>${c.card_name || '-'}</td>
      <td>${c.driver_id || '-'}</td>
```

menjadi:

```js
      let tr = document.createElement('tr');
      let statusBadgeCls = c.status === 'SEDANG_DIGUNAKAN' ? 'bg-warning' : (c.status === 'TERSEDIA' ? 'bg-success' : 'bg-secondary');
      tr.innerHTML = `
      <td class='text-center text-muted'>${idx + 1}</td>
      <td>
        <a href='#' class='fw-bold text-primary text-decoration-underline' onclick="showFlazzDetailModal('${cardId}'); return false;">
          ${c.card_number}
        </a>
      </td>
      <td>${c.card_name || '-'}</td>
      <td>${c.driver_id || '-'}</td>
      <td><span class="badge ${statusBadgeCls}">${c.status || 'NONAKTIF'}</span></td>
```

- [ ] **Step 3: Verifikasi syntax**

Run:
```
powershell -Command "$h=Get-Content -Raw src\FlazzScript.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_fs.js -Encoding UTF8; node --check temp_fs.js; Remove-Item temp_fs.js"
powershell -Command "$h=Get-Content -Raw src\FlazzPages.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_fp.js -Encoding UTF8; node --check temp_fp.js; Remove-Item temp_fp.js"
```
Expected: PASS.

- [ ] **Step 4: Uji manual (ditunda ke Task 9)** — superadmin login → List Flazz & Saldo menampilkan kolom Status dengan badge (warning=sedang dipakai, success=tersedia).

- [ ] **Step 5: Commit**

```
git add src/FlazzPages.html src/FlazzScript.html
git commit -m "feat: kolom status kartu di List Flazz & Saldo"
```

---
---

### Task 4: Infrastruktur filter SUPERADMIN + race-fix (Fitur 2 — fondasi)

Tambah helper global `fillCabangSelect`, pastikan `window.masterData.cabang` diisi di `loadInitialData`, dan tambahkan request-ID token global untuk pemuatan data Flazz/Jalur/Master. Filter-render client-side mengikuti cabang terpilih.

**Files:**
- Modify: `src/js.html` (helper fillCabangSelect, set masterData.cabang di loadInitialData, token globals)

- [ ] **Step 1: Isi `window.masterData.cabang` di `loadInitialData`**

Di js.html `loadInitialData` success handler (baris ±356-363), tambahkan `masterData.cabang` dari `data.cabangList`:

```js
        if (data.cabangList) window.masterData.cabang = data.cabangList;
```

Tepat di samping baris yang sudah ada:

```js
        allVehicles = data.vehicles || [];
        allDrivers = data.drivers || [];
        if (data.bbmList) window.masterData.bbm = data.bbmList;
        if (data.flazzCards) window.masterData.flazzCards = data.flazzCards;
```

- [ ] **Step 2: Tulis `fillCabangSelect` + token globals di js.html**

Sisipkan setelah `function closeBottomDrawer() {...}` (dari Task 2):

```js
  // ===== Infrastruktur filter SUPERADMIN =====
  // Token request-id per area agar respons lama tidak menimpa yang baru (race-condition).
  var __flazzRequestId = 0;
  var __jalurRequestId = 0;
  var __masterRequestId = 0;

  // Isi <select> warehouse dari masterData.cabang (getCabangList), tanpa hardcode.
  function fillCabangSelect(sel) {
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">Semua Warehouse</option>';
    ((window.masterData && window.masterData.cabang) || []).forEach(function(c) {
      var o = document.createElement('option');
      o.value = c.kode;
      o.text = c.nama;
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  }
```

- [ ] **Step 3: Verifikasi syntax**

```
node --check src/Code.js
powershell -Command "$h=Get-Content -Raw src\js.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_js.js -Encoding UTF8; node --check temp_js.js; Remove-Item temp_js.js"
```
Expected: PASS.

- [ ] **Step 4: Commit**

```
git add src/js.html
git commit -m "feat: infrastruktur filter SUPERADMIN (fillCabangSelect + request-id tokens)"
```

---
---

### Task 5: Filter Flazz — List Flazz & Saldo + Riwayat Transaksi, dan race-fix Flazz (Fitur 2 + Fitur 4 race)

Tambah widget warehouse di halaman List Flazz & Riwayat, filter tanggal dari-sampai untuk Riwayat, dan guard request-id di `loadFlazzDataWrapper`. Ketika cabang berubah → cache di-reset, reload ulang. Riwayat: filter client-side berdasar `branch_id` (via card lookup) + rentang tanggal.

**Files:**
- Modify: `src/FlazzPages.html` (widget listing ±300-314; widget history + bar tanggal ±156-180)
- Modify: `src/FlazzScript.html` (`loadFlazzDataWrapper`, `renderHistSection`, + globals)

- [ ] **Step 1: Widget warehouse List Flazz & Saldo di FlazzPages.html**

Pada blok filter card `page-flazz-listing` (FlazzPages.html:300-314), ubah dari:

```html
  <div class="card shadow-sm border-0 rounded-4 mb-4">
    <div class="card-body">
      <div class="row g-2 align-items-end">
        <div class="col-12 col-md-3">
          <label class='form-label fw-bold text-muted small text-uppercase'>Filter Tanggal</label>
          <input type='date' id='flazz-listing-date' class='form-control' onchange='renderFlazzListingTable()'>
        </div>
        <div class="col-12 col-md-3">
          <button class='btn btn-primary rounded-4 fw-bold' onclick='renderFlazzListingTable()'>
            <i class='bi bi-search me-1'></i>Tampilkan
          </button>
        </div>
      </div>
    </div>
  </div>
```

menjadi:

```html
  <div class="card shadow-sm border-0 rounded-4 mb-4">
    <div class="card-body">
      <div class="row g-2 align-items-end">
        <div class="col-12 col-md-3" id='flazz-listing-cabang-wrap' style='display:none;'>
          <label class='form-label fw-bold text-muted small text-uppercase'>Pilih Warehouse</label>
          <select id='flazz-listing-filter-cabang' class='form-select' onchange='onFlazzListingCabangChange()'>
            <option value=''>Semua Warehouse</option>
          </select>
        </div>
        <div class="col-12 col-md-3">
          <label class='form-label fw-bold text-muted small text-uppercase'>Filter Tanggal</label>
          <input type='date' id='flazz-listing-date' class='form-control' onchange='renderFlazzListingTable()'>
        </div>
        <div class="col-12 col-md-3">
          <button class='btn btn-primary rounded-4 fw-bold' onclick='renderFlazzListingTable()'>
            <i class='bi bi-search me-1'></i>Tampilkan
          </button>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Widget warehouse + tanggal dari-sampai untuk Riwayat di FlazzPages.html**

Pada blok `page-flazz-history` (FlazzPages.html:156-159), sesudah `<h4 ...>Riwayat Flazz</h4>` dan SEBELUM `<div class="card shadow-sm border-0 rounded-4 mb-4">` (tab header), sisipkan filter card:

```html
  <div class="card shadow-sm border-0 rounded-4 mb-3" id='flazz-history-filter-wrap' style='display:none;'>
    <div class="card-body p-3">
      <div class="row g-2 align-items-end">
        <div class="col-12 col-md-4">
          <label class='form-label fw-bold text-muted small text-uppercase'>Pilih Warehouse</label>
          <select id='flazz-history-filter-cabang' class='form-select form-select-sm' onchange='onFlazzHistoryFilterChange()'>
            <option value=''>Semua Warehouse</option>
          </select>
        </div>
        <div class="col-6 col-md-3">
          <label class='form-label fw-bold text-muted small text-uppercase'>Dari Tanggal</label>
          <input type='date' id='flazz-history-filter-start' class='form-control form-control-sm' onchange='onFlazzHistoryFilterChange()'>
        </div>
        <div class="col-6 col-md-3">
          <label class='form-label fw-bold text-muted small text-uppercase'>Sampai Tanggal</label>
          <input type='date' id='flazz-history-filter-end' class='form-control form-control-sm' onchange='onFlazzHistoryFilterChange()'>
        </div>
        <div class="col-6 col-md-2">
          <button class='btn btn-outline-secondary btn-sm w-100' onclick='onFlazzHistoryFilterChange()'><i class='bi bi-search me-1'></i>Terapkan</button>
        </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Globals + helper Flazz di FlazzScript.html**

Tambahkan di dekat `let flazzDataCache = null;` (FlazzScript.html:6):

```js
let __flazzFilterCabang = '';
let __flazzHistStart = '';
let __flazzHistEnd = '';
```

Tambahkan fungsi berikut setelah `loadFlazzDataWrapper` (FlazzScript.html:89):

```js
function populateFlazzWidgets() {
  var isSuper = typeof userRole !== 'undefined' && userRole === 'SUPERADMIN';
  var listingWrap = document.getElementById('flazz-listing-cabang-wrap');
  var histWrap = document.getElementById('flazz-history-filter-wrap');
  if (isSuper) {
    if (listingWrap && listingWrap.style.display === 'none') listingWrap.style.display = '';
    if (histWrap && histWrap.style.display === 'none') histWrap.style.display = '';
    if (typeof fillCabangSelect === 'function') {
      fillCabangSelect(document.getElementById('flazz-listing-filter-cabang'));
      fillCabangSelect(document.getElementById('flazz-history-filter-cabang'));
    }
    var lSel = document.getElementById('flazz-listing-filter-cabang');
    if (lSel) lSel.value = __flazzFilterCabang;
    var hSel = document.getElementById('flazz-history-filter-cabang');
    if (hSel) hSel.value = __flazzFilterCabang;
  } else {
    if (listingWrap) listingWrap.style.display = 'none';
    if (histWrap) histWrap.style.display = 'none';
  }
}

function onFlazzListingCabangChange() {
  var sel = document.getElementById('flazz-listing-filter-cabang');
  __flazzFilterCabang = sel ? sel.value : '';
  var hSel = document.getElementById('flazz-history-filter-cabang');
  if (hSel) hSel.value = __flazzFilterCabang;
  flazzDataCache = null;
  loadFlazzDataWrapper(true);
}

function onFlazzHistoryFilterChange() {
  var sel = document.getElementById('flazz-history-filter-cabang');
  if (sel) {
    __flazzFilterCabang = sel.value;
    var lSel = document.getElementById('flazz-listing-filter-cabang');
    if (lSel) lSel.value = __flazzFilterCabang;
  }
  var s = document.getElementById('flazz-history-filter-start');
  __flazzHistStart = s ? s.value : '';
  var e = document.getElementById('flazz-history-filter-end');
  __flazzHistEnd = e ? e.value : '';
  flazzDataCache = null;
  loadFlazzDataWrapper(true);
}
```

- [ ] **Step 4: Race-fix + cabang di `loadFlazzDataWrapper`**

Ubah `loadFlazzDataWrapper` (FlazzScript.html:52-89). Kode lama:

```js
function loadFlazzDataWrapper(force) {
   if (!force && flazzDataCache) {
      document.getElementById('flazz-dashboard-loading').style.display = 'none';
      document.getElementById('flazz-dashboard-content').style.display = 'block';
      renderFlazzDashboardCards(flazzDataCache);
      renderFlazzMasterTable(flazzDataCache.cards);
      populateFlazzDropdowns(flazzDataCache);
      renderFlazzHistory(flazzDataCache);
      return;
   }
   let uInfo = {
       username: document.getElementById('login_username') ? document.getElementById('login_username').value : '',
       role: userRole,
       cabang: userRole === 'SUPERADMIN'
         ? (document.getElementById('input-cabang-filter') ? document.getElementById('input-cabang-filter').value : '')
         : flazzUserInfo().cabang
   };
   document.getElementById('flazz-dashboard-loading').style.display = 'block';
   document.getElementById('flazz-dashboard-content').style.display = 'none';

   google.script.run
    .withSuccessHandler(function(res) {
       flazzDataCache = res;
       document.getElementById('flazz-dashboard-loading').style.display = 'none';
       document.getElementById('flazz-dashboard-content').style.display = 'block';

       renderFlazzDashboardCards(res);
       renderFlazzMasterTable(res.cards);
       populateFlazzDropdowns(res);
       renderFlazzHistory(res);
    })
    .withFailureHandler(function(err) {
      document.getElementById('flazz-dashboard-loading').style.display = 'none';
      document.getElementById('flazz-dashboard-content').style.display = 'block';
      showToast('Gagal memuat data Flazz: ' + (err && err.message || err), 'error');
    })
    .apiGetFlazzDashboardData(uInfo);
}
```

Ganti dengan:

```js
function loadFlazzDataWrapper(force) {
   populateFlazzWidgets();
   if (!force && flazzDataCache) {
      document.getElementById('flazz-dashboard-loading').style.display = 'none';
      document.getElementById('flazz-dashboard-content').style.display = 'block';
      renderFlazzDashboardCards(flazzDataCache);
      renderFlazzMasterTable(flazzDataCache.cards);
      populateFlazzDropdowns(flazzDataCache);
      renderFlazzHistory(flazzDataCache);
      return;
   }
   var rid = ++__flazzRequestId;
   let uInfo = {
       username: document.getElementById('login_username') ? document.getElementById('login_username').value : '',
       role: userRole,
       cabang: userRole === 'SUPERADMIN'
         ? (__flazzFilterCabang || '')
         : flazzUserInfo().cabang
   };
   document.getElementById('flazz-dashboard-loading').style.display = 'block';
   document.getElementById('flazz-dashboard-content').style.display = 'none';

   google.script.run
    .withSuccessHandler(function(res) {
       if (rid !== __flazzRequestId) return; // respons lama diabaikan
       flazzDataCache = res;
       document.getElementById('flazz-dashboard-loading').style.display = 'none';
       document.getElementById('flazz-dashboard-content').style.display = 'block';

       renderFlazzDashboardCards(res);
       renderFlazzMasterTable(res.cards);
       populateFlazzDropdowns(res);
       renderFlazzHistory(res);
    })
    .withFailureHandler(function(err) {
      if (rid !== __flazzRequestId) return;
      document.getElementById('flazz-dashboard-loading').style.display = 'none';
      document.getElementById('flazz-dashboard-content').style.display = 'block';
      showToast('Gagal memuat data Flazz: ' + (err && err.message || err), 'error');
    })
    .apiGetFlazzDashboardData(uInfo);
}
```

- [ ] **Step 5: Filter client-side di `renderHistSection`**

Di `renderHistSection` (FlazzScript.html:530-...), setelah blok:

```js
  let list = [];
  if (type === 'topup') list = data.topups || [];
  else if (type === 'tol') list = data.tolHistory || data.tols || [];
  else if (type === 'bbm') list = data.bbmFlazz || [];
  else if (type === 'usage') list = data.usages || [];
  else if (type === 'recon') list = data.recons || [];
```

Sisipkan (sebelum `let tbody = ...`):

```js
  let cardsById = {};
  (data.cards || []).forEach(function(c) { cardsById[String(c.id)] = c; });
  list = list.filter(function(t) {
    if (__flazzFilterCabang) {
      var c = cardsById[String(t.card_id)] || {};
      if (c.branch_id && String(c.branch_id) !== String(__flazzFilterCabang)) return false;
    }
    if (!__flazzHistStart && !__flazzHistEnd) return true;
    var dv = t.date || t.tanggal || t.timestamp;
    if (dv == null || dv === '') return true;
    var key = localDateKey(new Date(dv)).toString();
    if (__flazzHistStart && key < __flazzHistStart) return false;
    if (__flazzHistEnd && key > __flazzHistEnd) return false;
    return true;
  });
```

Catatan: `localDateKey` (FlazzScript.html:771) menerima string 'yyyy-MM-dd' apa pun dan Date; `new Date(dv)` lalu key via `localDateKey(new Date(...))` menghasilkan 'yyyy-MM-dd' lokal. Sesuai format input `<input type='date'>`.

- [ ] **Step 6: Verifikasi syntax**

```
node --check src/Code.js
powershell -Command "$h=Get-Content -Raw src\FlazzScript.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_fs.js -Encoding UTF8; node --check temp_fs.js; Remove-Item temp_fs.js"
powershell -Command "$h=Get-Content -Raw src\FlazzPages.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_fp.js -Encoding UTF8; node --check temp_fp.js; Remove-Item temp_fp.js"
```
Expected: PASS.

- [ ] **Step 7: Uji manual (login SUPERADMIN) — ditunda ke Task 9**: pilih warehouse di List Flazz → tabel & dashboard ter-filter; Riwayat → filter cabang + rentang tanggal berlaku di kelima tab; berpindah tab cepat → data yang tampil selalu dari panggilan terakhir (tidak menimpa).

- [ ] **Step 8: Commit**

```
git add src/FlazzPages.html src/FlazzScript.html
git commit -m "feat: filter warehouse & tanggal riwayat Flazz + race-fix"
```

---
---

### Task 6: Filter Daftar Jalur (warehouse + tanggal range) + race-fix (Fitur 2)

Widget warehouse + tanggal dari-sampai di halaman Daftar Jalur; backend `getJalurByTanggal` diperluas menerima `opts { tanggalAkhir, cabang }`. Guard token di `jalurShowListing`/`jalurShowSummary`/`jalurEdit`.

**Files:**
- Modify: `src/JalurOps.js` (`getJalurByTanggal`)
- Modify: `src/Code.js` (`apiGetJalurByTanggal`)
- Modify: `src/JalurPages.html` (filter listing ±34-42)
- Modify: `src/JalurScript.html` (`jalurShowListing`, `jalurShowSummary`, `jalurEdit`)

- [ ] **Step 1: Perluas `getJalurByTanggal` di JalurOps.js**

Ubah signature & filter (JalurOps.js:247-259). Sebelum:

```js
function getJalurByTanggal(tanggal, userInfo) {
  try {
    const sheet = jalurSheet();
    if (!sheet) return { success: false, msg: 'Sheet Jalur_Pengiriman tidak ditemukan.' };
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iTanggal = idx['tanggal'];
    const iDeleted = idx['is_deleted'];
    const iCabang = idx['kode_cabang'];
    const filteredCabang = getJalurCabangFor(userInfo);
    const nonSuper = userInfo && userInfo.role !== 'SUPERADMIN';
    // Non-SUPERADMIN wajib punya cabang; tanpa cabang tidak boleh lihat jadwal apa pun.
    if (nonSuper && !filteredCabang) return { success: true, list: [], created_by: '' };
```

Sesudah:

```js
function getJalurByTanggal(tanggal, userInfo, opts) {
  try {
    opts = opts || {};
    const sheet = jalurSheet();
    if (!sheet) return { success: false, msg: 'Sheet Jalur_Pengiriman tidak ditemukan.' };
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iTanggal = idx['tanggal'];
    const iDeleted = idx['is_deleted'];
    const iCabang = idx['kode_cabang'];
    let filteredCabang = getJalurCabangFor(userInfo);
    // SUPERADMIN bisa memfilter per cabang via opts.cabang ('' = semua).
    if (userInfo && userInfo.role === 'SUPERADMIN') {
      filteredCabang = opts.cabang || null;
    }
    const nonSuper = userInfo && userInfo.role !== 'SUPERADMIN';
    const tanggalAkhir = opts.tanggalAkhir || '';
    // Non-SUPERADMIN wajib punya cabang; tanpa cabang tidak boleh lihat jadwal apa pun.
    if (nonSuper && !filteredCabang) return { success: true, list: [], created_by: '' };
```

Ubah bagian filter per-row (JalurOps.js:261-277), sebelum:

```js
    data.forEach((row, i) => {
      if (i === 0) return;
      let finalTgl = '';
      if (iTanggal !== undefined) {
        let rowTgl = row[iTanggal];
        if (rowTgl instanceof Date) {
          const tz = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSpreadsheetTimeZone();
          rowTgl = Utilities.formatDate(rowTgl, tz, 'yyyy-MM-dd');
        } else {
          rowTgl = String(rowTgl).substring(0, 10);
        }
        if (tanggal && rowTgl !== String(tanggal)) return;
        finalTgl = rowTgl;
      }
```

Sesudah:

```js
    data.forEach((row, i) => {
      if (i === 0) return;
      let finalTgl = '';
      if (iTanggal !== undefined) {
        let rowTgl = row[iTanggal];
        if (rowTgl instanceof Date) {
          const tz = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSpreadsheetTimeZone();
          rowTgl = Utilities.formatDate(rowTgl, tz, 'yyyy-MM-dd');
        } else {
          rowTgl = String(rowTgl).substring(0, 10);
        }
        const startKey = tanggal ? String(tanggal) : '';
        const endKey = tanggalAkhir || startKey;
        if (startKey && (rowTgl < startKey || rowTgl > endKey)) return;
        finalTgl = rowTgl;
      }
```

- [ ] **Step 2: Update `apiGetJalurByTanggal` di Code.js**

Ubah (Code.js:234):

```js
  function apiGetJalurByTanggal(tanggal, userInfo) { return getJalurByTanggal(tanggal, userInfo); }
```

menjadi:

```js
  function apiGetJalurByTanggal(tanggal, userInfo, opts) { return getJalurByTanggal(tanggal, userInfo, opts || {}); }
```

- [ ] **Step 3: Widget filter Daftar Jalur di JalurPages.html**

Ubah blok filter listing (JalurPages.html:34-42), sebelum:

```html
      <div class='row g-2 align-items-end'>
        <div class='col-12 col-md-4'>
          <label class='form-label fw-bold text-muted small text-uppercase'>Filter Tanggal</label>
          <input type='date' id='jalur-listing-filter-tanggal' class='form-control'>
        </div>
        <div class='col-12 col-md-8'>
          <button class='btn btn-primary rounded-4 fw-bold' onclick='jalurShowListing()'><i class='bi bi-search me-1'></i>Tampilkan</button>
        </div>
      </div>
```

menjadi:

```html
      <div class='row g-2 align-items-end'>
        <div class='col-12 col-md-3' id='jalur-listing-cabang-wrap' style='display:none;'>
          <label class='form-label fw-bold text-muted small text-uppercase'>Pilih Warehouse</label>
          <select id='jalur-listing-filter-cabang' class='form-select' onchange='jalurShowListing()'>
            <option value=''>Semua Warehouse</option>
          </select>
        </div>
        <div class='col-6 col-md-3'>
          <label class='form-label fw-bold text-muted small text-uppercase'>Dari Tanggal</label>
          <input type='date' id='jalur-listing-filter-tanggal' class='form-control'>
        </div>
        <div class='col-6 col-md-3'>
          <label class='form-label fw-bold text-muted small text-uppercase'>Sampai Tanggal</label>
          <input type='date' id='jalur-listing-filter-tanggal-akhir' class='form-control'>
        </div>
        <div class='col-12 col-md-3'>
          <button class='btn btn-primary rounded-4 fw-bold' onclick='jalurShowListing()'><i class='bi bi-search me-1'></i>Tampilkan</button>
        </div>
      </div>
```

- [ ] **Step 4: Update `jalurShowListing` di JalurScript.html**

Ubah `jalurShowListing` (JalurScript.html:174-224). Tambahkan populating widget + token + opts:

Sebelum `function jalurShowListing() {` (JalurScript.html:174), tambahkan helper:

```js
function jalurPopulateListingFilter() {
  var wrap = document.getElementById('jalur-listing-cabang-wrap');
  if (!wrap) return;
  if (typeof userRole !== 'undefined' && userRole === 'SUPERADMIN') {
    wrap.style.display = '';
    if (typeof fillCabangSelect === 'function') fillCabangSelect(document.getElementById('jalur-listing-filter-cabang'));
  } else {
    wrap.style.display = 'none';
  }
}
```

Di `jalurShowListing`, ubah baris pertama (document 175-179):

```js
function jalurShowListing() {
  jalurPopulateListingFilter();
  document.getElementById('jalur-listing-loaded').style.display = 'none';
  const loading = document.getElementById('jalur-listing-loading');
  if (loading) loading.style.display = 'block';
  var flt = document.getElementById('jalur-listing-filter-tanggal');
  var tanggal = flt ? flt.value : '';
  var flEnd = document.getElementById('jalur-listing-filter-tanggal-akhir');
  var tanggalAkhir = flEnd ? flEnd.value : '';
  var cabEl = document.getElementById('jalur-listing-filter-cabang');
  var cabang = cabEl ? cabEl.value : '';
  var rid = ++__jalurRequestId;
```

Tambahkan guard token di `withSuccessHandler` (baris pertama callback, jalurShowListing 182):

```js
    .withSuccessHandler(function(res) {
      if (rid !== __jalurRequestId) return;
```

Ubah pemanggilan akhir (baris 223):

```js
      .apiGetJalurByTanggal(tanggal, userInfo);
```

menjadi:

```js
      .apiGetJalurByTanggal(tanggal, userInfo, { tanggalAkhir: tanggalAkhir, cabang: cabang });
```

- [ ] **Step 5: Race-fix `jalurShowSummary` (JalurScript.html:226-278)**

Di `jalurShowSummary`, tambahkan token di awal fungsi (setelah `const tanggal = ...`):

```js
  var rid = ++__jalurRequestId;
```

Tambahkan guard di `withSuccessHandler` (baris 235):

```js
      if (rid !== __jalurRequestId) return;
```

- [ ] **Step 6: Race-fix + opts di `jalurEdit` (JalurScript.html:357-386)**

Ubah bagian awal fungsi `jalurEdit`:

```js
function jalurEdit(id) {
  const tanggal = document.getElementById('jalur-filter-tanggal').value;
```

menjadi:

```js
function jalurEdit(id) {
  const tanggalInput = document.getElementById('jalur-listing-filter-tanggal');
  const tanggal = tanggalInput ? tanggalInput.value : '';
  const flEnd = document.getElementById('jalur-listing-filter-tanggal-akhir');
  const tanggalAkhir = flEnd ? flEnd.value : '';
  const cabEl = document.getElementById('jalur-listing-filter-cabang');
  const cabang = cabEl ? cabEl.value : '';
  var rid = ++__jalurRequestId;
```

Tambahkan guard di `withSuccessHandler` (baris 360):

```js
      if (rid !== __jalurRequestId) return;
```

Ubah pemanggilan akhir (baris 385):

```js
      .apiGetJalurByTanggal(tanggal, userInfo);
```

menjadi:

```js
      .apiGetJalurByTanggal(tanggal, userInfo, { tanggalAkhir: tanggalAkhir, cabang: cabang });
```

- [ ] **Step 7: Verifikasi syntax**

```
node --check src/JalurOps.js
node --check src/Code.js
powershell -Command "$h=Get-Content -Raw src\JalurScript.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_js.js -Encoding UTF8; node --check temp_js.js; Remove-Item temp_js.js"
powershell -Command "$h=Get-Content -Raw src\JalurPages.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_jp.js -Encoding UTF8; node --check temp_jp.js; Remove-Item temp_jp.js"
```
Expected: PASS.

- [ ] **Step 8: Uji manual — ditunda ke Task 9**: SUPERADMIN filter warehouse + rentang tanggal di Daftar Jalur; non-superadmin tak melihat widget dan data otomatis cabang sendiri.

- [ ] **Step 9: Commit**

```
git add src/JalurOps.js src/Code.js src/JalurPages.html src/JalurScript.html
git commit -m "feat: filter Daftar Jalur (warehouse + rentang tanggal) + race-fix"
```

---
---

### Task 7: Filter warehouse Data Master per tab + race-fix (Fitur 2)

Widget warehouse di halaman Data Master (superadmin), filter render client-side untuk tab kendaraan/supir/flazz/pengguna (tab cabang & bbm menampilkan semua). Token pada `loadMasterData`.

**Files:**
- Modify: `src/Index.html` (widget di `page-master` ±718-724)
- Modify: `src/js.html` (`loadMasterData`, `switchMasterTab`, helper `onMasterFilterChange`, token)
- Modify: `src/FlazzScript.html` (guard token tidak perlu — sudah via `loadFlazzDataWrapper`; tapi render tab flazz mengikuti `__flazzFilterCabang`)

- [ ] **Step 1: Widget warehouse di `page-master` (Index.html)**

Sisipkan setelah `<h4 ...> Data Master </h4>` (Index.html:721-723) dan sebelum `<ul class='nav nav-pills mb-4' id='master-tabs'>`:

```html
            <div class='mb-3' id='master-filter-cabang-wrap' style='display:none;'>
              <label class='form-label fw-bold text-muted small text-uppercase'>Pilih Warehouse</label>
              <select id='master-filter-cabang' class='form-select' onchange='onMasterFilterChange()'>
                <option value=''>Semua Warehouse</option>
              </select>
            </div>
```

- [ ] **Step 2: Helper filter master di js.html**

Tambahkan setelah `function fillCabangSelect(...)` (Task 4):

```js
  function populateMasterFilter() {
    var wrap = document.getElementById('master-filter-cabang-wrap');
    if (!wrap) return;
    if (userRole === 'SUPERADMIN') {
      wrap.style.display = '';
      fillCabangSelect(document.getElementById('master-filter-cabang'));
    } else {
      wrap.style.display = 'none';
    }
  }

  function onMasterFilterChange() {
    loadMasterData(__activeMasterTab || 'kendaraan');
  }
```

- [ ] **Step 3: Track tab master aktif di `switchMasterTab`**

Di `function switchMasterTab(tab)` (js.html:1925-1935), tambahkan di baris pertama:

```js
    __activeMasterTab = tab;
```

(`var __activeMasterTab = 'kendaraan';` tambahkan sebagai global dekat token — bersama `fillCabangSelect` di Task 4 Step 2.)

- [ ] **Step 4: Race-fix + filter client-side di `loadMasterData`**

Ubah `function loadMasterData(tab)` (js.html:1937-1969):

```js
  function loadMasterData(tab) {
    tab = tab || __activeMasterTab || 'kendaraan';
    __activeMasterTab = tab;
    populateMasterFilter();

    if (tab === 'flazz') {
       if (typeof loadFlazzDataWrapper === 'function') loadFlazzDataWrapper();
       return;
    }

    var rid = ++__masterRequestId;
    var masterCabang = document.getElementById('master-filter-cabang') ? document.getElementById('master-filter-cabang').value : '';

    google.script.run
      .withSuccessHandler(function(data) {
        if (rid !== __masterRequestId) return;
        if (!data || typeof data !== 'object') {
           console.error('getMasterData returned invalid data:', data);
           showToast('Gagal memuat data master: respons server tidak valid', 'error');
           return;
        }
        if (Array.isArray(data.cabangList)) window.masterData.cabang = data.cabangList;
        if (tab === 'kendaraan') {
          var veh = data.vehicles || [];
          if (masterCabang) veh = veh.filter(function(v) { return String(v.cabang) === String(masterCabang); });
          renderKendaraanList(veh);
        } else if (tab === 'cabang') {
          renderCabangList(data.cabangList || []);
        } else if (tab === 'supir') {
          var drv = data.drivers || [];
          if (masterCabang) drv = drv.filter(function(d) { return String(d.cabang) === String(masterCabang); });
          renderSupirList(drv);
        } else if (tab === 'bbm') {
          renderBBMList(data.bbmList || []);
        } else if (tab === 'pengguna') {
          var usr = data.penggunaList || [];
          if (masterCabang) usr = usr.filter(function(u) { return String(u.cabang) === String(masterCabang); });
          renderPenggunaList(usr);
        }
      })
      .withFailureHandler(function(err) {
        if (rid !== __masterRequestId) return;
        showToast('Gagal memuat data: ' + err.message, 'error');
      })
      .getMasterData(userInfo);
  }
```

Catatan: tab `cabang` & `bbm` (masih tersedia untuk superadmin) menampilkan semua tanpa filter. Tab `flazz` memakai `loadFlazzDataWrapper` yang sudah terfilter oleh `__flazzFilterCabang` (Task 5).

- [ ] **Step 5: Sinkronkan filter master dengan filter flazz (tab flazz)**

Di `onMasterFilterChange` (Step 2), agar saat tab master aktif 'flazz' filter master ikut mengubah `__flazzFilterCabang`:

```js
  function onMasterFilterChange() {
    var tab = __activeMasterTab || 'kendaraan';
    if (tab === 'flazz') {
      var sel = document.getElementById('master-filter-cabang');
      __flazzFilterCabang = sel ? sel.value : '';
      if (typeof flazzDataCache !== 'undefined') flazzDataCache = null;
      if (typeof loadFlazzDataWrapper === 'function') loadFlazzDataWrapper(true);
      return;
    }
    loadMasterData(tab);
  }
```

- [ ] **Step 6: Verifikasi syntax**

```
node --check src/Code.js
powershell -Command "$h=Get-Content -Raw src\Index.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_index.js -Encoding UTF8; node --check temp_index.js; Remove-Item temp_index.js"
powershell -Command "$h=Get-Content -Raw src\js.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_js.js -Encoding UTF8; node --check temp_js.js; Remove-Item temp_js.js"
powershell -Command "$h=Get-Content -Raw src\FlazzScript.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_fs.js -Encoding UTF8; node --check temp_fs.js; Remove-Item temp_fs.js"
```
Expected: PASS.

- [ ] **Step 7: Commit**

```
git add src/Index.html src/js.html
git commit -m "feat: filter warehouse Data Master per tab + race-fix"
```

---
---

### Task 8: Dropdown kartu etoll per cabang di Buat Jalur & Edit Modal (Fitur 3)

Ubah field readonly text menjadi `<select>` berisi semua kartu aktif, difilter per cabang (widget `jalur-filter-cabang` di Buat Jalur untuk superadmin, atau cabang user untuk PIC), default = kartu default supir. Modal Edit: `<select>` dengan preset ke `flazz_card_id` tersimpan.

**Files:**
- Modify: `src/JalurPages.html` (buat: widget cabang di `page-jalur-buat`; edit: ubah `jalur-edit-etoll` jadi select)
- Modify: `src/JalurScript.html` (`jalurAddRow`, `jalurSetEtollDisplay` → jalurPopulateEtollOptions, `jalurSaveEdit`, autofill)

- [ ] **Step 1: Widget warehouse di `page-jalur-buat` (JalurPages.html)**

Sisipkan sebelum `Tanggal Pengiriman` block (JalurPages.html:9-12):

```html
      <div class='mb-3' id='jalur-buat-cabang-wrap' style='display:none;'>
        <label class='form-label fw-bold text-muted small text-uppercase'>Pilih Warehouse</label>
        <select id='jalur-filter-cabang' class='form-select' onchange='onJalurBuatCabangChange()'>
          <option value=''>Semua Warehouse</option>
        </select>
      </div>
```

- [ ] **Step 2: Ubah kolom Kartu Etoll di `jalurAddRow` (JalurScript.html:148-150)**

Sebelum:

```js
    '<div class="col-12 col-md-3"><label class="form-label text-muted small text-uppercase fw-bold">Kartu Etoll</label>' +
    '<div class="input-group"><input type="text" class="form-control jalur-row-etoll-name" readonly placeholder="(auto dari driver)">' +
    '<input type="hidden" class="jalur-row-etoll-id"></div></div>' +
```

Sesudah:

```js
    '<div class="col-12 col-md-3"><label class="form-label text-muted small text-uppercase fw-bold">Kartu Etoll</label>' +
    '<select class="form-select jalur-row-etoll" onchange="jalurSyncEtollRow(this)"></select>' +
    '<input type="hidden" class="jalur-row-etoll-id">' +
    '<input type="hidden" class="jalur-row-etoll-name">' +
```

- [ ] **Step 3: Helper dropdown etoll + sync di JalurScript.html**

Tambahkan setelah `function jalurResolveDefaultCard(...)` (JalurScript.html:108):

```js
function jalurActiveCabang() {
  if (typeof userRole !== 'undefined' && userRole === 'SUPERADMIN') {
    var sel = document.getElementById('jalur-filter-cabang');
    return sel ? sel.value : '';
  }
  return (typeof flazzUserInfo === 'function') ? flazzUserInfo().cabang : '';
}

function jalurPopulateEtollOptions(selectEl, selectedId) {
  if (!selectEl) return;
  var cards = (window.masterData && window.masterData.flazzCards) || [];
  var cabang = jalurActiveCabang();
  var html = '<option value="">Pilih Kartu Etoll...</option>';
  cards.forEach(function(c) {
    if (String(c.status || '') === 'NONAKTIF') return;
    if (cabang && String(c.branch_id) !== String(cabang)) return;
    var label = (c.card_name || '') + (c.card_number ? ' (' + c.card_number + ')' : '') +
      (c.card_role === 'UTAMA' ? ' [UTAMA]' : '');
    var sel = selectedId && String(c.id) === String(selectedId) ? ' selected' : '';
    html += '<option value="' + String(c.id) + '" data-name="' + String(c.card_name || '') + '"' + sel + '>' + label + '</option>';
  });
  selectEl.innerHTML = html;
}

function jalurSyncEtollRow(selectEl) {
  var row = selectEl.closest('.jalur-row');
  var idEl = row ? row.querySelector('.jalur-row-etoll-id') : null;
  var nameEl = row ? row.querySelector('.jalur-row-etoll-name') : null;
  var opt = selectEl.options[selectEl.selectedIndex];
  if (idEl) idEl.value = opt && opt.value ? opt.value : '';
  if (nameEl) nameEl.value = opt && opt.value ? (opt.getAttribute('data-name') || opt.text) : '';
}
```

- [ ] **Step 4: Ubah `jalurSetEtollDisplay` → set select (JalurScript.html:80-92)**

Sebelum:

```js
function jalurSetEtollDisplay(etollName, etollId, driverName) {
  var defCard = jalurResolveDefaultCard((driverName || '').trim());
  if (etollId) etollId.value = defCard ? defCard.id : '';
  if (etollName) {
    if (defCard) {
      var nm = defCard.card_name || '';
      var num = defCard.card_number || '';
      etollName.value = (nm && num) ? (nm + ' (' + num + ')') : (nm || num || '');
    } else {
      etollName.value = '';
    }
  }
}
```

Sesudah:

```js
function jalurSetEtollDisplay(etollSel, etollId, driverName) {
  var defCard = jalurResolveDefaultCard((driverName || '').trim());
  var selId = defCard ? defCard.id : '';
  jalurPopulateEtollOptions(etollSel, etollId ? etollId.value : selId);
  if (etollId && !etollId.value) etollId.value = selId;
  if (etollSel) jalurSyncEtollRow(etollSel);
}
```

- [ ] **Step 5: Update call-site `jalurAutofillFromDriver` (JalurScript.html:67-78)**

Sebelum:

```js
  jalurSetEtollDisplay(
    row.querySelector('.jalur-row-etoll-name'),
    row.querySelector('.jalur-row-etoll-id'),
    (driverInput.value || '').trim()
  );
```

Sesudah:

```js
  jalurSetEtollDisplay(
    row.querySelector('.jalur-row-etoll'),
    row.querySelector('.jalur-row-etoll-id'),
    (driverInput.value || '').trim()
  );
```

- [ ] **Step 6: Populasi select di `jalurAddRow`**

Di `jalurAddRow` (JalurScript.html:137-156), setelah `row.innerHTML = ...` selesai (sebelum `container.appendChild(row)` atau tepat setelahnya), tambahkan:

```js
  jalurPopulateEtollOptions(row.querySelector('.jalur-row-etoll'), '');
```

- [ ] **Step 7: Update `jalurAutofillEditEtoll` (JalurScript.html:94-100)**

Sebelum:

```js
function jalurAutofillEditEtoll(driverInput) {
  jalurSetEtollDisplay(
    document.getElementById('jalur-edit-etoll'),
    document.getElementById('jalur-edit-etoll-id'),
    (driverInput && driverInput.value || '')
  );
}
```

Sesudah:

```js
function jalurAutofillEditEtoll(driverInput) {
  var sel = document.getElementById('jalur-edit-etoll');
  if (sel) jalurPopulateEtollOptions(sel, document.getElementById('jalur-edit-etoll-id').value || '');
  jalurSetEtollDisplay(
    document.getElementById('jalur-edit-etoll'),
    document.getElementById('jalur-edit-etoll-id'),
    (driverInput && driverInput.value || '')
  );
}
```

- [ ] **Step 8: Ubah markup modal edit (JalurPages.html:163-167)**

Sebelum:

```html
        <div class='mb-3'>
          <label class='form-label text-muted small fw-bold'>Kartu Etoll</label>
          <input type='text' id='jalur-edit-etoll' class='form-control' readonly placeholder='(auto dari driver)'>
          <input type='hidden' id='jalur-edit-etoll-id'>
        </div>
```

Sesudah:

```html
        <div class='mb-3'>
          <label class='form-label text-muted small fw-bold'>Kartu Etoll</label>
          <select id='jalur-edit-etoll' class='form-select' onchange="document.getElementById('jalur-edit-etoll-id').value = this.value">
            <option value=''>Pilih Kartu Etoll...</option>
          </select>
          <input type='hidden' id='jalur-edit-etoll-id'>
        </div>
```

- [ ] **Step 9: Update preset di `jalurEdit` (JalurScript.html:377-381)**

Sebelum:

```js
      var editEtollId = document.getElementById('jalur-edit-etoll-id');
      if (!editEtollId.value && it.flazz_card_id) {
        editEtollId.value = it.flazz_card_id;
        document.getElementById('jalur-edit-etoll').value = it.flazz_card_name || '';
      }
```

Sesudah:

```js
      var editEtollId = document.getElementById('jalur-edit-etoll');
      var editEtollIdHidden = document.getElementById('jalur-edit-etoll-id');
      if (!editEtollIdHidden.value && it.flazz_card_id) {
        jalurPopulateEtollOptions(editEtollId, it.flazz_card_id);
        editEtollIdHidden.value = it.flazz_card_id;
        if (editEtollId) {
          var hasOption = Array.prototype.some.call(editEtollId.options, function(o) { return String(o.value) === String(it.flazz_card_id); });
          if (!hasOption) editEtollId.value = '';
        }
      }
```

- [ ] **Step 10: Update `jalurSaveEdit` (JalurScript.html:388-400)**

Sebelum:

```js
function jalurSaveEdit() {
  const etollEl = document.getElementById('jalur-edit-etoll');
  const etollId = document.getElementById('jalur-edit-etoll-id');
  const data = {
    id: document.getElementById('jalur-edit-id').value,
    tanggal: document.getElementById('jalur-edit-tanggal').value,
    driver_id: jalurResolveDriverId(document.getElementById('jalur-edit-driver')),
    driver2_id: jalurResolveDriverId(document.getElementById('jalur-edit-driver2')),
    vehicle_id: document.getElementById('jalur-edit-vehicle').value,
    rute_tujuan: document.getElementById('jalur-edit-rute').value,
    etoll_card_id: etollId ? etollId.value : '',
    etoll_card_name: etollEl ? etollEl.value : ''
  };
```

Sesudah:

```js
function jalurSaveEdit() {
  const etollEl = document.getElementById('jalur-edit-etoll');
  const etollId = document.getElementById('jalur-edit-etoll-id');
  const etollOpt = etollEl && etollEl.selectedIndex > -1 ? etollEl.options[etollEl.selectedIndex] : null;
  const data = {
    id: document.getElementById('jalur-edit-id').value,
    tanggal: document.getElementById('jalur-edit-tanggal').value,
    driver_id: jalurResolveDriverId(document.getElementById('jalur-edit-driver')),
    driver2_id: jalurResolveDriverId(document.getElementById('jalur-edit-driver2')),
    vehicle_id: document.getElementById('jalur-edit-vehicle').value,
    rute_tujuan: document.getElementById('jalur-edit-rute').value,
    etoll_card_id: etollId ? etollId.value : '',
    etoll_card_name: etollOpt && etollOpt.value ? (etollOpt.getAttribute('data-name') || etollOpt.text) : ''
  };
```

- [ ] **Step 11: Helper perilaku widget Buat Jalur + `jalurInitForm`**

Tambahkan setelah `jalurPopulateListingFilter` (Task 6 Step 4) di JalurScript.html:

```js
function populateJalurBuatCabang() {
  var wrap = document.getElementById('jalur-buat-cabang-wrap');
  if (!wrap) return;
  if (typeof userRole !== 'undefined' && userRole === 'SUPERADMIN') {
    wrap.style.display = '';
    if (typeof fillCabangSelect === 'function') fillCabangSelect(document.getElementById('jalur-filter-cabang'));
  } else {
    wrap.style.display = 'none';
  }
}

function onJalurBuatCabangChange() {
  document.querySelectorAll('#jalur-rows .jalur-row').forEach(function(r) {
    var sel = r.querySelector('.jalur-row-etoll');
    if (!sel) return;
    var driver = r.querySelector('.jalur-row-driver');
    var defCard = jalurResolveDefaultCard(driver ? (driver.value || '').trim() : '');
    jalurPopulateEtollOptions(sel, defCard ? defCard.id : '');
    jalurSyncEtollRow(sel);
  });
}
```

Di `jalurInitForm` (JalurScript.html:158-168), tambahkan `populateJalurBuatCabang();` pertama dalam callback `jalurEnsureMaster`:

```js
function jalurInitForm() {
  jalurEnsureMaster(function() {
    populateJalurBuatCabang();
    jalurPopulateDriverDatalist();
    const rows = document.getElementById('jalur-rows');
    if (!rows) return;
    rows.innerHTML = '';
    const t = document.getElementById('jalur-tanggal');
    if (t && !t.value) t.value = new Date().toISOString().slice(0, 10);
    jalurAddRow();
  });
}
```

- [ ] **Step 12: Verifikasi syntax**

```
node --check src/Code.js
powershell -Command "$h=Get-Content -Raw src\JalurScript.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_js.js -Encoding UTF8; node --check temp_js.js; Remove-Item temp_js.js"
powershell -Command "$h=Get-Content -Raw src\JalurPages.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_jp.js -Encoding UTF8; node --check temp_jp.js; Remove-Item temp_jp.js"
powershell -Command "$h=Get-Content -Raw src\js.html; $m=[regex]::Matches($h,'<script>([\s\S]*?)</script>'); ($m|ForEach-Object{$_.Groups[1].Value}) -join ([char]10) | Set-Content -Path temp_js2.js -Encoding UTF8; node --check temp_js2.js; Remove-Item temp_js2.js"
```
Expected: PASS.

- [ ] **Step 13: Uji manual — ditunda ke Task 9**: Buat Jalur → dropdown etoll berisi kartu aktif cabang terpilih, default kartu supir, kartu cadangan bisa dipilih; Edit Jadwal → preset ke kartu tersimpan.

- [ ] **Step 14: Commit**

```
git add src/JalurPages.html src/JalurScript.html
git commit -m "feat: dropdown kartu etoll per cabang di Buat Jalur & Edit Modal"
```

---
---

### Task 9: Verifikasi akhir, commit tersisa, push, dan deploy SEMUA perubahan ke web link yang sama

Gabungkan verifikasi menyeluruh, commit bila ada sisa, `git push`, `clasp push`, dan `clasp deploy` ke deployment id yang sama (menjadi versi terbaru di atas @170). User memutuskan seluruh perubahan (fitur 4 + fix keamanan) naik sekaligus ke link yang sama.

**Files:** semua file yang berubah dari Task 0-8.

- [ ] **Step 1: Verifikasi syntax menyeluruh**

Run dari workdir `D:\Monitoring BBM`:
```
node --check src/Code.js
node --check src/SpreadsheetOps.js
node --check src/FlazzOps.js
node --check src/JalurOps.js
```
Untuk tiap HTML (Index, js, FlazzScript, FlazzPages, JalurScript, JalurPages, css) jalankan ekstraksi `<script>`/`<style>` + node --check seperti di tiap task. Pastikan semua PASS dan tidak ada file temp tersisa (`temp_*.js` dihapus).

- [ ] **Step 2: Review diff & status git**

```
git status
git diff --stat
git log --oneline -15
```
Expected: daftar commit dari Task 0-8 panjang dan konsisten; tidak ada file untracked yang ikut.

- [ ] **Step 3: Uji manual menyeluruh di deployment**

Sebelum push: (pilihan) buka preview via `clasp open` atau deploy ke deployment lama (SELALU hati-hati: user minta deploy final). Uji checklist dari spec §7:
1. SUPERADMIN login → List Flazz menampilkan kolom Status (badge) + filter warehouse.
2. Riwayat Transaksi → filter warehouse + tanggal per tab.
3. Daftar Jalur → filter warehouse + rentang tanggal.
4. Data Master → filter per tab (kendaraan/supir/flazz/pengguna); cabang/bbm semua.
5. Buat Jalur → dropdown etoll per cabang, default kartu supir, cadangan bisa dipilih.
6. Edit Jadwal → preset kartu tersimpan.
7. Navigasi: klik "Jalur Pengiriman" membuka sub menu & menutup grup lain; rename "Laporan Operasional Kendaraan" & accordion di sidebar & bottom-nav.
8. Race: cepat pindah antar tab Flazz → data terakhir yang tampil.
9. Non-superadmin (PIC): filter tak tampil; data tetap cabang user.
10. Fix keamanan (dari Task 0) tetap bekerja: PIC hanya bisa mengelola data cabang sendiri; SUPERADMIN-only operasi ditolak untuk PIC.

- [ ] **Step 4: Commit sisa (bila ada)**

```
git add -A src
git commit -m "chore: verifikasi akhir & perbaikan kecil pasca-review"
```
(Skip bila tidak ada perubahan.)

- [ ] **Step 5: Push ke remote**

```
git push origin master
```
(Apabila remote menolak non-fast-forward, ikuti pola sebelumnya: `git push --force origin master` — hanya jika ini memang alur yang disepakati repo. Biasanya langsung sukses.)

Expected: `master` ter-update; semua commit Task 0-8 ter-push.

- [ ] **Step 6: Clasp push**

Workdir `D:\Monitoring BBM\src`:
```
clasp push -f
```
Expected: 8 file ter-upload (Code.js, FlazzOps.js, FlazzPages.html, FlazzScript.html, Index.html, JalurOps.js, JalurPages.html, JalurScript.html, SpreadsheetOps.js, appsscript.json, css.html, js.html, + Settings/Html2canvasLib bila ada). Tidak ada error syntax.

- [ ] **Step 7: Deploy ke deployment id yang sama (versi baru)**

```
clasp version "Navigasi accordion, filter SUPERADMIN, status kartu, dropdown etoll"
clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF
```
Jika `clasp deploy -i <deploymentId>` tidak didukung versi clasp, gunakan:
```
clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF -V 171 -d "Navigasi accordion, filter SUPERADMIN, status kartu, dropdown etoll"
```
(cek versi berikutnya dengan `clasp deployments`/`clasp versions`; ganti `171` sesuai versi baru.)

Expected: deployment id tetap sama; web URL tetap `https://script.google.com/macros/s/AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF/exec`.

- [ ] **Step 8: Konfirmasi final ke user**

Pastikan memberitahu: deployment id & URL sama, versi baru, dan list fitur yang live.

---
---

## Self-Review Checklist

1. **Spec coverage:**
   - §3.1 Navigasi Accordion (renamed "Laporan Operasional Kendaraan", auto-hide, bottom-nav drawer) → Task 1 + Task 2.
   - §3.2 Status kartu di List Flazz & Saldo → Task 3.
   - §3.3 Filter SUPERADMIN (List Flazz, Riwayat tabs, Daftar Jalur, Data Master) + race-fix `__flazzRequestId`/`__jalurRequestId`/`__masterRequestId` → Task 4-7.
   - §3.4 Dropdown etoll per cabang (Buat Jalur + Edit Modal, default kartu supir, placeholder "Pilih Kartu Etoll...") → Task 8.
   - §5 Interaksi: `toggleNavMenu` (Task 1), `loadFlazzDataWrapper`/`getFlazzDashboardData` (Task 5), `getMasterData` (Task 7), dropdown etoll pakai `masterData.flazzCards` + `jalur-filter-cabang` (Task 8), `renderFlazzListingTable` (Task 3).
   - §7 Pengujian → Task 9 Step 3 checklist 1-10.
2. **Placeholder scan:** semua langkah berisi kode konkret komplit; tidak ada TBD/TODO.
3. **Type consistency:** `jalurSetEtollDisplay(etollSel, etollId, driverName)` waktu task 8 konsisten di call-site (row & edit modal); `jalurSyncEtollRow`, `jalurPopulateEtollOptions` dipakai konsisten; `apiGetJalurByTanggal(tanggal, userInfo, opts)` konsisten antara Code.js, jalurShowListing, jalurEdit; `__flazzFilterCabang` dipakai konsisten di loadFlazzDataWrapper + onFlazz*Change + tab master flazz; `localDateKey(new Date(dv)).toString()` sesuai signature `localDateKey`. `closeBottomDrawer`, `toggleBottomDrawer`, `BOTTOM_NAV_DRAWERS` konsisten di Task 2.