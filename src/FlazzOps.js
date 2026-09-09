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
  const ss = getDB();
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return 0;
  const found = findFlazzCardRow(sheet, cardId);
  if (!found) return 0;
  return parseFloat(found.row[found.colIdx.BALANCE]) || 0;
}

// Helper: Menulis saldo kartu Flazz + updated_at
function setCardBalance(cardId, newBalance) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return;
  const found = findFlazzCardRow(sheet, cardId);
  if (!found) return;
  sheet.getRange(found.rowIndex, found.colIdx.BALANCE + 1).setValue(newBalance);
  sheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(new Date());
}

// Validasi akses server-side untuk operasi Flazz.
// SUPERADMIN penuh; PIC CABANG hanya pada kartu warehouse miliknya.
function assertFlazzAccess(userInfo, branchId) {
  const role = assertMasterAccess(userInfo, 'mengelola data Flazz');
  if (role === 'SUPERADMIN') return;
  if (String(branchId || '') !== String(userInfo.cabang || '')) {
    throw new Error('Akses ditolak: Anda hanya dapat mengelola kartu warehouse ' + userInfo.cabang + '.');
  }
}

// Backfill nama kartu ke semua jalur pengiriman yang memakai kartu etoll ini.
function backfillFlazzCardName(cardId, cardName) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Jalur_Pengiriman');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;
    const headers = data[0];
    const idIdx = headers.indexOf('flazz_card_id');
    const nameIdx = headers.indexOf('flazz_card_name');
    if (idIdx < 0 || nameIdx < 0) return;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx] || '') === String(cardId || '')) {
        sheet.getRange(i + 1, nameIdx + 1).setValue(cardName || '');
      }
    }
  } catch (e) {
    // Backfill bersifat best-effort; jangan gagalkan simpan kartu utama.
  }
}

// Ambil branch dari sebuah kartu ('' bila kartu tidak ditemukan / kolom kosong)
function flazzCardBranch(cardId) {
  const ss = getDB();
  const sheet = ss.getSheetByName('Flazz_Card');
  if (!sheet) return '';
  const found = findFlazzCardRow(sheet, cardId);
  if (!found || found.colIdx.BRANCH === undefined) return '';
  return String(found.row[found.colIdx.BRANCH] || '');
}

// Helper: Mendapatkan semua kartu Flazz
function getFlazzCards(userRole, cabangId) {
  const ss = getDB();
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
    assertFlazzAccess(userInfo, cardData.branch_id);
    const ss = getDB();
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
      assertFlazzAccess(userInfo, found.row[found.colIdx.BRANCH]);
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

      // Backfill nama kartu ke jalur pengiriman yang memakai kartu ini agar tetap konsisten
      backfillFlazzCardName(cardData.id, cardData.card_name || '');

      logAudit(userInfo, 'EDIT', 'flazz', 'Kartu ' + cardData.id, null, { id: cardData.id, card_number: cardNumber, card_name: cardData.card_name || '', branch_id: cardData.branch_id });
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
      logAudit(userInfo, 'CREATE', 'flazz', 'Kartu ' + id, null, { id: id, card_number: cardNumber, card_name: cardData.card_name || '', branch_id: cardData.branch_id });
      return { success: true, msg: 'Kartu berhasil ditambahkan.' };
    }
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Catat pengeluaran Flazz (BBM)
function recordFlazzExpense(cardId, type, amount, evidenceUrl, dateStr) {
  const ss = getDB();
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
  return withLock('flazz-topup', function() {
    return saveFlazzTopUpUnlocked(payload);
  });
}

