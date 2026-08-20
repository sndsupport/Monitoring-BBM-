// Helper untuk mendapatkan Spreadsheet yang digunakan
function getDB() {
  return SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
}

function authenticateUser(username, password) {
  const ss = getDB();
  if (!ss) return { success: false, msg: 'DB Error' };
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) return { success: false, msg: 'Sheet Pengguna Error' };
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === username && data[i][2] === password && data[i][6] === 'Aktif') { 
      return {
        success: true,
        user_id: data[i][0],
        username: data[i][1],
        nama: data[i][3],
        role: data[i][4], 
        cabang: data[i][5] 
      };
    }
  }
  return { success: false, msg: 'Username atau Password salah!' };
}

function getCabangList() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Cabang');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === 'Aktif') {
      list.push({ kode: data[i][0], nama: data[i][1] });
    }
  }
  return list;
}

function getActiveVehicles(role, userCabang) {
  const ss = getDB();
  if (!ss) return [];
  const sheet = ss.getSheetByName('Kendaraan');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const activeVehicles = [];
  
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    if (row[10] === 'Aktif') { // status index 10
      // Filter cabang jika role bukan SUPERADMIN
      if (role !== 'SUPERADMIN' && row[9] !== userCabang) continue;
      
      activeVehicles.push({
        vehicle_id: row[0],
        plat_nomor: row[1],
        nama: row[2],
        merk: row[4],
        model: row[5],
        cabang: row[9]
      });
    }
  }
  return activeVehicles;
}

function saveTransactionEndOfDay(payload) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return { success: false, error: 'Sheet tidak ditemukan.' };

  const transaction_id = 'TRX-' + new Date().getTime();
  let km_awal = parseFloat(payload.km_awal_confirmed) || 0;
  let km_akhir = parseFloat(payload.km_akhir_confirmed) || 0;
  let km_tempuh = km_akhir - km_awal;
  let liter = parseFloat(payload.liter_bbm) || 0;
  let efisiensi = liter > 0 ? (km_tempuh / liter).toFixed(2) : '';
  
  let userName = payload.userInfo.nama || payload.userInfo.username;
  let userCabang = payload.userInfo.cabang;

  let row = [
    transaction_id, new Date(), payload.tanggal, payload.userInfo.username, userName, userCabang, payload.vehicle_id, 'PLAT-UNKNOWN',
    payload.serverData.files.odo_awal, payload.serverData.km_awal, km_awal, payload.bar_awal,
    payload.serverData.files.odo_akhir, payload.serverData.km_akhir, km_akhir, payload.bar_akhir,
    km_tempuh, (payload.bar_awal - payload.bar_akhir), liter, payload.biaya_bbm, 
    payload.serverData.files.struk_bbm || '', payload.biaya_toll, payload.serverData.files.struk_toll || '', 
    efisiensi, 'COMPLETED', '', payload.nama_supir 
  ];
  sheet.appendRow(row);
  return { success: true };
}

function getRecentTransactions(role, userCabang) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const result = [];
  
  let start = data.length > 100 ? data.length - 100 : 1;
  for (let i = data.length - 1; i >= start; i--) {
    let row = data[i];
    if (role !== 'SUPERADMIN' && row[5] !== userCabang) continue;
    
    result.push({
      tanggal: new Date(row[2]).toLocaleDateString('id-ID'),
      user: row[4], 
      cabang: row[5], 
      vehicle: row[6],
      km_tempuh: row[16], 
      liter: row[18], 
      toll: row[21], 
      efisiensi: row[23], 
      supir: row[26] || '-',
      foto_odo_awal: row[8],
      foto_odo_akhir: row[12]
    });
  }
  return result;
}

function insertCabang(data) {
  const ss = getDB();
  ss.getSheetByName('Cabang').appendRow([data.kode, data.nama, data.lokasi || '', 'Aktif']);
  return { msg: 'Cabang Berhasil Ditambahkan' };
}

function insertKendaraan(data) {
  const ss = getDB();
  let id = 'V-' + new Date().getTime();
  ss.getSheetByName('Kendaraan').appendRow([id, data.plat, data.nama, 'Mobil', '', '', '', '', '', data.cabang, 'Aktif']);
  return { msg: 'Kendaraan Berhasil Ditambahkan' };
}

function getActiveDrivers(role, userCabang) {
  const ss = getDB();
  if (!ss) return [];
  const sheet = ss.getSheetByName('Supir');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const activeDrivers = [];
  
  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    if (row[3] === 'Aktif') { // status index 3
      if (role !== 'SUPERADMIN' && row[2] !== userCabang) continue; // kode_cabang index 2
      activeDrivers.push({
        id: row[0],
        nama: row[1],
        cabang: row[2]
      });
    }
  }
  return activeDrivers;
}

function insertSupir(data) {
  const ss = getDB();
  let id = 'DRV-' + new Date().getTime();
  ss.getSheetByName('Supir').appendRow([id, data.nama, data.cabang, 'Aktif']);
  return { msg: 'Supir Berhasil Ditambahkan' };
}

function deleteKendaraanById(vehicleId) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Kendaraan');
  if (!sheet) return { msg: 'Sheet tidak ditemukan' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === vehicleId) {
      sheet.getRange(i + 1, 11).setValue('Non-Aktif');
      return { msg: 'Kendaraan Berhasil Dihapus' };
    }
  }
  return { msg: 'Kendaraan tidak ditemukan' };
}

function getActiveBBM() {
  const ss = getDB();
  const sheet = ss.getSheetByName('BBM');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][3] === 'Aktif') {
      list.push({ id: data[i][0], jenis: data[i][1], harga: data[i][2] });
    }
  }
  return list;
}

function saveMasterBBM(payload) {
  const ss = getDB();
  const sheet = ss.getSheetByName('BBM');
  const newId = 'BBM-' + ('000' + sheet.getLastRow()).slice(-3);
  sheet.appendRow([newId, payload.jenis, payload.harga, 'Aktif']);
  return { success: true, msg: 'BBM Berhasil Ditambahkan!' };
}
