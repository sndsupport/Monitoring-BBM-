// ==========================================
// SNAPSHOT SHEET PER-EKSEKUSI (anti scan berulang)
// Memoize baca penuh sebuah sheet AGAR dalam satu RPC sheet yang sama
// hanya dibaca SEKALI, bukan 3-5x seperti sebelumnya.
// Scope aman: setiap eksekusi google.script.run adalah konteks V8 baru,
// sehingga cache ini hanya hidup selama satu RPC (tidak bocor antar user).
// Setiap fungsi yang MENULIS ke sebuah sheet WAJIB memanggil
// invalidateSheetSnapshot(name) agar pembacaan berikutnya tetap segar.
// ==========================================

var __snapCache = {};

function getSheetSnapshot(sheetName) {
  if (!(sheetName in __snapCache)) {
    var ss = getDB();
    var sheet = ss ? ss.getSheetByName(sheetName) : null;
    __snapCache[sheetName] = sheet ? sheet.getDataRange().getValues() : [];
  }
  return __snapCache[sheetName];
}

function invalidateSheetSnapshot(sheetName) {
  delete __snapCache[sheetName];
}