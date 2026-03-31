import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface DisciplinaryRecord {
    id: string; employee_id: string; type: string; description: string | null;
    issued_by: string | null; effective_date: string | null; created_at: string;
    employee_name?: string;
    issuer_name?: string;
}
interface Employee { id: string; name: string; }

const RECORD_TYPES = [
    { value: 'verbal_warning', zh: '口頭警告', en: 'Verbal Warning' },
    { value: 'written_warning', zh: '書面警告', en: 'Written Warning' },
    { value: 'suspension', zh: '停職', en: 'Suspension' },
    { value: 'demerit', zh: '記過', en: 'Demerit' },
    { value: 'merit', zh: '記功', en: 'Merit' },
    { value: 'commendation', zh: '嘉獎', en: 'Commendation' },
    { value: 'termination', zh: '解雇', en: 'Termination' },
];

export function Disciplinary() {
    const zh = getLocale() === 'zh-TW';
    const { orgId, currentUser } = useOrg();
    const [records, setRecords] = useState<DisciplinaryRecord[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);

    // Form
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ employee_id: '', type: 'verbal_warning', description: '', effective_date: '' });

    // Filter
    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterType, setFilterType] = useState('');

    useEffect(() => { if (orgId) loadAll(); }, [orgId]);

    async function loadAll() {
        setLoading(true);
        const [recRes, empRes] = await Promise.all([
            supabase.from('disciplinary_records')
                .select('*, employee:users!disciplinary_records_employee_id_fkey(name), issuer:users!disciplinary_records_issued_by_fkey(name)')
                .eq('org_id', orgId)
                .order('effective_date', { ascending: false }),
            supabase.from('users').select('id, name').eq('organization_id', orgId).eq('status', 'active'),
        ]);
        setRecords((recRes.data || []).map((r: any) => ({
            ...r,
            employee_name: r.employee?.name || '—',
            issuer_name: r.issuer?.name || '—',
        })));
        setEmployees(empRes.data || []);
        setLoading(false);
    }

    function resetForm() {
        setForm({ employee_id: '', type: 'verbal_warning', description: '', effective_date: '' });
        setEditId(null);
    }

    function startEdit(r: DisciplinaryRecord) {
        setEditId(r.id);
        setForm({
            employee_id: r.employee_id, type: r.type || 'verbal_warning',
            description: r.description || '', effective_date: r.effective_date || '',
        });
        setShowForm(true);
    }

    async function saveRecord() {
        if (!form.employee_id || !form.type) return;
        const payload = {
            org_id: orgId,
            employee_id: form.employee_id,
            type: form.type,
            description: form.description.trim() || null,
            issued_by: currentUser?.id || null,
            effective_date: form.effective_date || null,
        };
        if (editId) {
            await supabase.from('disciplinary_records').update(payload).eq('id', editId);
        } else {
            await supabase.from('disciplinary_records').insert(payload);
        }
        resetForm();
        setShowForm(false);
        await loadAll();
    }

    async function deleteRecord(id: string) {
        if (!confirm(zh ? '確定刪除此紀錄？' : 'Delete this record?')) return;
        await supabase.from('disciplinary_records').delete().eq('id', id);
        await loadAll();
    }

    const filtered = records.filter(r => {
        if (filterEmployee && r.employee_id !== filterEmployee) return false;
        if (filterType && r.type !== filterType) return false;
        return true;
    });

    const typeLabel = (t: string) => {
        const rt = RECORD_TYPES.find(rt => rt.value === t);
        return rt ? (zh ? rt.zh : rt.en) : t;
    };

    const typeColor = (t: string): { bg: string; color: string } => {
        if (['merit', 'commendation'].includes(t)) return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' };
        if (['suspension', 'termination'].includes(t)) return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
        return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>⚖️ {zh ? '獎懲紀錄' : 'Disciplinary Records'}</h2>
                <p>{zh ? '管理員工獎懲與紀律紀錄' : 'Manage employee disciplinary and merit records'}</p>
            </div>

            <div className="page-body">
                {loading ? <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p> : (
                    <>
                        {/* Toolbar */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="input-field" style={{ maxWidth: '180px' }} value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}>
                                <option value="">{zh ? '全部員工' : 'All Employees'}</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <select className="input-field" style={{ maxWidth: '160px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                                <option value="">{zh ? '全部類型' : 'All Types'}</option>
                                {RECORD_TYPES.map(rt => <option key={rt.value} value={rt.value}>{zh ? rt.zh : rt.en}</option>)}
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
                                    {editId ? (zh ? '編輯紀錄' : 'Edit Record') : (zh ? '新增獎懲紀錄' : 'New Record')}
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
                                        <label className="detail-label">{zh ? '類型' : 'Type'} *</label>
                                        <select className="input-field" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                            {RECORD_TYPES.map(rt => <option key={rt.value} value={rt.value}>{zh ? rt.zh : rt.en}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '生效日期' : 'Effective Date'}</label>
                                        <input className="input-field" type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} />
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label className="detail-label">{zh ? '說明' : 'Description'}</label>
                                        <textarea className="input-field" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ resize: 'vertical' }} />
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
                                                    zh ? '類型' : 'Type',
                                                    zh ? '說明' : 'Description',
                                                    zh ? '核發人' : 'Issued By',
                                                    zh ? '生效日期' : 'Effective Date',
                                                    zh ? '操作' : 'Actions',
                                                ].map(h => (
                                                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map(r => {
                                                const tc = typeColor(r.type);
                                                return (
                                                    <tr key={r.id} style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{r.employee_name}</td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, background: tc.bg, color: tc.color }}>
                                                                {typeLabel(r.type)}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px 12px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description || '—'}</td>
                                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{r.issuer_name}</td>
                                                        <td style={{ padding: '10px 12px' }}>{r.effective_date || '—'}</td>
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
