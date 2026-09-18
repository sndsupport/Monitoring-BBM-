# Fase P0 — Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menutup semua celah keamanan kritis agar aplikasi aman diakses siapa pun dan siap dipakai banyak cabang: sesi server-side token, password ter-hash, tutup endpoint tanpa auth & privileges escalation, kunci konkurensi, dan rate limiting.

**Architecture:** Identitas tidak lagi dipercaya dari client. `doLogin` membuat token opaque yang disimpan di `CacheService` (TTL 12 jam) dan setiap entry point server memanggil `requireUser(token)` untuk mendapatkan objek user dari server. Password disimpan sebagai `salt$sha256`. Semua read-modify-write dibungkus `LockService`. Rate limiting memakai counter di `CacheService`. Signature fungsi `google.script.run` dipertahankan (nama sama), hanya argumen yang berubah: objek `userInfo`/`uInfo`/`flazzUserInfo()` diganti `bbmToken()`.

**Tech Stack:** Google Apps Script V8 (berjalan apa adanya), `CacheService`, `LockService`, `Utilities.computeDigest`, SpreadsheetApp/DriveApp yang sudah ada. Tidak ada dependency baru.

## Global Constraints

- **JANGAN** deriversi role/cabang dari input client. Satu-satunya sumber identitas adalah hasil `requireUser(token)`.
- Semua fungsi `google.script.run.*` mempertahankan **nama fungsi yang sama**; parameter berubah menjadi: data utama lalu `token` sebagai parameter **terakhir**.
- Password disimpan sebagai `salt$hex` (SHA-256, garam `Utilities.getUuid().replace(/-/g,'').substring(0,16)`). Nilai lama tanpa `$` dianggap legacy.
- `withLock` hanya dipasang di entry point publik dari alur read-modify-write; **dilarang nested** `withLock` di dalam alur yang sudah terkunci.
- Rate limit: `doLogin` maksimal 5 percobaan gagal / 5 menit per username; panggilan Gemini maksimal 30 / 24 jam per user.
- Client menyimpan token di `localStorage['bbm_token']`; objek user tampilan tetap di `localStorage['bbm_user']`.
- `migrateLegacyPasswords()` adalah one-shot manual — tidak dipanggil otomatis dari alur login.
- Semua tes dijalankan dari editor Apps Script atau `clasp run`; jangan menjalankan tes yang mengubah production spreadsheet. Tes murni memakai `CacheService`/`LockService` tanpa sentuh sheet.
- Commit memakai gaya repo (lowercase, prefix `feat:`/`fix:`/`refactor:`), bahasa Indonesia.

---

### Task 1: TestRunner + SessionAuth (fondasi semua task berikut)

**Files:**
- Create: `src/SessionAuth.js`
- Create: `src/TestRunner.js`

**Interfaces:**
- **Produces** (dipakai Task 2–10):
  - `hashPassword(password)` → `'salt$hex'` string
  - `verifyPassword(plain, stored)` → `boolean`
  - `hashLooksLegacy(stored)` → `boolean` (true bila tidak mengandung `$`)
  - `createSession(user)` → token string (opaque)
  - `resolveSession(token)` → `{user_id, username, nama, role, cabang}` atau `null`
  - `requireUser(token)` → sama dengan `resolveSession`, **melempar** `Error('Akses ditolak: sesi tidak valid. Silakan login kembali.')` bila null
  - `destroySession(token)` → `void`
  - `__runAuthTests()` → `{passed, failed}`; `__runAllTests()` → agragat `{passed, failed}`

Objek user yang dihasilkan memakai **bentuk identik dengan output `authenticateUser`** (`SpreadsheetOps.js:16-22`) sehingga fungsi Ops yang menerima `userInfo` tidak berubah.

- [ ] **Step 1: Tulis test gagal**

Buat `src/TestRunner.js`:

```javascript
// ==========================================
// LIGHTWEIGHT TEST RUNNER (jalankan dari editor atau `clasp run`)
// ==========================================

function __expectEqual(actual, expected, label) {
  var a = JSON.stringify(actual);
  var b = JSON.stringify(expected);
  var ok = a === b;
  Logger.log((ok ? 'PASS' : 'FAIL') + ': ' + label + (ok ? '' : ' | actual=' + a + ' expected=' + b));
  return ok ? 1 : 0;
}

function __expectTrue(cond, label) {
  Logger.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  return cond ? 1 : 0;
}

function __summarize(tests) {
  var passed = tests.filter(function(x) { return x; }).length;
  var failed = tests.length - passed;
  Logger.log('==== TESTS: ' + passed + ' passed, ' + failed + ' failed ====');
  return { passed: passed, failed: failed };
}

function __runAuthTests() {
  var t = hashPassword('rahasia123');
  var s = createSession({
    user_id: 'U-TEST',
    username: 'tester',
    nama: 'Tester',
    role: 'SUPERADMIN',
    cabang: 'CBG-JKT'
  });
  return __summarize([
    __expectTrue(hashLooksLegacy('admin123'), 'legacy: nilai plaintext terdeteksi legacy'),
    __expectTrue(!hashLooksLegacy(t), 'hash baru tidak legacy'),
    __expectTrue(verifyPassword('rahasia123', t), 'verify password benar'),
    __expectTrue(!verifyPassword('salah', t), 'verify password salah -> false'),
    __expectTrue(verifyPassword('rahasia123', hashPassword('rahasia123')), 'hash lain dengan password sama tetap valid'),
    __expectEqual(resolveSession(s) === null, false, 'resolveSession token valid mengembalikan non-null'),
    __expectEqual(resolveSession(s).username, 'tester', 'resolveSession username cocok'),
    __expectEqual(resolveSession(s).role, 'SUPERADMIN', 'resolveSession role cocok'),
    __expectEqual(resolveSession('token-palsu-xyz'), null, 'token palsu -> null'),
    __expectEqual(resolveSession(''), null, 'token kosong -> null'),
    (function() {
      try { requireUser('token-palsu-xyz'); return __expectTrue(false, 'requireUser melempar untuk token palsu'); }
      catch (e) { return __expectTrue(e.message.indexOf('sesi tidak valid') > -1, 'requireUser melempar Error sesi tidak valid'); }
    })(),
    (function() {
      destroySession(s);
      return __expectEqual(resolveSession(s), null, 'destroySession membuat session hilang');
    })()
  ]);
}

function __runAllTests() {
  var r = __runAuthTests();
  Logger.log('==== ALL TESTS DONE ====');
  return r;
}
```

- [ ] **Step 2: Verifikasi gagal**

Run: `clasp push` lalu `clasp run __runAllTests`
Expected: `{passed: 0, failed: N}` — karena `hashPassword` dkk. belum ada (error referensi).

- [ ] **Step 3: Implementasi `SessionAuth.js`**

Buat `src/SessionAuth.js`:

