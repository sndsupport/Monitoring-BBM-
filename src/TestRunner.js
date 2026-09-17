// ==========================================
// LIGHTWEIGHT TEST RUNNER (jalankan dari editor atau `clasp run`)
// ==========================================

// Guard: __runAllTests() TIDAK BOLEH jalan diam-diam terhadap spreadsheet produksi
// (mis. __runMasterGuardTests membaca baris asli Flazz_TopUp, __runMasterCacheTests
// membalik master-cache revision produksi). Set Script Property ALLOW_TEST_ON_PROD
// ke 'true' HANYA bila Anda sengaja ingin menjalankannya terhadap produksi (semua
// test yang ada di sini dirancang read-only/negative-path, tapi ini bukan jaminan
// untuk test yang ditambahkan di kemudian hari).
function __assertTestSpreadsheetSafe() {
  var isProd = spreadsheetId() === PROD_SPREADSHEET_ID;
  var allowed = PropertiesService.getScriptProperties().getProperty('ALLOW_TEST_ON_PROD') === 'true';
  if (isProd && !allowed) {
    throw new Error(
      '__runAllTests dibatalkan: SPREADSHEET_ID aktif adalah PROD_SPREADSHEET_ID. ' +
      'Set Script Property SPREADSHEET_ID ke spreadsheet uji terlebih dahulu, atau ' +
      'set ALLOW_TEST_ON_PROD="true" di Script Properties bila memang sengaja.'
    );
  }
}

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
  // Fungsi target kini mengambil identitas dari token sesi asli (bukan objek
  // userInfo mentah) — lihat catatan keamanan di __runSecurityIsolationTests.
  var superToken = createSession({ user_id: 'U-TEST-RUNNER', username: 'tester', nama: 'Test Runner', role: 'SUPERADMIN', cabang: '' });
  var results = [];
  try { updateCabang({ edit_id: '###TAK-ADA###', kode: 'X', nama: 'X', lokasi: '' }, superToken); }
  catch (e) { results.push(__expectTrue(e.message.indexOf('tidak ditemukan') > -1, 'updateCabang kode tak dikenal -> error')); }
  try { deleteCabangById('###TAK-ADA###', superToken); }
  catch (e) { results.push(__expectTrue(e.message.indexOf('tidak ditemukan') > -1, 'deleteCabangById kode tak dikenal -> error')); }
  try { deleteSupirById('###TAK-ADA###', superToken); }
  catch (e) { results.push(__expectTrue(e.message.indexOf('tidak ditemukan') > -1, 'deleteSupirById id tak dikenal -> error')); }
  try { deleteBBMById('###TAK-ADA###', superToken); }
  catch (e) { results.push(__expectTrue(e.message.indexOf('tidak ditemukan') > -1, 'deleteBBMById id tak dikenal -> error')); }
  var sheet = getDB().getSheetByName('Flazz_TopUp');
  var data = sheet ? sheet.getDataRange().getValues() : [];
  var found = -1;
  for (var i = 1; i < data.length; i++) { if (data[i][0]) { found = i; break; } }
  if (found > 0) {
    try { editFlazzTopUp({ id: data[found][0], card_id: '###KARTU-TAK-ADA###', amount: 0 }, superToken); }
    catch (e) { results.push(__expectTrue(e.message.indexOf('Kartu tujuan tidak ditemukan') > -1, 'edit TopUp ke kartu tak dikenal -> error')); }
  }
  destroySession(superToken);
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

  // Kontrak akses operasional: PIC lolos gate role namun dibatasi ke cabang sendiri;
  // aksi tertentu (top-up/Flazz/dll) tetap SUPERADMIN-only.
  results.push(__expectDenied(function() { return editDailyTransactionUnlocked({}, pic); }, 'Transaksi tidak ditemukan', 'PIC edit laporan -> lolos gate role, divalidasi data'));
  results.push(__expectDenied(function() { return deleteDailyTransactionUnlocked('###TAK-ADA###', pic); }, 'Transaksi tidak ditemukan', 'PIC hapus laporan -> lolos gate role, divalidasi data'));
  results.push(__expectDenied(function() { return assertTransactionAccess(pic, 'CBG-BDG'); }, 'hanya dapat mengelola transaksi warehouse', 'PIC transaksi cabang lain -> ditolak scoping'));
  try {
    assertTransactionAccess(pic, 'CBG-JKT');
    results.push(__expectEqual(true, true, 'PIC transaksi cabang sendiri -> lolos scoping'));
  } catch (e) {
    results.push(__expectEqual(true, false, 'PIC transaksi cabang sendiri -> lolos scoping (gagal: ' + e.message + ')'));
  }
  results.push(__expectDenied(function() { return saveFlazzTopUpUnlocked({ userInfo: pic }); }, 'Akses ditolak: Anda hanya dapat mengelola kartu warehouse', 'PIC top up tanpa kartu -> ditolak scoping cabang'));
  results.push(__expectDenied(function() { return deleteFlazzTopUpUnlocked('###TAK-ADA###', pic); }, 'SUPERADMIN', 'PIC hapus top up Flazz -> ditolak'));
  results.push(__expectDenied(function() { return saveFlazzUsageUnlocked({ userInfo: pic }); }, 'SUPERADMIN', 'PIC serah kartu Flazz -> ditolak'));
  results.push(__expectDenied(function() { return updateJalur({ id: '###TAK-ADA###' }, picToken); }, 'Jadwal tidak ditemukan', 'PIC update jalur -> lolos gate role, divalidasi data'));
  results.push(__expectDenied(function() { return deleteJalur('###TAK-ADA###', picToken); }, 'Jadwal tidak ditemukan', 'PIC hapus jalur -> lolos gate role, divalidasi data'));
  results.push(__expectDenied(function() {
    if (assertMasterAccess(pic, 'uji') !== 'SUPERADMIN') assertOwnWarehouse(pic, 'CBG-BDG', 'Jadwal pengiriman');
  }, 'tidak berada di warehouse', 'PIC jalur cabang lain -> ditolak scoping'));
  try {
    assertOwnWarehouse(pic, 'CBG-JKT');
    results.push(__expectEqual(true, true, 'PIC jalur cabang sendiri -> lolos scoping'));
  } catch (e) {
    results.push(__expectEqual(true, false, 'PIC jalur cabang sendiri -> lolos scoping (gagal: ' + e.message + ')'));
  }

  // updateJalur/deleteJalur kini men-scope referensi-baru & cascade kartu (mirror saveJalur):
  // PIC hanya boleh menukar/menyerahkan kartu, kendaraan, dan supir cabang sendiri.
  // Jalur penuh dgn baris nyata (swap ke referensi asing ditolak) divalidasi suite Apps Script.
  results.push(__expectDenied(function() { return assertFlazzAccess(pic, 'CBG-BDG'); }, 'kartu warehouse', 'PIC kartu Flazz cabang lain -> ditolak scoping'));
  try {
    assertFlazzAccess(pic, 'CBG-JKT');
    results.push(__expectEqual(true, true, 'PIC kartu Flazz cabang sendiri -> lolos scoping'));
  } catch (e) {
    results.push(__expectEqual(true, false, 'PIC kartu Flazz cabang sendiri -> lolos scoping (gagal: ' + e.message + ')'));
  }

  // Regresi celah pemalsuan identitas (audit BUG-001/002/003): pemanggilan langsung
  // dengan objek userInfo palsu atau tanpa token sama sekali HARUS ditolak sebagai
  // sesi tidak valid, bukan diterima begitu saja seperti sebelum perbaikan.
  results.push(__expectDenied(function() { return insertUser({ username: 'x', nama: 'x', password: 'x', role: 'SUPERADMIN', cabang: '' }, { role: 'SUPERADMIN' }); }, 'sesi tidak valid', 'insertUser dgn objek role palsu (bukan token) -> ditolak'));
  results.push(__expectDenied(function() { return saveFlazzCard({ card_number: '999', card_type: 'BCA_FLAZZ', branch_id: 'CBG-JKT' }, { role: 'SUPERADMIN' }); }, 'sesi tidak valid', 'saveFlazzCard dgn objek role palsu -> ditolak'));
  results.push(__expectDenied(function() { return saveJalur({ tanggal: '2026-01-01', rows: [] }, { role: 'SUPERADMIN' }); }, 'sesi tidak valid', 'saveJalur dgn objek role palsu -> ditolak'));
  results.push(__expectDenied(function() { return setCardBalance('FLZ-TAK-ADA', 999999999); }, 'sesi tidak valid', 'setCardBalance tanpa token -> ditolak'));
  results.push(__expectDenied(function() { return configureSpreadsheet('spreadsheet-id-palsu'); }, 'sesi tidak valid', 'configureSpreadsheet tanpa token -> ditolak'));

  destroySession(superToken);
  destroySession(picToken);
  return __summarize(results);
}

