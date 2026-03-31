import { useState } from 'react';
import type { Department, Company, Employee, LineGroup } from '../../types/orgManagement';

interface DepartmentTabProps {
    zh: boolean;
    departments: Department[];
    companies: Company[];
    employees: Employee[];
    lineGroups: LineGroup[];
    onCreateDepartment: (form: DeptFormData) => Promise<void>;
    onSaveDepartment: (dept: Department, form: DeptFormData) => Promise<void>;
    onDeleteDepartment: (id: string) => Promise<void>;
}

export interface DeptFormData {
    name: string;
    description: string;
    manager_user_id: string;
    company_id: string;
    line_group_ids: string[];
}

export function DepartmentTab({
    zh, departments, companies, employees, lineGroups,
    onCreateDepartment, onSaveDepartment, onDeleteDepartment,
}: DepartmentTabProps) {
    const [showCreate, setShowCreate] = useState(false);
    const [deptForm, setDeptForm] = useState<DeptFormData>({ name: '', description: '', manager_user_id: '', company_id: '', line_group_ids: [] });
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [editDeptForm, setEditDeptForm] = useState<DeptFormData>({ name: '', description: '', manager_user_id: '', company_id: '', line_group_ids: [] });
    const [companyFilter, setCompanyFilter] = useState<string>('');

    const filteredDepts = companyFilter ? departments.filter(d => d.company_id === companyFilter) : departments;

    async function handleCreate() {
        await onCreateDepartment(deptForm);
        setDeptForm({ name: '', description: '', manager_user_id: '', company_id: '', line_group_ids: [] });
        setShowCreate(false);
    }

    async function handleSave() {
        if (!editingDept) return;
        await onSaveDepartment(editingDept, editDeptForm);
        setEditingDept(null);
    }

    function renderLineGroupPicker(form: DeptFormData, setForm: (f: DeptFormData) => void) {
        return (
            <div style={{ marginTop: '10px' }}>
                <label className="detail-label">💬 LINE {zh ? '群組' : 'Groups'}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                    {form.line_group_ids.map(gid => {
                        const g = lineGroups.find(lg => lg.id === gid);
                        return <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '10px', padding: '2px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {g?.group_name}<button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }} onClick={() => setForm({ ...form, line_group_ids: form.line_group_ids.filter(i => i !== gid) })}>✕</button>
                        </span>;
                    })}
                </div>
                <select className="input-field" style={{ width: 'auto' }} value="" onChange={e => { const v = e.target.value; if (v && !form.line_group_ids.includes(v)) setForm({ ...form, line_group_ids: [...form.line_group_ids, v] }); e.currentTarget.value = ''; }}>
                    <option value="">➕ {zh ? '新增群組…' : 'Add group…'}</option>
                    {lineGroups.filter(g => !form.line_group_ids.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                </select>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select className="input-field" style={{ maxWidth: '200px' }} value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
                        <option value="">{zh ? '全部公司' : 'All Companies'}</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{filteredDepts.length} {zh ? '個部門' : 'departments'}</span>
                </div>
                <button className="btn btn-primary" onClick={() => { setDeptForm({ name: '', description: '', manager_user_id: '', company_id: companyFilter, line_group_ids: [] }); setShowCreate(true); }}>➕ {zh ? '新增部門' : 'New Department'}</button>
            </div>

            {showCreate && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>➕ {zh ? '新增部門' : 'New Department'}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{zh ? '名稱' : 'Name'} *</label>
                            <input className="input-field" value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} placeholder={zh ? '例如：銷售部' : 'e.g. Sales'} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '所屬公司' : 'Company'}</label>
                            <select className="input-field" value={deptForm.company_id} onChange={e => setDeptForm({ ...deptForm, company_id: e.target.value })}>
                                <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '描述' : 'Description'}</label>
                            <input className="input-field" value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '主管' : 'Manager'}</label>
                            <select className="input-field" value={deptForm.manager_user_id} onChange={e => setDeptForm({ ...deptForm, manager_user_id: e.target.value })}>
                                <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                {employees.filter(e => e.is_manager).map(e => <option key={e.id} value={e.id}>{e.name} ★</option>)}
                                {employees.filter(e => !e.is_manager).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                    </div>
                    {renderLineGroupPicker(deptForm, setDeptForm)}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button className="btn btn-primary" onClick={handleCreate}>{zh ? '儲存' : 'Save'}</button>
                        <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>{zh ? '取消' : 'Cancel'}</button>
                    </div>
                </div>
            )}

            {filteredDepts.length === 0
                ? <div className="card"><p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>{zh ? '尚未建立部門' : 'No departments yet'}</p></div>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                    {filteredDepts.map(dept => {
                        const manager = employees.find(e => e.id === dept.manager_user_id);
                        const members = employees.filter(e => e.department_id === dept.id);
                        const isEditing = editingDept?.id === dept.id;
                        return (
                            <div key={dept.id} className="card">
                                {isEditing ? (
                                    <div style={{ display: 'grid', gap: '10px' }}>
                                        <div><label className="detail-label">{zh ? '名稱' : 'Name'}</label><input className="input-field" value={editDeptForm.name} onChange={e => setEditDeptForm({ ...editDeptForm, name: e.target.value })} /></div>
                                        <div>
                                            <label className="detail-label">{zh ? '所屬公司' : 'Company'}</label>
                                            <select className="input-field" value={editDeptForm.company_id} onChange={e => setEditDeptForm({ ...editDeptForm, company_id: e.target.value })}>
                                                <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            </select>
                                        </div>
                                        <div><label className="detail-label">{zh ? '描述' : 'Description'}</label><input className="input-field" value={editDeptForm.description} onChange={e => setEditDeptForm({ ...editDeptForm, description: e.target.value })} /></div>
                                        <div>
                                            <label className="detail-label">{zh ? '主管' : 'Manager'}</label>
                                            <select className="input-field" value={editDeptForm.manager_user_id} onChange={e => setEditDeptForm({ ...editDeptForm, manager_user_id: e.target.value })}>
                                                <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.is_manager ? ' ★' : ''}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="detail-label">💬 LINE</label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '5px' }}>
                                                {editDeptForm.line_group_ids.map(gid => {
                                                    const g = lineGroups.find(lg => lg.id === gid);
                                                    return <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '10px', padding: '2px 7px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                        {g?.group_name}<button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }} onClick={() => setEditDeptForm({ ...editDeptForm, line_group_ids: editDeptForm.line_group_ids.filter(i => i !== gid) })}>✕</button>
                                                    </span>;
                                                })}
                                            </div>
                                            <select className="input-field" style={{ width: 'auto' }} value="" onChange={e => { const v = e.target.value; if (v && !editDeptForm.line_group_ids.includes(v)) setEditDeptForm({ ...editDeptForm, line_group_ids: [...editDeptForm.line_group_ids, v] }); e.currentTarget.value = ''; }}>
                                                <option value="">➕</option>
                                                {lineGroups.filter(g => !editDeptForm.line_group_ids.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className="btn btn-primary btn-sm" onClick={handleSave}>{zh ? '儲存' : 'Save'}</button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => setEditingDept(null)}>{zh ? '取消' : 'Cancel'}</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>🗂 {dept.name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>🏢 {companies.find(c => c.id === dept.company_id)?.name || (zh ? '未指定公司' : 'No company')}</div>
                                                {dept.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{dept.description}</div>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button className="btn btn-sm btn-secondary" onClick={() => { setEditingDept(dept); setEditDeptForm({ name: dept.name, description: dept.description || '', manager_user_id: dept.manager_user_id || '', company_id: dept.company_id || '', line_group_ids: dept.line_group_ids }); }}>✏️</button>
                                                <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => onDeleteDepartment(dept.id)}>🗑</button>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '52px' }}>{zh ? '主管' : 'Manager'}</span>
                                                {manager ? <span>👤 {manager.name}{manager.is_manager ? ' ★' : ''}</span> : <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>—</span>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '52px' }}>{zh ? '成員' : 'Members'}</span>
                                                <span style={{ background: 'var(--accent-primary-dim)', color: 'var(--accent-primary)', borderRadius: '8px', padding: '1px 8px', fontSize: '12px', fontWeight: 600 }}>{members.length}</span>
                                            </div>
                                            {dept.line_group_ids.length > 0 && (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '52px', paddingTop: '2px' }}>LINE</span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {dept.line_group_ids.map(gid => {
                                                            const g = lineGroups.find(lg => lg.id === gid);
                                                            return <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '1px 7px', fontSize: '11px' }}>💬 {g?.group_name || gid}</span>;
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {members.length > 0 && (
                                                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '7px', marginTop: '2px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {members.map(e => (
                                                        <span key={e.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)', borderRadius: '12px', padding: '2px 8px', fontSize: '11px' }}>
                                                            {e.name}{e.is_manager ? ' ★' : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            }
        </div>
    );
}
