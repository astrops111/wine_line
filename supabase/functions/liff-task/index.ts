import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const liffId = Deno.env.get("LIFF_TASK_ID") ?? "";

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>更新任務</title>
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh;padding-bottom:32px}
.header{background:linear-gradient(135deg,#722F37,#4a1a20);padding:16px;position:sticky;top:0;z-index:10;box-shadow:0 2px 8px #0006}
.header h1{font-size:16px;font-weight:700;color:#fff}
.header .subtitle{font-size:12px;color:#ffcccc;margin-top:2px}
.card{background:#16213e;border-radius:12px;margin:16px;padding:16px;box-shadow:0 2px 8px #0004}
.section-title{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
.info-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #ffffff0f}
.info-row:last-child{border-bottom:none}
.info-label{font-size:12px;color:#888}
.info-value{font-size:13px;font-weight:600;color:#e0e0e0;text-align:right;max-width:60%}
.field{margin-bottom:14px}
label{display:block;font-size:12px;color:#aaa;margin-bottom:5px;font-weight:600}
select,input[type=date]{width:100%;background:#0f3460;border:1px solid #ffffff1a;border-radius:8px;color:#e0e0e0;padding:10px 12px;font-size:14px;appearance:none;-webkit-appearance:none}
select:focus,input[type=date]:focus{outline:none;border-color:#722F37}
.notes-existing{background:#0a0a1a;border-radius:8px;padding:10px;font-size:11px;color:#888;max-height:100px;overflow-y:auto;margin-bottom:8px;white-space:pre-wrap;word-break:break-word;line-height:1.5}
.notes-existing.empty{color:#444;font-style:italic}
textarea{width:100%;background:#0f3460;border:1px solid #ffffff1a;border-radius:8px;color:#e0e0e0;padding:10px 12px;font-size:14px;resize:none;height:90px;font-family:inherit}
textarea:focus{outline:none;border-color:#722F37}
textarea::placeholder{color:#555}
.btn-save{display:block;width:calc(100% - 32px);margin:16px;padding:15px;background:linear-gradient(135deg,#722F37,#9b3a45);border:none;border-radius:12px;color:#fff;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px #722F3766}
.btn-save:active{opacity:.85;transform:scale(.98)}
.btn-save:disabled{background:#333;color:#666;box-shadow:none;cursor:not-allowed}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#27AE60;color:#fff;padding:12px 24px;border-radius:100px;font-size:14px;font-weight:700;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
.toast.error{background:#E74C3C}
.toast.show{opacity:1}
.loading{display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:12px;color:#666}
.spinner{width:36px;height:36px;border:3px solid #ffffff1a;border-top-color:#722F37;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.badge{display:inline-block;padding:2px 8px;border-radius:100px;font-size:11px;font-weight:700}
</style>
</head>
<body>

<div id="loading" class="loading">
  <div class="spinner"></div>
  <div>載入任務中…</div>
</div>

<div id="app" style="display:none">
  <div class="header">
    <h1 id="taskTitle">—</h1>
    <div class="subtitle" id="workflowName">—</div>
  </div>

  <div class="card">
    <div class="section-title">任務資訊</div>
    <div class="info-row">
      <span class="info-label">負責人</span>
      <span class="info-value" id="assigneeName">—</span>
    </div>
    <div class="info-row">
      <span class="info-label">建立時間</span>
      <span class="info-value" id="createdAt">—</span>
    </div>
  </div>

  <div class="card">
    <div class="section-title">編輯任務</div>
    <div class="field">
      <label>狀態</label>
      <select id="status">
        <option value="pending">待處理</option>
        <option value="in_progress">進行中</option>
        <option value="completed">已完成</option>
        <option value="blocked">封鎖中</option>
        <option value="cancelled">已取消</option>
      </select>
    </div>
    <div class="field">
      <label>優先級</label>
      <select id="priority">
        <option value="low">🟢 低</option>
        <option value="medium">🟡 中</option>
        <option value="high">🔴 高</option>
        <option value="urgent">🚨 緊急</option>
      </select>
    </div>
    <div class="field">
      <label>截止日期</label>
      <input type="date" id="dueDate"/>
    </div>
  </div>

  <div class="card">
    <div class="section-title">備註記錄</div>
    <div id="existingNotes" class="notes-existing empty">（尚無備註）</div>
    <label style="margin-top:4px">新增備註</label>
    <textarea id="newNote" placeholder="輸入備註內容…"></textarea>
  </div>

  <button class="btn-save" id="saveBtn" onclick="saveTask()">💾 儲存更新</button>
</div>

<div class="toast" id="toast"></div>

<script>
const SUPABASE_URL = '${supabaseUrl}';
const SUPABASE_ANON_KEY = '${supabaseAnonKey}';
const LIFF_ID = '${liffId}';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let taskId = null;
let taskData = null;

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '') + ' show';
  setTimeout(() => { t.className = 'toast'; }, 2800);
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('zh-TW');
}

async function loadTask() {
  const params = new URLSearchParams(window.location.search);
  taskId = params.get('task_id');
  if (!taskId) { showToast('缺少任務 ID', true); return; }

  const { data, error } = await sb
    .from('tasks')
    .select('id, title, status, priority, due_date, notes, created_at, workflow_instance_id, assignee:users!tasks_assigned_to_fkey(name), workflow_instance:workflow_instances(name)')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !data) { showToast('載入失敗：' + (error?.message ?? '找不到任務'), true); return; }
  taskData = data;

  document.getElementById('taskTitle').textContent = data.title;
  document.getElementById('workflowName').textContent = data.workflow_instance?.name ?? '—';
  document.getElementById('assigneeName').textContent = data.assignee?.name ?? '—';
  document.getElementById('createdAt').textContent = fmt(data.created_at);
  document.getElementById('status').value = data.status ?? 'pending';
  document.getElementById('priority').value = data.priority ?? 'medium';
  document.getElementById('dueDate').value = data.due_date ? data.due_date.slice(0, 10) : '';

  const notesEl = document.getElementById('existingNotes');
  if (data.notes) {
    notesEl.textContent = data.notes;
    notesEl.className = 'notes-existing';
  }

  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

async function saveTask() {
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '儲存中…';

  const status = document.getElementById('status').value;
  const priority = document.getElementById('priority').value;
  const dueDate = document.getElementById('dueDate').value || null;
  const newNote = document.getElementById('newNote').value.trim();

  const updates = {
    status,
    priority,
    due_date: dueDate,
    updated_at: new Date().toISOString(),
  };

  if (status === 'completed' && taskData.status !== 'completed') {
    updates.completed_at = new Date().toISOString();
  } else if (status !== 'completed') {
    updates.completed_at = null;
  }

  if (newNote) {
    const ts = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    const existing = taskData.notes ? taskData.notes + '\\n' : '';
    updates.notes = existing + '[' + ts + '] ' + newNote;
  }

  const { error } = await sb.from('tasks').update(updates).eq('id', taskId);

  btn.disabled = false;
  btn.textContent = '💾 儲存更新';

  if (error) {
    showToast('儲存失敗：' + error.message, true);
  } else {
    showToast('✅ 已儲存！');
    document.getElementById('newNote').value = '';
    if (updates.notes) {
      const notesEl = document.getElementById('existingNotes');
      notesEl.textContent = updates.notes;
      notesEl.className = 'notes-existing';
    }
    taskData = { ...taskData, ...updates };
    // Close LIFF after short delay
    setTimeout(() => {
      try { liff.closeWindow(); } catch(e) { window.close(); }
    }, 1500);
  }
}

async function init() {
  try {
    if (LIFF_ID) {
      await liff.init({ liffId: LIFF_ID });
    }
  } catch (e) {
    console.warn('LIFF init skipped:', e);
  }
  await loadTask();
}

init();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});
