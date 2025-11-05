const SHEET_NAME = 'metrics';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(metrics) || ss.insertSheet(metrics);
  // Ensure headers
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['slug','likes','dislikes','infos']);
  }
  return sheet;
}

function findRowBySlug_(slug) {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues(); // includes header
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === slug) return i + 1; // 1-based row
  }
  return null;
}

function ensureRow_(slug) {
  const sheet = getSheet_();
  const row = findRowBySlug_(slug);
  if (row) return row;
  sheet.appendRow([slug, 0, 0, 0]);
  return sheet.getLastRow();
}

function readCounts_(slug) {
  const row = findRowBySlug_(slug);
  const sheet = getSheet_();
  if (!row) return { slug, likes: 0, dislikes: 0, infos: 0 };
  const values = sheet.getRange(row, 1, 1, 4).getValues()[0];
  return { slug: values[0], likes: values[1], dislikes: values[2], infos: values[3] };
}

function bump_(slug, field) {
  if (!['likes','dislikes','infos'].includes(field)) {
    throw new Error('Invalid field');
  }
  const sheet = getSheet_();
  const row = ensureRow_(slug);
  const colIndex = {likes:2, dislikes:3, infos:4}[field];
  const cell = sheet.getRange(row, colIndex);
  cell.setValue(Number(cell.getValue() || 0) + 1);
  return readCounts_(slug);
}

function doGet(e) {
  const slug = (e && e.parameter.slug) || 'home';
  const result = readCounts_(slug);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}


function doPost(e) {
  let payload = {};
  try { payload = JSON.parse(e.postData.contents || '{}'); } catch (_) {}
  const slug = payload.slug || 'home';
  const field = payload.field; // 'likes' | 'dislikes' | 'infos'
  const result = bump_(slug, field);
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
