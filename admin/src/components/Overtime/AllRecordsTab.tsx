// ─── All Records Tab ─────────────────────────────────────────────────────────

import { useState } from 'react'
import type { OvertimeRequest, NewRequestForm, Store, UserRecord } from '../../types/overtime'
import { calcHoursFromDatetime, createEmptyForm } from '../../lib/overtimeHelpers'
import { FilingTypeBadge, OtTypeBadge, StatusBadge } from './Badges'

interface AllRecordsTabProps {
  zh: boolean
  allRequests: OvertimeRequest[]
  allLoading: boolean
  stores: Store[]
  activeUsers: UserRecord[]
  onCancel: (id: string) => Promise<void>
  onNewSubmit: (form: NewRequestForm) => Promise<string | null>
}

export function AllRecordsTab({
  zh,
  allRequests,
  allLoading,
  stores,
  activeUsers,
  onCancel,
  onNewSubmit,
}: AllRecordsTabProps) {
  // ── Filter state (local) ────────────────────────────────────────────────────
  const [filterStore, setFilterStore] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterFiling, setFilterFiling] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // ── New request modal state (local) ─────────────────────────────────────────
  const [showNewModal, setShowNewModal] = useState(false)
  const [newForm, setNewForm] = useState<NewRequestForm>(createEmptyForm())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // ── Cancel confirm state (local) ────────────────────────────────────────────
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  // ── Computed: filtered requests ─────────────────────────────────────────────

  const filteredRequests = allRequests.filter(r => {
    if (filterStore) {
      const storeName = (r.user as any)?.store?.name ?? ''
      const storeObj = stores.find(s => s.id === filterStore)
      if (!storeObj || storeName !== storeObj.name) return false
    }
    if (filterEmployee) {
      const name = r.user?.name ?? ''
      if (!name.toLowerCase().includes(filterEmployee.toLowerCase())) return false
    }
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterFiling !== 'all' && r.filing_type !== filterFiling) return false
    if (filterDateFrom && r.request_date < filterDateFrom) return false
    if (filterDateTo && r.request_date > filterDateTo) return false
    return true
  })

  const filteredTotalHours = filteredRequests.reduce((sum, r) => sum + (r.ot_hours || 0), 0)
  const filteredApprovedHours = filteredRequests
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + (r.ot_hours || 0), 0)
  const filteredPendingHours = filteredRequests
    .filter(r => r.status === 'pending')
    .reduce((sum, r) => sum + (r.ot_hours || 0), 0)

  // ── Handlers ────────────────────────────────────────────────────────────────

  function resetNewForm() {
    setNewForm(createEmptyForm())
    setSubmitError('')
  }

  function handleActualTimeChange(field: 'actual_start_time' | 'actual_end_time', value: string) {
    const updated = { ...newForm, [field]: value }
    if (updated.filing_type === 'post' && updated.actual_start_time && updated.actual_end_time) {
      const h = calcHoursFromDatetime(updated.actual_start_time, updated.actual_end_time)
      updated.ot_hours = h > 0 ? String(h) : ''
    }
    setNewForm(updated)
  }

  async function handleNewSubmit() {
    if (!newForm.user_id || !newForm.request_date) {
      setSubmitError(zh ? '請填寫必填欄位' : 'Please fill in required fields')
      return
    }

    setSubmitting(true)
    setSubmitError('')
    const error = await onNewSubmit(newForm)

    if (error) {
      setSubmitError(error)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setShowNewModal(false)
    resetNewForm()
  }

  async function handleCancel(id: string) {
    await onCancel(id)
    setCancellingId(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Store filter */}
          <div>
            <div className="detail-label" style={{ marginBottom: '4px' }}>
              {zh ? '門市' : 'Store'}
            </div>
            <select
              className="input-field"
              style={{ fontSize: '13px', minWidth: '130px' }}
              value={filterStore}
              onChange={e => setFilterStore(e.target.value)}
            >
              <option value="">{zh ? '所有門市' : 'All Stores'}</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Employee filter */}
          <div>
            <div className="detail-label" style={{ marginBottom: '4px' }}>
              {zh ? '員工' : 'Employee'}
            </div>
            <input
              className="input-field"
              style={{ fontSize: '13px', minWidth: '130px' }}
              placeholder={zh ? '搜尋員工…' : 'Search employee…'}
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
            />
          </div>

          {/* Status filter */}
          <div>
            <div className="detail-label" style={{ marginBottom: '4px' }}>
              {zh ? '狀態' : 'Status'}
            </div>
            <select
              className="input-field"
              style={{ fontSize: '13px', minWidth: '120px' }}
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">{zh ? '全部' : 'All'}</option>
              <option value="pending">{zh ? '待審核' : 'Pending'}</option>
              <option value="approved">{zh ? '已核准' : 'Approved'}</option>
              <option value="rejected">{zh ? '已拒絕' : 'Rejected'}</option>
              <option value="cancelled">{zh ? '已取消' : 'Cancelled'}</option>
            </select>
          </div>

          {/* Filing type filter */}
          <div>
            <div className="detail-label" style={{ marginBottom: '4px' }}>
              {zh ? '申請類型' : 'Filing'}
            </div>
            <select
              className="input-field"
              style={{ fontSize: '13px', minWidth: '120px' }}
              value={filterFiling}
              onChange={e => setFilterFiling(e.target.value)}
            >
              <option value="all">{zh ? '全部' : 'All'}</option>
              <option value="pre">{zh ? '事前申請' : 'Pre-Approval'}</option>
              <option value="post">{zh ? '事後補報' : 'Post-Filing'}</option>
            </select>
          </div>

          {/* Date range */}
          <div>
            <div className="detail-label" style={{ marginBottom: '4px' }}>
              {zh ? '開始日期' : 'Date From'}
            </div>
            <input
              type="date"
              className="input-field"
              style={{ fontSize: '13px' }}
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div>
            <div className="detail-label" style={{ marginBottom: '4px' }}>
              {zh ? '結束日期' : 'Date To'}
            </div>
            <input
              type="date"
              className="input-field"
              style={{ fontSize: '13px' }}
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
            />
          </div>

          {/* Clear filters */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setFilterStore('')
              setFilterEmployee('')
              setFilterStatus('all')
              setFilterFiling('all')
              setFilterDateFrom('')
              setFilterDateTo('')
            }}
          >
            {zh ? '清除篩選' : 'Clear'}
          </button>

          {/* Spacer + New Request */}
          <div style={{ marginLeft: 'auto' }}>
            <button
              className="btn btn-primary"
              onClick={() => { setShowNewModal(true); resetNewForm() }}
            >
              + {zh ? '新增申請' : 'New Request'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#60a5fa' }}>
            {filteredTotalHours.toFixed(1)}h
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {zh ? '篩選總時數' : 'Total Hours'}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#22c55e' }}>
            {filteredApprovedHours.toFixed(1)}h
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {zh ? '已核准時數' : 'Approved Hours'}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#f59e0b' }}>
            {filteredPendingHours.toFixed(1)}h
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {zh ? '待審核時數' : 'Pending Hours'}
          </div>
        </div>
      </div>

      {/* All Records Table */}
      {allLoading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {zh ? '載入中…' : 'Loading…'}
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {zh ? '無符合條件的記錄' : 'No records found'}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                  {[
                    zh ? '員工' : 'Employee',
                    zh ? '日期' : 'Date',
                    zh ? '類型' : 'Filing',
                    zh ? '補償' : 'OT Type',
                    zh ? '時數' : 'Hours',
                    zh ? '原因' : 'Reason',
                    zh ? '狀態' : 'Status',
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
                {filteredRequests.map(req => (
                  <tr
                    key={req.id}
                    style={{ verticalAlign: 'middle' }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 500 }}>{req.user?.name ?? '—'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {(req.user as any)?.store?.name ?? ''}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
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
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', maxWidth: '180px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {req.reason ?? '—'}
                      </div>
                      {req.rejection_reason && (
                        <div style={{ fontSize: '11px', color: '#f43f5e', marginTop: '2px' }}>
                          {zh ? '拒絕：' : 'Reason: '}{req.rejection_reason}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={req.status} zh={zh} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {req.status === 'pending' && (
                        cancellingId === req.id ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {zh ? '確定取消？' : 'Confirm cancel?'}
                            </span>
                            <button
                              className="btn btn-sm"
                              onClick={() => handleCancel(req.id)}
                              style={{ background: '#f43f5e', color: '#fff', border: 'none', cursor: 'pointer' }}
                            >
                              {zh ? '確定' : 'Yes'}
                            </button>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => setCancellingId(null)}
                            >
                              {zh ? '否' : 'No'}
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => setCancellingId(req.id)}
                          >
                            {zh ? '取消申請' : 'Cancel'}
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── NEW REQUEST MODAL ─────────────────────────────────────────────── */}
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
            padding: '16px', overscrollBehavior: 'contain' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowNewModal(false); resetNewForm() } }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '520px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              position: 'relative',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                {zh ? '新增加班申請' : 'New Overtime Request'}
              </h2>
              <button
                onClick={() => { setShowNewModal(false); resetNewForm() }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '20px',
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
                value={newForm.user_id}
                onChange={e => setNewForm({ ...newForm, user_id: e.target.value })}
              >
                <option value="">{zh ? '請選擇員工…' : 'Select employee…'}</option>
                {activeUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '加班日期 *' : 'Date *'}
              </label>
              <input
                type="date"
                className="input-field"
                style={{ width: '100%' }}
                value={newForm.request_date}
                onChange={e => setNewForm({ ...newForm, request_date: e.target.value })}
              />
            </div>

            {/* Filing Type */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '8px' }}>
                {zh ? '申請類型 *' : 'Filing Type *'}
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {(['pre', 'post'] as const).map(type => (
                  <label
                    key={type}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '10px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${newForm.filing_type === type ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: newForm.filing_type === type ? 'var(--accent-primary-dim)' : 'transparent',
                      flex: 1,
                      fontSize: '13px',
                    }}
                  >
                    <input
                      type="radio"
                      name="filing_type"
                      value={type}
                      checked={newForm.filing_type === type}
                      onChange={() => setNewForm({ ...newForm, filing_type: type, ot_hours: '' })}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    {type === 'pre'
                      ? (zh ? '事前申請 (Pre-Approval)' : 'Pre-Approval')
                      : (zh ? '事後補報 (Post-Filing)' : 'Post-Filing')}
                  </label>
                ))}
              </div>
            </div>

            {/* Conditional fields */}
            {newForm.filing_type === 'pre' ? (
              <div style={{ marginBottom: '16px' }}>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '預計加班結束時間' : 'Planned OT End Time'}
                </label>
                <input
                  type="time"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={newForm.planned_end_time}
                  onChange={e => setNewForm({ ...newForm, planned_end_time: e.target.value })}
                />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                    {zh ? '實際開始時間' : 'Actual OT Start'}
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={newForm.actual_start_time}
                    onChange={e => handleActualTimeChange('actual_start_time', e.target.value)}
                  />
                </div>
                <div>
                  <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                    {zh ? '實際結束時間' : 'Actual OT End'}
                  </label>
                  <input
                    type="datetime-local"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={newForm.actual_end_time}
                    onChange={e => handleActualTimeChange('actual_end_time', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* OT Hours */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '加班時數' : 'OT Hours'}
                {newForm.filing_type === 'post' && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px', fontSize: '11px' }}>
                    ({zh ? '從時間自動計算' : 'auto-calculated from times'})
                  </span>
                )}
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="input-field"
                style={{ width: '100%' }}
                placeholder="0.0"
                value={newForm.ot_hours}
                readOnly={newForm.filing_type === 'post' && !!(newForm.actual_start_time && newForm.actual_end_time)}
                onChange={e => setNewForm({ ...newForm, ot_hours: e.target.value })}
              />
            </div>

            {/* OT Compensation */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '加班補償方式 *' : 'OT Compensation *'}
              </label>
              <select
                className="input-field"
                style={{ width: '100%' }}
                value={newForm.ot_type}
                onChange={e => setNewForm({ ...newForm, ot_type: e.target.value as 'pay' | 'comp' })}
              >
                <option value="pay">{zh ? '加班費 (Pay)' : 'Pay (Overtime Pay)'}</option>
                <option value="comp">{zh ? '補休 (Comp Time)' : 'Comp Time'}</option>
              </select>
            </div>

            {/* Reason */}
            <div style={{ marginBottom: '20px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '加班原因' : 'Reason'}
              </label>
              <textarea
                className="input-field"
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder={zh ? '請說明加班原因…' : 'Describe the reason for overtime…'}
                value={newForm.reason}
                onChange={e => setNewForm({ ...newForm, reason: e.target.value })}
              />
            </div>

            {/* Error */}
            {submitError && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(244,63,94,0.1)',
                color: '#f43f5e',
                fontSize: '13px',
                marginBottom: '16px',
                border: '1px solid rgba(244,63,94,0.25)',
              }}>
                {submitError}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowNewModal(false); resetNewForm() }}
                disabled={submitting}
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleNewSubmit}
                disabled={submitting || !newForm.user_id || !newForm.request_date}
              >
                {submitting ? (zh ? '送出中…' : 'Submitting…') : (zh ? '送出申請' : 'Submit Request')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
