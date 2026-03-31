import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface TrainingRecord {
    id: string; employee_id: string; course_name: string; provider: string | null;
    hours: number | null; completion_date: string | null; certificate_url: string | null;
    notes: string | null; cert_type: string | null; expiry_date: string | null;
    created_at: string;
    employee_name?: string;
}
interface Employee { id: string; name: string; }

const CERT_TYPES = [
    { value: 'food_handler', zh: '食品從業人員健康檢查', en: 'Food Handler Certificate' },
    { value: 'fire_safety', zh: '消防安全講習', en: 'Fire Safety Training' },
    { value: 'first_aid', zh: '急救訓練', en: 'First Aid Training' },
    { value: 'labor_safety', zh: '勞工安全衛生', en: 'Labor Safety & Health' },
    { value: 'other', zh: '其他', en: 'Other' },
];

export function Training() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [tab, setTab] = useState<'records' | 'certs'>('records');
    const [records, setRecords] = useState<TrainingRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);

    // Form
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({
        employee_id: '', course_name: '', provider: '', hours: '',
        completion_date: '', certificate_url: '', notes: '', cert_type: '', expiry_date: '',
    });

    // Filter
    const [filterEmployee, setFilterEmployee] = useState('');

    useEffect(() => { if (orgId) loadAll(); }, [orgId]);

    async function loadAll() {
        setLoading(true);
        const [recRes, empRes] = await Promise.all([
            supabase.from('training_records')
                .select('*, employee:users!training_records_employee_id_fkey(name)')
                .eq('org_id', orgId)
                .order('completion_date', { ascending: false }),
            supabase.from('users').select('id, name').eq('organization_id', orgId).eq('status', 'active'),
        ]);
        setRecords((recRes.data || []).map((r: any) => ({
            ...r,
            employee_name: r.employee?.name || '—',
        })));
        setEmployees(empRes.data || []);
        setLoading(false);
    }

    function resetForm() {
        setForm({ employee_id: '', course_name: '', provider: '', hours: '', completion_date: '', certificate_url: '', notes: '', cert_type: '', expiry_date: '' });
        setEditId(null);
    }

    function startEdit(r: TrainingRecord) {
        setEditId(r.id);
        setForm({
            employee_id: r.employee_id, course_name: r.course_name,
            provider: r.provider || '', hours: r.hours != null ? String(r.hours) : '',
            completion_date: r.completion_date || '', certificate_url: r.certificate_url || '',
            notes: r.notes || '', cert_type: r.cert_type || '', expiry_date: r.expiry_date || '',
        });
        setShowForm(true);
    }

    async function saveRecord() {
        if (!form.employee_id || !form.course_name.trim()) return;
        const payload = {
            org_id: orgId,
            employee_id: form.employee_id,
            course_name: form.course_name.trim(),
            provider: form.provider.trim() || null,
            hours: form.hours ? Number(form.hours) : null,
            completion_date: form.completion_date || null,
            certificate_url: form.certificate_url.trim() || null,
            notes: form.notes.trim() || null,
            cert_type: form.cert_type || null,
            expiry_date: form.expiry_date || null,
        };
        if (editId) {
            await supabase.from('training_records').update(payload).eq('id', editId);
        } else {
            await supabase.from('training_records').insert(payload);
        }
        resetForm();
        setShowForm(false);
        await loadAll();
    }

    async function deleteRecord(id: string) {
        if (!confirm(zh ? '確定刪除此紀錄？' : 'Delete this record?')) return;
        await supabase.from('training_records').delete().eq('id', id);
        await loadAll();
    }

    // Filtered records
    const filtered = records.filter(r => {
        if (filterEmployee && r.employee_id !== filterEmployee) return false;
        if (tab === 'certs' && !r.cert_type) return false;
        return true;
    });

    // Expiring certs (within 30 days)
    const today = new Date();
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 30);
    const expiringCerts = records.filter(r =>
        r.cert_type && r.expiry_date &&
        new Date(r.expiry_date) <= soon && new Date(r.expiry_date) >= today
    );
    const expiredCerts = records.filter(r =>
        r.cert_type && r.expiry_date && new Date(r.expiry_date) < today
    );

    const certLabel = (ct: string) => {
        const c = CERT_TYPES.find(t => t.value === ct);
        return c ? (zh ? c.zh : c.en) : ct;
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>🎓 {zh ? '教育訓練' : 'Training Records'}</h2>
                <p>{zh ? '管理員工訓練紀錄與證照效期' : 'Manage employee training records and certification expiry'}</p>
            </div>

            <div className="page-body">
                <div className="tab-bar" style={{ marginBottom: '20px' }}>
                    <button className={`tab-item ${tab === 'records' ? 'active' : ''}`} onClick={() => setTab('records')}>
                        📝 {zh ? '訓練紀錄' : 'Records'}
                    </button>
                    <button className={`tab-item ${tab === 'certs' ? 'active' : ''}`} onClick={() => setTab('certs')}>
                        📜 {zh ? '證照管理' : 'Certifications'}
                        {(expiringCerts.length + expiredCerts.length) > 0 && (
                            <span style={{ marginLeft: '6px', background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 }}>
                                {expiringCerts.length + expiredCerts.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Expiring certs alert */}
                {tab === 'certs' && (expiredCerts.length > 0 || expiringCerts.length > 0) && (
                    <div style={{ marginBottom: '16px' }}>
                        {expiredCerts.length > 0 && (
                            <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: '8px', fontSize: '13px', color: '#ef4444' }}>
                                <strong>{zh ? '已過期證照：' : 'Expired Certifications: '}</strong>
                                {expiredCerts.map(r => `${r.employee_name} - ${certLabel(r.cert_type!)}`).join(', ')}
                            </div>
                        )}
                        {expiringCerts.length > 0 && (
                            <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '13px', color: '#f59e0b' }}>
                                <strong>{zh ? '即將到期（30天內）：' : 'Expiring Within 30 Days: '}</strong>
                                {expiringCerts.map(r => `${r.employee_name} - ${certLabel(r.cert_type!)} (${r.expiry_date})`).join(', ')}
                            </div>
                        )}
                    </div>
                )}

                {loading ? <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p> : (
                    <>
                        {/* Toolbar */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="input-field" style={{ maxWidth: '200px' }} value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
                                <option value="">{zh ? '全部員工' : 'All Employees'}</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{filtered.length} {zh ? '筆紀錄' : 'records'}</span>
                            <div style={{ marginLeft: 'auto' }}>
                                <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
                                    + {zh ? '新增紀錄' : 'Add Record'}
                                </button>
                            </div>
                        </div>

                        {/* Form */}
                        {showForm && (
                            <div className="card" style={{ marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                                    {editId ? (zh ? '編輯紀錄' : 'Edit Record') : (zh ? '新增訓練紀錄' : 'New Training Record')}
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '員工' : 'Employee'} *</label>
                                        <select className="input-field" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                                            <option value="">--</option>
                                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '課程名稱' : 'Course Name'} *</label>
                                        <input className="input-field" value={form.course_name} onChange={e => setForm({ ...form, course_name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '訓練機構' : 'Provider'}</label>
                                        <input className="input-field" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '時數' : 'Hours'}</label>
                                        <input className="input-field" type="number" step="0.5" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '完成日期' : 'Completion Date'}</label>
                                        <input className="input-field" type="date" value={form.completion_date} onChange={e => setForm({ ...form, completion_date: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '證照類型' : 'Cert Type'}</label>
                                        <select className="input-field" value={form.cert_type} onChange={e => setForm({ ...form, cert_type: e.target.value })}>
                                            <option value="">{zh ? '非證照' : 'None'}</option>
                                            {CERT_TYPES.map(ct => <option key={ct.value} value={ct.value}>{zh ? ct.zh : ct.en}</option>)}
                                        </select>
                                    </div>
                                    {form.cert_type && (
                                        <div>
                                            <label className="detail-label">{zh ? '證照到期日' : 'Cert Expiry'}</label>
                                            <input className="input-field" type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
                                        </div>
                                    )}
                                    <div>
                                        <label className="detail-label">{zh ? '證書連結' : 'Certificate URL'}</label>
                                        <input className="input-field" value={form.certificate_url} onChange={e => setForm({ ...form, certificate_url: e.target.value })} />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label className="detail-label">{zh ? '備註' : 'Notes'}</label>
                                        <input className="input-field" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                    <button className="btn btn-primary" onClick={saveRecord}>{zh ? '儲存' : 'Save'}</button>
                                    <button className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>{zh ? '取消' : 'Cancel'}</button>
                                </div>
                            </div>
                        )}

                        {/* Table */}
                        {filtered.length === 0 ? (
                            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                {zh ? '尚無紀錄' : 'No records yet'}
                            </div>
                        ) : (
                            <div className="card" style={{ overflow: 'hidden' }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                                {[
                                                    zh ? '員工' : 'Employee',
                                                    zh ? '課程名稱' : 'Course',
                                                    zh ? '機構' : 'Provider',
                                                    zh ? '時數' : 'Hours',
                                                    zh ? '完成日期' : 'Completed',
                                                    ...(tab === 'certs' ? [zh ? '證照類型' : 'Cert Type', zh ? '到期日' : 'Expiry'] : []),
                                                    zh ? '操作' : 'Actions',
                                                ].map(h => (
                                                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map(r => {
                                                const isExpired = r.expiry_date && new Date(r.expiry_date) < today;
                                                return (
                                                    <tr key={r.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{r.employee_name}</td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            {r.course_name}
                                                            {r.certificate_url && <a href={r.certificate_url} target="_blank" rel="noreferrer" style={{ marginLeft: '6px', fontSize: '11px' }}>🔗</a>}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{r.provider || '—'}</td>
                                                        <td style={{ padding: '10px 12px' }}>{r.hours ?? '—'}</td>
                                                        <td style={{ padding: '10px 12px' }}>{r.completion_date || '—'}</td>
                                                        {tab === 'certs' && (
                                                            <>
                                                                <td style={{ padding: '10px 12px' }}>{r.cert_type ? certLabel(r.cert_type) : '—'}</td>
                                                                <td style={{ padding: '10px 12px', color: isExpired ? '#ef4444' : undefined, fontWeight: isExpired ? 600 : undefined }}>
                                                                    {r.expiry_date || '—'}
                                                                    {isExpired && <span style={{ marginLeft: '4px' }}>⚠️</span>}
                                                                </td>
                                                            </>
                                                        )}
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button className="btn btn-sm btn-secondary" onClick={() => startEdit(r)}>✏️</button>
                                                                <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => deleteRecord(r.id)}>✕</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
