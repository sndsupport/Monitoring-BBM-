# Jalur-based Driver Autofill & Flazz Balance Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add jalur-based driver selection to the laporan form and block report submission when Flazz card balance is insufficient.

**Architecture:** New backend endpoint fetches jalur drivers for a given date; frontend dynamically populates driver/vehicle/card from jalur data. Server-side balance pre-check rejects reports before any sheet writes. Client-side check provides early warning.

**Tech Stack:** Google Apps Script (V8), Bootstrap 5, vanilla JS, Google Spreadsheet as DB

## Global Constraints
- Apps Script V8 runtime, no npm/node dependencies
- Single spreadsheet DB (18 sheets), all ops via `SpreadsheetApp`
- Auth via opaque `bbmToken()` session, role-based: `SUPERADMIN` / `PIC CABANG`
- Existing code style: function-level `try/catch`, `Logger.log`, `withLock` for concurrent safety
- No new sheets or columns required

---

### Task 1: Backend — `getJalurDriversForDate()` in JalurOps.js

**Files:**
- Modify: `src/JalurOps.js`

**Interfaces:**
- Consumes: `jalurSheet()`, `jalurColIdx()`, `getJalurCabangFor(userInfo)` (existing helpers in same file)
- Produces: `getJalurDriversForDate(tanggal, userInfo, opts)` → `{ success: true, list: [{ nama_driver, driver_id, vehicle_id, plat_nomor, nama_kendaraan, flazz_card_id, flazz_card_name }] }`

- [ ] **Step 1: Add the function at the end of JalurOps.js**

```javascript
function getJalurDriversForDate(tanggal, userInfo, opts) {
  try {
    opts = opts || {};
    const sheet = jalurSheet();
    if (!sheet || sheet.getLastRow() <= 1) return { success: true, list: [] };
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iDeleted = idx['is_deleted'];
    const iStatus = idx['status'];
    const iTanggal = idx['tanggal'];
    const iCabang = idx['kode_cabang'];
    const inputTgl = String(tanggal || '').substring(0, 10);
    if (!inputTgl) return { success: true, list: [] };

    let filteredCabang = getJalurCabangFor(userInfo);
    if (userInfo && userInfo.role === 'SUPERADMIN') {
      filteredCabang = opts.cabang || null;
    }

    const list = [];
    const seen = {};
    for (let i = 1; i < data.length; i++) {
      if (iDeleted !== undefined && String(data[i][iDeleted]) === '1') continue;
      if (iStatus !== undefined) {
        const st = String(data[i][iStatus] || 'BELUM_DIISI');
        if (st !== 'BELUM_DIISI') continue;
      }
      let rowTgl = '';
      if (iTanggal !== undefined) {
        const raw = data[i][iTanggal];
        if (raw instanceof Date) {
          const tz = getDB().getSpreadsheetTimeZone();
          rowTgl = Utilities.formatDate(raw, tz, 'yyyy-MM-dd');
        } else {
          rowTgl = String(raw).substring(0, 10);
        }
      }
      if (rowTgl !== inputTgl) continue;
      if (filteredCabang && iCabang !== undefined && String(data[i][iCabang]) !== filteredCabang) continue;

      const driverName = (idx['nama_driver'] !== undefined) ? String(data[i][idx['nama_driver']] || '').trim() : '';
      if (!driverName) continue;
      const driverKey = driverName + '|' + String(data[i][idx['vehicle_id']] || '');
      if (seen[driverKey]) continue;
      seen[driverKey] = true;

      list.push({
        nama_driver: driverName,
        driver_id: (idx['driver_id'] !== undefined) ? String(data[i][idx['driver_id']] || '') : '',
        vehicle_id: (idx['vehicle_id'] !== undefined) ? String(data[i][idx['vehicle_id']] || '') : '',
        plat_nomor: (idx['plat_nomor'] !== undefined) ? String(data[i][idx['plat_nomor']] || '') : '',
        nama_kendaraan: (idx['nama_kendaraan'] !== undefined) ? String(data[i][idx['nama_kendaraan']] || '') : '',
        flazz_card_id: (idx['flazz_card_id'] !== undefined) ? String(data[i][idx['flazz_card_id']] || '') : '',
        flazz_card_name: (idx['flazz_card_name'] !== undefined) ? String(data[i][idx['flazz_card_name']] || '') : ''
      });
    }
    return { success: true, list: list };
  } catch (e) {
    Logger.log('getJalurDriversForDate error: ' + e.toString());
    return { success: false, list: [], error: e.toString() };
  }
}
```

- [ ] **Step 2: Verify syntax by reviewing the file**

