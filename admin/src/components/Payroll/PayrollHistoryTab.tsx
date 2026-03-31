import type { PayrollRun, PayrollRecord } from '../../types/payroll'
import { fmt, StatusBadge } from './shared'

// ─── Props ────────────────────────────────────────────────────────────────────

interface PayrollHistoryTabProps {
  zh: boolean
  payrollRuns: PayrollRun[]
  historyLoading: boolean
  expandedRunId: string | null
  expandedRecords: PayrollRecord[]
  expandedLoading: boolean
  sending: boolean
  resendingRunId: string | null
  onToggleExpand: (runId: string) => void
  onSendPayslips: (runId: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PayrollHistoryTab({
  zh,
  payrollRuns,
  historyLoading,
  expandedRunId,
  expandedRecords,
  expandedLoading,
  sending,
  resendingRunId,
  onToggleExpand,
  onSendPayslips,
}: PayrollHistoryTabProps) {
  return (
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
                onClick={() => onToggleExpand(run.id)}
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
                      onClick={e => { e.stopPropagation(); onSendPayslips(run.id) }}
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
  )
}
