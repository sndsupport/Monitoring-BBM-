# Rolling Efisiensi 14 Trip (dari 7 Trip) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah window efisiensi rolling & siklus laporan performa dari 7 trip menjadi 14 trip, dengan window diparameterisasi agar mudah diubah di masa depan.

**Architecture:** `hitungEfisiensi7Riwayat` diparameterisasi menjadi `hitungEfisiensiRiwayat(trxs, currIdx, literPerBar, tripCount)` plus konstanta `EFISIENSI_TRIP_WINDOW = 14` yang dipakai kedua caller (dashboard rolling & laporan performa non-overlap). Konsumsi liter per baris tidak disentuh.

**Tech Stack:** Google Apps Script (V8), Bootstrap 5, harness test node (`scratch/+/helpers/gas-mock.mjs`).

## Global Constraints

- File yang berubah: `src/SpreadsheetOps.js`, `src/Index.html`, `src/Config.gs`, `docs/superpowers/specs/2026-09-06-estimasi-km-jarum-design.md`; file test baru `scratch/efisiensi-window.test.mjs`.
- Rumus konsumsi akuntansi tangki per baris (`literKonsumsi = literBeli + ((barAwal - barAkhir) * literPerBar)`, fallback `literBeli` jika `<= 0`) TETAP — hanya window agregasi yang berubah.
- Guard `Math.max(0, currIdx - (w - 1))` wajib dipertahankan (fix crash 4072ff1).
- Laporan performa `getPerformaSummary` tetap batch NON-OVERLAP, siklus jadi 14 (`(i + 1) % EFISIENSI_TRIP_WINDOW`).
- Konstanta pakai `var` (konsisten Config.gs); body fungsi pakai `const`/`let`, single quote, komentar indeks kolom seperlunya.
- Label dinamis `'Rata-rata ' + w + ' Trip'`; bila ada `km_sumber === 'ESTIMASI'` tambah `' ⚠ termasuk estimasi'`.
- Index kolom `Penggunaan_BBM` (tidak berubah): km_tempuh=16, liter_bbm=18, bar_awal=11, bar_akhir=15, vehicle_id=6, tanggal=2, nama_supir=26, km_sumber=29.
- Wajib menaikkan `PAGE_VER` di `src/Config.gs` saat file UI berubah.
- Verifikasi otomatis: `node --check src/SpreadsheetOps.js`, `node scratch/efisiensi-window.test.mjs` (diharapkan 14 pass / SEMUA LULUS), dan grep sisa hardcode "7" (harus bersih di `src/`): pola `7 Trip`, `7 trip`, `7-trip`, `Per 7`, `kelipatan 7`, `currIdx - 6`, `% 7`, `hitungEfisiensi7Riwayat`, `Rata-rata 7`.

---

### Task 1: Backend — parameterisasi window efisiensi di SpreadsheetOps.js

**Files:**
- Modify: `src/SpreadsheetOps.js:638-681` (ganti fungsi menjadi `hitungEfisiensiRiwayat` + konstanta), `:744-747` (laporan performa), `:865` (dashboard)
- Test: `scratch/efisiensi-window.test.mjs` (baru)

**Interfaces:**
- Produces: `var EFISIENSI_TRIP_WINDOW = 14;` dan `hitungEfisiensiRiwayat(trxs, currIdx, literPerBar, tripCount)` → `{ efisiensi, label, isDataCukup, adaEstimasi, total_km, total_beli, total_konsumsi, tgl_mulai, tgl_selesai, supir }`. `tripCount` opsional: `> 0` dipakai sebagai ukuran window, selain itu default `EFISIENSI_TRIP_WINDOW`.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Tulis test gagal**

Buat `scratch/efisiensi-window.test.mjs`:

