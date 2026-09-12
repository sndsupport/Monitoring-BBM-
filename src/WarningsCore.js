// ==========================================
// WARNINGS CORE — logika murni (tanpa GAS).
// Dipakai WarningOps.warningsSummary; diuji node + TestRunner.
// ==========================================

var WARN_LEVEL = { 'WASPADA': 1, 'KRITIS': 2, 'LEWAT': 3 };

function warnVehicleAlerts(veh) {
  var out = [];
  var spec = [
    { tipe: 'PAJAK', date: veh.tanggal_pajak },
    { tipe: 'PAJAK5', date: veh.tanggal_pajak_5_tahunan },
    { tipe: 'KIR', date: veh.tanggal_kir }
  ];
  spec.forEach(function (s) {
    var p = jalurComputePajak(s.date);
    if (p.status_pajak === 'LEWAT' || p.status_pajak === 'KRITIS' || p.status_pajak === 'WASPADA') {
      out.push({ tipe: s.tipe, status: p.status_pajak, sisa_hari: p.sisa_hari_pajak, tanggal: s.date });
    }
  });
  return out;
}

function warnMinSisa(alerts) {
  var m = Infinity;
  alerts.forEach(function (a) { if (a.sisa_hari != null && a.sisa_hari < m) m = a.sisa_hari; });
  return m;
}

function warnWorst(alerts) {
  var level = 0, best = '';
  alerts.forEach(function (a) {
    var l = WARN_LEVEL[a.status] || 0;
    if (l > level) { level = l; best = a.status; }
  });
  return best;
}

function warnSortPajak(a, b) {
  var d = (WARN_LEVEL[b.worst] || 0) - (WARN_LEVEL[a.worst] || 0);
  if (d) return d;
  return warnMinSisa(a.alerts) - warnMinSisa(b.alerts);
}

function warnCardIsLow(card) {
  if (String(card.status || '').toUpperCase() === 'NONAKTIF') return false;
  return (parseFloat(card.last_balance) || 0) < 100000;
}