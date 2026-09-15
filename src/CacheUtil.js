// ==========================================
// CACHE UTIL — kunci & invalidasi
// Versi global master: setiap mutasi master menaikkan versi sehingga SEMUA
// kunci master/bbm (SUPERADMIN, PIC, per cabang) otomatis orphan/kedaluwarsa
// — tanpa perlu mencacah kombinasi role/cabang.
// ==========================================

var MASTER_REV_KEY = 'master:rev';
var MASTER_REV_TTL = 6 * 60 * 60; // jauh di atas TTL payload (120 dtk)

function getMasterRev() {
  var v = cacheGet(MASTER_REV_KEY);
  return v ? String(v) : '1';
}

function bumpMasterRev() {
  CacheService.getScriptCache().put(MASTER_REV_KEY, JSON.stringify(Utilities.getUuid()), MASTER_REV_TTL);
}

function masterCacheKey(role, cabang) {
  return 'master:' + getMasterRev() + ':' + (role || '') + ':' + (cabang || '');
}

function bbmCacheKey(cabang) {
  return 'bbm:' + getMasterRev() + ':' + (cabang || 'SUPERADMIN');
}

function performaCacheKey(role, cabang) {
  return 'perf:' + (role || '') + ':' + (cabang || '');
}

function dashwarnCacheKey(role, cabang) {
  return 'dashwarn:' + (role || '') + ':' + (cabang || '');
}

function invalidateMaster(role, cabang) {
  // Menaikkan versi global = seluruh kunci master/bbm lama tidak terbaca lagi.
  bumpMasterRev();
}

function invalidatePerforma(role, cabang) {
  var c = CacheService.getScriptCache();
  c.remove(performaCacheKey(role, cabang));
  c.remove(performaCacheKey('SUPERADMIN', ''));
}