# Enforced Gate Rekonsiliasi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blokir pemrosesan Rekonsiliasi Flazz (step 3) jika tidak ada minimal 1 laporan valid ber-foto KM awal+akhir pada periode kartu, di backend (utama) dan frontend.

**Architecture:** Backend Apps Script diblokir lewat helper `hasCompliantFlazzLaporan` yang dipanggil di `saveFlazzRecon`, plus endpoint `checkReconGate`/`apiCheckReconGate` untuk umpan balik frontend. Frontend menampilkan status hijau/merah saat kartu dipilih dan melakukan cek lapisan kedua sebelum submit.

**Tech Stack:** Google Apps Script (V8, `runtimeVersion V8`), Sheet `Penggunaan_BBM` & `Kendaraan`, clasp untuk deploy.

## Global Constraints

- Spreadsheet ID produksi: `1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8` (dipakai verbatim di `FlazzOps.js`).
- Kolom `Kendaraan`: `vehicle_id` = index 0, `jenis_indikator` = index 11. Jarum = `ANALOG_JARUM`.
- Kolom `Penggunaan_BBM` (dipetakan dengan `headers.indexOf`, JANGAN hard-code index): `metode_pembayaran`, `flazz_card_id`, `timestamp`, `vehicle_id`, `foto_km_awal`, `km_awal_confirmed`, `foto_km_akhir`, `km_akhir_confirmed`.
- Periode gate = `timestamp > sinceDate`, di mana `sinceDate` = momen penyerahan kartu (`used_at`/`date` pada `Flazz_Usage` ber-status `DIBERIKAN`). `sinceDate` null → semua baris dianggap dalam periode.
- Kriteria valid per baris FLAZZ kartu tsb:
  - `foto_km_awal` terisi non-kosong DAN `foto_km_akhir` terisi non-kosong (wajib untuk semua tipe).
  - Tipe Bar (`jenis_indikator !== 'ANALOG_JARUM'`, fallback `DIGITAL_BAR`): PLUS `km_awal_confirmed > 0` DAN `km_akhir_confirmed > 0`.
  - Tipe Jarum: angka KM TIDAK dipersyaratkan.
  - Pengeluaran (`biaya_bbm`, `biaya_toll`) boleh 0 — tidak diwajibkan.
  - Tipe Bar: KM aktual (>0) wajib → baris `km_sumber='ESTIMASI'` TIDAK lolos. Tipe Jarum: foto cukup, baris estimasi tetap dapat lolos.
- Aplikasi tidak punya framework test otomatis → verifikasi via `clasp push` dari direktori `src`, lalu cek manual di browser + fungsi Logger di `src/debug.js`.

---

### Task 1: Helper backend `hasCompliantFlazzLaporan` + endpoint `checkReconGate` + wrapper API

**Files:**
- Modify: `src/FlazzOps.js` (tambah helper + `checkReconGate` sebelum `function saveFlazzRecon`)
- Modify: `src/Code.js` (tambah wrapper `apiCheckReconGate`)
- Modify: `src/debug.js` (tambah smoke test `testReconGate`)

**Interfaces:**
- Produces: `hasCompliantFlazzLaporan(cardId, sinceDate, ss) → boolean`; `checkReconGate(cardId) → { eligible: boolean, reason: string }`; `apiCheckReconGate(cardId)`.
- Consumes: tidak ada dari task lain; dipakai Task 2 (integrasi `saveFlazzRecon`) dan Task 3/4 (frontend via `apiCheckReconGate`).

- [ ] **Step 1: Tulis smoke test di `src/debug.js`** (append di akhir file)

