// ==========================================
// BACKUP HARIAN — spreadsheet (4 data sheets)
// Naming: Monitoring_BBM_backup_<YYYY-MM-DD> (_v2/_v3 jika bentrok)
// Hasil dicache prefix 'backup:' TTL 300.
// ==========================================

var BACKUP_SHEETS = ['SESSION', 'PENGENDARA', 'Supir', 'Flazz_Card'];

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
  BACKUP_SHEETS.forEach(function(sheetName) {
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
    sheetsCopied: copied
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
    if (result.sheetsCopied < BACKUP_SHEETS.length) {
      out.msg = 'Backup parsial: ' + result.sheetsCopied + ' dari ' + BACKUP_SHEETS.length + ' sheet ter-copy.';
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