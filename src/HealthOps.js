// ==========================================
// MONITORING & ALERT SUPERADMIN
// ==========================================

function superadminEmails() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) return [];
  const h = sheetHeaders(sheet);
  const idx = colIndex(h, ['email', 'role', 'status', 'username']);
  // Adaptasi: bila kubus 'email' belum ada (schema lama), jangan crash.
  // Log peringatan dan kembalikan [] agar sendAdminAlert memakai jalur log.
  if (idx.email === -1) {
    Logger.log('KOLOM EMAIL BELUM ADA di sheet Pengguna. Jalankan setupDatabase() lalu isi email SUPERADMIN. superadminEmails() mengembalikan kosong.');
    return [];
  }
  const rows = readRowsCols(sheet, [idx.email, idx.role, idx.status, idx.username]);
  const out = [];
  rows.forEach(function(r) {
    if (String(r[1]) === 'SUPERADMIN' && String(r[2]) === 'Aktif') {
      const email = String(r[0] || '').trim();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.push(email);
      else Logger.log('SUPERADMIN tanpa email terdaftar: ' + r[3] + ' (tambahkan kolom email di Pengguna)');
    }
  });
  return out;
}

function sendAdminAlert(subject, body) {
  const emails = superadminEmails();
  if (emails.length === 0) { Logger.log('TIDAK ADA EMAIL SUPERADMIN: ' + subject + ' — ' + body); return { sent: 0 }; }
  emails.forEach(function(e) {
    try {
      MailApp.sendEmail(e, subject, body);
    } catch (err) {
      Logger.log('Gagal kirim alert ke ' + e + ': ' + err);
    }
  });
  return { sent: emails.length };
}

function dailyHealthReport() {
  const ss = getDB();
  const today = new Date();
  let rowsPenggunaan = 0;
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (sheet) rowsPenggunaan = Math.max(0, sheet.getLastRow() - 1);

  let auditCount = 0;
  const auditSheet = ss.getSheetByName('Audit_Log');
  if (auditSheet) auditCount = Math.max(0, auditSheet.getLastRow() - 1);

  let cabangCount = 0;
  const cabangSheet = ss.getSheetByName('Cabang');
  if (cabangSheet) cabangCount = Math.max(0, cabangSheet.getLastRow() - 1);

  const body = [
    'Laporan kesehatan harian ' + Utilities.formatDate(today, 'Asia/Jakarta', 'yyyy-MM-dd'),
    '',
    'Cabang aktif: ' + cabangCount,
    'Total laporan (Penggunaan_BBM): ' + rowsPenggunaan,
    'Baris audit log: ' + auditCount,
    '',
    'Backup: jalankan runDailyBackup() bila trigger belum aktif (setupBackupTrigger()).',
    ''
  ].join('\n');

  const res = sendAdminAlert('[BBM] Laporan Kesehatan Harian', body);
  return { success: true, sent: res.sent };
}

function setupDailyHealthTrigger() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'dailyHealthReport';
  });
  if (triggers.length === 0) {
    ScriptApp.newTrigger('dailyHealthReport')
      .timeBased()
      .atHour(7)
      .everyDays(1)
      .inTimezone('Asia/Jakarta')
      .create();
  }
  return { success: true, msg: triggers.length === 0 ? 'Trigger harian 07:00 dibuat.' : 'Trigger sudah ada.' };
}