```js
function testReconGate() {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const cardSheet = ss.getSheetByName('Flazz_Card');
  const cData = cardSheet.getDataRange().getValues();
  const cHeaders = cData[0];
  const cId = cHeaders.indexOf('id');
  if (cId < 0) { Logger.log('NO card id col'); return; }
  const sampleCard = String(cData[1][cId]);
  Logger.log('testReconGate card=' + sampleCard + ' result=' + JSON.stringify(checkReconGate(sampleCard)));
  const usageSheet = ss.getSheetByName('Flazz_Usage');
  if (usageSheet) {
    const uData = usageSheet.getDataRange().getValues();
    const uHeaders = uData[0];
    const uCard = uHeaders.indexOf('card_id');
    const uStatus = uHeaders.indexOf('status');
    let found = false;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][uCard]) === sampleCard && uData[i][uStatus] === 'DIBERIKAN') { found = true; break; }
    }
    Logger.log('testReconGate hasActiveUsage=' + found);
  }
}
```

- [ ] **Step 2: Push & jalankan test — pastikan gagal (fungsi belum ada)**

Run: `clasp push` (dari `src`). Buka Editor Apps Script → pilih fungsi `testReconGate` → Run → lihat Logs.
Expected: FAIL — error `ReferenceError: checkReconGate is not defined`.

- [ ] **Step 3: Implement helper + endpoint di `src/FlazzOps.js`**

Tambahkan tepat sebelum `function saveFlazzRecon(payload) {` (baris 538):

```js
// Gate rekonsiliasi: wajib minimal 1 laporan FLAZZ valid (foto KM awal+akhir terisi;
// utk tipe Bar juga KM aktual >0) pada periode kartu (timestamp > sinceDate).
// sinceDate null → semua baris dianggap dalam periode (konsisten dengan ledger).
function hasCompliantFlazzLaporan(cardId, sinceDate, ss) {
  if (!ss) ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const since = sinceDate ? new Date(sinceDate).getTime() : null;

  const kendSheet = ss.getSheetByName('Kendaraan');
  const jenisMap = {};
  if (kendSheet) {
    const kd = kendSheet.getDataRange().getValues();
    const kHeaders = kd[0];
    const kVeh = kHeaders.indexOf('vehicle_id');
    const kJenis = kHeaders.indexOf('jenis_indikator');
    for (let i = 1; i < kd.length; i++) {
      if (kVeh > -1) jenisMap[String(kd[i][kVeh])] = (kJenis > -1 && kd[i][kJenis]) ? String(kd[i][kJenis]) : 'DIGITAL_BAR';
    }
  }

  const bbmSheet = ss.getSheetByName('Penggunaan_BBM');
  if (!bbmSheet) return false;
  const data = bbmSheet.getDataRange().getValues();
  const h = data[0];
  const cMetode = h.indexOf('metode_pembayaran');
  const cCard = h.indexOf('flazz_card_id');
  const cStamp = h.indexOf('timestamp');
  const fallbackStamp = h.indexOf('tanggal');
  const cVeh = h.indexOf('vehicle_id');
  const cFotoAwal = h.indexOf('foto_km_awal');
  const cFotoAkhir = h.indexOf('foto_km_akhir');
  const cKmAwal = h.indexOf('km_awal_confirmed');
  const cKmAkhir = h.indexOf('km_akhir_confirmed');

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (cMetode > -1 && row[cMetode] !== 'FLAZZ') continue;
    if (cCard > -1 && String(row[cCard]) !== String(cardId)) continue;
    if (since !== null) {
      const stampIdx = cStamp > -1 ? cStamp : fallbackStamp;
      const raw = (stampIdx > -1) ? row[stampIdx] : null;
      const dt = (raw instanceof Date) ? raw : new Date(raw);
      if (raw === null || isNaN(dt.getTime())) continue;
      if (dt.getTime() <= since) continue;
    }

    const photoAwal = cFotoAwal > -1 ? String(row[cFotoAwal] || '').trim() : '';
    const photoAkhir = cFotoAkhir > -1 ? String(row[cFotoAkhir] || '').trim() : '';
    if (photoAwal === '' || photoAkhir === '') continue;

    const type = (cVeh > -1) ? (jenisMap[String(row[cVeh])] || 'DIGITAL_BAR') : 'DIGITAL_BAR';
    if (type === 'ANALOG_JARUM') return true;

    const kmAwal = cKmAwal > -1 ? (parseFloat(row[cKmAwal]) || 0) : 0;
    const kmAkhir = cKmAkhir > -1 ? (parseFloat(row[cKmAkhir]) || 0) : 0;
    if (kmAwal > 0 && kmAkhir > 0) return true;
  }
  return false;
}

// Endpoint untuk frontend: apa kartu boleh direkonsiliasi?
function checkReconGate(cardId) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const usageSheet = ss.getSheetByName('Flazz_Usage');
    let sinceDate = null;
    if (usageSheet) {
      const uData = usageSheet.getDataRange().getValues();
      const uHeaders = uData[0];
      const uCard = uHeaders.indexOf('card_id');
      const uStatus = uHeaders.indexOf('status');
      const uUsed = uHeaders.indexOf('used_at');
      const uDate = uHeaders.indexOf('date');
      // Loop ke bawah → menyimpan usage DIBERIKAN terakhir (pola sama dengan saveFlazzRecon)
      for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][uCard]) === String(cardId) && uData[i][uStatus] === 'DIBERIKAN') {
          const raw = (uUsed > -1 && uData[i][uUsed]) || uData[i][uDate];
          const dt = new Date(raw);
          if (!isNaN(dt.getTime())) sinceDate = dt;
        }
      }
    }
    const eligible = hasCompliantFlazzLaporan(cardId, sinceDate, ss);
    return {
      eligible: eligible,
      reason: eligible
        ? 'Laporan valid dengan foto KM awal & akhir terdeteksi.'
        : 'Belum ada laporan valid dengan foto KM awal & akhir pada periode kartu ini.'
    };
  } catch (e) {
    return { eligible: false, reason: 'Gagal memeriksa gate: ' + e.toString() };
  }
}
```

