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
    cabang: userInfo.cabang,
    flazzCards: getFlazzCards(userInfo.role, userInfo.cabang)
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
    if (!odoAwalFile.success) return { success: false, error: 'Upload foto KM awal gagal: ' + odoAwalFile.error };
    let odoAwalOcr = processOdometerImageOCR(odoAwalFile.fileId);
    if (!odoAwalOcr.success) return { success: false, error: 'OCR foto KM awal gagal: ' + odoAwalOcr.error };
    result.km_awal = odoAwalOcr.extractedNumbers;
    result.files.odo_awal = odoAwalFile.fileUrl;

    let odoAkhirFile = uploadImageToDrive(data.foto_odo_akhir, data.foto_odo_akhir_name, 'KM_Akhir');
    if (!odoAkhirFile.success) return { success: false, error: 'Upload foto KM akhir gagal: ' + odoAkhirFile.error };
    let odoAkhirOcr = processOdometerImageOCR(odoAkhirFile.fileId);
    if (!odoAkhirOcr.success) return { success: false, error: 'OCR foto KM akhir gagal: ' + odoAkhirOcr.error };
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


function updateMasterCabang(data) { return updateCabang(data); }
function updateMasterKendaraan(data) { return updateKendaraan(data); }
function updateMasterSupir(data) { return updateSupir(data); }
function updateMasterBBM(data) { return updateBBM(data); }

function saveMasterBBM(data) { return insertBBM(data); }

function deleteMasterCabang(kode) { return deleteCabangById(kode); }
function deleteMasterSupir(id) { return deleteSupirById(id); }
function deleteMasterBBM(id) { return deleteBBMById(id); }

// ==========================================
// FLAZZ API WRAPPERS
// ==========================================
function apiSaveFlazzCard(payload, userInfo) { return saveFlazzCard(payload, userInfo); }
function apiSaveFlazzTopUp(payload) { return saveFlazzTopUp(payload); }
function apiSaveFlazzTol(payload) { return saveFlazzTol(payload); }
function apiSaveFlazzRecon(payload) { return saveFlazzRecon(payload); }
function apiSaveFlazzUsage(payload) { return saveFlazzUsage(payload); }

function apiGetFlazzDashboardData(userInfo) { return getFlazzDashboardData(userInfo.role, userInfo.cabang); }
function apiDeleteFlazzCard(cardId) { return deleteFlazzCard(cardId); }
function apiEditFlazzTopUp(payload) { return editFlazzTopUp(payload); }
function apiDeleteFlazzTopUp(id) { return deleteFlazzTopUp(id); }
function apiEditFlazzTol(payload) { return editFlazzTol(payload); }
function apiDeleteFlazzTol(id) { return deleteFlazzTol(id); }
