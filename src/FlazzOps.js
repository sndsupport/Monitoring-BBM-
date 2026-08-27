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

// Helper: Membaca saldo kartu Flazz (return 0 bila tidak ditemukan)
function getCardBalance(cardId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return 0;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === cardId) return parseFloat(data[i][5]) || 0;
  }
  return 0;
}

// Helper: Menulis saldo kartu Flazz + updated_at
function setCardBalance(cardId, newBalance) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === cardId) {
      sheet.getRange(i + 1, 6).setValue(newBalance);
      sheet.getRange(i + 1, 10).setValue(new Date());
      break;
    }
  }
}

// Helper: Mendapatkan semua kartu Flazz
function getFlazzCards(userRole, cabangId) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return [];

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
    
    if (cardData.id) {
      // Update existing
      const data = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === cardData.id) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex === -1) throw new Error('Kartu tidak ditemukan.');
      
      // Update values
      sheet.getRange(rowIndex, 2).setValue(cardData.card_number);
      sheet.getRange(rowIndex, 3).setValue(cardData.card_type);
      sheet.getRange(rowIndex, 4).setValue(cardData.branch_id);
      sheet.getRange(rowIndex, 5).setValue(cardData.driver_id || '');
      sheet.getRange(rowIndex, 8).setValue(cardData.notes || '');
      sheet.getRange(rowIndex, 10).setValue(now);
      
      return { success: true, msg: 'Kartu berhasil diperbarui.' };
    } else {
      // Insert new
      const id = 'FLZ-' + now.getTime();
      sheet.appendRow([
        id,
        cardData.card_number,
        cardData.card_type,
        cardData.branch_id,
        cardData.driver_id || '',
        0, // Saldo awal 0
        'TERSEDIA',
        cardData.notes || '',
        now,
        now
      ]);
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

  const data = cardSheet.getDataRange().getValues();
  let rowIndex = -1;
  let currentBalance = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === cardId) {
      rowIndex = i + 1;
      currentBalance = parseFloat(data[i][5]) || 0;
      break;
    }
  }

  if (rowIndex > -1) {
    let newBalance = currentBalance - amount;
    cardSheet.getRange(rowIndex, 6).setValue(newBalance);
    cardSheet.getRange(rowIndex, 10).setValue(new Date());
  }
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
    
    let evidenceUrl = '';
    if (payload.foto_bukti && payload.foto_bukti_name) {
      let uploadRes = uploadImageToDrive(payload.foto_bukti, payload.foto_bukti_name, 'Flazz_TopUp');
      if (uploadRes.success) evidenceUrl = uploadRes.fileUrl;
    }
    if (!evidenceUrl) throw new Error('Bukti top up wajib dilampirkan.');

    appendFlazzRow(sheet, {
      id: id,
      date: payload.tanggal || now,
      card_id: payload.card_id,
      amount: parseFloat(payload.amount),
      evidence_url: evidenceUrl,
      notes: payload.notes || '',
      created_by: (payload.userInfo && (payload.userInfo.nama || payload.userInfo.username)) || '',
      created_at: now
    });

    const data = cardSheet.getDataRange().getValues();
    let rowIndex = -1;
    let currentBalance = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === payload.card_id) {
        rowIndex = i + 1;
        currentBalance = parseFloat(data[i][5]) || 0;
        break;
      }
    }
    if (rowIndex > -1) {
      let newBalance = currentBalance + parseFloat(payload.amount);
      cardSheet.getRange(rowIndex, 6).setValue(newBalance);
      cardSheet.getRange(rowIndex, 10).setValue(now);
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

// Hapus Top Up Flazz (kembalikan saldo)
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

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxId] === id) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Top up tidak ditemukan.');

    sheet.deleteRow(rowIndex);
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

    let evidenceUrl = '';
    if (payload.foto_bukti && payload.foto_bukti_name) {
      let uploadRes = uploadImageToDrive(payload.foto_bukti, payload.foto_bukti_name, 'Flazz_Tol');
      if (uploadRes.success) evidenceUrl = uploadRes.fileUrl;
    }
    if (!evidenceUrl) throw new Error('Bukti Tol wajib dilampirkan.');

    sheet.appendRow([
      id, payload.tanggal || now, payload.card_id, payload.driver_id, payload.vehicle_id, 
      parseFloat(payload.amount), evidenceUrl, payload.notes || '', payload.userInfo.username, now
    ]);

    const data = cardSheet.getDataRange().getValues();
    let rowIndex = -1;
    let currentBalance = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === payload.card_id) {
        rowIndex = i + 1;
        currentBalance = parseFloat(data[i][5]) || 0;
        break;
      }
    }
    if (rowIndex > -1) {
      let newBalance = currentBalance - parseFloat(payload.amount);
      cardSheet.getRange(rowIndex, 6).setValue(newBalance);
      cardSheet.getRange(rowIndex, 10).setValue(now);
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

// Hapus Tol Flazz (kembalikan saldo)
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

    let rowIndex = -1, oldAmount = 0, oldCard = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][idxId] === id) {
        rowIndex = i + 1;
        oldAmount = parseFloat(data[i][idxAmount]) || 0;
        oldCard = data[i][idxCard];
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Tol tidak ditemukan.');

    sheet.deleteRow(rowIndex);
    if (oldCard) setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldAmount);

    return { success: true, msg: 'Tol berhasil dihapus dan saldo disesuaikan.' };
  } catch (err) {
    return { success: false, msg: err.message };
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

    let actualBalance = parseFloat(payload.actual_balance);
    let systemBalance = parseFloat(payload.system_balance);
    let variance = actualBalance - systemBalance;
    let actionStr = payload.action; // 'ADJUST' atau 'IGNORE'

    sheet.appendRow([
      id, payload.tanggal || now, payload.card_id, systemBalance, actualBalance, variance, 
      evidenceUrl, actionStr, payload.notes || '', payload.userInfo.username, now
    ]);

    // Update Master jika adjust atau status kembali
    const data = cardSheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === payload.card_id) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex > -1) {
      if (actionStr === 'ADJUST') {
        cardSheet.getRange(rowIndex, 6).setValue(actualBalance); // saldo = actual
      }
      cardSheet.getRange(rowIndex, 7).setValue('TERSEDIA'); // status jadi tersedia (dikembalikan)
      cardSheet.getRange(rowIndex, 5).setValue(''); // driver_id kosong
      cardSheet.getRange(rowIndex, 10).setValue(now);
    }
    
    return { success: true, msg: 'Rekonsiliasi berhasil disimpan. Kartu sekarang tersedia.' };
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

    sheet.appendRow([
      id, payload.tanggal || now, payload.card_id, payload.driver_id, payload.vehicle_id, 
      payload.usage_type, // PRIMARY or BACKUP
      'DIBERIKAN', payload.notes || '', payload.userInfo.username, now
    ]);

    // Update status di Master
    const data = cardSheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === payload.card_id) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex > -1) {
      cardSheet.getRange(rowIndex, 5).setValue(payload.driver_id);
      cardSheet.getRange(rowIndex, 7).setValue('SEDANG_DIGUNAKAN');
      cardSheet.getRange(rowIndex, 10).setValue(now);
    }
    
    return { success: true, msg: 'Kartu berhasil diberikan ke supir.' };
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
  // Filter berdasarkan role
  if (userRole !== 'SUPERADMIN' && cabangId) {
    cards = cards.filter(c => c.branch_id === cabangId);
  }

  let cardIds = cards.map(c => c.id);

  let topups = getSheetData('Flazz_TopUp').filter(t => cardIds.includes(t.card_id));
  let tols = getSheetData('Flazz_Tol').filter(t => cardIds.includes(t.card_id));
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
       const bbmIdx = headers.indexOf('biaya_bbm');
       const evidenceIdx = headers.indexOf('foto_struk_bbm');
       const driverIdx = headers.indexOf('nama_supir');
       const vehicleIdx = headers.indexOf('plat_nomor');

       for (let i = 1; i < bbmData.length; i++) {
         let row = bbmData[i];
         if (metodeIdx > -1 && row[metodeIdx] === 'FLAZZ' && cardIds.includes(row[cardIdx])) {
            bbmFlazz.push({
               transaction_id: row[trxIdx],
               tanggal: (row[tglIdx] instanceof Date) ? row[tglIdx].toISOString() : row[tglIdx],
               card_id: row[cardIdx],
               amount: row[bbmIdx],
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
// Hapus Kartu Flazz
function deleteFlazzCard(cardId) {
  try {
    const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
    const sheet = ss.getSheetByName('Flazz_Card');
    if (!sheet) throw new Error('Sheet Flazz_Card tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === cardId) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) throw new Error('Kartu tidak ditemukan.');
    
    // Jangan hapus jika saldo belum 0 atau masih digunakan
    let status = data[rowIndex-1][6];
    let balance = parseFloat(data[rowIndex-1][5]) || 0;
    
    if(status === 'SEDANG_DIGUNAKAN') throw new Error('Tidak bisa menghapus kartu yang sedang digunakan supir.');
    if(balance > 0) throw new Error('Tidak bisa menghapus kartu yang masih memiliki saldo.');
    
    sheet.deleteRow(rowIndex);
    return { success: true, msg: 'Kartu berhasil dihapus.' };
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
