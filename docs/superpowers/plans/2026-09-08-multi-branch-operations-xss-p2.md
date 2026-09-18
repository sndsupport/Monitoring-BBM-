# Fase P2 — Multi-Branch Operations & XSS Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Siap operasional untuk 12 cabang yang mandiri: foto tersimpan per cabang, konfigurasi (harga BBM) dapat berbeda antar cabang, semua render client bebas XSS (termasuk jalur cetak A4), plus kesehatan sistem & efisiensi client.

**Architecture:** `uploadImageToDrive` dirombak agar benar memakai argumen `subfolderName` + `cabang` (folder `BBM_OPERASIONAL/<cabang>/<tipe>/`) dan memvalidasi tipe/ukuran file. Master `BBM` mendapat kolom `kode_cabang` (kosong = global, terisi = override cabang). Satu helper `esc()`/`escapeHtml` dipakai di SEMUA sink innerHTML; jalur cetak Flazz A4 meninggalkan `document.write` ke halaman utama (ganti iframe `srcdoc`). Client memakai pola cache sekali-per-sesi untuk dashboard/performa + kompresi gambar sebelum upload. Email alert ke SUPERADMIN via laporan harian.

**Tech Stack:** Google Apps Script V8, Google Drive, CSP meta (`HtmlService.addMetaTag`), vanilla JS client (canvas untuk kompresi), `MailApp`.

## Global Constraints

- **Prasyarat: Fase P0 & P1 selesai** (token server-side, `withLock`, `getDB()` terpusat, cache aktif).
- `esc(v)`/`escapeHtml(v)` wajib dipakai untuk semua data yang berasal dari sheet/user/Drive sebelum masuk `innerHTML`/`href`/`src`/`document.write`/`srcdoc`.
- URL foto di `src`/`href` dianggap data tidak tepercaya — minimal dilewatkan `esc()`; idealnya divalidasi berawalan `https://drive.google.com`/`https://lh3.googleusercontent.com`.
- `Upload` (foto bukti, logo) divalidasi server-side: whitelist `image/jpeg|png|webp|heic|heif`, maks 10MB.
- Foto tetap di-share `ANYONE_WITH_LINK` (tampil di browser anon), namun kini **di-scope per folder cabang** — bukan satu folder global.
- Kolom cabang di master `BBM` bersifat opsional; logika prioritas: harga baris cabang menimpa baris global.
- Commit memakai gaya repo, bahasa Indonesia.

---

### Task 1: Upload Drive per cabang + validasi file

**Files:**
- Modify: `src/DriveOps.js`

**Interfaces:**
- **Consumes:** `uploadImageToDrive(base64Data, filename, subfolderName, cabang)` — signature sudah dipakai dari P0 Task 5 (`processDailyImages` meneruskan `user.cabang`).
- **Produces:** folder `BBM_OPERASIONAL/<cabang>/<subfolderName>/`; validasi mime + ukuran; `fixPhotoPermissions` dan `initDriveFolders` diperbarui mengikuti struktur per cabang.

- [ ] **Step 1: Tulis ulang `uploadImageToDrive`**

Ganti `src/DriveOps.js:20-44` menjadi:

```javascript
function uploadImageToDrive(base64Data, filename, subfolderName, cabang) {
  try {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

    let mimeType = 'image/jpeg';
    let match = base64Data.match(/^data:(.*?);base64,/);
    if (match) mimeType = match[1];
    let base64String = match ? base64Data.split(',')[1] : base64Data;

    if (allowedTypes.indexOf(String(mimeType).toLowerCase()) === -1) {
      throw new Error('Tipe file tidak diizinkan: ' + mimeType);
    }
    const bytes = Utilities.base64Decode(base64String);
    if (bytes.length > 10 * 1024 * 1024) {
      throw new Error('Ukuran file melebihi 10MB');
    }

    const blob = Utilities.newBlob(bytes, mimeType, filename);
    const cabangDir = String(cabang || 'TANPA-CABANG').replace(/[^A-Za-z0-9_-]/g, '');
    const mainFolder = getFolderByNameOrCreate('BBM_OPERASIONAL');
    const branchFolder = getFolderByNameOrCreate(cabangDir, mainFolder);
    const targetFolder = subfolderName ? getFolderByNameOrCreate(subfolderName, branchFolder) : branchFolder;

    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      fileId: file.getId(),
      fileUrl: file.getUrl()
    };
  } catch (e) {
    return {
      success: false,
      error: e.toString()
    };
  }
}
```

