// ─── Payroll Type Definitions ─────────────────────────────────────────────────

export interface SalaryStructure {
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

export interface PayrollPreviewRow {
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
  supplementary_nhi: number
  leave_buyout: number
  total_deductions: number
  labor_ins_employer: number
  health_ins_employer: number
  labor_pension_employer: number
  net_salary: number
}

export interface PayrollRun {
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

export interface PayrollRecord {
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
  supplementary_nhi?: number
  leave_buyout?: number
  // joined
  user_name?: string
  store_name?: string
}

export interface InsBracket {
  grade: number
  min_salary: number
  insured_salary: number
  employee_premium: number
  employer_premium: number
}

export interface Employee {
  id: string
  name: string
  store_name: string
}

export interface SeveranceResult {
  avgSalary: number
  years: number
  months: number
  amount: number
}