Run: Read `src/JalurOps.js` from the added function to end of file. Confirm no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add src/JalurOps.js
git commit -m "feat(jalur): add getJalurDriversForDate to fetch BELUM_DIISI jalur drivers"
```

---

### Task 2: Backend — `apiGetJalurDriversForDate()` in Code.js

**Files:**
- Modify: `src/Code.js`

**Interfaces:**
- Consumes: `getJalurDriversForDate(tanggal, userInfo, opts)` from Task 1
- Produces: `apiGetJalurDriversForDate(tanggal, token)` callable via `google.script.run`

- [ ] **Step 1: Add the endpoint function near other api* functions**

Find the line with `apiGetJalurByTanggal` (around line 461) and add right after it. Make sure the new function is BEFORE any closing `}` of the file scope:

```javascript
function apiGetJalurDriversForDate(tanggal, token) {
  var userInfo = requireUser(token);
  return getJalurDriversForDate(tanggal, userInfo);
}
```

- [ ] **Step 2: Verify syntax**

Read the surrounding area in `src/Code.js` to confirm correct placement.

- [ ] **Step 3: Commit**

```bash
git add src/Code.js
git commit -m "feat(api): add apiGetJalurDriversForDate endpoint"
```

---

### Task 3: Server-side Flazz Balance Gate in SpreadsheetOps.js

**Files:**
- Modify: `src/SpreadsheetOps.js` (after jalur gate ~line 170)
- Modify: `src/FlazzOps.js` (add helper)

**Interfaces:**
- Consumes: `payload.metode_pembayaran`, `payload.flazz_card_id`, `payload.biaya_bbm`, `effMetodeToll`, `effCardToll`, `payload.biaya_toll`
- Produces: Early return `{ success: false, error: "..." }` if balance insufficient

**IMPORTANT — placement:** `effMetodeToll` and `effCardToll` are computed at the TOP of the row-building section (SpreadsheetOps.js:227-228). The balance gate MUST be inserted AFTER those two `const` lines (i.e. after line 228) but BEFORE `sheet.appendRow(row)` (line 252) — that way no sheet writes ever happen before the gate.

- [ ] **Step 1: Add `findFlazzCardBalance()` helper in FlazzOps.js**

Add at end of `src/FlazzOps.js`:

```javascript
function findFlazzCardBalance(cardId) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Flazz_Card');
    if (!sheet) return null;
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const colIdx = {};
    headers.forEach(function(h, i) { colIdx[String(h).trim()] = i; });
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colIdx['id'] || 0]) === String(cardId)) {
        return {
          balance: parseFloat(data[i][colIdx['last_balance'] || colIdx['balance'] || colIdx['saldo_terakhir']]) || 0,
          name: String(data[i][colIdx['card_name'] || colIdx['card_number'] || ''] || ''),
          status: String(data[i][colIdx['status'] || ''] || '')
        };
      }
    }
    return null;
  } catch (e) {
    Logger.log('findFlazzCardBalance error: ' + e.toString());
    return null;
  }
}
```

- [ ] **Step 2: Add balance pre-check in saveTransactionEndOfDayUnlocked**

In `src/SpreadsheetOps.js`, find the two lines that resolve the effective toll method/card (around line 227-228):

```javascript
  const effMetodeToll = resolveTollMethod(payload.metode_toll, payload.metode_pembayaran, payload.flazz_card_id_toll);
  const effCardToll = resolveTollCard(payload.flazz_card_id_toll, effMetodeToll, payload.metode_pembayaran, payload.flazz_card_id);
