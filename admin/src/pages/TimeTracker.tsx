import { useEffect, useState } from 'react';
import { supabase, FUNCTIONS_URL } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface TimeRecord {
    id: string; user_id: string; clock_in: string; clock_out: string | null;
    clock_in_method: string; clock_out_method: string | null; break_minutes: number;
    break_start: string | null; break_end: string | null;
    total_hours: number | null; notes: string | null; is_late: boolean;
    status: string; store_id: string | null;
    user?: { name: string; position: string | null };
}

interface Employee { id: string; name: string; position: string | null; store_id: string | null; }
interface Store { id: string; name: string; }

interface PunchCorrection {
    id: string;
    organization_id: string;
    store_id: string | null;
    user_id: string;
    time_record_id: string | null;
    correction_type: string;
    original_clock_in: string | null;
    original_clock_out: string | null;
    requested_clock_in: string | null;
    requested_clock_out: string | null;
    reason: string;
    status: string;
    approved_by: string | null;
    approved_at: string | null;
    rejection_reason: string | null;
    created_at: string;
    user?: { name: string };
    store?: { name: string };
}

export function TimeTracker() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [records, setRecords] = useState<TimeRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStore, setSelectedStore] = useState('all');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [tab, setTab] = useState<'today' | 'history' | 'mapping' | 'corrections'>('today');
    const [corrections, setCorrections] = useState<PunchCorrection[]>([]);
    const [rejectingCorrectionId, setRejectingCorrectionId] = useState<string | null>(null);
    const [correctionRejectReason, setCorrectionRejectReason] = useState('');
    const [correctionFilter, setCorrectionFilter] = useState<'pending' | 'all'>('pending');

    // Admin edit record
    const [editForm, setEditForm] = useState<any>(null);

    // LINE mapping
    const [mappings, setMappings] = useState<any[]>([]);
    const [mapForm, setMapForm] = useState({ line_user_id: '', user_id: '' });

    const loadData = async () => {
        const dayStart = `${selectedDate}T00:00:00+08:00`;
        const dayEnd = `${selectedDate}T23:59:59+08:00`;
        const query = supabase.from('time_records').select('*, user:users(name, position)')
            .gte('clock_in', dayStart).lte('clock_in', dayEnd).order('clock_in', { ascending: false });
        if (selectedStore !== 'all') query.eq('store_id', selectedStore);
        const { data } = await query;
        setRecords(data || []);
    };

    useEffect(() => {
        Promise.all([
            supabase.from('users').select('id, name, position, store_id').eq('status', 'active').order('name').then(r => setEmployees(r.data || [])),
            supabase.from('stores').select('id, name').order('name').then(r => setStores(r.data || [])),
        ]).then(() => setLoading(false));
    }, []);

    useEffect(() => { loadData(); }, [selectedDate, selectedStore]);

    const loadMappings = async () => {
        const { data } = await supabase.from('line_employee_mapping').select('*, user:users(name)').order('created_at', { ascending: false });
        setMappings(data || []);
    };
    useEffect(() => { if (tab === 'mapping') loadMappings(); }, [tab]);

    const loadCorrections = async () => {
        const query = supabase
            .from('punch_corrections')
            .select('*, user:users(name), store:stores(name)')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        if (correctionFilter === 'pending') query.eq('status', 'pending');
        const { data } = await query;
        setCorrections(data || []);
    };
    useEffect(() => { if (tab === 'corrections') loadCorrections(); }, [tab, correctionFilter]);

    const notifyEmployee = async (userId: string, type: string, details: object) => {
        if (!FUNCTIONS_URL) return;
        try {
            await fetch(`${FUNCTIONS_URL}/hr-notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '' },
                body: JSON.stringify({ user_id: userId, type, details }),
            });
        } catch (err) {
            console.warn('HR notify failed:', err);
        }
    };

    const approveCorrection = async (correction: PunchCorrection) => {
        try {
            if (correction.time_record_id) {
                const updates: any = {};
                if ((correction.correction_type === 'clock_in' || correction.correction_type === 'both') && correction.requested_clock_in) {
                    updates.clock_in = correction.requested_clock_in;
                }
                if ((correction.correction_type === 'clock_out' || correction.correction_type === 'both') && correction.requested_clock_out) {
                    updates.clock_out = correction.requested_clock_out;
                }
                if (Object.keys(updates).length > 0) {
                    await supabase.from('time_records').update(updates).eq('id', correction.time_record_id);
                }
            } else if (correction.correction_type === 'missing') {
                await supabase.from('time_records').insert({
                    user_id: correction.user_id,
                    store_id: correction.store_id,
                    clock_in: correction.requested_clock_in,
                    clock_out: correction.requested_clock_out,
                    is_late: false,
                    clock_in_method: 'correction',
                    status: 'approved',
                });
            }
            await supabase.from('punch_corrections').update({
                status: 'approved',
                approved_at: new Date().toISOString(),
            }).eq('id', correction.id);
            loadCorrections();
            await notifyEmployee(correction.user_id, 'correction_approved', {
                correction_type: correction.correction_type,
                requested_clock_in: correction.requested_clock_in,
                requested_clock_out: correction.requested_clock_out,
            });
        } catch (err: any) {
            alert(`審核失敗：${err.message}`);
        }
    };

    const rejectCorrection = async (id: string) => {
        if (!correctionRejectReason.trim()) return;
        await supabase.from('punch_corrections').update({
            status: 'rejected',
            rejection_reason: correctionRejectReason,
        }).eq('id', id);
        setRejectingCorrectionId(null);
        setCorrectionRejectReason('');
        loadCorrections();
    };

    const clockIn = async (userId: string) => {
        const emp = employees.find(e => e.id === userId);
        await supabase.from('time_records').insert({
            user_id: userId, store_id: emp?.store_id || null,
            organization_id: orgId,
            clock_in: new Date().toISOString(), clock_in_method: 'admin',
        });
        await loadData();
    };

    const clockOut = async (recordId: string) => {
        const record = records.find(r => r.id === recordId);
        if (!record) return;
        const now = new Date();

        await supabase.from('time_records').update({
            clock_out: now.toISOString(), clock_out_method: 'admin', status: 'completed'
        }).eq('id', recordId);
        await loadData();
    };

    const saveRecord = async () => {
        if (!editForm.user_id || !editForm.clock_in) return;
        const inDate = new Date(editForm.clock_in);
        const outDate = editForm.clock_out ? new Date(editForm.clock_out) : null;

        if (editForm.id) {
            await supabase.from('time_records').update({
                clock_in: inDate.toISOString(),
                clock_out: outDate ? outDate.toISOString() : null,
                status: outDate ? 'completed' : 'active',
                user_id: editForm.user_id
            }).eq('id', editForm.id);
        } else {
            const emp = employees.find(e => e.id === editForm.user_id);
            await supabase.from('time_records').insert({
                user_id: editForm.user_id,
                store_id: emp?.store_id || null,
                organization_id: orgId,
                clock_in: inDate.toISOString(),
                clock_out: outDate ? outDate.toISOString() : null,
                clock_in_method: 'admin',
                clock_out_method: outDate ? 'admin' : null,
                status: outDate ? 'completed' : 'active'
            });
        }
        setEditForm(null);
        await loadData();
    };

    const deleteRecord = async (id: string) => {
        if (!confirm(zh ? '確定刪除？' : 'Are you sure?')) return;
        await supabase.from('time_records').delete().eq('id', id);
        await loadData();
    };

    const addMapping = async () => {
        if (!mapForm.line_user_id || !mapForm.user_id) return;
        const emp = employees.find(e => e.id === mapForm.user_id);
        await supabase.from('line_employee_mapping').insert({
            line_user_id: mapForm.line_user_id, user_id: mapForm.user_id,
            store_id: emp?.store_id || null, is_verified: true,
        });
        setMapForm({ line_user_id: '', user_id: '' });
        await loadMappings();
    };

    const deleteMapping = async (id: string) => {
        await supabase.from('line_employee_mapping').delete().eq('id', id);
        await loadMappings();
    };

    const methodLabel: Record<string, string> = {
        manual: zh ? '手動' : 'Manual', line_bot: 'LINE Bot', admin: zh ? '管理員' : 'Admin',
        qr_code: 'QR Code', auto: zh ? '自動' : 'Auto',
    };

    const activeRecords = records.filter(r => !r.clock_out);
    const completedRecords = records.filter(r => r.clock_out);
    const todayHours = records.reduce((sum, r) => sum + (r.total_hours || 0), 0);

    const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const toLocalDateTime = (iso: string) => {
        const d = new Date(iso);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        return d.toISOString().slice(0, 16);
    };

    if (loading) return <div className="loading-pulse" style={{ padding: '40px' }}>{zh ? '載入中…' : 'Loading…'}</div>;

    return (
        <div className="fade-in" style={{ position: 'relative' }}>
            <div className="page-header">
                <h1>⏱ {zh ? '打卡 / 時間追蹤' : 'Clock In / Time Tracker'}</h1>
                <p className="page-subtitle">{zh ? '員工出勤打卡與工時紀錄管理' : 'Employee attendance clock-in and time tracking'}</p>
            </div>

            {/* Tabs */}
            <div className="tab-bar" style={{ marginBottom: '16px' }}>
                <button className={`tab-item ${tab === 'today' ? 'active' : ''}`} onClick={() => setTab('today')}>
                    ⏱ {zh ? '今日打卡' : 'Today'}
                </button>
                <button className={`tab-item ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
                    📊 {zh ? '出勤紀錄' : 'History'}
                </button>
                <button className={`tab-item ${tab === 'mapping' ? 'active' : ''}`} onClick={() => setTab('mapping')}>
                    🔗 {zh ? 'LINE 綁定' : 'LINE Mapping'}
                </button>
                <button className={`tab-item ${tab === 'corrections' ? 'active' : ''}`} onClick={() => setTab('corrections')}>
                    {zh ? `補打審核${corrections.filter(c => c.status === 'pending').length > 0 ? ` (${corrections.filter(c => c.status === 'pending').length})` : ''}` : `Corrections${corrections.filter(c => c.status === 'pending').length > 0 ? ` (${corrections.filter(c => c.status === 'pending').length})` : ''}`}
                </button>
            </div>

            {/* TODAY TAB */}
            {tab === 'today' && (
                <>
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#22c55e' }}>{activeRecords.length}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '在班中' : 'Clocked In'}</div>
                        </div>
                        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-primary)' }}>{completedRecords.length}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '已下班' : 'Clocked Out'}</div>
                        </div>
                        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>{todayHours.toFixed(1)}h</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '總工時' : 'Total Hours'}</div>
                        </div>
                        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                            <div style={{ fontSize: '28px', fontWeight: 700, color: '#f43f5e' }}>{records.filter(r => r.is_late).length}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '遲到' : 'Late'}</div>
                        </div>
                    </div>

                    {/* Quick clock-in for employees */}
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                            📥 {zh ? '快速打卡上班' : 'Quick Clock In'}
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {employees.filter(emp => !activeRecords.some(r => r.user_id === emp.id)).map(emp => (
                                <button key={emp.id} className="btn btn-secondary btn-sm" onClick={() => clockIn(emp.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '11px' }}>📥</span> {emp.name}
                                </button>
                            ))}
                            {employees.filter(emp => !activeRecords.some(r => r.user_id === emp.id)).length === 0 && (
                                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{zh ? '所有員工皆已上班' : 'All employees clocked in'}</span>
                            )}
                        </div>
                    </div>

                    {/* Active records — currently clocked in */}
                    {activeRecords.length > 0 && (
                        <div className="card" style={{ marginBottom: '16px', padding: 0 }}>
                            <div style={{ padding: '12px 16px', borderBottom: 'none', fontWeight: 600, fontSize: '13px', color: '#22c55e' }}>
                                🟢 {zh ? '目前在班' : 'Currently Working'} ({activeRecords.length})
                            </div>
                            {activeRecords.map(r => (
                                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: 'none' }}>
                                    <span style={{ fontWeight: 600, fontSize: '14px', minWidth: '80px' }}>{(r.user as any)?.name}</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🕐 {formatTime(r.clock_in)}</span>
                                    <span className="badge" style={{ background: '#22c55e33', color: '#22c55e', fontSize: '10px' }}>{methodLabel[r.clock_in_method]}</span>
                                    {r.is_late && <span className="badge" style={{ background: '#f43f5e33', color: '#f43f5e', fontSize: '10px' }}>{zh ? '遲到' : 'Late'}</span>}
                                    <button className="btn btn-sm btn-primary" style={{ marginLeft: 'auto', fontSize: '11px' }} onClick={() => clockOut(r.id)}>
                                        📤 {zh ? '打卡下班' : 'Clock Out'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Completed records */}
                    {completedRecords.length > 0 && (
                        <div className="card" style={{ padding: 0 }}>
                            <div style={{ padding: '12px 16px', borderBottom: 'none', fontWeight: 600, fontSize: '13px' }}>
                                ✅ {zh ? '已完成' : 'Completed'} ({completedRecords.length})
                            </div>
                            {completedRecords.map(r => (
                                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px', borderBottom: 'none', fontSize: '12px' }}>
                                    <span style={{ fontWeight: 600, minWidth: '80px' }}>{(r.user as any)?.name}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>🕐 {formatTime(r.clock_in)} → {r.clock_out ? formatTime(r.clock_out) : '—'}</span>
                                    <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{r.total_hours?.toFixed(1)}h</span>
                                    {r.is_late && <span className="badge" style={{ background: '#f43f5e33', color: '#f43f5e', fontSize: '10px' }}>{zh ? '遲到' : 'Late'}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* HISTORY TAB */}
            {tab === 'history' && (
                <>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
                        <input className="input-field" type="date" name="dateFilter" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ width: '180px' }} />
                        <select className="input-field" value={selectedStore} onChange={e => setSelectedStore(e.target.value)} style={{ width: '180px' }}>
                            <option value="all">{zh ? '所有門市' : 'All Stores'}</option>
                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            {records.length} {zh ? '筆紀錄' : 'records'} · {todayHours.toFixed(1)}h {zh ? '總工時' : 'total'}
                        </span>
                        <div style={{ marginLeft: 'auto' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => setEditForm(
                                { user_id: '', clock_in: `${selectedDate}T09:00`, clock_out: `${selectedDate}T18:00` }
                            )}>
                                ➕ {zh ? '新增紀錄' : 'Add Record'}
                            </button>
                        </div>
                    </div>
                    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-primary)' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '員工' : 'Employee'}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '上班' : 'Clock In'}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '下班' : 'Clock Out'}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '休息' : 'Break'}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '工時' : 'Hours'}</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: 'none' }}>{zh ? '管理' : 'Actions'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map(r => (
                                    <tr key={r.id} style={{ borderBottom: 'none' }}>
                                        <td style={{ padding: '8px 14px', fontWeight: 600 }}>{(r.user as any)?.name}</td>
                                        <td style={{ padding: '8px 14px' }}>{formatTime(r.clock_in)} ({methodLabel[r.clock_in_method]})</td>
                                        <td style={{ padding: '8px 14px' }}>{r.clock_out ? `${formatTime(r.clock_out)} (${methodLabel[r.clock_out_method || 'admin']})` : <span style={{ color: '#22c55e' }}>🟢 {zh ? '在班' : 'Working'}</span>}</td>
                                        <td style={{ padding: '8px 14px', fontSize: '12px' }}>
                                            {r.break_start ? (
                                                <span>
                                                    {formatTime(r.break_start)}
                                                    {r.break_end ? ` — ${formatTime(r.break_end)}` : <span style={{ color: '#f59e0b' }}> ☕</span>}
                                                    {r.break_minutes > 0 && <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>({r.break_minutes}m)</span>}
                                                </span>
                                            ) : r.break_minutes > 0 ? (
                                                <span style={{ color: 'var(--text-muted)' }}>{r.break_minutes}m</span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: '8px 14px', fontWeight: 600, color: 'var(--accent-primary)' }}>
                                            {r.total_hours?.toFixed(1) || '—'}
                                            {r.is_late && <span className="badge" style={{ background: '#f43f5e33', color: '#f43f5e', fontSize: '10px', marginLeft: '4px' }}>{zh ? '遲到' : 'Late'}</span>}
                                        </td>
                                        <td style={{ padding: '8px 14px' }}>
                                            <button className="btn btn-sm btn-secondary" style={{ padding: '2px 8px', fontSize: '12px', marginRight: '6px' }}
                                                onClick={() => setEditForm({ ...r, clock_in: toLocalDateTime(r.clock_in), clock_out: r.clock_out ? toLocalDateTime(r.clock_out) : '' })}>
                                                ✏️ {zh ? '修改' : 'Edit'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {records.length === 0 && (
                                    <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '無紀錄' : 'No records'}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Edit / Create Record Modal */}
            {editForm && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                }}>
                    <div className="card" style={{ width: '400px' }}>
                        <h3 style={{ marginBottom: '16px', fontWeight: 600 }}>{editForm.id ? (zh ? '修改紀錄' : 'Edit Record') : (zh ? '新增紀錄' : 'Create Record')}</h3>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            <div>
                                <label className="detail-label">{zh ? '員工' : 'Employee'}</label>
                                <select className="input-field" value={editForm.user_id} onChange={e => setEditForm({ ...editForm, user_id: e.target.value })}>
                                    <option value="">{zh ? '選擇員工' : 'Select Employee'}</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '上班時間' : 'Clock In'}</label>
                                <input className="input-field" type="datetime-local" value={editForm.clock_in} onChange={e => setEditForm({ ...editForm, clock_in: e.target.value })} />
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '下班時間' : 'Clock Out'}</label>
                                <input className="input-field" type="datetime-local" value={editForm.clock_out || ''} onChange={e => setEditForm({ ...editForm, clock_out: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                            <button className="btn btn-primary" onClick={saveRecord}>{zh ? '儲存' : 'Save'}</button>
                            <button className="btn btn-secondary" onClick={() => setEditForm(null)}>{zh ? '取消' : 'Cancel'}</button>
                            {editForm.id && (
                                <button className="btn btn-secondary" style={{ marginLeft: 'auto', color: '#f43f5e' }} onClick={() => { deleteRecord(editForm.id); setEditForm(null); }}>
                                    🗑 {zh ? '刪除' : 'Delete'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* CORRECTIONS TAB */}
            {tab === 'corrections' && (
                <div>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
                        <select
                            className="input-field"
                            style={{ width: 'auto' }}
                            value={correctionFilter}
                            onChange={e => setCorrectionFilter(e.target.value as 'pending' | 'all')}
                        >
                            <option value="pending">{zh ? '待審核' : 'Pending'}</option>
                            <option value="all">{zh ? '所有記錄' : 'All Records'}</option>
                        </select>
                    </div>

                    {corrections.length === 0 ? (
                        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            ✅ {zh ? '沒有待審核的補打申請' : 'No punch correction requests'}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {corrections.map(c => (
                                <div key={c.id} className="card fade-in" style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                        <div>
                                            <span style={{ fontWeight: 600, fontSize: '15px' }}>{c.user?.name || c.user_id}</span>
                                            {c.store?.name && <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>@ {c.store.name}</span>}
                                            <span style={{
                                                marginLeft: '8px',
                                                fontSize: '11px',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                background: c.correction_type === 'missing' ? '#f3f4f6' : '#eff6ff',
                                                color: c.correction_type === 'missing' ? '#374151' : '#1d4ed8',
                                            }}>
                                                {c.correction_type === 'clock_in' ? (zh ? '更正上班' : 'Fix Clock-In')
                                                : c.correction_type === 'clock_out' ? (zh ? '更正下班' : 'Fix Clock-Out')
                                                : c.correction_type === 'both' ? (zh ? '上下班均更正' : 'Fix Both')
                                                : (zh ? '補登' : 'Missing Punch')}
                                            </span>
                                        </div>
                                        <span style={{
                                            fontSize: '11px', padding: '2px 8px', borderRadius: '12px',
                                            background: c.status === 'pending' ? '#fef3c7' : c.status === 'approved' ? '#dcfce7' : '#fee2e2',
                                            color: c.status === 'pending' ? '#92400e' : c.status === 'approved' ? '#166534' : '#991b1b',
                                        }}>
                                            {c.status === 'pending' ? (zh ? '待審核' : 'Pending') : c.status === 'approved' ? (zh ? '已核准' : 'Approved') : (zh ? '已拒絕' : 'Rejected')}
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '13px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                                        {c.original_clock_in && (
                                            <div><span className="detail-label">{zh ? '原上班' : 'Orig In'}</span> {new Date(c.original_clock_in).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}</div>
                                        )}
                                        {c.requested_clock_in && (
                                            <div><span className="detail-label">{zh ? '申請上班' : 'Req In'}</span> <strong>{new Date(c.requested_clock_in).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}</strong></div>
                                        )}
                                        {c.original_clock_out && (
                                            <div><span className="detail-label">{zh ? '原下班' : 'Orig Out'}</span> {new Date(c.original_clock_out).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}</div>
                                        )}
                                        {c.requested_clock_out && (
                                            <div><span className="detail-label">{zh ? '申請下班' : 'Req Out'}</span> <strong>{new Date(c.requested_clock_out).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}</strong></div>
                                        )}
                                    </div>

                                    <div style={{ fontSize: '13px', marginBottom: '10px' }}>
                                        <span className="detail-label">{zh ? '原因' : 'Reason'}: </span>{c.reason}
                                    </div>

                                    {c.status === 'pending' && (
                                        <div>
                                            {rejectingCorrectionId === c.id ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        className="input-field"
                                                        placeholder={zh ? '拒絕原因…' : 'Rejection reason…'}
                                                        value={correctionRejectReason}
                                                        onChange={e => setCorrectionRejectReason(e.target.value)}
                                                        style={{ flex: 1, fontSize: '13px' }}
                                                    />
                                                    <button className="btn btn-sm" style={{ color: '#f43f5e' }} onClick={() => rejectCorrection(c.id)}>
                                                        {zh ? '確認拒絕' : 'Confirm'}
                                                    </button>
                                                    <button className="btn btn-sm" onClick={() => { setRejectingCorrectionId(null); setCorrectionRejectReason(''); }}>
                                                        {zh ? '取消' : 'Cancel'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="btn btn-sm" style={{ color: '#22c55e' }} onClick={() => approveCorrection(c)}>
                                                        ✓ {zh ? '核准' : 'Approve'}
                                                    </button>
                                                    <button className="btn btn-sm" style={{ color: '#f43f5e' }} onClick={() => setRejectingCorrectionId(c.id)}>
                                                        ✕ {zh ? '拒絕' : 'Reject'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {c.status === 'rejected' && c.rejection_reason && (
                                        <div style={{ fontSize: '12px', color: '#f43f5e' }}>
                                            {zh ? '拒絕原因' : 'Rejection reason'}: {c.rejection_reason}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* LINE MAPPING TAB */}
            {tab === 'mapping' && (
                <>
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>🔗 {zh ? '新增 LINE 綁定' : 'Add LINE Mapping'}</h4>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                            <div>
                                <label className="detail-label">LINE User ID</label>
                                <input className="input-field" value={mapForm.line_user_id} onChange={e => setMapForm({ ...mapForm, line_user_id: e.target.value })} placeholder="U…" style={{ width: '260px' }} />
                            </div>
                            <div>
                                <label className="detail-label">{zh ? '員工' : 'Employee'}</label>
                                <select className="input-field" value={mapForm.user_id} onChange={e => setMapForm({ ...mapForm, user_id: e.target.value })} style={{ width: '200px' }}>
                                    <option value="">{zh ? '選擇員工' : 'Select employee'}</option>
                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                            </div>
                            <button className="btn btn-primary" onClick={addMapping}>{zh ? '綁定' : 'Link'}</button>
                        </div>
                    </div>
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: 'none', fontWeight: 600, fontSize: '13px' }}>
                            {zh ? '已綁定帳號' : 'Linked Accounts'} ({mappings.length})
                        </div>
                        {mappings.map(m => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: 'none', fontSize: '13px' }}>
                                <span style={{ fontWeight: 600 }}>{m.user?.name}</span>
                                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{m.line_user_id}</span>
                                <span className="badge" style={{ background: m.is_verified ? '#22c55e33' : '#f59e0b33', color: m.is_verified ? '#22c55e' : '#f59e0b', fontSize: '10px' }}>
                                    {m.is_verified ? (zh ? '已驗證' : 'Verified') : (zh ? '未驗證' : 'Pending')}
                                </span>
                                <button className="btn btn-sm" style={{ marginLeft: 'auto', color: '#f43f5e', fontSize: '11px' }} onClick={() => deleteMapping(m.id)}>🗑</button>
                            </div>
                        ))}
                        {mappings.length === 0 && (
                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                                {zh ? '尚無綁定帳號。員工可透過 LINE 傳送「綁定」指令自動綁定。' : 'No mappings. Employees can send "bind" command via LINE to auto-link.'}
                            </div>
                        )}
                    </div>
                    <div className="card" style={{ marginTop: '16px', borderLeft: '4px solid var(--accent-primary)', padding: '14px 18px' }}>
                        <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>💡 {zh ? 'LINE Bot 打卡指令' : 'LINE Bot Clock Commands'}</h4>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                            <div><code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{zh ? '上班' : 'clock in'}</code> — {zh ? '打卡上班' : 'Clock in'}</div>
                            <div><code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{zh ? '下班' : 'clock out'}</code> — {zh ? '打卡下班' : 'Clock out'}</div>
                            <div><code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{zh ? '綁定' : 'bind'}</code> — {zh ? '綁定 LINE 帳號與員工資料' : 'Link LINE account to employee'}</div>
                            <div><code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{zh ? '工時' : 'hours'}</code> — {zh ? '查看本週工時統計' : 'View weekly hours summary'}</div>
                            <div><code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>{zh ? '班表' : 'schedule'}</code> — {zh ? '查看本週班表' : 'View weekly schedule'}</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
