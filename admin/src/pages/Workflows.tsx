import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';
import { WorkflowAIChat } from '../components/WorkflowAIChat';
import { WorkflowModifyAIChat, type WorkflowAction } from '../components/WorkflowModifyAIChat';

interface LineGroup {
    id: string;
    group_name: string;
}

interface Workflow {
    id: string;
    name: string;
    description: string | null;
    status: string;
    steps: WorkflowStep[];
    assigned_user_id?: string | null;
    assigned_groups?: string[]; // line_group UUIDs
}

interface WorkflowStep {
    id: string;
    name: string;
    description: string | null;
    step_order: number;
    step_type: string;
    config: Record<string, unknown> | null;
    // config fields surfaced for convenience:
    estimated_minutes?: number | null;
    suggested_role?: string | null;
    name_en?: string | null;
}

interface WorkflowInstance {
    id: string;
    name: string;
    status: string;
    started_at: string;
    workflow: { name: string } | null;
    taskSummary: TaskSummary;
    assigned_user_id?: string | null;
    assigned_groups?: string[];
}

interface InstanceTask {
    id: string;
    title: string;
    status: string;
    priority: string;
    sort_order: number | null;
    due_date: string | null;
    assigned_to: string | null;
    workflow_step_id: string | null;
    notes: string | null;
}

interface TaskSummary {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    blocked: number;
}

