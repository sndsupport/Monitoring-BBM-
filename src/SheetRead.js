// ==========================================
// PEMBACAAN SHEET EFISIEN (hindari getDataRange penuh)
// ==========================================

function sheetHeaders(sheet) {
  var lastCol = sheet.getLastColumn() || 0;
  if (lastCol === 0) return {};
  var h = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var ci = {};
  h.forEach(function(v, i) { if (v !== '') ci[String(v)] = i; });
  return ci;
}

// n baris terakhir, semua kolom, tanpa header (data.length = 0 bila kosong)
function readLastRows(sheet, n) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var start = Math.max(2, lastRow - n + 1);
  var count = lastRow - start + 1;
  return sheet.getRange(start, 1, count, sheet.getLastColumn()).getValues();
}

// Semua baris data, hanya kolom terpilih. colIndexes: array 0-based.
function readRowsCols(sheet, colIndexes) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  var lastCol = sheet.getLastColumn();
  var out = [];
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = [];
    for (var j = 0; j < colIndexes.length; j++) row.push(data[i][colIndexes[j]]);
    out.push(row);
  }
  return out;
}

function colIndex(headers, names) {
  var m = {};
  names.forEach(function(nm) { m[nm] = headers[nm] !== undefined ? headers[nm] : -1; });
  return m;
}