```

Add the balance gate IMMEDIATELY AFTER that `effCardToll` line (before `storeMetodeBbm`):

```javascript
  // ─── Flazz balance insufficiency gate ───────────────────────────────────
  const biayaBbmCheck = parseFloat(payload.biaya_bbm) || 0;
  const biayaTolCheck = parseFloat(payload.biaya_toll) || 0;
  if (biayaBbmCheck > 0 && payload.metode_pembayaran === 'FLAZZ' && payload.flazz_card_id) {
    const cardInfo = findFlazzCardBalance(payload.flazz_card_id);
    if (cardInfo && cardInfo.balance < biayaBbmCheck) {
      return {
        success: false,
        error: 'Saldo kartu Flazz (' + (cardInfo.name || payload.flazz_card_id) + ') tidak mencukupi untuk pembayaran BBM. Saldo: Rp ' + Number(cardInfo.balance).toLocaleString('id-ID') + ', Pengeluaran: Rp ' + Number(biayaBbmCheck).toLocaleString('id-ID') + '. Silakan top up Flazz terlebih dahulu.'
      };
    }
  }
  if (biayaTolCheck > 0 && effMetodeToll === 'FLAZZ' && effCardToll) {
    const cardInfoTol = findFlazzCardBalance(effCardToll);
    if (cardInfoTol && cardInfoTol.balance < biayaTolCheck) {
      return {
        success: false,
        error: 'Saldo kartu Flazz (' + (cardInfoTol.name || effCardToll) + ') tidak mencukupi untuk pembayaran tol. Saldo: Rp ' + Number(cardInfoTol.balance).toLocaleString('id-ID') + ', Pengeluaran: Rp ' + Number(biayaTolCheck).toLocaleString('id-ID') + '. Silakan top up Flazz terlebih dahulu.'
      };
    }
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/SpreadsheetOps.js src/FlazzOps.js
git commit -m "feat(flazz): add balance insufficiency gate before report save"
```

---

### Task 4: Frontend — Jalur-based Driver Flow in js.html + Index.html

**Files:**
- Modify: `src/js.html`
- Modify: `src/Index.html`

**Interfaces:**
- Consumes: `apiGetJalurDriversForDate(tanggal, token)` from Task 2
- Produces: Dynamic driver list, auto-filled vehicle + Flazz card on driver select

- [ ] **Step 1: Add date/driver change handlers in js.html**

**KEY FACT:** `nama_supir` is an `<input>` with `list='supir-datalist'` (Index.html:261). Its suggested options live in the `<datalist id='supir-datalist'>` element (Index.html:262), NOT inside the input. Existing code populates that datalist via `populateSupirDatalist()` using the global `allDrivers` array (js.html:2041). Your new code must populate the **datalist** element (`supir-datalist`), not the input's innerHTML.

After the flazz card options population section (around line 340), add:

```javascript
// ─── Jalur-based driver selection ──────────────────────────────────────
window.__jalurDrivers = [];

function populateSupirDatalistFrom(names) {
  var dl = document.getElementById('supir-datalist');
  if (!dl) return;
  dl.innerHTML = '';
  (names || []).forEach(function(n) {
    if (!n) return;
    var o = document.createElement('option');
    o.value = n;
    dl.appendChild(o);
  });
}

function onLaporanDateChange() {
  var tglInput = document.getElementById('tanggal');
  var tgl = tglInput ? tglInput.value : '';
  var supirInput = document.getElementById('nama_supir');
  var selectVeh = document.getElementById('vehicle');
  var selectFlazzTol = document.getElementById('flazz_card_id_toll');

  // Reset but keep the input's datalist driven by the fetched jalur
  if (supirInput) supirInput.value = '';
  if (selectVeh) selectVeh.selectedIndex = 0;
  if (selectFlazzTol) selectFlazzTol.value = '';
  var tolStripReset = document.getElementById('flazz_card_id_toll_strip');
  if (tolStripReset) tolStripReset.textContent = '-';

  if (!tgl) { populateSupirDatalist(); return; }

  google.script.run
    .withFailureHandler(function(err) {
      console.error('Gagal load jalur drivers:', err);
      populateSupirDatalist();
    })
    .withSuccessHandler(function(res) {
      if (!res || !res.success || !res.list || !res.list.length) {
        populateSupirDatalist();
        return;
      }
      window.__jalurDrivers = res.list;
      var names = [];
      res.list.forEach(function(j) { names.push(j.nama_driver); });
      populateSupirDatalistFrom(names);
    })
    .apiGetJalurDriversForDate(tgl, bbmToken());
}

function onLaporanDriverChange() {
  var driverName = (document.getElementById('nama_supir') ? document.getElementById('nama_supir').value : '').trim();
  var jalurList = window.__jalurDrivers || [];
  var match = null;
  for (var i = 0; i < jalurList.length; i++) {
    if (jalurList[i].nama_driver === driverName) { match = jalurList[i]; break; }
  }
  if (!match) return;

  var vehSelect = document.getElementById('vehicle');
  if (vehSelect && match.vehicle_id) {
    for (var j = 0; j < vehSelect.options.length; j++) {
      if (vehSelect.options[j].value === match.vehicle_id) { vehSelect.selectedIndex = j; break; }
    }
  }

  var tolCardSelect = document.getElementById('flazz_card_id_toll');
  if (tolCardSelect && match.flazz_card_id) {
    tolCardSelect.value = match.flazz_card_id;
    var tolStrip = document.getElementById('flazz_card_id_toll_strip');
    if (tolStrip && match.flazz_card_name) tolStrip.textContent = match.flazz_card_name;
    // Show the toll card selector (it is hidden by default)
    var tolSection = tolCardSelect.closest('.row') || tolCardSelect.parentElement;
    if (tolSection) tolSection.style.display = '';
  }
  updateLiveSummary();
}
```

- [ ] **Step 2: Wire onchange on tanggal input in Index.html**

Find the tanggal input in `src/Index.html` (search for `id='tanggal'`). Add `onchange='onLaporanDateChange()'`:

```html
<input type='date' id='tanggal' class='form-control form-control-sm' required onchange='onLaporanDateChange()'>
```

- [ ] **Step 3: Wire onchange on nama_supir input in Index.html**

Find the nama_supir input in `src/Index.html` (search for `id='nama_supir'`). Add `onchange='onLaporanDriverChange()'`:

```html
<input id='nama_supir' class='form-control form-control-sm' list='supir-datalist' required autocomplete='off' placeholder='Ketik nama supir...' oninput='onSupirChange()' onchange='onLaporanDriverChange(); this.classList.remove("is-invalid"); updateLiveSummary()'>
```

- [ ] **Step 4: Commit**

```bash
git add src/js.html src/Index.html
git commit -m "feat(form): jalur-based driver selection with auto-fill vehicle and Flazz card"
```

---

### Task 5: Frontend — Client-side Flazz Balance Warning in js.html

**Files:**
- Modify: `src/js.html`

**Interfaces:**
- Consumes: `data.flazzCards` (loaded at init with `last_balance`)
- Produces: Toast warning + block submit if balance insufficient

- [ ] **Step 1: Store flazzCards on initial load**

In `src/js.html`, find `userRole = data.role;` inside the `loadInitialData` success handler. Add right before it:

```javascript
window.__bbmInitData = data;
```

- [ ] **Step 2: Add balance check function**

Add in `src/js.html` (near validation functions):

```javascript
function checkFlazzBalanceBeforeSubmit() {
  var metodeBbm = '';
  var mbR = document.getElementsByName('metode_pembayaran');
  for (var i = 0; i < mbR.length; i++) { if (mbR[i].checked) { metodeBbm = mbR[i].value; break; } }
  var metodeTol = '';
  var mtR = document.getElementsByName('metode_toll');
  for (var j = 0; j < mtR.length; j++) { if (mtR[j].checked) { metodeTol = mtR[j].value; break; } }

  var biayaBbm = parseFloat(document.getElementById('biaya_bbm').value) || 0;
  var biayaTol = parseFloat(document.getElementById('biaya_toll').value) || 0;
  var cardIdBbm = document.getElementById('flazz_card_id') ? document.getElementById('flazz_card_id').value : '';
  var cardIdTol = document.getElementById('flazz_card_id_toll') ? document.getElementById('flazz_card_id_toll').value : '';

  var flazzCards = (window.__bbmInitData && window.__bbmInitData.flazzCards) || [];

  function findCardBalance(cardId) {
    for (var k = 0; k < flazzCards.length; k++) {
      if (flazzCards[k].id === cardId) return parseFloat(flazzCards[k].last_balance) || 0;
    }
    return -1;
  }
  function findCardName(cardId) {
    for (var k = 0; k < flazzCards.length; k++) {
      if (flazzCards[k].id === cardId) return flazzCards[k].card_number || cardId;
    }
    return cardId;
  }

  if (metodeBbm === 'FLAZZ' && biayaBbm > 0 && cardIdBbm) {
    var bal = findCardBalance(cardIdBbm);
    if (bal >= 0 && bal < biayaBbm) {
      showToast('Saldo kartu Flazz (' + findCardName(cardIdBbm) + ') tidak mencukupi untuk BBM. Saldo: Rp ' + bal.toLocaleString('id-ID') + ', Pengeluaran: Rp ' + biayaBbm.toLocaleString('id-ID') + '. Silakan top up Flazz.', 'error', 6000);
      return false;
    }
  }
  if (metodeTol === 'FLAZZ' && biayaTol > 0 && cardIdTol) {
    var balTol = findCardBalance(cardIdTol);
    if (balTol >= 0 && balTol < biayaTol) {
      showToast('Saldo kartu Flazz (' + findCardName(cardIdTol) + ') tidak mencukupi untuk tol. Saldo: Rp ' + balTol.toLocaleString('id-ID') + ', Pengeluaran: Rp ' + biayaTol.toLocaleString('id-ID') + '. Silakan top up Flazz.', 'error', 6000);
      return false;
    }
  }
  return true;
}
```

- [ ] **Step 3: Call balance check before submit**

In `src/js.html`, find `function processDailyReport()`. Add at the very start of the function body:

```javascript
if (!checkFlazzBalanceBeforeSubmit()) return;
```

- [ ] **Step 4: Commit**

```bash
git add src/js.html
git commit -m "feat(flazz): add client-side balance warning before report submit"
```

---

### Task 6: Version Bump & Final Verification

**Files:**
- Modify: `src/Config.gs`

- [ ] **Step 1: Bump PAGE_VER**

In `src/Config.gs`, update:

```javascript
const PAGE_VER = '20260916v1';
```

- [ ] **Step 2: Review all changes via git diff**

```bash
git diff --stat
git diff
```

- [ ] **Step 3: Commit all**

```bash
git add -A
git commit -m "feat: jalur driver autofill + Flazz balance gate (v20260916v1)"
```
