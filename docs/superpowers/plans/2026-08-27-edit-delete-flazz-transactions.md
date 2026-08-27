# Edit & Hapus Transaksi Flazz dan BBM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memberi admin kontrol edit & hapus transaksi Top Up, Tol, dan BBM Flazz (lewat Riwayat Flazz) serta transaksi BBM harian (lewat History Laporan), dengan penyesuaian saldo kartu Flazz secara otomatis.

**Architecture:** Backend Apps Script (FlazzOps.js, SpreadsheetOps.js, Code.js) menambah fungsi edit/delete yang menyesuaikan `Flazz_Card.last_balance` pakai metode selisih nominal. Frontend (FlazzScript.html, js.html, FlazzPages.html) menambah tombol aksi di tabel/tab riwayat. Tidak ada framework test — verifikasi via `clasp push` + `clasp deploy` + checklist uji manual.

**Tech Stack:** Google Apps Script, Google Sheets, HTML/JS frontend, clasp CLI.

## Global Constraints

- Nama fungsi backend dibungkus `try/catch` dan mengembalikan `{ success, msg }`.
- Wrapper `apiXxx` untuk tiap fungsi backend ditambahkan di `Code.js` agar bisa dipanggil oleh `google.script.run`.
- Penyesuaian saldo memakai **selisih nominal**, tidak menghitung ulang seluruh transaksi.
- Saldo negatif **diizinkan** (mengikuti perilaku simpan saat ini), tidak ada validasi `>= 0`.
- Tidak mengubah skema/header sheet.
- Frontend mengirim userInfo lengkap via `flazzUserInfo()` (sudah ada di FlazzScript.html:9) agar kolom `created_by`/`updated_by` terisi.

---

### Task 1: Helper saldo kartu + wrapper API di backend

**Files:**
- Modify: `src/FlazzOps.js` (tambah helper setelah `appendFlazzRow`, sebelum `getFlazzCards`)
- Modify: `src/Code.js` (tambah wrapper API di blok FLAZZ API WRAPPERS)

**Interfaces:**
- Produces:
  - `getCardBalance(cardId) -> number` (membaca `last_balance` dari `Flazz_Card`; 0 jika tidak ditemukan)
  - `setCardBalance(cardId, newBalance)` (menulis kolom last_balance index 6 dan updated_at index 10)

- [ ] **Step 1: Tambah helper di FlazzOps.js**

Setelah blok `appendFlazzRow` (baris ~17), sisipkan:

```js
// Helper: Membaca saldo kartu Flazz (return 0 bila tidak ditemukan)
function getCardBalance(cardId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return 0;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === cardId) return parseFloat(data[i][5]) || 0;
  }
  return 0;
}

// Helper: Menulis saldo kartu Flazz + updated_at
function setCardBalance(cardId, newBalance) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === cardId) {
      sheet.getRange(i + 1, 6).setValue(newBalance);
      sheet.getRange(i + 1, 10).setValue(new Date());
      break;
    }
  }
}
```

- [ ] **Step 2: Verifikasi push & deploy**

Run: `clasp push; if ($?) { clasp deploy }` di `D:\Monitoring BBM\src`
Expected: 13 files pushed, deploy sukses (hash + @N).

- [ ] **Step 3: Commit**

```bash
git add src/FlazzOps.js src/Code.js
git commit -m "feat: balance helper for Flazz card"
```

---

### Task 2: Edit & Hapus Top Up (backend)

**Files:**
- Modify: `src/FlazzOps.js` (tambah fungsi setelah `saveFlazzTopUp`)
- Modify: `src/Code.js` (wrapper API)

**Interfaces:**
- Consumes: `getCardBalance`, `setCardBalance` (Task 1)
- Produces:
  - `editFlazzTopUp(payload) -> {success, msg}` dengan `payload = {id, card_id, amount, notes, date, userInfo}`
  - `deleteFlazzTopUp(id) -> {success, msg}`
  - `apiEditFlazzTopUp(payload)` dan `apiDeleteFlazzTopUp(id)` di Code.js

- [ ] **Step 1: Tambah `editFlazzTopUp`**

Sisipkan setelah fungsi `saveFlazzTopUp` (setelah baris ~152):

