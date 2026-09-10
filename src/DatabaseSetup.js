// ==========================================
// SKEMA DATABASE — single source of truth (jangan duplikasikan di file lain)
// ==========================================
var DATABASE_SHEETS = [
  'Cabang',
  'Supir',
  'BBM',
  'Pengguna',
  'Kendaraan',
  'Penggunaan_BBM',
  'Pengisian_BBM',
  'Foto_Evidence',
  'Audit_Log',
  'Konfigurasi',
  'Dashboard',
  'Pengaturan',
  'Flazz_Card',
  'Flazz_Usage',
  'Flazz_TopUp',
  'Flazz_Tol',
  'Flazz_Reconciliation',
  'Jalur_Pengiriman'
];

var DATABASE_SCHEMA = [
  { name: 'Cabang', headers: ['kode_cabang', 'nama_cabang', 'lokasi', 'status'] },
    { name: 'Supir', headers: ['supir_id', 'nama_supir', 'kode_cabang', 'status'] },
    { name: 'BBM', headers: ['bbm_id', 'jenis_bbm', 'harga_per_liter', 'kode_cabang', 'status'] },
    { name: 'Pengguna', headers: ['user_id', 'username', 'password', 'nama', 'role', 'kode_cabang', 'status', 'email'] },
    { name: 'Kendaraan', headers: ['vehicle_id', 'plat_nomor', 'nama_kendaraan', 'jenis_kendaraan', 'merk', 'model', 'kapasitas_tangki', 'jumlah_bar', 'standar_km_l', 'kode_cabang', 'status', 'jenis_indikator', 'tanggal_pajak', 'tanggal_pajak_5_tahunan', 'tanggal_kir'] },
    { name: 'Penggunaan_BBM', headers: ['transaction_id', 'timestamp', 'tanggal', 'user_id', 'nama_pengguna', 'kode_cabang', 'vehicle_id', 'plat_nomor', 'foto_km_awal', 'ocr_km_awal', 'km_awal_confirmed', 'bar_awal', 'foto_km_akhir', 'ocr_km_akhir', 'km_akhir_confirmed', 'bar_akhir', 'km_tempuh', 'perubahan_bar', 'liter_bbm', 'biaya_bbm', 'foto_struk_bbm', 'biaya_toll', 'foto_struk_toll', 'km_per_liter', 'status', 'warning', 'nama_supir', 'metode_pembayaran', 'flazz_card_id', 'foto_indikator', 'level_bbm', 'confidence_bbm', 'level_status', 'keterangan', 'km_sumber', 'metode_toll', 'flazz_card_id_toll'] },
    { name: 'Pengisian_BBM', headers: ['fuel_id', 'timestamp', 'tanggal', 'vehicle_id', 'plat_nomor', 'user_id', 'km', 'jenis_bbm', 'liter', 'harga_per_liter', 'total_biaya', 'nama_spbu', 'foto_struk', 'status'] },
    { name: 'Foto_Evidence', headers: ['evidence_id', 'transaction_id', 'tipe_foto', 'file_url', 'file_id', 'timestamp'] },
    { name: 'Audit_Log', headers: ['log_id', 'timestamp', 'user_id', 'username', 'action', 'modul', 'keterangan', 'data_sebelum', 'data_sesudah'] },
    { name: 'Konfigurasi', headers: ['key', 'value', 'keterangan'] },
    { name: 'Dashboard', headers: ['cabang', 'periode', 'total_transaksi', 'total_liter', 'total_biaya_bbm', 'total_toll', 'updated_at'] },
    { name: 'Pengaturan', headers: ['key', 'value', 'updated_at'] },
    // --- FLAZZ MODULE SHEETS ---
    { name: 'Flazz_Card', headers: ['id', 'card_number', 'card_name', 'card_type', 'card_role', 'branch_id', 'driver_id', 'default_driver_id', 'last_balance', 'status', 'notes', 'created_at', 'updated_at'] },
    { name: 'Flazz_Usage', headers: ['id', 'date', 'card_id', 'driver_id', 'vehicle_id', 'usage_type', 'primary_card_id', 'backup_card_id', 'reason', 'opening_balance', 'used_at', 'returned_at', 'status', 'created_by', 'created_at', 'ref_type', 'ref_id'] },
    { name: 'Flazz_TopUp', headers: ['id', 'date', 'card_id', 'amount', 'evidence_url', 'notes', 'created_by', 'created_at', 'is_deleted'] },
    { name: 'Flazz_Tol', headers: ['id', 'date', 'card_id', 'driver_id', 'vehicle_id', 'amount', 'evidence_url', 'notes', 'created_by', 'created_at', 'is_deleted'] },
    { name: 'Flazz_Reconciliation', headers: ['id', 'date', 'card_id', 'driver_id', 'vehicle_id', 'opening_balance', 'total_topup', 'total_bbm_flazz', 'total_tol', 'total_expense', 'flazz_balance', 'actual_balance', 'difference', 'reconciliation_status', 'notes', 'reconciled_by', 'reconciled_at', 'is_deleted'] },
    { name: 'Jalur_Pengiriman', headers: ['id', 'tanggal', 'driver_id', 'nama_driver', 'driver2_id', 'nama_driver2', 'vehicle_id', 'plat_nomor', 'nama_kendaraan', 'jenis_kendaraan', 'rute_tujuan', 'kode_cabang', 'flazz_card_id', 'flazz_card_name', 'created_by', 'created_at', 'updated_at', 'is_deleted', 'status', 'laporan_id'] }
];

