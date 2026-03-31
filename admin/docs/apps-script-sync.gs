/**
 * 3-Way Sync: Google Sheet A ↔ Supabase DB ↔ Google Sheet B
 *
 * Setup:
 * 1. Create a new Apps Script project at script.google.com
 * 2. Paste this entire file
 * 3. In Project Settings > Script Properties, add:
 *    - SUPABASE_SERVICE_KEY = your Supabase service role key
 * 4. Deploy > New deployment > Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL → paste into the Supabase migration
 *    (20260330000021_project_tasks.sql, replace YOUR_APPS_SCRIPT_WEB_APP_URL)
 * 6. Triggers > Add Trigger:
 *    - Function: onSheetAEdit
 *    - Event source: From spreadsheet (select Sheet A)
 *    - Event type: On edit
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  SHEET_A_ID:  '12lub47N9hJh2YSFPK0GAc_Q73wDMNEJrUL8i5GHa5Gw',
  SHEET_A_GID: 0,
  SHEET_B_ID:  '1g5O4E0t43Gsaf6UuQ1-8pyfcyota1d3QvICNseffc2Y',
  SHEET_B_GID: 1708645261,
  SUPABASE_URL: 'https://kzawtuvmchhtdsokrjys.supabase.co',
};

function getServiceKey() {
  return PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_KEY');
}

// ─── Column Mappings (1-indexed) ────────────────────────────────────────────

// Sheet A: NO | 項目 | 負責人 | 應完成日期 | 實際完成日期 | 進行中/已完成 | 進度說明
const COL_A = { NO: 1, NAME: 2, ASSIGNEE: 3, PLANNED_END: 4, ACTUAL_END: 5, STATUS: 6, NOTE1: 7 };

// Sheet B: 任務 | 任務名稱 | 負責人 | 計畫開始日 | 計畫完成日 | 實際完成日 | 狀態 | 備註1 | 備註2 | 備註3 | 更新時間 | Trigger1 | Trigger2 | Trigger3
const COL_B = { NO: 1, NAME: 2, ASSIGNEE: 3, PLANNED_START: 4, PLANNED_END: 5, ACTUAL_END: 6, STATUS: 7, NOTE1: 8, NOTE2: 9, NOTE3: 10, UPDATED: 11, TRIG1: 12, TRIG2: 13, TRIG3: 14 };

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSheetByGid(spreadsheetId, gid) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  throw new Error('Sheet with GID ' + gid + ' not found in ' + spreadsheetId);
}

function formatDate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  if (!s) return null;
  // Handle "3/16" format → "2026-03-16"
  var m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    var month = ('0' + m[1]).slice(-2);
    var day = ('0' + m[2]).slice(-2);
    return '2026-' + month + '-' + day;
  }
  return s;
}

function findRowByTaskNo(sheet, col, taskNo) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (parseInt(values[i][0], 10) === taskNo) return i + 2;
  }
  return -1;
}

// ─── Supabase REST API ──────────────────────────────────────────────────────

function supabaseRequest(method, path, payload) {
  var key = getServiceKey();
  var options = {
    method: method,
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Prefer': method === 'post' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    muteHttpExceptions: true,
  };
  if (payload) options.payload = JSON.stringify(payload);
  return UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + path, options);
}

function supabaseUpsert(taskNo, fields) {
  // Use PostgREST upsert (POST with merge-duplicates)
  var payload = {};
  payload.task_no = taskNo;
  payload.sync_source = 'sheet_a';
  payload.synced_at = new Date().toISOString();

  // Only include non-null fields
  if (fields.name !== undefined && fields.name !== '') payload.name = fields.name;
  if (fields.assignee !== undefined) payload.assignee = fields.assignee || null;
  if (fields.planned_end !== undefined) payload.planned_end = fields.planned_end;
  if (fields.actual_end !== undefined) payload.actual_end = fields.actual_end;
  if (fields.status !== undefined && fields.status !== '') payload.status = fields.status;
  if (fields.note1 !== undefined) payload.note1 = fields.note1 || null;

  var resp = supabaseRequest('post', 'project_tasks?on_conflict=task_no', payload);
  if (resp.getResponseCode() >= 400) {
    console.error('Supabase upsert failed: ' + resp.getContentText());
  }
}

// ─── Sheet A onEdit → DB + Sheet B ─────────────────────────────────────────

function onSheetAEdit(e) {
  // Check lock (prevents loops when doPost writes to Sheet A)
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SYNCING') === 'true') return;

  var sheet = e.source.getActiveSheet();
  if (sheet.getSheetId() !== CONFIG.SHEET_A_GID) return;

  var row = e.range.getRow();
  if (row < 2) return; // Skip header

  var rowData = sheet.getRange(row, 1, 1, 7).getValues()[0];
  var taskNo = parseInt(rowData[COL_A.NO - 1], 10);
  if (!taskNo || isNaN(taskNo)) return;

  var fields = {
    name:        String(rowData[COL_A.NAME - 1] || ''),
    assignee:    String(rowData[COL_A.ASSIGNEE - 1] || ''),
    planned_end: formatDate(rowData[COL_A.PLANNED_END - 1]),
    actual_end:  formatDate(rowData[COL_A.ACTUAL_END - 1]),
    status:      String(rowData[COL_A.STATUS - 1] || ''),
    note1:       String(rowData[COL_A.NOTE1 - 1] || ''),
  };

  try {
    // 1. Upsert to Supabase
    supabaseUpsert(taskNo, fields);

    // 2. Copy common fields to Sheet B
    copyToSheetB(taskNo, fields);
  } catch (err) {
    console.error('onSheetAEdit sync failed: ' + err);
  }
}

function copyToSheetB(taskNo, fields) {
  var sheet = getSheetByGid(CONFIG.SHEET_B_ID, CONFIG.SHEET_B_GID);
  var targetRow = findRowByTaskNo(sheet, COL_B.NO, taskNo);

  if (targetRow === -1) {
    // Append new row
    targetRow = sheet.getLastRow() + 1;
    sheet.getRange(targetRow, COL_B.NO).setValue(taskNo);
  }

  // Only update common fields — leave Sheet B extras (triggers, note2/3) untouched
  if (fields.name)     sheet.getRange(targetRow, COL_B.NAME).setValue(fields.name);
  if (fields.assignee !== undefined) sheet.getRange(targetRow, COL_B.ASSIGNEE).setValue(fields.assignee);
  if (fields.planned_end) sheet.getRange(targetRow, COL_B.PLANNED_END).setValue(fields.planned_end);
  if (fields.actual_end)  sheet.getRange(targetRow, COL_B.ACTUAL_END).setValue(fields.actual_end);
  if (fields.status)   sheet.getRange(targetRow, COL_B.STATUS).setValue(fields.status);
  if (fields.note1 !== undefined) sheet.getRange(targetRow, COL_B.NOTE1).setValue(fields.note1);
  sheet.getRange(targetRow, COL_B.UPDATED).setValue(new Date());
}

// ─── doPost: Supabase pg_net calls this when LINE updates DB ────────────────

function doPost(e) {
  var props = PropertiesService.getScriptProperties();

  try {
    props.setProperty('SYNCING', 'true');

    var data = JSON.parse(e.postData.contents);
    if (data.action !== 'sync_from_db') {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unknown action' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var taskNo = parseInt(data.task_no, 10);
    if (!taskNo) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'missing task_no' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Update Sheet A
    updateSheetA(taskNo, data);

    // Update Sheet B (common fields only)
    updateSheetB(taskNo, data);

    return ContentService.createTextOutput(JSON.stringify({ ok: true, task_no: taskNo }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error('doPost error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    Utilities.sleep(500);
    props.deleteProperty('SYNCING');
  }
}

function updateSheetA(taskNo, data) {
  var sheet = getSheetByGid(CONFIG.SHEET_A_ID, CONFIG.SHEET_A_GID);
  var targetRow = findRowByTaskNo(sheet, COL_A.NO, taskNo);

  if (targetRow === -1) {
    targetRow = sheet.getLastRow() + 1;
    sheet.getRange(targetRow, COL_A.NO).setValue(taskNo);
  }

  if (data.name)        sheet.getRange(targetRow, COL_A.NAME).setValue(data.name);
  if (data.assignee !== undefined) sheet.getRange(targetRow, COL_A.ASSIGNEE).setValue(data.assignee);
  if (data.planned_end) sheet.getRange(targetRow, COL_A.PLANNED_END).setValue(data.planned_end);
  if (data.actual_end)  sheet.getRange(targetRow, COL_A.ACTUAL_END).setValue(data.actual_end);
  if (data.status)      sheet.getRange(targetRow, COL_A.STATUS).setValue(data.status);
  if (data.note1 !== undefined) sheet.getRange(targetRow, COL_A.NOTE1).setValue(data.note1);
}

function updateSheetB(taskNo, data) {
  var sheet = getSheetByGid(CONFIG.SHEET_B_ID, CONFIG.SHEET_B_GID);
  var targetRow = findRowByTaskNo(sheet, COL_B.NO, taskNo);

  if (targetRow === -1) {
    targetRow = sheet.getLastRow() + 1;
    sheet.getRange(targetRow, COL_B.NO).setValue(taskNo);
  }

  // Only update common fields — leave triggers and extra notes untouched
  if (data.name)        sheet.getRange(targetRow, COL_B.NAME).setValue(data.name);
  if (data.assignee !== undefined) sheet.getRange(targetRow, COL_B.ASSIGNEE).setValue(data.assignee);
  if (data.planned_end) sheet.getRange(targetRow, COL_B.PLANNED_END).setValue(data.planned_end);
  if (data.actual_end)  sheet.getRange(targetRow, COL_B.ACTUAL_END).setValue(data.actual_end);
  if (data.status)      sheet.getRange(targetRow, COL_B.STATUS).setValue(data.status);
  if (data.note1 !== undefined) sheet.getRange(targetRow, COL_B.NOTE1).setValue(data.note1);
  sheet.getRange(targetRow, COL_B.UPDATED).setValue(new Date());
}

// ─── doGet: Health check ────────────────────────────────────────────────────

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: 'project-tasks-sync', ts: new Date().toISOString() })
  ).setMimeType(ContentService.MimeType.JSON);
}
