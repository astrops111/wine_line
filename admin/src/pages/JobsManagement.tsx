import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface JobPosition {
    id: string;
    title: string;
    job_grade: string | null;
    is_supervisory: boolean;
    is_active: boolean;
    required_count: number;
    current_count: number;
    shortage: number;
    position_allowance: number;
    department_id: string | null;
    company_id: string | null;
    description: string | null;
    created_at: string;
    department_name?: string;
    company_name?: string;
}

interface Department { id: string; name: string; company_id: string | null; }
interface Company { id: string; name: string; }

export function JobsManagement() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [jobs, setJobs] = useState<JobPosition[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'active' | 'inactive'>('active');

    // Form
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({
        title: '', job_grade: '', is_supervisory: false, is_active: true,
        required_count: '0', current_count: '0', shortage: '0',
        position_allowance: '0', department_id: '', company_id: '', description: '',
    });

    // Filter
    const [filterSupervisory, setFilterSupervisory] = useState('');
    const [filterCompany, setFilterCompany] = useState('');

    useEffect(() => { if (orgId) loadAll(); }, [orgId]);

    async function loadAll() {
        setLoading(true);
        const [jobRes, deptRes, compRes] = await Promise.all([
            supabase.from('job_positions')
                .select('*, department:departments(name), company:companies(name)')
                .eq('organization_id', orgId)
                .order('is_active', { ascending: false })
                .order('title'),
            supabase.from('departments')
                .select('id, name, company_id')
                .eq('organization_id', orgId)
                .order('name'),
            supabase.from('companies')
                .select('id, name')
                .eq('organization_id', orgId)
                .order('name'),
        ]);
        setJobs((jobRes.data || []).map((j: any) => ({
            ...j,
            department_name: j.department?.name || null,
            company_name: j.company?.name || null,
        })));
        setDepartments(deptRes.data || []);
        setCompanies(compRes.data || []);
        setLoading(false);
    }

    function resetForm() {
        setForm({
            title: '', job_grade: '', is_supervisory: false, is_active: true,
            required_count: '0', current_count: '0', shortage: '0',
            position_allowance: '0', department_id: '', company_id: '', description: '',
        });
        setEditId(null);
    }

    function startEdit(j: JobPosition) {
        setEditId(j.id);
        setForm({
            title: j.title,
            job_grade: j.job_grade || '',
            is_supervisory: j.is_supervisory,
            is_active: j.is_active,
            required_count: String(j.required_count),
            current_count: String(j.current_count),
            shortage: String(j.shortage),
            position_allowance: String(j.position_allowance),
            department_id: j.department_id || '',
            company_id: j.company_id || '',
            description: j.description || '',
        });
        setShowForm(true);
    }

    async function saveJob() {
        if (!form.title.trim()) return;
        const payload = {
            organization_id: orgId,
            title: form.title.trim(),
            job_grade: form.job_grade.trim() || null,
            is_supervisory: form.is_supervisory,
            is_active: form.is_active,
            required_count: parseInt(form.required_count) || 0,
            current_count: parseInt(form.current_count) || 0,
            shortage: parseInt(form.shortage) || 0,
            position_allowance: parseFloat(form.position_allowance) || 0,
            department_id: form.department_id || null,
            company_id: form.company_id || null,
            description: form.description.trim() || null,
        };
        if (editId) {
            await supabase.from('job_positions').update(payload).eq('id', editId);
        } else {
            await supabase.from('job_positions').insert(payload);
        }
        resetForm();
        setShowForm(false);
        await loadAll();
    }

    async function toggleActive(j: JobPosition) {
        await supabase.from('job_positions').update({ is_active: !j.is_active }).eq('id', j.id);
        await loadAll();
    }

    async function deleteJob(id: string) {
        if (!confirm(zh ? '確定刪除此職務？' : 'Delete this position?')) return;
        await supabase.from('job_positions').delete().eq('id', id);
        await loadAll();
    }

    const tabJobs = jobs.filter(j => tab === 'active' ? j.is_active : !j.is_active);
    const filtered = tabJobs.filter(j => {
        if (filterSupervisory === 'yes' && !j.is_supervisory) return false;
        if (filterSupervisory === 'no' && j.is_supervisory) return false;
        if (filterCompany && j.company_id !== filterCompany) return false;
        return true;
    });

    const activeJobs = jobs.filter(j => j.is_active);
    const totalRequired = activeJobs.reduce((s, j) => s + j.required_count, 0);
    const totalCurrent = activeJobs.reduce((s, j) => s + j.current_count, 0);
    const totalShortage = activeJobs.reduce((s, j) => s + j.shortage, 0);

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>💼 {zh ? '職務管理' : 'Jobs Management'}</h2>
                <p>{zh ? '管理組織職務編制、人力需求與配置' : 'Manage organizational job positions, headcount and staffing'}</p>
            </div>

            <div className="page-body">
                {loading ? <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p> : (
                    <>
                        {/* Summary Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>{activeJobs.length}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '啟用職務' : 'Active Roles'}</div>
                            </div>
                            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)' }}>{totalRequired}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '需求人數' : 'Required'}</div>
                            </div>
                            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e' }}>{totalCurrent}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '現有人數' : 'Current'}</div>
                            </div>
                            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: 700, color: totalShortage > 0 ? '#ef4444' : '#22c55e' }}>{totalShortage}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '不足人數' : 'Shortage'}</div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
                            {(['active', 'inactive'] as const).map(t => (
                                <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`}
                                    onClick={() => { setTab(t); setFilterSupervisory(''); }}>
                                    {t === 'active'
                                        ? `${zh ? '啟用職務' : 'Active'} (${jobs.filter(j => j.is_active).length})`
                                        : `${zh ? '停用職務' : 'Inactive'} (${jobs.filter(j => !j.is_active).length})`
                                    }
                                </button>
                            ))}
                        </div>

                        {/* Toolbar */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select className="input-field" style={{ maxWidth: '180px' }} value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
                                <option value="">{zh ? '全部公司' : 'All Companies'}</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <select className="input-field" style={{ maxWidth: '160px' }} value={filterSupervisory} onChange={e => setFilterSupervisory(e.target.value)}>
                                <option value="">{zh ? '全部職務' : 'All Positions'}</option>
                                <option value="yes">{zh ? '主管職' : 'Supervisory'}</option>
                                <option value="no">{zh ? '非主管職' : 'Non-supervisory'}</option>
                            </select>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{filtered.length} {zh ? '筆職務' : 'positions'}</span>
                            <div style={{ marginLeft: 'auto' }}>
                                <button className="btn btn-primary" onClick={() => { resetForm(); setForm(f => ({ ...f, is_active: tab === 'active' })); setShowForm(true); }}>
                                    + {zh ? '新增職務' : 'Add Position'}
                                </button>
                            </div>
                        </div>

                        {/* Form */}
                        {showForm && (
                            <div className="card" style={{ marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                                    {editId ? (zh ? '編輯職務' : 'Edit Position') : (zh ? '新增職務' : 'New Position')}
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '職務名稱' : 'Title'} *</label>
                                        <input className="input-field" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '職等' : 'Grade'}</label>
                                        <input className="input-field" value={form.job_grade} onChange={e => setForm({ ...form, job_grade: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '主管職' : 'Supervisory'}</label>
                                        <select className="input-field" value={form.is_supervisory ? 'yes' : 'no'} onChange={e => setForm({ ...form, is_supervisory: e.target.value === 'yes' })}>
                                            <option value="no">{zh ? '否' : 'No'}</option>
                                            <option value="yes">{zh ? '是' : 'Yes'}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                                        <select className="input-field" value={form.is_active ? 'active' : 'inactive'} onChange={e => setForm({ ...form, is_active: e.target.value === 'active' })}>
                                            <option value="active">{zh ? '啟用' : 'Active'}</option>
                                            <option value="inactive">{zh ? '停用' : 'Inactive'}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '需求人數' : 'Required'}</label>
                                        <input className="input-field" type="number" min="0" value={form.required_count} onChange={e => setForm({ ...form, required_count: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '現有人數' : 'Current'}</label>
                                        <input className="input-field" type="number" min="0" value={form.current_count} onChange={e => setForm({ ...form, current_count: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '不足人數' : 'Shortage'}</label>
                                        <input className="input-field" type="number" min="0" value={form.shortage} onChange={e => setForm({ ...form, shortage: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '加給金額' : 'Allowance'}</label>
                                        <input className="input-field" type="number" min="0" value={form.position_allowance} onChange={e => setForm({ ...form, position_allowance: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '所屬公司' : 'Company'}</label>
                                        <select className="input-field" value={form.company_id} onChange={e => {
                                            const newCid = e.target.value;
                                            const deptOk = departments.find(d => d.id === form.department_id && d.company_id === newCid);
                                            setForm({ ...form, company_id: newCid, department_id: deptOk ? form.department_id : '' });
                                        }}>
                                            <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    {departments.length > 0 && (
                                        <div>
                                            <label className="detail-label">{zh ? '所屬部門' : 'Department'}</label>
                                            <select className="input-field" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                                                <option value="">{zh ? '無' : 'None'}</option>
                                                {(form.company_id ? departments.filter(d => d.company_id === form.company_id) : departments).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <label className="detail-label">{zh ? '說明' : 'Description'}</label>
                                        <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ resize: 'vertical' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                    <button className="btn btn-primary" onClick={saveJob}>{zh ? '儲存' : 'Save'}</button>
                                    <button className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>{zh ? '取消' : 'Cancel'}</button>
                                </div>
                            </div>
                        )}

                        {/* Table */}
                        {filtered.length === 0 ? (
                            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                {zh ? '尚無職務資料' : 'No positions yet'}
                            </div>
                        ) : (
                            <div className="card" style={{ overflow: 'hidden' }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                                                {[
                                                    zh ? '職務名稱' : 'Title',
                                                    zh ? '所屬公司' : 'Company',
                                                    zh ? '職等' : 'Grade',
                                                    zh ? '主管職' : 'Supervisory',
                                                    zh ? '需求人數' : 'Required',
                                                    zh ? '現有人數' : 'Current',
                                                    zh ? '不足人數' : 'Shortage',
                                                    zh ? '加給金額' : 'Allowance',
                                                    zh ? '操作' : 'Actions',
                                                ].map(h => (
                                                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: '12px', whiteSpace: 'nowrap' }}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map(j => (
                                                <tr key={j.id} style={{ borderBottom: '1px solid var(--outline-variant)', opacity: j.is_active ? 1 : 0.6 }}>
                                                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{j.title}</td>
                                                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>{j.company_name || '—'}</td>
                                                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{j.job_grade || '—'}</td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <span style={{
                                                            fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                                                            background: j.is_supervisory ? 'rgba(99,102,241,0.15)' : 'rgba(156,163,175,0.15)',
                                                            color: j.is_supervisory ? '#6366f1' : '#9ca3af',
                                                        }}>
                                                            {j.is_supervisory ? (zh ? '是' : 'Yes') : (zh ? '否' : 'No')}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{j.required_count}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>{j.current_count}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        {j.shortage > 0 ? (
                                                            <span style={{ color: '#ef4444', fontWeight: 600 }}>{j.shortage}</span>
                                                        ) : (
                                                            <span style={{ color: '#22c55e' }}>0</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                        ${j.position_allowance.toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => startEdit(j)} title={zh ? '編輯' : 'Edit'}>✏️</button>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(j)}
                                                                title={j.is_active ? (zh ? '停用' : 'Deactivate') : (zh ? '啟用' : 'Activate')}>
                                                                {j.is_active ? '⏸️' : '▶️'}
                                                            </button>
                                                            <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => deleteJob(j.id)} title={zh ? '刪除' : 'Delete'}>✕</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
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
