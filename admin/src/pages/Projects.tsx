import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';

interface ProjectTask {
    id: string;
    task_no: number;
    name: string;
    assignee: string | null;
    planned_start: string | null;
    planned_end: string | null;
    actual_end: string | null;
    status: string;
    note1: string | null;
    note2: string | null;
    note3: string | null;
    trigger1: string | null;
    trigger2: string | null;
    trigger3: string | null;
    updated_at: string | null;
}

const STATUS_OPTIONS = ['未開始', '進行中', '已完成'];

const statusColor: Record<string, { bg: string; color: string }> = {
    '未開始': { bg: '#6b728020', color: '#6b7280' },
    '進行中': { bg: '#3b82f620', color: '#3b82f6' },
    '已完成': { bg: '#22c55e20', color: '#22c55e' },
};

export function Projects() {
    const zh = getLocale() === 'zh-TW';
    const [rows, setRows] = useState<ProjectTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);

    useEffect(() => { load(); }, []);

    async function load() {
        setLoading(true);
        const { data, error } = await supabase
            .from('project_tasks')
            .select('*')
            .order('task_no', { ascending: true });
        if (error) console.error('Projects load error:', error);
        setRows((data as ProjectTask[]) || []);
        setLoading(false);
    }

    async function updateStatus(row: ProjectTask, status: string) {
        setSavingId(row.id);
        const patch: Record<string, any> = { status };
        if (status === '已完成' && !row.actual_end) patch.actual_end = new Date().toISOString().slice(0, 10);
        const { error } = await supabase.from('project_tasks').update(patch).eq('id', row.id);
        if (error) console.error('updateStatus error:', error);
        else setRows(rs => rs.map(r => r.id === row.id ? { ...r, ...patch } : r));
        setSavingId(null);
    }

    async function updateNote(row: ProjectTask, field: 'note1' | 'note2' | 'note3', value: string) {
        setSavingId(row.id);
        const { error } = await supabase.from('project_tasks').update({ [field]: value }).eq('id', row.id);
        if (error) console.error('updateNote error:', error);
        else setRows(rs => rs.map(r => r.id === row.id ? { ...r, [field]: value } : r));
        setSavingId(null);
    }

    const filtered = rows.filter(r => {
        if (filterStatus !== 'all' && r.status !== filterStatus) return false;
        if (search) {
            const q = search.toLowerCase();
            return (
                r.name?.toLowerCase().includes(q) ||
                r.assignee?.toLowerCase().includes(q) ||
                r.note1?.toLowerCase().includes(q) ||
                String(r.task_no).includes(q)
            );
        }
        return true;
    });

    const stats = {
        total: rows.length,
        notStarted: rows.filter(r => r.status === '未開始').length,
        inProgress: rows.filter(r => r.status === '進行中').length,
        done: rows.filter(r => r.status === '已完成').length,
    };

    return (
        <div className="fade-in">
            <div className="page-body">
                <div className="page-header">
                    <h2>🏗️ {zh ? '專案進度' : 'Projects'}</h2>
                    <p>{zh ? '追蹤專案任務進度、備註與觸發條件' : 'Track project task progress, notes and triggers'}</p>
                </div>

                {/* Stats */}
                <div className="stats-grid" style={{ marginBottom: '24px' }}>
                    <div className="stat-card emerald">
                        <div className="stat-label">{zh ? '進行中' : 'In Progress'}</div>
                        <div className="stat-value">{stats.inProgress}</div>
                    </div>
                    <div className="stat-card orange">
                        <div className="stat-label">{zh ? '未開始' : 'Not Started'}</div>
                        <div className="stat-value">{stats.notStarted}</div>
                    </div>
                    <div className="stat-card purple">
                        <div className="stat-label">{zh ? '已完成' : 'Done'}</div>
                        <div className="stat-value">{stats.done}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">{zh ? '總計' : 'Total'}</div>
                        <div className="stat-value">{stats.total}</div>
                    </div>
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
                    <input
                        className="input-field"
                        placeholder={zh ? '搜尋任務、負責人、備註…' : 'Search…'}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ flex: '1 1 200px', maxWidth: '320px' }}
                    />
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field" style={{ width: '140px' }}>
                        <option value="all">{zh ? '全部狀態' : 'All Status'}</option>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button className="btn btn-ghost" onClick={load}>🔄 {zh ? '重新整理' : 'Refresh'}</button>
                </div>

                {loading ? (
                    <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                ) : filtered.length === 0 ? (
                    <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {zh ? '沒有符合條件的專案任務' : 'No matching project tasks'}
                    </div>
                ) : (
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--outline-variant)' }}>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', width: '50px' }}>#</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>{zh ? '任務名稱' : 'Name'}</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', width: '110px' }}>{zh ? '負責人' : 'Assignee'}</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', width: '120px' }}>{zh ? '狀態' : 'Status'}</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', width: '110px' }}>{zh ? '預計完成' : 'Planned End'}</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', width: '110px' }}>{zh ? '實際完成' : 'Actual End'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(row => {
                                    const isOpen = expandedId === row.id;
                                    const c = statusColor[row.status] || statusColor['未開始'];
                                    return (
                                        <>
                                            <tr
                                                key={row.id}
                                                onClick={() => setExpandedId(isOpen ? null : row.id)}
                                                style={{ borderBottom: '1px solid var(--outline-variant)', cursor: 'pointer', background: isOpen ? 'var(--bg-secondary)' : undefined }}
                                            >
                                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{row.task_no}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{ fontSize: '10px', marginRight: '6px', color: 'var(--text-muted)', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                                                    {row.name}
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>{row.assignee || '—'}</td>
                                                <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                                                    <select
                                                        value={row.status}
                                                        onChange={e => updateStatus(row, e.target.value)}
                                                        disabled={savingId === row.id}
                                                        style={{
                                                            fontSize: '11px',
                                                            padding: '3px 8px',
                                                            borderRadius: '6px',
                                                            fontWeight: 600,
                                                            background: c.bg,
                                                            color: c.color,
                                                            border: `1px solid ${c.color}40`,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                </td>
                                                <td style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>{row.planned_end || '—'}</td>
                                                <td style={{ padding: '10px 12px', fontSize: '12px', color: row.actual_end ? 'var(--text)' : 'var(--text-muted)' }}>{row.actual_end || '—'}</td>
                                            </tr>
                                            {isOpen && (
                                                <tr key={row.id + '-details'}>
                                                    <td colSpan={6} style={{ padding: '14px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--outline-variant)' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                                            <div>
                                                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>📝 {zh ? '備註' : 'Notes'}</div>
                                                                {(['note1', 'note2', 'note3'] as const).map((f, i) => (
                                                                    <input
                                                                        key={f}
                                                                        className="input-field"
                                                                        placeholder={`${zh ? '備註' : 'Note'} ${i + 1}`}
                                                                        defaultValue={row[f] || ''}
                                                                        onBlur={e => { if (e.target.value !== (row[f] || '')) updateNote(row, f, e.target.value); }}
                                                                        style={{ fontSize: '12px', marginBottom: '6px', width: '100%' }}
                                                                    />
                                                                ))}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>⚡ {zh ? '觸發條件' : 'Triggers'}</div>
                                                                {(['trigger1', 'trigger2', 'trigger3'] as const).map((f, i) => (
                                                                    <div key={f} style={{ padding: '6px 10px', marginBottom: '4px', borderRadius: '6px', background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)', fontSize: '12px', color: row[f] ? 'var(--text)' : 'var(--text-muted)' }}>
                                                                        {row[f] || `${zh ? '(無)' : '(none)'} ${i + 1}`}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
