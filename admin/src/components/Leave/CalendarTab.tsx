import type { LeaveRequest } from '../../types/leave'
import { LEAVE_TYPE_COLORS } from '../../types/leave'

// ─── Props ────────────────────────────────────────────────────────────────────

interface CalendarTabProps {
    zh: boolean
    calMonth: number
    calYear: number
    setCalMonth: (month: number) => void
    setCalYear: (year: number) => void
    allRequests: LeaveRequest[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CalendarTab({
    zh,
    calMonth,
    calYear,
    setCalMonth,
    setCalYear,
    allRequests,
}: CalendarTabProps) {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const firstDow = new Date(calYear, calMonth, 1).getDay()
    const monthNames = zh
        ? ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const dayNames = zh ? ['日', '一', '二', '三', '四', '五', '六'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    // Build leave data per day
    const dayLeaves: Record<number, { name: string; type: string }[]> = {}
    allRequests.filter(r => r.status === 'approved').forEach(r => {
        const start = new Date(r.start_date)
        const end = new Date(r.end_date)
        const userName = r.user?.name || '—'
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
                const day = d.getDate()
                dayLeaves[day] = dayLeaves[day] || []
                if (!dayLeaves[day].find(x => x.name === userName && x.type === r.leave_type)) {
                    dayLeaves[day].push({ name: userName, type: r.leave_type })
                }
            }
        }
    })

    function prevMonth() {
        if (calMonth === 0) {
            setCalMonth(11)
            setCalYear(calYear - 1)
        } else {
            setCalMonth(calMonth - 1)
        }
    }

    function nextMonth() {
        if (calMonth === 11) {
            setCalMonth(0)
            setCalYear(calYear + 1)
        } else {
            setCalMonth(calMonth + 1)
        }
    }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <button className="btn btn-sm btn-secondary" onClick={prevMonth}>◀</button>
                <span style={{ fontSize: '16px', fontWeight: 600 }}>{monthNames[calMonth]} {calYear}</span>
                <button className="btn btn-sm btn-secondary" onClick={nextMonth}>▶</button>
            </div>

            <div className="card" style={{ padding: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}>
                    {dayNames.map(dn => (
                        <div key={dn} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', padding: '8px 0' }}>{dn}</div>
                    ))}
                    {Array.from({ length: firstDow }, (_, i) => (
                        <div key={`e-${i}`} />
                    ))}
                    {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1
                        const leaves = dayLeaves[day] || []
                        const isToday = day === new Date().getDate() && calMonth === new Date().getMonth() && calYear === new Date().getFullYear()
                        return (
                            <div key={day} style={{
                                minHeight: '70px', padding: '4px 6px', borderRadius: '6px',
                                background: isToday ? 'rgba(59,130,246,0.08)' : leaves.length > 0 ? 'rgba(245,158,11,0.05)' : 'transparent',
                                border: isToday ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--outline-variant)',
                            }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: isToday ? '#3b82f6' : 'var(--text-primary)', marginBottom: '2px' }}>{day}</div>
                                {leaves.slice(0, 3).map((l, idx) => (
                                    <div key={idx} style={{
                                        fontSize: '10px', padding: '1px 4px', borderRadius: '3px', marginBottom: '1px',
                                        background: (LEAVE_TYPE_COLORS[l.type] || '#6b7280') + '20',
                                        color: LEAVE_TYPE_COLORS[l.type] || '#6b7280',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {l.name}
                                    </div>
                                ))}
                                {leaves.length > 3 && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+{leaves.length - 3}</div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                {Object.entries(LEAVE_TYPE_COLORS).map(([type, color]) => (
                    <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, display: 'inline-block' }} />
                        {type}
                    </span>
                ))}
            </div>
        </div>
    )
}
