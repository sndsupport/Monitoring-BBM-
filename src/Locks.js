// ==========================================
// LOCK SERVICE HELPER (konkurensi antar user GAS)
// ==========================================

function withLock(label, fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    throw new Error('Antrean operasi "' + label + '" penuh (>30 detik). Coba lagi.');
  }
  // Lock sudah didapat — error dari fn() (mis. validasi "sudah terpakai",
  // "tidak ditemukan") HARUS diteruskan apa adanya, bukan tertimpa pesan
  // antrean di atas (bug lama: catch di sini menutupi semua error fn()).
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) { /* abaikan */ }
  }
}