> `getFolderByNameOrCreate(folderName, parentFolder)` sudah ada di `DriveOps.js:1-8`; `parentFolder = DriveApp.getRootFolder()` default.

- [ ] **Step 2: Perbarui `initDriveFolders` agar menyusun per cabang**

Ganti `initDriveFolders` (`DriveOps.js:10-18`):

```javascript
function initDriveFolders() {
  let mainFolder = getFolderByNameOrCreate('BBM_OPERASIONAL');
  let branches = getDB().getSheetByName('Cabang');
  let cabangs = [];
  if (branches && branches.getLastRow() > 1) {
    const data = branches.getRange(2, 1, branches.getLastRow() - 1, 2).getValues();
    cabangs = data.map(r => r[0]).filter(c => c);
  }
  cabangs.forEach(function(c) {
    const bf = getFolderByNameOrCreate(String(c).replace(/[^A-Za-z0-9_-]/g, ''), mainFolder);
    getFolderByNameOrCreate('KM_Awal', bf);
    getFolderByNameOrCreate('KM_Akhir', bf);
    getFolderByNameOrCreate('Indikator_BBM', bf);
    getFolderByNameOrCreate('Flazz_TopUp', bf);
    getFolderByNameOrCreate('Flazz_Recon', bf);
    getFolderByNameOrCreate('Struk_BBM', bf);
  });
  return mainFolder.getId();
}
```

> Catatan: bila `subfolderName` di P0/Code.js masih `'Struk_BBM'`/`'Flazz_TopUp'`/dll, folder tersebut kini otomatis dibuat per cabang. Folder lama di root (`BBM_OPERASIONAL/<tipe>/`) dapat dibiarkan memakai tant (data lama) — jalankan `initDriveFolders()` lalu `fixPhotoPermissions()` sekali agar izin konsisten.

- [ ] **Step 3: Teruskan `cabang` dari seluruh call-site server (5 lokasi)**

Setelah P0, `processDailyImages(data, token)` sudah meneruskan `user.cabang` (3 lokasi di `src/Code.js`). Selebihnya di-fix sekarang:

- **`src/SpreadsheetOps.js:750` & `:759`** (di dalam `editDailyTransaction(payload, userInfo)`, ganti foto odo saat edit) — argumen ke-4:

```javascript
  const up = uploadImageToDrive(payload.foto_odo_awal, payload.foto_odo_awal_name || 'odo_awal.jpg', 'KM_Awal', userInfo ? userInfo.cabang : '');
```

(baris `:759` sama dengan `foto_odo_akhir` / `'KM_Akhir'`.)

- **`src/FlazzOps.js:261`, `:397`, `:704`** (TopUp / Tol / Recon) — ketiganya berada di fungsi yang memakai `payload.userInfo` (sudah di-set wrapper P0 sebagai `requireUser(token)`):

```javascript
  let uploadRes = uploadImageToDrive(payload.foto_bukti, payload.foto_bukti_name, 'Flazz_TopUp', payload.userInfo ? payload.userInfo.cabang : '');
```

(`'Flazz_Tol'` di `:397`, `'Flazz_Recon'` di `:704` dengan argumen ke-4 yang sama.)

- [ ] **Step 4: Verifikasi + commit**

Run: `clasp push`; kirim laporan harian dengan foto dari cabang `CBG-BDG` → file masuk `BBM_OPERASIONAL/CBG-BDG/Indikator_BBM/`; coba upload file `.txt` via `uploadImageToDrive` langsung di editor → Expected `{success:false, error:'Tipe file tidak diizinkan: text/plain'}`.

```bash
git add src/DriveOps.js src/SpreadsheetOps.js src/FlazzOps.js
git commit -m "feat: upload foto di-scope per cabang + validasi tipe/ukuran server-side"
```

---

### Task 2: Konfigurasi per cabang — harga BBM overridable

