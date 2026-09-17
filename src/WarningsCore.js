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

// ==========================================
// GANTI OLI — pure. warnOilStatus(veh, currentKm) mengembalikan null
// bila tidak memenuhi ambang, atau objek berstatus WASPADA/GANTI_OLI.
// veh memakai field getActiveVehicles + kolom km_terakhir_ganti_oli /
// interval_ganti_oli_km (default 5000).
// ==========================================
var OIL_WASPADA_BEFORE_KM = 500;

function warnOilStatus(veh, currentKm) {
  var baseline = parseFloat(veh.km_terakhir_ganti_oli);
  if (!baseline || baseline < 0) return null;
  var interval = parseFloat(veh.interval_ganti_oli_km);
  if (!interval || isNaN(interval) || interval <= 0) interval = 5000;
  var km = parseFloat(currentKm);
  if (isNaN(km)) km = baseline; // belum ada transaksi sejak terakhir ganti -> tempuh 0
  var tempuh = Math.max(0, km - baseline);
  var sisa = interval - tempuh;
  var status = '';
  if (tempuh >= interval) status = 'GANTI_OLI';
  else if (sisa <= OIL_WASPADA_BEFORE_KM) status = 'WASPADA';
  else return null;
  return {
    vehicle_id: veh.vehicle_id,
    plat_nomor: veh.plat_nomor,
    nama_kendaraan: veh.nama,
    cabang: veh.cabang,
    baseline_km: baseline,
    interval_km: interval,
    tempuh_km: tempuh,
    sisa_km: sisa,
    status: status
  };
}