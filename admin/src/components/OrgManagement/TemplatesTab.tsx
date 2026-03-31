import { useState } from 'react';
import type { ObTemplate } from '../../types/orgManagement';

interface TemplatesTabProps {
    zh: boolean;
    obTemplates: ObTemplate[];
    onCreateTemplate: (form: TmplFormData) => Promise<void>;
    onDeleteTemplate: (id: string) => Promise<void>;
}

interface TmplItem {
    title: string;
    description: string;
    assignee_role: string;
    due_days: string;
}

export interface TmplFormData {
    name: string;
    type: string;
    items: TmplItem[];
}

export function TemplatesTab({ zh, obTemplates, onCreateTemplate, onDeleteTemplate }: TemplatesTabProps) {
    const [showCreate, setShowCreate] = useState(false);
    const [tmplForm, setTmplForm] = useState<TmplFormData>({ name: '', type: 'onboarding', items: [] });
    const [newItem, setNewItem] = useState<TmplItem>({ title: '', description: '', assignee_role: 'hr', due_days: '' });

    async function handleCreate() {
        await onCreateTemplate(tmplForm);
        setTmplForm({ name: '', type: 'onboarding', items: [] });
        setShowCreate(false);
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>📋 {zh ? '到職 / 離職範本' : 'Onboarding / Offboarding Templates'}</h3>
                <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
                    {showCreate ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增範本' : 'New Template'}`}
                </button>
            </div>

            {showCreate && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', marginBottom: '12px' }}>
                        <input className="input-field" placeholder={zh ? '範本名稱' : 'Template name'} value={tmplForm.name} onChange={e => setTmplForm({ ...tmplForm, name: e.target.value })} />
                        <select className="input-field" value={tmplForm.type} onChange={e => setTmplForm({ ...tmplForm, type: e.target.value })}>
                            <option value="onboarding">{zh ? '到職' : 'Onboarding'}</option>
                            <option value="offboarding">{zh ? '離職' : 'Offboarding'}</option>
                        </select>
                    </div>
                    {tmplForm.items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', padding: '6px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, width: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>{i + 1}</span>
                            <span style={{ fontSize: '13px', flex: 1 }}>{item.title}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.assignee_role}</span>
                            {item.due_days && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>D+{item.due_days}</span>}
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f43f5e', fontSize: '14px' }}
                                onClick={() => setTmplForm({ ...tmplForm, items: tmplForm.items.filter((_, j) => j !== i) })}>✕</button>
                        </div>
                    ))}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', gap: '6px', marginTop: '8px' }}>
                        <input className="input-field" style={{ fontSize: '12px' }} placeholder={zh ? '項目名稱' : 'Item title'} value={newItem.title} onChange={e => setNewItem({ ...newItem, title: e.target.value })} />
                        <input className="input-field" style={{ fontSize: '12px' }} placeholder={zh ? '說明' : 'Description'} value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} />
                        <select className="input-field" style={{ fontSize: '12px', width: '90px' }} value={newItem.assignee_role} onChange={e => setNewItem({ ...newItem, assignee_role: e.target.value })}>
                            <option value="hr">HR</option>
                            <option value="manager">{zh ? '主管' : 'Manager'}</option>
                            <option value="employee">{zh ? '員工' : 'Employee'}</option>
                        </select>
                        <input className="input-field" style={{ fontSize: '12px', width: '60px' }} placeholder={zh ? '天數' : 'Days'} type="number" value={newItem.due_days} onChange={e => setNewItem({ ...newItem, due_days: e.target.value })} />
                        <button className="btn btn-sm btn-secondary" onClick={() => {
                            if (!newItem.title.trim()) return;
                            setTmplForm({ ...tmplForm, items: [...tmplForm.items, { ...newItem }] });
                            setNewItem({ title: '', description: '', assignee_role: 'hr', due_days: '' });
                        }}>+</button>
                    </div>
                    <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={handleCreate} disabled={!tmplForm.name.trim() || tmplForm.items.length === 0}>
                        {zh ? '建立範本' : 'Create Template'}
                    </button>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '12px' }}>
                {obTemplates.map(tmpl => (
                    <div key={tmpl.id} className="card" style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div>
                                <span style={{ fontWeight: 600, fontSize: '14px' }}>{tmpl.name}</span>
                                <span style={{ fontSize: '11px', marginLeft: '8px', padding: '1px 8px', borderRadius: '4px', background: tmpl.type === 'onboarding' ? '#22c55e22' : '#f59e0b22', color: tmpl.type === 'onboarding' ? '#22c55e' : '#f59e0b' }}>
                                    {tmpl.type === 'onboarding' ? (zh ? '到職' : 'Onboarding') : (zh ? '離職' : 'Offboarding')}
                                </span>
                            </div>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f43f5e' }} onClick={() => onDeleteTemplate(tmpl.id)}>🗑</button>
                        </div>
                        {(tmpl.items as any[]).map((item: any, i: number) => (
                            <div key={i} style={{ fontSize: '12px', padding: '4px 0', borderBottom: '1px solid var(--outline-variant)', display: 'flex', gap: '6px' }}>
                                <span style={{ color: 'var(--text-muted)', width: '20px' }}>{i + 1}.</span>
                                <span style={{ flex: 1 }}>{item.title}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{item.assignee_role}</span>
                                {item.due_days && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>D+{item.due_days}</span>}
                            </div>
                        ))}
                    </div>
                ))}
                {obTemplates.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                        {zh ? '尚無範本。建立範本後，新進員工會自動產生到職清單。' : 'No templates yet. Create a template and new hires will automatically get an onboarding checklist.'}
                    </div>
                )}
            </div>
        </div>
    );
}
