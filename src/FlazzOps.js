/**
 * FlazzOps.js
 * Modul backend untuk Sistem Monitoring Kartu Flazz
 */

// Helper: Menulis baris baru ke sheet Flazz sesuai nama kolom (robust thd urutan kolom).
// Ambil username/nama dari userInfo bila disediakan.
function appendFlazzRow(sheet, values) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = {};
  headers.forEach((h, i) => { idx[String(h)] = i; });
  const row = new Array(headers.length).fill('');
  for (const key in values) {
    if (idx[key] !== undefined) row[idx[key]] = values[key];
  }
  sheet.appendRow(row);
}

// Helper: Kolom-index mapping untuk Flazz_Card (header-safe, toleran thd urutan kolom)
function getFlazzCardColIdx(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = {};
  headers.forEach((h, i) => { idx[String(h)] = i; });
  // Map nama kolom yang dikenal. Beberapa varian nama (mis. saldo / balance / last_balance)
  // ditoleransi karena header act di spreadsheet mungkin tidak persis skema DatabaseSetup.
  function findIdx(names) {
    for (let i = 0; i < names.length; i++) {
      if (idx[names[i]] !== undefined) return idx[names[i]];
    }
    return undefined;
  }
  return {
    ID: findIdx(['id', 'card_id']),
    CARD_NUMBER: findIdx(['card_number', 'number', 'no_kartu']),
    CARD_NAME: findIdx(['card_name', 'name', 'nama_kartu']),
    CARD_TYPE: findIdx(['card_type', 'type']),
    CARD_ROLE: findIdx(['card_role', 'role']),
    BRANCH: findIdx(['branch_id', 'kode_cabang', 'cabang']),
    DRIVER: findIdx(['driver_id', 'nama_supir', 'pemegang']),
    DEFAULT_DRIVER: findIdx(['default_driver_id']),
    BALANCE: findIdx(['last_balance', 'balance', 'saldo', 'saldo_terakhir', 'last balance']),
    STATUS: findIdx(['status']),
    NOTES: findIdx(['notes', 'keterangan']),
    CREATED: findIdx(['created_at']),
    UPDATED: findIdx(['updated_at'])
  };
}

// Helper: Mendapatkan sheet Flazz_Card + mapping kolom, lokasi baris berdasarkan id
function findFlazzCardRow(sheet, cardId) {
  const data = sheet.getDataRange().getValues();
  const colIdx = getFlazzCardColIdx(sheet);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx.ID]) === String(cardId)) {
      return { rowIndex: i + 1, row: data[i], colIdx: colIdx };
    }
  }
  return null;
}

// Helper: Membaca saldo kartu Flazz (return 0 bila tidak ditemukan)
function getCardBalance(cardId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return 0;
  const found = findFlazzCardRow(sheet, cardId);
  if (!found) return 0;
  return parseFloat(found.row[found.colIdx.BALANCE]) || 0;
}

// Helper: Menulis saldo kartu Flazz + updated_at
function setCardBalance(cardId, newBalance) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return;
  const found = findFlazzCardRow(sheet, cardId);
  if (!found) return;
  sheet.getRange(found.rowIndex, found.colIdx.BALANCE + 1).setValue(newBalance);
  sheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(new Date());
}

// Helper: Mendapatkan semua kartu Flazz
function getFlazzCards(userRole, cabangId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return [];

  // Non-SUPERADMIN wajib punya cabang; tanpa cabang tidak boleh lihat kartu apa pun.
  if (userRole !== 'SUPERADMIN' && !cabangId) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  let cards = [];

  for (let i = 1; i < data.length; i++) {
    let row = data[i];
    let card = {};
    for (let j = 0; j < headers.length; j++) {
      card[headers[j]] = (row[j] instanceof Date) ? row[j].toISOString() : row[j];
    }
    
    // Filter berdasarkan role
    if (userRole !== 'SUPERADMIN' && cabangId) {
      if (card.branch_id !== cabangId) continue;
    }
    cards.push(card);
  }
  return cards;
}

