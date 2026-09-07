/**
 * JalurOps.js
 * Modul backend untuk Sistem Monitoring Jalur Pengiriman
 */

function jalurSheet() {
  return SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSheetByName('Jalur_Pengiriman');
}

// Cek apakah kartu etoll sedang punya catatan DIBERIKAN (masih dipakai)
function flazzCardHasGiveren(cardId) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
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

function getJalurCabangFor(userInfo) {
  if (userInfo && userInfo.role === 'SUPERADMIN') return null; // null = semua cabang
  return (userInfo && userInfo.cabang) || '';
}

function jalurDriverNameById(driverId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const s = ss.getSheetByName('Supir');
  if (!s) return '';
  const data = s.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(driverId)) return data[i][1];
  }
  return '';
}

function jalurVehicleById(vehicleId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
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
    const tz = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSpreadsheetTimeZone();
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
    const tanggal = payload.tanggal;
    const rows = payload.rows || [];
    if (!tanggal || rows.length === 0) throw new Error('Tanggal dan minimal satu baris wajib diisi.');
    const idx = jalurColIdx(sheet);
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
      row[idx['id']] = 'JLR-' + now.getTime() + '-' + (saved++);
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
      sheet.appendRow(row);

      // Serahkan kartu etoll ke driver
      if (r.etoll_card_id) {
        const hadUsage = flazzCardHasGiveren(r.etoll_card_id);
        autoCreateFlazzUsage(r.etoll_card_id, namaDriver, vid);
        if (hadUsage) {
          warnings.push('Kartu etoll "' + (r.etoll_card_name || r.etoll_card_id) + '" masih dipakai (belum dikembalikan) untuk ' + (namaDriver || r.driver_id) + '. Proses admin sebelumnya belum selesai.');
        }
      }
    });
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
        autoCreateFlazzUsage(newCard, namaDriver, vid);
      }
    }
    sheet.getRange(found.rowIndex, idx['updated_at'] + 1).setValue(new Date());
    return { success: true, msg: 'Jadwal berhasil diperbarui.' };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function deleteJalur(id) {
  try {
    const sheet = jalurSheet();
    if (!sheet) throw new Error('Sheet Jalur_Pengiriman tidak ditemukan.');
    const found = findJalurRow(sheet, id);
    if (!found) throw new Error('Jadwal tidak ditemukan.');
    const idx = found.idx;
    const cardId = (idx['flazz_card_id'] !== undefined) ? String(found.row[idx['flazz_card_id']] || '') : '';
    // Kembalikan kartu etoll yang diserahkan agar tidak menggantung
    if (cardId) returnFlazzUsage(cardId);
    // Hard delete: hapus baris secara fisik dari sheet
    sheet.deleteRow(found.rowIndex);
    return { success: true, msg: 'Jadwal berhasil dihapus.' };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}

function getJalurByTanggal(tanggal, userInfo) {
  try {
    const sheet = jalurSheet();
    if (!sheet) return { success: false, msg: 'Sheet Jalur_Pengiriman tidak ditemukan.' };
    const data = sheet.getDataRange().getValues();
    const idx = jalurColIdx(sheet);
    const iTanggal = idx['tanggal'];
    const iDeleted = idx['is_deleted'];
    const iCabang = idx['kode_cabang'];
    const filteredCabang = getJalurCabangFor(userInfo);
    const nonSuper = userInfo && userInfo.role !== 'SUPERADMIN';
    // Non-SUPERADMIN wajib punya cabang; tanpa cabang tidak boleh lihat jadwal apa pun.
    if (nonSuper && !filteredCabang) return { success: true, list: [], created_by: '' };
    const list = [];
    data.forEach((row, i) => {
      if (i === 0) return;
      let finalTgl = '';
      if (iTanggal !== undefined) {
        let rowTgl = row[iTanggal];
        if (rowTgl instanceof Date) {
          const tz = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSpreadsheetTimeZone();
          rowTgl = Utilities.formatDate(rowTgl, tz, 'yyyy-MM-dd');
        } else {
          rowTgl = String(rowTgl).substring(0, 10);
        }
        if (tanggal && rowTgl !== String(tanggal)) return;
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
        const sheetPengguna = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSheetByName('Pengguna');
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
