// ==========================================
// DIAGNOSTIK READ-ONLY (jalankan manual di editor:
// Apps Script > "Run" > pilih __debugCabangRekap).
// Tidak dipanggil runtime web app. Aman: hanya baca.
// Contoh: __debugCabangRekap()           -> cek 'apuy' & 'ibef'
//         __debugCabangRekap(['apuy'])   -> cek satu
// Bekerja: temukan user (username/nama) yang mengandung key,
// lalu telusuri lintas sheet untuk varian persis kode cabangnya.
// ==========================================

// Wrapper untuk melihat hasil langsung di editor:
// jalankan "__runDebugCabangRekap" lalu buka View > Logs.
function __runDebugCabangRekap() {
  var res = __debugCabangRekap(['apuy', 'ibef']);
  console.log(JSON.stringify(res, null, 1));
  Logger.log(JSON.stringify(res));
  return res;
}

function __debugCabangRekap(keys) {
  var keyList = (keys && keys.length)
    ? keys.map(function (k) { return String(k); })
    : ['apuy', 'ibef'];
  var keyLow = keyList.map(function (k) { return k.toLowerCase(); });
  var ss = getDB();
  var out = { keys: keyList.slice(), users: [], userCabangs: [], cabangPerSheet: {}, samples: {} };

  function findIdx(headers, candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var idx = headers.indexOf(candidates[i]);
      if (idx > -1) return idx;
    }
    return -1;
  }
  function cellStr(v) { return String(v == null ? '' : v).trim(); }
  function containsAny(lowText, needles) {
    for (var i = 0; i < needles.length; i++) {
      if (lowText.indexOf(needles[i]) > -1) return true;
    }
    return false;
  }

  // Langkah 1: user yang username/nama-nya mengandung key -> ambil kode_cabang-nya.
  var userSheet = ss.getSheetByName('Pengguna');
  if (userSheet) {
    var d = userSheet.getDataRange().getValues();
    var h = d[0];
    var iU = findIdx(h, ['username']), iN = findIdx(h, ['nama']),
        iR = findIdx(h, ['role']), iC = findIdx(h, ['kode_cabang']), iS = findIdx(h, ['status']);
    var userTargets = [];
    for (var r = 1; r < d.length; r++) {
      var uname = iU > -1 ? cellStr(d[r][iU]) : '';
      var namaU = iN > -1 ? cellStr(d[r][iN]) : '';
      if (!containsAny(uname.toLowerCase(), keyLow) && !containsAny(namaU.toLowerCase(), keyLow)) continue;
      var uCab = iC > -1 ? cellStr(d[r][iC]) : '';
      out.users.push({
        baris: r + 1, username: uname, nama: namaU,
        role: iR > -1 ? cellStr(d[r][iR]) : '',
        kode_cabang: uCab, status: iS > -1 ? cellStr(d[r][iS]) : ''
      });
      if (uCab && userTargets.indexOf(uCab) === -1) userTargets.push(uCab);
    }
    out.userCabangs = userTargets;
  }

  // Target: key asli (bisa jadi kode cabang juga) + kode cabang user.
  var targetLow = keyLow.concat(userTargets.map(function (t) { return t.toLowerCase(); }));

  var cfg = [
    { name: 'Pengguna',       matchCols: ['username', 'nama'],          cabangCol: 'kode_cabang', redact: ['password'] },
    { name: 'Kendaraan',      matchCols: ['plat_nomor', 'nama_kendaraan'], cabangCol: 'kode_cabang' },
    { name: 'Supir',          matchCols: ['nama_supir'],                cabangCol: 'kode_cabang' },
    { name: 'Flazz_Card',     matchCols: ['card_number', 'card_name'],  cabangCol: 'branch_id' },
    { name: 'Jalur_Pengiriman', matchCols: ['nama_driver', 'nama_driver2'], cabangCol: 'kode_cabang' },
    { name: 'Penggunaan_BBM', matchCols: ['nama_pengguna'],             cabangCol: 'kode_cabang' }
  ];

  cfg.forEach(function (cf) {
    var sheet = ss.getSheetByName(cf.name);
    var stat = { count: 0, variants: {} };
    out.cabangPerSheet[cf.name] = stat;
    if (!sheet) { stat.error = 'sheet tidak ada'; return; }
    var data = sheet.getDataRange().getValues();
    if (!data.length) { stat.empty = true; return; }
    var headers = data[0];
    var m1 = findIdx(headers, [cf.matchCols[0]]);
    var m2 = findIdx(headers, [cf.matchCols[1]]);
    var cabIdx = findIdx(headers, [cf.cabangCol]);
    var samples = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var ident = (m1 > -1 ? cellStr(row[m1]) : '') + ' ' + (m2 > -1 ? cellStr(row[m2]) : '');
      var v = cabIdx > -1 ? row[cabIdx] : '';
      var cabRaw = (v == null) ? '' : String(v); // TANPA trim, agar varian spasi/case terlihat
      var cabLow = cabRaw.toLowerCase();
      // Baris relevan bila identitas mengandung target ATAU kode cabangnya menyentuh target.
      if (!containsAny(ident.toLowerCase(), targetLow) && !containsAny(cabLow, targetLow)) continue;
      stat.count++;
      var key = cabRaw === '' ? '(kosong)' : JSON.stringify(cabRaw);
      stat.variants[key] = (stat.variants[key] || 0) + 1;
      if (samples.length < 8) {
        var s = { baris: i + 1, cabang: cabRaw, data: [] };
        for (var c = 0; c < headers.length; c++) {
          var hdr = String(headers[c]);
          var val = row[c];
          if (cf.redact && cf.redact.indexOf(hdr) > -1) val = '***';
          s.data.push(val);
        }
        samples.push(s);
      }
    }
    if (samples.length) out.samples[cf.name] = samples;
  });

  return out;
}