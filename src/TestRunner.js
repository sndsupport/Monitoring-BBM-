// ==========================================
// LIGHTWEIGHT TEST RUNNER (jalankan dari editor atau `clasp run`)
// ==========================================

function __expectEqual(actual, expected, label) {
  var a = JSON.stringify(actual);
  var b = JSON.stringify(expected);
  var ok = a === b;
  Logger.log((ok ? 'PASS' : 'FAIL') + ': ' + label + (ok ? '' : ' | actual=' + a + ' expected=' + b));
  return ok ? 1 : 0;
}

function __expectTrue(cond, label) {
  Logger.log((cond ? 'PASS' : 'FAIL') + ': ' + label);
  return cond ? 1 : 0;
}

function __summarize(tests) {
  var passed = tests.filter(function(x) { return x; }).length;
  var failed = tests.length - passed;
  Logger.log('==== TESTS: ' + passed + ' passed, ' + failed + ' failed ====');
  return { passed: passed, failed: failed };
}

function __runAuthTests() {
  var t = hashPassword('rahasia123');
  var s = createSession({
    user_id: 'U-TEST',
    username: 'tester',
    nama: 'Tester',
    role: 'SUPERADMIN',
    cabang: 'CBG-JKT'
  });
  return __summarize([
    __expectTrue(hashLooksLegacy('admin123'), 'legacy: nilai plaintext terdeteksi legacy'),
    __expectTrue(!hashLooksLegacy(t), 'hash baru tidak legacy'),
    __expectTrue(verifyPassword('rahasia123', t), 'verify password benar'),
    __expectTrue(!verifyPassword('salah', t), 'verify password salah -> false'),
    __expectTrue(verifyPassword('rahasia123', hashPassword('rahasia123')), 'hash lain dengan password sama tetap valid'),
    __expectEqual(resolveSession(s) === null, false, 'resolveSession token valid mengembalikan non-null'),
    __expectEqual(resolveSession(s).username, 'tester', 'resolveSession username cocok'),
    __expectEqual(resolveSession(s).role, 'SUPERADMIN', 'resolveSession role cocok'),
    __expectEqual(resolveSession('token-palsu-xyz'), null, 'token palsu -> null'),
    __expectEqual(resolveSession(''), null, 'token kosong -> null'),
    (function() {
      try { requireUser('token-palsu-xyz'); return __expectTrue(false, 'requireUser melempar untuk token palsu'); }
      catch (e) { return __expectTrue(e.message.indexOf('sesi tidak valid') > -1, 'requireUser melempar Error sesi tidak valid'); }
    })(),
    (function() {
      destroySession(s);
      return __expectEqual(resolveSession(s), null, 'destroySession membuat session hilang');
    })()
  ]);
}

function __runBackupSheetTests() {
  var list = getBackupSheets();
  var stale = list.filter(function(n) { return DATABASE_SHEETS.indexOf(n) === -1; });
  var missing = DATABASE_SHEETS.filter(function(n) { return list.indexOf(n) === -1; });
  var dupes = list.filter(function(n, i) { return list.indexOf(n) !== i; });
  return __summarize([
    __expectEqual(stale, [], 'getBackupSheets() tidak berisi sheet di luar skema (bekas SESSION/PENGENDARA)'),
    __expectEqual(missing, [], 'seluruh sheet database (DATABASE_SHEETS) tercakup di backup'),
    __expectEqual(dupes, [], 'getBackupSheets() tidak mengandung duplikat')
  ]);
}

function __runEditUsageTests() {
  return __summarize([
    __expectEqual(shouldAutoCreateUsageOnEdit(false, true), true, 'TUNAI->FLAZZ (konversi): boleh auto-create penyerahan'),
    __expectEqual(shouldAutoCreateUsageOnEdit(true, true), false, 'koreksi laporan FLAZZ: TIDAK boleh membuat ulang penyerahan'),
    __expectEqual(shouldAutoCreateUsageOnEdit(true, false), false, 'FLAZZ->TUNAI: tidak dibuat penyerahan'),
    __expectEqual(shouldAutoCreateUsageOnEdit(false, false), false, 'non-flazz tetap non-flazz: tidak dibuat penyerahan')
  ]);
}

function __runMasterGuardTests() {
  var superUser = { user_id: 'U-TEST-RUNNER', username: 'tester', nama: 'Test Runner', role: 'SUPERADMIN', cabang: '' };
  var results = [];
  try { updateCabang({ edit_id: '###TAK-ADA###', kode: 'X', nama: 'X', lokasi: '' }, superUser); }
  catch (e) { results.push(__expectTrue(e.message.indexOf('tidak ditemukan') > -1, 'updateCabang kode tak dikenal -> error')); }
  try { deleteCabangById('###TAK-ADA###', superUser); }
  catch (e) { results.push(__expectTrue(e.message.indexOf('tidak ditemukan') > -1, 'deleteCabangById kode tak dikenal -> error')); }
  try { deleteSupirById('###TAK-ADA###', superUser); }
  catch (e) { results.push(__expectTrue(e.message.indexOf('tidak ditemukan') > -1, 'deleteSupirById id tak dikenal -> error')); }
  try { deleteBBMById('###TAK-ADA###', superUser); }
  catch (e) { results.push(__expectTrue(e.message.indexOf('tidak ditemukan') > -1, 'deleteBBMById id tak dikenal -> error')); }
  var sheet = getDB().getSheetByName('Flazz_TopUp');
  var data = sheet ? sheet.getDataRange().getValues() : [];
  var found = -1;
  for (var i = 1; i < data.length; i++) { if (data[i][0]) { found = i; break; } }
  if (found > 0) {
    try { editFlazzTopUp({ id: data[found][0], card_id: '###KARTU-TAK-ADA###', amount: 0 }, superUser); }
    catch (e) { results.push(__expectTrue(e.message.indexOf('Kartu tujuan tidak ditemukan') > -1, 'edit TopUp ke kartu tak dikenal -> error')); }
  }
  return __summarize(results);
}

