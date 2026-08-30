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
  const headers = data[0];
  const ci = {};
  headers.forEach((h, i) => { ci[String(h)] = i; });
  const iStatus = ci['status'];
  const iCabang = ci['kode_cabang'];
  const activeVehicles = [];

  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    if (iStatus !== undefined && String(row[iStatus]) === 'Aktif') {
      // Filter cabang jika role bukan SUPERADMIN
      if (role !== 'SUPERADMIN' && iCabang !== undefined && row[iCabang] !== userCabang) continue;

      activeVehicles.push({
        vehicle_id: row[ci['vehicle_id']],
        plat_nomor: row[ci['plat_nomor']],
        nama: row[ci['nama_kendaraan']],
        jenis: (ci['jenis_kendaraan'] !== undefined && row[ci['jenis_kendaraan']]) || 'Mobil',
        merk: row[ci['merk']],
        model: row[ci['model']],
        kapasitas_tangki: row[ci['kapasitas_tangki']],
        jumlah_bar: row[ci['jumlah_bar']],
        standar_km_l: row[ci['standar_km_l']],
        cabang: row[ci['kode_cabang']],
        jenis_indikator: (ci['jenis_indikator'] !== undefined && row[ci['jenis_indikator']]) || 'DIGITAL_BAR',
        tanggal_pajak: (ci['tanggal_pajak'] !== undefined) ? row[ci['tanggal_pajak']] : ''
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

  let userName = payload.userInfo.nama || payload.userInfo.username;

  let platNomor = 'PLAT-UNKNOWN';
  let trxCabang = payload.userInfo.cabang;
  let kapasitas = 0, jumlahBar = 0;
  const kendaraanSheet = ss.getSheetByName('Kendaraan');
  if (kendaraanSheet) {
    const kendaraanData = kendaraanSheet.getDataRange().getValues();
    for (let i = 1; i < kendaraanData.length; i++) {
      if (kendaraanData[i][0] === payload.vehicle_id) {
        platNomor = kendaraanData[i][1];
        trxCabang = kendaraanData[i][9] || trxCabang;
        kapasitas = parseFloat(kendaraanData[i][6]) || 0;
        jumlahBar = parseFloat(kendaraanData[i][7]) || 0;
        break;
      }
    }
  }

  let literPerBar = (kapasitas > 0 && jumlahBar > 0) ? (kapasitas / jumlahBar) : 0;
  let barAwal = parseFloat(payload.bar_awal) || 0;
  let barAkhir = parseFloat(payload.bar_akhir) || 0;
  let literKonsumsi = liter + ((barAwal - barAkhir) * literPerBar);
  if (literKonsumsi <= 0) literKonsumsi = liter;
  let efisiensi = literKonsumsi > 0 ? (km_tempuh / literKonsumsi).toFixed(2) : '';

  let warning = '';
  const prevTrx = getLastTransactionForVehicle(payload.vehicle_id);
  if (prevTrx && prevTrx.km_akhir !== null && km_awal !== prevTrx.km_akhir) {
    warning = buildOdoWarning(km_awal, prevTrx.km_akhir, prevTrx.tanggal);
  }

  let row = [
    transaction_id, new Date(), payload.tanggal, payload.userInfo.username, userName, trxCabang, payload.vehicle_id, platNomor,
    payload.serverData.files.odo_awal, payload.serverData.km_awal, km_awal, payload.bar_awal,
    payload.serverData.files.odo_akhir, payload.serverData.km_akhir, km_akhir, payload.bar_akhir,
    km_tempuh, (payload.bar_awal - payload.bar_akhir), liter, payload.biaya_bbm,
    payload.serverData.files.struk_bbm || '', 0, '',
    efisiensi, 'COMPLETED', warning, payload.nama_supir,
    payload.metode_pembayaran || 'TUNAI', payload.flazz_card_id || '',
    (payload.serverData && payload.serverData.files && payload.serverData.files.indikator) || '',
    payload.level_bbm || '', payload.confidence_bbm || '',
    (payload.serverData && payload.serverData.level_status) || (payload.level_bbm ? 'SUCCESS' : ''),
    payload.keterangan || ''
  ];
  sheet.appendRow(row);
  
  // Jika menggunakan Flazz, potong saldo dan catat log
  if (payload.metode_pembayaran === 'FLAZZ' && payload.flazz_card_id && parseFloat(payload.biaya_bbm) > 0) {
    try {
       // Logika pemotongan Flazz akan didelegasikan ke FlazzOps
       // Jika FlazzOps.js di-load, panggil pengurangan saldo
       if (typeof recordFlazzExpense === 'function') {
           recordFlazzExpense(payload.flazz_card_id, 'BBM', parseFloat(payload.biaya_bbm), payload.serverData.files.struk_bbm, payload.tanggal);
       }
    } catch (e) {
       Logger.log("Gagal memotong saldo flazz: " + e.toString());
    }
  }
  
  return { success: true };
}

function getLastTransactionForVehicle(vehicleId) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][6] === vehicleId) { // vehicle_id = kolom index 6
      const v = parseFloat(data[i][14]); // km_akhir_confirmed = index 14
      return {
        km_akhir: isNaN(v) ? null : v,
        tanggal: data[i][2]                // tanggal = index 2
      };
    }
  }
  return null;
}

