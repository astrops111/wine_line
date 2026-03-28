import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { Link } from 'react-router-dom';

interface TaskRow {
    id: string;
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string | null;
    assigned_user: { id: string; name: string; store_id: string | null } | null;
}

interface StoreInfo {
    id: string;
    name: string;
    store_code: string;
}

interface WorkflowInstance {
    id: string;
    name: string;
    status: string;
    started_at: string;
}

interface StoreProgress {
    store: StoreInfo;
    total: number;
    completed: number;
    pending: number;
    inProgress: number;
    blocked: number;
    percent: number;
}

interface DelayedTask {
    id: string;
    title: string;
    storeName: string;
    assignee: string;
    dueDate: string | null;
    priority: string;
    daysOverdue: number;
}

interface ActivityItem {
    id: string;
    time: string;
    title: string;
    storeName: string;
    type: 'completed' | 'updated' | 'created' | 'blocked';
}

export function ManagerDashboard() {
    const zh = getLocale() === 'zh-TW';
    const [loading, setLoading] = useState(true);
    const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
    const [storeProgress, setStoreProgress] = useState<StoreProgress[]>([]);
    const [delayedTasks, setDelayedTasks] = useState<DelayedTask[]>([]);
    const [todayActivity, setTodayActivity] = useState<ActivityItem[]>([]);
    const [summaryStats, setSummaryStats] = useState({ completed: 0, pending: 0, delayed: 0, total: 0 });
    const [attendanceData, setAttendanceData] = useState<{ name: string; status: string; clockIn: string | null; hoursThisWeek: number; isOvertime: boolean }[]>([]);

    useEffect(() => { loadAll(); }, []);

    async function loadAll() {
        try {
            const [taskRes, storeRes, wfRes] = await Promise.all([
                supabase.from('tasks')
                    .select('id, title, status, priority, due_date, completed_at, created_at, updated_at, users!tasks_assigned_to_fkey(id, name, store_id)')
                    .order('sort_order', { ascending: true }),
                supabase.from('stores')
                    .select('id, name, store_code')
                    .eq('is_active', true)
                    .neq('store_type', 'headquarters')
                    .order('name'),
                supabase.from('workflow_instances')
                    .select('id, name, status, started_at')
                    .order('started_at', { ascending: false })
                    .limit(10),
            ]);

            const allTasks: TaskRow[] = (taskRes.data || []).map((t: any) => ({
                ...t,
                assigned_user: t.users,
            }));
            const allStores: StoreInfo[] = storeRes.data || [];
            const allWf: WorkflowInstance[] = wfRes.data || [];

            setWorkflows(allWf);

            // Compute summary
            const completed = allTasks.filter(t => t.status === 'completed').length;
            const pending = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
            const now = new Date();
            const delayed = allTasks.filter(t => {
                if (t.status === 'completed' || t.status === 'cancelled') return false;
                if (t.status === 'blocked') return true;
                if (t.due_date && new Date(t.due_date) < now) return true;
                return false;
            }).length;
            setSummaryStats({ completed, pending, delayed, total: allTasks.length });

            // Compute per-store progress
            const storeMap = new Map<string, StoreProgress>();
            allStores.forEach(s => {
                storeMap.set(s.id, {
                    store: s,
                    total: 0, completed: 0, pending: 0, inProgress: 0, blocked: 0, percent: 0,
                });
            });

            // Also create an "unassigned" bucket
            const unassigned: StoreProgress = {
                store: { id: 'unassigned', name: zh ? '未分配門市' : 'Unassigned', store_code: 'N/A' },
                total: 0, completed: 0, pending: 0, inProgress: 0, blocked: 0, percent: 0,
            };

            allTasks.forEach(t => {
                const storeId = t.assigned_user?.store_id;
                const bucket = storeId && storeMap.has(storeId) ? storeMap.get(storeId)! : unassigned;
                bucket.total++;
                if (t.status === 'completed') bucket.completed++;
                else if (t.status === 'in_progress') bucket.inProgress++;
                else if (t.status === 'blocked') bucket.blocked++;
                else bucket.pending++;
            });

            const progressArr: StoreProgress[] = [];
            storeMap.forEach(sp => {
                if (sp.total > 0) {
                    sp.percent = Math.round((sp.completed / sp.total) * 100);
                    progressArr.push(sp);
                }
            });
            if (unassigned.total > 0) {
                unassigned.percent = Math.round((unassigned.completed / unassigned.total) * 100);
                progressArr.push(unassigned);
            }
            progressArr.sort((a, b) => b.percent - a.percent);
            setStoreProgress(progressArr);

            // Compute delayed tasks
            const delayedArr: DelayedTask[] = allTasks
                .filter(t => {
                    if (t.status === 'completed' || t.status === 'cancelled') return false;
                    if (t.status === 'blocked') return true;
                    if (t.due_date && new Date(t.due_date) < now) return true;
                    return false;
                })
                .map(t => {
                    const dueMs = t.due_date ? now.getTime() - new Date(t.due_date).getTime() : 0;
                    return {
                        id: t.id,
                        title: t.title,
                        storeName: t.assigned_user?.store_id
                            ? (allStores.find(s => s.id === t.assigned_user?.store_id)?.name || '—')
                            : (zh ? '未分配' : 'Unassigned'),
                        assignee: t.assigned_user?.name || (zh ? '未指派' : 'Unassigned'),
                        dueDate: t.due_date,
                        priority: t.priority,
                        daysOverdue: t.due_date ? Math.max(0, Math.ceil(dueMs / (1000 * 60 * 60 * 24))) : 0,
                    };
                })
                .sort((a, b) => {
                    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
                    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
                    return b.daysOverdue - a.daysOverdue;
                });
            setDelayedTasks(delayedArr);

            // Today's activity
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const actArr: ActivityItem[] = allTasks
                .filter(t => {
                    const updated = t.updated_at ? new Date(t.updated_at) : null;
                    const completed = t.completed_at ? new Date(t.completed_at) : null;
                    const created = new Date(t.created_at);
                    return (updated && updated >= todayStart)
                        || (completed && completed >= todayStart)
                        || (created >= todayStart);
                })
                .map(t => {
                    let time = t.updated_at || t.created_at;
                    let type: ActivityItem['type'] = 'updated';
                    if (t.completed_at && new Date(t.completed_at) >= todayStart) {
                        time = t.completed_at;
                        type = 'completed';
                    } else if (new Date(t.created_at) >= todayStart && !t.updated_at) {
                        time = t.created_at;
                        type = 'created';
                    } else if (t.status === 'blocked') {
                        type = 'blocked';
                    }
                    return {
                        id: t.id,
                        time: new Date(time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
                        title: t.title,
                        storeName: t.assigned_user?.store_id
                            ? (allStores.find(s => s.id === t.assigned_user?.store_id)?.name || '')
                            : '',
                        type,
                    };
                })
                .sort((a, b) => b.time.localeCompare(a.time));
            setTodayActivity(actArr);

            // ── Attendance & Overtime ──
            const todayStr = new Date().toISOString().split('T')[0];
            const weekStartDate = new Date();
            weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay() + 1);
            weekStartDate.setHours(0, 0, 0, 0);

            const [todayRecordsRes, weekRecordsRes, allEmployeesRes] = await Promise.all([
                supabase.from('time_records').select('user_id, clock_in, clock_out, status').gte('clock_in', todayStr + 'T00:00:00'),
                supabase.from('time_records').select('user_id, total_hours').gte('clock_in', weekStartDate.toISOString()).not('total_hours', 'is', null),
                supabase.from('users').select('id, name, max_hours_per_week').eq('status', 'active'),
            ]);

            const todayRecs = todayRecordsRes.data || [];
            const weekRecs = weekRecordsRes.data || [];
            const allEmps = allEmployeesRes.data || [];

            // Build weekly hours map
            const weeklyHoursMap: Record<string, number> = {};
            weekRecs.forEach((r: any) => {
                weeklyHoursMap[r.user_id] = (weeklyHoursMap[r.user_id] || 0) + (r.total_hours || 0);
            });

            const attList = allEmps.map((emp: any) => {
                const todayRec = todayRecs.find((r: any) => r.user_id === emp.id);
                const weekHrs = weeklyHoursMap[emp.id] || 0;
                const maxHrs = emp.max_hours_per_week || 40;
                let status = zh ? '尚未打卡' : 'Not clocked in';
                let clockIn: string | null = null;
                if (todayRec) {
                    if (todayRec.clock_out) {
                        status = zh ? '已下班' : 'Clocked out';
                    } else if (todayRec.status === 'active') {
                        status = zh ? '上班中' : 'Working';
                    }
                    clockIn = todayRec.clock_in ? new Date(todayRec.clock_in).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Taipei' }) : null;
                }
                return {
                    name: emp.name,
                    status,
                    clockIn,
                    hoursThisWeek: Math.round(weekHrs * 10) / 10,
                    isOvertime: weekHrs > maxHrs,
                };
            }).sort((a: any, b: any) => {
                if (a.isOvertime && !b.isOvertime) return -1;
                if (!a.isOvertime && b.isOvertime) return 1;
                return b.hoursThisWeek - a.hoursThisWeek;
            });

            setAttendanceData(attList);

        } catch (err) {
            console.error('ManagerDashboard load error:', err);
        } finally {
            setLoading(false);
        }
    }

    function progressColor(pct: number): string {
        if (pct >= 70) return '#22c55e';
        if (pct >= 40) return '#f59e0b';
        return '#ef4444';
    }

    function progressBg(pct: number): string {
        if (pct >= 70) return '#22c55e20';
        if (pct >= 40) return '#f59e0b20';
        return '#ef444420';
    }

    const priorityIcon: Record<string, string> = { low: '🔽', medium: '➡️', high: '🔼', urgent: '🔥' };
    const activityIcon: Record<string, string> = { completed: '✅', updated: '🔄', created: '🆕', blocked: '🚫' };

    if (loading) {
        return (
            <div className="fade-in">
                <div className="page-header">
                    <h1>📊 {zh ? '門市營運管理看板' : 'Operations Dashboard'}</h1>
                </div>
                <div style={{ padding: '40px', textAlign: 'center' }}>
                    <div className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</div>
                </div>
            </div>
        );
    }

    const overallProgress = summaryStats.total > 0
        ? Math.round((summaryStats.completed / summaryStats.total) * 100) : 0;

    return (
        <div className="fade-in">
            {/* Header */}
            <div className="page-header">
                <h1>📊 {zh ? '門市營運管理看板' : 'Operations Dashboard'}</h1>
                <p className="page-subtitle">{zh ? '掌握所有門市任務進度，一目了然' : 'Store operations at a glance'}</p>
            </div>

            {/* ── Summary Cards ── */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '16px', marginBottom: '24px',
            }}>
                {/* Overall Progress */}
                <div className="card" style={{
                    padding: '20px', textAlign: 'center', position: 'relative', overflow: 'hidden',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.05))',
                    borderLeft: '4px solid #6366f1',
                }}>
                    <div style={{ fontSize: '36px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#6366f1', lineHeight: 1 }}>
                        {overallProgress}%
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        {zh ? '整體進度' : 'Overall Progress'}
                    </div>
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px',
                        background: 'rgba(99,102,241,0.2)',
                    }}>
                        <div style={{
                            height: '100%', width: `${overallProgress}%`,
                            background: '#6366f1', transition: 'width 0.8s ease',
                        }} />
                    </div>
                </div>

                {/* Completed */}
                <div className="card" style={{
                    padding: '20px', textAlign: 'center',
                    borderLeft: '4px solid #22c55e',
                }}>
                    <div style={{ fontSize: '36px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#22c55e', lineHeight: 1 }}>
                        {summaryStats.completed}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        {zh ? '已完成任務' : 'Completed'}
                    </div>
                </div>

                {/* Pending */}
                <div className="card" style={{
                    padding: '20px', textAlign: 'center',
                    borderLeft: '4px solid #f59e0b',
                }}>
                    <div style={{ fontSize: '36px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#f59e0b', lineHeight: 1 }}>
                        {summaryStats.pending}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        {zh ? '待完成' : 'Pending'}
                    </div>
                </div>

                {/* Delayed */}
                <div className="card" style={{
                    padding: '20px', textAlign: 'center',
                    borderLeft: '4px solid #ef4444',
                    background: summaryStats.delayed > 0 ? 'rgba(239,68,68,0.06)' : undefined,
                }}>
                    <div style={{ fontSize: '36px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#ef4444', lineHeight: 1 }}>
                        {summaryStats.delayed}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        {zh ? '延遲 / 受阻' : 'Delayed / Blocked'}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>

                {/* ── Store Progress ── */}
                <div className="card" style={{ padding: 0 }}>
                    <div style={{
                        padding: '16px 20px', borderBottom: 'none',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>
                            🏪 {zh ? '門市任務進度' : 'Store Progress'}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {storeProgress.length} {zh ? '個門市' : 'stores'}
                        </span>
                    </div>
                    <div style={{ padding: '12px 20px', maxHeight: '400px', overflowY: 'auto' }}>
                        {storeProgress.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '13px' }}>
                                {zh ? '尚無門市任務資料' : 'No store task data'}
                            </div>
                        ) : storeProgress.map(sp => (
                            <div key={sp.store.id} style={{ marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{sp.store.name}</span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                            {sp.completed}/{sp.total}
                                        </span>
                                        <span style={{
                                            fontWeight: 700, fontSize: '13px',
                                            color: progressColor(sp.percent),
                                        }}>
                                            {sp.percent}%
                                        </span>
                                    </div>
                                </div>
                                <div style={{
                                    height: '10px', borderRadius: '5px',
                                    background: progressBg(sp.percent), overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%', width: `${sp.percent}%`,
                                        background: progressColor(sp.percent),
                                        borderRadius: '5px',
                                        transition: 'width 0.6s ease',
                                    }} />
                                </div>
                                <div style={{ display: 'flex', gap: '10px', marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                                    {sp.inProgress > 0 && <span>🔄 {sp.inProgress} {zh ? '進行中' : 'active'}</span>}
                                    {sp.pending > 0 && <span>⏳ {sp.pending} {zh ? '待處理' : 'pending'}</span>}
                                    {sp.blocked > 0 && <span style={{ color: '#ef4444' }}>🚫 {sp.blocked} {zh ? '受阻' : 'blocked'}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Delayed Tasks ── */}
                <div className="card" style={{ padding: 0 }}>
                    <div style={{
                        padding: '16px 20px', borderBottom: 'none',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: delayedTasks.length > 0 ? '#ef4444' : undefined }}>
                            ⚠️ {zh ? '延遲 / 受阻任務' : 'Delayed / Blocked Tasks'}
                        </span>
                        {delayedTasks.length > 0 && (
                            <span style={{
                                background: '#ef444420', color: '#ef4444',
                                padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700,
                            }}>
                                {delayedTasks.length}
                            </span>
                        )}
                    </div>
                    <div style={{ padding: '8px 20px', maxHeight: '400px', overflowY: 'auto' }}>
                        {delayedTasks.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#22c55e', padding: '30px', fontSize: '14px' }}>
                                ✅ {zh ? '目前沒有延遲任務！' : 'No delayed tasks!'}
                            </div>
                        ) : delayedTasks.map(dt => (
                            <div key={dt.id} style={{
                                padding: '12px 14px', marginBottom: '8px',
                                background: dt.priority === 'urgent' ? 'rgba(239,68,68,0.08)' : 'var(--bg-primary)',
                                borderRadius: '8px', borderLeft: `3px solid ${dt.priority === 'urgent' ? '#ef4444' : '#f59e0b'}`,
                            }}>
                                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
                                    {priorityIcon[dt.priority]} {dt.title}
                                </div>
                                <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    <span>🏪 {dt.storeName}</span>
                                    <span>👤 {dt.assignee}</span>
                                    {dt.daysOverdue > 0 && (
                                        <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                            ⏰ {zh ? `延遲 ${dt.daysOverdue} 天` : `${dt.daysOverdue}d overdue`}
                                        </span>
                                    )}
                                    {dt.dueDate && dt.daysOverdue === 0 && dt.priority === 'urgent' && (
                                        <span style={{ color: '#f59e0b' }}>
                                            🚫 {zh ? '受阻' : 'Blocked'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Today's Updates ── */}
            <div className="card" style={{ padding: 0, marginBottom: '24px' }}>
                <div style={{
                    padding: '16px 20px', borderBottom: 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>
                        📋 {zh ? '今日更新' : "Today's Updates"}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {new Date().toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })}
                    </span>
                </div>
                <div style={{ padding: '8px 20px', maxHeight: '300px', overflowY: 'auto' }}>
                    {todayActivity.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '13px' }}>
                            {zh ? '今日尚無更新' : 'No updates today'}
                        </div>
                    ) : (
                        <div style={{ position: 'relative', paddingLeft: '24px' }}>
                            {/* Timeline line */}
                            <div style={{
                                position: 'absolute', left: '7px', top: '8px', bottom: '8px',
                                width: '2px', background: 'var(--outline-variant)',
                            }} />
                            {todayActivity.map((act, i) => (
                                <div key={act.id + i} style={{
                                    position: 'relative', padding: '8px 0', display: 'flex', gap: '12px', alignItems: 'flex-start',
                                }}>
                                    {/* Timeline dot */}
                                    <div style={{
                                        position: 'absolute', left: '-20px', top: '14px',
                                        width: '12px', height: '12px', borderRadius: '50%',
                                        background: act.type === 'completed' ? '#22c55e'
                                            : act.type === 'blocked' ? '#ef4444'
                                                : act.type === 'created' ? '#6366f1'
                                                    : '#f59e0b',
                                        border: '2px solid var(--bg-secondary)',
                                    }} />
                                    <div style={{
                                        fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace',
                                        minWidth: '48px', paddingTop: '2px',
                                    }}>
                                        {act.time}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 500 }}>
                                            {activityIcon[act.type]} {act.title}
                                        </div>
                                        {act.storeName && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                🏪 {act.storeName}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Attendance & Overtime Report ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                {/* Today's Attendance */}
                <div className="card" style={{ padding: 0 }}>
                    <div style={{
                        padding: '16px 20px', borderBottom: 'none',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>
                            🕐 {zh ? '今日出勤狀態' : "Today's Attendance"}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {attendanceData.filter(a => a.status === (zh ? '上班中' : 'Working')).length}/{attendanceData.length} {zh ? '人在班' : 'on shift'}
                        </span>
                    </div>
                    <div style={{ padding: '8px 20px', maxHeight: '350px', overflowY: 'auto' }}>
                        {attendanceData.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '13px' }}>
                                {zh ? '尚無員工資料' : 'No employee data'}
                            </div>
                        ) : attendanceData.map((att, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 0', borderBottom: 'none',
                            }}>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{att.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {att.clockIn ? `⏰ ${att.clockIn}` : ''}
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '12px',
                                    background: att.status === (zh ? '上班中' : 'Working') ? '#22c55e20'
                                        : att.status === (zh ? '已下班' : 'Clocked out') ? '#6366f120'
                                            : '#f59e0b20',
                                    color: att.status === (zh ? '上班中' : 'Working') ? '#22c55e'
                                        : att.status === (zh ? '已下班' : 'Clocked out') ? '#6366f1'
                                            : '#f59e0b',
                                }}>
                                    {att.status === (zh ? '上班中' : 'Working') ? '🟢' : att.status === (zh ? '已下班' : 'Clocked out') ? '🔵' : '🟡'} {att.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Weekly Hours & Overtime Alerts */}
                <div className="card" style={{ padding: 0 }}>
                    <div style={{
                        padding: '16px 20px', borderBottom: 'none',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>
                            ⏱ {zh ? '本週工時 & 加班警報' : 'Weekly Hours & Overtime'}
                        </span>
                        {attendanceData.filter(a => a.isOvertime).length > 0 && (
                            <span style={{
                                background: '#ef444420', color: '#ef4444',
                                padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700,
                            }}>
                                ⚠️ {attendanceData.filter(a => a.isOvertime).length} {zh ? '人超時' : 'overtime'}
                            </span>
                        )}
                    </div>
                    <div style={{ padding: '8px 20px', maxHeight: '350px', overflowY: 'auto' }}>
                        {attendanceData.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '13px' }}>
                                {zh ? '尚無工時資料' : 'No hours data'}
                            </div>
                        ) : attendanceData.map((att, i) => (
                            <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 0', borderBottom: 'none',
                                background: att.isOvertime ? 'rgba(239,68,68,0.06)' : undefined,
                                marginBottom: att.isOvertime ? '2px' : 0,
                                borderRadius: att.isOvertime ? '6px' : undefined,
                                paddingLeft: att.isOvertime ? '8px' : undefined,
                                paddingRight: att.isOvertime ? '8px' : undefined,
                            }}>
                                <div style={{ fontSize: '13px', fontWeight: att.isOvertime ? 700 : 500 }}>
                                    {att.isOvertime ? '🔴 ' : ''}{att.name}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{
                                        width: '60px', height: '6px', borderRadius: '3px',
                                        background: 'var(--outline-variant)', overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            height: '100%', width: `${Math.min(100, (att.hoursThisWeek / 40) * 100)}%`,
                                            background: att.isOvertime ? '#ef4444' : att.hoursThisWeek > 32 ? '#f59e0b' : '#22c55e',
                                            borderRadius: '3px',
                                        }} />
                                    </div>
                                    <span style={{
                                        fontSize: '12px', fontWeight: 600, minWidth: '36px', textAlign: 'right',
                                        color: att.isOvertime ? '#ef4444' : 'var(--text-secondary)',
                                    }}>
                                        {att.hoursThisWeek}h
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Quick Actions + Workflow Status ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                {/* Quick Actions */}
                <div className="card">
                    <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>
                        ⚡ {zh ? '快速操作' : 'Quick Actions'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <Link to="/tasks" style={{ textDecoration: 'none' }}>
                            <div style={{
                                padding: '16px', borderRadius: '10px', textAlign: 'center',
                                background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.04))',
                                border: '1px solid rgba(99,102,241,0.2)', cursor: 'pointer',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(99,102,241,0.15)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                            >
                                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📋</div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#6366f1' }}>
                                    {zh ? '查看全部任務' : 'All Tasks'}
                                </div>
                            </div>
                        </Link>
                        <Link to="/employees" style={{ textDecoration: 'none' }}>
                            <div style={{
                                padding: '16px', borderRadius: '10px', textAlign: 'center',
                                background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
                                border: '1px solid rgba(34,197,94,0.2)', cursor: 'pointer',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(34,197,94,0.15)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                            >
                                <div style={{ fontSize: '24px', marginBottom: '6px' }}>👥</div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#22c55e' }}>
                                    {zh ? '查看門市人員' : 'Store Staff'}
                                </div>
                            </div>
                        </Link>
                        <Link to="/scheduling" style={{ textDecoration: 'none' }}>
                            <div style={{
                                padding: '16px', borderRadius: '10px', textAlign: 'center',
                                background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))',
                                border: '1px solid rgba(245,158,11,0.2)', cursor: 'pointer',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(245,158,11,0.15)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                            >
                                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📅</div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b' }}>
                                    {zh ? '排班管理' : 'Scheduling'}
                                </div>
                            </div>
                        </Link>
                        <Link to="/hr-dashboard" style={{ textDecoration: 'none' }}>
                            <div style={{
                                padding: '16px', borderRadius: '10px', textAlign: 'center',
                                background: 'linear-gradient(135deg, rgba(236,72,153,0.12), rgba(236,72,153,0.04))',
                                border: '1px solid rgba(236,72,153,0.2)', cursor: 'pointer',
                                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(236,72,153,0.15)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                            >
                                <div style={{ fontSize: '24px', marginBottom: '6px' }}>📈</div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#ec4899' }}>
                                    {zh ? 'HR 報表' : 'HR Reports'}
                                </div>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Active Workflows */}
                <div className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '16px 20px', borderBottom: 'none' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>
                            🔄 {zh ? '進行中工作流程' : 'Active Workflows'}
                        </span>
                    </div>
                    <div style={{ padding: '8px 20px', maxHeight: '250px', overflowY: 'auto' }}>
                        {workflows.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '13px' }}>
                                {zh ? '目前無進行中工作流程' : 'No active workflows'}
                            </div>
                        ) : workflows.map(wf => (
                            <div key={wf.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '10px 0', borderBottom: 'none',
                            }}>
                                <div>
                                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{wf.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        {new Date(wf.started_at).toLocaleDateString('zh-TW')}
                                    </div>
                                </div>
                                <span className={`status-badge ${wf.status}`} style={{ fontSize: '10px' }}>
                                    {wf.status === 'active' ? (zh ? '進行中' : 'Active')
                                        : wf.status === 'completed' ? (zh ? '已完成' : 'Done')
                                            : wf.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
