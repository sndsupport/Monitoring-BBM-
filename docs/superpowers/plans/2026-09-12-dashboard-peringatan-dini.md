# Panel Peringatan Dini Dashboard - Implementation Plan

> **For agentic workers:** Gunakan superpowers:subagent-driven-development atau superpowers:executing-plans per task. Steps pakai checkbox.

**Goal:** Panel "Peringatan Dini" di landing dashboard — pajak/KIR kendaraan + kartu etoll saldo < Rp100.000, scoped per cabang.

**Architecture:** WarningsCore.js (murni) -> WarningOps.warningsSummary (GAS) -> Code.getDashboardWarnings (cache 300s) -> render klien di page-dashboard.

**Tech Stack:** Google Apps Script, HTML/Bootstrap 5 + Bootstrap Icons, node uji scratch, TestRunner (editor).

## Global Constraints

- Token selalu param terakhir: google.script.run....(args..., bbmToken()).
- Ambang saldo: < 100000; NONAKTIF dilewati.
- Reuse jalurComputePajak: LEWAT <=0 / KRITIS <=30 / WASPADA <=60.
- Cache dashwarnCacheKey TTL 300dtk.
- UI Indonesia, tanpa emoji; esc(); badge cabang utk SUPERADMIN.
- Commit kecil; node --check wajib.

**Referensi:** getActiveVehicles (SpreadsheetOps.js:63), getFlazzCards (FlazzOps.js:149), jalurComputePajak (JalurOps.js:239), getPerformaData (Code.js:224), renderDashboard (js.html:1220).

---

### Task 1: WarningsCore.js (logika murni) - TDD node

**Files:** Create src/WarningsCore.js | Test: %TEMP%/opencode/warnings-core-test.js (gitignored)

**Interfaces:** Produces warnVehicleAlerts, warnWorst, warnCardIsLow, warnSortPajak, warnMinSisa, WARN_LEVEL. Consumes global jalurComputePajak.

- [ ] Step 1: Tulis test node yang gagal
- [ ] Step 2: Jalankan, pastikan gagal (ReferenceError)
- [ ] Step 3: Implementasi src/WarningsCore.js
- [ ] Step 4: Jalankan, pastikan PASS
- [ ] Step 5: node --check + commit feat(dashboard): inti logika peringatan dini

---

### Task 2: Endpoint getDashboardWarnings + cache

**Files:** Create src/WarningOps.js | Modify src/CacheUtil.js | Modify src/Code.js

**Interfaces:** Consumes WarningsCore, getActiveVehicles, getFlazzCards, requireUser, dashwarnCacheKey. Produces getDashboardWarnings(token).

- [ ] Step 1: Create src/WarningOps.js (warningsSummary + warnDateStr)
- [ ] Step 2: Append dashwarnCacheKey ke CacheUtil.js
- [ ] Step 3: Tambah getDashboardWarnings ke Code.js (cache wrapper, TTL 300)
- [ ] Step 4: node --check 3 file
- [ ] Step 5: Commit feat(dashboard): endpoint getDashboardWarnings + cache

---

### Task 3: TestRunner untuk Warnings

**Files:** Modify src/TestRunner.js

**Interfaces:** Consumes Task 1 & 2.

- [ ] Step 1: Tambah __runWarningsTests() (boundary saldo, NONAKTIF, pajak lewat/jauh, SUPER/PIC scope, token palsu)
- [ ] Step 2: Daftarkan di __runAllTests
- [ ] Step 3: node --check
- [ ] Step 4: Commit test(dashboard): kasus uji peringatan dini

---

### Task 4: Markup panel di Index.html

**Files:** Modify src/Index.html (sisip setelah Akses Cepat, sebelum Status Kartu Etoll)

- [ ] Step 1: Sisip kartu dash-warnings-card (header + loading + content + 2 kolom grup)
- [ ] Step 2: node --check + commit feat(dashboard): markup panel peringatan dini

---

### Task 5: Logika klien + wiring + refresh hook

