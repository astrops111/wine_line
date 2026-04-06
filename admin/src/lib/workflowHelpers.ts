import { supabase } from './supabase';
import { writeAuditLog } from './auditLog';
import type {
    InstanceTask,
    TaskSummary,
    TaskEdit,
    TaskConfirmation,
    WorkflowInstance,
} from '../types/workflows';

/**
 * Map raw Supabase task rows to InstanceTask objects.
 */
export function mapTaskRows(data: any[]): InstanceTask[] {
    return data.map((t: any) => ({
        ...t,
        step_type: t.workflow_steps?.step_type ?? null,
        store: t.stores ?? null,
        workflow_steps: undefined,
        stores: undefined,
        description: t.description ?? null,
        planned_start: t.planned_start ?? null,
        completed_at: t.completed_at ?? null,
        updated_at: t.updated_at ?? null,
        created_at: t.created_at ?? '',
        store_id: t.store_id ?? null,
        metadata: t.metadata ?? null,
        note1: t.metadata?.note1 ?? null,
        note2: t.metadata?.note2 ?? null,
        note3: t.metadata?.note3 ?? null,
        trigger_actions: Array.isArray(t.metadata?.trigger_actions) ? t.metadata.trigger_actions.filter(Boolean) : null,
        bucket: t.metadata?.bucket || 'Workflow',
        confirmation_required: t.confirmation_required ?? false,
        confirmation_status: t.confirmation_status ?? null,
        reminder_at: t.reminder_at ?? null,
    }));
}

/**
 * Compute a TaskSummary from an array of tasks.
 */
export function computeTaskSummary(tasks: InstanceTask[]): TaskSummary {
    const now = new Date();
    const summary: TaskSummary = { total: tasks.length, pending: 0, in_progress: 0, completed: 0, blocked: 0, overdue: 0 };
    tasks.forEach(t => {
        if (t.status in summary) (summary as any)[t.status]++;
        if (t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < now) {
            summary.overdue++;
        }
    });
    return summary;
}

/**
 * Build a TaskEdit from an InstanceTask, or return existing edit if present.
 */
export function getTaskEdit(task: InstanceTask, taskEdits: Record<string, TaskEdit>): TaskEdit {
    return taskEdits[task.id] ?? {
        status: task.status,
        assigned_to: task.assigned_to,
        notes: task.notes,
        due_date: task.due_date,
        planned_start: task.planned_start,
        priority: task.priority,
        store_id: task.store_id,
        note1: task.note1,
        note2: task.note2,
        note3: task.note3,
        reminder_at: task.reminder_at,
    };
}

export interface SaveTaskEditDeps {
    orgId: string;
    currentUser: { id: string; name: string } | null | undefined;
    instanceTasks: InstanceTask[];
    taskEdits: Record<string, TaskEdit>;
    selectedInstance: WorkflowInstance | null;
    setInstanceTasks: React.Dispatch<React.SetStateAction<InstanceTask[]>>;
    setTaskEdits: React.Dispatch<React.SetStateAction<Record<string, TaskEdit>>>;
    setInstances: React.Dispatch<React.SetStateAction<WorkflowInstance[]>>;
    setSelectedInstance: React.Dispatch<React.SetStateAction<WorkflowInstance | null>>;
    loadInstanceTasks: (inst: WorkflowInstance) => Promise<void>;
}

/**
 * Save task edit to Supabase, handle auto-advance triggers and instance completion.
 */
export async function saveTaskEdit(taskId: string, deps: SaveTaskEditDeps) {
    const { orgId, currentUser, instanceTasks, taskEdits, selectedInstance,
        setInstanceTasks, setTaskEdits, setInstances, setSelectedInstance, loadInstanceTasks } = deps;

    const edit = taskEdits[taskId];
    if (!edit) return;
    const task = instanceTasks.find(t => t.id === taskId);
    const oldStatus = task?.status;

    const reminderChanged = edit.reminder_at !== task?.reminder_at;
    await supabase.from('tasks').update({
        status: edit.status,
        priority: edit.priority,
        assigned_to: edit.assigned_to || null,
        notes: edit.notes ?? null,
        due_date: edit.due_date || null,
        planned_start: edit.planned_start || null,
        store_id: edit.store_id || null,
        reminder_at: edit.reminder_at || null,
        ...(reminderChanged ? { reminder_sent: false } : {}),
        metadata: {
            ...(task?.metadata || {}),
            note1: edit.note1 || null,
            note2: edit.note2 || null,
            note3: edit.note3 || null,
        },
        updated_at: new Date().toISOString(),
        ...(edit.status === 'completed' ? { completed_at: new Date().toISOString() } : { completed_at: null }),
    }).eq('id', taskId);

    const updatedTasks = instanceTasks.map(t => t.id === taskId ? { ...t, ...edit } : t);
    setInstanceTasks(updatedTasks);
    setTaskEdits(p => { const n = { ...p }; delete n[taskId]; return n; });

    // Update instance summary
    const summary = computeTaskSummary(updatedTasks);
    setInstances(prev => prev.map(inst =>
        inst.id !== selectedInstance?.id ? inst : { ...inst, taskSummary: summary }
    ));

    // Audit log
    if (oldStatus !== edit.status) {
        writeAuditLog({
            organization_id: orgId,
            user_id: currentUser?.id,
            user_name: currentUser?.name,
            action: 'update',
            module: 'workflow',
            table_name: 'tasks',
            record_id: taskId,
            record_label: task?.title,
            old_values: { status: oldStatus },
            new_values: { status: edit.status },
        });
    }

    // Auto-advance on completion
    if (edit.status === 'completed' && selectedInstance) {
        await handleTaskCompletion(taskId, updatedTasks, deps);
    }
}

