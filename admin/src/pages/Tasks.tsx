import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';
import { writeAuditLog } from '../lib/auditLog';
import { TaskAIChat } from '../components/TaskAIChat';
import type { TaskAction } from '../components/TaskAIChat';

import { getBucket, getDisplayBuckets, normalizeTriggers, priorityIcon, triggerNextWorkflowStep } from '../lib/taskHelpers';
import { TaskDetailPanel } from '../components/Tasks/TaskDetailPanel';
import { BucketManagementModal } from '../components/Tasks/BucketManagementModal';
import { TasksTable } from '../components/Tasks/TasksTable';
import type {
    Task, TaskComment, TaskUser, TaskStore,
    TaskWorkflowInstance, TaskWorkflowTemplate,
    TaskAttachment, LinkedChecklist, LocalEdits,
} from '../types/tasks';

export function Tasks() {
    const { orgId, currentUser } = useOrg();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<TaskUser[]>([]);
    const [stores, setStores] = useState<TaskStore[]>([]);
    const [workflowInstances, setWorkflowInstances] = useState<TaskWorkflowInstance[]>([]);
    const [templates, setTemplates] = useState<TaskWorkflowTemplate[]>([]);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'tasks' | 'workflows' | 'templates' | 'mgmt'>('tasks');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterStore, setFilterStore] = useState('all');
    const [filterWorkflowTemplate, setFilterWorkflowTemplate] = useState('all');
    const [filterWorkflow, setFilterWorkflow] = useState('all');
    const [filterBucket, setFilterBucket] = useState('all');
    const [filterAssignee, setFilterAssignee] = useState('all');

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
    const [localEdits, setLocalEdits] = useState<LocalEdits | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    function patchEdit(patch: Partial<LocalEdits>) {
        setLocalEdits(p => p ? { ...p, ...patch } : null);
        setIsDirty(true);
    }

    const [buckets, setBuckets] = useState<string[]>(['General', 'Personal', 'Workflow']);
    const [showBucketModal, setShowBucketModal] = useState(false);

    // Comments
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{ msg: string; onConfirm: () => void } | null>(null);
    const [importModal, setImportModal] = useState<{ template: TaskWorkflowTemplate } | null>(null);
    const [importStoreId, setImportStoreId] = useState('');

    // Linked checklists
    const [allChecklists, setAllChecklists] = useState<{ id: string; name: string }[]>([]);
    const [linkedChecklists, setLinkedChecklists] = useState<LinkedChecklist[]>([]);
    const [showLinkChecklist, setShowLinkChecklist] = useState(false);

    // Task attachments
    const [attachments, setAttachments] = useState<TaskAttachment[]>([]);

    // Inline workflow assignment from table row
    const [inlineAssignTaskId, setInlineAssignTaskId] = useState<string | null>(null);

    const zh = getLocale() === 'zh-TW';

    function withConfirm(msg: string, action: () => void) {
        setConfirmDialog({ msg, onConfirm: action });
    }

    useEffect(() => {
        if (orgId) { loadTasks(); loadDependencies(); }
    }, [orgId]);

    useEffect(() => {
        if (!orgId) return;
        const key = `task_buckets_${orgId}`;
        const raw = localStorage.getItem(key);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) setBuckets(parsed);
            } catch { /* ignore bad local data */ }
        }
    }, [orgId]);

    useEffect(() => {
        if (!orgId) return;
        localStorage.setItem(`task_buckets_${orgId}`, JSON.stringify(buckets));
    }, [orgId, buckets]);

    async function loadDependencies() {
        const [
            { data: userData },
            { data: storeData },
            { data: instanceData },
            { data: templateData },
            { data: checklistData },
        ] = await Promise.all([
            supabase.from('users').select('id, name').eq('organization_id', orgId),
            supabase.from('stores').select('id, name').eq('organization_id', orgId),
            supabase.from('workflow_instances').select('id, name, status, workflow_id, current_step_id, started_at, store:stores(name), current_step:workflow_steps(name)').eq('organization_id', orgId).order('started_at', { ascending: false }),
            supabase.from('workflows').select('*, steps:workflow_steps(id, name)').eq('organization_id', orgId).order('name'),
            supabase.from('checklists').select('id, name').eq('organization_id', orgId).order('name'),
        ]);
        if (userData) setUsers(userData);
        if (storeData) setStores(storeData);
        if (instanceData) setWorkflowInstances(instanceData as any);
        if (templateData) setTemplates(templateData);
        if (checklistData) setAllChecklists(checklistData);
    }

    async function loadTasks() {
        setLoading(true);
        const { data, error } = await supabase.from('tasks')
            .select(`
                id, title, description, status, priority, sort_order, due_date, planned_start, completed_at, updated_at, created_at, metadata, notes,
                store_id, workflow_instance_id, reminder_at, reminder_sent,
                confirmation_required, confirmation_status, confirmation_requested_at, confirmation_responded_at, confirmation_notes,
                users!tasks_assigned_to_fkey(id, name),
                workflow_steps(name, step_order),
                stores(id, name),
                workflow_instances(id, name)
            `)
            .eq('organization_id', orgId)
            .order('sort_order', { ascending: true });

        if (error) console.error('loadTasks error:', error);
        if (data) {
            const mapped = data.map((t: any) => ({
                ...t,
                assigned_user: t.users,
                workflow_step: t.workflow_steps,
                store: t.stores,
                workflow_instance: t.workflow_instances,
                trigger_actions: Array.isArray(t.metadata?.trigger_actions)
                    ? t.metadata.trigger_actions.filter(Boolean)
                    : null,
                start_conditions: Array.isArray(t.metadata?.start_conditions)
                    ? t.metadata.start_conditions.filter(Boolean)
                    : null,
                planned_start: t.planned_start ?? t.metadata?.plan_start ?? null,
                notes: t.notes ?? t.metadata?.note1 ?? null,
                reminder_at: t.reminder_at ?? null,
            }));
            setTasks(mapped);
            // Sync selectedTask with refreshed data
            setSelectedTask(prev => prev ? mapped.find((t: Task) => t.id === prev.id) ?? null : null);
        }
        setLoading(false);
    }

    async function loadLinkedChecklists(taskId: string) {
        const { data } = await supabase.from('task_checklists')
            .select('checklist:checklists(id, name, status)')
            .eq('task_id', taskId);
        setLinkedChecklists((data || []).map((r: any) => r.checklist).filter(Boolean));
    }

    async function loadAttachments(taskId: string) {
        const { data } = await supabase.from('task_attachments')
            .select('id, file_name, storage_path, file_size, created_at')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false });
        setAttachments(data || []);
    }

    async function linkChecklist(checklistId: string) {
        if (!selectedTask) return;
        await supabase.from('task_checklists').upsert({ task_id: selectedTask.id, checklist_id: checklistId });
        setShowLinkChecklist(false);
        await loadLinkedChecklists(selectedTask.id);
    }

    async function unlinkChecklist(checklistId: string) {
        if (!selectedTask) return;
        await supabase.from('task_checklists').delete()
            .eq('task_id', selectedTask.id).eq('checklist_id', checklistId);
        await loadLinkedChecklists(selectedTask.id);
    }

    async function updateTaskMetadata(taskId: string, nextMetadata: Record<string, unknown>) {
        await supabase.from('tasks').update({ metadata: nextMetadata, updated_at: new Date().toISOString() }).eq('id', taskId);
        setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, metadata: nextMetadata } : t)));
        if (selectedTask?.id === taskId) {
            setSelectedTask(prev => (prev ? { ...prev, metadata: nextMetadata } : prev));
        }
    }

    async function assignWorkflowInline(taskId: string, workflowInstanceId: string) {
        await supabase.from('tasks').update({
            workflow_instance_id: workflowInstanceId || null,
            updated_at: new Date().toISOString(),
        }).eq('id', taskId);
        setInlineAssignTaskId(null);
        await loadTasks();
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
        writeAuditLog({
            organization_id: orgId,
            user_id: currentUser?.id,
            user_name: currentUser?.name,
            action: 'create',
            module: 'tasks',
            table_name: 'tasks',
            record_label: newTitle.trim(),
            new_values: { priority: newPriority, bucket: newBucket },
        });
        setNewTitle(''); setNewStore(''); setNewWorkflow(''); setShowCreate(false);
        loadTasks();
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
            planned_start: task.planned_start || '',
            due_date: task.due_date || '',
            bucket: getBucket(task),
            notes: task.notes || '',
            trigger_actions: normalizeTriggers(task.trigger_actions),
            start_conditions: normalizeTriggers(task.start_conditions),
            reminder_at: task.reminder_at || '',
        });
        setLoadingComments(true);
        const [{ data }] = await Promise.all([
            supabase.from('task_comments')
                .select('id, content, source, created_at, users(name)')
                .eq('task_id', task.id)
                .order('created_at', { ascending: true }),
            loadLinkedChecklists(task.id),
            loadAttachments(task.id),
        ]);
        setComments((data || []).map((c: any) => ({ ...c, user: c.users })));
        setLoadingComments(false);
        setShowLinkChecklist(false);
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
        if (localEdits.title && localEdits.title !== selectedTask.title) updates.title = localEdits.title;
        updates.status = localEdits.status;
        updates.priority = localEdits.priority;
        updates.assigned_to = localEdits.assigned_to || null;
        updates.store_id = localEdits.store_id || null;
        updates.workflow_instance_id = localEdits.workflow_instance_id || null;
        updates.planned_start = localEdits.planned_start ? new Date(localEdits.planned_start).toISOString() : null;
        updates.due_date = localEdits.due_date ? new Date(localEdits.due_date).toISOString() : null;
        const reminderChanged = localEdits.reminder_at !== (selectedTask.reminder_at ?? '');
        updates.reminder_at = localEdits.reminder_at ? new Date(localEdits.reminder_at).toISOString() : null;
        if (reminderChanged) updates.reminder_sent = false;
        if (localEdits.status === 'completed' && selectedTask.status !== 'completed') {
            updates.completed_at = new Date().toISOString();
        } else if (localEdits.status !== 'completed') {
            updates.completed_at = null;
        }
        updates.notes = localEdits.notes || null;
        updates.metadata = {
            ...(selectedTask.metadata || {}),
            bucket: localEdits.bucket,
            trigger_actions: localEdits.trigger_actions,
            start_conditions: localEdits.start_conditions,
        };
        await supabase.from('tasks').update(updates).eq('id', selectedTask.id);
        if (localEdits.status !== selectedTask.status) {
            writeAuditLog({
                organization_id: orgId,
                user_id: currentUser?.id,
                user_name: currentUser?.name,
                action: 'update',
                module: 'tasks',
                table_name: 'tasks',
                record_id: selectedTask.id,
                record_label: selectedTask.title,
                old_values: { status: selectedTask.status },
                new_values: { status: localEdits.status },
            });
        }
        if (localEdits.status === 'completed' && selectedTask.status !== 'completed') {
            const taskForTrigger = { ...selectedTask, status: 'completed' };
            if (taskForTrigger.workflow_instance_id && taskForTrigger.workflow_step) {
                await triggerNextWorkflowStep(taskForTrigger, zh);
            }
            // Check start_conditions on other tasks that depend on this completed task
            const dependentTasks = tasks.filter(t =>
                t.id !== selectedTask.id &&
                Array.isArray(t.start_conditions) &&
                t.start_conditions.includes(selectedTask.id) &&
                t.status === 'pending'
            );
            for (const dep of dependentTasks) {
                const allMet = (dep.start_conditions || []).every(condId => {
                    if (condId === selectedTask.id) return true; // just completed
                    const condTask = tasks.find(t => t.id === condId);
                    return condTask?.status === 'completed';
                });
                if (allMet) {
                    await supabase.from('tasks').update({
                        status: 'in_progress',
                        updated_at: new Date().toISOString(),
                    }).eq('id', dep.id);
                    // System comment
                    const ownerName = dep.assigned_user?.name || (zh ? '未指定' : 'Unassigned');
                    const conditionTitles = (dep.start_conditions || []).map(cid => {
                        const ct = tasks.find(t => t.id === cid);
                        return ct?.title || cid.slice(0, 8);
                    });
                    await supabase.from('task_comments').insert({
                        task_id: dep.id,
                        content: zh
                            ? `所有前置條件已完成，任務自動設為「進行中」。（通知：${ownerName}）`
                            : `All start conditions met — task auto-set to "In Progress". (Notify: ${ownerName})`,
                        source: 'system',
                    });
                    // Send LINE notification to task owner
                    if (dep.assigned_user?.id) {
                        try {
                            await supabase.functions.invoke('hr-notify', {
                                body: {
                                    user_id: dep.assigned_user.id,
                                    type: 'task_auto_started',
                                    details: {
                                        task_title: dep.title,
                                        completed_tasks: conditionTitles,
                                        workflow_name: dep.workflow_instance?.name || null,
                                    },
                                },
                            });
                        } catch (e) { console.warn('Task start notification failed (non-critical):', e); }
                    }
                }
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

    async function handleAIApprove(actions: TaskAction[]) {
        for (const act of actions) {
            try {
                if (act.type === 'CREATE_TASK') {
                    await supabase.from('tasks').insert({ organization_id: orgId, ...act.payload, status: 'pending' });
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

    async function importWorkflow(template: TaskWorkflowTemplate, storeId: string) {
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

    const displayBuckets = getDisplayBuckets(buckets, tasks);

    const filtered = tasks.filter(t => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const match = t.title.toLowerCase().includes(q)
                || (t.assigned_user?.name || '').toLowerCase().includes(q)
                || (t.notes || '').toLowerCase().includes(q)
                || t.id.toLowerCase().startsWith(q);
            if (!match) return false;
        }
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        if (filterStore !== 'all' && t.store_id !== filterStore) return false;
        if (filterWorkflow !== 'all' && t.workflow_instance_id !== filterWorkflow) return false;
        if (filterBucket !== 'all' && getBucket(t) !== filterBucket) return false;
        if (filterAssignee !== 'all' && (t.assigned_user?.id || '') !== filterAssignee) return false;
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

            {/* Tabs */}
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
                <div style={{ flex: showAI ? '0 0 55%' : '1' }}>
                    {activeTab === 'tasks' && (
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
                                <input
                                    type="text"
                                    className="input"
                                    placeholder={zh ? '🔍 搜尋任務名稱、負責人、備註...' : '🔍 Search tasks...'}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{ minWidth: '200px', maxWidth: '300px' }}
                                />
                                <select className="select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                    <option value="all">{zh ? '狀態: 全部' : 'Status: All'}</option>
                                    {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                <select className="select" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
                                    <option value="all">{zh ? '負責人: 全部' : 'Assignee: All'}</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
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
                            <TasksTable
                                filtered={filtered}
                                tasks={tasks}
                                loading={loading}
                                selectedTaskId={selectedTask?.id ?? null}
                                openTaskDetail={openTaskDetail}
                                statusLabel={statusLabel}
                                workflowInstances={workflowInstances}
                                inlineAssignTaskId={inlineAssignTaskId}
                                setInlineAssignTaskId={setInlineAssignTaskId}
                                assignWorkflowInline={assignWorkflowInline}
                                noDataLabel={t('common.no_data')}
                                loadingLabel={t('common.loading')}
                            />
                        </>
                    )}

                    {activeTab === 'workflows' && (
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
                    )}

                    {activeTab === 'templates' && (
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
                    )}

                    {activeTab === 'mgmt' && (
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
                    )}
                </div>

                {/* Right Panel: AI Chat */}
                {showAI && (
                    <div style={{ flex: '0 0 42%', minWidth: '380px', height: 'calc(100vh - 160px)', position: 'sticky', top: '20px' }} className="fade-in">
                        <TaskAIChat onApprove={handleAIApprove} />
                    </div>
                )}

            </div>

            {/* Task Detail Overlay */}
            {selectedTask && !showAI && (
                <TaskDetailPanel
                    selectedTask={selectedTask}
                    localEdits={localEdits}
                    isDirty={isDirty}
                    patchEdit={patchEdit}
                    users={users}
                    stores={stores}
                    workflowInstances={workflowInstances}
                    displayBuckets={displayBuckets}
                    tasks={tasks}
                    comments={comments}
                    loadingComments={loadingComments}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    addComment={addComment}
                    linkedChecklists={linkedChecklists}
                    allChecklists={allChecklists}
                    showLinkChecklist={showLinkChecklist}
                    setShowLinkChecklist={setShowLinkChecklist}
                    linkChecklist={linkChecklist}
                    unlinkChecklist={unlinkChecklist}
                    attachments={attachments}
                    loadAttachments={loadAttachments}
                    orgId={orgId}
                    currentUserId={currentUser?.id ?? null}
                    statusLabel={statusLabel}
                    priorityLabel={priorityLabel}
                    closePanel={closePanel}
                    saveTaskEdits={saveTaskEdits}
                    reloadTasks={loadTasks}
                    deleteTask={deleteTask}
                    withConfirm={withConfirm}
                />
            )}

            {/* Import Modal */}
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

            {/* Confirm Dialog */}
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

            {/* Bucket Management Modal */}
            {showBucketModal && (
                <BucketManagementModal
                    displayBuckets={displayBuckets}
                    buckets={buckets}
                    setBuckets={setBuckets}
                    tasks={tasks}
                    filterBucket={filterBucket}
                    setFilterBucket={setFilterBucket}
                    updateTaskMetadata={updateTaskMetadata}
                    onClose={() => setShowBucketModal(false)}
                />
            )}
        </div>
    );
}
