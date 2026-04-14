import { useState, useEffect, useCallback, useMemo } from 'react';
import liff from '@line/liff';
import { supabase } from '../lib/supabase';
import { ActivityTimeline, type ActivityItem, type ActivityPeriod } from '../components/LiffManager/ActivityTimeline';

interface WorkflowInstance {
    id: string;
    name: string;
    status: string;
    started_at: string;
    tasks: { id: string; title: string; status: string; due_date: string | null; assigned_user: { name: string } | null }[];
}

interface PendingApproval {
    id: string;
    taskId: string;
    taskTitle: string;
    assignee: string;
    workflowName: string;
    requestedAt: string;
    approvers: { name: string; status: string }[];
}

/* ── CSS-in-JS ── */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

.liff-dash {
  min-height: 100vh;
  background: linear-gradient(180deg, #0c0e1a 0%, #141829 50%, #0f1420 100%);
  color: #dde2f0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

/* ── Header ── */
.dash-header {
  position: relative;
  padding: 32px 24px 40px;
  background: linear-gradient(135deg, #0f172a 0%, #155e75 60%, #0891b2 100%);
  border-radius: 0 0 28px 28px;
  text-align: center;
  overflow: hidden;
}
.dash-header::before {
  content: '';
  position: absolute;
  top: -60%;
  left: -20%;
  width: 140%;
  height: 140%;
  background: radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, transparent 70%);
  pointer-events: none;
}
.dash-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
}
.dash-title {
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  letter-spacing: 0.3px;
  position: relative;
}
.dash-subtitle {
  font-size: 13px;
  color: rgba(255,255,255,0.65);
  margin-top: 4px;
  position: relative;
}
.overall-bar-wrap {
  margin-top: 16px;
  padding: 0 4px;
  position: relative;
}
.overall-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  margin-bottom: 6px;
}
.overall-pct {
  font-weight: 800;
  color: #fff;
  font-size: 13px;
}
.overall-track {
  height: 6px;
  border-radius: 99px;
  background: rgba(255,255,255,0.15);
  backdrop-filter: blur(4px);
}
.overall-fill {
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.85) 100%);
  transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
  box-shadow: 0 0 8px rgba(255,255,255,0.3);
}

