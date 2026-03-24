import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/OrgContext';
import { getLocale } from '../lib/i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  module: string;
  table_name: string | null;
  record_id: string | null;
  record_label: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  create:  { bg: '#dcfce7', color: '#15803d' },
  update:  { bg: '#dbeafe', color: '#1d4ed8' },
  delete:  { bg: '#fee2e2', color: '#b91c1c' },
  export:  { bg: '#fef9c3', color: '#a16207' },
  login:   { bg: '#f3e8ff', color: '#7e22ce' },
  approve: { bg: '#d1fae5', color: '#065f46' },
  reject:  { bg: '#fce7f3', color: '#9d174d' },
};

const MODULE_LABELS: Record<string, { zh: string; en: string }> = {
  payroll:     { zh: '薪資', en: 'Payroll' },
  leave:       { zh: '請假', en: 'Leave' },
  overtime:    { zh: '加班', en: 'Overtime' },
  employee:    { zh: '員工', en: 'Employee' },
  scheduling:  { zh: '排班', en: 'Scheduling' },
  users:       { zh: '使用者', en: 'Users' },
  workflow:    { zh: '流程', en: 'Workflow' },
  settings:    { zh: '設定', en: 'Settings' },
  attendance:  { zh: '出勤', en: 'Attendance' },
  performance: { zh: '績效', en: 'Performance' },
};

const ACTION_LABELS: Record<string, { zh: string; en: string }> = {
  create:  { zh: '新增', en: 'Create' },
  update:  { zh: '更新', en: 'Update' },
  delete:  { zh: '刪除', en: 'Delete' },
  export:  { zh: '匯出', en: 'Export' },
  login:   { zh: '登入', en: 'Login' },
  approve: { zh: '核准', en: 'Approve' },
  reject:  { zh: '駁回', en: 'Reject' },
};

function ActionBadge({ action, zh }: { action: string; zh: boolean }) {
  const style = ACTION_COLORS[action] ?? { bg: '#f3f4f6', color: '#374151' };
  const label = ACTION_LABELS[action];
  return (
    <span style={{
      background: style.bg, color: style.color,
      padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
    }}>
      {label ? (zh ? label.zh : label.en) : action}
    </span>
  );
}

function formatDate(iso: string, zh: boolean) {
  return new Date(iso).toLocaleString(zh ? 'zh-TW' : 'en-US', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuditLogs() {
  const { orgId } = useOrg();
  const zh = getLocale() === 'zh-TW';

  const [tab, setTab] = useState<'all' | 'hr' | 'system'>('all');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    let q = supabase
      .from('audit_logs')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (tab === 'hr') {
      q = q.in('module', ['employee', 'payroll', 'leave', 'overtime', 'scheduling', 'performance', 'attendance']);
    } else if (tab === 'system') {
      q = q.in('module', ['users', 'settings', 'workflow']);
    }

    if (filterAction) q = q.eq('action', filterAction);
    if (filterModule) q = q.eq('module', filterModule);
    if (dateFrom)     q = q.gte('created_at', dateFrom);
    if (dateTo)       q = q.lte('created_at', dateTo + 'T23:59:59');

    const { data } = await q;
    setLogs(data || []);
    setLoading(false);
  }, [orgId, tab, filterAction, filterModule, dateFrom, dateTo]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const filtered = logs.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.action.includes(s) ||
      l.module.includes(s) ||
      (l.record_label ?? '').toLowerCase().includes(s) ||
      (l.user_name ?? '').toLowerCase().includes(s) ||
      (l.table_name ?? '').toLowerCase().includes(s)
    );
  });

  const stats = {
    total:   logs.length,
    creates: logs.filter(l => l.action === 'create').length,
    updates: logs.filter(l => l.action === 'update').length,
    deletes: logs.filter(l => l.action === 'delete').length,
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
            📋 {zh ? '稽核記錄' : 'Audit Logs'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
            {zh ? '追蹤所有 HR 操作與系統事件' : 'Track all HR actions and system events'}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: zh ? '總記錄' : 'Total', value: stats.total, color: '#6366f1' },
          { label: zh ? '新增' : 'Creates', value: stats.creates, color: '#16a34a' },
          { label: zh ? '修改' : 'Updates', value: stats.updates, color: '#2563eb' },
          { label: zh ? '刪除' : 'Deletes', value: stats.deletes, color: '#dc2626' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: '16px' }}>
        {([
          { key: 'all',    label: zh ? '全部記錄' : 'All Logs' },
          { key: 'hr',     label: zh ? '員工 / 薪資' : 'HR Actions' },
          { key: 'system', label: zh ? '系統操作' : 'System' },
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
          placeholder={zh ? '搜尋名稱、用戶...' : 'Search name, user...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="input-field" style={{ flex: '0 0 130px' }} value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">{zh ? '所有動作' : 'All Actions'}</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{zh ? v.zh : v.en}</option>
          ))}
        </select>
        <select className="input-field" style={{ flex: '0 0 130px' }} value={filterModule} onChange={e => setFilterModule(e.target.value)}>
          <option value="">{zh ? '所有模組' : 'All Modules'}</option>
          {Object.entries(MODULE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{zh ? v.zh : v.en}</option>
          ))}
        </select>
        <input type="date" className="input-field" style={{ flex: '0 0 140px' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className="input-field" style={{ flex: '0 0 140px' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <button className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setFilterAction(''); setFilterModule(''); setDateFrom(''); setDateTo(''); }}>
          {zh ? '清除' : 'Clear'}
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {zh ? '載入中...' : 'Loading...'}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>📭</div>
            {zh ? '無記錄' : 'No logs found'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {[
                  zh ? '時間' : 'Time',
                  zh ? '動作' : 'Action',
                  zh ? '模組' : 'Module',
                  zh ? '對象' : 'Target',
                  zh ? '操作者' : 'User',
                  '',
                ].map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: '12px', color: 'var(--text-muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const modLabel = MODULE_LABELS[log.module];
                return (
                  <React.Fragment key={log.id}>
                    <tr
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '11.5px' }}>
                        {formatDate(log.created_at, zh)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <ActionBadge action={log.action} zh={zh} />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {modLabel ? (zh ? modLabel.zh : modLabel.en) : log.module}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                        {log.record_label ?? log.table_name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                        {log.user_name ?? '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {(log.old_values || log.new_values) && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {expandedId === log.id ? '▲' : '▼'}
                          </span>
                        )}
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <td colSpan={6} style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {log.old_values && (
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                                  {zh ? '修改前' : 'Before'}
                                </div>
                                <pre style={{ fontSize: '11px', background: '#fee2e2', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px', margin: 0 }}>
                                  {JSON.stringify(log.old_values, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.new_values && (
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                                  {zh ? '修改後' : 'After'}
                                </div>
                                <pre style={{ fontSize: '11px', background: '#dcfce7', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '200px', margin: 0 }}>
                                  {JSON.stringify(log.new_values, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            {log.ip_address && <span>IP: {log.ip_address}</span>}
                            {log.table_name && <span>{zh ? '資料表' : 'Table'}: <code style={{ fontSize: '11px' }}>{log.table_name}</code></span>}
                            {log.record_id && <span>ID: <code style={{ fontSize: '11px' }}>{log.record_id.slice(0, 8)}</code></span>}
                          </div>
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
    </div>
  );
}
