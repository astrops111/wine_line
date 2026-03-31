// ─── Payroll Export Utilities ──────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PayrollPreviewRow, PayrollRecord } from '../types/payroll'

// ─── CSV Download Helper ──────────────────────────────────────────────────────

export function downloadCSV(filename: string, headers: string[], rows: any[][]) {
  const csv =
    '\uFEFF' +
    [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Export Payroll CSV ───────────────────────────────────────────────────────

export function exportPayrollCSV(preview: PayrollPreviewRow[], payPeriod: string) {
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

// ─── Bank Transfer File Export ────────────────────────────────────────────────

export async function exportBankFile(
  supabase: SupabaseClient,
  preview: PayrollPreviewRow[],
  expandedRecords: PayrollRecord[],
  expandedRunId: string | null,
  payPeriod: string,
) {
  if (!expandedRunId && preview.length === 0) return
  // Use expanded records if viewing history, otherwise preview
  let rows: { user_id: string; user_name: string; net_salary: number }[] = []
  if (expandedRunId && expandedRecords.length > 0) {
    rows = expandedRecords.map(r => ({ user_id: r.user_id, user_name: r.user_name || '', net_salary: r.net_salary }))
  } else {
    rows = preview.map(r => ({ user_id: r.user_id, user_name: r.user_name, net_salary: r.net_salary }))
  }
  // Fetch bank info
  const uids = rows.map(r => r.user_id)
  const { data: users } = await supabase.from('users').select('id, bank_code, bank_account').in('id', uids)
  const bankMap: Record<string, { bank_code: string; bank_account: string }> = {}
  ;(users || []).forEach((u: any) => { bankMap[u.id] = { bank_code: u.bank_code || '', bank_account: u.bank_account || '' } })

  const headers = ['銀行代碼', '銀行帳號', '員工姓名', '實發金額']
  const csvRows = rows.map(r => [
    bankMap[r.user_id]?.bank_code || '',
    bankMap[r.user_id]?.bank_account || '',
    r.user_name,
    r.net_salary,
  ])
  downloadCSV(`bank_transfer_${payPeriod}.csv`, headers, csvRows)
}

// ─── Insurance Report Export ──────────────────────────────────────────────────

export function exportInsuranceReport(
  preview: PayrollPreviewRow[],
  expandedRecords: PayrollRecord[],
  payPeriod: string,
) {
  const rows = expandedRecords.length > 0 ? expandedRecords : preview as any[]
  if (rows.length === 0) return
  const headers = ['員工姓名', '勞保(員工)', '勞保(雇主)', '健保(員工)', '健保(雇主)', '勞退提撥(雇主)', '二代健保補充保費']
  const csvRows = rows.map((r: any) => [
    r.user_name,
    r.labor_ins_employee,
    r.labor_ins_employer,
    r.health_ins_employee,
    r.health_ins_employer,
    r.labor_pension_employer,
    r.supplementary_nhi || 0,
  ])
  downloadCSV(`insurance_report_${payPeriod}.csv`, headers, csvRows)
}

// ─── Accounting Export ────────────────────────────────────────────────────────

export function exportAccounting(
  preview: PayrollPreviewRow[],
  expandedRecords: PayrollRecord[],
  payPeriod: string,
  zh: boolean,
) {
  const rows = expandedRecords.length > 0 ? expandedRecords : preview as any[]
  if (rows.length === 0) return
  const totals = rows.reduce((acc: any, r: any) => ({
    gross: acc.gross + r.gross_salary,
    laborEmp: acc.laborEmp + r.labor_ins_employee,
    healthEmp: acc.healthEmp + r.health_ins_employee,
    tax: acc.tax + (r.income_tax_withheld || 0),
    suppNhi: acc.suppNhi + (r.supplementary_nhi || 0),
    laborEr: acc.laborEr + r.labor_ins_employer,
    healthEr: acc.healthEr + r.health_ins_employer,
    pension: acc.pension + r.labor_pension_employer,
    net: acc.net + r.net_salary,
  }), { gross: 0, laborEmp: 0, healthEmp: 0, tax: 0, suppNhi: 0, laborEr: 0, healthEr: 0, pension: 0, net: 0 })

  const headers = ['科目代碼', '科目名稱', '借方', '貸方']
  const csvRows = [
    ['5110', zh ? '薪資費用' : 'Salary Expense', totals.gross, 0],
    ['5120', zh ? '雇主勞保' : 'Employer Labor Ins.', totals.laborEr, 0],
    ['5121', zh ? '雇主健保' : 'Employer Health Ins.', totals.healthEr, 0],
    ['5122', zh ? '雇主勞退' : 'Employer Pension', totals.pension, 0],
    ['2140', zh ? '應付勞保費' : 'Labor Ins. Payable', 0, totals.laborEmp + totals.laborEr],
    ['2141', zh ? '應付健保費' : 'Health Ins. Payable', 0, totals.healthEmp + totals.healthEr],
    ['2142', zh ? '應付所得稅' : 'Tax Payable', 0, totals.tax],
    ['2143', zh ? '應付補充保費' : 'Supp. NHI Payable', 0, totals.suppNhi],
    ['2150', zh ? '應付勞退' : 'Pension Payable', 0, totals.pension],
    ['1110', zh ? '銀行存款' : 'Bank / Cash', 0, totals.net],
  ]
  downloadCSV(`accounting_export_${payPeriod}.csv`, headers, csvRows)
}

// ─── Tax Form Export ──────────────────────────────────────────────────────────

export function exportTaxForms(taxFormData: any[], taxFormYear: number) {
  if (taxFormData.length === 0) return
  const headers = ['員工姓名', '身分證字號', '年度', '給付總額', '扣繳稅額', '勞保費', '健保費', '補充保費', '實領淨額']
  const csvRows = taxFormData.map(d => [
    d.user_name || d.user_id, d.id_number || '', taxFormYear,
    d.total_gross, d.total_tax, d.total_labor_ins, d.total_health_ins, d.total_supp_nhi, d.total_net,
  ])
  downloadCSV(`tax_form_${taxFormYear}.csv`, headers, csvRows)
}
