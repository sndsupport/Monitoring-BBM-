// Helper untuk mendapatkan Spreadsheet yang digunakan
function getDB() {
  return SpreadsheetApp.openById(spreadsheetId());
}

function authenticateUser(username, password) {
  const ss = getDB();
  if (!ss) return { success: false, msg: 'DB Error' };
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) return { success: false, msg: 'Sheet Pengguna Error' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase() === String(username).toLowerCase() && data[i][6] === 'Aktif') {
      const stored = String(data[i][2] || '');
      if (hashLooksLegacy(stored)) {
        if (stored === String(password)) {
          // Legacy plaintext: hash & simpan ulang, lalu beri tahu user untuk ganti password
          sheet.getRange(i + 1, 3).setValue(hashPassword(password));
          return {
            success: true,
            must_change: true,
            user_id: data[i][0],
            username: data[i][1],
            nama: data[i][3],
            role: data[i][4],
            cabang: data[i][5]
          };
        }
        continue;
      }
      if (verifyPassword(password, stored)) {
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
        tanggal_pajak: (ci['tanggal_pajak'] !== undefined) ? row[ci['tanggal_pajak']] : '',
        tanggal_pajak_5_tahunan: (ci['tanggal_pajak_5_tahunan'] !== undefined) ? row[ci['tanggal_pajak_5_tahunan']] : '',
        tanggal_kir: (ci['tanggal_kir'] !== undefined) ? row[ci['tanggal_kir']] : ''
      });
    }
  }
  return activeVehicles;
}

function saveTransactionEndOfDay(payload) {
  return withLock('daily-save', function() {
    return saveTransactionEndOfDayUnlocked(payload);
  });
}

function saveTransactionEndOfDayUnlocked(payload) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return { success: false, error: 'Sheet tidak ditemukan.' };
  ensurePenggunaBBMColumns();

  const transaction_id = 'TRX-' + new Date().getTime();
  let km_awal = parseFloat(payload.km_awal_confirmed) || 0;
  let km_akhir = parseFloat(payload.km_akhir_confirmed) || 0;
  let km_tempuh = km_akhir - km_awal;
  let km_sumber = 'AKTUAL';
  let liter = parseFloat(payload.liter_bbm) || 0;

  let userName = payload.userInfo.nama || payload.userInfo.username;

  let platNomor = 'PLAT-UNKNOWN';
  let trxCabang = payload.userInfo.cabang;
  let kapasitas = 0, jumlahBar = 0, standarKmL = 0;
  let isJarum = false;
  const kendaraanSheet = ss.getSheetByName('Kendaraan');
  if (kendaraanSheet) {
    const kendaraanData = kendaraanSheet.getDataRange().getValues();
    for (let i = 1; i < kendaraanData.length; i++) {
      if (kendaraanData[i][0] === payload.vehicle_id) {
        platNomor = kendaraanData[i][1];
        trxCabang = kendaraanData[i][9] || trxCabang;
        kapasitas = parseFloat(kendaraanData[i][6]) || 0;
        jumlahBar = parseFloat(kendaraanData[i][7]) || 0;
        standarKmL = parseFloat(kendaraanData[i][8]) || 0;
        isJarum = String(kendaraanData[i][11]) === 'ANALOG_JARUM';
        break;
      }
    }
  }

  // Indikator jarum: level tangki dicatat sebagai persen (0-100), bukan jumlah bar.
  if (isJarum) jumlahBar = 100;

  let literPerBar = (kapasitas > 0 && jumlahBar > 0) ? (kapasitas / jumlahBar) : 0;
  let barAwal = parseFloat(payload.bar_awal) || 0;
  let barAkhir = parseFloat(payload.bar_akhir) || 0;
  let literKonsumsi = liter + ((barAwal - barAkhir) * literPerBar);
  if (literKonsumsi <= 0) literKonsumsi = liter;

  const prevTrx = getLastTransactionForVehicle(payload.vehicle_id);

  if (payload.km_awal_broken || payload.km_akhir_broken) {
    const estAvailable = standarKmL > 0 && literKonsumsi > 0;
    if (estAvailable) {
      const estKm = Math.round(literKonsumsi * standarKmL);
      if (payload.km_awal_broken && payload.km_akhir_broken) {
        const anchor = (prevTrx && prevTrx.km_akhir !== null && prevTrx.km_akhir > 0) ? prevTrx.km_akhir : 0;
        km_awal = anchor;
        km_akhir = anchor + estKm;
      } else if (payload.km_akhir_broken) {
        km_akhir = km_awal + estKm;
      } else {
        km_awal = km_akhir - estKm;
        if (km_awal < 0) km_awal = 0;
      }
      km_tempuh = estKm;
      km_sumber = 'ESTIMASI';
    } else if (payload.km_tanpa_estimasi) {
      const anchor = (prevTrx && prevTrx.km_akhir !== null && prevTrx.km_akhir > 0) ? prevTrx.km_akhir : 0;
      if (km_awal <= 0) km_awal = anchor;
      if (km_akhir <= 0) km_akhir = anchor;
      km_tempuh = Math.max(0, km_akhir - km_awal);
      km_sumber = 'ESTIMASI';
      payload.keterangan = ((payload.keterangan || '') + ' | KM tidak tercatat (odometer rusak, tanpa data BBM)').trim();
    } else {
      if (standarKmL <= 0) {
        throw new Error('KM tidak terbaca tapi estimasi tidak tersedia: Standar KM/L kendaraan belum diisi di Master Kendaraan. Harap isi dulu atau input KM asli.');
      }
      throw new Error('KM tidak terbaca tapi estimasi tidak tersedia: liter BBM kosong. Pastikan "Ada struk BBM?" = Ya, total biaya terisi, dan Master BBM punya harga per liter. Harap input KM asli jika ingin lanjut.');
    }
  }

  let efisiensi = literKonsumsi > 0 ? (km_tempuh / literKonsumsi).toFixed(2) : '';

  let warning = '';
  if (prevTrx && prevTrx.km_akhir !== null && km_awal !== prevTrx.km_akhir) {
    warning = buildOdoWarning(km_awal, prevTrx.km_akhir, prevTrx.tanggal);
  }

  let row = [
    transaction_id, new Date(), payload.tanggal, payload.userInfo.username, userName, trxCabang, payload.vehicle_id, platNomor,
    payload.serverData.files.odo_awal, payload.serverData.km_awal, km_awal, payload.bar_awal,
    payload.serverData.files.odo_akhir, payload.serverData.km_akhir, km_akhir, payload.bar_akhir,
    km_tempuh, (payload.bar_awal - payload.bar_akhir), liter, payload.biaya_bbm,
    payload.serverData.files.struk_bbm || '',
    parseFloat(payload.biaya_toll) || 0,
    (payload.serverData && payload.serverData.files && payload.serverData.files.struk_toll) || '',
    efisiensi, 'COMPLETED', warning, payload.nama_supir,
    payload.metode_pembayaran || 'TUNAI', payload.flazz_card_id || '',
    (payload.serverData && payload.serverData.files && payload.serverData.files.indikator) || '',
    payload.level_bbm || '', payload.confidence_bbm || '',
    (payload.serverData && payload.serverData.level_status) || (payload.level_bbm ? 'SUCCESS' : ''),
    payload.keterangan || '',
    km_sumber
  ];

  if (isDuplicateTransaction(sheet, payload, row)) {
    return { success: false, error: 'Laporan sudah pernah disimpan. Untuk menghindari data ganda, tidak disimpan ulang. Silakan cek Riwayat Transaksi.' };
  }

  sheet.appendRow(row);
  try { recomputeMonthlySummary(trxCabang, periodKey(payload.tanggal)); } catch (e) { console.error('summary gagal: ' + e); }

  // Jika menggunakan Flazz, potong saldo (BBM + tol) dan catat penyerahan otomatis bila perlu
  if (payload.metode_pembayaran === 'FLAZZ' && payload.flazz_card_id) {
    try {
      const cardId = payload.flazz_card_id;
      const biayaBbm = parseFloat(payload.biaya_bbm) || 0;
      const biayaTol = parseFloat(payload.biaya_toll) || 0;

      // 1. Potong saldo kartu untuk BBM
      if (biayaBbm > 0 && typeof recordFlazzExpense === 'function') {
        recordFlazzExpense(cardId, 'BBM', biayaBbm, payload.serverData.files.struk_bbm, payload.tanggal);
      }
      // 2. Potong saldo kartu untuk tol (dipisah agar rekonsiliasi dapat memisahkan nominal)
      if (biayaTol > 0 && typeof recordFlazzExpense === 'function') {
        const tolFoto = (payload.serverData && payload.serverData.files && payload.serverData.files.struk_toll) || '';
        recordFlazzExpense(cardId, 'TOL', biayaTol, tolFoto, payload.tanggal);
      }

      // 3. Auto-create penyerahan (Flazz_Usage) bila kartu belum sedang digunakan
      autoCreateFlazzUsage(cardId, payload.nama_supir, payload.vehicle_id, 'TRX', transaction_id);
    } catch (e) {
      Logger.log("Gagal memproses flazz: " + e.toString());
    }
  }

  logAudit(payload.userInfo, 'CREATE', 'transaksi', 'TRX ' + transaction_id, null, {
    cabang: trxCabang,
    vehicle: platNomor,
    km_tempuh: km_tempuh,
    liter: liter,
    biaya: payload.biaya_bbm
  });

  return { success: true };
}