**Files:** Modify src/js.html | Modify src/FlazzScript.html | Modify src/JalurScript.html

**Interfaces:** Consumes getDashboardWarnings, esc(), showToast.

- [ ] Step 1: Tambah loadDashboardWarnings + renderDashboardWarnings + helper di js.html
- [ ] Step 2: Panggil loadDashboardWarnings() di renderDashboard()
- [ ] Step 3: Hook refresh di FlazzScript (topup/rekon) + JalurScript (save jalur)
- [ ] Step 4: node --check 3 file
- [ ] Step 5: Commit feat(dashboard): render & refresh panel peringatan dini

---

### Task 6: Push, deploy @251, verifikasi live, ledger

- [ ] Step 1: clasp push -f
- [ ] Step 2: clasp deploy (link sama) -> @251
- [ ] Step 3: Live verify: PIC (own cabang only) + SUPERADMIN (filter + badge) + boundary Rp100.000
- [ ] Step 4: __runWarningsTests via __runAllTests di editor
- [ ] Step 5: Ledger update
## Detail Eksekusi (lengkap)

### Task 1: WarningsCore.js (TDD node)

**Test** `%TEMP%\opencode\warnings-core-test.js` (scratch, gitignored) — tulis dulu, harus FAIL:

```js
const fs = require('fs');
const assert = require('assert');
global.jalurComputePajak = (d) => {
  if (!d) return { sisa_hari_pajak: null, status_pajak: 'TIDAK_ADA' };
  const due = new Date(String(d).slice(0,10) + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const days = Math.ceil((due - today) / 86400000);
  let st = 'AMAN';
  if (days <= 0) st = 'LEWAT'; else if (days <= 30) st = 'KRITIS'; else if (days <= 60) st = 'WASPADA';
  return { sisa_hari_pajak: days, status_pajak: st };
};
eval(fs.readFileSync('D:/Monitoring BBM/src/WarningsCore.js', 'utf8'));
assert.deepStrictEqual(warnVehicleAlerts({ tanggal_pajak: '2026-01-01', tanggal_pajak_5_tahunan: '2029-01-01', tanggal_kir: '2026-12-31' }).map(a=>a.tipe), ['PAJAK'], 'pajak lewat -> alert PAJAK saja');
const full = warnVehicleAlerts({ tanggal_pajak: '2026-08-01', tanggal_pajak_5_tahunan: '2030-01-01', tanggal_kir: '2026-09-01' });
assert.ok(full.length >= 2, 'KRITIS pajak + KRITIS kir muncul');
assert.strictEqual(warnWorst(full), 'LEWAT', 'worst = LEWAT');
assert.deepStrictEqual(warnVehicleAlerts({ tanggal_pajak: '2027-12-31', tanggal_kir: '', tanggal_pajak_5_tahunan: '' }), [], 'AMAN + TIDAK_ADA -> tanpa alert');
assert.strictEqual(warnCardIsLow({ last_balance: 99999, status: 'TERSEDIA' }), true, '99.999 menipis');
assert.strictEqual(warnCardIsLow({ last_balance: 100000, status: 'TERSEDIA' }), false, '100.000 tidak menipis');
assert.strictEqual(warnCardIsLow({ last_balance: 0, status: 'NONAKTIF' }), false, 'NONAKTIF dilewati');
assert.deepStrictEqual([{worst:'WASPADA',alerts:[{sisa_hari:40}]},{worst:'LEWAT',alerts:[{sisa_hari:-5}]},{worst:'KRITIS',alerts:[{sisa_hari:10}]}].sort(warnSortPajak).map(x=>x.worst), ['LEWAT','KRITIS','WASPADA'], 'sort worst desc');
console.log('warnings-core: ALL PASS');
```

Verifikasi gagal: `node %TEMP%\opencode\warnings-core-test.js` -> ReferenceError: warnVehicleAlerts is not defined.

**Implementasi `src/WarningsCore.js`:**

