# List Flazz Modal & Print — Layout Laporan (tanpa tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti modal detail kartu Flazz dari layout tab menjadi layout laporan (tabel tersusun tanpa tab) dan sesuaikan output Cetak A4 agar memuat header "Laporan Penggunaan Kartu Flazz - {nomor}", info kartu + Saldo Saat Ini, serta 3 tabel lengkap (Top Up, Rincian Pengeluaran, Rekonsiliasi Harian).

**Architecture:** Pure client-side change di `src/FlazzScript.html`. `showFlazzDetailModal` merender 3 tabel langsung (tanpa tab), `renderFlazzDetailHistory` mengisi tbody sambil memfilter tanggal dari `#flazz-listing-date`. `printFlazzA4` memakai `__activeFlazzCardId` (diganti dari parse regex judul modal) untuk menemukan kartu, lalu membangun dokumen A4 window baru berisi header + info + 3 tabel yang sama. Tidak ada perubahan backend/GAS.

**Tech Stack:** Google Apps Script HTML service, vanilla JS, Bootstrap 5, template `src/FlazzScript.html`.

## Global Constraints

- Hanya modifikasi `src/FlazzScript.html`. `src/FlazzPages.html` dan file lain TIDAK berubah kecuali diperlukan.
- Tabel **Pemakaian TIDAK ditampilkan** di modal maupun cetak.
- Filter tanggal berasal dari `#flazz-listing-date` di menu List Flazz. Jika kosong → semua riwayat kartu. Filter TIDAK ditambahkan di popup.
- Fungsi `showFlazzDetailTab` DIPENTAHAPKAN (dihapus). Seluruh referensi `tb-detail-tol`, `tb-detail-bbm`, `tb-detail-usage`, `flazzDetailTabs`, `detail-*-container` tidak boleh tersisa.
- Judul modal/header cetak: `Laporan Penggunaan Kartu Flazz - {nomor}`.
- Formula saldo awal (bila tanggal dipilih): `saldoAwal = lastBal + (totalTol + totalBbm) - totalTopup`, dengan filter tanggal `String(date).substring(0,10) === selectedDate`.
- Tidak ada framework test otomatis. Verifikasi = `node --check` pada tiap `<script>` block (exit 0) + pembacaan manual.
- Gunakan pola string-concat rendering, `formatCurrency()`, `formatDateShort()` sesuai kode eksisting.

---

### Task 1: Modal Layout Laporan (hapus tab, 3 tabel)

**Files:**
- Modify: `src/FlazzScript.html:869-1007` (blok "Detail Modal": `showFlazzDetailModal`, `showFlazzDetailTab`, `renderFlazzDetailHistory`)

**Interfaces:**
- Consumes: `__flazzListingData` (dari Task 3 blob "Listing Page"), `formatCurrency()`, `formatDateShort()`, `#flazz-listing-date`.
- Produces: `__activeFlazzCardId` (module-level `let`, default `null`) — dipakai Task 2; `showFlazzDetailModal(cardId)` tidak berubah signature; `renderFlazzDetailHistory(cardId, data)` tidak berubah signature; `showFlazzDetailTab` dihapus.

- [ ] **Step 1: Tambah variabel modul + ganti `showFlazzDetailModal`**

Pada baris 874 (`function showFlazzDetailModal(cardId) {`) ganti seluruh blok dari baris 874 sampai baris 933 (tutup fungsi `showFlazzDetailTab`) dengan:

