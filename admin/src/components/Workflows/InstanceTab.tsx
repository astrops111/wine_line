import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { t, getLocale } from '../../lib/i18n';
import { useOrg } from '../../lib/OrgContext';
import { saveTaskEdit as saveTaskEditHelper, getTaskEdit, priorityBadge, handleTaskCompletion, computeTaskSummary } from '../../lib/workflowHelpers';
import type {
    WorkflowInstance, InstanceTask, TaskConfirmation, TaskEdit,
    Employee, LineGroup, Store, TaskSummary,
} from '../../types/workflows';
import { getDueBadge, extractTime } from '../../lib/taskHelpers';
import { InstanceCard } from './InstanceCard';

interface InstanceTabProps {
    instances: WorkflowInstance[];
    employees: Employee[];
    lineGroups: LineGroup[];
    stores: Store[];
    selectedInstance: WorkflowInstance | null;
    setSelectedInstance: React.Dispatch<React.SetStateAction<WorkflowInstance | null>>;
    setInstances: React.Dispatch<React.SetStateAction<WorkflowInstance[]>>;
    instanceTasks: InstanceTask[];
    setInstanceTasks: React.Dispatch<React.SetStateAction<InstanceTask[]>>;
    instanceTasksLoading: boolean;
    taskEdits: Record<string, TaskEdit>;
    setTaskEdits: React.Dispatch<React.SetStateAction<Record<string, TaskEdit>>>;
    taskConfirmations: Record<string, TaskConfirmation[]>;
    setTaskConfirmations: React.Dispatch<React.SetStateAction<Record<string, TaskConfirmation[]>>>;
    loadInstanceTasks: (inst: WorkflowInstance) => Promise<void>;
    archiveInstance: (instId: string) => Promise<void>;
    deleteInstance: (instId: string, instName: string) => void;
    saveInstanceAssignment: (instId: string) => Promise<void>;
    editingInstAssign: string | null;
    setEditingInstAssign: React.Dispatch<React.SetStateAction<string | null>>;
    editInstUser: string;
    setEditInstUser: React.Dispatch<React.SetStateAction<string>>;
    editInstGroups: string[];
    setEditInstGroups: React.Dispatch<React.SetStateAction<string[]>>;
    instanceSearch: string;
    setInstanceSearch: React.Dispatch<React.SetStateAction<string>>;
    filteredActive: WorkflowInstance[];
    setTab: (tab: 'templates' | 'active' | 'ai' | 'archive') => void;
}

