import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';
import { writeAuditLog } from '../lib/auditLog';
import { WorkflowAIChat } from '../components/WorkflowAIChat';
import { mapTaskRows, loadTaskConfirmations } from '../lib/workflowHelpers';
import { TemplateTab } from '../components/Workflows/TemplateTab';
import { InstanceTab } from '../components/Workflows/InstanceTab';
import { ArchiveTab } from '../components/Workflows/ArchiveTab';
import type {
    Workflow, WorkflowInstance, InstanceTask, TaskConfirmation,
    TaskEdit, TaskSummary, Employee, LineGroup, Store, ConfirmDialogState,
} from '../types/workflows';

export function Workflows() {
    const [tab, setTab] = useState<'templates' | 'active' | 'ai' | 'archive'>('active');
    const [templates, setTemplates] = useState<Workflow[]>([]);
    const [instances, setInstances] = useState<WorkflowInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState<Workflow | null>(null);
    const [showStartModal, setShowStartModal] = useState<Workflow | null>(null);
    const [instanceName, setInstanceName] = useState('');
    const [selectedStoreId, setSelectedStoreId] = useState('');
    const [stores, setStores] = useState<Store[]>([]);
    const [showAddStore, setShowAddStore] = useState(false);
    const [newStoreName, setNewStoreName] = useState('');
    const [newStoreCode, setNewStoreCode] = useState('');
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);
    const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
    const [editingInstAssign, setEditingInstAssign] = useState<string | null>(null);
    const [editInstUser, setEditInstUser] = useState('');
    const [editInstGroups, setEditInstGroups] = useState<string[]>([]);
    const [instanceTasks, setInstanceTasks] = useState<InstanceTask[]>([]);
    const [instanceTasksLoading, setInstanceTasksLoading] = useState(false);
    const [taskEdits, setTaskEdits] = useState<Record<string, TaskEdit>>({});
    const [instanceSearch, setInstanceSearch] = useState('');
    // Confirmation flow
    const [taskConfirmations, setTaskConfirmations] = useState<Record<string, TaskConfirmation[]>>({});
    // Archive detail state — kept for future archive detail view
    // const [selectedArchiveInstance, setSelectedArchiveInstance] = useState<WorkflowInstance | null>(null);
    // const [archiveTasks, setArchiveTasks] = useState<InstanceTask[]>([]);
    // const [archiveTasksLoading, setArchiveTasksLoading] = useState(false);

    const zh = getLocale() === 'zh-TW';
    const { orgId, currentUser } = useOrg();

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
        let { data, error } = await supabase
            .from('tasks')
            .select('id, title, description, status, priority, sort_order, due_date, planned_start, completed_at, updated_at, created_at, assigned_to, workflow_step_id, notes, metadata, store_id, confirmation_required, confirmation_status, reminder_at, stores(id, name), workflow_steps(step_type)')
            .eq('workflow_instance_id', inst.id)
            .order('sort_order', { ascending: true });
        if (error) {
            console.warn('loadInstanceTasks: retrying with basic columns', error.message);
            const fallback = await supabase
                .from('tasks')
                .select('id, title, status, priority, sort_order, due_date, assigned_to, workflow_step_id, notes, workflow_steps(step_type)')
                .eq('workflow_instance_id', inst.id)
                .order('sort_order', { ascending: true });
            data = fallback.data as any;
        }
        const mapped = mapTaskRows(data || []);
        setInstanceTasks(mapped);
        // Batch-load confirmations for tasks that require them
        const confirmTaskIds = mapped.filter(t => t.confirmation_required).map(t => t.id);
        await loadTaskConfirmations(confirmTaskIds, setTaskConfirmations);
        setInstanceTasksLoading(false);
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
            .select('id, name, status, started_at, assigned_user_id, store_id, workflows(name)')
            .eq('organization_id', orgId)
            .order('started_at', { ascending: false });
        if (error) console.error('loadInstances error:', error);
        if (!insts) return;

        const instIds = insts.map((i: any) => i.id);
        const { data: groupAssignments } = instIds.length > 0
            ? await supabase.from('workflow_instance_line_group_assignments').select('workflow_instance_id, line_group_id').in('workflow_instance_id', instIds)
            : { data: [] };

        const groupMap: Record<string, string[]> = {};
        (groupAssignments || []).forEach((ga: any) => {
            if (!groupMap[ga.workflow_instance_id]) groupMap[ga.workflow_instance_id] = [];
            groupMap[ga.workflow_instance_id].push(ga.line_group_id);
        });

        const { data: allTasks } = instIds.length > 0
            ? await supabase.from('tasks').select('workflow_instance_id, status, due_date').in('workflow_instance_id', instIds)
            : { data: [] };

        const now = new Date();
        const summaryMap: Record<string, TaskSummary> = {};
        instIds.forEach(id => { summaryMap[id] = { total: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0, overdue: 0 }; });
        (allTasks || []).forEach((t: any) => {
            const s = summaryMap[t.workflow_instance_id];
            if (s) {
                s.total++;
                if (t.status in s) (s as any)[t.status]++;
                if (t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < now) {
                    s.overdue++;
                }
            }
        });

        const enriched = insts.map((inst: any) => ({
            ...inst,
            workflow: inst.workflows,
            taskSummary: summaryMap[inst.id] || { total: 0, pending: 0, in_progress: 0, completed: 0, blocked: 0 },
            assigned_user_id: inst.assigned_user_id ?? null,
            assigned_groups: groupMap[inst.id] || [],
        }));
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

    function deleteInstance(instId: string, instName: string) {
        withConfirm(
            zh ? `確定刪除流程「${instName}」？所有關聯任務也將一併刪除，無法復原。`
               : `Delete workflow "${instName}"? All associated tasks will also be deleted. This cannot be undone.`,
            async () => {
                try {
                    await supabase.from('tasks').delete().eq('workflow_instance_id', instId);
                    await supabase.from('workflow_instances').delete().eq('id', instId);
                    writeAuditLog({
                        organization_id: orgId,
                        user_id: currentUser?.id,
                        user_name: currentUser?.name,
                        action: 'delete',
                        module: 'workflow',
                        table_name: 'workflow_instances',
                        record_id: instId,
                        record_label: instName,
                    });
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
            const tasksToInsert = sortedSteps.map(step => ({
                organization_id: orgId,
                workflow_instance_id: instance.id,
                workflow_step_id: step.id,
                title: step.name,
                description: step.description || null,
                status: 'pending',
                priority: (step.config as any)?.default_priority || 'medium',
                sort_order: step.step_order,
                store_id: (step.config as any)?.default_store_id || selectedStoreId || null,
                assigned_to: (step.config as any)?.default_assignee_id || null,
                confirmation_required: !!(step.config as any)?.requires_confirmation,
            }));
            await supabase.from('tasks').insert(tasksToInsert);
            await supabase.from('workflow_instances').update({ current_step_id: sortedSteps[0].id }).eq('id', instance.id);
            // Create confirmation records for steps that require approval
            const { data: insertedTasks } = await supabase.from('tasks')
                .select('id, workflow_step_id')
                .eq('workflow_instance_id', instance.id);
            if (insertedTasks) {
                const confirmInserts: { task_id: string; approver_id: string }[] = [];
                for (const task of insertedTasks) {
                    const step = sortedSteps.find(s => s.id === task.workflow_step_id);
                    const approverIds = Array.isArray((step?.config as any)?.confirmation_approver_ids)
                        ? ((step!.config as any).confirmation_approver_ids as string[]).filter(Boolean) : [];
                    for (const appId of approverIds) {
                        confirmInserts.push({ task_id: task.id, approver_id: appId });
                    }
                }
                if (confirmInserts.length > 0) {
                    await supabase.from('task_confirmations').insert(confirmInserts);
                    const taskIdsWithConfirm = [...new Set(confirmInserts.map(c => c.task_id))];
                    await supabase.from('tasks').update({ confirmation_status: 'pending', confirmation_requested_at: new Date().toISOString() }).in('id', taskIdsWithConfirm);
                }
            }
        }
        writeAuditLog({
            organization_id: orgId,
            user_id: currentUser?.id,
            user_name: currentUser?.name,
            action: 'create',
            module: 'workflow',
            table_name: 'workflow_instances',
            record_id: instance.id,
            record_label: instanceName.trim(),
            new_values: { workflow_id: wf.id, workflow_name: wf.name, store_id: selectedStoreId || null },
        });
        setShowStartModal(null);
        setInstanceName('');
        setSelectedStoreId('');
        setShowAddStore(false);
        await loadInstances();
        setTab('active');
    }

    // --- Computed values ---
    const activeInstances = instances.filter(i => i.status === 'running' || i.status === 'paused');
    const archivedInstances = instances.filter(i => ['completed', 'cancelled', 'archived'].includes(i.status));

    const filteredActive = activeInstances.filter(inst => {
        if (!instanceSearch.trim()) return true;
        const q = instanceSearch.toLowerCase();
        return inst.name.toLowerCase().includes(q) || (inst.workflow?.name || '').toLowerCase().includes(q);
    });
    const filteredArchived = archivedInstances.filter(inst => {
        if (!instanceSearch.trim()) return true;
        const q = instanceSearch.toLowerCase();
        return inst.name.toLowerCase().includes(q) || (inst.workflow?.name || '').toLowerCase().includes(q);
    });

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>🔄 {t('workflow.title')}</h2>
                <p>{zh ? '管理流程範本及進行中的工作流程' : 'Manage workflow templates and active workflows'}</p>
            </div>

            <div className="page-body">
                {/* Tabs */}
                <div className="tab-bar" style={{ marginBottom: '20px' }}>
                    <button className={`tab-item ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
                        🟢 {zh ? '進行中流程' : 'Active Workflows'} ({filteredActive.length})
                    </button>
                    <button className={`tab-item ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
                        🗂 {zh ? '流程範本' : 'Templates'} ({templates.length})
                    </button>
                    <button className={`tab-item ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
                        🤖 {zh ? 'AI 助手' : 'AI Assistant'}
                    </button>
                    <button className={`tab-item ${tab === 'archive' ? 'active' : ''}`} onClick={() => setTab('archive')}>
                        📦 {zh ? '封存流程' : 'Archive'} ({filteredArchived.length})
                    </button>
                </div>

                {loading ? (
                    <p className="loading-pulse">{t('common.loading')}</p>

                ) : tab === 'active' ? (
                    <InstanceTab
                        instances={instances}
                        employees={employees}
                        lineGroups={lineGroups}
                        stores={stores}
                        selectedInstance={selectedInstance}
                        setSelectedInstance={setSelectedInstance}
                        setInstances={setInstances}
                        instanceTasks={instanceTasks}
                        setInstanceTasks={setInstanceTasks}
                        instanceTasksLoading={instanceTasksLoading}
                        taskEdits={taskEdits}
                        setTaskEdits={setTaskEdits}
                        taskConfirmations={taskConfirmations}
                        setTaskConfirmations={setTaskConfirmations}
                        loadInstanceTasks={loadInstanceTasks}
                        archiveInstance={archiveInstance}
                        deleteInstance={deleteInstance}
                        saveInstanceAssignment={saveInstanceAssignment}
                        editingInstAssign={editingInstAssign}
                        setEditingInstAssign={setEditingInstAssign}
                        editInstUser={editInstUser}
                        setEditInstUser={setEditInstUser}
                        editInstGroups={editInstGroups}
                        setEditInstGroups={setEditInstGroups}
                        instanceSearch={instanceSearch}
                        setInstanceSearch={setInstanceSearch}
                        filteredActive={filteredActive}
                        setTab={setTab}
                    />

                ) : tab === 'templates' ? (
                    <TemplateTab
                        templates={templates}
                        employees={employees}
                        lineGroups={lineGroups}
                        stores={stores}
                        selectedTemplate={selectedTemplate}
                        setSelectedTemplate={setSelectedTemplate}
                        loadTemplates={loadTemplates}
                        loadInstances={loadInstances}
                        setTab={setTab}
                        setShowStartModal={setShowStartModal}
                        setInstanceName={setInstanceName}
                        setSelectedStoreId={setSelectedStoreId}
                        setShowAddStore={setShowAddStore}
                        withConfirm={withConfirm}
                    />

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
                            const { error: stepInsertErr } = await supabase.from('workflow_steps').insert(stepsToInsert);
                            if (stepInsertErr) throw new Error(`步驟新增失敗: ${stepInsertErr.message}`);

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

                                const sortedOrders = insertedSteps
                                    .map(s => s.step_order)
                                    .sort((a, b) => a - b);

                                const updatePromises = suggestion.steps.map(sugStep => {
                                    const ins = insertedSteps.find(s => s.step_order === sugStep.step_order);
                                    if (!ins) return null;

                                    const rawRefs: (string | number)[] = [
                                        ...(sugStep.trigger_step_orders || []),
                                        ...(sugStep.trigger_refs || []),
                                    ];
                                    const resolvedTriggers = rawRefs.map(ref => {
                                        const num = typeof ref === 'number' ? ref : parseInt(String(ref).trim());
                                        if (!isNaN(num) && orderToId[num]) return orderToId[num];
                                        return nameToId[String(ref).trim().toLowerCase()] || '';
                                    }).filter(Boolean);

                                    let finalTriggers = resolvedTriggers;
                                    if (finalTriggers.length === 0) {
                                        const currentIdx = sortedOrders.indexOf(sugStep.step_order);
                                        if (currentIdx >= 0 && currentIdx < sortedOrders.length - 1) {
                                            const nextId = orderToId[sortedOrders[currentIdx + 1]];
                                            if (nextId) finalTriggers = [nextId];
                                        }
                                    }

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
                    <ArchiveTab
                        filteredArchived={filteredArchived}
                        employees={employees}
                        lineGroups={lineGroups}
                        instanceSearch={instanceSearch}
                        setInstanceSearch={setInstanceSearch}
                        loadInstanceTasks={loadInstanceTasks}
                        archiveInstance={archiveInstance}
                        deleteInstance={deleteInstance}
                        editingInstAssign={editingInstAssign}
                        setEditingInstAssign={setEditingInstAssign}
                        editInstUser={editInstUser}
                        setEditInstUser={setEditInstUser}
                        editInstGroups={editInstGroups}
                        setEditInstGroups={setEditInstGroups}
                        saveInstanceAssignment={saveInstanceAssignment}
                    />
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
