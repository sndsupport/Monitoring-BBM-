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

function safeList(fn) {
  try {
    var v = fn();
    if (v === null || v === undefined || typeof v !== 'object') return [];
    return v;
  } catch (e) {
    console.error('processInitialData getter error: ' + e);
    return [];
  }
}

function cleanValue(k, v) {
  if (v === undefined) {
    console.log('Sanitized undefined for key: ' + k);
    return '';
  }
  if (typeof v === 'number' && !isFinite(v)) {
    console.log('Sanitized non-finite number for key: ' + k + ' = ' + v);
    return (isNaN(v) ? 0 : (v > 0 ? Number.MAX_SAFE_INTEGER : -Number.MAX_SAFE_INTEGER));
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  return v;
}

function cleanSerializable(obj) {
  try {
    return JSON.parse(JSON.stringify(obj, cleanValue));
  } catch (e) {
    console.error('Payload serialization failed: ' + e);
    return {};
  }
}

function processInitialData(userInfo) {
  if (!userInfo || !userInfo.username) {
    return { error: 'Not logged in' };
  }
  var payload = {
    vehicles: safeList(function() { return getActiveVehicles(userInfo.role, userInfo.cabang); }),
    drivers: safeList(function() { return getActiveDrivers(userInfo.role, userInfo.cabang); }),
    cabangList: safeList(function() { return getCabangList(); }),
    bbmList: safeList(function() { return getActiveBBM(); }),
    user: (userInfo.nama || ''),
    username: userInfo.username,
    role: userInfo.role,
    cabang: userInfo.cabang,
    flazzCards: safeList(function() { return getFlazzCards(userInfo.role, userInfo.cabang); })
  };
  return cleanSerializable(payload);
}

function getLastLaporanPrefill(userInfo) {
  try {
    if (!userInfo || !userInfo.username) return { error: 'Not logged in', pref: null };
    const ss = getDB();
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) return { pref: null };
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { pref: null };
    const role = userInfo.role;
    const cabang = userInfo.cabang;
    for (let i = data.length - 1; i >= 1; i--) {
      let row = data[i];
      if (role !== 'SUPERADMIN' && row[5] !== cabang) continue;
      if (!row[6]) continue;
      let d = new Date(row[2]);
      let tgl = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return { pref: {
        vehicle_id: row[6],
        plat_nomor: row[7],
        nama_supir: row[26] || '',
        tanggal: tgl,
        bar_awal: row[11],
        bar_akhir: row[15],
        biaya_bbm: parseFloat(row[19]) || 0,
        liter_bbm: parseFloat(row[18]) || 0,
        metode_pembayaran: row[27] || 'TUNAI',
        flazz_card_id: row[28] || '',
        keterangan: row[33] || ''
      }};
    }
    return { pref: null };
  } catch (e) {
    return { error: e.toString(), pref: null };
  }
}