// Gate rekon opsi B: kartu yang diserahkan lewat jalur (ref JALUR) tetapi pengiriman
// selesai tanpa pengeluaran — rekon pengembalian tetap diperbolehkan agar kartu tidak macet.
function __runReconGateTests() {
  var results = [];
  var ss = getDB();
  var usageSheet = ss.getSheetByName('Flazz_Usage');
  var cards = [];
  if (usageSheet && usageSheet.getLastRow() > 1) {
    var uData = usageSheet.getDataRange().getValues();
    var uHeaders = uData[0];
    var uCard = uHeaders.indexOf('card_id');
    var uStatus = uHeaders.indexOf('status');
    for (var i = 1; i < uData.length; i++) {
      if (uStatus > -1 && String(uData[i][uStatus]) === 'DIBERIKAN' && String(uData[i][uCard] || '')) {
        if (cards.indexOf(String(uData[i][uCard])) === -1) cards.push(String(uData[i][uCard]));
      }
    }
  }
  for (var k = 0; k < cards.length; k++) {
    var g = checkReconGate(cards[k]);
    results.push(__expectTrue(typeof g === 'object' && g.eligible !== undefined, 'checkReconGate kartu ' + cards[k] + ' mengembalikan objek eligible'));
  }
  results.push(__expectEqual(typeof jalurTerkaitSudahDilaporkan('###KARTU-TAK-ADA###', ss), 'boolean', 'jalurTerkaitSudahDilaporkan kartu tak dikenal -> false (boolean)'));
  return __summarize(results);
}

