function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Laporan BBM & Operasional Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doLogin(username, password) {
  return authenticateUser(username, password);
}

function processInitialData(userInfo) {
  if (!userInfo || !userInfo.username) {
    return { error: 'Not logged in' };
  }
  return {
    vehicles: getActiveVehicles(userInfo.role, userInfo.cabang),
    drivers: getActiveDrivers(userInfo.role, userInfo.cabang),
    cabangList: getCabangList(),
    bbmList: getActiveBBM(),
    user: userInfo.nama,
    username: userInfo.username,
    role: userInfo.role,
    cabang: userInfo.cabang
  };
}

function getMasterData(userInfo) {
  if (!userInfo || !userInfo.username) {
    return { error: 'Not logged in' };
  }
  return {
    vehicles: getActiveVehicles(userInfo.role, userInfo.cabang),
    drivers: getActiveDrivers(userInfo.role, userInfo.cabang),
    cabangList: getCabangList(),
    bbmList: getActiveBBM()
  };
}

function processDailyImages(data) {
  try {
    let result = { success: true, files: {} };
    let odoAwalFile = uploadImageToDrive(data.foto_odo_awal, data.foto_odo_awal_name, 'KM_Awal');
    let odoAwalOcr = processOdometerImageOCR(odoAwalFile.fileId); 
    result.km_awal = odoAwalOcr.extractedNumbers;
    result.files.odo_awal = odoAwalFile.fileUrl;
    
    let odoAkhirFile = uploadImageToDrive(data.foto_odo_akhir, data.foto_odo_akhir_name, 'KM_Akhir');
    let odoAkhirOcr = processOdometerImageOCR(odoAkhirFile.fileId);
    result.km_akhir = odoAkhirOcr.extractedNumbers;
    result.files.odo_akhir = odoAkhirFile.fileUrl;
    
    if (data.foto_struk_bbm) {
      let bbmFile = uploadImageToDrive(data.foto_struk_bbm, data.foto_struk_bbm_name, 'Struk_BBM');
      result.files.struk_bbm = bbmFile.fileUrl;
    }
    
    if (data.foto_struk_toll) {
      let tollFile = uploadImageToDrive(data.foto_struk_toll, data.foto_struk_toll_name, 'Evidence');
      result.files.struk_toll = tollFile.fileUrl;
    }
    return result;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function saveDailyTransaction(payload) {
  return saveTransactionEndOfDay(payload); 
}

function getDashboardData(userInfo) {
  if (!userInfo) return [];
  return getRecentTransactions(userInfo.role, userInfo.cabang);
}

function saveMasterCabang(data) {
  return insertCabang(data);
}

function saveMasterKendaraan(data) {
  return insertKendaraan(data);
}

function saveMasterSupir(data) {
  return insertSupir(data);
}

function deleteMasterKendaraan(vehicleId) {
  return deleteKendaraanById(vehicleId);
}

