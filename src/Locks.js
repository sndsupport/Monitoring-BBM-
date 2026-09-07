// ==========================================
// LOCK SERVICE HELPER (konkurensi antar user GAS)
// ==========================================

function withLock(label, fn) {
  var lock = LockService.getScriptLock();
  var acquired = false;
  try {
    lock.waitLock(30000);
    acquired = true;
    return fn();
  } catch (e) {
    throw new Error('Antrean operasi "' + label + '" penuh (>30 detik). Coba lagi.');
  } finally {
    if (acquired) {
      try { lock.releaseLock(); } catch (e) { /* abaikan */ }
    }
  }
}