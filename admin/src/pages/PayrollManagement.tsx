import { useEffect, useState } from 'react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { getLocale } from '../lib/i18n'
import { useOrg } from '../lib/OrgContext'

import type {
  SalaryStructure,
  PayrollPreviewRow,
  PayrollRun,
  PayrollRecord,
  InsBracket,
  Employee,
} from '../types/payroll'

import { exportPayrollCSV, exportBankFile, exportInsuranceReport, exportAccounting } from '../lib/payrollExports'

import { SalaryStructureTab } from '../components/Payroll/SalaryStructureTab'
import { RunPayrollTab } from '../components/Payroll/RunPayrollTab'
import { PayrollHistoryTab } from '../components/Payroll/PayrollHistoryTab'
import { InsuranceBracketsTab } from '../components/Payroll/InsuranceBracketsTab'
import { PayrollToolsTab } from '../components/Payroll/PayrollToolsTab'

// ─── Main Component ───────────────────────────────────────────────────────────

export function PayrollManagement() {
  const zh = getLocale() === 'zh-TW'
  const { orgId, currentUser } = useOrg()

  // Tab state
  const [tab, setTab] = useState<'salary' | 'run' | 'history' | 'brackets' | 'tools'>('salary')

  // ── Tab 1: Salary Structures ───────────────────────────────────────────────
  const [salaryStructures, setSalaryStructures] = useState<SalaryStructure[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [structLoading, setStructLoading] = useState(true)

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

  // ─── Salary Structure Save ─────────────────────────────────────────────────

  async function handleSaveStruct(editingStruct: Partial<SalaryStructure>) {
    const payload = {
      org_id: orgId,
      user_id: editingStruct.user_id!,
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

      // Build map: userId -> total hours
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

      // Build map: userId_date -> scheduled start time (HH:MM)
      const scheduledStartMap: Record<string, string> = {}
      ;(shiftData || []).forEach((sa: any) => {
        const key = `${sa.user_id}_${sa.date}`
        if (sa.shift_templates?.start_time) scheduledStartMap[key] = sa.shift_templates.start_time
      })

      // Build map: userId -> total late minutes (grace period: 5 min)
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

        // Year-end bonus (only when toggle is ON; calculated as months x base)
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

        // Supplementary NHI: 2.11% on bonus exceeding 4x monthly insured salary
        const healthInsuredSalary = healthB?.insured_salary || 0
        let supplementaryNhi = 0
        if (yearEndBonus > 0 || (s.other_bonus || 0) > 0) {
          const bonusTotal = yearEndBonus + (s.other_bonus || 0)
          const threshold = healthInsuredSalary * 4
          if (bonusTotal > threshold) {
            supplementaryNhi = Math.round((bonusTotal - threshold) * 0.0211)
          }
        }

        // Leave buyout: unused annual leave days x daily rate (only when confirmed)
        const leaveBuyout = 0

        const totalDeductions = leaveDeduction + lateDeduction + laborInsEmployee + healthInsEmployee + incomeTaxWithheld + supplementaryNhi
        const netSalary = grossSalary - totalDeductions + leaveBuyout

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
          supplementary_nhi: supplementaryNhi,
          leave_buyout: leaveBuyout,
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
        supplementary_nhi: r.supplementary_nhi,
        leave_buyout: r.leave_buyout,
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

  // ─── Export Wrappers (pass context to export utils) ────────────────────────

  const handleExportCSV = () => exportPayrollCSV(preview, payPeriod)
  const handleExportBankFile = () => exportBankFile(supabase, preview, expandedRecords, expandedRunId, payPeriod)
  const handleExportInsuranceReport = () => exportInsuranceReport(preview, expandedRecords, payPeriod)
  const handleExportAccounting = () => exportAccounting(preview, expandedRecords, payPeriod, zh)

  // ─── Derived state ─────────────────────────────────────────────────────────

  const employeesWithoutStruct = employees.filter(
    e => !salaryStructures.find(s => s.user_id === e.id)
  )

  // ─── Render ────────────────────────────────────────────────────────────────

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
        <button
          className={`tab-item${tab === 'tools' ? ' active' : ''}`}
          onClick={() => setTab('tools')}
        >
          {zh ? '薪資工具' : 'Payroll Tools'}
        </button>
      </div>

      {/* ── TAB 1: SALARY STRUCTURES ──────────────────────────────────────── */}
      {tab === 'salary' && (
        <SalaryStructureTab
          zh={zh}
          salaryStructures={salaryStructures}
          employees={employees}
          structLoading={structLoading}
          employeesWithoutStruct={employeesWithoutStruct}
          onSaveStruct={handleSaveStruct}
        />
      )}

      {/* ── TAB 2: RUN PAYROLL ────────────────────────────────────────────── */}
      {tab === 'run' && (
        <RunPayrollTab
          zh={zh}
          payPeriod={payPeriod}
          setPayPeriod={setPayPeriod}
          preview={preview}
          calculating={calculating}
          saving={saving}
          sending={sending}
          resendingRunId={resendingRunId}
          existingRun={existingRun}
          includeYearEnd={includeYearEnd}
          setIncludeYearEnd={setIncludeYearEnd}
          onCalculate={calculatePayroll}
          onConfirm={confirmPayroll}
          onExportCSV={handleExportCSV}
          onExportBankFile={handleExportBankFile}
          onExportInsuranceReport={handleExportInsuranceReport}
          onExportAccounting={handleExportAccounting}
          onSendPayslips={sendPayslips}
          onUpdateOtherBonus={updateOtherBonus}
        />
      )}

      {/* ── TAB 3: PAYROLL HISTORY ────────────────────────────────────────── */}
      {tab === 'history' && (
        <PayrollHistoryTab
          zh={zh}
          payrollRuns={payrollRuns}
          historyLoading={historyLoading}
          expandedRunId={expandedRunId}
          expandedRecords={expandedRecords}
          expandedLoading={expandedLoading}
          sending={sending}
          resendingRunId={resendingRunId}
          onToggleExpand={toggleRunExpand}
          onSendPayslips={sendPayslips}
        />
      )}

      {/* ── TAB 4: INSURANCE BRACKETS ─────────────────────────────────────── */}
      {tab === 'brackets' && (
        <InsuranceBracketsTab
          zh={zh}
          laborBrackets={laborBrackets}
          healthBrackets={healthBrackets}
          bracketsLoading={bracketsLoading}
          bracketYear={bracketYear}
          setBracketYear={setBracketYear}
        />
      )}

      {/* ── TAB 5: PAYROLL TOOLS ──────────────────────────────────────────── */}
      {tab === 'tools' && (
        <PayrollToolsTab
          zh={zh}
          orgId={orgId}
          supabase={supabase}
          employees={employees}
          preview={preview}
          expandedRecords={expandedRecords}
          onExportBankFile={handleExportBankFile}
          onExportInsuranceReport={handleExportInsuranceReport}
          onExportAccounting={handleExportAccounting}
        />
      )}
    </div>
  )
}
