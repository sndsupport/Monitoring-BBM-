// ==========================================
// SESSION AUTH & PASSWORD HASHING
// Identitas berasal DARI SERVER via token opaque di CacheService.
// JANGAN pernah menurunkan role/cabang dari input client.
// ==========================================

var SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 jam, sejalan SESSION_MAX_AGE_MS di js.html

function _utf8Bytes(str) {
  return Utilities.newBlob(String(str), 'text/plain').getBytes();
}

function _sha256Hex(str) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, _utf8Bytes(str));
  return digest.map(function(b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function hashPassword(password) {
  var salt = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  return salt + '$' + _sha256Hex(salt + ':' + String(password));
}

function verifyPassword(plain, stored) {
  if (!stored || stored.indexOf('$') === -1) return false;
  var parts = stored.split('$');
  if (parts.length !== 2) return false;
  return _sha256Hex(parts[0] + ':' + String(plain)) === parts[1];
}

function hashLooksLegacy(stored) {
  return !stored || String(stored).indexOf('$') === -1;
}

function createSession(user) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var session = {
    user_id: user.user_id,
    username: user.username,
    nama: user.nama || user.username,
    role: user.role,
    cabang: user.cabang || '',
    exp: Date.now() + SESSION_TTL_SECONDS * 1000
  };
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(session), SESSION_TTL_SECONDS);
  return token;
}

function resolveSession(token) {
  if (!token) return null;
  var json = CacheService.getScriptCache().get('session:' + token);
  if (!json) return null;
  var s = JSON.parse(json);
  if (Date.now() > s.exp) { CacheService.getScriptCache().remove('session:' + token); return null; }
  return s;
}

function requireUser(token) {
  var u = resolveSession(token);
  if (!u) throw new Error('Akses ditolak: sesi tidak valid. Silakan login kembali.');
  return u;
}

function destroySession(token) {
  if (token) CacheService.getScriptCache().remove('session:' + token);
}