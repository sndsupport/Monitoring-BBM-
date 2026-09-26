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

// Ambil nilai pertama yang terdefinisi dari kunci panjang (nama kolom sheet)
// atau kunci pendek (state object milik SpreadsheetOps/FlazzOps).
function pickField(row, longKey, shortKey) {
  if (!row) return '';
  if (row[longKey] !== undefined && row[longKey] !== null) return row[longKey];
  if (shortKey && row[shortKey] !== undefined && row[shortKey] !== null) return row[shortKey];
  return '';
}

// Konversi longgar: nilai sheet bisa berupa string, angka, atau kosong.
function numOf(v) { return parseFloat(v) || 0; }
function strOf(v) { return String(v === undefined || v === null ? '' : v).trim(); }

// Bangun grup-2 dari kolom *_2. Metode DITURUNKAN (bukan kolom terpisah):
// kartu terisi -> FLAZZ, nominal > 0 tanpa kartu -> TUNAI.
// Return null bila keempat kolom kosong/0 sehingga baris lama (yang tidak punya
// kolom grup-2 sama sekali) tidak ikut tersentuh.
function group2FromRow(row) {
  if (!row) return null;
  const cBbm = strOf(pickField(row, 'flazz_card_id_2', 'cardBbm2'));
  const cTol = strOf(pickField(row, 'flazz_card_id_toll_2', 'cardTol2'));
  const bBbm = numOf(pickField(row, 'biaya_bbm_2', 'biayaBbm2'));
  const bTol = numOf(pickField(row, 'biaya_toll_2', 'biayaTol2'));
  const hasBbm = cBbm !== '' || bBbm > 0;
  const hasTol = cTol !== '' || bTol > 0;
  if (!hasBbm && !hasTol) return null;
  return {
    mBbm: hasBbm ? (cBbm !== '' ? 'FLAZZ' : 'TUNAI') : '',
    cBbm: cBbm,
    bBbm: bBbm,
    mTol: hasTol ? (cTol !== '' ? 'FLAZZ' : 'TUNAI') : '',
    cTol: cTol,
    bTol: bTol
  };
}

// Daftar grup pembayaran yang ada pada satu baris laporan.
// Grup-1 selalu ada (back-compat) dan hanya itu yang ada untuk baris lama;
// grup-2 hanya muncul bila terisi. Grup-1 tetap memakai resolveTollMethod /
// resolveTollCard agar semantik kompatibilitas lama tidak berubah.
function cardGroups(row) {
  const f = cardFields(row);
  const tollMethod = resolveTollMethod(f.mTol, f.mBbm, f.cTol);
  const groups = [{
    mBbm: f.mBbm,
    cBbm: f.cBbm,
    bBbm: numOf(f.bBbm),
    mTol: tollMethod,
    cTol: resolveTollCard(f.cTol, tollMethod, f.mBbm, f.cBbm),
    bTol: numOf(f.bTol)
  }];
  const g2 = group2FromRow(row);
  if (g2) groups.push(g2);
  return groups;
}

// Bagian BBM (dalam Rupiah) sebuah baris laporan yang dibayar dengan kartu cardId,
// dijumlahkan dari SEMUA grup sehingga satu baris dapat membebani dua kartu.
function flazzBbmShare(row, cardId) {
  if (!row || cardId == null) return 0;
  let total = 0;
  cardGroups(row).forEach(function (g) {
    if (String(g.mBbm) !== 'FLAZZ') return;
    if (canonicalCardId(g.cBbm) !== canonicalCardId(cardId)) return;
    total += numOf(g.bBbm);
  });
  return total;
}

// Bagian tol (dalam Rupiah) sebuah baris laporan yang dibayar dengan kartu cardId,
// dijumlahkan dari SEMUA grup.
function flazzTolShare(row, cardId) {
  if (!row || cardId == null) return 0;
  let total = 0;
  cardGroups(row).forEach(function (g) {
    if (String(g.mTol) !== 'FLAZZ') return;
    if (canonicalCardId(g.cTol) !== canonicalCardId(cardId)) return;
    total += numOf(g.bTol);
  });
  return total;
}

// Total pengeluaran pada sebuah kartu untuk satu baris (BBM + tol yang memang kartunya).
function flazzShareForCard(row, cardId) {
  return flazzBbmShare(row, cardId) + flazzTolShare(row, cardId);
}

// Apakah baris laporan melibatkan kartu ini (bayar BBM ataupun tol dengan Flazz),
// di grup pembayaran mana pun.
function isFlazzRowForCard(row, cardId) {
  if (!row || cardId == null) return false;
  return cardGroups(row).some(function (g) {
    const bbm = String(g.mBbm) === 'FLAZZ' && canonicalCardId(g.cBbm) === canonicalCardId(cardId);
    const tol = String(g.mTol) === 'FLAZZ' && canonicalCardId(g.cTol) === canonicalCardId(cardId);
    return bbm || tol;
  });
}

// Daftar kartu unik yang terpakai saat menyimpan satu transaksi — dari semua grup
// (BBM dan/atau tol ber-Flazz, grup-1 maupun grup-2).
// Dipakai dari objek baris sheet maupun objek state (kunci pendek).
function distinctFlazzCardsOf(state) {
  const out = [];
  function push(card) {
    const c = strOf(card);
    if (c && out.indexOf(c) === -1) out.push(c);
  }
  cardGroups(state).forEach(function (g) {
    if (String(g.mBbm) === 'FLAZZ') push(g.cBbm);
    if (String(g.mTol) === 'FLAZZ') push(g.cTol);
  });
  return out;
}

// Total muatan sebuah kartu pada suatu keadaan pembayaran (BBM + tol dari semua grup).
// Alias ke flazzShareForCard supaya pemanggil lama tidak rusak.
function flazzCardCharge(state, cardId) {
  return flazzShareForCard(state, cardId);
}

// Selisih uang yang dikembalikan (+) atau dipotong (-) dari sebuah kartu saat koreksi/edit.
function flazzEditDelta(oldState, nextState, cardId) {
  if (cardId == null) return 0;
  return flazzCardCharge(oldState, cardId) - flazzCardCharge(nextState, cardId);
}

// Resolusi nilai nominal saat koreksi/edit laporan. Form lengkap selalu mengirim SEMUA field
// dan merepresentasikan pembatalan sebagai string kosong '' -> artinya 0. Koreksi parsial
// (undefined/null) berarti "jangan sentuh" -> pertahankan nilai lama.
function parseEditAmount(payloadValue, oldValue) {
  if (payloadValue === undefined || payloadValue === null) return oldValue;
  return parseFloat(payloadValue) || 0;
}

// Resolusi metode pembayaran saat koreksi/edit. '' = batal Flazz (tulis kosong),
// undefined/null = koreksi parsial (pertahankan metode lama).
function parseEditMethod(payloadValue, oldValue) {
  if (payloadValue === undefined || payloadValue === null) return oldValue;
  return String(payloadValue).trim();
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