// Tambah/Update Kartu Master
function saveFlazzCard(cardData, userInfo) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Card');
    if (!sheet) throw new Error('Sheet Flazz_Card tidak ditemukan.');

    const now = new Date();
    const colIdx = getFlazzCardColIdx(sheet);

    const cardNumber = String(cardData.card_number || '').trim();
    if (!cardNumber) throw new Error('Nomor kartu wajib diisi.');
    if ((cardData.card_role === 'UTAMA' || cardData.card_role === 'CADANGAN') && !cardData.card_name) {
      throw new Error('Nama kartu wajib diisi untuk kartu ' + cardData.card_role + '.');
    }

    // Validasi nomor kartu unik (kecuali dirinya sendiri saat update)
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const num = String(data[i][colIdx.CARD_NUMBER] || '').trim();
      const id = String(data[i][colIdx.ID]);
      if (num === cardNumber && id !== String(cardData.id || '')) {
        throw new Error('Nomor kartu "' + cardNumber + '" sudah terdaftar.');
      }
    }

    if (cardData.id) {
      // Update existing
      const found = findFlazzCardRow(sheet, cardData.id);
      if (!found) throw new Error('Kartu tidak ditemukan.');
      const r = found.rowIndex, c = colIdx;
      sheet.getRange(r, c.CARD_NUMBER + 1).setValue(cardNumber);
      if (c.CARD_NAME !== undefined) sheet.getRange(r, c.CARD_NAME + 1).setValue(cardData.card_name || '');
      sheet.getRange(r, c.CARD_TYPE + 1).setValue(cardData.card_type);
      if (c.CARD_ROLE !== undefined) sheet.getRange(r, c.CARD_ROLE + 1).setValue(cardData.card_role || 'CADANGAN');
      sheet.getRange(r, c.BRANCH + 1).setValue(cardData.branch_id);
      sheet.getRange(r, c.DRIVER + 1).setValue(cardData.driver_id || '');
      if (c.DEFAULT_DRIVER !== undefined) sheet.getRange(r, c.DEFAULT_DRIVER + 1).setValue(cardData.driver_id || '');
      sheet.getRange(r, c.NOTES + 1).setValue(cardData.notes || '');
      sheet.getRange(r, c.UPDATED + 1).setValue(now);

      return { success: true, msg: 'Kartu berhasil diperbarui.' };
    } else {
      // Insert new (header-based, aman thd urutan kolom / kondisi sheet lama)
      const id = 'FLZ-' + now.getTime();
      appendFlazzRow(sheet, {
        id: id,
        card_number: cardNumber,
        card_name: cardData.card_name || '',
        card_type: cardData.card_type,
        card_role: cardData.card_role || 'CADANGAN',
        branch_id: cardData.branch_id,
        driver_id: cardData.driver_id || '',
        default_driver_id: cardData.driver_id || '',
        last_balance: 0,
        status: 'TERSEDIA',
        notes: cardData.notes || '',
        created_at: now,
        updated_at: now
      });
      return { success: true, msg: 'Kartu berhasil ditambahkan.' };
    }
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Catat pengeluaran Flazz (BBM)
function recordFlazzExpense(cardId, type, amount, evidenceUrl, dateStr) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const cardSheet = ss.getSheetByName('Flazz_Card');
  if (!cardSheet) return;

  const found = findFlazzCardRow(cardSheet, cardId);
  if (!found) return;

  const currentBalance = parseFloat(found.row[found.colIdx.BALANCE]) || 0;
  let newBalance = currentBalance - amount;
  if (newBalance < 0) newBalance = 0; // jaga-jaga saldo tidak negatif
  cardSheet.getRange(found.rowIndex, found.colIdx.BALANCE + 1).setValue(newBalance);
  cardSheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(new Date());
}

