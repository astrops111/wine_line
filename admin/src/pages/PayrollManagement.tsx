import { useEffect, useState } from 'react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { getLocale } from '../lib/i18n'
import { useOrg } from '../lib/OrgContext'

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface SalaryStructure {
  id: string
  org_id: string
  user_id: string
  base_salary: number
  role_allowance: number
  meal_allowance: number
  transport_allowance: number
  attendance_bonus: number
  year_end_bonus_months: number
  salary_type: 'monthly' | 'hourly'
  hourly_rate: number
  health_ins_dependents: number
  effective_from: string
  notes: string | null
  // joined
  user_name?: string
  store_name?: string
}

interface PayrollPreviewRow {
  user_id: string
  user_name: string
  store_name: string
  salary_type: string
  hours_worked: number
  base_salary: number
  role_allowance: number
  meal_allowance: number
  transport_allowance: number
  attendance_bonus_earned: number
  overtime_pay: number
  ot_hours_weekday: number
  ot_hours_holiday: number
  other_bonus: number
  year_end_bonus: number
  gross_salary: number
  leave_deduction: number
  leave_days_deducted: number
  late_deduction: number
  late_minutes: number
  labor_ins_employee: number
  health_ins_employee: number
  labor_pension_employee: number
  income_tax_withheld: number
  total_deductions: number
  labor_ins_employer: number
  health_ins_employer: number
  labor_pension_employer: number
  net_salary: number
}

interface PayrollRun {
  id: string
  org_id: string
  pay_period: string
  status: 'draft' | 'confirmed'
  run_date: string
  total_gross: number
  total_net: number
  employee_count: number
  notes: string | null
  created_by: string | null
}

interface PayrollRecord {
  id: string
  payroll_run_id: string
  org_id: string
  user_id: string
  pay_period: string
  base_salary: number
  role_allowance: number
  meal_allowance: number
  transport_allowance: number
  attendance_bonus_earned: number
  overtime_pay: number
  ot_hours_weekday: number
  ot_hours_holiday: number
  other_bonus: number
  year_end_bonus: number
  gross_salary: number
  leave_deduction: number
  leave_days_deducted: number
  late_deduction: number
  late_minutes: number
  labor_ins_employee: number
  health_ins_employee: number
  labor_pension_employee: number
  income_tax_withheld: number
  total_deductions: number
  labor_ins_employer: number
  health_ins_employer: number
  labor_pension_employer: number
  net_salary: number
  hours_worked: number
  payslip_sent_at: string | null
  // joined
  user_name?: string
  store_name?: string
}

interface InsBracket {
  grade: number
  min_salary: number
  insured_salary: number
  employee_premium: number
  employer_premium: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number): string {
  return new Intl.NumberFormat('zh-TW').format(Math.round(amount))
}

