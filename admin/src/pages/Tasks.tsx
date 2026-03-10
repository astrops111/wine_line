import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';

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
    created_at: string;
    assigned_user: { id: string; name: string } | null;
    workflow_step: { name: string; step_order: number } | null;
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

export function Tasks() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [showCreate, setShowCreate] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newPriority, setNewPriority] = useState('medium');
    const [newAssignee, setNewAssignee] = useState('');
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const zh = getLocale() === 'zh-TW';

    useEffect(() => { loadTasks(); loadUsers(); }, []);

    async function loadUsers() {
        const { data } = await supabase.from('users').select('id, name');
        if (data) setUsers(data);
    }

    async function loadTasks() {
        setLoading(true);
        const { data } = await supabase.from('tasks')
            .select('id, title, description, status, priority, sort_order, due_date, planned_start, completed_at, created_at, users!tasks_assigned_to_fkey(id, name), workflow_steps(name, step_order)')
            .order('sort_order', { ascending: true });
        if (data) setTasks(data.map((t: any) => ({ ...t, assigned_user: t.users, workflow_step: t.workflow_steps })));
        setLoading(false);
    }

    async function updateStatus(taskId: string, newStatus: string) {
        const updateData: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString() };
        if (newStatus === 'completed') updateData.completed_at = new Date().toISOString();
        await supabase.from('tasks').update(updateData).eq('id', taskId);
        loadTasks();
        if (selectedTask?.id === taskId) {
            setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
        }
    }

    async function updateTaskField(taskId: string, field: string, value: unknown) {
        await supabase.from('tasks').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', taskId);
        loadTasks();
    }

    async function createTask() {
        if (!newTitle.trim()) return;
        await supabase.from('tasks').insert({
            organization_id: '00000000-0000-0000-0000-000000000001',
            title: newTitle.trim(),
            priority: newPriority,
            assigned_to: newAssignee || null,
            status: 'pending',
        });
        setNewTitle('');
        setShowCreate(false);
        loadTasks();
    }

    async function openTaskDetail(task: Task) {
        setSelectedTask(task);
        setLoadingComments(true);
        const { data } = await supabase.from('task_comments')
            .select('id, content, source, created_at, users(name)')
            .eq('task_id', task.id)
            .order('created_at', { ascending: true });
        setComments((data || []).map((c: any) => ({ ...c, user: c.users })));
        setLoadingComments(false);
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
        await supabase.from('tasks').delete().eq('id', taskId);
        setSelectedTask(null);
        loadTasks();
    }

    const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

    const statusLabel: Record<string, string> = {
        pending: t('status.pending'), in_progress: t('status.in_progress'),
        completed: t('status.completed'), blocked: t('status.blocked'), cancelled: t('status.cancelled'),
    };
    const priorityLabel: Record<string, string> = {
        low: t('priority.low'), medium: t('priority.medium'),
        high: t('priority.high'), urgent: t('priority.urgent'),
    };
    const priorityIcon: Record<string, string> = { low: '🔽', medium: '➡️', high: '🔼', urgent: '🔥' };
    const sourceIcon: Record<string, string> = { web: '🌐', line: '💬', system: '⚙️' };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>📋 {t('task.title')}</h2>
                <p>{zh ? `共 ${tasks.length} 個任務` : `${tasks.length} total tasks`}</p>
            </div>

            <div className="page-body" style={{ display: 'flex', gap: '20px' }}>
                {/* Left: Task List */}
                <div style={{ flex: selectedTask ? '0 0 55%' : '1' }}>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select className="select" value={filter} onChange={e => setFilter(e.target.value)}>
                            <option value="all">{zh ? '全部' : 'All'}</option>
                            {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <div style={{ flex: 1 }} />
                        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
                            ➕ {t('task.create')}
                        </button>
                    </div>

                    {/* Quick Create */}
                    {showCreate && (
                        <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1, minWidth: '180px' }}>
                                <label style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                                    {zh ? '任務標題' : 'Task Title'}
                                </label>
                                <input className="input-field" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                                    placeholder={zh ? '輸入任務標題...' : 'Enter task title...'} onKeyDown={e => e.key === 'Enter' && createTask()} />
                            </div>
                            <select className="select" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
                                {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <select className="select" value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
                                <option value="">{zh ? '未指派' : 'Unassigned'}</option>
                                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                            <button className="btn btn-primary" onClick={createTask}>{t('common.save')}</button>
                            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
                        </div>
                    )}

                    {/* Tasks Table */}
                    <div className="card">
                        {loading ? (
                            <p className="loading-pulse">{t('common.loading')}</p>
                        ) : filtered.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>{t('common.no_data')}</p>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>{zh ? '任務' : 'Task'}</th>
                                        <th>{t('task.priority')}</th>
                                        <th>{t('task.status')}</th>
                                        <th>{t('task.assigned_to')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((task) => (
                                        <tr key={task.id} onClick={() => openTaskDetail(task)}
                                            style={{ cursor: 'pointer', background: selectedTask?.id === task.id ? 'var(--accent-primary-dim)' : undefined }}>
                                            <td style={{ color: 'var(--text-muted)', width: '36px' }}>{task.sort_order || '—'}</td>
                                            <td>
                                                <div style={{ fontWeight: 500, fontSize: '13px' }}>{task.title}</div>
                                            </td>
                                            <td>
                                                <span className={`priority-badge ${task.priority}`}>
                                                    {priorityIcon[task.priority]} {priorityLabel[task.priority]}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${task.status}`} style={{ fontSize: '11px' }}>
                                                    {statusLabel[task.status]}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                {task.assigned_user?.name || (zh ? '—' : '—')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Right: Task Detail Panel */}
                {selectedTask && (
                    <div style={{ flex: '0 0 42%', minWidth: '340px' }} className="fade-in">
                        <div className="card" style={{ position: 'sticky', top: '20px' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, lineHeight: 1.4 }}>{selectedTask.title}</h3>
                                <button className="btn btn-sm btn-secondary" onClick={() => setSelectedTask(null)} style={{ flexShrink: 0 }}>✕</button>
                            </div>

                            {/* Editable Fields */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                <div>
                                    <label className="detail-label">{t('task.status')}</label>
                                    <select className="select" style={{ width: '100%' }} value={selectedTask.status}
                                        onChange={e => { updateStatus(selectedTask.id, e.target.value); }}>
                                        {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{t('task.priority')}</label>
                                    <select className="select" style={{ width: '100%' }} value={selectedTask.priority}
                                        onChange={e => { updateTaskField(selectedTask.id, 'priority', e.target.value); setSelectedTask(p => p ? { ...p, priority: e.target.value } : null); }}>
                                        {Object.entries(priorityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{t('task.assigned_to')}</label>
                                    <select className="select" style={{ width: '100%' }} value={selectedTask.assigned_user?.id || ''}
                                        onChange={e => { updateTaskField(selectedTask.id, 'assigned_to', e.target.value || null); }}>
                                        <option value="">{zh ? '未指派' : 'Unassigned'}</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{t('task.due_date')}</label>
                                    <input type="date" className="select" style={{ width: '100%' }}
                                        value={selectedTask.due_date?.split('T')[0] || ''}
                                        onChange={e => { updateTaskField(selectedTask.id, 'due_date', e.target.value ? new Date(e.target.value).toISOString() : null); setSelectedTask(p => p ? { ...p, due_date: e.target.value } : null); }} />
                                </div>
                            </div>

                            {/* Info row */}
                            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                <span>ID: {selectedTask.id.substring(0, 8)}</span>
                                <span>{zh ? '建立' : 'Created'}: {new Date(selectedTask.created_at).toLocaleDateString('zh-TW')}</span>
                                {selectedTask.completed_at && <span>✅ {new Date(selectedTask.completed_at).toLocaleDateString('zh-TW')}</span>}
                            </div>

                            {/* Comments */}
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
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
                                        placeholder={zh ? '輸入備註...' : 'Add a comment...'} />
                                    <button className="btn btn-primary btn-sm" onClick={addComment}>
                                        {zh ? '送出' : 'Send'}
                                    </button>
                                </div>
                            </div>

                            {/* Delete */}
                            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', textAlign: 'right' }}>
                                <button className="btn btn-sm" style={{ color: 'var(--accent-red)', background: 'var(--accent-red-dim)' }}
                                    onClick={() => { if (confirm(zh ? '確定要刪除此任務？' : 'Delete this task?')) deleteTask(selectedTask.id); }}>
                                    🗑 {t('common.delete')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