- [ ] **Step 4: Tambah wrapper di `src/Code.js`** (dekat wrapper Flazz lain, setelah baris 213 `apiSaveFlazzRecon`)

```js
function apiCheckReconGate(cardId) { return checkReconGate(cardId); }
```

- [ ] **Step 5: Push & jalankan test — pastikan lulus**

Run: `clasp push`. Jalankan `testReconGate` di Editor → Logs.
Expected: PASS — output `testReconGate result={"eligible":true/false,"reason":"..."}` (tidak error). Jika hasil `eligible:false` karena CSV memang tidak punya laporan untuk kartu contoh, verifikasi struktur: baris yang salah tetap menghasilkan `false`, bukan exception.

- [ ] **Step 6: Commit**

```bash
git add src/FlazzOps.js src/Code.js src/debug.js
git commit -m "feat(recon): helper hasCompliantFlazzLaporan + endpoint checkReconGate"
```

---

### Task 2: Integrasi gate ke `saveFlazzRecon`

**Files:**
- Modify: `src/FlazzOps.js` (`saveFlazzRecon`, sisipkan setelah baris 581 `let sinceDate = ...`)

**Interfaces:**
- Consumes: `hasCompliantFlazzLaporan(cardId, sinceDate, ss)` dari Task 1.
- Produces: bukan apa-apa untuk task lain — perilaku blocking di `saveFlazzRecon`.

- [ ] **Step 1: Sisipkan gate di `saveFlazzRecon`**

Setelah baris `let sinceDate = usageInfo && usageInfo.usedAt ? new Date(usageInfo.usedAt) : null;` (baris 581) dan SEBELUM `const ledger = computeFlazzLedger(...)` (baris 583), tambahkan:

```js
    if (!hasCompliantFlazzLaporan(payload.card_id, sinceDate, ss)) {
      throw new Error('Rekonsiliasi diblokir: belum ada laporan valid dengan foto KM awal & akhir pada periode kartu. Harap input laporan dahulu.');
    }
```

- [ ] **Step 2: Push & verifikasi blokir**

Run: `clasp push`. Di browser, halaman Rekonsiliasi → pilih kartu TANPA laporan valid → isi saldo fisik → klik "Selesaikan Rekonsiliasi".
Expected: toast error "Rekonsiliasi diblokir: belum ada laporan valid..." dan baris `Flazz_Reconciliation` TIDAK bertambah.