```js
// Edit Top Up Flazz (sesuaikan saldo dengan selisih nominal)
function editFlazzTopUp(payload) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_TopUp');
    if (!sheet) throw new Error('Sheet Flazz_TopUp tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxId = headers.indexOf('id');
    const idxAmount = headers.indexOf('amount');
    const idxNotes = headers.indexOf('notes');
    const idxDate = headers.indexOf('date');
    const idxCard = headers.indexOf('card_id');

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxId] === payload.id) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Top up tidak ditemukan.');

    const newCard = payload.card_id || oldCard;
    const newAmount = parseFloat(payload.amount) || 0;
    const diff = newAmount - oldAmount;

    sheet.getRange(rowIndex, idxAmount + 1).setValue(newAmount);
    sheet.getRange(rowIndex, idxNotes + 1).setValue(payload.notes || '');
    if (payload.date) sheet.getRange(rowIndex, idxDate + 1).setValue(payload.date);
    if (newCard !== oldCard) sheet.getRange(rowIndex, idxCard + 1).setValue(newCard);

    // Kembalikan saldo kartu lama, potong dari kartu baru bila berbeda
    if (newCard !== oldCard) {
      setCardBalance(oldCard, (getCardBalance(oldCard) || 0) - oldAmount);
      setCardBalance(newCard, (getCardBalance(newCard) || 0) + newAmount);
    } else {
      setCardBalance(newCard, (getCardBalance(newCard) || 0) + diff);
    }

    return { success: true, msg: 'Top up berhasil diperbarui.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Hapus Top Up Flazz (kembalikan saldo)
function deleteFlazzTopUp(id) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_TopUp');
    if (!sheet) throw new Error('Sheet Flazz_TopUp tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxId = headers.indexOf('id');
    const idxAmount = headers.indexOf('amount');
    const idxCard = headers.indexOf('card_id');

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxId] === id) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Top up tidak ditemukan.');

    sheet.deleteRow(rowIndex);
    if (oldCard) setCardBalance(oldCard, (getCardBalance(oldCard) || 0) - oldAmount);

    return { success: true, msg: 'Top up berhasil dihapus dan saldo disesuaikan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}
```

- [ ] **Step 2: Tambah wrapper API di Code.js**

Di blok FLAZZ API WRAPPERS (di dekat `apiDeleteFlazzCard`, baris ~124):

```js
function apiEditFlazzTopUp(payload) { return editFlazzTopUp(payload); }
function apiDeleteFlazzTopUp(id) { return deleteFlazzTopUp(id); }
```

- [ ] **Step 3: Push & deploy**

Run: `clasp push; if ($?) { clasp deploy }` di `D:\Monitoring BBM\src`
Expected: sukses.

- [ ] **Step 4: Commit**

```bash
git add src/FlazzOps.js src/Code.js
git commit -m "feat: edit & delete flazz topup with balance adjustment"
```

---

### Task 3: Edit & Hapus Tol (backend)

**Files:**
- Modify: `src/FlazzOps.js` (tambah fungsi setelah `saveFlazzTol`)
- Modify: `src/Code.js` (wrapper API)

**Interfaces:**
- Consumes: `getCardBalance`, `setCardBalance` (Task 1)
- Produces:
  - `editFlazzTol(payload) -> {success, msg}` dengan `payload = {id, card_id, amount, notes, date}`
  - `deleteFlazzTol(id) -> {success, msg}`
  - `apiEditFlazzTol(payload)` dan `apiDeleteFlazzTol(id)` di Code.js
  - Catatan: Tol mengurangi saldo, maka rumus menyesuaikan (lihat langkah).

- [ ] **Step 1: Tambah `editFlazzTol`**

Sisipkan setelah fungsi `saveFlazzTol` (setelah baris ~197):

```js
// Edit Tol Flazz (sesuaikan saldo dengan selisih nominal, tanda terbalik karena mengurangi saldo)
function editFlazzTol(payload) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Tol');
    if (!sheet) throw new Error('Sheet Flazz_Tol tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxId = headers.indexOf('id');
    const idxAmount = headers.indexOf('amount');
    const idxNotes = headers.indexOf('notes');
    const idxDate = headers.indexOf('date');
    const idxCard = headers.indexOf('card_id');

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxId] === payload.id) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Tol tidak ditemukan.');

    const newCard = payload.card_id || oldCard;
    const newAmount = parseFloat(payload.amount) || 0;
    const diff = oldAmount - newAmount; // tambah saldo jika nominal berkurang

    sheet.getRange(rowIndex, idxAmount + 1).setValue(newAmount);
    sheet.getRange(rowIndex, idxNotes + 1).setValue(payload.notes || '');
    if (payload.date) sheet.getRange(rowIndex, idxDate + 1).setValue(payload.date);
    if (newCard !== oldCard) sheet.getRange(rowIndex, idxCard + 1).setValue(newCard);

    if (newCard !== oldCard) {
      setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldAmount);
      setCardBalance(newCard, (getCardBalance(newCard) || 0) - newAmount);
    } else {
      setCardBalance(newCard, (getCardBalance(newCard) || 0) + diff);
    }

    return { success: true, msg: 'Tol berhasil diperbarui.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Hapus Tol Flazz (kembalikan saldo)
function deleteFlazzTol(id) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Tol');
    if (!sheet) throw new Error('Sheet Flazz_Tol tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxId = headers.indexOf('id');
    const idxAmount = headers.indexOf('amount');
    const idxCard = headers.indexOf('card_id');

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxId] === id) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Tol tidak ditemukan.');

    sheet.deleteRow(rowIndex);
    if (oldCard) setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldAmount);

    return { success: true, msg: 'Tol berhasil dihapus dan saldo disesuaikan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}
```