// Deteksi laporan ganda (double submit) pada sheet Penggunaan_BBM.
// Membandingkan pasangan kunci (vehicle_id, tanggal, km_awal, km_akhir, liter, biaya_bbm, biaya_toll)
// dengan baris terakhir untuk tanggal yang sama. Jika cocok semua, anggap sebagai duplikat.
function isDuplicateTransaction(sheet, payload, row) {
  try {
    const tanggalQ = String(payload.tanggal);
    const vehicleQ = String(payload.vehicle_id);
    const kmAwalQ = String(payload.km_awal_confirmed || payload.km_awal_val || payload.serverData.km_awal || row[10]);
    const kmAkhirQ = String(payload.km_akhir_confirmed || payload.km_akhir_val || payload.serverData.km_akhir || row[14]);
    const literQ = String(parseFloat(payload.liter_bbm) || 0);
    const bbmQ = String(parseFloat(payload.biaya_bbm) || 0);
    const tolQ = String(parseFloat(payload.biaya_toll) || 0);

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return false;
    const headers = data[0];
    const idxVehicle = headers.indexOf('vehicle_id');
    const idxTanggal = headers.indexOf('tanggal');
    const idxKmAwal = headers.indexOf('km_awal');
    const idxKmAkhir = headers.indexOf('km_akhir');
    const idxLiter = headers.indexOf('liter');
    const idxBbm = headers.indexOf('biaya_bbm');
    const idxTol = headers.indexOf('biaya_toll');

    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][idxVehicle]) === vehicleQ && String(data[i][idxTanggal]) === tanggalQ) {
        const sameKmAwal = (idxKmAwal >= 0) ? String(data[i][idxKmAwal]) === kmAwalQ : false;
        const sameKmAkhir = (idxKmAkhir >= 0) ? String(data[i][idxKmAkhir]) === kmAkhirQ : false;
        const sameLiter = (idxLiter >= 0) ? String(data[i][idxLiter]) === literQ : false;
        const sameBbm = (idxBbm >= 0) ? String(data[i][idxBbm]) === bbmQ : false;
        const sameTol = (idxTol >= 0) ? String(data[i][idxTol]) === tolQ : false;
        if (sameKmAwal && sameKmAkhir && sameLiter && sameBbm && sameTol) {
          return true;
        }
      }
    }
    return false;
  } catch (e) {
    Logger.log('isDuplicateTransaction error: ' + e.toString());
    return false;
  }
}

// Buat catatan penyerahan kartu (Flazz_Usage) otomatis bila kartu belum punya status DIBERIKAN.
// Membantu pengguna yang tidak lagi mengisi halaman "Penggunaan Kartu" secara manual.
function autoCreateFlazzUsage(cardId, driverName, vehicleId, refType, refId) {
  const ss = getDB();
  const usageSheet = ss.getSheetByName('Flazz_Usage');
  const cardSheet = ss.getSheetByName('Flazz_Card');
  if (!usageSheet || !cardSheet) return;
  ensureFlazzUsageRefColumns();

  // Cek apakah kartu sudah punya catatan DIBERIKAN (sedang dipakai)
  const uData = usageSheet.getDataRange().getValues();
  const uHeaders = uData[0];
  const uCard = uHeaders.indexOf('card_id');
  const uStatus = uHeaders.indexOf('status');
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][uCard]) === String(cardId) && (uStatus < 0 || uData[i][uStatus] === 'DIBERIKAN')) {
      return; // sudah digunakan, jangan buat ulang
    }
  }

  const now = new Date();
  const id = 'USE-' + now.getTime();
  const opening = getCardBalance ? (parseFloat(getCardBalance(cardId)) || 0) : 0;

  const usageValues = {
    id: id,
    date: now,
    card_id: cardId,
    driver_id: driverName || '',
    vehicle_id: vehicleId || '',
    usage_type: 'PRIMARY',
    primary_card_id: '',
    backup_card_id: '',
    reason: '',
    opening_balance: opening,
    used_at: now,
    status: 'DIBERIKAN',
    notes: 'Dibuat otomatis dari transaksi BBM',
    created_at: now
  };
  if (refType && refId) {
    usageValues.ref_type = refType;
    usageValues.ref_id = refId;
  }
  appendFlazzRow(usageSheet, usageValues);

  // Update status & pemegang di master
  const found = findFlazzCardRow(cardSheet, cardId);
  if (found) {
    if (found.colIdx.STATUS !== undefined) {
      cardSheet.getRange(found.rowIndex, found.colIdx.STATUS + 1).setValue('SEDANG_DIGUNAKAN');
    }
    if (found.colIdx.DRIVER !== undefined && !found.row[found.colIdx.DRIVER]) {
      cardSheet.getRange(found.rowIndex, found.colIdx.DRIVER + 1).setValue(driverName || '');
    }
    if (found.colIdx.UPDATED !== undefined) {
      cardSheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(now);
    }
  }
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

