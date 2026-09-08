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

function __runAllTests() {
  var r = __runAuthTests();
  r = __runBackupSheetTests();
  r = __runEditUsageTests();
  r = __runMasterGuardTests();
  Logger.log('==== ALL TESTS DONE ====');
  return r;
}