# List Flazz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "List Flazz" page under the LISTING sidebar section showing a per-card daily summary table (saldo awal, pengeluaran, saldo akhir) with a detail modal and A4 print capability.

**Architecture:** Single-page listing reusing existing `getFlazzDashboardData()` backend. All computation (saldo awal, pengeluaran) done client-side from cached data. Detail modal shows full card info + tabbed transaction history. Print uses window.open with A4-formatted report.

**Tech Stack:** Google Apps Script (V8), Bootstrap 5, vanilla JS, `google.script.run` RPC.

## Global Constraints

- No new backend functions — reuse `getFlazzDashboardData()`
- Follow existing code conventions (inline HTML in `.html` files, `google.script.run` for data, `innerHTML` for rendering)
- Use existing Bootstrap 5 classes and `bi` icon set
- Desktop-only (no mobile layout needed)
- Date filter defaults to today
- `switchTab("flazz-listing")` must show `page-flazz-listing` and call `renderFlazzListing()`; `'listing'` appended to `flazzPages` array

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/Index.html` | Add sidebar link for "List Flazz" |
| `src/FlazzPages.html` | Add `page-flazz-listing` HTML (table, detail modal, print container) |
| `src/FlazzScript.html` | Add `renderFlazzListing()`, `renderFlazzListingTable()`, `showFlazzDetailModal()`, `renderFlazzDetailHistory()`, `showFlazzDetailTab()`, `printFlazzA4()` |
| `src/js.html` | Add `flazz-listing` to `switchTab()` routing and `flazzPages` hide array |
| `src/css.html` | (no changes required — print uses window.open approach) |

---

### Task 1: Sidebar Link + Routing

**Files:**
- Modify: `src/Index.html:137-139` (after "Riwayat Flazz" link)
- Modify: `src/js.html:314` (flazzPages array)
- Modify: `src/js.html:349-353` (switchTab flazz block)

**Interfaces:**
- Produces: `switchTab("flazz-listing")` shows `page-flazz-listing` and calls `renderFlazzListing()`

- [ ] **Step 1: Add sidebar link in Index.html**

After the `tab-flazz-history` link (line 139), add:

```html
<a class='nav-link sidebar-link' id='tab-flazz-listing' href='#' onclick='switchTab("flazz-listing")'>
  <i class='bi bi-credit-card'></i> <span>List Flazz</span>
