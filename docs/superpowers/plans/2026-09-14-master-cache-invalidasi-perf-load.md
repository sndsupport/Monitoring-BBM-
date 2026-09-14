# Master Cache Invalidasi + Perf Load (Login Cepat, Lazy Html2canvas, Page Cache) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perbaiki dua kasus sekaligus saat aplikasi sedang dipakai:
- **Case A** — Data master baru (kendaraan/supir/BBM/cabang/pengguna) yang disimpan tidak langsung muncul di PIC/Superadmin; harus refresh/lama sampai TTL 120 dtk habis. Akar masalah: `invalidateMaster` hanya menghapus kunci `master:SUPERADMIN:` dan `bbm:<cabang>`, sedangkan pembacaan PIC memakai kunci `master:PIC CABANG:<cabang>` (dan `bbm:<rev>:<cabang>`) yang tidak pernah dihapus → cache basi sampai kadaluarsa.
- **Case B** — Buka aplikasi lambat/timeout sampai form login tidak tampil. Akar masalah: `doGet` membangun satu HTML ~565 KB (7 include) sebelum mengirim byte; `#page-login` `display:none` baru ditampilkan saat `DOMContentLoaded` di blok JS terakhir; Bootstrap CDN blocking di body; `Html2canvasLib` 195,7 KB selalu ikut dimuat meski hanya dipakai fitur screenshot Jalur.

**Architecture (Case A):** Versi global master di `CacheService` (`master:rev`, berisi UUID). Semua kunci master/BBM memuat versi saat ini: `master:<rev>:<role>:<cabang>` dan `bbm:<rev>:<cabang>`. `invalidateMaster()` cukup menaikkan versi global → SELURUH kunci master/bbm dari semua role/cabang otomatis orphan (tak terbaca, TTL 120 dtk akan membersihkannya) tanpa perlu mencacah kombinasi role/cabang. Semua `invalidateMaster('SUPERADMIN','')` di `Code.js` TIDAK berubah pemanggilannya.

**Architecture (Case B):** (B1) boot ringan di `Index.html` membaca `localStorage` sinkron dan menampilkan `#page-login` segera bila tidak ada sesi valid — tanpa menunggu puluhan ribu baris JS di bawah. (B2) hasil compose `doGet` dicache di `CacheService` key `page:<PAGE_VER>` TTL 6 jam; `PAGE_VER` di `Config.gs` wajib dinaikkan tiap ada perubahan UI. (B3) Bootstrap bundle dipindah ke `<head>` dengan `defer`. (B4) `Html2canvasLib` dihapus dari include; dimuat on-demand lewat route `?rsc=html2canvas` yang melayani JS mentah (strip tag `<script>`), dipanggil `jalurEnsureHtml2canvas()` saat tombol screenshot Jalur ditekan.

**Tech Stack:** Google Apps Script (V8), Google Sheets sebagai DB, Bootstrap 5 + Bootstrap Icons.

## Global Constraints

- File yang boleh berubah: `src/CacheUtil.js`, `src/Code.js`, `src/Config.gs`, `src/TestRunner.js`, `src/Index.html`, `src/JalurScript.html`, `README.md`. TIDAK ada perubahan schema sheet, kolom, atau fungsi simpan data (`insertBBM`, `insertVehicle`, `insertDriver`, `updateCabang`, dll tidak disentuh isinya).
- Kontrak `invalidateMaster(role, cabang)` & `invalidatePerforma(role, cabang)` TETAP dipertahankan (semua pemanggil di `Code.js` tidak berubah).
- `performaCacheKey` dan `dashwarnCacheKey` TIDAK ikut versioning (scope penyelesaian: master + bbm).
- Kunci cache lama (`master:1:...`) hasil rilis sebelumnya akan ter-bump ke versi UUID pertama kali `invalidateMaster` dipanggil; pembaca fallback `getMasterRev()` = `'1'` selama belum ada versi — usang hanya di-migrasi otomatis.
- `node --check <file>` = verifikasi sintaks. Test GAS penuh (`__runAllTests`) dijalankan dari editor Apps Script (TIDAK ada test framework lokal).
- Gaya kode: `var`/`const` sesuai file sekitarnya, single quote, komentar Bahasa Indonesia, string concat seperti eksisting.
- Aplikasi SEDANG DIPAKAI: pastikan tidak merusak alur login & simpan; deploy via `deploy.ps1` setelah verifikasi.

---

