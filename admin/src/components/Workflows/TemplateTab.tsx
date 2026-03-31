import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { t, getLocale } from '../../lib/i18n';
import { useOrg } from '../../lib/OrgContext';
import { writeAuditLog } from '../../lib/auditLog';
import { WorkflowModifyAIChat, type WorkflowAction } from '../WorkflowModifyAIChat';
import { getStatusLabels } from '../../lib/workflowHelpers';
import type {
    Workflow, WorkflowStep, Employee, LineGroup, Store, EditStepState,
} from '../../types/workflows';

interface TemplateTabProps {
    templates: Workflow[];
    employees: Employee[];
    lineGroups: LineGroup[];
    stores: Store[];
    selectedTemplate: Workflow | null;
    setSelectedTemplate: React.Dispatch<React.SetStateAction<Workflow | null>>;
    loadTemplates: () => Promise<void>;
    loadInstances: () => Promise<void>;
    setTab: (tab: 'templates' | 'active' | 'ai' | 'archive') => void;
    setShowStartModal: React.Dispatch<React.SetStateAction<Workflow | null>>;
    setInstanceName: React.Dispatch<React.SetStateAction<string>>;
    setSelectedStoreId: React.Dispatch<React.SetStateAction<string>>;
    setShowAddStore: React.Dispatch<React.SetStateAction<boolean>>;
    withConfirm: (msg: string, action: () => void) => void;
}

