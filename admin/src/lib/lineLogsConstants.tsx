import type React from 'react';

// ── Badge Maps ───────────────────────────────────────────────────────────────

export const DIRECTION_BADGE: Record<string, { bg: string; color: string; zh: string; en: string }> = {
  incoming: { bg: '#dbeafe', color: '#1d4ed8', zh: '收', en: 'In' },
  outgoing: { bg: '#dcfce7', color: '#15803d', zh: '發', en: 'Out' },
};

export const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
  user:  { bg: '#f3f4f6', color: '#374151' },
  group: { bg: '#f3e8ff', color: '#7e22ce' },
  room:  { bg: '#fef3c7', color: '#92400e' },
};

export const ERROR_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  db_error:         { bg: '#fee2e2', color: '#b91c1c' },
  line_api_error:   { bg: '#ffedd5', color: '#c2410c' },
  unhandled:        { bg: '#f3e8ff', color: '#7e22ce' },
  command_error:    { bg: '#fef9c3', color: '#a16207' },
  validation_error: { bg: '#e0e7ff', color: '#4338ca' },
};

export const COMMAND_LABELS: Record<string, string> = {
  help: '說明', register: '綁定', task_list: '任務列表', task_list_all: '全部任務',
  task_create: '新增任務', task_done: '完成任務', task_update: '更新任務',
  notes: '備註', workflow_status: '流程狀態', workflow_tasks: '流程任務',
  manager_menu: '管理選單', manager_overview: '總覽', manager_assign: '指派',
  manager_leave_review: '假單審核', leave_balance: '假期餘額', overtime_query: '加班查詢',
  payslip_query: '薪資查詢', leave_request_prompt: '請假', enhanced_task_create: '進階新增任務',
  pending_action: '待處理操作', welcome: '歡迎', unrecognized: '未識別',
  group_task_create: '群組新增任務',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDate(iso: string, zh: boolean) {
  return new Date(iso).toLocaleString(zh ? 'zh-TW' : 'en-US', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function formatDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: bg, color, padding: '2px 8px', borderRadius: '10px',
      fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function weekAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// ── Shared sub-component: tag list renderer ──────────────────────────────────

export function TagList({ items, bg, color, label }: { items: string[] | null; bg: string; color: string; label: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color, marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {items.map((item, i) => (
          <span key={i} style={{
            background: bg, color, padding: '3px 10px', borderRadius: '12px',
            fontSize: '12px', lineHeight: '1.5',
          }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