function hitungEfisiensi7Riwayat(trxs, currIdx, literPerBar) {
  if (!trxs || currIdx < 0) return { efisiensi: '', label: '', isDataCukup: false };
  
  const tripNumber = currIdx + 1;
  // Hanya tampilkan efisiensi setiap kelipatan 7 trip (Trip 7, 14, 21, dst)
  if (tripNumber % 7 !== 0) {
    return { efisiensi: '', label: '', isDataCukup: false };
  }

  let recentRows = trxs.slice(currIdx - 6, currIdx + 1);
  let isDataCukup = recentRows.length === 7;

  let totalKm = 0;
  let totalBeli = 0;
  recentRows.forEach(function (r) {
    totalKm += parseFloat(r[16]) || 0; 
    totalBeli += parseFloat(r[18]) || 0; 
  });
  
  const barAwalPertama = parseFloat(recentRows[0][11]) || 0;
  const barAkhirTerakhir = parseFloat(recentRows[recentRows.length - 1][15]) || 0;

  let totalKonsumsi = totalBeli + ((barAwalPertama - barAkhirTerakhir) * literPerBar);
  if (totalKonsumsi <= 0) totalKonsumsi = totalBeli;

  const efisiensi = (totalKonsumsi > 0 && totalKm > 0) ? (totalKm / totalKonsumsi).toFixed(2) : '';
  const label = efisiensi ? 'Rata-rata 7 Trip' : '';
  
  return { 
    efisiensi: efisiensi, 
    label: label, 
    isDataCukup: isDataCukup,
    total_km: totalKm,
    total_beli: totalBeli,
    total_konsumsi: totalKonsumsi,
    tgl_mulai: recentRows[0][2],
    tgl_selesai: recentRows[recentRows.length - 1][2],
    supir: recentRows[recentRows.length - 1][26] || '-'
  };
}

function getPerformaSummary(role, userCabang) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return [];
  if (role !== 'SUPERADMIN' && !userCabang) return [];
  
  const data = readLastRows(sheet, 5000);

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
  for (let i = 0; i < data.length; i++) {
    const vid = data[i][6];
    if (!vid) continue;
    if (role !== 'SUPERADMIN' && data[i][5] !== userCabang) continue;
    if (!transaksiMap[vid]) transaksiMap[vid] = [];
    transaksiMap[vid].push(data[i]);
  }
  
  for (let vid in transaksiMap) {
    transaksiMap[vid].sort((a, b) => {
      let tA = new Date(a[2]).getTime();
      let tB = new Date(b[2]).getTime();
      if (tA === tB) {
        return new Date(a[1]).getTime() - new Date(b[1]).getTime();
      }
      return tA - tB;
    });
  }

  const result = [];
  
  for (let vid in transaksiMap) {
    const trxs = transaksiMap[vid];
    const k = kendaraanMap[vid] || {};
    let literPerBar = (k.kapasitas > 0 && k.jumlah_bar > 0) ? (k.kapasitas / k.jumlah_bar) : 0;
    
    for (let i = 0; i < trxs.length; i++) {
      let roll = hitungEfisiensi7Riwayat(trxs, i, literPerBar);
      if (roll.isDataCukup) {
        let statusEfisiensi = '';
        let efisiensiVal = parseFloat(roll.efisiensi);
        if (efisiensiVal > 0 && k.standar > 0) {
          if (efisiensiVal < k.standar) statusEfisiensi = 'Di bawah standar';
          else if (efisiensiVal <= k.standar * 1.3) statusEfisiensi = 'Sesuai standar';
          else statusEfisiensi = 'Di atas standar';
        }
        
        const r = trxs[i];
        let tglMulai = new Date(roll.tgl_mulai).toLocaleDateString('id-ID');
        let tglSelesai = new Date(roll.tgl_selesai).toLocaleDateString('id-ID');
        
        result.push({
          periode: tglMulai + ' s/d ' + tglSelesai,
          timestamp: new Date(roll.tgl_selesai).getTime(),
          cabang: cabangNamaMap[r[5]] || r[5],
          vehicle: r[7],
          supir: roll.supir,
          total_km: roll.total_km,
          total_beli: roll.total_beli,
          total_konsumsi: Math.round(roll.total_konsumsi * 100) / 100,
          efisiensi: roll.efisiensi,
          status_efisiensi: statusEfisiensi
        });
      }
    }
  }
  
  result.sort((a, b) => b.timestamp - a.timestamp);
  return result;
}

function getRecentTransactions(role, userCabang) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return [];
  if (role !== 'SUPERADMIN' && !userCabang) return [];
  
  const data = readLastRows(sheet, 2000);

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
  for (let i = 0; i < data.length; i++) {
    const vid = data[i][6]; // vehicle_id index 6
    if (!vid) continue;
    if (!transaksiMap[vid]) transaksiMap[vid] = [];
    transaksiMap[vid].push(data[i]);
  }
  
  // Sort each vehicle's transactions chronologically by date, then timestamp
  for (let vid in transaksiMap) {
    transaksiMap[vid].sort((a, b) => {
      let tA = new Date(a[2]).getTime();
      let tB = new Date(b[2]).getTime();
      if (tA === tB) {
        return new Date(a[1]).getTime() - new Date(b[1]).getTime();
      }
      return tA - tB;
    });
  }

  const result = [];
  
  // We can just iterate the whole data and filter/sort later, or keep the existing reverse loop.
  // Actually, to display globally sorted by date, we should gather all relevant rows first.
  let start = data.length > 200 ? data.length - 200 : 0;
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

    let trxs = transaksiMap[row[6]];
    let currIdx = trxs ? trxs.indexOf(row) : -1;

    let roll = hitungEfisiensi7Riwayat(trxs, currIdx, literPerBar);
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

    // Dynamic warning calculation
    let dynamicWarning = '';
    if (currIdx > 0) {
      let prev = trxs[currIdx - 1];
      let prevKmAkhir = parseFloat(prev[14]);
      let currKmAwal = parseFloat(row[10]);
      if (!isNaN(prevKmAkhir) && !isNaN(currKmAwal) && prevKmAkhir !== currKmAwal) {
        let selisih = currKmAwal - prevKmAkhir;
        let tgl = new Date(prev[2]);
        let tglStr = isNaN(tgl.getTime()) ? String(prev[2] || '-') : tgl.toLocaleDateString('id-ID');
        dynamicWarning = 'SELISIH ODO: KM akhir terakhir ' + prevKmAkhir.toLocaleString('id-ID') +
          ' (' + tglStr + '), KM awal ' + currKmAwal.toLocaleString('id-ID') +
          ', selisih ' + selisih.toLocaleString('id-ID') + ' KM - indikasi pemakaian di luar jam kerja';
      }
    } else if (currIdx === 0 && row[25]) {
       // If it's the first in the current map but had a warning in DB (maybe from before cutoff), use it or clear it.
       // It's better to clear it if we have all data, but getRecentTransactions reads all data anyway.
       dynamicWarning = ''; 
    }
    
    result.push({
      tanggal: new Date(row[2]).toLocaleDateString('id-ID'),
      timestamp: new Date(row[2]).getTime(),
      sub_timestamp: new Date(row[1]).getTime(),
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
      warning: dynamicWarning,
      supir: row[26] || '-',
      transaction_id: row[0],
      biaya_bbm: parseFloat(row[19]) || 0,
      metode_pembayaran: row[27] || 'TUNAI',
      flazz_card_id: row[28] || '',
      km_awal: parseFloat(row[10]) || 0,
      km_akhir: parseFloat(row[14]) || 0,
      km_sumber: row[34] ? String(row[34]) : 'AKTUAL',
      foto_odo_awal: row[8],
      foto_odo_akhir: row[12],
      foto_struk_bbm: row[20],
      foto_struk_toll: row[22],
      foto_indikator: row[29],
      foto_odo_awal_thumb: driveThumbnail(row[8]),
      foto_odo_akhir_thumb: driveThumbnail(row[12]),
      foto_struk_bbm_thumb: driveThumbnail(row[20]),
      foto_struk_toll_thumb: driveThumbnail(row[22]),
      foto_indikator_thumb: driveThumbnail(row[29])
    });
  }
  
  result.sort((a, b) => {
    if (b.timestamp === a.timestamp) {
      return b.sub_timestamp - a.sub_timestamp;
    }
    return b.timestamp - a.timestamp; // descending by date
  });
  
  return result;
}