export function TemplateTab({
    templates, employees, lineGroups, stores,
    selectedTemplate, setSelectedTemplate,
    loadTemplates, loadInstances,
    setTab, setShowStartModal, setInstanceName, setSelectedStoreId, setShowAddStore,
    withConfirm,
}: TemplateTabProps) {
    const zh = getLocale() === 'zh-TW';
    const { orgId, currentUser } = useOrg();
    const statusLabel = getStatusLabels(zh);

    // Local state for template creation
    const [showCreateTemplate, setShowCreateTemplate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [templateNameError, setTemplateNameError] = useState('');
    const [templateSearch, setTemplateSearch] = useState('');

    // Local state for template editing
    const [editingTemplate, setEditingTemplate] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editAssignedUser, setEditAssignedUser] = useState('');
    const [editAssignedGroups, setEditAssignedGroups] = useState<string[]>([]);
    const [showModifyAI, setShowModifyAI] = useState(false);

    // Step editing
    const [newStepName, setNewStepName] = useState('');
    const [editingStepId, setEditingStepId] = useState<string | null>(null);
    const [editStep, setEditStep] = useState<EditStepState>({
        name: '', description: '', step_type: 'task', estimated_minutes: '',
        suggested_role: '', name_en: '', default_assignee_id: '', triggers: [],
        default_priority: 'medium', default_store_id: '', requires_confirmation: false,
        confirmation_approver_ids: [], completion_notify_ids: [],
    });

    const filteredTemplates = templates.filter(wf => {
        if (!templateSearch.trim()) return true;
        const q = templateSearch.toLowerCase();
        return wf.name.toLowerCase().includes(q) || (wf.description || '').toLowerCase().includes(q);
    });

    // --- Template CRUD ---
    async function createTemplate() {
        if (!newName.trim()) { setTemplateNameError(zh ? '範本名稱為必填欄位' : 'Template name is required'); return; }
        const { data } = await supabase.from('workflows').insert({
            organization_id: orgId,
            name: newName.trim(),
            description: newDesc.trim() || null,
            status: 'draft',
        }).select().single();
        if (data) {
            setShowCreateTemplate(false);
            setNewName('');
            setNewDesc('');
            setTemplateNameError('');
            await loadTemplates();
            setSelectedTemplate({ ...data, steps: [] });
        }
    }

    async function activateTemplate(wfId: string) {
        await supabase.from('workflows').update({ status: 'active' }).eq('id', wfId);
        await loadTemplates();
        if (selectedTemplate?.id === wfId) setSelectedTemplate(p => p ? { ...p, status: 'active' } : null);
    }

    function deleteTemplate(wf: Workflow) {
        withConfirm(
            zh ? `確定刪除範本「${wf.name}」？此操作將同時刪除所有關聯的流程實例及任務，無法復原。`
               : `Delete template "${wf.name}"? All related instances and tasks will also be deleted. This cannot be undone.`,
            async () => {
                try {
                    const { data: insts } = await supabase.from('workflow_instances').select('id').eq('workflow_id', wf.id);
                    if (insts && insts.length > 0) {
                        const ids = insts.map(i => i.id);
                        await supabase.from('tasks').delete().in('workflow_instance_id', ids);
                        await supabase.from('workflow_instances').delete().in('id', ids);
                    }
                    await supabase.from('workflow_steps').delete().eq('workflow_id', wf.id);
                    await supabase.from('workflows').delete().eq('id', wf.id);
                    writeAuditLog({
                        organization_id: orgId,
                        user_id: currentUser?.id,
                        user_name: currentUser?.name,
                        action: 'delete',
                        module: 'workflow',
                        table_name: 'workflows',
                        record_id: wf.id,
                        record_label: wf.name,
                    });
                    if (selectedTemplate?.id === wf.id) setSelectedTemplate(null);
                    await Promise.all([loadTemplates(), loadInstances()]);
                } catch (err: any) {
                    alert(`${zh ? '刪除失敗：' : 'Delete failed: '}${err?.message || err}`);
                }
            }
        );
    }

    async function updateTemplate() {
        if (!selectedTemplate || !editName.trim()) return;
        const { error } = await supabase.from('workflows').update({
            name: editName.trim(),
            description: editDesc.trim() || null,
            assigned_user_id: editAssignedUser || null,
        }).eq('id', selectedTemplate.id);
        if (error) { alert(`${zh ? '更新失敗：' : 'Update failed: '}${error.message}`); return; }

        await supabase.from('workflow_line_group_assignments').delete().eq('workflow_id', selectedTemplate.id);
        if (editAssignedGroups.length > 0) {
            await supabase.from('workflow_line_group_assignments').insert(
                editAssignedGroups.map(gid => ({ workflow_id: selectedTemplate.id, line_group_id: gid }))
            );
        }

        setEditingTemplate(false);
        setSelectedTemplate(p => p ? {
            ...p,
            name: editName.trim(),
            description: editDesc.trim() || null,
            assigned_user_id: editAssignedUser || null,
            assigned_groups: editAssignedGroups,
        } : null);
        await loadTemplates();
    }

    // --- Step CRUD ---
    async function refreshSelectedTemplate() {
        if (!selectedTemplate) return;
        const { data } = await supabase.from('workflows')
            .select('id, name, description, status, workflow_steps(id, name, description, step_order, step_type, config)')
            .eq('id', selectedTemplate.id).single();
        if (data) setSelectedTemplate({
            ...data,
            steps: ((data as any).workflow_steps || [])
                .sort((a: any, b: any) => a.step_order - b.step_order)
                .map((s: any) => ({
                    ...s,
                    estimated_minutes: s.config?.estimated_minutes ?? null,
                    suggested_role: s.config?.suggested_role ?? null,
                    name_en: s.config?.name_en ?? null,
                })),
        } as any);
    }

    async function addStep() {
        if (!newStepName.trim() || !selectedTemplate) return;
        const nextOrder = (selectedTemplate.steps?.length || 0) + 1;
        await supabase.from('workflow_steps').insert({
            workflow_id: selectedTemplate.id,
            name: newStepName.trim(),
            step_order: nextOrder,
            step_type: 'task',
        });
        setNewStepName('');
        await loadTemplates();
        await refreshSelectedTemplate();
    }

    async function deleteStep(stepId: string) {
        if (!selectedTemplate) return;
        await supabase.from('workflow_steps').delete().eq('id', stepId);
        await loadTemplates();
        await refreshSelectedTemplate();
    }

    async function moveStep(stepId: string, direction: 'up' | 'down') {
        if (!selectedTemplate) return;
        const steps = [...selectedTemplate.steps].sort((a, b) => a.step_order - b.step_order);
        const idx = steps.findIndex(s => s.id === stepId);
        if ((direction === 'up' && idx <= 0) || (direction === 'down' && idx >= steps.length - 1)) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        const temp = steps[idx].step_order;
        await supabase.from('workflow_steps').update({ step_order: steps[swapIdx].step_order }).eq('id', steps[idx].id);
        await supabase.from('workflow_steps').update({ step_order: temp }).eq('id', steps[swapIdx].id);
        await refreshSelectedTemplate();
        await loadTemplates();
    }

    function startEditStep(step: WorkflowStep) {
        setEditingStepId(step.id);
        setEditStep({
            name: step.name,
            description: step.description || '',
            step_type: step.step_type || 'task',
            estimated_minutes: step.estimated_minutes != null ? String(step.estimated_minutes) : '',
            suggested_role: step.suggested_role || '',
            name_en: step.name_en || '',
            default_assignee_id: (step.config?.default_assignee_id as string) || '',
            triggers: Array.isArray(step.config?.triggers) ? (step.config!.triggers as string[]) : [],
            default_priority: (step.config?.default_priority as string) || 'medium',
            default_store_id: (step.config?.default_store_id as string) || '',
            requires_confirmation: !!(step.config?.requires_confirmation),
            confirmation_approver_ids: Array.isArray(step.config?.confirmation_approver_ids) ? (step.config!.confirmation_approver_ids as string[]) : [],
            completion_notify_ids: Array.isArray(step.config?.completion_notify_ids) ? (step.config!.completion_notify_ids as string[]) : [],
        });
    }

    async function updateStep() {
        if (!editingStepId || !editStep.name.trim()) return;
        const config = {
            ...(selectedTemplate?.steps.find(s => s.id === editingStepId)?.config || {}),
            estimated_minutes: editStep.estimated_minutes ? Number(editStep.estimated_minutes) : null,
            suggested_role: editStep.suggested_role.trim() || null,
            name_en: editStep.name_en.trim() || null,
            default_assignee_id: editStep.default_assignee_id || null,
            triggers: editStep.triggers.filter(id => id.trim()),
            default_priority: editStep.default_priority || 'medium',
            default_store_id: editStep.default_store_id || null,
            requires_confirmation: editStep.requires_confirmation,
            confirmation_approver_ids: editStep.confirmation_approver_ids.filter(Boolean),
            completion_notify_ids: editStep.completion_notify_ids.filter(Boolean),
        };
        const { error } = await supabase.from('workflow_steps').update({
            name: editStep.name.trim(),
            description: editStep.description.trim() || null,
            step_type: editStep.step_type,
            config,
        }).eq('id', editingStepId);
        if (error) { alert(`${zh ? '更新失敗：' : 'Update failed: '}${error.message}`); return; }
        setEditingStepId(null);
        await loadTemplates();
        await refreshSelectedTemplate();
    }

    // --- Rendering ---
    if (!selectedTemplate) {
        return (
            <div>
                <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input className="input-field" style={{ flex: 1 }} value={templateSearch}
                        onChange={e => setTemplateSearch(e.target.value)}
                        placeholder={zh ? '搜尋範本…' : 'Search templates…'} />
                    <button className="btn btn-primary" onClick={() => setShowCreateTemplate(true)}>
                        ➕ {zh ? '新增範本' : 'New Template'}
                    </button>
                </div>

                {showCreateTemplate && (
                    <div className="card" style={{ marginBottom: '16px' }}>
                        <div style={{ marginBottom: '10px' }}>
                            <label className="detail-label">{zh ? '範本名稱' : 'Template Name'}</label>
                            <input className="input-field" value={newName} onChange={e => { setNewName(e.target.value); setTemplateNameError(''); }}
                                placeholder={zh ? '例：開店流程' : 'e.g.: Store Opening Process'} />
                            {templateNameError && <span style={{ color: 'var(--color-error, #ef4444)', fontSize: '12px' }}>{templateNameError}</span>}
                        </div>
                        <div style={{ marginBottom: '10px' }}>
                            <label className="detail-label">{zh ? '說明' : 'Description'}</label>
                            <textarea className="input-field" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                                placeholder={zh ? '流程說明…' : 'Description…'} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary" onClick={createTemplate}>{t('common.save')}</button>
                            <button className="btn btn-secondary" onClick={() => { setShowCreateTemplate(false); setTemplateNameError(''); }}>{t('common.cancel')}</button>
                        </div>
                    </div>
                )}

                {templates.length === 0 && !showCreateTemplate && (
                    <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '36px', marginBottom: '12px' }}>📋</div>
                        <p>{zh ? '尚無範本。使用 AI 助手或手動新增。' : 'No templates yet. Use the AI Assistant or add one manually.'}</p>
                        <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={() => setTab('ai')}>
                            🤖 {zh ? '使用 AI 建立' : 'Build with AI'}
                        </button>
                    </div>
                )}

                {filteredTemplates.map(wf => (
                    <div key={wf.id} className="card" style={{
                        marginBottom: '10px', cursor: 'pointer',
                        borderColor: selectedTemplate?.id === wf.id ? 'var(--accent-primary)' : undefined,
                    }} onClick={() => { setSelectedTemplate(wf); setEditingTemplate(false); }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{wf.name}</div>
                                {wf.description && (
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {wf.description}
                                    </div>
                                )}
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '8px' }}>
                                    <span>📌 {wf.steps?.length || 0} {zh ? '個步驟' : 'steps'}</span>
                                    <span>{statusLabel[wf.status]}</span>
                                </div>
                                {(wf.assigned_user_id || (wf.assigned_groups || []).length > 0) && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
                                        {wf.assigned_user_id && (
                                            <span style={{ fontSize: '10px', background: 'var(--accent-blue-dim, #dbeafe)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '1px 6px' }}>
                                                👤 {employees.find(e => e.id === wf.assigned_user_id)?.name || '—'}
                                            </span>
                                        )}
                                        {(wf.assigned_groups || []).map(gid => {
                                            const g = lineGroups.find(lg => lg.id === gid);
                                            return (
                                                <span key={gid} style={{ fontSize: '10px', background: 'var(--accent-green-dim, #dcfce7)', color: 'var(--accent-green, #16a34a)', borderRadius: '8px', padding: '1px 6px' }}>
                                                    👥 {g?.group_name || '—'}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                                {(wf.status === 'active' || wf.steps?.length > 0) && (
                                    <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); setShowStartModal(wf); setInstanceName(''); setSelectedStoreId(''); setShowAddStore(false); }}>
                                        ▶️ {zh ? '啟動' : 'Start'}
                                    </button>
                                )}
                                {wf.status === 'draft' && wf.steps?.length > 0 && (
                                    <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); activateTemplate(wf.id); }}>
                                        🟢 {zh ? '啟用' : 'Activate'}
                                    </button>
                                )}
                                <button className="btn btn-sm" style={{ color: 'var(--accent-red)', background: 'var(--accent-red-dim)', padding: '2px 8px' }}
                                    onClick={e => { e.stopPropagation(); deleteTemplate(wf); }}>
                                    🗑️
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // --- Template Detail View ---
    return (
        <div className="fade-in">
            <button className="btn btn-secondary" style={{ marginBottom: '16px' }} onClick={() => { setSelectedTemplate(null); setShowModifyAI(false); setEditingTemplate(false); }}>
                ← {zh ? '返回範本列表' : 'Back to Templates'}
            </button>
            <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: showModifyAI ? '0 0 58%' : '1', minWidth: '320px' }}>
                    <div className="card" style={{ position: 'sticky', top: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                            {editingTemplate ? (
                                <>
                                    <input className="input-field" value={editName} onChange={e => setEditName(e.target.value)}
                                        style={{ marginBottom: '6px', fontWeight: 600 }} autoFocus />
                                    <textarea className="input-field" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                                        placeholder={zh ? '說明（選填）' : 'Description (optional)'}
                                        style={{ fontSize: '12px', minHeight: '56px', marginBottom: '8px' }} />
                                    {/* Assigned User */}
                                    <div style={{ marginBottom: '8px' }}>
                                        <label className="detail-label">👤 {zh ? '指定負責人（私訊任務）' : 'Assigned User (private chat)'}</label>
                                        <select className="select" style={{ width: '100%', fontSize: '12px' }}
                                            value={editAssignedUser}
                                            onChange={e => setEditAssignedUser(e.target.value)}>
                                            <option value="">{zh ? '— 不指定 —' : '— None —'}</option>
                                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                                        </select>
                                    </div>
                                    {/* Assigned Groups */}
                                    <div style={{ marginBottom: '8px' }}>
                                        <label className="detail-label">👥 {zh ? '指定群組（可多選）' : 'Assigned Groups (multi-select)'}</label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                                            {editAssignedGroups.map(gid => {
                                                const g = lineGroups.find(lg => lg.id === gid);
                                                return (
                                                    <span key={gid} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--outline-variant)', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        {g?.group_name || gid}
                                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }}
                                                            onClick={() => setEditAssignedGroups(p => p.filter(id => id !== gid))}>✕</button>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <select className="select" style={{ width: '100%', fontSize: '12px' }} value=""
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val && !editAssignedGroups.includes(val))
                                                    setEditAssignedGroups(p => [...p, val]);
                                                e.currentTarget.value = '';
                                            }}>
                                            <option value="">➕ {zh ? '新增群組…' : 'Add group…'}</option>
                                            {lineGroups.filter(g => !editAssignedGroups.includes(g.id)).map(g =>
                                                <option key={g.id} value={g.id}>{g.group_name}</option>
                                            )}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                        <button className="btn btn-sm btn-primary" onClick={updateTemplate}>{t('common.save')}</button>
                                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingTemplate(false)}>{t('common.cancel')}</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{selectedTemplate.name}</h3>
                                    {selectedTemplate.description && (
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{selectedTemplate.description}</p>
                                    )}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                        {selectedTemplate.assigned_user_id && (
                                            <span style={{ fontSize: '11px', background: 'var(--accent-blue-dim, #dbeafe)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '2px 8px' }}>
                                                👤 {employees.find(e => e.id === selectedTemplate.assigned_user_id)?.name || selectedTemplate.assigned_user_id}
                                            </span>
                                        )}
                                        {(selectedTemplate.assigned_groups || []).map(gid => {
                                            const g = lineGroups.find(lg => lg.id === gid);
                                            return (
                                                <span key={gid} style={{ fontSize: '11px', background: 'var(--accent-green-dim, #dcfce7)', color: 'var(--accent-green, #16a34a)', borderRadius: '8px', padding: '2px 8px' }}>
                                                    👥 {g?.group_name || gid}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            {!editingTemplate && (
                                <button className="btn btn-sm btn-secondary" onClick={() => {
                                    setEditName(selectedTemplate.name);
                                    setEditDesc(selectedTemplate.description || '');
                                    setEditAssignedUser(selectedTemplate.assigned_user_id || '');
                                    setEditAssignedGroups(selectedTemplate.assigned_groups || []);
                                    setEditingTemplate(true);
                                }}>
                                    ✏️ {t('common.edit')}
                                </button>
                            )}
                            <button className="btn btn-sm btn-secondary" onClick={() => setShowModifyAI(p => !p)}>
                                🛠️ AI
                            </button>
                            <button className="btn btn-sm" style={{ color: 'var(--accent-red)', background: 'var(--accent-red-dim)' }}
                                onClick={() => deleteTemplate(selectedTemplate)}>
                                🗑️
                            </button>
                            <button className="btn btn-sm btn-secondary" onClick={() => { setSelectedTemplate(null); setShowModifyAI(false); setEditingTemplate(false); }}>✕</button>
                        </div>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
                        📋 {t('workflow.steps')} ({selectedTemplate.steps?.length || 0})
                    </div>

                    {/* Steps Table */}
                    <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
                        <table className="data-table" style={{ margin: 0, fontSize: '12px', minWidth: '620px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '32px', textAlign: 'center' }}>#</th>
                                    <th style={{ minWidth: '110px' }}>{zh ? '步驟名稱' : 'Step Name'}</th>
                                    <th style={{ minWidth: '80px' }}>{zh ? '英文名稱' : 'Name EN'}</th>
                                    <th style={{ minWidth: '100px' }}>{zh ? '說明' : 'Description'}</th>
                                    <th style={{ width: '74px' }}>{zh ? '類型' : 'Type'}</th>
                                    <th style={{ width: '50px' }}>{zh ? '分鐘' : 'Min'}</th>
                                    <th style={{ width: '60px' }}>{zh ? '優先級' : 'Priority'}</th>
                                    <th style={{ width: '80px' }}>{zh ? '負責人' : 'Assignee'}</th>
                                    <th style={{ width: '100px' }}>{zh ? '觸發步驟' : 'Triggers'}</th>
                                    <th style={{ width: '50px' }}>{zh ? '確認' : 'Confirm'}</th>
                                    <th style={{ width: '50px' }}>{zh ? '通知' : 'Notify'}</th>
                                    <th style={{ width: '64px' }}>{zh ? '操作' : 'Act.'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedTemplate.steps?.map((step) => (
                                    <tr key={step.id} style={{
                                        background: editingStepId === step.id ? 'var(--accent-primary-dim)' : undefined,
                                        borderLeft: editingStepId === step.id ? '3px solid var(--accent-primary)' : '3px solid transparent',
                                    }}>
                                        <td style={{ color: 'var(--accent-primary)', fontWeight: 700, textAlign: 'center' }}>{step.step_order}</td>
                                        <td style={{ fontWeight: 500 }}>{step.name}</td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{step.name_en || <span style={{ opacity: 0.4 }}>—</span>}</td>
                                        <td style={{ color: 'var(--text-secondary)', maxWidth: '100px' }}>
                                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={step.description || ''}>
                                                {step.description || <span style={{ opacity: 0.4 }}>—</span>}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '10px', background: 'var(--bg-secondary)', borderRadius: '4px', padding: '1px 5px', color: 'var(--text-muted)' }}>
                                                {step.step_type}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                                            {step.estimated_minutes != null ? step.estimated_minutes : <span style={{ opacity: 0.4 }}>—</span>}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {({ low: '🟢', medium: '🟡', high: '🔴', urgent: '🚨' } as Record<string,string>)[(step.config?.default_priority as string) || 'medium'] || '🟡'}
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                                            {employees.find(e => e.id === (step.config?.default_assignee_id as string))?.name || <span style={{ opacity: 0.4 }}>—</span>}
                                        </td>
                                        <td>
                                            {((step.config?.triggers as string[]) || []).length === 0
                                                ? <span style={{ opacity: 0.4, fontSize: '11px' }}>—</span>
                                                : ((step.config?.triggers as string[]) || []).map(sid => {
                                                    const ts = selectedTemplate.steps.find(s => s.id === sid);
                                                    return ts ? (
                                                        <span key={sid} style={{ display: 'inline-block', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '1px 5px', fontSize: '10px', marginRight: '2px', color: 'var(--text-muted)' }}>
                                                            步驟{ts.step_order}
                                                        </span>
                                                    ) : null;
                                                })}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {step.config?.requires_confirmation
                                                ? <span style={{ fontSize: '10px', color: '#8b5cf6' }}>🔐 {((step.config?.confirmation_approver_ids as string[]) || []).length}</span>
                                                : <span style={{ opacity: 0.4, fontSize: '11px' }}>—</span>}
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            {((step.config?.completion_notify_ids as string[]) || []).length > 0
                                                ? <span style={{ fontSize: '10px', color: '#f59e0b' }}>📢 {((step.config?.completion_notify_ids as string[]) || []).length}</span>
                                                : <span style={{ opacity: 0.4, fontSize: '11px' }}>—</span>}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '3px' }}>
                                                <button className="btn btn-sm btn-secondary" onClick={() => startEditStep(step)} style={{ padding: '2px 5px', fontSize: '11px' }}>✏️</button>
                                                <button className="btn btn-sm" style={{ padding: '2px 5px', color: 'var(--accent-red)' }}
                                                    onClick={() => withConfirm(zh ? '確定刪除此步驟？' : 'Delete this step?', () => deleteStep(step.id))}>✕</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Inline Edit Form */}
                    {editingStepId && (() => {
                        const editingStepObj = selectedTemplate.steps.find(s => s.id === editingStepId);
                        if (!editingStepObj) return null;
                        return (
                            <div style={{ background: 'var(--accent-primary-dim)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: '10px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px', color: 'var(--accent-primary)' }}>
                                    ✏️ {zh ? `編輯步驟 ${editingStepObj.step_order}: ${editingStepObj.name}` : `Edit Step ${editingStepObj.step_order}: ${editingStepObj.name}`}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '步驟名稱' : 'Step Name'} *</label>
                                        <input className="input-field" value={editStep.name} onChange={e => setEditStep(p => ({ ...p, name: e.target.value }))} autoFocus />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '英文名稱' : 'Name (EN)'}</label>
                                        <input className="input-field" value={editStep.name_en} onChange={e => setEditStep(p => ({ ...p, name_en: e.target.value }))} placeholder="e.g. Open Store" />
                                    </div>
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label className="detail-label">{zh ? '說明' : 'Description'}</label>
                                    <textarea className="input-field" value={editStep.description} onChange={e => setEditStep(p => ({ ...p, description: e.target.value }))}
                                        style={{ minHeight: '56px', fontSize: '12px' }} placeholder={zh ? '步驟說明…' : 'Step description…'} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '8px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '類型' : 'Type'}</label>
                                        <select className="select" value={editStep.step_type} onChange={e => setEditStep(p => ({ ...p, step_type: e.target.value }))}>
                                            <option value="task">Task</option>
                                            <option value="approval">Approval</option>
                                            <option value="notification">Notification</option>
                                            <option value="condition">Condition</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '預估時間(分)' : 'Est. mins'}</label>
                                        <input className="input-field" type="number" min="0" value={editStep.estimated_minutes}
                                            onChange={e => setEditStep(p => ({ ...p, estimated_minutes: e.target.value }))} placeholder="30" />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '建議角色' : 'Role'}</label>
                                        <input className="input-field" value={editStep.suggested_role} onChange={e => setEditStep(p => ({ ...p, suggested_role: e.target.value }))} placeholder={zh ? '例：店長' : 'e.g. Manager'} />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '負責人' : 'Assignee'}</label>
                                        <select className="select" value={editStep.default_assignee_id} onChange={e => setEditStep(p => ({ ...p, default_assignee_id: e.target.value }))}>
                                            <option value="">{zh ? '— 未指定 —' : '— Unassigned —'}</option>
                                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '預設優先級' : 'Default Priority'}</label>
                                        <select className="select" value={editStep.default_priority} onChange={e => setEditStep(p => ({ ...p, default_priority: e.target.value }))}>
                                            <option value="low">{zh ? '🟢 低' : '🟢 Low'}</option>
                                            <option value="medium">{zh ? '🟡 中' : '🟡 Medium'}</option>
                                            <option value="high">{zh ? '🔴 高' : '🔴 High'}</option>
                                            <option value="urgent">{zh ? '🚨 緊急' : '🚨 Urgent'}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '預設門市' : 'Default Store'}</label>
                                        <select className="select" value={editStep.default_store_id} onChange={e => setEditStep(p => ({ ...p, default_store_id: e.target.value }))}>
                                            <option value="">{zh ? '— 不指定 —' : '— None —'}</option>
                                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {/* Completion Triggers */}
                                <div style={{ marginBottom: '10px' }}>
                                    <label className="detail-label">🔔 {zh ? '完成觸發步驟（可多項）' : 'Completion Triggers (multiple steps)'}</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                        {editStep.triggers.map(stepId => {
                                            const ts = selectedTemplate.steps.find(s => s.id === stepId);
                                            return (
                                                <span key={stepId} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--outline-variant)', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {ts ? `步驟${ts.step_order}: ${ts.name}` : stepId}
                                                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }}
                                                        onClick={() => setEditStep(p => ({ ...p, triggers: p.triggers.filter(id => id !== stepId) }))}>✕</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <select className="select" style={{ fontSize: '12px' }} value=""
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val && !editStep.triggers.includes(val)) {
                                                setEditStep(p => ({ ...p, triggers: [...p.triggers, val] }));
                                            }
                                            e.currentTarget.value = '';
                                        }}>
                                        <option value="">➕ {zh ? '新增觸發步驟…' : 'Add trigger step…'}</option>
                                        {selectedTemplate.steps
                                            .filter(s => s.id !== editingStepId && !editStep.triggers.includes(s.id))
                                            .map(s => <option key={s.id} value={s.id}>步驟{s.step_order}: {s.name}</option>)}
                                    </select>
                                </div>
                                {/* Confirmation/Approval */}
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, marginBottom: '6px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={editStep.requires_confirmation}
                                            onChange={e => setEditStep(p => ({ ...p, requires_confirmation: e.target.checked, confirmation_approver_ids: e.target.checked ? p.confirmation_approver_ids : [] }))} />
                                        🔐 {zh ? '需要確認/審批' : 'Requires Confirmation'}
                                    </label>
                                    {editStep.requires_confirmation && (
                                        <>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                                {editStep.confirmation_approver_ids.map(empId => {
                                                    const emp = employees.find(e => e.id === empId);
                                                    return (
                                                        <span key={empId} style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', color: '#8b5cf6' }}>
                                                            {emp?.name || empId}
                                                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }}
                                                                onClick={() => setEditStep(p => ({ ...p, confirmation_approver_ids: p.confirmation_approver_ids.filter(id => id !== empId) }))}>✕</button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                            <select className="select" style={{ fontSize: '12px' }} value=""
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    if (val && !editStep.confirmation_approver_ids.includes(val))
                                                        setEditStep(p => ({ ...p, confirmation_approver_ids: [...p.confirmation_approver_ids, val] }));
                                                    e.currentTarget.value = '';
                                                }}>
                                                <option value="">➕ {zh ? '新增審批人…' : 'Add approver…'}</option>
                                                {employees.filter(e => !editStep.confirmation_approver_ids.includes(e.id)).map(e =>
                                                    <option key={e.id} value={e.id}>{e.name}</option>)}
                                            </select>
                                        </>
                                    )}
                                </div>
                                {/* Completion Notification */}
                                <div style={{ marginBottom: '10px' }}>
                                    <label className="detail-label">📢 {zh ? '完成通知人員' : 'Completion Notify'}</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                        {editStep.completion_notify_ids.map(empId => {
                                            const emp = employees.find(e => e.id === empId);
                                            return (
                                                <span key={empId} style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b' }}>
                                                    {emp?.name || empId}
                                                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }}
                                                        onClick={() => setEditStep(p => ({ ...p, completion_notify_ids: p.completion_notify_ids.filter(id => id !== empId) }))}>✕</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <select className="select" style={{ fontSize: '12px' }} value=""
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val && !editStep.completion_notify_ids.includes(val))
                                                setEditStep(p => ({ ...p, completion_notify_ids: [...p.completion_notify_ids, val] }));
                                            e.currentTarget.value = '';
                                        }}>
                                        <option value="">➕ {zh ? '新增通知人員…' : 'Add notify person…'}</option>
                                        {employees.filter(e => !editStep.completion_notify_ids.includes(e.id)).map(e =>
                                            <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-sm btn-primary" onClick={updateStep}>{t('common.save')}</button>
                                    <button className="btn btn-sm btn-secondary" onClick={() => setEditingStepId(null)}>{t('common.cancel')}</button>
                                </div>
                            </div>
                        );
                    })()}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <input className="input-field" style={{ flex: 1 }} value={newStepName}
                            onChange={e => setNewStepName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStep()}
                            placeholder={zh ? '新增步驟名稱…' : 'Add step name…'} />
                        <button className="btn btn-primary btn-sm" aria-label="新增" onClick={addStep}>➕</button>
                    </div>
                </div>
            </div>

            {/* AI Modify panel */}
            {showModifyAI && (
                <div style={{ flex: '0 0 40%', minWidth: '320px' }} className="fade-in">
                <WorkflowModifyAIChat
                    workflow={{
                        id: selectedTemplate.id,
                        name: selectedTemplate.name,
                        description: selectedTemplate.description,
                        steps: selectedTemplate.steps.map(s => ({
                            id: s.id,
                            name: s.name,
                            step_order: s.step_order,
                            step_type: s.step_type,
                            description: s.description || null,
                        })),
                    }}
                    onApprove={async (actions: WorkflowAction[]) => {
                        if (!selectedTemplate) return;
                        for (const act of actions) {
                            if (act.type === 'UPDATE_WORKFLOW') {
                                await supabase.from('workflows').update({ ...act.payload, updated_at: new Date().toISOString() }).eq('id', selectedTemplate.id);
                            } else if (act.type === 'ADD_STEP') {
                                const order = act.payload.step_order || (selectedTemplate.steps?.length || 0) + 1;
                                if (act.payload.step_order) {
                                    for (const s of selectedTemplate.steps.filter(s => s.step_order >= order)) {
                                        await supabase.from('workflow_steps').update({ step_order: s.step_order + 1 }).eq('id', s.id);
                                    }
                                }
                                await supabase.from('workflow_steps').insert({
                                    workflow_id: selectedTemplate.id,
                                    name: act.payload.name,
                                    step_order: order,
                                    step_type: act.payload.step_type || 'task',
                                    config: act.payload.description ? { description: act.payload.description } : {},
                                });
                            } else if (act.type === 'UPDATE_STEP') {
                                const updateData: any = {};
                                if (act.payload.name) updateData.name = act.payload.name;
                                if (act.payload.step_type) updateData.step_type = act.payload.step_type;
                                if (act.payload.description) {
                                    const { data: stepRow } = await supabase.from('workflow_steps').select('config').eq('id', act.payload.id).single();
                                    updateData.config = { ...(stepRow?.config || {}), description: act.payload.description };
                                }
                                await supabase.from('workflow_steps').update(updateData).eq('id', act.payload.id);
                            } else if (act.type === 'DELETE_STEP') {
                                await supabase.from('workflow_steps').delete().eq('id', act.payload.id);
                            } else if (act.type === 'MOVE_STEP') {
                                await moveStep(act.payload.id, act.payload.direction);
                            }
                        }
                        await loadTemplates();
                        await refreshSelectedTemplate();
                    }}
                />
                </div>
            )}
            </div>
        </div>
    );
}