/**
 * Handle post-completion logic: triggers, completion notifications, instance auto-complete.
 * Reusable from both saveTaskEdit and respondConfirmation flows.
 */
export async function handleTaskCompletion(
    taskId: string,
    updatedTasks: InstanceTask[],
    deps: SaveTaskEditDeps,
) {
    const { orgId, currentUser, selectedInstance, setInstances, setSelectedInstance, loadInstanceTasks } = deps;
    if (!selectedInstance) return;

    const task = updatedTasks.find(t => t.id === taskId);

    // Check triggers on the completed step
    if (task?.workflow_step_id) {
        const { data: stepData } = await supabase.from('workflow_steps')
            .select('config').eq('id', task.workflow_step_id).single();
        const config = (stepData?.config as any) || {};
        const triggers: string[] = Array.isArray(config.triggers)
            ? (config.triggers as string[]).filter(Boolean) : [];
        if (triggers.length > 0) {
            const triggeredTasks = updatedTasks.filter(t =>
                t.workflow_step_id && triggers.includes(t.workflow_step_id) && t.status !== 'completed' && t.status !== 'cancelled'
            );
            let changed = false;
            for (const pt of triggeredTasks) {
                if (pt.status === 'pending') {
                    await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', pt.id);
                    changed = true;
                } else {
                    // Already in_progress/blocked — keep status, just notify
                    await supabase.from('task_comments').insert({
                        task_id: pt.id,
                        content: `[TRIGGER] ${task.title} — ${task.title} completed, this task was triggered but status kept as-is.`,
                        source: 'system',
                    });
                }
            }
            if (changed) {
                await loadInstanceTasks(selectedInstance);
                return;
            }
        }
        // Completion notifications
        const notifyIds: string[] = Array.isArray(config.completion_notify_ids)
            ? (config.completion_notify_ids as string[]).filter(Boolean) : [];
        if (notifyIds.length > 0) {
            await supabase.from('task_comments').insert({
                task_id: taskId,
                user_id: currentUser?.id || null,
                content: `[COMPLETED] ${task.title} — notified: ${notifyIds.join(', ')}`,
                source: 'system',
            });
        }
    }

    // Check if all tasks completed -> auto-complete instance
    const allCompleted = updatedTasks.every(t => t.status === 'completed');
    if (allCompleted) {
        await supabase.from('workflow_instances')
            .update({ status: 'completed' }).eq('id', selectedInstance.id);
        setInstances(prev => prev.map(inst =>
            inst.id === selectedInstance.id ? { ...inst, status: 'completed' } : inst
        ));
        setSelectedInstance(prev => prev ? { ...prev, status: 'completed' } : prev);
        writeAuditLog({
            organization_id: orgId,
            user_id: currentUser?.id,
            user_name: currentUser?.name,
            action: 'update',
            module: 'workflow',
            table_name: 'workflow_instances',
            record_id: selectedInstance.id,
            record_label: selectedInstance.name,
            old_values: { status: 'running' },
            new_values: { status: 'completed' },
        });
    }
}

/**
 * Status label map generator.
 */
export function getStatusLabels(zh: boolean): Record<string, string> {
    return {
        running:   zh ? '🔄 進行中' : '🔄 Running',
        completed: zh ? '✅ 已完成' : '✅ Completed',
        paused:    zh ? '⏸ 已暫停' : '⏸ Paused',
        cancelled: zh ? '❌ 已取消' : '❌ Cancelled',
        archived:  zh ? '📦 已封存' : '📦 Archived',
        draft:     zh ? '📝 草稿'   : '📝 Draft',
        active:    zh ? '🟢 已啟用' : '🟢 Active',
    };
}

/**
 * Priority badge map.
 */
export const priorityBadge: Record<string, string> = {
    low: '🟢', medium: '🟡', high: '🔴', urgent: '🚨',
};

/**
 * Load task confirmations for tasks that require them.
 */
export async function loadTaskConfirmations(
    taskIds: string[],
    setTaskConfirmations: React.Dispatch<React.SetStateAction<Record<string, TaskConfirmation[]>>>,
) {
    if (taskIds.length === 0) return;
    const { data: allConfirms } = await supabase.from('task_confirmations')
        .select('id, task_id, approver_id, status, notes, responded_at, created_at')
        .in('task_id', taskIds);
    const confirmMap: Record<string, TaskConfirmation[]> = {};
    (allConfirms || []).forEach((c: any) => {
        if (!confirmMap[c.task_id]) confirmMap[c.task_id] = [];
        confirmMap[c.task_id].push(c);
    });
    setTaskConfirmations(prev => ({ ...prev, ...confirmMap }));
}
