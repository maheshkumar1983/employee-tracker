/**
 * Google Apps Script — Employee Task Tracker
 *
 * TWO ROLES:
 *
 * 1. WEB APP  — doPost(e)
 *    Receives image upload requests from the Cloudflare Worker and saves
 *    files to Google Drive as the SCRIPT OWNER (real Google account with
 *    storage quota). Returns a public Drive view URL.
 *
 *    Deploy steps:
 *      - Click "Deploy" → "New deployment" → Type: Web App
 *      - Execute as:    Me  (your Google account — gives Drive quota)
 *      - Who has access: Anyone  (Worker calls it server-to-server)
 *      - Copy the Web App URL → set as APPS_SCRIPT_URL Worker secret
 *      - Set APPS_SCRIPT_SECRET to any random string (same in Worker)
 *
 * 2. SHEET SETUP — setupSheet(), formatSheet()
 *    Initialises headers, conditional formatting, summary sheet.
 *    Run once from the Extensions → Apps Script editor.
 */

// ── Shared secret — MUST match APPS_SCRIPT_SECRET Worker secret ──────────
// Change this to any long random string before deploying.
const UPLOAD_SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET';

// ── Web App: receive image from Worker, save to Google Drive ──────────────
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);

    // Validate shared secret
    if (!params.secret || params.secret !== UPLOAD_SECRET) {
      return respondJSON({ error: 'Unauthorized' }, 401);
    }

    const { imageData, filename, mimeType, folderId } = params;

    if (!imageData || !filename || !mimeType || !folderId) {
      return respondJSON({ error: 'Missing required fields: imageData, filename, mimeType, folderId' }, 400);
    }

    // Decode base64 → Blob → save to the Drive folder owned by THIS account
    const bytes = Utilities.base64Decode(imageData);
    const blob  = Utilities.newBlob(bytes, mimeType, filename);

    const folder = DriveApp.getFolderById(folderId);
    const file   = folder.createFile(blob);

    // Make publicly readable (anyone with link can view)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId   = file.getId();
    const viewUrl  = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const shareUrl = `https://drive.google.com/file/d/${fileId}/view`;

    return respondJSON({ viewUrl, shareUrl, fileId });

  } catch (err) {
    return respondJSON({ error: err.message });
  }
}

// Helper: return JSON response
function respondJSON(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Setup: Create header row ──────────────────────────────────
function setupSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Sheet1') || ss.insertSheet('Sheet1');

  // Set headers (must match worker/src/index.js row order)
  const headers = [
    'Submitted At',
    'Employee ID',
    'Employee Name',
    'Department',
    'Project Code',
    'Task Title',
    'Description',
    'Task Date',
    'Hours Worked',
    'Status',
    'Priority',
    'Notes',
    'Attachment URL',
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  formatSheet();
  SpreadsheetApp.getUi().alert('✅ Sheet initialized! Header row created and formatted.');
}

// ── Format: Style the sheet ───────────────────────────────────
function formatSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Sheet1');
  if (!sheet) { SpreadsheetApp.getUi().alert('Sheet1 not found. Run setupSheet first.'); return; }

  const lastCol = 13;

  // Header row styling
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange
    .setBackground('#1a1a2e')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(10)
    .setHorizontalAlignment('center');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Column widths
  const colWidths = [160, 100, 140, 120, 110, 220, 240, 100, 80, 100, 80, 200, 200];
  colWidths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // Status column conditional formatting
  // Each rule MUST have .setRanges([]) set, and the final call goes on the sheet
  const statusRange = sheet.getRange('J2:J1000');
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Completed').setBackground('#d4edda').setFontColor('#155724')
      .setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('In Progress').setBackground('#cce5ff').setFontColor('#004085')
      .setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Blocked').setBackground('#f8d7da').setFontColor('#721c24')
      .setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Review').setBackground('#fff3cd').setFontColor('#856404')
      .setRanges([statusRange]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('On Hold').setBackground('#e2e3e5').setFontColor('#383d41')
      .setRanges([statusRange]).build(),
  ];
  sheet.setConditionalFormatRules(rules); // Must be called on sheet, not range

  // Auto-resize based on content for key columns
  sheet.autoResizeColumn(6); // Task Title
  sheet.autoResizeColumn(7); // Description

  // Set text wrapping for Column M (Attachment URL)
  sheet.getRange('M2:M1000').setWrap(true);

  // Apply alternating row colors to data
  const dataRange = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), lastCol);
  dataRange.setBorder(false, false, false, false, true, false, '#e0e0e0', SpreadsheetApp.BorderStyle.SOLID);

  SpreadsheetApp.getActiveSpreadsheet().toast('Sheet formatted successfully!', '✅ Done', 3);
}

