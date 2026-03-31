import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { calcDays } from '../../lib/leaveCalculations'
import { formatDate } from '../../lib/leaveCalculations'
import type { Store, User, LeaveRequest, LeaveBalance } from '../../types/leave'
import { LEAVE_TYPE_COLORS, LEAVE_STATUS_COLORS, PAID_TYPES } from '../../types/leave'

// ─── Props ────────────────────────────────────────────────────────────────────

interface AllRequestsTabProps {
    zh: boolean
    orgId: string
    stores: Store[]
    users: User[]
    allRequests: LeaveRequest[]
    loadingAll: boolean
    leaveTypeLabel: Record<string, string>
    leaveStatusLabel: Record<string, string>
    onRequestCreated: () => void
    onRefreshPending: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AllRequestsTab({
    zh,
    orgId,
    stores,
    users,
    allRequests,
    loadingAll,
    leaveTypeLabel,
    leaveStatusLabel,
    onRequestCreated,
    onRefreshPending,
}: AllRequestsTabProps) {
    // ── Filter state ──
    const [filterStatus, setFilterStatus] = useState<string>('all')
    const [filterStore, setFilterStore] = useState<string>('all')
    const [filterUser, setFilterUser] = useState<string>('all')
    const [filterDateFrom, setFilterDateFrom] = useState('')
    const [filterDateTo, setFilterDateTo] = useState('')

    // ── New request modal state ──
    const [showNewModal, setShowNewModal] = useState(false)
    const [newForm, setNewForm] = useState({
        user_id: '',
        leave_type: 'annual',
        start_date: '',
        end_date: '',
        reason: '',
    })
    const [newFormBalance, setNewFormBalance] = useState<LeaveBalance | null>(null)
    const [loadingBalance, setLoadingBalance] = useState(false)
    const [submittingNew, setSubmittingNew] = useState(false)

    // ── Filtering logic ──
    const filteredRequests = allRequests.filter(req => {
        if (filterStatus !== 'all' && req.status !== filterStatus) return false
        if (filterStore !== 'all' && req.store_id !== filterStore) return false
        if (filterUser !== 'all' && req.user_id !== filterUser) return false
        if (filterDateFrom && req.start_date < filterDateFrom) return false
        if (filterDateTo && req.end_date > filterDateTo) return false
        return true
    })

    // ── Load balance preview when employee + leave type selected in modal ──
    useEffect(() => {
        if (!newForm.user_id || !newForm.leave_type || !orgId) {
            setNewFormBalance(null)
            return
        }
        const year = new Date().getFullYear()
        const fetchBalance = async () => {
            setLoadingBalance(true)
            const { data } = await supabase
                .from('leave_balances')
                .select('*')
                .eq('user_id', newForm.user_id)
                .eq('year', year)
                .eq('leave_type', newForm.leave_type)
                .single()
            setNewFormBalance(data || null)
            setLoadingBalance(false)
        }
        fetchBalance()
    }, [newForm.user_id, newForm.leave_type, orgId])

    async function submitNewRequest() {
        if (!newForm.user_id || !newForm.start_date || !newForm.end_date) return
        setSubmittingNew(true)
        const selectedUser = users.find(u => u.id === newForm.user_id)
        const totalDays = calcDays(newForm.start_date, newForm.end_date)
        const isPaid = PAID_TYPES.includes(newForm.leave_type)

        await supabase.from('leave_requests').insert({
            user_id: newForm.user_id,
            store_id: selectedUser?.store_id || null,
            organization_id: orgId,
            start_date: newForm.start_date,
            end_date: newForm.end_date,
            leave_type: newForm.leave_type,
            reason: newForm.reason.trim() || null,
            status: 'pending',
            total_days: totalDays,
            is_paid: isPaid,
        })

        setNewForm({ user_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })
        setShowNewModal(false)
        setSubmittingNew(false)
        onRequestCreated()
        onRefreshPending()
    }

    return (
        <div>
            {/* Filter bar */}
            <div className="card" style={{ marginBottom: '16px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                        <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                        <select
                            className="input-field"
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                            style={{ minWidth: '120px' }}
                        >
                            <option value="all">{zh ? '全部' : 'All'}</option>
                            <option value="pending">{zh ? '待審核' : 'Pending'}</option>
                            <option value="approved">{zh ? '已批准' : 'Approved'}</option>
                            <option value="rejected">{zh ? '已拒絕' : 'Rejected'}</option>
                            <option value="cancelled">{zh ? '已取消' : 'Cancelled'}</option>
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '門市' : 'Store'}</label>
                        <select
                            className="input-field"
                            value={filterStore}
                            onChange={e => setFilterStore(e.target.value)}
                            style={{ minWidth: '120px' }}
                        >
                            <option value="all">{zh ? '全部門市' : 'All Stores'}</option>
                            {stores.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '員工' : 'Employee'}</label>
                        <select
                            className="input-field"
                            value={filterUser}
                            onChange={e => setFilterUser(e.target.value)}
                            style={{ minWidth: '140px' }}
                        >
                            <option value="all">{zh ? '全部員工' : 'All Employees'}</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '開始日期' : 'From'}</label>
                        <input
                            className="input-field"
                            type="date"
                            value={filterDateFrom}
                            onChange={e => setFilterDateFrom(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '結束日期' : 'To'}</label>
                        <input
                            className="input-field"
                            type="date"
                            value={filterDateTo}
                            onChange={e => setFilterDateTo(e.target.value)}
                        />
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                        <button
                            className="btn btn-primary"
                            onClick={() => setShowNewModal(true)}
                        >
                            ➕ {zh ? '新增申請' : 'New Request'}
                        </button>
                    </div>
                </div>
            </div>

            {/* All requests table */}
            {loadingAll ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '載入中…' : 'Loading…'}
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '沒有符合條件的請假申請' : 'No leave requests found'}
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                    {[
                                        zh ? '員工' : 'Employee',
                                        zh ? '假別' : 'Type',
                                        zh ? '開始' : 'From',
                                        zh ? '結束' : 'To',
                                        zh ? '天數' : 'Days',
                                        zh ? '薪資' : 'Paid',
                                        zh ? '狀態' : 'Status',
                                        zh ? '原因' : 'Reason',
                                        zh ? '門市' : 'Store',
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
                                {filteredRequests.map(req => (
                                    <tr
                                        key={req.id}
                                        style={{ borderBottom: '1px solid var(--outline-variant)', transition: 'background 0.15s' }}
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
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            {formatDate(req.start_date)}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                            {formatDate(req.end_date)}
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
                                        <td style={{ padding: '12px 16px' }}>
                                            <span
                                                className="badge"
                                                style={{
                                                    background: LEAVE_STATUS_COLORS[req.status] + '33',
                                                    color: LEAVE_STATUS_COLORS[req.status],
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                }}
                                            >
                                                {leaveStatusLabel[req.status] || req.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {req.reason || '—'}
                                        </td>
                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {(req.user as any)?.store?.name || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Summary count */}
            {!loadingAll && filteredRequests.length > 0 && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
                    {zh ? `共 ${filteredRequests.length} 筆` : `${filteredRequests.length} record(s)`}
                </div>
            )}

            {/* ── New Leave Request Modal ── */}
            {showNewModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 50,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        overscrollBehavior: 'contain',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setShowNewModal(false) }}
                >
                    <div
                        className="card fade-in"
                        style={{
                            width: '100%',
                            maxWidth: '520px',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            position: 'relative',
                        }}
                    >
                        {/* Modal header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                                ➕ {zh ? '新增請假申請' : 'New Leave Request'}
                            </h3>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setShowNewModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Form */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Employee */}
                            <div>
                                <label className="detail-label">{zh ? '員工 *' : 'Employee *'}</label>
                                <select
                                    className="input-field"
                                    value={newForm.user_id}
                                    onChange={e => setNewForm({ ...newForm, user_id: e.target.value })}
                                >
                                    <option value="">{zh ? '— 選擇員工 —' : '— Select Employee —'}</option>
                                    {users.filter(u => u.status === 'active').map(u => (
                                        <option key={u.id} value={u.id}>
                                            {u.name}{u.store ? ` (${(u.store as any).name})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Leave type */}
                            <div>
                                <label className="detail-label">{zh ? '假別 *' : 'Leave Type *'}</label>
                                <select
                                    className="input-field"
                                    value={newForm.leave_type}
                                    onChange={e => setNewForm({ ...newForm, leave_type: e.target.value })}
                                >
                                    {Object.entries(leaveTypeLabel).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Balance preview */}
                            {newForm.user_id && newForm.leave_type && (
                                <div style={{
                                    padding: '10px 14px',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}>
                                    {loadingBalance ? (
                                        <span style={{ color: 'var(--text-muted)' }}>{zh ? '查詢餘額中…' : 'Loading balance…'}</span>
                                    ) : (
                                        <>
                                            <span style={{ color: 'var(--text-secondary)' }}>
                                                {leaveTypeLabel[newForm.leave_type]} {zh ? '剩餘：' : 'Remaining:'}
                                            </span>
                                            <span
                                                className="badge"
                                                style={{
                                                    background: LEAVE_TYPE_COLORS[newForm.leave_type] + '33',
                                                    color: LEAVE_TYPE_COLORS[newForm.leave_type],
                                                    fontSize: '12px',
                                                    padding: '2px 10px',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {newFormBalance
                                                    ? `${(newFormBalance.total_days + newFormBalance.carry_over_days - newFormBalance.used_days)} ${zh ? '天' : 'days'}`
                                                    : (zh ? '無紀錄' : 'No record')}
                                            </span>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Date range */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label className="detail-label">{zh ? '開始日期 *' : 'Start Date *'}</label>
                                    <input
                                        className="input-field"
                                        type="date"
                                        value={newForm.start_date}
                                        onChange={e => setNewForm({ ...newForm, start_date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '結束日期 *' : 'End Date *'}</label>
                                    <input
                                        className="input-field"
                                        type="date"
                                        value={newForm.end_date}
                                        min={newForm.start_date}
                                        onChange={e => setNewForm({ ...newForm, end_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Days preview + paid indicator */}
                            {newForm.start_date && newForm.end_date && (
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {zh ? '共' : 'Total:'}
                                    </span>
                                    <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                                        {calcDays(newForm.start_date, newForm.end_date)} {zh ? '天' : 'days'}
                                    </span>
                                    <span
                                        className="badge"
                                        style={{
                                            background: PAID_TYPES.includes(newForm.leave_type) ? '#22c55e22' : '#6b728022',
                                            color: PAID_TYPES.includes(newForm.leave_type) ? '#22c55e' : '#9ca3af',
                                            fontSize: '11px',
                                            padding: '2px 8px',
                                        }}
                                    >
                                        {PAID_TYPES.includes(newForm.leave_type) ? (zh ? '有薪假' : 'Paid Leave') : (zh ? '無薪假' : 'Unpaid Leave')}
                                    </span>
                                </div>
                            )}

                            {/* Reason */}
                            <div>
                                <label className="detail-label">{zh ? '原因 (選填)' : 'Reason (optional)'}</label>
                                <textarea
                                    className="input-field"
                                    rows={3}
                                    placeholder={zh ? '請輸入請假原因…' : 'Enter reason for leave…'}
                                    value={newForm.reason}
                                    onChange={e => setNewForm({ ...newForm, reason: e.target.value })}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                                <button
                                    className="btn btn-primary"
                                    onClick={submitNewRequest}
                                    disabled={submittingNew || !newForm.user_id || !newForm.start_date || !newForm.end_date}
                                    style={{ flex: 1 }}
                                >
                                    {submittingNew ? (zh ? '提交中…' : 'Submitting…') : (zh ? '提交申請' : 'Submit Request')}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setShowNewModal(false)}
                                >
                                    {zh ? '取消' : 'Cancel'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