```javascript
// ==========================================
// SESSION AUTH & PASSWORD HASHING
// Identitas berasal DARI SERVER via token opaque di CacheService.
// JANGAN pernah menurunkan role/cabang dari input client.
// ==========================================

var SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 jam, sejalan SESSION_MAX_AGE_MS di js.html

function _utf8Bytes(str) {
  return Utilities.newBlob(String(str), 'text/plain').getBytes();
}

function _sha256Hex(str) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, _utf8Bytes(str));
  return digest.map(function(b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function hashPassword(password) {
  var salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  return salt + '$' + _sha256Hex(salt + ':' + String(password));
}

function verifyPassword(plain, stored) {
  if (!stored || stored.indexOf('$') === -1) return false;
  var parts = stored.split('$');
  if (parts.length !== 2) return false;
  return _sha256Hex(parts[0] + ':' + String(plain)) === parts[1];
}

function hashLooksLegacy(stored) {
  return !stored || String(stored).indexOf('$') === -1;
}

function createSession(user) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var session = {
    user_id: user.user_id,
    username: user.username,
    nama: user.nama || user.username,
    role: user.role,
    cabang: user.cabang || '',
    exp: Date.now() + SESSION_TTL_SECONDS * 1000
  };
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(session), SESSION_TTL_SECONDS);
  return token;
}

function resolveSession(token) {
  if (!token) return null;
  var json = CacheService.getScriptCache().get('session:' + token);
  if (!json) return null;
  var s = JSON.parse(json);
  if (Date.now() > s.exp) { CacheService.getScriptCache().remove('session:' + token); return null; }
  return s;
}

function requireUser(token) {
  var u = resolveSession(token);
  if (!u) throw new Error('Akses ditolak: sesi tidak valid. Silakan login kembali.');
  return u;
}

function destroySession(token) {
  if (token) CacheService.getScriptCache().remove('session:' + token);
}
```

- [ ] **Step 4: Verifikasi lulus + commit**

Run: `clasp push` lalu `clasp run __runAllTests`
Expected: `{passed: 12, failed: 0}`

```bash
git add src/SessionAuth.js src/TestRunner.js
git commit -m "feat: sesi server-side token + hashing password (SessionAuth + TestRunner)"
```

---

### Task 2: Migrasi penyimpanan password + perbaikan `updateUser`

**Files:**
- Modify: `src/SpreadsheetOps.js:6-26` (`authenticateUser`)
- Modify: `src/SpreadsheetOps.js:1120-1139` (`insertUser`)
- Modify: `src/SpreadsheetOps.js:1141-1177` (`updateUser`)
- Modify: `src/DatabaseSetup.js:88-130` (`seedDummyData`)

**Interfaces:**
- **Consumes:** `hashPassword`, `verifyPassword`, `hashLooksLegacy` dari SessionAuth.js
- **Produces:** `migrateLegacyPasswords()` → `{converted}` (one-shot manual); password baru tersimpan `salt$hex`; `updateUser` kini melempar untuk non-SUPERADMIN.

- [ ] **Step 1: Hash di `authenticateUser`**

Ganti body `src/SpreadsheetOps.js:6-26` menjadi:

```javascript
function authenticateUser(username, password) {
  const ss = getDB();
  if (!ss) return { success: false, msg: 'DB Error' };
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) return { success: false, msg: 'Sheet Pengguna Error' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase() === String(username).toLowerCase() && data[i][6] === 'Aktif') {
      const stored = String(data[i][2] || '');
      if (hashLooksLegacy(stored)) {
        if (stored === String(password)) {
          // Legacy plaintext: hash & simpan ulang, lalu beri tahu user untuk ganti password
          sheet.getRange(i + 1, 3).setValue(hashPassword(password));
          return {
            success: true,
            must_change: true,
            user_id: data[i][0],
            username: data[i][1],
            nama: data[i][3],
            role: data[i][4],
            cabang: data[i][5]
          };
        }
        continue;
      }
      if (verifyPassword(password, stored)) {
        return {
          success: true,
          user_id: data[i][0],
          username: data[i][1],
          nama: data[i][3],
          role: data[i][4],
          cabang: data[i][5]
        };
      }
    }
  }
  return { success: false, msg: 'Username atau Password salah!' };
}
```

*(Login user dibuat case-insensitive terhadap username — mengikuti `getUserByUsername` yang sudah ada.)*

- [ ] **Step 2: Hash di `insertUser` dan `updateUser`, tambah guard SUPERADMIN di `updateUser`**

Pada `insertUser` (`SpreadsheetOps.js:1120-1139`), ganti baris `sheet.appendRow([id, uname, password, nama, role, cabang, 'Aktif']);` dengan:

```javascript
  sheet.appendRow([id, uname, hashPassword(password), nama, role, cabang, 'Aktif']);
```

Ganti body `updateUser` (`SpreadsheetOps.js:1141-1177`) seluruhnya menjadi:

```javascript
function updateUser(data, userInfo) {
  assertSuperadminOnly(userInfo, 'mengelola akun pengguna');
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const userId = String(data.user_id || '');
  const uname = String(data.username || '').trim();
  const nama = String(data.nama || '').trim();
  const role = data.role || '';
  const cabang = (data.cabang || '').trim();

  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === userId) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) throw new Error('Pengguna tidak ditemukan');

  if (!uname) throw new Error('Username wajib diisi');
  if (!nama) throw new Error('Nama wajib diisi');
  if (role !== 'SUPERADMIN' && role !== 'PIC CABANG') throw new Error('Role tidak valid');
  if (role === 'PIC CABANG' && !cabang) throw new Error('Warehouse wajib diisi untuk PIC CABANG');

  const existing = getUserByUsername(sheet, uname);
  if (existing && String(existing.row[0]) !== userId) throw new Error('Username sudah terpakai');

  const currentRow = values[rowIndex - 1];
  if (String(userInfo.username) === String(currentRow[1]) &&
      currentRow[4] === 'SUPERADMIN' && role !== 'SUPERADMIN' &&
      countActiveSuperadmin(sheet) <= 1) {
    throw new Error('Tidak bisa menghapus peran SUPERADMIN terakhir');
  }

  const password = String(data.password || '');
  const newPassword = password ? hashPassword(password) : String(currentRow[2]);
  sheet.getRange(rowIndex, 2, 1, 5).setValues([[uname, newPassword, nama, role, cabang]]);
  return { msg: 'Pengguna Berhasil Diupdate' };
}
```

- [ ] **Step 3: Skrip migrasi one-shot + bersihkan seed plaintext**

Tambahkan fungsi terminal di akhir `src/SpreadsheetOps.js`:

```javascript
function migrateLegacyPasswords() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const data = sheet.getDataRange().getValues();
  let converted = 0;
  for (let i = 1; i < data.length; i++) {
    const stored = String(data[i][2] || '');
    if (hashLooksLegacy(stored) && stored !== '') {
      sheet.getRange(i + 1, 3).setValue(hashPassword(stored));
      converted++;
      Logger.log('Migrasi baris ' + (i + 1) + ' (' + data[i][1] + ')');
    }
  }
  Logger.log('Passwords legacy ter-migrasi: ' + converted);
  return { converted: converted };
}
```

Pada `src/DatabaseSetup.js`, `seedDummyData()` — ganti blok `// Seed Pengguna` (`:121-127`) menjadi kredensial ter-hash dan **hapus akun SUPERADMIN `admin` dari seed** (SUPERADMIN dibuat lewat `createSuperadmin()`):

```javascript
  // Seed Pengguna: PIC per cabang (SUPERADMIN dibuat manual via createSuperadmin())
  let sheetPengguna = ss.getSheetByName('Pengguna');
  if (sheetPengguna && sheetPengguna.getLastRow() === 1) {
    sheetPengguna.appendRow(['U-002', 'picjkt', hashPassword('pic123'), 'PIC Jakarta', 'PIC CABANG', 'CBG-JKT', 'Aktif']);
    sheetPengguna.appendRow(['U-003', 'picbdg', hashPassword('pic123'), 'PIC Bandung', 'PIC CABANG', 'CBG-BDG', 'Aktif']);
  }
```

Tambahkan fungsi terminal di `src/DatabaseSetup.js`:

```javascript
function createSuperadmin() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Buat Superadmin', 'Username SUPERADMIN (mis. snd):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return { success: false, msg: 'Dibatalkan' };
  const username = String(resp.getResponseText() || '').trim();
  const pwResp = ui.prompt('Buat Superadmin', 'Password untuk "' + username + '" (min 8 karakter):', ui.ButtonSet.OK_CANCEL);
  if (pwResp.getSelectedButton() !== ui.Button.OK) return { success: false, msg: 'Dibatalkan' };
  const password = String(pwResp.getResponseText() || '');
  if (!username || password.length < 8) {
    Logger.log('Username kosong atau password < 8 karakter. Ulangi createSuperadmin().');
    return { success: false, msg: 'Username kosong atau password < 8 karakter' };
  }
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const id = 'U-' + new Date().getTime();
  sheet.appendRow([id, username, hashPassword(password), 'Superadmin', 'SUPERADMIN', '', 'Aktif']);
  Logger.log('SUPERADMIN "' + username + '" berhasil dibuat.');
  return { success: true, msg: 'SUPERADMIN dibuat' };
}
```

- [ ] **Step 4: Verifikasi**

Run: `clasp push`, lalu `clasp run __runAllTests`, lalu di editor:
1. Jalankan `createSuperadmin()` → buat satu SUPERADMIN (mis. `snd`/`snd123456`).
2. Jalankan `migrateLegacyPasswords()` bila data production masih plaintext.
3. Login pakai SUPERADMIN → `updateUser` pada akun PIC → harusnya data ter-hash (`$` muncul di sheet), dan memicu `Akses ditolak` bila dipanggil non-SUPERADMIN.

Expected: seluruhnya berhasil; kolom `password` untuk entri baru berisi `salt$hex`.

- [ ] **Step 5: Commit**

```bash
git add src/SpreadsheetOps.js src/DatabaseSetup.js
git commit -m "fix: hash password pengguna + tambah guard SUPERADMIN di updateUser + migrasi legacy"
```

> **Kebijakan lupa password (keputusan user):** karena password tersimpan ter-hash, **tidak ada siapa pun (termasuk SUPERADMIN) yang bisa membaca/mengembalikan password lama**. Satu-satunya jalur recovery adalah **reset oleh SUPERADMIN**:
> 1. SUPERADMIN buka **Data Master → Pengguna → Edit** akun yang lupa password → isi **Password** dengan password sementara baru (atau biarkan kosong jika tidak diubah).
> 2. `updateUser` (Task 2 Step 2) menyimpan password baru dalam bentuk hash — tanpa berubah perilaku admin.
> 3. SUPERADMIN mengirimkan password sementara tersebut ke user lewat saluran luar aplikasi (WA/chat).
>
> Tidak ada alur "lupa password" mandiri (klik link → reset via email) karena sheet `Pengguna` belum punya kolom `email` dan belum ada infrastruktur email (baru tersedia di P2 untuk HealthOps). Bila nanti dibutuhkan, dijadwalkan sebagai fitur lanjutan terpisah (kolom `email` + token reset + `MailApp`), bukan bagian P0/P1/P2. User yang ter-reset otomatis mendapat pengingat `must_change` saat login berikutnya (toast "Segera ganti password Anda") memakai mekanisme yang sama dengan migrasi legacy di Task 2 Step 1.

---

### Task 3: Helper konkurensi `withLock`

**Files:**
- Create: `src/Locks.js`

**Interfaces:**
- **Produces:** `withLock(label, fn)` → hasil `fn()`; melempar bila tidak mendapat lock dalam 30 detik.

- [ ] **Step 1: Buat `src/Locks.js`**

```javascript
// ==========================================
// LOCK SERVICE HELPER (konkurensi antar user GAS)
// ==========================================

function withLock(label, fn) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    lock.waitLock(30000);
    acquired = true;
    return fn();
  } catch (e) {
    throw new Error('Antrean operasi "' + label + '" penuh (>30 detik). Coba lagi.');
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (e) { /* abaikan */ }
    }
  }
}
```

- [ ] **Step 2: Verifikasi + commit**

Run: `clasp push`, lalu jalankan di editor `function __t(){ return withLock('t', function(){ return 42; }); }` → Expected `42`.

```bash
git add src/Locks.js
git commit -m "feat: helper LockService denganLock untuk operasi read-modify-write"
```

---

### Task 4: Helper rate limiting

**Files:**
- Create: `src/RateLimit.js`

**Interfaces:**
- **Produces:** `checkRate(key, max, windowMs)` → `{allowed: boolean, retryAfterSec: number}`; `resetRate(key)` → `void`.

- [ ] **Step 1: Buat `src/RateLimit.js`**

```javascript
// ==========================================
// RATE LIMITING via CacheService (per key)
// ==========================================

var RATE_PREFIX = 'rm:';

function checkRate(key, max, windowMs) {
  var cache = CacheService.getScriptCache();
  var full = RATE_PREFIX + key;
  var now = Date.now();
  var raw = cache.get(full);
  var rec = raw ? JSON.parse(raw) : { count: 0, resetAt: now + windowMs };
  if (now > rec.resetAt) rec = { count: 0, resetAt: now + windowMs };
  var remaining = Math.max(0, Math.ceil((rec.resetAt - now) / 1000));
  if (rec.count >= max) {
    return { allowed: false, retryAfterSec: remaining };
  }
  rec.count += 1;
  cache.put(full, JSON.stringify(rec), Math.ceil(windowMs / 1000) + 10);
  return { allowed: true, retryAfterSec: remaining };
}

function resetRate(key) {
  CacheService.getScriptCache().remove(RATE_PREFIX + key);
}
```

- [ ] **Step 2: Verifikasi**

Run: `clasp push`, lalu panggil berulang di editor: `checkRate('test:x', 2, 60000)` → 2× `{allowed: true}`, ke-3 `{allowed: false}`. Lalu `resetRate('test:x')` → dibuka lagi.

- [ ] **Step 3: Commit**

```bash
git add src/RateLimit.js
git commit -m "feat: rate limiting berbasis CacheService"
```

---

### Task 5: Refactor `Code.js` — semua entry point token-based

**Files:**
- Modify: `src/Code.js` (banyak fungsi; lihat daftar per fungsi di bawah)

**Interfaces:**
- **Consumes:** `requireUser`, `destroySession`, `createSession`, `checkRate`, `resetRate` dari Task 1 & 4.
- **Produces:** `doLogin(username, password)` → `{success, token, user, must_change?}`; `doLogout(token)`; semua wrapper lain menerima `token` sebagai parameter terakhir dan memvalidasi lewat `requireUser(token)` sebelum memanggil Ops layer.

Aturan pemetaan di `Code.js`:
- Fungsi yang dulu menerima `userInfo` → kini menerima `token` dan memanggil `var user = requireUser(token);` lalu memakai `user` di tempat `userInfo`.
- Fungsi yang membawa `payload` berisi `payload.userInfo` → set `payload.userInfo = requireUser(token)`.
- `processDailyImages` → `processDailyImages(data, token)`; wajib user untuk kuota Gemini & audit.
- `saveAppSettings`/`uploadLogo` → wajib SUPERADMIN.
- `getAppSettings` → tetap bisa dipanggil tanpa token (dipakai halaman login), opsional token.

**Langkah eksekusi (lakukan berurutan, verifikasi per blok):**

- [ ] **Step 1: Tambah `setXFrameOptionsMode(ALLOWALL)` di `doGet` (dibutuhkan cetak-iframatic & embed foto Drive) + bungkus `doLogin`/tambah `doLogout`**

Ganti blok `doGet` (`:1-6`) dan `doLogin` (`:12-14`) menjadi:

```javascript
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Laporan BBM & Operasional Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==========================================
// AUTH
// ==========================================

function doLogin(username, password) {
  var runaway = checkRate('login:' + String(username).toLowerCase(), 5, 5 * 60 * 1000);
  if (!runaway.allowed) {
    return { success: false, msg: 'Terlalu banyak percobaan login. Tunggu ' + runaway.retryAfterSec + ' detik.' };
  }
  var res = authenticateUser(username, password);
  if (!res.success) return res;
  resetRate('login:' + String(username).toLowerCase());
  var token = createSession(res);
  Logger.log('LOGIN OK: ' + res.username + ' (' + res.role + ') cabang=' + res.cabang);
  return {
    success: true,
    token: token,
    user: {
      user_id: res.user_id,
      username: res.username,
      nama: res.nama,
      role: res.role,
      cabang: res.cabang,
      must_change: !!res.must_change
    }
  };
}

function doLogout(token) {
  destroySession(token);
  return { success: true };
}
```

> Catatan: `setXFrameOptionsMode(ALLOWALL)` dibutuhkan agar `document.write`-print path (diganti total di P2) dan iframe embed foto Drive bisa berjalan; CSP meta akan ditambahkan di P2.

- [ ] **Step 2: Ganti fungsi baca `processInitialData`, `getLastLaporanPrefill`, `getMasterData`, `getDashboardData`, `getPerformaData`**

Ganti seluruh fungsi berikut (lihat baris asli di `Code.js`):

```javascript
function processInitialData(token) {
  var user = requireUser(token);
  ensurePenggunaBBMColumns();
  var payload = {
    vehicles: safeList(function() { return getActiveVehicles(user.role, user.cabang); }),
    drivers: safeList(function() { return getActiveDrivers(user.role, user.cabang); }),
    cabangList: safeList(function() { return getCabangList(); }),
    bbmList: safeList(function() { return getActiveBBM(); }),
    user: (user.nama || ''),
    username: user.username,
    role: user.role,
    cabang: user.cabang,
    flazzCards: safeList(function() { return getFlazzCards(user.role, user.cabang); }),
    penggunaList: (user.role === 'SUPERADMIN') ? safeList(function() { return getAllUsers(); }) : []
  };
  return cleanSerializable(payload);
}

function getLastLaporanPrefill(token) {
  try {
    var user = requireUser(token);
    const ss = getDB();
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) return { pref: null };
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { pref: null };
    const role = user.role;
    const cabang = user.cabang;
    for (let i = data.length - 1; i >= 1; i--) {
      let row = data[i];
      if (role !== 'SUPERADMIN' && row[5] !== cabang) continue;
      if (!row[6]) continue;
      let d = new Date(row[2]);
      let tgl = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return { pref: {
        vehicle_id: row[6],
        plat_nomor: row[7],
        nama_supir: row[26] || '',
        tanggal: tgl,
        bar_awal: row[11],
        bar_akhir: row[15],
        biaya_bbm: parseFloat(row[19]) || 0,
        liter_bbm: parseFloat(row[18]) || 0,
        metode_pembayaran: row[27] || 'TUNAI',
        flazz_card_id: row[28] || '',
        keterangan: row[33] || ''
      }};
    }
    return { pref: null };
  } catch (e) {
    return { error: e.toString(), pref: null };
  }
}

function getMasterData(token) {
  var user = requireUser(token);
  var payload = {
    vehicles: safeList(function() { return getActiveVehicles(user.role, user.cabang); }),
    drivers: safeList(function() { return getActiveDrivers(user.role, user.cabang); }),
    cabangList: safeList(function() { return getCabangList(); }),
    bbmList: safeList(function() { return getActiveBBM(); }),
    flazzCards: safeList(function() { return getFlazzCards(user.role, user.cabang); }),
    penggunaList: (user.role === 'SUPERADMIN') ? safeList(function() { return getAllUsers(); }) : []
  };
  return cleanSerializable(payload);
}

function getDashboardData(token) {
  var user = requireUser(token);
  return getRecentTransactions(user.role, user.cabang);
}

function getPerformaData(token) {
  var user = requireUser(token);
  return getPerformaSummary(user.role, user.cabang);
}
```

- [ ] **Step 3: Ganti fungsi tulis harian**

```javascript
function processDailyImages(data, token) {
  try {
    var user = requireUser(token);
    var gm = checkRate('gemini:' + user.user_id, 30, 24 * 60 * 60 * 1000);
    if (!gm.allowed) {
      return { success: false, error: 'Kuota deteksi BBM harian tercapai. Coba lagi besok.' };
    }
    let result = { success: true, files: {} };
    let odoAwalFile = uploadImageToDrive(data.foto_odo_awal, data.foto_odo_awal_name, 'KM_Awal', user.cabang);
    if (!odoAwalFile.success) return { success: false, error: 'Upload foto KM awal gagal: ' + odoAwalFile.error };
    result.files.odo_awal = odoAwalFile.fileUrl;

    let odoAkhirFile = uploadImageToDrive(data.foto_odo_akhir, data.foto_odo_akhir_name, 'KM_Akhir', user.cabang);
    if (!odoAkhirFile.success) return { success: false, error: 'Upload foto KM akhir gagal: ' + odoAkhirFile.error };
    result.files.odo_akhir = odoAkhirFile.fileUrl;

    result.km_awal = data.km_awal_val;
    result.km_akhir = data.km_akhir_val;

    if (data.foto_indikator) {
      let indFile = uploadImageToDrive(data.foto_indikator, data.foto_indikator_name, 'Indikator_BBM', user.cabang);
      result.files.indikator = indFile.success ? indFile.fileUrl : '';

      if (!data.skip_ai_deteksi) {
        try {
          var deteksi = detectFuelLevel(data.foto_indikator);
          result.level_bbm = deteksi.level;
          result.confidence_bbm = deteksi.confidence_pct;
          result.level_status = deteksi.status;
          result.level_message = deteksi.message;
        } catch (e) {
          Logger.log('Deteksi indikator gagal: ' + e.toString());
        }
      }
    }
    return result;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function saveDailyTransaction(payload, token) {
  payload.userInfo = requireUser(token);
  return saveTransactionEndOfDay(payload);
}
```

> Catatan: `uploadImageToDrive` mendapat argumen `cabang` — signature lama masih kompatibel (argumen opsional). Implementasi folder-per-cabang ada di Fase P2.

- [ ] **Step 4: Ganti semua wrapper master**

```javascript
function saveMasterCabang(data, token) { return insertCabang(data, requireUser(token)); }
function saveMasterKendaraan(data, token) { return insertKendaraan(data, requireUser(token)); }
function saveMasterSupir(data, token) { return insertSupir(data, requireUser(token)); }
function deleteMasterKendaraan(vehicleId, token) { return deleteKendaraanById(vehicleId, requireUser(token)); }
function updateMasterCabang(data, token) { return updateCabang(data, requireUser(token)); }
function updateMasterKendaraan(data, token) { return updateKendaraan(data, requireUser(token)); }
function updateMasterSupir(data, token) { return updateSupir(data, requireUser(token)); }
function updateMasterBBM(data, token) { return updateBBM(data, requireUser(token)); }
function saveMasterBBM(data, token) { return insertBBM(data, requireUser(token)); }
function deleteMasterCabang(kode, token) { return deleteCabangById(kode, requireUser(token)); }
function deleteMasterSupir(id, token) { return deleteSupirById(id, requireUser(token)); }
function deleteMasterBBM(id, token) { return deleteBBMById(id, requireUser(token)); }
function saveMasterPengguna(data, token) { return insertUser(data, requireUser(token)); }
function updateMasterPengguna(data, token) { return updateUser(data, requireUser(token)); }
function deleteMasterPengguna(userId, token) { return setUserStatus(userId, 'Non-Aktif', requireUser(token)); }
function activateMasterPengguna(userId, token) { return setUserStatus(userId, 'Aktif', requireUser(token)); }
```

