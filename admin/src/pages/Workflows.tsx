import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { WorkflowAIChat } from '../components/WorkflowAIChat';

interface Workflow {
    id: string;
    name: string;
    description: string | null;
    status: string;
    steps: WorkflowStep[];
}

interface WorkflowStep {
    id: string;
    name: string;
    step_order: number;
    step_type: string;
    config: Record<string, unknown> | null;
}

interface WorkflowInstance {
    id: string;
    name: string;
    status: string;
    started_at: string;
    workflow: { name: string } | null;
}

interface TaskSummary {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    blocked: number;
}

export function Workflows() {
    const [tab, setTab] = useState<'instances' | 'templates' | 'ai'>('instances');
    const [templates, setTemplates] = useState<Workflow[]>([]);
    const [instances, setInstances] = useState<(WorkflowInstance & { taskSummary: TaskSummary })[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState<Workflow | null>(null);
    const [showCreateTemplate, setShowCreateTemplate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newStepName, setNewStepName] = useState('');
    const [showStartModal, setShowStartModal] = useState<Workflow | null>(null);
    const [instanceName, setInstanceName] = useState('');
    const zh = getLocale() === 'zh-TW';

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        await Promise.all([loadTemplates(), loadInstances()]);
        setLoading(false);
    }

    async function loadTemplates() {
        const { data } = await supabase.from('workflows')
            .select('id, name, description, status, workflow_steps(id, name, step_order, step_type, config)')
            .order('created_at', { ascending: false });
        if (data) setTemplates(data.map((w: any) => ({ ...w, steps: (w.workflow_steps || []).sort((a: any, b: any) => a.step_order - b.step_order) })));
    }

    async function loadInstances() {
        const { data: insts } = await supabase.from('workflow_instances')
            .select('id, name, status, started_at, workflows(name)')
            .order('started_at', { ascending: false });

        if (insts) {
            const enriched = [];
            for (const inst of insts) {
                const { data: tasks } = await supabase.from('tasks').select('status').eq('workflow_instance_id', inst.id);
                const summary: TaskSummary = { total: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0 };
                if (tasks) {
                    summary.total = tasks.length;
                    tasks.forEach((t: any) => { if (t.status in summary) (summary as any)[t.status]++; });
                }
                enriched.push({ ...inst, workflow: (inst as any).workflows, taskSummary: summary });
            }
            setInstances(enriched);
        }
    }

    async function createTemplate() {
        if (!newName.trim()) return;
        const { data } = await supabase.from('workflows').insert({
            organization_id: '00000000-0000-0000-0000-000000000001',
            name: newName.trim(),
            description: newDesc.trim() || null,
            status: 'draft',
        }).select().single();
        if (data) {
            setShowCreateTemplate(false);
            setNewName('');
            setNewDesc('');
            await loadTemplates();
            setSelectedTemplate({ ...data, steps: [] });
        }
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
        // Refresh selected template
        const updated = templates.find(w => w.id === selectedTemplate.id);
        if (updated) setSelectedTemplate(updated);
        else {
            const { data } = await supabase.from('workflows')
                .select('id, name, description, status, workflow_steps(id, name, step_order, step_type, config)')
                .eq('id', selectedTemplate.id).single();
            if (data) setSelectedTemplate({ ...data, steps: ((data as any).workflow_steps || []).sort((a: any, b: any) => a.step_order - b.step_order) });
        }
    }

    async function deleteStep(stepId: string) {
        if (!selectedTemplate) return;
        await supabase.from('workflow_steps').delete().eq('id', stepId);
        await loadTemplates();
        const { data } = await supabase.from('workflows')
            .select('id, name, description, status, workflow_steps(id, name, step_order, step_type, config)')
            .eq('id', selectedTemplate.id).single();
        if (data) setSelectedTemplate({ ...data, steps: ((data as any).workflow_steps || []).sort((a: any, b: any) => a.step_order - b.step_order) });
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

        const { data } = await supabase.from('workflows')
            .select('id, name, description, status, workflow_steps(id, name, step_order, step_type, config)')
            .eq('id', selectedTemplate.id).single();
        if (data) setSelectedTemplate({ ...data, steps: ((data as any).workflow_steps || []).sort((a: any, b: any) => a.step_order - b.step_order) });
        await loadTemplates();
    }

    async function activateTemplate(wfId: string) {
        await supabase.from('workflows').update({ status: 'active' }).eq('id', wfId);
        await loadTemplates();
        if (selectedTemplate?.id === wfId) setSelectedTemplate(p => p ? { ...p, status: 'active' } : null);
    }

    async function startInstance() {
        if (!showStartModal || !instanceName.trim()) return;
        const wf = showStartModal;
        const { data: instance } = await supabase.from('workflow_instances').insert({
            workflow_id: wf.id,
            organization_id: '00000000-0000-0000-0000-000000000001',
            name: instanceName.trim(),
            status: 'running',
        }).select().single();

        if (instance && wf.steps) {
            const tasks = wf.steps.map(s => ({
                organization_id: '00000000-0000-0000-0000-000000000001',
                workflow_instance_id: instance.id,
                workflow_step_id: s.id,
                title: s.name,
                status: 'pending',
                sort_order: s.step_order,
            }));
            await supabase.from('tasks').insert(tasks);
        }
        setShowStartModal(null);
        setInstanceName('');
        await loadInstances();
        setTab('instances');
    }

    const statusLabel: Record<string, string> = {
        running: zh ? '🔄 進行中' : '🔄 Running',
        completed: zh ? '✅ 已完成' : '✅ Completed',
        paused: zh ? '⏸ 已暫停' : '⏸ Paused',
        cancelled: zh ? '❌ 已取消' : '❌ Cancelled',
        draft: zh ? '📝 草稿' : '📝 Draft',
        active: zh ? '🟢 已啟用' : '🟢 Active',
        archived: zh ? '📦 已封存' : '📦 Archived',
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>🔄 {t('workflow.title')}</h2>
                <p>{zh ? '管理流程範本及流程實例' : 'Manage workflow templates and instances'}</p>
            </div>

            <div className="page-body">
                {/* Tabs */}
                <div className="tab-bar">
                    <button className={`tab-item ${tab === 'instances' ? 'active' : ''}`} onClick={() => setTab('instances')}>
                        📊 {t('workflow.instances')} ({instances.length})
                    </button>
                    <button className={`tab-item ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
                        🗂 {zh ? '流程範本' : 'Templates'} ({templates.length})
                    </button>
                    <button className={`tab-item ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
                        🤖 {zh ? 'AI 助手' : 'AI Assistant'}
                    </button>
                </div>

                {loading ? (
                    <p className="loading-pulse">{t('common.loading')}</p>

                ) : tab === 'instances' ? (
                    /* ==================== Instances Tab ==================== */
                    instances.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                            <p style={{ color: 'var(--text-muted)' }}>{t('common.no_data')}</p>
                        </div>
                    ) : (
                        instances.map(inst => {
                            const progress = inst.taskSummary.total > 0
                                ? Math.round((inst.taskSummary.completed / inst.taskSummary.total) * 100) : 0;
                            return (
                                <div key={inst.id} className="card" style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '16px', fontWeight: 600 }}>{inst.name || inst.workflow?.name}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                {zh ? '模板' : 'Template'}: {inst.workflow?.name || '—'} · {zh ? '建立' : 'Started'}: {new Date(inst.started_at).toLocaleDateString('zh-TW')}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '13px' }}>{statusLabel[inst.status] || inst.status}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <div className="progress-bar" style={{ flex: 1 }}>
                                            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                                        </div>
                                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-primary)', minWidth: '40px', textAlign: 'right' }}>
                                            {progress}%
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        <span>⬜ {inst.taskSummary.pending}</span>
                                        <span>🔄 {inst.taskSummary.in_progress}</span>
                                        <span>✅ {inst.taskSummary.completed}</span>
                                        <span>🚫 {inst.taskSummary.blocked}</span>
                                        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{zh ? '總計' : 'Total'}: {inst.taskSummary.total}</span>
                                    </div>
                                </div>
                            );
                        })
                    )

                ) : tab === 'templates' ? (
                    /* ==================== Templates Tab ==================== */
                    <div style={{ display: 'flex', gap: '20px' }}>
                        {/* Template list */}
                        <div style={{ flex: selectedTemplate ? '0 0 45%' : '1' }}>
                            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={() => setShowCreateTemplate(true)}>
                                    ➕ {zh ? '新增範本' : 'New Template'}
                                </button>
                            </div>

                            {showCreateTemplate && (
                                <div className="card" style={{ marginBottom: '16px' }}>
                                    <div style={{ marginBottom: '10px' }}>
                                        <label className="detail-label">{zh ? '範本名稱' : 'Template Name'}</label>
                                        <input className="input-field" value={newName} onChange={e => setNewName(e.target.value)}
                                            placeholder={zh ? '例：新門市開店流程' : 'e.g.: New Store Opening Process'} />
                                    </div>
                                    <div style={{ marginBottom: '10px' }}>
                                        <label className="detail-label">{zh ? '說明' : 'Description'}</label>
                                        <textarea className="input-field" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                                            placeholder={zh ? '流程說明...' : 'Description...'} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-primary" onClick={createTemplate}>{t('common.save')}</button>
                                        <button className="btn btn-secondary" onClick={() => setShowCreateTemplate(false)}>{t('common.cancel')}</button>
                                    </div>
                                </div>
                            )}

                            {templates.map(wf => (
                                <div key={wf.id} className="card" style={{
                                    marginBottom: '10px', cursor: 'pointer',
                                    borderColor: selectedTemplate?.id === wf.id ? 'var(--accent-primary)' : undefined,
                                }}
                                    onClick={() => setSelectedTemplate(wf)}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{wf.name}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                {wf.steps?.length || 0} {zh ? '個步驟' : 'steps'} · {statusLabel[wf.status]}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            {wf.status === 'active' && (
                                                <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); setShowStartModal(wf); setInstanceName(''); }}>
                                                    ▶️ {zh ? '啟動' : 'Start'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Step editor */}
                        {selectedTemplate && (
                            <div style={{ flex: '0 0 52%', minWidth: '340px' }} className="fade-in">
                                <div className="card" style={{ position: 'sticky', top: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div>
                                            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{selectedTemplate.name}</h3>
                                            {selectedTemplate.description && (
                                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{selectedTemplate.description}</p>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                            {selectedTemplate.status === 'draft' && selectedTemplate.steps?.length > 0 && (
                                                <button className="btn btn-sm btn-primary" onClick={() => activateTemplate(selectedTemplate.id)}>
                                                    🟢 {zh ? '啟用' : 'Activate'}
                                                </button>
                                            )}
                                            <button className="btn btn-sm btn-secondary" onClick={() => setSelectedTemplate(null)}>✕</button>
                                        </div>
                                    </div>

                                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
                                        📋 {t('workflow.steps')} ({selectedTemplate.steps?.length || 0})
                                    </div>

                                    {/* Steps list */}
                                    {selectedTemplate.steps?.map((step, idx) => (
                                        <div key={step.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                                            background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', marginBottom: '4px',
                                        }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '12px', width: '24px', textAlign: 'center' }}>{step.step_order}</span>
                                            <span style={{ flex: 1, fontSize: '13px' }}>{step.name}</span>
                                            <button className="btn btn-sm btn-secondary" onClick={() => moveStep(step.id, 'up')} disabled={idx === 0}
                                                style={{ padding: '2px 6px', opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                                            <button className="btn btn-sm btn-secondary" onClick={() => moveStep(step.id, 'down')} disabled={idx === selectedTemplate.steps.length - 1}
                                                style={{ padding: '2px 6px', opacity: idx === selectedTemplate.steps.length - 1 ? 0.3 : 1 }}>↓</button>
                                            <button className="btn btn-sm" style={{ padding: '2px 6px', color: 'var(--accent-red)' }}
                                                onClick={() => { if (confirm(zh ? '確定刪除此步驟？' : 'Delete this step?')) deleteStep(step.id); }}>✕</button>
                                        </div>
                                    ))}

                                    {/* Add step */}
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                        <input className="input-field" style={{ flex: 1 }} value={newStepName}
                                            onChange={e => setNewStepName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStep()}
                                            placeholder={zh ? '新增步驟名稱...' : 'Add step name...'} />
                                        <button className="btn btn-primary btn-sm" onClick={addStep}>➕</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ==================== AI Chat Tab ==================== */
                    <div style={{ height: '600px' }}>
                        <WorkflowAIChat onApprove={async (suggestion) => {
                            // Create the workflow template
                            const { data: wf } = await supabase.from('workflows').insert({
                                organization_id: '00000000-0000-0000-0000-000000000001',
                                name: suggestion.name,
                                description: suggestion.description,
                                status: 'active',
                            }).select().single();
                            if (!wf) throw new Error('Failed to create workflow');

                            // Create all steps
                            const steps = suggestion.steps.map(s => ({
                                workflow_id: wf.id,
                                name: s.name,
                                step_order: s.step_order,
                                step_type: s.step_type || 'task',
                                config: {
                                    estimated_minutes: s.estimated_minutes,
                                    suggested_role: s.suggested_role,
                                    description: s.description,
                                    name_en: s.name_en,
                                },
                            }));
                            await supabase.from('workflow_steps').insert(steps);
                            await loadTemplates();
                        }} />
                    </div>
                )}

                {/* Start Instance Modal */}
                {showStartModal && (
                    <div className="modal-overlay" onClick={() => setShowStartModal(null)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>
                                ▶️ {zh ? '啟動流程實例' : 'Start Workflow Instance'}
                            </h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                {zh ? `將使用「${showStartModal.name}」範本 (${showStartModal.steps?.length} 個步驟) 建立新的流程實例。`
                                    : `Create a new instance from "${showStartModal.name}" (${showStartModal.steps?.length} steps).`}
                            </p>
                            <div style={{ marginBottom: '16px' }}>
                                <label className="detail-label">{zh ? '實例名稱' : 'Instance Name'}</label>
                                <input className="input-field" value={instanceName} onChange={e => setInstanceName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && startInstance()}
                                    placeholder={zh ? '例：第二間門市開店' : 'e.g.: Second Store Opening'} autoFocus />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => setShowStartModal(null)}>{t('common.cancel')}</button>
                                <button className="btn btn-primary" onClick={startInstance}>▶️ {zh ? '啟動' : 'Start'}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