function StatusBadge({ status, zh }: { status: string; zh: boolean }) {
  const isDraft = status === 'draft'
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '11px',
        padding: '2px 8px',
        borderRadius: '4px',
        background: isDraft ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
        color: isDraft ? '#f59e0b' : '#22c55e',
        border: `1px solid ${isDraft ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
        whiteSpace: 'nowrap' as const,
        fontWeight: 600,
      }}
    >
      {isDraft ? (zh ? '草稿' : 'Draft') : (zh ? '已確認' : 'Confirmed')}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PayrollManagement() {
  const zh = getLocale() === 'zh-TW'
  const { orgId, currentUser } = useOrg()

  // Tab state
  const [tab, setTab] = useState<'salary' | 'run' | 'history' | 'brackets'>('salary')

  // ── Tab 1: Salary Structures ───────────────────────────────────────────────
  const [salaryStructures, setSalaryStructures] = useState<SalaryStructure[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string; store_name: string }[]>([])
  const [structLoading, setStructLoading] = useState(true)
  const [editingStruct, setEditingStruct] = useState<Partial<SalaryStructure> | null>(null)
  const [showStructModal, setShowStructModal] = useState(false)
  const [structSaving, setStructSaving] = useState(false)

  // ── Tab 2: Run Payroll ─────────────────────────────────────────────────────
  const [payPeriod, setPayPeriod] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 7)
  })
  const [preview, setPreview] = useState<PayrollPreviewRow[]>([])
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [existingRun, setExistingRun] = useState<PayrollRun | null>(null)
  const [includeYearEnd, setIncludeYearEnd] = useState(false)

  // ── Tab 3: History ─────────────────────────────────────────────────────────
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const [expandedRecords, setExpandedRecords] = useState<PayrollRecord[]>([])
  const [expandedLoading, setExpandedLoading] = useState(false)
  const [resendingRunId, setResendingRunId] = useState<string | null>(null)

  // ── Tab 4: Brackets ────────────────────────────────────────────────────────
  const [laborBrackets, setLaborBrackets] = useState<InsBracket[]>([])
  const [healthBrackets, setHealthBrackets] = useState<InsBracket[]>([])
  const [bracketsLoading, setBracketsLoading] = useState(true)
  const [bracketYear, setBracketYear] = useState(new Date().getFullYear())

  // ─── Data Loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!orgId) return
    loadSalaryStructures()
    loadEmployees()
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    if (tab === 'run') checkExistingRun()
    if (tab === 'history') loadPayrollRuns()
    if (tab === 'brackets') loadBrackets()
  }, [tab, orgId, bracketYear])

  // Also check existing run when payPeriod changes while on run tab
  useEffect(() => {
    if (!orgId || tab !== 'run') return
    checkExistingRun()
    setPreview([])
  }, [payPeriod, orgId])

  async function loadSalaryStructures() {
    setStructLoading(true)
    const { data } = await supabase
      .from('salary_structures')
      .select('*, users(name, id, stores(name))')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (data) {
      const mapped: SalaryStructure[] = data.map((s: any) => ({
        ...s,
        user_name: s.users?.name || '—',
        store_name: s.users?.stores?.name || '—',
      }))
      setSalaryStructures(mapped)
    }
    setStructLoading(false)
  }

  async function loadEmployees() {
    const { data } = await supabase
      .from('users')
      .select('id, name, stores(name)')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('name')

    if (data) {
      setEmployees(
        data.map((u: any) => ({
          id: u.id,
          name: u.name,
          store_name: u.stores?.name || '—',
        }))
      )
    }
  }

  async function checkExistingRun() {
    const { data } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('org_id', orgId)
      .eq('pay_period', payPeriod)
      .maybeSingle()
    setExistingRun(data as PayrollRun | null)
  }

  async function loadPayrollRuns() {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('org_id', orgId)
      .order('pay_period', { ascending: false })
    setPayrollRuns((data as PayrollRun[]) || [])
    setHistoryLoading(false)
  }

  async function loadExpandedRecords(runId: string) {
    setExpandedLoading(true)
    const { data } = await supabase
      .from('payroll_records')
      .select('*, users(name, stores(name))')
      .eq('payroll_run_id', runId)
      .order('net_salary', { ascending: false })

    if (data) {
      const mapped: PayrollRecord[] = data.map((r: any) => ({
        ...r,
        user_name: r.users?.name || r.user_id,
        store_name: r.users?.stores?.name || '—',
      }))
      setExpandedRecords(mapped)
    }
    setExpandedLoading(false)
  }

  async function loadBrackets() {
    setBracketsLoading(true)
    const [{ data: labor }, { data: health }] = await Promise.all([
      supabase.from('labor_ins_brackets').select('*').eq('year', bracketYear).order('grade'),
      supabase.from('health_ins_brackets').select('*').eq('year', bracketYear).order('grade'),
    ])
    setLaborBrackets((labor as InsBracket[]) || [])
    setHealthBrackets((health as InsBracket[]) || [])
    setBracketsLoading(false)
  }

  // ─── Salary Structure Actions ──────────────────────────────────────────────

  function openNewStruct() {
    setEditingStruct({
      org_id: orgId,
      user_id: '',
      base_salary: 28590,
      role_allowance: 0,
      meal_allowance: 0,
      transport_allowance: 0,
      attendance_bonus: 0,
      year_end_bonus_months: 1,
      salary_type: 'monthly',
      hourly_rate: 0,
      health_ins_dependents: 0,
      effective_from: new Date().toISOString().slice(0, 10),
      notes: '',
    })
    setShowStructModal(true)
  }

  function openEditStruct(s: SalaryStructure) {
    setEditingStruct({ ...s })
    setShowStructModal(true)
  }

  async function saveStruct() {
    if (!editingStruct?.user_id) {
      alert(zh ? '請選擇員工' : 'Please select an employee')
      return
    }
    setStructSaving(true)
    const payload = {
      org_id: orgId,
      user_id: editingStruct.user_id,
      base_salary: Number(editingStruct.base_salary) || 0,
      role_allowance: Number(editingStruct.role_allowance) || 0,
      meal_allowance: Number(editingStruct.meal_allowance) || 0,
      transport_allowance: Number(editingStruct.transport_allowance) || 0,
      attendance_bonus: Number(editingStruct.attendance_bonus) || 0,
      year_end_bonus_months: Number(editingStruct.year_end_bonus_months) || 0,
      salary_type: editingStruct.salary_type || 'monthly',
      hourly_rate: Number(editingStruct.hourly_rate) || 0,
      health_ins_dependents: Number(editingStruct.health_ins_dependents) || 0,
      effective_from: editingStruct.effective_from || new Date().toISOString().slice(0, 10),
      notes: editingStruct.notes || null,
    }

    if (editingStruct.id) {
      await supabase.from('salary_structures').update(payload).eq('id', editingStruct.id)
    } else {
      await supabase.from('salary_structures').insert(payload)
    }

    setStructSaving(false)
    setShowStructModal(false)
    setEditingStruct(null)
    await loadSalaryStructures()
  }

  // ─── Calculate Payroll ─────────────────────────────────────────────────────

  const calculatePayroll = async () => {
    setCalculating(true)
    try {
      const [year, month] = payPeriod.split('-').map(Number)
      const startDate = `${payPeriod}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${payPeriod}-${String(lastDay).padStart(2, '0')}`

      // 1. Load salary structures
      const { data: structs } = await supabase
        .from('salary_structures')
        .select('*, users(name, id, stores(name))')
        .eq('org_id', orgId)

      // 2. Load hours worked from time_records
      const { data: timeRecs } = await supabase
        .from('time_records')
        .select('user_id, clock_in, clock_out')
        .gte('clock_in', `${startDate}T00:00:00`)
        .lte('clock_in', `${endDate}T23:59:59`)
        .not('clock_out', 'is', null)

      // Build map: userId → total hours
      const hoursMap: Record<string, number> = {}
      ;(timeRecs || []).forEach((r: any) => {
        const hrs =
          (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3600000
        hoursMap[r.user_id] = (hoursMap[r.user_id] || 0) + hrs
      })

      // 3. Load approved OT requests for month
      const { data: otRecs } = await supabase
        .from('overtime_requests')
        .select('user_id, ot_hours, ot_type')
        .eq('status', 'approved')
        .gte('request_date', startDate)
        .lte('request_date', endDate)

      const otWeekdayMap: Record<string, number> = {}
      const otHolidayMap: Record<string, number> = {}
      ;(otRecs || []).forEach((r: any) => {
        if (r.ot_type === 'holiday') {
          otHolidayMap[r.user_id] = (otHolidayMap[r.user_id] || 0) + (r.ot_hours || 0)
        } else {
          otWeekdayMap[r.user_id] = (otWeekdayMap[r.user_id] || 0) + (r.ot_hours || 0)
        }
      })

      // 4. Load approved leave for deduction (unpaid types only)
      const { data: leaveRecs } = await supabase
        .from('leave_requests')
        .select('user_id, leave_type, total_days')
        .eq('status', 'approved')
        .gte('start_date', startDate)
        .lte('start_date', endDate)
        .in('leave_type', ['personal', '事假', 'unpaid', '留職停薪'])

      const leaveDaysMap: Record<string, number> = {}
      ;(leaveRecs || []).forEach((r: any) => {
        leaveDaysMap[r.user_id] = (leaveDaysMap[r.user_id] || 0) + (r.total_days || 1)
      })

      // 5. Load insurance brackets + income tax brackets
      const [
        { data: laborBracketsData },
        { data: healthBracketsData },
        { data: taxBracketsData },
      ] = await Promise.all([
        supabase.from('labor_ins_brackets').select('*').eq('year', year).order('grade'),
        supabase.from('health_ins_brackets').select('*').eq('year', year).order('grade'),
        supabase.from('income_tax_brackets').select('*').order('min_salary'),
      ])

      // Helper: find bracket for a given salary (ascending min_salary list)
      const findBracket = (salary: number, brackets: any[]) => {
        if (!brackets || brackets.length === 0) return null
        let match = brackets[0]
        for (const b of brackets) {
          if (salary >= b.min_salary) match = b
          else break
        }
        return match
      }

      // 6. Load shift assignments for late-arrival detection
      const userIds = (structs || []).map((s: any) => s.user_id)
      const { data: shiftData } = userIds.length > 0
        ? await supabase
            .from('shift_assignments')
            .select('user_id, date, shift_templates(start_time)')
            .in('user_id', userIds)
            .gte('date', startDate)
            .lte('date', endDate)
            .eq('status', 'published')
        : { data: [] }

      // Build map: userId_date → scheduled start time (HH:MM)
      const scheduledStartMap: Record<string, string> = {}
      ;(shiftData || []).forEach((sa: any) => {
        const key = `${sa.user_id}_${sa.date}`
        if (sa.shift_templates?.start_time) scheduledStartMap[key] = sa.shift_templates.start_time
      })

      // Build map: userId → total late minutes (grace period: 5 min)
      const lateMinutesMap: Record<string, number> = {}
      ;(timeRecs || []).forEach((r: any) => {
        const dateStr = new Date(r.clock_in).toISOString().slice(0, 10)
        const key = `${r.user_id}_${dateStr}`
        const scheduledStart = scheduledStartMap[key]
        if (scheduledStart) {
          const [sh, sm] = scheduledStart.split(':').map(Number)
          const ci = new Date(r.clock_in)
          const scheduled = new Date(ci.getFullYear(), ci.getMonth(), ci.getDate(), sh, sm, 0)
          const lateMins = Math.max(0, Math.round((ci.getTime() - scheduled.getTime()) / 60000))
          if (lateMins > 5) {
            lateMinutesMap[r.user_id] = (lateMinutesMap[r.user_id] || 0) + lateMins
          }
        }
      })

      // 7. Calculate per employee
      const rows: PayrollPreviewRow[] = (structs || []).map((s: any) => {
        const user = s.users
        const storeName = user?.stores?.name || '—'
        const uid = s.user_id

        const hoursWorked = Math.round((hoursMap[uid] || 0) * 100) / 100
        const otWeekdayHrs = otWeekdayMap[uid] || 0
        const otHolidayHrs = otHolidayMap[uid] || 0
        const leaveDays = leaveDaysMap[uid] || 0
        const lateMinutes = lateMinutesMap[uid] || 0

        // Base salary
        let baseSalary = s.base_salary
        if (s.salary_type === 'hourly') {
          baseSalary = Math.round(s.hourly_rate * hoursWorked)
        }

        // Overtime pay (OT hourly rate: base_salary / 240)
        const hourlyBase = baseSalary / 240
        const otWeekdayPay = Math.round(
          otWeekdayHrs <= 2
            ? otWeekdayHrs * hourlyBase * (4 / 3)
            : 2 * hourlyBase * (4 / 3) + (otWeekdayHrs - 2) * hourlyBase * (5 / 3)
        )
        const otHolidayPay = Math.round(otHolidayHrs * hourlyBase * 2)
        const overtimePay = otWeekdayPay + otHolidayPay

        // Attendance bonus: zero if any unpaid leave this month
        const attendanceBonusEarned = leaveDays === 0 ? s.attendance_bonus : 0

        // Year-end bonus (only when toggle is ON; calculated as months × base)
        const yearEndBonus = includeYearEnd
          ? Math.round((s.year_end_bonus_months || 0) * baseSalary)
          : 0

        const grossSalary =
          baseSalary +
          s.role_allowance +
          s.meal_allowance +
          s.transport_allowance +
          attendanceBonusEarned +
          overtimePay +
          yearEndBonus

        // Leave deduction (per day = base / 30)
        const leaveDeduction = Math.round((baseSalary / 30) * leaveDays)

        // Late deduction (per minute = base / 30 / 8 / 60)
        const lateDeduction = s.salary_type === 'monthly'
          ? Math.round((baseSalary / 30 / 8 / 60) * lateMinutes)
          : 0

        // Insurance brackets
        const laborB = findBracket(grossSalary, laborBracketsData || [])
        const healthB = findBracket(grossSalary, healthBracketsData || [])
        const laborInsEmployee = laborB?.employee_premium || 0
        const laborInsEmployer = laborB?.employer_premium || 0
        const dependentMultiplier = 1 + (s.health_ins_dependents || 0)
        const healthInsEmployee = Math.round(
          (healthB?.employee_premium || 0) * dependentMultiplier
        )
        const healthInsEmployer = healthB?.employer_premium || 0
        const laborPensionEmployer = Math.round(grossSalary * 0.06)

        // Income tax withholding (on pre-tax net)
        const preTaxNet = grossSalary - leaveDeduction - lateDeduction - laborInsEmployee - healthInsEmployee
        const taxB = findBracket(preTaxNet, taxBracketsData || [])
        const incomeTaxWithheld = taxB
          ? Math.round(preTaxNet * taxB.tax_rate + taxB.fixed_amount)
          : 0

        const totalDeductions = leaveDeduction + lateDeduction + laborInsEmployee + healthInsEmployee + incomeTaxWithheld
        const netSalary = grossSalary - totalDeductions

        return {
          user_id: uid,
          user_name: user?.name || uid,
          store_name: storeName,
          salary_type: s.salary_type,
          hours_worked: hoursWorked,
          base_salary: baseSalary,
          role_allowance: s.role_allowance,
          meal_allowance: s.meal_allowance,
          transport_allowance: s.transport_allowance,
          attendance_bonus_earned: attendanceBonusEarned,
          overtime_pay: overtimePay,
          ot_hours_weekday: otWeekdayHrs,
          ot_hours_holiday: otHolidayHrs,
          other_bonus: 0,
          year_end_bonus: yearEndBonus,
          gross_salary: grossSalary,
          leave_deduction: leaveDeduction,
          leave_days_deducted: leaveDays,
          late_deduction: lateDeduction,
          late_minutes: lateMinutes,
          labor_ins_employee: laborInsEmployee,
          health_ins_employee: healthInsEmployee,
          labor_pension_employee: 0,
          income_tax_withheld: incomeTaxWithheld,
          total_deductions: totalDeductions,
          labor_ins_employer: laborInsEmployer,
          health_ins_employer: healthInsEmployer,
          labor_pension_employer: laborPensionEmployer,
          net_salary: netSalary,
        }
      })

      setPreview(rows)
    } catch (err) {
      console.error(err)
      alert(zh ? '計算失敗' : 'Calculation failed')
    } finally {
      setCalculating(false)
    }
  }

  // Update a single row's other_bonus and adjust gross/net accordingly
  function updateOtherBonus(userId: string, value: number) {
    setPreview(prev => prev.map(r => {
      if (r.user_id !== userId) return r
      const diff = value - r.other_bonus
      return {
        ...r,
        other_bonus: value,
        gross_salary: r.gross_salary + diff,
        net_salary: r.net_salary + diff,
      }
    }))
  }

  // ─── Confirm Payroll ───────────────────────────────────────────────────────

  const confirmPayroll = async () => {
    if (preview.length === 0) return
    setSaving(true)
    try {
      const totalGross = preview.reduce((s, r) => s + r.gross_salary, 0)
      const totalNet = preview.reduce((s, r) => s + r.net_salary, 0)
      const today = new Date().toISOString().slice(0, 10)

      // Upsert payroll run
      const runPayload = {
        org_id: orgId,
        pay_period: payPeriod,
        status: 'confirmed',
        run_date: today,
        total_gross: totalGross,
        total_net: totalNet,
        employee_count: preview.length,
        notes: null,
        created_by: currentUser?.id || null,
      }

      let runId: string
      if (existingRun) {
        await supabase
          .from('payroll_runs')
          .update(runPayload)
          .eq('id', existingRun.id)
        runId = existingRun.id
      } else {
        const { data } = await supabase
          .from('payroll_runs')
          .insert(runPayload)
          .select('id')
          .single()
        runId = data?.id
      }

      if (!runId) throw new Error('Failed to create payroll run')

      // Delete existing records for this run
      await supabase.from('payroll_records').delete().eq('payroll_run_id', runId)

      // Insert all records
      const records = preview.map(r => ({
        payroll_run_id: runId,
        org_id: orgId,
        user_id: r.user_id,
        pay_period: payPeriod,
        base_salary: r.base_salary,
        role_allowance: r.role_allowance,
        meal_allowance: r.meal_allowance,
        transport_allowance: r.transport_allowance,
        attendance_bonus_earned: r.attendance_bonus_earned,
        overtime_pay: r.overtime_pay,
        ot_hours_weekday: r.ot_hours_weekday,
        ot_hours_holiday: r.ot_hours_holiday,
        other_bonus: r.other_bonus,
        year_end_bonus: r.year_end_bonus,
        gross_salary: r.gross_salary,
        leave_deduction: r.leave_deduction,
        leave_days_deducted: r.leave_days_deducted,
        late_deduction: r.late_deduction,
        late_minutes: r.late_minutes,
        labor_ins_employee: r.labor_ins_employee,
        health_ins_employee: r.health_ins_employee,
        labor_pension_employee: r.labor_pension_employee,
        income_tax_withheld: r.income_tax_withheld,
        total_deductions: r.total_deductions,
        labor_ins_employer: r.labor_ins_employer,
        health_ins_employer: r.health_ins_employer,
        labor_pension_employer: r.labor_pension_employer,
        net_salary: r.net_salary,
        hours_worked: r.hours_worked,
        payslip_sent_at: null,
      }))

      await supabase.from('payroll_records').insert(records)

      await checkExistingRun()
      alert(zh ? '薪資已確認儲存！' : 'Payroll confirmed and saved!')
    } catch (err) {
      console.error(err)
      alert(zh ? '儲存失敗' : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ─── Export CSV ────────────────────────────────────────────────────────────

  const exportCSV = () => {
    if (preview.length === 0) return
    const headers = [
      '姓名', '門市', '薪資類型', '工時', '底薪', '職務津貼', '伙食津貼',
      '交通津貼', '全勤獎金', '加班費(平日時數)', '加班費(假日時數)', '加班費',
      '其他獎金', '年終獎金', '應發合計',
      '請假天數', '請假扣款', '遲到(分鐘)', '遲到扣款',
      '勞保(員工)', '健保(員工)', '所得稅扣繳', '合計扣款',
      '勞保(雇主)', '健保(雇主)', '勞退(雇主)', '實發淨額',
    ]
    const rows = preview.map(r => [
      r.user_name,
      r.store_name,
      r.salary_type === 'hourly' ? '時薪制' : '月薪制',
      r.hours_worked.toFixed(2),
      r.base_salary,
      r.role_allowance,
      r.meal_allowance,
      r.transport_allowance,
      r.attendance_bonus_earned,
      r.ot_hours_weekday,
      r.ot_hours_holiday,
      r.overtime_pay,
      r.other_bonus,
      r.year_end_bonus,
      r.gross_salary,
      r.leave_days_deducted,
      r.leave_deduction,
      r.late_minutes,
      r.late_deduction,
      r.labor_ins_employee,
      r.health_ins_employee,
      r.income_tax_withheld,
      r.total_deductions,
      r.labor_ins_employer,
      r.health_ins_employer,
      r.labor_pension_employer,
      r.net_salary,
    ])

    const csv =
      '\uFEFF' +
      [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\r\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll_${payPeriod}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Send Payslips ─────────────────────────────────────────────────────────

  const sendPayslips = async (runId: string) => {
    setSending(true)
    setResendingRunId(runId)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/send-payslips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
        },
        body: JSON.stringify({ payroll_run_id: runId }),
      })
      if (!res.ok) throw new Error(await res.text())
      alert(zh ? '薪資單已送出！' : 'Payslips sent successfully!')
    } catch (err) {
      console.error(err)
      alert(zh ? '發送失敗' : 'Failed to send payslips')
    } finally {
      setSending(false)
      setResendingRunId(null)
    }
  }

  // ─── History Expand ────────────────────────────────────────────────────────

  async function toggleRunExpand(runId: string) {
    if (expandedRunId === runId) {
      setExpandedRunId(null)
      setExpandedRecords([])
      return
    }
    setExpandedRunId(runId)
    await loadExpandedRecords(runId)
  }

  // ─── Employees without a salary structure ─────────────────────────────────

  const employeesWithoutStruct = employees.filter(
    e => !salaryStructures.find(s => s.user_id === e.id)
  )

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h1>{zh ? '薪資管理' : 'Payroll Management'}</h1>
        <p className="page-subtitle">
          {zh
            ? '台灣勞基法薪資結構設定、薪資計算與保費對照'
            : 'Taiwan Labor Standards Act payroll setup, calculation, and insurance reference'}
        </p>
      </div>

      {/* Tab Bar */}
      <div className="tab-bar" style={{ marginBottom: '24px' }}>
        <button
          className={`tab-item${tab === 'salary' ? ' active' : ''}`}
          onClick={() => setTab('salary')}
        >
          {zh ? '薪資結構' : 'Salary Structures'}
          {employeesWithoutStruct.length > 0 && (
            <span
              style={{
                marginLeft: '6px',
                background: '#f59e0b',
                color: '#000',
                borderRadius: '10px',
                padding: '1px 7px',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {employeesWithoutStruct.length}
            </span>
          )}
        </button>
        <button
          className={`tab-item${tab === 'run' ? ' active' : ''}`}
          onClick={() => setTab('run')}
        >
          {zh ? '執行薪資' : 'Run Payroll'}
        </button>
        <button
          className={`tab-item${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
        >
          {zh ? '薪資記錄' : 'Payroll History'}
        </button>
        <button
          className={`tab-item${tab === 'brackets' ? ' active' : ''}`}
          onClick={() => setTab('brackets')}
        >
          {zh ? '保費對照表' : 'Insurance Reference'}
        </button>
      </div>

      {/* ── TAB 1: SALARY STRUCTURES ──────────────────────────────────────── */}
      {tab === 'salary' && (
        <div>
          {/* Header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                {zh ? '員工薪資結構' : 'Employee Salary Structures'}
              </h2>
              {employeesWithoutStruct.length > 0 && (
                <p style={{ fontSize: '13px', color: '#f59e0b', marginTop: '4px' }}>
                  {zh
                    ? `${employeesWithoutStruct.length} 位員工尚未設定薪資結構`
                    : `${employeesWithoutStruct.length} employee(s) have no salary structure`}
                </p>
              )}
            </div>
            <button className="btn btn-primary" onClick={openNewStruct}>
              + {zh ? '新增薪資結構' : 'Add Structure'}
            </button>
          </div>

          {/* Employees without struct warning */}
          {employeesWithoutStruct.length > 0 && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.3)',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#f59e0b',
              }}
            >
              <strong>{zh ? '尚無薪資結構的員工：' : 'Employees without a structure: '}</strong>
              {employeesWithoutStruct.map(e => e.name).join('、')}
            </div>
          )}

          {/* Table */}
          {structLoading ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '載入中…' : 'Loading…'}
            </div>
          ) : salaryStructures.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無薪資結構，請點擊上方按鈕新增' : 'No salary structures yet. Click the button above to add one.'}
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
                        zh ? '薪資類型' : 'Type',
                        zh ? '底薪' : 'Base Salary',
                        zh ? '職務津貼' : 'Role Allow.',
                        zh ? '伙食津貼' : 'Meal Allow.',
                        zh ? '交通津貼' : 'Transport Allow.',
                        zh ? '全勤獎金' : 'Attend. Bonus',
                        zh ? '生效日' : 'Effective',
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
                    {salaryStructures.map(s => (
                      <tr
                        key={s.id}
                        style={{ verticalAlign: 'middle' }}
                      >
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>{s.user_name}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{s.store_name}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background:
                                s.salary_type === 'hourly'
                                  ? 'rgba(139,92,246,0.15)'
                                  : 'rgba(59,130,246,0.15)',
                              color: s.salary_type === 'hourly' ? '#8b5cf6' : '#3b82f6',
                              border: `1px solid ${s.salary_type === 'hourly' ? 'rgba(139,92,246,0.3)' : 'rgba(59,130,246,0.3)'}`,
                            }}
                          >
                            {s.salary_type === 'hourly'
                              ? zh ? '時薪制' : 'Hourly'
                              : zh ? '月薪制' : 'Monthly'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                          {s.salary_type === 'hourly'
                            ? `$${fmt(s.hourly_rate)}/hr`
                            : `$${fmt(s.base_salary)}`}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {s.role_allowance > 0 ? `$${fmt(s.role_allowance)}` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {s.meal_allowance > 0 ? `$${fmt(s.meal_allowance)}` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {s.transport_allowance > 0 ? `$${fmt(s.transport_allowance)}` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {s.attendance_bonus > 0 ? `$${fmt(s.attendance_bonus)}` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {s.effective_from}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => openEditStruct(s)}
                          >
                            {zh ? '編輯' : 'Edit'}
                          </button>
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

      {/* ── TAB 2: RUN PAYROLL ────────────────────────────────────────────── */}
      {tab === 'run' && (
        <div>
          {/* Period selector + action buttons */}
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
              <div>
                <label
                  className="detail-label"
                  style={{ display: 'block', marginBottom: '6px' }}
                >
                  {zh ? '薪資期間' : 'Pay Period'}
                </label>
                <input
                  type="month"
                  className="input-field"
                  value={payPeriod}
                  onChange={e => setPayPeriod(e.target.value)}
                  style={{ fontSize: '14px', minWidth: '160px' }}
                />
              </div>

              {existingRun && (
                <div
                  style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(34,197,94,0.1)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    fontSize: '13px',
                    color: '#22c55e',
                  }}
                >
                  {zh ? '本期已有薪資記錄：' : 'Existing run: '}
                  <StatusBadge status={existingRun.status} zh={zh} />
                  <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                    {existingRun.run_date}
                  </span>
                </div>
              )}

              {/* Year-end bonus toggle */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${includeYearEnd ? 'rgba(245,158,11,0.5)' : 'var(--border-color)'}`,
                  background: includeYearEnd ? 'rgba(245,158,11,0.1)' : 'transparent',
                  color: includeYearEnd ? '#f59e0b' : 'var(--text-muted)',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={includeYearEnd}
                  onChange={e => setIncludeYearEnd(e.target.checked)}
                  style={{ accentColor: '#f59e0b' }}
                />
                {zh ? '包含年終獎金' : 'Year-End Bonus'}
              </label>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  onClick={calculatePayroll}
                  disabled={calculating}
                >
                  {calculating
                    ? zh ? '計算中…' : 'Calculating…'
                    : zh ? '計算薪資' : 'Calculate Payroll'}
                </button>
                {preview.length > 0 && (
                  <>
                    <button
                      className="btn btn-secondary"
                      onClick={exportCSV}
                    >
                      {zh ? '匯出 CSV' : 'Export CSV'}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={confirmPayroll}
                      disabled={saving}
                      style={{ background: '#22c55e', borderColor: '#22c55e' }}
                    >
                      {saving
                        ? zh ? '儲存中…' : 'Saving…'
                        : zh ? '確認薪資' : 'Confirm Payroll'}
                    </button>
                    {existingRun?.status === 'confirmed' && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => sendPayslips(existingRun.id)}
                        disabled={sending}
                      >
                        {sending && resendingRunId === existingRun.id
                          ? zh ? '發送中…' : 'Sending…'
                          : zh ? '發送薪資單' : 'Send Payslips'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Preview stats */}
          {preview.length > 0 && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '14px',
                  marginBottom: '20px',
                }}
              >
                <div className="card" style={{ padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#60a5fa' }}>
                    {preview.length}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {zh ? '員工人數' : 'Employees'}
                  </div>
                </div>
                <div className="card" style={{ padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#f59e0b' }}>
                    ${fmt(preview.reduce((s, r) => s + r.gross_salary, 0))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {zh ? '應發合計' : 'Total Gross'}
                  </div>
                </div>
                <div className="card" style={{ padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#f43f5e' }}>
                    ${fmt(preview.reduce((s, r) => s + r.total_deductions, 0))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {zh ? '合計扣款' : 'Total Deductions'}
                  </div>
                </div>
                <div className="card" style={{ padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#22c55e' }}>
                    ${fmt(preview.reduce((s, r) => s + r.net_salary, 0))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {zh ? '實發淨額' : 'Total Net'}
                  </div>
                </div>
                <div className="card" style={{ padding: '18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#a78bfa' }}>
                    ${fmt(preview.reduce((s, r) => s + r.labor_pension_employer, 0))}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {zh ? '雇主勞退提撥' : 'Employer Pension'}
                  </div>
                </div>
                {preview.some(r => r.income_tax_withheld > 0) && (
                  <div className="card" style={{ padding: '18px', textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#fb923c' }}>
                      ${fmt(preview.reduce((s, r) => s + r.income_tax_withheld, 0))}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {zh ? '所得稅扣繳合計' : 'Total Tax Withheld'}
                    </div>
                  </div>
                )}
                {preview.some(r => r.year_end_bonus > 0) && (
                  <div className="card" style={{ padding: '18px', textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: '#f59e0b' }}>
                      ${fmt(preview.reduce((s, r) => s + r.year_end_bonus, 0))}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {zh ? '年終獎金合計' : 'Total Year-End Bonus'}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Table */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                        {[
                          zh ? '姓名' : 'Name',
                          zh ? '門市' : 'Store',
                          zh ? '工時' : 'Hours',
                          zh ? '底薪' : 'Base',
                          zh ? '職務' : 'Role',
                          zh ? '伙食' : 'Meal',
                          zh ? '交通' : 'Transport',
                          zh ? '全勤' : 'Attend.',
                          zh ? '加班費' : 'OT Pay',
                          zh ? '其他獎金' : 'Other Bonus',
                          zh ? '年終' : 'Year-End',
                          zh ? '應發' : 'Gross',
                          zh ? '請假扣' : 'Leave Ded.',
                          zh ? '遲到扣' : 'Late Ded.',
                          zh ? '勞保' : 'Labor Ins.',
                          zh ? '健保' : 'Health Ins.',
                          zh ? '所得稅' : 'Tax',
                          zh ? '合計扣' : 'Total Ded.',
                          zh ? '淨額' : 'Net',
                        ].map(h => (
                          <th
                            key={h}
                            style={{
                              padding: '10px 12px',
                              textAlign: 'right',
                              color: 'var(--text-muted)',
                              fontWeight: 500,
                              fontSize: '11px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map(r => (
                        <tr
                          key={r.user_id}
                          style={{ verticalAlign: 'middle' }}
                        >
                          <td style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {r.user_name}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {r.store_name}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {r.salary_type === 'hourly' ? `${r.hours_worked.toFixed(1)}h` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            ${fmt(r.base_salary)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {r.role_allowance > 0 ? `$${fmt(r.role_allowance)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {r.meal_allowance > 0 ? `$${fmt(r.meal_allowance)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {r.transport_allowance > 0 ? `$${fmt(r.transport_allowance)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {r.attendance_bonus_earned > 0 ? `$${fmt(r.attendance_bonus_earned)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {r.overtime_pay > 0 ? (
                              <span title={`平日 ${r.ot_hours_weekday}h / 假日 ${r.ot_hours_holiday}h`}>
                                ${fmt(r.overtime_pay)}
                              </span>
                            ) : '—'}
                          </td>
                          {/* Editable other_bonus */}
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              value={r.other_bonus}
                              onChange={e => updateOtherBonus(r.user_id, parseFloat(e.target.value) || 0)}
                              style={{
                                width: '80px',
                                padding: '4px 6px',
                                fontSize: '12px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--outline-variant)',
                                borderRadius: '4px',
                                color: 'var(--text-primary)',
                                textAlign: 'right',
                              }}
                            />
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: r.year_end_bonus > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                            {r.year_end_bonus > 0 ? `$${fmt(r.year_end_bonus)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>
                            ${fmt(r.gross_salary)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e' }}>
                            {r.leave_deduction > 0
                              ? `-$${fmt(r.leave_deduction)}`
                              : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e' }}>
                            {r.late_deduction > 0 ? (
                              <span title={`${r.late_minutes} 分鐘`}>
                                -{`$${fmt(r.late_deduction)}`}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e' }}>
                            {r.labor_ins_employee > 0 ? `-$${fmt(r.labor_ins_employee)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e' }}>
                            {r.health_ins_employee > 0 ? `-$${fmt(r.health_ins_employee)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fb923c' }}>
                            {r.income_tax_withheld > 0 ? `-$${fmt(r.income_tax_withheld)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e', fontWeight: 600 }}>
                            -${fmt(r.total_deductions)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>
                            ${fmt(r.net_salary)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Empty state */}
          {!calculating && preview.length === 0 && (
            <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>💰</div>
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                {zh ? '點擊「計算薪資」開始' : 'Click "Calculate Payroll" to begin'}
              </div>
              <div style={{ fontSize: '13px' }}>
                {zh
                  ? `將計算 ${payPeriod} 的薪資預覽`
                  : `Will preview payroll for ${payPeriod}`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: PAYROLL HISTORY ────────────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              {zh ? '薪資記錄' : 'Payroll History'}
            </h2>
          </div>

          {historyLoading ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '載入中…' : 'Loading…'}
            </div>
          ) : payrollRuns.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '尚無薪資記錄' : 'No payroll history yet'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {payrollRuns.map(run => (
                <div key={run.id} className="card" style={{ overflow: 'hidden' }}>
                  {/* Run summary row */}
                  <div
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '16px',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleRunExpand(run.id)}
                  >
                    <div style={{ minWidth: '100px' }}>
                      <div style={{ fontWeight: 700, fontSize: '16px' }}>{run.pay_period}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {zh ? '執行日：' : 'Run date: '}{run.run_date}
                      </div>
                    </div>

                    <StatusBadge status={run.status} zh={zh} />

                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '15px', fontWeight: 600 }}>{run.employee_count}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {zh ? '員工' : 'Employees'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: '#f59e0b' }}>
                        ${fmt(run.total_gross)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {zh ? '應發合計' : 'Total Gross'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: '#22c55e' }}>
                        ${fmt(run.total_net)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {zh ? '實發淨額' : 'Total Net'}
                      </div>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {run.status === 'confirmed' && (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={e => { e.stopPropagation(); sendPayslips(run.id) }}
                          disabled={sending && resendingRunId === run.id}
                        >
                          {sending && resendingRunId === run.id
                            ? zh ? '發送中…' : 'Sending…'
                            : zh ? '重發薪資單' : 'Resend Payslips'}
                        </button>
                      )}
                      <span style={{ color: 'var(--text-muted)', fontSize: '18px' }}>
                        {expandedRunId === run.id ? '▲' : '▼'}
                      </span>
                    </div>
                  </div>

                  {/* Expanded records */}
                  {expandedRunId === run.id && (
                    <div style={{ borderTop: '1px solid var(--outline-variant)' }}>
                      {expandedLoading ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {zh ? '載入中…' : 'Loading…'}
                        </div>
                      ) : expandedRecords.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {zh ? '無明細記錄' : 'No records found'}
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--outline-variant)', background: 'var(--bg-secondary)' }}>
                                {[
                                  zh ? '姓名' : 'Name',
                                  zh ? '門市' : 'Store',
                                  zh ? '底薪' : 'Base',
                                  zh ? '加班費' : 'OT Pay',
                                  zh ? '其他獎金' : 'Other Bonus',
                                  zh ? '年終' : 'Year-End',
                                  zh ? '應發' : 'Gross',
                                  zh ? '請假扣' : 'Leave Ded.',
                                  zh ? '遲到扣' : 'Late Ded.',
                                  zh ? '勞保' : 'Labor Ins.',
                                  zh ? '健保' : 'Health Ins.',
                                  zh ? '所得稅' : 'Tax',
                                  zh ? '合計扣' : 'Deductions',
                                  zh ? '淨額' : 'Net',
                                  zh ? '薪資單' : 'Payslip',
                                ].map(h => (
                                  <th
                                    key={h}
                                    style={{
                                      padding: '10px 14px',
                                      textAlign: 'right',
                                      color: 'var(--text-muted)',
                                      fontWeight: 500,
                                      fontSize: '11px',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {expandedRecords.map(r => (
                                <tr
                                  key={r.id}
                                  style={{ borderBottom: '1px solid var(--outline-variant)' }}
                                >
                                  <td style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                    {r.user_name}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                    {r.store_name}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                    ${fmt(r.base_salary)}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)' }}>
                                    {r.overtime_pay > 0 ? `$${fmt(r.overtime_pay)}` : '—'}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--text-muted)' }}>
                                    {(r.other_bonus || 0) > 0 ? `$${fmt(r.other_bonus)}` : '—'}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f59e0b' }}>
                                    {(r.year_end_bonus || 0) > 0 ? `$${fmt(r.year_end_bonus)}` : '—'}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>
                                    ${fmt(r.gross_salary)}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e' }}>
                                    {r.leave_deduction > 0 ? `-$${fmt(r.leave_deduction)}` : '—'}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e' }}>
                                    {(r.late_deduction || 0) > 0 ? (
                                      <span title={`${r.late_minutes || 0} 分鐘`}>
                                        -${fmt(r.late_deduction)}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e' }}>
                                    {r.labor_ins_employee > 0 ? `-$${fmt(r.labor_ins_employee)}` : '—'}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e' }}>
                                    {r.health_ins_employee > 0 ? `-$${fmt(r.health_ins_employee)}` : '—'}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#fb923c' }}>
                                    {(r.income_tax_withheld || 0) > 0 ? `-$${fmt(r.income_tax_withheld)}` : '—'}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#f43f5e', fontWeight: 600 }}>
                                    -${fmt(r.total_deductions)}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>
                                    ${fmt(r.net_salary)}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                    {r.payslip_sent_at ? (
                                      <span style={{ fontSize: '11px', color: '#22c55e' }}>
                                        {zh ? '已發送' : 'Sent'}
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {zh ? '未發送' : 'Pending'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            {/* Footer totals */}
                            <tfoot>
                              <tr style={{ borderTop: '2px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                                <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'left' }}>
                                  {zh ? '合計' : 'Total'}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                                  ${fmt(expandedRecords.reduce((s, r) => s + r.base_salary, 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                                  ${fmt(expandedRecords.reduce((s, r) => s + r.overtime_pay, 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                                  ${fmt(expandedRecords.reduce((s, r) => s + (r.other_bonus || 0), 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                                  ${fmt(expandedRecords.reduce((s, r) => s + (r.year_end_bonus || 0), 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                                  ${fmt(expandedRecords.reduce((s, r) => s + r.gross_salary, 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#f43f5e' }}>
                                  -${fmt(expandedRecords.reduce((s, r) => s + r.leave_deduction, 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#f43f5e' }}>
                                  -${fmt(expandedRecords.reduce((s, r) => s + (r.late_deduction || 0), 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#f43f5e' }}>
                                  -${fmt(expandedRecords.reduce((s, r) => s + r.labor_ins_employee, 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#f43f5e' }}>
                                  -${fmt(expandedRecords.reduce((s, r) => s + r.health_ins_employee, 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#fb923c' }}>
                                  -${fmt(expandedRecords.reduce((s, r) => s + (r.income_tax_withheld || 0), 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#f43f5e' }}>
                                  -${fmt(expandedRecords.reduce((s, r) => s + r.total_deductions, 0))}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>
                                  ${fmt(expandedRecords.reduce((s, r) => s + r.net_salary, 0))}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: INSURANCE BRACKETS ─────────────────────────────────────── */}
      {tab === 'brackets' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
              {zh ? '保費對照表' : 'Insurance Premium Reference'}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {zh
                ? '勞保與健保投保薪資分級表（單位：新台幣）'
                : 'Labor and Health Insurance salary bracket tables (NTD)'}
            </p>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, marginRight: '8px' }}>
              {zh ? '年度：' : 'Year:'}
            </label>
            <select
              value={bracketYear}
              onChange={e => setBracketYear(Number(e.target.value))}
              style={{ fontSize: '13px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--outline-variant)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            >
              {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {bracketsLoading ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {zh ? '載入中…' : 'Loading…'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Labor Insurance Brackets */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                    {zh ? '勞工保險' : 'Labor Insurance'}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    {zh ? '月投保薪資分級' : 'Monthly Insured Salary Grades'}
                  </p>
                </div>
                {laborBrackets.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {zh ? '尚無資料' : 'No data'}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                          {[
                            zh ? '級距' : 'Grade',
                            zh ? '月薪下限' : 'Min Salary',
                            zh ? '投保薪資' : 'Insured Salary',
                            zh ? '員工保費' : 'Employee Premium',
                            zh ? '雇主保費' : 'Employer Premium',
                          ].map(h => (
                            <th
                              key={h}
                              style={{
                                padding: '10px 12px',
                                textAlign: 'right',
                                color: 'var(--text-muted)',
                                fontWeight: 500,
                                fontSize: '11px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {laborBrackets.map((b, idx) => (
                          <tr
                            key={b.grade}
                            style={{
                              borderBottom: '1px solid var(--outline-variant)',
                              background: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                            }}
                          >
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                              {b.grade}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              ${fmt(b.min_salary)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                              ${fmt(b.insured_salary)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f43f5e' }}>
                              ${fmt(b.employee_premium)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f59e0b' }}>
                              ${fmt(b.employer_premium)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Health Insurance Brackets */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--outline-variant)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                    {zh ? '全民健康保險' : 'National Health Insurance'}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    {zh ? '月投保金額分級（含眷屬加乘）' : 'Monthly premium grades (incl. dependents multiplier)'}
                  </p>
                </div>
                {healthBrackets.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {zh ? '尚無資料' : 'No data'}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                          {[
                            zh ? '級距' : 'Grade',
                            zh ? '月薪下限' : 'Min Salary',
                            zh ? '投保金額' : 'Insured Amount',
                            zh ? '員工保費' : 'Employee Premium',
                            zh ? '雇主保費' : 'Employer Premium',
                          ].map(h => (
                            <th
                              key={h}
                              style={{
                                padding: '10px 12px',
                                textAlign: 'right',
                                color: 'var(--text-muted)',
                                fontWeight: 500,
                                fontSize: '11px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {healthBrackets.map((b, idx) => (
                          <tr
                            key={b.grade}
                            style={{
                              borderBottom: '1px solid var(--outline-variant)',
                              background: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
                            }}
                          >
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                              {b.grade}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              ${fmt(b.min_salary)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>
                              ${fmt(b.insured_salary)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f43f5e' }}>
                              ${fmt(b.employee_premium)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f59e0b' }}>
                              ${fmt(b.employer_premium)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NHI dependent note */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              fontSize: '13px',
              color: 'var(--text-muted)',
            }}
          >
            <strong style={{ color: '#60a5fa' }}>
              {zh ? '眷屬加乘說明：' : 'Dependent Multiplier Note: '}
            </strong>
            {zh
              ? '健保員工保費依投保眷屬人數加乘計算。薪資結構中的「健保眷屬人數」欄位設定 0 表示僅本人，1 表示本人 + 1 位眷屬，以此類推。'
              : 'The employee NHI premium is multiplied by (1 + number of dependents). A value of 0 in the salary structure means employee only, 1 means employee + 1 dependent, etc.'}
          </div>
        </div>
      )}

      {/* ── SALARY STRUCTURE MODAL ────────────────────────────────────────── */}
      {showStructModal && editingStruct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px', overscrollBehavior: 'contain' }}
          onClick={e => {
            if (e.target === e.currentTarget) {
              setShowStructModal(false)
              setEditingStruct(null)
            }
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '580px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              position: 'relative',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                {editingStruct.id
                  ? zh ? '編輯薪資結構' : 'Edit Salary Structure'
                  : zh ? '新增薪資結構' : 'Add Salary Structure'}
              </h2>
              <button
                onClick={() => { setShowStructModal(false); setEditingStruct(null) }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '22px',
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
                value={editingStruct.user_id || ''}
                onChange={e => setEditingStruct({ ...editingStruct, user_id: e.target.value })}
                disabled={!!editingStruct.id}
              >
                <option value="">{zh ? '請選擇員工…' : 'Select employee…'}</option>
                {employees.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.store_name !== '—' ? ` (${u.store_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Salary Type */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '8px' }}>
                {zh ? '薪資類型 *' : 'Salary Type *'}
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {(['monthly', 'hourly'] as const).map(type => (
                  <label
                    key={type}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '10px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${editingStruct.salary_type === type ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: editingStruct.salary_type === type ? 'var(--accent-primary-dim)' : 'transparent',
                      flex: 1,
                      fontSize: '13px',
                    }}
                  >
                    <input
                      type="radio"
                      name="salary_type"
                      value={type}
                      checked={editingStruct.salary_type === type}
                      onChange={() => setEditingStruct({ ...editingStruct, salary_type: type })}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    {type === 'monthly'
                      ? zh ? '月薪制' : 'Monthly'
                      : zh ? '時薪制' : 'Hourly'}
                  </label>
                ))}
              </div>
            </div>

            {/* Base Salary / Hourly Rate */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {editingStruct.salary_type === 'hourly'
                    ? zh ? '時薪 (NT$)' : 'Hourly Rate (NT$)'
                    : zh ? '底薪 (NT$)' : 'Base Salary (NT$)'}
                </label>
                {editingStruct.salary_type === 'hourly' ? (
                  <input
                    type="number"
                    min="0"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={editingStruct.hourly_rate ?? 0}
                    onChange={e => setEditingStruct({ ...editingStruct, hourly_rate: parseFloat(e.target.value) || 0 })}
                  />
                ) : (
                  <input
                    type="number"
                    min="0"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={editingStruct.base_salary ?? 0}
                    onChange={e => setEditingStruct({ ...editingStruct, base_salary: parseFloat(e.target.value) || 0 })}
                  />
                )}
              </div>

              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '職務津貼 (NT$)' : 'Role Allowance (NT$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.role_allowance ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, role_allowance: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '伙食津貼 (NT$)' : 'Meal Allowance (NT$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.meal_allowance ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, meal_allowance: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '交通津貼 (NT$)' : 'Transport Allowance (NT$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.transport_allowance ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, transport_allowance: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '全勤獎金 (NT$)' : 'Attendance Bonus (NT$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.attendance_bonus ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, attendance_bonus: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '年終月數 (倍數)' : 'Year-End Bonus (months)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="12"
                  step="0.5"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.year_end_bonus_months ?? 1}
                  onChange={e => setEditingStruct({ ...editingStruct, year_end_bonus_months: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '健保眷屬人數' : 'NHI Dependents'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.health_ins_dependents ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, health_ins_dependents: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Effective from */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '生效日期 *' : 'Effective From *'}
              </label>
              <input
                type="date"
                className="input-field"
                style={{ width: '100%' }}
                value={editingStruct.effective_from || ''}
                onChange={e => setEditingStruct({ ...editingStruct, effective_from: e.target.value })}
              />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '24px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '備註' : 'Notes'}
              </label>
              <textarea
                className="input-field"
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder={zh ? '選填備註…' : 'Optional notes…'}
                value={editingStruct.notes || ''}
                onChange={e => setEditingStruct({ ...editingStruct, notes: e.target.value })}
              />
            </div>

            {/* Salary preview */}
            {editingStruct.salary_type === 'monthly' && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.2)',
                  marginBottom: '20px',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#22c55e' }}>
                  {zh ? '預估月薪合計' : 'Estimated Monthly Total'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  <span>
                    {zh ? '底薪' : 'Base'}: ${fmt(editingStruct.base_salary || 0)}
                  </span>
                  <span>
                    {zh ? '職務' : 'Role'}: ${fmt(editingStruct.role_allowance || 0)}
                  </span>
                  <span>
                    {zh ? '伙食' : 'Meal'}: ${fmt(editingStruct.meal_allowance || 0)}
                  </span>
                  <span>
                    {zh ? '交通' : 'Transport'}: ${fmt(editingStruct.transport_allowance || 0)}
                  </span>
                  <span>
                    {zh ? '全勤' : 'Attend.'}: ${fmt(editingStruct.attendance_bonus || 0)}
                  </span>
                  <strong style={{ color: '#22c55e' }}>
                    {zh ? '合計' : 'Total'}: $
                    {fmt(
                      (editingStruct.base_salary || 0) +
                        (editingStruct.role_allowance || 0) +
                        (editingStruct.meal_allowance || 0) +
                        (editingStruct.transport_allowance || 0) +
                        (editingStruct.attendance_bonus || 0)
                    )}
                  </strong>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowStructModal(false); setEditingStruct(null) }}
                disabled={structSaving}
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                onClick={saveStruct}
                disabled={structSaving || !editingStruct.user_id}
              >
                {structSaving
                  ? zh ? '儲存中…' : 'Saving…'
                  : zh ? '儲存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