- [ ] **Step 2: Tambah wrapper API di Code.js**

```js
function apiEditFlazzTol(payload) { return editFlazzTol(payload); }
function apiDeleteFlazzTol(id) { return deleteFlazzTol(id); }
```

- [ ] **Step 3: Push & deploy**

Run: `clasp push; if ($?) { clasp deploy }` di `D:\Monitoring BBM\src`
Expected: sukses.

- [ ] **Step 4: Commit**

```bash
git add src/FlazzOps.js src/Code.js
git commit -m "feat: edit & delete flazz tol with balance adjustment"
```

---

### Task 4: Hapus BBM Flazz (backend, mode full & detach)

**Files:**
- Modify: `src/FlazzOps.js` (fungsi `getFlazzDashboardData` tambah `transaction_id`; tambah `deleteFlazzBBM`)
- Modify: `src/Code.js` (wrapper API)

**Interfaces:**
- Produces:
  - Di `getFlazzDashboardData`, objek `bbmFlazz` kini menyertakan `transaction_id: row[0]`.
  - `deleteFlazzBBM(transactionId, mode) -> {success, msg}`, `mode` = `'full'` | `'detach'`
  - `apiDeleteFlazzBBM(transactionId, mode)` di Code.js

- [ ] **Step 1: Tambah `transaction_id` pada bbmFlazz**

Di `getFlazzDashboardData` (buat var `trxIdx = headers.indexOf('transaction_id')`), tambahkan di blok `bbmFlazz.push(...)`:

```js
bbmFlazz.push({
   transaction_id: row[trxIdx],
   tanggal: ...,
   ...
});
```

- [ ] **Step 2: Tambah `deleteFlazzBBM`**

Sisipkan setelah fungsi `deleteFlazzCard` (di akhir file FlazzOps.js):

```js
// Hapus/lepas transaksi BBM Flazz dari Penggunaan_BBM
// mode 'full'   : hapus baris total + kembalikan saldo
// mode 'detach' : kosongkan metode_pembayaran & flazz_card_id, baris tetap, kembalikan saldo
function deleteFlazzBBM(transactionId, mode) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) throw new Error('Sheet Penggunaan_BBM tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxTrx = headers.indexOf('transaction_id');
    const idxMetode = headers.indexOf('metode_pembayaran');
    const idxCard = headers.indexOf('flazz_card_id');
    const idxBiaya = headers.indexOf('biaya_bbm');

    let rowIndex = -1, isFlazz = false, biaya = 0, cardId = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxTrx]) === String(transactionId)) {
        rowIndex = i + 1;
        isFlazz = data[i][idxMetode] === 'FLAZZ';
        biaya = parseFloat(data[i][idxBiaya]) || 0;
        cardId = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Transaksi BBM tidak ditemukan.');

    if (mode === 'detach') {
      sheet.getRange(rowIndex, idxMetode + 1).setValue('');
      sheet.getRange(rowIndex, idxCard + 1).setValue('');
    } else {
      sheet.deleteRow(rowIndex);
    }

    if (isFlazz && cardId) {
      setCardBalance(cardId, (getCardBalance(cardId) || 0) + biaya);
    }

    return { success: true, msg: mode === 'detach' ? 'Transaksi dilepas dari Flazz dan saldo dikembalikan.' : 'Transaksi BBM dihapus dan saldo dikembalikan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}
```

- [ ] **Step 3: Tambah wrapper API di Code.js**

```js
function apiDeleteFlazzBBM(transactionId, mode) { return deleteFlazzBBM(transactionId, mode); }
```

- [ ] **Step 4: Push & deploy**

Run: `clasp push; if ($?) { clasp deploy }` di `D:\Monitoring BBM\src`
Expected: sukses.

- [ ] **Step 5: Commit**

```bash
git add src/FlazzOps.js src/Code.js
git commit -m "feat: delete/detach flazz BBM with balance return"
```

---

### Task 5: Update `renderFlazzHistory` frontend untuk tombol aksi

**Files:**
- Modify: `src/FlazzScript.html` (fungsi `renderFlazzHistory`, baris ~409-463; tambah fungsi edit/hapus + modal kecil)
- Modify: `src/FlazzPages.html` (tambah modal edit Top Up/Tol)

