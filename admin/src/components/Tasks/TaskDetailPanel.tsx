import { useState, useRef, useEffect } from 'react';
import { t, getLocale } from '../../lib/i18n';
import { useOrg } from '../../lib/OrgContext';
import { supabase } from '../../lib/supabase';
import {
    getBucket,
    normalizeTriggers,
    sourceIcon,
    formatFileSize,
    uploadAttachmentFile,
    downloadAttachmentFile,
    deleteAttachmentFile,
    extractTime,
    extractLocalDate,
    getDueBadge,
    combineDatetime,
} from '../../lib/taskHelpers';
import type {
    Task,
    TaskComment,
    TaskUser,
    TaskStore,
    TaskWorkflowInstance,
    TaskAttachment,
    LinkedChecklist,
    LocalEdits,
} from '../../types/tasks';

interface TaskDetailPanelProps {
    selectedTask: Task;
    localEdits: LocalEdits | null;
    isDirty: boolean;
    patchEdit: (patch: Partial<LocalEdits>) => void;
    users: TaskUser[];
    stores: TaskStore[];
    workflowInstances: TaskWorkflowInstance[];
    displayBuckets: string[];
    tasks: Task[];
    comments: TaskComment[];
    loadingComments: boolean;
    newComment: string;
    setNewComment: (val: string) => void;
    addComment: () => void;
    linkedChecklists: LinkedChecklist[];
    allChecklists: { id: string; name: string }[];
    showLinkChecklist: boolean;
    setShowLinkChecklist: (val: boolean | ((prev: boolean) => boolean)) => void;
    linkChecklist: (id: string) => void;
    unlinkChecklist: (id: string) => void;
    attachments: TaskAttachment[];
    loadAttachments: (taskId: string) => Promise<void>;
    orgId: string;
    currentUserId: string | null;
    statusLabel: Record<string, string>;
    priorityLabel: Record<string, string>;
    closePanel: () => void;
    saveTaskEdits: () => Promise<void>;
    reloadTasks: () => Promise<void>;
    deleteTask: (id: string) => void;
    withConfirm: (msg: string, action: () => void) => void;
}