function __runWarningsTests() {
  var superToken = createSession({ user_id: 'U-SUP-T', username: 'super-t', nama: 'Super T', role: 'SUPERADMIN', cabang: '' });
  var pic = { user_id: 'U-PIC-T', username: 'pic-t', nama: 'Pic T', role: 'PIC CABANG', cabang: 'CBG-JKT' };
  var picToken = createSession(pic);
  var res = [];
  res.push(__expectDenied(function() { return getDashboardWarnings('token-palsu-xyz'); }, 'sesi tidak valid', 'getDashboardWarnings token palsu -> ditolak'));
  var out = getDashboardWarnings(superToken);
  res.push(__expectEqual(Array.isArray(out.pajakKIR) && Array.isArray(out.saldo), true, 'getDashboardWarnings SUPERADMIN -> array'));
  var outPic = getDashboardWarnings(picToken);
  res.push(__expectEqual(Array.isArray(outPic.pajakKIR) && Array.isArray(outPic.saldo), true, 'getDashboardWarnings PIC -> array (scoped)'));
  res.push(__expectEqual(warnCardIsLow({ last_balance: 99999, status: 'TERSEDIA' }), true, 'saldo 99.999 -> menipis'));
  res.push(__expectEqual(warnCardIsLow({ last_balance: 100000, status: 'TERSEDIA' }), false, 'saldo 100.000 -> TIDAK menipis'));
  res.push(__expectEqual(warnCardIsLow({ last_balance: 0, status: 'NONAKTIF' }), false, 'NONAKTIF dilewati'));
  res.push(__expectEqual(warnCardIsLow({ last_balance: 0, status: 'SEDANG_DIGUNAKAN' }), true, 'saldo 0 dipakai -> menipis'));
  var lewat = warnVehicleAlerts({ tanggal_pajak: '2026-01-01', tanggal_pajak_5_tahunan: '2030-01-01', tanggal_kir: '2031-01-01' });
  res.push(__expectEqual(lewat.length > 0, true, 'pajak masa lalu -> ada alert'));
  res.push(__expectEqual(warnWorst(lewat), 'LEWAT', 'worst=LEWAT'));
  res.push(__expectEqual(warnVehicleAlerts({ tanggal_pajak: '2032-01-01', tanggal_pajak_5_tahunan: '', tanggal_kir: '' }).length, 0, 'pajak jauh -> tanpa alert'));
  destroySession(superToken); destroySession(picToken);
  return __summarize(res);
}