**Interfaces:**
- Consumes: `apiEditFlazzTopUp`, `apiDeleteFlazzTopUp`, `apiEditFlazzTol`, `apiDeleteFlazzTol`, `apiDeleteFlazzBBM`, `loadFlazzDataWrapper()`, `showToast()`, `flazzUserInfo()`
- Produces: fungsi frontend `editTopUp(id)`, `deleteTopUp(id)`, `editTol(id)`, `deleteTol(id)`, `deleteBBMFlazz(trxId)`

- [ ] **Step 1: Tambah kolom Aksi pada tabel topup/tol dan tombol hapus pada BBM**

Ubah `renderFlazzHistory` agar tiap `tr` menambahkan `<td>` terakhir berisi tombol:

Top Up (setelah `<td>${t.notes}</td>`):
```js
tbTopup.innerHTML += `<tr>
   <td>${formatDateShort(t.date)}</td>
   <td>${cardStr}</td>
   <td class="fw-bold text-success">+${formatCurrency(t.amount)}</td>
   <td><a href="${t.evidence_url}" target="_blank">Lihat Bukti</a></td>
   <td>${t.notes}</td>
   <td class="text-end text-nowrap">
     <button class="btn btn-sm btn-outline-primary" onclick="editTopUp('${t.id}')"><i class="bi bi-pencil"></i></button>
     <button class="btn btn-sm btn-outline-danger" onclick="deleteTopUp('${t.id}')"><i class="bi bi-trash"></i></button>
   </td>
 </tr>`;
```

Tol (setelah `<td>${t.notes}</td>`):
```js
tbTol.innerHTML += `<tr>
   <td>${formatDateShort(t.date)}</td>
   <td>${cardStr}</td>
   <td>${t.driver_id} / ${t.vehicle_id}</td>
   <td class="fw-bold text-danger">-${formatCurrency(t.amount)}</td>
   <td><a href="${t.evidence_url}" target="_blank">Lihat Bukti</a></td>
   <td>${t.notes}</td>
   <td class="text-end text-nowrap">
     <button class="btn btn-sm btn-outline-primary" onclick="editTol('${t.id}')"><i class="bi bi-pencil"></i></button>
     <button class="btn btn-sm btn-outline-danger" onclick="deleteTol('${t.id}')"><i class="bi bi-trash"></i></button>
   </td>
 </tr>`;
```

BBM (setelah `<td><a href="${t.evidence}" target="_blank">Struk BBM</a></td>`):
```js
tbBbm.innerHTML += `<tr>
   <td>${formatDateShort(t.tanggal)}</td>
   <td>${cardStr}</td>
   <td>${t.driver} / ${t.vehicle}</td>
   <td class="fw-bold text-danger">-${formatCurrency(t.amount)}</td>
   <td><a href="${t.evidence}" target="_blank">Struk BBM</a></td>
   <td class="text-end">
     <button class="btn btn-sm btn-outline-danger" onclick="deleteBBMFlazz('${t.transaction_id}')"><i class="bi bi-trash"></i></button>
   </td>
 </tr>`;
```

- [ ] **Step 2: Tambah fungsi aksi frontend (di FlazzScript.html, sebelum `</script>` terakhir)**