```javascript
// RED/GREEN harness: window efisiensi rolling diparameterisasi (default 14 trip).
// Usage: node scratch/efisiensi-window.test.mjs
import { loadContext } from './helpers/gas-mock.mjs';

const ctx = loadContext(['SpreadsheetOps.js'], {
  Logger: { log: () => {} },
  console: console
});

let pass = 0, fail = 0;
const check = (cond, label, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + label + (cond ? '' : (extra !== undefined ? ` | ${extra}` : '')));
  cond ? pass++ : fail++;
};

// N baris trip identik: km_tempuh=100, liter_bbm=10, bar 3->1, literPerBar=10.
function makeTrxs(n, opt) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const r = new Array(32).fill('');
    r[2]  = new Date(2026, 0, i + 1);  // tanggal
    r[6]  = 'V-1';                      // vehicle_id
    r[11] = 3;                          // bar_awal
    r[15] = 1;                          // bar_akhir
    r[16] = 100;                        // km_tempuh
    r[18] = 10;                         // liter_bbm
    r[26] = 'Supir A';                  // nama_supir
    if (opt && opt.estimasiDi === i) r[29] = 'ESTIMASI'; // km_sumber
    rows.push(r);
  }
  return rows;
}

const f = ctx.hitungEfisiensiRiwayat;

// KASUS 1: 14 trip cukup -> efisiensi & label "Rata-rata 14 Trip"
let r = f(makeTrxs(14), 13, 10);
check(r.isDataCukup === true, '14 trip: isDataCukup true');
check(r.efisiensi === '8.75', '14 trip: efisiensi 1400/160 = 8.75', r.efisiensi);
check(r.label === 'Rata-rata 14 Trip', '14 trip: label "Rata-rata 14 Trip"', r.label);
check(r.total_km === 1400 && r.total_beli === 140, '14 trip: total_km & total_beli', JSON.stringify(r));

// KASUS 2: hanya 7 trip -> isDataCukup false (butuh 14)
r = f(makeTrxs(7), 6, 10);
check(r.isDataCukup === false, '7 trip: belum cukup (butuh 14)');
check(r.efisiensi === '', '7 trip: efisiensi kosong', r.efisiensi);
check(r.label === '', '7 trip: label kosong', r.label);

// KASUS 3: guard slice utk currIdx kecil pada riwayat panjang — tidak crash
r = f(makeTrxs(20), 5, 10);
check(r.isDataCukup === false, 'riwayat 20, currIdx 5: isDataCukup false, tanpa crash');

// KASUS 4: override tripCount=7 -> kompatibel (700/90 = 7.78)
r = f(makeTrxs(14), 6, 10, 7);
check(r.isDataCukup === true, 'override window 7: isDataCukup true');
check(r.efisiensi === '7.78', 'override window 7: efisiensi 700/90 = 7.78', r.efisiensi);
check(r.label === 'Rata-rata 7 Trip', 'override window 7: label "Rata-rata 7 Trip"', r.label);

// KASUS 5: ada baris ESTIMASI di window -> label menandai estimasi
r = f(makeTrxs(14, { estimasiDi: 5 }), 13, 10);
check(r.adaEstimasi === true, 'ESTIMASI: adaEstimasi true');
check(r.label === 'Rata-rata 14 Trip ⚠ termasuk estimasi', 'ESTIMASI: label menandai estimasi', r.label);

console.log(`\n${fail === 0 ? 'SEMUA LULUS' : fail + ' GAGAL'} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `node scratch/efisiensi-window.test.mjs`
Expected: FAIL (`ctx.hitungEfisiensiRiwayat` belum ada → `Cannot read properties of undefined`).

- [ ] **Step 3: Implementasi**

Ganti blok `src/SpreadsheetOps.js:638-681` persis dengan:

