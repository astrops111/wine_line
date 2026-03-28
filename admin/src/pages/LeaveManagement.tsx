import { useEffect, useState } from 'react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { getLocale } from '../lib/i18n'
import { useOrg } from '../lib/OrgContext'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Store {
    id: string
    name: string
}

interface User {
    id: string
    name: string
    email: string | null
    status: string
    store_id: string | null
    hire_date: string | null
    employee_type: string
    store?: { name: string } | null
}

interface LeaveRequest {
    id: string
    user_id: string
    store_id: string | null
    organization_id: string
    start_date: string
    end_date: string
    leave_type: string
    reason: string | null
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'
    total_days: number
    is_paid: boolean
    approved_at: string | null
    created_at?: string
    rejection_reason?: string | null
    user?: {
        name: string
        store_id: string | null
        store?: { name: string } | null
    } | null
}

interface LeaveBalance {
    id?: string
    organization_id: string
    user_id: string
    year: number
    leave_type: string
    total_days: number
    used_days: number
    carry_over_days: number
    expires_at: string | null
}

interface BalanceRow {
    user: User
    balances: Record<string, LeaveBalance>
    expanded: boolean
    editType: string
    editTotal: string
    editCarry: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEAVE_TYPE_COLORS: Record<string, string> = {
    annual: '#22c55e',
    sick: '#f59e0b',
    personal: '#3b82f6',
    bereavement: '#8b5cf6',
    marriage: '#ec4899',
    maternity: '#f43f5e',
    paternity: '#0ea5e9',
    unpaid: '#6b7280',
}

const LEAVE_STATUS_COLORS: Record<string, string> = {
    pending: '#f59e0b',
    approved: '#22c55e',
    rejected: '#f43f5e',
    cancelled: '#6b7280',
}

const PAID_TYPES = ['annual', 'sick', 'personal', 'bereavement', 'marriage', 'maternity', 'paternity']

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calcAnnualLeave(hireDateStr: string): number {
    const hire = new Date(hireDateStr)
    const now = new Date()
    const months =
        (now.getFullYear() - hire.getFullYear()) * 12 +
        (now.getMonth() - hire.getMonth())
    const years = months / 12
    if (months < 6) return 0
    if (months < 12) return 3
    if (years < 2) return 7
    if (years < 3) return 10
    if (years < 5) return 14
    if (years < 10) return 15
    return Math.min(30, 15 + Math.floor(years - 10))
}

function calcDays(start: string, end: string): number {
    if (!start || !end) return 0
    const s = new Date(start)
    const e = new Date(end)
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return diff > 0 ? diff : 0
}

function formatDate(dateStr: string): string {
    if (!dateStr) return ''
    return dateStr.slice(0, 10)
}

function thisMonthRange(): { start: string; end: string } {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
    }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LeaveManagement() {
    const zh = getLocale() === 'zh-TW'
    const { orgId } = useOrg()

    // ── Tab state ──
    type TabType = 'pending' | 'all' | 'balances'
    const [tab, setTab] = useState<TabType>('pending')

    // ── Shared data ──
    const [stores, setStores] = useState<Store[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [loadingShared, setLoadingShared] = useState(true)

    // ── Tab 1: Pending ──
    const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([])
    const [loadingPending, setLoadingPending] = useState(false)
    const [rejectingId, setRejectingId] = useState<string | null>(null)
    const [rejectionInput, setRejectionInput] = useState('')
    const [approvedThisMonth, setApprovedThisMonth] = useState(0)
    const [rejectedThisMonth, setRejectedThisMonth] = useState(0)

    // ── Tab 2: All Requests ──
    const [allRequests, setAllRequests] = useState<LeaveRequest[]>([])
    const [loadingAll, setLoadingAll] = useState(false)
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [filterStore, setFilterStore] = useState<string>('all')
    const [filterUser, setFilterUser] = useState<string>('all')
    const [filterDateFrom, setFilterDateFrom] = useState('')
    const [filterDateTo, setFilterDateTo] = useState('')
    const [showNewModal, setShowNewModal] = useState(false)
    const [newForm, setNewForm] = useState({
        user_id: '',
        leave_type: 'annual',
        start_date: '',
        end_date: '',
        reason: '',
    })
    const [newFormBalance, setNewFormBalance] = useState<LeaveBalance | null>(null)
    const [loadingBalance, setLoadingBalance] = useState(false)
    const [submittingNew, setSubmittingNew] = useState(false)

    // ── Tab 3: Leave Balances ──
    const [balanceYear, setBalanceYear] = useState(new Date().getFullYear())
    const [balanceStoreFilter, setBalanceStoreFilter] = useState<string>('all')
    const [balanceRows, setBalanceRows] = useState<BalanceRow[]>([])
    const [loadingBalances, setLoadingBalances] = useState(false)
    const [recalcPreview, setRecalcPreview] = useState<{ user: User; days: number }[] | null>(null)
    const [showRecalcDialog, setShowRecalcDialog] = useState(false)
    const [savingBalance, setSavingBalance] = useState<string | null>(null)

    // ── LINE HR Notify helper ──
    const notifyEmployee = async (userId: string, type: string, details: object) => {
        if (!FUNCTIONS_URL) return; // skip in dev without env
        try {
            await fetch(`${FUNCTIONS_URL}/hr-notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '' },
                body: JSON.stringify({ user_id: userId, type, details }),
            });
        } catch (err) {
            console.warn('HR notify failed (non-critical):', err);
        }
    };

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
        });

        setPendingRequests(prev => prev.filter(r => r.id !== req.id))
        setApprovedThisMonth(prev => prev + 1)
    }

    function startReject(id: string) {
        setRejectingId(id)
        setRejectionInput('')
    }

    async function confirmReject(id: string) {
        const rejectedReq = pendingRequests.find(r => r.id === id)
        await supabase
            .from('leave_requests')
            .update({
                status: 'rejected',
                approved_at: new Date().toISOString(),
                rejection_reason: rejectionInput.trim() || null,
            })
            .eq('id', id)

        if (rejectedReq) {
            await notifyEmployee(rejectedReq.user_id, 'leave_rejected', {
                leave_type: rejectedReq.leave_type,
                start_date: rejectedReq.start_date,
                end_date: rejectedReq.end_date,
                total_days: rejectedReq.total_days || 1,
                rejection_reason: rejectionInput.trim() || undefined,
            });
        }

        setRejectingId(null)
        setRejectionInput('')
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

    const filteredRequests = allRequests.filter(req => {
        if (filterStatus !== 'all' && req.status !== filterStatus) return false
        if (filterStore !== 'all' && req.store_id !== filterStore) return false
        if (filterUser !== 'all' && req.user_id !== filterUser) return false
        if (filterDateFrom && req.start_date < filterDateFrom) return false
        if (filterDateTo && req.end_date > filterDateTo) return false
        return true
    })

    // Load balance preview when employee + leave type selected in modal
    useEffect(() => {
        if (!newForm.user_id || !newForm.leave_type || !orgId) {
            setNewFormBalance(null)
            return
        }
        const year = new Date().getFullYear()
        const fetch = async () => {
            setLoadingBalance(true)
            const { data } = await supabase
                .from('leave_balances')
                .select('*')
                .eq('user_id', newForm.user_id)
                .eq('year', year)
                .eq('leave_type', newForm.leave_type)
                .single()
            setNewFormBalance(data || null)
            setLoadingBalance(false)
        }
        fetch()
    }, [newForm.user_id, newForm.leave_type, orgId])

    async function submitNewRequest() {
        if (!newForm.user_id || !newForm.start_date || !newForm.end_date) return
        setSubmittingNew(true)
        const selectedUser = users.find(u => u.id === newForm.user_id)
        const totalDays = calcDays(newForm.start_date, newForm.end_date)
        const isPaid = PAID_TYPES.includes(newForm.leave_type)

        await supabase.from('leave_requests').insert({
            user_id: newForm.user_id,
            store_id: selectedUser?.store_id || null,
            organization_id: orgId,
            start_date: newForm.start_date,
            end_date: newForm.end_date,
            leave_type: newForm.leave_type,
            reason: newForm.reason.trim() || null,
            status: 'pending',
            total_days: totalDays,
            is_paid: isPaid,
        })

        setNewForm({ user_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })
        setShowNewModal(false)
        setSubmittingNew(false)
        await loadAll()
        // Refresh pending count if on that tab
        loadPending()
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

    function getRemainingDays(bal: LeaveBalance | undefined): number {
        if (!bal) return 0
        return (bal.total_days || 0) + (bal.carry_over_days || 0) - (bal.used_days || 0)
    }

    function toggleRowExpand(userId: string) {
        setBalanceRows(prev =>
            prev.map(r =>
                r.user.id === userId
                    ? { ...r, expanded: !r.expanded, editType: 'annual', editTotal: '', editCarry: '' }
                    : r
            )
        )
    }

    function setRowEdit(userId: string, field: 'editType' | 'editTotal' | 'editCarry', value: string) {
        setBalanceRows(prev =>
            prev.map(r => (r.user.id === userId ? { ...r, [field]: value } : r))
        )
    }

    async function saveBalance(row: BalanceRow) {
        setSavingBalance(row.user.id)
        const existing = row.balances[row.editType]
        const totalDays = parseFloat(row.editTotal) || existing?.total_days || 0
        const carryOver = parseFloat(row.editCarry) || existing?.carry_over_days || 0
        const usedDays = existing?.used_days || 0

        if (existing) {
            await supabase
                .from('leave_balances')
                .update({ total_days: totalDays, carry_over_days: carryOver })
                .eq('user_id', row.user.id)
                .eq('year', balanceYear)
                .eq('leave_type', row.editType)
        } else {
            await supabase.from('leave_balances').insert({
                user_id: row.user.id,
                organization_id: orgId,
                year: balanceYear,
                leave_type: row.editType,
                total_days: totalDays,
                used_days: usedDays,
                carry_over_days: carryOver,
                expires_at: null,
            })
        }

        setSavingBalance(null)
        await loadBalances()
    }

    async function buildRecalcPreview() {
        const activeWithHire = users.filter(u => u.status === 'active' && u.hire_date)
        const preview = activeWithHire.map(u => ({
            user: u,
            days: calcAnnualLeave(u.hire_date!),
        }))
        setRecalcPreview(preview)
        setShowRecalcDialog(true)
    }

    async function confirmRecalc() {
        if (!recalcPreview) return
        for (const item of recalcPreview) {
            if (item.days === 0) continue
            const { data: existing } = await supabase
                .from('leave_balances')
                .select('used_days')
                .eq('user_id', item.user.id)
                .eq('year', balanceYear)
                .eq('leave_type', 'annual')
                .single()

            if (existing) {
                await supabase
                    .from('leave_balances')
                    .update({ total_days: item.days })
                    .eq('user_id', item.user.id)
                    .eq('year', balanceYear)
                    .eq('leave_type', 'annual')
            } else {
                await supabase.from('leave_balances').insert({
                    user_id: item.user.id,
                    organization_id: orgId,
                    year: balanceYear,
                    leave_type: 'annual',
                    total_days: item.days,
                    used_days: 0,
                    carry_over_days: 0,
                    expires_at: null,
                })
            }
        }
        setShowRecalcDialog(false)
        setRecalcPreview(null)
        await loadBalances()
    }

    // ─── Leave type labels ────────────────────────────────────────────────────

    const leaveTypeLabel: Record<string, string> = {
        annual: zh ? '特休' : 'Annual',
        sick: zh ? '病假' : 'Sick',
        personal: zh ? '事假' : 'Personal',
        bereavement: zh ? '喪假' : 'Bereavement',
        marriage: zh ? '婚假' : 'Marriage',
        maternity: zh ? '產假' : 'Maternity',
        paternity: zh ? '陪產假' : 'Paternity',
        unpaid: zh ? '無薪假' : 'Unpaid',
    }

    const leaveStatusLabel: Record<string, string> = {
        pending: zh ? '待審核' : 'Pending',
        approved: zh ? '已批准' : 'Approved',
        rejected: zh ? '已拒絕' : 'Rejected',
        cancelled: zh ? '已取消' : 'Cancelled',
    }

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
                {(['pending', 'all', 'balances'] as const).map(t => (
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
                            : zh ? '假期餘額' : 'Leave Balances'}
                    </button>
                ))}
            </div>

            {/* ================================================================
                TAB 1: PENDING APPROVALS
            ================================================================ */}
            {tab === 'pending' && (
                <div>
                    {/* Stats cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
                            <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>
                                {pendingCount}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {zh ? '待審核' : 'Pending Approvals'}
                            </div>
                        </div>
                        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
                            <div style={{ fontSize: '32px', fontWeight: 700, color: '#22c55e' }}>
                                {approvedThisMonth}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {zh ? '本月已批准' : 'Approved This Month'}
                            </div>
                        </div>
                        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
                            <div style={{ fontSize: '32px', fontWeight: 700, color: '#f43f5e' }}>
                                {rejectedThisMonth}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {zh ? '本月已拒絕' : 'Rejected This Month'}
                            </div>
                        </div>
                    </div>

                    {/* Pending table */}
                    {loadingPending ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            {zh ? '載入中…' : 'Loading…'}
                        </div>
                    ) : pendingRequests.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            {zh ? '目前沒有待審核的請假申請' : 'No pending leave requests'}
                        </div>
                    ) : (
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                            {[
                                                zh ? '員工' : 'Employee',
                                                zh ? '假別' : 'Leave Type',
                                                zh ? '日期區間' : 'Date Range',
                                                zh ? '天數' : 'Days',
                                                zh ? '薪資' : 'Paid',
                                                zh ? '原因' : 'Reason',
                                                zh ? '門市' : 'Store',
                                                zh ? '操作' : 'Actions',
                                            ].map(h => (
                                                <th
                                                    key={h}
                                                    style={{
                                                        padding: '12px 16px',
                                                        textAlign: 'left',
                                                        color: 'var(--text-muted)',
                                                        fontWeight: 600,
                                                        fontSize: '11px',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingRequests.map(req => (
                                            <tr
                                                key={req.id}
                                                style={{
                                                    borderBottom: '1px solid var(--outline-variant)',
                                                    transition: 'background 0.15s',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = '')}
                                            >
                                                <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                                                    {req.user?.name || '—'}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            background: LEAVE_TYPE_COLORS[req.leave_type] + '33',
                                                            color: LEAVE_TYPE_COLORS[req.leave_type],
                                                            fontSize: '11px',
                                                            padding: '2px 8px',
                                                        }}
                                                    >
                                                        {leaveTypeLabel[req.leave_type] || req.leave_type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                                    {formatDate(req.start_date)} ~ {formatDate(req.end_date)}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                                                    {req.total_days}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            background: req.is_paid ? '#22c55e22' : '#6b728022',
                                                            color: req.is_paid ? '#22c55e' : '#9ca3af',
                                                            fontSize: '11px',
                                                            padding: '2px 8px',
                                                        }}
                                                    >
                                                        {req.is_paid ? (zh ? '有薪' : 'Paid') : (zh ? '無薪' : 'Unpaid')}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {req.reason || '—'}
                                                </td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {req.user?.store?.name || '—'}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    {rejectingId === req.id ? (
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                            <input
                                                                className="input-field"
                                                                placeholder={zh ? '拒絕原因 (選填)' : 'Rejection reason (optional)'}
                                                                value={rejectionInput}
                                                                onChange={e => setRejectionInput(e.target.value)}
                                                                style={{ fontSize: '12px', padding: '4px 8px', minWidth: '150px' }}
                                                                autoFocus
                                                            />
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ background: '#f43f5e22', color: '#f43f5e', padding: '4px 10px' }}
                                                                onClick={() => confirmReject(req.id)}
                                                            >
                                                                {zh ? '確認拒絕' : 'Confirm'}
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-secondary"
                                                                style={{ padding: '4px 8px' }}
                                                                onClick={() => setRejectingId(null)}
                                                            >
                                                                {zh ? '取消' : 'Cancel'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ color: '#22c55e', padding: '4px 10px', background: '#22c55e22' }}
                                                                onClick={() => approveLeave(req)}
                                                                title={zh ? '批准' : 'Approve'}
                                                            >
                                                                ✓
                                                            </button>
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ color: '#f43f5e', padding: '4px 10px', background: '#f43f5e22' }}
                                                                onClick={() => startReject(req.id)}
                                                                title={zh ? '拒絕' : 'Reject'}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ================================================================
                TAB 2: ALL REQUESTS
            ================================================================ */}
            {tab === 'all' && (
                <div>
                    {/* Filter bar */}
                    <div className="card" style={{ marginBottom: '16px', padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div>
                                <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                                <select
                                    className="input-field"
                                    value={filterStatus}
                                    onChange={e => setFilterStatus(e.target.value)}
                                    style={{ minWidth: '120px' }}
                                >
                                    <option value="all">{zh ? '全部' : 'All'}</option>
                                    <option value="pending">{zh ? '待審核' : 'Pending'}</option>
                                    <option value="approved">{zh ? '已批准' : 'Approved'}</option>
                                    <option value="rejected">{zh ? '已拒絕' : 'Rejected'}</option>
                                    <option value="cancelled">{zh ? '已取消' : 'Cancelled'}</option>
                                </select>
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '門市' : 'Store'}</label>
                                <select
                                    className="input-field"
                                    value={filterStore}
                                    onChange={e => setFilterStore(e.target.value)}
                                    style={{ minWidth: '120px' }}
                                >
                                    <option value="all">{zh ? '全部門市' : 'All Stores'}</option>
                                    {stores.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '員工' : 'Employee'}</label>
                                <select
                                    className="input-field"
                                    value={filterUser}
                                    onChange={e => setFilterUser(e.target.value)}
                                    style={{ minWidth: '140px' }}
                                >
                                    <option value="all">{zh ? '全部員工' : 'All Employees'}</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '開始日期' : 'From'}</label>
                                <input
                                    className="input-field"
                                    type="date"
                                    value={filterDateFrom}
                                    onChange={e => setFilterDateFrom(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '結束日期' : 'To'}</label>
                                <input
                                    className="input-field"
                                    type="date"
                                    value={filterDateTo}
                                    onChange={e => setFilterDateTo(e.target.value)}
                                />
                            </div>
                            <div style={{ marginLeft: 'auto' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setShowNewModal(true)}
                                >
                                    ➕ {zh ? '新增申請' : 'New Request'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* All requests table */}
                    {loadingAll ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            {zh ? '載入中…' : 'Loading…'}
                        </div>
                    ) : filteredRequests.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            {zh ? '沒有符合條件的請假申請' : 'No leave requests found'}
                        </div>
                    ) : (
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                            {[
                                                zh ? '員工' : 'Employee',
                                                zh ? '假別' : 'Type',
                                                zh ? '開始' : 'From',
                                                zh ? '結束' : 'To',
                                                zh ? '天數' : 'Days',
                                                zh ? '薪資' : 'Paid',
                                                zh ? '狀態' : 'Status',
                                                zh ? '原因' : 'Reason',
                                                zh ? '門市' : 'Store',
                                            ].map(h => (
                                                <th
                                                    key={h}
                                                    style={{
                                                        padding: '12px 16px',
                                                        textAlign: 'left',
                                                        color: 'var(--text-muted)',
                                                        fontWeight: 600,
                                                        fontSize: '11px',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRequests.map(req => (
                                            <tr
                                                key={req.id}
                                                style={{ borderBottom: '1px solid var(--outline-variant)', transition: 'background 0.15s' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = '')}
                                            >
                                                <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                                                    {req.user?.name || '—'}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            background: LEAVE_TYPE_COLORS[req.leave_type] + '33',
                                                            color: LEAVE_TYPE_COLORS[req.leave_type],
                                                            fontSize: '11px',
                                                            padding: '2px 8px',
                                                        }}
                                                    >
                                                        {leaveTypeLabel[req.leave_type] || req.leave_type}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {formatDate(req.start_date)}
                                                </td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                                    {formatDate(req.end_date)}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                                                    {req.total_days}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            background: req.is_paid ? '#22c55e22' : '#6b728022',
                                                            color: req.is_paid ? '#22c55e' : '#9ca3af',
                                                            fontSize: '11px',
                                                            padding: '2px 8px',
                                                        }}
                                                    >
                                                        {req.is_paid ? (zh ? '有薪' : 'Paid') : (zh ? '無薪' : 'Unpaid')}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span
                                                        className="badge"
                                                        style={{
                                                            background: LEAVE_STATUS_COLORS[req.status] + '33',
                                                            color: LEAVE_STATUS_COLORS[req.status],
                                                            fontSize: '11px',
                                                            padding: '2px 8px',
                                                        }}
                                                    >
                                                        {leaveStatusLabel[req.status] || req.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {req.reason || '—'}
                                                </td>
                                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {(req.user as any)?.store?.name || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Summary count */}
                    {!loadingAll && filteredRequests.length > 0 && (
                        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
                            {zh ? `共 ${filteredRequests.length} 筆` : `${filteredRequests.length} record(s)`}
                        </div>
                    )}
                </div>
            )}

            {/* ================================================================
                TAB 3: LEAVE BALANCES
            ================================================================ */}
            {tab === 'balances' && (
                <div>
                    {/* Filter bar */}
                    <div className="card" style={{ marginBottom: '16px', padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div>
                                <label className="detail-label">{zh ? '年度' : 'Year'}</label>
                                <select
                                    className="input-field"
                                    value={balanceYear}
                                    onChange={e => setBalanceYear(Number(e.target.value))}
                                    style={{ minWidth: '100px' }}
                                >
                                    {[new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '門市' : 'Store'}</label>
                                <select
                                    className="input-field"
                                    value={balanceStoreFilter}
                                    onChange={e => setBalanceStoreFilter(e.target.value)}
                                    style={{ minWidth: '140px' }}
                                >
                                    <option value="all">{zh ? '全部門市' : 'All Stores'}</option>
                                    {stores.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ marginLeft: 'auto' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={buildRecalcPreview}
                                    style={{ fontSize: '13px' }}
                                >
                                    🔄 {zh ? '重算特休天數 (勞基法)' : 'Recalculate Annual Leave (Labor Law)'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Balances table */}
                    {loadingBalances ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            {zh ? '載入中…' : 'Loading…'}
                        </div>
                    ) : balanceRows.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            {zh ? '沒有在職員工資料' : 'No active employees found'}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {balanceRows.map(row => {
                                const annualBal = row.balances['annual']
                                const sickBal = row.balances['sick']
                                const personalBal = row.balances['personal']
                                const annualRemain = getRemainingDays(annualBal)
                                const sickRemain = getRemainingDays(sickBal)
                                const personalRemain = getRemainingDays(personalBal)

                                return (
                                    <div key={row.user.id} className="card" style={{ padding: '0' }}>
                                        {/* Row header */}
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '16px',
                                                padding: '14px 16px',
                                                flexWrap: 'wrap',
                                                cursor: 'pointer',
                                            }}
                                            onClick={() => toggleRowExpand(row.user.id)}
                                        >
                                            {/* Employee info */}
                                            <div style={{ minWidth: '140px', flex: '0 0 140px' }}>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{row.user.name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {(row.user.store as any)?.name || '—'}
                                                </div>
                                            </div>

                                            {/* Annual leave */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '90px' }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                                    {zh ? '特休' : 'Annual'}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '18px', color: annualRemain > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                                                        {annualRemain}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        / {(annualBal?.total_days || 0) + (annualBal?.carry_over_days || 0)} {zh ? '天' : 'd'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                    {zh ? `已用 ${annualBal?.used_days || 0} 天` : `Used ${annualBal?.used_days || 0}d`}
                                                </div>
                                            </div>

                                            {/* Sick leave */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '90px' }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                                    {zh ? '病假' : 'Sick'}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '18px', color: sickRemain > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                                                        {sickRemain}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        / {(sickBal?.total_days || 0) + (sickBal?.carry_over_days || 0)} {zh ? '天' : 'd'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                    {zh ? `已用 ${sickBal?.used_days || 0} 天` : `Used ${sickBal?.used_days || 0}d`}
                                                </div>
                                            </div>

                                            {/* Personal leave */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '90px' }}>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                                    {zh ? '事假' : 'Personal'}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '18px', color: personalRemain > 0 ? '#3b82f6' : 'var(--text-muted)' }}>
                                                        {personalRemain}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        / {(personalBal?.total_days || 0) + (personalBal?.carry_over_days || 0)} {zh ? '天' : 'd'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                    {zh ? `已用 ${personalBal?.used_days || 0} 天` : `Used ${personalBal?.used_days || 0}d`}
                                                </div>
                                            </div>

                                            {/* Edit button */}
                                            <div style={{ marginLeft: 'auto' }}>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={e => { e.stopPropagation(); toggleRowExpand(row.user.id) }}
                                                >
                                                    {row.expanded ? (zh ? '收起' : 'Collapse') : (zh ? '編輯餘額' : 'Edit Balance')}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded edit area */}
                                        {row.expanded && (
                                            <div
                                                className="fade-in"
                                                style={{
                                                    borderTop: '1px solid var(--outline-variant)',
                                                    padding: '16px',
                                                    background: 'var(--bg-secondary)',
                                                }}
                                            >
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
                                                    <div>
                                                        <label className="detail-label">{zh ? '假別' : 'Leave Type'}</label>
                                                        <select
                                                            className="input-field"
                                                            value={row.editType}
                                                            onChange={e => setRowEdit(row.user.id, 'editType', e.target.value)}
                                                        >
                                                            {Object.entries(leaveTypeLabel).map(([k, v]) => (
                                                                <option key={k} value={k}>{v}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">{zh ? '總天數' : 'Total Days'}</label>
                                                        <input
                                                            className="input-field"
                                                            type="number"
                                                            min="0"
                                                            step="0.5"
                                                            placeholder={String(row.balances[row.editType]?.total_days ?? 0)}
                                                            value={row.editTotal}
                                                            onChange={e => setRowEdit(row.user.id, 'editTotal', e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">{zh ? '已使用 (唯讀)' : 'Used Days (read-only)'}</label>
                                                        <input
                                                            className="input-field"
                                                            type="number"
                                                            value={row.balances[row.editType]?.used_days ?? 0}
                                                            readOnly
                                                            style={{ opacity: 0.6, cursor: 'not-allowed' }}
                                                         autoComplete="off" />
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">{zh ? '結轉天數' : 'Carry Over'}</label>
                                                        <input
                                                            className="input-field"
                                                            type="number"
                                                            min="0"
                                                            step="0.5"
                                                            placeholder={String(row.balances[row.editType]?.carry_over_days ?? 0)}
                                                            value={row.editCarry}
                                                            onChange={e => setRowEdit(row.user.id, 'editCarry', e.target.value)}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={() => saveBalance(row)}
                                                            disabled={savingBalance === row.user.id}
                                                        >
                                                            {savingBalance === row.user.id
                                                                ? (zh ? '儲存中…' : 'Saving…')
                                                                : (zh ? '儲存' : 'Save')}
                                                        </button>
                                                    </div>
                                                </div>
                                                {/* Remaining preview */}
                                                {(row.editTotal !== '' || row.editCarry !== '') && (() => {
                                                    const existingBal = row.balances[row.editType]
                                                    const previewTotal = parseFloat(row.editTotal !== '' ? row.editTotal : String(existingBal?.total_days ?? 0))
                                                    const previewCarry = parseFloat(row.editCarry !== '' ? row.editCarry : String(existingBal?.carry_over_days ?? 0))
                                                    const previewUsed = existingBal?.used_days ?? 0
                                                    const previewRemain = previewTotal + previewCarry - previewUsed
                                                    return (
                                                        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                            {zh ? '預覽餘額：' : 'Preview remaining: '}
                                                            <span style={{ fontWeight: 700, color: previewRemain >= 0 ? '#22c55e' : '#f43f5e' }}>
                                                                {previewRemain} {zh ? '天' : 'days'}
                                                            </span>
                                                        </div>
                                                    )
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ================================================================
                MODAL: New Leave Request
            ================================================================ */}
            {showNewModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 50,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        overscrollBehavior: 'contain',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setShowNewModal(false) }}
                >
                    <div
                        className="card fade-in"
                        style={{
                            width: '100%',
                            maxWidth: '520px',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            position: 'relative',
                        }}
                    >
                        {/* Modal header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                                ➕ {zh ? '新增請假申請' : 'New Leave Request'}
                            </h3>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setShowNewModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Form */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Employee */}
                            <div>
                                <label className="detail-label">{zh ? '員工 *' : 'Employee *'}</label>
                                <select
                                    className="input-field"
                                    value={newForm.user_id}
                                    onChange={e => setNewForm({ ...newForm, user_id: e.target.value })}
                                >
                                    <option value="">{zh ? '— 選擇員工 —' : '— Select Employee —'}</option>
                                    {users.filter(u => u.status === 'active').map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.name}{u.store ? ` (${(u.store as any).name})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Leave type */}
                            <div>
                                <label className="detail-label">{zh ? '假別 *' : 'Leave Type *'}</label>
                                <select
                                    className="input-field"
                                    value={newForm.leave_type}
                                    onChange={e => setNewForm({ ...newForm, leave_type: e.target.value })}
                                >
                                    {Object.entries(leaveTypeLabel).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Balance preview */}
                            {newForm.user_id && newForm.leave_type && (
                                <div style={{
                                    padding: '10px 14px',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}>
                                    {loadingBalance ? (
                                        <span style={{ color: 'var(--text-muted)' }}>{zh ? '查詢餘額中…' : 'Loading balance…'}</span>
                                    ) : (
                                        <>
                                            <span style={{ color: 'var(--text-secondary)' }}>
                                                {leaveTypeLabel[newForm.leave_type]} {zh ? '剩餘：' : 'Remaining:'}
                                            </span>
                                            <span
                                                className="badge"
                                                style={{
                                                    background: LEAVE_TYPE_COLORS[newForm.leave_type] + '33',
                                                    color: LEAVE_TYPE_COLORS[newForm.leave_type],
                                                    fontSize: '12px',
                                                    padding: '2px 10px',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {newFormBalance
                                                    ? `${(newFormBalance.total_days + newFormBalance.carry_over_days - newFormBalance.used_days)} ${zh ? '天' : 'days'}`
                                                    : (zh ? '無紀錄' : 'No record')}
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Date range */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label className="detail-label">{zh ? '開始日期 *' : 'Start Date *'}</label>
                                    <input
                                        className="input-field"
                                        type="date"
                                        value={newForm.start_date}
                                        onChange={e => setNewForm({ ...newForm, start_date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '結束日期 *' : 'End Date *'}</label>
                                    <input
                                        className="input-field"
                                        type="date"
                                        value={newForm.end_date}
                                        min={newForm.start_date}
                                        onChange={e => setNewForm({ ...newForm, end_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Days preview + paid indicator */}
                            {newForm.start_date && newForm.end_date && (
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {zh ? '共' : 'Total:'}
                                    </span>
                                    <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                                        {calcDays(newForm.start_date, newForm.end_date)} {zh ? '天' : 'days'}
                                    </span>
                                    <span
                                        className="badge"
                                        style={{
                                            background: PAID_TYPES.includes(newForm.leave_type) ? '#22c55e22' : '#6b728022',
                                            color: PAID_TYPES.includes(newForm.leave_type) ? '#22c55e' : '#9ca3af',
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                        }}
                                    >
                                        {PAID_TYPES.includes(newForm.leave_type) ? (zh ? '有薪假' : 'Paid Leave') : (zh ? '無薪假' : 'Unpaid Leave')}
                                    </span>
                                </div>
                            )}

                            {/* Reason */}
                            <div>
                                <label className="detail-label">{zh ? '原因 (選填)' : 'Reason (optional)'}</label>
                                <textarea
                                    className="input-field"
                                    rows={3}
                                    placeholder={zh ? '請輸入請假原因…' : 'Enter reason for leave…'}
                                    value={newForm.reason}
                                    onChange={e => setNewForm({ ...newForm, reason: e.target.value })}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={submitNewRequest}
                                    disabled={submittingNew || !newForm.user_id || !newForm.start_date || !newForm.end_date}
                                    style={{ flex: 1 }}
                                >
                                    {submittingNew ? (zh ? '提交中…' : 'Submitting…') : (zh ? '提交申請' : 'Submit Request')}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowNewModal(false)}
                                >
                                    {zh ? '取消' : 'Cancel'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ================================================================
                DIALOG: Recalculate Annual Leave Confirmation
            ================================================================ */}
            {showRecalcDialog && recalcPreview && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 50,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        overscrollBehavior: 'contain',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setShowRecalcDialog(false) }}
                >
                    <div
                        className="card fade-in"
                        style={{
                            width: '100%',
                            maxWidth: '540px',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                            position: 'relative',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                                🔄 {zh ? `重算 ${balanceYear} 年特休天數` : `Recalculate ${balanceYear} Annual Leave`}
                            </h3>
                            <button className="btn btn-sm btn-secondary" onClick={() => setShowRecalcDialog(false)}>✕</button>
                        </div>

                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            {zh
                                ? '依據台灣勞基法計算各員工特休天數。此操作只更新「total_days」欄位，不影響已使用天數。'
                                : 'Calculates annual leave per Taiwan Labor Standards Act. This only updates total_days; used_days is preserved.'}
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '40vh', overflowY: 'auto', marginBottom: '16px' }}>
                            {recalcPreview.map(item => (
                                <div
                                    key={item.user.id}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '8px 12px',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                    }}
                                >
                                    <div>
                                        <span style={{ fontWeight: 600 }}>{item.user.name}</span>
                                        {item.user.hire_date && (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '8px' }}>
                                                {zh ? '入職：' : 'Hired: '}{formatDate(item.user.hire_date)}
                                            </span>
                                        )}
                                    </div>
                                    <span
                                        className="badge"
                                        style={{
                                            background: '#22c55e33',
                                            color: '#22c55e',
                                            fontWeight: 700,
                                            padding: '2px 10px',
                                        }}
                                    >
                                        {item.days} {zh ? '天' : 'days'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn btn-primary" onClick={confirmRecalc} style={{ flex: 1 }}>
                                {zh ? '確認更新' : 'Confirm Update'}
                            </button>
                            <button className="btn btn-secondary" onClick={() => setShowRecalcDialog(false)}>
                                {zh ? '取消' : 'Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
