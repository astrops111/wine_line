import { useState } from 'react'
import type { LeaveRequest } from '../../types/leave'
import { LEAVE_TYPE_COLORS } from '../../types/leave'
import { formatDate } from '../../lib/leaveCalculations'

// ─── Props ────────────────────────────────────────────────────────────────────

interface PendingTabProps {
    zh: boolean
    pendingRequests: LeaveRequest[]
    loadingPending: boolean
    approvedThisMonth: number
    rejectedThisMonth: number
    leaveTypeLabel: Record<string, string>
    onApprove: (req: LeaveRequest) => Promise<void>
    onReject: (id: string, reason: string) => Promise<void>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PendingTab({
    zh,
    pendingRequests,
    loadingPending,
    approvedThisMonth,
    rejectedThisMonth,
    leaveTypeLabel,
    onApprove,
    onReject,
}: PendingTabProps) {
    const [rejectingId, setRejectingId] = useState<string | null>(null)
    const [rejectionInput, setRejectionInput] = useState('')

    const pendingCount = pendingRequests.length

    function startReject(id: string) {
        setRejectingId(id)
        setRejectionInput('')
    }

    async function confirmReject(id: string) {
        await onReject(id, rejectionInput.trim())
        setRejectingId(null)
        setRejectionInput('')
    }

    return (
        <div>
            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>
                        {pendingCount}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {zh ? '待審核' : 'Pending Approvals'}
                    </div>
                </div>
                <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#22c55e' }}>
                        {approvedThisMonth}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {zh ? '本月已批准' : 'Approved This Month'}
                    </div>
                </div>
                <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#f43f5e' }}>
                        {rejectedThisMonth}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {zh ? '本月已拒絕' : 'Rejected This Month'}
                    </div>
                </div>
            </div>

            {/* Pending table */}
            {loadingPending ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '載入中…' : 'Loading…'}
                </div>
            ) : pendingRequests.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '目前沒有待審核的請假申請' : 'No pending leave requests'}
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                    {[
                                        zh ? '員工' : 'Employee',
                                        zh ? '假別' : 'Leave Type',
                                        zh ? '日期區間' : 'Date Range',
                                        zh ? '天數' : 'Days',
                                        zh ? '薪資' : 'Paid',
                                        zh ? '原因' : 'Reason',
                                        zh ? '門市' : 'Store',
                                        zh ? '操作' : 'Actions',
                                    ].map(h => (
                                        <th
                                            key={h}
                                            style={{
                                                padding: '12px 16px',
                                                textAlign: 'left',
                                                color: 'var(--text-muted)',
                                                fontWeight: 600,
                                                fontSize: '11px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
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
                                    <tr
                                        key={req.id}
                                        style={{
                                            borderBottom: '1px solid var(--outline-variant)',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                                    >
                                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                                            {req.user?.name || '—'}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span
                                                className="badge"
                                                style={{
                                                    background: LEAVE_TYPE_COLORS[req.leave_type] + '33',
                                                    color: LEAVE_TYPE_COLORS[req.leave_type],
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                }}
                                            >
                                                {leaveTypeLabel[req.leave_type] || req.leave_type}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                                            {formatDate(req.start_date)} ~ {formatDate(req.end_date)}
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>
                                            {req.total_days}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span
                                                className="badge"
                                                style={{
                                                    background: req.is_paid ? '#22c55e22' : '#6b728022',
                                                    color: req.is_paid ? '#22c55e' : '#9ca3af',
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                }}
                                            >
                                                {req.is_paid ? (zh ? '有薪' : 'Paid') : (zh ? '無薪' : 'Unpaid')}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {req.reason || '—'}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {req.user?.store?.name || '—'}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            {rejectingId === req.id ? (
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <input
                                                        className="input-field"
                                                        placeholder={zh ? '拒絕原因 (選填)' : 'Rejection reason (optional)'}
                                                        value={rejectionInput}
                                                        onChange={e => setRejectionInput(e.target.value)}
                                                        style={{ fontSize: '12px', padding: '4px 8px', minWidth: '150px' }}
                                                        autoFocus
                                                    />
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: '#f43f5e22', color: '#f43f5e', padding: '4px 10px' }}
                                                        onClick={() => confirmReject(req.id)}
                                                    >
                                                        {zh ? '確認拒絕' : 'Confirm'}
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        style={{ padding: '4px 8px' }}
                                                        onClick={() => setRejectingId(null)}
                                                    >
                                                        {zh ? '取消' : 'Cancel'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ color: '#22c55e', padding: '4px 10px', background: '#22c55e22' }}
                                                        onClick={() => onApprove(req)}
                                                        title={zh ? '批准' : 'Approve'}
                                                    >
                                                        ✓
                                                    </button>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ color: '#f43f5e', padding: '4px 10px', background: '#f43f5e22' }}
                                                        onClick={() => startReject(req.id)}
                                                        title={zh ? '拒絕' : 'Reject'}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