**Files:**
- Modify: `src/SpreadsheetOps.js` (`insertBBM`, `updateBBM`, `getActiveBBM`, tambah `getActiveBBMForCabang`)
- Modify: `src/DatabaseSetup.js` (tambah kolom `kode_cabang` di headers master `BBM` — migrasi otomatis aman)
- Modify: `src/Code.js` (wrapper `apiGetBBMForCabang`)
- Modify: `src/js.html` (dropdown BBM memakai harga cabang)

**Interfaces:**
- **Produces:** `getActiveBBMForCabang(cabang)` → array `{bbm_id, jenis_bbm, harga_per_liter}` dengan prioritas harga baris cabang (override global); wrapper `apiGetBBMForCabang(token)`; `insertBBM`/`updateBBM` menerima `data.kode_cabang` (opsional, kosong = global).

- [ ] **Step 1: Migrasi header master BBM**

Pada `src/DatabaseSetup.js`, di daftar `sheets`, ganti header BBM:

```javascript
  { name: 'BBM', headers: ['bbm_id', 'jenis_bbm', 'harga_per_liter', 'kode_cabang', 'status'] },
```

*(Migrasi aman otomatis: `setupDatabase()` menambahkan kolom baru di ujung kanan tanpa menyentuh data lama.)*

- [ ] **Step 2: Fungsi pengambilan per cabang**

Di `src/SpreadsheetOps.js` setelah `getActiveBBM`, tambahkan:

```javascript
function getActiveBBMForCabang(cabang) {
  const ss = getDB();
  const sheet = ss.getSheetByName('BBM');
  if (!sheet) return [];
  const h = sheetHeaders(sheet);
  const idx = colIndex(h, ['bbm_id', 'jenis_bbm', 'harga_per_liter', 'kode_cabang', 'status']);
  const rows = readRowsCols(sheet, [idx.bbm_id, idx.jenis_bbm, idx.harga_per_liter, idx.kode_cabang, idx.status]);
  const globals = {};
  const overrides = {};
  rows.forEach(function(r) {
    if (String(r[4] || '') !== 'Aktif') return;
    const item = { bbm_id: r[0], jenis_bbm: r[1], harga_per_liter: parseFloat(r[2]) || 0, kode_cabang: r[3] || '' };
    const key = String(item.bbm_id);
    if (item.kode_cabang) {
      if (String(item.kode_cabang) === String(cabang)) overrides[key] = item;
    } else {
      globals[key] = item;
    }
  });
  // prioritas: harga cabang menimpa harga global untuk key yang sama
  const merged = {};
  Object.keys(globals).forEach(function(k) { merged[k] = globals[k]; });
  Object.keys(overrides).forEach(function(k) { merged[k] = overrides[k]; });
  return Object.keys(merged).map(function(k) { return merged[k]; });
}
```

- [ ] **Step 3: Terima `kode_cabang` di insert/update**

Di `insertBBM` (`SpreadsheetOps.js` — cari `function insertBBM`), ubah `appendRow` agar menyertakan kolom cabang opsional:

```javascript
  ss.getSheetByName('BBM').appendRow([id, data.jenis, data.harga, data.kode_cabang || '', 'Aktif']);
```

Di `updateBBM`, update range yang mencakup 5 kolom (id, jenis, harga, kode_cabang, status) dengan pola yang sama — pastikan indeks kolom sesuai urutan header baru.

- [ ] **Step 4: Wrapper API + dropdown client**

Di `src/Code.js` tambahkan:

```javascript
function apiGetBBMForCabang(token) {
  var user = requireUser(token);
  var ck = 'bbm:' + (user.cabang || 'SUPERADMIN');
  var hit = cacheGet(ck);
  if (hit) return hit;
  var out = getActiveBBMForCabang(user.cabang);
  cachePut(ck, out, 120);
  return out;
}
```

Invalidasi cache `bbm:` juga di `invalidateMaster` (`src/CacheUtil.js`) — tambahkan baris ke kedua branch:

```javascript
  c.remove('bbm:' + cabang);
  c.remove('bbm:SUPERADMIN');
```

Di `src/js.html`, pada pengisian dropdown BBM (`:1492`) ganti sumber data: bila `window.__bbmForCabang` kosong, panggil `apiGetBBMForCabang(bbmToken())` dan simpan ke variabel tersebut, lalu render dengan teks label `jenis + ' — Rp ' + harga per liter` sesuai cabang. **Semua nilai di-render lewat `esc()` (Task 3).**