- [ ] **Step 5: Ganti semua wrapper Flazz**

```javascript
// ==========================================
// FLAZZ API WRAPPERS
// ==========================================
function apiSaveFlazzCard(payload, token) { return saveFlazzCard(payload, requireUser(token)); }
function apiSaveFlazzTopUp(payload, token) { payload.userInfo = requireUser(token); return saveFlazzTopUp(payload); }
function apiSaveFlazzTol(payload, token) { payload.userInfo = requireUser(token); return saveFlazzTol(payload); }
function apiSaveFlazzRecon(payload, token) { payload.userInfo = requireUser(token); return saveFlazzRecon(payload); }
function apiCheckReconGate(cardId, token) { requireUser(token); return checkReconGate(cardId); }
function apiSaveFlazzUsage(payload, token) { payload.userInfo = requireUser(token); return saveFlazzUsage(payload); }

function apiGetFlazzDashboardData(token) { var user = requireUser(token); return getFlazzDashboardData(user.role, user.cabang); }
function apiDeleteFlazzCard(cardId, token) { return deleteFlazzCard(cardId, requireUser(token)); }
function apiActivateFlazzCard(cardId, token) { return activateFlazzCard(cardId, requireUser(token)); }
function apiEditFlazzTopUp(payload, token) { return editFlazzTopUp(payload, requireUser(token)); }
function apiDeleteFlazzTopUp(id, token) { return deleteFlazzTopUp(id, requireUser(token)); }
function apiEditFlazzTol(payload, token) { return editFlazzTol(payload, requireUser(token)); }
function apiDeleteFlazzTol(id, token) { return deleteFlazzTol(id, requireUser(token)); }
function apiDeleteFlazzBBM(transactionId, mode, token) { return deleteFlazzBBM(transactionId, mode, requireUser(token)); }
function apiEditDailyTransaction(payload, token) { return editDailyTransaction(payload, requireUser(token)); }
function apiDeleteDailyTransaction(transactionId, token) { return deleteDailyTransaction(transactionId, requireUser(token)); }
```

- [ ] **Step 6: Ganti semua wrapper Jalur**

```javascript
// ==========================================
// JALUR PENGIRIMAN API WRAPPERS
// ==========================================
function apiSaveJalur(payload, token) { return saveJalur(payload, requireUser(token)); }
function apiUpdateJalur(data, token) { return updateJalur(data, requireUser(token)); }
function apiDeleteJalur(id, token) { return deleteJalur(id, requireUser(token)); }
function apiGetJalurByTanggal(tanggal, token, opts) { var user = requireUser(token); return getJalurByTanggal(tanggal, user, opts || {}); }
```

- [ ] **Step 7: Ganti panggilan Gemini + settings**

```javascript
function apiDetectFuelLevel(base64DataUrl, token) {
  var user = requireUser(token);
  var gm = checkRate('gemini:' + user.user_id, 30, 24 * 60 * 60 * 1000);
  if (!gm.allowed) {
    return { level: 0, confidence_pct: 0, status: 'NOT_DETECTED', message: 'Kuota deteksi BBM harian tercapai. Coba lagi besok.' };
  }
  return detectFuelLevel(base64DataUrl);
}
```

Untuk settings (fungsi di `DatabaseSetup.js` masih sama, wrapper ada di Code.js — tambahkan dua fungsi ini bila belum ada; `getAppSettings` dipanggil langsung dari client sehingga harus menerima token opsional):

```javascript
function saveAppSettings(data, token) {
  var user = requireUser(token);
  if (user.role !== 'SUPERADMIN') throw new Error('Akses ditolak: hanya SUPERADMIN yang dapat mengubah pengaturan.');
  return DatabaseSaveAppSettings(data);
}

function uploadLogo(base64Data, fileName, token) {
  var user = requireUser(token);
  if (user.role !== 'SUPERADMIN') throw new Error('Akses ditolak: hanya SUPERADMIN yang dapat mengunggah logo.');
  return DatabaseUploadLogo(base64Data, fileName);
}

function getAppSettings(token) {
  return DatabaseGetAppSettings();
}
```

> Step 7 bergantung pada rename fungsi di `DatabaseSetup.js` (Task berikut). Jika hanya mengerjakan Task ini terlebih dahulu, step 7 wajib berdampingan Task 6 di bawah (refactor DatabaseSetup).

- [ ] **Step 8: Verifikasi**

Run: `clasp push`, lalu di editor coba: `doLogin('picjkt','pic123')` → dapat `{success:true, token, user}`; panggil `getDashboardData('')` → Expected error `Akses ditolak: sesi tidak valid...`; panggil `getDashboardData(token)` → data array cabang PIC.

- [ ] **Step 9: Commit**

```bash
git add src/Code.js
git commit -m "refactor: semua entry point server menerima token server-side, hilangkan trust userInfo dari client"
```

---

### Task 6: Refactor `DatabaseSetup.js` — rename settings function + ganti hardcoded ID ke getDB()

**Files:**
- Modify: `src/DatabaseSetup.js`

**Interfaces:**
- **Produces:** `DatabaseGetAppSettings()` (replacing `getAppSettings`), `DatabaseSaveAppSettings(data)` (replacing `saveAppSettings`), `DatabaseUploadLogo(base64Data, fileName)` (replacing `uploadLogo`).

**Langkah:**

- [ ] **Step 1: Rename ketiga fungsi settings di `DatabaseSetup.js`**

Ganti nama fungsi:
- `getAppSettings` → `DatabaseGetAppSettings` (`:132`)
- `saveAppSettings` → `DatabaseSaveAppSettings` (`:160`)
- `uploadLogo` → `DatabaseUploadLogo` (`:196`)

Dan ganti **keempat** pemanggilan `SpreadsheetApp.openById('1FU7...')` di file ini (`:2`, `:89`, `:133`, `:161`) menjadi `getDB()` (fungsi yang sudah ada di `SpreadsheetOps.js:2`). Pastikan semua referensi `saveAppSettings(` dan `uploadLogo(` di dalam file ini ikut di-rename (mis. `DatabaseUploadLogo` memanggil `DatabaseSaveAppSettings`).

- [ ] **Step 2: Perbarui `DatabaseUploadLogo` agar validasi tipe & ukuran (dipakai P2)**

Di dalam `DatabaseUploadLogo`, ganti blok pembentukan blob dengan:

```javascript
    var data = base64Data.split(',')[1];
    if (!data) throw new Error('Data base64 tidak valid');
    var bytes = Utilities.base64Decode(data);
    if (bytes.length > 10 * 1024 * 1024) throw new Error('Ukuran file melebihi 10MB');
    var blob = Utilities.newBlob(bytes, 'image/png', fileName);
```

- [ ] **Step 3: Verifikasi + commit**

Run: `clasp push`; di editor `DatabaseGetAppSettings()` → mengembalikan settings; `clasp run __runAllTests` → `{passed:12, failed:0}` (regresi).

```bash
git add src/DatabaseSetup.js
git commit -m "refactor: terpusatkan getDB() di DatabaseSetup + validasi ukuran logo"
```

---

### Task 7: Refactor client (4 file HTML) — kirim token, bukan userInfo

**Files:**
- Modify: `src/js.html`
- Modify: `src/FlazzScript.html`
- Modify: `src/JalurScript.html`
- Modify: `src/Settings.html`

**Interfaces:**
- **Consumes:** respon `doLogin` baru `{success, token, user}`; fungsi server yang kini menerima token.
- **Produces:** helper `bbmToken()`, session client `bbm_token` + `bbm_user`.

**Langkah:**

