import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getLocale } from '../lib/i18n'
import { useOrg } from '../lib/OrgContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeaveType {
  id: string
  org_id: string
  code: string
  name_zh: string
  name_en: string
  is_paid: boolean
  max_days_per_year: number
  requires_approval: boolean
  requires_document: boolean
  is_active: boolean
  sort_order: number
  color: string
}

interface LeaveRule {
  id: string
  org_id: string
  leave_type_id: string
  min_tenure_months: number
  accrual_days: number
  carry_over_allowed: boolean
  carry_over_max_days: number
  prorate_first_year: boolean
}

interface ImportRow {
  employee_id: string
  employee_name: string
  leave_type: string
  balance_days: number
  year: number
}

interface SettlementRow {
  user_id: string
  employee_name: string
  unused_special_leave_days: number
  daily_rate: number
  settlement_amount: number
  ot_hours: number
  ot_rate: number
  ot_amount: number
  total: number
}

interface LeaveSettlement {
  id: string
  org_id: string
  user_id: string
  year: number
  unused_days: number
  daily_rate: number
  settlement_amount: number
  ot_hours: number
  ot_rate: number
  ot_amount: number
  status: string
  user?: { name: string }
}

interface BalanceCell {
  entitled: number
  used: number
  remaining: number
}

interface ComparisonRow {
  user_id: string
  employee_name: string
  store_name: string
  balances: Record<string, BalanceCell>
}

type TabKey = 'types' | 'rules' | 'import' | 'settlement' | 'comparison'

// ─── Default leave type templates ────────────────────────────────────────────

const DEFAULT_LEAVE_TYPES: Omit<LeaveType, 'id' | 'org_id'>[] = [
  { code: 'personal', name_zh: '事假', name_en: 'Personal Leave', is_paid: false, max_days_per_year: 14, requires_approval: true, requires_document: false, is_active: true, sort_order: 1, color: '#6366f1' },
  { code: 'sick', name_zh: '病假', name_en: 'Sick Leave', is_paid: true, max_days_per_year: 30, requires_approval: true, requires_document: true, is_active: true, sort_order: 2, color: '#ef4444' },
  { code: 'annual', name_zh: '特休', name_en: 'Annual Leave', is_paid: true, max_days_per_year: 30, requires_approval: true, requires_document: false, is_active: true, sort_order: 3, color: '#22c55e' },
  { code: 'official', name_zh: '公假', name_en: 'Official Leave', is_paid: true, max_days_per_year: 365, requires_approval: true, requires_document: true, is_active: true, sort_order: 4, color: '#3b82f6' },
  { code: 'marriage', name_zh: '婚假', name_en: 'Marriage Leave', is_paid: true, max_days_per_year: 8, requires_approval: true, requires_document: true, is_active: true, sort_order: 5, color: '#ec4899' },
  { code: 'bereavement', name_zh: '喪假', name_en: 'Bereavement Leave', is_paid: true, max_days_per_year: 8, requires_approval: true, requires_document: true, is_active: true, sort_order: 6, color: '#6b7280' },
  { code: 'maternity', name_zh: '產假', name_en: 'Maternity Leave', is_paid: true, max_days_per_year: 56, requires_approval: true, requires_document: true, is_active: true, sort_order: 7, color: '#f59e0b' },
  { code: 'paternity', name_zh: '陪產假', name_en: 'Paternity Leave', is_paid: true, max_days_per_year: 7, requires_approval: true, requires_document: true, is_active: true, sort_order: 8, color: '#14b8a6' },
  { code: 'work_injury', name_zh: '公傷假', name_en: 'Work Injury Leave', is_paid: true, max_days_per_year: 365, requires_approval: true, requires_document: true, is_active: true, sort_order: 9, color: '#f97316' },
]

// ─── Component ───────────────────────────────────────────────────────────────

