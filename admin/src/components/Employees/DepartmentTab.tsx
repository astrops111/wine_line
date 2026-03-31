import { useState } from 'react';
import { t, getLocale } from '../../lib/i18n';
import { getColor, EMPTY_DEPT_FORM } from '../../lib/employeeHelpers';
import type { Employee, Department, LineGroup, Company, DeptForm } from '../../types/employees';

interface DepartmentTabProps {
    departments: Department[];
    employees: Employee[];
    companies: Company[];
    lineGroups: LineGroup[];
    showCreateDept: boolean;
    setShowCreateDept: (v: boolean) => void;
    createDepartment: (form: DeptForm) => Promise<void>;
    saveDepartment: (dept: Department, form: DeptForm) => Promise<void>;
    deleteDepartment: (id: string) => Promise<void>;
}

export function DepartmentTab({
    departments, employees, companies, lineGroups,
    showCreateDept, setShowCreateDept,
    createDepartment, saveDepartment, deleteDepartment,
}: DepartmentTabProps) {
    const zh = getLocale() === 'zh-TW';

    const [deptForm, setDeptForm] = useState<DeptForm>({ ...EMPTY_DEPT_FORM });
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [editDeptForm, setEditDeptForm] = useState<DeptForm>({ ...EMPTY_DEPT_FORM });

    const handleCreate = async () => {
        if (!deptForm.name.trim()) return;
        await createDepartment(deptForm);
        setDeptForm({ ...EMPTY_DEPT_FORM });
        setShowCreateDept(false);
    };

    const handleSave = async () => {
        if (!editingDept || !editDeptForm.name.trim()) return;
        await saveDepartment(editingDept, editDeptForm);
        setEditingDept(null);
    };

    return (
        <div>
            {/* Create form */}
            {showCreateDept && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>➕ {zh ? '新增部門' : 'New Department'}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{zh ? '部門名稱' : 'Name'} *</label>
                            <input className="input-field" value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} placeholder={zh ? '例如：銷售部' : 'e.g. Sales'} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '描述' : 'Description'}</label>
                            <input className="input-field" value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} placeholder={zh ? '選填' : 'Optional'} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '部門主管' : 'Manager'}</label>
                            <select className="input-field" value={deptForm.manager_user_id} onChange={e => setDeptForm({ ...deptForm, manager_user_id: e.target.value })}>
                                <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.is_manager ? ' ★' : ''}</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <label className="detail-label">💬 {zh ? '關聯 LINE 群組' : 'LINE Groups'}</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                            {deptForm.line_group_ids.map(gid => {
                                const g = lineGroups.find(lg => lg.id === gid);
                                return (
                                    <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '10px', padding: '2px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {g?.group_name || gid}
                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }} onClick={() => setDeptForm({ ...deptForm, line_group_ids: deptForm.line_group_ids.filter(id => id !== gid) })}>✕</button>
                                    </span>
                                );
                            })}
                        </div>
                        <select className="input-field" style={{ width: 'auto' }} value=""
                            onChange={e => { const v = e.target.value; if (v && !deptForm.line_group_ids.includes(v)) setDeptForm({ ...deptForm, line_group_ids: [...deptForm.line_group_ids, v] }); e.currentTarget.value = ''; }}>
                            <option value="">➕ {zh ? '新增群組…' : 'Add group…'}</option>
                            {lineGroups.filter(g => !deptForm.line_group_ids.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                        <button className="btn btn-primary" onClick={handleCreate}>{t('common.save')}</button>
                        <button className="btn btn-secondary" onClick={() => setShowCreateDept(false)}>{t('common.cancel')}</button>
                    </div>
                </div>
            )}

            {/* Department cards */}
            {departments.length === 0 ? (
                <div className="card">
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                        {zh ? '尚未建立任何部門。點擊「新增部門」開始。' : 'No departments yet. Click "New Department" to start.'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                    {departments.map(dept => {
                        const manager = employees.find(e => e.id === dept.manager_user_id);
                        const members = employees.filter(e => e.department_id === dept.id);
                        const isEditing = editingDept?.id === dept.id;
                        return (
                            <div key={dept.id} className="card">
                                {isEditing ? (
                                    <div>
                                        <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '部門名稱' : 'Name'}</label>
                                                <input className="input-field" value={editDeptForm.name} onChange={e => setEditDeptForm({ ...editDeptForm, name: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '描述' : 'Description'}</label>
                                                <input className="input-field" value={editDeptForm.description} onChange={e => setEditDeptForm({ ...editDeptForm, description: e.target.value })} placeholder={zh ? '選填' : 'Optional'} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '部門主管' : 'Manager'}</label>
                                                <select className="input-field" value={editDeptForm.manager_user_id} onChange={e => setEditDeptForm({ ...editDeptForm, manager_user_id: e.target.value })}>
                                                    <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.is_manager ? ' ★' : ''}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">💬 {zh ? '關聯 LINE 群組' : 'LINE Groups'}</label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                                    {editDeptForm.line_group_ids.map(gid => {
                                                        const g = lineGroups.find(lg => lg.id === gid);
                                                        return (
                                                            <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '10px', padding: '2px 7px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                {g?.group_name || gid}
                                                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }} onClick={() => setEditDeptForm({ ...editDeptForm, line_group_ids: editDeptForm.line_group_ids.filter(id => id !== gid) })}>✕</button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                <select className="input-field" style={{ width: 'auto' }} value=""
                                                    onChange={e => { const v = e.target.value; if (v && !editDeptForm.line_group_ids.includes(v)) setEditDeptForm({ ...editDeptForm, line_group_ids: [...editDeptForm.line_group_ids, v] }); e.currentTarget.value = ''; }}>
                                                    <option value="">➕ {zh ? '新增…' : 'Add…'}</option>
                                                    {lineGroups.filter(g => !editDeptForm.line_group_ids.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className="btn btn-primary btn-sm" onClick={handleSave}>{t('common.save')}</button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => setEditingDept(null)}>{t('common.cancel')}</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                            <div>
                                                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>🏢 {dept.name}</h3>
                                                {dept.description && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{dept.description}</p>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button className="btn btn-sm btn-secondary" onClick={() => { setEditingDept(dept); setEditDeptForm({ name: dept.name, description: dept.description || '', manager_user_id: dept.manager_user_id || '', company_id: dept.company_id || '', line_group_ids: dept.line_group_ids }); }}>✏️</button>
                                                <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => deleteDepartment(dept.id)}>🗑</button>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '56px', flexShrink: 0 }}>{zh ? '主管' : 'Manager'}</span>
                                                {manager
                                                    ? <span style={{ fontWeight: 500 }}>👤 {manager.name}{manager.is_manager ? <span style={{ color: 'var(--accent-yellow)', marginLeft: '4px' }}>★</span> : ''}</span>
                                                    : <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>—</span>
                                                }
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '56px', flexShrink: 0 }}>{zh ? '成員' : 'Members'}</span>
                                                <span style={{ background: 'var(--accent-primary-dim)', color: 'var(--accent-primary)', borderRadius: '8px', padding: '1px 8px', fontSize: '12px', fontWeight: 600 }}>
                                                    {members.length} {zh ? '人' : 'members'}
                                                </span>
                                            </div>
                                            {dept.line_group_ids.length > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '56px', flexShrink: 0, paddingTop: '2px' }}>LINE</span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {dept.line_group_ids.map(gid => {
                                                            const g = lineGroups.find(lg => lg.id === gid);
                                                            return <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '1px 7px', fontSize: '11px' }}>💬 {g?.group_name || gid}</span>;
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {members.length > 0 && (
                                                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '8px', marginTop: '2px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {members.map(e => (
                                                        <span key={e.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: getColor(e.name), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{e.name[0]}</span>
                                                            {e.name}
                                                            {e.is_manager && <span style={{ color: 'var(--accent-yellow)', fontSize: '10px' }}>★</span>}
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
            )}
        </div>
    );
}