function editDailyTransaction(payload, userInfo) {
  return withLock('daily-edit', function() {
    return editDailyTransactionUnlocked(payload, userInfo);
  });
}

// Penyerahan kartu otomatis hanya perlu dibuat saat sebuah transaksi menjadi FLAZZ
// (transisi TUNAI/FLAZZ lain -> FLAZZ). Koreksi atas laporan yang SUDAH FLAZZ tidak
// boleh membuat ulang catatan penyerahan: bila kartu sudah dikembalikan (DIKEMBALIKAN),
// status master kartu tidak boleh berubah (mis. menjadi SEDANG_DIGUNAKAN) hanya karena
// laporan diedit (mis. merevisi KM awal / jenis BBM).
function shouldAutoCreateUsageOnEdit(wasFlazz, isFlazz) {
  return !wasFlazz && isFlazz;
}

function editDailyTransactionUnlocked(payload, userInfo) {
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
    const idxToll = headers.indexOf('biaya_toll');
    const idxNama = headers.indexOf('nama_supir');
    const idxKmAwal = headers.indexOf('km_awal_confirmed');
    const idxKmAkhir = headers.indexOf('km_akhir_confirmed');
    const idxKmTempuh = headers.indexOf('km_tempuh');
    const idxTgl = headers.indexOf('tanggal');
    const idxStamp = headers.indexOf('timestamp');
    const idxFotoAwal = headers.indexOf('foto_odo_awal');
    const idxFotoAkhir = headers.indexOf('foto_odo_akhir');
    const idxCabang = headers.indexOf('kode_cabang');

    let rowIndex = -1, oldMetode = '', oldCard = null, oldBiaya = 0, oldToll = 0, vehicleId = '', oldCabang = '', oldTgl = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxTrx]) === String(payload.transaction_id)) {
        rowIndex = i + 1;
        oldMetode = data[i][idxMetode];
        oldCard = data[i][idxCard];
        oldBiaya = parseFloat(data[i][idxBiaya]) || 0;
        oldToll = idxToll > -1 ? (parseFloat(data[i][idxToll]) || 0) : 0;
        vehicleId = headers.indexOf('vehicle_id') > -1 ? String(data[i][headers.indexOf('vehicle_id')] || '') : '';
        oldCabang = idxCabang > -1 ? data[i][idxCabang] : '';
        oldTgl = idxTgl > -1 ? data[i][idxTgl] : '';
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Transaksi tidak ditemukan.');

    assertTransactionAccess(userInfo, oldMetode === 'FLAZZ' ? flazzCardBranch(oldCard) : vehicleBranchById(vehicleId));

    const newMetode = payload.metode_pembayaran || oldMetode;
    const newCard = payload.flazz_card_id || '';
    const newBiaya = parseFloat(payload.biaya_bbm) || 0;
    const newToll = parseFloat(payload.biaya_toll) || 0;

    sheet.getRange(rowIndex, idxMetode + 1).setValue(newMetode);
    sheet.getRange(rowIndex, idxCard + 1).setValue(newCard);
    sheet.getRange(rowIndex, idxBiaya + 1).setValue(newBiaya);
    if (idxToll > -1) sheet.getRange(rowIndex, idxToll + 1).setValue(newToll);
    // Tulis liter_bbm. Pakai lokasi kolom via header bila ditemukan; bila tidak (nama
    // header berbeda di sheet), fallback ke index tetap 18 sesuai skema seluruh codebase
    // (getRecentTransactions/saveTransactionEndOfDay membaca liter_bbm di index 18).
    let idxLiterWrite = headers.indexOf('liter_bbm');
    if (idxLiterWrite < 0) idxLiterWrite = 18;
    if (payload.liter_bbm !== undefined && payload.liter_bbm !== '') {
      sheet.getRange(rowIndex, idxLiterWrite + 1).setValue(parseFloat(payload.liter_bbm) || 0);
    }
    if (payload.nama_supir) sheet.getRange(rowIndex, idxNama + 1).setValue(payload.nama_supir);

    if (payload.km_awal !== undefined) {
      sheet.getRange(rowIndex, idxKmAwal + 1).setValue(parseFloat(payload.km_awal) || 0);
    }
    if (payload.km_akhir !== undefined) {
      sheet.getRange(rowIndex, idxKmAkhir + 1).setValue(parseFloat(payload.km_akhir) || 0);
    }
    
    // Recalculate km_tempuh
    const newKmAwal = payload.km_awal !== undefined ? parseFloat(payload.km_awal) : parseFloat(sheet.getRange(rowIndex, idxKmAwal + 1).getValue());
    const newKmAkhir = payload.km_akhir !== undefined ? parseFloat(payload.km_akhir) : parseFloat(sheet.getRange(rowIndex, idxKmAkhir + 1).getValue());
    sheet.getRange(rowIndex, idxKmTempuh + 1).setValue((newKmAkhir || 0) - (newKmAwal || 0));
    if (payload.km_awal !== undefined || payload.km_akhir !== undefined) {
      const idxSumber = headers.indexOf('km_sumber');
      if (idxSumber > -1) sheet.getRange(rowIndex, idxSumber + 1).setValue('AKTUAL');
    }

    const wasFlazz = oldMetode === 'FLAZZ' && oldCard;
    const isFlazz = newMetode === 'FLAZZ' && newCard;

    const oldTotal = oldBiaya + oldToll;
    const newTotal = newBiaya + newToll;

    // Bila transaksi akhirnya ber-Flazz, perbarui kolom timestamp ke waktu edit ini.
    // Ledger rekonsiliasi memilah transaksi berdasarkan timestamp (> used_at/penyerahan
    // kartu). Tanpa ini, transaksi yang diubah jadi FLAZZ dari data lama (timestamp sebelum
    // penyerahan) dianggap sudah masuk opening_balance sehingga tidak terhitung sebagai
    // pengeluaran, membuat saldo sistem lebih tinggi dari saldo fisik.
    if (isFlazz && idxStamp > -1) {
      sheet.getRange(rowIndex, idxStamp + 1).setValue(new Date());
    }

    if (wasFlazz && isFlazz) {
      if (oldCard === newCard) {
        setCardBalance(newCard, (getCardBalance(newCard) || 0) + (oldTotal - newTotal));
      } else {
        setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldTotal);
        setCardBalance(newCard, (getCardBalance(newCard) || 0) - newTotal);
      }
    } else if (wasFlazz && !isFlazz) {
      setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldTotal);
    } else if (!wasFlazz && isFlazz) {
      setCardBalance(newCard, (getCardBalance(newCard) || 0) - newTotal);
    }

    // Jika transaksi menjadi FLAZZ (baru ber-Flazz, bukan koreksi atas yang sudah FLAZZ),
    // ciptakan penyerahan kartu otomatis bila kartu belum sedang dipakai.
    if (isFlazz && shouldAutoCreateUsageOnEdit(wasFlazz, isFlazz)) {
      try { autoCreateFlazzUsage(newCard, payload.nama_supir || (sheet.getRange(rowIndex, idxNama + 1).getValue()) , '', 'TRX', payload.transaction_id); }
      catch (e) { Logger.log("autoCreateFlazzUsage gagal: " + e.toString()); }
    }

    // Ganti foto odometer awal jika ada file baru
    if (payload.foto_odo_awal && idxFotoAwal > -1) {
      const up = uploadImageToDrive(payload.foto_odo_awal, payload.foto_odo_awal_name || 'odo_awal.jpg', 'KM_Awal', userInfo ? userInfo.cabang : '');
      if (!up.success) return { success: false, msg: 'Upload foto odometer awal gagal: ' + up.error };
      const oldVal = sheet.getRange(rowIndex, idxFotoAwal + 1).getValue();
      const oldId = extractDriveFileId(oldVal);
      if (oldId) deleteDriveFileById(oldId);
      sheet.getRange(rowIndex, idxFotoAwal + 1).setValue(up.fileUrl);
    }
    // Ganti foto odometer akhir jika ada file baru
    if (payload.foto_odo_akhir && idxFotoAkhir > -1) {
      const up = uploadImageToDrive(payload.foto_odo_akhir, payload.foto_odo_akhir_name || 'odo_akhir.jpg', 'KM_Akhir', userInfo ? userInfo.cabang : '');
      if (!up.success) return { success: false, msg: 'Upload foto odometer akhir gagal: ' + up.error };
      const oldVal = sheet.getRange(rowIndex, idxFotoAkhir + 1).getValue();
      const oldId = extractDriveFileId(oldVal);
      if (oldId) deleteDriveFileById(oldId);
      sheet.getRange(rowIndex, idxFotoAkhir + 1).setValue(up.fileUrl);
    }

    const newCabang = oldCabang;
    const newTgl = (payload.tanggal !== undefined && payload.tanggal !== '') ? payload.tanggal : oldTgl;
    try { recomputeMonthlySummary(oldCabang, periodKey(oldTgl)); } catch (e) { console.error('summary gagal: ' + e); }
    try { recomputeMonthlySummary(newCabang, periodKey(newTgl)); } catch (e) { console.error('summary gagal: ' + e); }

    logAudit(userInfo, 'EDIT', 'transaksi', payload.transaction_id,
      { metode_pembayaran: oldMetode, flazz_card_id: oldCard, biaya_bbm: oldBiaya, biaya_toll: oldToll },
      { metode_pembayaran: newMetode, flazz_card_id: newCard, biaya_bbm: newBiaya, biaya_toll: newToll });

    return { success: true, msg: 'Transaksi BBM berhasil diperbarui.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

function deleteDailyTransaction(transactionId, userInfo) {
  return withLock('daily-delete', function() {
    return deleteDailyTransactionUnlocked(transactionId, userInfo);
  });
}

function deleteDailyTransactionUnlocked(transactionId, userInfo) {
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
    const idxToll = headers.indexOf('biaya_toll');
    const idxVehicle = headers.indexOf('vehicle_id');
    const idxTgl = headers.indexOf('tanggal');
    const idxCabang = headers.indexOf('kode_cabang');

    let rowIndex = -1, isFlazz = false, cardId = null, biaya = 0, toll = 0, vehicleId = '', delCabang = '', delTgl = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxTrx]) === String(transactionId)) {
        rowIndex = i + 1;
        isFlazz = data[i][idxMetode] === 'FLAZZ';
        cardId = data[i][idxCard];
        biaya = parseFloat(data[i][idxBiaya]) || 0;
        toll = idxToll > -1 ? (parseFloat(data[i][idxToll]) || 0) : 0;
        vehicleId = idxVehicle > -1 ? String(data[i][idxVehicle] || '') : '';
        delCabang = idxCabang > -1 ? data[i][idxCabang] : '';
        delTgl = idxTgl > -1 ? data[i][idxTgl] : '';
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Transaksi tidak ditemukan.');

    assertTransactionAccess(userInfo, isFlazz ? flazzCardBranch(cardId) : vehicleBranchById(vehicleId));
    sheet.deleteRow(rowIndex);
    if (isFlazz && cardId) {
      setCardBalance(cardId, (getCardBalance(cardId) || 0) + (biaya + toll));
      // Kembalikan penyerahan kartu yang dibuat oleh transaksi ini agar kartu tidak menggantung.
      try { if (typeof returnFlazzUsageForRef === 'function') returnFlazzUsageForRef('TRX', String(transactionId)); }
      catch (e) { Logger.log('returnFlazzUsageForRef gagal: ' + e.toString()); }
    }
    try { recomputeMonthlySummary(delCabang, periodKey(delTgl)); } catch (e) { console.error('summary gagal: ' + e); }

    logAudit(userInfo, 'DELETE', 'transaksi', transactionId, {
      metode_pembayaran: isFlazz ? 'FLAZZ' : '',
      flazz_card_id: cardId,
      biaya_bbm: biaya,
      biaya_toll: toll,
      vehicle_id: vehicleId,
      kode_cabang: delCabang,
      tanggal: delTgl
    }, null);

    return { success: true, msg: 'Transaksi BBM dihapus.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Validasi akses server-side untuk operasi Data Master.
// Hanya SUPERADMIN dan PIC CABANG yang berhak; SUPERADMIN penuh,
// PIC CABANG hanya pada warehouse miliknya. Master cabang/BBM/pengguna
// hanya boleh diakses SUPERADMIN.
function assertMasterAccess(userInfo, action) {
  if (!userInfo || !userInfo.role) throw new Error('Akses ditolak: sesi tidak valid.');
  if (userInfo.role === 'SUPERADMIN') return 'SUPERADMIN';
  if (userInfo.role === 'PIC CABANG') return 'PIC CABANG';
  throw new Error('Akses ditolak: peran tidak dikenali.');
}

function assertSuperadminOnly(userInfo, action) {
  if (assertMasterAccess(userInfo, action) !== 'SUPERADMIN') {
    throw new Error('Akses ditolak: hanya SUPERADMIN yang dapat ' + action + '.');
  }
}

function assertOwnWarehouse(userInfo, cabang) {
  const cabangUser = String(userInfo.cabang || '');
  if (!cabangUser || String(cabang || '') !== cabangUser) {
    throw new Error('Akses ditolak: Anda hanya dapat mengelola data warehouse ' + cabangUser + '.');
  }
}

// Ambil kode cabang dari sebuah kendaraan ('' bila tidak ditemukan)
function vehicleBranchById(vehicleId) {
  if (!vehicleId) return '';
  const ss = getDB();
  const sheet = ss.getSheetByName('Kendaraan');
  if (!sheet) return '';
  const data = sheet.getDataRange().getValues();
  const h = data[0];
  const iCabang = h.indexOf('kode_cabang') > -1 ? h.indexOf('kode_cabang') : h.indexOf('cabang');
  const iId = h.indexOf('vehicle_id') > -1 ? h.indexOf('vehicle_id') : h.indexOf('id');
  if (iId < 0 || iCabang < 0) return '';
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][iId]) === String(vehicleId)) return String(data[i][iCabang] || '');
  }
  return '';
}