export function LeaveSettings() {
  const zh = getLocale() === 'zh-TW'
  const { orgId } = useOrg()

  const [tab, setTab] = useState<TabKey>('types')
  const [loading, setLoading] = useState(false)

  // ── Tab 1: Leave Types ──
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [showTypeForm, setShowTypeForm] = useState(false)
  const [editTypeId, setEditTypeId] = useState<string | null>(null)
  const [typeForm, setTypeForm] = useState({
    code: '', name_zh: '', name_en: '', is_paid: true, max_days_per_year: '0',
    requires_approval: true, requires_document: false, is_active: true, sort_order: '0', color: '#6366f1',
  })

  // ── Tab 2: Leave Rules ──
  const [leaveRules, setLeaveRules] = useState<LeaveRule[]>([])
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editRuleId, setEditRuleId] = useState<string | null>(null)
  const [ruleForm, setRuleForm] = useState({
    leave_type_id: '', min_tenure_months: '0', accrual_days: '0',
    carry_over_allowed: false, carry_over_max_days: '0', prorate_first_year: false,
  })

  // ── Tab 3: Import ──
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importYear, setImportYear] = useState(new Date().getFullYear())
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null)
  const [importing, setImporting] = useState(false)

  // ── Tab 4: Settlement ──
  const [settlementYear, setSettlementYear] = useState(new Date().getFullYear())
  const [settlementStoreFilter, setSettlementStoreFilter] = useState('all')
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>([])
  const [settlements, setSettlements] = useState<LeaveSettlement[]>([])
  const [stores, setStores] = useState<{ id: string; name: string }[]>([])
  const [settling, setSettling] = useState(false)

  // ── Tab 5: Comparison ──
  const [compYear, setCompYear] = useState(new Date().getFullYear())
  const [compStoreFilter, setCompStoreFilter] = useState('all')
  const [compRows, setCompRows] = useState<ComparisonRow[]>([])
  const [compLeaveTypes, setCompLeaveTypes] = useState<LeaveType[]>([])

  // ─── Load stores (shared) ──────────────────────────────────────────────────

  useEffect(() => {
    if (!orgId) return
    supabase.from('stores').select('id, name').order('name').then(({ data }) => setStores(data || []))
  }, [orgId])

  // ─── Tab switching loader ──────────────────────────────────────────────────

  useEffect(() => {
    if (!orgId) return
    if (tab === 'types') loadLeaveTypes()
    if (tab === 'rules') { loadLeaveTypes(); loadLeaveRules() }
    if (tab === 'settlement') { loadSettlements(); loadSettlementPreview() }
    if (tab === 'comparison') loadComparison()
  }, [tab, orgId])

  // ─── Tab 1: Leave Types CRUD ───────────────────────────────────────────────

  async function loadLeaveTypes() {
    setLoading(true)
    const { data } = await supabase.from('leave_types')
      .select('*').eq('org_id', orgId).order('sort_order')
    setLeaveTypes(data || [])
    setLoading(false)
  }

  function resetTypeForm() {
    setTypeForm({ code: '', name_zh: '', name_en: '', is_paid: true, max_days_per_year: '0', requires_approval: true, requires_document: false, is_active: true, sort_order: '0', color: '#6366f1' })
    setEditTypeId(null)
    setShowTypeForm(false)
  }

  function startEditType(lt: LeaveType) {
    setEditTypeId(lt.id)
    setTypeForm({
      code: lt.code, name_zh: lt.name_zh, name_en: lt.name_en,
      is_paid: lt.is_paid, max_days_per_year: String(lt.max_days_per_year),
      requires_approval: lt.requires_approval, requires_document: lt.requires_document,
      is_active: lt.is_active, sort_order: String(lt.sort_order), color: lt.color || '#6366f1',
    })
    setShowTypeForm(true)
  }

  async function saveLeaveType() {
    if (!typeForm.code || !typeForm.name_zh) return
    const payload = {
      org_id: orgId, code: typeForm.code, name_zh: typeForm.name_zh, name_en: typeForm.name_en || typeForm.name_zh,
      is_paid: typeForm.is_paid, max_days_per_year: Number(typeForm.max_days_per_year) || 0,
      requires_approval: typeForm.requires_approval, requires_document: typeForm.requires_document,
      is_active: typeForm.is_active, sort_order: Number(typeForm.sort_order) || 0, color: typeForm.color,
    }
    if (editTypeId) {
      await supabase.from('leave_types').update(payload).eq('id', editTypeId)
    } else {
      await supabase.from('leave_types').insert(payload)
    }
    resetTypeForm()
    await loadLeaveTypes()
  }

  async function deleteLeaveType(id: string) {
    if (!confirm(zh ? '確定刪除此假別？' : 'Delete this leave type?')) return
    await supabase.from('leave_types').delete().eq('id', id)
    await loadLeaveTypes()
  }

  async function seedDefaults() {
    if (!confirm(zh ? '確定匯入預設假別？（不會覆蓋已存在的假別）' : 'Import default leave types? (will not overwrite existing)')) return
    const existing = leaveTypes.map(lt => lt.code)
    const toInsert = DEFAULT_LEAVE_TYPES.filter(d => !existing.includes(d.code)).map(d => ({ ...d, org_id: orgId }))
    if (toInsert.length > 0) {
      await supabase.from('leave_types').insert(toInsert)
    }
    await loadLeaveTypes()
  }

  // ─── Tab 2: Leave Rules CRUD ───────────────────────────────────────────────

  async function loadLeaveRules() {
    const { data } = await supabase.from('leave_rules')
      .select('*').eq('org_id', orgId).order('leave_type_id').order('min_tenure_months')
    setLeaveRules(data || [])
  }

  function resetRuleForm() {
    setRuleForm({ leave_type_id: '', min_tenure_months: '0', accrual_days: '0', carry_over_allowed: false, carry_over_max_days: '0', prorate_first_year: false })
    setEditRuleId(null)
    setShowRuleForm(false)
  }

  function startEditRule(r: LeaveRule) {
    setEditRuleId(r.id)
    setRuleForm({
      leave_type_id: r.leave_type_id, min_tenure_months: String(r.min_tenure_months),
      accrual_days: String(r.accrual_days), carry_over_allowed: r.carry_over_allowed,
      carry_over_max_days: String(r.carry_over_max_days), prorate_first_year: r.prorate_first_year,
    })
    setShowRuleForm(true)
  }

  async function saveLeaveRule() {
    if (!ruleForm.leave_type_id) return
    const payload = {
      org_id: orgId, leave_type_id: ruleForm.leave_type_id,
      min_tenure_months: Number(ruleForm.min_tenure_months) || 0,
      accrual_days: Number(ruleForm.accrual_days) || 0,
      carry_over_allowed: ruleForm.carry_over_allowed,
      carry_over_max_days: Number(ruleForm.carry_over_max_days) || 0,
      prorate_first_year: ruleForm.prorate_first_year,
    }
    if (editRuleId) {
      await supabase.from('leave_rules').update(payload).eq('id', editRuleId)
    } else {
      await supabase.from('leave_rules').insert(payload)
    }
    resetRuleForm()
    await loadLeaveRules()
  }

  async function deleteLeaveRule(id: string) {
    if (!confirm(zh ? '確定刪除此規則？' : 'Delete this rule?')) return
    await supabase.from('leave_rules').delete().eq('id', id)
    await loadLeaveRules()
  }

  // ─── Tab 3: CSV Import ────────────────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.trim().split('\n')
      const rows: ImportRow[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        if (cols.length >= 4) {
          rows.push({
            employee_id: cols[0],
            employee_name: cols[1] || cols[0],
            leave_type: cols[2],
            balance_days: Number(cols[3]) || 0,
            year: Number(cols[4]) || importYear,
          })
        }
      }
      setImportRows(rows)
    }
    reader.readAsText(file)
  }

  async function executeImport() {
    if (importRows.length === 0) return
    setImporting(true)
    let success = 0, failed = 0
    for (const row of importRows) {
      const { error } = await supabase.from('leave_balances').upsert({
        organization_id: orgId,
        user_id: row.employee_id,
        leave_type: row.leave_type,
        year: row.year,
        entitled_days: row.balance_days,
        used_days: 0,
        remaining_days: row.balance_days,
      }, { onConflict: 'organization_id,user_id,leave_type,year' })
      if (error) failed++; else success++
    }
    setImportResult({ success, failed })
    setImporting(false)
  }

  // ─── Tab 4: Settlement ────────────────────────────────────────────────────

  async function loadSettlements() {
    const { data } = await supabase.from('leave_settlements')
      .select('*, user:users(name)')
      .eq('org_id', orgId).eq('year', settlementYear)
      .order('created_at', { ascending: false })
    setSettlements(data || [])
  }

  async function loadSettlementPreview() {
    setLoading(true)
    // Get employees with their balances and OT data
    let empQuery = supabase.from('users')
      .select('id, name, store_id, salary_amount')
      .eq('organization_id', orgId).eq('status', 'active')
    if (settlementStoreFilter !== 'all') {
      empQuery = empQuery.eq('store_id', settlementStoreFilter)
    }
    const { data: employees } = await empQuery

    if (!employees || employees.length === 0) { setSettlementRows([]); setLoading(false); return }

    const userIds = employees.map(e => e.id)

    // Get annual leave balances
    const { data: balances } = await supabase.from('leave_balances')
      .select('*').eq('organization_id', orgId).eq('year', settlementYear)
      .eq('leave_type', 'annual').in('user_id', userIds)

    // Get approved OT hours
    const { data: otData } = await supabase.from('overtime_requests')
      .select('user_id, approved_hours')
      .eq('organization_id', orgId).eq('status', 'approved')
      .gte('date', `${settlementYear}-01-01`).lte('date', `${settlementYear}-12-31`)
      .in('user_id', userIds)

    const balanceMap: Record<string, any> = {}
    ;(balances || []).forEach(b => { balanceMap[b.user_id] = b })

    const otMap: Record<string, number> = {}
    ;(otData || []).forEach(o => { otMap[o.user_id] = (otMap[o.user_id] || 0) + (o.approved_hours || 0) })

    const rows: SettlementRow[] = employees.map(emp => {
      const bal = balanceMap[emp.id]
      const unusedDays = bal ? Math.max(0, (bal.remaining_days || 0)) : 0
      const monthlySalary = emp.salary_amount || 0
      const dailyRate = monthlySalary > 0 ? Math.round(monthlySalary / 30) : 0
      const otHours = otMap[emp.id] || 0
      const otRate = monthlySalary > 0 ? Math.round((monthlySalary / 30 / 8) * 1.34) : 0
      return {
        user_id: emp.id,
        employee_name: emp.name,
        unused_special_leave_days: unusedDays,
        daily_rate: dailyRate,
        settlement_amount: unusedDays * dailyRate,
        ot_hours: otHours,
        ot_rate: otRate,
        ot_amount: Math.round(otHours * otRate),
        total: unusedDays * dailyRate + Math.round(otHours * otRate),
      }
    })
    setSettlementRows(rows.filter(r => r.total > 0))
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'settlement' && orgId) { loadSettlements(); loadSettlementPreview() }
  }, [settlementYear, settlementStoreFilter])

  async function createSettlements() {
    if (settlementRows.length === 0) return
    if (!confirm(zh ? `確定結算 ${settlementRows.length} 位員工？` : `Settle for ${settlementRows.length} employees?`)) return
    setSettling(true)
    const records = settlementRows.map(r => ({
      org_id: orgId, user_id: r.user_id, year: settlementYear,
      unused_days: r.unused_special_leave_days, daily_rate: r.daily_rate,
      settlement_amount: r.settlement_amount, ot_hours: r.ot_hours,
      ot_rate: r.ot_rate, ot_amount: r.ot_amount, status: 'pending',
    }))
    await supabase.from('leave_settlements').insert(records)
    setSettling(false)
    await loadSettlements()
  }

  // ─── Tab 5: Leave Comparison ──────────────────────────────────────────────

  async function loadComparison() {
    setLoading(true)
    const { data: types } = await supabase.from('leave_types')
      .select('*').eq('org_id', orgId).eq('is_active', true).order('sort_order')
    setCompLeaveTypes(types || [])

    let empQuery = supabase.from('users')
      .select('id, name, store_id, store:stores!store_id(name)')
      .eq('organization_id', orgId).eq('status', 'active').order('name')
    if (compStoreFilter !== 'all') {
      empQuery = empQuery.eq('store_id', compStoreFilter)
    }
    const { data: employees } = await empQuery

    if (!employees || employees.length === 0) { setCompRows([]); setLoading(false); return }

    const userIds = employees.map((e: any) => e.id)

    const { data: balances } = await supabase.from('leave_balances')
      .select('*').eq('organization_id', orgId).eq('year', compYear).in('user_id', userIds)

    const { data: requests } = await supabase.from('leave_requests')
      .select('user_id, leave_type, total_days')
      .eq('organization_id', orgId).eq('status', 'approved')
      .gte('start_date', `${compYear}-01-01`).lte('start_date', `${compYear}-12-31`)
      .in('user_id', userIds)

    // Build balance map: user_id -> leave_type -> entitled
    const balMap: Record<string, Record<string, number>> = {}
    ;(balances || []).forEach((b: any) => {
      if (!balMap[b.user_id]) balMap[b.user_id] = {}
      balMap[b.user_id][b.leave_type] = b.entitled_days || 0
    })

    // Build used map: user_id -> leave_type -> used
    const usedMap: Record<string, Record<string, number>> = {}
    ;(requests || []).forEach((r: any) => {
      if (!usedMap[r.user_id]) usedMap[r.user_id] = {}
      usedMap[r.user_id][r.leave_type] = (usedMap[r.user_id][r.leave_type] || 0) + (r.total_days || 0)
    })

    const rows: ComparisonRow[] = employees.map((emp: any) => {
      const balances: Record<string, BalanceCell> = {}
      ;(types || []).forEach(lt => {
        const entitled = balMap[emp.id]?.[lt.code] || 0
        const used = usedMap[emp.id]?.[lt.code] || 0
        balances[lt.code] = { entitled, used, remaining: entitled - used }
      })
      return {
        user_id: emp.id,
        employee_name: emp.name,
        store_name: emp.store?.name || '-',
        balances,
      }
    })
    setCompRows(rows)
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'comparison' && orgId) loadComparison()
  }, [compYear, compStoreFilter])

  function exportComparisonCSV() {
    if (compRows.length === 0) return
    const typeHeaders = compLeaveTypes.map(lt => zh ? lt.name_zh : lt.name_en)
    const subHeaders = compLeaveTypes.flatMap(() => [
      zh ? '應休' : 'Entitled', zh ? '已用' : 'Used', zh ? '剩餘' : 'Remaining'
    ])
    const header1 = [zh ? '員工' : 'Employee', zh ? '門市' : 'Store', ...typeHeaders.flatMap(h => [h, '', ''])]
    const header2 = ['', '', ...subHeaders]
    const dataRows = compRows.map(r => {
      const cells = compLeaveTypes.flatMap(lt => {
        const c = r.balances[lt.code] || { entitled: 0, used: 0, remaining: 0 }
        return [c.entitled, c.used, c.remaining]
      })
      return [r.employee_name, r.store_name, ...cells]
    })
    const csv = [header1.join(','), header2.join(','), ...dataRows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `leave_comparison_${compYear}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Tab definitions ──────────────────────────────────────────────────────

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'types', label: zh ? '假別設定' : 'Leave Type Setup' },
    { key: 'rules', label: zh ? '休假規則設定' : 'Leave Rules' },
    { key: 'import', label: zh ? '可休假匯入作業' : 'Leave Balance Import' },
    { key: 'settlement', label: zh ? '特休及加班費結算' : 'Special Leave & OT Settlement' },
    { key: 'comparison', label: zh ? '假期對照表' : 'Leave Comparison Table' },
  ]

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>{zh ? '假勤設定' : 'Leave Settings'}</h1>
        <p className="page-subtitle">{zh ? '管理假別、規則、匯入、結算與對照表' : 'Manage leave types, rules, import, settlement and comparison'}</p>
      </div>

      {/* Tab bar */}
      <div className="tab-bar" style={{ marginBottom: '20px' }}>
        {tabs.map(t => (
          <button key={t.key} className={`tab-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 1: Leave Type Setup                                               */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'types' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => { resetTypeForm(); setShowTypeForm(true) }}>
              + {zh ? '新增假別' : 'Add Leave Type'}
            </button>
            <button className="btn btn-primary" style={{ background: 'var(--color-secondary, #6b7280)' }} onClick={seedDefaults}>
              {zh ? '匯入預設假別' : 'Import Defaults'}
            </button>
          </div>

          {/* Form */}
          {showTypeForm && (
            <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
              <h3 style={{ marginBottom: '12px' }}>{editTypeId ? (zh ? '編輯假別' : 'Edit Leave Type') : (zh ? '新增假別' : 'New Leave Type')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="detail-label">{zh ? '代碼' : 'Code'}</label>
                  <input className="input-field" value={typeForm.code} onChange={e => setTypeForm({ ...typeForm, code: e.target.value })} placeholder="e.g. personal" />
                </div>
                <div>
                  <label className="detail-label">{zh ? '中文名稱' : 'Name (ZH)'}</label>
                  <input className="input-field" value={typeForm.name_zh} onChange={e => setTypeForm({ ...typeForm, name_zh: e.target.value })} placeholder="e.g. 事假" />
                </div>
                <div>
                  <label className="detail-label">{zh ? '英文名稱' : 'Name (EN)'}</label>
                  <input className="input-field" value={typeForm.name_en} onChange={e => setTypeForm({ ...typeForm, name_en: e.target.value })} placeholder="e.g. Personal Leave" />
                </div>
                <div>
                  <label className="detail-label">{zh ? '每年上限天數' : 'Max Days/Year'}</label>
                  <input className="input-field" type="number" value={typeForm.max_days_per_year} onChange={e => setTypeForm({ ...typeForm, max_days_per_year: e.target.value })} />
                </div>
                <div>
                  <label className="detail-label">{zh ? '排序' : 'Sort Order'}</label>
                  <input className="input-field" type="number" value={typeForm.sort_order} onChange={e => setTypeForm({ ...typeForm, sort_order: e.target.value })} />
                </div>
                <div>
                  <label className="detail-label">{zh ? '顏色' : 'Color'}</label>
                  <input type="color" value={typeForm.color} onChange={e => setTypeForm({ ...typeForm, color: e.target.value })} style={{ width: '100%', height: '36px', border: 'none', cursor: 'pointer' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={typeForm.is_paid} onChange={e => setTypeForm({ ...typeForm, is_paid: e.target.checked })} />
                  {zh ? '有薪' : 'Paid'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={typeForm.requires_approval} onChange={e => setTypeForm({ ...typeForm, requires_approval: e.target.checked })} />
                  {zh ? '需審核' : 'Requires Approval'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={typeForm.requires_document} onChange={e => setTypeForm({ ...typeForm, requires_document: e.target.checked })} />
                  {zh ? '需附件' : 'Requires Document'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={typeForm.is_active} onChange={e => setTypeForm({ ...typeForm, is_active: e.target.checked })} />
                  {zh ? '啟用' : 'Active'}
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button className="btn btn-primary" onClick={saveLeaveType}>{zh ? '儲存' : 'Save'}</button>
                <button className="btn" onClick={resetTypeForm}>{zh ? '取消' : 'Cancel'}</button>
              </div>
            </div>
          )}

          {/* Table */}
          {loading ? <p>{zh ? '載入中...' : 'Loading...'}</p> : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color, #e5e7eb)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>{zh ? '顏色' : 'Color'}</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>{zh ? '代碼' : 'Code'}</th>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>{zh ? '名稱' : 'Name'}</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px' }}>{zh ? '有薪' : 'Paid'}</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px' }}>{zh ? '上限' : 'Max'}</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px' }}>{zh ? '審核' : 'Approval'}</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px' }}>{zh ? '附件' : 'Doc'}</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px' }}>{zh ? '狀態' : 'Status'}</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>{zh ? '操作' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveTypes.map(lt => (
                    <tr key={lt.id} style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                      <td style={{ padding: '8px' }}>
                        <span style={{ display: 'inline-block', width: '16px', height: '16px', borderRadius: '4px', background: lt.color || '#6366f1' }} />
                      </td>
                      <td style={{ padding: '8px', fontFamily: 'monospace' }}>{lt.code}</td>
                      <td style={{ padding: '8px' }}>{zh ? lt.name_zh : lt.name_en}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{lt.is_paid ? '✓' : '✗'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{lt.max_days_per_year}{zh ? '天' : 'd'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{lt.requires_approval ? '✓' : '✗'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{lt.requires_document ? '✓' : '✗'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', background: lt.is_active ? '#dcfce7' : '#fee2e2', color: lt.is_active ? '#166534' : '#991b1b' }}>
                          {lt.is_active ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <button className="btn" style={{ marginRight: '4px', fontSize: '12px', padding: '4px 8px' }} onClick={() => startEditType(lt)}>
                          {zh ? '編輯' : 'Edit'}
                        </button>
                        <button className="btn" style={{ fontSize: '12px', padding: '4px 8px', color: '#ef4444' }} onClick={() => deleteLeaveType(lt.id)}>
                          {zh ? '刪除' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {leaveTypes.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {zh ? '尚無假別設定，請新增或匯入預設' : 'No leave types yet. Add or import defaults.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 2: Leave Rules                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'rules' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <button className="btn btn-primary" onClick={() => { resetRuleForm(); setShowRuleForm(true) }}>
              + {zh ? '新增規則' : 'Add Rule'}
            </button>
          </div>

          {showRuleForm && (
            <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
              <h3 style={{ marginBottom: '12px' }}>{editRuleId ? (zh ? '編輯規則' : 'Edit Rule') : (zh ? '新增規則' : 'New Rule')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="detail-label">{zh ? '假別' : 'Leave Type'}</label>
                  <select className="input-field" value={ruleForm.leave_type_id} onChange={e => setRuleForm({ ...ruleForm, leave_type_id: e.target.value })}>
                    <option value="">{zh ? '-- 選擇假別 --' : '-- Select --'}</option>
                    {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{zh ? lt.name_zh : lt.name_en}</option>)}
                  </select>
                </div>
                <div>
                  <label className="detail-label">{zh ? '最低年資（月）' : 'Min Tenure (months)'}</label>
                  <input className="input-field" type="number" value={ruleForm.min_tenure_months} onChange={e => setRuleForm({ ...ruleForm, min_tenure_months: e.target.value })} />
                </div>
                <div>
                  <label className="detail-label">{zh ? '可休天數' : 'Accrual Days'}</label>
                  <input className="input-field" type="number" value={ruleForm.accrual_days} onChange={e => setRuleForm({ ...ruleForm, accrual_days: e.target.value })} />
                </div>
                <div>
                  <label className="detail-label">{zh ? '遞延上限天數' : 'Carry Over Max Days'}</label>
                  <input className="input-field" type="number" value={ruleForm.carry_over_max_days} onChange={e => setRuleForm({ ...ruleForm, carry_over_max_days: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={ruleForm.carry_over_allowed} onChange={e => setRuleForm({ ...ruleForm, carry_over_allowed: e.target.checked })} />
                  {zh ? '允許遞延' : 'Allow Carry Over'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={ruleForm.prorate_first_year} onChange={e => setRuleForm({ ...ruleForm, prorate_first_year: e.target.checked })} />
                  {zh ? '首年按比例' : 'Prorate First Year'}
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button className="btn btn-primary" onClick={saveLeaveRule}>{zh ? '儲存' : 'Save'}</button>
                <button className="btn" onClick={resetRuleForm}>{zh ? '取消' : 'Cancel'}</button>
              </div>
            </div>
          )}

          {/* Rules grouped by leave type */}
          {leaveTypes.filter(lt => leaveRules.some(r => r.leave_type_id === lt.id)).map(lt => (
            <div key={lt.id} className="card" style={{ marginBottom: '12px', padding: '16px' }}>
              <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '3px', background: lt.color || '#6366f1' }} />
                {zh ? lt.name_zh : lt.name_en}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color, #e5e7eb)' }}>
                    <th style={{ textAlign: 'left', padding: '8px' }}>{zh ? '最低年資（月）' : 'Min Tenure (mo)'}</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>{zh ? '可休天數' : 'Accrual Days'}</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>{zh ? '允許遞延' : 'Carry Over'}</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>{zh ? '遞延上限' : 'Max Carry'}</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>{zh ? '首年按比例' : 'Prorate'}</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>{zh ? '操作' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveRules.filter(r => r.leave_type_id === lt.id).map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                      <td style={{ padding: '8px' }}>{r.min_tenure_months} {zh ? '個月' : 'months'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{r.accrual_days} {zh ? '天' : 'days'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{r.carry_over_allowed ? '✓' : '✗'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{r.carry_over_max_days} {zh ? '天' : 'days'}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{r.prorate_first_year ? '✓' : '✗'}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <button className="btn" style={{ marginRight: '4px', fontSize: '12px', padding: '4px 8px' }} onClick={() => startEditRule(r)}>
                          {zh ? '編輯' : 'Edit'}
                        </button>
                        <button className="btn" style={{ fontSize: '12px', padding: '4px 8px', color: '#ef4444' }} onClick={() => deleteLeaveRule(r.id)}>
                          {zh ? '刪除' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {leaveRules.length === 0 && (
            <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              {zh ? '尚無休假規則，請先設定假別後新增規則' : 'No leave rules yet. Set up leave types first, then add rules.'}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 3: Leave Balance Import                                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'import' && (
        <div>
          <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
            <h3 style={{ marginBottom: '12px' }}>{zh ? 'CSV 匯入' : 'CSV Import'}</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              {zh
                ? 'CSV 格式：employee_id, employee_name, leave_type, balance_days, year（第一行為標題列）'
                : 'CSV format: employee_id, employee_name, leave_type, balance_days, year (first row = header)'}
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label className="detail-label">{zh ? '年度' : 'Year'}</label>
                <input className="input-field" type="number" value={importYear} onChange={e => setImportYear(Number(e.target.value))} style={{ width: '100px' }} />
              </div>
              <div>
                <label className="detail-label">{zh ? '選擇檔案' : 'Select File'}</label>
                <input type="file" accept=".csv" onChange={handleFileSelect} style={{ fontSize: '14px' }} />
              </div>
            </div>
          </div>

          {/* Preview */}
          {importRows.length > 0 && (
            <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3>{zh ? '預覽' : 'Preview'} ({importRows.length} {zh ? '筆' : 'rows'})</h3>
                <button className="btn btn-primary" onClick={executeImport} disabled={importing}>
                  {importing ? (zh ? '匯入中...' : 'Importing...') : (zh ? '確認匯入' : 'Confirm Import')}
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color, #e5e7eb)' }}>
                      <th style={{ textAlign: 'left', padding: '8px' }}>{zh ? '員工 ID' : 'Employee ID'}</th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>{zh ? '姓名' : 'Name'}</th>
                      <th style={{ textAlign: 'left', padding: '8px' }}>{zh ? '假別' : 'Leave Type'}</th>
                      <th style={{ textAlign: 'center', padding: '8px' }}>{zh ? '天數' : 'Days'}</th>
                      <th style={{ textAlign: 'center', padding: '8px' }}>{zh ? '年度' : 'Year'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 50).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                        <td style={{ padding: '8px', fontFamily: 'monospace' }}>{r.employee_id}</td>
                        <td style={{ padding: '8px' }}>{r.employee_name}</td>
                        <td style={{ padding: '8px' }}>{r.leave_type}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{r.balance_days}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>{r.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importRows.length > 50 && (
                  <p style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {zh ? `... 還有 ${importRows.length - 50} 筆` : `... and ${importRows.length - 50} more rows`}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="card" style={{ padding: '16px' }}>
              <h3 style={{ marginBottom: '8px' }}>{zh ? '匯入結果' : 'Import Result'}</h3>
              <p style={{ fontSize: '14px' }}>
                {zh ? `成功: ${importResult.success} 筆` : `Success: ${importResult.success}`}
                {importResult.failed > 0 && (
                  <span style={{ color: '#ef4444', marginLeft: '12px' }}>
                    {zh ? `失敗: ${importResult.failed} 筆` : `Failed: ${importResult.failed}`}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 4: Special Leave & OT Settlement                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'settlement' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="detail-label">{zh ? '年度' : 'Year'}</label>
              <select className="input-field" value={settlementYear} onChange={e => setSettlementYear(Number(e.target.value))}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="detail-label">{zh ? '門市' : 'Store'}</label>
              <select className="input-field" value={settlementStoreFilter} onChange={e => setSettlementStoreFilter(e.target.value)}>
                <option value="all">{zh ? '全部門市' : 'All Stores'}</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={createSettlements} disabled={settling || settlementRows.length === 0}>
              {settling ? (zh ? '結算中...' : 'Settling...') : (zh ? '執行結算' : 'Create Settlements')}
            </button>
          </div>

          {/* Preview table */}
          {loading ? <p>{zh ? '載入中...' : 'Loading...'}</p> : (
            <div className="card" style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <h3 style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                {zh ? '結算預覽' : 'Settlement Preview'}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color, #e5e7eb)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px' }}>{zh ? '員工' : 'Employee'}</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px' }}>{zh ? '未休特休(天)' : 'Unused Leave'}</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>{zh ? '日薪' : 'Daily Rate'}</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>{zh ? '特休折算' : 'Leave Amt'}</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px' }}>{zh ? '加班時數' : 'OT Hours'}</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>{zh ? '時薪' : 'OT Rate'}</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px' }}>{zh ? '加班費' : 'OT Amt'}</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 'bold' }}>{zh ? '合計' : 'Total'}</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementRows.map(r => (
                    <tr key={r.user_id} style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                      <td style={{ padding: '8px' }}>{r.employee_name}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{r.unused_special_leave_days}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>${r.daily_rate.toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>${r.settlement_amount.toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{r.ot_hours}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>${r.ot_rate.toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>${r.ot_amount.toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>${r.total.toLocaleString()}</td>
                    </tr>
                  ))}
                  {settlementRows.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {zh ? '無需結算的資料' : 'No settlement data'}
                    </td></tr>
                  )}
                </tbody>
                {settlementRows.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-color, #e5e7eb)', fontWeight: 'bold' }}>
                      <td style={{ padding: '10px 8px' }}>{zh ? '合計' : 'Total'}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>{settlementRows.reduce((s, r) => s + r.unused_special_leave_days, 0)}</td>
                      <td style={{ padding: '10px 8px' }}></td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>${settlementRows.reduce((s, r) => s + r.settlement_amount, 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>{settlementRows.reduce((s, r) => s + r.ot_hours, 0)}</td>
                      <td style={{ padding: '10px 8px' }}></td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>${settlementRows.reduce((s, r) => s + r.ot_amount, 0).toLocaleString()}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right' }}>${settlementRows.reduce((s, r) => s + r.total, 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Past settlements */}
          {settlements.length > 0 && (
            <div className="card" style={{ overflowX: 'auto' }}>
              <h3 style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                {zh ? '已結算紀錄' : 'Past Settlements'}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color, #e5e7eb)' }}>
                    <th style={{ textAlign: 'left', padding: '8px' }}>{zh ? '員工' : 'Employee'}</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>{zh ? '未休天數' : 'Unused Days'}</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>{zh ? '特休金額' : 'Leave Amt'}</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>{zh ? '加班金額' : 'OT Amt'}</th>
                    <th style={{ textAlign: 'center', padding: '8px' }}>{zh ? '狀態' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                      <td style={{ padding: '8px' }}>{s.user?.name || s.user_id}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{s.unused_days}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>${s.settlement_amount?.toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>${s.ot_amount?.toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', background: s.status === 'paid' ? '#dcfce7' : '#fef3c7', color: s.status === 'paid' ? '#166534' : '#92400e' }}>
                          {s.status === 'paid' ? (zh ? '已付' : 'Paid') : (zh ? '待付' : 'Pending')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Tab 5: Leave Comparison Table                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tab === 'comparison' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label className="detail-label">{zh ? '年度' : 'Year'}</label>
              <select className="input-field" value={compYear} onChange={e => setCompYear(Number(e.target.value))}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="detail-label">{zh ? '門市' : 'Store'}</label>
              <select className="input-field" value={compStoreFilter} onChange={e => setCompStoreFilter(e.target.value)}>
                <option value="all">{zh ? '全部門市' : 'All Stores'}</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={exportComparisonCSV} disabled={compRows.length === 0}>
              {zh ? '匯出 CSV' : 'Export CSV'}
            </button>
          </div>

          {loading ? <p>{zh ? '載入中...' : 'Loading...'}</p> : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                    <th rowSpan={2} style={{ textAlign: 'left', padding: '8px', borderRight: '1px solid var(--border-color, #e5e7eb)', position: 'sticky', left: 0, background: 'var(--bg-card, #fff)', zIndex: 1 }}>
                      {zh ? '員工' : 'Employee'}
                    </th>
                    <th rowSpan={2} style={{ textAlign: 'left', padding: '8px', borderRight: '1px solid var(--border-color, #e5e7eb)' }}>
                      {zh ? '門市' : 'Store'}
                    </th>
                    {compLeaveTypes.map(lt => (
                      <th key={lt.id} colSpan={3} style={{ textAlign: 'center', padding: '8px', borderRight: '1px solid var(--border-color, #e5e7eb)', borderBottom: 'none' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: lt.color || '#6366f1', marginRight: '4px' }} />
                        {zh ? lt.name_zh : lt.name_en}
                      </th>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: '2px solid var(--border-color, #e5e7eb)' }}>
                    {compLeaveTypes.map(lt => (
                      <React.Fragment key={lt.id + '-sub'}>
                        <th style={{ padding: '4px 6px', fontSize: '11px', textAlign: 'center', color: 'var(--text-secondary)' }}>{zh ? '應' : 'Ent'}</th>
                        <th style={{ padding: '4px 6px', fontSize: '11px', textAlign: 'center', color: 'var(--text-secondary)' }}>{zh ? '用' : 'Used'}</th>
                        <th style={{ padding: '4px 6px', fontSize: '11px', textAlign: 'center', color: 'var(--text-secondary)', borderRight: '1px solid var(--border-color, #e5e7eb)' }}>{zh ? '餘' : 'Rem'}</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compRows.map(r => (
                    <tr key={r.user_id} style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #e5e7eb)', position: 'sticky', left: 0, background: 'var(--bg-card, #fff)', zIndex: 1 }}>
                        {r.employee_name}
                      </td>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap', borderRight: '1px solid var(--border-color, #e5e7eb)' }}>
                        {r.store_name}
                      </td>
                      {compLeaveTypes.map(lt => {
                        const c = r.balances[lt.code] || { entitled: 0, used: 0, remaining: 0 }
                        return (
                          <React.Fragment key={lt.id}>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>{c.entitled || '-'}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'center', color: c.used > 0 ? '#ef4444' : undefined }}>{c.used || '-'}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: c.remaining > 0 ? 'bold' : undefined, color: c.remaining < 0 ? '#ef4444' : c.remaining > 0 ? '#16a34a' : undefined, borderRight: '1px solid var(--border-color, #e5e7eb)' }}>
                              {c.remaining || '-'}
                            </td>
                          </React.Fragment>
                        )
                      })}
                    </tr>
                  ))}
                  {compRows.length === 0 && (
                    <tr><td colSpan={2 + compLeaveTypes.length * 3} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {zh ? '無資料' : 'No data'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