function buildOdoWarning(kmAwalBaru, prevKmAkhir, prevTanggal) {
  const selisih = kmAwalBaru - prevKmAkhir;
  const tgl = prevTanggal instanceof Date
    ? prevTanggal.toLocaleDateString('id-ID')
    : String(prevTanggal || '-');
  return 'SELISIH ODO: KM akhir terakhir ' + prevKmAkhir.toLocaleString('id-ID') +
    ' (' + tgl + '), KM awal ' + kmAwalBaru.toLocaleString('id-ID') +
    ', selisih ' + selisih.toLocaleString('id-ID') +
    ' KM - indikasi pemakaian di luar jam kerja';
}

function driveThumbnail(url) {
  if (!url) return '';
  const m = String(url).match(/[-\w]{25,}/);
  return m ? 'https://drive.google.com/thumbnail?id=' + m[0] + '&sz=w200' : '';
}

function hitungEfisiensi7Riwayat(rowsKendaraan, tanggalD, literPerBar) {
  const d = new Date(tanggalD);
  if (isNaN(d.getTime())) return { efisiensi: '', label: '', isDataCukup: false };
  const dWaktu = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  let validRows = rowsKendaraan.filter(function (r) {
    const t = new Date(r[2]); // tanggal index 2
    if (isNaN(t.getTime())) return false;
    const hari = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    return hari <= dWaktu;
  });

  validRows.sort(function (a, b) {
    const tA = new Date(a[2]).getTime();
    const tB = new Date(b[2]).getTime();
    return tB - tA; // descending, newest first
  });

  let recentRows = validRows.slice(0, 7);
  let isDataCukup = recentRows.length >= 7;

  let totalKm = 0;
  let totalLiter = 0;
  recentRows.forEach(function (r) {
    totalKm += parseFloat(r[16]) || 0; // km_tempuh index 16
    const literBeli = parseFloat(r[18]) || 0; // liter_bbm index 18
    const barA = parseFloat(r[11]) || 0;      // bar_awal index 11
    const barK = parseFloat(r[15]) || 0;      // bar_akhir index 15
    let literKonsumsi = literBeli + ((barA - barK) * literPerBar);
    if (literKonsumsi <= 0) literKonsumsi = literBeli;
    totalLiter += literKonsumsi;
  });

  const efisiensi = (totalLiter > 0 && totalKm > 0) ? (totalKm / totalLiter).toFixed(2) : '';
  const label = efisiensi ? 'Rata-rata 7 Trip' : '';
  return { efisiensi: efisiensi, label: label, isDataCukup: isDataCukup };
}

