# Rolling Average Efisiensi BBM (Rata-rata 7 Hari) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard menampilkan efisiensi BBM sebagai rata-rata 7 hari per kendaraan (Σ jarak ÷ Σ konsumsi harian hasil formula bar yang sudah ada), dihitung on-the-fly tanpa mengubah database.

**Architecture:** Helper murni `hitungEfisiensi7Hari` mengagregasi window [D−6, D] per kendaraan dari map transaksi yang dibangun sekali dari array `data` yang sudah dimuat penuh. `getRecentTransactions` mengganti perhitungan efisiensi/status per baris dengan hasil helper dan menambah field `efisiensi_label`. Client `js.html` hanya menambah label kecil "(Rata-rata 7 Hari)".

**Tech Stack:** Google Apps Script (V8), Google Sheets sebagai DB, Bootstrap 5 + Bootstrap Icons.

## Global Constraints

- File yang boleh berubah: `src/SpreadsheetOps.js` dan `src/js.html`. TIDAK ada perubahan sheet, kolom, atau fungsi simpan (`saveTransactionEndOfDay` tidak disentuh).
- Kolom `km_per_liter` (index 23) tetap berisi angka harian murni — raw fact untuk audit.
- Agregasi liter = replikasi PERSIS formula harian eksisting termasuk guard: `literKonsumsi = literBeli + ((barAwal - barAkhir) * literPerBar)`; jika `<= 0` maka pakai `literBeli`.
- Window = 7 hari kalender INKLUSIF berakhir di tanggal baris: [D−6, D].
- Index kolom `Penggunaan_BBM`: km_tempuh=16, liter_bbm=18, bar_awal=11, bar_akhir=15, vehicle_id=6, tanggal=2.
- Status Boros/Normal/Irit: threshold lama terhadap `standar_km_l` (`< standar` Boros, `≤ 1.3×standar` Normal, else Irit), tapi kini dari nilai rata-rata.
- Field output baru bernama `efisiensi_label`, isinya `'Rata-rata 7 Hari'` saat efisiensi valid, else `''`.
- Label tampilan web: `<small class='text-muted'>(Rata-rata 7 Hari)</small>` setelah angka KM/L.
- Tidak ada test framework; verifikasi otomatis = `node --check src/SpreadsheetOps.js` saja.
- Gaya kode: const/let, single quote, string concatenation seperti file sekitarnya, komentar indeks kolom seperlunya.

---

### Task 1: Backend — helper rolling average + integrasi di getRecentTransactions

**Files:**
- Modify: `src/SpreadsheetOps.js` — tambah helper sebelum `getRecentTransactions` (setelah `driveThumbnail`, sekitar line 162); ubah badan `getRecentTransactions` (line ~193–228)

**Interfaces:**
- Consumes: array `data` penuh hasil `sheet.getDataRange().getValues()` yang sudah ada di `getRecentTransactions`; `literPerBar` per kendaraan yang sudah dihitung di loop.
- Produces:
  - `hitungEfisiensi7Hari(rowsKendaraan, tanggalD, literPerBar)` → `{ efisiensi: string ('' jika invalid), label: string }`
  - Field `efisiensi_label: string` pada tiap objek result `getRecentTransactions`.

- [ ] **Step 1: Baca file & pastikan posisi**

Buka `src/SpreadsheetOps.js`. Konfirmasi `driveThumbnail` di sekitar line 158–162 dan `getRecentTransactions` mulai line 164. Konfirmasi blok efisiensi lama di line ~208–217 (`kmTempuh` / `efisiensiVal` / `efisiensi` / `statusEfisiensi`).

- [ ] **Step 2: Tambahkan helper `hitungEfisiensi7Hari`**

Sisipkan tepat sebelum `function getRecentTransactions(...)`:

```javascript
function hitungEfisiensi7Hari(rowsKendaraan, tanggalD, literPerBar) {
  const d = new Date(tanggalD);
  if (isNaN(d.getTime())) return { efisiensi: '', label: '' };
  const akhir = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const awal = new Date(akhir.getTime());
  awal.setDate(awal.getDate() - 6);

  let totalKm = 0;
  let totalLiter = 0;
  rowsKendaraan.forEach(function (r) {
    const t = new Date(r[2]); // tanggal index 2
    if (isNaN(t.getTime())) return;
    const hari = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    if (hari < awal || hari > akhir) return;
    totalKm += parseFloat(r[16]) || 0; // km_tempuh index 16
    const literBeli = parseFloat(r[18]) || 0; // liter_bbm index 18
    const barA = parseFloat(r[11]) || 0;      // bar_awal index 11
    const barK = parseFloat(r[15]) || 0;      // bar_akhir index 15
    let literKonsumsi = literBeli + ((barA - barK) * literPerBar);
    if (literKonsumsi <= 0) literKonsumsi = literBeli;
    totalLiter += literKonsumsi;
  });

  const efisiensi = (totalLiter > 0 && totalKm > 0) ? (totalKm / totalLiter).toFixed(2) : '';
  return { efisiensi: efisiensi, label: efisiensi ? 'Rata-rata 7 Hari' : '' };
}
```

- [ ] **Step 3: Bangun map transaksi per kendaraan**

