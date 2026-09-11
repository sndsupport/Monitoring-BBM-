// ==========================================
// RINGKASAN BULANAN PER CABANG (sheet Dashboard)
// ==========================================

var DASH_COLS = ['cabang','periode','total_transaksi','total_liter','total_biaya_bbm','total_toll','updated_at'];

function periodKey(dateOrStr) {
  if (!dateOrStr) return '';
  var d = dateOrStr instanceof Date ? dateOrStr : new Date(dateOrStr);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function initDashboardSchema() {
  const ss = getDB();
  const dash = ss.getSheetByName('Dashboard');
  if (!dash) return { success: false, msg: 'Sheet Dashboard tidak ditemukan' };
  dash.getRange(1, 1, 1, DASH_COLS.length).setValues([DASH_COLS]);
  dash.getRange(1, 1, 1, DASH_COLS.length).setFontWeight('bold').setBackground('#f3f3f3');
  dash.setFrozenRows(1);
  // Kosongkan baris data legacy bila ada (schema lama 'Metrics'/'Value' tidak pernah terisi di produksi)
  if (dash.getLastRow() > 1) dash.getRange(2, 1, dash.getLastRow() - 1, DASH_COLS.length).clearContent();
  return { success: true, msg: 'Schema Dashboard disiapkan' };
}

function recomputeMonthlySummary(cabang, periode) {
  if (!cabang || !periode) return null;
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  const dash = ss.getSheetByName('Dashboard');
  if (!sheet || !dash) return null;

  const h = sheetHeaders(sheet);
  const ci = colIndex(h, ['kode_cabang','tanggal','liter_bbm','biaya_bbm','biaya_toll']);
  const rows = readRowsCols(sheet, [ci.kode_cabang, ci.tanggal, ci.liter_bbm, ci.biaya_bbm, ci.biaya_toll]);

  let trx = 0, liter = 0, biaya = 0, toll = 0;
  for (const r of rows) {
    if (String(r[0]) !== String(cabang)) continue;
    if (periodKey(r[1]) !== periode) continue;
    trx++;
    liter += parseFloat(r[2]) || 0;
    biaya += parseFloat(r[3]) || 0;
    toll += parseFloat(r[4]) || 0;
  }

  const dashH = sheetHeaders(dash);
  const dashIdx = colIndex(dashH, DASH_COLS);
  const dashRows = readRowsCols(dash, DASH_COLS.map(function(nm) { return dashIdx[nm]; }));
  let rowIndex = -1;
  for (let i = 0; i < dashRows.length; i++) {
    if (String(dashRows[i][0]) === String(cabang) && String(dashRows[i][1]) === periode) { rowIndex = i + 2; break; }
  }
  const value = [cabang, periode, trx, Math.round(liter * 100) / 100, Math.round(biaya * 100) / 100, Math.round(toll * 100) / 100, new Date()];
  if (rowIndex > -1) {
    dash.getRange(rowIndex, 1, 1, DASH_COLS.length).setValues([value]);
  } else {
    dash.appendRow(value);
  }
  CacheService.getScriptCache().remove('sum:' + cabang + ':' + periode);
  return { cabang: cabang, periode: periode, total_transaksi: trx, total_liter: liter, total_biaya_bbm: biaya, total_toll: toll };
}

function getMonthlySummary(token, periode, cabang) {
  const u = requireUser(token);
  if (!periode) return null;
  // PIC hanya bisa membaca ringkasan cabang sesi; hanya SUPERADMIN boleh lintas cabang.
  if (u.role !== 'SUPERADMIN') cabang = u.cabang;
  if (!cabang) return null;
  const ck = 'sum:' + cabang + ':' + periode;
  const hit = cacheGet(ck);
  if (hit) return hit;
  const ss = getDB();
  const dash = ss.getSheetByName('Dashboard');
  if (!dash) return null;
  const h = sheetHeaders(dash);
  const idx = colIndex(h, DASH_COLS);
  const rows = readRowsCols(dash, DASH_COLS.map(function(nm) { return idx[nm]; }));
  let found = null;
  for (const r of rows) {
    if (String(r[0]) === String(cabang) && String(r[1]) === periode) {
      found = { cabang: r[0], periode: r[1], total_transaksi: r[2], total_liter: r[3], total_biaya_bbm: r[4], total_toll: r[5] };
      break;
    }
  }
  if (found) cachePut(ck, found, 300);
  return found;
}