// Kontrak akses server dua bentuk: (a) melempar Error, atau (b) mengembalikan
// {success:false, msg}. Keduanya tanda akses DITOLAK — helper ini menerima keduanya.
function __expectDenied(call, needle, label) {
  var res;
  try {
    res = call();
  } catch (e) {
    return __expectTrue(String(e.message).indexOf(needle) > -1, label + ' (dilempar: ' + e.message + ')');
  }
  if (res && typeof res === 'object' && res.success === false) {
    return __expectTrue(String(res.msg).indexOf(needle) > -1, label + ' (success:false: ' + res.msg + ')');
  }
  return __expectTrue(false, label + ' (TIDAK ditolak: ' + (typeof res === 'object' ? JSON.stringify(res) : String(res)) + ')');
}

function __runSecurityIsolationTests() {
  var pic = { user_id: 'U-PIC-TEST', username: 'pic-test', nama: 'PIC Test', role: 'PIC CABANG', cabang: 'CBG-JKT' };
  var superToken = createSession({ user_id: 'U-SUP-TEST', username: 'super-test', nama: 'Super Test', role: 'SUPERADMIN', cabang: '' });
  var picToken = createSession(pic);
  var results = [];

  // Reader SUPERADMIN-only menolak PIC & token palsu (pemalsuan role/cabang batal).
  results.push(__expectDenied(function() { return getAllUsers(picToken); }, 'SUPERADMIN', 'getAllUsers PIC -> ditolak'));
  results.push(__expectDenied(function() { return getCabangList(picToken); }, 'SUPERADMIN', 'getCabangList PIC -> ditolak'));

  // Reader token-based menolak token palsu — caller tidak lagi bisa memalsukan role/cabang.
  results.push(__expectDenied(function() { return getCabangList('token-palsu-xyz'); }, 'sesi tidak valid', 'getCabangList token palsu -> ditolak'));
  results.push(__expectDenied(function() { return getActiveVehicles('token-palsu-xyz'); }, 'sesi tidak valid', 'getActiveVehicles token palsu -> ditolak'));
  results.push(__expectDenied(function() { return getFlazzCards('token-palsu-xyz'); }, 'sesi tidak valid', 'getFlazzCards token palsu -> ditolak'));
  results.push(__expectDenied(function() { return getMonthlySummary('token-palsu-xyz', '2026-08', ''); }, 'sesi tidak valid', 'getMonthlySummary token palsu -> ditolak'));
  results.push(__expectDenied(function() { return getJalurByTanggal('2026-08-31', 'token-palsu-xyz', {}); }, 'sesi tidak valid', 'getJalurByTanggal token palsu -> ditolak'));
  results.push(__expectDenied(function() { return getPerformaSummary('token-palsu-xyz'); }, 'sesi tidak valid', 'getPerformaSummary token palsu -> ditolak'));

  // Reader dengan token valid tetap berfungsi.
  try { results.push(__expectEqual(Array.isArray(getAllUsers(superToken)), true, 'getAllUsers token SUPERADMIN valid -> array')); }
  catch (e) { results.push(__expectTrue(false, 'getAllUsers SUPERADMIN tidak melempar: ' + e.message)); }
  try { results.push(__expectEqual(Array.isArray(getActiveVehicles(picToken)), true, 'getActiveVehicles token PIC valid -> array')); }
  catch (e) { results.push(__expectTrue(false, 'getActiveVehicles PIC tidak melempar: ' + e.message)); }

  // PIC read-only: aksi operasional ditolak sebelum mutasi apa pun.
  results.push(__expectDenied(function() { return editDailyTransactionUnlocked({}, pic); }, 'SUPERADMIN', 'PIC edit laporan -> ditolak'));
  results.push(__expectDenied(function() { return deleteDailyTransactionUnlocked('###TAK-ADA###', pic); }, 'SUPERADMIN', 'PIC hapus laporan -> ditolak'));
  results.push(__expectDenied(function() { return saveFlazzTopUpUnlocked({ userInfo: pic }); }, 'Akses ditolak: Anda hanya dapat mengelola kartu warehouse', 'PIC top up tanpa kartu -> ditolak scoping cabang'));
  results.push(__expectDenied(function() { return deleteFlazzTopUpUnlocked('###TAK-ADA###', pic); }, 'SUPERADMIN', 'PIC hapus top up Flazz -> ditolak'));
  results.push(__expectDenied(function() { return saveFlazzUsageUnlocked({ userInfo: pic }); }, 'SUPERADMIN', 'PIC serah kartu Flazz -> ditolak'));
  results.push(__expectDenied(function() { return updateJalur({ id: '###TAK-ADA###' }, pic); }, 'SUPERADMIN', 'PIC update jalur -> ditolak'));
  results.push(__expectDenied(function() { return deleteJalur('###TAK-ADA###', pic); }, 'SUPERADMIN', 'PIC hapus jalur -> ditolak'));

  destroySession(superToken);
  destroySession(picToken);
  return __summarize(results);
}

function __runAllTests() {
  var r = __runAuthTests();
  r = __runBackupSheetTests();
  r = __runEditUsageTests();
  r = __runMasterGuardTests();
  r = __runSecurityIsolationTests();
  Logger.log('==== ALL TESTS DONE ====');
  return r;
}