Di dalam `getRecentTransactions`, tepat sebelum `const result = [];` (line ~193), sisipkan:

```javascript
  let transaksiMap = {};
  for (let i = 1; i < data.length; i++) {
    const vid = data[i][6]; // vehicle_id index 6
    if (!vid) continue;
    if (!transaksiMap[vid]) transaksiMap[vid] = [];
    transaksiMap[vid].push(data[i]);
  }
```

- [ ] **Step 4: Ganti blok efisiensi harian dengan rolling average**

Ganti keseluruhan blok ini (line ~208–217):

```javascript
    let kmTempuh = parseFloat(row[16]) || 0;
    let efisiensiVal = literKonsumsi > 0 ? (kmTempuh / literKonsumsi) : 0;
    let efisiensi = efisiensiVal > 0 ? efisiensiVal.toFixed(2) : '';

    let statusEfisiensi = '';
    if (efisiensiVal > 0 && k.standar > 0) {
      if (efisiensiVal < k.standar) statusEfisiensi = 'Boros';
      else if (efisiensiVal <= k.standar * 1.3) statusEfisiensi = 'Normal';
      else statusEfisiensi = 'Irit';
    }
```

dengan:

```javascript
    let kmTempuh = parseFloat(row[16]) || 0;

    let roll = hitungEfisiensi7Hari(transaksiMap[row[6]] || [row], row[2], literPerBar);
    let efisiensi = roll.efisiensi;

    let statusEfisiensi = '';
    let efisiensiVal = parseFloat(efisiensi);
    if (efisiensiVal > 0 && k.standar > 0) {
      if (efisiensiVal < k.standar) statusEfisiensi = 'Boros';
      else if (efisiensiVal <= k.standar * 1.3) statusEfisiensi = 'Normal';
      else statusEfisiensi = 'Irit';
    }
```

PERHATIAN: baris `let literBeli ... let literKonsumsi ...` (line ~200–206) JANGAN dihapus — variabel `literKonsumsi` masih dipakai field `liter:` di result.push (konsumsi harian tetap tampil di dashboard).

- [ ] **Step 5: Tambahkan field `efisiensi_label` ke result**

Di dalam `result.push({...})`, tambahkan satu baris setelah `status_efisiensi: statusEfisiensi,`:

```javascript
      efisiensi_label: roll.label,
```

- [ ] **Step 6: Verifikasi syntax**

Run: `node --check src/SpreadsheetOps.js`
Expected: exit code 0, tanpa output.

- [ ] **Step 7: Commit**

```bash
git add src/SpreadsheetOps.js
git commit -m "feat: compute 7-day rolling average efficiency in dashboard data"
```

---

### Task 2: Frontend — label "(Rata-rata 7 Hari)" di table & card

**Files:**
- Modify: `src/js.html` — dua lokasi ekspresi efisiensi identik: cell table (~line 502) dan card mobile (~line 536)

**Interfaces:**
- Consumes: field `efisiensi_label: string` dari Task 1.
- Produces: tampilan `9.57 KM/L (Rata-rata 7 Hari) [badge]`.

- [ ] **Step 1: Ganti kedua ekspresi efisiensi (replaceAll)**

Di `src/js.html` ada DUA kemunculan identik dari:

```javascript
(row.efisiensi ? row.efisiensi + " KM/L" + efisiensiBadge(row.status_efisiensi) : "-")
```

Ganti KEDUANYA menjadi:

```javascript
(row.efisiensi ? row.efisiensi + " KM/L" + (row.efisiensi_label ? " <small class='text-muted'>(" + row.efisiensi_label + ")</small>" : "") + efisiensiBadge(row.status_efisiensi) : "-")
```

Satu kemunculan di baris `<td>` table history, satu di `<small>` card mobile. Keduanya harus berubah.

- [ ] **Step 2: Verifikasi manual edit**

Baca ulang kedua lokasi (sekitar line 502 dan 536). Pastikan tidak ada kemunculan tersisa dari pola lama:
Run: pemeriksaan visual via Read — pola `+ " KM/L" + efisiensiBadge(` harus selalu didahului blok label baru.

- [ ] **Step 3: Commit**

```bash
git add src/js.html
git commit -m "feat: show 7-day average label on dashboard efficiency"
```

---

### Task 3: Deploy & verifikasi manual end-to-end

**Files:**
- Tidak ada perubahan kode.

- [ ] **Step 1: Push ke Apps Script**

Run (dari folder `src/`): `clasp push`
Expected: `Pushed N files.`

- [ ] **Step 2: Uji skenario**

1. Kendaraan riwayat fluktuatif (mis. 34 lalu 6 KM/L) → dashboard menampilkan angka stabil + teks kecil "(Rata-rata 7 Hari)".
2. Kendaraan baru 1 transaksi → efisiensi = konsumsi hariannya sendiri, label tetap muncul.
3. Sheet `Penggunaan_BBM` kolom `km_per_liter` → masih angka harian murni (tidak tertimpa rata-rata).
4. Badge Boros/Normal/Irit konsisten vs `standar_km_l` kendaraan.

- [ ] **Step 3: Commit perbaikan jika ada bug**

```bash
git add -A
git commit -m "fix: adjust rolling average after manual verification"
```