- [ ] **Step 5: Verifikasi + commit**

Run: `clasp push`; `setupDatabase()` → kolom `kode_cabang` muncul di sheet `BBM`; tambah `BBM-001` override `CBG-BDG` harga 7200 → `apiGetBBMForCabang(token)` untuk user `picbdg` → `harga_per_liter` 7200 untuk `BBM-001`, sedangkan user JKT melihat harga global.

```bash
git add src/DatabaseSetup.js src/SpreadsheetOps.js src/Code.js src/CacheUtil.js src/js.html
git commit -m "feat: harga BBM overridable per cabang + dropdown memakai harga cabang"
```

---

### Task 3: Hardening XSS — `esc()` di semua sink + CSP + hapus `document.write`

**Files:**
- Modify: `src/js.html`
- Modify: `src/FlazzScript.html`
- Modify: `src/JalurScript.html`
- Modify: `src/Settings.html`
- Modify: `src/Code.js` (`doGet` — tambah CSP meta)

**Interfaces:**
- **Produces:** `esc(v)` (alias `escapeHtml`) yang tersedia di keempat file HTML; `openPrintWindowFor(html)` menggantikan pola `document.write` pada cetak A4; `doGet` mengirim meta CSP.

- [ ] **Step 1: Definisikan helper `esc()` di keempat file HTML**

Tambahkan blok berikut di **setiap** file `js.html`, `FlazzScript.html`, `JalurScript.html`, `Settings.html` (dalam scope script utama):

```javascript
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escUrl(v) {
    var s = esc(v);
    if (/^(https:\/\/drive\.google\.com|https:\/\/lh3\.googleusercontent\.com|data:image\/)/.test(s)) return s;
    if (/^https:\/\//.test(s)) return s; // domain lain diizinkan tampil, tetap di-escape
    return '';
  }
```

> `escapeAttr` yang sudah ada di `js.html:1611` dapat dibiarkan; `esc()` baru dipakai untuk teks dan nilai HTML. Perhatikan: `js.html` sudah mendapatkan `esc()` (fallback) dari Fase P1 — jangan duplikat; cukup pastikan implementasinya sama dengan blok di atas (ganti bila berbeda).

- [ ] **Step 2: Tambah CSP meta di `doGet`**

Ganti `doGet` di `src/Code.js`:

```javascript
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Laporan BBM & Operasional Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .addMetaTag('Content-Security-Policy',
      "default-src 'self' https: data: blob:; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "img-src 'self' data: blob: https://drive.google.com https://lh3.googleusercontent.com https:; " +
      "connect-src 'self' https:; " +
      "frame-src https://drive.google.com;")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

> Semua skrip app adalah inline, sehingga `'unsafe-inline'` untuk script tak bisa dihindari — CSP di sini mencegah injeksi *external script* (domain lain), bukan XSS inline. Perlindungan XSS utamanya adalah `esc()` di Step 3-6.

- [ ] **Step 3: Terapkan `esc()` di `js.html`**

Untuk setiap tuple berikut, bungkus nilai antard `esc(...)` (nilai berasal dari sheet/user/Drive): `userInfo.nama` dan `userInfo.cabang` (sidebar `:185-187`, alert `:223,229`, sapaan `:1112`); kolom `tanggal`, `cabang`, `supir`, `plat`, `keterangan` pada baris akun dashboard (`:1283-1295`) dan kartu (`:1301-1334`); `performa` (`:1087-1097`); opsi dropdown `nama`/`cabang` (`:1492`, `:1506`); daftar master kendaraan/cabang/supir/BBM (`:2105-2133`, `:2143-2162`, `:2172-2183`, `:2193-2204`); `settings.logo_url` (login `<img src>` di `:357`); dan fungsi `fotoThumbHtml`/gallery — dalam `href`/`src` gunakan `escUrl(...)`, pada `title`/alt teks gunakan `esc(...)`.

Pola target untuk baris dengan template literal:

```javascript
  rowHtml += '<td>' + esc(row.tanggal) + '</td><td>' + esc(row.plat) + '</td>...';