function setupDatabase() {
  const ss = getDB();

  if (!ss) {
    Logger.log('Spreadsheet tidak ditemukan!');
    return;
  }
  Logger.log('Menggunakan spreadsheet terikat: ' + ss.getUrl());

  DATABASE_SCHEMA.forEach(sheetInfo => {
    let sheet = ss.getSheetByName(sheetInfo.name);
    if (!sheet) {
      sheet = ss.insertSheet(sheetInfo.name);
    }
    // Set headers
    if (sheet.getLastRow() === 0 && sheetInfo.headers.length > 0) {
      sheet.getRange(1, 1, 1, sheetInfo.headers.length).setValues([sheetInfo.headers]);
      sheet.getRange(1, 1, 1, sheetInfo.headers.length).setFontWeight('bold').setBackground('#f3f3f3');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() > 0 && sheetInfo.headers.length > 0) {
      // Migrasi aman: tambahkan kolom baru (yang belum ada) di ujung kanan, tanpa menggeser data lama
      const lastCol = sheet.getLastColumn();
      const current = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      const currentSet = {};
      current.forEach((h, i) => { if (h !== '') currentSet[String(h)] = i + 1; });
      let colIndex = lastCol;
      sheetInfo.headers.forEach(h => {
        if (h === '') return;
        if (currentSet[String(h)] === undefined) {
          colIndex += 1;
          sheet.getRange(1, colIndex).setValues([[h]]);
          sheet.getRange(1, colIndex).setFontWeight('bold').setBackground('#f3f3f3');
        }
      });
    }
  });

  // Backfill default_driver_id pada Flazz_Card (kartu yang tidak sedang digunakan)
  const fCard = ss.getSheetByName('Flazz_Card');
  if (fCard && fCard.getLastRow() > 1) {
    const fData = fCard.getDataRange().getValues();
    const fH = fData[0];
    const iDefault = fH.indexOf('default_driver_id');
    const iDriver = fH.indexOf('driver_id');
    const iStatus = fH.indexOf('status');
    if (iDefault > -1 && iDriver > -1 && iStatus > -1) {
      for (let i = 1; i < fData.length; i++) {
        if (String(fData[i][iDefault] || '') === '' && String(fData[i][iStatus]) !== 'SEDANG_DIGUNAKAN') {
          fCard.getRange(i + 1, iDefault + 1).setValue(fData[i][iDriver] || '');
        }
      }
    }
  }

  var pengaturanSheet = ss.getSheetByName('Pengaturan');
  if (pengaturanSheet && pengaturanSheet.getLastRow() === 1) {
    pengaturanSheet.appendRow(['logo_url', '', new Date()]);
    pengaturanSheet.appendRow(['app_name', 'Monitoring BBM Operasional', new Date()]);
    pengaturanSheet.appendRow(['company_name', '', new Date()]);
    pengaturanSheet.appendRow(['footer_text', '© 2026 Tridaya Sinergi Indonesia', new Date()]);
  }

  Logger.log('Setup database selesai.');
}

