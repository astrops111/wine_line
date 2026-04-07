import { useEffect, useState } from 'react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { getLocale } from '../lib/i18n'
import { useOrg } from '../lib/OrgContext'
import { calcHoursFromDatetime, getCurrentMonthRange } from '../lib/overtimeHelpers'
import type {
  Store,
  UserRecord,
  OvertimeRequest,
  NewRequestForm,
  MonthlyStats,
  RiskEntry,
} from '../types/overtime'
import { PendingTab } from '../components/Overtime/PendingTab'
import { AllRecordsTab } from '../components/Overtime/AllRecordsTab'
import { RiskTab } from '../components/Overtime/RiskTab'

// ─── Main Component (Orchestrator) ──────────────────────────────────────────

export function OvertimeRequests() {
  const zh = getLocale() === 'zh-TW'
  const { orgId, currentUser } = useOrg()

  // Tab state
  const [tab, setTab] = useState<'pending' | 'all' | 'risk'>('pending')

  // ── Tab 1: Pending state ──────────────────────────────────────────────────
  const [pendingRequests, setPendingRequests] = useState<OvertimeRequest[]>([])
  const [pendingLoading, setPendingLoading] = useState(true)
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({ approvedHours: 0, totalHours: 0 })
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // ── Tab 2: All Records state ──────────────────────────────────────────────
  const [allRequests, setAllRequests] = useState<OvertimeRequest[]>([])
  const [allLoading, setAllLoading] = useState(true)
  const [stores, setStores] = useState<Store[]>([])
  const [activeUsers, setActiveUsers] = useState<UserRecord[]>([])

  // ── Tab 3: Risk state ─────────────────────────────────────────────────────
  const [riskData, setRiskData] = useState<RiskEntry[]>([])
  const [riskLoading, setRiskLoading] = useState(true)

  // ─── LINE HR Notify helper ─────────────────────────────────────────────────

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
      .select('*, user:users(name, store:stores!store_id(name))')
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
      .select('*, user:users(name, store:stores!store_id(name))')
      .eq('organization_id', orgId)
      .order('request_date', { ascending: false })
    setAllRequests((data as OvertimeRequest[]) || [])
    setAllLoading(false)
  }

  async function loadRiskData() {
    setRiskLoading(true)
    const { start, end } = getCurrentMonthRange()

    // 3-month rolling window start (§32-1: 138h cap per 3 months)
    const now = new Date()
    const threeMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0]

    // Load users with store info
    const { data: users } = await supabase
      .from('users')
      .select('id, name, status, store_id, organization_id, max_hours_per_week, store:stores(id, name)')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('name')

    // Load approved OT for 3-month rolling window
    const { data: approved } = await supabase
      .from('overtime_requests')
      .select('user_id, ot_hours, request_date')
      .eq('organization_id', orgId)
      .eq('status', 'approved')
      .gte('request_date', threeMonthStart)
      .lte('request_date', end)

    if (users) {
      const monthlyMap: Record<string, number> = {}
      const threeMonthMap: Record<string, number> = {}
      if (approved) {
        for (const r of approved) {
          threeMonthMap[r.user_id] = (threeMonthMap[r.user_id] || 0) + (r.ot_hours || 0)
          if (r.request_date >= start) {
            monthlyMap[r.user_id] = (monthlyMap[r.user_id] || 0) + (r.ot_hours || 0)
          }
        }
      }
      const result = (users as UserRecord[]).map(u => ({
        user: u,
        approvedHours: monthlyMap[u.id] || 0,
        threeMonthHours: threeMonthMap[u.id] || 0,
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
      })
    }

    setActionLoading(null)
    await loadPendingRequests()
    await loadMonthlyStats()
    if (allRequests.length > 0) loadAllRequests()
  }

  async function handleReject(req: OvertimeRequest, reason: string) {
    setActionLoading(req.id)
    const now = new Date().toISOString()

    await supabase
      .from('overtime_requests')
      .update({
        status: 'rejected',
        rejection_reason: reason,
        updated_at: now,
      })
      .eq('id', req.id)

    await notifyEmployee(req.user_id, 'ot_rejected', {
      request_date: req.request_date,
      ot_hours: req.ot_hours || 0,
      ot_type: req.ot_type,
      filing_type: req.filing_type,
      rejection_reason: reason,
    })

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
    loadAllRequests()
  }

  // ─── New Request Submit ───────────────────────────────────────────────────

  async function handleNewSubmit(form: NewRequestForm): Promise<string | null> {
    let computedHours = parseFloat(form.ot_hours) || 0
    if (form.filing_type === 'post' && form.actual_start_time && form.actual_end_time) {
      computedHours = calcHoursFromDatetime(form.actual_start_time, form.actual_end_time)
    }

    const selectedUser = activeUsers.find(u => u.id === form.user_id)

    const insertData: Record<string, unknown> = {
      organization_id: orgId,
      store_id: selectedUser?.store_id ?? null,
      user_id: form.user_id,
      request_date: form.request_date,
      filing_type: form.filing_type,
      ot_type: form.ot_type,
      ot_hours: computedHours || null,
      reason: form.reason || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (form.filing_type === 'pre') {
      insertData.planned_end_time = form.planned_end_time || null
    } else {
      insertData.actual_start_time = form.actual_start_time || null
      insertData.actual_end_time = form.actual_end_time || null
    }

    const { error } = await supabase.from('overtime_requests').insert(insertData)

    if (error) {
      return error.message
    }

    await loadAllRequests()
    await loadPendingRequests()
    await loadMonthlyStats()
    return null
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
        <PendingTab
          zh={zh}
          pendingRequests={pendingRequests}
          pendingLoading={pendingLoading}
          monthlyStats={monthlyStats}
          onApprove={handleApprove}
          onReject={handleReject}
          actionLoading={actionLoading}
        />
      )}

      {/* ── TAB 2: ALL RECORDS ────────────────────────────────────────────── */}
      {tab === 'all' && (
        <AllRecordsTab
          zh={zh}
          allRequests={allRequests}
          allLoading={allLoading}
          stores={stores}
          activeUsers={activeUsers}
          onCancel={handleCancel}
          onNewSubmit={handleNewSubmit}
        />
      )}

      {/* ── TAB 3: RISK OVERVIEW ──────────────────────────────────────────── */}
      {tab === 'risk' && (
        <RiskTab
          zh={zh}
          riskData={riskData}
          riskLoading={riskLoading}
        />
      )}
    </div>
  )
}