// ── Stats summary sheet ───────────────────────────────────────
function createSummarySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let summary = ss.getSheetByName('Summary');
  if (!summary) summary = ss.insertSheet('Summary');

  summary.clearContents();

  const dataSheet = ss.getSheetByName('Sheet1');
  if (!dataSheet) return;

  const lastRow = dataSheet.getLastRow();
  if (lastRow < 2) { summary.getRange('A1').setValue('No data yet.'); return; }

  const data = dataSheet.getRange(2, 1, lastRow - 1, 13).getValues();

  // Aggregate by employee
  const byEmp = {};
  data.forEach(r => {
    const empId   = r[1];
    const empName = r[2];
    const hours   = parseFloat(r[8]) || 0;
    const status  = r[9];
    if (!byEmp[empId]) byEmp[empId] = { name: empName, total: 0, done: 0, hours: 0 };
    byEmp[empId].total++;
    if (status === 'Completed') byEmp[empId].done++;
    byEmp[empId].hours += hours;
  });

  const rows = [['Employee ID', 'Name', 'Total Tasks', 'Completed', 'Hours Logged']];
  Object.entries(byEmp).forEach(([id, v]) => {
    rows.push([id, v.name, v.total, v.done, v.hours]);
  });

  summary.getRange(1, 1, rows.length, 5).setValues(rows);
  summary.getRange(1, 1, 1, 5)
    .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold');
  summary.setFrozenRows(1);

  SpreadsheetApp.getActiveSpreadsheet().toast('Summary sheet created!', '✅ Done', 3);
}

// ── Daily email digest (optional) ────────────────────────────
function sendDailyDigest() {
  const EMAIL_TO = 'admin@yourcompany.com'; // ← Change this
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const sheet     = ss.getSheetByName('Sheet1');
  if (!sheet) return;

  const today = new Date();
  const todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  const todayRows = data.filter(r => String(r[7]).startsWith(todayStr));

  if (todayRows.length === 0) return;

  const html = `
    <h2>📊 Daily Task Report — ${todayStr}</h2>
    <p>${todayRows.length} task(s) submitted today:</p>
    <table border="1" cellpadding="6" style="border-collapse:collapse; font-family:sans-serif; font-size:13px;">
      <tr style="background:#1a1a2e; color:#fff;">
        <th>Employee</th><th>Task</th><th>Project</th><th>Hours</th><th>Status</th>
      </tr>
      ${todayRows.map(r => `
        <tr>
          <td>${r[2]} (${r[1]})</td>
          <td>${r[5]}</td>
          <td>${r[4] || '—'}</td>
          <td>${r[8] || '—'}</td>
          <td>${r[9]}</td>
        </tr>`).join('')}
    </table>
    <p style="color:#888; font-size:11px; margin-top:16px;">Sent automatically by Employee Task Tracker</p>
  `;

  MailApp.sendEmail({
    to: EMAIL_TO,
    subject: `Task Tracker Daily Report — ${todayStr}`,
    htmlBody: html,
  });
}

// ── Menu ──────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🗂️ Task Tracker')
    .addItem('Initialize Sheet (run first)', 'setupSheet')
    .addItem('Format Sheet', 'formatSheet')
    .addItem('Generate Summary', 'createSummarySheet')
    .addItem('Send Daily Digest Now', 'sendDailyDigest')
    .addToUi();
}