// Top Up Flazz
function saveFlazzTopUp(payload) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_TopUp');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!sheet || !cardSheet) throw new Error('Sheet Flazz tidak lengkap.');

    const now = new Date();
    const id = 'TOPUP-' + now.getTime();

    const amount = parseFloat(payload.amount);
    if (!amount || amount <= 0) throw new Error('Nominal top up harus lebih dari 0.');

    let evidenceUrl = '';
    if (payload.foto_bukti && payload.foto_bukti_name) {
      let uploadRes = uploadImageToDrive(payload.foto_bukti, payload.foto_bukti_name, 'Flazz_TopUp');
      if (uploadRes.success) evidenceUrl = uploadRes.fileUrl;
    }

    appendFlazzRow(sheet, {
      id: id,
      date: payload.tanggal || now,
      card_id: payload.card_id,
      amount: amount,
      evidence_url: evidenceUrl,
      notes: payload.notes || '',
      created_by: (payload.userInfo && (payload.userInfo.nama || payload.userInfo.username)) || '',
      created_at: now
    });

    const found = findFlazzCardRow(cardSheet, payload.card_id);
    if (found) {
      const currentBalance = parseFloat(found.row[found.colIdx.BALANCE]) || 0;
      cardSheet.getRange(found.rowIndex, found.colIdx.BALANCE + 1).setValue(currentBalance + amount);
      cardSheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(now);
    }
    return { success: true, msg: 'Top Up berhasil dicatat dan saldo bertambah.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Edit Top Up Flazz (sesuaikan saldo dengan selisih nominal)
function editFlazzTopUp(payload) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_TopUp');
    if (!sheet) throw new Error('Sheet Flazz_TopUp tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxId = headers.indexOf('id');
    const idxAmount = headers.indexOf('amount');
    const idxNotes = headers.indexOf('notes');
    const idxDate = headers.indexOf('date');
    const idxCard = headers.indexOf('card_id');

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxId] === payload.id) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Top up tidak ditemukan.');

    const newCard = payload.card_id || oldCard;
    const newAmount = parseFloat(payload.amount) || 0;
    const diff = newAmount - oldAmount;

    sheet.getRange(rowIndex, idxAmount + 1).setValue(newAmount);
    sheet.getRange(rowIndex, idxNotes + 1).setValue(payload.notes || '');
    if (payload.date) sheet.getRange(rowIndex, idxDate + 1).setValue(payload.date);
    if (newCard !== oldCard) sheet.getRange(rowIndex, idxCard + 1).setValue(newCard);

    // Kembalikan saldo kartu lama, potong dari kartu baru bila berbeda
    if (newCard !== oldCard) {
      setCardBalance(oldCard, (getCardBalance(oldCard) || 0) - oldAmount);
      setCardBalance(newCard, (getCardBalance(newCard) || 0) + newAmount);
    } else {
      setCardBalance(newCard, (getCardBalance(newCard) || 0) + diff);
    }

    return { success: true, msg: 'Top up berhasil diperbarui.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Hapus (soft) Top Up Flazz — tandai is_deleted dan kembalikan saldo
function deleteFlazzTopUp(id) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_TopUp');
    if (!sheet) throw new Error('Sheet Flazz_TopUp tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxId = headers.indexOf('id');
    const idxAmount = headers.indexOf('amount');
    const idxCard = headers.indexOf('card_id');
    const idxDel = headers.indexOf('is_deleted');

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxId]) === String(id)) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Top up tidak ditemukan.');

    if (idxDel > -1) {
      sheet.getRange(rowIndex, idxDel + 1).setValue('1'); // soft-delete
    } else {
      sheet.deleteRow(rowIndex);
    }
    if (oldCard) setCardBalance(oldCard, (getCardBalance(oldCard) || 0) - oldAmount);

    return { success: true, msg: 'Top up berhasil dihapus dan saldo disesuaikan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Catat Tol Flazz
function saveFlazzTol(payload) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Tol');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!sheet || !cardSheet) throw new Error('Sheet Flazz tidak lengkap.');

    const now = new Date();
    const id = 'TOL-' + now.getTime();

    const amount = parseFloat(payload.amount);
    if (!amount || amount <= 0) throw new Error('Nominal Tol harus lebih dari 0.');

    let evidenceUrl = '';
    if (payload.foto_bukti && payload.foto_bukti_name) {
      let uploadRes = uploadImageToDrive(payload.foto_bukti, payload.foto_bukti_name, 'Flazz_Tol');
      if (uploadRes.success) evidenceUrl = uploadRes.fileUrl;
    }
    if (!evidenceUrl) throw new Error('Bukti Tol wajib dilampirkan.');

    const createdBy = (payload.userInfo && (payload.userInfo.nama || payload.userInfo.username)) || '';
    appendFlazzRow(sheet, {
      id: id,
      date: payload.tanggal || now,
      card_id: payload.card_id,
      driver_id: payload.driver_id || '',
      vehicle_id: payload.vehicle_id || '',
      amount: amount,
      evidence_url: evidenceUrl,
      notes: payload.notes || '',
      created_by: createdBy,
      created_at: now
    });

    const found = findFlazzCardRow(cardSheet, payload.card_id);
    if (found) {
      const currentBalance = parseFloat(found.row[found.colIdx.BALANCE]) || 0;
      let newBalance = currentBalance - amount;
      if (newBalance < 0) newBalance = 0;
      cardSheet.getRange(found.rowIndex, found.colIdx.BALANCE + 1).setValue(newBalance);
      cardSheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(now);
    }
    return { success: true, msg: 'Pengeluaran Tol berhasil dicatat dan saldo terpotong.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Edit Tol Flazz (sesuaikan saldo dengan selisih nominal, tanda terbalik karena mengurangi saldo)
function editFlazzTol(payload) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Tol');
    if (!sheet) throw new Error('Sheet Flazz_Tol tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxId = headers.indexOf('id');
    const idxAmount = headers.indexOf('amount');
    const idxNotes = headers.indexOf('notes');
    const idxDate = headers.indexOf('date');
    const idxCard = headers.indexOf('card_id');

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxId] === payload.id) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Tol tidak ditemukan.');

    const newCard = payload.card_id || oldCard;
    const newAmount = parseFloat(payload.amount) || 0;
    const diff = oldAmount - newAmount; // tambah saldo jika nominal berkurang

    sheet.getRange(rowIndex, idxAmount + 1).setValue(newAmount);
    sheet.getRange(rowIndex, idxNotes + 1).setValue(payload.notes || '');
    if (payload.date) sheet.getRange(rowIndex, idxDate + 1).setValue(payload.date);
    if (newCard !== oldCard) sheet.getRange(rowIndex, idxCard + 1).setValue(newCard);

    if (newCard !== oldCard) {
      setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldAmount);
      setCardBalance(newCard, (getCardBalance(newCard) || 0) - newAmount);
    } else {
      setCardBalance(newCard, (getCardBalance(newCard) || 0) + diff);
    }

    return { success: true, msg: 'Tol berhasil diperbarui.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Hapus (soft) Tol Flazz — tandai is_deleted dan kembalikan saldo
function deleteFlazzTol(id) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Tol');
    if (!sheet) throw new Error('Sheet Flazz_Tol tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxId = headers.indexOf('id');
    const idxAmount = headers.indexOf('amount');
    const idxCard = headers.indexOf('card_id');
    const idxDel = headers.indexOf('is_deleted');

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxId]) === String(id)) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Tol tidak ditemukan.');

    if (idxDel > -1) {
      sheet.getRange(rowIndex, idxDel + 1).setValue('1'); // soft-delete
    } else {
      sheet.deleteRow(rowIndex);
    }
    if (oldCard) setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldAmount);

    return { success: true, msg: 'Tol berhasil dihapus dan saldo disesuaikan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Hitung ringkasan ledger Flazz untuk sebuah kartu (untuk rekonsiliasi/closing).
// Periode = transaksi yang TERCATAT sejak sinceTime (momen kartu diserahkan = used_at).
// Perbandingan memakai kolom timestamp pencatatan (created_at / timestamp), BUKAN tanggal
// input, agar transaksi yang sudah masuk opening_balance tidak ikut terhitung dua kali.
// Catatan/date yang tak terbaca dianggap DI LUAR periode (tidak dihitung).
function computeFlazzLedger(cardId, ss, sinceTime) {
  const result = { opening_balance: 0, total_topup: 0, total_bbm_flazz: 0, total_tol: 0 };
  const since = sinceTime ? new Date(sinceTime).getTime() : null;
  const after = function(v) {
    if (since === null) return true;
    let d = v;
    if (!(d instanceof Date)) {
      const parsed = new Date(v);
      if (isNaN(parsed.getTime())) return false; // tanggal tak dikenal dianggap di luar periode
      d = parsed;
    }
    return d.getTime() > since; // ketat: transaksi tepat pada momen penyerahan sudah masuk opening_balance
  };

  const topupSheet = ss.getSheetByName('Flazz_TopUp');
  if (topupSheet) {
    const data = topupSheet.getDataRange().getValues();
    const headers = data[0];
    const cCard = headers.indexOf('card_id');
    const cAmount = headers.indexOf('amount');
    const cDel = headers.indexOf('is_deleted');
    const cDate = headers.indexOf('created_at');
    const fallbackDate = headers.indexOf('date');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][cCard]) !== String(cardId)) continue;
      if (cDel > -1 && String(data[i][cDel]) === '1') continue;
      if (!after(cDate > -1 ? data[i][cDate] : data[i][fallbackDate])) continue;
      result.total_topup += parseFloat(data[i][cAmount]) || 0;
    }
  }

  const tolSheet = ss.getSheetByName('Flazz_Tol');
  if (tolSheet) {
    const data = tolSheet.getDataRange().getValues();
    const headers = data[0];
    const cCard = headers.indexOf('card_id');
    const cAmount = headers.indexOf('amount');
    const cDel = headers.indexOf('is_deleted');
    const cDate = headers.indexOf('created_at');
    const fallbackDate = headers.indexOf('date');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][cCard]) !== String(cardId)) continue;
      if (cDel > -1 && String(data[i][cDel]) === '1') continue;
      if (!after(cDate > -1 ? data[i][cDate] : data[i][fallbackDate])) continue;
      result.total_tol += parseFloat(data[i][cAmount]) || 0;
    }
  }

  const bbmSheet = ss.getSheetByName('Penggunaan_BBM');
  if (bbmSheet) {
    const data = bbmSheet.getDataRange().getValues();
    const headers = data[0];
    const cMetode = headers.indexOf('metode_pembayaran');
    const cCard = headers.indexOf('flazz_card_id');
    const cBiaya = headers.indexOf('biaya_bbm');
    const cToll = headers.indexOf('biaya_toll');
    const cStamp = headers.indexOf('timestamp');
    const fallbackStamp = headers.indexOf('tanggal');
    for (let i = 1; i < data.length; i++) {
      if (cMetode > -1 && cCard > -1 && data[i][cMetode] === 'FLAZZ' && String(data[i][cCard]) === String(cardId) && after(cStamp > -1 ? data[i][cStamp] : data[i][fallbackStamp])) {
        result.total_bbm_flazz += parseFloat(data[i][cBiaya]) || 0;
        if (cToll > -1) {
          result.total_tol += parseFloat(data[i][cToll]) || 0;
        }
      }
    }
  }

  return result;
}