- [ ] **Step 3: Verifikasi lolos (kasus normal)**

Di browser: buat laporan (step 2) metode FLAZZ lengkap foto KM awal+akhir (+ KM aktual utk tipe Bar), tanpa wajib pengeluaran. Kembali ke Rekonsiliasi kartu tsb → klik submit.
Expected: sukses, status `SESUAI`/`PERLU_PEMERIKSAAN` normal.

- [ ] **Step 4: Commit**

```bash
git add src/FlazzOps.js
git commit -m "feat(recon): blokir rekonsiliasi tanpa laporan valid ber-foto KM"
```

---

### Task 3: Status gate di form rekonsiliasi (frontend)

**Files:**
- Modify: `src/FlazzPages.html` (tambah elemen status di form recon)
- Modify: `src/FlazzScript.html` (`onReconCardSelect` + helper `updateReconGateStatus`)

**Interfaces:**
- Consumes: `apiCheckReconGate(cardId)` dari Task 1.
- Produces: elemen DOM `#recon-gate-status`; fungsi `updateReconGateStatus(cardId)` dipakai Task 4.

- [ ] **Step 1: Tambah elemen status di `src/FlazzPages.html`**

Setelah `</div>` penutup blok dropdown kartu (setelah baris 112, sebelum `<div class='row g-2 mb-3'>` baris 113):

```html
            <div id='recon-gate-status' class='alert d-none py-2'></div>
```

- [ ] **Step 2: Perbarui `onReconCardSelect` + tambah helper di `src/FlazzScript.html`**

Ganti `onReconCardSelect` (baris 270-278) menjadi:

```js
function onReconCardSelect() {
  let select = document.getElementById('r_card_id');
  let cardId = select.value || '';
  let balance = 0;
  if (select.selectedIndex > 0) {
     balance = computeClientSystemBalance(select.value);
  }
  document.getElementById('r_system_balance').value = balance;
  calculateReconVariance();
  updateReconGateStatus(cardId);
}

function updateReconGateStatus(cardId) {
  let box = document.getElementById('recon-gate-status');
  let btn = document.getElementById('btn-save-recon');
  if (!box) return;
  if (!cardId) {
    box.className = 'alert d-none py-2';
    if (btn) btn.disabled = false;
    return;
  }
  box.className = 'alert d-none py-2';
  if (btn) btn.disabled = false;
  google.script.run
    .withSuccessHandler(function(res) {
      box.className = 'alert py-2';
      if (res && res.eligible) {
        box.className = 'alert alert-success py-2';
        box.innerHTML = '<i class="bi bi-check-circle me-1"></i> Laporan valid dengan foto KM awal & akhir terdeteksi.';
        if (btn) btn.disabled = false;
      } else {
        box.className = 'alert alert-danger py-2';
        box.innerHTML = '<i class="bi bi-slash-circle me-1"></i> ' + ((res && res.reason) || 'Belum ada laporan valid. Rekonsiliasi diblokir.');
        if (btn) btn.disabled = true;
      }
    })
    .withFailureHandler(function() {
      box.className = 'alert d-none py-2';
      if (btn) btn.disabled = false;
    })
    .apiCheckReconGate(cardId);
}
```

- [ ] **Step 3: Push & verifikasi UI**

Run: `clasp push`. Browser → Rekonsiliasi.
Expected: pilih kartu tanpa laporan valid → muncul alert merah + tombol nonaktif; pilih kartu dgn laporan valid → alert hijau + tombol aktif; kartu kosong → alert tersembunyi.

- [ ] **Step 4: Commit**

```bash
git add src/FlazzPages.html src/FlazzScript.html
git commit -m "feat(recon): status gate di form rekonsiliasi (hijau/merah, disable submit)"
```

---

### Task 4: Cek gate lapisan kedua sebelum submit

**Files:**
- Modify: `src/FlazzScript.html` (`saveFlazzReconForm`)

**Interfaces:**
- Consumes: `apiCheckReconGate(cardId)` dari Task 1; `#r_card_id`, `#btn-save-recon`.
- Produces: tidak ada.

