import type { PayrollPreviewRow, PayrollRun } from '../../types/payroll'
import { fmt, StatusBadge } from './shared'

// ─── Props ────────────────────────────────────────────────────────────────────

interface RunPayrollTabProps {
  zh: boolean
  payPeriod: string
  setPayPeriod: (v: string) => void
  preview: PayrollPreviewRow[]
  calculating: boolean
  saving: boolean
  sending: boolean
  resendingRunId: string | null
  existingRun: PayrollRun | null
  includeYearEnd: boolean
  setIncludeYearEnd: (v: boolean) => void
  onCalculate: () => void
  onConfirm: () => void
  onExportCSV: () => void
  onExportBankFile: () => void
  onExportInsuranceReport: () => void
  onExportAccounting: () => void
  onSendPayslips: (runId: string) => void
  onUpdateOtherBonus: (userId: string, value: number) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RunPayrollTab({
  zh,
  payPeriod,
  setPayPeriod,
  preview,
  calculating,
  saving,
  sending,
  resendingRunId,
  existingRun,
  includeYearEnd,
  setIncludeYearEnd,
  onCalculate,
  onConfirm,
  onExportCSV,
  onExportBankFile,
  onExportInsuranceReport,
  onExportAccounting,
  onSendPayslips,
  onUpdateOtherBonus,
}: RunPayrollTabProps) {
  return (
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
              onClick={onCalculate}
              disabled={calculating}
            >
              {calculating
                ? zh ? '計算中…' : 'Calculating…'
                : zh ? '計算薪資' : 'Calculate Payroll'}
            </button>
            {preview.length > 0 && (
              <>
                <button className="btn btn-secondary" onClick={onExportCSV}>
                  {zh ? '匯出 CSV' : 'Export CSV'}
                </button>
                <button className="btn btn-secondary" onClick={onExportBankFile}>
                  {zh ? '銀行轉帳檔' : 'Bank File'}
                </button>
                <button className="btn btn-secondary" onClick={onExportInsuranceReport}>
                  {zh ? '保費報表' : 'Ins. Report'}
                </button>
                <button className="btn btn-secondary" onClick={onExportAccounting}>
                  {zh ? '會計分錄' : 'Accounting'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={onConfirm}
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
                    onClick={() => onSendPayslips(existingRun.id)}
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
                    <tr key={r.user_id} style={{ verticalAlign: 'middle' }}>
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
                          onChange={e => onUpdateOtherBonus(r.user_id, parseFloat(e.target.value) || 0)}
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
  )
}
