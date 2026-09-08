// ==========================================
// CACHE UTIL — kunci & invalidasi
// ==========================================

function masterCacheKey(role, cabang) {
  return 'master:' + (role || '') + ':' + (cabang || '');
}

function performaCacheKey(role, cabang) {
  return 'perf:' + (role || '') + ':' + (cabang || '');
}

function invalidateMaster(role, cabang) {
  var c = CacheService.getScriptCache();
  c.remove(masterCacheKey(role, cabang));
  // SUPERADMIN melihat SEMUA cabang; tarik semua variasi
  c.remove(masterCacheKey('SUPERADMIN', ''));
}

function invalidatePerforma(role, cabang) {
  var c = CacheService.getScriptCache();
  c.remove(performaCacheKey(role, cabang));
  c.remove(performaCacheKey('SUPERADMIN', ''));
}