</a>
```

- [ ] **Step 2: Update flazzPages array in js.html**

In `switchTab()` at line 314, change:
```javascript
let flazzPages = ['dashboard', 'master', 'usage', 'topup', 'tol', 'recon', 'history'];
```
to:
```javascript
let flazzPages = ['dashboard', 'master', 'usage', 'topup', 'tol', 'recon', 'history', 'listing'];
```

- [ ] **Step 3: Add routing case in js.html**

Add an explicit case BEFORE the `tab.startsWith('flazz-')` check (around line 349):

```javascript
} else if (tab === 'flazz-listing') {
  document.getElementById('page-flazz-listing').style.display = 'block';
  if (typeof renderFlazzListing === 'function') renderFlazzListing();
}
```

The existing `tab.startsWith('flazz-')` block is:
```javascript
} else if (tab.startsWith('flazz-')) {
  let flazzTab = tab.substring(6);
  let pageEl = document.getElementById('page-flazz-' + flazzTab);
  if(pageEl) pageEl.style.display = 'block';
  if(typeof loadFlazzDataWrapper === 'function') loadFlazzDataWrapper();
}
```
Note: placing the new case AFTER the flazz- block would make `flazz-listing` hit the generic flazz- handler which already shows `page-flazz-listing` and calls `loadFlazzDataWrapper()`. However, the plan requires the explicit case with `renderFlazzListing()`. Place it immediately before the `tab.startsWith('flazz-')` check.

- [ ] **Step 4: Verify**

Open the app → sidebar should show "List Flazz" under LISTING → clicking it should show an empty page (no content yet) → other Flazz tabs should still work.

---

### Task 2: Page HTML Structure

**Files:**
- Modify: `src/FlazzPages.html` (append at end, after line 297)

**Interfaces:**
- Consumes: `flazzDataCache` from `loadFlazzDataWrapper()`
- Produces: `page-flazz-listing` div with date filter, loading/empty states, table, pagination, detail modal, print container

- [ ] **Step 1: Add page-flazz-listing HTML**

Append to `FlazzPages.html` (after line 297, the last closing `</div>`):

```html
<div id='page-flazz-listing' style='display:none;' class='fade-in'>
  <div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class='mb-0 text-primary fw-bold'><i class='bi bi-credit-card me-2'></i>List Flazz</h4>
  </div>
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
  <div id='flazz-listing-loading' class='text-center py-4' style='display:none;'>
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
    <div class="mt-2 text-muted small">Memuat data Flazz...</div>
  </div>
  <div id='flazz-listing-loaded' style='display:none;'>
    <div class="card shadow-sm border-0 rounded-4 mb-3">
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class='table table-hover align-middle mb-0'>
            <thead class='table-light'>
              <tr>
                <th class='text-center' style='width:50px;'>No</th>
                <th>Nomor Kartu</th>
                <th>Nama Kartu</th>
                <th>Driver</th>
                <th class='text-end'>Saldo Awal</th>
                <th class='text-end'>Pengeluaran</th>
                <th class='text-end'>Saldo Akhir</th>
              </tr>
            </thead>
            <tbody id='flazz-listing-table'></tbody>
          </table>
        </div>
      </div>
    </div>
    <div class='text-muted small mb-2 py-4 text-center' id='flazz-listing-none' style='display:none;'>
      <i class='bi bi-inbox fs-1 d-block mb-2'></i>Belum ada data kartu Flazz.
    </div>
  </div>

  <!-- Detail Modal -->
  <div class="modal fade" id="modal-flazz-detail" tabindex="-1">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-primary text-white border-0 rounded-top-4">
          <h5 class="modal-title fw-bold" id="flazz-detail-title"></h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body" id="flazz-detail-body"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary rounded-pill" data-bs-dismiss="modal">Tutup</button>
          <button type="button" class="btn btn-success rounded-pill" onclick="printFlazzA4()">
            <i class="bi bi-printer me-1"></i>Cetak A4
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Verify**

Open app → click "List Flazz" → should see the page structure with date filter and empty table area.

---

### Task 3: Table Rendering with Saldo Computation

**Files:**
- Modify: `src/FlazzScript.html` (append at end, before closing `</html>` include marker)

**Interfaces:**
- Consumes: `flazzDataCache` (cards, topups, tols, bbmFlazz), `formatCurrency()`
- Produces: `renderFlazzListing()`, `renderFlazzListingTable()` functions
- Used by: Task 1 routing, Task 2 date filter

- [ ] **Step 1: Add renderFlazzListing functions**

Append to `FlazzScript.html`:

```javascript
// ==========================================
// LIST FLAZZ - Listing Page
// ==========================================

let __flazzListingData = null;

function renderFlazzListing() {
  if (flazzDataCache) {
    __flazzListingData = flazzDataCache;
    document.getElementById('flazz-listing-loading').style.display = 'none';
    document.getElementById('flazz-listing-loaded').style.display = 'block';
    renderFlazzListingTable();
  } else {
    document.getElementById('flazz-listing-loading').style.display = 'block';
    document.getElementById('flazz-listing-loaded').style.display = 'none';
    let attempts = 0;
    let checker = setInterval(function() {
      attempts++;
      if (flazzDataCache) {
        clearInterval(checker);
        __flazzListingData = flazzDataCache;
        document.getElementById('flazz-listing-loading').style.display = 'none';
        document.getElementById('flazz-listing-loaded').style.display = 'block';
        renderFlazzListingTable();
      } else if (attempts > 30) {
        clearInterval(checker);
        document.getElementById('flazz-listing-loading').style.display = 'none';
        showToast('Gagal memuat data Flazz', 'error');
      }
    }, 200);
  }
}

function renderFlazzListingTable() {
  if (!__flazzListingData) return;
  let data = __flazzListingData;
  let cards = data.cards || [];
  let selectedDate = document.getElementById('flazz-listing-date').value;
  if (!selectedDate) {
    selectedDate = new Date().toISOString().slice(0, 10);
    document.getElementById('flazz-listing-date').value = selectedDate;
  }

  let tbody = document.getElementById('flazz-listing-table');
  let noneEl = document.getElementById('flazz-listing-none');
  if (!tbody) return;
  tbody.innerHTML = '';

  let activeCards = cards.filter(c => c.status !== 'NONAKTIF');
  if (activeCards.length === 0) {
    noneEl.style.display = 'block';
    return;
  }
  noneEl.style.display = 'none';

  activeCards.forEach(function(c, idx) {
    let cardId = c.id;
    let lastBal = parseFloat(c.last_balance) || 0;

    let dayTopups = (data.topups || []).filter(t =>
      t.card_id === cardId && String(t.date || '').substring(0, 10) === selectedDate
    );
    let dayTols = (data.tols || []).filter(t =>
      t.card_id === cardId && String(t.date || '').substring(0, 10) === selectedDate
    );
    let dayBbm = (data.bbmFlazz || []).filter(b =>
      b.card_id === cardId && String(b.tanggal || b.timestamp || '').substring(0, 10) === selectedDate
    );

    let totalTopup = dayTopups.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    let totalTol = dayTols.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    let totalBbm = dayBbm.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    let totalExpense = totalTol + totalBbm;

    // saldo_awal = saldo_akhir + pengeluaran - topup_hari
    let saldoAwal = lastBal + totalExpense - totalTopup;

    let badgeClass = c.status === 'SEDANG_DIGUNAKAN' ? 'bg-warning' : (c.status === 'TERSEDIA' ? 'bg-success' : 'bg-secondary');

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
      <td class='text-end'>${formatCurrency(saldoAwal)}</td>
      <td class='text-end text-danger fw-bold'>${totalExpense > 0 ? '-' + formatCurrency(totalExpense) : '-'}</td>
      <td class='text-end fw-bold'>${formatCurrency(lastBal)}</td>
    `;
    tbody.appendChild(tr);
  });
}
```

- [ ] **Step 2: Verify**

Open app → click "List Flazz" → table should show all active cards with saldo awal, pengeluaran, saldo akhir for today. Change date → table recalculates.

---

### Task 4: Detail Modal

**Files:**
- Modify: `src/FlazzScript.html` (append after Task 3 code)

**Interfaces:**
- Consumes: `__flazzListingData` (all data), `formatCurrency()`, `formatDateShort()`, `modal-flazz-detail` from Task 2
- Produces: `showFlazzDetailModal(cardId)`, `showFlazzDetailTab(containerId, e)`, `renderFlazzDetailHistory(cardId, data)`
- Used by: Task 3 table links, Task 5 print

- [ ] **Step 1: Add detail modal functions**

Append to `FlazzScript.html`:

```javascript
function showFlazzDetailModal(cardId) {
  if (!__flazzListingData) return;
  let data = __flazzListingData;
  let card = (data.cards || []).find(c => c.id === cardId);
  if (!card) return;

  let statusBadge = card.status === 'SEDANG_DIGUNAKAN' ? 'bg-warning' :
    (card.status === 'TERSEDIA' ? 'bg-success' : 'bg-secondary');

  document.getElementById('flazz-detail-title').innerHTML =
    '<i class="bi bi-credit-card me-2"></i>' + card.card_number +
    ' <span class="badge ' + statusBadge + ' ms-2" style="font-size:0.7rem;">' + card.status + '</span>';

  let html = '';

  // Card info section
  html += '<div class="row g-3 mb-4">';
  html += '<div class="col-md-3"><div class="text-muted small fw-bold">Nama Kartu</div><div>' + (card.card_name || '-') + '</div></div>';
  html += '<div class="col-md-3"><div class="text-muted small fw-bold">Tipe</div><div>' + (card.card_type || '-') + '</div></div>';
  html += '<div class="col-md-3"><div class="text-muted small fw-bold">Driver</div><div>' + (card.driver_id || '-') + '</div></div>';
  html += '<div class="col-md-3"><div class="text-muted small fw-bold">Cabang</div><div>' + (card.branch_id || '-') + '</div></div>';
  html += '<div class="col-md-3"><div class="text-muted small fw-bold">Saldo Saat Ini</div><div class="fw-bold text-primary fs-5">' + formatCurrency(card.last_balance) + '</div></div>';
  html += '</div>';

  // Tabs
  html += '<ul class="nav nav-tabs" id="flazzDetailTabs">';
  html += '<li class="nav-item"><a class="nav-link active" href="#" onclick="showFlazzDetailTab(\'detail-topup\', event)">Top Up</a></li>';
  html += '<li class="nav-item"><a class="nav-link" href="#" onclick="showFlazzDetailTab(\'detail-tol\', event)">Tol</a></li>';
  html += '<li class="nav-item"><a class="nav-link" href="#" onclick="showFlazzDetailTab(\'detail-bbm\', event)">BBM (Flazz)</a></li>';
  html += '<li class="nav-item"><a class="nav-link" href="#" onclick="showFlazzDetailTab(\'detail-usage\', event)">Pemakaian</a></li>';
  html += '<li class="nav-item"><a class="nav-link" href="#" onclick="showFlazzDetailTab(\'detail-recon\', event)">Rekonsiliasi</a></li>';
  html += '</ul>';

  // Tab content containers
  html += '<div class="tab-content mt-3">';
  html += '<div id="detail-topup-container"><table class="table table-sm align-middle"><thead class="table-light"><tr><th>Tanggal</th><th>Nominal</th><th>Bukti</th><th>Catatan</th></tr></thead><tbody id="tb-detail-topup"></tbody></table></div>';
  html += '<div id="detail-tol-container" style="display:none;"><table class="table table-sm align-middle"><thead class="table-light"><tr><th>Tanggal</th><th>Supir/Kendaraan</th><th>Nominal</th><th>Bukti</th><th>Catatan</th></tr></thead><tbody id="tb-detail-tol"></tbody></table></div>';
  html += '<div id="detail-bbm-container" style="display:none;"><table class="table table-sm align-middle"><thead class="table-light"><tr><th>Tanggal</th><th>Supir/Kendaraan</th><th>Biaya</th><th>Bukti</th></tr></thead><tbody id="tb-detail-bbm"></tbody></table></div>';
  html += '<div id="detail-usage-container" style="display:none;"><table class="table table-sm align-middle"><thead class="table-light"><tr><th>Tanggal</th><th>Supir/Kendaraan</th><th>Tipe</th><th>Status</th></tr></thead><tbody id="tb-detail-usage"></tbody></table></div>';
  html += '<div id="detail-recon-container" style="display:none;"><table class="table table-sm align-middle"><thead class="table-light"><tr><th>Tanggal</th><th>Saldo Awal</th><th>Top Up</th><th>BBM+Tol</th><th>Saldo Sistem</th><th>Saldo Fisik</th><th>Selisih</th><th>Status</th></tr></thead><tbody id="tb-detail-recon"></tbody></table></div>';
  html += '</div>';

  document.getElementById('flazz-detail-body').innerHTML = html;

  renderFlazzDetailHistory(cardId, data);

  new bootstrap.Modal(document.getElementById('modal-flazz-detail')).show();
}

