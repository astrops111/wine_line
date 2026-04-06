import { useState, useEffect, useCallback } from 'react';
import liff from '@line/liff';
import { supabase } from '../lib/supabase';
import { StoreProgressSection, type StoreProgress } from '../components/LiffManager/StoreProgressSection';
import { DelayedTasksSection, type DelayedTask } from '../components/LiffManager/DelayedTasksSection';
import { ActivityTimeline, type ActivityItem } from '../components/LiffManager/ActivityTimeline';

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
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%);
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
    const [stats, setStats] = useState({ completed: 0, pending: 0, delayed: 0, approvals: 0, total: 0 });
    const [storeProgress, setStoreProgress] = useState<StoreProgress[]>([]);
    const [delayedTasks, setDelayedTasks] = useState<DelayedTask[]>([]);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [pendingApprovals, setPendingApprovals] = useState<{ id: string; taskTitle: string; requester: string; requestedAt: string; taskId: string; shortId: string }[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // LIFF initialization & employee lookup (mirrors LiffApp.tsx pattern)
    useEffect(() => {
        if (import.meta.env.DEV) {
            // Local dev: mock LINE user and look up employee
            const mockLineId = 'U_MOCK_LINE_ID';
            setUserName('Test Manager');
            lookupEmployee(mockLineId);
        } else {
            initLiff();
        }
    }, []);

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
            // Resolve LINE user → employee
            const { data: mapping, error: mapErr } = await supabase
                .from('line_employee_mapping')
                .select('user_id')
                .eq('line_user_id', lineUserId)
                .single();

            if (mapErr || !mapping) {
                setError('您的 LINE 帳號尚未綁定員工資料');
                setLoading(false);
                return;
            }

            // Get employee's org + manager status
            const { data: user, error: userErr } = await supabase
                .from('users')
                .select('id, name, organization_id, is_manager, is_line_manager, role')
                .eq('id', mapping.user_id)
                .single();

            if (userErr || !user) {
                setError('無法取得員工資料');
                setLoading(false);
                return;
            }

            if (!user.is_manager && !user.is_line_manager && user.role !== 'admin') {
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
            // Build task query with org filter
            let taskQuery = supabase.from('tasks')
                .select('id, title, status, priority, due_date, completed_at, created_at, updated_at, organization_id, users!tasks_assigned_to_fkey(id, name, store_id)')
                .eq('organization_id', oid)
                .order('sort_order', { ascending: true });

            // Build store query with org filter; store_type may not exist, so catch error
            let storeQuery = supabase.from('stores')
                .select('id, name, store_code, store_type')
                .eq('organization_id', oid)
                .eq('is_active', true);

            const [taskRes, storeRes] = await Promise.all([taskQuery, storeQuery]);

            // Filter out HQ stores client-side (safe if store_type column doesn't exist)
            const allStores: any[] = (storeRes.data || []).filter(
                (s: any) => !s.store_type || s.store_type !== 'headquarters'
            );
            const tasks: any[] = (taskRes.data || []).map((t: any) => ({ ...t, assigned_user: t.users }));
            const now = new Date();

            // Summary
            const completed = tasks.filter(t => t.status === 'completed').length;
            const pendingCount = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
            const delayedCount = tasks.filter(t => {
                if (t.status === 'completed' || t.status === 'cancelled') return false;
                return t.status === 'blocked' || (t.due_date && new Date(t.due_date) < now);
            }).length;
            // Pending approvals for this manager
            let approvalCount = 0;
            if (uid) {
                const { data: approvals } = await supabase.from('task_confirmations')
                    .select('id, task_id, created_at, tasks!inner(title, assigned_to, users!tasks_assigned_to_fkey(name))')
                    .eq('approver_id', uid)
                    .eq('status', 'pending');
                const items = (approvals || []).map((a: any) => ({
                    id: a.id,
                    taskId: a.task_id,
                    shortId: (a.task_id as string).slice(0, 8),
                    taskTitle: a.tasks?.title || '—',
                    requester: a.tasks?.users?.name || '未知',
                    requestedAt: a.created_at ? new Date(a.created_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
                }));
                setPendingApprovals(items);
                approvalCount = items.length;
            }

            setStats({ completed, pending: pendingCount, delayed: delayedCount, approvals: approvalCount, total: tasks.length });

            // Store progress
            const map = new Map<string, StoreProgress>();
            allStores.forEach(s => map.set(s.id, { name: s.name, total: 0, completed: 0, percent: 0, blocked: 0, inProgress: 0, pending: 0 }));
            const unassigned: StoreProgress = { name: '未分配門市', total: 0, completed: 0, percent: 0, blocked: 0, inProgress: 0, pending: 0 };
            tasks.forEach(t => {
                const sid = t.assigned_user?.store_id;
                const b = sid && map.has(sid) ? map.get(sid)! : unassigned;
                b.total++;
                if (t.status === 'completed') b.completed++;
                else if (t.status === 'in_progress') b.inProgress++;
                else if (t.status === 'blocked') b.blocked++;
                else b.pending++;
            });
            const arr: StoreProgress[] = [];
            map.forEach(sp => { if (sp.total > 0) { sp.percent = Math.round((sp.completed / sp.total) * 100); arr.push(sp); } });
            if (unassigned.total > 0) { unassigned.percent = Math.round((unassigned.completed / unassigned.total) * 100); arr.push(unassigned); }
            arr.sort((a, b) => b.percent - a.percent);
            setStoreProgress(arr);

            // Delayed
            setDelayedTasks(
                tasks
                    .filter(t => {
                        if (t.status === 'completed' || t.status === 'cancelled') return false;
                        return t.status === 'blocked' || (t.due_date && new Date(t.due_date) < now);
                    })
                    .map(t => ({
                        id: t.id, title: t.title,
                        storeName: t.assigned_user?.store_id ? (allStores.find((s: any) => s.id === t.assigned_user?.store_id)?.name || '—') : '未分配',
                        assignee: t.assigned_user?.name || '未指派',
                        priority: t.priority,
                        daysOverdue: t.due_date ? Math.max(0, Math.ceil((now.getTime() - new Date(t.due_date).getTime()) / 86400000)) : 0,
                    }))
                    .sort((a, b) => (a.priority === 'urgent' ? -1 : 0) - (b.priority === 'urgent' ? -1 : 0) || b.daysOverdue - a.daysOverdue)
            );

            // Activity
            const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
            setActivity(
                tasks
                    .filter(t => {
                        const u = t.updated_at ? new Date(t.updated_at) : null;
                        const c = t.completed_at ? new Date(t.completed_at) : null;
                        return (u && u >= todayStart) || (c && c >= todayStart) || new Date(t.created_at) >= todayStart;
                    })
                    .map(t => {
                        let type: ActivityItem['type'] = 'updated';
                        let timeStr = t.updated_at || t.created_at;
                        if (t.completed_at && new Date(t.completed_at) >= todayStart) { type = 'completed'; timeStr = t.completed_at; }
                        else if (new Date(t.created_at) >= todayStart && !t.updated_at) { type = 'created'; timeStr = t.created_at; }
                        else if (t.status === 'blocked') { type = 'blocked'; }
                        const sName = t.assigned_user?.store_id ? (allStores.find((s: any) => s.id === t.assigned_user?.store_id)?.name || '') : '';
                        return { id: t.id, time: new Date(timeStr).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }), title: t.title, storeName: sName, type };
                    })
                    .sort((a, b) => b.time.localeCompare(a.time))
                    .slice(0, 10)
            );

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

    const overallPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    return (
        <>
            <style>{css}</style>
            <div className="liff-dash">
                {/* ── Header ── */}
                <div className="dash-header">
                    <h1 className="dash-title">門市營運管理看板</h1>
                    <p className="dash-subtitle">
                        {userName ? `${userName}，` : ''}掌握所有門市任務進度
                    </p>
                    <div className="overall-bar-wrap">
                        <div className="overall-label">
                            <span>整體營運進度</span>
                            <span className="overall-pct">{overallPct}%</span>
                        </div>
                        <div className="overall-track">
                            <div className="overall-fill" role="progressbar" style={{ width: `${overallPct}%` }} />
                        </div>
                    </div>
                </div>

                {/* ── Summary Cards ── */}
                <div className="summary-grid" style={stats.approvals > 0 ? { gridTemplateColumns: 'repeat(4, 1fr)' } : undefined}>
                    <div className="summary-card">
                        <div className="summary-val green">{stats.completed}</div>
                        <div className="summary-lbl">已完成</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-val amber">{stats.pending}</div>
                        <div className="summary-lbl">待完成</div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-val red">{stats.delayed}</div>
                        <div className="summary-lbl">延遲</div>
                    </div>
                    {stats.approvals > 0 && (
                        <div className="summary-card">
                            <div className="summary-val" style={{ color: '#a78bfa' }}>{stats.approvals}</div>
                            <div className="summary-lbl">待審批</div>
                        </div>
                    )}
                </div>

                {/* ── Refresh Bar ── */}
                <div className="refresh-bar">
                    <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
                        <span className={refreshing ? 'refresh-spinning' : ''} style={{ display: 'inline-block' }}>🔄</span>
                        {' '}{refreshing ? '更新中…' : '重新整理'}
                    </button>
                    {lastRefresh && (
                        <span style={{ fontSize: '10px', color: '#334155' }}>
                            {lastRefresh.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })} 更新
                        </span>
                    )}
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
                                    <div className="delay-title">{a.taskTitle}</div>
                                    <div className="delay-meta">
                                        <span>申請人：{a.requester}</span>
                                        <span>{a.requestedAt}</span>
                                        <span style={{ color: '#a78bfa', fontWeight: 700 }}>#{a.shortId}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Store Progress ── */}
                <StoreProgressSection storeProgress={storeProgress} />

                {/* ── Delayed Tasks ── */}
                <DelayedTasksSection delayedTasks={delayedTasks} />

                {/* ── Today's Updates ── */}
                <ActivityTimeline activity={activity} />

                {/* Safe area */}
                <div style={{ height: '40px' }} />
            </div>
        </>
    );
}