function ensureAuditLogColumns() {
  const HEADERS = ['log_id', 'timestamp', 'user_id', 'username', 'action', 'modul', 'keterangan', 'data_sebelum', 'data_sesudah'];
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Audit_Log');
    if (!sheet) return;
    const lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
    const headers = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    const current = String(headers[3] || '').trim().toLowerCase();
    if (current === 'username') return;
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f3f3f3');
    sheet.setFrozenRows(1);
  } catch (e) {
    console.error('ensureAuditLogColumns gagal: ' + e);
  }
}

function seedDummyData() {
  const ss = getDB();
  
  // Seed BBM
  let sheetBBM = ss.getSheetByName('BBM');
  if (sheetBBM && sheetBBM.getLastRow() === 1) {
    sheetBBM.appendRow(['BBM-001', 'Solar', 6800, '', 'Aktif']);
    sheetBBM.appendRow(['BBM-002', 'Pertalite', 10000, '', 'Aktif']);
    sheetBBM.appendRow(['BBM-003', 'Pertamax', 12950, '', 'Aktif']);
  }
  
  // Seed Cabang
  let sheetCabang = ss.getSheetByName('Cabang');
  if (sheetCabang && sheetCabang.getLastRow() === 1) {
    sheetCabang.appendRow(['CBG-JKT', 'Cabang Jakarta Pusat', 'Jakarta', 'Aktif']);
    sheetCabang.appendRow(['CBG-BDG', 'Cabang Bandung', 'Bandung', 'Aktif']);
  }
  
  // Seed Supir
  let sheetSupir = ss.getSheetByName('Supir');
  if (sheetSupir && sheetSupir.getLastRow() === 1) {
    sheetSupir.appendRow(['DRV-001', 'Budi Santoso', 'CBG-JKT', 'Aktif']);
    sheetSupir.appendRow(['DRV-002', 'Andi Firmansyah', 'CBG-JKT', 'Aktif']);
    sheetSupir.appendRow(['DRV-003', 'Asep Kusnandar', 'CBG-BDG', 'Aktif']);
  }
  
  // Seed Kendaraan
  let sheetKendaraan = ss.getSheetByName('Kendaraan');
  if (sheetKendaraan && sheetKendaraan.getLastRow() === 1) { 
    sheetKendaraan.appendRow(['V-001', 'B 1234 CD', 'Avanza Operasional', 'Mobil', 'Toyota', 'Avanza', 45, 8, 12, 'CBG-JKT', 'Aktif', 'DIGITAL_BAR', '2026-09-15']);
    sheetKendaraan.appendRow(['V-002', 'B 5678 EF', 'Innova Operasional', 'Mobil', 'Toyota', 'Innova', 55, 8, 10, 'CBG-BDG', 'Aktif', 'DIGITAL_BAR', '2026-11-01']);
  }
  
  // Seed Pengguna: PIC per cabang (SUPERADMIN dibuat manual via createSuperadmin())
  let sheetPengguna = ss.getSheetByName('Pengguna');
  if (sheetPengguna && sheetPengguna.getLastRow() === 1) {
    sheetPengguna.appendRow(['U-002', 'picjkt', hashPassword('pic123'), 'PIC Jakarta', 'PIC CABANG', 'CBG-JKT', 'Aktif']);
    sheetPengguna.appendRow(['U-003', 'picbdg', hashPassword('pic123'), 'PIC Bandung', 'PIC CABANG', 'CBG-BDG', 'Aktif']);
  }
  
  Logger.log('Data dummy (Cabang, Kendaraan, Pengguna) berhasil dimasukkan.');
}