```js
function editTopUp(id) {
  let t = (flazzDataCache && flazzDataCache.topups || []).find(x => x.id === id);
  if(!t) return showToast('Data tidak ditemukan', 'error');
  document.getElementById('et_id').value = t.id;
  document.getElementById('et_card_id').value = t.card_id;
  document.getElementById('et_amount').value = t.amount;
  document.getElementById('et_notes').value = t.notes || '';
  new bootstrap.Modal(document.getElementById('modal-edit-topup')).show();
}
function saveEditTopUp(e) {
  e.preventDefault();
  let payload = {
    id: document.getElementById('et_id').value,
    card_id: document.getElementById('et_card_id').value,
    amount: document.getElementById('et_amount').value,
    notes: document.getElementById('et_notes').value,
    userInfo: flazzUserInfo()
  };
  google.script.run.withSuccessHandler(res => {
    if(res.success){ showToast(res.msg, 'success'); bootstrap.Modal.getInstance(document.getElementById('modal-edit-topup')).hide(); loadFlazzDataWrapper(); }
    else showToast(res.msg, 'error');
  }).apiEditFlazzTopUp(payload);
}
function deleteTopUp(id) {
  if(!confirm('Yakin menghapus top up ini? Saldo kartu akan dikurangi nominal tersebut.')) return;
  google.script.run.withSuccessHandler(res => {
    if(res.success){ showToast(res.msg, 'success'); loadFlazzDataWrapper(); }
    else showToast(res.msg, 'error');
  }).apiDeleteFlazzTopUp(id);
}
function editTol(id) {
  let t = (flazzDataCache && flazzDataCache.tols || []).find(x => x.id === id);
  if(!t) return showToast('Data tidak ditemukan', 'error');
  document.getElementById('etol_id').value = t.id;
  document.getElementById('etol_card_id').value = t.card_id;
  document.getElementById('etol_amount').value = t.amount;
  document.getElementById('etol_notes').value = t.notes || '';
  new bootstrap.Modal(document.getElementById('modal-edit-tol')).show();
}
function saveEditTol(e) {
  e.preventDefault();
  let payload = {
    id: document.getElementById('etol_id').value,
    card_id: document.getElementById('etol_card_id').value,
    amount: document.getElementById('etol_amount').value,
    notes: document.getElementById('etol_notes').value,
    userInfo: flazzUserInfo()
  };
  google.script.run.withSuccessHandler(res => {
    if(res.success){ showToast(res.msg, 'success'); bootstrap.Modal.getInstance(document.getElementById('modal-edit-tol')).hide(); loadFlazzDataWrapper(); }
    else showToast(res.msg, 'error');
  }).apiEditFlazzTol(payload);
}
function deleteTol(id) {
  if(!confirm('Yakin menghapus tol ini? Saldo kartu akan dikembalikan nominal tersebut.')) return;
  google.script.run.withSuccessHandler(res => {
    if(res.success){ showToast(res.msg, 'success'); loadFlazzDataWrapper(); }
    else showToast(res.msg, 'error');
  }).apiDeleteFlazzTol(id);
}
function deleteBBMFlazz(trxId) {
  let mode = confirm('Pilih: klik OK untuk HAPUS TOTAL baris BBM, atau Cancel untuk LEPAS DARI FLAZZ saja.') ? 'full' : 'detach';
  let msg = mode === 'full' ? 'Yakin menghapus total baris BBM ini? Laporan BBM harian hari itu akan berubah.' : 'Lepas transaksi ini dari Flazz tanpa menghapus laporan BBM?';
  if(!confirm(msg)) return;
  google.script.run.withSuccessHandler(res => {
    if(res.success){ showToast(res.msg, 'success'); loadFlazzDataWrapper(); }
    else showToast(res.msg, 'error');
  }).apiDeleteFlazzBBM(trxId, mode);
}
```

- [ ] **Step 3: Tambah modal edit di FlazzPages.html**

Di dalam `#page-flazz-history` (setelah card riwayat, sebelum `</div>` penutup halaman):

```html
<!-- Modal Edit Top Up -->
<div class="modal fade" id="modal-edit-topup" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Edit Top Up</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <form onsubmit="saveEditTopUp(event)">
        <div class="modal-body">
          <input type="hidden" id="et_id">
          <div class="mb-2"><label class="form-label small">Kartu</label>
            <select id="et_card_id" class="form-select"></select></div>
          <div class="mb-2"><label class="form-label small">Nominal</label>
            <input id="et_amount" type="number" class="form-control" required></div>
          <div class="mb-2"><label class="form-label small">Catatan</label>
            <input id="et_notes" class="form-control"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan</button>
        </div>
      </form>
    </div>
  </div>
</div>

<!-- Modal Edit Tol -->
<div class="modal fade" id="modal-edit-tol" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Edit Tol</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <form onsubmit="saveEditTol(event)">
        <div class="modal-body">
          <input type="hidden" id="etol_id">
          <div class="mb-2"><label class="form-label small">Kartu</label>
            <select id="etol_card_id" class="form-select"></select></div>
          <div class="mb-2"><label class="form-label small">Nominal</label>
            <input id="etol_amount" type="number" class="form-control" required></div>
          <div class="mb-2"><label class="form-label small">Catatan</label>
            <input id="etol_notes" class="form-control"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan</button>
        </div>
      </form>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Isi dropdown kartu saat modal dibuka**

Di `editTopUp`, sebelum `new bootstrap.Modal(...)`, isi `et_card_id` dari `flazzDataCache.cards`; lakukan sama untuk `etol_card_id` di `editTol`:

```js
let cards = (flazzDataCache && flazzDataCache.cards) || [];
let opts = cards.map(c => '<option value="'+c.id+'">'+c.card_number+'</option>').join('');
document.getElementById('et_card_id').innerHTML = opts;
document.getElementById('et_card_id').value = t.card_id;
// dan untuk tol:
document.getElementById('etol_card_id').innerHTML = cards.map(c => '<option value="'+c.id+'">'+c.card_number+'</option>').join('');
document.getElementById('etol_card_id').value = t.card_id;
```

- [ ] **Step 5: Push & deploy**

Run: `clasp push; if ($?) { clasp deploy }` di `D:\Monitoring BBM\src`
Expected: sukses.

- [ ] **Step 6: Uji manual**
  1. Buka Riwayat Flazz → tab Top Up → klik pensil, ubah nominal, simpan. Verifikasi saldo kartu di Dashboard Flazz bertambah/berkurang sesuai selisih.
  2. Hapus top up → saldo berkurang nominal.
  3. Tab Tol → edit/hapus → saldo menyesuaikan.
  4. Tab BBM → hapus, pilih full/detach → baris & saldo sesuai.

- [ ] **Step 7: Commit**

```bash
git add src/FlazzScript.html src/FlazzPages.html
git commit -m "feat: action buttons (edit/delete) for flazz history"
```

---

### Task 6: Edit & Hapus transaksi BBM harian (History Laporan — backend)

**Files:**
- Modify: `src/SpreadsheetOps.js` (tambah `transaction_id`, `biaya_bbm`, `metode`, `flazz_card_id` di `getRecentTransactions` result; tambah `editDailyTransaction`, `deleteDailyTransaction`)
- Modify: `src/Code.js` (wrapper API)

**Interfaces:**
- Produces:
  - `getRecentTransactions` tiap objek kini punya `transaction_id`, `biaya_bbm`, `metode_pembayaran`, `flazz_card_id`.
  - `editDailyTransaction(payload) -> {success, msg}`
  - `deleteDailyTransaction(transactionId) -> {success, msg}`
  - Wrapper: `apiEditDailyTransaction`, `apiDeleteDailyTransaction`

- [ ] **Step 1: Tambah field ke result `getRecentTransactions`**

Di objek `result.push({...})` (baris ~291-310), tambahkan:

```js
transaction_id: row[0],
biaya_bbm: parseFloat(row[19]) || 0,
metode_pembayaran: row[27] || 'TUNAI',
flazz_card_id: row[28] || '',