// Gate rekonsiliasi: wajib minimal 1 laporan FLAZZ valid (foto KM awal+akhir terisi;
// utk tipe Bar juga KM aktual >0) pada periode kartu (timestamp > sinceDate).
// sinceDate null → semua baris dianggap dalam periode (konsisten dengan ledger).
function hasCompliantFlazzLaporan(cardId, sinceDate, ss) {
  if (!ss) ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const since = sinceDate ? new Date(sinceDate).getTime() : null;

  const kendSheet = ss.getSheetByName('Kendaraan');
  const jenisMap = {};
  if (kendSheet) {
    const kd = kendSheet.getDataRange().getValues();
    const kHeaders = kd[0];
    const kVeh = kHeaders.indexOf('vehicle_id');
    const kJenis = kHeaders.indexOf('jenis_indikator');
    for (let i = 1; i < kd.length; i++) {
      if (kVeh > -1) jenisMap[String(kd[i][kVeh])] = (kJenis > -1 && kd[i][kJenis]) ? String(kd[i][kJenis]) : 'DIGITAL_BAR';
    }
  }

  const bbmSheet = ss.getSheetByName('Penggunaan_BBM');
  if (!bbmSheet) return false;
  const data = bbmSheet.getDataRange().getValues();
  const h = data[0];
  const cMetode = h.indexOf('metode_pembayaran');
  const cCard = h.indexOf('flazz_card_id');
  const cStamp = h.indexOf('timestamp');
  const fallbackStamp = h.indexOf('tanggal');
  const cVeh = h.indexOf('vehicle_id');
  const cFotoAwal = h.indexOf('foto_km_awal');
  const cFotoAkhir = h.indexOf('foto_km_akhir');
  const cKmAwal = h.indexOf('km_awal_confirmed');
  const cKmAkhir = h.indexOf('km_akhir_confirmed');

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (cMetode > -1 && row[cMetode] !== 'FLAZZ') continue;
    if (cCard > -1 && String(row[cCard]) !== String(cardId)) continue;
    if (since !== null) {
      const stampIdx = cStamp > -1 ? cStamp : fallbackStamp;
      const raw = (stampIdx > -1) ? row[stampIdx] : null;
      const dt = (raw instanceof Date) ? raw : new Date(raw);
      if (raw === null || isNaN(dt.getTime())) continue;
      if (dt.getTime() <= since) continue;
    }

    const photoAwal = cFotoAwal > -1 ? String(row[cFotoAwal] || '').trim() : '';
    const photoAkhir = cFotoAkhir > -1 ? String(row[cFotoAkhir] || '').trim() : '';
    if (photoAwal === '' || photoAkhir === '') continue;

    const type = (cVeh > -1) ? (jenisMap[String(row[cVeh])] || 'DIGITAL_BAR') : 'DIGITAL_BAR';
    if (type === 'ANALOG_JARUM') return true;

    const kmAwal = cKmAwal > -1 ? (parseFloat(row[cKmAwal]) || 0) : 0;
    const kmAkhir = cKmAkhir > -1 ? (parseFloat(row[cKmAkhir]) || 0) : 0;
    if (kmAwal > 0 && kmAkhir > 0) return true;
  }
  return false;
}

