import { useEffect, useState } from 'react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { getLocale } from '../lib/i18n'
import { useOrg } from '../lib/OrgContext'

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Store {
  id: string
  name: string
}

interface UserRecord {
  id: string
  name: string
  status: string
  store_id: string | null
  organization_id: string
  max_hours_per_week: number
  store?: Store | null
}

interface OvertimeRequest {
  id: string
  organization_id: string
  store_id: string | null
  user_id: string
  shift_assignment_id: string | null
  request_date: string
  planned_end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  ot_hours: number | null
  ot_type: 'pay' | 'comp'
  filing_type: 'pre' | 'post'
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  user?: {
    name: string
    store?: Store | null
  } | null
}

interface NewRequestForm {
  user_id: string
  request_date: string
  filing_type: 'pre' | 'post'
  planned_end_time: string
  actual_start_time: string
  actual_end_time: string
  ot_hours: string
  ot_type: 'pay' | 'comp'
  reason: string
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calcHoursFromDatetime(start: string, end: string): number {
  if (!start || !end) return 0
  return Math.round(((new Date(end).getTime() - new Date(start).getTime()) / 3600000) * 2) / 2
}

function getCurrentMonthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

function getCurrentMonthName(zh: boolean): string {
  const now = new Date()
  if (zh) {
    return `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`
  }
  return now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

// ─── Sub-components (inline) ──────────────────────────────────────────────────

function FilingTypeBadge({ type, zh }: { type: 'pre' | 'post'; zh: boolean }) {
  const isPre = type === 'pre'
  return (
    <span
      className="badge"
      style={{
        background: isPre ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
        color: isPre ? '#3b82f6' : '#f59e0b',
        border: `1px solid ${isPre ? 'rgba(59,130,246,0.3)' : 'rgba(245,158,11,0.3)'}`,
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {isPre ? (zh ? '申請前' : 'Pre') : (zh ? '事後補報' : 'Post')}
    </span>
  )
}

function OtTypeBadge({ type, zh }: { type: 'pay' | 'comp'; zh: boolean }) {
  const isPay = type === 'pay'
  return (
    <span
      className="badge"
      style={{
        background: isPay ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)',
        color: isPay ? '#22c55e' : '#8b5cf6',
        border: `1px solid ${isPay ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.3)'}`,
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {isPay ? (zh ? '加班費' : 'Pay') : (zh ? '補休' : 'Comp')}
    </span>
  )
}

function StatusBadge({ status, zh }: { status: string; zh: boolean }) {
  const config: Record<string, { bg: string; color: string; border: string; label: string; labelEn: string }> = {
    pending:   { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', border: 'rgba(245,158,11,0.3)',  label: '待審核', labelEn: 'Pending' },
    approved:  { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', border: 'rgba(34,197,94,0.3)',   label: '已核准', labelEn: 'Approved' },
    rejected:  { bg: 'rgba(244,63,94,0.15)',   color: '#f43f5e', border: 'rgba(244,63,94,0.3)',   label: '已拒絕', labelEn: 'Rejected' },
    cancelled: { bg: 'rgba(120,120,140,0.15)', color: '#6b7280', border: 'rgba(120,120,140,0.3)', label: '已取消', labelEn: 'Cancelled' },
  }
  const c = config[status] ?? config['pending']
  return (
    <span
      className="badge"
      style={{
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
      }}
    >
      {zh ? c.label : c.labelEn}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OvertimeRequests() {
  const zh = getLocale() === 'zh-TW'
  const { orgId, currentUser } = useOrg()

  // Tab state
  const [tab, setTab] = useState<'pending' | 'all' | 'risk'>('pending')

  // ── Tab 1: Pending state ──────────────────────────────────────────────────
  const [pendingRequests, setPendingRequests] = useState<OvertimeRequest[]>([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [monthlyStats, setMonthlyStats] = useState({ approvedHours: 0, totalHours: 0 })
  // Inline rejection state: requestId → reason draft
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // ── Tab 2: All Records state ──────────────────────────────────────────────
  const [allRequests, setAllRequests] = useState<OvertimeRequest[]>([])
  const [allLoading, setAllLoading] = useState(true)
  const [stores, setStores] = useState<Store[]>([])
  const [activeUsers, setActiveUsers] = useState<UserRecord[]>([])

  // Filters
  const [filterStore, setFilterStore] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterFiling, setFilterFiling] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // New request modal
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState<NewRequestForm>({
    user_id: '',
    request_date: new Date().toISOString().split('T')[0],
    filing_type: 'pre',
    planned_end_time: '',
    actual_start_time: '',
    actual_end_time: '',
    ot_hours: '',
    ot_type: 'pay',
    reason: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Cancel confirm
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  // ── Tab 3: Risk state ─────────────────────────────────────────────────────
  const [riskData, setRiskData] = useState<{ user: UserRecord; approvedHours: number }[]>([])
  const [riskLoading, setRiskLoading] = useState(true)

  // ─── LINE HR Notify helper ─────────────────────────────────────────────────

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

  // ─── Data Loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!orgId) return
    loadPendingRequests()
    loadMonthlyStats()
    loadStores()
    loadActiveUsers()
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    if (tab === 'all') loadAllRequests()
    if (tab === 'risk') loadRiskData()
  }, [tab, orgId])

  async function loadPendingRequests() {
    setPendingLoading(true)
    const { data } = await supabase
      .from('overtime_requests')
      .select('*, user:users(name, store:stores(name))')
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .order('created_at')
    setPendingRequests((data as OvertimeRequest[]) || [])
    setPendingLoading(false)
  }

  async function loadMonthlyStats() {
    const { start, end } = getCurrentMonthRange()
    const { data } = await supabase
      .from('overtime_requests')
      .select('ot_hours, status')
      .eq('organization_id', orgId)
      .gte('request_date', start)
      .lte('request_date', end)

    if (data) {
      const approvedHours = data
        .filter(r => r.status === 'approved')
        .reduce((sum, r) => sum + (r.ot_hours || 0), 0)
      const totalHours = data.reduce((sum, r) => sum + (r.ot_hours || 0), 0)
      setMonthlyStats({ approvedHours, totalHours })
    }
  }

  async function loadStores() {
    const { data } = await supabase
      .from('stores')
      .select('id, name')
      .order('name')
    setStores(data || [])
  }

  async function loadActiveUsers() {
    const { data } = await supabase
      .from('users')
      .select('id, name, status, store_id, organization_id, max_hours_per_week, store:stores(id, name)')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('name')
    setActiveUsers((data as UserRecord[]) || [])
  }

  async function loadAllRequests() {
    setAllLoading(true)
    const { data } = await supabase
      .from('overtime_requests')
      .select('*, user:users(name, store:stores(name))')
      .eq('organization_id', orgId)
      .order('request_date', { ascending: false })
    setAllRequests((data as OvertimeRequest[]) || [])
    setAllLoading(false)
  }

  async function loadRiskData() {
    setRiskLoading(true)
    const { start, end } = getCurrentMonthRange()

    // Load users with store info
    const { data: users } = await supabase
      .from('users')
      .select('id, name, status, store_id, organization_id, max_hours_per_week, store:stores(id, name)')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('name')

    // Load approved OT this month
    const { data: approved } = await supabase
      .from('overtime_requests')
      .select('user_id, ot_hours')
      .eq('organization_id', orgId)
      .eq('status', 'approved')
      .gte('request_date', start)
      .lte('request_date', end)

    if (users) {
      const hoursMap: Record<string, number> = {}
      if (approved) {
        for (const r of approved) {
          hoursMap[r.user_id] = (hoursMap[r.user_id] || 0) + (r.ot_hours || 0)
        }
      }
      const result = (users as UserRecord[]).map(u => ({
        user: u,
        approvedHours: hoursMap[u.id] || 0,
      }))
      setRiskData(result)
    }
    setRiskLoading(false)
  }

  // ─── Pending Actions ──────────────────────────────────────────────────────

  async function handleApprove(req: OvertimeRequest) {
    setActionLoading(req.id)
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('overtime_requests')
      .update({
        status: 'approved',
        approved_by: currentUser?.id ?? null,
        approved_at: now,
        updated_at: now,
      })
      .eq('id', req.id)

    if (!error && req.shift_assignment_id) {
      await supabase
        .from('shift_assignments')
        .update({ is_overtime: true, overtime_hours: req.ot_hours })
        .eq('id', req.shift_assignment_id)
    }

    if (!error) {
      await notifyEmployee(req.user_id, 'ot_approved', {
        request_date: req.request_date,
        ot_hours: req.ot_hours || 0,
        ot_type: req.ot_type,
        filing_type: req.filing_type,
      });
    }

    setActionLoading(null)
    await loadPendingRequests()
    await loadMonthlyStats()
    // Refresh all records if loaded
    if (allRequests.length > 0) loadAllRequests()
  }

  async function handleRejectConfirm(req: OvertimeRequest) {
    if (!rejectReason.trim()) return
    setActionLoading(req.id)
    const now = new Date().toISOString()

    await supabase
      .from('overtime_requests')
      .update({
        status: 'rejected',
        rejection_reason: rejectReason.trim(),
        updated_at: now,
      })
      .eq('id', req.id)

    await notifyEmployee(req.user_id, 'ot_rejected', {
      request_date: req.request_date,
      ot_hours: req.ot_hours || 0,
      ot_type: req.ot_type,
      filing_type: req.filing_type,
      rejection_reason: rejectReason.trim(),
    });

    setRejectingId(null)
    setRejectReason('')
    setActionLoading(null)
    await loadPendingRequests()
    await loadMonthlyStats()
    if (allRequests.length > 0) loadAllRequests()
  }

  // ─── Cancel (All Records) ─────────────────────────────────────────────────

  async function handleCancel(id: string) {
    const now = new Date().toISOString()
    await supabase
      .from('overtime_requests')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', id)
    setCancellingId(null)
    loadAllRequests()
  }

  // ─── New Request Submit ───────────────────────────────────────────────────

  async function handleNewSubmit() {
    if (!newForm.user_id || !newForm.request_date) {
      setSubmitError(zh ? '請填寫必填欄位' : 'Please fill in required fields')
      return
    }

    let computedHours = parseFloat(newForm.ot_hours) || 0
    if (newForm.filing_type === 'post' && newForm.actual_start_time && newForm.actual_end_time) {
      computedHours = calcHoursFromDatetime(newForm.actual_start_time, newForm.actual_end_time)
    }

    const selectedUser = activeUsers.find(u => u.id === newForm.user_id)

    const insertData: Record<string, unknown> = {
      organization_id: orgId,
      store_id: selectedUser?.store_id ?? null,
      user_id: newForm.user_id,
      request_date: newForm.request_date,
      filing_type: newForm.filing_type,
      ot_type: newForm.ot_type,
      ot_hours: computedHours || null,
      reason: newForm.reason || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (newForm.filing_type === 'pre') {
      insertData.planned_end_time = newForm.planned_end_time || null
    } else {
      insertData.actual_start_time = newForm.actual_start_time || null
      insertData.actual_end_time = newForm.actual_end_time || null
    }

    setSubmitting(true)
    setSubmitError('')
    const { error } = await supabase.from('overtime_requests').insert(insertData)

    if (error) {
      setSubmitError(error.message)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setShowNewModal(false)
    resetNewForm()
    await loadAllRequests()
    await loadPendingRequests()
    await loadMonthlyStats()
  }

  function resetNewForm() {
    setNewForm({
      user_id: '',
      request_date: new Date().toISOString().split('T')[0],
      filing_type: 'pre',
      planned_end_time: '',
      actual_start_time: '',
      actual_end_time: '',
      ot_hours: '',
      ot_type: 'pay',
      reason: '',
    })
    setSubmitError('')
  }

  // ─── Computed: filtered all requests ─────────────────────────────────────

  const filteredRequests = allRequests.filter(r => {
    if (filterStore) {
      const storeName = (r.user as any)?.store?.name ?? ''
      const storeObj = stores.find(s => s.id === filterStore)
      if (!storeObj || storeName !== storeObj.name) return false
    }
    if (filterEmployee) {
      const name = r.user?.name ?? ''
      if (!name.toLowerCase().includes(filterEmployee.toLowerCase())) return false
    }
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterFiling !== 'all' && r.filing_type !== filterFiling) return false
    if (filterDateFrom && r.request_date < filterDateFrom) return false
    if (filterDateTo && r.request_date > filterDateTo) return false
    return true
  })

  const filteredTotalHours = filteredRequests.reduce((sum, r) => sum + (r.ot_hours || 0), 0)
  const filteredApprovedHours = filteredRequests
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + (r.ot_hours || 0), 0)
  const filteredPendingHours = filteredRequests
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + (r.ot_hours || 0), 0)

  // ─── Auto-calc hours when post datetimes change ───────────────────────────

  function handleActualTimeChange(field: 'actual_start_time' | 'actual_end_time', value: string) {
    const updated = { ...newForm, [field]: value }
    if (updated.filing_type === 'post' && updated.actual_start_time && updated.actual_end_time) {
      const h = calcHoursFromDatetime(updated.actual_start_time, updated.actual_end_time)
      updated.ot_hours = h > 0 ? String(h) : ''
    }
    setNewForm(updated)
  }

  // ─── Risk colour helper ───────────────────────────────────────────────────

  function riskColor(hours: number): string {
    if (hours > 8) return '#f43f5e'
    if (hours > 4) return '#f59e0b'
    return '#22c55e'
  }

  function riskLabel(hours: number, zh: boolean): string {
    if (hours > 8) return zh ? '高風險' : 'High Risk'
    if (hours > 4) return zh ? '注意' : 'Caution'
    return zh ? '正常' : 'Normal'
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h1>⏰ {zh ? '加班管理' : 'Overtime Management'}</h1>
        <p className="page-subtitle">
          {zh ? '加班申請審核與加班時數風險監控' : 'Overtime request approvals and risk monitoring'}
        </p>
      </div>

      {/* Tab Bar */}
      <div className="tab-bar" style={{ marginBottom: '24px' }}>
        <button
          className={`tab-item${tab === 'pending' ? ' active' : ''}`}
          onClick={() => setTab('pending')}
        >
          {zh ? '待審核' : 'Pending Approvals'}
          {pendingRequests.length > 0 && (
            <span style={{
              marginLeft: '6px',
              background: '#f59e0b',
              color: '#000',
              borderRadius: '10px',
              padding: '1px 7px',
              fontSize: '11px',
              fontWeight: 700,
            }}>
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          className={`tab-item${tab === 'all' ? ' active' : ''}`}
          onClick={() => { setTab('all'); if (allRequests.length === 0) loadAllRequests() }}
        >
          {zh ? '所有記錄' : 'All Records'}
        </button>
        <button
          className={`tab-item${tab === 'risk' ? ' active' : ''}`}
          onClick={() => { setTab('risk'); if (riskData.length === 0) loadRiskData() }}
        >
          {zh ? '風險概覽' : 'Risk Overview'}
        </button>
      </div>

      {/* ── TAB 1: PENDING APPROVALS ──────────────────────────────────────── */}
      {tab === 'pending' && (
        <div>
          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
            <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>
                {pendingRequests.length}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {zh ? '待審核' : 'Pending'}
              </div>
            </div>
            <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#22c55e' }}>
                {monthlyStats.approvedHours.toFixed(1)}h
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {zh ? '本月已核准時數' : 'Approved Hours (Month)'}
              </div>
            </div>
            <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#60a5fa' }}>
                {monthlyStats.totalHours.toFixed(1)}h
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {zh ? '本月加班總時數' : 'Total OT Hours (Month)'}
              </div>
            </div>
          </div>

          {/* Pending Table */}
          {pendingLoading ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '載入中…' : 'Loading…'}
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '目前無待審核申請' : 'No pending requests'}
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                      {[
                        zh ? '員工' : 'Employee',
                        zh ? '門市' : 'Store',
                        zh ? '日期' : 'Date',
                        zh ? '類型' : 'Filing',
                        zh ? '補償' : 'OT Type',
                        zh ? '時數' : 'Hours',
                        zh ? '原因' : 'Reason',
                        zh ? '操作' : 'Actions',
                      ].map(h => (
                        <th
                          key={h}
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            color: 'var(--text-muted)',
                            fontWeight: 500,
                            fontSize: '12px',
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
                      <>
                        <tr
                          key={req.id}
                          style={{ verticalAlign: 'top' }}
                        >
                          <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                            {req.user?.name ?? '—'}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                            {(req.user as any)?.store?.name ?? '—'}
                          </td>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            {req.request_date}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <FilingTypeBadge type={req.filing_type} zh={zh} />
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <OtTypeBadge type={req.ot_type} zh={zh} />
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                            {req.ot_hours != null ? `${req.ot_hours}h` : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)', maxWidth: '200px' }}>
                            {req.reason ?? '—'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-sm"
                                disabled={actionLoading === req.id}
                                onClick={() => handleApprove(req)}
                                style={{
                                  background: 'rgba(34,197,94,0.15)',
                                  color: '#22c55e',
                                  border: '1px solid rgba(34,197,94,0.3)',
                                  cursor: 'pointer',
                                }}
                              >
                                ✓ {zh ? '核准' : 'Approve'}
                              </button>
                              <button
                                className="btn btn-sm"
                                disabled={actionLoading === req.id}
                                onClick={() => {
                                  if (rejectingId === req.id) {
                                    setRejectingId(null)
                                    setRejectReason('')
                                  } else {
                                    setRejectingId(req.id)
                                    setRejectReason('')
                                  }
                                }}
                                style={{
                                  background: 'rgba(244,63,94,0.15)',
                                  color: '#f43f5e',
                                  border: '1px solid rgba(244,63,94,0.3)',
                                  cursor: 'pointer',
                                }}
                              >
                                ✕ {zh ? '拒絕' : 'Reject'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {rejectingId === req.id && (
                          <tr key={`reject-${req.id}`} style={{ borderBottom: '1px solid var(--outline-variant)', background: 'rgba(244,63,94,0.05)' }}>
                            <td colSpan={8} style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                  {zh ? '拒絕原因：' : 'Rejection reason:'}
                                </span>
                                <input
                                  className="input-field"
                                  style={{ flex: 1, fontSize: '13px' }}
                                  placeholder={zh ? '請輸入拒絕原因…' : 'Enter rejection reason…'}
                                  value={rejectReason}
                                  onChange={e => setRejectReason(e.target.value)}
                                  autoFocus
                                />
                                <button
                                  className="btn btn-sm"
                                  disabled={!rejectReason.trim() || actionLoading === req.id}
                                  onClick={() => handleRejectConfirm(req)}
                                  style={{
                                    background: '#f43f5e',
                                    color: '#fff',
                                    border: 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {zh ? '確認拒絕' : 'Confirm'}
                                </button>
                                <button
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => { setRejectingId(null); setRejectReason('') }}
                                >
                                  {zh ? '取消' : 'Cancel'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: ALL RECORDS ────────────────────────────────────────────── */}
      {tab === 'all' && (
        <div>
          {/* Filter Bar */}
          <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {/* Store filter */}
              <div>
                <div className="detail-label" style={{ marginBottom: '4px' }}>
                  {zh ? '門市' : 'Store'}
                </div>
                <select
                  className="input-field"
                  style={{ fontSize: '13px', minWidth: '130px' }}
                  value={filterStore}
                  onChange={e => setFilterStore(e.target.value)}
                >
                  <option value="">{zh ? '所有門市' : 'All Stores'}</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Employee filter */}
              <div>
                <div className="detail-label" style={{ marginBottom: '4px' }}>
                  {zh ? '員工' : 'Employee'}
                </div>
                <input
                  className="input-field"
                  style={{ fontSize: '13px', minWidth: '130px' }}
                  placeholder={zh ? '搜尋員工…' : 'Search employee…'}
                  value={filterEmployee}
                  onChange={e => setFilterEmployee(e.target.value)}
                />
              </div>

              {/* Status filter */}
              <div>
                <div className="detail-label" style={{ marginBottom: '4px' }}>
                  {zh ? '狀態' : 'Status'}
                </div>
                <select
                  className="input-field"
                  style={{ fontSize: '13px', minWidth: '120px' }}
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="all">{zh ? '全部' : 'All'}</option>
                  <option value="pending">{zh ? '待審核' : 'Pending'}</option>
                  <option value="approved">{zh ? '已核准' : 'Approved'}</option>
                  <option value="rejected">{zh ? '已拒絕' : 'Rejected'}</option>
                  <option value="cancelled">{zh ? '已取消' : 'Cancelled'}</option>
                </select>
              </div>

              {/* Filing type filter */}
              <div>
                <div className="detail-label" style={{ marginBottom: '4px' }}>
                  {zh ? '申請類型' : 'Filing'}
                </div>
                <select
                  className="input-field"
                  style={{ fontSize: '13px', minWidth: '120px' }}
                  value={filterFiling}
                  onChange={e => setFilterFiling(e.target.value)}
                >
                  <option value="all">{zh ? '全部' : 'All'}</option>
                  <option value="pre">{zh ? '事前申請' : 'Pre-Approval'}</option>
                  <option value="post">{zh ? '事後補報' : 'Post-Filing'}</option>
                </select>
              </div>

              {/* Date range */}
              <div>
                <div className="detail-label" style={{ marginBottom: '4px' }}>
                  {zh ? '開始日期' : 'Date From'}
                </div>
                <input
                  type="date"
                  className="input-field"
                  style={{ fontSize: '13px' }}
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                />
              </div>
              <div>
                <div className="detail-label" style={{ marginBottom: '4px' }}>
                  {zh ? '結束日期' : 'Date To'}
                </div>
                <input
                  type="date"
                  className="input-field"
                  style={{ fontSize: '13px' }}
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                />
              </div>

              {/* Clear filters */}
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setFilterStore('')
                  setFilterEmployee('')
                  setFilterStatus('all')
                  setFilterFiling('all')
                  setFilterDateFrom('')
                  setFilterDateTo('')
                }}
              >
                {zh ? '清除篩選' : 'Clear'}
              </button>

              {/* Spacer + New Request */}
              <div style={{ marginLeft: 'auto' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => { setShowNewModal(true); resetNewForm() }}
                >
                  + {zh ? '新增申請' : 'New Request'}
                </button>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#60a5fa' }}>
                {filteredTotalHours.toFixed(1)}h
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {zh ? '篩選總時數' : 'Total Hours'}
              </div>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#22c55e' }}>
                {filteredApprovedHours.toFixed(1)}h
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {zh ? '已核准時數' : 'Approved Hours'}
              </div>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#f59e0b' }}>
                {filteredPendingHours.toFixed(1)}h
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {zh ? '待審核時數' : 'Pending Hours'}
              </div>
            </div>
          </div>

          {/* All Records Table */}
          {allLoading ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '載入中…' : 'Loading…'}
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '無符合條件的記錄' : 'No records found'}
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                      {[
                        zh ? '員工' : 'Employee',
                        zh ? '日期' : 'Date',
                        zh ? '類型' : 'Filing',
                        zh ? '補償' : 'OT Type',
                        zh ? '時數' : 'Hours',
                        zh ? '原因' : 'Reason',
                        zh ? '狀態' : 'Status',
                        zh ? '操作' : 'Actions',
                      ].map(h => (
                        <th
                          key={h}
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            color: 'var(--text-muted)',
                            fontWeight: 500,
                            fontSize: '12px',
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
                        style={{ verticalAlign: 'middle' }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 500 }}>{req.user?.name ?? '—'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {(req.user as any)?.store?.name ?? ''}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {req.request_date}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <FilingTypeBadge type={req.filing_type} zh={zh} />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <OtTypeBadge type={req.ot_type} zh={zh} />
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                          {req.ot_hours != null ? `${req.ot_hours}h` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', maxWidth: '180px' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {req.reason ?? '—'}
                          </div>
                          {req.rejection_reason && (
                            <div style={{ fontSize: '11px', color: '#f43f5e', marginTop: '2px' }}>
                              {zh ? '拒絕：' : 'Reason: '}{req.rejection_reason}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <StatusBadge status={req.status} zh={zh} />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {req.status === 'pending' && (
                            cancellingId === req.id ? (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                  {zh ? '確定取消？' : 'Confirm cancel?'}
                                </span>
                                <button
                                  className="btn btn-sm"
                                  onClick={() => handleCancel(req.id)}
                                  style={{ background: '#f43f5e', color: '#fff', border: 'none', cursor: 'pointer' }}
                                >
                                  {zh ? '確定' : 'Yes'}
                                </button>
                                <button
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => setCancellingId(null)}
                                >
                                  {zh ? '否' : 'No'}
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setCancellingId(req.id)}
                              >
                                {zh ? '取消申請' : 'Cancel'}
                              </button>
                            )
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

      {/* ── TAB 3: RISK OVERVIEW ──────────────────────────────────────────── */}
      {tab === 'risk' && (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                {zh ? '加班風險概覽' : 'OT Risk Overview'}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {getCurrentMonthName(zh)} — {zh ? '已核准加班時數' : 'Approved Overtime Hours'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
              <span style={{ color: '#22c55e' }}>● {zh ? '正常 (0–4h)' : 'Normal (0–4h)'}</span>
              <span style={{ color: '#f59e0b' }}>● {zh ? '注意 (4–8h)' : 'Caution (4–8h)'}</span>
              <span style={{ color: '#f43f5e' }}>● {zh ? '高風險 (>8h)' : 'High Risk (>8h)'}</span>
            </div>
          </div>

          {riskLoading ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '載入中…' : 'Loading…'}
            </div>
          ) : riskData.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '暫無資料' : 'No data'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {riskData.map(({ user, approvedHours }) => {
                const maxWeekly = user.max_hours_per_week || 40
                // Compare approved OT to max weekly hours for bar
                const pct = Math.min((approvedHours / maxWeekly) * 100, 100)
                const color = riskColor(approvedHours)
                const storeName = (user as any).store?.name ?? ''
                return (
                  <div
                    key={user.id}
                    className="card"
                    style={{ padding: '18px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{user.name}</div>
                        {storeName && (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {storeName}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: `${color}22`,
                          color: color,
                          border: `1px solid ${color}44`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {riskLabel(approvedHours, zh)}
                      </span>
                    </div>

                    {/* Hours display */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '24px', fontWeight: 700, color }}>
                        {approvedHours.toFixed(1)}h
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {zh ? `週上限 ${maxWeekly}h` : `Max ${maxWeekly}h/wk`}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div style={{
                      height: '6px',
                      borderRadius: '3px',
                      background: 'var(--border-color)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: color,
                        borderRadius: '3px',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>
                      {pct.toFixed(0)}% {zh ? '已用' : 'used'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── NEW REQUEST MODAL ─────────────────────────────────────────────── */}
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
            padding: '16px', overscrollBehavior: 'contain' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowNewModal(false); resetNewForm() } }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '520px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              position: 'relative',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                {zh ? '新增加班申請' : 'New Overtime Request'}
              </h2>
              <button
                onClick={() => { setShowNewModal(false); resetNewForm() }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '20px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Employee */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '員工 *' : 'Employee *'}
              </label>
              <select
                className="input-field"
                style={{ width: '100%' }}
                value={newForm.user_id}
                onChange={e => setNewForm({ ...newForm, user_id: e.target.value })}
              >
                <option value="">{zh ? '請選擇員工…' : 'Select employee…'}</option>
                {activeUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '加班日期 *' : 'Date *'}
              </label>
              <input
                type="date"
                className="input-field"
                style={{ width: '100%' }}
                value={newForm.request_date}
                onChange={e => setNewForm({ ...newForm, request_date: e.target.value })}
              />
            </div>

            {/* Filing Type */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '8px' }}>
                {zh ? '申請類型 *' : 'Filing Type *'}
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {(['pre', 'post'] as const).map(type => (
                  <label
                    key={type}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '10px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${newForm.filing_type === type ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: newForm.filing_type === type ? 'var(--accent-primary-dim)' : 'transparent',
                      flex: 1,
                      fontSize: '13px',
                    }}
                  >
                    <input
                      type="radio"
                      name="filing_type"
                      value={type}
                      checked={newForm.filing_type === type}
                      onChange={() => setNewForm({ ...newForm, filing_type: type, ot_hours: '' })}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    {type === 'pre'
                      ? (zh ? '事前申請 (Pre-Approval)' : 'Pre-Approval')
                      : (zh ? '事後補報 (Post-Filing)' : 'Post-Filing')}
                  </label>
                ))}
              </div>
            </div>

            {/* Conditional fields */}
            {newForm.filing_type === 'pre' ? (
              <div style={{ marginBottom: '16px' }}>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '預計加班結束時間' : 'Planned OT End Time'}
                </label>
                <input
                  type="time"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={newForm.planned_end_time}
                  onChange={e => setNewForm({ ...newForm, planned_end_time: e.target.value })}
                />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                    {zh ? '實際開始時間' : 'Actual OT Start'}
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={newForm.actual_start_time}
                    onChange={e => handleActualTimeChange('actual_start_time', e.target.value)}
                  />
                </div>
                <div>
                  <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                    {zh ? '實際結束時間' : 'Actual OT End'}
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={newForm.actual_end_time}
                    onChange={e => handleActualTimeChange('actual_end_time', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* OT Hours */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '加班時數' : 'OT Hours'}
                {newForm.filing_type === 'post' && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px', fontSize: '11px' }}>
                    ({zh ? '從時間自動計算' : 'auto-calculated from times'})
                  </span>
                )}
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="input-field"
                style={{ width: '100%' }}
                placeholder="0.0"
                value={newForm.ot_hours}
                readOnly={newForm.filing_type === 'post' && !!(newForm.actual_start_time && newForm.actual_end_time)}
                onChange={e => setNewForm({ ...newForm, ot_hours: e.target.value })}
              />
            </div>

            {/* OT Compensation */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '加班補償方式 *' : 'OT Compensation *'}
              </label>
              <select
                className="input-field"
                style={{ width: '100%' }}
                value={newForm.ot_type}
                onChange={e => setNewForm({ ...newForm, ot_type: e.target.value as 'pay' | 'comp' })}
              >
                <option value="pay">{zh ? '加班費 (Pay)' : 'Pay (Overtime Pay)'}</option>
                <option value="comp">{zh ? '補休 (Comp Time)' : 'Comp Time'}</option>
              </select>
            </div>

            {/* Reason */}
            <div style={{ marginBottom: '20px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '加班原因' : 'Reason'}
              </label>
              <textarea
                className="input-field"
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder={zh ? '請說明加班原因…' : 'Describe the reason for overtime…'}
                value={newForm.reason}
                onChange={e => setNewForm({ ...newForm, reason: e.target.value })}
              />
            </div>

            {/* Error */}
            {submitError && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(244,63,94,0.1)',
                color: '#f43f5e',
                fontSize: '13px',
                marginBottom: '16px',
                border: '1px solid rgba(244,63,94,0.25)',
              }}>
                {submitError}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowNewModal(false); resetNewForm() }}
                disabled={submitting}
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleNewSubmit}
                disabled={submitting || !newForm.user_id || !newForm.request_date}
              >
                {submitting ? (zh ? '送出中…' : 'Submitting…') : (zh ? '送出申請' : 'Submit Request')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
