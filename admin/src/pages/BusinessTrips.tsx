import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../lib/OrgContext'
import { t, getLocale } from '../lib/i18n'

interface UserRecord {
    id: string
    name: string
}

interface BusinessTrip {
    id: string
    organization_id: string
    user_id: string
    trip_date: string
    return_date: string | null
    destination: string
    purpose: string
    transport_budget: number
    accommodation_budget: number
    status: 'pending' | 'approved' | 'rejected' | 'cancelled'
    notes: string | null
    created_at: string
    user?: UserRecord | null
}

export function BusinessTrips() {
    const { currentOrgId, userRoles } = useOrg()
    const zh = getLocale() === 'zh-TW'
    const [trips, setTrips] = useState<BusinessTrip[]>([])
    const [loading, setLoading] = useState(true)
    const [isAdminOrManager, setIsAdminOrManager] = useState(false)
    const [showModal, setShowModal] = useState(false)

    // Form
    const [tripDate, setTripDate] = useState('')
    const [returnDate, setReturnDate] = useState('')
    const [destination, setDestination] = useState('')
    const [purpose, setPurpose] = useState('')
    const [transportBudget, setTransportBudget] = useState('0')
    const [accommodationBudget, setAccommodationBudget] = useState('0')

    useEffect(() => {
        setIsAdminOrManager(userRoles.includes('admin') || userRoles.includes('hr') || userRoles.includes('manager'))
        if (currentOrgId) {
            loadTrips()
        }
    }, [currentOrgId, userRoles])

    async function loadTrips() {
        if (!currentOrgId) return
        setLoading(true)
        try {
            const { data: userData } = await supabase.auth.getUser()
            const uid = userData?.user?.id

            let query = supabase
                .from('business_trips')
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
            setTrips(data || [])
        } catch (err: any) {
            console.error('Error loading business trips', err)
            alert('Error loading business trips')
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

            const { error } = await supabase.from('business_trips').insert({
                organization_id: currentOrgId,
                user_id: userData.user.id,
                trip_date: tripDate,
                return_date: returnDate || null,
                destination,
                purpose,
                transport_budget: parseFloat(transportBudget) || 0,
                accommodation_budget: parseFloat(accommodationBudget) || 0,
                status: 'pending'
            })
            if (error) throw error

            setShowModal(false)
            setTripDate('')
            setReturnDate('')
            setDestination('')
            setPurpose('')
            setTransportBudget('0')
            setAccommodationBudget('0')
            loadTrips()
        } catch (err: any) {
            console.error('Error submitting trip', err)
            alert(err.message)
        }
    }

    async function updateStatus(id: string, status: string) {
        try {
            const { data: userData } = await supabase.auth.getUser()
            const { error } = await supabase
                .from('business_trips')
                .update({ 
                    status, 
                    approved_by: userData.user?.id, 
                    approved_at: new Date().toISOString() 
                })
                .eq('id', id)
            if (error) throw error
            loadTrips()
        } catch (err: any) {
            console.error('Error updating status', err)
            alert(err.message)
        }
    }

    function StatusBadge({ status }: { status: string }) {
        const config: Record<string, { bg: string; color: string; border: string; label: string }> = {
            pending:   { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', border: 'rgba(245,158,11,0.3)',  label: zh ? '待審核' : 'Pending' },
            approved:  { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e', border: 'rgba(34,197,94,0.3)',   label: zh ? '已核准' : 'Approved' },
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

    return (
        <div className="fade-in" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {zh ? '公出差旅管理' : 'Business Trips'}
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
                    + {zh ? '新增公出單' : 'New Trip Request'}
                </button>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
                ) : (
                    <table className="data-table" style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '員工' : 'Employee'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '日期' : 'Date'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '目的地' : 'Destination'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '事由' : 'Purpose'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '預算' : 'Budget'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '狀態' : 'Status'}</th>
                                <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 500 }}>{zh ? '操作' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trips.length === 0 ? (
                                <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>{zh ? '沒有紀錄' : 'No records found'}</td></tr>
                            ) : trips.map(trip => (
                                <tr key={trip.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '12px 16px' }}>{trip.user?.name || 'Unknown'}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        {trip.trip_date} {trip.return_date && `~ ${trip.return_date}`}
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>{trip.destination}</td>
                                    <td style={{ padding: '12px 16px' }}>{trip.purpose}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontSize: '13px' }}>{zh?'交通':'Trans'}: {trip.transport_budget}</div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{zh?'住宿':'Accomm'}: {trip.accommodation_budget}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <StatusBadge status={trip.status} />
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        {isAdminOrManager && trip.status === 'pending' && (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => updateStatus(trip.id, 'approved')} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                                    {zh ? '核准' : 'Approve'}
                                                </button>
                                                <button onClick={() => updateStatus(trip.id, 'rejected')} style={{ background: '#f43f5e', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                                    {zh ? '拒絕' : 'Reject'}
                                                </button>
                                            </div>
                                        )}
                                        {!isAdminOrManager && trip.status === 'pending' && (
                                            <button onClick={() => updateStatus(trip.id, 'cancelled')} style={{ background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
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
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '500px', background: 'var(--bg-primary)', padding: '24px', borderRadius: '12px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '20px' }}>{zh ? '新增公出單' : 'New Business Trip'}</h2>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '出發日期*' : 'Start Date*'}</label>
                                    <input type="date" required value={tripDate} onChange={e => setTripDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '返回日期' : 'Return Date'}</label>
                                    <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '目的地*' : 'Destination*'}</label>
                                <input type="text" required value={destination} onChange={e => setDestination(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '事由*' : 'Purpose*'}</label>
                                <textarea required value={purpose} onChange={e => setPurpose(e.target.value)} rows={3} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '預估交通費' : 'Transport Budget'}</label>
                                    <input type="number" min="0" value={transportBudget} onChange={e => setTransportBudget(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>{zh ? '預估住宿費' : 'Accomm. Budget'}</label>
                                    <input type="number" min="0" value={accommodationBudget} onChange={e => setAccommodationBudget(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}>
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