function DatabaseGetAppSettings() {
  var ss = getDB();
  var sheet = ss.getSheetByName('Pengaturan');

  if (!sheet) {
  return {
    logo_url: '',
    app_name: 'Monitoring BBM Operasional',
    company_name: '',
    footer_text: '© 2026 Tridaya Sinergi Indonesia'
  };
  }

  var data = sheet.getDataRange().getValues();
  var settings = {};

  for (var i = 1; i < data.length; i++) {
    settings[data[i][0]] = data[i][1];
  }

  return {
    logo_url: settings.logo_url || '',
    app_name: settings.app_name || 'Monitoring BBM Operasional',
    company_name: settings.company_name || '',
    footer_text: settings.footer_text || '© 2026 Tridaya Sinergi Indonesia'
  };
}

function DatabaseSaveAppSettings(data) {
  var ss = getDB();
  var sheet = ss.getSheetByName('Pengaturan');

  if (!sheet) {
    return { success: false, msg: 'Sheet Pengaturan tidak ditemukan' };
  }

  var updates = {
    'logo_url': data.logo_url || '',
    'app_name': data.app_name || 'Monitoring BBM Operasional',
    'company_name': data.company_name || '',
    'footer_text': data.footer_text || ''
  };

  var range = sheet.getDataRange();
  var values = range.getValues();

  for (var key in updates) {
    var found = false;
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(updates[key]);
        sheet.getRange(i + 1, 3).setValue(new Date());
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, updates[key], new Date()]);
    }
  }

  return { success: true, msg: 'Pengaturan berhasil disimpan' };
}

function DatabaseUploadLogo(base64Data, fileName) {
  try {
    var data = base64Data.split(',')[1];
    if (!data) throw new Error('Data base64 tidak valid');
    var bytes = Utilities.base64Decode(data);
    if (bytes.length > 10 * 1024 * 1024) throw new Error('Ukuran file melebihi 10MB');
    var blob = Utilities.newBlob(bytes, 'image/png', fileName);

    var folder = DriveApp.getFoldersByName('BBM_Logos');
    if (!folder.hasNext()) {
      folder = DriveApp.createFolder('BBM_Logos');
    } else {
      folder = folder.next();
    }

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();

    DatabaseSaveAppSettings({ logo_url: fileUrl });

    return { success: true, url: fileUrl };
  } catch (e) {
    return { success: false, msg: 'Gagal upload logo: ' + e.toString() };
  }
}

function createSuperadmin() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Buat Superadmin', 'Username SUPERADMIN (mis. snd):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return { success: false, msg: 'Dibatalkan' };
  const username = String(resp.getResponseText() || '').trim();
  const pwResp = ui.prompt('Buat Superadmin', 'Password untuk "' + username + '" (min 8 karakter):', ui.ButtonSet.OK_CANCEL);
  if (pwResp.getSelectedButton() !== ui.Button.OK) return { success: false, msg: 'Dibatalkan' };
  const password = String(pwResp.getResponseText() || '');
  if (!username || password.length < 8) {
    Logger.log('Username kosong atau password < 8 karakter. Ulangi createSuperadmin().');
    return { success: false, msg: 'Username kosong atau password < 8 karakter' };
  }
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const id = 'U-' + new Date().getTime();
  sheet.appendRow([id, username, hashPassword(password), 'Superadmin', 'SUPERADMIN', '', 'Aktif']);
  Logger.log('SUPERADMIN "' + username + '" berhasil dibuat.');
  return { success: true, msg: 'SUPERADMIN dibuat' };
}

