import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';

interface Store { id: string; name: string; store_code: string; operating_hours: any; store_type: string; }
interface ShiftTemplate { id: string; store_id: string; name: string; start_time: string; end_time: string; break_minutes: number; color: string; }
interface Employee { id: string; name: string; position: string | null; employee_type: string; max_hours_per_week: number; store_id: string | null; }
interface ShiftAssignment { id: string; schedule_id: string; user_id: string; date: string; start_time: string; end_time: string; break_minutes: number; position: string | null; is_overtime: boolean; overtime_hours: number; status: string; shift_template_id: string | null; }
interface Schedule { id: string; store_id: string; week_start: string; status: string; generated_by: string; total_labor_hours: number; estimated_cost: number; violations: any[]; }
interface Availability { id: string; user_id: string; day_of_week: number; availability: string; notes: string | null; }

export function Scheduling() {
    const zh = getLocale() === 'zh-TW';
    const [tab, setTab] = useState<'calendar' | 'settings' | 'preferences'>('calendar');
    const [stores, setStores] = useState<Store[]>([]);
    const [selectedStore, setSelectedStore] = useState<string>('');
    const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
    const [availability, setAvailability] = useState<Availability[]>([]);
    const [leaves, setLeaves] = useState<any[]>([]);
    const [weekStart, setWeekStart] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
        return d.toISOString().split('T')[0];
    });
    const [loading, setLoading] = useState(true);
    const [aiLoading, setAiLoading] = useState(false);

    const dayNames = zh ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const getWeekDates = (): string[] => {
        const start = new Date(weekStart + 'T00:00:00');
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start); d.setDate(d.getDate() + i);
            return d.toISOString().split('T')[0];
        });
    };

    useEffect(() => {
        supabase.from('stores').select('*').eq('store_type', 'retail').order('name')
            .then(r => {
                setStores(r.data || []);
                if (r.data?.[0]) setSelectedStore(r.data[0].id);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!selectedStore) return;

        const weekEnd = new Date(weekStart + 'T00:00:00');
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        Promise.all([
            supabase.from('shift_templates').select('*').eq('store_id', selectedStore).order('start_time'),
            supabase.from('users').select('id, name, position, employee_type, max_hours_per_week, store_id').eq('store_id', selectedStore).eq('status', 'active'),
            supabase.from('schedules').select('*').eq('store_id', selectedStore).eq('week_start', weekStart).single(),
            supabase.from('employee_availability').select('*').eq('store_id', selectedStore),
            supabase.from('leave_requests').select('*').eq('status', 'approved').lte('start_date', weekEndStr).gte('end_date', weekStart)
        ]).then(([shiftR, empR, schedR, availR, leaveR]) => {
            setShiftTemplates(shiftR.data || []);
            setEmployees(empR.data || []);
            setSchedule(schedR.data || null);
            setAvailability(availR.data || []);
            setLeaves(leaveR.data || []);
            if (schedR.data) {
                supabase.from('shift_assignments').select('*').eq('schedule_id', schedR.data.id).order('date').then(r => setAssignments(r.data || []));
            } else {
                setAssignments([]);
            }
        });
    }, [selectedStore, weekStart]);

    const changeWeek = (delta: number) => {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + delta * 7);
        setWeekStart(d.toISOString().split('T')[0]);
    };

    const runAiSchedule = async () => {
        setAiLoading(true);
        try {
            const { data } = await supabase.functions.invoke('scheduling-ai', {
                body: { store_id: selectedStore, week_start: weekStart, employees, shift_templates: shiftTemplates, leave_requests: leaves }
            });
            if (data?.assignments) {
                // Create schedule record
                const { data: sched } = await supabase.from('schedules').insert({
                    store_id: selectedStore, organization_id: '00000000-0000-0000-0000-000000000001',
                    week_start: weekStart, status: 'draft', generated_by: 'ai',
                    total_labor_hours: data.summary?.total_hours || 0,
                    estimated_cost: data.summary?.estimated_cost || 0,
                    violations: data.violations || [], notes: data.notes || '',
                }).select().single();
                if (sched) {
                    const toInsert = data.assignments.map((a: any) => ({
                        schedule_id: sched.id, user_id: a.user_id, store_id: selectedStore,
                        date: a.date, start_time: a.start_time, end_time: a.end_time,
                        break_minutes: a.break_minutes || 60, position: a.position,
                        is_overtime: a.is_overtime || false, overtime_hours: a.overtime_hours || 0,
                    }));
                    await supabase.from('shift_assignments').insert(toInsert);
                    setSchedule(sched);
                    const { data: assn } = await supabase.from('shift_assignments').select('*').eq('schedule_id', sched.id).order('date');
                    setAssignments(assn || []);
                }
            }
        } catch (err: any) {
            alert(zh ? '排班失敗: ' + err.message : 'Scheduling failed: ' + err.message);
        }
        setAiLoading(false);
    };

    const publishSchedule = async () => {
        if (!schedule) return;
        await supabase.from('schedules').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', schedule.id);
        setSchedule({ ...schedule, status: 'published' });
    };

    const setAvail = async (userId: string, dow: number, val: string) => {
        const existing = availability.find(a => a.user_id === userId && a.day_of_week === dow);
        if (existing) {
            await supabase.from('employee_availability').update({ availability: val }).eq('id', existing.id);
        } else {
            await supabase.from('employee_availability').insert({
                user_id: userId, store_id: selectedStore, day_of_week: dow, availability: val,
            });
        }
        const { data } = await supabase.from('employee_availability').select('*').eq('store_id', selectedStore);
        setAvailability(data || []);
    };

    const weekDates = getWeekDates();
    const templateMap = Object.fromEntries(shiftTemplates.map(s => [s.id, s]));
    const getAssignmentsForCell = (userId: string, date: string) => assignments.filter(a => a.user_id === userId && a.date === date);

    // New shift template form state
    const [newShift, setNewShift] = useState({ name: '', start_time: '09:00', end_time: '17:00', break_minutes: '60', color: '#6366f1' });
    const addShiftTemplate = async () => {
        if (!newShift.name) return;
        await supabase.from('shift_templates').insert({
            store_id: selectedStore, name: newShift.name, start_time: newShift.start_time,
            end_time: newShift.end_time, break_minutes: Number(newShift.break_minutes), color: newShift.color,
        });
        setNewShift({ name: '', start_time: '09:00', end_time: '17:00', break_minutes: '60', color: '#6366f1' });
        const { data } = await supabase.from('shift_templates').select('*').eq('store_id', selectedStore).order('start_time');
        setShiftTemplates(data || []);
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📅 {t('schedule.title')}</h1>
                <p className="page-subtitle">{t('schedule.subtitle')}</p>
            </div>

            {/* Store selector */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="input-field" style={{ maxWidth: '240px' }} value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
                    {stores.map(s => <option key={s.id} value={s.id}>🏪 {s.name}</option>)}
                </select>
                <div className="tab-bar" style={{ marginBottom: 0 }}>
                    <button className={`tab-item ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>📅 {t('schedule.calendar')}</button>
                    <button className={`tab-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>⚙️ {t('schedule.store_settings')}</button>
                    <button className={`tab-item ${tab === 'preferences' ? 'active' : ''}`} onClick={() => setTab('preferences')}>👤 {t('schedule.preferences')}</button>
                </div>
            </div>

            {loading ? <p className="loading-pulse">{t('common.loading')}</p> : tab === 'calendar' ? (
                /* ==================== CALENDAR TAB ==================== */
                <div>
                    {/* Week navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => changeWeek(-1)}>◀</button>
                            <span style={{ fontWeight: 600, fontSize: '15px', minWidth: '200px', textAlign: 'center' }}>
                                {weekDates[0]} ~ {weekDates[6]}
                            </span>
                            <button className="btn btn-sm btn-secondary" onClick={() => changeWeek(1)}>▶</button>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {schedule && (
                                <span className="badge" style={{ background: schedule.status === 'published' ? '#22c55e' : '#f59e0b', fontSize: '12px', padding: '3px 10px' }}>
                                    {schedule.status === 'published' ? (zh ? '✅ 已發佈' : '✅ Published') : (zh ? '📝 草稿' : '📝 Draft')}
                                </span>
                            )}
                            {schedule && schedule.status === 'draft' && (
                                <button className="btn btn-sm btn-primary" onClick={publishSchedule}>📤 {t('schedule.publish')}</button>
                            )}
                            <button className="btn btn-primary" onClick={runAiSchedule} disabled={aiLoading}>
                                {aiLoading ? '⏳...' : '🤖 ' + t('schedule.ai_generate')}
                            </button>
                        </div>
                    </div>

                    {/* Summary bar */}
                    {schedule && (
                        <div className="card" style={{ display: 'flex', gap: '24px', padding: '12px 18px', marginBottom: '16px', fontSize: '13px' }}>
                            <span>⏱ {zh ? '總工時' : 'Total'}: <b>{schedule.total_labor_hours}h</b></span>
                            <span>💰 {zh ? '預估成本' : 'Est. Cost'}: <b>NT${Math.round(schedule.estimated_cost).toLocaleString()}</b></span>
                            <span>👥 {zh ? '員工' : 'Staff'}: <b>{employees.length}</b></span>
                            {(schedule.violations as any[])?.length > 0 && (
                                <span style={{ color: '#f43f5e' }}>⚠️ {(schedule.violations as any[]).length} {zh ? '個違規' : 'violations'}</span>
                            )}
                        </div>
                    )}

                    {/* Schedule grid */}
                    <div className="card" style={{ overflowX: 'auto', padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-primary)' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', minWidth: '120px' }}>
                                        {zh ? '員工' : 'Employee'}
                                    </th>
                                    {weekDates.map((d, i) => (
                                        <th key={d} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', minWidth: '100px' }}>
                                            <div>{dayNames[i]}</div>
                                            <div style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text-muted)' }}>{d.slice(5)}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {employees.length === 0 ? (
                                    <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        {zh ? '此門市尚無員工。請在「員工管理」中指派員工至此門市。' : 'No employees assigned to this store.'}
                                    </td></tr>
                                ) : employees.map(emp => (
                                    <tr key={emp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td style={{ padding: '8px 14px' }}>
                                            <div style={{ fontWeight: 600 }}>{emp.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {emp.position || '—'} · {emp.max_hours_per_week}h
                                            </div>
                                        </td>
                                        {weekDates.map(d => {
                                            const cellAssignments = getAssignmentsForCell(emp.id, d);
                                            return (
                                                <td key={d} style={{ padding: '4px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                                                    {cellAssignments.map(a => {
                                                        const tmpl = a.shift_template_id ? templateMap[a.shift_template_id] : null;
                                                        return (
                                                            <div key={a.id} style={{
                                                                background: tmpl?.color || '#6366f1', color: '#fff',
                                                                borderRadius: '4px', padding: '3px 6px', fontSize: '11px',
                                                                marginBottom: '2px', fontWeight: 500,
                                                            }}>
                                                                {a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}
                                                                {a.is_overtime && <span style={{ marginLeft: '3px' }}>⚠️</span>}
                                                            </div>
                                                        );
                                                    })}
                                                    {cellAssignments.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            ) : tab === 'settings' ? (
                /* ==================== STORE SETTINGS TAB ==================== */
                <div style={{ display: 'grid', gap: '20px' }}>
                    {/* Shift templates */}
                    <div className="card">
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                            🕐 {zh ? '班別設定' : 'Shift Templates'}
                        </h3>
                        {shiftTemplates.map(s => (
                            <div key={s.id} style={{
                                display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px',
                                background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', marginBottom: '6px',
                            }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                <span style={{ fontWeight: 600, minWidth: '60px' }}>{s.name}</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{zh ? '休息' : 'Break'}: {s.break_minutes}{zh ? '分' : 'min'}</span>
                                <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '2px 6px', color: 'var(--accent-red)' }}
                                    onClick={async () => { await supabase.from('shift_templates').delete().eq('id', s.id); const { data } = await supabase.from('shift_templates').select('*').eq('store_id', selectedStore).order('start_time'); setShiftTemplates(data || []); }}>✕</button>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                            <input className="input-field" value={newShift.name} onChange={e => setNewShift({ ...newShift, name: e.target.value })} placeholder={zh ? '班別名稱' : 'Shift name'} style={{ width: '100px' }} />
                            <input className="input-field" type="time" value={newShift.start_time} onChange={e => setNewShift({ ...newShift, start_time: e.target.value })} style={{ width: '100px' }} />
                            <input className="input-field" type="time" value={newShift.end_time} onChange={e => setNewShift({ ...newShift, end_time: e.target.value })} style={{ width: '100px' }} />
                            <input className="input-field" type="number" value={newShift.break_minutes} onChange={e => setNewShift({ ...newShift, break_minutes: e.target.value })} style={{ width: '70px' }} placeholder={zh ? '休息' : 'Break'} />
                            <input className="input-field" type="color" value={newShift.color} onChange={e => setNewShift({ ...newShift, color: e.target.value })} style={{ width: '42px', padding: '2px' }} />
                            <button className="btn btn-primary btn-sm" onClick={addShiftTemplate}>➕</button>
                        </div>
                    </div>

                    {/* Operating hours */}
                    <div className="card">
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>🏪 {zh ? '營業時間' : 'Operating Hours'}</h3>
                        {(() => {
                            const store = stores.find(s => s.id === selectedStore);
                            const hours = store?.operating_hours || {};
                            const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                            return dayKeys.map((dk, i) => (
                                <div key={dk} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <span style={{ fontWeight: 600, width: '36px', textAlign: 'center' }}>{dayNames[i]}</span>
                                    <span style={{ fontSize: '13px', color: hours[dk]?.open === 'closed' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                        {hours[dk]?.open === 'closed' ? (zh ? '休息日' : 'Closed') : `${hours[dk]?.open || '—'} – ${hours[dk]?.close || '—'}`}
                                    </span>
                                </div>
                            ));
                        })()}
                    </div>
                </div>

            ) : (
                /* ==================== PREFERENCES TAB ==================== */
                <div className="card" style={{ overflowX: 'auto', padding: '0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-primary)' }}>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '員工' : 'Employee'}</th>
                                {dayNames.map((d, i) => (
                                    <th key={i} style={{ padding: '10px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{d}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {employees.length === 0 ? (
                                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {zh ? '此門市尚無員工' : 'No employees for this store'}
                                </td></tr>
                            ) : employees.map(emp => (
                                <tr key={emp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    <td style={{ padding: '8px 14px', fontWeight: 600 }}>{emp.name}</td>
                                    {[1, 2, 3, 4, 5, 6, 0].map(dow => {
                                        const av = availability.find(a => a.user_id === emp.id && a.day_of_week === dow);
                                        const val = av?.availability || 'available';
                                        const icon = val === 'available' ? '✅' : val === 'preferred' ? '⭐' : '❌';
                                        const nextVal = val === 'available' ? 'preferred' : val === 'preferred' ? 'unavailable' : 'available';
                                        return (
                                            <td key={dow} style={{ padding: '6px', textAlign: 'center' }}>
                                                <button style={{
                                                    background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px',
                                                    padding: '6px 12px', cursor: 'pointer', fontSize: '16px',
                                                    opacity: val === 'unavailable' ? 0.4 : 1,
                                                }} onClick={() => setAvail(emp.id, dow, nextVal)} title={val}>
                                                    {icon}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '16px' }}>
                        <span>✅ {zh ? '可上班' : 'Available'}</span>
                        <span>⭐ {zh ? '偏好' : 'Preferred'}</span>
                        <span>❌ {zh ? '不可上班' : 'Unavailable'}</span>
                        <span style={{ marginLeft: 'auto' }}>{zh ? '點擊切換' : 'Click to toggle'}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
