// ==========================================
// JalurStatus.js
// Logika MURNI status Jalur Pengiriman (tanpa API Apps Script).
// Dipakai JalurOps.js & FlazzOps.js sebagai SATU sumber kebenaran penulisan
// status jalur, supaya definisi "sudah selesai" tidak berbeda antar tempat.
// Dapat di-test lokal: node scratch/test-jalur-status.js
// ==========================================

// Daftar id kartu etoll yang ter-assign pada satu baris Jalur_Pengiriman.
// Slot kosong diabaikan; id yang sama tidak dihitung dua kali.
function jalurCardIds(flazzCardId, flazzCardId2) {
  const out = [];
  [flazzCardId, flazzCardId2].forEach(function (c) {
    const s = String(c === undefined || c === null ? '' : c).trim();
    if (s && out.indexOf(s) === -1) out.push(s);
  });
  return out;
}

// Status akhir sebuah jalur.
//   belum ada laporan                        -> BELUM_DIISI
//   ada >=1 kartu dan SEMUA kartu itu sudah
//     direkon (tanggal rekon >= tanggal jalur) -> SELESAI
//   selainnya                                 -> SUDAH_LAPORAN
//
// Jalur tanpa kartu menghasilkan SUDAH_LAPORAN — sama seperti sebelum fitur ini.
// reconMaxTglByCard: { canonicalCardId(card_id): 'yyyy-MM-dd' } tanggal rekon terbaru.
function jalurFinalStatus(laporanId, cardIds, tanggalJalur, reconMaxTglByCard) {
  if (!String(laporanId === undefined || laporanId === null ? '' : laporanId).trim()) return 'BELUM_DIISI';
  const cards = (cardIds || []).filter(function (c) { return String(c || '').trim() !== ''; });
  if (!cards.length) return 'SUDAH_LAPORAN';
  const tgl = String(tanggalJalur || '').substring(0, 10);
  const map = reconMaxTglByCard || {};
  for (let i = 0; i < cards.length; i++) {
    const r = String(map[canonicalCardId(cards[i])] || '').substring(0, 10);
    if (!r || r < tgl) return 'SUDAH_LAPORAN';
  }
  return 'SELESAI';
}