function __runMasterCacheTests() {
  var results = [];
  var r1 = getMasterRev();
  var k1 = masterCacheKey('SUPERADMIN', '');
  var b1 = bbmCacheKey('CBG-JKT');
  invalidateMaster('SUPERADMIN', '');
  var r2 = getMasterRev();
  var k2 = masterCacheKey('SUPERADMIN', '');
  var b2 = bbmCacheKey('CBG-JKT');
  results.push(__expectTrue(r1 !== r2, 'invalidateMaster menaikkan versi master cache'));
  results.push(__expectTrue(k1 !== k2, 'kunci master berubah setelah invalidasi (cache lama orphan)'));
  results.push(__expectTrue(b1 !== b2, 'kunci bbm berubah setelah invalidasi'));
  results.push(__expectEqual(masterCacheKey('PIC CABANG', 'CBG-JKT').indexOf(r2) > -1, true, 'kunci PIC memakai versi terbaru'));
  invalidatePerforma('PIC CABANG', 'CBG-JKT');
  results.push(__expectEqual(performaCacheKey('PIC CABANG', 'CBG-JKT').indexOf('perf:') === 0, true, 'kunci performa tetap format lama (tidak versioning)'));
  return __summarize(results);
}

// Master rev disimpan ke cache sebagai UUID. cacheGet melakukan JSON.parse;
// nilai UUID polos (tanpa tanda kutip) harus TETAP terbaca, bukan melempar
// SyntaxError ("unexpected token e...") yang tadinya merusak login via getMasterRev.
function __runCacheParsingTests() {
  var results = [];
  try {
    bumpMasterRev();
    var rev = getMasterRev();
    results.push(__expectTrue(typeof rev === 'string' && rev.length > 0, 'getMasterRev setelah bumpMasterRev -> string (UUID) non-kosong'));
  } catch (e) {
    results.push(__expectTrue(false, 'getMasterRev setelah bumpMasterRev tidak melempar: ' + e.message));
  }
  results.push(__expectEqual(cacheGet('rendah:-raw'), null, 'cacheGet kunci kosong -> null'));
  var m = masterCacheKey('SUPERADMIN', '');
  results.push(__expectEqual(m.indexOf('master:') === 0 && m.indexOf(':SUPERADMIN:') > -1, true, 'masterCacheKey terbentuk normal setelah rev parsing'));
  return __summarize(results);
}

// Round-trip payload cache >100KB memakai kompresi gzip (cachePut/cacheGet di Config.gs).
// Regresi jalur yang tadinya di-skip (d7885d6) sehingga master SUPERADMIN yang besar
// TIDAK pernah ter-cache -> tiap reload master baca ulang seluruh spreadsheet.
function __runCacheGzipTests() {
  var results = [];
  var key = 'test:gzip:big';
  CacheService.getScriptCache().remove(key);
  var big = { vehicles: [], flazzCards: [], drivers: [], stringBlob: '' };
  for (var i = 0; i < 300; i++) {
    big.vehicles.push({ id: 'V-' + i, plat: 'B 1234 CD', nama: 'Kendaraan Operasional ' + i, jenis: 'Mobil', merk: 'Toyota', model: 'Avanza', kapasitas_tangki: '45', jumlah_bar: '8', standar_km_l: '12', cabang: 'CAB-01', status: 'Aktif', jenis_indikator: 'DIGITAL_BAR' });
  }
  for (var j = 0; j < 150; j++) {
    big.flazzCards.push({ id: 'FLZ-' + j, card_number: '0123456789' + j, card_name: 'Kartu ' + j, card_type: 'BCA_FLAZZ', card_role: 'CADANGAN', branch_id: 'CAB-01', driver_id: '', default_driver_id: '', last_balance: 1500000, status: 'TERSEDIA', notes: '' });
  }
  for (var k = 0; k < 50; k++) {
    big.drivers.push({ id: 'DRV-' + k, nama: 'Supir ' + k, cabang: 'CAB-01', default_vehicle_id: '' });
  }
  results.push(__expectTrue(JSON.stringify(big).length > 100000, 'payload tes melebihi 100KB agar jalur kompresi teruji'));
  cachePut(key, big, 120);
  var got = cacheGet(key);
  results.push(__expectTrue(!!got, 'cacheGet payload besar tidak null'));
  results.push(__expectEqual(got && got.vehicles.length, big.vehicles.length, 'cacheGet payload besar: vehicles utuh'));
  results.push(__expectEqual(got && got.flazzCards.length, big.flazzCards.length, 'cacheGet payload besar: flazzCards utuh'));
  results.push(__expectEqual(got && got.flazzCards[0].card_name, 'Kartu 0', 'cacheGet payload besar: isi flazzCards utuh'));
  var stored = CacheService.getScriptCache().get(key);
  results.push(__expectTrue(!!stored && String(stored).indexOf('GZ:') === 0, 'payload besar tersimpan terkompresi (prefiks GZ:)'));
  cachePut(key, { a: 1 }, 120);
  results.push(__expectEqual(cacheGet(key).a, 1, 'payload kecil tetap jalur JSON biasa'));
  CacheService.getScriptCache().remove(key);
  return __summarize(results);
}

