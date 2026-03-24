import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface TaskStats {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    blocked: number;
}

interface TaskRow {
    id: string;
    title: string;
    status: string;
    priority: string;
    sort_order: number;
    assigned_user: { name: string } | null;
}

interface WorkflowInstance {
    id: string;
    name: string;
    status: string;
    started_at: string;
}

const SPECIAL_IDENTITY_LABELS: Record<string, { zh: string; en: string }> = {
    disability: { zh: '身心障礙者', en: 'Disabled' },
    low_income: { zh: '中低收入戶', en: 'Low-income' },
    indigenous: { zh: '原住民', en: 'Indigenous' },
    middle_aged: { zh: '中高齡者', en: 'Middle-aged' },
    long_term_unemployed: { zh: '長期失業者', en: 'Long-term unemployed' },
    ex_offender: { zh: '更生人', en: 'Ex-offender' },
    sole_breadwinner: { zh: '獨力負擔家計者', en: 'Sole breadwinner' },
    dv_victim: { zh: '家庭暴力被害人', en: 'DV victim' },
    reentry_woman: { zh: '二度就業婦女', en: 'Women re-entering' },
};

export function Dashboard() {
    const [stats, setStats] = useState<TaskStats>({ total: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0 });
    const [recentTasks, setRecentTasks] = useState<TaskRow[]>([]);
    const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingLeave, setPendingLeave] = useState(0);
    const [pendingOT, setPendingOT] = useState(0);
    const [pendingCorrections, setPendingCorrections] = useState(0);
    const [headcount, setHeadcount] = useState({ total: 0, active: 0, fullTime: 0, partTime: 0, contract: 0, inactive: 0 });
    const [compliance, setCompliance] = useState<{
        totalActive: number; disabledCount: number; disabledRequired: number;
        indigenousCount: number; specialBreakdown: { label: string; count: number }[];
    }>({ totalActive: 0, disabledCount: 0, disabledRequired: 0, indigenousCount: 0, specialBreakdown: [] });
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => { loadHrStats(); }, [orgId]);

    const loadHrStats = async () => {
        if (!orgId) return;
        const [leaveRes, otRes, corrRes, empRes] = await Promise.all([
            supabase.from('leave_requests').select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId).eq('status', 'pending'),
            supabase.from('overtime_requests').select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId).eq('status', 'pending'),
            supabase.from('punch_corrections').select('id', { count: 'exact', head: true })
                .eq('organization_id', orgId).eq('status', 'pending'),
            supabase.from('users').select('id, status, employee_type, special_identities')
                .eq('organization_id', orgId),
        ]);
        setPendingLeave(leaveRes.count ?? 0);
        setPendingOT(otRes.count ?? 0);
        setPendingCorrections(corrRes.count ?? 0);

        // Headcount
        const emps = empRes.data || [];
        const active = emps.filter((e: any) => e.status === 'active');
        setHeadcount({
            total: emps.length,
            active: active.length,
            fullTime: active.filter((e: any) => e.employee_type === 'full_time').length,
            partTime: active.filter((e: any) => e.employee_type === 'part_time').length,
            contract: active.filter((e: any) => e.employee_type === 'contract').length,
            inactive: emps.filter((e: any) => e.status !== 'active').length,
        });

        // Regulatory compliance
        const disabledCount = active.filter((e: any) => (e.special_identities || []).includes('disability')).length;
        const indigenousCount = active.filter((e: any) => (e.special_identities || []).includes('indigenous')).length;
        const disabledRequired = active.length >= 67 ? Math.ceil(active.length * 0.01) : 0;
        const identityCounts: Record<string, number> = {};
        active.forEach((e: any) => {
            (e.special_identities || []).forEach((id: string) => {
                identityCounts[id] = (identityCounts[id] || 0) + 1;
            });
        });
        setCompliance({
            totalActive: active.length,
            disabledCount, disabledRequired, indigenousCount,
            specialBreakdown: Object.entries(identityCounts).map(([key, count]) => ({ label: key, count })),
        });
    };

    async function loadData() {
        try {
            // Load tasks
            const { data: tasks } = await supabase.from('tasks')
                .select('id, title, status, priority, sort_order, assigned_to, users!tasks_assigned_to_fkey(name)')
                .order('sort_order', { ascending: true });

            if (tasks) {
                const s: TaskStats = { total: tasks.length, pending: 0, in_progress: 0, completed: 0, blocked: 0 };
                tasks.forEach((t: any) => {
                    if (t.status in s) (s as any)[t.status]++;
                });
                setStats(s);
                setRecentTasks(tasks.slice(0, 10).map((t: any) => ({
                    ...t,
                    assigned_user: t.users
                })));
            }

            // Load workflow instances
            const { data: wf } = await supabase.from('workflow_instances')
                .select('id, name, status, started_at')
                .order('started_at', { ascending: false });
            if (wf) setWorkflows(wf);
        } catch (err) {
            console.error('Dashboard load error:', err);
        } finally {
            setLoading(false);
        }
    }

    const statusLabel: Record<string, string> = {
        pending: t('status.pending'),
        in_progress: t('status.in_progress'),
        completed: t('status.completed'),
        blocked: t('status.blocked'),
        cancelled: t('status.cancelled'),
    };

    if (loading) {
        return (
            <div className="fade-in">
                <div className="page-header">
                    <h2>📊 {t('dashboard.title')}</h2>
                </div>
                <div className="page-body">
                    <p className="loading-pulse">{t('common.loading')}</p>
                </div>
            </div>
        );
    }

    const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    const activeWorkflowCount = workflows.filter(w => w.status === 'running').length;

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>📊 {t('dashboard.title')}</h2>
                <p>{zh ? '所有門市營運概覽' : 'Overview of all store operations'}</p>
            </div>

            <div className="page-body">
                {/* Employee Headcount */}
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        👥 {zh ? '員工人數' : 'Employee Headcount'}
                    </div>
                    <div className="stats-grid">
                        <div className="stat-card emerald">
                            <div className="stat-label">{zh ? '在職人數' : 'ACTIVE'}</div>
                            <div className="stat-value">{headcount.active}</div>
                        </div>
                        <div className="stat-card blue">
                            <div className="stat-label">{zh ? '全職' : 'FULL-TIME'}</div>
                            <div className="stat-value">{headcount.fullTime}</div>
                        </div>
                        <div className="stat-card orange">
                            <div className="stat-label">{zh ? '兼職' : 'PART-TIME'}</div>
                            <div className="stat-value">{headcount.partTime}</div>
                        </div>
                        <div className="stat-card purple">
                            <div className="stat-label">{zh ? '約聘' : 'CONTRACT'}</div>
                            <div className="stat-value">{headcount.contract}</div>
                        </div>
                        <div className="stat-card red">
                            <div className="stat-label">{zh ? '離職' : 'INACTIVE'}</div>
                            <div className="stat-value">{headcount.inactive}</div>
                        </div>
                    </div>
                </div>

                {/* Regulatory Compliance — Disability Quota */}
                {compliance.totalActive >= 67 && (
                    <div className="card" style={{ marginBottom: '20px', borderLeft: `3px solid ${compliance.disabledCount >= compliance.disabledRequired ? '#22c55e' : '#f43f5e'}` }}>
                        <div className="card-header">
                            <span className="card-title">⚖️ {zh ? '法遵 — 身障僱用比例' : 'Regulatory — Disability Quota'}</span>
                            <span style={{
                                fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '8px',
                                background: compliance.disabledCount >= compliance.disabledRequired ? '#22c55e22' : '#f43f5e22',
                                color: compliance.disabledCount >= compliance.disabledRequired ? '#22c55e' : '#f43f5e',
                            }}>
                                {compliance.disabledCount >= compliance.disabledRequired
                                    ? (zh ? '✓ 符合規定' : '✓ Compliant')
                                    : (zh ? '✗ 未達標準' : '✗ Non-compliant')}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>
                                    {zh ? '在職總人數' : 'Total Active'}
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 600 }}>{compliance.totalActive}</div>
                            </div>
                            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>
                                    {zh ? '身障員工數' : 'Disabled Hired'}
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 600, color: compliance.disabledCount >= compliance.disabledRequired ? '#22c55e' : '#f43f5e' }}>
                                    {compliance.disabledCount}
                                </div>
                            </div>
                            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>
                                    {zh ? '法定最低需求' : 'Required Min.'}
                                </div>
                                <div style={{ fontSize: '20px', fontWeight: 600 }}>{compliance.disabledRequired}</div>
                            </div>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            {zh
                                ? '依《身心障礙者權益保障法》第38條：私立機構員工67人以上，應進用不得少於員工總人數1%之身心障礙者。'
                                : 'Per Taiwan PRPD Act §38: Private companies with 67+ employees must employ at least 1% persons with disabilities.'}
                        </div>
                    </div>
                )}

                {/* Special Identity Breakdown */}
                {compliance.specialBreakdown.length > 0 && (
                    <div className="card" style={{ marginBottom: '20px' }}>
                        <div className="card-header">
                            <span className="card-title">🏷️ {zh ? '特殊身分員工統計' : 'Special Identity Breakdown'}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {compliance.specialBreakdown.map(item => {
                                const lbl = SPECIAL_IDENTITY_LABELS[item.label];
                                return (
                                    <div key={item.label} style={{
                                        padding: '8px 14px', background: 'var(--bg-secondary)',
                                        borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px',
                                    }}>
                                        <span style={{ fontSize: '13px' }}>{lbl ? (zh ? lbl.zh : lbl.en) : item.label}</span>
                                        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--accent-primary)' }}>{item.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card emerald">
                        <div className="stat-label">{t('dashboard.active_workflows')}</div>
                        <div className="stat-value">{activeWorkflowCount}</div>
                    </div>
                    <div className="stat-card emerald">
                        <div className="stat-label">{t('dashboard.total_tasks')}</div>
                        <div className="stat-value">{stats.total}</div>
                    </div>
                    <div className="stat-card orange">
                        <div className="stat-label">{t('dashboard.pending')}</div>
                        <div className="stat-value">{stats.pending}</div>
                    </div>
                    <div className="stat-card blue">
                        <div className="stat-label">{t('dashboard.in_progress')}</div>
                        <div className="stat-value">{stats.in_progress}</div>
                    </div>
                    <div className="stat-card purple">
                        <div className="stat-label">{t('dashboard.completed')}</div>
                        <div className="stat-value">{stats.completed}</div>
                    </div>
                    <div className="stat-card red">
                        <div className="stat-label">{t('dashboard.blocked')}</div>
                        <div className="stat-value">{stats.blocked}</div>
                    </div>
                    <div className="stat-card orange">
                        <div className="stat-label">{zh ? '待審假單' : 'Pending Leave'}</div>
                        <div className="stat-value">{pendingLeave}</div>
                    </div>
                    <div className="stat-card orange">
                        <div className="stat-label">{zh ? '待審加班' : 'Pending OT'}</div>
                        <div className="stat-value">{pendingOT}</div>
                    </div>
                    <div className="stat-card red">
                        <div className="stat-label">{zh ? '待審補打' : 'Corrections'}</div>
                        <div className="stat-value">{pendingCorrections}</div>
                    </div>
                </div>

                {/* Workflow Progress */}
                {workflows.length > 0 && (
                    <div className="card" style={{ marginBottom: '24px' }}>
                        <div className="card-header">
                            <span className="card-title">🔄 {t('dashboard.active_workflows')}</span>
                            <span style={{ fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                {progress}%
                            </span>
                        </div>
                        <div className="progress-bar" style={{ marginBottom: '12px' }}>
                            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {workflows.map(w => w.name).join(' · ')}
                        </div>
                    </div>
                )}

                {/* Recent Tasks */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">📋 {t('dashboard.recent_tasks')}</span>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{zh ? '任務' : 'Task'}</th>
                                <th>{t('task.status')}</th>
                                <th>{t('task.assigned_to')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentTasks.map(task => (
                                <tr key={task.id}>
                                    <td style={{ color: 'var(--text-muted)', width: '40px' }}>{task.sort_order}</td>
                                    <td>{task.title}</td>
                                    <td>
                                        <span className={`status-badge ${task.status}`}>
                                            {statusLabel[task.status] || task.status}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)' }}>
                                        {task.assigned_user?.name || (zh ? '未指派' : 'Unassigned')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