- [ ] **Step 1: Helper token + session di `js.html`**

Tambahkan tepat setelah `var SESSION_MAX_AGE_MS = ...` (`js.html:9`):

```javascript
  function bbmToken() {
    return localStorage.getItem('bbm_token') || '';
  }
```

Ganti `loadSessionUser` (`js.html:10-25`) agar tetap valid & menolak tokto kadaluarsa:

```javascript
  function loadSessionUser() {
    try {
      var raw = localStorage.getItem('bbm_user');
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      if (!bbmToken()) { localStorage.removeItem('bbm_user'); return null; }
      if (obj.__ts && (Date.now() - obj.__ts > SESSION_MAX_AGE_MS)) {
        localStorage.removeItem('bbm_user');
        localStorage.removeItem('bbm_token');
        return null;
      }
      return obj;
    } catch (e) {
      localStorage.removeItem('bbm_user');
      localStorage.removeItem('bbm_token');
      return null;
    }
  }
```

Ganti blok `DOMContentLoaded` (`js.html:27-42`) bagian `if (storedUser)` menjadi memanggil `loadInitialData(storedUser)` (server akan validasi token; bila invalid, `withFailureHandler` memanggil `logout()`).

Ganti handler sukses `doLogin` (`js.html:69-80`) menjadi:

```javascript
    google.script.run.withSuccessHandler(function(res) {
       if (res.success) {
         var u = res.user || {};
         u.__ts = Date.now();
         userInfo = u;
         localStorage.setItem('bbm_token', res.token);
         localStorage.setItem('bbm_user', JSON.stringify(u));
         showToast(res.user && res.user.must_change ? 'Login berhasil! Segera ganti password Anda.' : 'Login berhasil!', 'success');
         loadInitialData(userInfo);
       } else {
          showLoginError(res.msg);
          btn.disabled = false;
          btn.innerText = 'Masuk';
       }
    }).withFailureHandler(function(err) {
       btn.disabled = false;
       btn.innerText = 'Masuk';
       showLoginError('Gagal menghubungi server: ' + (err && err.message ? err.message : 'terjadi kesalahan'));
    }).doLogin(un, pw);
```

Ganti `logout()` (`js.html:124-...`) bagian awal menjadi:

```javascript
  function logout() {
    var t = bbmToken();
    localStorage.removeItem('bbm_token');
    localStorage.removeItem('bbm_user');
    if (t) {
      try { google.script.run.doLogout(t); } catch (e) { /* abaikan */ }
    }
    cancelIdleTimers();
    // pembersihan UI lainnya (hideLoginLogin, reset form, dsb) tetap persis seperti aslinya
    // — HANYA bagian header fungsi di atas yang diubah. Jangan hapus sisa body logout().
```

*(sisanya — pembersihan UI — biarkan tetap ada setelah `cancelIdleTimers();`)*

- [ ] **Step 2: Ganti argumen semua panggilan server di `js.html`**

Tabel penggantian eksak (cari & ganti di `js.html`):

| Baris | Lama | Baru |
|---|---|---|
| 350 | `.processInitialData(uInfo);` | `.processInitialData(bbmToken());` |
| 383 | `.getAppSettings();` | `.getAppSettings(bbmToken());` |
| 815 | `}).getLastLaporanPrefill(userInfo);` | `}).getLastLaporanPrefill(bbmToken());` |
| 992 | `.saveDailyTransaction(formDataPayload);` | `.saveDailyTransaction(formDataPayload, bbmToken());` |
| 1006 | `.processDailyImages(formDataPayload);` | `.processDailyImages(formDataPayload, bbmToken());` |
| 1049 | `.getPerformaData(userInfo);` | `.getPerformaData(bbmToken());` |
| 1192 | `.getDashboardData(userInfo);` | `.getDashboardData(bbmToken());` |
| 1243 | `.getDashboardData(userInfo);` | `.getDashboardData(bbmToken());` |
| 1582 | `}).apiEditDailyTransaction(payload, userInfo);` | `}).apiEditDailyTransaction(payload, bbmToken());` |
| 1594 | `}).apiDeleteDailyTransaction(id, userInfo);` | `}).apiDeleteDailyTransaction(id, bbmToken());` |
| 2095 | `.getMasterData(userInfo);` | `.getMasterData(bbmToken());` |
| 2214 | `.deleteMasterKendaraan(vehicleId, userInfo);` | `.deleteMasterKendaraan(vehicleId, bbmToken());` |
| 2225 | `.deleteMasterCabang(kode, userInfo);` | `.deleteMasterCabang(kode, bbmToken());` |
| 2235 | `.deleteMasterSupir(id, userInfo);` | `.deleteMasterSupir(id, bbmToken());` |
| 2245 | `.deleteMasterBBM(id, userInfo);` | `.deleteMasterBBM(id, bbmToken());` |
| 2350 | `}[(editId ? 'updateMasterPengguna' : 'saveMasterPengguna')](data, userInfo);` | `}[(editId ? 'updateMasterPengguna' : 'saveMasterPengguna')](data, bbmToken());` |
| 2365 | `}[(toActivate ? 'activateMasterPengguna' : 'deleteMasterPengguna')](userId, userInfo);` | `}[(toActivate ? 'activateMasterPengguna' : 'deleteMasterPengguna')](userId, bbmToken());` |

Cek global: jangan ada lagi substring `userInfo` yang menjadi argumen `google.script.run` di `js.html`. Eksekutor boleh menjalankan `Select-String -Path src\js.html -Pattern "google\.script\.run"` untuk audit.

- [ ] **Step 3: Refactor `FlazzScript.html`**

Tambahkan di bagian atas file (di dalam scope dengana akses ke UI, biasanya dekat deklarasi `flazzDataCache`):

```javascript
  function bbmToken() {
    return localStorage.getItem('bbm_token') || '';
  }
  function flazzUserInfo() {
    try { return JSON.parse(localStorage.getItem('bbm_user') || 'null'); } catch (e) { return null; }
  }
```

> `flazzUserInfo()` dipertahankan hanya untuk penampilan/display; server mengabaikannya untuk otorisasi.

Tabel penggantian di `FlazzScript.html`:

| Baris | Lama | Baru |
|---|---|---|
| 366 | `.apiCheckReconGate(cardId);` | `.apiCheckReconGate(cardId, bbmToken());` |
| 440 | `.apiSaveFlazzCard(payload, uInfo);` | `.apiSaveFlazzCard(payload, bbmToken());` |
| 480 | `.apiSaveFlazzTopUp(payload);` | `.apiSaveFlazzTopUp(payload, bbmToken());` |
| 522 | `.apiSaveFlazzRecon(payload);` | `.apiSaveFlazzRecon(payload, bbmToken());` |
| 555 | `.apiCheckReconGate(cardId);` | `.apiCheckReconGate(cardId, bbmToken());` |
| 769 | `}).apiEditFlazzTopUp(payload, flazzUserInfo());` | `}).apiEditFlazzTopUp(payload, bbmToken());` |
| 776 | `}).apiDeleteFlazzTopUp(id, flazzUserInfo());` | `}).apiDeleteFlazzTopUp(id, bbmToken());` |
| 813 | `}).apiEditFlazzTol(payload, flazzUserInfo());` | `}).apiEditFlazzTol(payload, bbmToken());` |
| 820 | `}).apiDeleteFlazzTol(id, flazzUserInfo());` | `}).apiDeleteFlazzTol(id, bbmToken());` |
| 827 | `}).apiDeleteFlazzBBM(trxId, 'detach', flazzUserInfo());` | `}).apiDeleteFlazzBBM(trxId, 'detach', bbmToken());` |
| 901 | `.apiDeleteFlazzCard(id, flazzUserInfo());` | `.apiDeleteFlazzCard(id, bbmToken());` |
| 912 | `.apiActivateFlazzCard(id, flazzUserInfo());` | `.apiActivateFlazzCard(id, bbmToken());` |

