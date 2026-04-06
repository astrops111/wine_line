import { supabase } from './supabase';
import type { Task, TaskAttachment } from '../types/tasks';

/** Determine which bucket a task belongs to based on metadata or defaults. */
export const getBucket = (task: Task): string => {
    const metaBucket = task.metadata && (task.metadata as Record<string, unknown>).bucket;
    if (metaBucket) return String(metaBucket);
    return task.workflow_instance_id ? 'Workflow' : 'General';
};

/** Merge configured buckets with dynamically-discovered ones from tasks. */
export const getDisplayBuckets = (buckets: string[], tasks: Task[]): string[] =>
    Array.from(new Set([...buckets, ...tasks.map(getBucket)]));

/** Normalize trigger_actions to a string array. */
export const normalizeTriggers = (val: unknown): string[] =>
    Array.isArray(val) ? val.map(String) : val ? [String(val)] : [];

/** Status labels (zh-TW keys match the i18n translation keys). */
export const STATUS_KEYS = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'] as const;

/** Priority icon mapping. */
export const priorityIcon: Record<string, string> = {
    low: '🔵', medium: '🟡', high: '🟠', urgent: '🔴',
};

/** Comment source icon mapping. */
export const sourceIcon: Record<string, string> = {
    web: '🌐', line: '📱', system: '⚙️',
};

/** Due date badge: overdue or due-today indicator. */
export function getDueBadge(dueDate: string | null, status: string): { label: string; color: string } | null {
    if (!dueDate || status === 'completed' || status === 'cancelled') return null;
    const due = new Date(dueDate);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 0) return { label: '逾期', color: '#ef4444' };
    if (diffHours < 24) return { label: '今日到期', color: '#f59e0b' };
    return null;
}

/** Extract local date string (YYYY-MM-DD) from ISO datetime. */
export function extractLocalDate(datetime: string | null): string {
    if (!datetime) return '';
    const d = new Date(datetime);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Extract time string (HH:mm) from ISO datetime, returns '' if no meaningful time. */
export function extractTime(datetime: string | null): string {
    if (!datetime) return '';
    const d = new Date(datetime);
    const h = d.getHours();
    const m = d.getMinutes();
    // Treat 00:00 and 23:59 as "no time set"
    if ((h === 0 && m === 0) || (h === 23 && m === 59)) return '';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Combine a date string and optional time string into ISO datetime. */
export function combineDatetime(date: string, time: string, defaultTime: 'start' | 'end' = 'end'): string {
    if (!date) return '';
    if (time) return new Date(`${date}T${time}:00`).toISOString();
    // Default: 23:59 for due_date (end of day), 00:00 for planned_start
    const fallback = defaultTime === 'end' ? '23:59:00' : '00:00:00';
    return new Date(`${date}T${fallback}`).toISOString();
}

// ---------------------------------------------------------------------------
// Attachment operations
// ---------------------------------------------------------------------------

export async function uploadAttachmentFile(
    orgId: string,
    taskId: string,
    file: File,
    uploadedBy: string | null,
): Promise<{ error?: string }> {
    const ext = file.name.split('.').pop();
    const path = `${orgId}/${taskId}/${Date.now()}.${ext}`;

    const { error: storageError } = await supabase.storage
        .from('task-attachments')
        .upload(path, file, { contentType: file.type });
    if (storageError) return { error: storageError.message };

    const { error: dbError } = await supabase.from('task_attachments').insert({
        task_id: taskId,
        file_name: file.name,
        storage_path: path,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: uploadedBy,
    });

    if (dbError) {
        await supabase.storage.from('task-attachments').remove([path]);
        return { error: dbError.message };
    }
    return {};
}

export async function downloadAttachmentFile(att: TaskAttachment): Promise<void> {
    const { data, error } = await supabase.storage
        .from('task-attachments')
        .createSignedUrl(att.storage_path, 60);
    if (error || !data?.signedUrl) {
        alert('Download failed');
        return;
    }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = att.file_name;
    a.click();
}

export async function deleteAttachmentFile(att: TaskAttachment): Promise<void> {
    await supabase.storage.from('task-attachments').remove([att.storage_path]);
    await supabase.from('task_attachments').delete().eq('id', att.id);
}

/** Format file size for display. */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / 1048576).toFixed(1)}MB`;
}

// ---------------------------------------------------------------------------
// Workflow trigger logic
// ---------------------------------------------------------------------------

export async function triggerNextWorkflowStep(
    completedTask: Task,
    zh: boolean,
): Promise<void> {
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
            // Fallback: sequential -- find next step by order
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
        // If task already exists, advance it to in_progress if still pending
        const { data: existing } = await supabase
            .from('tasks')
            .select('id, status')
            .eq('workflow_instance_id', workflow_instance_id!)
            .eq('workflow_step_id', stepId)
            .maybeSingle();
        if (existing) {
            if (existing.status === 'pending') {
                await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', existing.id);
            } else if (existing.status !== 'completed' && existing.status !== 'cancelled') {
                // Task already in progress/blocked — don't change status, just notify
                await supabase.from('task_comments').insert({
                    task_id: existing.id,
                    content: notifMsg,
                    source: 'system',
                });
            }
            continue;
        }

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
            status: 'in_progress',
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