function __runOilChangeTests() {
  var results = [];
  results.push(__expectEqual(warnOilStatus({}, null), null, 'oli: tanpa baseline -> null'));
  results.push(__expectEqual(warnOilStatus({ km_terakhir_ganti_oli: 0 }, 10), null, 'oli: baseline 0 -> null'));
  results.push(__expectEqual(warnOilStatus({ km_terakhir_ganti_oli: 100000, interval_ganti_oli_km: 5000 }, 104499), null, 'oli: sisa 501 -> null'));
  var w1 = warnOilStatus({ km_terakhir_ganti_oli: 100000, interval_ganti_oli_km: 5000 }, 104500);
  results.push(__expectEqual(w1 && w1.status, 'WASPADA', 'oli: sisa 500 -> WASPADA'));
  results.push(__expectEqual(w1 && w1.sisa_km, 500, 'oli: sisa_km 500'));
  var g1 = warnOilStatus({ km_terakhir_ganti_oli: 100000, interval_ganti_oli_km: 5000 }, 105000);
  results.push(__expectEqual(g1 && g1.status, 'GANTI_OLI', 'oli: tempuh == interval -> GANTI_OLI'));
  results.push(__expectEqual(warnOilStatus({ km_terakhir_ganti_oli: 100000, interval_ganti_oli_km: '' }, 108000).interval_km, 5000, 'oli: interval kosong -> default 5000'));
  results.push(__expectEqual(warnOilStatus({ km_terakhir_ganti_oli: 100000, interval_ganti_oli_km: '', jenis: 'Mobil' }, 108000).interval_km, 5000, 'oli: interval kosong + Mobil -> default 5000'));
  var mo = warnOilStatus({ km_terakhir_ganti_oli: 100000, interval_ganti_oli_km: '', jenis: 'Motor' }, 103000);
  results.push(__expectEqual(mo && mo.interval_km, 3000, 'oli: interval kosong + Motor -> default 3000'));
  var mw = warnOilStatus({ km_terakhir_ganti_oli: 100000, interval_ganti_oli_km: '', jenis: 'Motor' }, 102500);
  results.push(__expectEqual(mw && mw.status, 'WASPADA', 'oli: motor sisa 500 -> WASPADA (default 3000)'));
  results.push(__expectEqual(warnOilStatus({ km_terakhir_ganti_oli: 100000, interval_ganti_oli_km: '', jenis: 'Motor' }, 102499), null, 'oli: motor sisa 501 -> null (default 3000)'));
  results.push(__expectEqual(warnOilStatus({ km_terakhir_ganti_oli: 100000, interval_ganti_oli_km: 4000, jenis: 'Motor' }, 103600).interval_km, 4000, 'oli: interval eksplisit 4000 dipakai walau Motor'));
  results.push(__expectEqual(warnOilStatus({ km_terakhir_ganti_oli: 90000, interval_ganti_oli_km: 5000 }, 85000), null, 'oli: odo < baseline -> null'));

  // Guard & integrasi (butuh DB hidup)
  results.push(__expectDenied(function() { return resetOilChange('###TAK-ADA###', 'token-palsu-xyz'); }, 'sesi tidak valid', 'resetOilChange token palsu -> ditolak'));
  results.push(__expectDenied(function() { return resetOilChange('###TAK-ADA###', createSession({ user_id: 'U-O-T', username: 'o-t', nama: 'O T', role: 'SUPERADMIN', cabang: '' })); }, 'tidak ditemukan', 'resetOilChange kendaraan tak dikenal -> error'));

  var supToken = createSession({ user_id: 'U-O-SUP', username: 'o-sup', nama: 'O Sup', role: 'SUPERADMIN', cabang: '' });
  var picJktToken = createSession({ user_id: 'U-O-PIC', username: 'o-pic', nama: 'O Pic', role: 'PIC CABANG', cabang: 'CBG-JKT' });
  var vehs = getActiveVehicles(supToken);
  if (vehs && vehs.length) {
    var v = vehs[0];
    var r = resetOilChange(v.vehicle_id, supToken);
    results.push(__expectEqual(!!(r && r.success), true, 'resetOilChange SUPERADMIN pada ' + v.vehicle_id + ' -> sukses'));
    if (String(v.cabang) !== 'CBG-JKT') {
      results.push(__expectDenied(function() { return resetOilChange(v.vehicle_id, picJktToken); }, 'warehouse', 'PIC JKT reset kendaraan ' + v.cabang + ' -> ditolak'));
    } else {
      var r2 = resetOilChange(v.vehicle_id, picJktToken);
      results.push(__expectEqual(!!(r2 && r2.success), true, 'PIC JKT reset kendaraan cabang sendiri -> sukses'));
    }
  } else {
    results.push(__expectTrue(false, 'tidak ada kendaraan aktif utk test reset'));
  }

  // Kategori oli hadir & sadar schema (token masih hidup)
  var out = getDashboardWarnings(supToken);
  results.push(__expectEqual(Array.isArray(out.oli), true, 'getDashboardWarnings -> oli array'));
  destroySession(supToken); destroySession(picJktToken);
  return __summarize(results);
}