### Task 1: Case A — Versioned master/bbm cache key + invalidasi global

**Files:**
- Modify: `src/CacheUtil.js`
- Modify: `src/Code.js` — hanya `apiGetBBMForCabang` (line ~322)
- Modify: `src/TestRunner.js` — tambah `__runMasterCacheTests`

- [x] **Step 1: Baca `src/CacheUtil.js`** — konfirmasi isi saat ini (32 baris): `masterCacheKey`, `performaCacheKey`, `dashwarnCacheKey`, `invalidateMaster`, `invalidatePerforma`.

- [x] **Step 2: Tulis ulang `src/CacheUtil.js`** menjadi:

```javascript
// ==========================================
// CACHE UTIL — kunci & invalidasi
// Versi global master: setiap mutasi master menaikkan versi sehingga SEMUA
// kunci master/bbm (SUPERADMIN, PIC, per cabang) otomatis orphan/kedaluwarsa
// — tanpa perlu mencacah kombinasi role/cabang.
// ==========================================

var MASTER_REV_KEY = 'master:rev';
var MASTER_REV_TTL = 6 * 60 * 60; // jauh di atas TTL payload (120 dtk)

function getMasterRev() {
  var v = cacheGet(MASTER_REV_KEY);
  return v ? String(v) : '1';
}

function bumpMasterRev() {
  CacheService.getScriptCache().put(MASTER_REV_KEY, Utilities.getUuid(), MASTER_REV_TTL);
}

function masterCacheKey(role, cabang) {
  return 'master:' + getMasterRev() + ':' + (role || '') + ':' + (cabang || '');
}

function bbmCacheKey(cabang) {
  return 'bbm:' + getMasterRev() + ':' + (cabang || 'SUPERADMIN');
}

function performaCacheKey(role, cabang) {
  return 'perf:' + (role || '') + ':' + (cabang || '');
}

function dashwarnCacheKey(role, cabang) {
  return 'dashwarn:' + (role || '') + ':' + (cabang || '');
}

function invalidateMaster(role, cabang) {
  // Menaikkan versi global = seluruh kunci master/bbm lama tidak terbaca lagi.
  bumpMasterRev();
}

function invalidatePerforma(role, cabang) {
  var c = CacheService.getScriptCache();
  c.remove(performaCacheKey(role, cabang));
  c.remove(performaCacheKey('SUPERADMIN', ''));
}
```

Catatan: `getMasterData` di `Code.js` sudah memakai `masterCacheKey(user.role, user.cabang)` — otomatis ikut versi, tidak perlu diubah.

- [x] **Step 3: Ubah `src/Code.js` `apiGetBBMForCabang` (line ~322)**

Dari:
```javascript
  var ck = 'bbm:' + (user.cabang || 'SUPERADMIN');
```
Menjadi:
```javascript
  var ck = bbmCacheKey(user.cabang);
```

- [x] **Step 4: Tambah tes di `src/TestRunner.js`**

Tambahkan fungsi baru sebelum `__runAllTests`:

```javascript
function __runMasterCacheTests() {
  var results = [];
  var r1 = getMasterRev();
  var k1 = masterCacheKey('SUPERADMIN', '');
  var b1 = bbmCacheKey('CBG-JKT');
  invalidateMaster('SUPERADMIN', '');
  var r2 = getMasterRev();
  var k2 = masterCacheKey('SUPERADMIN', '');
  var b2 = bbmCacheKey('CBG-JKT');
  results.push(__expectTrue(r1 !== r2, 'invalidateMaster menaikkan versi master cache'));
  results.push(__expectTrue(k1 !== k2, 'kunci master berubah setelah invalidasi (cache lama orphan)'));
  results.push(__expectTrue(b1 !== b2, 'kunci bbm berubah setelah invalidasi'));
  results.push(__expectEqual(masterCacheKey('PIC CABANG', 'CBG-JKT').indexOf(r2) > -1, true, 'kunci PIC memakai versi terbaru'));
  invalidatePerforma('PIC CABANG', 'CBG-JKT');
  results.push(__expectEqual(performaCacheKey('PIC CABANG', 'CBG-JKT').indexOf('perf:') === 0, true, 'kunci performa tetap format lama (tidak versioning)'));
  return __summarize(results);
}
```

Dan panggil di `__runAllTests` (setelah `__runWarningsTests();`):
```javascript
  r = __runMasterCacheTests();
```