```js
// ==========================================
// WARNINGS CORE — logika murni (tanpa GAS).
// Dipakai WarningOps.warningsSummary; diuji node + TestRunner.
// ==========================================

var WARN_LEVEL = { 'WASPADA': 1, 'KRITIS': 2, 'LEWAT': 3 };

function warnVehicleAlerts(veh) {
  var out = [];
  var spec = [
    { tipe: 'PAJAK', date: veh.tanggal_pajak },
    { tipe: 'PAJAK5', date: veh.tanggal_pajak_5_tahunan },
    { tipe: 'KIR', date: veh.tanggal_kir }
  ];
  spec.forEach(function (s) {
    var p = jalurComputePajak(s.date);
    if (p.status_pajak === 'LEWAT' || p.status_pajak === 'KRITIS' || p.status_pajak === 'WASPADA') {
      out.push({ tipe: s.tipe, status: p.status_pajak, sisa_hari: p.sisa_hari_pajak, tanggal: s.date });
    }
  });
  return out;
}

function warnMinSisa(alerts) {
  var m = Infinity;
  alerts.forEach(function (a) { if (a.sisa_hari != null && a.sisa_hari < m) m = a.sisa_hari; });
  return m;
}

function warnWorst(alerts) {
  var level = 0, best = '';
  alerts.forEach(function (a) {
    var l = WARN_LEVEL[a.status] || 0;
    if (l > level) { level = l; best = a.status; }
  });
  return best;
}

function warnSortPajak(a, b) {
  var d = (WARN_LEVEL[b.worst] || 0) - (WARN_LEVEL[a.worst] || 0);
  if (d) return d;
  return warnMinSisa(a.alerts) - warnMinSisa(b.alerts);
}

function warnCardIsLow(card) {
  if (String(card.status || '').toUpperCase() === 'NONAKTIF') return false;
  return (parseFloat(card.last_balance) || 0) < 100000;
}
```

Commit: `feat(dashboard): inti logika peringatan dini (pajak/KIR & saldo < 100k)`

---

### Task 2: Endpoint getDashboardWarnings + cache

**Create `src/WarningOps.js`:**

```js
// ==========================================
// WARNING OPS — agregasi peringatan utk panel 'Peringatan Dini'.
// ==========================================

function warningsSummary(token) {
  var vehs = getActiveVehicles(token);
  var pajakKIR = [];
  vehs.forEach(function (v) {
    var veh = {
      tanggal_pajak: warnDateStr(v.tanggal_pajak),
      tanggal_pajak_5_tahunan: warnDateStr(v.tanggal_pajak_5_tahunan),
      tanggal_kir: warnDateStr(v.tanggal_kir)
    };
    var alerts = warnVehicleAlerts(veh);
    if (alerts.length) {
      pajakKIR.push({
        vehicle_id: v.vehicle_id, plat_nomor: v.plat_nomor, nama_kendaraan: v.nama,
        jenis: v.jenis, cabang: v.cabang, alerts: alerts, worst: warnWorst(alerts)
      });
    }
  });
  pajakKIR.sort(warnSortPajak);
  var saldo = getFlazzCards(token).filter(warnCardIsLow).map(function (c) {
    return {
      id: c.id, card_number: String(c.card_number || ''), card_name: String(c.card_name || ''),
      card_type: String(c.card_type || ''), cabang: String(c.branch_id || ''),
      last_balance: parseFloat(c.last_balance) || 0, status: String(c.status || '')
    };
  }).sort(function (x, y) { return x.last_balance - y.last_balance; });
  return { pajakKIR: pajakKIR, saldo: saldo };
}

function warnDateStr(v) {
  if (v instanceof Date) {
    var tz = getDB().getSpreadsheetTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return (v == null) ? '' : String(v).substring(0, 10);
}
```

**CacheUtil.js** append:

```js
function dashwarnCacheKey(role, cabang) {
  return 'dashwarn:' + (role || '') + ':' + (cabang || '');
}
```

**Code.js** setelah getPerformaData:

```js
function getDashboardWarnings(token) {
  var user = requireUser(token);
  var ck = dashwarnCacheKey(user.role, user.cabang);
  var hit = cacheGet(ck);
  if (hit) return hit;
  var out = warningsSummary(token);
  cachePut(ck, out, 300);
  return out;
}
```

node --check 3 file. Commit: `feat(dashboard): endpoint getDashboardWarnings + cache 5 menit`

---

### Task 3: TestRunner untuk Warnings

**TestRunner.js** tambah sebelum __runAllTests:

```js
function __runWarningsTests() {
  var superToken = createSession({ user_id: 'U-SUP-T', username: 'super-t', nama: 'Super T', role: 'SUPERADMIN', cabang: '' });
  var pic = { user_id: 'U-PIC-T', username: 'pic-t', nama: 'Pic T', role: 'PIC CABANG', cabang: 'CBG-JKT' };
  var picToken = createSession(pic);
  var res = [];
  res.push(__expectDenied(function() { return getDashboardWarnings('token-palsu-xyz'); }, 'sesi tidak valid', 'getDashboardWarnings token palsu -> ditolak'));
  var out = getDashboardWarnings(superToken);
  res.push(__expectEqual(Array.isArray(out.pajakKIR) && Array.isArray(out.saldo), true, 'getDashboardWarnings SUPERADMIN -> array'));
  var outPic = getDashboardWarnings(picToken);
  res.push(__expectEqual(Array.isArray(outPic.pajakKIR) && Array.isArray(outPic.saldo), true, 'getDashboardWarnings PIC -> array (scoped)'));
  res.push(__expectEqual(warnCardIsLow({ last_balance: 99999, status: 'TERSEDIA' }), true, 'saldo 99.999 -> menipis'));
  res.push(__expectEqual(warnCardIsLow({ last_balance: 100000, status: 'TERSEDIA' }), false, 'saldo 100.000 -> TIDAK menipis'));
  res.push(__expectEqual(warnCardIsLow({ last_balance: 0, status: 'NONAKTIF' }), false, 'NONAKTIF dilewati'));
  res.push(__expectEqual(warnCardIsLow({ last_balance: 0, status: 'SEDANG_DIGUNAKAN' }), true, 'saldo 0 dipakai -> menipis'));
  var lewat = warnVehicleAlerts({ tanggal_pajak: '2026-01-01', tanggal_pajak_5_tahunan: '2030-01-01', tanggal_kir: '2031-01-01' });
  res.push(__expectEqual(lewat.length > 0, true, 'pajak masa lalu -> ada alert'));
  res.push(__expectEqual(warnWorst(lewat), 'LEWAT', 'worst=LEWAT'));
  res.push(__expectEqual(warnVehicleAlerts({ tanggal_pajak: '2032-01-01', tanggal_pajak_5_tahunan: '', tanggal_kir: '' }).length, 0, 'pajak jauh -> tanpa alert'));
  destroySession(superToken); destroySession(picToken);
  return __summarize(res);
}
```

Daftarkan di __runAllTests: `r = __runWarningsTests();` sebelum `Logger.log('==== ALL TESTS DONE ====')`.
Commit: `test(dashboard): kasus uji peringatan dini (editor-run)`

---

### Task 4: Markup panel di Index.html

Sisip setelah kartu Akses Cepat (Indeks.html:553), sebelum komentar Status Kartu Etoll:

```html
        <div class='card shadow-sm border-0 rounded-4 mb-4' id='dash-warnings-card'>
          <div class='card-header bg-white border-bottom-0 pt-4 pb-0 d-flex justify-content-between align-items-center flex-wrap gap-2'>
            <h5 class='fw-bold'><i class='bi bi-shield-exclamation me-2'></i>Peringatan Dini
              <span class='badge rounded-pill text-bg-danger align-middle' id='dash-warn-count'>0</span></h5>
            <div class='d-flex align-items-center gap-2 flex-wrap'>
              <select id='dash-warn-cabang' class='form-select form-select-sm' style='width:auto; display:none;' onchange='renderDashboardWarnings()'></select>
              <button class='btn btn-outline-primary btn-sm' onclick="loadDashboardWarnings(true)"><i class='bi bi-arrow-clockwise'></i> Refresh</button>
            </div>
          </div>
          <div class='card-body'>
            <div id='dash-warn-loading' class='text-center py-4'>
              <div class='spinner-border text-primary' role='status'></div>
              <div class='mt-2 text-muted'>Memeriksa peringatan...</div>
            </div>
            <div id='dash-warn-content' style='display:none;'>
              <div class='row'>
                <div class='col-lg-6 mb-3'>
                  <h6 class='fw-bold text-uppercase small text-muted'><i class='bi bi-car-front me-1'></i>Pajak &amp; KIR Kendaraan</h6>
                  <div id='dash-warn-pajak' class='list-group list-group-flush'></div>
                </div>
                <div class='col-lg-6 mb-3'>
                  <h6 class='fw-bold text-uppercase small text-muted'><i class='bi bi-credit-card me-1'></i>Saldo Kartu Etoll &lt; Rp100.000</h6>
                  <div id='dash-warn-saldo' class='list-group list-group-flush'></div>
                </div>
              </div>
            </div>
          </div>
        </div>
```

Commit: `feat(dashboard): markup panel peringatan dini`

---

### Task 5: Logika klien + wiring + refresh hook

**js.html** tambah fungsi (setelah renderDashboard, sebelum renderDashboardQuickAccess line 1241):

