export interface Task {
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
    reminder_at: string | null;
    confirmation_required: boolean;
    confirmation_status: string | null;
    confirmation_requested_at: string | null;
    confirmation_responded_at: string | null;
    confirmation_notes: string | null;
}

export interface TaskComment {
    id: string;
    content: string;
    source: string;
    created_at: string;
    user: { name: string } | null;
}

export interface TaskUser {
    id: string;
    name: string;
}

export interface TaskStore {
    id: string;
    name: string;
}

export interface TaskWorkflowInstance {
    id: string;
    name: string;
    status: string;
    workflow_id: string | null;
    current_step_id: string | null;
    started_at: string;
    store: { name: string } | null;
    current_step?: { name: string } | null;
}

export interface TaskWorkflowTemplate {
    id: string;
    name: string;
    description: string | null;
    status: string;
    created_at: string;
    steps?: { id: string; name: string }[];
}

export interface TaskAttachment {
    id: string;
    file_name: string;
    storage_path: string;
    file_size: number | null;
    created_at: string;
}

export interface LinkedChecklist {
    id: string;
    name: string;
    status: string;
}

export type LocalEdits = {
    status: string;
    priority: string;
    assigned_to: string;
    store_id: string;
    workflow_instance_id: string;
    planned_start: string;
    due_date: string;
    bucket: string;
    note1: string;
    note2: string;
    note3: string;
    trigger_actions: string[];
    reminder_at: string;
};