// Validasi akses transaksi: SUPERADMIN penuh; PIC CABANG hanya pada cabang transaksi.
function assertTransactionAccess(userInfo, branchId) {
  const role = assertMasterAccess(userInfo, 'mengelola transaksi');
  if (role === 'SUPERADMIN') return;
  if (String(branchId || '') !== String(userInfo.cabang || '')) {
    throw new Error('Akses ditolak: Anda hanya dapat mengelola transaksi warehouse ' + userInfo.cabang + '.');
  }
}

function insertCabang(data, userInfo) {
  assertSuperadminOnly(userInfo, 'mengelola master cabang');
  const ss = getDB();
  ss.getSheetByName('Cabang').appendRow([data.kode, data.nama, data.lokasi || '', 'Aktif']);
  logAudit(userInfo, 'CREATE', 'master', 'Cabang ' + data.kode, null, { kode: data.kode, nama: data.nama, lokasi: data.lokasi || '' });
  return { msg: 'Cabang Berhasil Ditambahkan' };
}

function insertKendaraan(data, userInfo) {
  const role = assertMasterAccess(userInfo, 'menambah kendaraan');
  if (role !== 'SUPERADMIN') assertOwnWarehouse(userInfo, data.cabang);
  const ss = getDB();
  let id = 'V-' + new Date().getTime();
  ss.getSheetByName('Kendaraan').appendRow([id, data.plat, data.nama, data.jenis || 'Mobil', data.merk || '', data.model || '', data.kapasitas_tangki || '', data.jumlah_bar || '', data.standar_km_l || '', data.cabang, 'Aktif', data.jenis_indikator || 'DIGITAL_BAR', data.tanggal_pajak || '', data.tanggal_pajak_5_tahunan || '', data.tanggal_kir || '']);
  logAudit(userInfo, 'CREATE', 'master', 'Kendaraan ' + id, null, { vehicle_id: id, plat: data.plat, nama: data.nama, cabang: data.cabang });
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

function insertSupir(data, userInfo) {
  const role = assertMasterAccess(userInfo, 'menambah supir');
  if (role !== 'SUPERADMIN') assertOwnWarehouse(userInfo, data.cabang);
  const ss = getDB();
  let id = 'DRV-' + new Date().getTime();
  ss.getSheetByName('Supir').appendRow([id, data.nama, data.cabang, 'Aktif', data.default_vehicle_id || '']);
  logAudit(userInfo, 'CREATE', 'master', 'Supir ' + id, null, { id: id, nama: data.nama, cabang: data.cabang });
  return { msg: 'Supir Berhasil Ditambahkan' };
}

function deleteKendaraanById(vehicleId, userInfo) {
  const role = assertMasterAccess(userInfo, 'menghapus kendaraan');
  const ss = getDB();
  const sheet = ss.getSheetByName('Kendaraan');
  if (!sheet) return { msg: 'Sheet tidak ditemukan' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === vehicleId) {
      if (role !== 'SUPERADMIN') assertOwnWarehouse(userInfo, data[i][9]);
      sheet.getRange(i + 1, 11).setValue('Non-Aktif');
      logAudit(userInfo, 'DELETE', 'master', 'Kendaraan ' + vehicleId, { plat: data[i][1], nama: data[i][2] }, null);
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
    if (data[i][4] === 'Aktif') {
      list.push({ id: data[i][0], jenis: data[i][1], harga: data[i][2] });
    }
  }
  return list;
}

function getActiveBBMForCabang(cabang) {
  const ss = getDB();
  const sheet = ss.getSheetByName('BBM');
  if (!sheet) return [];
  const h = sheetHeaders(sheet);
  const idx = colIndex(h, ['bbm_id', 'jenis_bbm', 'harga_per_liter', 'kode_cabang', 'status']);
  const rows = readRowsCols(sheet, [idx.bbm_id, idx.jenis_bbm, idx.harga_per_liter, idx.kode_cabang, idx.status]);
  const globals = {};
  const overrides = {};
  rows.forEach(function(r) {
    if (String(r[4] || '') !== 'Aktif') return;
    const item = { bbm_id: r[0], jenis_bbm: r[1], harga_per_liter: parseFloat(r[2]) || 0, kode_cabang: r[3] || '' };
    const key = String(item.bbm_id);
    if (item.kode_cabang) {
      if (String(item.kode_cabang) === String(cabang)) overrides[key] = item;
    } else {
      globals[key] = item;
    }
  });
  const merged = {};
  Object.keys(globals).forEach(function(k) { merged[k] = globals[k]; });
  Object.keys(overrides).forEach(function(k) { merged[k] = overrides[k]; });
  return Object.keys(merged).map(function(k) { return merged[k]; });
}

function updateCabang(data, userInfo) {
  assertSuperadminOnly(userInfo, 'memperbarui master cabang');
  const ss = getDB();
  const sheet = ss.getSheetByName('Cabang');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == data.edit_id) {
      // Kode cabang adalah primary key dan dipakai sebagai referensi lintas sheet.
      // Mengubahnya memerlukan migrasi ke semua sheet anak; untuk saat ini kode tidak boleh diubah.
      if (String(data.kode || '') !== String(data.edit_id || '')) {
        throw new Error('Kode cabang tidak dapat diubah. Hanya nama/lokasi yang boleh diedit.');
      }
      // Cek duplikat: pastikan tidak ada baris lain yang sudah memakai kode yang sama
      for (let j = 1; j < values.length; j++) {
        if (j === i) continue;
        if (String(values[j][0]) === String(data.edit_id)) {
          throw new Error('Kode cabang "' + data.edit_id + '" sudah terpakai oleh baris lain.');
        }
      }
      sheet.getRange(i + 1, 1, 1, 3).setValues([[data.kode, data.nama, data.lokasi || '']]);
      logAudit(userInfo, 'EDIT', 'master', 'Cabang ' + data.edit_id,
        { kode: values[i][0], nama: values[i][1], lokasi: values[i][2] },
        { kode: data.kode, nama: data.nama, lokasi: data.lokasi || '' });
      return { msg: 'Cabang Berhasil Diupdate' };
    }
  }
  throw new Error('Cabang tidak ditemukan');
}

