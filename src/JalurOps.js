/**
 * JalurOps.js
 * Modul backend untuk Sistem Monitoring Jalur Pengiriman
 */

function jalurSheet() {
  return getDB().getSheetByName('Jalur_Pengiriman');
}

// Cek apakah kartu etoll sedang punya catatan DIBERIKAN (masih dipakai)
function flazzCardHasGiveren(cardId) {
  try {
    const ss = getDB();
    const s = ss.getSheetByName('Flazz_Usage');
    if (!s || s.getLastRow() <= 1 || !cardId) return false;
    const data = s.getDataRange().getValues();
    const h = data[0];
    const iCard = h.indexOf('card_id');
    const iStatus = h.indexOf('status');
    for (let i = 1; i < data.length; i++) {
      if (iCard > -1 && String(data[i][iCard]) === String(cardId) && (iStatus < 0 || String(data[i][iStatus]) === 'DIBERIKAN')) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

function jalurColIdx(sheet) {
  const h = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = {};
  h.forEach((x, i) => { idx[String(x)] = i; });
  return idx;
}

function findJalurRow(sheet, id) {
  const data = sheet.getDataRange().getValues();
  const idx = jalurColIdx(sheet);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idx['id']]) === String(id)) return { rowIndex: i + 1, row: data[i], idx: idx };
  }
  return null;
}

function updateJalurStatus(jalurId, newStatus, laporanId) {
  try {
    const sheet = jalurSheet();
    if (!sheet) return;
    const found = findJalurRow(sheet, jalurId);
    if (!found) return;
    const idx = found.idx;
    if (idx['status'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['status'] + 1).setValue(newStatus);
    }
    if (laporanId && idx['laporan_id'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['laporan_id'] + 1).setValue(laporanId);
    }
    if (idx['updated_at'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['updated_at'] + 1).setValue(new Date());
    }
  } catch (e) {
    Logger.log('updateJalurStatus error: ' + e.toString());
  }
}

function findJalurByCriteria(criteria) {
  try {
    const sheet = jalurSheet();
    if (!sheet || sheet.getLastRow() <= 1) return null;
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iDeleted = idx['is_deleted'];
    let best = null;
    for (let i = 1; i < data.length; i++) {
      if (iDeleted !== undefined && String(data[i][iDeleted]) === '1') continue;
      let match = true;
      let rowTgl = '';
      if (idx['tanggal'] !== undefined) {
        const rawTgl = data[i][idx['tanggal']];
        if (rawTgl instanceof Date) {
          const tz = getDB().getSpreadsheetTimeZone();
          rowTgl = Utilities.formatDate(rawTgl, tz, 'yyyy-MM-dd');
        } else {
          rowTgl = String(rawTgl).substring(0, 10);
        }
      }
      if (criteria.tanggal && rowTgl !== String(criteria.tanggal).substring(0, 10)) match = false;
      if (match && criteria.vehicle_id && String(data[i][idx['vehicle_id']]) !== String(criteria.vehicle_id)) match = false;
      if (match && criteria.nama_driver && String(data[i][idx['nama_driver']] || '') !== String(criteria.nama_driver)) match = false;
      if (match && criteria.kode_cabang && String(data[i][idx['kode_cabang']] || '') !== String(criteria.kode_cabang)) match = false;
      if (match && criteria.flazz_card_id) {
        const cardVal = (idx['flazz_card_id'] !== undefined) ? String(data[i][idx['flazz_card_id']] || '') : '';
        if (cardVal !== String(criteria.flazz_card_id)) match = false;
      }
      if (match) {
        const rec = {
          id: data[i][idx['id']],
          status: (idx['status'] !== undefined) ? String(data[i][idx['status']] || 'BELUM_DIISI') : 'BELUM_DIISI',
          flazz_card_id: (idx['flazz_card_id'] !== undefined) ? String(data[i][idx['flazz_card_id']] || '') : '',
          tanggalJalur: rowTgl,
          kode_cabang: (idx['kode_cabang'] !== undefined) ? String(data[i][idx['kode_cabang']] || '') : '',
          nama_driver: (idx['nama_driver'] !== undefined) ? String(data[i][idx['nama_driver']] || '') : '',
          plat_nomor: (idx['plat_nomor'] !== undefined) ? String(data[i][idx['plat_nomor']] || '') : '',
          rowIndex: i + 1
        };
        // Kembalikan record TERAKHIR yang cocok (baris paling bawah = paling baru).
        best = rec;
      }
    }
    return best;
  } catch (e) {
    Logger.log('findJalurByCriteria error: ' + e.toString());
    return null;
  }
}