- [x] **Step 5: Verifikasi sintaks** `node --check src/CacheUtil.js`

---

### Task 2: Case B1 — Form login tampil cepat tanpa menunggu seluruh JS

**Files:**
- Modify: `src/Index.html`

- [x] **Step 1: Baca `src/Index.html` sekitar `#page-login`** (line ~38–81: div `#page-login` dengan `style='display:none'` di awal body).

- [x] **Step 2: Sisipkan boot ringan tepat SETELAH `</div>` penutup `#page-login`**

```html
    <!-- Boot ringan: tampilkan form login segera bila tidak ada sesi valid,
         tanpa menunggu puluhan ribu baris JS di bawah terunduh & tereksekusi. -->
    <script>
      (function () {
        function showLoginEarly() {
          var el = document.getElementById('page-login');
          if (el) el.style.display = 'flex';
        }
        try {
          if (!(localStorage.getItem('bbm_token') || '')) { showLoginEarly(); return; }
          var raw = localStorage.getItem('bbm_user') || '';
          if (!raw) { showLoginEarly(); return; }
          var o = JSON.parse(raw);
          if (!o || typeof o !== 'object') { showLoginEarly(); return; }
          if (o.__ts && (Date.now() - o.__ts > 12 * 60 * 60 * 1000)) showLoginEarly();
        } catch (e) { showLoginEarly(); }
      })();
    </script>
```

Catatan: bila ada sesi valid, boot TIDAK menampilkan apa pun → `js.html` tetap mengarahkan ke `loadInitialData` di `DOMContentLoaded` (tidak berubah).

- [x] **Step 3: Cek tidak ada elemen/script lain yang me-render `#page-login` sebagai block lebih awal** — aman karena ini satu-satunya.

---

### Task 3: Case B4 — Lazy-load Html2canvasLib (route + client ensure)

**Files:**
- Modify: `src/Index.html` — hapus include `Html2canvasLib`
- Modify: `src/Code.js` — route `?rsc=html2canvas` + `serveHtml2canvas()`
- Modify: `src/JalurScript.html` — `jalurEnsureHtml2canvas` + refactor `jalurTakeScreenshot`

- [x] **Step 1: Hapus line `<?!= include('Html2canvasLib'); ?>`** dari `src/Index.html` (sekitar line 1173, bersama `FlazzScript`, `JalurScript`, `js`).

- [x] **Step 2: Tambah route & helper di `src/Code.js`**

Ubah `doGet` menjadi:
```javascript
function doGet(e) {
  // Route library on-demand: `?rsc=html2canvas` memuat JS html2canvas saja.
  if (e && e.parameter && String(e.parameter.rsc || '').toLowerCase() === 'html2canvas') {
    return serveHtml2canvas();
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Laporan BBM & Operasional Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function serveHtml2canvas() {
  var raw = HtmlService.createHtmlOutputFromFile('Html2canvasLib').getContent();
  // File dibungkus <script>...</script> — strip pembungkus, kirim JS mentah.
  var body = raw.replace(/^[\s\S]*?<script[^>]*>/i, '').replace(/<\/script>[\s\S]*$/i, '');
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
```

- [x] **Step 3: Refactor `src/JalurScript.html` (line ~597–609)**

Ubah `jalurTakeScreenshot` menjadi dua fungsi:
```javascript
function jalurTakeScreenshot() {
  const shot = document.getElementById('jalur-shot');
  if (!shot || shot.style.display === 'none') { showToast('Tampilkan dulu jadwal pada tanggal yang dipilih', 'error'); return; }
  if (typeof html2canvas === 'undefined') {
    showToast('Memuat library screenshot...', 'info');
    jalurEnsureHtml2canvas(function() {
      if (typeof html2canvas === 'undefined') { showToast('Gagal memuat library screenshot', 'error'); return; }
      jalurTakeScreenshotNow(shot);
    });
    return;
  }
  jalurTakeScreenshotNow(shot);
}

function jalurEnsureHtml2canvas(callback) {
  if (typeof html2canvas !== 'undefined') { if (typeof callback === 'function') callback(); return; }
  var src = window.location.origin + window.location.pathname + '?rsc=html2canvas';
  var s = document.createElement('script');
  s.src = src;
  s.onload = function() { if (typeof callback === 'function') callback(); };
  s.onerror = function() { if (typeof callback === 'function') callback(); };
  document.head.appendChild(s);
}

function jalurTakeScreenshotNow(shot) {
  html2canvas(shot, { scale: 2, backgroundColor: '#ffffff' }).then(function(canvas) {
    const container = document.getElementById('jalur-shot-canvas');
    container.innerHTML = '';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    container.appendChild(canvas);
    new bootstrap.Modal(document.getElementById('modal-jalur-shot')).show();
  }).catch(function(e) { showToast('Gagal screenshot: ' + e, 'error'); });
}
```

