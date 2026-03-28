import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';
import { Workflows } from './Workflows';
import { Tasks } from './Tasks';
import { Checklists } from './Checklists';

type Tab = 'dashboard' | 'workflows' | 'tasks' | 'checklists';

interface WorkflowStat {
    total: number;
    running: number;
    completed: number;
    paused: number;
}

interface TaskStat {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    blocked: number;
}

export function WorkflowManagement() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = (searchParams.get('tab') as Tab) || 'dashboard';
    const [tab, setTab] = useState<Tab>(tabParam);

    useEffect(() => { setTab((searchParams.get('tab') as Tab) || 'dashboard'); }, [searchParams]);

    const switchTab = (t: Tab) => {
        setTab(t);
        setSearchParams({ tab: t }, { replace: true });
    };

    const [wfStat, setWfStat] = useState<WorkflowStat>({ total: 0, running: 0, completed: 0, paused: 0 });
    const [taskStat, setTaskStat] = useState<TaskStat>({ total: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0 });
    const [templateCount, setTemplateCount] = useState(0);
    const [checklistCount, setChecklistCount] = useState(0);
    const [recentInstances, setRecentInstances] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!orgId) return;
        loadDashboard();
    }, [orgId]);

    async function loadDashboard() {
        setLoading(true);
        const [instRes, taskRes, tmplRes, clRes, recentRes] = await Promise.all([
            supabase.from('workflow_instances').select('status').eq('organization_id', orgId),
            supabase.from('tasks').select('status').eq('organization_id', orgId),
            supabase.from('workflows').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase.from('checklists').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase.from('workflow_instances')
                .select('id, name, status, created_at, workflow:workflows(name)')
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false })
                .limit(8),
        ]);

        const instances = instRes.data || [];
        setWfStat({
            total: instances.length,
            running: instances.filter(i => i.status === 'running').length,
            completed: instances.filter(i => i.status === 'completed').length,
            paused: instances.filter(i => i.status === 'paused').length,
        });

        const tasks = taskRes.data || [];
        setTaskStat({
            total: tasks.length,
            pending: tasks.filter(t => t.status === 'pending').length,
            in_progress: tasks.filter(t => t.status === 'in_progress').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            blocked: tasks.filter(t => t.status === 'blocked').length,
        });

        setTemplateCount(tmplRes.count || 0);
        setChecklistCount(clRes.count || 0);
        setRecentInstances(recentRes.data || []);
        setLoading(false);
    }

    const tabDefs: { key: Tab; icon: string; label: string }[] = [
        { key: 'dashboard',  icon: '📊', label: zh ? '總覽'    : 'Dashboard' },
        { key: 'workflows',  icon: '🔄', label: zh ? '流程'    : 'Workflows' },
        { key: 'tasks',      icon: '📋', label: zh ? '任務'    : 'Tasks' },
        { key: 'checklists', icon: '✅', label: zh ? '查核清單' : 'Checklists' },
    ];

    const statusColors: Record<string, { bg: string; color: string }> = {
        running:   { bg: '#3b82f620', color: '#3b82f6' },
        completed: { bg: '#22c55e20', color: '#22c55e' },
        paused:    { bg: '#f59e0b20', color: '#f59e0b' },
        cancelled: { bg: '#6b728020', color: '#6b7280' },
        archived:  { bg: '#6b728020', color: '#6b7280' },
    };
    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>🔄 {zh ? '流程管理' : 'Workflow Management'}</h2>
                <p>{zh ? '管理流程、任務與查核清單' : 'Manage workflows, tasks and checklists'}</p>
            </div>

            <div className="page-body">
                {/* Tab bar */}
                <div className="tab-bar" style={{ marginBottom: '20px' }}>
                    {tabDefs.map(td => (
                        <button key={td.key} className={`tab-item ${tab === td.key ? 'active' : ''}`} onClick={() => switchTab(td.key)}>
                            {td.icon} {td.label}
                        </button>
                    ))}
                </div>

                {/* ═══ DASHBOARD ═══ */}
                {tab === 'dashboard' && (
                    <div>
                        {loading ? (
                            <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                        ) : (
                            <>
                                {/* Stat cards */}
                                <div className="stats-grid" style={{ marginBottom: '24px' }}>
                                    <div className="stat-card blue">
                                        <div className="stat-label">{zh ? '流程範本' : 'Templates'}</div>
                                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{templateCount}</div>
                                    </div>
                                    <div className="stat-card emerald">
                                        <div className="stat-label">{zh ? '進行中流程' : 'Running'}</div>
                                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{wfStat.running}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{wfStat.total} {zh ? '總計' : 'total'}</div>
                                    </div>
                                    <div className="stat-card orange">
                                        <div className="stat-label">{zh ? '待處理任務' : 'Pending Tasks'}</div>
                                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{taskStat.pending}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{taskStat.total} {zh ? '總計' : 'total'}</div>
                                    </div>
                                    <div className="stat-card purple">
                                        <div className="stat-label">{zh ? '已完成任務' : 'Done Tasks'}</div>
                                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{taskStat.completed}</div>
                                    </div>
                                    <div className="stat-card red" style={{ '--card-accent': '#ef4444' } as any}>
                                        <div className="stat-label">{zh ? '阻塞任務' : 'Blocked'}</div>
                                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{taskStat.blocked}</div>
                                    </div>
                                    <div className="stat-card blue">
                                        <div className="stat-label">{zh ? '查核清單' : 'Checklists'}</div>
                                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{checklistCount}</div>
                                    </div>
                                </div>

                                {/* Workflow instance progress bars */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                                    <div className="card">
                                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '14px' }}>🔄 {zh ? '流程狀態分佈' : 'Instance Status'}</div>
                                        {[
                                            { label: zh ? '進行中' : 'Running', value: wfStat.running, color: '#3b82f6' },
                                            { label: zh ? '已完成' : 'Completed', value: wfStat.completed, color: '#22c55e' },
                                            { label: zh ? '暫停' : 'Paused', value: wfStat.paused, color: '#f59e0b' },
                                        ].map(item => (
                                            <div key={item.label} style={{ marginBottom: '10px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                                    <span>{item.label}</span>
                                                    <span style={{ fontWeight: 600 }}>{item.value}</span>
                                                </div>
                                                <div style={{ height: '4px', background: 'var(--bg-primary)', borderRadius: '2px', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${wfStat.total ? Math.round(item.value / wfStat.total * 100) : 0}%`, background: item.color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="card">
                                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '14px' }}>📋 {zh ? '任務狀態分佈' : 'Task Status'}</div>
                                        {[
                                            { label: zh ? '待處理' : 'Pending', value: taskStat.pending, color: '#9ca3af' },
                                            { label: zh ? '進行中' : 'In Progress', value: taskStat.in_progress, color: '#3b82f6' },
                                            { label: zh ? '已完成' : 'Completed', value: taskStat.completed, color: '#22c55e' },
                                            { label: zh ? '阻塞' : 'Blocked', value: taskStat.blocked, color: '#ef4444' },
                                        ].map(item => (
                                            <div key={item.label} style={{ marginBottom: '10px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                                    <span>{item.label}</span>
                                                    <span style={{ fontWeight: 600 }}>{item.value}</span>
                                                </div>
                                                <div style={{ height: '4px', background: 'var(--bg-primary)', borderRadius: '2px', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${taskStat.total ? Math.round(item.value / taskStat.total * 100) : 0}%`, background: item.color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Recent instances */}
                                <div className="card" style={{ padding: 0 }}>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', fontWeight: 600, fontSize: '13px' }}>
                                        🕐 {zh ? '最近流程' : 'Recent Instances'}
                                    </div>
                                    {recentInstances.length === 0
                                        ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '13px' }}>{zh ? '尚無流程' : 'No instances yet'}</p>
                                        : <table className="data-table">
                                            <thead><tr>
                                                <th>{zh ? '名稱' : 'Name'}</th>
                                                <th>{zh ? '範本' : 'Template'}</th>
                                                <th>{zh ? '狀態' : 'Status'}</th>
                                                <th>{zh ? '建立時間' : 'Created'}</th>
                                                <th></th>
                                            </tr></thead>
                                            <tbody>
                                                {recentInstances.map(inst => (
                                                    <tr key={inst.id}>
                                                        <td style={{ fontWeight: 600 }}>{inst.name}</td>
                                                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{(inst.workflow as any)?.name || '—'}</td>
                                                        <td>
                                                            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: statusColors[inst.status]?.bg, color: statusColors[inst.status]?.color }}>
                                                                {inst.status}
                                                            </span>
                                                        </td>
                                                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(inst.created_at).toLocaleDateString('zh-TW')}</td>
                                                        <td>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => switchTab('workflows')}>
                                                                {zh ? '查看' : 'View'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    }
                                </div>

                                {/* Quick actions */}
                                <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                                    <button className="btn btn-primary" onClick={() => switchTab('workflows')}>🔄 {zh ? '管理流程' : 'Manage Workflows'}</button>
                                    <button className="btn btn-secondary" onClick={() => switchTab('tasks')}>📋 {zh ? '查看任務' : 'View Tasks'}</button>
                                    <button className="btn btn-secondary" onClick={() => switchTab('checklists')}>✅ {zh ? '查核清單' : 'Checklists'}</button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ═══ WORKFLOWS ═══ */}
                {tab === 'workflows' && <Workflows />}

                {/* ═══ TASKS ═══ */}
                {tab === 'tasks' && <Tasks />}

                {/* ═══ CHECKLISTS ═══ */}
                {tab === 'checklists' && <Checklists />}
            </div>
        </div>
    );
}
