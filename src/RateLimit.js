// ==========================================
// RATE LIMITING via CacheService (per key)
// ==========================================

var RATE_PREFIX = 'rm:';

function checkRate(key, max, windowMs) {
  var cache = CacheService.getScriptCache();
  var full = RATE_PREFIX + key;
  var now = Date.now();
  var raw = cache.get(full);
  var rec = raw ? JSON.parse(raw) : { count: 0, resetAt: now + windowMs };
  if (now > rec.resetAt) rec = { count: 0, resetAt: now + windowMs };
  var remaining = Math.max(0, Math.ceil((rec.resetAt - now) / 1000));
  if (rec.count >= max) {
    return { allowed: false, retryAfterSec: remaining };
  }
  rec.count += 1;
  cache.put(full, JSON.stringify(rec), Math.ceil(windowMs / 1000) + 10);
  return { allowed: true, retryAfterSec: remaining };
}

function resetRate(key) {
  CacheService.getScriptCache().remove(RATE_PREFIX + key);
}