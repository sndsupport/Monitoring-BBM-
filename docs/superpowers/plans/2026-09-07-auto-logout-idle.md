# Auto Logout 5 Menit Idle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logout otomatis dari aplikasi bila pengguna tidak beraktivitas selama 5 menit, dengan peringatan countdown 60 detik.

**Architecture:** Frontend-only. Timer idle + countdown di `src/js.html`; elemen modal Bootstrap di `src/Index.html`. Backend tidak diubah.

**Tech Stack:** Google Apps Script (V8), HTML, JS, Bootstrap 5.3 (sudah ada via CDN di Index.html).

## Global Constraints

- Jangan ubah `SESSION_MAX_AGE_MS` (tetap 12 jam) dan jangan ubah kebijakan sesi lain.
- `IDLE_TIMEOUT_MS = 5 * 60 * 1000` (5 menit); `IDLE_COUNTDOWN_MS = 60 * 1000` (60 detik).
- Semua kode JavaScript mengikuti konvensi file yang sudah ada: function declaration global, `var`/`let`, tanpa comment tambahan kecuali diperlukan.
- Verifikasi manual (browser), bukan test otomatis; `node --check` untuk validasi sintaks.
- Persiapan class: repo sudah berisi feature hard delete jalur (commit `63212db`) — tidak diubah lagi di plan ini.

---

### Task 1: Tambahkan Modal Peringatan Idle di `src/Index.html`

**Files:**
- Modify: `src/Index.html` (sisipkan modal sebelum `<div id='toast-container'...` di akhir body, baris ~1170)

**Interfaces:**
- Produces: elemen modal `#modal-idle-warning` dengan tombol `btn-idle-extend` (onclick `idleExtendSession()`) dan span `#idle-countdown-text`. Dipakai oleh Task 2.

- [ ] **Step 1: Sisipkan HTML modal**

Tambahkan blok berikut tepat SEBELUM baris `<div id='toast-container' class='toast-container' aria-live='polite' aria-atomic='true'></div>` (baris 1170) di `src/Index.html`:

```html
    <!-- Modal Peringatan Auto Logout -->
    <div class="modal fade" id="modal-idle-warning" tabindex="-1" data-bs-backdrop="static">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-4 shadow">
          <div class="modal-header bg-warning text-dark">
            <h5 class="modal-title fw-bold"><i class="bi bi-clock-history me-2"></i>Peringatan Sesi</h5>
          </div>
          <div class="modal-body p-4 text-center">
            <p class="mb-0">Aplikasi tidak digunakan selama 5 menit.<br>Anda akan logout otomatis dalam <strong id="idle-countdown-text">60</strong> detik.</p>
          </div>
          <div class="modal-footer justify-content-center">
            <button type="button" class="btn btn-primary" id="btn-idle-extend" onclick="idleExtendSession()">
              <i class="bi bi-arrow-counterclockwise me-1"></i> Lanjutkan Sesi
            </button>
          </div>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Verifikasi struktur**

Buka `src/Index.html` — pastikan modal berada di dalam `<body>`, sebelum `toast-container`, dan atribut `data-bs-backdrop="static"` ada (modal tidak tertutup saat klik backdrop).

- [ ] **Step 3: Commit**

```bash
git add src/Index.html
git commit -m "feat(session): tambah modal peringatan auto logout"
```

---

### Task 2: Logika Idle Timer + Countdown di `src/js.html`

**Files:**
- Modify: `src/js.html`
  - Konstanta + variabel + fungsi idle: sisipkan setelah blok `handleLogin` (berakhir baris ~85), sebelum `function logout()` (baris 87).
  - Panggil `cancelIdleTimers()` di awal `logout()`.
  - Panggil `resetIdleTimer()` di akhir handler `withSuccessHandler` pada `loadInitialData` (baris ~280, setelah blok `filter-cabang`).
  - Register event listener idle di dalam `document.addEventListener('DOMContentLoaded', ...)` yang sudah ada (baris 27-41), hanya ketika `storedUser` tersedia.

**Interfaces:**
- Consumes: `#modal-idle-warning`, `#idle-countdown-text`, `#btn-idle-extend` dari Task 1; fungsi `logout()` yang sudah ada.
- Produces: fungsi global `resetIdleTimer()`, `cancelIdleTimers()`, `showIdleWarning()`, `idleExtendSession()`.

- [ ] **Step 1: Tambah konstanta, variabel, dan fungsi idle**