export function TaskDetailPanel({
    selectedTask,
    localEdits,
    isDirty,
    patchEdit,
    users,
    stores,
    workflowInstances,
    displayBuckets,
    tasks,
    comments,
    loadingComments,
    newComment,
    setNewComment,
    addComment,
    linkedChecklists,
    allChecklists,
    showLinkChecklist,
    setShowLinkChecklist,
    linkChecklist,
    unlinkChecklist,
    attachments,
    loadAttachments,
    orgId,
    currentUserId,
    statusLabel,
    priorityLabel,
    closePanel,
    saveTaskEdits,
    reloadTasks,
    deleteTask,
    withConfirm,
}: TaskDetailPanelProps) {
    const zh = getLocale() === 'zh-TW';
    const { orgSettings } = useOrg();
    const defaultStartTime = orgSettings.default_work_start || '09:00';
    const defaultEndTime = orgSettings.default_work_end || '18:00';
    const [uploading, setUploading] = useState(false);
    const [showApproverPicker, setShowApproverPicker] = useState(false);
    const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
    const [confirmations, setConfirmations] = useState<{ approver_id: string; status: string }[]>([]);

    // Load existing approvers when task changes
    useEffect(() => {
        if (!selectedTask.confirmation_required) { setConfirmations([]); return; }
        supabase.from('task_confirmations')
            .select('approver_id, status')
            .eq('task_id', selectedTask.id)
            .then(({ data }) => setConfirmations(data || []));
    }, [selectedTask.id, selectedTask.confirmation_required, selectedTask.confirmation_status]);

    async function submitApprovalRequest(approverIds: string[]) {
        if (approverIds.length === 0) return;
        const inserts = approverIds.map(id => ({ task_id: selectedTask.id, approver_id: id, status: 'pending' }));
        await supabase.from('task_confirmations').upsert(inserts, { onConflict: 'task_id,approver_id' });
        await supabase.from('tasks').update({
            confirmation_required: true,
            confirmation_status: 'pending',
            confirmation_requested_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', selectedTask.id);
        setShowApproverPicker(false);
        setSelectedApprovers([]);
        await reloadTasks();
    }
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function handleUpload(file: File) {
        setUploading(true);
        const result = await uploadAttachmentFile(orgId, selectedTask.id, file, currentUserId);
        if (result.error) alert(result.error);
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadAttachments(selectedTask.id);
    }

    // Trigger actions logic
    const currentTriggers = localEdits?.trigger_actions ?? normalizeTriggers(selectedTask.trigger_actions);
    const candidateTasks = tasks.filter(tk =>
        tk.id !== selectedTask.id &&
        !currentTriggers.includes(tk.id) &&
        (selectedTask.workflow_instance_id
            ? tk.workflow_instance_id === selectedTask.workflow_instance_id
            : !tk.workflow_instance_id)
    );

    const addTrigger = (taskId: string) => {
        if (!taskId || currentTriggers.includes(taskId)) return;
        patchEdit({ trigger_actions: [...currentTriggers, taskId] });
    };
    const removeTrigger = (taskId: string) => {
        patchEdit({ trigger_actions: currentTriggers.filter(id => id !== taskId) });
    };

    return (
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
                            value={extractLocalDate(localEdits?.planned_start ?? selectedTask.planned_start ?? '')}
                            onChange={e => {
                                const time = extractTime(localEdits?.planned_start || selectedTask.planned_start || null);
                                patchEdit({ planned_start: time ? combineDatetime(e.target.value, time, 'start') : e.target.value });
                            }} />
                        {(() => {
                            const raw = localEdits?.planned_start || selectedTask.planned_start || '';
                            const t = extractTime(raw || null);
                            return t ? (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                                    <input type="time" className="input-field" style={{ fontSize: '11px', padding: '2px 4px', flex: 1 }}
                                        value={t}
                                        onChange={e => patchEdit({ planned_start: combineDatetime(extractLocalDate(raw), e.target.value, 'start') })} />
                                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '1px 4px' }}
                                        onClick={() => patchEdit({ planned_start: extractLocalDate(raw) })}>✕</button>
                                </div>
                            ) : (
                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '1px 6px', marginTop: '4px', opacity: 0.6 }}
                                    onClick={() => {
                                        const date = extractLocalDate(localEdits?.planned_start ?? selectedTask.planned_start ?? '');
                                        if (date) patchEdit({ planned_start: combineDatetime(date, defaultStartTime, 'start') });
                                    }}>
                                    🕐 {zh ? '設定時間' : 'Set time'}
                                </button>
                            );
                        })()}
                    </div>
                    <div>
                        <label className="detail-label">
                            {zh ? '計畫完成日' : 'Plan End'}
                            {(() => {
                                const badge = getDueBadge(localEdits?.due_date || selectedTask.due_date || null, localEdits?.status ?? selectedTask.status);
                                return badge ? <span style={{ fontSize: '10px', color: badge.color, marginLeft: '6px', fontWeight: 600 }}>{badge.label}</span> : null;
                            })()}
                        </label>
                        <input type="date" className="select" style={{ width: '100%' }}
                            value={extractLocalDate(localEdits?.due_date ?? selectedTask.due_date ?? '')}
                            onChange={e => {
                                const time = extractTime(localEdits?.due_date || selectedTask.due_date || null);
                                patchEdit({ due_date: time ? combineDatetime(e.target.value, time, 'end') : e.target.value });
                            }} />
                        {(() => {
                            const raw = localEdits?.due_date || selectedTask.due_date || '';
                            const t = extractTime(raw || null);
                            return t ? (
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                                    <input type="time" className="input-field" style={{ fontSize: '11px', padding: '2px 4px', flex: 1 }}
                                        value={t}
                                        onChange={e => patchEdit({ due_date: combineDatetime(extractLocalDate(raw), e.target.value, 'end') })} />
                                    <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '1px 4px' }}
                                        onClick={() => patchEdit({ due_date: extractLocalDate(raw) })}>✕</button>
                                </div>
                            ) : (
                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '1px 6px', marginTop: '4px', opacity: 0.6 }}
                                    onClick={() => {
                                        const date = extractLocalDate(localEdits?.due_date ?? selectedTask.due_date ?? '');
                                        if (date) patchEdit({ due_date: combineDatetime(date, defaultEndTime, 'end') });
                                    }}>
                                    🕐 {zh ? '設定時間' : 'Set time'}
                                </button>
                            );
                        })()}
                    </div>
                    {/* Reminder */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label className="detail-label">⏰ {zh ? '提醒時間' : 'Reminder'}</label>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input type="datetime-local" className="input-field" style={{ flex: 1, fontSize: '12px' }}
                                value={(localEdits?.reminder_at ?? selectedTask.reminder_at ?? '').slice(0, 16)}
                                onChange={e => patchEdit({ reminder_at: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
                            {(localEdits?.reminder_at || selectedTask.reminder_at) && (
                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '1px 4px' }}
                                    onClick={() => patchEdit({ reminder_at: '' })}>✕</button>
                            )}
                        </div>
                        {(localEdits?.due_date || selectedTask.due_date) && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '1px 6px' }}
                                    onClick={() => {
                                        const dd = localEdits?.due_date || selectedTask.due_date || '';
                                        const d = new Date(dd);
                                        d.setHours(d.getHours() - 1);
                                        patchEdit({ reminder_at: d.toISOString() });
                                    }}>
                                    {zh ? '到期前1hr' : '1hr before'}
                                </button>
                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '1px 6px' }}
                                    onClick={() => {
                                        const dd = localEdits?.due_date || selectedTask.due_date || '';
                                        const d = new Date(dd);
                                        d.setDate(d.getDate() - 1);
                                        d.setHours(parseInt(defaultStartTime.split(':')[0]), parseInt(defaultStartTime.split(':')[1] || '0'), 0, 0);
                                        patchEdit({ reminder_at: d.toISOString() });
                                    }}>
                                    {zh ? '到期前1天' : '1 day before'}
                                </button>
                                <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '1px 6px' }}
                                    onClick={() => {
                                        const dd = localEdits?.due_date || selectedTask.due_date || '';
                                        const d = new Date(dd);
                                        d.setHours(parseInt(defaultStartTime.split(':')[0]), parseInt(defaultStartTime.split(':')[1] || '0'), 0, 0);
                                        patchEdit({ reminder_at: d.toISOString() });
                                    }}>
                                    {zh ? '當天09:00' : 'Same day 9AM'}
                                </button>
                            </div>
                        )}
                    </div>
                    {/* Confirmation / Approval */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label className="detail-label">🔐 {zh ? '確認審批' : 'Approval'}</label>
                        {selectedTask.confirmation_required ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className={`status-badge ${selectedTask.confirmation_status === 'approved' ? 'completed' : selectedTask.confirmation_status === 'rejected' ? 'cancelled' : 'in_progress'}`}
                                        style={{ fontSize: '11px' }}>
                                        {selectedTask.confirmation_status === 'approved' ? (zh ? '✅ 已核准' : '✅ Approved')
                                            : selectedTask.confirmation_status === 'rejected' ? (zh ? '❌ 已拒絕' : '❌ Rejected')
                                            : selectedTask.confirmation_status === 'pending' ? (zh ? '⏳ 等待確認' : '⏳ Pending')
                                            : (zh ? '— 尚未送出' : '— Not sent')}
                                    </span>
                                    {selectedTask.confirmation_requested_at && (
                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                            {new Date(selectedTask.confirmation_requested_at).toLocaleString('zh-TW', { timeZone: orgSettings.timezone || 'Asia/Taipei' })}
                                        </span>
                                    )}
                                </div>
                                {/* Show current approvers */}
                                {confirmations.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {confirmations.map(c => {
                                            const u = users.find(u => u.id === c.approver_id);
                                            return (
                                                <span key={c.approver_id} style={{
                                                    fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                                                    background: c.status === 'approved' ? '#dcfce7' : c.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                                                    color: c.status === 'approved' ? '#166534' : c.status === 'rejected' ? '#991b1b' : '#92400e',
                                                }}>
                                                    {c.status === 'approved' ? '✅' : c.status === 'rejected' ? '❌' : '⏳'} {u?.name || c.approver_id.slice(0, 6)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                {selectedTask.confirmation_notes && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '6px 8px', borderRadius: '6px' }}>
                                        {selectedTask.confirmation_notes}
                                    </div>
                                )}
                                {selectedTask.confirmation_status !== 'approved' && selectedTask.status !== 'completed' && (
                                    <button className="btn btn-sm btn-primary" style={{ alignSelf: 'flex-start' }}
                                        onClick={() => {
                                            setSelectedApprovers(confirmations.map(c => c.approver_id));
                                            setShowApproverPicker(true);
                                        }}>
                                        🔐 {selectedTask.confirmation_status === 'pending' ? (zh ? '重新送出確認' : 'Resend') : (zh ? '請求確認' : 'Request Approval')}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                                onClick={() => {
                                    setSelectedApprovers([]);
                                    setShowApproverPicker(true);
                                }}>
                                🔐 {zh ? '啟用審批' : 'Enable Approval'}
                            </button>
                        )}
                        {/* Approver picker */}
                        {showApproverPicker && (
                            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-variant)' }}>
                                <div style={{ fontSize: '12px', fontWeight: 600 }}>{zh ? '選擇審批人員' : 'Select Approvers'}</div>
                                <select className="select" style={{ width: '100%', fontSize: '12px' }}
                                    value="__placeholder__"
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val && val !== '__placeholder__' && !selectedApprovers.includes(val)) {
                                            setSelectedApprovers(prev => [...prev, val]);
                                        }
                                    }}>
                                    <option value="__placeholder__">{zh ? '— 選擇人員 —' : '— Select person —'}</option>
                                    {users.filter(u => !selectedApprovers.includes(u.id)).map(u => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </select>
                                {selectedApprovers.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {selectedApprovers.map(id => {
                                            const u = users.find(u => u.id === id);
                                            return (
                                                <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 8px', borderRadius: '10px', background: '#dbeafe', color: '#1d4ed8' }}>
                                                    {u?.name || id.slice(0, 6)}
                                                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '12px', color: '#1d4ed8', lineHeight: 1 }}
                                                        onClick={() => setSelectedApprovers(prev => prev.filter(a => a !== id))}>✕</button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-sm btn-primary" disabled={selectedApprovers.length === 0}
                                        onClick={() => submitApprovalRequest(selectedApprovers)}>
                                        🔐 {zh ? `送出 (${selectedApprovers.length})` : `Submit (${selectedApprovers.length})`}
                                    </button>
                                    <button className="btn btn-sm btn-secondary" onClick={() => { setShowApproverPicker(false); setSelectedApprovers([]); }}>
                                        {zh ? '取消' : 'Cancel'}
                                    </button>
                                </div>
                            </div>
                        )}
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

                {/* Trigger Actions */}
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
                        🔔 {zh ? '觸發動作（完成時執行）' : 'Trigger Actions (on complete)'}
                    </div>
                    {currentTriggers.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                            {currentTriggers.map(taskId => {
                                const tgt = tasks.find(tk => tk.id === taskId);
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
                    <select className="select" style={{ width: '100%', fontSize: '12px' }} value=""
                        onChange={e => { addTrigger(e.target.value); e.currentTarget.value = ''; }}>
                        <option value="">➕ {zh ? '新增觸發任務…' : 'Add trigger task…'}</option>
                        {candidateTasks.map(tk => (
                            <option key={tk.id} value={tk.id}>
                                {tk.sort_order ? `${tk.sort_order}. ` : ''}{tk.title}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Linked Checklists */}
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                            ✅ {zh ? '關聯查核清單' : 'Linked Checklists'} ({linkedChecklists.length})
                        </div>
                        <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                            onClick={() => setShowLinkChecklist((p: boolean) => !p)}>
                            {showLinkChecklist ? '✕' : `➕ ${zh ? '關聯' : 'Link'}`}
                        </button>
                    </div>
                    {linkedChecklists.length === 0 && !showLinkChecklist && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                            {zh ? '尚無關聯查核清單' : 'No linked checklists'}
                        </p>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: showLinkChecklist ? '10px' : '0' }}>
                        {linkedChecklists.map(cl => (
                            <span key={cl.id} style={{ fontSize: '11px', background: 'var(--accent-green-dim, #dcfce7)', color: 'var(--accent-green, #16a34a)', borderRadius: '8px', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                ✅ {cl.name}
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1, fontSize: '11px' }}
                                    onClick={() => unlinkChecklist(cl.id)}>✕</button>
                            </span>
                        ))}
                    </div>
                    {showLinkChecklist && (
                        <select className="select" style={{ width: '100%', fontSize: '12px' }} value=""
                            onChange={e => { if (e.target.value) linkChecklist(e.target.value); }}>
                            <option value="">{zh ? '選擇查核清單…' : 'Select a checklist…'}</option>
                            {allChecklists
                                .filter(cl => !linkedChecklists.some(l => l.id === cl.id))
                                .map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                        </select>
                    )}
                </div>

                {/* Attachments */}
                <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                            📎 {zh ? '附件' : 'Attachments'} ({attachments.length})
                        </div>
                        <button className="btn btn-sm btn-secondary" style={{ fontSize: '11px' }}
                            disabled={uploading}
                            onClick={() => fileInputRef.current?.click()}>
                            {uploading ? (zh ? '上傳中…' : 'Uploading…') : `📤 ${zh ? '上傳' : 'Upload'}`}
                        </button>
                        <input type="file" ref={fileInputRef} style={{ display: 'none' }}
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
                            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
                    </div>
                    {attachments.length === 0 && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                            {zh ? '尚無附件' : 'No attachments'}
                        </p>
                    )}
                    {attachments.map(att => (
                        <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', marginBottom: '6px', fontSize: '12px' }}>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={att.file_name}>
                                📄 {att.file_name}
                            </span>
                            {att.file_size != null && (
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                                    {formatFileSize(att.file_size)}
                                </span>
                            )}
                            <button className="btn btn-sm btn-secondary" style={{ fontSize: '10px', padding: '2px 6px', flexShrink: 0 }}
                                onClick={() => downloadAttachmentFile(att)}>⬇</button>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', fontSize: '12px', padding: '0 2px', flexShrink: 0 }}
                                onClick={() => withConfirm(zh ? '確定刪除此附件？' : 'Delete this attachment?', () => deleteAttachmentFile(att).then(() => loadAttachments(selectedTask.id)))}>✕</button>
                        </div>
                    ))}
                </div>

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
    );
}
