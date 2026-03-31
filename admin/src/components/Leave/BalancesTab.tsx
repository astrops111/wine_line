import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { calcAnnualLeave, formatDate, getRemainingDays } from '../../lib/leaveCalculations'
import type { Store, User, BalanceRow } from '../../types/leave'

// ─── Props ────────────────────────────────────────────────────────────────────

interface BalancesTabProps {
    zh: boolean
    orgId: string
    stores: Store[]
    users: User[]
    balanceYear: number
    setBalanceYear: (year: number) => void
    balanceStoreFilter: string
    setBalanceStoreFilter: (filter: string) => void
    balanceRows: BalanceRow[]
    setBalanceRows: React.Dispatch<React.SetStateAction<BalanceRow[]>>
    loadingBalances: boolean
    leaveTypeLabel: Record<string, string>
    onReloadBalances: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BalancesTab({
    zh,
    orgId,
    stores,
    users,
    balanceYear,
    setBalanceYear,
    balanceStoreFilter,
    setBalanceStoreFilter,
    balanceRows,
    setBalanceRows,
    loadingBalances,
    leaveTypeLabel,
    onReloadBalances,
}: BalancesTabProps) {
    const [savingBalance, setSavingBalance] = useState<string | null>(null)
    const [recalcPreview, setRecalcPreview] = useState<{ user: User; days: number }[] | null>(null)
    const [showRecalcDialog, setShowRecalcDialog] = useState(false)

    function toggleRowExpand(userId: string) {
        setBalanceRows(prev =>
            prev.map(r =>
                r.user.id === userId
                    ? { ...r, expanded: !r.expanded, editType: 'annual', editTotal: '', editCarry: '' }
                    : r
            )
        )
    }

    function setRowEdit(userId: string, field: 'editType' | 'editTotal' | 'editCarry', value: string) {
        setBalanceRows(prev =>
            prev.map(r => (r.user.id === userId ? { ...r, [field]: value } : r))
        )
    }

    async function saveBalance(row: BalanceRow) {
        setSavingBalance(row.user.id)
        const existing = row.balances[row.editType]
        const totalDays = parseFloat(row.editTotal) || existing?.total_days || 0
        const carryOver = parseFloat(row.editCarry) || existing?.carry_over_days || 0
        const usedDays = existing?.used_days || 0

        if (existing) {
            await supabase
                .from('leave_balances')
                .update({ total_days: totalDays, carry_over_days: carryOver })
                .eq('user_id', row.user.id)
                .eq('year', balanceYear)
                .eq('leave_type', row.editType)
        } else {
            await supabase.from('leave_balances').insert({
                user_id: row.user.id,
                organization_id: orgId,
                year: balanceYear,
                leave_type: row.editType,
                total_days: totalDays,
                used_days: usedDays,
                carry_over_days: carryOver,
                expires_at: null,
            })
        }

        setSavingBalance(null)
        onReloadBalances()
    }

    async function buildRecalcPreview() {
        const activeWithHire = users.filter(u => u.status === 'active' && u.hire_date)
        const preview = activeWithHire.map(u => ({
            user: u,
            days: calcAnnualLeave(u.hire_date!),
        }))
        setRecalcPreview(preview)
        setShowRecalcDialog(true)
    }

    async function confirmRecalc() {
        if (!recalcPreview) return
        for (const item of recalcPreview) {
            if (item.days === 0) continue
            const { data: existing } = await supabase
                .from('leave_balances')
                .select('used_days')
                .eq('user_id', item.user.id)
                .eq('year', balanceYear)
                .eq('leave_type', 'annual')
                .single()

            if (existing) {
                await supabase
                    .from('leave_balances')
                    .update({ total_days: item.days })
                    .eq('user_id', item.user.id)
                    .eq('year', balanceYear)
                    .eq('leave_type', 'annual')
            } else {
                await supabase.from('leave_balances').insert({
                    user_id: item.user.id,
                    organization_id: orgId,
                    year: balanceYear,
                    leave_type: 'annual',
                    total_days: item.days,
                    used_days: 0,
                    carry_over_days: 0,
                    expires_at: null,
                })
            }
        }
        setShowRecalcDialog(false)
        setRecalcPreview(null)
        onReloadBalances()
    }

    return (
        <div>
            {/* Filter bar */}
            <div className="card" style={{ marginBottom: '16px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                        <label className="detail-label">{zh ? '年度' : 'Year'}</label>
                        <select
                            className="input-field"
                            value={balanceYear}
                            onChange={e => setBalanceYear(Number(e.target.value))}
                            style={{ minWidth: '100px' }}
                        >
                            {[new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '門市' : 'Store'}</label>
                        <select
                            className="input-field"
                            value={balanceStoreFilter}
                            onChange={e => setBalanceStoreFilter(e.target.value)}
                            style={{ minWidth: '140px' }}
                        >
                            <option value="all">{zh ? '全部門市' : 'All Stores'}</option>
                            {stores.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={buildRecalcPreview}
                            style={{ fontSize: '13px' }}
                        >
                            🔄 {zh ? '重算特休天數 (勞基法)' : 'Recalculate Annual Leave (Labor Law)'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Balances table */}
            {loadingBalances ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '載入中…' : 'Loading…'}
                </div>
            ) : balanceRows.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '沒有在職員工資料' : 'No active employees found'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {balanceRows.map(row => {
                        const annualBal = row.balances['annual']
                        const sickBal = row.balances['sick']
                        const personalBal = row.balances['personal']
                        const annualRemain = getRemainingDays(annualBal)
                        const sickRemain = getRemainingDays(sickBal)
                        const personalRemain = getRemainingDays(personalBal)

                        return (
                            <div key={row.user.id} className="card" style={{ padding: '0' }}>
                                {/* Row header */}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '16px',
                                        padding: '14px 16px',
                                        flexWrap: 'wrap',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => toggleRowExpand(row.user.id)}
                                >
                                    {/* Employee info */}
                                    <div style={{ minWidth: '140px', flex: '0 0 140px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{row.user.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {(row.user.store as any)?.name || '—'}
                                        </div>
                                    </div>

                                    {/* Annual leave */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '90px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                            {zh ? '特休' : 'Annual'}
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, fontSize: '18px', color: annualRemain > 0 ? '#22c55e' : 'var(--text-muted)' }}>
                                                {annualRemain}
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                / {(annualBal?.total_days || 0) + (annualBal?.carry_over_days || 0)} {zh ? '天' : 'd'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                            {zh ? `已用 ${annualBal?.used_days || 0} 天` : `Used ${annualBal?.used_days || 0}d`}
                                        </div>
                                    </div>

                                    {/* Sick leave */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '90px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                            {zh ? '病假' : 'Sick'}
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, fontSize: '18px', color: sickRemain > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                                                {sickRemain}
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                / {(sickBal?.total_days || 0) + (sickBal?.carry_over_days || 0)} {zh ? '天' : 'd'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                            {zh ? `已用 ${sickBal?.used_days || 0} 天` : `Used ${sickBal?.used_days || 0}d`}
                                        </div>
                                    </div>

                                    {/* Personal leave */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '90px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                            {zh ? '事假' : 'Personal'}
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, fontSize: '18px', color: personalRemain > 0 ? '#3b82f6' : 'var(--text-muted)' }}>
                                                {personalRemain}
                                            </span>
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                / {(personalBal?.total_days || 0) + (personalBal?.carry_over_days || 0)} {zh ? '天' : 'd'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                            {zh ? `已用 ${personalBal?.used_days || 0} 天` : `Used ${personalBal?.used_days || 0}d`}
                                        </div>
                                    </div>

                                    {/* Edit button */}
                                    <div style={{ marginLeft: 'auto' }}>
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={e => { e.stopPropagation(); toggleRowExpand(row.user.id) }}
                                        >
                                            {row.expanded ? (zh ? '收起' : 'Collapse') : (zh ? '編輯餘額' : 'Edit Balance')}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded edit area */}
                                {row.expanded && (
                                    <div
                                        className="fade-in"
                                        style={{
                                            borderTop: '1px solid var(--outline-variant)',
                                            padding: '16px',
                                            background: 'var(--bg-secondary)',
                                        }}
                                    >
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', alignItems: 'end' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '假別' : 'Leave Type'}</label>
                                                <select
                                                    className="input-field"
                                                    value={row.editType}
                                                    onChange={e => setRowEdit(row.user.id, 'editType', e.target.value)}
                                                >
                                                    {Object.entries(leaveTypeLabel).map(([k, v]) => (
                                                        <option key={k} value={k}>{v}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '總天數' : 'Total Days'}</label>
                                                <input
                                                    className="input-field"
                                                    type="number"
                                                    min="0"
                                                    step="0.5"
                                                    placeholder={String(row.balances[row.editType]?.total_days ?? 0)}
                                                    value={row.editTotal}
                                                    onChange={e => setRowEdit(row.user.id, 'editTotal', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '已使用 (唯讀)' : 'Used Days (read-only)'}</label>
                                                <input
                                                    className="input-field"
                                                    type="number"
                                                    value={row.balances[row.editType]?.used_days ?? 0}
                                                    readOnly
                                                    style={{ opacity: 0.6, cursor: 'not-allowed' }}
                                                 autoComplete="off" />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '結轉天數' : 'Carry Over'}</label>
                                                <input
                                                    className="input-field"
                                                    type="number"
                                                    min="0"
                                                    step="0.5"
                                                    placeholder={String(row.balances[row.editType]?.carry_over_days ?? 0)}
                                                    value={row.editCarry}
                                                    onChange={e => setRowEdit(row.user.id, 'editCarry', e.target.value)}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => saveBalance(row)}
                                                    disabled={savingBalance === row.user.id}
                                                >
                                                    {savingBalance === row.user.id
                                                        ? (zh ? '儲存中…' : 'Saving…')
                                                        : (zh ? '儲存' : 'Save')}
                                                </button>
                                            </div>
                                        </div>
                                        {/* Remaining preview */}
                                        {(row.editTotal !== '' || row.editCarry !== '') && (() => {
                                            const existingBal = row.balances[row.editType]
                                            const previewTotal = parseFloat(row.editTotal !== '' ? row.editTotal : String(existingBal?.total_days ?? 0))
                                            const previewCarry = parseFloat(row.editCarry !== '' ? row.editCarry : String(existingBal?.carry_over_days ?? 0))
                                            const previewUsed = existingBal?.used_days ?? 0
                                            const previewRemain = previewTotal + previewCarry - previewUsed
                                            return (
                                                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                    {zh ? '預覽餘額：' : 'Preview remaining: '}
                                                    <span style={{ fontWeight: 700, color: previewRemain >= 0 ? '#22c55e' : '#f43f5e' }}>
                                                        {previewRemain} {zh ? '天' : 'days'}
                                                    </span>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ── Recalculate Annual Leave Confirmation Dialog ── */}
            {showRecalcDialog && recalcPreview && (
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
                    onClick={e => { if (e.target === e.currentTarget) setShowRecalcDialog(false) }}
                >
                    <div
                        className="card fade-in"
                        style={{
                            width: '100%',
                            maxWidth: '540px',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                            position: 'relative',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
                                🔄 {zh ? `重算 ${balanceYear} 年特休天數` : `Recalculate ${balanceYear} Annual Leave`}
                            </h3>
                            <button className="btn btn-sm btn-secondary" onClick={() => setShowRecalcDialog(false)}>✕</button>
                        </div>

                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            {zh
                                ? '依據台灣勞基法計算各員工特休天數。此操作只更新「total_days」欄位，不影響已使用天數。'
                                : 'Calculates annual leave per Taiwan Labor Standards Act. This only updates total_days; used_days is preserved.'}
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '40vh', overflowY: 'auto', marginBottom: '16px' }}>
                            {recalcPreview.map(item => (
                                <div
                                    key={item.user.id}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '8px 12px',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                    }}
                                >
                                    <div>
                                        <span style={{ fontWeight: 600 }}>{item.user.name}</span>
                                        {item.user.hire_date && (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '8px' }}>
                                                {zh ? '入職：' : 'Hired: '}{formatDate(item.user.hire_date)}
                                            </span>
                                        )}
                                    </div>
                                    <span
                                        className="badge"
                                        style={{
                                            background: '#22c55e33',
                                            color: '#22c55e',
                                            fontWeight: 700,
                                            padding: '2px 10px',
                                        }}
                                    >
                                        {item.days} {zh ? '天' : 'days'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn btn-primary" onClick={confirmRecalc} style={{ flex: 1 }}>
                                {zh ? '確認更新' : 'Confirm Update'}
                            </button>
                            <button className="btn btn-secondary" onClick={() => setShowRecalcDialog(false)}>
                                {zh ? '取消' : 'Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