// Endpoint untuk frontend: apa kartu boleh direkonsiliasi?
function checkReconGate(cardId) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const usageSheet = ss.getSheetByName('Flazz_Usage');
    let sinceDate = null;
    if (usageSheet) {
      const uData = usageSheet.getDataRange().getValues();
      const uHeaders = uData[0];
      const uCard = uHeaders.indexOf('card_id');
      const uStatus = uHeaders.indexOf('status');
      const uUsed = uHeaders.indexOf('used_at');
      const uDate = uHeaders.indexOf('date');
      // Loop ke bawah → menyimpan usage DIBERIKAN terakhir (pola sama dengan saveFlazzRecon)
      for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][uCard]) === String(cardId) && uData[i][uStatus] === 'DIBERIKAN') {
          const raw = (uUsed > -1 && uData[i][uUsed]) || uData[i][uDate];
          const dt = new Date(raw);
          if (!isNaN(dt.getTime())) sinceDate = dt;
        }
      }
    }
    const eligible = hasCompliantFlazzLaporan(cardId, sinceDate, ss);
    return {
      eligible: eligible,
      reason: eligible
        ? 'Laporan valid dengan foto KM awal & akhir terdeteksi.'
        : 'Belum ada laporan valid dengan foto KM awal & akhir pada periode kartu ini.'
    };
  } catch (e) {
    return { eligible: false, reason: 'Gagal memeriksa gate: ' + e.toString() };
  }
}

