// ==========================================
// WARNING OPS — agregasi peringatan utk panel 'Peringatan Dini'.
// ==========================================

function warningsSummary(token) {
  var vehs = getActiveVehicles(token);
  var pajakKIR = [];
  vehs.forEach(function (v) {
    var veh = {
      tanggal_pajak: warnDateStr(v.tanggal_pajak),
      tanggal_pajak_5_tahunan: warnDateStr(v.tanggal_pajak_5_tahunan),
      tanggal_kir: warnDateStr(v.tanggal_kir)
    };
    var alerts = warnVehicleAlerts(veh);
    if (alerts.length) {
      pajakKIR.push({
        vehicle_id: v.vehicle_id, plat_nomor: v.plat_nomor, nama_kendaraan: v.nama,
        jenis: v.jenis, cabang: v.cabang, alerts: alerts, worst: warnWorst(alerts)
      });
    }
  });
  pajakKIR.sort(warnSortPajak);
  var saldo = getFlazzCards(token).filter(warnCardIsLow).map(function (c) {
    return {
      id: c.id, card_number: String(c.card_number || ''), card_name: String(c.card_name || ''),
      card_type: String(c.card_type || ''), cabang: String(c.branch_id || ''),
      last_balance: parseFloat(c.last_balance) || 0, status: String(c.status || '')
    };
  }).sort(function (x, y) { return x.last_balance - y.last_balance; });
  return { pajakKIR: pajakKIR, saldo: saldo };
}

function warnDateStr(v) {
  if (v instanceof Date) {
    var tz = getDB().getSpreadsheetTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return (v == null) ? '' : String(v).substring(0, 10);
}