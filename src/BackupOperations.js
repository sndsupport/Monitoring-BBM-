// ==========================================
// BACKUP HARIAN — spreadsheet (semua sheet database)
// Naming: Monitoring_BBM_backup_<YYYY-MM-DD> (_v2/_v3 jika bentrok)
// Hasil dicache prefix 'backup:' TTL 300.
// ==========================================

// Nama sheet diambil dari DATABASE_SHEETS (DatabaseSetup.js) saat runtime,
// agar tidak bergantung pada urutan muat file di Apps Script (file dimuat
// sesuai urutan alfabet — BackupOperations.js lebih dulu dari DatabaseSetup.js).
function getBackupSheets() {
  return (typeof DATABASE_SHEETS !== 'undefined' && DATABASE_SHEETS) ? DATABASE_SHEETS.slice() : [];
}

function setupBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'runDailyBackup';
  });
  if (triggers.length === 0) {
    ScriptApp.newTrigger('runDailyBackup')
      .timeBased()
      .atHour(2)
      .everyDays(1)
      .inTimezone('Asia/Jakarta')
      .create();
  }
  return { success: true, msg: triggers.length === 0 ? 'Trigger harian 02:00 dibuat.' : 'Trigger sudah ada.' };
}

function performBackup(ssId, label) {
  var ss = SpreadsheetApp.openById(ssId);
  var backupRoot = getFolderByNameOrCreate('BBM_BACKUP');

  var name = label;
  var seq = 2;
  while (backupRoot.getFilesByName(name).hasNext()) {
    name = label + '_v' + seq;
    seq++;
  }

  var copy = SpreadsheetApp.create(name);
  var copied = 0;
  var list = getBackupSheets();
  list.forEach(function(sheetName) {
    var src = ss.getSheetByName(sheetName);
    if (!src) return;
    try {
      src.copyTo(copy).setName(sheetName);
      copied++;
    } catch (e) { /* sheet tanpa izin copy -> lewati */ }
  });
  var def = copy.getSheetByName('Sheet1');
  if (def) copy.deleteSheet(def);

  var file = DriveApp.getFileById(copy.getId());
  file.moveTo(backupRoot);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  return {
    spreadsheetCopyId: copy.getId(),
    backupFolderUrl: backupRoot.getUrl(),
    name: name,
    collided: name !== label,
    sheetsCopied: copied,
    expectedSheets: list.length
  };
}

function runDailyBackup() {
  try {
    var ssId = spreadsheetId();
    var stamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    var result = performBackup(ssId, 'Monitoring_BBM_backup_' + stamp);

    cachePut('backup:last', {
      spreadsheetCopyId: result.spreadsheetCopyId,
      backupFolderUrl: result.backupFolderUrl,
      name: result.name,
      timestamp: new Date().getTime()
    }, 300);

    pruneBackups(14);

    var kode = result.collided ? 'copies' : 'ok';
    var out = {
      kode: kode,
      backupFolderUrl: result.backupFolderUrl,
      spreadsheetCopyId: result.spreadsheetCopyId
    };
    if (result.sheetsCopied < result.expectedSheets) {
      out.msg = 'Backup parsial: ' + result.sheetsCopied + ' dari ' + result.expectedSheets + ' sheet ter-copy.';
      Logger.log(out.msg);
    }
    return out;
  } catch (e) {
    Logger.log('Backup gagal: ' + e);
    return { kode: 'ramje', msg: e.toString() };
  }
}

function pruneBackups(keep) {
  var root = getFolderByNameOrCreate('BBM_BACKUP');
  var files = [];
  var it = root.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function(a, b) { return a.getName().localeCompare(b.getName()); });
  var deleted = 0;
  while (files.length > keep) {
    var old = files.shift();
    old.setTrashed(true);
    deleted++;
  }
  return deleted;
}

// Pulihkan seluruh sheet database dari salinan backup ke spreadsheet aktif.
// SUPERADMIN-only. Hanya menerima file yang benar-benar berada di folder
// BBM_BACKUP (mencegah restore dari spreadsheet sembarang/asing).
//
// Cara kerja: sebelum menimpa apa pun, backup KEADAAN SAAT INI dulu (safety
// snapshot) — sehingga restore yang keliru tetap bisa dibatalkan dengan
// me-restore ulang dari snapshot itu. Hanya NILAI sel (bukan format) yang
// dipulihkan per sheet database; sheet yang tidak ada di backup dilewati.
function restoreFromBackup(backupFileId, token) {
  assertSuperadminOnly(requireUser(token), 'memulihkan data dari backup');
  if (!backupFileId) return { success: false, msg: 'ID file backup wajib diisi.' };

  try {
    var backupRoot = getFolderByNameOrCreate('BBM_BACKUP');
    var isInBackupFolder = false;
    var filesIt = backupRoot.getFiles();
    while (filesIt.hasNext()) {
      if (filesIt.next().getId() === backupFileId) { isInBackupFolder = true; break; }
    }
    if (!isInBackupFolder) {
      return { success: false, msg: 'File backup tidak ditemukan di folder BBM_BACKUP. Restore dibatalkan.' };
    }

    // Safety snapshot keadaan SEBELUM restore, agar tetap bisa dibatalkan.
    var stamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', "yyyy-MM-dd'_'HHmmss");
    var safety = performBackup(spreadsheetId(), 'PRE_RESTORE_SAFETY_' + stamp);

    var backupSS = SpreadsheetApp.openById(backupFileId);
    var liveSS = getDB();
    var list = getBackupSheets();
    var restored = [];
    var skipped = [];

    list.forEach(function(sheetName) {
      var src = backupSS.getSheetByName(sheetName);
      if (!src) { skipped.push(sheetName); return; }
      var values = src.getDataRange().getValues();
      var dest = liveSS.getSheetByName(sheetName);
      if (!dest) dest = liveSS.insertSheet(sheetName);
      dest.clearContents();
      if (values.length > 0 && values[0].length > 0) {
        dest.getRange(1, 1, values.length, values[0].length).setValues(values);
      }
      restored.push(sheetName);
    });

    return {
      success: true,
      msg: 'Restore selesai: ' + restored.length + ' sheet dipulihkan' + (skipped.length ? (', ' + skipped.length + ' dilewati (tidak ada di backup): ' + skipped.join(', ')) : '') + '. Snapshot sebelum restore disimpan sebagai "' + safety.name + '" di folder BBM_BACKUP bila perlu dibatalkan.',
      restored: restored,
      skipped: skipped,
      safetySnapshot: safety.name
    };
  } catch (e) {
    return { success: false, msg: 'Restore gagal: ' + e.toString() };
  }
}

function diagnoseBackup() {
  try {
    var it = DriveApp.getRootFolder().getFoldersByName('BBM_BACKUP');
    var root = it.hasNext() ? it.next() : null;
    if (!root) return { success: true, lastBackup: null };
    var files = [];
    var fit = root.getFiles();
    while (fit.hasNext()) {
      var f = fit.next();
      files.push({ name: f.getName(), id: f.getId(), url: f.getUrl(), lastUpdated: f.getLastUpdated() });
    }
    files.sort(function(a, b) { return String(b.name).localeCompare(String(a.name)); });
    return { success: true, lastBackup: files.length ? files[0] : null };
  } catch (e) {
    return { success: false, msg: e.toString() };
  }
}