function showFlazzDetailTab(containerId, e) {
  if (e) e.preventDefault();
  document.querySelectorAll('#flazzDetailTabs .nav-link').forEach(el => el.classList.remove('active'));
  if (e) e.target.classList.add('active');
  ['detail-topup', 'detail-tol', 'detail-bbm', 'detail-usage', 'detail-recon'].forEach(id => {
    let el = document.getElementById(id + '-container');
    if (el) el.style.display = 'none';
  });
  let target = document.getElementById(containerId + '-container');
  if (target) target.style.display = 'block';
}

function renderFlazzDetailHistory(cardId, data) {
  // Top Ups
  let topups = (data.topups || []).filter(t => t.card_id === cardId);
  let topupTbody = document.getElementById('tb-detail-topup');
  if (topupTbody) {
    topupTbody.innerHTML = '';
    if (topups.length === 0) {
      topupTbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Tidak ada data</td></tr>';
    } else {
      topups.forEach(t => {
        topupTbody.innerHTML += '<tr><td>' + formatDateShort(t.date) + '</td><td class="text-success fw-bold">+' + formatCurrency(t.amount) + '</td><td>' + (t.evidence_url ? '<a href="' + t.evidence_url + '" target="_blank">Lihat</a>' : '-') + '</td><td>' + (t.notes || '') + '</td></tr>';
      });
    }
  }

  // Tols
  let tols = (data.tols || []).filter(t => t.card_id === cardId);
  let tolTbody = document.getElementById('tb-detail-tol');
  if (tolTbody) {
    tolTbody.innerHTML = '';
    if (tols.length === 0) {
      tolTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Tidak ada data</td></tr>';
    } else {
      tols.forEach(t => {
        tolTbody.innerHTML += '<tr><td>' + formatDateShort(t.date) + '</td><td>' + (t.driver_id || '-') + ' / ' + (t.vehicle_id || '-') + '</td><td class="text-danger fw-bold">-' + formatCurrency(t.amount) + '</td><td>' + (t.evidence_url ? '<a href="' + t.evidence_url + '" target="_blank">Lihat</a>' : '-') + '</td><td>' + (t.notes || '') + '</td></tr>';
      });
    }
  }

  // BBM Flazz
  let bbm = (data.bbmFlazz || []).filter(b => b.card_id === cardId);
  let bbmTbody = document.getElementById('tb-detail-bbm');
  if (bbmTbody) {
    bbmTbody.innerHTML = '';
    if (bbm.length === 0) {
      bbmTbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Tidak ada data</td></tr>';
    } else {
      bbm.forEach(b => {
        bbmTbody.innerHTML += '<tr><td>' + formatDateShort(b.tanggal) + '</td><td>' + (b.driver || '-') + ' / ' + (b.vehicle || '-') + '</td><td class="text-danger fw-bold">-' + formatCurrency(b.amount) + '</td><td>' + (b.evidence ? '<a href="' + b.evidence + '" target="_blank">Struk</a>' : '-') + '</td></tr>';
      });
    }
  }

  // Usage
  let usages = (data.usages || []).filter(u => u.card_id === cardId);
  let usageTbody = document.getElementById('tb-detail-usage');
  if (usageTbody) {
    usageTbody.innerHTML = '';
    if (usages.length === 0) {
      usageTbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Tidak ada data</td></tr>';
    } else {
      usages.forEach(u => {
        let badge = u.status === 'DIBERIKAN' ? 'bg-warning' : 'bg-success';
        usageTbody.innerHTML += '<tr><td>' + formatDateShort(u.date) + '</td><td>' + (u.driver_id || '-') + ' / ' + (u.vehicle_id || '-') + '</td><td>' + (u.usage_type || '-') + '</td><td><span class="badge ' + badge + '">' + u.status + '</span></td></tr>';
      });
    }
  }

  // Reconciliation
  let recons = (data.recons || []).filter(r => r.card_id === cardId);
  let reconTbody = document.getElementById('tb-detail-recon');
  if (reconTbody) {
    reconTbody.innerHTML = '';
    if (recons.length === 0) {
      reconTbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Tidak ada data</td></tr>';
    } else {
      recons.forEach(r => {
        let statClass = r.reconciliation_status === 'SESUAI' ? 'bg-success' : 'bg-danger';
        reconTbody.innerHTML += '<tr><td>' + formatDateShort(r.date) + '</td><td>' + formatCurrency(r.opening_balance) + '</td><td class="text-success">+' + formatCurrency(r.total_topup) + '</td><td class="text-danger">-' + formatCurrency(r.total_bbm_flazz + r.total_tol) + '</td><td class="fw-bold">' + formatCurrency(r.flazz_balance) + '</td><td>' + formatCurrency(r.actual_balance) + '</td><td class="' + (r.difference < 0 ? 'text-success' : 'text-danger') + '">' + formatCurrency(r.difference) + '</td><td><span class="badge ' + statClass + '">' + r.reconciliation_status + '</span></td></tr>';
      });
    }
  }
}
```

- [ ] **Step 2: Verify**

Click a card number in the listing table → modal opens with card info + tabbed history. All tabs show correct data. Close modal works.

---

### Task 5: Print A4 Feature

**Files:**
- Modify: `src/FlazzScript.html` (append after Task 4 code)

**Interfaces:**
- Consumes: `__flazzListingData`, `formatCurrency()`, `formatDateShort()`, current selected date from `flazz-listing-date`
- Produces: `printFlazzA4()` function

- [ ] **Step 1: Add printFlazzA4 function**

Append to `FlazzScript.html`:

```javascript
function printFlazzA4() {
  let modalTitle = document.getElementById('flazz-detail-title').innerHTML;
  let cardMatch = modalTitle.match(/>([^<]+)</);
  if (!cardMatch) return;
  let cardNumber = cardMatch[1].trim();

  let data = __flazzListingData;
  if (!data) return;
  let card = (data.cards || []).find(c => c.card_number === cardNumber);
  if (!card) return;

  let selectedDate = document.getElementById('flazz-listing-date').value || new Date().toISOString().slice(0, 10);

  // Compute daily summary
  let lastBal = parseFloat(card.last_balance) || 0;
  let dayTopups = (data.topups || []).filter(t => t.card_id === card.id && String(t.date || '').substring(0, 10) === selectedDate);
  let dayTols = (data.tols || []).filter(t => t.card_id === card.id && String(t.date || '').substring(0, 10) === selectedDate);
  let dayBbm = (data.bbmFlazz || []).filter(b => b.card_id === card.id && String(b.tanggal || b.timestamp || '').substring(0, 10) === selectedDate);

  let totalTopup = dayTopups.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  let totalTol = dayTols.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  let totalBbm = dayBbm.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
  let totalExpense = totalTol + totalBbm;
  let saldoAwal = lastBal + totalExpense - totalTopup;

  let printHtml = '<!DOCTYPE html><html><head><title>Cetak Flazz - ' + card.card_number + '</title>';
  printHtml += '<style>@page{size:A4;margin:15mm;}body{font-family:Arial,sans-serif;font-size:11pt;color:#000;}';
  printHtml += '.print-header{text-align:center;margin-bottom:20px;border-bottom:2px solid #000;padding-bottom:10px;}';
  printHtml += '.print-header h2{margin:0;font-size:16pt;}';
  printHtml += '.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:15px;}';
  printHtml += '.info-grid .label{font-weight:bold;color:#555;}';
  printHtml += 'table{width:100%;border-collapse:collapse;margin-top:10px;}';
  printHtml += 'table th,table td{border:1px solid #ccc;padding:6px 8px;font-size:10pt;text-align:left;}';
  printHtml += 'table th{background:#f0f0f0;font-weight:bold;}';
  printHtml += '.summary-box{background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;padding:12px;margin:15px 0;}';
  printHtml += '.summary-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #ccc;}';
  printHtml += '.summary-row:last-child{border-bottom:none;font-weight:bold;font-size:12pt;}';
  printHtml += '.footer{margin-top:30px;font-size:9pt;color:#888;text-align:center;border-top:1px solid #ccc;padding-top:8px;}';
  printHtml += '</style></head><body>';

  printHtml += '<div class="print-header"><h2>LAPORAN KARTU FLAZZ</h2>';
  printHtml += '<div>Tanggal: <strong>' + selectedDate + '</strong></div></div>';

  printHtml += '<div class="info-grid">';
  printHtml += '<div><span class="label">Nomor Kartu:</span> ' + card.card_number + '</div>';
  printHtml += '<div><span class="label">Nama Kartu:</span> ' + (card.card_name || '-') + '</div>';
  printHtml += '<div><span class="label">Tipe Kartu:</span> ' + (card.card_type || '-') + '</div>';
  printHtml += '<div><span class="label">Driver:</span> ' + (card.driver_id || '-') + '</div>';
  printHtml += '<div><span class="label">Cabang:</span> ' + (card.branch_id || '-') + '</div>';
  printHtml += '<div><span class="label">Status:</span> ' + card.status + '</div>';
  printHtml += '</div>';

  // Summary
  printHtml += '<div class="summary-box">';
  printHtml += '<div class="summary-row"><span>Saldo Awal (Sebelum Transaksi Hari Ini)</span><span>' + formatCurrency(saldoAwal) + '</span></div>';
  if (totalTopup > 0) printHtml += '<div class="summary-row"><span>Top Up Hari Ini</span><span>+' + formatCurrency(totalTopup) + '</span></div>';
  if (totalBbm > 0) printHtml += '<div class="summary-row"><span>Pengeluaran BBM</span><span>-' + formatCurrency(totalBbm) + '</span></div>';
  if (totalTol > 0) printHtml += '<div class="summary-row"><span>Pengeluaran Tol</span><span>-' + formatCurrency(totalTol) + '</span></div>';
  if (totalExpense > 0) printHtml += '<div class="summary-row"><span>Total Pengeluaran</span><span>-' + formatCurrency(totalExpense) + '</span></div>';
  printHtml += '<div class="summary-row"><span>Saldo Akhir (Saat Ini)</span><span>' + formatCurrency(lastBal) + '</span></div>';
  printHtml += '</div>';

  // Transaction detail table
  if (dayTols.length > 0 || dayBbm.length > 0) {
    printHtml += '<h5 style="margin-top:15px;">Detail Pengeluaran Hari Ini</h5>';
    printHtml += '<table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Supir/Kendaraan</th><th>Nominal</th></tr></thead><tbody>';
    dayTols.forEach(t => {
      printHtml += '<tr><td>' + formatDateShort(t.date) + '</td><td>Tol</td><td>' + (t.driver_id || '-') + ' / ' + (t.vehicle_id || '-') + '</td><td>' + formatCurrency(t.amount) + '</td></tr>';
    });
    dayBbm.forEach(b => {
      printHtml += '<tr><td>' + formatDateShort(b.tanggal) + '</td><td>BBM</td><td>' + (b.driver || '-') + ' / ' + (b.vehicle || '-') + '</td><td>' + formatCurrency(b.amount) + '</td></tr>';
    });
    printHtml += '</tbody></table>';
  }

  printHtml += '<div class="footer">Dicetak pada ' + new Date().toLocaleString('id-ID') + ' | Sistem Monitoring BBM</div>';
  printHtml += '<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>';
  printHtml += '</body></html>';

  let printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(printHtml);
  printWindow.document.close();
}
```

- [ ] **Step 2: Verify**

Click card → modal opens → click "Cetak A4" → new window opens with A4-formatted report → print dialog auto-triggers.

---

## Self-Review Checklist

1. **Spec coverage**: Sidebar link, date filter, table with saldo computation, detail modal with tabs, print A4 — all covered
2. **Placeholder scan**: No TBD/TODO placeholders
3. **Type consistency**: Functions match across tasks (renderFlazzListing, showFlazzDetailModal, printFlazzA4)
4. **Backend reuse**: No new server functions — all data from `getFlazzDashboardData()`
5. **Routing**: `flazz-listing` added to flazzPages array and switchTab