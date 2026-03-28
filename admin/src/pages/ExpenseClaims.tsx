import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/OrgContext'
import { t, getLocale } from '../lib/i18n'

interface UserRecord {
    id: string
    name: string
}

interface ExpenseClaim {
    id: string
    organization_id: string
    user_id: string
    business_trip_id: string | null
    claim_date: string
    category: string
    description: string
    amount: number
    currency: string
    status: 'pending' | 'approved' | 'rejected' | 'reimbursed'
    created_at: string
    user?: UserRecord | null
}

export function ExpenseClaims() {
    const { currentOrgId, userRoles } = useOrg()
    const zh = getLocale() === 'zh-TW'
    const [claims, setClaims] = useState<ExpenseClaim[]>([])
    const [loading, setLoading] = useState(true)
    const [isAdminOrManager, setIsAdminOrManager] = useState(false)
    const [showModal, setShowModal] = useState(false)

    // Form
    const [claimDate, setClaimDate] = useState(new Date().toISOString().split('T')[0])
    const [category, setCategory] = useState('other')
    const [description, setDescription] = useState('')
    const [amount, setAmount] = useState('0')

    useEffect(() => {
        setIsAdminOrManager(userRoles.includes('admin') || userRoles.includes('hr') || userRoles.includes('manager'))
        if (currentOrgId) {
            loadClaims()
        }
    }, [currentOrgId, userRoles])

    async function loadClaims() {
        if (!currentOrgId) return
        setLoading(true)
        try {
            const { data: userData } = await supabase.auth.getUser()
            const uid = userData?.user?.id

            let query = supabase
                .from('expense_claims')
                .select(`
          *,
          user:users!user_id(id, name)
        `)
                .eq('organization_id', currentOrgId)
                .order('created_at', { ascending: false })

            if (!isAdminOrManager && uid) {
                query = query.eq('user_id', uid)
            }

            const { data, error } = await query
            if (error) throw error
            setClaims(data || [])
        } catch (err: any) {
            console.error('Error loading claims', err)
            alert('Error loading claims')
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!currentOrgId) return
        try {
            const { data: userData } = await supabase.auth.getUser()
            if (!userData.user) throw new Error('Not logged in')

            const { error } = await supabase.from('expense_claims').insert({
                organization_id: currentOrgId,
                user_id: userData.user.id,
                claim_date: claimDate,
                category,
                description,
                amount: parseFloat(amount) || 0,
                status: 'pending'
            })
            if (error) throw error

            setShowModal(false)
            setCategory('other')
            setDescription('')
            setAmount('0')
            loadClaims()
        } catch (err: any) {
            console.error('Error submitting claim', err)
            alert(err.message)
        }
    }

    async function updateStatus(id: string, status: string) {
        try {
            const { data: userData } = await supabase.auth.getUser()
            const updateData: any = { status }
            if (status === 'approved' || status === 'rejected') {
                updateData.approved_by = userData.user?.id
                updateData.approved_at = new Date().toISOString()
            } else if (status === 'reimbursed') {
                updateData.reimbursed_at = new Date().toISOString()
            }
            const { error } = await supabase
                .from('expense_claims')
                .update(updateData)
                .eq('id', id)
            if (error) throw error
            loadClaims()
        } catch (err: any) {
            console.error('Error updating status', err)
            alert(err.message)
        }
    }

    function StatusBadge({ status }: { status: string }) {
        const config: Record<string, { bg: string; color: string; border: string; label: string }> = {
            pending:   { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', border: 'rgba(245,158,11,0.3)',  label: zh ? '待審核' : 'Pending' },
            approved:  { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', border: 'rgba(34,197,94,0.3)',   label: zh ? '已核准' : 'Approved' },
            reimbursed:{ bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6', border: 'rgba(59,130,246,0.3)',  label: zh ? '已撥款' : 'Reimbursed' },
            rejected:  { bg: 'rgba(244,63,94,0.15)',   color: '#f43f5e', border: 'rgba(244,63,94,0.3)',   label: zh ? '已拒絕' : 'Rejected' },
            cancelled: { bg: 'rgba(120,120,140,0.15)', color: '#6b7280', border: 'rgba(120,120,140,0.3)', label: zh ? '已取消' : 'Cancelled' },
        }
        const c = config[status] || config['pending']
        return (
            <span style={{
                background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                fontSize: '11px', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap'
            }}>
                {c.label}
            </span>
        )
    }

    const categories = [
        { id: 'transport', label: zh ? '交通費' : 'Transport' },
        { id: 'meals', label: zh ? '餐費' : 'Meals' },
        { id: 'accommodation', label: zh ? '住宿費' : 'Accommodation' },
        { id: 'supplies', label: zh ? '業務採購' : 'Supplies' },
        { id: 'other', label: zh ? '其他' : 'Other' }
    ]

    return (
        <div className="fade-in" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {zh ? '費用核銷管理' : 'Expense Claims'}
                </h1>
                <button 
                    onClick={() => setShowModal(true)}
                    style={{
                        background: 'var(--accent-primary)',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '500'
                    }}
                >
                    + {zh ? '新增核銷單' : 'New Claim'}
                </button>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
                ) : (
                    <table className="data-table" style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--outline-variant)', textAlign: 'left' }}>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '員工' : 'Employee'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '日期' : 'Date'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '類別' : 'Category'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '說明' : 'Description'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '金額' : 'Amount'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '狀態' : 'Status'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '操作' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {claims.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>{zh ? '沒有紀錄' : 'No records found'}</td></tr>
                            ) : claims.map(claim => (
                                <tr key={claim.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                    <td style={{ padding: '12px 16px' }}>{claim.user?.name || 'Unknown'}</td>
                                    <td style={{ padding: '12px 16px' }}>{claim.claim_date}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        {categories.find(c => c.id === claim.category)?.label || claim.category}
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>{claim.description}</td>
                                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{claim.currency} {claim.amount}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <StatusBadge status={claim.status} />
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        {isAdminOrManager && claim.status === 'pending' && (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => updateStatus(claim.id, 'approved')} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                                    {zh ? '核准' : 'Approve'}
                                                </button>
                                                <button onClick={() => updateStatus(claim.id, 'rejected')} style={{ background: '#f43f5e', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                                    {zh ? '拒絕' : 'Reject'}
                                                </button>
                                            </div>
                                        )}
                                        {isAdminOrManager && claim.status === 'approved' && (
                                            <button onClick={() => updateStatus(claim.id, 'reimbursed')} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                                {zh ? '標記已撥款' : 'Mark Reimbursed'}
                                            </button>
                                        )}
                                        {!isAdminOrManager && claim.status === 'pending' && (
                                            <button onClick={() => updateStatus(claim.id, 'cancelled')} style={{ background: 'transparent', color: '#6b7280', border: '1px solid var(--outline)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                                {zh ? '取消' : 'Cancel'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', overscrollBehavior: 'contain' }}>
                    <div role="dialog" aria-modal="true" className="card" style={{ width: '100%', maxWidth: '500px', background: 'var(--bg-primary)', padding: '24px', borderRadius: '12px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>{zh ? '新增核銷單' : 'New Expense Claim'}</h2>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '申請日期*' : 'Date*'}</label>
                                    <input type="date" required value={claimDate} onChange={e => setClaimDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--outline-variant)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '類別*' : 'Category*'}</label>
                                    <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--outline-variant)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '說明*' : 'Description*'}</label>
                                <textarea name="notes" required value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--outline-variant)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '金額*' : 'Amount*'}</label>
                                <input type="number" required min="1" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--outline-variant)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--outline-variant)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}>
                                    {zh ? '取消' : 'Cancel'}
                                </button>
                                <button type="submit" style={{ padding: '8px 16px', background: 'var(--accent-primary)', border: 'none', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                                    {zh ? '送出申請' : 'Submit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
