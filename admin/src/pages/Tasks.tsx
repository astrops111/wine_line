import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';
import { TaskAIChat } from '../components/TaskAIChat';
import type { TaskAction } from '../components/TaskAIChat';

interface Task {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    sort_order: number | null;
    due_date: string | null;
    planned_start: string | null;
    completed_at: string | null;
    updated_at: string | null;
    created_at: string;
    assigned_user: { id: string; name: string } | null;
    workflow_step: { name: string; step_order: number } | null;
    store: { id: string; name: string } | null;
    workflow_instance: { id: string; name: string } | null;
    store_id: string | null;
    workflow_instance_id: string | null;
    metadata: Record<string, unknown> | null;
    trigger_actions?: string[] | null;
    note1?: string | null;
    note2?: string | null;
    note3?: string | null;
}

interface TaskComment {
    id: string;
    content: string;
    source: string;
    created_at: string;
    user: { name: string } | null;
}

interface User {
    id: string;
    name: string;
}

interface Store {
    id: string;
    name: string;
}

interface WorkflowInstance {
    id: string;
    name: string;
    status: string;
    workflow_id: string | null;
    current_step_id: string | null;
    started_at: string;
    store: { name: string } | null;
    current_step?: { name: string } | null;
}

interface WorkflowTemplate {
    id: string;
    name: string;
    description: string | null;
    status: string;
    created_at: string;
    steps?: { id: string; name: string }[];
}