Untuk panggilan `apiGetFlazzDashboardData` (baris 47 dan 99): cek argumennya. Bila argumen berbentuk objek user (`uInfo`/`userInfo`) ganti menjadi `bbmToken()`. Contoh baris 99: `.apiGetFlazzDashboardData(uInfo);` → `.apiGetFlazzDashboardData(bbmToken());`.

Periksa juga pemanggilan lain yang mungkin menyisipkan `userInfo` sebagai argumen selain tabel di atas (jalankan `Select-String -Path src\FlazzScript.html -Pattern "userInfo|uInfo"` dan audit satu per satu; argumen yang merupakan data formulir (payload) TETAP dikirim sebagai data, hanya argumen identitas yang diganti `bbmToken()`).

- [ ] **Step 4: Refactor `JalurScript.html`**

Tambahkan helper `bbmToken()` di bagian atas (di scope utama):

```javascript
  function bbmToken() {
    return localStorage.getItem('bbm_token') || '';
  }
```

Tabel penggantian:

| Baris | Lama | Baru |
|---|---|---|
| 25 | `.getMasterData(userInfo);` | `.getMasterData(bbmToken());` |
| 307 | `.apiGetJalurByTanggal(tanggal, userInfo, { tanggalAkhir: tanggalAkhir, cabang: cabang });` | `.apiGetJalurByTanggal(tanggal, bbmToken(), { tanggalAkhir: tanggalAkhir, cabang: cabang });` |
| 367 | `.apiGetJalurByTanggal(tanggal, userInfo, { cabang: cabang });` | `.apiGetJalurByTanggal(tanggal, bbmToken(), { cabang: cabang });` |
| 434 | `.apiSaveJalur({ tanggal: tanggal, rows: rows }, userInfo);` | `.apiSaveJalur({ tanggal: tanggal, rows: rows }, bbmToken());` |
| 486 | `.apiGetJalurByTanggal(tanggal, userInfo, { tanggalAkhir: tanggalAkhir, cabang: cabang });` | `.apiGetJalurByTanggal(tanggal, bbmToken(), { tanggalAkhir: tanggalAkhir, cabang: cabang });` |
| 516 | `.apiUpdateJalur(data, userInfo);` | `.apiUpdateJalur(data, bbmToken());` |
| 527 | `.apiDeleteJalur(id, userInfo);` | `.apiDeleteJalur(id, bbmToken());` |

- [ ] **Step 5: Refactor `Settings.html`**

Tambahkan helper `bbmToken()` serupa di bagian atas:

```javascript
  function bbmToken() {
    return localStorage.getItem('bbm_token') || '';
  }
```

Tabel penggantian:

| Baris | Lama | Baru |
|---|---|---|
| 98 | `.getAppSettings();` | `.getAppSettings(bbmToken());` |
| 130 | `.uploadLogo(base64Data, selectedLogoFile.name);` | `.uploadLogo(base64Data, selectedLogoFile.name, bbmToken());` |
| 143 | `.getAppSettings();` | `.getAppSettings(bbmToken());` |
| 163 | `.saveAppSettings(data);` | `.saveAppSettings(data, bbmToken());` |

Untuk `uploadLogo`, validasi client (opsional tapi bagus) — pastikan `selectedLogoFile` dipilih & ukuran <10MB sebelum memanggil.

- [ ] **Step 6: Verifikasi end-to-end**

Run: `clasp push`, deploy ulang Web App, buka di tab **anonim/incognito**:
1. Login `picjkt`/`pic123` → masuk, dashboard tampil.
2. Buka DevTools → `console` → ketik `localStorage.getItem('bbm_token')` → ada token panjang.
3. Ketik `google.script.run.withFailureHandler(console.log).getDashboardData('')` → Expected error `Akses ditolak...`.
4. Ketik `google.script.run.withSuccessHandler(console.log).getDashboardData(localStorage.getItem('bbm_token'))` → data cabang PIC.
5. Jalur: buat/edit/hapus jalur; Flazz: topup/tol/recon; Settings: simpan app name → semua sukses.
6. Logout → `doLogout` dipanggil → token invalid setelahnya.

- [ ] **Step 7: Commit**

```bash
git add src/js.html src/FlazzScript.html src/JalurScript.html src/Settings.html
git commit -m "refactor: client kirim token sesi server-side, ganti userInfo di semua panggilan API"
```

---

### Task 8: Pasang `withLock` di semua alur read-modify-write

**Files:**
- Modify: `src/SpreadsheetOps.js` (`saveTransactionEndOfDay` :83, `editDailyTransaction` :641, `deleteDailyTransaction` :773)
- Modify: `src/FlazzOps.js` (`saveFlazzTopUp` :244, `saveFlazzTol` :380, `saveFlazzRecon` :690, `saveFlazzUsage` :807, `editFlazzTopUp` :289, `deleteFlazzTopUp` :340, `editFlazzTol`, `deleteFlazzTol`, `deleteFlazzBBM`, `deleteFlazzCard`)

**Interfaces:**
- **Consumes:** `withLock` dari Task 3.
- **Produces:** setiap fungsi di atas menjadi dua lapis: wrapper publik `NamaFungsi(...)` → `withLock('label', function(){ return NamaFungsiUnlocked(...); })`, dan `NamaFungsiUnlocked` yang berisi body lama.

**Pola penggantian (terapkan per fungsi, contoh `saveFlazzTopUp`):**

- [ ] **Step 1: Ubah `saveFlazzTopUp`**

Ganti:

```javascript
function saveFlazzTopUp(payload) {
  try {
```

menjadi:

```javascript
function saveFlazzTopUp(payload) {
  return withLock('flazz-topup', function() {
    return saveFlazzTopUpUnlocked(payload);
  });
}

function saveFlazzTopUpUnlocked(payload) {
  try {
```

*(Baris `} catch (err) { return { success: false, msg: err.message }; }` dan `}` penutup tetap sama — sekarang menutup `saveFlazzTopUpUnlocked`.)*

Terapkan pola yang sama untuk:
- `saveFlazzTol` → label `'flazz-tol'`, inner `saveFlazzTolUnlocked`
- `saveFlazzRecon` → label `'flazz-recon'`, inner `saveFlazzReconUnlocked`
- `saveFlazzUsage` → label `'flazz-usage'`, inner `saveFlazzUsageUnlocked`
- `editFlazzTopUp` → label `'flazz-edit-topup'`, inner `editFlazzTopUpUnlocked`
- `deleteFlazzTopUp` → label `'flazz-del-topup'`, inner `deleteFlazzTopUpUnlocked`
- `editFlazzTol` → label `'flazz-edit-tol'`, inner `editFlazzTolUnlocked`
- `deleteFlazzTol` → label `'flazz-del-tol'`, inner `deleteFlazzTolUnlocked`
- `deleteFlazzBBM` → label `'flazz-del-bbm'`, inner `deleteFlazzBBMUnlocked`
- `deleteFlazzCard` → label `'flazz-del-card'`, inner `deleteFlazzCardUnlocked`

- [ ] **Step 2: Ubah `saveTransactionEndOfDay`, `editDailyTransaction`, `deleteDailyTransaction` di `SpreadsheetOps.js`**

Pola sama dengan Task 8 Step 1:
- `saveTransactionEndOfDay` → label `'daily-save'`, inner `saveTransactionEndOfDayUnlocked`
- `editDailyTransaction` → label `'daily-edit'`, inner `editDailyTransactionUnlocked`
- `deleteDailyTransaction` → label `'daily-delete'`, inner `deleteDailyTransactionUnlocked`