function getRecentTransactions(role, userCabang) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();

  let kendaraanMap = {};
  const kendaraanSheet = ss.getSheetByName('Kendaraan');
  if (kendaraanSheet) {
    const kd = kendaraanSheet.getDataRange().getValues();
    for (let i = 1; i < kd.length; i++) {
      kendaraanMap[kd[i][0]] = {
        kapasitas: parseFloat(kd[i][6]) || 0,
        jumlah_bar: parseFloat(kd[i][7]) || 0,
        standar: parseFloat(kd[i][8]) || 0
      };
    }
  }

  let cabangNamaMap = {};
  const cabangSheet = ss.getSheetByName('Cabang');
  if (cabangSheet) {
    const cd = cabangSheet.getDataRange().getValues();
    for (let i = 1; i < cd.length; i++) {
      cabangNamaMap[cd[i][0]] = cd[i][1];
    }
  }

  let transaksiMap = {};
  for (let i = 1; i < data.length; i++) {
    const vid = data[i][6]; // vehicle_id index 6
    if (!vid) continue;
    if (!transaksiMap[vid]) transaksiMap[vid] = [];
    transaksiMap[vid].push(data[i]);
  }

  const result = [];
  
  let start = data.length > 100 ? data.length - 100 : 1;
  for (let i = data.length - 1; i >= start; i--) {
    let row = data[i];
    if (role !== 'SUPERADMIN' && row[5] !== userCabang) continue;
    
    let literBeli = parseFloat(row[18]) || 0;
    let k = kendaraanMap[row[6]] || {};
    let literPerBar = (k.kapasitas > 0 && k.jumlah_bar > 0) ? (k.kapasitas / k.jumlah_bar) : 0;
    let barAwal = parseFloat(row[11]) || 0;
    let barAkhir = parseFloat(row[15]) || 0;
    let literKonsumsi = literBeli + ((barAwal - barAkhir) * literPerBar);
    if (literKonsumsi <= 0) literKonsumsi = literBeli;
    
    let kmTempuh = parseFloat(row[16]) || 0;

    let roll = hitungEfisiensi7Riwayat(transaksiMap[row[6]] || [row], row[2], literPerBar);
    let efisiensi = roll.efisiensi;

    let statusEfisiensi = '';
    let efisiensiVal = parseFloat(efisiensi);
    
    if (!roll.isDataCukup) {
      statusEfisiensi = 'Data Belum Cukup';
      efisiensi = ''; // Kosongkan angka efisiensi agar tidak muncul
      roll.label = ''; // Kosongkan label agar tidak muncul
    } else if (efisiensiVal > 0 && k.standar > 0) {
      if (efisiensiVal < k.standar) {
        statusEfisiensi = 'Di bawah standar';
      } else if (efisiensiVal <= k.standar * 1.3) {
        statusEfisiensi = 'Sesuai standar';
      } else {
        statusEfisiensi = 'Di atas standar';
      }
    }
    
    result.push({
      tanggal: new Date(row[2]).toLocaleDateString('id-ID'),
      timestamp: new Date(row[2]).getTime(),
      user: row[4], 
      cabang: cabangNamaMap[row[5]] || row[5], 
      vehicle: row[7],
      km_tempuh: kmTempuh, 
      isi_bbm: parseFloat(row[18]) || 0,
      liter: Math.round(literKonsumsi * 100) / 100, 
      toll: row[21], 
      efisiensi: efisiensi, 
      status_efisiensi: statusEfisiensi,
      efisiensi_label: roll.label,
      warning: row[25] || '',
      supir: row[26] || '-',
      transaction_id: row[0],
      biaya_bbm: parseFloat(row[19]) || 0,
      metode_pembayaran: row[27] || 'TUNAI',
      flazz_card_id: row[28] || '',
      foto_odo_awal: row[8],
      foto_odo_akhir: row[12],
      foto_odo_awal_thumb: driveThumbnail(row[8]),
      foto_odo_akhir_thumb: driveThumbnail(row[12])
    });
  }
  return result;
}

function editDailyTransaction(payload) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) throw new Error('Sheet Penggunaan_BBM tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxTrx = headers.indexOf('transaction_id');
    const idxMetode = headers.indexOf('metode_pembayaran');
    const idxCard = headers.indexOf('flazz_card_id');
    const idxBiaya = headers.indexOf('biaya_bbm');
    const idxNama = headers.indexOf('nama_supir');
    const idxTgl = headers.indexOf('tanggal');

    let rowIndex = -1, oldMetode = '', oldCard = null, oldBiaya = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxTrx]) === String(payload.transaction_id)) {
        rowIndex = i + 1;
        oldMetode = data[i][idxMetode];
        oldCard = data[i][idxCard];
        oldBiaya = parseFloat(data[i][idxBiaya]) || 0;
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Transaksi tidak ditemukan.');

    const newMetode = payload.metode_pembayaran || oldMetode;
    const newCard = payload.flazz_card_id || '';
    const newBiaya = parseFloat(payload.biaya_bbm) || 0;

    sheet.getRange(rowIndex, idxMetode + 1).setValue(newMetode);
    sheet.getRange(rowIndex, idxCard + 1).setValue(newCard);
    sheet.getRange(rowIndex, idxBiaya + 1).setValue(newBiaya);
    if (payload.nama_supir) sheet.getRange(rowIndex, idxNama + 1).setValue(payload.nama_supir);

    const wasFlazz = oldMetode === 'FLAZZ' && oldCard;
    const isFlazz = newMetode === 'FLAZZ' && newCard;
    if (wasFlazz && isFlazz) {
      if (oldCard === newCard) {
        setCardBalance(newCard, (getCardBalance(newCard) || 0) + (oldBiaya - newBiaya));
      } else {
        setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldBiaya);
        setCardBalance(newCard, (getCardBalance(newCard) || 0) - newBiaya);
      }
    } else if (wasFlazz && !isFlazz) {
      setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldBiaya);
    } else if (!wasFlazz && isFlazz) {
      setCardBalance(newCard, (getCardBalance(newCard) || 0) - newBiaya);
    }

    return { success: true, msg: 'Transaksi BBM berhasil diperbarui.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

function deleteDailyTransaction(transactionId) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) throw new Error('Sheet Penggunaan_BBM tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxTrx = headers.indexOf('transaction_id');
    const idxMetode = headers.indexOf('metode_pembayaran');
    const idxCard = headers.indexOf('flazz_card_id');
    const idxBiaya = headers.indexOf('biaya_bbm');

    let rowIndex = -1, isFlazz = false, cardId = null, biaya = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxTrx]) === String(transactionId)) {
        rowIndex = i + 1;
        isFlazz = data[i][idxMetode] === 'FLAZZ';
        cardId = data[i][idxCard];
        biaya = parseFloat(data[i][idxBiaya]) || 0;
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Transaksi tidak ditemukan.');

    sheet.deleteRow(rowIndex);
    if (isFlazz && cardId) {
      setCardBalance(cardId, (getCardBalance(cardId) || 0) + biaya);
    }
    return { success: true, msg: 'Transaksi BBM dihapus.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

function insertCabang(data) {
  const ss = getDB();
  ss.getSheetByName('Cabang').appendRow([data.kode, data.nama, data.lokasi || '', 'Aktif']);
  return { msg: 'Cabang Berhasil Ditambahkan' };
}

function insertKendaraan(data) {
  const ss = getDB();
  let id = 'V-' + new Date().getTime();
  ss.getSheetByName('Kendaraan').appendRow([id, data.plat, data.nama, data.jenis || 'Mobil', data.merk || '', data.model || '', data.kapasitas_tangki || '', data.jumlah_bar || '', data.standar_km_l || '', data.cabang, 'Aktif', data.jenis_indikator || 'DIGITAL_BAR', data.tanggal_pajak || '']);
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
        cabang: row[2],
        default_vehicle_id: row[4] || ''
      });
    }
  }
  return activeDrivers;
}