```javascript
var EFISIENSI_TRIP_WINDOW = 14;

// Menghitung efisiensi rolling dari EFISIENSI_TRIP_WINDOW trip terakhir yang
// berakhir di currIdx. Frekuensi pemanggilan (tiap trip / tiap kelipatan window)
// ditentukan oleh caller; fungsi ini murni menghitung window-nya saja.
// tripCount opsional untuk meng-override ukuran window (dipakai test & kompatibilitas).
function hitungEfisiensiRiwayat(trxs, currIdx, literPerBar, tripCount) {
  if (!trxs || currIdx < 0) return { efisiensi: '', label: '', isDataCukup: false };

  const w = (tripCount > 0) ? tripCount : EFISIENSI_TRIP_WINDOW;
  // Math.max(0, ...) wajib: slice() dengan start negatif diinterpretasikan
  // relatif dari AKHIR array (bukan diklem ke 0), sehingga untuk currIdx < w-1
  // pada trxs yang panjang, start bisa > end dan slice() balik array kosong
  // -> recentRows[0] undefined -> crash saat diakses di bawah.
  let recentRows = trxs.slice(Math.max(0, currIdx - (w - 1)), currIdx + 1);
  let isDataCukup = recentRows.length === w;

  let totalKm = 0;
  let totalBeli = 0;
  let adaEstimasi = false;
  recentRows.forEach(function (r) {
    totalKm += parseFloat(r[16]) || 0;
    totalBeli += parseFloat(r[18]) || 0;
    if (String(r[29]) === 'ESTIMASI') adaEstimasi = true;
  });

  const barAwalPertama = parseFloat(recentRows[0][11]) || 0;
  const barAkhirTerakhir = parseFloat(recentRows[recentRows.length - 1][15]) || 0;

  let totalKonsumsi = totalBeli + ((barAwalPertama - barAkhirTerakhir) * literPerBar);
  if (totalKonsumsi <= 0) totalKonsumsi = totalBeli;

  const efisiensi = (totalKonsumsi > 0 && totalKm > 0) ? (totalKm / totalKonsumsi).toFixed(2) : '';
  const label = efisiensi ? ('Rata-rata ' + w + ' Trip' + (adaEstimasi ? ' ⚠ termasuk estimasi' : '')) : '';

  return {
    efisiensi: efisiensi,
    label: label,
    isDataCukup: isDataCukup,
    adaEstimasi: adaEstimasi,
    total_km: totalKm,
    total_beli: totalBeli,
    total_konsumsi: totalKonsumsi,
    tgl_mulai: recentRows[0][2],
    tgl_selesai: recentRows[recentRows.length - 1][2],
    supir: recentRows[recentRows.length - 1][26] || '-'
  };
}
```

- [ ] **Step 4: Update kedua caller**

`src/SpreadsheetOps.js:744-747`:

```javascript
      // Laporan performa memakai siklus EFISIENSI_TRIP_WINDOW-trip non-overlap (bukan rolling),
      // supaya tiap baris laporan mewakili periode berbeda, tidak tumpang tindih.
      if ((i + 1) % EFISIENSI_TRIP_WINDOW !== 0) continue;
      let roll = hitungEfisiensiRiwayat(trxs, i, literPerBar, EFISIENSI_TRIP_WINDOW);
```

`src/SpreadsheetOps.js:865`:

```javascript
    let roll = hitungEfisiensiRiwayat(trxs, currIdx, literPerBar, EFISIENSI_TRIP_WINDOW);
```

- [ ] **Step 5: Jalankan test & cek syntax**

Run: `node scratch/efisiensi-window.test.mjs` → expected `SEMUA LULUS (14 pass, 0 fail)`.
Run: `node --check src/SpreadsheetOps.js` → exit code 0, tanpa output.

- [ ] **Step 6: Commit**

```bash
git add src/SpreadsheetOps.js scratch/efisiensi-window.test.mjs
git commit -m "feat(bbm): window efisiensi rolling 7-trip jadi 14-trip (parameterizable)"
```

---

### Task 2: Frontend — teks performa 14 trip & PAGE_VER

**Files:**
- Modify: `src/Index.html:740, 774, 775`; `src/Config.gs:10`

**Interfaces:**
- Consumes: konstanta/label dari Task 1 tidak dipakai frontend (label server-generated); perubahan ini murni teks statis.

- [ ] **Step 1: Ganti teks performa di Index.html**

Ganti persis:
- `src/Index.html:740`: `Ringkasan Performa Kendaraan (Per 7 Trip)` → `Ringkasan Performa Kendaraan (Per 14 Trip)`
- `src/Index.html:774`: `Belum ada rekap performa 7 trip` → `Belum ada rekap performa 14 trip`
- `src/Index.html:775`: `Data akan muncul setelah kendaraan menyelesaikan kelipatan 7 perjalanan.` → `Data akan muncul setelah kendaraan menyelesaikan kelipatan 14 perjalanan.`

