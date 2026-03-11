import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';

interface Employee {
    id: string; name: string; email: string | null; status: string;
    employee_type: string; store_id: string | null; hourly_wage: number | null;
    max_hours_per_week: number; phone: string | null; hire_date: string | null;
    position: string | null; avatar_url: string | null;
    store?: { name: string } | null;
    roles?: { role_name: string }[];
}
interface Store { id: string; name: string; store_code: string; }
interface LeaveRequest {
    id: string; user_id: string; start_date: string; end_date: string;
    leave_type: string; reason: string | null; status: string;
    total_days: number; is_paid: boolean;
}
interface PerformanceReview {
    id: string; user_id: string; reviewer_id: string | null;
    points: number; comment: string | null; review_date: string;
}
interface ShiftTemplate {
    id: string; store_id: string | null; name: string; start_time: string; end_time: string;
}
interface EmployeeAvailability {
    id: string; day_of_week: number; availability: string; preferred_shift_id: string | null; notes: string | null;
    shift_template?: ShiftTemplate;
}

export function Employees() {
    const zh = getLocale() === 'zh-TW';
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Employee | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', phone: '', employee_type: 'full_time', store_id: '', position: '', hourly_wage: '', max_hours_per_week: '40', hire_date: '' });
    const [filter, setFilter] = useState<'all' | 'full_time' | 'part_time'>('all');
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [showLeaveForm, setShowLeaveForm] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });

    const [reviews, setReviews] = useState<PerformanceReview[]>([]);
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewForm, setReviewForm] = useState({ points: '100', comment: '', review_date: new Date().toISOString().split('T')[0] });

    const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
    const [availabilities, setAvailabilities] = useState<EmployeeAvailability[]>([]);
    const [showAvailForm, setShowAvailForm] = useState(false);
    const [availForm, setAvailForm] = useState({ day_of_week: 1, availability: 'available', preferred_shift_id: '', notes: '' });

    const loadEmployees = async () => {
        const { data } = await supabase.from('users').select('*, store:stores(name)').order('name');
        setEmployees(data || []);
        const { data: roleData } = await supabase.from('user_roles').select('user_id, roles(role_name)');
        if (roleData && data) {
            const roleMap: Record<string, string[]> = {};
            roleData.forEach((r: any) => { roleMap[r.user_id] = roleMap[r.user_id] || []; roleMap[r.user_id].push(r.roles?.role_name); });
            setEmployees(data.map((e: any) => ({ ...e, roles: (roleMap[e.id] || []).map((r: string) => ({ role_name: r })) })));
        }
    };

    const loadLeaves = async (userId: string) => {
        const { data } = await supabase.from('leave_requests').select('*')
            .eq('user_id', userId).order('start_date', { ascending: false });
        setLeaves(data || []);
    };

    const loadReviews = async (userId: string) => {
        const { data } = await supabase.from('performance_reviews').select('*')
            .eq('user_id', userId).order('review_date', { ascending: false });
        setReviews(data || []);
    };

    const loadAvailabilities = async (userId: string) => {
        const { data } = await supabase.from('employee_availability')
            .select('id, day_of_week, availability, preferred_shift_id, notes, shift_template:shift_templates(id, name, start_time, end_time)')
            .eq('user_id', userId).order('day_of_week', { ascending: true });
        // Clean up relationship format to match interface
        if (data) {
            setAvailabilities(data.map((d: any) => ({ ...d, shift_template: d.shift_template })));
        } else {
            setAvailabilities([]);
        }
    };

    useEffect(() => {
        Promise.all([
            loadEmployees(),
            supabase.from('stores').select('id, name, store_code').order('name').then(r => setStores(r.data || [])),
            supabase.from('shift_templates').select('id, store_id, name, start_time, end_time').order('start_time').then(r => setShiftTemplates(r.data || []))
        ]).then(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (selected) {
            loadLeaves(selected.id);
            loadReviews(selected.id);
            loadAvailabilities(selected.id);
        } else {
            setLeaves([]);
            setReviews([]);
            setAvailabilities([]);
        }
    }, [selected?.id]);

    const createEmployee = async () => {
        if (!form.name) return;
        await supabase.from('users').insert({
            organization_id: '00000000-0000-0000-0000-000000000001',
            name: form.name, email: form.email || null, phone: form.phone || null,
            employee_type: form.employee_type, store_id: form.store_id || null,
            position: form.position || null, hourly_wage: form.hourly_wage ? Number(form.hourly_wage) : null,
            max_hours_per_week: Number(form.max_hours_per_week) || 40,
            hire_date: form.hire_date || null,
        });
        setForm({ name: '', email: '', phone: '', employee_type: 'full_time', store_id: '', position: '', hourly_wage: '', max_hours_per_week: '40', hire_date: '' });
        setShowCreate(false);
        await loadEmployees();
    };

    const updateField = async (id: string, field: string, value: any) => {
        await supabase.from('users').update({ [field]: value }).eq('id', id);
        await loadEmployees();
        if (selected?.id === id) setSelected(prev => prev ? { ...prev, [field]: value } : null);
    };

    const createLeave = async () => {
        if (!selected || !leaveForm.start_date || !leaveForm.end_date) return;
        await supabase.from('leave_requests').insert({
            user_id: selected.id, store_id: selected.store_id,
            organization_id: '00000000-0000-0000-0000-000000000001',
            start_date: leaveForm.start_date, end_date: leaveForm.end_date,
            leave_type: leaveForm.leave_type, reason: leaveForm.reason || null,
            status: 'pending', is_paid: !['unpaid', 'block_off'].includes(leaveForm.leave_type),
        });
        setLeaveForm({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });
        setShowLeaveForm(false);
        await loadLeaves(selected.id);
    };

    const updateLeaveStatus = async (leaveId: string, status: string) => {
        await supabase.from('leave_requests').update({ status, approved_at: status === 'approved' ? new Date().toISOString() : null }).eq('id', leaveId);
        if (selected) await loadLeaves(selected.id);
    };

    const createReview = async () => {
        if (!selected || !reviewForm.review_date || !reviewForm.points) return;
        const { data: { user } } = await supabase.auth.getUser();

        await supabase.from('performance_reviews').insert({
            user_id: selected.id,
            reviewer_id: user?.id || null,
            points: Number(reviewForm.points),
            comment: reviewForm.comment || null,
            review_date: reviewForm.review_date,
            organization_id: '00000000-0000-0000-0000-000000000001'
        });
        setReviewForm({ points: '100', comment: '', review_date: new Date().toISOString().split('T')[0] });
        setShowReviewForm(false);
        await loadReviews(selected.id);
    };

    const saveAvailability = async () => {
        if (!selected) return;

        await supabase.from('employee_availability').delete().eq('user_id', selected.id).eq('day_of_week', availForm.day_of_week);

        await supabase.from('employee_availability').insert({
            user_id: selected.id,
            store_id: selected.store_id || null,
            day_of_week: availForm.day_of_week,
            availability: availForm.availability,
            preferred_shift_id: availForm.preferred_shift_id || null,
            notes: availForm.notes || null
        });
        setAvailForm({ day_of_week: 1, availability: 'available', preferred_shift_id: '', notes: '' });
        setShowAvailForm(false);
        await loadAvailabilities(selected.id);
    };
    const deleteAvailability = async (id: string) => {
        if (!selected) return;
        await supabase.from('employee_availability').delete().eq('id', id);
        await loadAvailabilities(selected.id);
    };

    const typeLabel: Record<string, string> = { full_time: zh ? '\u5168\u8077' : 'Full-time', part_time: zh ? '\u517c\u8077' : 'Part-time', contract: zh ? '\u7d04\u8058' : 'Contract' };
    const typeBadge: Record<string, string> = { full_time: '#22c55e', part_time: '#f59e0b', contract: '#6366f1' };
    const filteredEmployees = filter === 'all' ? employees : employees.filter(e => e.employee_type === filter);
    const leaveTypeLabel: Record<string, string> = {
        annual: zh ? '\u7279\u4f11' : 'Annual', personal: zh ? '\u4e8b\u5047' : 'Personal', sick: zh ? '\u75c5\u5047' : 'Sick',
        maternity: zh ? '\u7522\u5047' : 'Maternity', bereavement: zh ? '\u55aa\u5047' : 'Bereavement',
        unpaid: zh ? '\u7121\u85aa\u5047' : 'Unpaid', block_off: zh ? '\u6392\u9664\u65e5' : 'Block Off', other: zh ? '\u5176\u4ed6' : 'Other',
    };
    const leaveStatusColor: Record<string, string> = { pending: '#f59e0b', approved: '#22c55e', rejected: '#f43f5e', cancelled: '#666' };
    const availLabel: Record<string, string> = { available: zh ? '可排班' : 'Available', preferred: zh ? '偏好排班' : 'Preferred', unavailable: zh ? '不可排班' : 'Unavailable' };
    const availColor: Record<string, string> = { available: '#22c55e', preferred: '#3b82f6', unavailable: '#f43f5e' };
    const daysOfWeek = zh ? ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const getInitials = (name: string) => name.slice(0, 2);
    const getColor = (name: string) => {
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#22c55e', '#06b6d4', '#3b82f6'];
        return colors[name.charCodeAt(0) % colors.length];
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>{'\u{1F465}'} {t('employee.title')}</h1>
                <p className="page-subtitle">{t('employee.subtitle')}</p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="tab-bar" style={{ marginBottom: 0 }}>
                    {(['all', 'full_time', 'part_time'] as const).map(f => (
                        <button key={f} className={`tab-item ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                            {f === 'all' ? (zh ? '\u5168\u90e8' : 'All') : typeLabel[f]} ({f === 'all' ? employees.length : employees.filter(e => e.employee_type === f).length})
                        </button>
                    ))}
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}>{'\u2795'} {t('employee.create')}</button>
                </div>
            </div>

            {showCreate && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>{'\u2795'} {t('employee.create')}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{t('employee.name')} *</label>
                            <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={zh ? '\u59d3\u540d' : 'Name'} />
                        </div>
                        <div>
                            <label className="detail-label">Email</label>
                            <input className="input-field" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.phone')}</label>
                            <input className="input-field" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0912-345-678" />
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.type')}</label>
                            <select className="input-field" value={form.employee_type} onChange={e => setForm({ ...form, employee_type: e.target.value })}>
                                <option value="full_time">{typeLabel.full_time}</option>
                                <option value="part_time">{typeLabel.part_time}</option>
                                <option value="contract">{typeLabel.contract}</option>
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.store')}</label>
                            <select className="input-field" value={form.store_id} onChange={e => setForm({ ...form, store_id: e.target.value })}>
                                <option value="">{zh ? '\u672a\u6307\u6d3e' : 'Unassigned'}</option>
                                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.position')}</label>
                            <select className="input-field" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}>
                                <option value="">{zh ? '\u9078\u64c7\u8077\u4f4d' : 'Select position'}</option>
                                <option value="\u5e97\u9577">{zh ? '\u5e97\u9577' : 'Store Manager'}</option>
                                <option value="\u54c1\u9152\u5e2b">{zh ? '\u54c1\u9152\u5e2b' : 'Sommelier'}</option>
                                <option value="\u9580\u5e02\u4eba\u54e1">{zh ? '\u9580\u5e02\u4eba\u54e1' : 'Sales Staff'}</option>
                                <option value="\u5009\u5132\u4eba\u54e1">{zh ? '\u5009\u5132\u4eba\u54e1' : 'Warehouse Staff'}</option>
                                <option value="\u884c\u653f\u4eba\u54e1">{zh ? '\u884c\u653f\u4eba\u54e1' : 'Admin Staff'}</option>
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.wage')} (NT$)</label>
                            <input className="input-field" type="number" value={form.hourly_wage} onChange={e => setForm({ ...form, hourly_wage: e.target.value })} placeholder="183" />
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.max_hours')}</label>
                            <input className="input-field" type="number" value={form.max_hours_per_week} onChange={e => setForm({ ...form, max_hours_per_week: e.target.value })} placeholder="40" />
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.hire_date')}</label>
                            <input className="input-field" type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                        <button className="btn btn-primary" onClick={createEmployee}>{t('common.save')}</button>
                        <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
                    </div>
                </div>
            )}

            {loading ? <p className="loading-pulse">{t('common.loading')}</p> : (
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ flex: selected ? '0 0 50%' : '1' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                            {filteredEmployees.map(emp => (
                                <div key={emp.id} className="card" style={{
                                    cursor: 'pointer', padding: '16px',
                                    borderColor: selected?.id === emp.id ? 'var(--accent-primary)' : undefined,
                                    transition: 'border-color 0.2s',
                                }} onClick={() => setSelected(emp)}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <div style={{
                                            width: '44px', height: '44px', borderRadius: '50%', background: getColor(emp.name),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: '16px', color: '#fff', flexShrink: 0,
                                        }}>{getInitials(emp.name)}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: 600, fontSize: '14px' }}>{emp.name}</span>
                                                <span className="badge" style={{ background: typeBadge[emp.employee_type] || '#666', fontSize: '11px', padding: '1px 8px' }}>
                                                    {typeLabel[emp.employee_type] || emp.employee_type}
                                                </span>
                                                <span className="badge" style={{ background: emp.status === 'active' ? '#22c55e55' : '#f43f5e55', color: emp.status === 'active' ? '#22c55e' : '#f43f5e', fontSize: '11px', padding: '1px 8px' }}>
                                                    {emp.status === 'active' ? (zh ? '\u5728\u8077' : 'Active') : (zh ? '\u96e2\u8077' : 'Inactive')}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                {emp.position && <span>{'\u{1F3F7}'} {emp.position}</span>}
                                                {emp.store && <span>{'\u{1F3EA}'} {(emp.store as any).name}</span>}
                                                {emp.hourly_wage && <span>{'\u{1F4B0}'} NT${emp.hourly_wage}/hr</span>}
                                                {emp.max_hours_per_week && <span>{'\u23F1'} {emp.max_hours_per_week}h/{zh ? '\u9031' : 'wk'}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {selected && (
                        <div style={{ flex: '0 0 47%', minWidth: '320px' }} className="fade-in">
                            <div className="card" style={{ position: 'sticky', top: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                                        <div style={{
                                            width: '56px', height: '56px', borderRadius: '50%', background: getColor(selected.name),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: '22px', color: '#fff',
                                        }}>{getInitials(selected.name)}</div>
                                        <div>
                                            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{selected.name}</h3>
                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                {selected.position || (zh ? '\u672a\u8a2d\u5b9a\u8077\u4f4d' : 'No position')} {'\u00B7'} {typeLabel[selected.employee_type]}
                                            </div>
                                        </div>
                                    </div>
                                    <button className="btn btn-sm btn-secondary" onClick={() => setSelected(null)}>{'\u2715'}</button>
                                </div>

                                <div style={{ display: 'grid', gap: '12px' }}>
                                    <div>
                                        <label className="detail-label">{t('employee.type')}</label>
                                        <select className="input-field" value={selected.employee_type} onChange={e => updateField(selected.id, 'employee_type', e.target.value)}>
                                            <option value="full_time">{typeLabel.full_time}</option>
                                            <option value="part_time">{typeLabel.part_time}</option>
                                            <option value="contract">{typeLabel.contract}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{t('employee.store')}</label>
                                        <select className="input-field" value={selected.store_id || ''} onChange={e => updateField(selected.id, 'store_id', e.target.value || null)}>
                                            <option value="">{zh ? '\u672a\u6307\u6d3e' : 'Unassigned'}</option>
                                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{t('employee.position')}</label>
                                        <select className="input-field" value={selected.position || ''} onChange={e => updateField(selected.id, 'position', e.target.value || null)}>
                                            <option value="">{zh ? '\u9078\u64c7\u8077\u4f4d' : 'Select position'}</option>
                                            <option value="\u5e97\u9577">{zh ? '\u5e97\u9577' : 'Store Manager'}</option>
                                            <option value="\u54c1\u9152\u5e2b">{zh ? '\u54c1\u9152\u5e2b' : 'Sommelier'}</option>
                                            <option value="\u9580\u5e02\u4eba\u54e1">{zh ? '\u9580\u5e02\u4eba\u54e1' : 'Sales Staff'}</option>
                                            <option value="\u5009\u5132\u4eba\u54e1">{zh ? '\u5009\u5132\u4eba\u54e1' : 'Warehouse Staff'}</option>
                                            <option value="\u884c\u653f\u4eba\u54e1">{zh ? '\u884c\u653f\u4eba\u54e1' : 'Admin Staff'}</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label className="detail-label">{t('employee.wage')} (NT$)</label>
                                            <input className="input-field" type="number" value={selected.hourly_wage || ''} onChange={e => updateField(selected.id, 'hourly_wage', e.target.value ? Number(e.target.value) : null)} />
                                        </div>
                                        <div>
                                            <label className="detail-label">{t('employee.max_hours')}</label>
                                            <input className="input-field" type="number" value={selected.max_hours_per_week} onChange={e => updateField(selected.id, 'max_hours_per_week', Number(e.target.value) || 40)} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label className="detail-label">{t('employee.phone')}</label>
                                            <input className="input-field" value={selected.phone || ''} onChange={e => updateField(selected.id, 'phone', e.target.value || null)} />
                                        </div>
                                        <div>
                                            <label className="detail-label">{t('employee.hire_date')}</label>
                                            <input className="input-field" type="date" value={selected.hire_date || ''} onChange={e => updateField(selected.id, 'hire_date', e.target.value || null)} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '\u72c0\u614b' : 'Status'}</label>
                                        <select className="input-field" value={selected.status} onChange={e => updateField(selected.id, 'status', e.target.value)}>
                                            <option value="active">{zh ? '\u5728\u8077' : 'Active'}</option>
                                            <option value="inactive">{zh ? '\u96e2\u8077' : 'Inactive'}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="card" style={{ marginTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                                        {'\u{1F4CB}'} {zh ? '\u8ACB\u5047 / \u6392\u9664\u65E5\u671F' : 'Leave / Block-Off Dates'}
                                    </h4>
                                    <button className="btn btn-sm btn-primary" onClick={() => setShowLeaveForm(!showLeaveForm)}>
                                        {showLeaveForm ? '\u2715' : '\u2795'}
                                    </button>
                                </div>

                                {showLeaveForm && (
                                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '\u958B\u59CB\u65E5\u671F' : 'Start'}</label>
                                                <input className="input-field" type="date" value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '\u7D50\u675F\u65E5\u671F' : 'End'}</label>
                                                <input className="input-field" type="date" value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '\u985E\u578B' : 'Type'}</label>
                                                <select className="input-field" value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
                                                    {Object.entries(leaveTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '\u539F\u56E0' : 'Reason'}</label>
                                                <input className="input-field" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder={zh ? '\u9078\u586B' : 'Optional'} />
                                            </div>
                                        </div>
                                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createLeave}>
                                            {zh ? '\u63D0\u4EA4' : 'Submit'}
                                        </button>
                                    </div>
                                )}

                                {leaves.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                                        {zh ? '\u5C1A\u7121\u8ACB\u5047\u7D00\u9304' : 'No leave requests'}
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                                        {leaves.map(lv => (
                                            <div key={lv.id} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                                                background: 'var(--bg-primary)', borderRadius: '6px', marginBottom: '4px', fontSize: '12px',
                                            }}>
                                                <span className="badge" style={{ background: leaveStatusColor[lv.status], fontSize: '10px', padding: '1px 6px' }}>
                                                    {lv.status === 'pending' ? (zh ? '\u5F85\u5BE9\u6838' : 'Pending') : lv.status === 'approved' ? (zh ? '\u5DF2\u6279\u6E96' : 'Approved') : lv.status === 'rejected' ? (zh ? '\u5DF2\u62D2\u7D55' : 'Rejected') : (zh ? '\u5DF2\u53D6\u6D88' : 'Cancelled')}
                                                </span>
                                                <span style={{ fontWeight: 600 }}>{leaveTypeLabel[lv.leave_type]}</span>
                                                <span style={{ color: 'var(--text-muted)' }}>{lv.start_date} ~ {lv.end_date}</span>
                                                <span style={{ color: 'var(--text-muted)' }}>({lv.total_days}{zh ? '\u5929' : 'd'})</span>
                                                {lv.status === 'pending' && (
                                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                                                        <button className="btn btn-sm" style={{ padding: '1px 6px', fontSize: '11px', color: '#22c55e' }} onClick={() => updateLeaveStatus(lv.id, 'approved')}>{'\u2713'}</button>
                                                        <button className="btn btn-sm" style={{ padding: '1px 6px', fontSize: '11px', color: '#f43f5e' }} onClick={() => updateLeaveStatus(lv.id, 'rejected')}>{'\u2715'}</button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card" style={{ marginTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                                        📅 {zh ? '排班偏好' : 'Shift Preferences'}
                                    </h4>
                                    <button className="btn btn-sm btn-primary" onClick={() => setShowAvailForm(!showAvailForm)}>
                                        {showAvailForm ? '✕' : '➕'}
                                    </button>
                                </div>

                                {showAvailForm && (
                                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '星期' : 'Day of Week'}</label>
                                                <select className="input-field" value={availForm.day_of_week} onChange={e => setAvailForm({ ...availForm, day_of_week: Number(e.target.value) })}>
                                                    {daysOfWeek.map((day, idx) => (
                                                        <option key={idx} value={idx}>{day}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '意願' : 'Availability'}</label>
                                                <select className="input-field" value={availForm.availability} onChange={e => setAvailForm({ ...availForm, availability: e.target.value })}>
                                                    {Object.entries(availLabel).map(([k, v]) => (
                                                        <option key={k} value={k}>{v}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        {availForm.availability !== 'unavailable' && (
                                            <div style={{ marginTop: '8px' }}>
                                                <label className="detail-label">{zh ? '偏好時段 (選填)' : 'Preferred Timeslot (Optional)'}</label>
                                                <select className="input-field" value={availForm.preferred_shift_id} onChange={e => setAvailForm({ ...availForm, preferred_shift_id: e.target.value })}>
                                                    <option value="">{zh ? '無特定偏好' : 'No specific preference'}</option>
                                                    {shiftTemplates.filter(s => !s.store_id || s.store_id === selected.store_id).map(s => (
                                                        <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        <div style={{ marginTop: '8px' }}>
                                            <label className="detail-label">{zh ? '備註' : 'Notes'}</label>
                                            <input className="input-field" value={availForm.notes} onChange={e => setAvailForm({ ...availForm, notes: e.target.value })} placeholder={zh ? '例如: 只能做早班...' : 'e.g. Morning shift preferred...'} />
                                        </div>
                                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={saveAvailability}>
                                            {zh ? '儲存設定' : 'Save Preference'}
                                        </button>
                                    </div>
                                )}

                                {availabilities.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                                        {zh ? '尚無排班偏好設定' : 'No shift preferences set'}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {availabilities.map(av => (
                                            <div key={av.id} style={{
                                                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px',
                                                background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '13px'
                                            }}>
                                                <span style={{ fontWeight: 600, width: '40px' }}>{daysOfWeek[av.day_of_week]}</span>
                                                <span className="badge" style={{ background: availColor[av.availability], fontSize: '11px', padding: '2px 6px', color: '#fff' }}>
                                                    {availLabel[av.availability] || av.availability}
                                                </span>
                                                {av.shift_template && (
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                        {av.shift_template.name} ({av.shift_template.start_time.slice(0, 5)} - {av.shift_template.end_time.slice(0, 5)})
                                                    </span>
                                                )}
                                                {av.notes && (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                        "{av.notes}"
                                                    </span>
                                                )}
                                                <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '2px', color: 'var(--text-muted)' }} onClick={() => deleteAvailability(av.id)}>
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card" style={{ marginTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                                        🎯 {zh ? '績效評估' : 'Performance Reviews'}
                                    </h4>
                                    <button className="btn btn-sm btn-primary" onClick={() => setShowReviewForm(!showReviewForm)}>
                                        {showReviewForm ? '✕' : '➕'}
                                    </button>
                                </div>

                                {showReviewForm && (
                                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '評估日期' : 'Review Date'}</label>
                                                <input className="input-field" type="date" value={reviewForm.review_date} onChange={e => setReviewForm({ ...reviewForm, review_date: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '評分 (0-100)' : 'Points (0-100)'}</label>
                                                <input className="input-field" type="number" min="0" max="100" value={reviewForm.points} onChange={e => setReviewForm({ ...reviewForm, points: e.target.value })} />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '8px' }}>
                                            <label className="detail-label">{zh ? '評語 / 備註' : 'Comments'}</label>
                                            <textarea className="input-field" value={reviewForm.comment} onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })} placeholder={zh ? '輸入針對此員工的評語...' : 'Enter review comments...'} rows={3} style={{ resize: 'vertical' }} />
                                        </div>
                                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createReview}>
                                            {zh ? '提交評估' : 'Submit Review'}
                                        </button>
                                    </div>
                                )}

                                {reviews.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                                        {zh ? '尚無績效評估紀錄' : 'No performance reviews yet'}
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                                        {reviews.map(rev => (
                                            <div key={rev.id} style={{
                                                padding: '10px', background: 'var(--bg-primary)',
                                                borderRadius: '6px', marginBottom: '8px', fontSize: '13px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <span style={{ fontWeight: 600 }}>{rev.review_date}</span>
                                                    <span style={{ fontWeight: 700, color: rev.points >= 80 ? '#22c55e' : rev.points < 60 ? '#f43f5e' : '#f59e0b' }}>
                                                        {rev.points} / 100
                                                    </span>
                                                </div>
                                                {rev.comment && (
                                                    <div style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '6px', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                                                        {rev.comment}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