function insertSupir(data) {
  const ss = getDB();
  let id = 'DRV-' + new Date().getTime();
  ss.getSheetByName('Supir').appendRow([id, data.nama, data.cabang, 'Aktif', data.default_vehicle_id || '']);
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

function updateCabang(data) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Cabang');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == data.edit_id) {
      sheet.getRange(i + 1, 1, 1, 3).setValues([[data.kode, data.nama, data.lokasi || '']]);
      return { msg: 'Cabang Berhasil Diupdate' };
    }
  }
  throw new Error('Cabang tidak ditemukan');
}

function updateKendaraan(data) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Kendaraan');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == data.edit_id) {
      sheet.getRange(i + 1, 2, 1, 9).setValues([[
        data.plat, data.nama, data.jenis || 'Mobil',
        data.merk || '', data.model || '', data.kapasitas_tangki || '',
        data.jumlah_bar || '', data.standar_km_l || '', data.cabang
      ]]);
      sheet.getRange(i + 1, 12).setValue(data.jenis_indikator || 'DIGITAL_BAR');
      const hd = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const iPajak = hd.indexOf('tanggal_pajak');
      if (iPajak > -1) {
        sheet.getRange(i + 1, iPajak + 1).setValue(data.tanggal_pajak || '');
      }
      return { msg: 'Kendaraan Berhasil Diupdate' };
    }
  }
  throw new Error('Kendaraan tidak ditemukan');
}

function updateSupir(data) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Supir');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == data.edit_id) {
      // update nama, cabang, and default_vehicle_id (col 2, 3, 5)
      sheet.getRange(i + 1, 2, 1, 2).setValues([[data.nama, data.cabang]]);
      sheet.getRange(i + 1, 5).setValue(data.default_vehicle_id || '');
      return { msg: 'Supir Berhasil Diupdate' };
    }
  }
  throw new Error('Supir tidak ditemukan');
}

function updateBBM(data) {
  const ss = getDB();
  const sheet = ss.getSheetByName('BBM');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == data.edit_id) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[data.jenis, data.harga]]);
      return { msg: 'BBM Berhasil Diupdate' };
    }
  }
  throw new Error('BBM tidak ditemukan');
}

function insertBBM(data) {
  const ss = getDB();
  let id = 'BBM-' + new Date().getTime();
  ss.getSheetByName('BBM').appendRow([id, data.jenis, data.harga, 'Aktif']);
  return { msg: 'BBM Berhasil Ditambahkan' };
}

function deleteCabangById(kode) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Cabang');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == kode) {
      sheet.deleteRow(i + 1);
      return { msg: 'Cabang Berhasil Dihapus' };
    }
  }
  throw new Error('Cabang tidak ditemukan');
}

function deleteSupirById(id) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Supir');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.deleteRow(i + 1);
      return { msg: 'Supir Berhasil Dihapus' };
    }
  }
  throw new Error('Supir tidak ditemukan');
}

function deleteBBMById(id) {
  const ss = getDB();
  const sheet = ss.getSheetByName('BBM');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.deleteRow(i + 1);
      return { msg: 'BBM Berhasil Dihapus' };
    }
  }
  throw new Error('BBM tidak ditemukan');
}
