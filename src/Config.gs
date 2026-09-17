// ==========================================
// KONFIGURASI TERPUSAT
// Spreadsheet ID via Script Properties; fallback ke produksi.
// ==========================================

var PROD_SPREADSHEET_ID = '1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8';

// Naikkan SELALU setiap ada perubahan file UI (Index/css/js/Flazz*/Jalur*/Settings)
// agar doGet tidak menyajikan halaman hasil cache lama.
var PAGE_VER = '20260917v3';

function spreadsheetId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id || PROD_SPREADSHEET_ID;
}

function configureSpreadsheet(id, token) {
  assertSuperadminOnly(requireUser(token), 'konfigurasi spreadsheet');
  if (!id) return { success: false, msg: 'ID kosong' };
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', String(id).trim());
  return { success: true, msg: 'Spreadsheet aktif diubah ke ' + id };
}

// --- cache helpers ---
// Payload besar (mis. master SUPERADMIN) dapat melebihi batas 100KB CacheService.
// Kompresi gzip+base64 membuatnya muat sehingga tetap ter-cache — mencegah reload
// master membaca ulang seluruh spreadsheet (menyumbat antrean Sheets API & GAS).
var CACHE_GZ_PREFIX = 'GZ:';

function _cacheStorePackedOrRaw(value) {
  var serialized = JSON.stringify(value);
  if (serialized.length <= 100000) return serialized;
  try {
    var packed = CACHE_GZ_PREFIX + Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(serialized)).getBytes());
    if (packed.length <= 100000) return packed;
    Logger.log('cachePut: skip — ' + serialized.length + ' bytes (gzip ' + packed.length + ') masih melebihi 100KB.');
    return null;
  } catch (e) {
    Logger.log('cachePut: gzip gagal: ' + e + ' — dilewati.');
    return null;
  }
}

function cachePut(key, value, ttlSeconds) {
  var packed = _cacheStorePackedOrRaw(value);
  if (packed === null) return;
  CacheService.getScriptCache().put(key, packed, ttlSeconds);
}

function cacheGet(key) {
  var v = CacheService.getScriptCache().get(key);
  if (!v) return null;
  if (String(v).indexOf(CACHE_GZ_PREFIX) === 0) {
    try {
      var bytes = Utilities.base64Decode(String(v).substring(CACHE_GZ_PREFIX.length));
      return JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString());
    } catch (e) {
      return null;
    }
  }
  try { return JSON.parse(v); } catch (e) { return v; }
}