function getMasterData(userInfo) {
  if (!userInfo || !userInfo.username) {
    return { error: 'Not logged in' };
  }
  var payload = {
    vehicles: safeList(function() { return getActiveVehicles(userInfo.role, userInfo.cabang); }),
    drivers: safeList(function() { return getActiveDrivers(userInfo.role, userInfo.cabang); }),
    cabangList: safeList(function() { return getCabangList(); }),
    bbmList: safeList(function() { return getActiveBBM(); })
  };
  return cleanSerializable(payload);
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

    if (data.foto_indikator) {
      let indFile = uploadImageToDrive(data.foto_indikator, data.foto_indikator_name, 'Indikator_BBM');
      result.files.indikator = indFile.success ? indFile.fileUrl : '';

      // Deteksi level indikator BBM via Gemini jika tersedia
      try {
        var deteksi = detectFuelLevel(data.foto_indikator);
        result.level_bbm = deteksi.level;
        result.confidence_bbm = deteksi.confidence_pct;
        result.level_status = deteksi.status;
        result.level_message = deteksi.message;
      } catch (e) {
        Logger.log('Deteksi indikator gagal: ' + e.toString());
      }
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
function apiDeleteFlazzBBM(transactionId, mode) { return deleteFlazzBBM(transactionId, mode); }
function apiEditDailyTransaction(payload) { return editDailyTransaction(payload); }
function apiDeleteDailyTransaction(transactionId) { return deleteDailyTransaction(transactionId); }

// ==========================================
// GEMINI FUEL GAUGE (indikator BBM) DETECTION
// ==========================================
// API key dibaca dari Script Properties (GEMINI_API_KEY),
// TIDAK disimpan hardcoded di repo demi keamanan.
function geminiApiKey() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
}

// Fungsi setup satu kali: simpan key ke Script Properties.
// Panggil sekali dari editor: setGeminiApiKey("KEY_ANDA")
function setGeminiApiKey(key) {
  if (!key) return { success: false, error: 'Key kosong' };
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
  return { success: true, msg: 'GEMINI_API_KEY tersimpan di Script Properties' };
}

function detectFuelLevel(base64DataUrl) {
  var empty = { level: 0, confidence_pct: 0, status: 'NOT_DETECTED', message: 'API key Gemini belum diatur' };
  var apiKey = geminiApiKey();
  if (!apiKey) {
    Logger.log('GEMINI_API_KEY belum diatur di Script Properties.');
    return empty;
  }
  if (!base64DataUrl) {
    return { level: 0, confidence_pct: 0, status: 'NOT_DETECTED', message: 'Tidak ada foto' };
  }

  // Pisahkan prefix data URL (mis. data:image/jpeg;base64, ...)
  var mime = 'image/jpeg';
  var b64 = base64DataUrl;
  var comma = base64DataUrl.indexOf(';base64,');
  if (comma > -1) {
    var head = base64DataUrl.substring(5, comma);
    if (head.indexOf('/') > -1) mime = head;
    b64 = base64DataUrl.substring(comma + 8);
  }

  var prompt = [
    'Kamu adalah pembaca indikator BBM kendaraan (fuel gauge).',
    'Analisis foto dashboard/indikator bbm di gambar ini dan tentukan posisi jarum/indikator bahan bakar.',
    'Skala standar: sekitar E/0% sampai F/100%.',
    'Balas HANYA dengan satu objek JSON (tanpa markdown, tanpa teks lain) dengan format:',
    '{"level": <persen 0-100 integer>, "confidence": <0.0-1.0>, "status": "SUCCESS|LOW_CONFIDENCE|NOT_DETECTED"}',
    'Jika jarum/indikator tidak terlihat jelas, set status NOT_DETECTED dan level 0.',
    'Jangan menebak angka jika tidak yakin.'
  ].join('\n');

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
  var requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mime, data: b64 } },
          { text: prompt }
        ]
      }
    ],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    safetySettings: [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }
    ]
  };

  var options = {
    method: 'post',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
    timeoutInSeconds: 90
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code !== 200) {
    Logger.log('Gemini HTTP ' + code + ': ' + response.getContentText());
    return { level: 0, confidence_pct: 0, status: 'NOT_DETECTED', message: 'Gagal memanggil Gemini (' + code + ')' };
  }

  try {
    var json = JSON.parse(response.getContentText());
    var text = '';
    if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) {
      text = json.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('');
    }
    var parsed = JSON.parse(text);
    var level = parseInt(parsed.level, 10);
    if (isNaN(level)) level = 0;
    var conf = parseFloat(parsed.confidence);
    if (isNaN(conf)) conf = 0;
    var status = parsed.status === 'SUCCESS' ? 'SUCCESS' : (parsed.status === 'LOW_CONFIDENCE' ? 'LOW_CONFIDENCE' : 'NOT_DETECTED');
    return {
      level: Math.max(0, Math.min(100, level)),
      confidence_pct: Math.round(conf * 100),
      status: status,
      message: status === 'SUCCESS' ? ('Level terdeteksi ' + level + '%') : (status === 'LOW_CONFIDENCE' ? 'Level terdeteksi dengan confidence rendah' : 'Level tidak terdeteksi')
    };
  } catch (e) {
    Logger.log('Parse Gemini gagal: ' + e.toString());
    return { level: 0, confidence_pct: 0, status: 'NOT_DETECTED', message: 'Respons Gemini tidak valid' };
  }
}

function apiDetectFuelLevel(base64DataUrl) {
  return detectFuelLevel(base64DataUrl);
}