// Cek apakah kode cabang masih dirujuk oleh data pada sheet-sheet lain.
function cabangHasDependencies(ss, kode) {
  const refs = [
    ['Kendaraan', 'kode_cabang'], ['Supir', 'kode_cabang'], ['BBM', 'kode_cabang'],
    ['Pengguna', 'kode_cabang'], ['Penggunaan_BBM', 'kode_cabang'],
    ['Jalur_Pengiriman', 'kode_cabang'], ['Flazz_Card', 'branch_id']
  ];
  const found = [];
  refs.forEach(function(pair) {
    const sheet = ss.getSheetByName(pair[0]);
    if (!sheet || sheet.getLastRow() <= 1) return;
    const data = sheet.getDataRange().getValues();
    const iCol = data[0].indexOf(pair[1]);
    if (iCol < 0) return;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][iCol]) === String(kode)) { found.push(pair[0]); break; }
    }
  });
  return found;
}

function updateKendaraan(data, userInfo) {
  const role = assertMasterAccess(userInfo, 'memperbarui kendaraan');
  const ss = getDB();
  const sheet = ss.getSheetByName('Kendaraan');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == data.edit_id) {
      if (role !== 'SUPERADMIN') {
        assertOwnWarehouse(userInfo, values[i][9]);
        assertOwnWarehouse(userInfo, data.cabang);
      }
      sheet.getRange(i + 1, 2, 1, 9).setValues([[
        data.plat, data.nama, data.jenis || 'Mobil',
        data.merk || '', data.model || '', data.kapasitas_tangki || '',
        data.jumlah_bar || '', data.standar_km_l || '', data.cabang
      ]]);
      sheet.getRange(i + 1, 12).setValue(data.jenis_indikator || 'DIGITAL_BAR');
      const hd = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const iPajak = hd.indexOf('tanggal_pajak');
      if (iPajak > -1) sheet.getRange(i + 1, iPajak + 1).setValue(data.tanggal_pajak || '');
      
      const iPajak5 = hd.indexOf('tanggal_pajak_5_tahunan');
      if (iPajak5 > -1) sheet.getRange(i + 1, iPajak5 + 1).setValue(data.tanggal_pajak_5_tahunan || '');
      
      const iKir = hd.indexOf('tanggal_kir');
      if (iKir > -1) sheet.getRange(i + 1, iKir + 1).setValue(data.tanggal_kir || '');
      
      logAudit(userInfo, 'EDIT', 'master', 'Kendaraan ' + data.edit_id,
        { plat: values[i][1], nama: values[i][2] },
        { plat: data.plat, nama: data.nama, cabang: data.cabang });
      return { msg: 'Kendaraan Berhasil Diupdate' };
    }
  }
  throw new Error('Kendaraan tidak ditemukan');
}