```js
  var __warnCache = null;
  var __warnCabang = '';

  function loadDashboardWarnings(force) {
    if (!force && __warnCache) { renderDashboardWarnings(); return; }
    var loading = document.getElementById('dash-warn-loading');
    var content = document.getElementById('dash-warn-content');
    if (loading) loading.style.display = 'block';
    if (content) content.style.display = 'none';
    google.script.run
      .withSuccessHandler(function(res) {
        __warnCache = res || { pajakKIR: [], saldo: [] };
        renderDashboardWarnings();
      })
      .withFailureHandler(function(err) {
        if (loading) loading.style.display = 'none';
        if (content) {
          content.style.display = 'block';
          content.innerHTML = '<div class="text-center text-muted py-3">Gagal memuat peringatan.</div>';
        }
        showToast('Gagal memuat peringatan: ' + (err && err.message || err), 'error');
      })
      .getDashboardWarnings(bbmToken());
  }

  function renderDashboardWarnings() {
    var res = __warnCache || { pajakKIR: [], saldo: [] };
    var loading = document.getElementById('dash-warn-loading');
    var content = document.getElementById('dash-warn-content');
    if (loading) loading.style.display = 'none';
    if (!content) return;
    content.style.display = 'block';
    var sel = document.getElementById('dash-warn-cabang');
    var cabs = (window.masterData && window.masterData.cabang) || [];
    if (userRole === 'SUPERADMIN' && sel) {
      if (cabs.length > 1) {
        sel.style.display = '';
        if (sel.options.length < 1) {
          var opts = '<option value="">Semua Warehouse</option>';
          cabs.forEach(function(c) { opts += '<option value="' + esc(String(c.kode)) + '">' + esc(c.nama) + '</option>'; });
          sel.innerHTML = opts;
          sel.value = __warnCabang;
        }
      } else { sel.style.display = 'none'; }
    } else if (sel) { sel.style.display = 'none'; }
    var scope = (userRole === 'SUPERADMIN' && sel) ? sel.value : '';
    var pajak = res.pajakKIR || [];
    var saldo = res.saldo || [];
    if (scope) {
      pajak = pajak.filter(function(r) { return String(r.cabang) === String(scope); });
      saldo = saldo.filter(function(r) { return String(r.cabang) === String(scope); });
    }
    var total = pajak.length + saldo.length;
    var countEl = document.getElementById('dash-warn-count');
    if (countEl) countEl.textContent = total;
    var p = document.getElementById('dash-warn-pajak');
    var s = document.getElementById('dash-warn-saldo');
    if (p) p.innerHTML = warnPajakItems(pajak);
    if (s) s.innerHTML = warnSaldoItems(saldo);
  }

  function warnBadge(status) {
    var map = { LEWAT: 'danger', KRITIS: 'warning', WASPADA: 'info' };
    return '<span class="badge text-bg-' + (map[status] || 'secondary') + '">' + esc(status) + '</span>';
  }

  function warnPajakItems(pajak) {
    if (!pajak.length) return '<div class="text-muted small py-2">Semua aman - tidak ada kendaraan yang pajak/KIR-nya kritis.</div>';
    var html = '';
    pajak.forEach(function(r) {
      var cab = userRole === 'SUPERADMIN' ? ' <span class="badge text-bg-light border">' + esc(r.cabang) + '</span>' : '';
      var alerts = r.alerts.map(function(a) {
        var label = a.tipe === 'PAJAK' ? 'Pajak' : (a.tipe === 'PAJAK5' ? 'Pajak 5th' : 'KIR');
        var sisa = (a.sisa_hari != null && a.sisa_hari !== Infinity) ? (' | sisa ' + a.sisa_hari + ' hari') : '';
        var tgl = a.tanggal ? (' | ' + esc(a.tanggal)) : '';
        return '<div>' + warnBadge(a.status) + ' ' + label + sisa + tgl + '</div>';
      }).join('');
      html += '<a href="#" onclick="switchTab(\'jalur-listing\'); return false;" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">' +
        '<div><div class="fw-bold">' + esc(r.plat_nomor) + ' - ' + esc(r.nama_kendaraan) + cab + '</div>' +
        '<div class="small text-muted">' + alerts + '</div></div>' +
        '<i class="bi bi-chevron-right text-muted"></i></a>';
    });
    return html;
  }

  function warnSaldoItems(saldo) {
    if (!saldo.length) return '<div class="text-muted small py-2">Semua aman - tidak ada kartu etoll di bawah Rp100.000.</div>';
    var html = '';
    saldo.forEach(function(c) {
      var cab = userRole === 'SUPERADMIN' ? ' <span class="badge text-bg-light border">' + esc(c.cabang) + '</span>' : '';
      var masked = c.card_number.length > 4 ? '***' + c.card_number.slice(-4) : c.card_number;
      html += '<a href="#" onclick="switchTab(\'flazz-topup\'); return false;" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">' +
        '<div><div class="fw-bold">' + esc(c.card_name || masked) + cab + '</div>' +
        '<div class="small text-muted">' + esc(masked) + (c.card_type ? ' | ' + esc(c.card_type) : '') + '</div></div>' +
        '<div class="text-danger fw-bold">Rp ' + Number(c.last_balance).toLocaleString('id-ID') + '</div></a>';
    });
    return html;
  }
```

Wiring:
1. renderDashboard() (js.html:1238) setelah loadFlazzDataWrapper(true) tambah: `loadDashboardWarnings();`
2. FlazzScript.html: dalam withSuccessHandler sukses topup (.apiSaveFlazzTopUp) & rekonsiliasi tambah: `if (typeof loadDashboardWarnings === 'function') loadDashboardWarnings(true);`
3. JalurScript.html: handler sukses apiSaveJalur tambah baris yang sama.

node --check 3 file. Commit: `feat(dashboard): render & refresh panel peringatan dini + hook topup/rekon/jalur`

---

### Task 6: Push, deploy @251, verifikasi live, ledger

1. `clasp push -f` (workdir D:\Monitoring BBM\src)
2. `clasp deploy -i AKfycbxLMBYg_8b1iZ98ji3CNt5874hYq-bc4OMYXLc83evAD4-e3TMCUS6jiZul_dR2l_eF -d "Peringatan dini dashboard"` -> @251
3. Live verify: GET /exec 200; PIC CBY -> hanya item CBY; SUPERADMIN -> filter cabang + badge; saldo persis 100.000 TIDAK muncul; klik baris -> tab jalur/topup.
4. __runAllTests di editor (termasuk __runWarningsTests) ALL PASS.
5. Ledger .superpowers/sdd/progress.md update.