```

Gunakan `esc()` di tempat yang sama dengan `escapeAttr` sebelumnya; **jangan melewatkan kolom yang berasal dari sheet.**

- [ ] **Step 4: Terapkan `esc()` di `FlazzScript.html`**

Card summary (`:179`), baris tabel (`:203`, `:221`), dan modal detail (`:1062-1074`): semua field `card.card_number`, `card.card_name`, `card.driver_id`, `card.status`, `t.notes`, `t.card_name` dibungkus `esc(...)`.

- [ ] **Step 5: Ganti jalur cetak Flazz A4 (`printFlazzA4`) — hilangkan `document.write`**

Di `src/FlazzScript.html`, fungsi `printFlazzA4` (kawasan `:1189-1296`) saat ini membangun `printHtml` berisi `card.card_number`, `card.card_name`, `notes` **tanpa escape** lalu `document.write(printHtml)`. Lakukan:
1. Saat membangun string `printHtml`, bungkus semua nilai sheet/user dengan `esc(...)` (khususnya `card_number`, `card_name`, `notes`, `driver`, `vehicle`, `plat`, tanggal).
2. Ganti dua baris `document.write(printHtml); document.close();` dan panggilan `print()` berikutnya dengan pemanggil:

```javascript
  openPrintWindowFor(printHtml);
```

Tambahkan helper di scope file (bersamaan Step 1), lalu definisikan:

```javascript
  function openPrintWindowFor(html) {
    var f = document.createElement('iframe');
    f.style.position = 'fixed';
    f.style.right = '0';
    f.style.bottom = '0';
    f.style.width = '0';
    f.style.height = '0';
    f.style.border = '0';
    f.srcdoc = html;
    document.body.appendChild(f);
    f.onload = function() {
      setTimeout(function() {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { console.error('print gagal', e); }
      }, 350);
    };
  }
```

> `srcdoc` diset via properti — tidak ada `document.write` pada halaman utama. Nilai sudah dibungkus `esc()` sehingga aman.

- [ ] **Step 6: Terapkan `esc()` di `JalurScript.html` dan `Settings.html`**

- `JalurScript.html`: row template (`:171`) dan tabel (`:287-296`) — field `plat_nomor`, `nama_kendaraan`, `nama_driver`, `rute_tujuan`, `flazz_card_name` dibungkus `esc(...)`.
- `Settings.html`: logo preview (`:88`) — `settings.logo_url` melalui `escUrl(...)` untuk `src`; `app_name`/`company_name`/`footer_text` dibungkus `esc(...)` saat dirender.

- [ ] **Step 7: Verifikasi**

Run: `clasp push`, deploy, lalu di browser:
1. Login, buka dashboard/modal/galeri; pastikan semua tampil normal (regresi render).
2. Masukkan input berbahaya sewaktu menyimpan keterangan: `<img src=x onerror=alert(1)>` sebagai `nama_supir`/`keterangan`/`card_name` — simpan → buka dashboard & modal Flazz → **tidak ada alert**, teks tampil apa adanya (kotak `<>` terlihat sebagai teks/berubah).
3. Kongklusi cetak A4: hasil cetak masih tampil rapi (gunakan print preview).

- [ ] **Step 8: Commit**

```bash
git add src/Code.js src/js.html src/FlazzScript.html src/JalurScript.html src/Settings.html
git commit -m "fix: escaped semua sink innerHTML + CSP meta + cetak A4 tanpa document.write"
```

---

### Task 4: Monitoring, alert SUPERADMIN, cache client & kompresi gambar

**Files:**
- Create: `src/HealthOps.js`
- Modify: `src/js.html` (cache dashboard/performa + kompresi gambar)
- Modify: `src/FlazzScript.html` (kompresi foto topup/recon)
- Modify: `src/DatabaseSetup.js` (`uploadLogo`) — kompresi client sebelum kirim (opsional, sudah dibatasi server)

**Interfaces:**
- **Produces:** `sendAdminAlert(subject, body)`; `dailyHealthReport()` → email harian ke semua SUPERADMIN (dengan status backup Task 6 P1); `dailyHealthReportTrigger()` (setup sekali di editor); client: `__dashCache`/`__perfCache` + `compressImageFile(file, maxDim, quality, cb)`.

- [ ] **Step 1: Buat `src/HealthOps.js`**

```javascript
// ==========================================
// MONITORING & ALERT SUPERADMIN
// ==========================================

