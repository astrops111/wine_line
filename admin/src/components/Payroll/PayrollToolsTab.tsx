import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Employee, PayrollPreviewRow, PayrollRecord, SeveranceResult } from '../../types/payroll'
import { exportTaxForms as exportTaxFormsCSV } from '../../lib/payrollExports'
import { fmt } from './shared'

// ─── Props ────────────────────────────────────────────────────────────────────

interface PayrollToolsTabProps {
  zh: boolean
  orgId: string
  supabase: SupabaseClient
  employees: Employee[]
  preview: PayrollPreviewRow[]
  expandedRecords: PayrollRecord[]
  onExportBankFile: () => void
  onExportInsuranceReport: () => void
  onExportAccounting: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PayrollToolsTab({
  zh,
  orgId,
  supabase,
  employees,
  preview,
  expandedRecords,
  onExportBankFile,
  onExportInsuranceReport,
  onExportAccounting,
}: PayrollToolsTabProps) {
  // ── Severance Calculator ────────────────────────────────────────────────────
  const [sevEmployeeId, setSevEmployeeId] = useState('')
  const [sevResult, setSevResult] = useState<SeveranceResult | null>(null)

  const calculateSeverance = async () => {
    if (!sevEmployeeId) return
    const { data: emp } = await supabase.from('users').select('hire_date').eq('id', sevEmployeeId).single()
    if (!emp?.hire_date) { alert(zh ? '無到職日資料' : 'No hire date found'); return }

    // Avg salary from last 6 months of payroll
    const { data: recentPayroll } = await supabase
      .from('payroll_records')
      .select('gross_salary')
      .eq('user_id', sevEmployeeId)
      .eq('org_id', orgId)
      .order('pay_period', { ascending: false })
      .limit(6)

    const salaries = (recentPayroll || []).map((r: any) => r.gross_salary)
    const avgSalary = salaries.length > 0 ? Math.round(salaries.reduce((a: number, b: number) => a + b, 0) / salaries.length) : 0

    const hireDate = new Date(emp.hire_date)
    const now = new Date()
    const totalMonths = (now.getFullYear() - hireDate.getFullYear()) * 12 + (now.getMonth() - hireDate.getMonth())
    const years = Math.floor(totalMonths / 12)
    const months = totalMonths % 12

    // New system: 0.5 month per year of service
    const amount = Math.round(avgSalary * 0.5 * (totalMonths / 12))
    setSevResult({ avgSalary, years, months, amount })
  }

  // ── Tax Form (扣繳憑單) ─────────────────────────────────────────────────────
  const [taxFormYear, setTaxFormYear] = useState(new Date().getFullYear() - 1)
  const [taxFormData, setTaxFormData] = useState<any[]>([])
  const [taxFormLoading, setTaxFormLoading] = useState(false)

  const generateTaxForms = async () => {
    setTaxFormLoading(true)
    const { data: records } = await supabase
      .from('payroll_records')
      .select('user_id, gross_salary, income_tax_withheld, net_salary, labor_ins_employee, health_ins_employee, supplementary_nhi')
      .eq('org_id', orgId)
      .gte('pay_period', `${taxFormYear}-01`)
      .lte('pay_period', `${taxFormYear}-12`)

    // Group by user
    const byUser: Record<string, any> = {}
    ;(records || []).forEach((r: any) => {
      if (!byUser[r.user_id]) byUser[r.user_id] = { user_id: r.user_id, total_gross: 0, total_tax: 0, total_net: 0, total_labor_ins: 0, total_health_ins: 0, total_supp_nhi: 0 }
      byUser[r.user_id].total_gross += r.gross_salary
      byUser[r.user_id].total_tax += r.income_tax_withheld || 0
      byUser[r.user_id].total_net += r.net_salary
      byUser[r.user_id].total_labor_ins += r.labor_ins_employee || 0
      byUser[r.user_id].total_health_ins += r.health_ins_employee || 0
      byUser[r.user_id].total_supp_nhi += r.supplementary_nhi || 0
    })

    // Fetch names
    const userIds = Object.keys(byUser)
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name, id_number').in('id', userIds)
      ;(users || []).forEach((u: any) => {
        if (byUser[u.id]) { byUser[u.id].user_name = u.name; byUser[u.id].id_number = u.id_number || '' }
      })
    }

    setTaxFormData(Object.values(byUser))
    setTaxFormLoading(false)
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Severance Calculator */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
          💼 {zh ? '資遣費試算（勞退新制）' : 'Severance Pay Calculator (New System)'}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          {zh ? '新制：每滿一年發給 0.5 個月平均工資。依最近 6 個月薪資平均計算。' : 'New system: 0.5 month average salary per year of service. Based on last 6 months average.'}
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="detail-label">{zh ? '選擇員工' : 'Employee'}</label>
            <select className="input-field" value={sevEmployeeId} onChange={e => setSevEmployeeId(e.target.value)} style={{ minWidth: '180px' }}>
              <option value="">--</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={calculateSeverance} disabled={!sevEmployeeId}>
            {zh ? '計算' : 'Calculate'}
          </button>
        </div>
        {sevResult && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
            <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '平均月薪' : 'Avg Monthly'}</div><div style={{ fontSize: '18px', fontWeight: 700 }}>${fmt(sevResult.avgSalary)}</div></div>
            <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '年資' : 'Service'}</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{sevResult.years}{zh ? '年' : 'y'} {sevResult.months}{zh ? '月' : 'm'}</div></div>
            <div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '資遣費' : 'Severance'}</div><div style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b' }}>${fmt(sevResult.amount)}</div></div>
          </div>
        )}
      </div>

      {/* Tax Form (扣繳憑單) */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
          📄 {zh ? '各類所得扣繳憑單' : 'Annual Tax Withholding Statement'}
        </h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div>
            <label className="detail-label">{zh ? '年度' : 'Year'}</label>
            <select className="input-field" value={taxFormYear} onChange={e => setTaxFormYear(Number(e.target.value))}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={generateTaxForms} disabled={taxFormLoading}>
            {taxFormLoading ? (zh ? '產生中…' : 'Generating…') : (zh ? '產生扣繳憑單' : 'Generate')}
          </button>
          {taxFormData.length > 0 && (
            <button className="btn btn-secondary" onClick={() => exportTaxFormsCSV(taxFormData, taxFormYear)}>
              {zh ? '匯出 CSV' : 'Export CSV'}
            </button>
          )}
        </div>
        {taxFormData.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                  {[zh ? '姓名' : 'Name', zh ? '身分證' : 'ID', zh ? '給付總額' : 'Total Gross', zh ? '扣繳稅額' : 'Tax Withheld', zh ? '勞保費' : 'Labor Ins.', zh ? '健保費' : 'Health Ins.', zh ? '補充保費' : 'Supp. NHI', zh ? '實領淨額' : 'Net'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {taxFormData.map((d: any) => (
                  <tr key={d.user_id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>{d.user_name || d.user_id}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '12px' }}>{d.id_number || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>${fmt(d.total_gross)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#fb923c' }}>${fmt(d.total_tax)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e' }}>${fmt(d.total_labor_ins)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e' }}>${fmt(d.total_health_ins)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f43f5e' }}>${fmt(d.total_supp_nhi)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#22c55e' }}>${fmt(d.total_net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Export Tools */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
          📊 {zh ? '匯出工具' : 'Export Tools'}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          {zh ? '從「執行薪資」或「薪資記錄」頁面計算/展開後，使用以下匯出功能：' : 'Calculate payroll or expand a history record first, then use these exports:'}
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onExportBankFile} disabled={preview.length === 0 && expandedRecords.length === 0}>
            🏦 {zh ? '銀行轉帳檔' : 'Bank Transfer File'}
          </button>
          <button className="btn btn-secondary" onClick={onExportInsuranceReport} disabled={preview.length === 0 && expandedRecords.length === 0}>
            🏥 {zh ? '保費報表' : 'Insurance Report'}
          </button>
          <button className="btn btn-secondary" onClick={onExportAccounting} disabled={preview.length === 0 && expandedRecords.length === 0}>
            📒 {zh ? '會計分錄匯出' : 'Accounting Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