- [x] **Step 4: Cek tidak ada pemakaian `html2canvas` lain di frontend** (grep `html2canvas` di `src` selain `Html2canvasLib.html` & `JalurScript.html` → tidak ada). Bootstrap tetap tersedia.

---

### Task 4: Case B2 — Cache hasil doGet + PAGE_VER

**Files:**
- Modify: `src/Config.gs` — tambah `PAGE_VER`
- Modify: `src/Code.js` — doGet memakai cache
- Modify: `README.md` — catatan wajib bump `PAGE_VER`

- [x] **Step 1: Tambah `PAGE_VER` di `src/Config.gs`**

```javascript
// Naikkan SELALU setiap ada perubahan file UI (Index/css/js/Flazz*/Jalur*/Settings)
// agar doGet tidak menyajikan halaman hasil cache lama.
var PAGE_VER = '20260914v1';
```

- [x] **Step 2: Ubah `doGet` di `src/Code.js`**

```javascript
function doGet(e) {
  if (e && e.parameter && String(e.parameter.rsc || '').toLowerCase() === 'html2canvas') {
    return serveHtml2canvas();
  }
  var cacheKey = 'page:' + PAGE_VER;
  var cached = cacheGet(cacheKey);
  if (cached) return buildPageOutput(cached);
  var html = HtmlService.createTemplateFromFile('Index').evaluate().getContent();
  cachePut(cacheKey, html, 6 * 60 * 60);
  return buildPageOutput(html);
}

function buildPageOutput(html) {
  return HtmlService.createHtmlOutput(html)
    .setTitle('Laporan BBM & Operasional Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

- [x] **Step 3: Verifikasi sintaks** `node --check src/Code.js`

- [x] **Step 4: Tambah catatan ke `README.md`** (bagian deploy):
> Setiap perubahan file UI (`Index.html`, `css.html`, `js.html`, `FlazzPages.html`, `FlazzScript.html`, `JalurPages.html`, `JalurScript.html`, `Settings.html`) WAJIB menaikkan `PAGE_VER` di `src/Config.gs`; jika tidak, doGet menyajikan halaman cache lama hingga TTL 6 jam.

---

### Task 5: Case B3 — Bootstrap bundle defer di <head>

**Files:**
- Modify: `src/Index.html`

- [x] **Step 1: Hapus line di body** `<script src='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js'></script>` (sekitar line 1172, tepat sebelum include `Html2canvasLib`/`FlazzScript`/`JalurScript`/`js`).

- [x] **Step 2: Tambahkan di `<head>`** (setelah `<link>` bootstrap icons):

```html
<script defer src='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js'></script>
```

- [x] **Step 3: Audit pemakaian `bootstrap.`** — grep `bootstrap.Modal` / `bootstrap.` di `src/*.html`: semua di dalam function yang dipanggil saat event (klik/success handler), bukan saat parse → `defer` aman (eksekusi sebelum `DOMContentLoaded`, inline script hanya mendefinisikan function).

---

### Task 6: Verifikasi final

- [x] `node --check src/CacheUtil.js`, `node --check src/Code.js`, `node --check src/TestRunner.js`
- [x] Ekstrak blok `<script>` `src/JalurScript.html` & `src/Index.html` (termasuk boot inline) ke file temp, lalu `node --check` masing-masing.
- [x] `git diff` review — pastikan hanya file yang diizinkan berubah.
- [ ] Di editor Apps Script: jalankan `__runAllTests` → seluruh PASS (17 tes lama + 5 tes baru `__runMasterCacheTests`).
- [ ] Manual smoke (lokal / deploy cadangan): simpan master baru → data langsung muncul untuk SUPERADMIN & PIC tanpa refresh manual.
- [ ] Manual smoke: buka aplikasi tanpa sesi → form login tampil cepat; login sesi ada → dashboard; screenshot Jalur → library termuat saat tombol ditekan.
- [x] Deploy via `deploy.ps1` (aplikasi sedang dipakai — konfirmasi ke user).