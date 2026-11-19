// Paste into a Google Apps Script project, with appsscript.json from this package.
const DATTS_SHEET_ID = '1cYKIZSI-NpPPB-j4SXzx3yfqLyblz2lJl6XqV3erlmE';
const DATTS_REPORT_URL = 'https://datts-calculator-stats.datts-vk-226271074.workers.dev/reports';
const DATTS_HEADERS = ['Дата (МСК)','Посещения','Уникальные посетители','Изменили параметры','Предложение по комплекту','Бесплатный подбор','Ещё варианты','Копирование расчёта','Печать / PDF','Письмо по требованиям','Письмо по комплекту','Клики: предложение','Клики: бесплатный подбор','Клики: ещё варианты','Копирования: всего','Печать: всего'];

function installDattsReport() {
  // Run once as jfdjbdy.com@gmail.com. No public web-app deployment is needed.
  updateDattsReport();
  const existing = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'updateDattsReport');
  if (!existing.length) ScriptApp.newTrigger('updateDattsReport').timeBased().atHour(9).everyDays(1).inTimezone('Europe/Moscow').create();
  console.log('DATTS: ежедневный отчёт установлен. Таблица: https://docs.google.com/spreadsheets/d/' + DATTS_SHEET_ID);
}

function updateDattsReport() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const token = ScriptApp.getIdentityToken();
    if (!token) throw new Error('Нужны scopes openid и userinfo.email в appsscript.json.');
    const response = UrlFetchApp.fetch(DATTS_REPORT_URL, {headers:{Authorization:'Bearer '+token},muteHttpExceptions:true});
    if(response.getResponseCode() !== 200) throw new Error('Отчёт не получен: HTTP ' + response.getResponseCode());
    const data = JSON.parse(response.getContentText());
    const book = SpreadsheetApp.openById(DATTS_SHEET_ID);
    book.setSpreadsheetTimeZone('Europe/Moscow');
    const sheet = book.getSheetByName('По дням');
    sheet.getRange(1,1,1,DATTS_HEADERS.length).setValues([DATTS_HEADERS]);
    const existing = sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues().flat() : [];
    for (const r of data.reports) {
      const row = [r.day,r.visits,r.visitors,r.parameters_changed_users,r.kit_offer_users,r.free_selection_users,r.more_variants_users,r.copy_calculation_users,r.print_users,r.requirements_email_open_users,r.kit_email_open_users,r.kit_offer_clicks,r.free_selection_clicks,r.more_variants_clicks,r.copy_calculation_clicks,r.print_clicks];
      let at = existing.indexOf(r.day);
      if(at<0) {existing.push(r.day);at=existing.length-1;}
      sheet.getRange(at+2,1).setNumberFormat('@');
      sheet.getRange(at+2,1,1,row.length).setValues([row]);
    }
    if(sheet.getLastRow()>2)sheet.getRange(2,1,sheet.getLastRow()-1,DATTS_HEADERS.length).sort(1);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,DATTS_HEADERS.length).setFontWeight('bold').setBackground('#332b25').setFontColor('#ffffff').setWrap(true);
    sheet.setRowHeight(1,60);
    sheet.setColumnWidths(1,DATTS_HEADERS.length,165);
  } finally {lock.releaseLock();}
}