Sisipkan kode berikut setelah blok `handleLogin` (setelah baris `}` penutup `handleLogin`, sebelum komentar... logika kosong sebelum `function logout()`):

```js
  var IDLE_TIMEOUT_MS = 5 * 60 * 1000;
  var IDLE_COUNTDOWN_MS = 60 * 1000;
  var idleTimeoutId = null;
  var idleCountdownId = null;
  var idleCountdownLeft = 0;
  var idleLastReset = 0;
  var idleListenersAttached = false;

  function attachIdleListeners() {
    if (idleListenersAttached) return;
    idleListenersAttached = true;
    var events = ['click', 'keydown', 'keyup', 'touchstart', 'scroll', 'focus'];
    events.forEach(function(ev) { document.addEventListener(ev, resetIdleTimer, true); });
    window.addEventListener('focus', resetIdleTimer);
  }

  function cancelIdleTimers() {
    if (idleTimeoutId) { clearTimeout(idleTimeoutId); idleTimeoutId = null; }
    if (idleCountdownId) { clearInterval(idleCountdownId); idleCountdownId = null; }
    idleCountdownLeft = 0;
    var modalEl = document.getElementById('modal-idle-warning');
    if (modalEl) {
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }
  }

  function resetIdleTimer() {
    if (!userInfo) return;
    // Debounce: abaikan event beruntun (misal mousemove) dalam 1 detik
    var now = Date.now();
    if (now - idleLastReset < 1000) return;
    idleLastReset = now;
    cancelIdleTimers();
    idleTimeoutId = setTimeout(showIdleWarning, IDLE_TIMEOUT_MS);
  }

  function showIdleWarning() {
    if (idleCountdownId) return;
    var modalEl = document.getElementById('modal-idle-warning');
    if (!modalEl) return;
    idleCountdownLeft = Math.round(IDLE_COUNTDOWN_MS / 1000);
    var txt = document.getElementById('idle-countdown-text');
    if (txt) txt.textContent = idleCountdownLeft;
    new bootstrap.Modal(modalEl, { backdrop: 'static' }).show();
    idleCountdownId = setInterval(function() {
      idleCountdownLeft = idleCountdownLeft - 1;
      if (txt) txt.textContent = idleCountdownLeft;
      if (idleCountdownLeft <= 0) {
        cancelIdleTimers();
        logout();
      }
    }, 1000);
  }

  function idleExtendSession() {
    resetIdleTimer();
  }
```

- [ ] **Step 2: Clear timer di awal `logout()`**

Dalam `function logout()` (baris 87), tambahkan `cancelIdleTimers();` sebagai pernyataan pertama, tepat setelah baris `localStorage.removeItem('bbm_user');`:

```js
  function logout() {
    localStorage.removeItem('bbm_user');
    cancelIdleTimers();
    document.getElementById('user-info').innerHTML = '';
```

- [ ] **Step 3: Registrasi listener saat login**

Dalam `document.addEventListener('DOMContentLoaded', ...)` (baris 27-41), dalam cabang `if (storedUser)` tambahkan `attachIdleListeners();` sebelum `loadInitialData(userInfo);`:

```js
    let storedUser = loadSessionUser();
    if (storedUser) {
       userInfo = storedUser;
       attachIdleListeners();
       loadInitialData(userInfo);
    } else {
```

- [ ] **Step 4: Mulai timer setelah data dimuat**

Dalam `loadInitialData`, pada akhir callback `.withSuccessHandler(...)` (setelah blok `if (filterCabang && data.cabangList) {...}` yang berakhir ~baris 279, sebelum penutup callback), tambahkan `resetIdleTimer();`:

```js
        if (filterCabang && data.cabangList) {
          filterCabang.innerHTML = '<option value="">Semua Warehouse</option>';
          data.cabangList.forEach(c => {
            // ... konten asli tetap ...
          });
        }

        resetIdleTimer();
```

- [ ] **Step 5: Validasi sintaks**

Run: `node --check js.html` — **tidak valid** karena `js.html` adalah HTML. Gunakan ekstraksi: pastikan blok kode Task 2 diekstrak ke file temp `.js` lalu `node --check`, atau tempel blok JS ke konsol browser. Cara cepat (temp):

```bash
node -e "const s=require('fs').readFileSync('src/js.html','utf8');const m=s.match(/<script>([\s\S]*)<\/script>/);require('fs').writeFileSync('C:/Users/lingg/AppData/Local/Temp/opencode/idle-check.js',m[1]);"
node --check C:/Users/lingg/AppData/Local/Temp/opencode/idle-check.js
```