function checkIncompleteJalurForVehicle(vehicleId, tanggal) {
  try {
    const sheet = jalurSheet();
    if (!sheet || sheet.getLastRow() <= 1) return { blocked: false, incompleteJalur: null };
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iDeleted = idx['is_deleted'];
    const inputTgl = String(tanggal || '').substring(0, 10);
    let latest = null;
    for (let i = 1; i < data.length; i++) {
      if (iDeleted !== undefined && String(data[i][iDeleted]) === '1') continue;
      if (String(data[i][idx['vehicle_id']]) !== String(vehicleId)) continue;
      let rowTgl = data[i][idx['tanggal']];
      if (rowTgl instanceof Date) {
        const tz = getDB().getSpreadsheetTimeZone();
        rowTgl = Utilities.formatDate(rowTgl, tz, 'yyyy-MM-dd');
      } else {
        rowTgl = String(rowTgl).substring(0, 10);
      }
      if (!inputTgl || rowTgl >= inputTgl) continue;
      if (!latest || rowTgl > latest.tanggal) {
        latest = {
          id: data[i][idx['id']],
          tanggal: rowTgl,
          plat_nomor: (idx['plat_nomor'] !== undefined) ? String(data[i][idx['plat_nomor']] || '') : '',
          status: (idx['status'] !== undefined) ? String(data[i][idx['status']] || 'BELUM_DIISI') : 'BELUM_DIISI',
          flazz_card_id: (idx['flazz_card_id'] !== undefined) ? String(data[i][idx['flazz_card_id']] || '') : ''
        };
      }
    }
    if (!latest) return { blocked: false, incompleteJalur: null };
    const finalStatus = latest.flazz_card_id ? 'SELESAI' : 'SUDAH_LAPORAN';
    const blocked = latest.status !== finalStatus;
    return { blocked: blocked, incompleteJalur: blocked ? latest : null };
  } catch (e) {
    Logger.log('checkIncompleteJalurForVehicle error: ' + e.toString());
    return { blocked: false, incompleteJalur: null };
  }
}

function getJalurCabangFor(userInfo) {
  if (userInfo && userInfo.role === 'SUPERADMIN') return null; // null = semua cabang
  return (userInfo && userInfo.cabang) || '';
}

function jalurDriverNameById(driverId) {
  const ss = getDB();
  const s = ss.getSheetByName('Supir');
  if (!s) return '';
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(driverId)) return data[i][1];
  }
  return '';
}

function jalurVehicleById(vehicleId) {
  const ss = getDB();
  const s = ss.getSheetByName('Kendaraan');
  if (!s) return null;
  const data = s.getDataRange().getValues();
  const h = data[0];
  const ci = {};
  h.forEach((x, i) => { ci[String(x)] = i; });
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ci['vehicle_id']]) === String(vehicleId)) {
      return {
        plat_nomor: data[i][ci['plat_nomor']],
        nama: data[i][ci['nama_kendaraan']],
        jenis: data[i][ci['jenis_kendaraan']] || 'Mobil',
        tanggal_pajak: (ci['tanggal_pajak'] !== undefined) ? data[i][ci['tanggal_pajak']] : '',
        tanggal_pajak_5: (ci['tanggal_pajak_5_tahunan'] !== undefined) ? data[i][ci['tanggal_pajak_5_tahunan']] : '',
        tanggal_kir: (ci['tanggal_kir'] !== undefined) ? data[i][ci['tanggal_kir']] : ''
      };
    }
  }
  return null;
}

