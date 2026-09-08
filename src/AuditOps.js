// ==========================================
// AUDIT LOG (sheet Audit_Log)
// ==========================================

function logAudit(user, action, modul, keterangan, dataSebelum, dataSesudah) {
  try {
    if (!user) return;
    var ss = getDB();
    var sheet = ss.getSheetByName('Audit_Log');
    if (!sheet) return;
    sheet.appendRow([
      'LOG-' + new Date().getTime(),
      new Date(),
      user.user_id || '',
      user.username || '',
      action,
      modul,
      keterangan || '',
      dataSebelum ? JSON.stringify(dataSebelum).substring(0, 2000) : '',
      dataSesudah ? JSON.stringify(dataSesudah).substring(0, 2000) : ''
    ]);
  } catch (e) {
    console.error('Audit log gagal: ' + e);
  }
}