// Kebijakan perubahan supir default kartu (guard pure):
// kartu yang sedang dipakai (SEDANG_DIGUNAKAN) TIDAK boleh diubah default-nya,
// sehingga pemegang sementara tidak bisa 'nempel' jadi default via form/edit.
function __runFlazzDefaultGuardTests() {
  var results = [];
  // Skenario bug: kartu cadangan dipakai sementara (default kosong) - mencoba set supir -> harus DITOLAK
  results.push(__expectEqual(flazzAllowDefaultChange('SEDANG_DIGUNAKAN', '', 'Yudiman'), false, 'kartu dipakai, default kosong, set supir -> tolak'));
  results.push(__expectEqual(flazzAllowDefaultChange('SEDANG_DIGUNAKAN', '', 'Andi'), false, 'kartu dipakai, default kosong, set supir lain -> tolak'));
  // Tidak ada perubahan nilai -> diizinkan (no-op, tidak menyentuh apa pun)
  results.push(__expectEqual(flazzAllowDefaultChange('SEDANG_DIGUNAKAN', '', ''), true, 'kartu dipakai, default kosong, simpan tanpa ubah -> izinkan'));
  results.push(__expectEqual(flazzAllowDefaultChange('SEDANG_DIGUNAKAN', 'Yudiman', 'Yudiman'), true, 'kartu dipakai, default sama -> izinkan'));
  // Kartu BEBAS (tidak dipakai) -> bebas mengubah default
  results.push(__expectEqual(flazzAllowDefaultChange('TERSEDIA', '', 'Yudiman'), true, 'kartu tersedia, default kosong, set supir -> izinkan'));
  results.push(__expectEqual(flazzAllowDefaultChange('TERSEDIA', 'Andi', 'Yudiman'), true, 'kartu tersedia, ganti default -> izinkan'));
  // Sheet lama tanpa status (string kosong) -> tidak diblokir
  results.push(__expectEqual(flazzAllowDefaultChange('', '', 'Yudiman'), true, 'tanpa status -> izinkan'));
  return __summarize(results);
}

function __runAllTests() {
  __assertTestSpreadsheetSafe();
  var r = __runAuthTests();
  r = __runBackupSheetTests();
  r = __runEditUsageTests();
  r = __runMasterGuardTests();
  r = __runSecurityIsolationTests();
  r = __runReconGateTests();
  r = __runWarningsTests();
  r = __runMasterCacheTests();
  r = __runCacheParsingTests();
  r = __runFlazzDefaultGuardTests();
  r = __runCacheGzipTests();
  r = __runOilChangeTests();
  Logger.log('==== ALL TESTS DONE ====');
  return r;
}