```javascript
let __activeFlazzCardId = null;

function showFlazzDetailModal(cardId) {
  if (!__flazzListingData) return;
  let data = __flazzListingData;
  let card = (data.cards || []).find(c => c.id === cardId);
  if (!card) return;
  __activeFlazzCardId = cardId;

  let statusBadge = card.status === 'SEDANG_DIGUNAKAN' ? 'bg-warning' :
    (card.status === 'TERSEDIA' ? 'bg-success' : 'bg-secondary');

  document.getElementById('flazz-detail-title').innerHTML =
    'Laporan Penggunaan Kartu Flazz - ' + card.card_number +
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

  // Top Up table
  html += '<h6 class="text-primary fw-bold mt-2">Top Up</h6>';
  html += '<table class="table table-sm align-middle"><thead class="table-light"><tr><th>Tanggal</th><th>Nominal</th><th>Bukti</th><th>Catatan</th></tr></thead><tbody id="tb-detail-topup"></tbody></table>';

  // Pengeluaran table (Tol + BBM gabungan)
  html += '<h6 class="text-primary fw-bold mt-4">Rincian Pengeluaran</h6>';
  html += '<table class="table table-sm align-middle"><thead class="table-light"><tr><th>Tanggal</th><th>Jenis</th><th>Supir/Kendaraan</th><th>Nominal</th></tr></thead><tbody id="tb-detail-pengeluaran"></tbody></table>';

  // Reconciliation table
  html += '<h6 class="text-primary fw-bold mt-4">Rekonsiliasi Harian</h6>';
  html += '<table class="table table-sm align-middle"><thead class="table-light"><tr><th>Tanggal</th><th>Saldo Awal</th><th>Top Up</th><th>BBM+Tol</th><th>Saldo Sistem</th><th>Saldo Fisik</th><th>Selisih</th><th>Status</th></tr></thead><tbody id="tb-detail-recon"></tbody></table>';

  document.getElementById('flazz-detail-body').innerHTML = html;

  renderFlazzDetailHistory(cardId, data);

  new bootstrap.Modal(document.getElementById('modal-flazz-detail')).show();
}
```

TIDAK boleh tersisa `showFlazzDetailTab`, `flazzDetailTabs`, `detail-topup-container`, `detail-tol-container`, `detail-bbm-container`, `detail-usage-container`, `detail-recon-container`.

- [ ] **Step 2: Ganti `renderFlazzDetailHistory`**

Ganti seluruh isi fungsi `renderFlazzDetailHistory(cardId, data)` (baris 935-1007) dengan:

```javascript
function renderFlazzDetailHistory(cardId, data) {
  let selectedDate = document.getElementById('flazz-listing-date').value || '';

  // Top Ups
  let topups = (data.topups || []).filter(t => t.card_id === cardId && (!selectedDate || String(t.date || '').substring(0, 10) === selectedDate));
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

  // Pengeluaran (Tol + BBM gabungan)
  let tols = (data.tols || []).filter(t => t.card_id === cardId && (!selectedDate || String(t.date || '').substring(0, 10) === selectedDate));
  let bbm = (data.bbmFlazz || []).filter(b => b.card_id === cardId && (!selectedDate || String(b.tanggal || b.timestamp || '').substring(0, 10) === selectedDate));
  let pengeluaranTbody = document.getElementById('tb-detail-pengeluaran');
  if (pengeluaranTbody) {
    pengeluaranTbody.innerHTML = '';
    let rows = [];
    tols.forEach(t => {
      rows.push({ tanggal: t.date, jenis: 'Tol', supir: t.driver_id || '-', kendaraan: t.vehicle_id || '-', nilai: '-' + formatCurrency(t.amount) });
    });
    bbm.forEach(b => {
      rows.push({ tanggal: b.tanggal, jenis: 'BBM', supir: b.driver || '-', kendaraan: b.vehicle || '-', nilai: '-' + formatCurrency(b.amount) });
    });
    if (rows.length === 0) {
      pengeluaranTbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Tidak ada data</td></tr>';
    } else {
      rows.forEach(r => {
        pengeluaranTbody.innerHTML += '<tr><td>' + formatDateShort(r.tanggal) + '</td><td>' + r.jenis + '</td><td>' + r.supir + ' / ' + r.kendaraan + '</td><td class="text-danger fw-bold">' + r.nilai + '</td></tr>';
      });
    }
  }

  // Reconciliation
  let recons = (data.recons || []).filter(r => r.card_id === cardId && (!selectedDate || String(r.date || '').substring(0, 10) === selectedDate));
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

- [ ] **Step 3: Verifikasi**

1. Ekstrak semua `<script>` block dari `src/FlazzScript.html` ke file temp `.js` dan jalankan `node --check` — semua harus exit 0.
2. Pastikan TIDAK ada sisa `showFlazzDetailTab`, `flazzDetailTabs`, `tb-detail-tol`, `tb-detail-bbm`, `tb-detail-usage`, `tb-detail-pengeluaran` (id baru ada), dan tbody `tb-detail-topup`/`tb-detail-recon` masih digunakan.

```powershell
# di D:\Monitoring BBM
$html = Get-Content -Raw "src\FlazzScript.html"
$ms = [regex]::Matches($html, '<script[^>]*>([\s\S]*?)</script>')
$i = 0
foreach ($m in $ms) {
  $code = $m.Groups[1].Value
  if ($code.Trim().Length -gt 0) {
    $i++
    $tmp = "$env:TEMP\lfchk_$i.js"
    [System.IO.File]::WriteAllText($tmp, $code, (New-Object System.Text.UTF8Encoding($false)))
    node --check $tmp
    Write-Output "block $i exit $LASTEXITCODE"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/FlazzScript.html
git commit -m "refactor: flazz detail modal to stacked report tables without tabs"
```

### Task 2: Cetak A4 — header Laporan + 3 tabel lengkap

**Files:**
- Modify: `src/FlazzScript.html:1014-1096` (blok "Print A4": `printFlazzA4`)

**Interfaces:**
- Consumes: `__activeFlazzCardId` (dari Task 1), `__flazzListingData`, `formatCurrency()`, `formatDateShort()`, `#flazz-listing-date`.
- Produces: tidak ada interface baru.

- [ ] **Step 1: Ganti `printFlazzA4`**

Ganti seluruh isi fungsi `printFlazzA4()` (baris 1014-1096) dengan:

```javascript
function printFlazzA4() {
  let cardId = __activeFlazzCardId;
  let data = __flazzListingData;
  if (!cardId || !data) return;
  let card = (data.cards || []).find(c => c.id === cardId);
  if (!card) return;

  let selectedDate = document.getElementById('flazz-listing-date').value || '';

  let lastBal = parseFloat(card.last_balance) || 0;

  let printHtml = '<!DOCTYPE html><html><head><title>Laporan Penggunaan Kartu Flazz - ' + card.card_number + '</title>';
  printHtml += '<style>@page{size:A4;margin:15mm;}body{font-family:Arial,sans-serif;font-size:11pt;color:#000;}';
  printHtml += '.print-header{text-align:center;margin-bottom:20px;border-bottom:2px solid #000;padding-bottom:10px;}';
  printHtml += '.print-header h2{margin:0;font-size:16pt;}';
  printHtml += '.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:15px;}';
  printHtml += '.info-grid .label{font-weight:bold;color:#555;}';
  printHtml += 'h4{margin-top:18px;margin-bottom:6px;font-size:12pt;border-bottom:1px solid #ccc;padding-bottom:4px;}';
  printHtml += 'table{width:100%;border-collapse:collapse;margin-top:6px;}';
  printHtml += 'table th,table td{border:1px solid #ccc;padding:6px 8px;font-size:10pt;text-align:left;}';
  printHtml += 'table th{background:#f0f0f0;font-weight:bold;}';
  printHtml += '.summary-box{background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;padding:12px;margin:15px 0;}';
  printHtml += '.summary-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #ccc;}';
  printHtml += '.summary-row:last-child{border-bottom:none;font-weight:bold;font-size:12pt;}';
  printHtml += '.footer{margin-top:30px;font-size:9pt;color:#888;text-align:center;border-top:1px solid #ccc;padding-top:8px;}';
  printHtml += '</style></head><body>';

  printHtml += '<div class="print-header"><h2>LAPORAN PENGGUNAAN KARTU FLAZZ</h2>';
  printHtml += '<div>' + card.card_number + (selectedDate ? ' | Tanggal: <strong>' + selectedDate + '</strong>' : '') + '</div></div>';

  printHtml += '<div class="info-grid">';
  printHtml += '<div><span class="label">Nomor Kartu:</span> ' + card.card_number + '</div>';
  printHtml += '<div><span class="label">Nama Kartu:</span> ' + (card.card_name || '-') + '</div>';
  printHtml += '<div><span class="label">Tipe Kartu:</span> ' + (card.card_type || '-') + '</div>';
  printHtml += '<div><span class="label">Driver:</span> ' + (card.driver_id || '-') + '</div>';
  printHtml += '<div><span class="label">Cabang:</span> ' + (card.branch_id || '-') + '</div>';
  printHtml += '<div><span class="label">Status:</span> ' + card.status + '</div>';
  printHtml += '<div><span class="label">Saldo Saat Ini:</span> <strong>' + formatCurrency(lastBal) + '</strong></div>';
  printHtml += '</div>';

  // Summary harian (hanya jika tanggal dipilih)
  if (selectedDate) {
    let dayTopups = (data.topups || []).filter(t => t.card_id === card.id && String(t.date || '').substring(0, 10) === selectedDate);
    let dayTols = (data.tols || []).filter(t => t.card_id === card.id && String(t.date || '').substring(0, 10) === selectedDate);
    let dayBbm = (data.bbmFlazz || []).filter(b => b.card_id === card.id && String(b.tanggal || b.timestamp || '').substring(0, 10) === selectedDate);
    let totalTopup = dayTopups.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    let totalTol = dayTols.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    let totalBbm = dayBbm.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    let totalExpense = totalTol + totalBbm;
    let saldoAwal = lastBal + totalExpense - totalTopup;

    printHtml += '<div class="summary-box">';
    printHtml += '<div class="summary-row"><span>Saldo Awal (Sebelum Transaksi Hari Ini)</span><span>' + formatCurrency(saldoAwal) + '</span></div>';
    if (totalTopup > 0) printHtml += '<div class="summary-row"><span>Top Up Hari Ini</span><span>+' + formatCurrency(totalTopup) + '</span></div>';
    if (totalBbm > 0) printHtml += '<div class="summary-row"><span>Pengeluaran BBM</span><span>-' + formatCurrency(totalBbm) + '</span></div>';
    if (totalTol > 0) printHtml += '<div class="summary-row"><span>Pengeluaran Tol</span><span>-' + formatCurrency(totalTol) + '</span></div>';
    if (totalExpense > 0) printHtml += '<div class="summary-row"><span>Total Pengeluaran</span><span>-' + formatCurrency(totalExpense) + '</span></div>';
    printHtml += '<div class="summary-row"><span>Saldo Akhir (Saat Ini)</span><span>' + formatCurrency(lastBal) + '</span></div>';
    printHtml += '</div>';
  }

  // Top Up
  let topups = (data.topups || []).filter(t => t.card_id === card.id && (!selectedDate || String(t.date || '').substring(0, 10) === selectedDate));
  printHtml += '<h4>Top Up</h4>';
  printHtml += '<table><thead><tr><th>Tanggal</th><th>Nominal</th><th>Bukti</th><th>Catatan</th></tr></thead><tbody>';
  if (topups.length === 0) {
    printHtml += '<tr><td colspan="4" class="text-center">Tidak ada data</td></tr>';
  } else {
    topups.forEach(t => {
      printHtml += '<tr><td>' + formatDateShort(t.date) + '</td><td>+' + formatCurrency(t.amount) + '</td><td>' + (t.evidence_url ? 'Ada' : '-') + '</td><td>' + (t.notes || '') + '</td></tr>';
    });
  }
  printHtml += '</tbody></table>';

  // Pengeluaran (Tol + BBM)
  let tols = (data.tols || []).filter(t => t.card_id === card.id && (!selectedDate || String(t.date || '').substring(0, 10) === selectedDate));
  let bbm = (data.bbmFlazz || []).filter(b => b.card_id === card.id && (!selectedDate || String(b.tanggal || b.timestamp || '').substring(0, 10) === selectedDate));
  printHtml += '<h4>Rincian Pengeluaran</h4>';
  printHtml += '<table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Supir/Kendaraan</th><th>Nominal</th></tr></thead><tbody>';
  if (tols.length === 0 && bbm.length === 0) {
    printHtml += '<tr><td colspan="4" class="text-center">Tidak ada data</td></tr>';
  } else {
    tols.forEach(t => {
      printHtml += '<tr><td>' + formatDateShort(t.date) + '</td><td>Tol</td><td>' + (t.driver_id || '-') + ' / ' + (t.vehicle_id || '-') + '</td><td>' + formatCurrency(t.amount) + '</td></tr>';
    });
    bbm.forEach(b => {
      printHtml += '<tr><td>' + formatDateShort(b.tanggal) + '</td><td>BBM</td><td>' + (b.driver || '-') + ' / ' + (b.vehicle || '-') + '</td><td>' + formatCurrency(b.amount) + '</td></tr>';
    });
  }
  printHtml += '</tbody></table>';

  // Rekonsiliasi
  let recons = (data.recons || []).filter(r => r.card_id === card.id && (!selectedDate || String(r.date || '').substring(0, 10) === selectedDate));
  printHtml += '<h4>Rekonsiliasi Harian</h4>';
  printHtml += '<table><thead><tr><th>Tanggal</th><th>Saldo Awal</th><th>Top Up</th><th>BBM+Tol</th><th>Saldo Sistem</th><th>Saldo Fisik</th><th>Selisih</th><th>Status</th></tr></thead><tbody>';
  if (recons.length === 0) {
    printHtml += '<tr><td colspan="8" class="text-center">Tidak ada data</td></tr>';
  } else {
    recons.forEach(r => {
      printHtml += '<tr><td>' + formatDateShort(r.date) + '</td><td>' + formatCurrency(r.opening_balance) + '</td><td>+' + formatCurrency(r.total_topup) + '</td><td>-' + formatCurrency(r.total_bbm_flazz + r.total_tol) + '</td><td>' + formatCurrency(r.flazz_balance) + '</td><td>' + formatCurrency(r.actual_balance) + '</td><td>' + formatCurrency(r.difference) + '</td><td>' + r.reconciliation_status + '</td></tr>';
    });
  }
  printHtml += '</tbody></table>';

  printHtml += '<div class="footer">Dicetak pada ' + new Date().toLocaleString('id-ID') + ' | Sistem Monitoring BBM</div>';
  printHtml += '<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>';
  printHtml += '</body></html>';

  let printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(printHtml);
  printWindow.document.close();
}
```

- [ ] **Step 2: Verifikasi**

1. Ulangi ekstraksi `node --check` semua `<script>` block `src/FlazzScript.html` (komando yang sama seperti Task 1 Step 3) — semua exit 0.
2. Manual check:
   - `__activeFlazzCardId` terbaca (tidak lagi parse regex judul modal; pastikan regex lama `modalTitle.match(/>([^<]+)</)` HILANG).
   - Pemakaian (`data.usages`) TIDAK muncul di cetak.
   - String `<\/script>` tercetak literal (backslash + slash), bukan `</script>`.
   - Jika tanggal dipilih, header cetak memuat `| Tanggal: <tanggal>`, summary-box muncul; jika kosong, summary-box tidak muncul dan tabel menampilkan semua riwayat.

- [ ] **Step 3: Commit**

```bash
git add src/FlazzScript.html
git commit -m "feat: print A4 report with header and full topup/expense/recon tables"
```

---

## Self-Review Notes

- Spec coverage: (1) tab dihapus — Task 1; (2) judul Laporan - {nomor} modal & cetak — Task 1 (title) & Task 2 (header); (3) info + Saldo Saat Ini — keduanya; (4) tabel Top Up — Task 1 & 2; (5) tabel Rincian Pengeluaran gabungan Tol+BBM — Task 1 & 2; (6) tabel Rekonsiliasi 8 kolom — Task 1 & 2; (7) Pemakaian TIDAK ditampilkan — dipastikan tidak dirender; (8) filter tetap di menu, kosong → semua riwayat — `!selectedDate ||` guard di kedua task; (9) print window baru auto-print — Task 2.
- Placeholder scan: semua langkah berisi kode konkret, tidak ada "TBD".
- Type/interface consistency: `__activeFlazzCardId` didefinisikan Task 1, dikonsumsi Task 2; signature `showFlazzDetailModal(cardId)` dan `renderFlazzDetailHistory(cardId, data)` tidak berubah.