```

- [ ] **Step 2: Tambah `editDailyTransaction`**

Sisipkan setelah `getRecentTransactions` (sebelum `insertCabang`):

```js
function editDailyTransaction(payload) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) throw new Error('Sheet Penggunaan_BBM tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxTrx = headers.indexOf('transaction_id');
    const idxMetode = headers.indexOf('metode_pembayaran');
    const idxCard = headers.indexOf('flazz_card_id');
    const idxBiaya = headers.indexOf('biaya_bbm');
    const idxNama = headers.indexOf('nama_supir');
    const idxTgl = headers.indexOf('tanggal');

    let rowIndex = -1, oldMetode = '', oldCard = null, oldBiaya = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxTrx]) === String(payload.transaction_id)) {
        rowIndex = i + 1;
        oldMetode = data[i][idxMetode];
        oldCard = data[i][idxCard];
        oldBiaya = parseFloat(data[i][idxBiaya]) || 0;
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Transaksi tidak ditemukan.');

    const newMetode = payload.metode_pembayaran || oldMetode;
    const newCard = payload.flazz_card_id || '';
    const newBiaya = parseFloat(payload.biaya_bbm) || 0;

    sheet.getRange(rowIndex, idxMetode + 1).setValue(newMetode);
    sheet.getRange(rowIndex, idxCard + 1).setValue(newCard);
    sheet.getRange(rowIndex, idxBiaya + 1).setValue(newBiaya);
    if (payload.nama_supir) sheet.getRange(rowIndex, idxNama + 1).setValue(payload.nama_supir);

    // Sesuaikan saldo Flazz
    const wasFlazz = oldMetode === 'FLAZZ' && oldCard;
    const isFlazz = newMetode === 'FLAZZ' && newCard;
    if (wasFlazz && isFlazz) {
      if (oldCard === newCard) {
        setCardBalance(newCard, (getCardBalance(newCard) || 0) + (oldBiaya - newBiaya));
      } else {
        setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldBiaya);
        setCardBalance(newCard, (getCardBalance(newCard) || 0) - newBiaya);
      }
    } else if (wasFlazz && !isFlazz) {
      setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldBiaya);
    } else if (!wasFlazz && isFlazz) {
      setCardBalance(newCard, (getCardBalance(newCard) || 0) - newBiaya);
    }

    return { success: true, msg: 'Transaksi BBM berhasil diperbarui.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

function deleteDailyTransaction(transactionId) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) throw new Error('Sheet Penggunaan_BBM tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxTrx = headers.indexOf('transaction_id');
    const idxMetode = headers.indexOf('metode_pembayaran');
    const idxCard = headers.indexOf('flazz_card_id');
    const idxBiaya = headers.indexOf('biaya_bbm');

    let rowIndex = -1, isFlazz = false, cardId = null, biaya = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxTrx]) === String(transactionId)) {
        rowIndex = i + 1;
        isFlazz = data[i][idxMetode] === 'FLAZZ';
        cardId = data[i][idxCard];
        biaya = parseFloat(data[i][idxBiaya]) || 0;
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Transaksi tidak ditemukan.');

    sheet.deleteRow(rowIndex);
    if (isFlazz && cardId) {
      setCardBalance(cardId, (getCardBalance(cardId) || 0) + biaya);
    }
    return { success: true, msg: 'Transaksi BBM dihapus.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}
```

- [ ] **Step 3: Tambah wrapper API di Code.js**

```js
function apiEditDailyTransaction(payload) { return editDailyTransaction(payload); }
function apiDeleteDailyTransaction(transactionId) { return deleteDailyTransaction(transactionId); }
```

- [ ] **Step 4: Push & deploy**

Run: `clasp push; if ($?) { clasp deploy }` di `D:\Monitoring BBM\src`
Expected: sukses.

- [ ] **Step 5: Commit**

```bash
git add src/SpreadsheetOps.js src/Code.js
git commit -m "feat: edit & delete daily BBM transaction with flazz balance sync"
```

---

### Task 7: Tambah tombol Edit/Hapus di History Laporan (frontend)

**Files:**
- Modify: `src/js.html` (di `loadDashboard`, tambah kolom aksi pada tabel baris ~642-653; dan aksi pada card mobile baris ~655-688; tambah fungsi edit/hapus + modal)
- Modify: `src/Index.html` (tambah modal edit transaksi BBM)

**Interfaces:**
- Consumes: `apiEditDailyTransaction`, `apiDeleteDailyTransaction`, `loadDashboard()`, `showToast()`
- Produces: fungsi `editDaily(id)`, `saveEditDaily(e)`, `deleteDaily(id)`

- [ ] **Step 1: Tambah kolom aksi pada tabel**

Di `data.forEach(row => {...}` untuk tabel (baris ~642), tambahkan `<td>` terakhir:

```js
"<td class='text-end text-nowrap'>" +
  "<button class='btn btn-sm btn-outline-primary' onclick='editDaily(" + JSON.stringify(row.transaction_id) + ")'><i class='bi bi-pencil'></i></button> " +
  "<button class='btn btn-sm btn-outline-danger' onclick='deleteDaily(" + JSON.stringify(row.transaction_id) + ")'><i class='bi bi-trash'></i></button>" +
"</td>";
```

Catatan: gunakan `editDaily("trx", event)` dengan tanda kutip ganda agar id string aman; lihat langkah 3 untuk definisi fungsi yang menerima parameter string.

- [ ] **Step 2: Tambah tombol aksi pada card mobile**

Di `data.forEach(row => {...}` untuk card (baris ~655), tambahkan di `.card-body` bagian bawah (setelah blok efisiensi):

```js
"<div class='d-flex justify-content-end gap-2 mt-2'>" +
  "<button class='btn btn-sm btn-outline-primary' onclick='editDaily(\"" + row.transaction_id + "\")'><i class='bi bi-pencil'></i> Edit</button> " +
  "<button class='btn btn-sm btn-outline-danger' onclick='deleteDaily(\"" + row.transaction_id + "\")'><i class='bi bi-trash'></i> Hapus</button>" +
"</div>"
```

- [ ] **Step 3: Tambah fungsi edit/hapus dan modal**

Tambahkan fungsi (di js.html, dalam scope global agar bisa dipanggil onclick):

```js
function editDaily(id) {
  let m = window.masterData || {};
  let row = (window.__recent || []).find(r => String(r.transaction_id) === String(id));
  if(!row) return showToast('Data tidak ditemukan', 'error');
  document.getElementById('ed_trx').value = row.transaction_id;
  document.getElementById('ed_nama_supir').value = row.supir || '';
  document.getElementById('ed_biaya').value = row.biaya_bbm || '';
  let metode = document.getElementById('ed_metode');
  if(metode){
    metode.value = row.metode_pembayaran || 'TUNAI';
    toggleEditFlazz();
  }
  let flazz = document.getElementById('ed_flazz_card_id');
  if(flazz){
    flazz.innerHTML = '<option value="">-- Pilih Kartu --</option>' + (flazzDataCache && flazzDataCache.cards ? flazzDataCache.cards.map(c=>'<option value="'+c.id+'">'+c.card_number+'</option>').join('') : '');
    flazz.value = row.flazz_card_id || '';
  }
  new bootstrap.Modal(document.getElementById('modal-edit-daily')).show();
}
function toggleEditFlazz(){
  let m = document.getElementById('ed_metode').value;
  let f = document.getElementById('ed_flazz_row');
  if(f) f.style.display = (m === 'FLAZZ') ? 'block' : 'none';
}
function saveEditDaily(e){
  e.preventDefault();
  let payload = {
    transaction_id: document.getElementById('ed_trx').value,
    nama_supir: document.getElementById('ed_nama_supir').value,
    biaya_bbm: document.getElementById('ed_biaya').value,
    metode_pembayaran: document.getElementById('ed_metode').value,
    flazz_card_id: document.getElementById('ed_metode').value === 'FLAZZ' ? document.getElementById('ed_flazz_card_id').value : ''
  };
  google.script.run.withSuccessHandler(res => {
    if(res.success){ showToast(res.msg, 'success'); bootstrap.Modal.getInstance(document.getElementById('modal-edit-daily')).hide(); loadDashboard(); }
    else showToast(res.msg, 'error');
  }).apiEditDailyTransaction(payload);
}
function deleteDaily(id){
  if(!confirm('Yakin menghapus transaksi BBM ini? Jika ber-Flazz, saldo kartu akan dikembalikan.')) return;
  google.script.run.withSuccessHandler(res => {
    if(res.success){ showToast(res.msg, 'success'); loadDashboard(); }
    else showToast(res.msg, 'error');
  }).apiDeleteDailyTransaction(id);
}
```

Catatan TASK-7: `window.__recent` perlu diisi di `loadDashboard` dengan `data` hasil filter (`window.__recent = data;`) agar `editDaily` bisa membaca seluruh field.

- [ ] **Step 4: Set `window.__recent` di loadDashboard**

Di dalam success handler `loadDashboard`, setelah `data.forEach` untuk tabel selesai (atau setelah variabel `data` dibuat), tambahkan:

```js
window.__recent = data;
```

- [ ] **Step 5: Tambah modal edit di Index.html**

Tambahkan sebelum penutup body (atau di dalam area modals yang ada):

```html
<!-- Modal Edit Transaksi BBM -->
<div class="modal fade" id="modal-edit-daily" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Edit Transaksi BBM</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
      <form onsubmit="saveEditDaily(event)">
        <div class="modal-body">
          <input type="hidden" id="ed_trx">
          <div class="mb-2"><label class="form-label small">Nama Supir</label>
            <input id="ed_nama_supir" class="form-control"></div>
          <div class="mb-2"><label class="form-label small">Biaya BBM</label>
            <input id="ed_biaya" type="number" class="form-control" required></div>
          <div class="mb-2"><label class="form-label small">Metode Pembayaran</label>
            <select id="ed_metode" class="form-select" onchange="toggleEditFlazz()">
              <option value="TUNAI">Tunai</option>
              <option value="FLAZZ">Flazz</option>
            </select></div>
          <div class="mb-2" id="ed_flazz_row" style="display:none;">
            <label class="form-label small">Kartu Flazz</label>
            <select id="ed_flazz_card_id" class="form-select"></select></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Batal</button>
          <button type="submit" class="btn btn-primary">Simpan</button>
        </div>
      </form>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Push & deploy**

Run: `clasp push; if ($?) { clasp deploy }` di `D:\Monitoring BBM\src`
Expected: sukses.

- [ ] **Step 7: Uji manual**
  1. History Laporan → klik pensil → ubah metode FLAZZ→TUNAI → simpan → verifikasi saldo Flazz di Dashboard Flazz naik sesuai biaya; baris tetap di laporan.
  2. Ubah TUNAI→FLAZZ → saldo turun.
  3. Hapus transaksi ber-Flazz → baris hilang, saldo dikembalikan.

- [ ] **Step 8: Commit**

```bash
git add src/js.html src/Index.html
git commit -m "feat: edit & delete buttons on BBM history report"
```

---

## Self-Review

**Spec coverage:**
- §4.1 Riwayat Flazz edit/hapus → Task 2, 3, 4 (backend) + Task 5 (frontend). ✓
- §4.2 History Laporan edit/hapus → Task 6 (backend) + Task 7 (frontend). ✓
- §5 helper saldo → Task 1. ✓
- §5.6 wrapper API → Task 2-6. ✓
- §6.1 modal & aksi di Riwayat Flazz → Task 5. ✓
- §6.2 aksi di History Laporan → Task 7. ✓

**Placeholder scan:** Tidak ada "TBD"/"TODO"; setiap step berisi kode/command konkret.

**Type consistency:** `getCardBalance`/`setCardBalance` konsisten dipakai Task 2-4,6. Nama `editFlazzTopUp`, `deleteFlazzTopUp`, `editFlazzTol`, `deleteFlazzTol`, `deleteFlazzBBM`, `editDailyTransaction`, `deleteDailyTransaction` konsisten antara definisi backend dan wrapper API serta pemanggilan frontend.

**Catatan implementasi:** Karena proyek ini Apps Script tanpa framework unit test, langkah "uji" diganti dengan push + deploy + checklist manual. Pastikan menjalankan `clasp push` dari folder `src`.