export function InstanceTab({
    employees, lineGroups, stores,
    selectedInstance, setSelectedInstance, setInstances,
    instanceTasks, setInstanceTasks, instanceTasksLoading,
    taskEdits, setTaskEdits,
    taskConfirmations, setTaskConfirmations,
    loadInstanceTasks,
    archiveInstance, deleteInstance,
    saveInstanceAssignment,
    editingInstAssign, setEditingInstAssign,
    editInstUser, setEditInstUser,
    editInstGroups, setEditInstGroups,
    instanceSearch, setInstanceSearch,
    filteredActive, setTab,
}: InstanceTabProps) {
    const zh = getLocale() === 'zh-TW';
    const { orgId, currentUser } = useOrg();

    // Local state
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState<{ taskId: string } | null>(null);
    const [confirmApproverIds, setConfirmApproverIds] = useState<string[]>([]);
    const [showAddTask, setShowAddTask] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState('medium');
    const [newTaskAssignee, setNewTaskAssignee] = useState('');
    const [newTaskDue, setNewTaskDue] = useState('');

    // --- Task operations ---
    async function handleSaveTaskEdit(taskId: string) {
        await saveTaskEditHelper(taskId, {
            orgId,
            currentUser,
            instanceTasks,
            taskEdits,
            selectedInstance,
            setInstanceTasks,
            setTaskEdits,
            setInstances,
            setSelectedInstance,
            loadInstanceTasks,
        });
    }

    async function addStandaloneTask() {
        if (!newTaskTitle.trim() || !selectedInstance) return;
        const maxOrder = instanceTasks.reduce((max, t) => Math.max(max, t.sort_order ?? 0), 0);
        await supabase.from('tasks').insert({
            organization_id: orgId,
            workflow_instance_id: selectedInstance.id,
            title: newTaskTitle.trim(),
            status: 'pending',
            priority: newTaskPriority,
            sort_order: maxOrder + 1,
            assigned_to: newTaskAssignee || null,
            due_date: newTaskDue || null,
            store_id: selectedInstance.store_id || null,
        });
        setShowAddTask(false);
        setNewTaskTitle('');
        setNewTaskPriority('medium');
        setNewTaskAssignee('');
        setNewTaskDue('');
        await loadInstanceTasks(selectedInstance);
    }

    // --- Confirmation flow ---
    async function requestConfirmation(taskId: string, approverIds: string[]) {
        const inserts = approverIds.map(appId => ({ task_id: taskId, approver_id: appId, status: 'pending' }));
        await supabase.from('task_confirmations').upsert(inserts, { onConflict: 'task_id,approver_id' });
        await supabase.from('tasks').update({
            confirmation_required: true,
            confirmation_status: 'pending',
            confirmation_requested_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', taskId);
        const { data: confs } = await supabase.from('task_confirmations')
            .select('id, task_id, approver_id, status, notes, responded_at, created_at')
            .eq('task_id', taskId);
        setTaskConfirmations(prev => ({ ...prev, [taskId]: confs || [] }));
        if (selectedInstance) await loadInstanceTasks(selectedInstance);
        setShowConfirmModal(null);
    }

    async function respondConfirmation(taskId: string, approverId: string, approved: boolean, notes?: string) {
        await supabase.from('task_confirmations').update({
            status: approved ? 'approved' : 'rejected',
            notes: notes || null,
            responded_at: new Date().toISOString(),
        }).eq('task_id', taskId).eq('approver_id', approverId);
        const { data: confs } = await supabase.from('task_confirmations')
            .select('id, task_id, approver_id, status, notes, responded_at, created_at')
            .eq('task_id', taskId);
        const confirmations = confs || [];
        setTaskConfirmations(prev => ({ ...prev, [taskId]: confirmations }));
        const allApproved = confirmations.length > 0 && confirmations.every(c => c.status === 'approved');
        const anyRejected = confirmations.some(c => c.status === 'rejected');
        const allResponded = confirmations.every(c => c.status !== 'pending');
        if (allApproved) {
            await supabase.from('tasks').update({
                confirmation_status: 'approved',
                confirmation_responded_at: new Date().toISOString(),
                confirmation_notes: zh ? '所有確認人已核准' : 'All approvers approved',
                status: 'completed',
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }).eq('id', taskId);
            // Trigger auto-advance + completion notifications
            const updatedTasks = instanceTasks.map(t =>
                t.id === taskId ? { ...t, status: 'completed', confirmation_status: 'approved' } : t
            );
            setInstanceTasks(updatedTasks);
            const summary = computeTaskSummary(updatedTasks);
            setInstances(prev => prev.map(inst =>
                inst.id !== selectedInstance?.id ? inst : { ...inst, taskSummary: summary }
            ));
            await handleTaskCompletion(taskId, updatedTasks, {
                orgId, currentUser, instanceTasks: updatedTasks, taskEdits,
                selectedInstance, setInstanceTasks, setTaskEdits, setInstances, setSelectedInstance, loadInstanceTasks,
            });
        } else if (anyRejected) {
            // Append rejection reason to task notes
            const task = instanceTasks.find(t => t.id === taskId);
            const rejectorName = employees.find(e => e.id === approverId)?.name || approverId;
            const dateStr = new Date().toLocaleDateString('zh-TW');
            const rejectionEntry = `[駁回] ${rejectorName} (${dateStr}): ${notes || (zh ? '未填寫' : 'No reason')}`;
            const existingNotes = task?.notes || '';
            const newNotes = existingNotes ? `${existingNotes}\n${rejectionEntry}` : rejectionEntry;
            await supabase.from('tasks').update({
                confirmation_status: 'rejected',
                confirmation_responded_at: new Date().toISOString(),
                confirmation_notes: `${rejectorName}: ${notes || (zh ? '未填寫' : 'No reason')}`,
                notes: newNotes,
                updated_at: new Date().toISOString(),
            }).eq('id', taskId);
        }
        if (selectedInstance) await loadInstanceTasks(selectedInstance);
    }

    // --- Complete task directly ---
    async function completeTask(taskId: string) {
        const task = instanceTasks.find(t => t.id === taskId);
        if (!task) return;
        const edit = getTaskEdit(task, taskEdits);
        setTaskEdits(p => ({ ...p, [taskId]: { ...edit, status: 'completed' } }));
        setTimeout(() => handleSaveTaskEdit(taskId), 0);
    }

    // --- Check if task has confirmation approvers from template config ---
    function hasConfirmationApprovers(task: InstanceTask): boolean {
        return task.confirmation_required || (taskConfirmations[task.id] || []).length > 0;
    }

    // --- Empty state ---
    if (filteredActive.length === 0 && !instanceSearch) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔄</div>
                <p>{zh ? '目前沒有進行中的流程。' : 'No active workflows running.'}</p>
                <button className="btn btn-primary" style={{ marginTop: '12px' }} onClick={() => setTab('templates')}>
                    🗂 {zh ? '前往範本啟動流程' : 'Go to Templates to start one'}
                </button>
            </div>
        );
    }

    // --- Instance list ---
    if (!selectedInstance) {
        return (
            <div>
                <input className="input-field" style={{ marginBottom: '12px', width: '100%' }} value={instanceSearch}
                    onChange={e => setInstanceSearch(e.target.value)}
                    placeholder={zh ? '搜尋流程…' : 'Search workflows…'} />
                {filteredActive.map(inst => (
                    <InstanceCard key={inst.id} inst={inst} showArchive={true} selected={false}
                        employees={employees} lineGroups={lineGroups}
                        loadInstanceTasks={loadInstanceTasks}
                        archiveInstance={archiveInstance} deleteInstance={deleteInstance}
                        editingInstAssign={editingInstAssign} setEditingInstAssign={setEditingInstAssign}
                        editInstUser={editInstUser} setEditInstUser={setEditInstUser}
                        editInstGroups={editInstGroups} setEditInstGroups={setEditInstGroups}
                        saveInstanceAssignment={saveInstanceAssignment}
                    />
                ))}
            </div>
        );
    }

    // --- Instance detail with tasks ---
    const s = selectedInstance.taskSummary;
    const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;

    return (
        <div className="fade-in">
            <button className="btn btn-secondary" style={{ marginBottom: '16px' }} onClick={() => { setSelectedInstance(null); setInstanceTasks([]); }}>
                ← {zh ? '返回流程列表' : 'Back to Workflows'}
            </button>
            <div style={{ minWidth: '320px' }}>
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
                        <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--outline-variant)' }}>
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
                                                    <span key={gid} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--outline-variant)', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
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
                                            <option value="">➕ {zh ? '新增群組…' : 'Add group…'}</option>
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

                        {/* Tasks table header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>
                                📋 {zh ? '步驟任務' : 'Steps'} ({instanceTasks.length})
                            </div>
                            <button className="btn btn-sm btn-primary" style={{ fontSize: '11px' }}
                                onClick={() => setShowAddTask(p => !p)}>
                                {showAddTask ? '✕' : `➕ ${zh ? '新增任務' : 'Add Task'}`}
                            </button>
                        </div>

                        {showAddTask && (
                            <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                    <input className="input-field" style={{ flex: 2, minWidth: '200px' }}
                                        value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                                        placeholder={zh ? '任務標題...' : 'Task title...'} autoFocus
                                        onKeyDown={e => e.key === 'Enter' && addStandaloneTask()} />
                                    <select className="select" style={{ flex: 1 }} value={newTaskPriority}
                                        onChange={e => setNewTaskPriority(e.target.value)}>
                                        <option value="low">{zh ? '🟢 低' : '🟢 Low'}</option>
                                        <option value="medium">{zh ? '🟡 中' : '🟡 Med'}</option>
                                        <option value="high">{zh ? '🔴 高' : '🔴 High'}</option>
                                        <option value="urgent">{zh ? '🚨 緊急' : '🚨 Urgent'}</option>
                                    </select>
                                    <select className="select" style={{ flex: 1 }} value={newTaskAssignee}
                                        onChange={e => setNewTaskAssignee(e.target.value)}>
                                        <option value="">{zh ? '未指定' : 'Unassigned'}</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                    <input type="date" className="input-field" style={{ flex: 1 }}
                                        value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} />
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-sm btn-primary" onClick={addStandaloneTask} disabled={!newTaskTitle.trim()}>
                                        💾 {zh ? '新增' : 'Add'}
                                    </button>
                                    <button className="btn btn-sm btn-secondary" onClick={() => setShowAddTask(false)}>
                                        {zh ? '取消' : 'Cancel'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {instanceTasksLoading ? (
                            <p className="loading-pulse">{t('common.loading')}</p>
                        ) : instanceTasks.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '16px' }}>
                                {zh ? '尚無任務' : 'No tasks'}
                            </p>
                        ) : (
                            <div style={{ overflowX: 'auto', marginLeft: '-24px', marginRight: '-24px', marginBottom: '-24px' }}>
                                <table className="data-table" style={{ fontSize: '12px', margin: 0 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '28px', textAlign: 'center' }}>#</th>
                                            <th>{zh ? '任務名稱' : 'Task'}</th>
                                            <th style={{ width: '100px' }}>{zh ? '負責人' : 'Assignee'}</th>
                                            <th style={{ width: '90px' }}>{zh ? '門市' : 'Store'}</th>
                                            <th style={{ width: '100px' }}>{zh ? '計畫開始' : 'Plan Start'}</th>
                                            <th style={{ width: '100px' }}>{zh ? '截止日期' : 'Due Date'}</th>
                                            <th style={{ width: '90px' }}>{zh ? '狀態' : 'Status'}</th>
                                            <th style={{ width: '200px' }}>{zh ? '操作' : 'Actions'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {instanceTasks.map(task => {
                                            const edit = getTaskEdit(task, taskEdits);
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
                                                                    {task.step_type === 'approval' && (
                                                                        <span style={{ fontSize: '9px', background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '4px', padding: '1px 5px', marginLeft: '6px', verticalAlign: 'middle' }}>
                                                                            {zh ? '審批' : 'Approval'}
                                                                        </span>
                                                                    )}
                                                                    {(() => {
                                                                        const badge = getDueBadge(task.due_date, task.status);
                                                                        return badge ? (
                                                                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: badge.color, color: '#fff', whiteSpace: 'nowrap', marginLeft: '6px', verticalAlign: 'middle' }}>
                                                                                {badge.label}
                                                                            </span>
                                                                        ) : null;
                                                                    })()}
                                                                </span>
                                                                <button
                                                                    title={zh ? '後續動作備註' : 'Follow-up notes'}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px', borderRadius: '3px', fontSize: '12px', color: hasNotes ? 'var(--accent-primary)' : 'var(--text-muted)', opacity: isExpanded ? 1 : 0.6, flexShrink: 0 }}
                                                                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}>
                                                                    {isExpanded ? '▴' : '📝'}
                                                                </button>
                                                            </div>
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
                                                                value={edit.store_id ?? ''}
                                                                onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, store_id: e.target.value || null } }))}>
                                                                <option value="">—</option>
                                                                {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <input type="date" className="input-field" style={{ fontSize: '11px', padding: '2px 4px', width: '100%' }}
                                                                value={(edit.planned_start ?? '').slice(0, 10)}
                                                                onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, planned_start: e.target.value || null } }))} />
                                                            {extractTime(edit.planned_start) && (
                                                                <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginTop: '1px' }}>🕐 {extractTime(edit.planned_start)}</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <input type="date" className="input-field" style={{ fontSize: '11px', padding: '2px 4px', width: '100%' }}
                                                                value={(edit.due_date ?? '').slice(0, 10)}
                                                                onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, due_date: e.target.value || null } }))} />
                                                            {extractTime(edit.due_date) && (
                                                                <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', marginTop: '1px' }}>🕐 {extractTime(edit.due_date)}</span>
                                                            )}
                                                        </td>
                                                        {/* Status column */}
                                                        <td>
                                                            <select className="select" style={{
                                                                fontSize: '11px', padding: '2px 4px', width: '100%',
                                                                color: edit.status === 'completed' ? '#22c55e' : edit.status === 'in_progress' ? '#3b82f6' : edit.status === 'blocked' ? '#f43f5e' : edit.status === 'cancelled' ? '#9ca3af' : '#f59e0b',
                                                                fontWeight: 600,
                                                            }}
                                                                value={edit.status}
                                                                onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, status: e.target.value } }))}>
                                                                <option value="pending">{zh ? '待處理' : 'Pending'}</option>
                                                                <option value="in_progress">{zh ? '進行中' : 'In Progress'}</option>
                                                                <option value="completed">{zh ? '已完成' : 'Completed'}</option>
                                                                <option value="blocked">{zh ? '已阻擋' : 'Blocked'}</option>
                                                                <option value="cancelled">{zh ? '已取消' : 'Cancelled'}</option>
                                                            </select>
                                                        </td>
                                                        {/* Unified Actions column */}
                                                        <td>
                                                            {edit.status === 'completed' || task.status === 'completed' ? (
                                                                <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600 }}>✅ {zh ? '已完成' : 'Completed'}</span>
                                                            ) : task.confirmation_required && task.confirmation_status === 'pending' ? (
                                                                <div>
                                                                    <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600, marginBottom: '2px' }}>⏳ {zh ? '待確認' : 'Pending'}</div>
                                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                                                                        {(taskConfirmations[task.id] || []).map(c => {
                                                                            const emp = employees.find(e => e.id === c.approver_id);
                                                                            return (
                                                                                <span key={c.id} style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '4px', background: c.status === 'approved' ? 'rgba(34,197,94,0.15)' : c.status === 'rejected' ? 'rgba(244,63,94,0.15)' : 'var(--bg-secondary)', color: c.status === 'approved' ? '#22c55e' : c.status === 'rejected' ? '#f43f5e' : 'var(--text-muted)' }}>
                                                                                    {emp?.name || '?'} {c.status === 'approved' ? '✓' : c.status === 'rejected' ? '✗' : '…'}
                                                                                </span>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                    {(taskConfirmations[task.id] || []).some(c => c.approver_id === currentUser?.id && c.status === 'pending') && (
                                                                        <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
                                                                            <button className="btn btn-sm" style={{ fontSize: '9px', padding: '1px 5px', background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                                                                                onClick={() => respondConfirmation(task.id, currentUser!.id, true)}>
                                                                                {zh ? '核准' : 'OK'}
                                                                            </button>
                                                                            <button className="btn btn-sm" style={{ fontSize: '9px', padding: '1px 5px', background: 'rgba(244,63,94,0.15)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.3)' }}
                                                                                onClick={() => {
                                                                                    const reason = prompt(zh ? '請輸入駁回原因：' : 'Enter rejection reason:');
                                                                                    if (reason !== null) respondConfirmation(task.id, currentUser!.id, false, reason);
                                                                                }}>
                                                                                {zh ? '駁回' : 'No'}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : task.confirmation_required && task.confirmation_status === 'rejected' ? (
                                                                <div>
                                                                    <span style={{ fontSize: '10px', color: '#f43f5e', fontWeight: 600 }}>❌ {zh ? '駁回' : 'Rejected'}</span>
                                                                    {(() => {
                                                                        const rejConf = (taskConfirmations[task.id] || []).find(c => c.status === 'rejected');
                                                                        return rejConf?.notes ? (
                                                                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic' }}>
                                                                                {rejConf.notes}
                                                                            </div>
                                                                        ) : null;
                                                                    })()}
                                                                    <button className="btn btn-sm" style={{ fontSize: '9px', padding: '1px 5px', marginTop: '3px', background: 'var(--bg-secondary)' }}
                                                                        onClick={() => {
                                                                            const ids = (taskConfirmations[task.id] || []).map(c => c.approver_id);
                                                                            if (ids.length) requestConfirmation(task.id, ids);
                                                                        }}>
                                                                        {zh ? '重送' : 'Resend'}
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                                    {isDirty && (
                                                                        <button className="btn btn-sm btn-primary" style={{ fontSize: '10px', padding: '2px 6px' }}
                                                                            onClick={() => handleSaveTaskEdit(task.id)}>
                                                                            {zh ? '更新' : 'Update'}
                                                                        </button>
                                                                    )}
                                                                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '2px 6px' }}
                                                                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}>
                                                                        📝 {zh ? '備註' : 'Notes'}
                                                                    </button>
                                                                    {hasConfirmationApprovers(task) ? (
                                                                        <button className="btn btn-sm" style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }}
                                                                            onClick={() => {
                                                                                const configApprovers = (taskConfirmations[task.id] || []).map(c => c.approver_id);
                                                                                if (configApprovers.length > 0) {
                                                                                    requestConfirmation(task.id, configApprovers);
                                                                                } else {
                                                                                    setConfirmApproverIds([]);
                                                                                    setShowConfirmModal({ taskId: task.id });
                                                                                }
                                                                            }}>
                                                                            🔐 {zh ? '確認任務' : 'Confirm'}
                                                                        </button>
                                                                    ) : (
                                                                        <>
                                                                            <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '2px 6px', opacity: 0.7 }}
                                                                                onClick={() => { setConfirmApproverIds([]); setShowConfirmModal({ taskId: task.id }); }}>
                                                                                🔐 {zh ? '確認任務' : 'Confirm'}
                                                                            </button>
                                                                            <button className="btn btn-sm" style={{ fontSize: '10px', padding: '2px 6px', background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}
                                                                                onClick={() => completeTask(task.id)}>
                                                                                ✅ {zh ? '完成' : 'Done'}
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                    {/* Follow-up notes row */}
                                                    {isExpanded && (
                                                        <tr key={`${task.id}-notes`} style={{ background: 'var(--accent-primary-dim)' }}>
                                                            <td colSpan={8} style={{ padding: '8px 12px 10px 36px', borderTop: 'none' }}>
                                                                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                                                                    📝 {zh ? '後續動作備註' : 'Follow-up Action'}
                                                                </div>
                                                                <textarea
                                                                    rows={2}
                                                                    placeholder={zh ? '記錄後續行動、注意事項或備忘…' : 'Record follow-up actions, notes or reminders…'}
                                                                    style={{ width: '100%', fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--outline-variant)', background: 'var(--bg-card)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                                                                    value={edit.notes ?? ''}
                                                                    onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, notes: e.target.value || null } }))}
                                                                />
                                                                {/* Note 1 / 2 / 3 */}
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginTop: '6px' }}>
                                                                    <div>
                                                                        <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>{zh ? '備註1' : 'Note 1'}</label>
                                                                        <input className="input-field" style={{ fontSize: '11px', padding: '4px 6px', width: '100%' }}
                                                                            value={edit.note1 ?? ''}
                                                                            onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, note1: e.target.value || null } }))}
                                                                            placeholder={zh ? '備註1...' : 'Note 1...'} />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>{zh ? '備註2' : 'Note 2'}</label>
                                                                        <input className="input-field" style={{ fontSize: '11px', padding: '4px 6px', width: '100%' }}
                                                                            value={edit.note2 ?? ''}
                                                                            onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, note2: e.target.value || null } }))}
                                                                            placeholder={zh ? '備註2...' : 'Note 2...'} />
                                                                    </div>
                                                                    <div>
                                                                        <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>{zh ? '備註3' : 'Note 3'}</label>
                                                                        <input className="input-field" style={{ fontSize: '11px', padding: '4px 6px', width: '100%' }}
                                                                            value={edit.note3 ?? ''}
                                                                            onChange={e => setTaskEdits(p => ({ ...p, [task.id]: { ...edit, note3: e.target.value || null } }))}
                                                                            placeholder={zh ? '備註3...' : 'Note 3...'} />
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '6px', marginTop: '5px' }}>
                                                                    <button className="btn btn-sm btn-primary" style={{ fontSize: '10px', padding: '2px 10px' }}
                                                                        onClick={() => { handleSaveTaskEdit(task.id); setExpandedTaskId(null); }}>
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

            {/* Confirmation request modal */}
            {showConfirmModal && (
                <div className="modal-overlay" onClick={() => setShowConfirmModal(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                            🔐 {zh ? '請求確認/審批' : 'Request Confirmation'}
                        </h3>
                        <div style={{ marginBottom: '10px' }}>
                            <label className="detail-label">{zh ? '選擇審批人' : 'Select Approvers'}</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                {confirmApproverIds.map(empId => {
                                    const emp = employees.find(e => e.id === empId);
                                    return (
                                        <span key={empId} style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '10px', padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', color: '#8b5cf6' }}>
                                            {emp?.name || empId}
                                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }}
                                                onClick={() => setConfirmApproverIds(p => p.filter(id => id !== empId))}>✕</button>
                                        </span>
                                    );
                                })}
                            </div>
                            <select className="select" style={{ width: '100%', fontSize: '12px' }} value=""
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val && !confirmApproverIds.includes(val)) setConfirmApproverIds(p => [...p, val]);
                                    e.currentTarget.value = '';
                                }}>
                                <option value="">➕ {zh ? '新增審批人…' : 'Add approver…'}</option>
                                {employees.filter(e => !confirmApproverIds.includes(e.id)).map(e =>
                                    <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setShowConfirmModal(null)}>{zh ? '取消' : 'Cancel'}</button>
                            <button className="btn btn-primary" disabled={confirmApproverIds.length === 0}
                                onClick={() => requestConfirmation(showConfirmModal.taskId, confirmApproverIds)}>
                                {zh ? '送出確認請求' : 'Send Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
