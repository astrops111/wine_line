// ─── Pending Approvals Tab ────────────────────────────────────────────────────

import { useState } from 'react'
import type { OvertimeRequest, MonthlyStats } from '../../types/overtime'
import { FilingTypeBadge, OtTypeBadge } from './Badges'

interface PendingTabProps {
  zh: boolean
  pendingRequests: OvertimeRequest[]
  pendingLoading: boolean
  monthlyStats: MonthlyStats
  onApprove: (req: OvertimeRequest) => Promise<void>
  onReject: (req: OvertimeRequest, reason: string) => Promise<void>
  actionLoading: string | null
}

export function PendingTab({
  zh,
  pendingRequests,
  pendingLoading,
  monthlyStats,
  onApprove,
  onReject,
  actionLoading,
}: PendingTabProps) {
  // Local UI state for inline rejection
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  async function handleRejectConfirm(req: OvertimeRequest) {
    if (!rejectReason.trim()) return
    await onReject(req, rejectReason.trim())
    setRejectingId(null)
    setRejectReason('')
  }

  return (
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
                            onClick={() => onApprove(req)}
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
  )
}
