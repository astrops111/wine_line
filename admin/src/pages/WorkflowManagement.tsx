import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';
import { Workflows } from './Workflows';
import { Tasks } from './Tasks';
import { Checklists } from './Checklists';

type Tab = 'dashboard' | 'workflows' | 'tasks' | 'checklists' | 'templates';

interface TemplateItem {
    id: string;
    name: string;
    name_en: string | null;
    description: string | null;
    description_en: string | null;
    category: string | null;
    icon: string;
    steps: { name: string; owner: string }[];
}

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
    overdue: number;
}

interface ActivityTask {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    notes: string | null;
    completed_at: string | null;
    updated_at: string | null;
    created_at: string;
    assigned_user: { name: string } | null;
    workflow_instance: { id: string; name: string; workflow: { name: string } | null } | null;
}

type ActivityPeriod = 'today' | '7days' | 'week' | 'month';

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
    const [taskStat, setTaskStat] = useState<TaskStat>({ total: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0, overdue: 0 });
    const [templateCount, setTemplateCount] = useState(0);
    const [checklistCount, setChecklistCount] = useState(0);
    const [recentInstances, setRecentInstances] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState<TemplateItem[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
    const [creatingFromTemplate, setCreatingFromTemplate] = useState<string | null>(null);
    const [activities, setActivities] = useState<ActivityTask[]>([]);
    const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('today');
    const [pendingApprovals, setPendingApprovals] = useState<{ id: string; taskId: string; taskTitle: string; assignee: string; workflowName: string; requestedAt: string; approvers: { name: string; status: string }[] }[]>([]);

    useEffect(() => {
        if (!orgId) return;
        loadDashboard();
    }, [orgId]);

    useEffect(() => {
        if (tab === 'templates') loadTemplates();
    }, [tab]);

    async function loadTemplates() {
        setTemplatesLoading(true);
        const { data } = await supabase
            .from('workflow_template_library')
            .select('*')
            .order('category, name');
        setTemplates(data || []);
        setTemplatesLoading(false);
    }

    async function createFromTemplate(tmpl: TemplateItem) {
        if (!orgId) return;
        setCreatingFromTemplate(tmpl.id);
        // Create workflow template
        const { data: wf } = await supabase
            .from('workflows')
            .insert({
                organization_id: orgId,
                name: tmpl.name,
                description: tmpl.description || '',
                status: 'active',
                metadata: { type: tmpl.category, from_library: tmpl.id },
            })
            .select('id')
            .single();

        if (wf) {
            // Create steps
            const steps = (tmpl.steps || []).map((s, i) => ({
                workflow_id: wf.id,
                name: s.name,
                step_order: i + 1,
                step_type: 'task',
                config: { owner: s.owner },
            }));
            if (steps.length > 0) {
                await supabase.from('workflow_steps').insert(steps);
            }
        }
        setCreatingFromTemplate(null);
        switchTab('workflows');
    }

    async function loadDashboard() {
        setLoading(true);
        // 60 days back for activity feed (covers full month tab)
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 60);
        const monthAgoISO = monthAgo.toISOString();

        const [instRes, taskRes, tmplRes, clRes, recentRes, activityRes] = await Promise.all([
            supabase.from('workflow_instances').select('status').eq('organization_id', orgId),
            supabase.from('tasks').select('status, due_date').eq('organization_id', orgId),
            supabase.from('workflows').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase.from('checklists').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase.from('workflow_instances')
                .select('id, name, status, started_at, workflow:workflows(name), tasks(id, status)')
                .eq('organization_id', orgId)
                .in('status', ['running', 'paused'])
                .order('started_at', { ascending: false })
                .limit(20),
            supabase.from('tasks')
                .select('id, title, status, priority, due_date, notes, completed_at, updated_at, created_at, assigned_user:users!tasks_assigned_to_fkey(name), workflow_instance:workflow_instances!tasks_workflow_instance_id_fkey(id, name, workflow:workflows(name))')
                .eq('organization_id', orgId)
                .gte('updated_at', monthAgoISO)
                .order('updated_at', { ascending: false })
                .limit(200),
        ]);

        const instances = instRes.data || [];
        setWfStat({
            total: instances.length,
            running: instances.filter(i => i.status === 'running').length,
            completed: instances.filter(i => i.status === 'completed').length,
            paused: instances.filter(i => i.status === 'paused').length,
        });

        const tasks = taskRes.data || [];
        const now = new Date();
        setTaskStat({
            total: tasks.length,
            pending: tasks.filter(t => t.status === 'pending').length,
            in_progress: tasks.filter(t => t.status === 'in_progress').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            blocked: tasks.filter(t => t.status === 'blocked').length,
            overdue: tasks.filter(t => t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < now).length,
        });

        setTemplateCount(tmplRes.count || 0);
        setChecklistCount(clRes.count || 0);
        setRecentInstances(recentRes.data || []);
        setActivities((activityRes.data as unknown as ActivityTask[]) || []);

        // Load pending approvals
        const { data: pendingTasks } = await supabase.from('tasks')
            .select('id, title, confirmation_status, confirmation_requested_at, assigned_user:users!tasks_assigned_to_fkey(name), workflow_instance:workflow_instances(name)')
            .eq('organization_id', orgId)
            .eq('confirmation_required', true)
            .eq('confirmation_status', 'pending')
            .not('confirmation_requested_at', 'is', null);

        if (pendingTasks && pendingTasks.length > 0) {
            const taskIds = pendingTasks.map((t: any) => t.id);
            const { data: allConfs } = await supabase.from('task_confirmations')
                .select('task_id, status, approver:users!task_confirmations_approver_id_fkey(name)')
                .in('task_id', taskIds);
            const confMap: Record<string, { name: string; status: string }[]> = {};
            (allConfs || []).forEach((c: any) => {
                if (!confMap[c.task_id]) confMap[c.task_id] = [];
                confMap[c.task_id].push({ name: c.approver?.name || '—', status: c.status });
            });
            setPendingApprovals(pendingTasks.map((t: any) => ({
                id: t.id,
                taskId: t.id,
                taskTitle: t.title,
                assignee: t.assigned_user?.name || '—',
                workflowName: t.workflow_instance?.name || '',
                requestedAt: t.confirmation_requested_at ? new Date(t.confirmation_requested_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
                approvers: confMap[t.id] || [],
            })));
        } else {
            setPendingApprovals([]);
        }

        setLoading(false);
    }

    const tabDefs: { key: Tab; icon: string; label: string }[] = [
        { key: 'dashboard',  icon: '📊', label: zh ? '總覽'    : 'Dashboard' },
        { key: 'workflows',  icon: '🔄', label: zh ? '流程'    : 'Workflows' },
        { key: 'tasks',      icon: '📋', label: zh ? '任務'    : 'Tasks' },
        { key: 'checklists', icon: '✅', label: zh ? '查核清單' : 'Checklists' },
        { key: 'templates',  icon: '📚', label: zh ? '範本庫'  : 'Templates' },
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
            <div className="page-body">
                {/* Tab navigation is handled by the sidebar */}

                {/* ═══ DASHBOARD ═══ */}
                {tab === 'dashboard' && (
                    <div>
                        <div className="page-header">
                            <h2>📊 {zh ? '總覽' : 'Dashboard'}</h2>
                            <p>{zh ? '流程、任務與查核清單概況' : 'Overview of workflows, tasks and checklists'}</p>
                        </div>
                        {loading ? (
                            <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                        ) : (
                            <>
                                {/* Stat cards */}
                                <div className="stats-grid" style={{ marginBottom: '24px' }}>
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
                                        <div className="stat-label">{zh ? '逾期任務' : 'Overdue'}</div>
                                        <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{taskStat.overdue}</div>
                                    </div>
                                </div>

                                {/* Active workflows */}
                                <div className="card" style={{ padding: 0 }}>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', fontWeight: 600, fontSize: '13px' }}>
                                        🔄 {zh ? '進行中流程' : 'Active Workflows'}
                                        {recentInstances.length > 0 && <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>({recentInstances.length})</span>}
                                    </div>
                                    {recentInstances.length === 0
                                        ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '13px' }}>{zh ? '目前沒有進行中的流程' : 'No active workflows'}</p>
                                        : <div style={{ padding: '12px 16px', display: 'grid', gap: '10px' }}>
                                            {recentInstances.map(inst => {
                                                const instTasks: any[] = inst.tasks || [];
                                                const total = instTasks.length;
                                                const completed = instTasks.filter((t: any) => t.status === 'completed').length;
                                                const inProgress = instTasks.filter((t: any) => t.status === 'in_progress').length;
                                                const blocked = instTasks.filter((t: any) => t.status === 'blocked').length;
                                                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                                                const pctColor = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
                                                return (
                                                    <div key={inst.id} style={{
                                                        padding: '12px 14px', borderRadius: '10px',
                                                        background: 'var(--bg-secondary)',
                                                        border: '1px solid var(--outline-variant)',
                                                        cursor: 'pointer',
                                                    }} onClick={() => switchTab('workflows')}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                            <div>
                                                                <span style={{ fontWeight: 600, fontSize: '13px' }}>{inst.name}</span>
                                                                <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: statusColors[inst.status]?.bg, color: statusColors[inst.status]?.color }}>
                                                                    {inst.status === 'running' ? (zh ? '進行中' : 'Running') : inst.status === 'paused' ? (zh ? '暫停' : 'Paused') : inst.status}
                                                                </span>
                                                            </div>
                                                            <span style={{ fontSize: '14px', fontWeight: 700, color: pctColor }}>{pct}%</span>
                                                        </div>
                                                        {/* Progress bar */}
                                                        <div style={{ height: '6px', borderRadius: '99px', background: 'var(--outline-variant)', overflow: 'hidden', marginBottom: '6px' }}>
                                                            <div style={{ height: '100%', borderRadius: '99px', width: `${pct}%`, background: pctColor, transition: 'width 0.4s' }} />
                                                        </div>
                                                        {/* Task stats */}
                                                        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                            <span>✅ {completed}/{total}</span>
                                                            {inProgress > 0 && <span style={{ color: '#3b82f6' }}>🔵 {zh ? '進行' : 'Active'} {inProgress}</span>}
                                                            {blocked > 0 && <span style={{ color: '#f59e0b' }}>🟠 {zh ? '阻塞' : 'Blocked'} {blocked}</span>}
                                                            <span style={{ marginLeft: 'auto', fontSize: '10px' }}>{new Date(inst.started_at).toLocaleDateString('zh-TW')}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    }
                                </div>

                                {/* ─── Awaiting Approval ─── */}
                                {pendingApprovals.length > 0 && (
                                    <div className="card" style={{ marginTop: '24px', padding: 0 }}>
                                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, fontSize: '13px' }}>🔐 {zh ? '待審批任務' : 'Awaiting Approval'}</span>
                                            <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '99px', fontWeight: 700, background: '#8b5cf620', color: '#8b5cf6' }}>{pendingApprovals.length}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', padding: '14px 16px', overflowX: 'auto', scrollSnapType: 'x mandatory' }}>
                                            {pendingApprovals.map(ap => (
                                                <div key={ap.id} style={{
                                                    minWidth: '240px', maxWidth: '280px', flexShrink: 0, scrollSnapAlign: 'start',
                                                    borderRadius: '12px', border: '1px solid var(--outline-variant)', overflow: 'hidden',
                                                    background: 'var(--bg-primary)',
                                                }}>
                                                    <div style={{ padding: '10px 14px', background: '#8b5cf610', borderBottom: '1px solid var(--outline-variant)' }}>
                                                        {ap.workflowName && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{ap.workflowName}</div>}
                                                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{ap.taskTitle}</div>
                                                    </div>
                                                    <div style={{ padding: '10px 14px', fontSize: '12px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                            <span style={{ color: 'var(--text-muted)' }}>{zh ? '負責人' : 'Assignee'}</span>
                                                            <span style={{ fontWeight: 500 }}>{ap.assignee}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                            <span style={{ color: 'var(--text-muted)' }}>{zh ? '申請時間' : 'Requested'}</span>
                                                            <span style={{ fontSize: '11px' }}>{ap.requestedAt}</span>
                                                        </div>
                                                        {ap.approvers.length > 0 && (
                                                            <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '6px' }}>
                                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>{zh ? '審批人' : 'Approvers'}</div>
                                                                {ap.approvers.map((a, i) => (
                                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '2px 0' }}>
                                                                        <span>{a.name}</span>
                                                                        <span style={{
                                                                            fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600,
                                                                            background: a.status === 'approved' ? '#22c55e20' : a.status === 'rejected' ? '#ef444420' : '#f59e0b20',
                                                                            color: a.status === 'approved' ? '#22c55e' : a.status === 'rejected' ? '#ef4444' : '#f59e0b',
                                                                        }}>
                                                                            {a.status === 'approved' ? (zh ? '已核准' : 'Approved') : a.status === 'rejected' ? (zh ? '已拒絕' : 'Rejected') : (zh ? '待回覆' : 'Pending')}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ─── Activities ─── */}
                                {(() => {
                                    const now = new Date();
                                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
                                    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
                                    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
                                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

                                    const cutoff = activityPeriod === 'today' ? todayStart : activityPeriod === '7days' ? sevenDaysAgo : activityPeriod === 'week' ? weekStart : monthStart;
                                    const cutoffDate = new Date(cutoff);

                                    // Classify each task
                                    const isOverdue = (t: ActivityTask) => t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < now;

                                    // Include tasks updated/completed in period + ALL currently overdue tasks
                                    const filtered = activities.filter(t =>
                                        new Date(t.updated_at || t.created_at) >= cutoffDate
                                        || (t.completed_at && new Date(t.completed_at) >= cutoffDate)
                                        || isOverdue(t)
                                    );
                                    type Category = 'completed' | 'updated' | 'blocked' | 'overdue';

                                    // Single category per task (priority: overdue > blocked > completed > updated)
                                    const categorize = (t: ActivityTask): Category => {
                                        if (isOverdue(t)) return 'overdue';
                                        if (t.status === 'blocked') return 'blocked';
                                        if (t.status === 'completed') return 'completed';
                                        return 'updated';
                                    };

                                    // Count updates separately for the badge (tasks updated in period, any status)
                                    const updateCount = filtered.filter(t => t.status !== 'completed' && t.updated_at && new Date(t.updated_at) >= cutoffDate).length;

                                    // Group by workflow name
                                    const grouped: Record<string, Record<Category, ActivityTask[]>> = {};
                                    for (const t of filtered) {
                                        const wfName = t.workflow_instance?.name || t.workflow_instance?.workflow?.name || (zh ? '一般任務' : 'General');
                                        if (!grouped[wfName]) grouped[wfName] = { completed: [], updated: [], blocked: [], overdue: [] };
                                        grouped[wfName][categorize(t)].push(t);
                                    }

                                    const categoryMeta: { key: Category; label: string; icon: string; color: string }[] = [
                                        { key: 'overdue',   label: zh ? '逾期' : 'Overdue',   icon: '🔴', color: '#ef4444' },
                                        { key: 'blocked',   label: zh ? '阻塞' : 'Blocked',   icon: '🟠', color: '#f59e0b' },
                                        { key: 'updated',   label: zh ? '更新' : 'Updated',   icon: '🔵', color: '#3b82f6' },
                                        { key: 'completed', label: zh ? '已完成' : 'Completed', icon: '🟢', color: '#22c55e' },
                                    ];

                                    const periodTabs: { key: ActivityPeriod; label: string }[] = [
                                        { key: 'today',  label: zh ? '今日' : 'Today' },
                                        { key: '7days',  label: zh ? '近7天' : 'Last 7 Days' },
                                        { key: 'week',   label: zh ? '本週' : 'This Week' },
                                        { key: 'month',  label: zh ? '本月' : 'This Month' },
                                    ];

                                    const priorityColors: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' };

                                    return (
                                        <div className="card" style={{ marginTop: '24px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                <div style={{ fontWeight: 600, fontSize: '13px' }}>📈 {zh ? '活動紀錄' : 'Activities'}</div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    {periodTabs.map(p => (
                                                        <button
                                                            key={p.key}
                                                            className={`btn btn-sm ${activityPeriod === p.key ? 'btn-primary' : 'btn-ghost'}`}
                                                            style={{ fontSize: '11px', padding: '3px 10px' }}
                                                            onClick={() => setActivityPeriod(p.key)}
                                                        >
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Summary badges */}
                                            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                                {categoryMeta.map(c => {
                                                    const count = c.key === 'updated' ? updateCount : Object.values(grouped).reduce((sum, g) => sum + g[c.key].length, 0);
                                                    return (
                                                        <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                                                            <span>{c.icon}</span>
                                                            <span style={{ fontWeight: 600, color: c.color }}>{count}</span>
                                                            <span style={{ color: 'var(--text-muted)' }}>{c.label}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {Object.keys(grouped).length === 0 ? (
                                                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px', fontSize: '13px' }}>
                                                    {zh ? '此期間無活動' : 'No activities in this period'}
                                                </p>
                                            ) : (
                                                <div style={{ display: 'grid', gap: '16px' }}>
                                                    {Object.entries(grouped).map(([wfName, cats]) => (
                                                        <div key={wfName}>
                                                            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                🔄 {wfName}
                                                            </div>
                                                            <div style={{ display: 'grid', gap: '4px' }}>
                                                                {categoryMeta.map(c =>
                                                                    cats[c.key].map(t => (
                                                                        <div key={t.id} style={{
                                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                                            fontSize: '12px', padding: '6px 10px', borderRadius: '6px',
                                                                            background: 'var(--bg-secondary)',
                                                                            borderLeft: `3px solid ${c.color}`,
                                                                        }}>
                                                                            <span style={{ minWidth: '18px' }}>{c.icon}</span>
                                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                                <span style={{ fontWeight: 500 }}>{t.title}</span>
                                                                                {t.notes && (() => {
                                                                                    const lastLine = t.notes.split('\n').filter(Boolean).pop();
                                                                                    return lastLine ? (
                                                                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                                            📝 {lastLine}
                                                                                        </div>
                                                                                    ) : null;
                                                                                })()}
                                                                            </div>
                                                                            {t.assigned_user?.name && (
                                                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                                                    {t.assigned_user.name}
                                                                                </span>
                                                                            )}
                                                                            {t.priority && t.priority !== 'medium' && (
                                                                                <span style={{
                                                                                    fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600,
                                                                                    background: (priorityColors[t.priority] || '#6b7280') + '20',
                                                                                    color: priorityColors[t.priority] || '#6b7280',
                                                                                }}>
                                                                                    {t.priority}
                                                                                </span>
                                                                            )}
                                                                            {t.due_date && (
                                                                                <span style={{ fontSize: '10px', color: isOverdue(t) ? '#ef4444' : 'var(--text-muted)' }}>
                                                                                    {new Date(t.due_date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                                                                                </span>
                                                                            )}
                                                                            {t.updated_at && (
                                                                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                                                    {new Date(t.updated_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

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

                {/* ═══ TEMPLATES ═══ */}
                {tab === 'templates' && (
                    <div>
                        <div className="page-header">
                            <h2>📚 {zh ? '範本庫' : 'Templates'}</h2>
                            <p>{zh ? '瀏覽與套用流程範本' : 'Browse and apply workflow templates'}</p>
                        </div>
                        {templatesLoading ? (
                            <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                        ) : templates.length === 0 ? (
                            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                {zh ? '尚無範本' : 'No templates available'}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {(() => {
                                    const categories = [...new Set(templates.map(t => t.category || '其他'))];
                                    return categories.map(cat => (
                                        <div key={cat}>
                                            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                                                {cat}
                                            </h3>
                                            <div style={{ display: 'grid', gap: '8px' }}>
                                                {templates.filter(t => (t.category || '其他') === cat).map(tmpl => (
                                                    <div key={tmpl.id} className="card" style={{ padding: '16px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                    <span style={{ fontSize: '20px' }}>{tmpl.icon}</span>
                                                                    <span style={{ fontWeight: 600, fontSize: '14px' }}>
                                                                        {zh ? tmpl.name : (tmpl.name_en || tmpl.name)}
                                                                    </span>
                                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '1px 8px', borderRadius: '10px' }}>
                                                                        {(tmpl.steps || []).length} {zh ? '步驟' : 'steps'}
                                                                    </span>
                                                                </div>
                                                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                                                                    {zh ? tmpl.description : (tmpl.description_en || tmpl.description)}
                                                                </p>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                                <button
                                                                    className="btn btn-ghost"
                                                                    style={{ fontSize: '12px', padding: '4px 10px' }}
                                                                    onClick={() => setExpandedTemplate(expandedTemplate === tmpl.id ? null : tmpl.id)}
                                                                >
                                                                    {expandedTemplate === tmpl.id ? (zh ? '收起' : 'Collapse') : (zh ? '預覽' : 'Preview')}
                                                                </button>
                                                                <button
                                                                    className="btn btn-primary"
                                                                    style={{ fontSize: '12px', padding: '4px 10px' }}
                                                                    disabled={creatingFromTemplate === tmpl.id}
                                                                    onClick={() => createFromTemplate(tmpl)}
                                                                >
                                                                    {creatingFromTemplate === tmpl.id ? '...' : (zh ? '套用' : 'Use')}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {expandedTemplate === tmpl.id && (tmpl.steps || []).length > 0 && (
                                                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                                                                <div style={{ display: 'grid', gap: '4px' }}>
                                                                    {tmpl.steps.map((step, idx) => (
                                                                        <div key={idx} style={{
                                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                                            fontSize: '12px', padding: '4px 8px', borderRadius: '6px',
                                                                            background: 'var(--bg-secondary)',
                                                                        }}>
                                                                            <span style={{ color: 'var(--text-muted)', minWidth: '20px', fontFamily: 'monospace' }}>
                                                                                {idx + 1}.
                                                                            </span>
                                                                            <span style={{ flex: 1, fontWeight: 500 }}>{step.name}</span>
                                                                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{step.owner}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
