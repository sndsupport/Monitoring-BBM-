// ==========================================
// KONFIGURASI TERPUSAT
// Spreadsheet ID via Script Properties; fallback ke produksi.
// ==========================================

var PROD_SPREADSHEET_ID = '1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8';

function spreadsheetId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id || PROD_SPREADSHEET_ID;
}

function configureSpreadsheet(id) {
  if (!id) return { success: false, msg: 'ID kosong' };
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', String(id).trim());
  return { success: true, msg: 'Spreadsheet aktif diubah ke ' + id };
}

// --- cache helpers (dipakai Task 2) ---
function cacheGet(key) {
  var v = CacheService.getScriptCache().get(key);
  return v ? JSON.parse(v) : null;
}

function cachePut(key, value, ttlSeconds) {
  CacheService.getScriptCache().put(key, JSON.stringify(value), ttlSeconds);
}