import { useState } from 'react';
import type { Company } from '../../types/orgManagement';

interface CompanyTabProps {
    zh: boolean;
    companies: Company[];
    onSave: (id?: string) => Promise<void>;
    companyForm: Partial<Company>;
    setCompanyForm: (form: Partial<Company>) => void;
}

export function CompanyTab({ zh, companies, onSave, companyForm, setCompanyForm }: CompanyTabProps) {
    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    function handleToggleCreate() {
        setShowCreate(!showCreate);
        setCompanyForm({});
        setEditingId(null);
    }

    function handleEdit(c: Company) {
        setEditingId(c.id);
        setCompanyForm(c);
        setShowCreate(true);
    }

    async function handleSave() {
        await onSave(editingId || undefined);
        setShowCreate(false);
        setEditingId(null);
        setCompanyForm({});
    }

    return (
        <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '13px' }}>🏛️ {zh ? '公司管理' : 'Company Management'}</span>
                <button className="btn btn-sm btn-primary" onClick={handleToggleCreate}>
                    {showCreate ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增' : 'Add'}`}
                </button>
            </div>
            {showCreate && (
                <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--outline-variant)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{zh ? '公司名稱' : 'Name'}</label>
                            <input className="input-field" value={companyForm.name || ''} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                            <select className="select" style={{ width: '100%' }} value={companyForm.status || 'active'} onChange={e => setCompanyForm({ ...companyForm, status: e.target.value })}>
                                <option value="active">{zh ? '啟用' : 'Active'}</option>
                                <option value="inactive">{zh ? '停用' : 'Inactive'}</option>
                            </select>
                        </div>
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={handleSave}>💾 {zh ? '儲存' : 'Save'}</button>
                </div>
            )}
            <div style={{ padding: '12px 16px' }}>
                {companies.length === 0
                    ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>{zh ? '尚無公司' : 'No companies yet'}</p>
                    : <table className="data-table">
                        <thead><tr><th>{zh ? '名稱' : 'Name'}</th><th>{zh ? '狀態' : 'Status'}</th><th></th></tr></thead>
                        <tbody>
                            {companies.map(c => (
                                <tr key={c.id}>
                                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                                    <td><span className={`status-badge ${c.status === 'active' ? 'completed' : 'cancelled'}`}>{c.status === 'active' ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}</span></td>
                                    <td><button className="btn btn-sm btn-secondary" onClick={() => handleEdit(c)}>✏️</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                }
            </div>
        </div>
    );
}