export function Tasks() {
    const { orgId } = useOrg();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [workflowInstances, setWorkflowInstances] = useState<WorkflowInstance[]>([]);
    const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'tasks' | 'workflows' | 'templates' | 'mgmt'>('tasks');

    // Filters
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterStore, setFilterStore] = useState('all');
    const [filterWorkflowTemplate, setFilterWorkflowTemplate] = useState('all');
    const [filterWorkflow, setFilterWorkflow] = useState('all');
    const [filterBucket, setFilterBucket] = useState('all');

    // Quick create state
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newPriority, setNewPriority] = useState('medium');
    const [newAssignee, setNewAssignee] = useState('');
    const [newStore, setNewStore] = useState('');
    const [newWorkflow, setNewWorkflow] = useState('');
    const [newBucket, setNewBucket] = useState('General');

    // Right Panels
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [showAI, setShowAI] = useState(false);

    // Local edits (staged until Save)
    type LocalEdits = {
        status: string; priority: string; assigned_to: string;
        store_id: string; workflow_instance_id: string;
        planned_start: string; due_date: string; bucket: string;
        note1: string; note2: string; note3: string;
        trigger_actions: string[];
    };
    const [localEdits, setLocalEdits] = useState<LocalEdits | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    function patchEdit(patch: Partial<LocalEdits>) {
        setLocalEdits(p => p ? { ...p, ...patch } : null);
        setIsDirty(true);
    }
    const [buckets, setBuckets] = useState<string[]>(['General', 'Personal', 'Workflow']);
    const [showBucketModal, setShowBucketModal] = useState(false);
    const [newBucketName, setNewBucketName] = useState('');
    const [bucketEdits, setBucketEdits] = useState<Record<string, string>>({});

    // Comments
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{ msg: string; onConfirm: () => void } | null>(null);
    const [importModal, setImportModal] = useState<{ template: WorkflowTemplate } | null>(null);
    const [importStoreId, setImportStoreId] = useState('');

    // Inline workflow assignment from table row
    const [inlineAssignTaskId, setInlineAssignTaskId] = useState<string | null>(null);

    async function assignWorkflowInline(taskId: string, workflowInstanceId: string) {
        await supabase.from('tasks').update({
            workflow_instance_id: workflowInstanceId || null,
            updated_at: new Date().toISOString(),
        }).eq('id', taskId);
        setInlineAssignTaskId(null);
        await loadTasks();
    }
    const zh = getLocale() === 'zh-TW';

    function withConfirm(msg: string, action: () => void) {
        setConfirmDialog({ msg, onConfirm: action });
    }

    useEffect(() => {
        if (orgId) {
            loadTasks();
            loadDependencies();
        }
    }, [orgId]);

    useEffect(() => {
        if (!orgId) return;
        const key = `task_buckets_${orgId}`;
        const raw = localStorage.getItem(key);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) setBuckets(parsed);
            } catch {
                // ignore bad local data
            }
        }
    }, [orgId]);

    useEffect(() => {
        if (!orgId) return;
        const key = `task_buckets_${orgId}`;
        localStorage.setItem(key, JSON.stringify(buckets));
    }, [orgId, buckets]);

    async function loadDependencies() {
        const [
            { data: userData },
            { data: storeData },
            { data: instanceData },
            { data: templateData }
        ] = await Promise.all([
            supabase.from('users').select('id, name').eq('organization_id', orgId),
            supabase.from('stores').select('id, name').eq('organization_id', orgId),
            supabase.from('workflow_instances').select('id, name, status, workflow_id, current_step_id, started_at, store:stores(name), current_step:workflow_steps(name)').eq('organization_id', orgId).order('started_at', { ascending: false }),
            supabase.from('workflows').select('*, steps:workflow_steps(id, name)').eq('organization_id', orgId).order('name')
        ]);

        if (userData) setUsers(userData);
        if (storeData) setStores(storeData);
        if (instanceData) setWorkflowInstances(instanceData as any);
        if (templateData) setTemplates(templateData);
    }

    async function loadTasks() {
        setLoading(true);
        const { data, error } = await supabase.from('tasks')
            .select(`
                id, title, description, status, priority, sort_order, due_date, planned_start, completed_at, updated_at, created_at, metadata,
                store_id, workflow_instance_id,
                users!tasks_assigned_to_fkey(id, name),
                workflow_steps(name, step_order),
                stores(id, name),
                workflow_instances(id, name)
            `)
            .eq('organization_id', orgId)
            .order('sort_order', { ascending: true });

        if (error) console.error('loadTasks error:', error);
        if (data) {
            setTasks(data.map((t: any) => ({
                ...t,
                assigned_user: t.users,
                workflow_step: t.workflow_steps,
                store: t.stores,
                workflow_instance: t.workflow_instances,
                trigger_actions: Array.isArray(t.metadata?.trigger_actions)
                    ? t.metadata.trigger_actions.filter(Boolean)
                    : null,
                planned_start: t.planned_start ?? t.metadata?.plan_start ?? null,
                note1: t.metadata?.note1 ?? null,
                note2: t.metadata?.note2 ?? null,
                note3: t.metadata?.note3 ?? null,
            })));
        }
        setLoading(false);
    }


    async function triggerNextWorkflowStep(completedTask: Task) {
        const { workflow_instance_id, workflow_step } = completedTask;
        const currentOrder = workflow_step?.step_order ?? 0;

        // Get the workflow instance
        const { data: instance } = await supabase
            .from('workflow_instances')
            .select('workflow_id, organization_id, store_id')
            .eq('id', workflow_instance_id!)
            .single();
        if (!instance?.workflow_id) return;

        // Get the completed step's config to check for explicit triggers
        const { data: completedStepData } = await supabase
            .from('workflow_steps')
            .select('id, config')
            .eq('workflow_id', instance.workflow_id)
            .eq('step_order', currentOrder)
            .maybeSingle();

        const explicitTriggers: string[] = Array.isArray(completedStepData?.config?.triggers)
            ? (completedStepData!.config!.triggers as string[]).filter((s: string) => s.trim())
            : [];

        const triggerStepIds = explicitTriggers.length > 0
            ? explicitTriggers
            : await (async () => {
                // Fallback: sequential — find next step by order
                const { data: nextStep } = await supabase
                    .from('workflow_steps')
                    .select('id')
                    .eq('workflow_id', instance.workflow_id)
                    .gt('step_order', currentOrder)
                    .order('step_order', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                return nextStep ? [nextStep.id] : [];
            })();

        if (triggerStepIds.length === 0) return;

        const notifMsg = zh
            ? `此任務由「步驟 ${currentOrder}: ${completedTask.workflow_step?.name || ''}」完成後自動觸發。`
            : `Auto-triggered after completing "Step ${currentOrder}: ${completedTask.workflow_step?.name || ''}".`;

        for (const stepId of triggerStepIds) {
            // Avoid duplicates
            const { data: existing } = await supabase
                .from('tasks')
                .select('id')
                .eq('workflow_instance_id', workflow_instance_id!)
                .eq('workflow_step_id', stepId)
                .maybeSingle();
            if (existing) continue;

            // Get step details
            const { data: step } = await supabase
                .from('workflow_steps')
                .select('id, name, description, step_order, config')
                .eq('id', stepId)
                .maybeSingle();
            if (!step) continue;

            // Create the task, assigning from step config if set
            const { data: newTask } = await supabase.from('tasks').insert({
                organization_id: instance.organization_id,
                workflow_instance_id: workflow_instance_id!,
                workflow_step_id: step.id,
                title: step.name,
                description: step.description || null,
                status: 'pending',
                priority: 'medium',
                sort_order: step.step_order,
                store_id: instance.store_id || null,
                assigned_to: (step.config?.default_assignee_id as string) || null,
            }).select('id').single();

            // System notification as task comment
            if (newTask) {
                await supabase.from('task_comments').insert({
                    task_id: newTask.id,
                    content: notifMsg,
                    source: 'system',
                });
            }

            // Update workflow current_step pointer
            await supabase.from('workflow_instances')
                .update({ current_step_id: step.id })
                .eq('id', workflow_instance_id!);
        }
    }

    async function updateTaskMetadata(taskId: string, nextMetadata: Record<string, unknown>) {
        await supabase.from('tasks').update({ metadata: nextMetadata, updated_at: new Date().toISOString() }).eq('id', taskId);
        setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, metadata: nextMetadata } : t)));
        if (selectedTask?.id === taskId) {
            setSelectedTask(prev => (prev ? { ...prev, metadata: nextMetadata } : prev));
        }
    }

    async function createTask() {
        if (!newTitle.trim()) return;
        await supabase.from('tasks').insert({
            organization_id: orgId,
            title: newTitle.trim(),
            priority: newPriority,
            assigned_to: newAssignee || null,
            store_id: newStore || null,
            workflow_instance_id: newWorkflow || null,
            status: 'pending',
            metadata: { bucket: newBucket },
        });
        setNewTitle('');
        setNewStore('');
        setNewWorkflow('');
        setShowCreate(false);
        loadTasks();
    }

    async function handleAIApprove(actions: TaskAction[]) {
        for (const act of actions) {
            try {
                if (act.type === 'CREATE_TASK') {
                    await supabase.from('tasks').insert({
                        organization_id: orgId,
                        ...act.payload,
                        status: 'pending',
                    });
                } else if (act.type === 'UPDATE_TASK') {
                    await supabase.from('tasks').update({ ...act.payload, updated_at: new Date().toISOString() }).eq('id', act.payload.id);
                } else if (act.type === 'DELETE_TASK') {
                    await supabase.from('tasks').delete().eq('id', act.payload.id);
                }
            } catch (err) {
                console.error('Action failed', act, err);
                throw new Error(`Failed to execute: ${act.description}`);
            }
        }
        await loadTasks();
        setShowAI(false);
    }

    async function doOpenTaskDetail(task: Task) {
        setShowAI(false);
        setSelectedTask(task);
        setIsDirty(false);
        setLocalEdits({
            status: task.status,
            priority: task.priority,
            assigned_to: task.assigned_user?.id || '',
            store_id: task.store_id || '',
            workflow_instance_id: task.workflow_instance_id || '',
            planned_start: task.planned_start?.split('T')[0] || '',
            due_date: task.due_date?.split('T')[0] || '',
            bucket: getBucket(task),
            note1: task.note1 || '',
            note2: task.note2 || '',
            note3: task.note3 || '',
            trigger_actions: normalizeTriggers(task.trigger_actions),
        });
        setLoadingComments(true);
        const { data } = await supabase.from('task_comments')
            .select('id, content, source, created_at, users(name)')
            .eq('task_id', task.id)
            .order('created_at', { ascending: true });
        setComments((data || []).map((c: any) => ({ ...c, user: c.users })));
        setLoadingComments(false);
    }

    function openTaskDetail(task: Task) {
        if (isDirty) {
            setConfirmDialog({
                msg: zh ? '有未儲存的變更，確定要放棄？' : 'You have unsaved changes. Discard them?',
                onConfirm: () => { setIsDirty(false); setLocalEdits(null); doOpenTaskDetail(task); },
            });
            return;
        }
        doOpenTaskDetail(task);
    }

    function closePanel() {
        if (isDirty) {
            setConfirmDialog({
                msg: zh ? '有未儲存的變更，確定要放棄？' : 'You have unsaved changes. Discard them?',
                onConfirm: () => { setSelectedTask(null); setIsDirty(false); setLocalEdits(null); },
            });
            return;
        }
        setSelectedTask(null);
    }

    async function saveTaskEdits() {
        if (!selectedTask || !localEdits) return;
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        updates.status = localEdits.status;
        updates.priority = localEdits.priority;
        updates.assigned_to = localEdits.assigned_to || null;
        updates.store_id = localEdits.store_id || null;
        updates.workflow_instance_id = localEdits.workflow_instance_id || null;
        updates.planned_start = localEdits.planned_start ? new Date(localEdits.planned_start).toISOString() : null;
        updates.due_date = localEdits.due_date ? new Date(localEdits.due_date).toISOString() : null;
        if (localEdits.status === 'completed' && selectedTask.status !== 'completed') {
            updates.completed_at = new Date().toISOString();
        } else if (localEdits.status !== 'completed') {
            updates.completed_at = null;
        }
        updates.metadata = {
            ...(selectedTask.metadata || {}),
            bucket: localEdits.bucket,
            note1: localEdits.note1 || null,
            note2: localEdits.note2 || null,
            note3: localEdits.note3 || null,
            trigger_actions: localEdits.trigger_actions,
        };
        await supabase.from('tasks').update(updates).eq('id', selectedTask.id);
        if (localEdits.status === 'completed' && selectedTask.status !== 'completed') {
            const taskForTrigger = { ...selectedTask, status: 'completed' };
            if (taskForTrigger.workflow_instance_id && taskForTrigger.workflow_step) {
                await triggerNextWorkflowStep(taskForTrigger);
            }
        }
        setIsDirty(false);
        await loadTasks();
    }

    async function addComment() {
        if (!newComment.trim() || !selectedTask) return;
        await supabase.from('task_comments').insert({
            task_id: selectedTask.id,
            content: newComment.trim(),
            source: 'web',
        });
        setNewComment('');
        openTaskDetail(selectedTask);
    }

    async function deleteTask(taskId: string) {
        withConfirm(
            zh ? '確定要刪除此任務？此操作無法復原。' : 'Delete this task? This cannot be undone.',
            async () => {
                await supabase.from('tasks').delete().eq('id', taskId);
                setSelectedTask(null);
                loadTasks();
            }
        );
    }

    async function importWorkflow(template: WorkflowTemplate, storeId: string) {
        setImportModal(null);
        setLoading(true);
        try {
            const { data: instance, error: instError } = await supabase.from('workflow_instances').insert({
                organization_id: orgId,
                workflow_id: template.id,
                name: `${template.name} - ${new Date().toLocaleDateString()}`,
                store_id: storeId || null,
                status: 'running',
            }).select().single();
            if (instError) throw instError;

            const { data: steps } = await supabase.from('workflow_steps').select('*').eq('workflow_id', template.id);
            if (steps && steps.length > 0) {
                await supabase.from('tasks').insert(steps.map(s => ({
                    organization_id: orgId,
                    workflow_instance_id: instance.id,
                    workflow_step_id: s.id,
                    title: s.name,
                    description: s.description || null,
                    status: 'pending',
                    priority: 'medium',
                    sort_order: s.step_order,
                    store_id: storeId || null,
                })));
            }

            await loadDependencies();
            await loadTasks();
            setActiveTab('tasks');
            setFilterWorkflowTemplate(template.id);
            setFilterWorkflow(instance.id);
        } catch (err: any) {
            console.error('Import failed', err);
            alert(`Import failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }

    const getBucket = (task: Task): string => {
        const metaBucket = task.metadata && (task.metadata as any).bucket;
        if (metaBucket) return String(metaBucket);
        return task.workflow_instance_id ? 'Workflow' : 'General';
    };

    const displayBuckets = Array.from(new Set([
        ...buckets,
        ...tasks.map(getBucket),
    ]));

    // Apply filters
    const filtered = tasks.filter(t => {
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        if (filterStore !== 'all' && t.store_id !== filterStore) return false;
        if (filterWorkflow !== 'all' && t.workflow_instance_id !== filterWorkflow) return false;
        if (filterBucket !== 'all' && getBucket(t) !== filterBucket) return false;
        return true;
    });

    const statusLabel: Record<string, string> = {
        pending: t('status.pending'), in_progress: t('status.in_progress'),
        completed: t('status.completed'), blocked: t('status.blocked'), cancelled: t('status.cancelled'),
    };
    const priorityLabel: Record<string, string> = {
        low: t('priority.low'), medium: t('priority.medium'),
        high: t('priority.high'), urgent: t('priority.urgent'),
    };
    const priorityIcon: Record<string, string> = { low: '🔵', medium: '🟡', high: '🟠', urgent: '🔴' };
    const sourceIcon: Record<string, string> = { web: '🌐', line: '📱', system: '⚙️' };
    const normalizeTriggers = (val: unknown): string[] => Array.isArray(val) ? val.map(String) : val ? [String(val)] : [];

    return (
        <div className="fade-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2>📋 {t('task.title')}</h2>
                    <p>{zh ? `共 ${tasks.length} 個任務，已顯示 ${filtered.length} 個` : `${filtered.length} of ${tasks.length} tasks`}</p>
                </div>
                <button
                    className={`btn ${showAI ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={() => { setShowAI(!showAI); setSelectedTask(null); }}
                    style={{ background: showAI ? undefined : 'linear-gradient(135deg, #10b981, #3b82f6)', border: showAI ? undefined : 'none' }}>
                    {showAI ? (zh ? '關閉 AI' : 'Close AI') : '🤖 AI Assistant'}
                </button>
            </div>

            <div className="tab-bar" style={{ marginBottom: '20px' }}>
                <button className={`tab-item ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
                    📋 {zh ? '待辦任務' : 'Active Tasks'}
                </button>
                <button className={`tab-item ${activeTab === 'workflows' ? 'active' : ''}`} onClick={() => setActiveTab('workflows')}>
                    🔄 {zh ? '進行中的流程' : 'Active Workflows'}
                </button>
                <button className={`tab-item ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
                    📑 {zh ? '流程範本' : 'Workflow Templates'}
                </button>
                <button className={`tab-item ${activeTab === 'mgmt' ? 'active' : ''}`} onClick={() => setActiveTab('mgmt')}>
                    ⚙️ {zh ? '流程管理' : 'Management'}
                </button>
            </div>

            <div className="page-body" style={{ display: 'flex', gap: '20px' }}>
                {/* Left: Content Area */}
                <div style={{ flex: (selectedTask || showAI) ? '0 0 55%' : '1' }}>
                    {(() => {
                        if (activeTab === 'tasks') {
                            return (
                                <>
                    {/* Buckets */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'center' }}>
                        <button className={`btn btn-sm ${filterBucket === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterBucket('all')}>
                            {zh ? '全部' : 'All'}
                        </button>
                        {displayBuckets.map(b => (
                            <button key={b} className={`btn btn-sm ${filterBucket === b ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterBucket(b)}>
                                {b}
                            </button>
                        ))}
                        <div style={{ flex: 1 }} />
                        <button className="btn btn-sm btn-secondary" onClick={() => setShowBucketModal(true)}>
                            {zh ? '管理分類' : 'Manage Buckets'}
                        </button>
                    </div>

                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select className="select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="all">{zh ? '狀態: 全部' : 'Status: All'}</option>
                            {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <select className="select" value={filterStore} onChange={e => setFilterStore(e.target.value)}>
                            <option value="all">{zh ? '門市: 全部' : 'Store: All'}</option>
                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select className="select" value={filterWorkflowTemplate} onChange={e => {
                            setFilterWorkflowTemplate(e.target.value);
                            setFilterWorkflow('all');
                        }}>
                            <option value="all">{zh ? '流程類型: 全部' : 'Template: All'}</option>
                            {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                        </select>
                        <select className="select" value={filterWorkflow} onChange={e => setFilterWorkflow(e.target.value)}>
                            <option value="all">{zh ? '流程實例: 全部' : 'Instance: All'}</option>
                            {(filterWorkflowTemplate === 'all'
                                ? workflowInstances
                                : workflowInstances.filter(w => w.workflow_id === filterWorkflowTemplate)
                            ).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        <select className="select" value={filterBucket} onChange={e => setFilterBucket(e.target.value)}>
                            <option value="all">{zh ? '分類: 全部' : 'Bucket: All'}</option>
                            {displayBuckets.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>

                        <div style={{ flex: 1 }} />
                        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
                            ➕ {t('task.create')}
                        </button>
                    </div>

                    {/* Quick Create */}
                    {showCreate && (
                        <div className="card" style={{ marginBottom: '16px', borderLeft: '4px solid var(--accent-primary)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) auto', gap: '12px', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div>
                                        <input className="input-field" style={{ width: '100%' }} value={newTitle} onChange={e => setNewTitle(e.target.value)}
                                            placeholder={zh ? '輸入任務標題…' : 'Enter task title…'} onKeyDown={e => e.key === 'Enter' && createTask()} autoFocus />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <select className="select" style={{ flex: 1, minWidth: '110px' }} value={newPriority} onChange={e => setNewPriority(e.target.value)}>
                                            {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{priorityIcon[k]} {v}</option>)}
                                        </select>
                                        <select className="select" style={{ flex: 1, minWidth: '120px' }} value={newBucket} onChange={e => setNewBucket(e.target.value)}>
                                            {displayBuckets.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                        <select className="select" style={{ flex: 1, minWidth: '120px' }} value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
                                            <option value="">{zh ? '未指定' : 'Unassigned'}</option>
                                            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                        <select className="select" style={{ flex: 1, minWidth: '120px' }} value={newStore} onChange={e => setNewStore(e.target.value)}>
                                            <option value="">{zh ? '不指定門市' : 'No Store'}</option>
                                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                        <select className="select" style={{ flex: 1, minWidth: '120px' }} value={newWorkflow} onChange={e => setNewWorkflow(e.target.value)}>
                                            <option value="">{zh ? '不選擇流程' : 'No Workflow'}</option>
                                            {workflowInstances.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', justifyContent: 'center' }}>
                                    <button className="btn btn-primary" style={{ padding: '12px 20px' }} onClick={createTask}>💾 {t('common.save')}</button>
                                    <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tasks Table */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center' }}><p className="loading-pulse">{t('common.loading')}</p></div>
                        ) : filtered.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.5 }}>📭</div>
                                <div>{t('common.no_data')}</div>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                            <table className="data-table" style={{ margin: 0, minWidth: '1100px', fontSize: '12px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '36px' }}>#</th>
                                        <th style={{ minWidth: '160px' }}>{zh ? '任務名稱' : 'Task'}</th>
                                        <th style={{ minWidth: '120px' }}>{zh ? '流程' : 'Workflow'}</th>
                                        <th style={{ width: '90px' }}>{zh ? '負責人' : 'Assignee'}</th>
                                        <th style={{ width: '90px' }}>{zh ? '計畫開始日' : 'Plan Start'}</th>
                                        <th style={{ width: '90px' }}>{zh ? '計畫完成日' : 'Plan End'}</th>
                                        <th style={{ width: '90px' }}>{zh ? '實際完成日' : 'Completed'}</th>
                                        <th style={{ width: '88px' }}>{zh ? '狀態' : 'Status'}</th>
                                        <th style={{ width: '100px' }}>{zh ? '備註1' : 'Note 1'}</th>
                                        <th style={{ width: '100px' }}>{zh ? '備註2' : 'Note 2'}</th>
                                        <th style={{ width: '100px' }}>{zh ? '備註3' : 'Note 3'}</th>
                                        <th style={{ width: '90px' }}>{zh ? '更新時間' : 'Updated'}</th>
                                        <th style={{ width: '120px' }}>Trigger</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((task, idx) => (
                                        <tr key={task.id} onClick={() => openTaskDetail(task)} tabIndex={0} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { () => openTaskDetail(task); } }}
                                            style={{
                                                cursor: 'pointer',
                                                background: selectedTask?.id === task.id ? 'var(--accent-primary-dim)' : undefined,
                                                borderLeft: selectedTask?.id === task.id ? '3px solid var(--accent-primary)' : '3px solid transparent'
                                            }}>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{task.sort_order || idx + 1}</td>
                                            <td>
                                                <div style={{ fontWeight: 500 }}>{task.title}</div>
                                            </td>
                                            <td style={{ fontSize: '11px' }} onClick={e => e.stopPropagation()}>
                                                {inlineAssignTaskId === task.id ? (
                                                    <select
                                                        autoFocus
                                                        className="select"
                                                        style={{ fontSize: '11px', padding: '2px 6px', minWidth: '140px' }}
                                                        defaultValue={task.workflow_instance_id || ''}
                                                        onChange={e => assignWorkflowInline(task.id, e.target.value)}
                                                        onBlur={() => setInlineAssignTaskId(null)}>
                                                        <option value="">{zh ? '— 移除流程 —' : '— Remove workflow —'}</option>
                                                        {workflowInstances.map(w => (
                                                            <option key={w.id} value={w.id}>{w.name}</option>
                                                        ))}
                                                    </select>
                                                ) : task.workflow_instance?.name ? (
                                                    <span
                                                        style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                                        title={zh ? '點擊更換流程' : 'Click to change workflow'}
                                                        onClick={() => setInlineAssignTaskId(task.id)}>
                                                        🔄 {task.workflow_instance.name}
                                                    </span>
                                                ) : (
                                                    <button
                                                        style={{ background: 'none', border: '1px dashed var(--border-color)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer' }}
                                                        onClick={() => setInlineAssignTaskId(task.id)}>
                                                        + {zh ? '指定流程' : 'Assign'}
                                                    </button>
                                                )}
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)' }}>
                                                {task.assigned_user?.name || <span style={{ opacity: 0.4 }}>—</span>}
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)' }}>
                                                {task.planned_start ? new Date(task.planned_start).toLocaleDateString('zh-TW') : <span style={{ opacity: 0.4 }}>—</span>}
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)' }}>
                                                {task.due_date ? new Date(task.due_date).toLocaleDateString('zh-TW') : <span style={{ opacity: 0.4 }}>—</span>}
                                            </td>
                                            <td style={{ color: task.completed_at ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                                {task.completed_at ? new Date(task.completed_at).toLocaleDateString('zh-TW') : <span style={{ opacity: 0.4 }}>—</span>}
                                            </td>
                                            <td>
                                                <span className={`status-badge ${task.status}`} style={{ fontSize: '10px' }}>
                                                    {statusLabel[task.status]}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)', maxWidth: '100px' }}>
                                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.note1 || ''}>
                                                    {task.note1 || <span style={{ opacity: 0.3 }}>—</span>}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)', maxWidth: '100px' }}>
                                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.note2 || ''}>
                                                    {task.note2 || <span style={{ opacity: 0.3 }}>—</span>}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)', maxWidth: '100px' }}>
                                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.note3 || ''}>
                                                    {task.note3 || <span style={{ opacity: 0.3 }}>—</span>}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                                                {task.updated_at ? new Date(task.updated_at).toLocaleDateString('zh-TW') : <span style={{ opacity: 0.4 }}>—</span>}
                                            </td>
                                            <td>
                                                {(() => {
                                                    const trs = normalizeTriggers(task.trigger_actions);
                                                    if (trs.length === 0) return <span style={{ opacity: 0.3, fontSize: '11px' }}>—</span>;
                                                    const shown = trs.slice(0, 2);
                                                    return (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                                            {shown.map((id, i) => {
                                                                const label = tasks.find(t => t.id === id)?.title || id.slice(0, 6);
                                                                return <span key={i} style={{ background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)', borderRadius: '8px', padding: '1px 5px', fontSize: '10px', color: 'var(--text-muted)' }}>{label}</span>;
                                                            })}
                                                            {trs.length > 2 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+{trs.length - 2}</span>}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        )}
                    </div>
                                </>
                            );
                        } else if (activeTab === 'workflows') {
                            return (
                                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                    <table className="data-table" style={{ margin: 0 }}>
                                        <thead>
                                            <tr>
                                                <th>{zh ? '流程' : 'Workflow'}</th>
                                                <th>{zh ? '門市' : 'Store'}</th>
                                                <th>{zh ? '目前步驟' : 'Current Step'}</th>
                                                <th>{zh ? '狀態' : 'Status'}</th>
                                                <th>{zh ? '開始時間' : 'Started'}</th>
                                                <th>{zh ? '操作' : 'Actions'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {workflowInstances.length === 0 ? (
                                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('common.no_data')}</td></tr>
                                            ) : (
                                                workflowInstances.map(inst => (
                                                    <tr key={inst.id}>
                                                        <td style={{ fontWeight: 600 }}>{inst.name}</td>
                                                        <td>{inst.store?.name || '—'}</td>
                                                        <td>{inst.current_step?.name || '—'}</td>
                                                        <td><span className={`status-badge ${inst.status}`}>{inst.status}</span></td>
                                                        <td style={{ fontSize: '12px' }}>{new Date(inst.started_at).toLocaleString('zh-TW')}</td>
                                                        <td>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => {
                                                                setFilterWorkflowTemplate(inst.workflow_id || 'all');
                                                                setFilterWorkflow(inst.id);
                                                                setActiveTab('tasks');
                                                            }}>
                                                                {zh ? '查看任務' : 'View Tasks'}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        } else if (activeTab === 'templates') {
                            return (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                    {templates.map(tpl => (
                                        <div key={tpl.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>{tpl.name}</h3>
                                            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>{tpl.description}</p>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                📌 {tpl.steps?.length || 0} {zh ? '個步驟' : 'steps'}
                                            </div>
                                            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                                                <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => { setImportModal({ template: tpl }); setImportStoreId(''); }}>
                                                    📥 {zh ? '匯入至門市' : 'Import to Store'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        } else if (activeTab === 'mgmt') {
                            return (
                                <div className="card">
                                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>{zh ? '流程自動化管理' : 'Workflow Automation'}</h3>
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        {zh ? '此模組用於設定及管理標準作業程序（Standard Operating Procedures）。' : 'Manage your Standard Operating Procedures and automation rules here.'}
                                    </p>
                                    <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                        <div style={{ padding: '16px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--outline-variant)' }}>
                                            <div style={{ fontSize: '24px', marginBottom: '8px' }}>🤖</div>
                                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{zh ? 'AI 生成' : 'AI Generation'}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '透過 AI 建立 SOP' : 'Create SOPs via AI'}</div>
                                        </div>
                                        <div style={{ padding: '16px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--outline-variant)' }}>
                                            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
                                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{zh ? '執行分析' : 'Execution Analytics'}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '分析執行效率' : 'Analyze efficiency'}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>

                {/* Right Panel: AI Chat */}
                {showAI && (
                    <div style={{ flex: '0 0 42%', minWidth: '380px', height: 'calc(100vh - 160px)', position: 'sticky', top: '20px' }} className="fade-in">
                        <TaskAIChat onApprove={handleAIApprove} />
                    </div>
                )}

                {/* Right Panel: Task Detail */}
                {selectedTask && !showAI && (
                    <div style={{ flex: '0 0 42%', minWidth: '340px' }} className="fade-in">
                        <div className="card" style={{ position: 'sticky', top: '20px' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3 style={{ fontSize: '16px', fontWeight: 600, lineHeight: 1.4 }}>{selectedTask.title}</h3>
                                    {isDirty && <div style={{ fontSize: '11px', color: 'var(--accent-yellow, #f59e0b)', marginTop: '2px' }}>● {zh ? '有未儲存的變更' : 'Unsaved changes'}</div>}
                                </div>
                                <button className="btn btn-sm btn-secondary" aria-label="關閉" onClick={closePanel} style={{ flexShrink: 0 }}>✕</button>
                            </div>

                            {/* Editable Fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label className="detail-label">{t('task.status')}</label>
                                    <select className="select" style={{ width: '100%' }} value={localEdits?.status ?? selectedTask.status}
                                        onChange={e => patchEdit({ status: e.target.value })}>
                                        {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{t('task.priority')}</label>
                                    <select className="select" style={{ width: '100%' }} value={localEdits?.priority ?? selectedTask.priority}
                                        onChange={e => patchEdit({ priority: e.target.value })}>
                                        {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className="detail-label">{t('task.assigned_to')}</label>
                                    <select className="select" style={{ width: '100%' }} value={localEdits?.assigned_to ?? selectedTask.assigned_user?.id ?? ''}
                                        onChange={e => patchEdit({ assigned_to: e.target.value })}>
                                        <option value="">{zh ? '未指定' : 'Unassigned'}</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label className="detail-label">{zh ? '分類' : 'Bucket'}</label>
                                    <select className="select" style={{ width: '100%' }}
                                        value={localEdits?.bucket ?? getBucket(selectedTask)}
                                        onChange={e => patchEdit({ bucket: e.target.value })}>
                                        {displayBuckets.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '歸屬門市' : 'Store'}</label>
                                    <select className="select" style={{ width: '100%' }} value={localEdits?.store_id ?? selectedTask.store_id ?? ''}
                                        onChange={e => patchEdit({ store_id: e.target.value })}>
                                        <option value="">{zh ? '不指定門市' : 'No Store'}</option>
                                        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '工作流' : 'Workflow'}</label>
                                    <select className="select" style={{ width: '100%' }} value={localEdits?.workflow_instance_id ?? selectedTask.workflow_instance_id ?? ''}
                                        onChange={e => patchEdit({ workflow_instance_id: e.target.value })}>
                                        <option value="">{zh ? '無' : 'None'}</option>
                                        {workflowInstances.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '計畫開始日' : 'Plan Start'}</label>
                                    <input type="date" className="select" style={{ width: '100%' }}
                                        value={localEdits?.planned_start ?? selectedTask.planned_start?.split('T')[0] ?? ''}
                                        onChange={e => patchEdit({ planned_start: e.target.value })} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '計畫完成日' : 'Plan End'}</label>
                                    <input type="date" className="select" style={{ width: '100%' }}
                                        value={localEdits?.due_date ?? selectedTask.due_date?.split('T')[0] ?? ''}
                                        onChange={e => patchEdit({ due_date: e.target.value })} />
                                </div>
                                {/* Notes */}
                                {(['note1', 'note2', 'note3'] as const).map((nk, ni) => (
                                    <div key={nk} style={{ gridColumn: '1 / -1' }}>
                                        <label className="detail-label">{zh ? `備註${ni + 1}` : `Note ${ni + 1}`}</label>
                                        <input className="input-field" style={{ width: '100%' }}
                                            value={localEdits?.[nk] ?? selectedTask[nk] ?? ''}
                                            placeholder={zh ? `備註${ni + 1}.…` : `Note ${ni + 1}.…`}
                                            onChange={e => patchEdit({ [nk]: e.target.value })} />
                                    </div>
                                ))}
                            </div>

                            {/* Info row */}
                            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                                <span>ID: {selectedTask.id.substring(0, 8)}</span>
                                <span>{zh ? '建立' : 'Created'}: {new Date(selectedTask.created_at).toLocaleDateString('zh-TW')}</span>
                                {selectedTask.completed_at && <span>✅ {new Date(selectedTask.completed_at).toLocaleDateString('zh-TW')}</span>}
                            </div>

                            {/* Save button */}
                            <div style={{ marginBottom: '16px' }}>
                                <button className="btn btn-primary" style={{ width: '100%', opacity: isDirty ? 1 : 0.45, cursor: isDirty ? 'pointer' : 'default' }}
                                    onClick={saveTaskEdits} disabled={!isDirty}>
                                    💾 {zh ? '儲存變更' : 'Save Changes'}
                                </button>
                            </div>

                            {/* Trigger Actions — editable */}
                            {(() => {
                                const currentTriggers = localEdits?.trigger_actions ?? normalizeTriggers(selectedTask.trigger_actions);
                                // Candidate tasks: same workflow instance (if any), excluding self and already-added
                                const candidateTasks = tasks.filter(t =>
                                    t.id !== selectedTask.id &&
                                    !currentTriggers.includes(t.id) &&
                                    (selectedTask.workflow_instance_id
                                        ? t.workflow_instance_id === selectedTask.workflow_instance_id
                                        : !t.workflow_instance_id)
                                );
                                const addTrigger = (taskId: string) => {
                                    if (!taskId || currentTriggers.includes(taskId)) return;
                                    patchEdit({ trigger_actions: [...currentTriggers, taskId] });
                                };
                                const removeTrigger = (taskId: string) => {
                                    patchEdit({ trigger_actions: currentTriggers.filter(id => id !== taskId) });
                                };
                                return (
                                    <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px', marginBottom: '16px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                                            🔔 {zh ? '觸發動作（完成時執行）' : 'Trigger Actions (on complete)'}
                                        </div>
                                        {/* Current triggers as removable badges — show task title */}
                                        {currentTriggers.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                                {currentTriggers.map(taskId => {
                                                    const tgt = tasks.find(t => t.id === taskId);
                                                    const label = tgt ? `→ ${tgt.sort_order ? tgt.sort_order + '. ' : ''}${tgt.title}` : `→ ${taskId.slice(0, 8)}`;
                                                    return (
                                                        <span key={taskId} style={{ background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)', borderRadius: '12px', padding: '3px 8px', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            {label}
                                                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: '0 2px', lineHeight: 1 }}
                                                                onClick={() => removeTrigger(taskId)}>✕</button>
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {/* Dropdown to add trigger */}
                                        <select className="select" style={{ width: '100%', fontSize: '12px' }} value=""
                                            onChange={e => { addTrigger(e.target.value); e.currentTarget.value = ''; }}>
                                            <option value="">➕ {zh ? '新增觸發任務…' : 'Add trigger task…'}</option>
                                            {candidateTasks.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.sort_order ? `${t.sort_order}. ` : ''}{t.title}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                );
                            })()}

                            {/* Comments */}
                            <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '16px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
                                    💬 {t('task.comments')} ({comments.length})
                                </div>

                                {loadingComments ? (
                                    <p className="loading-pulse" style={{ fontSize: '12px' }}>{t('common.loading')}</p>
                                ) : comments.length === 0 ? (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>{zh ? '尚無備註' : 'No comments yet'}</p>
                                ) : (
                                    <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '12px' }}>
                                        {comments.map(c => (
                                            <div key={c.id} style={{ marginBottom: '10px', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: 500, color: 'var(--accent-blue)' }}>
                                                        {sourceIcon[c.source] || '💬'} {c.user?.name || (zh ? '系統' : 'System')}
                                                    </span>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                                                        {new Date(c.created_at).toLocaleString('zh-TW')}
                                                    </span>
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.content}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add comment */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input className="input-field" style={{ flex: 1 }} value={newComment}
                                        onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()}
                                        placeholder={zh ? '輸入備註…' : 'Add a comment…'} />
                                    <button className="btn btn-primary btn-sm" onClick={addComment}>
                                        {zh ? '送出' : 'Send'}
                                    </button>
                                </div>
                            </div>

                            {/* Delete */}
                            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--outline-variant)', textAlign: 'right' }}>
                                <button className="btn btn-sm" style={{ color: 'var(--accent-red)', background: 'var(--accent-red-dim)' }}
                                    onClick={() => deleteTask(selectedTask.id)}>
                                    🗑️ {t('common.delete')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {importModal && (
                <div className="modal-overlay" onClick={() => setImportModal(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
                            📥 {zh ? `匯入「${importModal.template.name}」` : `Import "${importModal.template.name}"`}
                        </h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            {zh ? `將建立 ${importModal.template.steps?.length || 0} 個任務。` : `Will create ${importModal.template.steps?.length || 0} tasks.`}
                        </p>
                        <div style={{ marginBottom: '16px' }}>
                            <label className="detail-label">{zh ? '指定門市（選填）' : 'Assign to Store (optional)'}</label>
                            <select className="select" style={{ width: '100%' }} value={importStoreId} onChange={e => setImportStoreId(e.target.value)}>
                                <option value="">{zh ? '不指定門市' : 'No specific store'}</option>
                                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setImportModal(null)}>{zh ? '取消' : 'Cancel'}</button>
                            <button className="btn btn-primary" onClick={() => importWorkflow(importModal.template, importStoreId)}>
                                📥 {zh ? '確認匯入' : 'Import'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {confirmDialog && (
                <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
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
            {showBucketModal && (
                <div className="modal-overlay" onClick={() => setShowBucketModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
                            {zh ? '管理任務分類' : 'Manage Task Buckets'}
                        </h3>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            <input
                                className="input-field"
                                value={newBucketName}
                                onChange={e => setNewBucketName(e.target.value)}
                                placeholder={zh ? '新分類名稱…' : 'New bucket name…'}
                            />
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    const name = newBucketName.trim();
                                    if (!name || buckets.includes(name)) return;
                                    setBuckets(prev => [...prev, name]);
                                    setNewBucketName('');
                                }}
                            >
                                {zh ? '新增' : 'Add'}
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {displayBuckets.map(b => (
                                <div key={b} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <input
                                        className="input-field"
                                        value={bucketEdits[b] ?? b}
                                        onChange={e => setBucketEdits(prev => ({ ...prev, [b]: e.target.value }))}
                                        disabled={b === 'General' || b === 'Personal' || b === 'Workflow'}
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        onClick={async () => {
                                            const nextName = (bucketEdits[b] ?? b).trim();
                                            if (!nextName || nextName === b || buckets.includes(nextName)) return;
                                            const affected = tasks.filter(t => getBucket(t) === b);
                                            await Promise.all(affected.map(t => updateTaskMetadata(t.id, { ...(t.metadata || {}), bucket: nextName })));
                                            setBuckets(prev => prev.map(x => (x === b ? nextName : x)));
                                        }}
                                        disabled={b === 'General' || b === 'Personal' || b === 'Workflow'}
                                    >
                                        {zh ? '重命名' : 'Rename'}
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={async () => {
                                            if (b === 'General' || b === 'Personal' || b === 'Workflow') return;
                                            const reassigned = tasks.filter(t => getBucket(t) === b);
                                            await Promise.all(reassigned.map(t => updateTaskMetadata(t.id, { ...(t.metadata || {}), bucket: 'General' })));
                                            setBuckets(prev => prev.filter(x => x !== b));
                                            if (filterBucket === b) setFilterBucket('all');
                                        }}
                                        disabled={b === 'General' || b === 'Personal' || b === 'Workflow'}
                                        style={{ color: 'var(--accent-red)' }}
                                    >
                                        {zh ? '刪除' : 'Delete'}
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button className="btn btn-secondary" onClick={() => setShowBucketModal(false)}>
                                {zh ? '關閉' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
