function getAgusBalance() {
  const ss = SpreadsheetApp.openById('1FU7_VOhAi3SOl9HiqMEaitYqmk5IqEv3v7VXfXcYfW8');
  
  const bbmData = ss.getSheetByName('Penggunaan_BBM').getDataRange().getValues();
  const topupData = ss.getSheetByName('Flazz_TopUp').getDataRange().getValues();
  const usageData = ss.getSheetByName('Flazz_Usage').getDataRange().getValues();
  
  let result = { 
    usages: [],
    expenses: [],
    topups: []
  };
  
  for(let i=1; i<usageData.length; i++) {
    if(String(usageData[i][3]).toLowerCase().indexOf('agus') > -1) {
      result.usages.push({
        date: usageData[i][1],
        card: usageData[i][2],
        driver: usageData[i][3],
        opening: usageData[i][9]
      });
    }
  }

  for(let i=1; i<bbmData.length; i++) {
    if(String(bbmData[i][26]).toLowerCase().indexOf('agus') > -1) {
      result.expenses.push({
        date: bbmData[i][2],
        driver: bbmData[i][26],
        card: bbmData[i][28],
        bbm: bbmData[i][19],
        tol: bbmData[i][21]
      });
    }
  }

  return JSON.stringify(result, null, 2);
}
