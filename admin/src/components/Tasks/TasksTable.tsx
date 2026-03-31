import { getLocale } from '../../lib/i18n';
import { normalizeTriggers, getDueBadge, extractTime } from '../../lib/taskHelpers';
import type { Task, TaskWorkflowInstance } from '../../types/tasks';

interface TasksTableProps {
    filtered: Task[];
    tasks: Task[];
    loading: boolean;
    selectedTaskId: string | null;
    openTaskDetail: (task: Task) => void;
    statusLabel: Record<string, string>;
    workflowInstances: TaskWorkflowInstance[];
    inlineAssignTaskId: string | null;
    setInlineAssignTaskId: (id: string | null) => void;
    assignWorkflowInline: (taskId: string, workflowInstanceId: string) => void;
    noDataLabel: string;
    loadingLabel: string;
}

export function TasksTable({
    filtered,
    tasks,
    loading,
    selectedTaskId,
    openTaskDetail,
    statusLabel,
    workflowInstances,
    inlineAssignTaskId,
    setInlineAssignTaskId,
    assignWorkflowInline,
    noDataLabel,
    loadingLabel,
}: TasksTableProps) {
    const zh = getLocale() === 'zh-TW';

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}><p className="loading-pulse">{loadingLabel}</p></div>
            ) : filtered.length === 0 ? (
                <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.5 }}>📭</div>
                    <div>{noDataLabel}</div>
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
                                <tr key={task.id} onClick={() => openTaskDetail(task)} tabIndex={0}
                                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { openTaskDetail(task); } }}
                                    style={{
                                        cursor: 'pointer',
                                        background: selectedTaskId === task.id ? 'var(--accent-primary-dim)' : undefined,
                                        borderLeft: selectedTaskId === task.id ? '3px solid var(--accent-primary)' : '3px solid transparent'
                                    }}>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{task.sort_order || idx + 1}</td>
                                    <td>
                                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {task.title}
                                            {(() => {
                                                const badge = getDueBadge(task.due_date, task.status);
                                                return badge ? <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: badge.color, color: '#fff', whiteSpace: 'nowrap' }}>{badge.label}</span> : null;
                                            })()}
                                        </div>
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
                                        {task.planned_start ? (
                                            <div>
                                                <div>{new Date(task.planned_start).toLocaleDateString('zh-TW')}</div>
                                                {extractTime(task.planned_start) && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>🕐 {extractTime(task.planned_start)}</div>}
                                            </div>
                                        ) : <span style={{ opacity: 0.4 }}>—</span>}
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)' }}>
                                        {task.due_date ? (
                                            <div>
                                                <div>{new Date(task.due_date).toLocaleDateString('zh-TW')}</div>
                                                {extractTime(task.due_date) && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>🕐 {extractTime(task.due_date)}</div>}
                                            </div>
                                        ) : <span style={{ opacity: 0.4 }}>—</span>}
                                    </td>
                                    <td style={{ color: task.completed_at ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                        {task.completed_at ? new Date(task.completed_at).toLocaleDateString('zh-TW') : <span style={{ opacity: 0.4 }}>—</span>}
                                    </td>
                                    <td>
                                        <span className={`status-badge ${task.status}`} style={{ fontSize: '10px' }}>
                                            {statusLabel[task.status]}
                                        </span>
                                    </td>
                                    <NoteCell value={task.note1} />
                                    <NoteCell value={task.note2} />
                                    <NoteCell value={task.note3} />
                                    <td style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                                        {task.updated_at ? new Date(task.updated_at).toLocaleDateString('zh-TW') : <span style={{ opacity: 0.4 }}>—</span>}
                                    </td>
                                    <td>
                                        <TriggerCell task={task} allTasks={tasks} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/** Compact note column cell. */
function NoteCell({ value }: { value?: string | null }) {
    return (
        <td style={{ color: 'var(--text-secondary)', maxWidth: '100px' }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value || ''}>
                {value || <span style={{ opacity: 0.3 }}>—</span>}
            </span>
        </td>
    );
}

/** Compact trigger-actions cell. */
function TriggerCell({ task, allTasks }: { task: Task; allTasks: Task[] }) {
    const trs = normalizeTriggers(task.trigger_actions);
    if (trs.length === 0) return <span style={{ opacity: 0.3, fontSize: '11px' }}>—</span>;
    const shown = trs.slice(0, 2);
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
            {shown.map((id, i) => {
                const label = allTasks.find(t => t.id === id)?.title || id.slice(0, 6);
                return <span key={i} style={{ background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)', borderRadius: '8px', padding: '1px 5px', fontSize: '10px', color: 'var(--text-muted)' }}>{label}</span>;
            })}
            {trs.length > 2 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+{trs.length - 2}</span>}
        </div>
    );
}