// Rekonsiliasi Flazz (Return & Closing)
function saveFlazzRecon(payload) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Reconciliation');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!sheet || !cardSheet) throw new Error('Sheet Flazz tidak lengkap.');

    const now = new Date();
    const id = 'RECON-' + now.getTime();

    let evidenceUrl = '';
    if (payload.foto_bukti && payload.foto_bukti_name) {
      let uploadRes = uploadImageToDrive(payload.foto_bukti, payload.foto_bukti_name, 'Flazz_Recon');
      if (uploadRes.success) evidenceUrl = uploadRes.fileUrl;
    }

    const cardFound = findFlazzCardRow(cardSheet, payload.card_id);
    if (!cardFound) throw new Error('Kartu tidak ditemukan.');

    // Cari penggunaan (DIBERIKAN) terbaru kartu untuk diambil saldo awal & awal periode
    const usageSheet = ss.getSheetByName('Flazz_Usage');
    let usageInfo = null;
    if (usageSheet) {
      const uData = usageSheet.getDataRange().getValues();
      const uHeaders = uData[0];
      const uCard = uHeaders.indexOf('card_id');
      const uStatus = uHeaders.indexOf('status');
      const uDate = uHeaders.indexOf('date');
      const uUsed = uHeaders.indexOf('used_at');
      const uOpen = uHeaders.indexOf('opening_balance');
      const uDriver = uHeaders.indexOf('driver_id');
      const uVehicle = uHeaders.indexOf('vehicle_id');
      for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][uCard]) === String(payload.card_id) && uData[i][uStatus] === 'DIBERIKAN') {
          usageInfo = { idx: i + 1, date: uData[i][uDate], usedAt: (uUsed > -1 && uData[i][uUsed]) || uData[i][uDate], opening: parseFloat(uData[i][uOpen]) || 0, driver: uData[i][uDriver] || '', vehicle: uData[i][uVehicle] || '' };
        }
      }
    }

    const openingBalanceStored = usageInfo ? usageInfo.opening : 0;
    // Batas periode = momen penyerahan kartu (used_at = waktu pencatatan, bukan tanggal input).
    // Transaksi yang tercatat sebelum momen itu sudah termasuk opening_balance, jadi periode
    // ledger hanya menghitung transaksi yang tercatat SETELAH momen penyerahan.
    let sinceDate = usageInfo && usageInfo.usedAt ? new Date(usageInfo.usedAt) : null;

    const ledger = computeFlazzLedger(payload.card_id, ss, sinceDate);

    // Opening balance: utamakan nilai tercatat di Flazz_Usage saat kartu diserahkan.
    // Bila 0/kosong (mis. rekonsiliasi tanggal laporan dikerjakan belakangan sehingga usage
    // tidak relevan), rekonstruksi dari ledger: saldo kini + pengeluaran periode - topup periode.
    const currentBalance = parseFloat(getCardBalance(payload.card_id)) || 0;
    const openingBalance = openingBalanceStored > 0
      ? openingBalanceStored
      : +((currentBalance + ledger.total_bbm_flazz + ledger.total_tol) - ledger.total_topup);
    const flazzBalance = +(openingBalance + ledger.total_topup - ledger.total_bbm_flazz - ledger.total_tol);
    const actualBalance = parseFloat(payload.actual_balance);
    const difference = +(flazzBalance - actualBalance);
    const tolerance = 1;
    const reconStatus = Math.abs(difference) <= tolerance ? 'SESUAI' : 'PERLU_PEMERIKSAAN';
    const actionStr = payload.action || (reconStatus === 'SESUAI' ? 'ADJUST' : 'IGNORE');

    appendFlazzRow(sheet, {
      id: id,
      date: payload.tanggal || now,
      card_id: payload.card_id,
      driver_id: (payload.driver_id || (usageInfo && usageInfo.driver)) || '',
      vehicle_id: (payload.vehicle_id || (usageInfo && usageInfo.vehicle)) || '',
      opening_balance: openingBalance,
      total_topup: +ledger.total_topup,
      total_bbm_flazz: +ledger.total_bbm_flazz,
      total_tol: +ledger.total_tol,
      total_expense: +(ledger.total_bbm_flazz + ledger.total_tol),
      flazz_balance: flazzBalance,
      actual_balance: actualBalance,
      difference: difference,
      reconciliation_status: reconStatus,
      notes: payload.notes || '',
      reconciled_by: (payload.userInfo && (payload.userInfo.nama || payload.userInfo.username)) || '',
      reconciled_at: now
    });

    // Update master: saldo (carry-forward), status, driver, dan tandai usage DIKEMBALIKAN
    const r = cardFound.rowIndex, c = cardFound.colIdx;
    // Carry-forward: gunakan actual_balance bila SESUAI/ADJUST, selain itu tetap flazz_balance
    if (reconStatus === 'SESUAI' || actionStr === 'ADJUST') {
      cardSheet.getRange(r, c.BALANCE + 1).setValue(actualBalance);
    } else {
      cardSheet.getRange(r, c.BALANCE + 1).setValue(flazzBalance);
    }
    cardSheet.getRange(r, c.STATUS + 1).setValue('TERSEDIA');
    // Pulihkan supir pemegang default (nilai settingsan master), bukan dihapus
    cardSheet.getRange(r, c.DRIVER + 1).setValue(cardFound.row[c.DEFAULT_DRIVER] || '');
    cardSheet.getRange(r, c.UPDATED + 1).setValue(now);

    // Tandai usage terbaru kartu sebagai DIKEMBALIKAN
    if (usageSheet && usageInfo) {
      const uData = usageSheet.getDataRange().getValues();
      const uHeaders = uData[0];
      const uStatus = uHeaders.indexOf('status');
      const uReturned = uHeaders.indexOf('returned_at');
      if (uStatus > -1) usageSheet.getRange(usageInfo.idx, uStatus + 1).setValue('DIKEMBALIKAN');
      if (uReturned > -1) usageSheet.getRange(usageInfo.idx, uReturned + 1).setValue(now);
    }

    return { success: true, msg: 'Rekonsiliasi disimpan. Status: ' + reconStatus + '. Kartu tersedia kembali.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Assign/Usage Flazz (Berikan ke Supir)
function saveFlazzUsage(payload) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Usage');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!sheet || !cardSheet) throw new Error('Sheet Flazz tidak lengkap.');

    const now = new Date();
    const id = 'USE-' + now.getTime();

    const usageType = payload.usage_type || 'PRIMARY';
    const cardId = payload.card_id;
    const currentBalance = getCardBalance(cardId);

    appendFlazzRow(sheet, {
      id: id,
      date: payload.tanggal || now,
      card_id: cardId,
      driver_id: payload.driver_id || '',
      vehicle_id: payload.vehicle_id || '',
      usage_type: usageType,
      primary_card_id: payload.primary_card_id || '',
      backup_card_id: payload.backup_card_id || '',
      reason: payload.reason || '',
      opening_balance: currentBalance,
      used_at: now,
      status: 'DIBERIKAN',
      notes: payload.notes || '',
      created_by: (payload.userInfo && (payload.userInfo.nama || payload.userInfo.username)) || '',
      created_at: now
    });

    // Update status di Master
    const found = findFlazzCardRow(cardSheet, cardId);
    if (found) {
      cardSheet.getRange(found.rowIndex, found.colIdx.DRIVER + 1).setValue(payload.driver_id || '');
      cardSheet.getRange(found.rowIndex, found.colIdx.STATUS + 1).setValue('SEDANG_DIGUNAKAN');
      cardSheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(now);
    }

    return { success: true, msg: 'Kartu berhasil diberikan ke supir.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Helper: Kembalikan kartu (balikkan penyerahan) tanpa hitung saldo.
// Menandai semua usage DIBERIKAN kartu → DIKEMBALIKAN + returned_at,
// dan mengembalikan status master kartu → TERSEDIA (pemegang → default).
// Dipakai saat edit/hapus Jalur Pengiriman agar kartu tidak menggantung.
function returnFlazzUsage(cardId) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const usageSheet = ss.getSheetByName('Flazz_Usage');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!usageSheet || !cardSheet) return { success: false, msg: 'Sheet Flazz tidak lengkap.' };

    const now = new Date();
    let marked = 0;

    // Tandai semua usage kartu yang masih DIBERIKAN sebagai DIKEMBALIKAN
    if (usageSheet.getLastRow() > 1) {
      const uData = usageSheet.getDataRange().getValues();
      const uHeaders = uData[0];
      const uCard = uHeaders.indexOf('card_id');
      const uStatus = uHeaders.indexOf('status');
      const uReturned = uHeaders.indexOf('returned_at');
      for (let i = 1; i < uData.length; i++) {
        if (uCard > -1 && String(uData[i][uCard]) === String(cardId) && uStatus > -1 && uData[i][uStatus] === 'DIBERIKAN') {
          if (uStatus > -1) usageSheet.getRange(i + 1, uStatus + 1).setValue('DIKEMBALIKAN');
          if (uReturned > -1) usageSheet.getRange(i + 1, uReturned + 1).setValue(now);
          marked++;
        }
      }
    }

    // Kembalikan status master kartu → TERSEDIA jika sedang dipakai, pemegang → default
    const found = findFlazzCardRow(cardSheet, cardId);
    if (found && found.colIdx.STATUS !== undefined) {
      if (String(found.row[found.colIdx.STATUS]) === 'SEDANG_DIGUNAKAN') {
        cardSheet.getRange(found.rowIndex, found.colIdx.STATUS + 1).setValue('TERSEDIA');
      }
      if (found.colIdx.DRIVER !== undefined) {
        const def = (found.colIdx.DEFAULT_DRIVER !== undefined) ? found.row[found.colIdx.DEFAULT_DRIVER] : '';
        cardSheet.getRange(found.rowIndex, found.colIdx.DRIVER + 1).setValue(def || '');
      }
      if (found.colIdx.UPDATED !== undefined) {
        cardSheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(now);
      }
    }

    return { success: true, msg: 'Kartu dikembalikan.', marked: marked };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

function getFlazzDashboardData(userRole, cabangId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  
  function getSheetData(sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    let result = [];
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      let obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = (row[j] instanceof Date) ? row[j].toISOString() : row[j];
      }
      result.push(obj);
    }
    return result;
  }

  let cards = getSheetData('Flazz_Card');
  // Filter berdasarkan role; non-SUPERADMIN tanpa cabang tidak boleh melihat kartu apa pun.
  if (userRole !== 'SUPERADMIN') {
    if (!cabangId) cards = [];
    else cards = cards.filter(c => c.branch_id === cabangId);
  }

  let cardIds = cards.map(c => c.id);

  let topups = getSheetData('Flazz_TopUp').filter(t => cardIds.includes(t.card_id) && String(t.is_deleted || '') !== '1');
  let tols = getSheetData('Flazz_Tol').filter(t => cardIds.includes(t.card_id) && String(t.is_deleted || '') !== '1');
  let usages = getSheetData('Flazz_Usage').filter(u => cardIds.includes(u.card_id));
  let recons = getSheetData('Flazz_Reconciliation').filter(r => cardIds.includes(r.card_id));

  // Ambil history pemotongan BBM dari Penggunaan_BBM jika perlu, tapi kita cuma baca yang flazz
  let bbmSheet = ss.getSheetByName('Penggunaan_BBM');
  let bbmFlazz = [];
  if (bbmSheet) {
    const bbmData = bbmSheet.getDataRange().getValues();
    if (bbmData.length > 1) {
       // metode_pembayaran index 27 (0-indexed) = 27 ? Let's check headers in SpreadsheetOps: 
       // transaction_id=0 ... metode_pembayaran is 27, flazz_card_id is 28.
       // It's safer to map by header.
       const headers = bbmData[0];
       const trxIdx = headers.indexOf('transaction_id');
       const metodeIdx = headers.indexOf('metode_pembayaran');
       const cardIdx = headers.indexOf('flazz_card_id');
       const tglIdx = headers.indexOf('tanggal');
       const stampIdx = headers.indexOf('timestamp');
       const bbmIdx = headers.indexOf('biaya_bbm');
       const tollIdx = headers.indexOf('biaya_toll');
       const evidenceIdx = headers.indexOf('foto_struk_bbm');
       const driverIdx = headers.indexOf('nama_supir');
       const vehicleIdx = headers.indexOf('plat_nomor');

       for (let i = 1; i < bbmData.length; i++) {
         let row = bbmData[i];
         if (metodeIdx > -1 && row[metodeIdx] === 'FLAZZ' && cardIds.includes(row[cardIdx])) {
            bbmFlazz.push({
               transaction_id: row[trxIdx],
               tanggal: (row[tglIdx] instanceof Date) ? row[tglIdx].toISOString() : row[tglIdx],
               timestamp: (stampIdx > -1 && row[stampIdx] instanceof Date) ? row[stampIdx].toISOString() : (stampIdx > -1 ? row[stampIdx] : ''),
               card_id: row[cardIdx],
               amount: parseFloat(row[bbmIdx]) || 0,
               toll_amount: tollIdx > -1 ? (parseFloat(row[tollIdx]) || 0) : 0,
               evidence: row[evidenceIdx],
               driver: row[driverIdx],
               vehicle: row[vehicleIdx]
            });
         }
       }
    }
  }

  return {
    cards: cards,
    topups: topups.reverse(),
    tols: tols.reverse(),
    usages: usages.reverse(),
    recons: recons.reverse(),
    bbmFlazz: bbmFlazz.reverse()
  };
}
// Nonaktifkan Kartu Flazz (soft-delete, tidak menghapus baris)
function deleteFlazzCard(cardId) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Card');
    if (!sheet) throw new Error('Sheet Flazz_Card tidak ditemukan.');

    const found = findFlazzCardRow(sheet, cardId);
    if (!found) throw new Error('Kartu tidak ditemukan.');

    // Jangan nonaktifkan jika saldo belum 0 atau masih digunakan
    const status = String(found.row[found.colIdx.STATUS] || '');
    const balance = parseFloat(found.row[found.colIdx.BALANCE]) || 0;

    if (status === 'SEDANG_DIGUNAKAN') throw new Error('Tidak bisa menonaktifkan kartu yang sedang digunakan supir.');
    if (balance > 0) throw new Error('Tidak bisa menonaktifkan kartu yang masih memiliki saldo.');

    // Soft-delete: ubah status menjadi NONAKTIF + lepaskan pemegang
    sheet.getRange(found.rowIndex, found.colIdx.STATUS + 1).setValue('NONAKTIF');
    if (found.colIdx.DRIVER !== undefined) sheet.getRange(found.rowIndex, found.colIdx.DRIVER + 1).setValue('');
    sheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(new Date());
    return { success: true, msg: 'Kartu berhasil dinonaktifkan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

function activateFlazzCard(id) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Card');
    if (!sheet) throw new Error('Sheet Flazz_Card tidak ditemukan.');

    const found = findFlazzCardRow(sheet, id);
    if (!found) throw new Error('Kartu tidak ditemukan.');

    const status = String(found.row[found.colIdx.STATUS] || '');
    if (status !== 'NONAKTIF') throw new Error('Kartu ini belum dinonaktifkan.');

    sheet.getRange(found.rowIndex, found.colIdx.STATUS + 1).setValue('TERSEDIA');
    sheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(new Date());
    return { success: true, msg: 'Kartu berhasil diaktifkan kembali menjadi TERSEDIA.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Hapus/lepas transaksi BBM Flazz dari Penggunaan_BBM
// mode 'full'   : hapus baris total + kembalikan saldo
// mode 'detach' : kosongkan metode_pembayaran & flazz_card_id, baris tetap, kembalikan saldo
function deleteFlazzBBM(transactionId, mode) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) throw new Error('Sheet Penggunaan_BBM tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxTrx = headers.indexOf('transaction_id');
    const idxMetode = headers.indexOf('metode_pembayaran');
    const idxCard = headers.indexOf('flazz_card_id');
    const idxBiaya = headers.indexOf('biaya_bbm');

    let rowIndex = -1, isFlazz = false, biaya = 0, cardId = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxTrx]) === String(transactionId)) {
        rowIndex = i + 1;
        isFlazz = data[i][idxMetode] === 'FLAZZ';
        biaya = parseFloat(data[i][idxBiaya]) || 0;
        cardId = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Transaksi BBM tidak ditemukan.');

    if (mode === 'detach') {
      sheet.getRange(rowIndex, idxMetode + 1).setValue('');
      sheet.getRange(rowIndex, idxCard + 1).setValue('');
    } else {
      sheet.deleteRow(rowIndex);
    }

    if (isFlazz && cardId) {
      setCardBalance(cardId, (getCardBalance(cardId) || 0) + biaya);
    }

    return { success: true, msg: mode === 'detach' ? 'Transaksi dilepas dari Flazz dan saldo dikembalikan.' : 'Transaksi BBM dihapus dan saldo dikembalikan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}
