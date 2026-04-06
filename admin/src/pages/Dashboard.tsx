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
    // OE-8: Probation alerts
    const [probationAlerts, setProbationAlerts] = useState<{ id: string; name: string; probation_end_date: string }[]>([]);
    // OE-7: Announcements
    const [announcements, setAnnouncements] = useState<{ id: string; title: string; content: string; priority: string; is_pinned: boolean; published_at: string; author_name: string | null }[]>([]);
    // Turnover analytics
    const [turnover, setTurnover] = useState({ thisMonth: 0, thisQuarter: 0, thisYear: 0, rate: 0 });
    // Work permit expiry alerts
    const [permitAlerts, setPermitAlerts] = useState<{ id: string; name: string; work_permit_expiry: string }[]>([]);
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

        // OE-8: Probation alerts (within 14 days or past)
        const { data: probData } = await supabase.from('users')
            .select('id, name, probation_end_date')
            .eq('organization_id', orgId).eq('status', 'active')
            .not('probation_end_date', 'is', null);
        if (probData) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const cutoff = new Date(today.getTime() + 14 * 86400000);
            setProbationAlerts(probData.filter((e: any) => new Date(e.probation_end_date) <= cutoff)
                .sort((a: any, b: any) => new Date(a.probation_end_date).getTime() - new Date(b.probation_end_date).getTime()));
        }

        // OE-7: Announcements
        const { data: annData } = await supabase.from('announcements')
            .select('id, title, content, priority, is_pinned, published_at, author:author_id(name)')
            .eq('organization_id', orgId)
            .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
            .order('is_pinned', { ascending: false })
            .order('published_at', { ascending: false })
            .limit(5);
        setAnnouncements((annData || []).map((a: any) => ({ ...a, author_name: a.author?.name || null })));

        // Turnover analytics
        const { data: resignedData } = await supabase.from('users')
            .select('id, resign_date')
            .eq('organization_id', orgId)
            .not('resign_date', 'is', null);
        if (resignedData) {
            const now = new Date();
            const thisMonth = resignedData.filter((e: any) => {
                const d = new Date(e.resign_date);
                return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
            }).length;
            const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            const thisQuarter = resignedData.filter((e: any) => new Date(e.resign_date) >= qStart).length;
            const thisYear = resignedData.filter((e: any) => new Date(e.resign_date).getFullYear() === now.getFullYear()).length;
            const totalPool = active.length + thisYear;
            const rate = totalPool > 0 ? Math.round(thisYear / totalPool * 100) : 0;
            setTurnover({ thisMonth, thisQuarter, thisYear, rate });
        }

        // Work permit expiry alerts (within 30 days)
        const { data: permitData } = await supabase.from('users')
            .select('id, name, work_permit_expiry')
            .eq('organization_id', orgId).eq('status', 'active')
            .not('work_permit_expiry', 'is', null);
        if (permitData) {
            const cutoff = new Date(Date.now() + 30 * 86400000);
            setPermitAlerts(permitData.filter((e: any) => new Date(e.work_permit_expiry) <= cutoff)
                .sort((a: any, b: any) => new Date(a.work_permit_expiry).getTime() - new Date(b.work_permit_expiry).getTime()));
        }
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
                    <h1>{t('dashboard.title')}</h1>
                    <p>{zh ? '所有門市營運概覽' : 'Overview of all store operations'}</p>
                </div>
                <div className="page-body">
                    <div className="skeleton-stat-grid">
                        {[...Array(4)].map((_, i) => <div key={i} className="skeleton-card" />)}
                    </div>
                    <div className="skeleton-stat-grid">
                        {[...Array(5)].map((_, i) => <div key={i} className="skeleton-card" />)}
                    </div>
                    <div style={{ marginTop: 16 }}>
                        {[...Array(3)].map((_, i) => <div key={i} className="skeleton-row" />)}
                    </div>
                </div>
            </div>
        );
    }

    const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    const activeWorkflowCount = workflows.filter(w => w.status === 'running').length;
    const complianceMet = compliance.disabledCount >= compliance.disabledRequired;

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>{t('dashboard.title')}</h1>
                <p>{zh ? '所有門市營運概覽' : 'Overview of all store operations'}</p>
            </div>

            <div className="page-body">
                {/* ── Hero KPI Strip ── */}
                <div className="dashboard-hero-grid">
                    <div className="dashboard-hero-card emerald">
                        <div className="dashboard-hero-label">{zh ? '在職人數' : 'Active Staff'}</div>
                        <div className="dashboard-hero-value">{headcount.active}</div>
                        <div className="dashboard-hero-sub">{zh ? `共 ${headcount.total} 人` : `${headcount.total} total`}</div>
                    </div>
                    <div className="dashboard-hero-card orange">
                        <div className="dashboard-hero-label">{zh ? '待審項目' : 'Pending Reviews'}</div>
                        <div className="dashboard-hero-value">{pendingLeave + pendingOT + pendingCorrections}</div>
                        <div className="dashboard-hero-sub">{zh ? `假${pendingLeave} · 加班${pendingOT} · 補打${pendingCorrections}` : `Leave ${pendingLeave} · OT ${pendingOT} · Corr ${pendingCorrections}`}</div>
                    </div>
                    <div className="dashboard-hero-card blue">
                        <div className="dashboard-hero-label">{zh ? '進行中任務' : 'Tasks Active'}</div>
                        <div className="dashboard-hero-value">{stats.in_progress}</div>
                        <div className="dashboard-hero-sub">{zh ? `共 ${stats.total} 項` : `${stats.total} total`}</div>
                    </div>
                    <div className="dashboard-hero-card purple">
                        <div className="dashboard-hero-label">{zh ? '年離職率' : 'Annual Turnover'}</div>
                        <div className="dashboard-hero-value">{turnover.rate}%</div>
                        <div className="dashboard-hero-sub">{zh ? `本年 ${turnover.thisYear} 人` : `${turnover.thisYear} this year`}</div>
                    </div>
                </div>

                {/* ── Announcements (full width) ── */}
                {announcements.length > 0 && (
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="card-header">
                            <span className="card-title">{zh ? '公司公告' : 'Announcements'}</span>
                        </div>
                        {announcements.map(ann => {
                            const badge = ann.priority === 'urgent' ? { icon: '●', color: 'var(--accent-red)' } : ann.priority === 'important' ? { icon: '●', color: 'var(--accent-yellow)' } : { icon: '', color: '' };
                            return (
                                <div key={ann.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--outline-variant)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    {ann.is_pinned && <span style={{ fontSize: 11, color: 'var(--accent-orange)' }}>●</span>}
                                    {badge.icon && <span style={{ fontSize: 8, color: badge.color, marginTop: 4 }}>{badge.icon}</span>}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{ann.title}</div>
                                        <div style={{ fontSize: 12, color: 'var(--on-surface-muted)', marginTop: 2, lineHeight: 1.4 }}>{ann.content.length > 120 ? ann.content.slice(0, 120) + '…' : ann.content}</div>
                                        <div style={{ fontSize: 11, color: 'var(--on-surface-muted)', marginTop: 4 }}>
                                            {ann.author_name && <span>{ann.author_name} · </span>}
                                            {new Date(ann.published_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Two-Column: Headcount + Turnover ── */}
                <div className="dashboard-two-col">
                    <div>
                        <div className="section-label">{zh ? '員工人數' : 'Employee Headcount'}</div>
                        <div className="stats-grid">
                            <div className="stat-card emerald"><div className="stat-label">{zh ? '在職' : 'ACTIVE'}</div><div className="stat-value">{headcount.active}</div></div>
                            <div className="stat-card blue"><div className="stat-label">{zh ? '全職' : 'FULL-TIME'}</div><div className="stat-value">{headcount.fullTime}</div></div>
                            <div className="stat-card orange"><div className="stat-label">{zh ? '兼職' : 'PART-TIME'}</div><div className="stat-value">{headcount.partTime}</div></div>
                            <div className="stat-card purple"><div className="stat-label">{zh ? '約聘' : 'CONTRACT'}</div><div className="stat-value">{headcount.contract}</div></div>
                            <div className="stat-card red"><div className="stat-label">{zh ? '離職' : 'INACTIVE'}</div><div className="stat-value">{headcount.inactive}</div></div>
                        </div>
                    </div>
                    <div>
                        <div className="section-label">{zh ? '離職率分析' : 'Turnover Analytics'}</div>
                        <div className="stats-grid">
                            <div className="stat-card orange"><div className="stat-label">{zh ? '本月' : 'THIS MONTH'}</div><div className="stat-value">{turnover.thisMonth}</div></div>
                            <div className="stat-card purple"><div className="stat-label">{zh ? '本季' : 'THIS QTR'}</div><div className="stat-value">{turnover.thisQuarter}</div></div>
                            <div className="stat-card red"><div className="stat-label">{zh ? '本年' : 'THIS YEAR'}</div><div className="stat-value">{turnover.thisYear}</div></div>
                            <div className="stat-card blue"><div className="stat-label">{zh ? '年離職率' : 'ANNUAL RATE'}</div><div className="stat-value">{turnover.rate}%</div></div>
                        </div>
                    </div>
                </div>

                {/* ── Two-Column: Alerts ── */}
                {(permitAlerts.length > 0 || probationAlerts.length > 0) && (
                    <div className="dashboard-two-col">
                        {/* Work Permit Expiry */}
                        {permitAlerts.length > 0 && (
                            <div className="card alert-card--critical">
                                <div className="card-header">
                                    <span className="card-title">{zh ? '工作證即將到期' : 'Work Permit Expiry'}</span>
                                    <span className="count-badge count-badge--red">{permitAlerts.length} {zh ? '人' : ''}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {permitAlerts.map(emp => {
                                        const days = Math.ceil((new Date(emp.work_permit_expiry).getTime() - Date.now()) / 86400000);
                                        const color = days < 0 ? 'var(--accent-red)' : days <= 7 ? 'var(--accent-yellow)' : 'var(--accent-blue)';
                                        return (
                                            <div key={emp.id} className="alert-row">
                                                <span className="alert-row-name">{emp.name}</span>
                                                <div className="alert-row-meta">
                                                    <span className="alert-row-date">{emp.work_permit_expiry}</span>
                                                    <span className="alert-row-badge" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                                                        {days < 0 ? (zh ? `已逾期 ${Math.abs(days)} 天` : `${Math.abs(days)}d expired`) : (zh ? `剩 ${days} 天` : `${days}d left`)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Probation Alerts */}
                        {probationAlerts.length > 0 && (
                            <div className="card alert-card">
                                <div className="card-header">
                                    <span className="card-title">{zh ? '試用期到期提醒' : 'Probation Alerts'}</span>
                                    <span className="count-badge count-badge--yellow">{probationAlerts.length} {zh ? '人' : ''}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {probationAlerts.map(emp => {
                                        const days = Math.ceil((new Date(emp.probation_end_date).getTime() - Date.now()) / 86400000);
                                        const color = days < 0 ? 'var(--accent-red)' : days <= 7 ? 'var(--accent-yellow)' : 'var(--accent-emerald)';
                                        return (
                                            <div key={emp.id} className="alert-row">
                                                <span className="alert-row-name">{emp.name}</span>
                                                <div className="alert-row-meta">
                                                    <span className="alert-row-date">{emp.probation_end_date}</span>
                                                    <span className="alert-row-badge" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                                                        {days < 0 ? (zh ? `已逾期 ${Math.abs(days)} 天` : `${Math.abs(days)}d overdue`) : (zh ? `剩 ${days} 天` : `${days}d left`)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Compliance ── */}
                {compliance.totalActive >= 67 && (
                    <div className={`card ${complianceMet ? 'alert-card--success' : 'alert-card--critical'}`} style={{ marginBottom: 20 }}>
                        <div className="card-header">
                            <span className="card-title">{zh ? '法遵 — 身障僱用比例' : 'Regulatory — Disability Quota'}</span>
                            <span className={`count-badge ${complianceMet ? 'count-badge--green' : 'count-badge--red'}`}>
                                {complianceMet ? (zh ? '✓ 符合規定' : '✓ Compliant') : (zh ? '✗ 未達標準' : '✗ Non-compliant')}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                            <div className="compliance-stat">
                                <div className="compliance-stat-label">{zh ? '在職總人數' : 'Total Active'}</div>
                                <div className="compliance-stat-value">{compliance.totalActive}</div>
                            </div>
                            <div className="compliance-stat">
                                <div className="compliance-stat-label">{zh ? '身障員工數' : 'Disabled Hired'}</div>
                                <div className="compliance-stat-value" style={{ color: complianceMet ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>{compliance.disabledCount}</div>
                            </div>
                            <div className="compliance-stat">
                                <div className="compliance-stat-label">{zh ? '法定最低需求' : 'Required Min.'}</div>
                                <div className="compliance-stat-value">{compliance.disabledRequired}</div>
                            </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--on-surface-muted)', lineHeight: 1.6 }}>
                            {zh
                                ? '依《身心障礙者權益保障法》第38條：私立機構員工67人以上，應進用不得少於員工總人數1%之身心障礙者。'
                                : 'Per Taiwan PRPD Act §38: Private companies with 67+ employees must employ at least 1% persons with disabilities.'}
                        </div>
                    </div>
                )}

                {/* Special Identity Breakdown */}
                {compliance.specialBreakdown.length > 0 && (
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="card-header">
                            <span className="card-title">{zh ? '特殊身分員工統計' : 'Special Identity Breakdown'}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {compliance.specialBreakdown.map(item => {
                                const lbl = SPECIAL_IDENTITY_LABELS[item.label];
                                return (
                                    <div key={item.label} className="identity-chip">
                                        <span>{lbl ? (zh ? lbl.zh : lbl.en) : item.label}</span>
                                        <span className="identity-chip-count">{item.count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Task & Workflow Stats ── */}
                <div className="section-label">{zh ? '任務與流程' : 'Tasks & Workflows'}</div>
                <div className="stats-grid">
                    <div className="stat-card emerald"><div className="stat-label">{t('dashboard.active_workflows')}</div><div className="stat-value">{activeWorkflowCount}</div></div>
                    <div className="stat-card emerald"><div className="stat-label">{t('dashboard.total_tasks')}</div><div className="stat-value">{stats.total}</div></div>
                    <div className="stat-card orange"><div className="stat-label">{t('dashboard.pending')}</div><div className="stat-value">{stats.pending}</div></div>
                    <div className="stat-card blue"><div className="stat-label">{t('dashboard.in_progress')}</div><div className="stat-value">{stats.in_progress}</div></div>
                    <div className="stat-card purple"><div className="stat-label">{t('dashboard.completed')}</div><div className="stat-value">{stats.completed}</div></div>
                    <div className="stat-card red"><div className="stat-label">{t('dashboard.blocked')}</div><div className="stat-value">{stats.blocked}</div></div>
                </div>

                {/* Workflow Progress */}
                {workflows.length > 0 && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <div className="card-header">
                            <span className="card-title">{t('dashboard.active_workflows')}</span>
                            <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>{progress}%</span>
                        </div>
                        <div className="progress-bar" style={{ marginBottom: 12 }}>
                            <div className="progress-bar-fill" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} style={{ width: `${progress}%` }} />
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--on-surface-muted)' }}>
                            {workflows.map(w => w.name).join(' · ')}
                        </div>
                    </div>
                )}

                {/* Recent Tasks */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">{t('dashboard.recent_tasks')}</span>
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
                            {recentTasks.length === 0 && (
                                <tr><td colSpan={4} className="empty-state" style={{ padding: 24 }}>{zh ? '尚無任務' : 'No tasks yet'}</td></tr>
                            )}
                            {recentTasks.map(task => (
                                <tr key={task.id}>
                                    <td style={{ color: 'var(--on-surface-muted)', width: 40 }}>{task.sort_order}</td>
                                    <td>{task.title}</td>
                                    <td>
                                        <span className={`status-badge ${task.status}`}>
                                            {statusLabel[task.status] || task.status}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--on-surface-variant)' }}>
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