function updateSupir(data, userInfo) {
  const role = assertMasterAccess(userInfo, 'memperbarui supir');
  const ss = getDB();
  const sheet = ss.getSheetByName('Supir');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == data.edit_id) {
      if (role !== 'SUPERADMIN') {
        assertOwnWarehouse(userInfo, values[i][2]);
        assertOwnWarehouse(userInfo, data.cabang);
      }
      // update nama, cabang, and default_vehicle_id (col 2, 3, 5)
      sheet.getRange(i + 1, 2, 1, 2).setValues([[data.nama, data.cabang]]);
      sheet.getRange(i + 1, 5).setValue(data.default_vehicle_id || '');
      logAudit(userInfo, 'EDIT', 'master', 'Supir ' + data.edit_id,
        { nama: values[i][1], cabang: values[i][2] },
        { nama: data.nama, cabang: data.cabang });
      return { msg: 'Supir Berhasil Diupdate' };
    }
  }
  throw new Error('Supir tidak ditemukan');
}

function updateBBM(data, userInfo) {
  assertSuperadminOnly(userInfo, 'memperbarui master BBM');
  const ss = getDB();
  const sheet = ss.getSheetByName('BBM');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] == data.edit_id) {
      sheet.getRange(i + 1, 1, 1, 5).setValues([[data.edit_id, data.jenis, data.harga, data.kode_cabang || '', 'Aktif']]);
      logAudit(userInfo, 'EDIT', 'master', 'BBM ' + data.edit_id,
        { jenis: values[i][1], harga: values[i][2] },
        { jenis: data.jenis, harga: data.harga });
      return { msg: 'BBM Berhasil Diupdate' };
    }
  }
  throw new Error('BBM tidak ditemukan');
}

function insertBBM(data, userInfo) {
  assertSuperadminOnly(userInfo, 'menambah master BBM');
  const ss = getDB();
  let id = 'BBM-' + new Date().getTime();
  ss.getSheetByName('BBM').appendRow([id, data.jenis, data.harga, data.kode_cabang || '', 'Aktif']);
  logAudit(userInfo, 'CREATE', 'master', 'BBM ' + id, null, { id: id, jenis: data.jenis, harga: data.harga });
  return { msg: 'BBM Berhasil Ditambahkan' };
}

function deleteCabangById(kode, userInfo) {
  assertSuperadminOnly(userInfo, 'menghapus master cabang');
  const ss = getDB();
  const sheet = ss.getSheetByName('Cabang');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == kode) {
      const deps = cabangHasDependencies(ss, kode);
      if (deps.length > 0) {
        throw new Error('Cabang masih memiliki data terkait (' + deps.join(', ') + '). Hapus atau timpa data terkait terlebih dahulu.');
      }
      // Soft-delete: ubah status menjadi Non-Aktif agar baris dan jejak tetap tersimpan
      sheet.getRange(i + 1, 4).setValue('Non-Aktif');
      logAudit(userInfo, 'DELETE', 'master', 'Cabang ' + kode, { kode: data[i][0], nama: data[i][1] }, null);
      return { msg: 'Cabang Berhasil Dihapus' };
    }
  }
  throw new Error('Cabang tidak ditemukan');
}

function deleteSupirById(id, userInfo) {
  const role = assertMasterAccess(userInfo, 'menghapus supir');
  const ss = getDB();
  const sheet = ss.getSheetByName('Supir');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      if (role !== 'SUPERADMIN') assertOwnWarehouse(userInfo, data[i][2]);
      // Soft-delete: ubah status menjadi Non-Aktif agar riwayat penggunaan tetap utuh
      sheet.getRange(i + 1, 4).setValue('Non-Aktif');
      logAudit(userInfo, 'DELETE', 'master', 'Supir ' + id, { nama: data[i][1], cabang: data[i][2] }, null);
      return { msg: 'Supir Berhasil Dihapus' };
    }
  }
  throw new Error('Supir tidak ditemukan');
}

