import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';

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

export function Dashboard() {
    const [stats, setStats] = useState<TaskStats>({ total: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0 });
    const [recentTasks, setRecentTasks] = useState<TaskRow[]>([]);
    const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const zh = getLocale() === 'zh-TW';

    useEffect(() => {
        loadData();
    }, []);

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

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>📊 {t('dashboard.title')}</h2>
                <p>{zh ? '所有門市營運概覽' : 'Overview of all store operations'}</p>
            </div>

            <div className="page-body">
                {/* Stats Cards */}
                <div className="stats-grid">
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