> **JANGAN** menambah `withLock` di dalam helper yang dipanggil dari alur yang sudah terkunci (mis. `recordFlazzExpense`, `setCardBalance`, `getCardBalance`) — itu nested lock.

- [ ] **Step 3: Verifikasi + commit**

Run: `clasp push`. Verifikasi manual: buka 2 tab, dua-duanya login sebagai 2 user berbeda di cabang yang sama, masing-masing melakukan topup bergantian secepat mungkin sebanyak 5× (total 10 topup Rp10.000) → saldo akhir harus tepat +100.000, tidak ada yang hilang.

```bash
git add src/SpreadsheetOps.js src/FlazzOps.js
git commit -m "fix: kunci LockService di semua alur read-modify-write (saldo Flazz, transaksi, topup)"
```

---

### Task 9: Aktifkan rate limiting di login & Gemini + audit dasar

**Files:**
- Modify: `src/Code.js` (sudah pada Task 5 Step 1/7 — verifikasi aktual)
- Create: `src/AuditOps.js`

**Interfaces:**
- **Produces:** `logAudit(user, action, modul, keterangan, dataSebelum, dataSesudah)` — menulis ke sheet `Audit_Log` (schema sudah ada di `DatabaseSetup.js:19`); dipakai selanjutnya di Fase P1 juga.

**Langkah:**

- [ ] **Step 1: Buat `src/AuditOps.js`**

```javascript
// ==========================================
// AUDIT LOG (sheet Audit_Log)
// ==========================================

function logAudit(user, action, modul, keterangan, dataSebelum, dataSesudah) {
  try {
    if (!user) return;
    var ss = getDB();
    var sheet = ss.getSheetByName('Audit_Log');
    if (!sheet) return;
    sheet.appendRow([
      'LOG-' + new Date().getTime(),
      new Date(),
      user.user_id || '',
      user.username || '',
      action,
      modul,
      keterangan || '',
      dataSebelum ? JSON.stringify(dataSebelum).substring(0, 2000) : '',
      dataSesudah ? JSON.stringify(dataSesudah).substring(0, 2000) : ''
    ]);
  } catch (e) {
    console.error('Audit log gagal: ' + e);
  }
}
```

- [ ] **Step 2: Panggil `logAudit` di titik kunci**

Pada `Code.js` `doLogin` sukses, tambahkan sebelum `return`:

```javascript
  logAudit(res, 'LOGIN', 'auth', 'Login berhasil role=' + res.role + ' cabang=' + (res.cabang || '-'));
```

Pada `Code.js` `doLogout` tambahkan dan panggil (bila user masih ter-resolve):

```javascript
function doLogout(token) {
  var u = resolveSession(token);
  if (u) logAudit(u, 'LOGOUT', 'auth', 'Logout');
  destroySession(token);
  return { success: true };
}
```

Selanjutnya, di akhir **`updateUser`** sukses (`SpreadsheetOps.js:1176`) sebelum `return`, tambahkan:

```javascript
  logAudit(userInfo, 'EDIT', 'pengguna', 'Update user ' + userId);
```

Di **`setUserStatus`** (`SpreadsheetOps.js:1199`) tepat setelah `sheet.getRange(rowIndex, 7).setValue(status);` tambahkan:

```javascript
  logAudit(userInfo, 'DELETE', 'pengguna', (status === 'Aktif' ? 'Aktifkan ' : 'Nonaktifkan ') + userId);
```

> Catatan: `updateUser` — `password` hanya di-hash ulang bila diisi user (lihat Task 2); `logAudit` memakai `userId` & `userInfo` yang sudah ada di scope fungsi. (Di Fase P1, `logAudit` diperluas ke semua mutasi.)

- [ ] **Step 3: Verifikasi + commit**

Run: `clasp push`; login & logout sekali → cek sheet `Audit_Log` ada 2 baris baru.

```bash
git add src/AuditOps.js src/Code.js src/SpreadsheetOps.js
git commit -m "feat: audit log login/logout/update pengguna + verifikasi rate limit login"
```

---

### Task 10: Konfigurasi deploy & dokumentasi

**Files:**
- Modify: `src/appsscript.json`
- Modify: `README.md`
- Delete dari repo (stale/diagnostic): `temp.js`, `src/debug.js`, `src/debug_agus.js`, `apply_jalur.py`, `scratch_head_spreadsheetops.js` — **kecuali** dipakai; audit dulu sebelum hapus.

**Langkah:**

- [ ] **Step 1: Perbarui `appsscript.json`**

```json
{
  "timeZone": "Asia/Jakarta",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

> Tidak ada perubahan nilai: dengan sesi token server-side, `ANYONE_ANONYMOUS` kini aman (semua fungsi butuh token; yang membaca tanpa token hanya `getAppSettings` — data non-sensitif). `USER_DEPLOYING` dipertahankan karena script harus menulis spreadsheet & Drive milik deployer. Catat keputusan ini di README.

- [ ] **Step 2: Rekonsiliasi `README.md`**

Perbarui bagian "Login & Akun":
- Hapus klaim `snd`/`snd123` (tidak ada di kode).
- Ganti langkah setup: setelah `setupDatabase()`, jalankan `createSuperadmin()` dari editor untuk membuat SUPERADMIN pertama (bukan `seedDummyData` yang kini hanya membuat PIC).
- Catat bahwa password lama dari `seedDummyData` (mis. `admin123`, `pic123`) bersifat legacy & harus segera diganti; akaun `admin` bukan lagi bagian seed.
- Tambah sub-bagian "Model keamanan" menjelaskan token sesi 12 jam di `CacheService`, password ter-hash, dan akses publik yang aman.
- Perbarui langkah deploy: ganti buka-tutup "Execute as: User accessing the web app" menjadi "User accessing the web app" **tidak digunakan**; yang benar `USER_DEPLOYING` + `ANYONE_ANONYMOUS` (sesuaikan dengan `appsscript.json`).

- [ ] **Step 3: Bersihkan sisa file**

Audit isi `temp.js`, `src/debug.js`, `src/debug_agus.js`, `apply_jalur.py`, `scratch_head_spreadsheetops.js`; bila terbukti artefak/diagnostik dan tidak dirujuk oleh `src/` (grep untuk nama fungsinya), hapus dari repo. Lalu pastikan `.gitignore` menambahkan pola untuk artefak lokal.

- [ ] **Step 4: Verifikasi + commit**

```bash
git add src/appsscript.json README.md
git commit -m "docs: rekonsiliasi README dengan model keamanan token + model deploy; clean stale artifacts"
```

---

## Self-Check P0

- [ ] Tidak ada fungsi `google.script.run.*` yang masih mengirim objek identitas dari client untuk otorisasi (grep `userInfo`/`uInfo`/`flazzUserInfo()` di 4 file HTML hanya muncul untuk display).
- [ ] Semua entry point `Code.js` memanggil `requireUser`/`resolveSession` sebelum memakai role/cabang.
- [ ] `updateUser` punya `assertSuperadminOnly`.
- [ ] Password tidak lagi disimpan/bandingkan dalam plaintext.
- [ ] Alur saldo & transaksi dibungkus `withLock`; tidak ada nested.
- [ ] `doLogin` dan `apiDetectFuelLevel`/`processDailyImages` punya rate limit.
- [ ] `Audit_Log` terisi untuk login/logout/update pengguna.
- [ ] README & appsscript.json konsisten.

**Fase P0 selesai = aman untuk dideploy ke lebih dari 2 cabang dari sisi keamanan & kebenaran.**