function superadminEmails() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) return [];
  const h = sheetHeaders(sheet);
  const idx = colIndex(h, ['email', 'role', 'status', 'username']);
  // Bila kolom 'email' belum ada, gunakan username sebagai alamat dummy? Baca README: tidak ada email di schema.
  // Solusi: baca kolom 'nama' + 'username'; email dikirim ke username bila format email, selain itu ke log.
  const rows = readRowsCols(sheet, [idx.email, idx.role, idx.status, idx.username]);
  const out = [];
  rows.forEach(function(r) {
    if (String(r[1]) === 'SUPERADMIN' && String(r[2]) === 'Aktif') {
      const email = String(r[0] || '').trim();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.push(email);
      else Logger.log('SUPERADMIN tanpa email terdaftar: ' + r[3] + ' (tambahkan kolom email di Pengguna)');
    }
  });
  return out;
}

function sendAdminAlert(subject, body) {
  const emails = superadminEmails();
  if (emails.length === 0) { Logger.log('TIDAK ADA EMAIL SUPERADMIN: ' + subject + ' — ' + body); return { sent: 0 }; }
  emails.forEach(function(e) {
    try {
      MailApp.sendEmail(e, subject, body);
    } catch (err) {
      Logger.log('Gagal kirim alert ke ' + e + ': ' + err);
    }
  });
  return { sent: emails.length };
}

function dailyHealthReport() {
  const ss = getDB();
  const today = new Date();
  let rowsPenggunaan = 0;
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (sheet) rowsPenggunaan = Math.max(0, sheet.getLastRow() - 1);

  let auditCount = 0;
  const auditSheet = ss.getSheetByName('Audit_Log');
  if (auditSheet) auditCount = Math.max(0, auditSheet.getLastRow() - 1);

  let cabangCount = 0;
  const cabangSheet = ss.getSheetByName('Cabang');
  if (cabangSheet) cabangCount = Math.max(0, cabangSheet.getLastRow() - 1);

  const body = [
    'Laporan kesehatan harian ' + Utilities.formatDate(today, 'Asia/Jakarta', 'yyyy-MM-dd'),
    '',
    'Cabang aktif: ' + cabangCount,
    'Total laporan (Penggunaan_BBM): ' + rowsPenggunaan,
    'Baris audit log: ' + auditCount,
    '',
    'Backup: jalankan runDailyBackup() bila trigger belum aktif (setupBackupTrigger()).',
    ''
  ].join('\n');

  const res = sendAdminAlert('[BBM] Laporan Kesehatan Harian', body);
  return { success: true, sent: res.sent };
}

function setupDailyHealthTrigger() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'dailyHealthReport';
  });
  if (triggers.length === 0) {
    ScriptApp.newTrigger('dailyHealthReport')
      .timeBased()
      .atHour(7)
      .everyDays(1)
      .inTimezone('Asia/Jakarta')
      .create();
  }
  return { success: true, msg: triggers.length === 0 ? 'Trigger harian 07:00 dibuat.' : 'Trigger sudah ada.' };
}
```

> **Catatan penting:** schema `Pengguna` saat ini **tidak punya kolom email** (`DatabaseSetup.js:14`). Tambahkan dulu kolom `email` ke header via migrasi di `DatabaseSetup.js` (baris headers `Pengguna`), lalu backfill alamat SUPERADMIN di sheet sebelum mengaktifkan trigger. Bila kolom belum ada, `superadminEmails()` hanya log peringatan (tidak crash).

- [ ] **Step 2: Migrasi kolom `email` di Pengguna**

Di `src/DatabaseSetup.js`, ganti header `Pengguna`:

```javascript
    { name: 'Pengguna', headers: ['user_id', 'username', 'password', 'nama', 'role', 'kode_cabang', 'status', 'email'] },
```

*(Migrasi aman otomatis.)*

- [ ] **Step 3: Cache client dashboard/performa + kompresi gambar di `js.html`**

Di `js.html`, tambahkan variabel scope:

```javascript
  var __dashCache = null;
  var __perfCache = null;
