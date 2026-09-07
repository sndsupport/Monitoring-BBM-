function testLocal() {
  const result = getPerformaSummary('SUPERADMIN', '');
  Logger.log('Length: ' + result.length);
  Logger.log(JSON.stringify(result));
}

function diagCardBBM(cardNumber) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const cardSheet = ss.getSheetByName('Flazz_Card');
  const cData = cardSheet.getDataRange().getValues();
  const cHeaders = cData[0];
  const cNumIdx = cHeaders.indexOf('card_number');
  const cIdIdx = cHeaders.indexOf('id');
  const cBalIdx = cHeaders.indexOf('last_balance');
  let card = null;
  for (let i = 1; i < cData.length; i++) {
    if (String(cData[i][cNumIdx]).indexOf(cardNumber) > -1) { card = { id: cData[i][cIdIdx], last_balance: cData[i][cBalIdx] }; break; }
  }
  if (!card) { Logger.log('CARD NOT FOUND: ' + cardNumber); return; }
  Logger.log('CARD id=' + JSON.stringify(card.id) + ' type=' + typeof card.id + ' last_balance=' + card.last_balance);

  const bbmSheet = ss.getSheetByName('Penggunaan_BBM');
  const bData = bbmSheet.getDataRange().getValues();
  const bHeaders = bData[0];
  const bCount = { flazz: 0, nonFlazz: 0 };
  bData.slice(1).forEach(r => {
    const isFlazz = r[bHeaders.indexOf('metode_pembayaran')] === 'FLAZZ';
    const bCard = r[bHeaders.indexOf('flazz_card_id')];
    const matches = String(bCard) === String(card.id);
    if (matches) {
      Logger.log('BBM ROW metode=' + JSON.stringify(r[bHeaders.indexOf('metode_pembayaran')])
        + ' card=' + JSON.stringify(bCard) + ' (' + typeof bCard + ')'
        + ' tanggal=' + JSON.stringify(r[bHeaders.indexOf('tanggal')])
        + ' timestamp=' + JSON.stringify(r[bHeaders.indexOf('timestamp')])
        + ' biaya=' + r[bHeaders.indexOf('biaya_bbm')]);
      if (isFlazz) bCount.flazz++; else bCount.nonFlazz++;
    }
  });
  Logger.log('BBM matches: flazz=' + bCount.flazz + ' nonFlazz=' + bCount.nonFlazz);

  const tolSheet = ss.getSheetByName('Flazz_Tol');
  const tData = tolSheet.getDataRange().getValues();
  const tHeaders = tData[0];
  tData.slice(1).forEach(r => {
    if (String(r[tHeaders.indexOf('card_id')]) === String(card.id)) {
      Logger.log('TOL ROW date=' + JSON.stringify(r[tHeaders.indexOf('date')])
        + ' amount=' + r[tHeaders.indexOf('amount')] + ' del=' + r[tHeaders.indexOf('is_deleted')]);
    }
  });
}

function diagRecons(cardNumber) {
  const recons = getSheetData('Flazz_Reconciliation').filter(r => String(r.card_id) === String(cardNumber));
  Logger.log('RECONS count=' + recons.length);
  recons.slice(-10).forEach(r => {
    Logger.log('RECON date=' + r.date + ' opening=' + r.opening_balance + ' topup=' + r.total_topup + ' bbm=' + r.total_bbm_flazz + ' tol=' + r.total_tol + ' flazz_bal=' + r.flazz_balance + ' actual=' + r.actual_balance);
  });
}

function sheetDiag(cardNumber) {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  const cardSheet = ss.getSheetByName('Flazz_Card');
  const cData = cardSheet.getDataRange().getValues();
  const cHeaders = cData[0];
  const cNumIdx = cHeaders.indexOf('card_number');
  const cIdIdx = cHeaders.indexOf('id');
  let cardId = null;
  for (let i = 1; i < cData.length; i++) {
    if (String(cData[i][cNumIdx]).indexOf(cardNumber) > -1) { cardId = cData[i][cIdIdx]; break; }
  }
  Logger.log('CARD_LOOKUP number=' + cardNumber + ' -> id=' + JSON.stringify(cardId) + ' (' + typeof cardId + ')');

  const bbmSheet = ss.getSheetByName('Penggunaan_BBM');
  const bData = bbmSheet.getDataRange().getValues();
  const bHeaders = bData[0];
  Logger.log('BBM_HEADERS=' + JSON.stringify(bHeaders));
  let flazzRows = 0, totalBbm = 0, totalTol = 0;
  for (let i = 1; i < bData.length; i++) {
    const r = bData[i];
    const metode = r[bHeaders.indexOf('metode_pembayaran')];
    const bCard = r[bHeaders.indexOf('flazz_card_id')];
    if (metode === 'FLAZZ') {
      flazzRows++;
      const matchCard = cardId !== null && String(bCard) === String(cardId);
      const del = r[bHeaders.indexOf('is_deleted')];
      if (matchCard && String(del || '') !== '1') {
        totalBbm += parseFloat(r[bHeaders.indexOf('biaya_bbm')]) || 0;
        totalTol += parseFloat(r[bHeaders.indexOf('biaya_toll')]) || 0;
        Logger.log('BBM_FLAZZ_CARD tanggal=' + JSON.stringify(r[bHeaders.indexOf('tanggal')])
          + ' stamp=' + JSON.stringify(r[bHeaders.indexOf('timestamp')])
          + ' biaya_bbm=' + r[bHeaders.indexOf('biaya_bbm')]
          + ' biaya_toll=' + r[bHeaders.indexOf('biaya_toll')]);
      }
    }
  }
  Logger.log('FLAZZ rows total=' + flazzRows + ' matchedCardTotal bbm=' + totalBbm + ' tol=' + totalTol);
}