Expected: tidak ada error (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/js.html
git commit -m "feat(session): auto logout 5 menit idle dengan countdown 60 detik"
```

---

### Task 3: Deploy + Verifikasi Manual

**Files:**
- No code changes. Hanya `clasp push`, `clasp deploy`, dan pengujian browser.

**Interfaces:**
- Consumes: output Task 1 (modal HTML) + Task 2 (logika idle) yang sudah ke Apps Script.

- [ ] **Step 1: Push ke Apps Script**

```bash
clasp push -f
```

Expected: 18 file ter-sync, tanpa error. (Jika diminta login, gunakan akun yang memegang script `1PqcQpoii2I5f_XAJ4wJBF7ljf46GO7R8YuXYcWHl7cxZ8jeKE6i0LOlJ`.)

- [ ] **Step 2: Deploy ke deployment yang sama (edit existing deployment)**

```bash
clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF -d "Auto logout 5 menit idle"
```

Expected: pesan sukses deploy ke deployment yang sama. Catat versi deployment baru.

- [ ] **Step 3: Verifikasi manual (browser)**

Buka URL web app `https://script.google.com/macros/s/AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF/exec` dan lakukan urutan berikut:

1. Login dengan akun valid.
2. Tunggu 5 menit tanpa aktivitas → modal "Peringatan Sesi" muncul, angka countdown menurun tiap detik dari 60.
3. Klik **Lanjutkan Sesi** → modal tertutup, sesi tetap aktif, timer reset (ulangi lagi 5 menit).
4. Biarkan countdown berjalan habis → aplikasi otomatis kembali ke halaman login, `localStorage.bbm_user` hilang, dan tombol login kembali normal ("Masuk").
5. Pada sesi login, lakukan aktivitas normal (klik/scroll/ketik) → modal tidak muncul saat aktivitas rutin.
6. Di halaman login, tunggu >5 menit → tidak ada modal, tidak ada error konsol, field login kosong.

(Jika menunggu 5 menit terasa lama saat tes, uji sementara dengan menurunkan `IDLE_TIMEOUT_MS` di `src/js.html` menjadi misal `15 * 1000`, push, uji, lalu kembalikan ke `5 * 60 * 1000`.)

- [ ] **Step 4: Push & commit hasil final (bila Step 3 memakai timeout sementara)**

Bila timeout diubah untuk tes, kembalikan ke `5 * 60 * 1000`, `clasp push -f`, lalu update commit terakhir atau buat commit baru.

```bash
git add src/js.html
git commit -m "chore(session): kembalikan idle timeout ke 5 menit"
clasp push -f
```

- [ ] **Step 5: Validasi akhir + commit plan**

Pastikan `git status` bersih dari perubahan yang tidak diinginkan (scratch tetap untracked: `apply_jalur.py`, `deploy.ps1`, `scratch_head_spreadsheetops.js`, `temp.js`, plan docs 2026-09-01/2026-09-06). Jangan commit file scratch.

---

## Self-Review

**Spec coverage:**
- Timer 5 menit → Task 2 (`resetIdleTimer` + `attachIdleListeners`). ✓
- Modal warning countdown 60 detik → Task 1 (HTML) + Task 2 (`showIdleWarning`). ✓
- Aktivitas membatalkan → debounce 1 detik + `cancelIdleTimers` di `resetIdleTimer`. ✓
- Tombol lanjutkan → `idleExtendSession` → `resetIdleTimer`. ✓
- Countdown habis → logout → `cancelIdleTimers` di awal `logout`. ✓
- Timer hanya saat login → guard `if (!userInfo) return;` + `attachIdleListeners` hanya di cabang `storedUser`. ✓
- CSS inline / reuse Bootstrap, tanpa file baru → Task 1. ✓
- Error handling → `logout()` idempoten, `cancelIdleTimers()` membatalkan interval. ✓
- Test plan → Task 3. ✓

**Placeholder scan:** Tidak ada TBD/TODO; tiap step berisi kode/kondisi konkret dengan path & baris.

**Type consistency:** Nama fungsi (`resetIdleTimer`, `cancelIdleTimers`, `showIdleWarning`, `idleExtendSession`), konstanta (`IDLE_TIMEOUT_MS`, `IDLE_COUNTDOWN_MS`), dan ID elemen (`modal-idle-warning`, `idle-countdown-text`, `btn-idle-extend`) konsisten di Task 1 dan Task 2.