function setupDatabase() {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  
  if (!ss) {
    Logger.log('Spreadsheet tidak ditemukan!');
    return;
  }
  Logger.log('Menggunakan spreadsheet terikat: ' + ss.getUrl());

  const sheets = [
    { name: 'Cabang', headers: ['kode_cabang', 'nama_cabang', 'lokasi', 'status'] },
    { name: 'Supir', headers: ['supir_id', 'nama_supir', 'kode_cabang', 'status'] },
    { name: 'BBM', headers: ['bbm_id', 'jenis_bbm', 'harga_per_liter', 'status'] },
    { name: 'Pengguna', headers: ['user_id', 'username', 'password', 'nama', 'role', 'kode_cabang', 'status'] },
    { name: 'Kendaraan', headers: ['vehicle_id', 'plat_nomor', 'nama_kendaraan', 'jenis_kendaraan', 'merk', 'model', 'kapasitas_tangki', 'jumlah_bar', 'standar_km_l', 'kode_cabang', 'status'] },
    { name: 'Penggunaan_BBM', headers: ['transaction_id', 'timestamp', 'tanggal', 'user_id', 'nama_pengguna', 'kode_cabang', 'vehicle_id', 'plat_nomor', 'foto_km_awal', 'ocr_km_awal', 'km_awal_confirmed', 'bar_awal', 'foto_km_akhir', 'ocr_km_akhir', 'km_akhir_confirmed', 'bar_akhir', 'km_tempuh', 'perubahan_bar', 'liter_bbm', 'biaya_bbm', 'foto_struk_bbm', 'biaya_toll', 'foto_struk_toll', 'km_per_liter', 'status', 'warning', 'nama_supir'] },
    { name: 'Pengisian_BBM', headers: ['fuel_id', 'timestamp', 'tanggal', 'vehicle_id', 'plat_nomor', 'user_id', 'km', 'jenis_bbm', 'liter', 'harga_per_liter', 'total_biaya', 'nama_spbu', 'foto_struk', 'status'] },
    { name: 'Foto_Evidence', headers: ['evidence_id', 'transaction_id', 'tipe_foto', 'file_url', 'file_id', 'timestamp'] },
    { name: 'Audit_Log', headers: ['log_id', 'timestamp', 'user_id', 'action', 'modul', 'keterangan', 'data_sebelum', 'data_sesudah'] },
    { name: 'Konfigurasi', headers: ['key', 'value', 'keterangan'] },
    { name: 'Dashboard', headers: ['Metrics', 'Value'] }
  ];

  sheets.forEach(sheetInfo => {
    let sheet = ss.getSheetByName(sheetInfo.name);
    if (!sheet) {
      sheet = ss.insertSheet(sheetInfo.name);
    }
    // Set headers
    if (sheet.getLastRow() === 0 && sheetInfo.headers.length > 0) {
      sheet.getRange(1, 1, 1, sheetInfo.headers.length).setValues([sheetInfo.headers]);
      sheet.getRange(1, 1, 1, sheetInfo.headers.length).setFontWeight('bold').setBackground('#f3f3f3');
      sheet.setFrozenRows(1);
    }
  });

  Logger.log('Setup database selesai.');
}

function seedDummyData() {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  
  // Seed BBM
  let sheetBBM = ss.getSheetByName('BBM');
  if (sheetBBM && sheetBBM.getLastRow() === 1) {
    sheetBBM.appendRow(['BBM-001', 'Solar', 6800, 'Aktif']);
    sheetBBM.appendRow(['BBM-002', 'Pertalite', 10000, 'Aktif']);
    sheetBBM.appendRow(['BBM-003', 'Pertamax', 12950, 'Aktif']);
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
    sheetKendaraan.appendRow(['V-001', 'B 1234 CD', 'Avanza Operasional', 'Mobil', 'Toyota', 'Avanza', 45, 8, 12, 'CBG-JKT', 'Aktif']);
    sheetKendaraan.appendRow(['V-002', 'B 5678 EF', 'Innova Operasional', 'Mobil', 'Toyota', 'Innova', 55, 8, 10, 'CBG-BDG', 'Aktif']);
  }
  
  // Seed Pengguna
  let sheetPengguna = ss.getSheetByName('Pengguna');
  if (sheetPengguna && sheetPengguna.getLastRow() === 1) {
    sheetPengguna.appendRow(['U-001', 'admin', 'admin123', 'Admin Utama', 'SUPERADMIN', 'CBG-JKT', 'Aktif']);
    sheetPengguna.appendRow(['U-002', 'picjkt', 'pic123', 'PIC Jakarta', 'PIC CABANG', 'CBG-JKT', 'Aktif']);
    sheetPengguna.appendRow(['U-003', 'picbdg', 'pic123', 'PIC Bandung', 'PIC CABANG', 'CBG-BDG', 'Aktif']);
  }
  
  Logger.log('Data dummy (Cabang, Kendaraan, Pengguna) berhasil dimasukkan.');
}

