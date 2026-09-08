function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Laporan BBM & Operasional Harian')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==========================================
// AUTH
// ==========================================

function doLogin(username, password) {
  var runaway = checkRate('login:' + String(username).toLowerCase(), 5, 5 * 60 * 1000);
  if (!runaway.allowed) {
    return { success: false, msg: 'Terlalu banyak percobaan login. Tunggu ' + runaway.retryAfterSec + ' detik.' };
  }
  var res = authenticateUser(username, password);
  if (!res.success) return res;
  resetRate('login:' + String(username).toLowerCase());
  var token = createSession(res);
  Logger.log('LOGIN OK: ' + res.username + ' (' + res.role + ') cabang=' + res.cabang);
  logAudit(res, 'LOGIN', 'auth', 'Login berhasil role=' + res.role + ' cabang=' + (res.cabang || '-'));
  return {
    success: true,
    token: token,
    user: {
      user_id: res.user_id,
      username: res.username,
      nama: res.nama,
      role: res.role,
      cabang: res.cabang,
      must_change: !!res.must_change
    }
  };
}

function doLogout(token) {
  var u = resolveSession(token);
  if (u) logAudit(u, 'LOGOUT', 'auth', 'Logout');
  destroySession(token);
  return { success: true };
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

function processInitialData(token) {
  var user = requireUser(token);
  ensurePenggunaBBMColumns();
  var base = getMasterData(token);
  base.user = (user.nama || '');
  base.username = user.username;
  base.role = user.role;
  base.cabang = user.cabang;
  return cleanSerializable(base);
}

function getLastLaporanPrefill(token) {
  try {
    var user = requireUser(token);
    const ss = getDB();
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) return { pref: null };
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return { pref: null };
    const role = user.role;
    const cabang = user.cabang;
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

function getMasterData(token) {
  var user = requireUser(token);
  var ck = masterCacheKey(user.role, user.cabang);
  var hit = cacheGet(ck);
  if (hit) return hit;
  var payload = {
    vehicles: safeList(function() { return getActiveVehicles(user.role, user.cabang); }),
    drivers: safeList(function() { return getActiveDrivers(user.role, user.cabang); }),
    cabangList: safeList(function() { return getCabangList(); }),
    bbmList: safeList(function() { return getActiveBBM(); }),
    flazzCards: safeList(function() { return getFlazzCards(user.role, user.cabang); }),
    penggunaList: (user.role === 'SUPERADMIN') ? safeList(function() { return getAllUsers(); }) : []
  };
  var out = cleanSerializable(payload);
  cachePut(ck, out, 120);
  return out;
}

function getDashboardData(token) {
  var user = requireUser(token);
  return getRecentTransactions(user.role, user.cabang);
}

function getPerformaData(token) {
  var user = requireUser(token);
  var ck = performaCacheKey(user.role, user.cabang);
  var hit = cacheGet(ck);
  if (hit) return hit;
  var out = getPerformaSummary(user.role, user.cabang);
  cachePut(ck, out, 300);
  return out;
}

function processDailyImages(data, token) {
  try {
    var user = requireUser(token);
    var gm = checkRate('gemini:' + user.user_id, 30, 24 * 60 * 60 * 1000);
    if (!gm.allowed) {
      return { success: false, error: 'Kuota deteksi BBM harian tercapai. Coba lagi besok.' };
    }
    let result = { success: true, files: {} };
    let odoAwalFile = uploadImageToDrive(data.foto_odo_awal, data.foto_odo_awal_name, 'KM_Awal', user.cabang);
    if (!odoAwalFile.success) return { success: false, error: 'Upload foto KM awal gagal: ' + odoAwalFile.error };
    result.files.odo_awal = odoAwalFile.fileUrl;

    let odoAkhirFile = uploadImageToDrive(data.foto_odo_akhir, data.foto_odo_akhir_name, 'KM_Akhir', user.cabang);
    if (!odoAkhirFile.success) return { success: false, error: 'Upload foto KM akhir gagal: ' + odoAkhirFile.error };
    result.files.odo_akhir = odoAkhirFile.fileUrl;

    result.km_awal = data.km_awal_val;
    result.km_akhir = data.km_akhir_val;

    if (data.foto_indikator) {
      let indFile = uploadImageToDrive(data.foto_indikator, data.foto_indikator_name, 'Indikator_BBM', user.cabang);
      result.files.indikator = indFile.success ? indFile.fileUrl : '';

      if (!data.skip_ai_deteksi) {
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
    }
    return result;
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function saveDailyTransaction(payload, token) {
  var user = requireUser(token);
  payload.userInfo = user;
  var res = saveTransactionEndOfDay(payload);
  if (res && res.success) invalidatePerforma(user.role, user.cabang);
  return res;
}

function saveMasterCabang(data, token) {
  var res = insertCabang(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function saveMasterKendaraan(data, token) {
  var res = insertKendaraan(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function saveMasterSupir(data, token) {
  var res = insertSupir(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function deleteMasterKendaraan(vehicleId, token) {
  var res = deleteKendaraanById(vehicleId, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function updateMasterCabang(data, token) {
  var res = updateCabang(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function updateMasterKendaraan(data, token) {
  var res = updateKendaraan(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function updateMasterSupir(data, token) {
  var res = updateSupir(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function updateMasterBBM(data, token) {
  var res = updateBBM(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function saveMasterBBM(data, token) {
  var res = insertBBM(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function deleteMasterCabang(kode, token) {
  var res = deleteCabangById(kode, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function deleteMasterSupir(id, token) {
  var res = deleteSupirById(id, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function deleteMasterBBM(id, token) {
  var res = deleteBBMById(id, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function saveMasterPengguna(data, token) {
  var res = insertUser(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function updateMasterPengguna(data, token) {
  var res = updateUser(data, requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function deleteMasterPengguna(userId, token) {
  var res = setUserStatus(userId, 'Non-Aktif', requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}
function activateMasterPengguna(userId, token) {
  var res = setUserStatus(userId, 'Aktif', requireUser(token));
  if (res && res.msg) invalidateMaster('SUPERADMIN', '');
  return res;
}

// ==========================================
// FLAZZ API WRAPPERS
// ==========================================
function apiSaveFlazzCard(payload, token) { return saveFlazzCard(payload, requireUser(token)); }
function apiSaveFlazzTopUp(payload, token) { payload.userInfo = requireUser(token); return saveFlazzTopUp(payload); }
function apiSaveFlazzTol(payload, token) { payload.userInfo = requireUser(token); return saveFlazzTol(payload); }
function apiSaveFlazzRecon(payload, token) { payload.userInfo = requireUser(token); return saveFlazzRecon(payload); }
function apiCheckReconGate(cardId, token) { requireUser(token); return checkReconGate(cardId); }
function apiSaveFlazzUsage(payload, token) { payload.userInfo = requireUser(token); return saveFlazzUsage(payload); }

function apiGetFlazzDashboardData(token) { var user = requireUser(token); return getFlazzDashboardData(user.role, user.cabang); }
function apiDeleteFlazzCard(cardId, token) { return deleteFlazzCard(cardId, requireUser(token)); }
function apiActivateFlazzCard(cardId, token) { return activateFlazzCard(cardId, requireUser(token)); }
function apiEditFlazzTopUp(payload, token) { return editFlazzTopUp(payload, requireUser(token)); }
function apiDeleteFlazzTopUp(id, token) { return deleteFlazzTopUp(id, requireUser(token)); }
function apiEditFlazzTol(payload, token) { return editFlazzTol(payload, requireUser(token)); }
function apiDeleteFlazzTol(id, token) { return deleteFlazzTol(id, requireUser(token)); }
function apiDeleteFlazzBBM(transactionId, mode, token) { return deleteFlazzBBM(transactionId, mode, requireUser(token)); }
function apiEditDailyTransaction(payload, token) {
  var user = requireUser(token);
  var res = editDailyTransaction(payload, user);
  if (res && res.success) invalidatePerforma(user.role, user.cabang);
  return res;
}
function apiDeleteDailyTransaction(transactionId, token) {
  var user = requireUser(token);
  var res = deleteDailyTransaction(transactionId, user);
  if (res && res.success) invalidatePerforma(user.role, user.cabang);
  return res;
}

// ==========================================
// JALUR PENGIRIMAN API WRAPPERS
// ==========================================
function apiSaveJalur(payload, token) { return saveJalur(payload, requireUser(token)); }
function apiUpdateJalur(data, token) { return updateJalur(data, requireUser(token)); }
function apiDeleteJalur(id, token) { return deleteJalur(id, requireUser(token)); }
function apiGetJalurByTanggal(tanggal, token, opts) { var user = requireUser(token); return getJalurByTanggal(tanggal, user, opts || {}); }

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

// ==========================================
// SETTINGS (wrapper server-side; fungsi storage di DatabaseSetup.js)
// ==========================================
function saveAppSettings(data, token) {
  var user = requireUser(token);
  if (user.role !== 'SUPERADMIN') throw new Error('Akses ditolak: hanya SUPERADMIN yang dapat mengubah pengaturan.');
  return DatabaseSaveAppSettings(data);
}

function uploadLogo(base64Data, fileName, token) {
  var user = requireUser(token);
  if (user.role !== 'SUPERADMIN') throw new Error('Akses ditolak: hanya SUPERADMIN yang dapat mengunggah logo.');
  return DatabaseUploadLogo(base64Data, fileName);
}

function getAppSettings(token) {
  return DatabaseGetAppSettings();
}

function apiDetectFuelLevel(base64DataUrl, token) {
  var user = requireUser(token);
  var gm = checkRate('gemini:' + user.user_id, 30, 24 * 60 * 60 * 1000);
  if (!gm.allowed) {
    return { level: 0, confidence_pct: 0, status: 'NOT_DETECTED', message: 'Kuota deteksi BBM harian tercapai. Coba lagi besok.' };
  }
  return detectFuelLevel(base64DataUrl);
}

// ==========================================
// DIagnostik & Pembersihan Foto Orphan
// Jalankan dari editor: diagnoseOrphanPhotos() atau cleanupOrphanPhotos()
// ==========================================

function diagnoseOrphanPhotos() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return { error: 'Sheet tidak ditemukan' };

  const data = sheet.getDataRange().getValues();
  const fotoCols = [8, 12, 20, 22, 29]; // odo_awal, odo_akhir, struk_bbm, struk_toll, indikator
  const fotoNames = ['foto_odo_awal', 'foto_odo_akhir', 'foto_struk_bbm', 'foto_struk_toll', 'foto_indikator'];
  const results = [];
  let totalWithPhoto = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let hasAny = false;
    const rowInfo = { row: i + 1, tanggal: row[2], user: row[4], cabang: row[5], photos: {} };

    for (let j = 0; j < fotoCols.length; j++) {
      const url = row[fotoCols[j]];
      if (url) {
        hasAny = true;
        const fileId = extractDriveFileId(url);
        let exists = false;
        if (fileId) {
          try { DriveApp.getFileById(fileId); exists = true; } catch (e) { exists = false; }
        }
        rowInfo.photos[fotoNames[j]] = { url: String(url).substring(0, 80), fileId: fileId, exists: exists };
      }
    }

    if (hasAny) {
      totalWithPhoto++;
      results.push(rowInfo);
    }
  }

  Logger.log('=== DIAGNOSTIK FOTO ===');
  Logger.log('Total baris dengan foto: ' + totalWithPhoto);
  const orphan = results.filter(r => Object.values(r.photos).some(p => !p.exists));
  Logger.log('Baris dengan foto ORPHAN (tidak ada di Drive): ' + orphan.length);
  orphan.forEach(r => Logger.log(JSON.stringify(r)));
  return { total: totalWithPhoto, orphanCount: orphan.length, orphans: orphan };
}

function cleanupOrphanPhotos() {
  const ss = getDB();
  const sheet = ss.getSheetByName('Penggunaan_BBM');
  if (!sheet) return { error: 'Sheet tidak ditemukan' };

  const data = sheet.getDataRange().getValues();
  const fotoCols = [8, 12, 20, 22, 29];
  let cleaned = 0;
  let skipped = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    for (let j = 0; j < fotoCols.length; j++) {
      const url = row[fotoCols[j]];
      if (url) {
        const fileId = extractDriveFileId(url);
        let exists = false;
        if (fileId) {
          try { DriveApp.getFileById(fileId); exists = true; } catch (e) { exists = false; }
        }
        if (!exists) {
          sheet.getRange(i + 1, fotoCols[j] + 1).setValue('');
          cleaned++;
          Logger.log('Row ' + (i + 1) + ': cleared ' + fotoCols[j] + ' (file not found)');
        }
      }
    }
  }

  return { cleaned: cleaned, message: cleaned + ' kolom foto orphan dibersihkan dari sheet' };
}
