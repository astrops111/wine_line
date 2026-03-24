import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const liffId = Deno.env.get("LIFF_NEW_TASK_ID") ?? "";

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>新增任務</title>
<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh;padding-bottom:40px}
.header{background:linear-gradient(135deg,#E67E22,#9b5a0a);padding:16px;position:sticky;top:0;z-index:10;box-shadow:0 2px 8px #0006}
.header h1{font-size:16px;font-weight:700;color:#fff}
.header .subtitle{font-size:12px;color:#ffe0b2;margin-top:2px}
.card{background:#16213e;border-radius:12px;margin:16px;padding:16px;box-shadow:0 2px 8px #0004}
.section-title{font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}
.field{margin-bottom:14px}
.field:last-child{margin-bottom:0}
label{display:block;font-size:12px;color:#aaa;margin-bottom:5px;font-weight:600}
label .req{color:#E74C3C;margin-left:2px}
input[type=text],input[type=date],select,textarea{
  width:100%;background:#0f3460;border:1px solid #ffffff1a;border-radius:8px;
  color:#e0e0e0;padding:10px 12px;font-size:14px;font-family:inherit;
  appearance:none;-webkit-appearance:none
}
input[type=text]:focus,input[type=date]:focus,select:focus,textarea:focus{
  outline:none;border-color:#E67E22
}
input::placeholder,textarea::placeholder{color:#555}
textarea{resize:none;height:80px}
.btn-save{
  display:block;width:calc(100% - 32px);margin:16px;padding:15px;
  background:linear-gradient(135deg,#E67E22,#c0621a);border:none;border-radius:12px;
  color:#fff;font-size:16px;font-weight:700;cursor:pointer;
  box-shadow:0 4px 12px #E67E2266
}
.btn-save:active{opacity:.85;transform:scale(.98)}
.btn-save:disabled{background:#333;color:#666;box-shadow:none;cursor:not-allowed}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#27AE60;color:#fff;padding:12px 24px;border-radius:100px;font-size:14px;font-weight:700;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap;z-index:99}
.toast.error{background:#E74C3C}
.toast.show{opacity:1}
.loading{display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:12px;color:#666}
.spinner{width:36px;height:36px;border:3px solid #ffffff1a;border-top-color:#E67E22;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
select option{background:#0f3460;color:#e0e0e0}
</style>
</head>
<body>

<div id="loading" class="loading">
  <div class="spinner"></div>
  <div>載入中…</div>
</div>

<div id="app" style="display:none">
  <div class="header">
    <h1>➕ 新增任務</h1>
    <div class="subtitle">填寫任務資訊並提交</div>
  </div>

  <div class="card">
    <div class="section-title">基本資訊</div>
    <div class="field">
      <label>任務標題 <span class="req">*</span></label>
      <input type="text" id="title" placeholder="輸入任務標題…" maxlength="200"/>
    </div>
    <div class="field">
      <label>任務說明</label>
      <textarea id="description" placeholder="選填：詳細說明…"></textarea>
    </div>
  </div>

  <div class="card">
    <div class="section-title">分配設定</div>
    <div class="field">
      <label>所屬流程</label>
      <select id="workflowInstance">
        <option value="">— 不指定流程 —</option>
      </select>
    </div>
    <div class="field">
      <label>負責人</label>
      <select id="assignee">
        <option value="">— 不指定負責人 —</option>
      </select>
    </div>
  </div>

  <div class="card">
    <div class="section-title">排程與優先級</div>
    <div class="field">
      <label>優先級</label>
      <select id="priority">
        <option value="low">🟢 低</option>
        <option value="medium" selected>🟡 中</option>
        <option value="high">🔴 高</option>
        <option value="urgent">🚨 緊急</option>
      </select>
    </div>
    <div class="field">
      <label>計劃開始日期</label>
      <input type="date" id="plannedStart"/>
    </div>
    <div class="field">
      <label>截止日期</label>
      <input type="date" id="dueDate"/>
    </div>
  </div>

  <div class="card">
    <div class="section-title">初始備註</div>
    <div class="field">
      <textarea id="notes" placeholder="選填：新增初始備註…"></textarea>
    </div>
  </div>

  <button class="btn-save" id="saveBtn" onclick="createTask()">➕ 建立任務</button>
</div>

<div class="toast" id="toast"></div>

<script>
const SUPABASE_URL = '${supabaseUrl}';
const SUPABASE_ANON_KEY = '${supabaseAnonKey}';
const LIFF_ID = '${liffId}';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUserId = null; // linked user_id from line_users

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '') + ' show';
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

function populateSelect(id, items, valueKey, labelKey, emptyLabel) {
  const sel = document.getElementById(id);
  // keep first empty option
  while (sel.options.length > 1) sel.remove(1);
  (items || []).forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = item[labelKey];
    sel.appendChild(opt);
  });
}

async function init() {
  try {
    if (LIFF_ID) {
      await liff.init({ liffId: LIFF_ID });
      // Try to get linked user_id from line_users
      if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        const { data: lu } = await sb
          .from('line_users')
          .select('user_id')
          .eq('line_user_id', profile.userId)
          .maybeSingle();
        if (lu?.user_id) {
          currentUserId = lu.user_id;
        }
      }
    }
  } catch (e) {
    console.warn('LIFF init:', e);
  }

  // Load workflow instances and users in parallel
  const [wiRes, usersRes] = await Promise.all([
    sb.from('workflow_instances').select('id, name').in('status', ['running', 'paused']).order('name'),
    sb.from('users').select('id, name').eq('is_active', true).order('name'),
  ]);

  populateSelect('workflowInstance', wiRes.data, 'id', 'name', '— 不指定流程 —');
  populateSelect('assignee', usersRes.data, 'id', 'name', '— 不指定負責人 —');

  // Pre-select current user as assignee if available
  if (currentUserId) {
    const sel = document.getElementById('assignee');
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === currentUserId) { sel.selectedIndex = i; break; }
    }
  }

  // Pre-select workflow from URL param if passed
  const params = new URLSearchParams(window.location.search);
  const wiParam = params.get('workflow_instance_id');
  if (wiParam) {
    const sel = document.getElementById('workflowInstance');
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === wiParam) { sel.selectedIndex = i; break; }
    }
  }

  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

async function createTask() {
  const title = document.getElementById('title').value.trim();
  if (!title) { showToast('請輸入任務標題', true); return; }

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '建立中…';

  const description = document.getElementById('description').value.trim() || null;
  const workflowInstanceId = document.getElementById('workflowInstance').value || null;
  const assignee = document.getElementById('assignee').value || null;
  const priority = document.getElementById('priority').value;
  const plannedStart = document.getElementById('plannedStart').value || null;
  const dueDate = document.getElementById('dueDate').value || null;
  const noteText = document.getElementById('notes').value.trim();

  let notes = null;
  if (noteText) {
    const ts = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    notes = '[' + ts + '] ' + noteText;
  }

  const payload = {
    title,
    description,
    workflow_instance_id: workflowInstanceId,
    assigned_to: assignee,
    priority,
    status: 'pending',
    planned_start: plannedStart,
    due_date: dueDate,
    notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from('tasks').insert(payload);

  btn.disabled = false;
  btn.textContent = '➕ 建立任務';

  if (error) {
    showToast('建立失敗：' + error.message, true);
  } else {
    showToast('✅ 任務已建立！');
    // Reset form
    document.getElementById('title').value = '';
    document.getElementById('description').value = '';
    document.getElementById('notes').value = '';
    document.getElementById('plannedStart').value = '';
    document.getElementById('dueDate').value = '';
    document.getElementById('priority').value = 'medium';
    setTimeout(() => {
      try { liff.closeWindow(); } catch(e) { window.close(); }
    }, 1500);
  }
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