function deleteBBMById(id, userInfo) {
  assertSuperadminOnly(userInfo, 'menghapus master BBM');
  const ss = getDB();
  const sheet = ss.getSheetByName('BBM');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      // Soft-delete: ubah status menjadi Non-Aktif agar harga riwayat tetap tersimpan
      sheet.getRange(i + 1, 5).setValue('Non-Aktif');
      logAudit(userInfo, 'DELETE', 'master', 'BBM ' + id, { jenis: data[i][1], harga: data[i][2] }, null);
      return { msg: 'BBM Berhasil Dihapus' };
    }
  }
  throw new Error('BBM tidak ditemukan');
}

// ==========================================
// PENGGUNA (AKUN) CRUD
// ==========================================

function getAllUsers() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const ci = {};
  headers.forEach((h, i) => { ci[String(h)] = i; });
  const list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    list.push({
      user_id: row[ci['user_id']],
      username: row[ci['username']],
      nama: row[ci['nama']],
      role: row[ci['role']],
      cabang: (ci['kode_cabang'] !== undefined) ? row[ci['kode_cabang']] : '',
      status: (ci['status'] !== undefined) ? row[ci['status']] : ''
    });
  }
  return list;
}

function getUserByUsername(sheet, uname) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase() === String(uname).toLowerCase()) {
      return { rowIndex: i + 1, row: data[i] };
    }
  }
  return null;
}

function countActiveSuperadmin(sheet) {
  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === 'SUPERADMIN' && data[i][6] === 'Aktif') count++;
  }
  return count;
}

function insertUser(data, userInfo) {
  assertSuperadminOnly(userInfo, 'mengelola akun pengguna');
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const uname = String(data.username || '').trim();
  const nama = String(data.nama || '').trim();
  const password = String(data.password || '');
  const role = data.role || '';
  const cabang = (data.cabang || '').trim();
  if (!uname) throw new Error('Username wajib diisi');
  if (!nama) throw new Error('Nama wajib diisi');
  if (!password) throw new Error('Password wajib diisi');
  if (role !== 'SUPERADMIN' && role !== 'PIC CABANG') throw new Error('Role tidak valid');
  if (role === 'PIC CABANG' && !cabang) throw new Error('Warehouse wajib diisi untuk PIC CABANG');
  if (getUserByUsername(sheet, uname)) throw new Error('Username sudah terpakai');
  const id = 'U-' + new Date().getTime();
  sheet.appendRow([id, uname, hashPassword(password), nama, role, cabang, 'Aktif']);
  logAudit(userInfo, 'CREATE', 'pengguna', 'Pengguna ' + uname, null, { user_id: id, username: uname, nama: nama, role: role, cabang: cabang });
  return { msg: 'Pengguna Berhasil Ditambahkan' };
}

function updateUser(data, userInfo) {
  assertSuperadminOnly(userInfo, 'mengelola akun pengguna');
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const userId = String(data.user_id || '');
  const uname = String(data.username || '').trim();
  const nama = String(data.nama || '').trim();
  const role = data.role || '';
  const cabang = (data.cabang || '').trim();

  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === userId) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) throw new Error('Pengguna tidak ditemukan');

  if (!uname) throw new Error('Username wajib diisi');
  if (!nama) throw new Error('Nama wajib diisi');
  if (role !== 'SUPERADMIN' && role !== 'PIC CABANG') throw new Error('Role tidak valid');
  if (role === 'PIC CABANG' && !cabang) throw new Error('Warehouse wajib diisi untuk PIC CABANG');

  const existing = getUserByUsername(sheet, uname);
  if (existing && String(existing.row[0]) !== userId) throw new Error('Username sudah terpakai');

  const currentRow = values[rowIndex - 1];
  if (String(userInfo.username) === String(currentRow[1]) &&
      currentRow[4] === 'SUPERADMIN' && role !== 'SUPERADMIN' &&
      countActiveSuperadmin(sheet) <= 1) {
    throw new Error('Tidak bisa menghapus peran SUPERADMIN terakhir');
  }

  const password = String(data.password || '');
  const newPassword = password ? hashPassword(password) : String(currentRow[2]);
  sheet.getRange(rowIndex, 2, 1, 5).setValues([[uname, newPassword, nama, role, cabang]]);
  logAudit(userInfo, 'EDIT', 'pengguna', 'Update user ' + userId);
  return { msg: 'Pengguna Berhasil Diupdate' };
}

function setUserStatus(userId, status, userInfo) {
  assertSuperadminOnly(userInfo, 'mengelola status akun pengguna');
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(userId)) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) throw new Error('Pengguna tidak ditemukan');
  const row = values[rowIndex - 1];
  if (status === 'Non-Aktif') {
    if (userInfo && String(userInfo.username) === String(row[1])) {
      throw new Error('Tidak bisa menonaktifkan akun sendiri');
    }
    if (row[4] === 'SUPERADMIN' && countActiveSuperadmin(sheet) <= 1) {
      throw new Error('Tidak bisa menonaktifkan SUPERADMIN aktif terakhir');
    }
  }
  sheet.getRange(rowIndex, 7).setValue(status);
  logAudit(userInfo, 'DELETE', 'pengguna', (status === 'Aktif' ? 'Aktifkan ' : 'Nonaktifkan ') + userId);
  return { msg: status === 'Aktif' ? 'Pengguna Berhasil Diaktifkan Kembali' : 'Pengguna Berhasil Dinonaktifkan' };
}

function ensurePenggunaBBMColumns() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf('km_sumber') === -1) {
    const newCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, newCol).setValue('km_sumber');
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, newCol, lastRow - 1, 1).setValue('AKTUAL');
  }
}

// Tambahkan kolom ref_type / ref_id di Flazz_Usage bila belum ada (migrasi aman).
// Kolom ini menautkan setiap catatan penyerahan kartu ke sumbernya (transaksi/jalur)
// sehingga operasi hapus hanya mengembalikan penyerahan yang memang berasal dari sumber itu.
function ensureFlazzUsageRefColumns() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Flazz_Usage');
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let newCol = sheet.getLastColumn();
  if (headers.indexOf('ref_type') === -1) {
    newCol += 1;
    sheet.getRange(1, newCol).setValue('ref_type');
  }
  if (headers.indexOf('ref_id') === -1) {
    newCol += 1;
    sheet.getRange(1, newCol).setValue('ref_id');
  }
}

function migrateLegacyPasswords() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Pengguna');
  if (!sheet) throw new Error('Sheet Pengguna tidak ditemukan');
  const data = sheet.getDataRange().getValues();
  let converted = 0;
  for (let i = 1; i < data.length; i++) {
    const stored = String(data[i][2] || '');
    if (hashLooksLegacy(stored) && stored !== '') {
      sheet.getRange(i + 1, 3).setValue(hashPassword(stored));
      converted++;
      Logger.log('Migrasi baris ' + (i + 1) + ' (' + data[i][1] + ')');
    }
  }
  Logger.log('Passwords legacy ter-migrasi: ' + converted);
  return { converted: converted };
}