function saveFlazzTopUpUnlocked(payload) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Flazz_TopUp');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!sheet || !cardSheet) throw new Error('Sheet Flazz tidak lengkap.');

    assertFlazzAccess(payload.userInfo, flazzCardBranch(payload.card_id));

    const now = new Date();
    const id = 'TOPUP-' + now.getTime();

    const amount = parseFloat(payload.amount);
    if (!amount || amount <= 0) throw new Error('Nominal top up harus lebih dari 0.');

    let evidenceUrl = '';
    if (payload.foto_bukti && payload.foto_bukti_name) {
      let uploadRes = uploadImageToDrive(payload.foto_bukti, payload.foto_bukti_name, 'Flazz_TopUp', payload.userInfo ? payload.userInfo.cabang : '');
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
    logAudit(payload.userInfo, 'CREATE', 'flazz', 'TopUp ' + id, null, { id: id, card_id: payload.card_id, amount: amount });
    return { success: true, msg: 'Top Up berhasil dicatat dan saldo bertambah.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Edit Top Up Flazz (sesuaikan saldo dengan selisih nominal)
function editFlazzTopUp(payload, userInfo) {
  return withLock('flazz-edit-topup', function() {
    return editFlazzTopUpUnlocked(payload, userInfo);
  });
}

function editFlazzTopUpUnlocked(payload, userInfo) {
  try {
    const ss = getDB();
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

    assertFlazzAccess(userInfo, flazzCardBranch(oldCard));

    const newCard = payload.card_id || oldCard;
    const newAmount = parseFloat(payload.amount) || 0;
    const diff = newAmount - oldAmount;

    // Validasi bila kartu berpindah: kartu tujuan harus ada dan boleh diakses
    if (newCard !== oldCard) {
      const cardSheet = ss.getSheetByName('Flazz_Card');
      const target = (cardSheet) ? findFlazzCardRow(cardSheet, newCard) : null;
      if (!target) throw new Error('Kartu tujuan tidak ditemukan.');
      assertFlazzAccess(userInfo, flazzCardBranch(newCard));
    }

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

    logAudit(userInfo, 'EDIT', 'flazz', 'TopUp ' + payload.id,
      { card_id: oldCard, amount: oldAmount },
      { card_id: newCard, amount: newAmount });
    return { success: true, msg: 'Top up berhasil diperbarui.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Hapus (soft) Top Up Flazz — tandai is_deleted dan kembalikan saldo
function deleteFlazzTopUp(id, userInfo) {
  return withLock('flazz-del-topup', function() {
    return deleteFlazzTopUpUnlocked(id, userInfo);
  });
}

function deleteFlazzTopUpUnlocked(id, userInfo) {
  try {
    const ss = getDB();
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

    assertFlazzAccess(userInfo, flazzCardBranch(oldCard));

    if (idxDel > -1) {
      sheet.getRange(rowIndex, idxDel + 1).setValue('1'); // soft-delete
    } else {
      sheet.deleteRow(rowIndex);
    }
    if (oldCard) setCardBalance(oldCard, (getCardBalance(oldCard) || 0) - oldAmount);

    logAudit(userInfo, 'DELETE', 'flazz', 'TopUp ' + id, { card_id: oldCard, amount: oldAmount }, null);
    return { success: true, msg: 'Top up berhasil dihapus dan saldo disesuaikan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Catat Tol Flazz
function saveFlazzTol(payload) {
  return withLock('flazz-tol', function() {
    return saveFlazzTolUnlocked(payload);
  });
}

function saveFlazzTolUnlocked(payload) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Flazz_Tol');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!sheet || !cardSheet) throw new Error('Sheet Flazz tidak lengkap.');

    assertFlazzAccess(payload.userInfo, flazzCardBranch(payload.card_id));

    const now = new Date();
    const id = 'TOL-' + now.getTime();

    const amount = parseFloat(payload.amount);
    if (!amount || amount <= 0) throw new Error('Nominal Tol harus lebih dari 0.');

    let evidenceUrl = '';
    if (payload.foto_bukti && payload.foto_bukti_name) {
      let uploadRes = uploadImageToDrive(payload.foto_bukti, payload.foto_bukti_name, 'Flazz_Tol', payload.userInfo ? payload.userInfo.cabang : '');
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
    logAudit(payload.userInfo, 'CREATE', 'flazz', 'Tol ' + id, null, { id: id, card_id: payload.card_id, amount: amount });
    return { success: true, msg: 'Pengeluaran Tol berhasil dicatat dan saldo terpotong.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Edit Tol Flazz (sesuaikan saldo dengan selisih nominal, tanda terbalik karena mengurangi saldo)
function editFlazzTol(payload, userInfo) {
  return withLock('flazz-edit-tol', function() {
    return editFlazzTolUnlocked(payload, userInfo);
  });
}

function editFlazzTolUnlocked(payload, userInfo) {
  try {
    const ss = getDB();
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

    assertFlazzAccess(userInfo, flazzCardBranch(oldCard));

    const newCard = payload.card_id || oldCard;
    const newAmount = parseFloat(payload.amount) || 0;
    const diff = oldAmount - newAmount; // tambah saldo jika nominal berkurang

    // Validasi bila kartu berpindah: kartu tujuan harus ada dan boleh diakses
    if (newCard !== oldCard) {
      const cardSheet = ss.getSheetByName('Flazz_Card');
      const target = (cardSheet) ? findFlazzCardRow(cardSheet, newCard) : null;
      if (!target) throw new Error('Kartu tujuan tidak ditemukan.');
      assertFlazzAccess(userInfo, flazzCardBranch(newCard));
    }

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

    logAudit(userInfo, 'EDIT', 'flazz', 'Tol ' + payload.id,
      { card_id: oldCard, amount: oldAmount },
      { card_id: newCard, amount: newAmount });
    return { success: true, msg: 'Tol berhasil diperbarui.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Hapus (soft) Tol Flazz — tandai is_deleted dan kembalikan saldo
function deleteFlazzTol(id, userInfo) {
  return withLock('flazz-del-tol', function() {
    return deleteFlazzTolUnlocked(id, userInfo);
  });
}

function deleteFlazzTolUnlocked(id, userInfo) {
  try {
    const ss = getDB();
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

    assertFlazzAccess(userInfo, flazzCardBranch(oldCard));

    if (idxDel > -1) {
      sheet.getRange(rowIndex, idxDel + 1).setValue('1'); // soft-delete
    } else {
      sheet.deleteRow(rowIndex);
    }
    if (oldCard) setCardBalance(oldCard, (getCardBalance(oldCard) || 0) + oldAmount);

    logAudit(userInfo, 'DELETE', 'flazz', 'Tol ' + id, { card_id: oldCard, amount: oldAmount }, null);
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
  if (!ss) ss = getDB();
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
      // Laporan dengan timestamp SAMA dengan used_at penyerahan ("laporan yang
      // menciptakan penyerahannya sendiri") harus tetap dianggap periode berjalan.
      if (dt.getTime() < since) continue;
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
    const ss = getDB();
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
  return withLock('flazz-recon', function() {
    return saveFlazzReconUnlocked(payload);
  });
}

function saveFlazzReconUnlocked(payload) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Flazz_Reconciliation');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!sheet || !cardSheet) throw new Error('Sheet Flazz tidak lengkap.');

    assertFlazzAccess(payload.userInfo, flazzCardBranch(payload.card_id));

    const now = new Date();
    const id = 'RECON-' + now.getTime();

    let evidenceUrl = '';
    if (payload.foto_bukti && payload.foto_bukti_name) {
      let uploadRes = uploadImageToDrive(payload.foto_bukti, payload.foto_bukti_name, 'Flazz_Recon', payload.userInfo ? payload.userInfo.cabang : '');
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

    if (!hasCompliantFlazzLaporan(payload.card_id, sinceDate, ss)) {
      throw new Error('Rekonsiliasi diblokir: belum ada laporan valid dengan foto KM awal & akhir pada periode kartu. Harap input laporan dahulu.');
    }

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

    logAudit(payload.userInfo, 'CREATE', 'flazz', 'Recon ' + id, null, { id: id, card_id: payload.card_id, reconciliation_status: reconStatus, difference: difference });
    return { success: true, msg: 'Rekonsiliasi disimpan. Status: ' + reconStatus + '. Kartu tersedia kembali.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Assign/Usage Flazz (Berikan ke Supir)
function saveFlazzUsage(payload) {
  return withLock('flazz-usage', function() {
    return saveFlazzUsageUnlocked(payload);
  });
}

function saveFlazzUsageUnlocked(payload) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Flazz_Usage');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!sheet || !cardSheet) throw new Error('Sheet Flazz tidak lengkap.');

    assertFlazzAccess(payload.userInfo, flazzCardBranch(payload.card_id));

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

    logAudit(payload.userInfo, 'CREATE', 'flazz', 'Usage ' + id, null, { id: id, card_id: cardId, driver_id: payload.driver_id || '', vehicle_id: payload.vehicle_id || '' });
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
    const ss = getDB();
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

// Kembalikan HANYA penyerahan kartu yang ditautkan ke sumber tertentu (ref_type/ref_id).
// Dipakai saat menghapus/melepas transaksi BBM-Flazz agar kartu yang diserahkan oleh
// transaksi itu tidak menggantung, TANPA mengembalikan penyerahan lain (mis. milik jalur).
// Master kartu dikembalikan ke TERSEDIA hanya bila sudah tidak ada usage DIBERIKAN lagi.
function returnFlazzUsageForRef(refType, refId) {
  try {
    const ss = getDB();
    ensureFlazzUsageRefColumns();
    const usageSheet = ss.getSheetByName('Flazz_Usage');
    const cardSheet = ss.getSheetByName('Flazz_Card');
    if (!usageSheet || !cardSheet) return { success: false, msg: 'Sheet Flazz tidak lengkap.' };

    const now = new Date();
    let marked = 0;
    const affected = [];

    if (usageSheet.getLastRow() > 1) {
      const uData = usageSheet.getDataRange().getValues();
      const uHeaders = uData[0];
      const uCard = uHeaders.indexOf('card_id');
      const uStatus = uHeaders.indexOf('status');
      const uReturned = uHeaders.indexOf('returned_at');
      const uRefType = uHeaders.indexOf('ref_type');
      const uRefId = uHeaders.indexOf('ref_id');
      const wantType = String(refType || '');
      const wantId = String(refId || '');
      for (let i = 1; i < uData.length; i++) {
        const isMatch = (uRefType > -1 && uRefId > -1 && uStatus > -1 &&
          String(uData[i][uRefType] || '') === wantType &&
          String(uData[i][uRefId] || '') === wantId &&
          String(uData[i][uStatus]) === 'DIBERIKAN');
        if (!isMatch) continue;
        if (uStatus > -1) usageSheet.getRange(i + 1, uStatus + 1).setValue('DIKEMBALIKAN');
        if (uReturned > -1) usageSheet.getRange(i + 1, uReturned + 1).setValue(now);
        if (uCard > -1 && affected.indexOf(String(uData[i][uCard])) === -1) {
          affected.push(String(uData[i][uCard]));
        }
        marked++;
      }
    }

    // Baru kembalikan status master bila kartu sudah tidak dipakai siapa pun (aktiv DIBERIKAN).
    for (let k = 0; k < affected.length; k++) {
      const cardId = affected[k];
      if (typeof flazzCardHasGiveren === 'function' && flazzCardHasGiveren(cardId)) continue;
      const found = findFlazzCardRow(cardSheet, cardId);
      if (found) {
        if (found.colIdx.STATUS !== undefined && String(found.row[found.colIdx.STATUS]) === 'SEDANG_DIGUNAKAN') {
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
    }

    return { success: true, msg: 'Penyerahan untuk referensi dikembalikan.', marked: marked };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

function getFlazzDashboardData(userRole, cabangId) {
  const ss = getDB();
  
  function getSheetData(sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    const lastCol = sheet.getLastColumn() || 0;
    if (lastCol === 0) return [];
    const hArr = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const h = sheetHeaders(sheet);
    const cols = hArr.map(function(nm) { return h[String(nm)] !== undefined ? h[String(nm)] : -1; });
    const rows = readRowsCols(sheet, cols);
    let result = [];
    for (let i = 0; i < rows.length; i++) {
      let row = rows[i];
      let obj = {};
      for (let j = 0; j < hArr.length; j++) {
        obj[hArr[j]] = (row[j] instanceof Date) ? row[j].toISOString() : row[j];
      }
      result.push(obj);
    }
    return result;
  }

  let cards = getSheetData('Flazz_Card');
  // Filter berdasarkan role. SUPERADMIN dengan cabang terpilih juga difilter
  // agar filter warehouse di List Flazz & Saldo berfungsi.
  if (userRole !== 'SUPERADMIN') {
    if (!cabangId) cards = [];
    else cards = cards.filter(c => String(c.branch_id) === String(cabangId));
  } else if (cabangId) {
    cards = cards.filter(c => String(c.branch_id) === String(cabangId));
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
    const headers = bbmSheet.getRange(1, 1, 1, bbmSheet.getLastColumn()).getValues()[0];
    const trxIdx = headers.indexOf('transaction_id');
    const metodeIdx = headers.indexOf('metode_pembayaran');
    const cardIdx = headers.indexOf('flazz_card_id');
    const tglIdx = headers.indexOf('tanggal');
    const stampIdx = headers.indexOf('timestamp');
    const bbmIdx = headers.indexOf('biaya_bbm');
    const tollIdx = headers.indexOf('biaya_toll');
    const evidenceIdx = headers.indexOf('foto_struk_bbm');
    const tollEvidenceIdx = headers.indexOf('foto_struk_toll');
    const driverIdx = headers.indexOf('nama_supir');
    const vehicleIdx = headers.indexOf('plat_nomor');

    const bbmData = readLastRows(bbmSheet, 5000);
    for (let i = 0; i < bbmData.length; i++) {
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
           toll_evidence: tollEvidenceIdx > -1 ? row[tollEvidenceIdx] : '',
           driver: row[driverIdx],
           vehicle: row[vehicleIdx]
        });
      }
    }
  }

  // Gabungkan tol manual (Flazz_Tol) + tol dari laporan harian ber-Flazz untuk tab Tol.
  // Catatan: `tols` tidak digabung di sini karena dipakai hitung saldo di klien.
  let tolHistory = tols.slice().reverse();
  (bbmFlazz || []).forEach(function(b) {
    if ((parseFloat(b.toll_amount) || 0) > 0) {
      tolHistory.push({
        id: b.transaction_id || ('TOL-DAILY-' + b.tanggal),
        date: b.tanggal,
        card_id: b.card_id,
        driver_id: b.driver || '',
        vehicle_id: b.vehicle || '',
        amount: parseFloat(b.toll_amount) || 0,
        evidence_url: b.toll_evidence || '',
        notes: 'Dari laporan harian',
        created_at: b.timestamp || '',
        source: 'DAILY',
        transaction_id: b.transaction_id || ''
      });
    }
  });
  tolHistory.sort(function(a, b) {
    return (new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0));
  });

  return {
    cards: cards,
    topups: topups.reverse(),
    tols: tols.reverse(),
    tolHistory: tolHistory,
    usages: usages.reverse(),
    recons: recons.reverse(),
    bbmFlazz: bbmFlazz.reverse()
  };
}
// Nonaktifkan Kartu Flazz (soft-delete, tidak menghapus baris)
function deleteFlazzCard(cardId, userInfo) {
  return withLock('flazz-del-card', function() {
    return deleteFlazzCardUnlocked(cardId, userInfo);
  });
}

function deleteFlazzCardUnlocked(cardId, userInfo) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Flazz_Card');
    if (!sheet) throw new Error('Sheet Flazz_Card tidak ditemukan.');

    const found = findFlazzCardRow(sheet, cardId);
    if (!found) throw new Error('Kartu tidak ditemukan.');
    assertFlazzAccess(userInfo, found.row[found.colIdx.BRANCH]);

    // Jangan nonaktifkan jika saldo belum 0 atau masih digunakan
    const status = String(found.row[found.colIdx.STATUS] || '');
    const balance = parseFloat(found.row[found.colIdx.BALANCE]) || 0;

    if (status === 'SEDANG_DIGUNAKAN') throw new Error('Tidak bisa menonaktifkan kartu yang sedang digunakan supir.');
    if (balance > 0) throw new Error('Tidak bisa menonaktifkan kartu yang masih memiliki saldo.');

    // Soft-delete: ubah status menjadi NONAKTIF + lepaskan pemegang
    sheet.getRange(found.rowIndex, found.colIdx.STATUS + 1).setValue('NONAKTIF');
    if (found.colIdx.DRIVER !== undefined) sheet.getRange(found.rowIndex, found.colIdx.DRIVER + 1).setValue('');
    sheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(new Date());
    logAudit(userInfo, 'DELETE', 'flazz', 'Kartu ' + cardId, { status: status, balance: balance }, null);
    return { success: true, msg: 'Kartu berhasil dinonaktifkan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

function activateFlazzCard(id, userInfo) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Flazz_Card');
    if (!sheet) throw new Error('Sheet Flazz_Card tidak ditemukan.');

    const found = findFlazzCardRow(sheet, id);
    if (!found) throw new Error('Kartu tidak ditemukan.');
    assertFlazzAccess(userInfo, found.row[found.colIdx.BRANCH]);

    const status = String(found.row[found.colIdx.STATUS] || '');
    if (status !== 'NONAKTIF') throw new Error('Kartu ini belum dinonaktifkan.');

    sheet.getRange(found.rowIndex, found.colIdx.STATUS + 1).setValue('TERSEDIA');
    sheet.getRange(found.rowIndex, found.colIdx.UPDATED + 1).setValue(new Date());
    logAudit(userInfo, 'EDIT', 'flazz', 'Kartu ' + id, { status: 'NONAKTIF' }, { status: 'TERSEDIA' });
    return { success: true, msg: 'Kartu berhasil diaktifkan kembali menjadi TERSEDIA.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}

// Hapus/lepas transaksi BBM Flazz dari Penggunaan_BBM
// mode 'full'   : hapus baris total + kembalikan saldo
// mode 'detach' : kosongkan metode_pembayaran & flazz_card_id, baris tetap, kembalikan saldo
function deleteFlazzBBM(transactionId, mode, userInfo) {
  return withLock('flazz-del-bbm', function() {
    return deleteFlazzBBMUnlocked(transactionId, mode, userInfo);
  });
}

function deleteFlazzBBMUnlocked(transactionId, mode, userInfo) {
  try {
    const ss = getDB();
    const sheet = ss.getSheetByName('Penggunaan_BBM');
    if (!sheet) throw new Error('Sheet Penggunaan_BBM tidak ditemukan.');

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxTrx = headers.indexOf('transaction_id');
    const idxMetode = headers.indexOf('metode_pembayaran');
    const idxCard = headers.indexOf('flazz_card_id');
    const idxBiaya = headers.indexOf('biaya_bbm');
    const idxToll = headers.indexOf('biaya_toll');
    const idxCabang = headers.indexOf('kode_cabang');
    const idxTgl = headers.indexOf('tanggal');

    let rowIndex = -1, isFlazz = false, biaya = 0, toll = 0, cardId = null, delCabang = '', delTgl = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxTrx]) === String(transactionId)) {
        rowIndex = i + 1;
        isFlazz = data[i][idxMetode] === 'FLAZZ';
        biaya = parseFloat(data[i][idxBiaya]) || 0;
        toll = idxToll > -1 ? (parseFloat(data[i][idxToll]) || 0) : 0;
        cardId = data[i][idxCard];
        delCabang = idxCabang > -1 ? data[i][idxCabang] : '';
        delTgl = idxTgl > -1 ? data[i][idxTgl] : '';
        break;
      }
    }
    if (rowIndex === -1) throw new Error('Transaksi BBM tidak ditemukan.');

    if (isFlazz && cardId) {
      assertFlazzAccess(userInfo, flazzCardBranch(cardId));
    } else {
      assertMasterAccess(userInfo, 'menghapus transaksi BBM');
    }

    if (mode === 'detach') {
      sheet.getRange(rowIndex, idxMetode + 1).setValue('');
      sheet.getRange(rowIndex, idxCard + 1).setValue('');
    } else {
      sheet.deleteRow(rowIndex);
      // Ringkasan bulanan harus dihitung ulang karena baris transaksi terhapus
      try { recomputeMonthlySummary(delCabang, periodKey(delTgl)); } catch (e) { console.error('summary gagal: ' + e); }
    }

    if (isFlazz && cardId) {
      setCardBalance(cardId, (getCardBalance(cardId) || 0) + biaya + toll);
      // Kembalikan penyerahan yang dibuat transaksi ini agar kartu tidak menggantung.
      try { if (typeof returnFlazzUsageForRef === 'function') returnFlazzUsageForRef('TRX', String(transactionId)); }
      catch (e) { Logger.log('returnFlazzUsageForRef gagal: ' + e.toString()); }
    }

    logAudit(userInfo, 'DELETE', 'flazz', 'Transaksi Flazz ' + transactionId, { metode_pembayaran: isFlazz ? 'FLAZZ' : '', flazz_card_id: cardId, biaya_bbm: biaya, biaya_toll: toll, kode_cabang: delCabang, tanggal: delTgl }, null);
    return { success: true, msg: mode === 'detach' ? 'Transaksi dilepas dari Flazz dan saldo dikembalikan.' : 'Transaksi BBM dihapus dan saldo dikembalikan.' };
  } catch (err) {
    return { success: false, msg: err.message };
  }
}
