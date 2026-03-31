import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { COMMAND_LABELS, ERROR_TYPE_COLORS, todayISO, weekAgoISO } from '../lib/lineLogsConstants';
import type { LineMessage, CommandLog, ErrorLog, DailySummary, WeeklySummary, MonthlySummary, LineGroup, Tab, SummaryView } from '../types/lineLogs';
import { SummaryTab } from '../components/LineLogs/SummaryTab';
import { MessagesTab } from '../components/LineLogs/MessagesTab';
import { CommandsTab } from '../components/LineLogs/CommandsTab';
import { ErrorsTab } from '../components/LineLogs/ErrorsTab';

// ── Component ─────────────────────────────────────────────────────────────────

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
  const [weeklySummaries, setWeeklySummaries] = useState<WeeklySummary[]>([]);
  const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
  const [summaryView, setSummaryView] = useState<SummaryView>('daily');

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
      if (summaryView === 'daily') {
        let q = supabase.from('line_daily_summaries').select('*').order('summary_date', { ascending: false }).limit(200);
        if (filterGroup) q = q.eq('group_id', filterGroup);
        if (dateFrom) q = q.gte('summary_date', dateFrom);
        if (dateTo) q = q.lte('summary_date', dateTo);
        const { data } = await q;
        setSummaries(data || []);
      } else if (summaryView === 'weekly') {
        let q = supabase.from('line_weekly_summaries').select('*').order('week_start', { ascending: false }).limit(100);
        if (filterGroup) q = q.eq('group_id', filterGroup);
        if (dateFrom) q = q.gte('week_start', dateFrom);
        if (dateTo) q = q.lte('week_start', dateTo);
        const { data } = await q;
        setWeeklySummaries(data || []);
      } else {
        let q = supabase.from('line_monthly_summaries').select('*').order('summary_month', { ascending: false }).limit(50);
        if (filterGroup) q = q.eq('group_id', filterGroup);
        if (dateFrom) q = q.gte('summary_month', dateFrom);
        if (dateTo) q = q.lte('summary_month', dateTo);
        const { data } = await q;
        setMonthlySummaries(data || []);
      }
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
  }, [tab, summaryView, filterGroup, filterCommand, filterErrorType, dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

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
      {tab === 'summary' && (
        <SummaryTab
          zh={zh}
          loading={loading}
          filterGroup={filterGroup}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          summaries={summaries}
          weeklySummaries={weeklySummaries}
          monthlySummaries={monthlySummaries}
          summaryView={summaryView}
          setSummaryView={setSummaryView}
          loadData={loadData}
          search={search}
        />
      )}
      {tab === 'messages' && (
        <MessagesTab
          zh={zh}
          loading={loading}
          messages={messages}
          search={search}
          groups={groups}
        />
      )}
      {tab === 'commands' && (
        <CommandsTab
          zh={zh}
          loading={loading}
          commands={commands}
          search={search}
          groups={groups}
        />
      )}
      {tab === 'errors' && (
        <ErrorsTab
          zh={zh}
          loading={loading}
          errors={errors}
          search={search}
          groups={groups}
        />
      )}
    </div>
  );
}
