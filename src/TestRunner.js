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

function __runAllTests() {
  var r = __runAuthTests();
  Logger.log('==== ALL TESTS DONE ====');
  return r;
}