import { useState } from 'react'
import type { SalaryStructure, Employee } from '../../types/payroll'
import { fmt } from './shared'

// ─── Props ────────────────────────────────────────────────────────────────────

interface SalaryStructureTabProps {
  zh: boolean
  salaryStructures: SalaryStructure[]
  employees: Employee[]
  structLoading: boolean
  employeesWithoutStruct: Employee[]
  onSaveStruct: (data: Partial<SalaryStructure>) => Promise<void>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SalaryStructureTab({
  zh,
  salaryStructures,
  employees,
  structLoading,
  employeesWithoutStruct,
  onSaveStruct,
}: SalaryStructureTabProps) {
  const [editingStruct, setEditingStruct] = useState<Partial<SalaryStructure> | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  function openNew() {
    setEditingStruct({
      user_id: '',
      base_salary: 28590,
      role_allowance: 0,
      meal_allowance: 0,
      transport_allowance: 0,
      attendance_bonus: 0,
      year_end_bonus_months: 1,
      salary_type: 'monthly',
      hourly_rate: 0,
      health_ins_dependents: 0,
      effective_from: new Date().toISOString().slice(0, 10),
      notes: '',
    })
    setShowModal(true)
  }

  function openEdit(s: SalaryStructure) {
    setEditingStruct({ ...s })
    setShowModal(true)
  }

  async function handleSave() {
    if (!editingStruct?.user_id) {
      alert(zh ? '請選擇員工' : 'Please select an employee')
      return
    }
    setSaving(true)
    await onSaveStruct(editingStruct)
    setSaving(false)
    setShowModal(false)
    setEditingStruct(null)
  }

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
            {zh ? '員工薪資結構' : 'Employee Salary Structures'}
          </h2>
          {employeesWithoutStruct.length > 0 && (
            <p style={{ fontSize: '13px', color: '#f59e0b', marginTop: '4px' }}>
              {zh
                ? `${employeesWithoutStruct.length} 位員工尚未設定薪資結構`
                : `${employeesWithoutStruct.length} employee(s) have no salary structure`}
            </p>
          )}
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          + {zh ? '新增薪資結構' : 'Add Structure'}
        </button>
      </div>

      {/* Employees without struct warning */}
      {employeesWithoutStruct.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#f59e0b',
          }}
        >
          <strong>{zh ? '尚無薪資結構的員工：' : 'Employees without a structure: '}</strong>
          {employeesWithoutStruct.map(e => e.name).join('、')}
        </div>
      )}

      {/* Table */}
      {structLoading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {zh ? '載入中…' : 'Loading…'}
        </div>
      ) : salaryStructures.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {zh ? '尚無薪資結構，請點擊上方按鈕新增' : 'No salary structures yet. Click the button above to add one.'}
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
                    zh ? '薪資類型' : 'Type',
                    zh ? '底薪' : 'Base Salary',
                    zh ? '職務津貼' : 'Role Allow.',
                    zh ? '伙食津貼' : 'Meal Allow.',
                    zh ? '交通津貼' : 'Transport Allow.',
                    zh ? '全勤獎金' : 'Attend. Bonus',
                    zh ? '生效日' : 'Effective',
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
                {salaryStructures.map(s => (
                  <tr key={s.id} style={{ verticalAlign: 'middle' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{s.user_name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{s.store_name}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background:
                            s.salary_type === 'hourly'
                              ? 'rgba(139,92,246,0.15)'
                              : 'rgba(59,130,246,0.15)',
                          color: s.salary_type === 'hourly' ? '#8b5cf6' : '#3b82f6',
                          border: `1px solid ${s.salary_type === 'hourly' ? 'rgba(139,92,246,0.3)' : 'rgba(59,130,246,0.3)'}`,
                        }}
                      >
                        {s.salary_type === 'hourly'
                          ? zh ? '時薪制' : 'Hourly'
                          : zh ? '月薪制' : 'Monthly'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>
                      {s.salary_type === 'hourly'
                        ? `$${fmt(s.hourly_rate)}/hr`
                        : `$${fmt(s.base_salary)}`}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {s.role_allowance > 0 ? `$${fmt(s.role_allowance)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {s.meal_allowance > 0 ? `$${fmt(s.meal_allowance)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {s.transport_allowance > 0 ? `$${fmt(s.transport_allowance)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {s.attendance_bonus > 0 ? `$${fmt(s.attendance_bonus)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {s.effective_from}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => openEdit(s)}
                      >
                        {zh ? '編輯' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SALARY STRUCTURE MODAL ──────────────────────────────────────────── */}
      {showModal && editingStruct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px', overscrollBehavior: 'contain' }}
          onClick={e => {
            if (e.target === e.currentTarget) {
              setShowModal(false)
              setEditingStruct(null)
            }
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '580px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              position: 'relative',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                {editingStruct.id
                  ? zh ? '編輯薪資結構' : 'Edit Salary Structure'
                  : zh ? '新增薪資結構' : 'Add Salary Structure'}
              </h2>
              <button
                onClick={() => { setShowModal(false); setEditingStruct(null) }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: '22px',
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
                value={editingStruct.user_id || ''}
                onChange={e => setEditingStruct({ ...editingStruct, user_id: e.target.value })}
                disabled={!!editingStruct.id}
              >
                <option value="">{zh ? '請選擇員工…' : 'Select employee…'}</option>
                {employees.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.store_name !== '—' ? ` (${u.store_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Salary Type */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '8px' }}>
                {zh ? '薪資類型 *' : 'Salary Type *'}
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {(['monthly', 'hourly'] as const).map(type => (
                  <label
                    key={type}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '10px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${editingStruct.salary_type === type ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: editingStruct.salary_type === type ? 'var(--accent-primary-dim)' : 'transparent',
                      flex: 1,
                      fontSize: '13px',
                    }}
                  >
                    <input
                      type="radio"
                      name="salary_type"
                      value={type}
                      checked={editingStruct.salary_type === type}
                      onChange={() => setEditingStruct({ ...editingStruct, salary_type: type })}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    {type === 'monthly'
                      ? zh ? '月薪制' : 'Monthly'
                      : zh ? '時薪制' : 'Hourly'}
                  </label>
                ))}
              </div>
            </div>

            {/* Base Salary / Hourly Rate */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {editingStruct.salary_type === 'hourly'
                    ? zh ? '時薪 (NT$)' : 'Hourly Rate (NT$)'
                    : zh ? '底薪 (NT$)' : 'Base Salary (NT$)'}
                </label>
                {editingStruct.salary_type === 'hourly' ? (
                  <input
                    type="number"
                    min="0"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={editingStruct.hourly_rate ?? 0}
                    onChange={e => setEditingStruct({ ...editingStruct, hourly_rate: parseFloat(e.target.value) || 0 })}
                  />
                ) : (
                  <input
                    type="number"
                    min="0"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={editingStruct.base_salary ?? 0}
                    onChange={e => setEditingStruct({ ...editingStruct, base_salary: parseFloat(e.target.value) || 0 })}
                  />
                )}
              </div>

              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '職務津貼 (NT$)' : 'Role Allowance (NT$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.role_allowance ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, role_allowance: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '伙食津貼 (NT$)' : 'Meal Allowance (NT$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.meal_allowance ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, meal_allowance: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '交通津貼 (NT$)' : 'Transport Allowance (NT$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.transport_allowance ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, transport_allowance: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '全勤獎金 (NT$)' : 'Attendance Bonus (NT$)'}
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.attendance_bonus ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, attendance_bonus: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '年終月數 (倍數)' : 'Year-End Bonus (months)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="12"
                  step="0.5"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.year_end_bonus_months ?? 1}
                  onChange={e => setEditingStruct({ ...editingStruct, year_end_bonus_months: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                  {zh ? '健保眷屬人數' : 'NHI Dependents'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  className="input-field"
                  style={{ width: '100%' }}
                  value={editingStruct.health_ins_dependents ?? 0}
                  onChange={e => setEditingStruct({ ...editingStruct, health_ins_dependents: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Effective from */}
            <div style={{ marginBottom: '16px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '生效日期 *' : 'Effective From *'}
              </label>
              <input
                type="date"
                className="input-field"
                style={{ width: '100%' }}
                value={editingStruct.effective_from || ''}
                onChange={e => setEditingStruct({ ...editingStruct, effective_from: e.target.value })}
              />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '24px' }}>
              <label className="detail-label" style={{ display: 'block', marginBottom: '6px' }}>
                {zh ? '備註' : 'Notes'}
              </label>
              <textarea
                className="input-field"
                rows={3}
                style={{ width: '100%', resize: 'vertical' }}
                placeholder={zh ? '選填備註…' : 'Optional notes…'}
                value={editingStruct.notes || ''}
                onChange={e => setEditingStruct({ ...editingStruct, notes: e.target.value })}
              />
            </div>

            {/* Salary preview */}
            {editingStruct.salary_type === 'monthly' && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.2)',
                  marginBottom: '20px',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#22c55e' }}>
                  {zh ? '預估月薪合計' : 'Estimated Monthly Total'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  <span>
                    {zh ? '底薪' : 'Base'}: ${fmt(editingStruct.base_salary || 0)}
                  </span>
                  <span>
                    {zh ? '職務' : 'Role'}: ${fmt(editingStruct.role_allowance || 0)}
                  </span>
                  <span>
                    {zh ? '伙食' : 'Meal'}: ${fmt(editingStruct.meal_allowance || 0)}
                  </span>
                  <span>
                    {zh ? '交通' : 'Transport'}: ${fmt(editingStruct.transport_allowance || 0)}
                  </span>
                  <span>
                    {zh ? '全勤' : 'Attend.'}: ${fmt(editingStruct.attendance_bonus || 0)}
                  </span>
                  <strong style={{ color: '#22c55e' }}>
                    {zh ? '合計' : 'Total'}: $
                    {fmt(
                      (editingStruct.base_salary || 0) +
                        (editingStruct.role_allowance || 0) +
                        (editingStruct.meal_allowance || 0) +
                        (editingStruct.transport_allowance || 0) +
                        (editingStruct.attendance_bonus || 0)
                    )}
                  </strong>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowModal(false); setEditingStruct(null) }}
                disabled={saving}
              >
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !editingStruct.user_id}
              >
                {saving
                  ? zh ? '儲存中…' : 'Saving…'
                  : zh ? '儲存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