- [ ] **Step 1: Perbarui `saveFlazzReconForm`**

Ganti `saveFlazzReconForm` (baris 394-440) menjadi:

```js
function saveFlazzReconForm(e) {
  e.preventDefault();
  let cardId = document.getElementById('r_card_id').value;
  if (!cardId) {
    showToast('Pilih kartu terlebih dahulu.', 'error');
    return;
  }
  let btn = document.getElementById('btn-save-recon');
  let orig = btn.innerHTML;
  btn.dataset.origHtml = orig;
  btn.disabled = true;
  btn.innerHTML = 'Memproses...';

  let file = document.getElementById('r_foto_bukti').files[0];

  let payload = {
    card_id: cardId,
    system_balance: document.getElementById('r_system_balance').value,
    actual_balance: document.getElementById('r_actual_balance').value,
    action: document.getElementById('r_action').value,
    notes: document.getElementById('r_notes').value,
    userInfo: flazzUserInfo()
  };

  let submitRecon = function() {
    google.script.run
      .withSuccessHandler(res => {
         btn.disabled = false;
         btn.innerHTML = orig;
         if(res.success) {
           showToast(res.msg, 'success');
           document.getElementById('form-flazz-recon').reset();
           document.getElementById('recon-variance-alert').style.display = 'none';
           let statusBox = document.getElementById('recon-gate-status');
           if (statusBox) statusBox.className = 'alert d-none py-2';
           loadFlazzDataWrapper(true);
         } else showToast(res.msg, 'error');
      })
      .withFailureHandler(flazzFailHandler('Menyimpan recon', ['btn-save-recon']))
      .apiSaveFlazzRecon(payload);
  };

  let proceed = function() {
    if (file) {
      let reader = new FileReader();
      reader.onload = function(event) {
         payload.foto_bukti = event.target.result;
         payload.foto_bukti_name = file.name;
         submitRecon();
      };
      reader.readAsDataURL(file);
    } else {
      submitRecon();
    }
  };

  // Lapisan kedua: verifikasi gate di server sebelum menyimpan
  google.script.run
    .withSuccessHandler(function(res) {
      if (res && !res.eligible) {
        btn.disabled = false;
        btn.innerHTML = orig;
        showToast('Rekonsiliasi diblokir: ' + ((res && res.reason) || 'belum ada laporan valid dengan foto KM.'), 'error');
        return;
      }
      proceed();
    })
    .withFailureHandler(function(err) {
      btn.disabled = false;
      btn.innerHTML = orig;
      showToast('Gagal memverifikasi gate: ' + err, 'error');
    })
    .apiCheckReconGate(cardId);
}
```

- [ ] **Step 2: Push & verifikasi blokir ganda**

Run: `clasp push`. Browser → Rekonsiliasi → pilih kartu tanpa laporan valid.
Expected: klik submit → tidak tersimpan, toast "Rekonsiliasi diblokir...". Pastikan `r_card_id` kosong → toast "Pilih kartu terlebih dahulu."

- [ ] **Step 3: Verifikasi bypass backend**

Opsional — panggil langsung `apiSaveFlazzRecon` dari Editor Apps Script (console) untuk kartu tanpa laporan valid.
Expected: `{success: false, msg: "Rekonsiliasi diblokir: belum ada laporan valid..."}`.

- [ ] **Step 4: Commit**

```bash
git add src/FlazzScript.html
git commit -m "feat(recon): cek gate lapisan kedua sebelum submit rekonsiliasi"
```

---

## Ringkasan Verifikasi Akhir

1. Backend: `testReconGate` (Logger) jalan tanpa error; `checkReconGate` mengembalikan struktur `{eligible, reason}`.
2. `saveFlazzRecon` menolak kartu tanpa laporan valid (baik via UI maupun panggilan langsung).
3. UI: status merah + submit nonaktif untuk kartu belum ada laporan; hijau + aktif bila ada laporan valid (foto KM terisi, KM aktual utk tipe Bar, pengeluaran boleh 0; tipe Jarum cukup foto).
4. Semua commit terpisah per task.