- [ ] **Step 2: Bump cache version**

`src/Config.gs:10` → `var PAGE_VER = '20260917v7';` (wajib karena UI berubah, lihat komentar "Naikkan SELALU..." di atasnya).

- [ ] **Step 3: Verifikasi tidak ada hardcode 7 tersisa di src/**

Run grep (tool Grep) pada folder `src/` dengan pola: `7 Trip` , `7 trip` , `7-trip` , `Per 7` , `kelipatan 7` , `currIdx - 6` , `% 7`.
Expected: tidak ada match di `src/` (kemunculan di `docs/` historis dibolehkan).

- [ ] **Step 4: Commit**

```bash
git add src/Index.html src/Config.gs
git commit -m "feat(bbm): label performa & empty-state jadi 14 trip; bump PAGE_VER"
```

---

### Task 3: Update referensi doc & verifikasi menyeluruh + deploy

**Files:**
- Modify: `docs/superpowers/specs/2026-09-06-estimasi-km-jarum-design.md:97`
- Tidak ada perubahan kode lain.

- [ ] **Step 1: Perbarui referensi spesifikasi**

`docs/superpowers/specs/2026-09-06-estimasi-km-jarum-design.md:97` dari:

```
- **Performa 7-trip (`hitungEfisiensi7Riwayat`)**: menjumlah km_tempuh (index 16) & liter (index 18); km = estKm masuk natural, km/L ≈ standar → label "sesuai standar". Transparan via badge.
```

menjadi:

```
- **Performa 14-trip (`hitungEfisiensiRiwayat`)**: menjumlah km_tempuh (index 16) & liter (index 18); km = estKm masuk natural, km/L ≈ standar → label "sesuai standar". Transparan via badge.
```

- [ ] **Step 2: Sweep akhir**

Run: `node --check src/SpreadsheetOps.js` → exit 0.
Run: `node scratch/efisiensi-window.test.mjs` → `SEMUA LULUS (14 pass, 0 fail)`.
Grep folder `src/` untuk pola: `hitungEfisiensi7Riwayat`, `Rata-rata 7`, `currIdx - 6`, `EFISIENSI_TRIP_WINDOW`.
Expected: tidak ada match untuk nama lama; `EFISIENSI_TRIP_WINDOW` muncul 3x (definisi + 2 caller).

- [ ] **Step 3: Commit docs**

```bash
git add docs/superpowers/specs/2026-09-06-estimasi-km-jarum-design.md
git commit -m "docs: referensi hitungEfisiensi7Riwayat jadi hitungEfisiensiRiwayat (14 trip)"
```

- [ ] **Step 4: Deploy & uji manual**

Run (dari `src/`): `clasp push` → `Pushed N files.`
Uji manual:
1. Dashboard — kendaraan dengan ≥14 trip menampilkan KM/L + label `(Rata-rata 14 Trip)`.
2. Kendaraan dengan 7–13 trip → `Data Belum Cukup` (perilaku baru; sebelumnya dengan 7 trip sudah cukup).
3. Halaman Ringkasan Performa — periode non-overlap 14-trip.
4. Kendaraan jarum (ESTIMASI) → badge `⚠ termasuk estimasi` tetap muncul.

- [ ] **Step 5: Commit perbaikan jika ada bug dari uji manual**

```bash
git add -A
git commit -m "fix(bbm): penyesuaian rolling 14-trip setelah verifikasi manual"
```

---

## Catatan Konsekuensi untuk User

- Kendaraan yang saat ini punya 7–13 trip akan berubah menjadi "Data Belum Cukup" sampai menyelesaikan 14 trip (perilaku baru yang diinginkan, konsekuensi window diperbesar).
- Konsumsi liter per baris (`liter`) dan kolom `km_per_liter` TIDAK berubah — hanya angka efisiensi rata-rata & status yang terpengaruh.
- Konstanta `EFISIENSI_TRIP_WINDOW` menjadi satu titik ubah untuk window di masa depan.