import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineMessage {
  id: string;
  line_user_id: string;
  display_name: string | null;
  message_text: string;
  source_type: string;
  direction: string;
  group_id: string | null;
  event_type: string | null;
  created_at: string;
}

interface CommandLog {
  id: string;
  line_user_id: string;
  display_name: string | null;
  command_matched: string;
  raw_input: string;
  source_type: string;
  group_id: string | null;
  success: boolean;
  error_message: string | null;
  created_entity_type: string | null;
  created_entity_id: string | null;
  metadata: Record<string, unknown> | null;
  execution_ms: number | null;
  created_at: string;
}

interface ErrorLog {
  id: string;
  line_user_id: string | null;
  source_type: string | null;
  group_id: string | null;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

interface DailySummary {
  id: string;
  group_id: string;
  group_name: string | null;
  summary_date: string;
  message_count: number;
  unique_users: number | null;
  user_names: string[] | null;
  summary_text: string;
  context: Record<string, unknown> | null;
  created_at: string;
}

interface LineGroup {
  id: string;
  group_name: string;
  line_group_id: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DIRECTION_BADGE: Record<string, { bg: string; color: string; zh: string; en: string }> = {
  incoming: { bg: '#dbeafe', color: '#1d4ed8', zh: '收', en: 'In' },
  outgoing: { bg: '#dcfce7', color: '#15803d', zh: '發', en: 'Out' },
};

const SOURCE_BADGE: Record<string, { bg: string; color: string }> = {
  user:  { bg: '#f3f4f6', color: '#374151' },
  group: { bg: '#f3e8ff', color: '#7e22ce' },
  room:  { bg: '#fef3c7', color: '#92400e' },
};

const ERROR_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  db_error:         { bg: '#fee2e2', color: '#b91c1c' },
  line_api_error:   { bg: '#ffedd5', color: '#c2410c' },
  unhandled:        { bg: '#f3e8ff', color: '#7e22ce' },
  command_error:    { bg: '#fef9c3', color: '#a16207' },
  validation_error: { bg: '#e0e7ff', color: '#4338ca' },
};

const COMMAND_LABELS: Record<string, string> = {
  help: '說明', register: '綁定', task_list: '任務列表', task_list_all: '全部任務',
  task_create: '新增任務', task_done: '完成任務', task_update: '更新任務',
  notes: '備註', workflow_status: '流程狀態', workflow_tasks: '流程任務',
  manager_menu: '管理選單', manager_overview: '總覽', manager_assign: '指派',
  manager_leave_review: '假單審核', leave_balance: '假期餘額', overtime_query: '加班查詢',
  payslip_query: '薪資查詢', leave_request_prompt: '請假', enhanced_task_create: '進階新增任務',
  pending_action: '待處理操作', welcome: '歡迎', unrecognized: '未識別',
  group_task_create: '群組新增任務',
};

function formatDate(iso: string, zh: boolean) {
  return new Date(iso).toLocaleString(zh ? 'zh-TW' : 'en-US', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return (
    <span style={{
      background: bg, color, padding: '2px 8px', borderRadius: '10px',
      fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// ── Component ─────────────────────────────────────────────────────────────────

type Tab = 'summary' | 'messages' | 'commands' | 'errors';

export function LineLogs() {
  const zh = getLocale() === 'zh-TW';

  // ── State ──────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('summary');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterCommand, setFilterCommand] = useState('');
  const [filterErrorType, setFilterErrorType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Data
  const [groups, setGroups] = useState<LineGroup[]>([]);
  const [messages, setMessages] = useState<LineMessage[]>([]);
  const [commands, setCommands] = useState<CommandLog[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [generating, setGenerating] = useState(false);
  const [summaryDate, setSummaryDate] = useState(todayISO());

  // Stats
  const [stats, setStats] = useState({ totalMessages: 0, commandsToday: 0, errorsToday: 0, activeGroups: 0 });

  // ── Load groups (once) ─────────────────────────────────────
  useEffect(() => {
    supabase.from('line_groups').select('id, group_name, line_group_id').order('group_name').then(({ data }) => {
      setGroups(data || []);
    });
  }, []);

  // ── Load stats (once) ──────────────────────────────────────
  useEffect(() => {
    const today = todayISO();
    const weekAgo = weekAgoISO();
    Promise.all([
      supabase.from('line_messages').select('id', { count: 'exact', head: true }),
      supabase.from('line_command_logs').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('line_error_logs').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('line_messages').select('group_id').not('group_id', 'is', null).gte('created_at', weekAgo),
    ]).then(([msgRes, cmdRes, errRes, grpRes]) => {
      const uniqueGroups = new Set((grpRes.data || []).map((r: { group_id: string }) => r.group_id));
      setStats({
        totalMessages: msgRes.count ?? 0,
        commandsToday: cmdRes.count ?? 0,
        errorsToday: errRes.count ?? 0,
        activeGroups: uniqueGroups.size,
      });
    });
  }, []);

  // ── Load tab data ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setExpandedId(null);

    if (tab === 'summary') {
      let q = supabase.from('line_daily_summaries').select('*').order('summary_date', { ascending: false }).limit(200);
      if (filterGroup) q = q.eq('group_id', filterGroup);
      if (dateFrom) q = q.gte('summary_date', dateFrom);
      if (dateTo) q = q.lte('summary_date', dateTo);
      const { data } = await q;
      setSummaries(data || []);
    } else if (tab === 'messages') {
      let q = supabase.from('line_messages').select('*').order('created_at', { ascending: false }).limit(500);
      if (filterGroup) q = q.eq('group_id', filterGroup);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
      const { data } = await q;
      setMessages(data || []);
    } else if (tab === 'commands') {
      let q = supabase.from('line_command_logs').select('*').order('created_at', { ascending: false }).limit(500);
      if (filterGroup) q = q.eq('group_id', filterGroup);
      if (filterCommand) q = q.eq('command_matched', filterCommand);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
      const { data } = await q;
      setCommands(data || []);
    } else if (tab === 'errors') {
      let q = supabase.from('line_error_logs').select('*').order('created_at', { ascending: false }).limit(500);
      if (filterGroup) q = q.eq('group_id', filterGroup);
      if (filterErrorType) q = q.eq('error_type', filterErrorType);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
      const { data } = await q;
      setErrors(data || []);
    }

    setLoading(false);
  }, [tab, filterGroup, filterCommand, filterErrorType, dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Search filter (client-side) ────────────────────────────
  const s = search.toLowerCase();

  const filteredMessages = messages.filter(m =>
    !s || (m.display_name ?? '').toLowerCase().includes(s) || m.message_text.toLowerCase().includes(s)
  );

  const filteredCommands = commands.filter(c =>
    !s || (c.display_name ?? '').toLowerCase().includes(s) || c.raw_input.toLowerCase().includes(s) || c.command_matched.includes(s)
  );

  const filteredErrors = errors.filter(e =>
    !s || (e.error_message ?? '').toLowerCase().includes(s) || (e.error_type ?? '').includes(s)
  );

  const filteredSummaries = summaries.filter(sm =>
    !s || (sm.group_name ?? '').toLowerCase().includes(s) || sm.summary_text.toLowerCase().includes(s)
  );

  // ── Generate summary ───────────────────────────────────────
  const handleGenerateSummary = async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc('generate_daily_summary', { target_date: summaryDate });
    setGenerating(false);
    if (error) {
      alert(zh ? `產生摘要失敗: ${error.message}` : `Failed to generate summary: ${error.message}`);
    } else {
      alert(zh ? `已產生 ${data} 筆群組摘要` : `Generated ${data} group summaries`);
      loadData();
    }
  };

  // ── Group name resolver ────────────────────────────────────
  const groupName = (groupId: string | null) => {
    if (!groupId) return null;
    const g = groups.find(g => g.line_group_id === groupId);
    return g?.group_name ?? groupId.slice(0, 8) + '…';
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
            📊 {zh ? 'LINE 記錄' : 'LINE Logs'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            {zh ? '查看 LINE Bot 訊息、指令與錯誤記錄' : 'View LINE Bot messages, commands, and error logs'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: zh ? '總訊息' : 'Messages', value: stats.totalMessages, color: '#6366f1' },
          { label: zh ? '今日指令' : 'Cmds Today', value: stats.commandsToday, color: '#2563eb' },
          { label: zh ? '今日錯誤' : 'Errors Today', value: stats.errorsToday, color: '#dc2626' },
          { label: zh ? '活躍群組' : 'Active Groups', value: stats.activeGroups, color: '#16a34a' },
        ].map(st => (
          <div key={st.label} className="card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: st.color }}>{st.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: '16px' }}>
        {([
          { key: 'summary',  label: zh ? '📊 總覽' : '📊 Summary' },
          { key: 'messages', label: zh ? '💬 訊息' : '💬 Messages' },
          { key: 'commands', label: zh ? '⚡ 指令' : '⚡ Commands' },
          { key: 'errors',   label: zh ? '❌ 錯誤' : '❌ Errors' },
        ] as const).map(({ key, label }) => (
          <button key={key} className={`tab-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <input
          className="input-field"
          style={{ flex: '1 1 200px', minWidth: '160px' }}
          aria-label="搜尋訊息" name="search" autoComplete="off" placeholder={zh ? '搜尋訊息、用戶…' : 'Search messages, users…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input-field" style={{ flex: '0 0 160px' }} value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
          <option value="">{zh ? '所有群組' : 'All Groups'}</option>
          {groups.map(g => (
            <option key={g.id} value={g.line_group_id}>{g.group_name}</option>
          ))}
        </select>
        {tab === 'commands' && (
          <select className="input-field" style={{ flex: '0 0 140px' }} value={filterCommand} onChange={e => setFilterCommand(e.target.value)}>
            <option value="">{zh ? '所有指令' : 'All Commands'}</option>
            {Object.entries(COMMAND_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{zh ? v : k}</option>
            ))}
          </select>
        )}
        {tab === 'errors' && (
          <select className="input-field" style={{ flex: '0 0 150px' }} value={filterErrorType} onChange={e => setFilterErrorType(e.target.value)}>
            <option value="">{zh ? '所有類型' : 'All Types'}</option>
            {Object.keys(ERROR_TYPE_COLORS).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        )}
        <input type="date" className="input-field" style={{ flex: '0 0 140px' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className="input-field" style={{ flex: '0 0 140px' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFilterGroup(''); setFilterCommand(''); setFilterErrorType(''); setDateFrom(''); setDateTo(''); }}>
          {zh ? '清除' : 'Clear'}
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'summary' && renderSummaryTab()}
      {tab === 'messages' && renderMessagesTab()}
      {tab === 'commands' && renderCommandsTab()}
      {tab === 'errors' && renderErrorsTab()}
    </div>
  );

  // ── Summary Tab ────────────────────────────────────────────
  function renderSummaryTab() {
    return (
      <>
        {/* Generate controls */}
        <div className="card" style={{ padding: '14px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '產生每日摘要：' : 'Generate daily summary:'}</span>
          <input type="date" className="input-field" style={{ width: '160px' }} value={summaryDate} onChange={e => setSummaryDate(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={handleGenerateSummary} disabled={generating}>
            {generating ? (zh ? '產生中…' : 'Generating…') : (zh ? '產生摘要' : 'Generate')}
          </button>
        </div>

        {loading ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {zh ? '載入中…' : 'Loading…'}
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
            {zh ? '尚無摘要記錄，請先點擊「產生摘要」' : 'No summaries yet. Click "Generate" to create one.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredSummaries.map(sm => (
              <div key={sm.id} className="card" style={{ padding: '16px', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === sm.id ? null : sm.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{sm.group_name ?? sm.group_id.slice(0, 12)}</span>
                    <Badge bg="#f3f4f6" color="#374151">{formatDateOnly(sm.summary_date)}</Badge>
                    <Badge bg="#dbeafe" color="#1d4ed8">{sm.message_count} {zh ? '則訊息' : 'msgs'}</Badge>
                    <Badge bg="#dcfce7" color="#15803d">{sm.unique_users ?? 0} {zh ? '位用戶' : 'users'}</Badge>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {expandedId === sm.id ? '▲' : '▼'}
                  </span>
                </div>
                {sm.user_names && sm.user_names.length > 0 && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {zh ? '參與者：' : 'Users: '}{sm.user_names.join(', ')}
                  </div>
                )}
                {expandedId === sm.id && (
                  <pre style={{
                    marginTop: '12px', padding: '12px', background: 'var(--surface-2)',
                    borderRadius: '8px', fontSize: '12px', lineHeight: '1.6',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '400px', overflow: 'auto',
                  }}>
                    {sm.summary_text || (zh ? '(無內容)' : '(empty)')}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  // ── Messages Tab ───────────────────────────────────────────
  function renderMessagesTab() {
    return (
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中…' : 'Loading…'}</div>
        ) : filteredMessages.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
            {zh ? '無訊息記錄' : 'No messages found'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {[zh ? '時間' : 'Time', zh ? '方向' : 'Dir', zh ? '用戶' : 'User', zh ? '訊息' : 'Message', zh ? '來源' : 'Source', zh ? '群組' : 'Group'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredMessages.map(m => {
                const dir = DIRECTION_BADGE[m.direction] ?? DIRECTION_BADGE.incoming;
                const src = SOURCE_BADGE[m.source_type] ?? SOURCE_BADGE.user;
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11.5px' }}>
                      {formatDate(m.created_at, zh)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Badge bg={dir.bg} color={dir.color}>{zh ? dir.zh : dir.en}</Badge>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{m.display_name ?? '—'}</td>
                    <td style={{ padding: '10px 12px', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.message_text}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Badge bg={src.bg} color={src.color}>{m.source_type}</Badge>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {groupName(m.group_id) ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── Commands Tab ───────────────────────────────────────────
  function renderCommandsTab() {
    return (
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中…' : 'Loading…'}</div>
        ) : filteredCommands.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
            {zh ? '無指令記錄' : 'No command logs found'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {[zh ? '時間' : 'Time', zh ? '指令' : 'Command', zh ? '用戶' : 'User', zh ? '輸入' : 'Input', zh ? '狀態' : 'Status', zh ? '耗時' : 'Duration', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCommands.map(c => (
                <React.Fragment key={c.id}>
                  <tr
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                  >
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11.5px' }}>
                      {formatDate(c.created_at, zh)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <Badge bg="#e0e7ff" color="#4338ca">
                        {zh ? (COMMAND_LABELS[c.command_matched] ?? c.command_matched) : c.command_matched}
                      </Badge>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{c.display_name ?? '—'}</td>
                    <td style={{ padding: '10px 12px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.raw_input}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {c.success
                        ? <Badge bg="#dcfce7" color="#15803d">✓</Badge>
                        : <Badge bg="#fee2e2" color="#b91c1c">✗</Badge>
                      }
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {c.execution_ms != null ? `${c.execution_ms}ms` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {expandedId === c.id ? '▲' : '▼'}
                      </span>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={7} style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {c.group_id && <span>{zh ? '群組' : 'Group'}: {groupName(c.group_id)}</span>}
                          {c.source_type && <span>{zh ? '來源' : 'Source'}: {c.source_type}</span>}
                          {c.created_entity_type && <span>{zh ? '建立' : 'Created'}: {c.created_entity_type}</span>}
                          {c.created_entity_id && <span>ID: <code style={{ fontSize: '11px' }}>{c.created_entity_id.slice(0, 8)}</code></span>}
                        </div>
                        {c.error_message && (
                          <div style={{ marginTop: '8px', padding: '8px', background: '#fee2e2', borderRadius: '6px', fontSize: '12px', color: '#b91c1c' }}>
                            {c.error_message}
                          </div>
                        )}
                        {c.metadata && (
                          <pre style={{ marginTop: '8px', fontSize: '11px', background: 'var(--bg-root)', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px' }}>
                            {JSON.stringify(c.metadata, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── Errors Tab ─────────────────────────────────────────────
  function renderErrorsTab() {
    return (
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中…' : 'Loading…'}</div>
        ) : filteredErrors.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
            {zh ? '無錯誤記錄' : 'No errors found'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {[zh ? '時間' : 'Time', zh ? '類型' : 'Type', zh ? '用戶' : 'User', zh ? '錯誤訊息' : 'Message', zh ? '來源' : 'Source', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredErrors.map(e => {
                const etc = ERROR_TYPE_COLORS[e.error_type] ?? { bg: '#f3f4f6', color: '#374151' };
                return (
                  <React.Fragment key={e.id}>
                    <tr
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                    >
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11.5px' }}>
                        {formatDate(e.created_at, zh)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge bg={etc.bg} color={etc.color}>{e.error_type}</Badge>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{e.line_user_id?.slice(0, 8) ?? '—'}</td>
                      <td style={{ padding: '10px 12px', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.error_message}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {e.source_type ? <Badge bg={(SOURCE_BADGE[e.source_type] ?? SOURCE_BADGE.user).bg} color={(SOURCE_BADGE[e.source_type] ?? SOURCE_BADGE.user).color}>{e.source_type}</Badge> : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {expandedId === e.id ? '▲' : '▼'}
                        </span>
                      </td>
                    </tr>
                    {expandedId === e.id && (
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <td colSpan={6} style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                            {e.group_id && <span>{zh ? '群組' : 'Group'}: {groupName(e.group_id)}</span>}
                            {e.line_user_id && <span>User ID: <code style={{ fontSize: '11px' }}>{e.line_user_id.slice(0, 12)}</code></span>}
                          </div>
                          {e.error_stack && (
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Stack Trace
                              </div>
                              <pre style={{ fontSize: '11px', background: '#fee2e2', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px', margin: 0 }}>
                                {e.error_stack}
                              </pre>
                            </div>
                          )}
                          {e.context && (
                            <div style={{ marginTop: '8px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Context
                              </div>
                              <pre style={{ fontSize: '11px', background: 'var(--bg-root)', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px', margin: 0 }}>
                                {JSON.stringify(e.context, null, 2)}
                              </pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }
}