/* ── Summary Cards ── */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 0 20px;
  margin-top: -24px;
  position: relative;
  z-index: 2;
}
.summary-card {
  background: rgba(30, 36, 58, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 18px;
  padding: 16px 8px;
  text-align: center;
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow: 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04);
  transition: transform 0.2s;
}
.summary-card:active {
  transform: scale(0.97);
}
.summary-val {
  font-size: 32px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.5px;
}
.summary-val.green { color: #34d399; }
.summary-val.amber { color: #fbbf24; }
.summary-val.red   { color: #f87171; }
.summary-lbl {
  font-size: 11px;
  color: #64748b;
  margin-top: 6px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

/* ── Glass Section ── */
.glass-section {
  margin: 16px 20px;
  background: rgba(22, 27, 45, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.05);
  box-shadow: 0 2px 16px rgba(0,0,0,0.2);
  overflow: hidden;
}
.section-head {
  padding: 16px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.section-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.section-meta {
  font-size: 11px;
  color: #475569;
  font-weight: 500;
}
.section-body {
  padding: 14px 18px;
}

/* ── Progress Bars ── */
.store-row {
  margin-bottom: 16px;
}
.store-row:last-child {
  margin-bottom: 4px;
}
.store-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 13px;
}
.store-name {
  font-weight: 600;
  color: #cbd5e1;
}
.store-stats {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.store-frac {
  font-size: 11px;
  color: #475569;
}
.store-pct {
  font-weight: 800;
  font-size: 14px;
}
.store-pct.green { color: #34d399; }
.store-pct.amber { color: #fbbf24; }
.store-pct.red   { color: #f87171; }
.progress-track {
  height: 8px;
  border-radius: 99px;
  background: rgba(255,255,255,0.04);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
}
.progress-fill.green { background: linear-gradient(90deg, #059669, #34d399); }
.progress-fill.amber { background: linear-gradient(90deg, #d97706, #fbbf24); }
.progress-fill.red   { background: linear-gradient(90deg, #dc2626, #f87171); }
.store-tags {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  font-size: 10px;
  color: #475569;
}
.store-tags .blocked-tag {
  color: #f87171;
}

/* ── Delayed Tasks ── */
.delay-card {
  padding: 14px 16px;
  margin-bottom: 8px;
  border-radius: 14px;
  border-left: 3px solid #fbbf24;
  background: rgba(255,255,255,0.02);
  transition: background 0.15s;
}
.delay-card:active {
  background: rgba(255,255,255,0.05);
}
.delay-card.urgent {
  border-left-color: #f87171;
  background: rgba(248,113,113,0.04);
}
.delay-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
  color: #dde2f0;
}
.delay-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  color: #64748b;
}
.delay-overdue {
  color: #f87171;
  font-weight: 700;
}

/* ── Badge ── */
.count-badge {
  padding: 2px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 700;
}
.count-badge.red {
  background: rgba(248,113,113,0.12);
  color: #f87171;
}

/* ── Timeline ── */
.tl-item {
  display: flex;
  gap: 14px;
  padding-bottom: 14px;
  position: relative;
}
.tl-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 16px;
  bottom: 0;
  width: 1px;
  background: rgba(255,255,255,0.06);
}
.tl-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  margin-top: 3px;
  flex-shrink: 0;
  box-shadow: 0 0 8px var(--dot-glow);
}
.tl-dot.green { background: #34d399; --dot-glow: rgba(52,211,153,0.4); }
.tl-dot.amber { background: #fbbf24; --dot-glow: rgba(251,191,36,0.4); }
.tl-dot.indigo { background: #818cf8; --dot-glow: rgba(129,140,248,0.4); }
.tl-dot.red { background: #f87171; --dot-glow: rgba(248,113,113,0.4); }
.tl-body { flex: 1; }
.tl-time {
  font-size: 11px;
  color: #475569;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-weight: 500;
}
.tl-title {
  font-size: 13px;
  font-weight: 500;
  color: #cbd5e1;
  margin-top: 1px;
}
.tl-store {
  font-size: 11px;
  color: #3b82f6;
  margin-top: 2px;
  font-weight: 500;
}

/* ── Empty state ── */
.empty-state {
  text-align: center;
  padding: 28px 16px;
  color: #475569;
  font-size: 13px;
}
.empty-state.success {
  color: #34d399;
  font-weight: 600;
}

/* ── Error state ── */
.dash-error {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #0c0e1a 0%, #141829 100%);
  gap: 12px;
  padding: 24px;
  text-align: center;
}
.error-icon { font-size: 44px; }
.error-text { color: #f87171; font-size: 14px; font-weight: 500; }
.error-detail { color: #475569; font-size: 12px; max-width: 280px; }

/* ── Refresh indicator ── */
.refresh-bar {
  text-align: center;
  padding: 8px;
  font-size: 11px;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.refresh-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
  padding: 6px 16px;
  color: #818cf8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.refresh-btn:active {
  background: rgba(255,255,255,0.12);
}
.refresh-spinning {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Loading ── */
.dash-loading {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #0c0e1a 0%, #141829 100%);
  gap: 12px;
}
.loading-icon {
  font-size: 44px;
  animation: pulse-glow 1.8s infinite;
}
@keyframes pulse-glow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}
.loading-text {
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
}
@media (prefers-reduced-motion: reduce) {
  .overall-fill, .progress-fill, .summary-card, .delay-card, .refresh-btn { transition: none !important; }
  @keyframes spin { from, to { transform: rotate(0deg); } }
  @keyframes pulse-glow { from, to { box-shadow: none; } }
}
`;

/* ── Component ── */
export function LiffManagerDashboard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [orgId, setOrgId] = useState<string | null>(null);
    const [userName, setUserName] = useState<string>('');
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [rawInstances, setRawInstances] = useState<any[]>([]);
    const [rawTaskStat, setRawTaskStat] = useState<any[]>([]);
    const [rawActivityTasks, setRawActivityTasks] = useState<any[]>([]);
    const [rawApprovals, setRawApprovals] = useState<any[]>([]);
    const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('today');
    const [expandedInstanceId, setExpandedInstanceId] = useState<string | null>(null);
    const [focusTab, setFocusTab] = useState<'in_progress' | 'overdue'>('in_progress');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [selectedDeptId, setSelectedDeptId] = useState<string>('all');

    // LIFF initialization & employee lookup (mirrors LiffApp.tsx pattern)
    useEffect(() => {
        if (import.meta.env.DEV) {
            // Local dev: bypass LINE mapping — load first manager/admin directly
            setUserName('Test Manager');
            devBypassLookup();
        } else {
            initLiff();
        }
    }, []);

    async function devBypassLookup() {
        try {
            const { data: users, error: userErr } = await supabase
                .from('users')
                .select('id, name, organization_id, is_manager, is_line_manager')
                .or('is_manager.eq.true,is_line_manager.eq.true')
                .limit(1);
            const user = users?.[0];
            if (userErr || !user) {
                setError('找不到可用的主管/管理員帳號 (dev bypass)');
                setLoading(false);
                return;
            }
            setOrgId(user.organization_id);
            setCurrentUserId(user.id);
            if (user.name) setUserName(user.name);
            await loadData(user.organization_id, user.id);
        } catch (err) {
            console.error('devBypassLookup error:', err);
            setError('Dev bypass 失敗');
            setLoading(false);
        }
    }

    async function initLiff() {
        try {
            await liff.init({ liffId: import.meta.env.VITE_LIFF_DASHBOARD_ID || '' });
            if (liff.isLoggedIn()) {
                const profile = await liff.getProfile();
                setUserName(profile.displayName);
                await lookupEmployee(profile.userId);
            } else {
                liff.login();
            }
        } catch (err: any) {
            console.error('LIFF Init Error:', err);
            setError('LIFF 初始化失敗');
            setLoading(false);
        }
    }

    async function lookupEmployee(lineUserId: string) {
        try {
            // Resolve LINE user → employee (production uses line_users table)
            const { data: mapping, error: mapErr } = await supabase
                .from('line_users')
                .select('user_id')
                .eq('line_user_id', lineUserId)
                .maybeSingle();

            if (mapErr || !mapping || !mapping.user_id) {
                setError('您的 LINE 帳號尚未綁定員工資料，請先使用 /註冊 指令進行綁定。');
                setLoading(false);
                return;
            }

            // Get employee's org + manager status
            const { data: user, error: userErr } = await supabase
                .from('users')
                .select('id, name, organization_id, is_manager, is_line_manager')
                .eq('id', mapping.user_id)
                .maybeSingle();

            if (userErr || !user) {
                setError('無法取得員工資料');
                setLoading(false);
                return;
            }

            if (!user.is_manager && !user.is_line_manager) {
                setError('此看板僅限主管使用');
                setLoading(false);
                return;
            }

            setOrgId(user.organization_id);
            setCurrentUserId(user.id);
            if (user.name) setUserName(user.name);
            await loadData(user.organization_id, user.id);
        } catch (err) {
            console.error('lookupEmployee error:', err);
            setError('驗證身份時發生錯誤');
            setLoading(false);
        }
    }

    const loadData = useCallback(async (organizationId?: string, userId?: string) => {
        const oid = organizationId || orgId;
        const uid = userId || currentUserId;
        if (!oid) return;

        try {
            const now = new Date();

            const [instRes, taskStatRes, activityRes, deptRes] = await Promise.all([
                supabase.from('workflow_instances')
                    .select('id, name, status, started_at, tasks(id, title, status, due_date, assigned_user:users!tasks_assigned_to_fkey(name, department_id))')
                    .eq('organization_id', oid)
                    .order('started_at', { ascending: false })
                    .limit(60),
                supabase.from('tasks')
                    .select('status, due_date, users!tasks_assigned_to_fkey(department_id)')
                    .eq('organization_id', oid),
                supabase.from('tasks')
                    .select('id, title, status, priority, due_date, completed_at, updated_at, created_at, users!tasks_assigned_to_fkey(name, store_id, department_id)')
                    .eq('organization_id', oid)
                    .gte('updated_at', new Date(now.getTime() - 30 * 86400000).toISOString())
                    .order('updated_at', { ascending: false })
                    .limit(300),
                supabase.from('departments').select('id, name').eq('organization_id', oid).order('name'),
            ]);

            setRawInstances(instRes.data || []);
            setRawTaskStat(taskStatRes.data || []);
            setRawActivityTasks((activityRes.data || []) as any[]);
            setDepartments(deptRes.data || []);

            // Pending approvals
            if (uid) {
                const { data: pendingTasks } = await supabase.from('tasks')
                    .select('id, title, confirmation_status, confirmation_requested_at, assigned_user:users!tasks_assigned_to_fkey(name, department_id), workflow_instance:workflow_instances(name)')
                    .eq('organization_id', oid)
                    .eq('confirmation_required', true)
                    .eq('confirmation_status', 'pending')
                    .not('confirmation_requested_at', 'is', null);
                if (pendingTasks && pendingTasks.length > 0) {
                    const taskIds = pendingTasks.map((t: any) => t.id);
                    const { data: allConfs } = await supabase.from('task_confirmations')
                        .select('task_id, status, approver_id, approver:users!task_confirmations_approver_id_fkey(name)')
                        .in('task_id', taskIds);
                    const confMap: Record<string, { name: string; status: string }[]> = {};
                    const mineTaskIds = new Set<string>();
                    (allConfs || []).forEach((c: any) => {
                        if (!confMap[c.task_id]) confMap[c.task_id] = [];
                        confMap[c.task_id].push({ name: c.approver?.name || '—', status: c.status });
                        if (c.approver_id === uid && c.status === 'pending') mineTaskIds.add(c.task_id);
                    });
                    setRawApprovals(
                        pendingTasks.filter((t: any) => mineTaskIds.has(t.id)).map((t: any) => ({
                            id: t.id,
                            taskId: t.id,
                            taskTitle: t.title,
                            assignee: t.assigned_user?.name || '—',
                            assigneeDeptId: t.assigned_user?.department_id || null,
                            workflowName: t.workflow_instance?.name || '',
                            requestedAt: t.confirmation_requested_at ? new Date(t.confirmation_requested_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
                            approvers: confMap[t.id] || [],
                        }))
                    );
                } else {
                    setRawApprovals([]);
                }
            }

            setLastRefresh(new Date());
        } catch (err) {
            console.error('LiffManagerDashboard error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [orgId, currentUserId]);

    // Auto-refresh every 5 minutes
    useEffect(() => {
        if (!orgId) return;
        const interval = setInterval(() => loadData(), 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [orgId, loadData]);

    async function handleRefresh() {
        setRefreshing(true);
        await loadData();
    }

    // Dept filter predicate
    const matchesDept = useCallback((deptId: string | null | undefined) => {
        if (selectedDeptId === 'all') return true;
        return deptId === selectedDeptId;
    }, [selectedDeptId]);

    // Filtered instances (all statuses) — carry dept-filtered tasks
    const filteredInstances = useMemo(() => {
        return rawInstances.map(inst => {
            const tasks = (inst.tasks || []).filter((t: any) => matchesDept(t.assigned_user?.department_id));
            return { ...inst, tasks };
        }).filter(inst => selectedDeptId === 'all' || inst.tasks.length > 0);
    }, [rawInstances, selectedDeptId, matchesDept]);

    const wfStat = useMemo(() => {
        const list = filteredInstances;
        return {
            total: list.length,
            running: list.filter(i => i.status === 'running').length,
            paused: list.filter(i => i.status === 'paused').length,
            completed: list.filter(i => i.status === 'completed').length,
        };
    }, [filteredInstances]);

    const recentInstances = useMemo(() => {
        return filteredInstances.filter(i => i.status === 'running' || i.status === 'paused').slice(0, 20);
    }, [filteredInstances]);

    const taskStat = useMemo(() => {
        const now = new Date();
        const list = rawTaskStat.filter((t: any) => matchesDept(t.users?.department_id));
        return {
            total: list.length,
            pending: list.filter((t: any) => t.status === 'pending').length,
            in_progress: list.filter((t: any) => t.status === 'in_progress').length,
            completed: list.filter((t: any) => t.status === 'completed').length,
            blocked: list.filter((t: any) => t.status === 'blocked').length,
            overdue: list.filter((t: any) => t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < now).length,
        };
    }, [rawTaskStat, matchesDept]);

    const pendingApprovals = useMemo(() => {
        return rawApprovals.filter((a: any) => matchesDept(a.assigneeDeptId));
    }, [rawApprovals, matchesDept]);

    const filteredActivityTasks = useMemo(() => {
        return rawActivityTasks.filter((t: any) => matchesDept(t.users?.department_id));
    }, [rawActivityTasks, matchesDept]);

    const activity: ActivityItem[] = useMemo(() => {
        const now = new Date();
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const cutoff = activityPeriod === 'today'
            ? todayStart
            : new Date(now.getTime() - (activityPeriod === '7days' ? 7 : 30) * 86400000);
        const sameDay = activityPeriod === 'today';
        return filteredActivityTasks
            .filter(t => {
                const u = t.updated_at ? new Date(t.updated_at) : null;
                const c = t.completed_at ? new Date(t.completed_at) : null;
                const cr = new Date(t.created_at);
                return (u && u >= cutoff) || (c && c >= cutoff) || cr >= cutoff;
            })
            .map(t => {
                let type: ActivityItem['type'] = 'updated';
                let timeStr: string = t.updated_at || t.created_at;
                if (t.completed_at && new Date(t.completed_at) >= cutoff) { type = 'completed'; timeStr = t.completed_at; }
                else if (new Date(t.created_at) >= cutoff && !t.updated_at) { type = 'created'; timeStr = t.created_at; }
                else if (t.status === 'blocked') { type = 'blocked'; }
                const d = new Date(timeStr);
                const time = sameDay
                    ? d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
                    : d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) + ' ' + d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
                return { id: t.id, time, _ts: d.getTime(), title: t.title, storeName: '', type } as ActivityItem & { _ts: number };
            })
            .sort((a: any, b: any) => b._ts - a._ts)
            .slice(0, sameDay ? 10 : 30);
    }, [filteredActivityTasks, activityPeriod]);

    const { inProgressList, overdueList } = useMemo(() => {
        const now = new Date();
        const inProg = filteredActivityTasks
            .filter(t => t.status === 'in_progress')
            .sort((a: any, b: any) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
        const over = filteredActivityTasks
            .filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.due_date && new Date(t.due_date) < now)
            .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
        return { inProgressList: inProg, overdueList: over };
    }, [filteredActivityTasks]);

    if (loading) {
        return (
            <>
                <style>{css}</style>
                <div className="dash-loading">
                    <div className="loading-icon">📊</div>
                    <div className="loading-text">載入營運資料中...</div>
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
                <style>{css}</style>
                <div className="dash-error">
                    <div className="error-icon">⚠️</div>
                    <div className="error-text">{error}</div>
                    <div className="error-detail">請確認您的 LINE 帳號已綁定員工資料，且具有主管權限。</div>
                </div>
            </>
        );
    }

    const overallPct = taskStat.total > 0 ? Math.round((taskStat.completed / taskStat.total) * 100) : 0;

    const statusBadge: Record<string, { bg: string; color: string; label: string }> = {
        running: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', label: '進行中' },
        paused:  { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', label: '暫停' },
    };

    return (
        <>
            <style>{css}</style>
            <div className="liff-dash">
                {/* ── Header ── */}
                <div className="dash-header">
                    <h1 className="dash-title">📊 工作流程總覽</h1>
                    <p className="dash-subtitle">
                        {userName ? `${userName}，` : ''}流程、任務與查核清單概況
                    </p>
                    <div className="overall-bar-wrap">
                        <div className="overall-label">
                            <span>整體任務完成率</span>
                            <span className="overall-pct">{overallPct}%</span>
                        </div>
                        <div className="overall-track">
                            <div className="overall-fill" role="progressbar" style={{ width: `${overallPct}%` }} />
                        </div>
                    </div>
                </div>

                {/* ── Summary Cards (mirrors 總覽) ── */}
                <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    <div className="summary-card">
                        <div className="summary-val" style={{ color: '#60a5fa' }}>{wfStat.running}</div>
                        <div className="summary-lbl">進行中流程</div>
                        <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>{wfStat.total} 總計</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-val" style={{ color: '#22d3ee' }}>{taskStat.in_progress}</div>
                        <div className="summary-lbl">進行中任務</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-val amber">{taskStat.pending}</div>
                        <div className="summary-lbl">待處理任務</div>
                        <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>{taskStat.total} 總計</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-val red">{taskStat.overdue}</div>
                        <div className="summary-lbl">逾期任務</div>
                    </div>
                </div>

                {/* ── Refresh Bar ── */}
                <div className="refresh-bar" style={{ flexWrap: 'wrap', padding: '10px 16px' }}>
                    <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
                        <span className={refreshing ? 'refresh-spinning' : ''} style={{ display: 'inline-block' }}>🔄</span>
                        {' '}{refreshing ? '更新中…' : '重新整理'}
                    </button>
                    <select
                        value={selectedDeptId}
                        onChange={(e) => setSelectedDeptId(e.target.value)}
                        style={{
                            background: selectedDeptId === 'all' ? 'rgba(255,255,255,0.06)' : 'rgba(129,140,248,0.15)',
                            border: '1px solid',
                            borderColor: selectedDeptId === 'all' ? 'rgba(255,255,255,0.08)' : 'rgba(129,140,248,0.4)',
                            borderRadius: '20px',
                            padding: '6px 12px',
                            color: selectedDeptId === 'all' ? '#818cf8' : '#a5b4fc',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            outline: 'none',
                        }}
                    >
                        <option value="all">🏢 全部部門</option>
                        {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    {lastRefresh && (
                        <span style={{ fontSize: '10px', color: '#334155' }}>
                            {lastRefresh.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })} 更新
                        </span>
                    )}
                </div>

                {/* ── Active Workflows ── */}
                <div className="glass-section">
                    <div className="section-head">
                        <span className="section-title">🔄 進行中流程</span>
                        {recentInstances.length > 0 && <span className="section-meta">{recentInstances.length}</span>}
                    </div>
                    <div className="section-body">
                        {recentInstances.length === 0 ? (
                            <div className="empty-state">目前沒有進行中的流程</div>
                        ) : (
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {recentInstances.map(inst => {
                                    const tasks = inst.tasks || [];
                                    const now = new Date();
                                    const total = tasks.length;
                                    const completed = tasks.filter(t => t.status === 'completed').length;
                                    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
                                    const blocked = tasks.filter(t => t.status === 'blocked').length;
                                    const overdueCount = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.due_date && new Date(t.due_date) < now).length;
                                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                                    const pctColor = pct >= 80 ? '#34d399' : pct >= 40 ? '#fbbf24' : '#f87171';
                                    const badge = statusBadge[inst.status];
                                    const isOpen = expandedInstanceId === inst.id;
                                    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
                                    return (
                                        <div
                                            key={inst.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setExpandedInstanceId(isOpen ? null : inst.id)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedInstanceId(isOpen ? null : inst.id); } }}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '12px 14px',
                                                borderRadius: '12px',
                                                background: 'rgba(255,255,255,0.025)',
                                                border: '1px solid',
                                                borderColor: isOpen ? 'rgba(129,140,248,0.4)' : 'rgba(255,255,255,0.06)',
                                                boxShadow: isOpen ? '0 4px 16px rgba(79,70,229,0.15)' : '0 1px 3px rgba(0,0,0,0.2)',
                                                transition: 'border-color 0.15s, box-shadow 0.15s',
                                            }}
                                        >
                                            {/* Header row */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                                    <span style={{ fontSize: '10px', color: '#64748b', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▶</span>
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#dde2f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.name}</span>
                                                    {badge && (
                                                        <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: badge.bg, color: badge.color, flexShrink: 0 }}>
                                                            {badge.label}
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '14px', fontWeight: 700, color: pctColor, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                                            </div>
                                            {/* Progress bar (neutral grey) */}
                                            <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: '10px' }}>
                                                <div style={{ height: '100%', borderRadius: '99px', width: `${pct}%`, background: 'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.85) 100%)', boxShadow: '0 0 8px rgba(255,255,255,0.3)', transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
                                            </div>
                                            {/* Icon stats row */}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '11px', alignItems: 'center' }}>
                                                <span style={{ color: '#34d399', fontWeight: 600 }}>✅ 已完成 {completed}/{total}</span>
                                                {inProgress > 0 && <span style={{ color: '#60a5fa', fontWeight: 600 }}>🔄 更新 {inProgress}</span>}
                                                {blocked > 0 && <span style={{ color: '#fbbf24', fontWeight: 600 }}>🟠 阻塞 {blocked}</span>}
                                                {overdueCount > 0 && (
                                                    <span style={{
                                                        fontSize: '10px',
                                                        padding: '2px 8px',
                                                        borderRadius: '999px',
                                                        fontWeight: 700,
                                                        background: 'rgba(248,113,113,0.15)',
                                                        color: '#f87171',
                                                        border: '1px solid rgba(248,113,113,0.3)',
                                                        letterSpacing: '0.3px',
                                                    }}>❗ 逾期 {overdueCount}</span>
                                                )}
                                                <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#475569' }}>{new Date(inst.started_at).toLocaleDateString('zh-TW')}</span>
                                            </div>
                                            {/* Expanded: in-progress tasks */}
                                            {isOpen && (
                                                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600, marginBottom: '6px' }}>🔄 進行中任務 ({inProgressTasks.length})</div>
                                                    {inProgressTasks.length === 0 ? (
                                                        <div style={{ fontSize: '11px', color: '#475569', padding: '4px 0' }}>目前無進行中任務</div>
                                                    ) : inProgressTasks.map(t => {
                                                        const taskOverdue = t.due_date && new Date(t.due_date) < new Date();
                                                        return (
                                                            <div key={t.id} style={{ padding: '8px 10px', marginBottom: '6px', borderRadius: '8px', background: 'rgba(59,130,246,0.06)', borderLeft: '2px solid #60a5fa' }}>
                                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#dde2f0', marginBottom: '3px' }}>{t.title}</div>
                                                                <div style={{ display: 'flex', gap: '10px', fontSize: '10px', color: '#64748b' }}>
                                                                    <span>👤 {t.assigned_user?.name || '未指派'}</span>
                                                                    {t.due_date && (
                                                                        <span style={{ color: taskOverdue ? '#f87171' : '#64748b', fontWeight: taskOverdue ? 700 : 400 }}>
                                                                            📅 {new Date(t.due_date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}{taskOverdue ? ' 逾期' : ''}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Awaiting Approvals ── */}
                {pendingApprovals.length > 0 && (
                    <div className="glass-section">
                        <div className="section-head">
                            <span className="section-title">🔐 待審批任務</span>
                            <span className="count-badge red">{pendingApprovals.length}</span>
                        </div>
                        <div className="section-body">
                            {pendingApprovals.map(a => (
                                <div key={a.id} className="delay-card" style={{ borderLeftColor: '#a78bfa' }}>
                                    {a.workflowName && <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>{a.workflowName}</div>}
                                    <div className="delay-title">{a.taskTitle}</div>
                                    <div className="delay-meta">
                                        <span>負責人：{a.assignee}</span>
                                        <span>{a.requestedAt}</span>
                                    </div>
                                    {a.approvers.length > 0 && (
                                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                            <div style={{ fontSize: '10px', color: '#475569', marginBottom: '4px', fontWeight: 600 }}>審批人</div>
                                            {a.approvers.map((ap, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '2px 0' }}>
                                                    <span style={{ color: '#cbd5e1' }}>{ap.name}</span>
                                                    <span style={{
                                                        fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600,
                                                        background: ap.status === 'approved' ? 'rgba(34,197,94,0.15)' : ap.status === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                        color: ap.status === 'approved' ? '#34d399' : ap.status === 'rejected' ? '#f87171' : '#fbbf24',
                                                    }}>
                                                        {ap.status === 'approved' ? '已核准' : ap.status === 'rejected' ? '已拒絕' : '待回覆'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── In-Progress / Overdue Tabs ── */}
                {(inProgressList.length > 0 || overdueList.length > 0) && (() => {
                    const activeList: any[] = focusTab === 'in_progress' ? inProgressList : overdueList;
                    const accent = focusTab === 'in_progress' ? '#60a5fa' : '#f87171';
                    const bgTint = focusTab === 'in_progress' ? 'rgba(59,130,246,0.06)' : 'rgba(248,113,113,0.06)';
                    const mkTabStyle = (active: boolean, color: string, tintA: string, tintB: string): React.CSSProperties => ({
                        flex: 1,
                        padding: '10px 12px',
                        fontSize: '12px',
                        fontWeight: 700,
                        borderRadius: '999px',
                        border: '1px solid',
                        borderColor: active ? tintB : 'rgba(255,255,255,0.06)',
                        background: active ? tintA : 'rgba(255,255,255,0.02)',
                        color: active ? color : '#64748b',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        letterSpacing: '0.3px',
                    });
                    return (
                        <div className="glass-section">
                            <div style={{ display: 'flex', gap: '8px', padding: '14px 18px 4px' }}>
                                <button
                                    type="button"
                                    onClick={() => setFocusTab('in_progress')}
                                    style={mkTabStyle(focusTab === 'in_progress', '#60a5fa', 'rgba(96,165,250,0.15)', 'rgba(96,165,250,0.4)')}
                                >
                                    🔄 進行任務 <span style={{ opacity: 0.75, marginLeft: '4px' }}>{inProgressList.length}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFocusTab('overdue')}
                                    style={mkTabStyle(focusTab === 'overdue', '#f87171', 'rgba(248,113,113,0.15)', 'rgba(248,113,113,0.4)')}
                                >
                                    ❗ 逾期任務 <span style={{ opacity: 0.75, marginLeft: '4px' }}>{overdueList.length}</span>
                                </button>
                            </div>
                            <div className="section-body">
                                {activeList.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '20px 8px' }}>
                                        {focusTab === 'in_progress' ? '目前無進行中任務' : '✓ 沒有逾期任務'}
                                    </div>
                                ) : activeList.slice(0, 15).map((t: any) => {
                                    const isOverdueTab = focusTab === 'overdue';
                                    const overdueDays = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'cancelled'
                                        ? Math.max(0, Math.ceil((Date.now() - new Date(t.due_date).getTime()) / 86400000))
                                        : null;
                                    return (
                                        <div key={t.id} style={{ padding: '8px 10px', marginBottom: '6px', borderRadius: '8px', background: bgTint, borderLeft: `2px solid ${accent}` }}>
                                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#dde2f0', marginBottom: '3px' }}>{t.title}</div>
                                            <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#64748b', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <span>👤 {t.users?.name || '未指派'}</span>
                                                {isOverdueTab ? (
                                                    overdueDays !== null && <span style={{ color: '#f87171', fontWeight: 700 }}>📅 逾期 {overdueDays} 天</span>
                                                ) : (
                                                    <>
                                                        {t.due_date && (
                                                            <span>📅 {new Date(t.due_date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                                                        )}
                                                        {overdueDays !== null && (
                                                            <span style={{
                                                                fontSize: '9px',
                                                                padding: '1px 7px',
                                                                borderRadius: '999px',
                                                                fontWeight: 700,
                                                                background: 'rgba(248,113,113,0.15)',
                                                                color: '#f87171',
                                                                border: '1px solid rgba(248,113,113,0.3)',
                                                                letterSpacing: '0.3px',
                                                            }}>❗ 逾期 {overdueDays}天</span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

                {/* ── Activity ── */}
                <ActivityTimeline activity={activity} period={activityPeriod} onPeriodChange={setActivityPeriod} />

                {/* Safe area */}
                <div style={{ height: '40px' }} />
            </div>
        </>
    );
}
