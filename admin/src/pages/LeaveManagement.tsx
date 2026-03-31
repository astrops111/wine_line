import { useEffect, useState } from 'react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { getLocale } from '../lib/i18n'
import { useOrg } from '../lib/OrgContext'
import { thisMonthRange } from '../lib/leaveCalculations'
import type { Store, User, LeaveRequest, LeaveBalance, BalanceRow, TabType } from '../types/leave'
import { getLeaveTypeLabels, getLeaveStatusLabels } from '../types/leave'
import { PendingTab } from '../components/Leave/PendingTab'
import { AllRequestsTab } from '../components/Leave/AllRequestsTab'
import { BalancesTab } from '../components/Leave/BalancesTab'
import { CalendarTab } from '../components/Leave/CalendarTab'

// ─── Component ────────────────────────────────────────────────────────────────

export function LeaveManagement() {
    const zh = getLocale() === 'zh-TW'
    const { orgId } = useOrg()

    const leaveTypeLabel = getLeaveTypeLabels(zh)
    const leaveStatusLabel = getLeaveStatusLabels(zh)

    // ── Tab state ──
    const [tab, setTab] = useState<TabType>('pending')

    // ── Calendar state ──
    const [calMonth, setCalMonth] = useState(new Date().getMonth())
    const [calYear, setCalYear] = useState(new Date().getFullYear())

    // ── Shared data ──
    const [stores, setStores] = useState<Store[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [loadingShared, setLoadingShared] = useState(true)

    // ── Tab 1: Pending ──
    const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([])
    const [loadingPending, setLoadingPending] = useState(false)
    const [approvedThisMonth, setApprovedThisMonth] = useState(0)
    const [rejectedThisMonth, setRejectedThisMonth] = useState(0)

    // ── Tab 2: All Requests ──
    const [allRequests, setAllRequests] = useState<LeaveRequest[]>([])
    const [loadingAll, setLoadingAll] = useState(false)

    // ── Tab 3: Leave Balances ──
    const [balanceYear, setBalanceYear] = useState(new Date().getFullYear())
    const [balanceStoreFilter, setBalanceStoreFilter] = useState<string>('all')
    const [balanceRows, setBalanceRows] = useState<BalanceRow[]>([])
    const [loadingBalances, setLoadingBalances] = useState(false)

    // ── LINE HR Notify helper ──
    const notifyEmployee = async (userId: string, type: string, details: object) => {
        if (!FUNCTIONS_URL) return
        try {
            await fetch(`${FUNCTIONS_URL}/hr-notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '' },
                body: JSON.stringify({ user_id: userId, type, details }),
            })
        } catch (err) {
            console.warn('HR notify failed (non-critical):', err)
        }
    }

    // ── Load shared data ──
    useEffect(() => {
        if (!orgId) return
        const load = async () => {
            setLoadingShared(true)
            const [storeRes, userRes] = await Promise.all([
                supabase.from('stores').select('id, name').order('name'),
                supabase
                    .from('users')
                    .select('id, name, email, status, store_id, hire_date, employee_type, store:stores(name)')
                    .eq('organization_id', orgId)
                    .order('name'),
            ])
            setStores(storeRes.data || [])
            setUsers(userRes.data || [])
            setLoadingShared(false)
        }
        load()
    }, [orgId])

    // ── Load data when tab changes ──
    useEffect(() => {
        if (!orgId) return
        if (tab === 'pending') loadPending()
        if (tab === 'all') loadAll()
        if (tab === 'balances') loadBalances()
    }, [tab, orgId])

    // ── Reload balances when year/store filter changes ──
    useEffect(() => {
        if (tab === 'balances' && orgId) loadBalances()
    }, [balanceYear, balanceStoreFilter])

    // ─── Tab 1: Load pending ──────────────────────────────────────────────────

    async function loadPending() {
        setLoadingPending(true)
        const { data } = await supabase
            .from('leave_requests')
            .select('*, user:users(name, store_id, store:stores(name))')
            .eq('organization_id', orgId)
            .eq('status', 'pending')
            .order('created_at')
        setPendingRequests(data || [])

        // Stats: approved/rejected this month
        const { start, end } = thisMonthRange()
        const { data: monthData } = await supabase
            .from('leave_requests')
            .select('status')
            .eq('organization_id', orgId)
            .in('status', ['approved', 'rejected'])
            .gte('approved_at', start)
            .lte('approved_at', end + 'T23:59:59Z')
        const approved = (monthData || []).filter((r: any) => r.status === 'approved').length
        const rejected = (monthData || []).filter((r: any) => r.status === 'rejected').length
        setApprovedThisMonth(approved)
        setRejectedThisMonth(rejected)
        setLoadingPending(false)
    }

    async function approveLeave(req: LeaveRequest) {
        const year = new Date(req.start_date).getFullYear()
        const { data: existing } = await supabase
            .from('leave_balances')
            .select('used_days')
            .eq('user_id', req.user_id)
            .eq('year', year)
            .eq('leave_type', req.leave_type)
            .single()

        const currentUsed = existing?.used_days ?? 0
        const addDays = req.total_days || 1

        if (existing) {
            await supabase
                .from('leave_balances')
                .update({ used_days: currentUsed + addDays })
                .eq('user_id', req.user_id)
                .eq('year', year)
                .eq('leave_type', req.leave_type)
        } else {
            await supabase.from('leave_balances').insert({
                user_id: req.user_id,
                organization_id: orgId,
                year,
                leave_type: req.leave_type,
                total_days: 0,
                used_days: addDays,
                carry_over_days: 0,
                expires_at: null,
            })
        }

        await supabase
            .from('leave_requests')
            .update({ status: 'approved', approved_at: new Date().toISOString() })
            .eq('id', req.id)

        await notifyEmployee(req.user_id, 'leave_approved', {
            leave_type: req.leave_type,
            start_date: req.start_date,
            end_date: req.end_date,
            total_days: req.total_days || 1,
        })

        setPendingRequests(prev => prev.filter(r => r.id !== req.id))
        setApprovedThisMonth(prev => prev + 1)
    }

    async function rejectLeave(id: string, reason: string) {
        const rejectedReq = pendingRequests.find(r => r.id === id)
        await supabase
            .from('leave_requests')
            .update({
                status: 'rejected',
                approved_at: new Date().toISOString(),
                rejection_reason: reason || null,
            })
            .eq('id', id)

        if (rejectedReq) {
            await notifyEmployee(rejectedReq.user_id, 'leave_rejected', {
                leave_type: rejectedReq.leave_type,
                start_date: rejectedReq.start_date,
                end_date: rejectedReq.end_date,
                total_days: rejectedReq.total_days || 1,
                rejection_reason: reason || undefined,
            })
        }

        setPendingRequests(prev => prev.filter(r => r.id !== id))
        setRejectedThisMonth(prev => prev + 1)
    }

    // ─── Tab 2: Load all requests ─────────────────────────────────────────────

    async function loadAll() {
        setLoadingAll(true)
        const { data } = await supabase
            .from('leave_requests')
            .select('*, user:users(name, store:stores(name))')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
        setAllRequests(data || [])
        setLoadingAll(false)
    }

    // ─── Tab 3: Load balances ─────────────────────────────────────────────────

    async function loadBalances() {
        setLoadingBalances(true)
        let q = supabase
            .from('users')
            .select('id, name, email, status, store_id, hire_date, employee_type, store:stores(name)')
            .eq('organization_id', orgId)
            .eq('status', 'active')
            .order('name')

        if (balanceStoreFilter !== 'all') {
            q = q.eq('store_id', balanceStoreFilter)
        }

        const { data: activeUsers } = await q
        if (!activeUsers) { setLoadingBalances(false); return }

        const userIds = activeUsers.map((u: any) => u.id)
        const { data: balData } = userIds.length > 0
            ? await supabase
                .from('leave_balances')
                .select('*')
                .in('user_id', userIds)
                .eq('year', balanceYear)
            : { data: [] }

        const balMap: Record<string, Record<string, LeaveBalance>> = {}
        ;(balData || []).forEach((b: LeaveBalance) => {
            if (!balMap[b.user_id]) balMap[b.user_id] = {}
            balMap[b.user_id][b.leave_type] = b
        })

        const rows: BalanceRow[] = (activeUsers as User[]).map(u => ({
            user: u,
            balances: balMap[u.id] || {},
            expanded: false,
            editType: 'annual',
            editTotal: '',
            editCarry: '',
        }))

        setBalanceRows(rows)
        setLoadingBalances(false)
    }

    // ─── Derived values ──────────────────────────────────────────────────────

    const pendingCount = pendingRequests.length

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="fade-in">
            {/* Page Header */}
            <div className="page-header">
                <h1>🌴 {zh ? '請假管理' : 'Leave Management'}</h1>
                <p className="page-subtitle">
                    {zh ? '請假申請審核、假期餘額管理' : 'Leave request approvals and balance management'}
                </p>
            </div>

            {/* Tab Bar */}
            <div className="tab-bar" style={{ marginBottom: '20px' }}>
                {(['pending', 'all', 'balances', 'calendar'] as const).map(t => (
                    <button
                        key={t}
                        className={`tab-item ${tab === t ? 'active' : ''}`}
                        onClick={() => setTab(t)}
                    >
                        {t === 'pending'
                            ? zh
                                ? `審核佇列${pendingCount > 0 ? ` (${pendingCount})` : ''}`
                                : `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}`
                            : t === 'all'
                            ? zh ? '所有申請' : 'All Requests'
                            : t === 'balances'
                            ? zh ? '假期餘額' : 'Leave Balances'
                            : zh ? '📅 請假日曆' : '📅 Calendar'}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {tab === 'pending' && (
                <PendingTab
                    zh={zh}
                    pendingRequests={pendingRequests}
                    loadingPending={loadingPending}
                    approvedThisMonth={approvedThisMonth}
                    rejectedThisMonth={rejectedThisMonth}
                    leaveTypeLabel={leaveTypeLabel}
                    onApprove={approveLeave}
                    onReject={rejectLeave}
                />
            )}

            {tab === 'all' && (
                <AllRequestsTab
                    zh={zh}
                    orgId={orgId}
                    stores={stores}
                    users={users}
                    allRequests={allRequests}
                    loadingAll={loadingAll}
                    leaveTypeLabel={leaveTypeLabel}
                    leaveStatusLabel={leaveStatusLabel}
                    onRequestCreated={loadAll}
                    onRefreshPending={loadPending}
                />
            )}

            {tab === 'balances' && (
                <BalancesTab
                    zh={zh}
                    orgId={orgId}
                    stores={stores}
                    users={users}
                    balanceYear={balanceYear}
                    setBalanceYear={setBalanceYear}
                    balanceStoreFilter={balanceStoreFilter}
                    setBalanceStoreFilter={setBalanceStoreFilter}
                    balanceRows={balanceRows}
                    setBalanceRows={setBalanceRows}
                    loadingBalances={loadingBalances}
                    leaveTypeLabel={leaveTypeLabel}
                    onReloadBalances={loadBalances}
                />
            )}

            {tab === 'calendar' && (
                <CalendarTab
                    zh={zh}
                    calMonth={calMonth}
                    calYear={calYear}
                    setCalMonth={setCalMonth}
                    setCalYear={setCalYear}
                    allRequests={allRequests}
                />
            )}
        </div>
    )
}
