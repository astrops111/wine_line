import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface TemplateItem { title: string; description: string; assignee_role: string; due_days: number; }
interface Template { id: string; name: string; type: string; items: TemplateItem[]; created_at: string; }
interface OnboardingTask {
    id: string; user_id: string; template_id: string | null; type: string;
    title: string; description: string | null; assignee_id: string | null;
    due_date: string | null; status: string; completed_at: string | null;
    sort_order: number; created_at: string;
    user_name?: string;
    assignee_name?: string;
}
interface Employee { id: string; name: string; }

export function Onboarding() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [tab, setTab] = useState<'templates' | 'onboarding' | 'offboarding'>('templates');
    const [templates, setTemplates] = useState<Template[]>([]);
    const [tasks, setTasks] = useState<OnboardingTask[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);

    // Template form
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formType, setFormType] = useState<'onboarding' | 'offboarding'>('onboarding');
    const [formItems, setFormItems] = useState<TemplateItem[]>([]);

    // Start onboarding modal
    const [showStart, setShowStart] = useState(false);
    const [startEmployeeId, setStartEmployeeId] = useState('');
    const [startTemplateId, setStartTemplateId] = useState('');

    useEffect(() => { if (orgId) loadAll(); }, [orgId, tab]);

    async function loadAll() {
        setLoading(true);
        const [tmplRes, taskRes, empRes] = await Promise.all([
            supabase.from('onboarding_templates').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
            supabase.from('onboarding_tasks')
                .select('*, user:users!onboarding_tasks_user_id_fkey(name), assignee:users!onboarding_tasks_assignee_id_fkey(name)')
                .eq('organization_id', orgId)
                .eq('type', tab === 'templates' ? 'onboarding' : tab)
                .order('sort_order'),
            supabase.from('users').select('id, name').eq('organization_id', orgId).eq('status', 'active'),
        ]);
        setTemplates((tmplRes.data || []) as Template[]);
        setTasks((taskRes.data || []).map((t: any) => ({
            ...t,
            user_name: t.user?.name || '—',
            assignee_name: t.assignee?.name || '—',
        })));
        setEmployees(empRes.data || []);
        setLoading(false);
    }

    // ── Template CRUD ──
    function openNewTemplate() {
        setEditId(null);
        setFormName('');
        setFormType('onboarding');
        setFormItems([{ title: '', description: '', assignee_role: 'hr', due_days: 1 }]);
        setShowForm(true);
    }

    function openEditTemplate(t: Template) {
        setEditId(t.id);
        setFormName(t.name);
        setFormType(t.type as 'onboarding' | 'offboarding');
        setFormItems(t.items.length > 0 ? t.items : [{ title: '', description: '', assignee_role: 'hr', due_days: 1 }]);
        setShowForm(true);
    }

    async function saveTemplate() {
        if (!formName.trim()) return;
        const cleanItems = formItems.filter(i => i.title.trim());
        const payload = { organization_id: orgId, name: formName.trim(), type: formType, items: cleanItems };
        if (editId) {
            await supabase.from('onboarding_templates').update(payload).eq('id', editId);
        } else {
            await supabase.from('onboarding_templates').insert(payload);
        }
        setShowForm(false);
        await loadAll();
    }

    async function deleteTemplate(id: string) {
        if (!confirm(zh ? '確定刪除此範本？' : 'Delete this template?')) return;
        await supabase.from('onboarding_templates').delete().eq('id', id);
        await loadAll();
    }

    function addItem() {
        setFormItems([...formItems, { title: '', description: '', assignee_role: 'hr', due_days: 1 }]);
    }

    function updateItem(idx: number, field: keyof TemplateItem, value: string | number) {
        setFormItems(formItems.map((item, i) => i === idx ? { ...item, [field]: value } : item));
    }

    function removeItem(idx: number) {
        setFormItems(formItems.filter((_, i) => i !== idx));
    }

    // ── Start Onboarding ──
    async function startOnboarding() {
        if (!startEmployeeId || !startTemplateId) return;
        const tmpl = templates.find(t => t.id === startTemplateId);
        if (!tmpl) return;
        const today = new Date();
        const tasksToInsert = tmpl.items.map((item, idx) => {
            const due = new Date(today);
            due.setDate(due.getDate() + item.due_days);
            return {
                organization_id: orgId,
                user_id: startEmployeeId,
                template_id: tmpl.id,
                type: tmpl.type,
                title: item.title,
                description: item.description || null,
                assignee_id: null,
                due_date: due.toISOString().slice(0, 10),
                status: 'pending',
                sort_order: idx,
            };
        });
        await supabase.from('onboarding_tasks').insert(tasksToInsert);
        setShowStart(false);
        setStartEmployeeId('');
        setStartTemplateId('');
        await loadAll();
    }

    // ── Toggle task status ──
    async function toggleTask(task: OnboardingTask) {
        const newStatus = task.status === 'completed' ? 'pending' : 'completed';
        await supabase.from('onboarding_tasks').update({
            status: newStatus,
            completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        }).eq('id', task.id);
        await loadAll();
    }

    async function deleteTask(id: string) {
        await supabase.from('onboarding_tasks').delete().eq('id', id);
        await loadAll();
    }

    // Group tasks by user
    const tasksByUser: Record<string, OnboardingTask[]> = {};
    tasks.forEach(t => {
        if (tab !== 'templates') {
            const key = t.user_id;
            tasksByUser[key] = tasksByUser[key] || [];
            tasksByUser[key].push(t);
        }
    });

    const tabDefs = [
        { key: 'templates' as const, icon: '📄', label: zh ? '範本管理' : 'Templates' },
        { key: 'onboarding' as const, icon: '🟢', label: zh ? '到職流程' : 'Onboarding' },
        { key: 'offboarding' as const, icon: '🔴', label: zh ? '離職流程' : 'Offboarding' },
    ];

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>📋 {zh ? '到職離職管理' : 'Onboarding / Offboarding'}</h2>
                <p>{zh ? '管理到職離職範本與追蹤進度' : 'Manage onboarding/offboarding templates and track progress'}</p>
            </div>

            <div className="page-body">
                <div className="tab-bar" style={{ marginBottom: '20px' }}>
                    {tabDefs.map(td => (
                        <button key={td.key} className={`tab-item ${tab === td.key ? 'active' : ''}`} onClick={() => setTab(td.key)}>
                            {td.icon} {td.label}
                        </button>
                    ))}
                </div>

                {loading ? <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p> : (
                    <>
                        {/* ═══ TEMPLATES TAB ═══ */}
                        {tab === 'templates' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                                    <button className="btn btn-primary" onClick={openNewTemplate}>+ {zh ? '新增範本' : 'New Template'}</button>
                                </div>

                                {showForm && (
                                    <div className="card" style={{ marginBottom: '20px' }}>
                                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                                            {editId ? (zh ? '編輯範本' : 'Edit Template') : (zh ? '新增範本' : 'New Template')}
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '範本名稱' : 'Template Name'} *</label>
                                                <input className="input-field" value={formName} onChange={e => setFormName(e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '類型' : 'Type'}</label>
                                                <select className="input-field" value={formType} onChange={e => setFormType(e.target.value as any)}>
                                                    <option value="onboarding">{zh ? '到職' : 'Onboarding'}</option>
                                                    <option value="offboarding">{zh ? '離職' : 'Offboarding'}</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>{zh ? '項目清單' : 'Checklist Items'}</div>
                                        {formItems.map((item, idx) => (
                                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px 40px', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                                                <input className="input-field" placeholder={zh ? '項目名稱' : 'Title'} value={item.title} onChange={e => updateItem(idx, 'title', e.target.value)} />
                                                <input className="input-field" placeholder={zh ? '說明' : 'Description'} value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                                                <select className="input-field" value={item.assignee_role} onChange={e => updateItem(idx, 'assignee_role', e.target.value)}>
                                                    <option value="hr">HR</option>
                                                    <option value="manager">{zh ? '主管' : 'Manager'}</option>
                                                    <option value="it">IT</option>
                                                    <option value="employee">{zh ? '員工' : 'Employee'}</option>
                                                </select>
                                                <input className="input-field" type="number" min={0} value={item.due_days} onChange={e => updateItem(idx, 'due_days', Number(e.target.value))} title={zh ? '到期天數' : 'Due days'} />
                                                <button className="btn btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => removeItem(idx)}>✕</button>
                                            </div>
                                        ))}
                                        <button className="btn btn-sm btn-secondary" onClick={addItem} style={{ marginTop: '8px' }}>+ {zh ? '新增項目' : 'Add Item'}</button>

                                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                            <button className="btn btn-primary" onClick={saveTemplate}>{zh ? '儲存' : 'Save'}</button>
                                            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>{zh ? '取消' : 'Cancel'}</button>
                                        </div>
                                    </div>
                                )}

                                {templates.length === 0 ? (
                                    <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        {zh ? '尚無範本' : 'No templates yet'}
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '12px' }}>
                                        {templates.map(t => (
                                            <div key={t.id} className="card" style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{t.name}</span>
                                                        <span style={{
                                                            marginLeft: '8px', fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                                                            background: t.type === 'onboarding' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                                            color: t.type === 'onboarding' ? '#22c55e' : '#ef4444',
                                                        }}>
                                                            {t.type === 'onboarding' ? (zh ? '到職' : 'Onboarding') : (zh ? '離職' : 'Offboarding')}
                                                        </span>
                                                        <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                            {t.items.length} {zh ? '個項目' : 'items'}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => openEditTemplate(t)}>✏️</button>
                                                        <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => deleteTemplate(t.id)}>✕</button>
                                                    </div>
                                                </div>
                                                {t.items.length > 0 && (
                                                    <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                        {t.items.map((item, idx) => (
                                                            <span key={idx} style={{ marginRight: '12px' }}>{idx + 1}. {item.title}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ═══ ONBOARDING / OFFBOARDING TAB ═══ */}
                        {(tab === 'onboarding' || tab === 'offboarding') && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', gap: '8px' }}>
                                    <button className="btn btn-primary" onClick={() => setShowStart(true)}>
                                        + {zh ? '開始流程' : 'Start Process'}
                                    </button>
                                </div>

                                {showStart && (
                                    <div className="card" style={{ marginBottom: '20px' }}>
                                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                                            {zh ? '為員工啟動流程' : 'Start Process for Employee'}
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '員工' : 'Employee'}</label>
                                                <select className="input-field" value={startEmployeeId} onChange={e => setStartEmployeeId(e.target.value)}>
                                                    <option value="">{zh ? '-- 選擇員工 --' : '-- Select Employee --'}</option>
                                                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '範本' : 'Template'}</label>
                                                <select className="input-field" value={startTemplateId} onChange={e => setStartTemplateId(e.target.value)}>
                                                    <option value="">{zh ? '-- 選擇範本 --' : '-- Select Template --'}</option>
                                                    {templates.filter(t => t.type === tab).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="btn btn-primary" onClick={startOnboarding}>{zh ? '啟動' : 'Start'}</button>
                                            <button className="btn btn-secondary" onClick={() => setShowStart(false)}>{zh ? '取消' : 'Cancel'}</button>
                                        </div>
                                    </div>
                                )}

                                {Object.keys(tasksByUser).length === 0 ? (
                                    <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        {zh ? '尚無進行中的流程' : 'No active processes'}
                                    </div>
                                ) : (
                                    Object.entries(tasksByUser).map(([userId, userTasks]) => {
                                        const completed = userTasks.filter(t => t.status === 'completed').length;
                                        const total = userTasks.length;
                                        const pct = total > 0 ? Math.round(completed / total * 100) : 0;
                                        return (
                                            <div key={userId} className="card" style={{ marginBottom: '16px', padding: '16px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <div>
                                                        <span style={{ fontWeight: 600, fontSize: '14px' }}>👤 {userTasks[0].user_name}</span>
                                                        <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                            {completed}/{total} ({pct}%)
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ height: '4px', background: 'var(--bg-primary)', borderRadius: '2px', marginBottom: '12px' }}>
                                                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#3b82f6', borderRadius: '2px', transition: 'width 0.4s' }} />
                                                </div>
                                                {userTasks.map(task => (
                                                    <div key={task.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px',
                                                        background: task.status === 'completed' ? 'rgba(34,197,94,0.05)' : 'transparent',
                                                        borderRadius: '6px', marginBottom: '4px',
                                                    }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={task.status === 'completed'}
                                                            onChange={() => toggleTask(task)}
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                        <span style={{
                                                            flex: 1, fontSize: '13px',
                                                            textDecoration: task.status === 'completed' ? 'line-through' : 'none',
                                                            color: task.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)',
                                                        }}>
                                                            {task.title}
                                                        </span>
                                                        {task.due_date && (
                                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                                {zh ? '到期' : 'Due'}: {task.due_date}
                                                            </span>
                                                        )}
                                                        <button className="btn btn-sm" style={{ color: 'var(--accent-red)', fontSize: '11px' }} onClick={() => deleteTask(task.id)}>✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
