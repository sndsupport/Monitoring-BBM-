/**
 * JalurOps.js
 * Modul backend untuk Sistem Monitoring Jalur Pengiriman
 */

function jalurSheet() {
  return SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8').getSheetByName('Jalur_Pengiriman');
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
        tanggal_pajak: (ci['tanggal_pajak'] !== undefined) ? data[i][ci['tanggal_pajak']] : ''
      };
    }
  }
  return null;
}

function jalurComputePajak(tanggalPajakStr) {
  if (!tanggalPajakStr) return { sisa_hari_pajak: null, status_pajak: 'TIDAK_ADA' };
  const due = new Date(String(tanggalPajakStr).slice(0, 10) + 'T00:00:00');
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
    const createdBy = (userInfo && (userInfo.username || userInfo.nama)) || '';
    const kodeCabang = (userInfo && userInfo.cabang) || '';
    const now = new Date();
    let saved = 0;
    rows.forEach(r => {
      if (!r || !r.driver_id || !r.vehicle_id || !String(r.rute_tujuan || '').trim()) return;
      const vid = r.vehicle_id;
      const v = jalurVehicleById(vid);
      const row = new Array(Object.keys(idx).length).fill('');
      row[idx['id']] = 'JLR-' + now.getTime() + '-' + (saved++);
      row[idx['tanggal']] = tanggal;
      row[idx['driver_id']] = r.driver_id;
      row[idx['nama_driver']] = jalurDriverNameById(r.driver_id);
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
    });
    return { success: true, msg: saved + ' jadwal pengiriman berhasil disimpan.', saved: saved };
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
    if (data.tanggal !== undefined) sheet.getRange(found.rowIndex, idx['tanggal'] + 1).setValue(data.tanggal);
    if (data.rute_tujuan !== undefined) sheet.getRange(found.rowIndex, idx['rute_tujuan'] + 1).setValue(String(data.rute_tujuan).trim());
    if (data.driver_id !== undefined) {
      sheet.getRange(found.rowIndex, idx['driver_id'] + 1).setValue(data.driver_id);
      sheet.getRange(found.rowIndex, idx['nama_driver'] + 1).setValue(jalurDriverNameById(data.driver_id));
    }
    if (data.vehicle_id !== undefined) {
      const v = jalurVehicleById(data.vehicle_id);
      sheet.getRange(found.rowIndex, idx['vehicle_id'] + 1).setValue(data.vehicle_id);
      sheet.getRange(found.rowIndex, idx['plat_nomor'] + 1).setValue(v ? v.plat_nomor : '');
      sheet.getRange(found.rowIndex, idx['nama_kendaraan'] + 1).setValue(v ? v.nama : '');
      sheet.getRange(found.rowIndex, idx['jenis_kendaraan'] + 1).setValue(v ? v.jenis : '');
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
    if (found.idx['is_deleted'] !== undefined) {
      sheet.getRange(found.rowIndex, found.idx['is_deleted'] + 1).setValue('1');
    } else {
      sheet.deleteRow(found.rowIndex);
    }
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
    const list = [];
    data.forEach((row, i) => {
      if (i === 0) return;
      if (iTanggal !== undefined && String(row[iTanggal]) !== String(tanggal)) return;
      if (iDeleted !== undefined && String(row[iDeleted]) === '1') return;
      if (filteredCabang && row[iCabang] !== filteredCabang) return;
      const veh = jalurVehicleById(row[idx['vehicle_id']]) || {};
      const pajak = jalurComputePajak(veh.tanggal_pajak);
      list.push({
        id: row[idx['id']],
        tanggal: row[idx['tanggal']],
        driver_id: row[idx['driver_id']],
        nama_driver: row[idx['nama_driver']],
        vehicle_id: row[idx['vehicle_id']],
        plat_nomor: row[idx['plat_nomor']],
        nama_kendaraan: row[idx['nama_kendaraan']],
        jenis_kendaraan: row[idx['jenis_kendaraan']],
        rute_tujuan: row[idx['rute_tujuan']],
        kode_cabang: row[idx['kode_cabang']],
        created_by: row[idx['created_by']],
        sisa_hari_pajak: pajak.sisa_hari_pajak,
        status_pajak: pajak.status_pajak
      });
    });
    list.sort((a, b) => String(a.nama_driver || '').localeCompare(String(b.nama_driver || '')));
    const createdBy = list.length > 0 ? list[0].created_by : '';
    return { success: true, list: list, created_by: createdBy };
  } catch (e) {
    return { success: false, msg: e.message };
  }
}