function jalurComputePajak(tanggalPajakStr) {
  if (!tanggalPajakStr) return { sisa_hari_pajak: null, status_pajak: 'TIDAK_ADA' };
  
  let dStr = String(tanggalPajakStr);
  if (tanggalPajakStr instanceof Date) {
    const tz = getDB().getSpreadsheetTimeZone();
    dStr = Utilities.formatDate(tanggalPajakStr, tz, 'yyyy-MM-dd');
  } else {
    dStr = dStr.slice(0, 10);
  }
  
  const due = new Date(dStr + 'T00:00:00');
  if (isNaN(due.getTime())) return { sisa_hari_pajak: null, status_pajak: 'TIDAK_ADA' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  let status = 'AMAN';
  if (days <= 0) status = 'LEWAT';
  else if (days <= 30) status = 'KRITIS';
  else if (days <= 60) status = 'WASPADA';
  return { sisa_hari_pajak: days, status_pajak: status };
}

function saveJalur(payload, userInfo) {
  try {
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan. Jalankan setupDatabase.');
    const role = assertMasterAccess(userInfo, 'menyimpan jadwal pengiriman');
    if (role !== 'SUPERADMIN' && !userInfo.cabang) {
      throw new Error('Akses ditolak: akun PIC CABANG tanpa warehouse tidak dapat menyimpan jadwal.');
    }
    const tanggal = payload.tanggal;
    const rows = payload.rows || [];
    if (!tanggal || rows.length === 0) throw new Error('Tanggal dan minimal satu baris wajib diisi.');
    const idx = jalurColIdx(sheet);
    const ungatedVehicles = [];
    rows.forEach(function (r) {
      if (!r || !r.driver_id || !r.vehicle_id || !String(r.rute_tujuan || '').trim()) return;
      if (ungatedVehicles.indexOf(String(r.vehicle_id)) === -1) ungatedVehicles.push(String(r.vehicle_id));
    });
    const blockers = [];
    ungatedVehicles.forEach(function (vid) {
      const check = checkIncompleteJalurForVehicle(vid, tanggal);
      if (check.blocked && check.incompleteJalur) blockers.push(check.incompleteJalur);
    });
    if (blockers.length) {
      const detail = blockers.map(function (b) {
        const aksi = b.flazz_card_id ? 'rekonsiliasi saldo flazz' : 'input laporan';
        return 'Kendaraan ' + (b.plat_nomor || b.id) + ' (jalur ' + b.tanggal + ', status ' + b.status + ') masih belum selesai. Harap ' + aksi + ' terlebih dahulu.';
      }).join(' ');
      throw new Error('Jalur baru diblokir: ' + detail);
    }
    const createdBy = (userInfo && (userInfo.nama || userInfo.username)) || '';
    const kodeCabang = (userInfo && userInfo.cabang) || '';
    const now = new Date();
    let saved = 0;
    const warnings = [];
    rows.forEach(r => {
      if (!r || !r.driver_id || !r.vehicle_id || !String(r.rute_tujuan || '').trim()) return;
      const vid = r.vehicle_id;
      const v = jalurVehicleById(vid);
      const namaDriver = jalurDriverNameById(r.driver_id);
      const row = new Array(Object.keys(idx).length).fill('');
      const jalurId = 'JLR-' + now.getTime() + '-' + (saved);
      saved++;
      row[idx['id']] = jalurId;
      row[idx['tanggal']] = tanggal;
      row[idx['driver_id']] = r.driver_id;
      row[idx['nama_driver']] = namaDriver;
      if (idx['driver2_id'] !== undefined) {
        row[idx['driver2_id']] = r.driver2_id || '';
        row[idx['nama_driver2']] = r.driver2_id ? jalurDriverNameById(r.driver2_id) : '';
      }
      if (r.etoll_card_id && idx['flazz_card_id'] !== undefined) {
        row[idx['flazz_card_id']] = r.etoll_card_id;
        if (idx['flazz_card_name'] !== undefined) row[idx['flazz_card_name']] = r.etoll_card_name || '';
      }
      row[idx['vehicle_id']] = vid;
      row[idx['plat_nomor']] = v ? v.plat_nomor : '';
      row[idx['nama_kendaraan']] = v ? v.nama : '';
      row[idx['jenis_kendaraan']] = v ? v.jenis : '';
      row[idx['rute_tujuan']] = String(r.rute_tujuan).trim();
      row[idx['kode_cabang']] = kodeCabang;
      row[idx['created_by']] = createdBy;
      row[idx['created_at']] = now;
      row[idx['updated_at']] = now;
      row[idx['is_deleted']] = '';
      if (idx['status'] !== undefined) row[idx['status']] = 'BELUM_DIISI';
      if (idx['laporan_id'] !== undefined) row[idx['laporan_id']] = '';
      sheet.appendRow(row);

      // Serahkan kartu etoll ke driver
      if (r.etoll_card_id) {
        const hadUsage = flazzCardHasGiveren(r.etoll_card_id);
        autoCreateFlazzUsage(r.etoll_card_id, namaDriver, vid, 'JALUR', jalurId);
        if (hadUsage) {
          warnings.push('Kartu etoll "' + (r.etoll_card_name || r.etoll_card_id) + '" masih dipakai (belum dikembalikan) untuk ' + (namaDriver || r.driver_id) + '. Proses admin sebelumnya belum selesai.');
        }
      }
    });
    if (saved > 0) {
      logAudit(userInfo, 'CREATE', 'jalur', tanggal + ' (' + saved + ' baris)', null, { tanggal: tanggal, kode_cabang: kodeCabang, jumlah: saved });
    }
    const result = { success: true, msg: saved + ' jadwal pengiriman berhasil disimpan.', saved: saved };
    if (warnings.length) result.warnings = warnings;
    return result;
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function updateJalur(data, userInfo) {
  try {
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan.');
    const found = findJalurRow(sheet, data.id);
    if (!found) throw new Error('Jadwal tidak ditemukan.');
    const idx = found.idx;
    const role = assertMasterAccess(userInfo, 'memperbarui jadwal pengiriman');
    if (role !== 'SUPERADMIN') {
      const rowCabang = (idx['kode_cabang'] !== undefined) ? String(found.row[idx['kode_cabang']] || '') : '';
      assertOwnWarehouse(userInfo, rowCabang);
    }
    const oldCard = (idx['flazz_card_id'] !== undefined) ? String(found.row[idx['flazz_card_id']] || '') : '';
    const newCard = data.etoll_card_id !== undefined ? String(data.etoll_card_id || '') : oldCard;
    if (data.tanggal !== undefined) sheet.getRange(found.rowIndex, idx['tanggal'] + 1).setValue(data.tanggal);
    if (data.rute_tujuan !== undefined) sheet.getRange(found.rowIndex, idx['rute_tujuan'] + 1).setValue(String(data.rute_tujuan).trim());
    if (data.driver_id !== undefined) {
      sheet.getRange(found.rowIndex, idx['driver_id'] + 1).setValue(data.driver_id);
      sheet.getRange(found.rowIndex, idx['nama_driver'] + 1).setValue(jalurDriverNameById(data.driver_id));
    }
    if (data.driver2_id !== undefined && idx['driver2_id'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['driver2_id'] + 1).setValue(data.driver2_id || '');
      sheet.getRange(found.rowIndex, idx['nama_driver2'] + 1).setValue(data.driver2_id ? jalurDriverNameById(data.driver2_id) : '');
    }
    if (data.vehicle_id !== undefined) {
      const v = jalurVehicleById(data.vehicle_id);
      sheet.getRange(found.rowIndex, idx['vehicle_id'] + 1).setValue(data.vehicle_id);
      sheet.getRange(found.rowIndex, idx['plat_nomor'] + 1).setValue(v ? v.plat_nomor : '');
      sheet.getRange(found.rowIndex, idx['nama_kendaraan'] + 1).setValue(v ? v.nama : '');
      sheet.getRange(found.rowIndex, idx['jenis_kendaraan'] + 1).setValue(v ? v.jenis : '');
    }
    if (data.etoll_card_id !== undefined && idx['flazz_card_id'] !== undefined) {
      sheet.getRange(found.rowIndex, idx['flazz_card_id'] + 1).setValue(data.etoll_card_id || '');
      if (idx['flazz_card_name'] !== undefined) sheet.getRange(found.rowIndex, idx['flazz_card_name'] + 1).setValue(data.etoll_card_name || '');
    }
    // Sinkronkan penyerahan kartu: kembalikan kartu lama, serahkan kartu baru
    if (oldCard !== newCard) {
      if (oldCard) returnFlazzUsage(oldCard);
      if (newCard) {
        const namaDriver = data.driver_id !== undefined ? jalurDriverNameById(data.driver_id) : String(found.row[idx['nama_driver']] || '');
        const vid = data.vehicle_id !== undefined ? data.vehicle_id : String(found.row[idx['vehicle_id']] || '');
        autoCreateFlazzUsage(newCard, namaDriver, vid, 'JALUR', String(data.id));
      }
    }
    sheet.getRange(found.rowIndex, idx['updated_at'] + 1).setValue(new Date());
    logAudit(userInfo, 'EDIT', 'jalur', data.id, null, {
      tanggal: (data.tanggal !== undefined) ? data.tanggal : found.row[idx['tanggal']],
      driver_id: (data.driver_id !== undefined) ? data.driver_id : found.row[idx['driver_id']],
      vehicle_id: (data.vehicle_id !== undefined) ? data.vehicle_id : found.row[idx['vehicle_id']],
      rute_tujuan: (data.rute_tujuan !== undefined) ? String(data.rute_tujuan).trim() : found.row[idx['rute_tujuan']],
      flazz_card_id: newCard
    });
    return { success: true, msg: 'Jadwal berhasil diperbarui.' };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function deleteJalur(id, userInfo) {
  try {
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan.');
    const found = findJalurRow(sheet, id);
    if (!found) throw new Error('Jadwal tidak ditemukan.');
    const idx = found.idx;
    const role = assertMasterAccess(userInfo, 'menghapus jadwal pengiriman');
    if (role !== 'SUPERADMIN') {
      const rowCabang = (idx['kode_cabang'] !== undefined) ? String(found.row[idx['kode_cabang']] || '') : '';
      assertOwnWarehouse(userInfo, rowCabang);
    }
    const cardId = (idx['flazz_card_id'] !== undefined) ? String(found.row[idx['flazz_card_id']] || '') : '';
    // Kembalikan kartu etoll yang diserahkan agar tidak menggantung
    if (cardId) returnFlazzUsage(cardId);
    // Hard delete: hapus baris secara fisik dari sheet
    sheet.deleteRow(found.rowIndex);
    logAudit(userInfo, 'DELETE', 'jalur', id, {
      tanggal: found.row[idx['tanggal']],
      driver_id: found.row[idx['driver_id']],
      vehicle_id: found.row[idx['vehicle_id']],
      rute_tujuan: found.row[idx['rute_tujuan']],
      flazz_card_id: cardId
    }, null);
    return { success: true, msg: 'Jadwal berhasil dihapus.' };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function getJalurByTanggal(tanggal, userInfo, opts) {
  try {
    opts = opts || {};
    const sheet = jalurSheet();
    if (!sheet) return { success: false, msg: 'Sheet Jalur_Pengiriman tidak ditemukan.' };
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iTanggal = idx['tanggal'];
    const iDeleted = idx['is_deleted'];
    const iCabang = idx['kode_cabang'];
    let filteredCabang = getJalurCabangFor(userInfo);
    // SUPERADMIN bisa memfilter per cabang via opts.cabang ('' = semua).
    if (userInfo && userInfo.role === 'SUPERADMIN') {
      filteredCabang = opts.cabang || null;
    }
    const nonSuper = userInfo && userInfo.role !== 'SUPERADMIN';
    const tanggalAkhir = opts.tanggalAkhir || '';
    // Non-SUPERADMIN wajib punya cabang; tanpa cabang tidak boleh lihat jadwal apa pun.
    if (nonSuper && !filteredCabang) return { success: true, list: [], created_by: '' };
    const list = [];
    data.forEach((row, i) => {
      if (i === 0) return;
      let finalTgl = '';
      if (iTanggal !== undefined) {
        let rowTgl = row[iTanggal];
        if (rowTgl instanceof Date) {
          const tz = getDB().getSpreadsheetTimeZone();
          rowTgl = Utilities.formatDate(rowTgl, tz, 'yyyy-MM-dd');
        } else {
          rowTgl = String(rowTgl).substring(0, 10);
        }
        const startKey = tanggal ? String(tanggal) : '';
        const endKey = tanggalAkhir || startKey;
        if (startKey && (rowTgl < startKey || rowTgl > endKey)) return;
        finalTgl = rowTgl;
      }
      if (iDeleted !== undefined && String(row[iDeleted]) === '1') return;
      if (filteredCabang && row[iCabang] !== filteredCabang) return;
      if (nonSuper && row[iCabang] !== filteredCabang) return;
      const veh = jalurVehicleById(row[idx['vehicle_id']]) || {};
      const pajakTahunan = jalurComputePajak(veh.tanggal_pajak);
      const pajak5 = jalurComputePajak(veh.tanggal_pajak_5);
      const kir = jalurComputePajak(veh.tanggal_kir);
      list.push({
        id: row[idx['id']],
        tanggal: finalTgl || String(row[idx['tanggal']]),
        driver_id: row[idx['driver_id']],
        nama_driver: row[idx['nama_driver']],
        driver2_id: row[idx['driver2_id']] || '',
        nama_driver2: row[idx['nama_driver2']] || '',
        vehicle_id: row[idx['vehicle_id']],
        plat_nomor: row[idx['plat_nomor']],
        nama_kendaraan: row[idx['nama_kendaraan']],
        jenis_kendaraan: row[idx['jenis_kendaraan']],
        rute_tujuan: row[idx['rute_tujuan']],
        kode_cabang: row[idx['kode_cabang']],
        flazz_card_id: (idx['flazz_card_id'] !== undefined) ? row[idx['flazz_card_id']] : '',
        flazz_card_name: (idx['flazz_card_name'] !== undefined) ? row[idx['flazz_card_name']] : '',
        status: (idx['status'] !== undefined) ? (row[idx['status']] || 'BELUM_DIISI') : 'BELUM_DIISI',
        laporan_id: (idx['laporan_id'] !== undefined) ? (row[idx['laporan_id']] || '') : '',
        created_by: row[idx['created_by']],
        sisa_hari_pajak: pajakTahunan.sisa_hari_pajak,
        status_pajak: pajakTahunan.status_pajak,
        sisa_hari_pajak_5: pajak5.sisa_hari_pajak,
        status_pajak_5: pajak5.status_pajak,
        sisa_hari_kir: kir.sisa_hari_pajak,
        status_kir: kir.status_pajak
      });
    });
    list.sort((a, b) => {
      if (a.tanggal !== b.tanggal) return String(b.tanggal).localeCompare(String(a.tanggal));
      
      const jenisA = String(a.jenis_kendaraan || 'Mobil').toLowerCase();
      const jenisB = String(b.jenis_kendaraan || 'Mobil').toLowerCase();
      
      if (jenisA === 'mobil' && jenisB !== 'mobil') return -1;
      if (jenisA !== 'mobil' && jenisB === 'mobil') return 1;
      if (jenisA !== jenisB) return jenisA.localeCompare(jenisB);
      
      return String(a.nama_driver || '').localeCompare(String(b.nama_driver || ''));
    });
    
    let createdBy = list.length > 0 ? list[0].created_by : '';
    if (createdBy) {
      try {
        const sheetPengguna = getDB().getSheetByName('Pengguna');
        if (sheetPengguna) {
          const pData = sheetPengguna.getDataRange().getValues();
          const pIdx = jalurColIdx(sheetPengguna);
          for (let i = 1; i < pData.length; i++) {
            if (pData[i][pIdx['username']] === createdBy || pData[i][pIdx['user_id']] === createdBy) {
              createdBy = pData[i][pIdx['nama']] || createdBy;
              break;
            }
          }
        }
      } catch (ex) {}
    }

    return { success: true, list: list, created_by: createdBy };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function backfillJalurStatus() {
  try {
    const ss = getDB();
    const jalurSheetRef = ss.getSheetByName('Jalur_Pengiriman');
    const trxSheet = ss.getSheetByName('Penggunaan_BBM');
    const reconSheet = ss.getSheetByName('Flazz_Reconciliation');
    if (!jalurSheetRef || jalurSheetRef.getLastRow() <= 1) return { success: true, msg: 'Tidak ada jalur untuk di-backfill.' };

    const jData = jalurSheetRef.getDataRange().getValues();
    const jIdx = jalurColIdx(jalurSheetRef);
    const hasStatus = jIdx['status'] !== undefined;
    const hasLaporanId = jIdx['laporan_id'] !== undefined;
    let updated = 0;

    // Pre-index laporan per (tanggal, vehicle_id, nama_supir)
    const laporanMap = {};
    if (trxSheet && trxSheet.getLastRow() > 1) {
      const tData = trxSheet.getDataRange().getValues();
      const tH = tData[0];
      const tTgl = tH.indexOf('tanggal');
      const tVeh = tH.indexOf('vehicle_id');
      const tDrv = tH.indexOf('nama_supir');
      const tId = tH.indexOf('transaction_id');
      for (let i = 1; i < tData.length; i++) {
        const key = String(tData[i][tTgl] || '').substring(0, 10) + '|' + String(tData[i][tVeh] || '') + '|' + String(tData[i][tDrv] || '');
        if (!laporanMap[key]) laporanMap[key] = String(tData[i][tId] || '');
      }
    }

    // Pre-index tanggal recon terbaru per kartu
    const reconMaxTgl = {};
    if (reconSheet && reconSheet.getLastRow() > 1) {
      const rData = reconSheet.getDataRange().getValues();
      const rH = rData[0];
      const rCard = rH.indexOf('card_id');
      const rDate = rH.indexOf('date');
      for (let i = 1; i < rData.length; i++) {
        const dStr = String(rData[i][rDate] || '').substring(0, 10);
        const cId = String(rData[i][rCard] || '');
        if (!reconMaxTgl[cId] || dStr > reconMaxTgl[cId]) reconMaxTgl[cId] = dStr;
      }
    }

    for (let i = 1; i < jData.length; i++) {
      const tgl = String(jData[i][jIdx['tanggal']] || '').substring(0, 10);
      const vid = String(jData[i][jIdx['vehicle_id']] || '');
      const drv = String(jData[i][jIdx['nama_driver']] || '');
      const cardId = (jIdx['flazz_card_id'] !== undefined) ? String(jData[i][jIdx['flazz_card_id']] || '') : '';
      const current = (jIdx['status'] !== undefined) ? String(jData[i][jIdx['status']] || '') : '';
      if (current === 'SELESAI') continue;

      const laporanId = laporanMap[tgl + '|' + vid + '|' + drv] || '';
      let newStatus = 'BELUM_DIISI';
      if (laporanId) {
        if (cardId && reconMaxTgl[cardId] && reconMaxTgl[cardId] >= tgl) newStatus = 'SELESAI';
        else newStatus = 'SUDAH_LAPORAN';
      }

      const rowIdx = i + 1;
      if (hasStatus && String(jData[i][jIdx['status']] || '') !== newStatus) {
        jalurSheetRef.getRange(rowIdx, jIdx['status'] + 1).setValue(newStatus);
        updated++;
      }
      if (hasLaporanId && laporanId && String(jData[i][jIdx['laporan_id']] || '') !== laporanId) {
        jalurSheetRef.getRange(rowIdx, jIdx['laporan_id'] + 1).setValue(laporanId);
      }
    }

    return { success: true, msg: updated + ' jalur berhasil di-backfill statusnya.' };
  } catch (e) {
    return { success: false, msg: 'Backfill gagal: ' + e.toString() };
  }
}