export function Workflows() {
    const [tab, setTab] = useState<'templates' | 'active' | 'ai' | 'archive'>('templates');
    const [templates, setTemplates] = useState<Workflow[]>([]);
    const [instances, setInstances] = useState<WorkflowInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState<Workflow | null>(null);
    const [showModifyAI, setShowModifyAI] = useState(false);
    const [showCreateTemplate, setShowCreateTemplate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [templateNameError, setTemplateNameError] = useState('');
    const [newStepName, setNewStepName] = useState('');
    const [showStartModal, setShowStartModal] = useState<Workflow | null>(null);
    const [instanceName, setInstanceName] = useState('');
    const [selectedStoreId, setSelectedStoreId] = useState('');
    const [stores, setStores] = useState<{ id: string; name: string; store_code: string | null }[]>([]);
    const [showAddStore, setShowAddStore] = useState(false);
    const [newStoreName, setNewStoreName] = useState('');
    const [newStoreCode, setNewStoreCode] = useState('');
    const [confirmDialog, setConfirmDialog] = useState<{ msg: string; onConfirm: () => void } | null>(null);
    const [editingTemplate, setEditingTemplate] = useState(false);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editAssignedUser, setEditAssignedUser] = useState('');
    const [editAssignedGroups, setEditAssignedGroups] = useState<string[]>([]);
    const [editingStepId, setEditingStepId] = useState<string | null>(null);
    const [editStep, setEditStep] = useState({ name: '', description: '', step_type: 'task', estimated_minutes: '', suggested_role: '', name_en: '', default_assignee_id: '', triggers: [] as string[] });
    const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
    const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);
    const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
    const [editingInstAssign, setEditingInstAssign] = useState<string | null>(null);
    const [editInstUser, setEditInstUser] = useState('');
    const [editInstGroups, setEditInstGroups] = useState<string[]>([]);
    const [instanceTasks, setInstanceTasks] = useState<InstanceTask[]>([]);
    const [instanceTasksLoading, setInstanceTasksLoading] = useState(false);
    const [taskEdits, setTaskEdits] = useState<Record<string, { status: string; assigned_to: string | null; notes: string | null }>>({});
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();

    function withConfirm(msg: string, action: () => void) {
        setConfirmDialog({ msg, onConfirm: action });
    }

    useEffect(() => {
        if (orgId) loadData();
    }, [orgId]);

    async function loadData() {
        setLoading(true);
        await Promise.all([loadTemplates(), loadInstances(), loadStores(), loadEmployees(), loadLineGroups()]);
        setLoading(false);
    }

    async function loadEmployees() {
        const { data } = await supabase.from('users').select('id, name').eq('organization_id', orgId).order('name');
        if (data) setEmployees(data);
    }

    async function loadLineGroups() {
        const { data } = await supabase.from('line_groups').select('id, group_name').eq('is_active', true).order('group_name');
        if (data) setLineGroups(data);
    }

    async function loadInstanceTasks(inst: WorkflowInstance) {
        setSelectedInstance(inst);
        setInstanceTasksLoading(true);
        setTaskEdits({});
        setExpandedTaskId(null);
        let { data, error } = await supabase
            .from('tasks')
            .select('id, title, status, priority, sort_order, due_date, assigned_to, workflow_step_id, notes')
            .eq('workflow_instance_id', inst.id)
            .order('sort_order', { ascending: true });
        // If the notes column doesn't exist yet (migration pending), fall back without it
        if (error) {
            console.warn('loadInstanceTasks: retrying without notes column', error.message);
            const fallback = await supabase
                .from('tasks')
                .select('id, title, status, priority, sort_order, due_date, assigned_to, workflow_step_id')
                .eq('workflow_instance_id', inst.id)
                .order('sort_order', { ascending: true });
            data = fallback.data;
        }
        setInstanceTasks((data as any) || []);
        setInstanceTasksLoading(false);
    }

    async function saveTaskEdit(taskId: string) {
        const edit = taskEdits[taskId];
        if (!edit) return;
        await supabase.from('tasks').update({
            status: edit.status,
            assigned_to: edit.assigned_to || null,
            notes: edit.notes ?? null,
            ...(edit.status === 'completed' ? { completed_at: new Date().toISOString() } : { completed_at: null }),
        }).eq('id', taskId);
        const updatedTasks = instanceTasks.map(t => t.id === taskId ? { ...t, ...edit } : t);
        setInstanceTasks(updatedTasks);
        setTaskEdits(p => { const n = { ...p }; delete n[taskId]; return n; });
        setInstances(prev => prev.map(inst => {
            if (inst.id !== selectedInstance?.id) return inst;
            const summary: TaskSummary = { total: updatedTasks.length, pending: 0, in_progress: 0, completed: 0, blocked: 0 };
            updatedTasks.forEach(t => { if (t.status in summary) (summary as any)[t.status]++; });
            return { ...inst, taskSummary: summary };
        }));
    }

    function getTaskEdit(task: InstanceTask) {
        return taskEdits[task.id] ?? { status: task.status, assigned_to: task.assigned_to, notes: task.notes };
    }

    async function loadStores() {
        const { data } = await supabase.from('stores')
            .select('id, name, store_code')
            .eq('organization_id', orgId)
            .eq('is_active', true)
            .order('name');
        if (data) setStores(data);
    }

    async function addStore() {
        if (!newStoreName.trim()) return;
        const { data, error } = await supabase.from('stores').insert({
            organization_id: orgId,
            name: newStoreName.trim(),
            store_code: newStoreCode.trim() || null,
            is_active: true,
        }).select('id, name, store_code').single();
        if (error) { alert(`${zh ? '新增門市失敗：' : 'Failed to add store: '}${error.message}`); return; }
        if (data) {
            setStores(prev => [...prev, data]);
            setSelectedStoreId(data.id);
            setNewStoreName('');
            setNewStoreCode('');
            setShowAddStore(false);
        }
    }

    async function loadTemplates() {
        const { data, error } = await supabase.from('workflows')
            .select('id, name, description, status, assigned_user_id, workflow_steps(id, name, description, step_order, step_type, config)')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        if (error) console.error('loadTemplates error:', error);
        if (!data) return;

        // Fetch group assignments for all workflows at once
        const wfIds = data.map((w: any) => w.id);
        const { data: groupAssignments } = wfIds.length > 0
            ? await supabase.from('workflow_line_group_assignments').select('workflow_id, line_group_id').in('workflow_id', wfIds)
            : { data: [] };

        const groupMap: Record<string, string[]> = {};
        (groupAssignments || []).forEach((ga: any) => {
            if (!groupMap[ga.workflow_id]) groupMap[ga.workflow_id] = [];
            groupMap[ga.workflow_id].push(ga.line_group_id);
        });

        setTemplates(data.map((w: any) => ({
            ...w,
            assigned_groups: groupMap[w.id] || [],
            steps: (w.workflow_steps || [])
                .sort((a: any, b: any) => a.step_order - b.step_order)
                .map((s: any) => ({
                    ...s,
                    estimated_minutes: s.config?.estimated_minutes ?? null,
                    suggested_role: s.config?.suggested_role ?? null,
                    name_en: s.config?.name_en ?? null,
                })),
        })));
    }

    async function loadInstances() {
        const { data: insts, error } = await supabase.from('workflow_instances')
            .select('id, name, status, started_at, assigned_user_id, workflows(name)')
            .eq('organization_id', orgId)
            .order('started_at', { ascending: false });
        if (error) console.error('loadInstances error:', error);
        if (!insts) return;

        // Batch-fetch group assignments for all instances
        const instIds = insts.map((i: any) => i.id);
        const { data: groupAssignments } = instIds.length > 0
            ? await supabase.from('workflow_instance_line_group_assignments').select('workflow_instance_id, line_group_id').in('workflow_instance_id', instIds)
            : { data: [] };

        const groupMap: Record<string, string[]> = {};
        (groupAssignments || []).forEach((ga: any) => {
            if (!groupMap[ga.workflow_instance_id]) groupMap[ga.workflow_instance_id] = [];
            groupMap[ga.workflow_instance_id].push(ga.line_group_id);
        });

        const enriched = [];
        for (const inst of insts) {
            const { data: tasks } = await supabase.from('tasks').select('status').eq('workflow_instance_id', inst.id);
            const summary: TaskSummary = { total: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0 };
            if (tasks) {
                summary.total = tasks.length;
                tasks.forEach((t: any) => { if (t.status in summary) (summary as any)[t.status]++; });
            }
            enriched.push({
                ...inst,
                workflow: (inst as any).workflows,
                taskSummary: summary,
                assigned_user_id: (inst as any).assigned_user_id ?? null,
                assigned_groups: groupMap[inst.id] || [],
            });
        }
        setInstances(enriched);
    }

    async function saveInstanceAssignment(instId: string) {
        await supabase.from('workflow_instances').update({ assigned_user_id: editInstUser || null }).eq('id', instId);
        await supabase.from('workflow_instance_line_group_assignments').delete().eq('workflow_instance_id', instId);
        if (editInstGroups.length > 0) {
            await supabase.from('workflow_instance_line_group_assignments').insert(
                editInstGroups.map(gid => ({ workflow_instance_id: instId, line_group_id: gid }))
            );
        }
        setInstances(prev => prev.map(i => i.id === instId
            ? { ...i, assigned_user_id: editInstUser || null, assigned_groups: editInstGroups }
            : i
        ));
        if (selectedInstance?.id === instId)
            setSelectedInstance(prev => prev ? { ...prev, assigned_user_id: editInstUser || null, assigned_groups: editInstGroups } : prev);
        setEditingInstAssign(null);
    }

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
        const { data } = await supabase.from('workflows')
            .select('id, name, description, status, workflow_steps(id, name, step_order, step_type, config)')
            .eq('id', selectedTemplate.id).single();
        if (data) setSelectedTemplate({ ...data, steps: ((data as any).workflow_steps || []).sort((a: any, b: any) => a.step_order - b.step_order) });
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

    async function updateTemplate() {
        if (!selectedTemplate || !editName.trim()) return;
        const { error } = await supabase.from('workflows').update({
            name: editName.trim(),
            description: editDesc.trim() || null,
            assigned_user_id: editAssignedUser || null,
        }).eq('id', selectedTemplate.id);
        if (error) { alert(`${zh ? '更新失敗：' : 'Update failed: '}${error.message}`); return; }

        // Sync group assignments: delete old, insert new
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
        const { data } = await supabase.from('workflows')
            .select('id, name, description, status, workflow_steps(id, name, description, step_order, step_type, config)')
            .eq('id', selectedTemplate!.id).single();
        if (data) setSelectedTemplate({ ...data, steps: ((data as any).workflow_steps || []).sort((a: any, b: any) => a.step_order - b.step_order) } as any);
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
                    if (selectedTemplate?.id === wf.id) setSelectedTemplate(null);
                    await Promise.all([loadTemplates(), loadInstances()]);
                } catch (err: any) {
                    alert(`${zh ? '刪除失敗：' : 'Delete failed: '}${err?.message || err}`);
                }
            }
        );
    }

    function deleteInstance(instId: string, instName: string) {
        withConfirm(
            zh ? `確定刪除流程「${instName}」？所有關聯任務也將一併刪除，無法復原。`
               : `Delete workflow "${instName}"? All associated tasks will also be deleted. This cannot be undone.`,
            async () => {
                try {
                    await supabase.from('tasks').delete().eq('workflow_instance_id', instId);
                    await supabase.from('workflow_instances').delete().eq('id', instId);
                    await loadInstances();
                } catch (err: any) {
                    alert(`${zh ? '刪除失敗：' : 'Delete failed: '}${err?.message || err}`);
                }
            }
        );
    }

    async function archiveInstance(instId: string) {
        const { error } = await supabase.from('workflow_instances').update({ status: 'archived' }).eq('id', instId);
        if (error) {
            console.error('archiveInstance error:', error);
            alert(`${zh ? '封存失敗：' : 'Archive failed: '}${error.message}`);
            return;
        }
        await loadInstances();
    }

    async function startInstance() {
        if (!showStartModal || !instanceName.trim()) return;
        const wf = showStartModal;
        const { data: instance, error } = await supabase.from('workflow_instances').insert({
            workflow_id: wf.id,
            organization_id: orgId,
            name: instanceName.trim(),
            status: 'running',
            store_id: selectedStoreId || null,
        }).select().single();
        if (error) { alert(`${zh ? '啟動失敗：' : 'Start failed: '}${error.message}`); return; }

        if (instance && wf.steps && wf.steps.length > 0) {
            const sortedSteps = [...wf.steps].sort((a, b) => a.step_order - b.step_order);
            // Create tasks for ALL steps upfront so they're all visible in the active workflow
            const tasksToInsert = sortedSteps.map(step => ({
                organization_id: orgId,
                workflow_instance_id: instance.id,
                workflow_step_id: step.id,
                title: step.name,
                description: step.description || null,
                status: 'pending',
                priority: 'medium',
                sort_order: step.step_order,
                store_id: selectedStoreId || null,
                assigned_to: (step.config as any)?.default_assignee_id || null,
            }));
            await supabase.from('tasks').insert(tasksToInsert);
            // Set current_step_id to first step
            await supabase.from('workflow_instances').update({ current_step_id: sortedSteps[0].id }).eq('id', instance.id);
        }
        setShowStartModal(null);
        setInstanceName('');
        setSelectedStoreId('');
        setShowAddStore(false);
        await loadInstances();
        setTab('active');
    }

    const statusLabel: Record<string, string> = {
        running:   zh ? '🔄 進行中' : '🔄 Running',
        completed: zh ? '✅ 已完成' : '✅ Completed',
        paused:    zh ? '⏸ 已暫停' : '⏸ Paused',
        cancelled: zh ? '❌ 已取消' : '❌ Cancelled',
        archived:  zh ? '📦 已封存' : '📦 Archived',
        draft:     zh ? '📝 草稿'   : '📝 Draft',
        active:    zh ? '🟢 已啟用' : '🟢 Active',
    };

    const activeInstances  = instances.filter(i => i.status === 'running' || i.status === 'paused');
    const archivedInstances = instances.filter(i => ['completed', 'cancelled', 'archived'].includes(i.status));

    const priorityBadge: Record<string, string> = {
        low: '🟢', medium: '🟡', high: '🔴', urgent: '🚨',
    };

    function InstanceCard({ inst, showArchive, selected }: { inst: WorkflowInstance; showArchive: boolean; selected: boolean }) {
        const progress = inst.taskSummary.total > 0
            ? Math.round((inst.taskSummary.completed / inst.taskSummary.total) * 100) : 0;
        const isEditingAssign = editingInstAssign === inst.id;

        return (
            <div className="card" style={{
                marginBottom: '10px', cursor: 'pointer',
                borderColor: selected ? 'var(--accent-primary)' : undefined,
            }} onClick={() => !isEditingAssign && loadInstanceTasks(inst)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{inst.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {inst.workflow?.name || '—'} · {new Date(inst.started_at).toLocaleDateString('zh-TW')}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                        <span style={{ fontSize: '12px' }}>{statusLabel[inst.status] || inst.status}</span>
                        <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                            onClick={e => {
                                e.stopPropagation();
                                if (isEditingAssign) { setEditingInstAssign(null); return; }
                                setEditInstUser(inst.assigned_user_id || '');
                                setEditInstGroups(inst.assigned_groups || []);
                                setEditingInstAssign(inst.id);
                            }}>
                            {isEditingAssign ? '✕' : '👤'}
                        </button>
                        {showArchive && inst.status === 'running' && (
                            <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                                onClick={e => { e.stopPropagation(); archiveInstance(inst.id); }}>
                                📦
                            </button>
                        )}
                        <button className="btn btn-sm" style={{ color: 'var(--accent-red)', background: 'var(--accent-red-dim)', padding: '2px 8px' }}
                            onClick={e => { e.stopPropagation(); deleteInstance(inst.id, inst.name || inst.workflow?.name || ''); }}>
                            🗑️
                        </button>
                    </div>
                </div>

                {/* Assignment badges (read mode) */}
                {!isEditingAssign && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', alignItems: 'center' }}>
                        {inst.assigned_user_id ? (
                            <span style={{ fontSize: '11px', background: 'var(--accent-blue-dim, #dbeafe)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '2px 7px' }}>
                                👤 {employees.find(e => e.id === inst.assigned_user_id)?.name || inst.assigned_user_id}
                            </span>
                        ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>👤 {zh ? '未指定負責人' : 'No user assigned'}</span>
                        )}
                        {(inst.assigned_groups || []).length > 0
                            ? (inst.assigned_groups || []).map(gid => {
                                const g = lineGroups.find(lg => lg.id === gid);
                                return (
                                    <span key={gid} style={{ fontSize: '11px', background: 'var(--accent-green-dim, #dcfce7)', color: 'var(--accent-green, #16a34a)', borderRadius: '8px', padding: '2px 7px' }}>
                                        👥 {g?.group_name || gid}
                                    </span>
                                );
                            })
                            : <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>👥 {zh ? '未指定群組' : 'No groups'}</span>
                        }
                    </div>
                )}

                {/* Inline assignment editor */}
                {isEditingAssign && (
                    <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', padding: '10px', marginBottom: '10px', border: '1px solid var(--border-color)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ marginBottom: '8px' }}>
                            <label className="detail-label">👤 {zh ? '指定負責人' : 'Assigned User'}</label>
                            <select className="select" style={{ width: '100%', fontSize: '12px' }}
                                value={editInstUser} onChange={e => setEditInstUser(e.target.value)}>
                                <option value="">{zh ? '— 不指定 —' : '— None —'}</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <label className="detail-label">👥 {zh ? '指定群組（可多選）' : 'Assigned Groups'}</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                                {editInstGroups.map(gid => {
                                    const g = lineGroups.find(lg => lg.id === gid);
                                    return (
                                        <span key={gid} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            {g?.group_name || gid}
                                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0', lineHeight: 1 }}
                                                onClick={() => setEditInstGroups(p => p.filter(id => id !== gid))}>✕</button>
                                        </span>
                                    );
                                })}
                            </div>
                            <select className="select" style={{ width: '100%', fontSize: '12px' }} value=""
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val && !editInstGroups.includes(val)) setEditInstGroups(p => [...p, val]);
                                    e.currentTarget.value = '';
                                }}>
                                <option value="">➕ {zh ? '新增群組...' : 'Add group...'}</option>
                                {lineGroups.filter(g => !editInstGroups.includes(g.id)).map(g =>
                                    <option key={g.id} value={g.id}>{g.group_name}</option>
                                )}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-sm btn-primary" onClick={() => saveInstanceAssignment(inst.id)}>{t('common.save')}</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => setEditingInstAssign(null)}>{t('common.cancel')}</button>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <div className="progress-bar" style={{ flex: 1 }}>
                        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)', minWidth: '36px', textAlign: 'right' }}>
                        {progress}%
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>⬜ {inst.taskSummary.pending}</span>
                    <span>🔄 {inst.taskSummary.in_progress}</span>
                    <span>✅ {inst.taskSummary.completed}</span>
                    <span>🚫 {inst.taskSummary.blocked}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{zh ? '共' : 'Total'} {inst.taskSummary.total}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>🔄 {t('workflow.title')}</h2>
                <p>{zh ? '管理流程範本及進行中的工作流程' : 'Manage workflow templates and active workflows'}</p>
            </div>

            <div className="page-body">
                {/* Tabs */}
                <div className="tab-bar" style={{ marginBottom: '20px' }}>
                    <button className={`tab-item ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
                        🗂 {zh ? '流程範本' : 'Templates'} ({templates.length})
                    </button>
                    <button className={`tab-item ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
                        🟢 {zh ? '進行中流程' : 'Active Workflows'} ({activeInstances.length})
                    </button>
                    <button className={`tab-item ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
                        🤖 {zh ? 'AI 助手' : 'AI Assistant'}
                    </button>
                    <button className={`tab-item ${tab === 'archive' ? 'active' : ''}`} onClick={() => setTab('archive')}>
                        📦 {zh ? '封存流程' : 'Archive'} ({archivedInstances.length})
                    </button>
                </div>

                {loading ? (
                    <p className="loading-pulse">{t('common.loading')}</p>

                ) : tab === 'templates' ? (
                    /* ==================== Templates Tab ==================== */
                    <div style={{ display: 'flex', gap: '20px' }}>
                        {/* Template list */}
                        <div style={{ flex: selectedTemplate ? '0 0 28%' : '1', minWidth: selectedTemplate ? '220px' : undefined }}>
                            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
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
                                            placeholder={zh ? '流程說明...' : 'Description...'} />
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

                            {templates.map(wf => (
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

                        {/* Step editor */}
                        {selectedTemplate && (
                            <div style={{ flex: showModifyAI ? '0 0 28%' : '0 0 68%', minWidth: '320px' }} className="fade-in">
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
                                                                    <span key={gid} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                                                            <option value="">➕ {zh ? '新增群組...' : 'Add group...'}</option>
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
                                                    <th style={{ width: '80px' }}>{zh ? '負責人' : 'Assignee'}</th>
                                                    <th style={{ width: '100px' }}>{zh ? '觸發步驟' : 'Triggers'}</th>
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
                                        const editingStep = selectedTemplate.steps.find(s => s.id === editingStepId);
                                        if (!editingStep) return null;
                                        return (
                                            <div style={{ background: 'var(--accent-primary-dim)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: '10px' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px', color: 'var(--accent-primary)' }}>
                                                    ✏️ {zh ? `編輯步驟 ${editingStep.step_order}: ${editingStep.name}` : `Edit Step ${editingStep.step_order}: ${editingStep.name}`}
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
                                                        style={{ minHeight: '56px', fontSize: '12px' }} placeholder={zh ? '步驟說明...' : 'Step description...'} />
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '10px' }}>
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
                                                    <div>
                                                        <label className="detail-label">{zh ? '負責人' : 'Assignee'}</label>
                                                        <select className="select" value={editStep.default_assignee_id} onChange={e => setEditStep(p => ({ ...p, default_assignee_id: e.target.value }))}>
                                                            <option value="">{zh ? '— 未指定 —' : '— Unassigned —'}</option>
                                                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
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
                                                                <span key={stepId} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                                                        <option value="">➕ {zh ? '新增觸發步驟...' : 'Add trigger step...'}</option>
                                                        {selectedTemplate.steps
                                                            .filter(s => s.id !== editingStepId && !editStep.triggers.includes(s.id))
                                                            .map(s => <option key={s.id} value={s.id}>步驟{s.step_order}: {s.name}</option>)}
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
                                            placeholder={zh ? '新增步驟名稱...' : 'Add step name...'} />
                                        <button className="btn btn-primary btn-sm" onClick={addStep}>➕</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* AI Modify panel */}
                        {selectedTemplate && showModifyAI && (
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
                                        const refreshSelected = async () => {
                                            const { data } = await supabase.from('workflows')
                                                .select('id, name, description, status, workflow_steps(id, name, description, step_order, step_type, config)')
                                                .eq('id', selectedTemplate.id).single();
                                            if (data) setSelectedTemplate({ ...data, steps: ((data as any).workflow_steps || []).sort((a: any, b: any) => a.step_order - b.step_order).map((s: any) => ({ ...s, estimated_minutes: s.config?.estimated_minutes ?? null, suggested_role: s.config?.suggested_role ?? null, name_en: s.config?.name_en ?? null })) } as any);
                                        };
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
                                        await refreshSelected();
                                    }}
                                />
                            </div>
                        )}
                    </div>

                ) : tab === 'active' ? (
                    /* ==================== Active Workflows Tab ==================== */
                    activeInstances.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔄</div>
                            <p>{zh ? '目前沒有進行中的流程。' : 'No active workflows running.'}</p>
                            <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={() => setTab('templates')}>
                                🗂 {zh ? '前往範本啟動流程' : 'Go to Templates to start one'}
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '20px' }}>
                            {/* Instance list */}
                            <div style={{ flex: selectedInstance ? '0 0 30%' : '1', minWidth: selectedInstance ? '220px' : undefined }}>
                                {activeInstances.map(inst => (
                                    <InstanceCard key={inst.id} inst={inst} showArchive={true} selected={selectedInstance?.id === inst.id} />
                                ))}
                            </div>

                            {/* Side panel */}
                            {selectedInstance && (
                                <div style={{ flex: '1', minWidth: '320px' }} className="fade-in">
                                    <div className="card" style={{ position: 'sticky', top: '20px' }}>
                                        {/* Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                            <div>
                                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '2px' }}>{selectedInstance.name}</h3>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                    {selectedInstance.workflow?.name || '—'} · {new Date(selectedInstance.started_at).toLocaleDateString('zh-TW')}
                                                </div>
                                            </div>
                                            <button className="btn btn-sm btn-secondary" onClick={() => { setSelectedInstance(null); setInstanceTasks([]); }}>✕</button>
                                        </div>

                                        {/* Assignment section */}
                                        <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingInstAssign === selectedInstance.id ? '10px' : '6px' }}>
                                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    {zh ? '指派' : 'Assignment'}
                                                </div>
                                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px', padding: '2px 8px' }}
                                                    onClick={() => {
                                                        if (editingInstAssign === selectedInstance.id) {
                                                            setEditingInstAssign(null);
                                                        } else {
                                                            setEditInstUser(selectedInstance.assigned_user_id || '');
                                                            setEditInstGroups(selectedInstance.assigned_groups || []);
                                                            setEditingInstAssign(selectedInstance.id);
                                                        }
                                                    }}>
                                                    {editingInstAssign === selectedInstance.id ? '✕' : `✏️ ${zh ? '編輯' : 'Edit'}`}
                                                </button>
                                            </div>

                                            {editingInstAssign === selectedInstance.id ? (
                                                <>
                                                    <div style={{ marginBottom: '8px' }}>
                                                        <label className="detail-label">👤 {zh ? '指定負責人' : 'Assigned User'}</label>
                                                        <select className="select" style={{ width: '100%', fontSize: '12px' }}
                                                            value={editInstUser} onChange={e => setEditInstUser(e.target.value)}>
                                                            <option value="">{zh ? '— 不指定 —' : '— None —'}</option>
                                                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div style={{ marginBottom: '8px' }}>
                                                        <label className="detail-label">👥 {zh ? '指定群組（可多選）' : 'Assigned Groups'}</label>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                                                            {editInstGroups.map(gid => {
                                                                const g = lineGroups.find(lg => lg.id === gid);
                                                                return (
                                                                    <span key={gid} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                        {g?.group_name || gid}
                                                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0', lineHeight: 1 }}
                                                                            onClick={() => setEditInstGroups(p => p.filter(id => id !== gid))}>✕</button>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                        <select className="select" style={{ width: '100%', fontSize: '12px' }} value=""
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                if (val && !editInstGroups.includes(val)) setEditInstGroups(p => [...p, val]);
                                                                e.currentTarget.value = '';
                                                            }}>
                                                            <option value="">➕ {zh ? '新增群組...' : 'Add group...'}</option>
                                                            {lineGroups.filter(g => !editInstGroups.includes(g.id)).map(g =>
                                                                <option key={g.id} value={g.id}>{g.group_name}</option>
                                                            )}
                                                        </select>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button className="btn btn-sm btn-primary" onClick={() => saveInstanceAssignment(selectedInstance.id)}>{t('common.save')}</button>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingInstAssign(null)}>{t('common.cancel')}</button>
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {selectedInstance.assigned_user_id ? (
                                                        <span style={{ fontSize: '11px', background: 'var(--accent-blue-dim, #dbeafe)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '2px 8px' }}>
                                                            👤 {employees.find(e => e.id === selectedInstance.assigned_user_id)?.name || selectedInstance.assigned_user_id}
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.7 }}>👤 {zh ? '未指定負責人' : 'No user assigned'}</span>
                                                    )}
                                                    {(selectedInstance.assigned_groups || []).length > 0
                                                        ? (selectedInstance.assigned_groups || []).map(gid => {
                                                            const g = lineGroups.find(lg => lg.id === gid);
                                                            return (
                                                                <span key={gid} style={{ fontSize: '11px', background: 'var(--accent-green-dim, #dcfce7)', color: 'var(--accent-green, #16a34a)', borderRadius: '8px', padding: '2px 8px' }}>
                                                                    👥 {g?.group_name || gid}
                                                                </span>
                                                            );
                                                        })
                                                        : <span style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.7 }}>👥 {zh ? '未指定群組' : 'No groups'}</span>
                                                    }
                                                </div>
                                            )}
                                        </div>

                                        {/* Progress */}
                                        {(() => {
                                            const s = selectedInstance.taskSummary;
                                            const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
                                            return (
                                                <div style={{ marginBottom: '14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                        <div className="progress-bar" style={{ flex: 1 }}>
                                                            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)' }}>{pct}%</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                        <span>⬜ {s.pending}</span>
                                                        <span>🔄 {s.in_progress}</span>
                                                        <span>✅ {s.completed}</span>
                                                        <span>🚫 {s.blocked}</span>
                                                        <span style={{ marginLeft: 'auto' }}>{zh ? '共' : 'Total'} {s.total}</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Tasks table */}
                                        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                                            📋 {zh ? '步驟任務' : 'Steps'} ({instanceTasks.length})
                                        </div>

                                        {instanceTasksLoading ? (
                                            <p className="loading-pulse">{t('common.loading')}</p>
                                        ) : instanceTasks.length === 0 ? (
                                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '16px' }}>
                                                {zh ? '尚無任務' : 'No tasks'}
                                            </p>
                                        ) : (
                                            <div style={{ overflowX: 'auto' }}>
                                                <table className="data-table" style={{ fontSize: '12px', margin: 0 }}>
                                                    <thead>
                                                        <tr>
                                                            <th style={{ width: '28px', textAlign: 'center' }}>#</th>
                                                            <th>{zh ? '任務名稱' : 'Task'}</th>
                                                            <th style={{ width: '110px' }}>{zh ? '負責人' : 'Assignee'}</th>
                                                            <th style={{ width: '110px' }}>{zh ? '狀態' : 'Status'}</th>
                                                            <th style={{ width: '72px' }}></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {instanceTasks.map(task => {
                                                            const edit = getTaskEdit(task);
                                                            const isDirty = !!taskEdits[task.id];
                                                            const isExpanded = expandedTaskId === task.id;
                                                            const hasNotes = !!(edit.notes ?? task.notes);
                                                            return (
                                                                <>
                                                                    <tr key={task.id} style={{
                                                                        opacity: edit.status === 'completed' ? 0.65 : 1,
                                                                        background: isExpanded ? 'var(--accent-primary-dim)' : isDirty ? 'var(--bg-secondary)' : undefined,
                                                                        borderBottom: isExpanded ? 'none' : undefined,
                                                                    }}>
                                                                        <td style={{ textAlign: 'center', color: 'var(--accent-primary)', fontWeight: 700 }}>
                                                                            {priorityBadge[task.priority] || ''} {task.sort_order ?? '—'}
                                                                        </td>
                                                                        <td style={{ fontWeight: edit.status === 'completed' ? 400 : 500 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                                <span style={{ textDecoration: edit.status === 'completed' ? 'line-through' : 'none', flex: 1 }}>
                                                                                    {task.title}
                                                                                </span>
                                                                                <button
                                                                                    title={zh ? '後續動作備註' : 'Follow-up notes'}
                                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', borderRadius: '3px', fontSize: '12px', color: hasNotes ? 'var(--accent-primary)' : 'var(--text-muted)', opacity: isExpanded ? 1 : 0.6, flexShrink: 0 }}
                                                                                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}>
                                                                                    {isExpanded ? '▴' : (hasNotes ? '📝' : '📝')}
                                                                                </button>
                                                                            </div>
                                                                            {task.due_date && (
                                                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>📅 {task.due_date.slice(0, 10)}</div>
                                                                            )}
                                                                        </td>
                                                                        <td>
                                                                            <select className="select" style={{ fontSize: '11px', padding: '2px 4px', width: '100%' }}
                                                                                value={edit.assigned_to ?? ''}
                                                                                onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, assigned_to: e.target.value || null } }))}>
                                                                                <option value="">{zh ? '— 未指定 —' : '— Unassigned —'}</option>
                                                                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                                                                            </select>
                                                                        </td>
                                                                        <td>
                                                                            <select className="select" style={{ fontSize: '11px', padding: '2px 4px', width: '100%' }}
                                                                                value={edit.status}
                                                                                onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, status: e.target.value } }))}>
                                                                                <option value="pending">{zh ? '⬜ 待處理' : '⬜ Pending'}</option>
                                                                                <option value="in_progress">{zh ? '🔄 進行中' : '🔄 In Progress'}</option>
                                                                                <option value="completed">{zh ? '✅ 已完成' : '✅ Completed'}</option>
                                                                                <option value="blocked">{zh ? '🚫 封鎖' : '🚫 Blocked'}</option>
                                                                            </select>
                                                                        </td>
                                                                        <td>
                                                                            {isDirty ? (
                                                                                <button className="btn btn-sm btn-primary" style={{ fontSize: '10px', padding: '2px 6px', whiteSpace: 'nowrap' }}
                                                                                    onClick={() => saveTaskEdit(task.id)}>
                                                                                    {zh ? '更新' : 'Update'}
                                                                                </button>
                                                                            ) : (
                                                                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '2px 6px', whiteSpace: 'nowrap', opacity: 0.5 }}
                                                                                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}>
                                                                                    📝
                                                                                </button>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                    {/* Follow-up notes row */}
                                                                    {isExpanded && (
                                                                        <tr key={`${task.id}-notes`} style={{ background: 'var(--accent-primary-dim)' }}>
                                                                            <td colSpan={5} style={{ padding: '8px 12px 10px 36px', borderTop: 'none' }}>
                                                                                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                                                                                    📝 {zh ? '後續動作備註' : 'Follow-up Action'}
                                                                                </div>
                                                                                <textarea
                                                                                    rows={2}
                                                                                    placeholder={zh ? '記錄後續行動、注意事項或備忘...' : 'Record follow-up actions, notes or reminders...'}
                                                                                    style={{ width: '100%', fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                                                                                    value={edit.notes ?? ''}
                                                                                    onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, notes: e.target.value || null } }))}
                                                                                />
                                                                                <div style={{ display: 'flex', gap: '6px', marginTop: '5px' }}>
                                                                                    <button className="btn btn-sm btn-primary" style={{ fontSize: '10px', padding: '2px 10px' }}
                                                                                        onClick={() => { saveTaskEdit(task.id); setExpandedTaskId(null); }}>
                                                                                        💾 {zh ? '儲存' : 'Save'}
                                                                                    </button>
                                                                                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '2px 8px' }}
                                                                                        onClick={() => setExpandedTaskId(null)}>
                                                                                        {zh ? '關閉' : 'Close'}
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )

                ) : tab === 'ai' ? (
                    /* ==================== AI Assistant Tab ==================== */
                    <div style={{ height: '620px' }}>
                        <WorkflowAIChat onApprove={async (suggestion) => {
                            const { data: wf } = await supabase.from('workflows').insert({
                                organization_id: orgId,
                                name: suggestion.name,
                                description: suggestion.description,
                                status: 'active',
                            }).select().single();
                            if (!wf) throw new Error('Failed to create workflow');

                            // Insert steps first without resolved triggers/assignees
                            const stepsToInsert = suggestion.steps.map(s => ({
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
                            // Check insert error explicitly
                            const { error: stepInsertErr } = await supabase.from('workflow_steps').insert(stepsToInsert);
                            if (stepInsertErr) throw new Error(`步驟新增失敗: ${stepInsertErr.message}`);

                            // Fetch inserted steps with their IDs to resolve triggers & assignees
                            const { data: insertedSteps } = await supabase
                                .from('workflow_steps')
                                .select('id, name, step_order, config')
                                .eq('workflow_id', wf.id)
                                .order('step_order');

                            if (insertedSteps && insertedSteps.length > 0) {
                                const orderToId: Record<number, string> = {};
                                const nameToId: Record<string, string> = {};
                                insertedSteps.forEach(s => {
                                    orderToId[s.step_order] = s.id;
                                    nameToId[s.name.trim().toLowerCase()] = s.id;
                                });

                                // Sorted step orders for sequential auto-population
                                const sortedOrders = insertedSteps
                                    .map(s => s.step_order)
                                    .sort((a, b) => a - b);

                                const updatePromises = suggestion.steps.map(sugStep => {
                                    const ins = insertedSteps.find(s => s.step_order === sugStep.step_order);
                                    if (!ins) return null;

                                    // Resolve explicit trigger_step_orders / trigger_refs → step IDs
                                    const rawRefs: (string | number)[] = [
                                        ...(sugStep.trigger_step_orders || []),
                                        ...(sugStep.trigger_refs || []),
                                    ];
                                    const resolvedTriggers = rawRefs.map(ref => {
                                        const num = typeof ref === 'number' ? ref : parseInt(String(ref).trim());
                                        if (!isNaN(num) && orderToId[num]) return orderToId[num];
                                        return nameToId[String(ref).trim().toLowerCase()] || '';
                                    }).filter(Boolean);

                                    // Auto-populate sequential trigger if no explicit triggers defined
                                    let finalTriggers = resolvedTriggers;
                                    if (finalTriggers.length === 0) {
                                        const currentIdx = sortedOrders.indexOf(sugStep.step_order);
                                        if (currentIdx >= 0 && currentIdx < sortedOrders.length - 1) {
                                            const nextId = orderToId[sortedOrders[currentIdx + 1]];
                                            if (nextId) finalTriggers = [nextId];
                                        }
                                        // Last step — no trigger, leave empty
                                    }

                                    // Match owner_name → employee ID
                                    const ownerName = (sugStep.owner_name || '').trim().toLowerCase();
                                    const matchedEmp = ownerName
                                        ? employees.find(e =>
                                            e.name.toLowerCase().includes(ownerName) ||
                                            ownerName.includes(e.name.toLowerCase()))
                                        : null;

                                    if (!finalTriggers.length && !matchedEmp) return null;

                                    return supabase.from('workflow_steps').update({
                                        config: {
                                            ...(ins.config as Record<string, unknown> || {}),
                                            ...(finalTriggers.length ? { triggers: finalTriggers } : {}),
                                            ...(matchedEmp ? { default_assignee_id: matchedEmp.id } : {}),
                                        },
                                    }).eq('id', ins.id);
                                }).filter(Boolean);

                                if (updatePromises.length) await Promise.all(updatePromises);
                            }

                            // Reload templates list and auto-select the new template directly from DB
                            await loadTemplates();
                            const { data: freshWf } = await supabase
                                .from('workflows')
                                .select('id, name, description, status, workflow_steps(id, name, description, step_order, step_type, config)')
                                .eq('id', wf.id)
                                .single();
                            if (freshWf) {
                                setSelectedTemplate({
                                    ...(freshWf as any),
                                    steps: (((freshWf as any).workflow_steps || []) as any[])
                                        .sort((a: any, b: any) => a.step_order - b.step_order)
                                        .map((s: any) => ({
                                            ...s,
                                            estimated_minutes: s.config?.estimated_minutes ?? null,
                                            suggested_role: s.config?.suggested_role ?? null,
                                            name_en: s.config?.name_en ?? null,
                                        })),
                                });
                            }
                            setTab('templates');
                        }} />
                    </div>

                ) : (
                    /* ==================== Archive Tab ==================== */
                    archivedInstances.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📦</div>
                            <p>{zh ? '尚無封存的流程。' : 'No archived workflows yet.'}</p>
                        </div>
                    ) : (
                        archivedInstances.map(inst => <InstanceCard key={inst.id} inst={inst} showArchive={false} selected={false} />)
                    )
                )}

                {/* Start Instance Modal */}
                {showStartModal && (
                    <div className="modal-overlay" onClick={() => { setShowStartModal(null); setShowAddStore(false); }}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                                ▶️ {zh ? '啟動流程' : 'Start Workflow'}
                            </h3>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                {zh
                                    ? `使用「${showStartModal.name}」範本（${showStartModal.steps?.length} 個步驟）建立新的進行中流程。`
                                    : `Create a new active workflow from "${showStartModal.name}" (${showStartModal.steps?.length} steps).`}
                            </p>
                            <div style={{ marginBottom: '14px' }}>
                                <label className="detail-label">{zh ? '流程名稱' : 'Workflow Name'}</label>
                                <input className="input-field" value={instanceName} onChange={e => setInstanceName(e.target.value)}
                                    placeholder={zh ? '例：2024年3月開店' : 'e.g.: March 2024 Store Opening'} autoFocus />
                            </div>
                            <div style={{ marginBottom: '14px' }}>
                                <label className="detail-label">{zh ? '門市' : 'Store'}</label>
                                <select className="select" value={selectedStoreId} onChange={e => setSelectedStoreId(e.target.value)}
                                    style={{ width: '100%' }}>
                                    <option value="">{zh ? '— 不指定門市 —' : '— No store —'}</option>
                                    {stores.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}{s.store_code ? ` (${s.store_code})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <button className="btn btn-sm btn-secondary" style={{ marginTop: '6px', fontSize: '12px' }}
                                    onClick={() => setShowAddStore(p => !p)}>
                                    ➕ {zh ? '新增門市' : 'Add new store'}
                                </button>
                            </div>
                            {showAddStore && (
                                <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '14px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                                        🏪 {zh ? '新增門市' : 'New Store'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <div style={{ flex: 2 }}>
                                            <label className="detail-label">{zh ? '門市名稱' : 'Store Name'}</label>
                                            <input className="input-field" value={newStoreName} onChange={e => setNewStoreName(e.target.value)}
                                                placeholder={zh ? '例：信義旗艦店' : 'e.g.: Xinyi Flagship'} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label className="detail-label">{zh ? '代碼（選填）' : 'Code (opt.)'}</label>
                                            <input className="input-field" value={newStoreCode} onChange={e => setNewStoreCode(e.target.value)}
                                                placeholder="S001" />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button className="btn btn-sm btn-primary" onClick={addStore} disabled={!newStoreName.trim()}>
                                            {t('common.save')}
                                        </button>
                                        <button className="btn btn-sm btn-secondary" onClick={() => setShowAddStore(false)}>
                                            {t('common.cancel')}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => { setShowStartModal(null); setShowAddStore(false); }}>{t('common.cancel')}</button>
                                <button className="btn btn-primary" onClick={startInstance} disabled={!instanceName.trim()}>
                                    ▶️ {zh ? '啟動' : 'Start'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {confirmDialog && (
                    <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                            <p style={{ fontSize: '14px', marginBottom: '20px', lineHeight: 1.6 }}>{confirmDialog.msg}</p>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => setConfirmDialog(null)}>
                                    {zh ? '取消' : 'Cancel'}
                                </button>
                                <button className="btn" style={{ background: 'var(--accent-red)', color: '#fff', border: 'none' }}
                                    onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }}>
                                    {zh ? '確定刪除' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
