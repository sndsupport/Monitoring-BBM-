// ==========================================
// PaymentLogic.js
// Logika MURNI pembayaran BBM vs Tol (kartu Flazz), tanpa API Apps Script.
// Dipakai oleh SpreadsheetOps (simpan/edit/hapus transaksi) & FlazzOps (ledger/gate).
// Dapat di-test lokal: node scratch/test-payment-logic.js
// ==========================================

// Id kartu kanonik untuk perbandingan. Penyimpanan lama kadang menulis id kartu tanpa
// karakter '-' (mis. "FLZ1788404474583" vs id master "FLZ-1788404474583"); id kartu
// selalu berbentuk "FLZ-<timestamp>", sehingga membuang '-' aman untuk perbandingan.
function canonicalCardId(v) {
  return String(v || '').trim().replace(/-/g, '');
}

// Normalisasi pasangan kunci, agar helper di bawah menerima objek baris (kunci panjang:
// metode_pembayaran/flazz_card_id/biaya_bbm/metode_toll/flazz_card_id_toll/biaya_toll)
// maupun objek state pembayaran (kunci pendek: metodeBbm/cardBbm/biayaBbm/metodeTol/
// cardTol/biayaTol) yang dipakai di ledger/gate/editing.
function cardFields(row) {
  if (!row) return { mBbm: '', cBbm: null, bBbm: 0, mTol: '', cTol: null, bTol: 0 };
  return {
    mBbm: (row.metode_pembayaran !== undefined) ? row.metode_pembayaran : row.metodeBbm,
    cBbm: (row.flazz_card_id !== undefined) ? row.flazz_card_id : row.cardBbm,
    bBbm: (row.biaya_bbm !== undefined) ? row.biaya_bbm : row.biayaBbm,
    mTol: (row.metode_toll !== undefined) ? row.metode_toll : row.metodeTol,
    cTol: (row.flazz_card_id_toll !== undefined) ? row.flazz_card_id_toll : row.cardTol,
    bTol: (row.biaya_toll !== undefined) ? row.biaya_toll : row.biayaTol
  };
}

// Bagian BBM (dalam Rupiah) sebuah baris laporan yang dibayar dengan kartu cardId.
function flazzBbmShare(row, cardId) {
  if (!row || cardId == null) return 0;
  const f = cardFields(row);
  if (String(f.mBbm) !== 'FLAZZ') return 0;
  if (canonicalCardId(f.cBbm) !== canonicalCardId(cardId)) return 0;
  return parseFloat(f.bBbm) || 0;
}

// Bagian tol (dalam Rupiah) sebuah baris laporan yang dibayar dengan kartu cardId.
function flazzTolShare(row, cardId) {
  if (!row || cardId == null) return 0;
  const f = cardFields(row);
  if (String(f.mTol) !== 'FLAZZ') return 0;
  if (canonicalCardId(f.cTol) !== canonicalCardId(cardId)) return 0;
  return parseFloat(f.bTol) || 0;
}

// Total pengeluaran pada sebuah kartu untuk satu baris (BBM + tol yang memang kartunya).
function flazzShareForCard(row, cardId) {
  return flazzBbmShare(row, cardId) + flazzTolShare(row, cardId);
}

// Apakah baris laporan melibatkan kartu ini (bayar BBM ataupun tol dengan Flazz).
function isFlazzRowForCard(row, cardId) {
  if (!row || cardId == null) return false;
  const f = cardFields(row);
  const bbm = String(f.mBbm) === 'FLAZZ' && canonicalCardId(f.cBbm) === canonicalCardId(cardId);
  const tol = String(f.mTol) === 'FLAZZ' && canonicalCardId(f.cTol) === canonicalCardId(cardId);
  return bbm || tol;
}

// Daftar kartu unik yang terpakai saat menyimpan satu transaksi (BBM dan/atau tol ber-Flazz).
function distinctFlazzCards(metodeBbm, cardBbm, metodeTol, cardTol) {
  const out = [];
  function push(card) {
    const c = String(card || '').trim();
    if (c && out.indexOf(c) === -1) out.push(c);
  }
  if (String(metodeBbm) === 'FLAZZ') push(cardBbm);
  if (String(metodeTol) === 'FLAZZ') push(cardTol);
  return out;
}

// Total muatan sebuah kartu pada suatu keadaan pembayaran (BBM + tol yang jadi tanggungan kartu).
// state: { metodeBbm, cardBbm, biayaBbm, metodeTol, cardTol, biayaTol }
function flazzCardCharge(state, cardId) {
  if (!state || cardId == null) return 0;
  const f = cardFields(state);
  let total = 0;
  if (String(f.mBbm) === 'FLAZZ' && canonicalCardId(f.cBbm) === canonicalCardId(cardId)) {
    total += parseFloat(f.bBbm) || 0;
  }
  if (String(f.mTol) === 'FLAZZ' && canonicalCardId(f.cTol) === canonicalCardId(cardId)) {
    total += parseFloat(f.bTol) || 0;
  }
  return total;
}

// Selisih uang yang dikembalikan (+) atau dipotong (-) dari sebuah kartu saat koreksi/edit.
function flazzEditDelta(oldState, nextState, cardId) {
  if (cardId == null) return 0;
  return flazzCardCharge(oldState, cardId) - flazzCardCharge(nextState, cardId);
}

// Resolusi metode bayar tol. Nilai eksplisit dari form lebih diutamakan; bila tidak
// dikirim (form lama), fallback: BBM FLAZZ dianggap tol ikut FLAZZ (semantik lama satu
// metode untuk seluruh transaksi), selain itu cek apakah ada kartu tol yang terisi
// (jika ya, anggap FLAZZ), selain itu TUNAI.
function resolveTollMethod(explicitValue, bbmMethod, explicitCard) {
  if (explicitValue !== undefined && explicitValue !== null && String(explicitValue) !== '') {
    return String(explicitValue);
  }
  if (String(bbmMethod) === 'FLAZZ') return 'FLAZZ';
  if (explicitCard !== undefined && explicitCard !== null && String(explicitCard).trim() !== '') {
    return 'FLAZZ';
  }
  return 'TUNAI';
}

// Resolusi kartu tol ketika metode tol FLAZZ. Kartu eksplisit diutamakan; bila kosong
// dan BBM ber-Flazz (kompatibilitas lama), kartu tol mengikuti kartu BBM.
function resolveTollCard(explicitCard, tollMethod, bbmMethod, bbmCard) {
  if (String(tollMethod) !== 'FLAZZ') return '';
  const c = String(explicitCard || '').trim();
  if (c) return c;
  if (String(bbmMethod) === 'FLAZZ') return String(bbmCard || '').trim();
  return '';
}