```

Pada handler `getDashboardData` (baris ~1160 & 1222) ubah pola menjadi cek-cache: bila `__dashCache` ada & tidak `force`, pakai; set `__dashCache` setelah data diterima; sediakan flag `window.__dashForce = false` yang diset `true` setelah `saveDailyTransaction`, `apiEditDailyTransaction`, `apiDeleteDailyTransaction` sukses (lalu reset ke `false`). Pola yang sama untuk `getPerformaData` (`__perfCache` + `window.__perfForce`).

Tambahkan helper kompresi:

```javascript
  function compressImageFile(file, maxDim, quality, cb) {
    if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type)) { cb(file ? file : null); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      var img = new Image();
      img.onload = function() {
        var scale = 1;
        if (img.width > maxDim || img.height > maxDim) {
          scale = Math.min(maxDim / img.width, maxDim / img.height);
        }
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          var type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          var dataUrl = canvas.toDataURL(type, quality);
          cb({ dataUrl: dataUrl, name: file.name, size: dataUrl.length });
        } catch (err) {
          cb(null);
        }
      };
      img.onerror = function() { cb(null); };
      img.src = ev.target.result;
    };
    reader.onerror = function() { cb(null); };
    reader.readAsDataURL(file);
  }
```

> Ubah alur `processDailyImages` client (sekitar `:949`): sebelum `processDailyImages(formDataPayload)`, panggil `compressImageFile(file, 1280, 0.7, function(c){ payload.foto_odo_awal = c.dataUrl; ... })` untuk setiap foto (odo awal/akhir/indikator). `payload` dikirim seperti biasa.

- [ ] **Step 4: Kompresi di `FlazzScript.html` (foto topup & recon)**

Di handler submit topup (`:469`) dan recon (`:507`) yang memakai `FileReader.readAsDataURL`, ganti dengan `compressImageFile(file, 1280, 0.7, function(c){ if (c) { payload.foto_bukti = c.dataUrl; payload.foto_bukti_name = c.name; } proceed(); })`. Tambahkan helper `compressImageFile` yang sama di `FlazzScript.html`.

- [ ] **Step 5: Verifikasi + commit**

Run: `clasp push`; di editor: isi kolom `email` SUPERADMIN di sheet, jalankan `setupDailyHealthTrigger()`, lalu `dailyHealthReport()` → terkirim 1 email (atau log peringatan bila email kosong). Di client: pindah-pindah tab dashboard → hanya satu panggilan `getDashboardData` per sesi; simpan transaksi → data segar; upload foto besar (mis. 5MB) → payload terkompres lebih kecil.

```bash
git add src/HealthOps.js src/DatabaseSetup.js src/js.html src/FlazzScript.html src/Settings.html
git commit -m "feat: laporan kesehatan harian ke SUPERADMIN + cache client dashboard/performa + kompresi gambar"
```

---

## Self-Check P2

- [ ] Semua upload Drive ter-scope per cabang + validasi mime/ukuran server-side.
- [ ] Harga BBM dapat berbeda per cabang via `kode_cabang` di master BBM.
- [ ] Tidak ada `document.write` di halaman utama; cetak A4 memakai iframe `srcdoc` ter-escape.
- [ ] Semua sink innerHTML memakai `esc()`/`escUrl()` (audit: `Select-String -Path src\*.html -Pattern "innerHTML"` dan cek tidak ada `innerHTML = .*\+ .*` tanpa `esc(`/`escapeAttr(`).
- [ ] CSP meta aktif di `doGet`.
- [ ] `dailyHealthReport` terdaftar & email SUPERADMIN terisi.
- [ ] Client memakai cache dashboard/performa + kompresi gambar.

**Fase P2 selesai = aplikasi siap dikelola 12 cabang secara independen dan bebas XSS.**

---

## Notes Akhir Fase (P0+P1+P2)

Urutan wajib: **P0 → P1 → P2** (masing-masing dokumen sudah berdiri sendiri dan bisa di-deploy ke staging per fase). Setelah ketiga fase selesai, jalankan:
1. `setupBackupTrigger()` dan `setupDailyHealthTrigger()` di editor.
2. `createSuperadmin()` untuk SUPERADMIN produksi; hapus/migrasikan akun seed.
3. `migrateLegacyPasswords()` bila data lama masih plaintext.
4. Isi email SUPERADMIN dan jalankan `dailyHealthReport()`.
5. Uji lintas-cabang: 2 user per cabang, 12 cabang, simpan transaksi & topup serentak → saldo & ringkasan bulanan akurat, audit log lengkap.