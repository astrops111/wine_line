export interface LineGroup {
    id: string;
    group_name: string;
}

export interface Workflow {
    id: string;
    name: string;
    description: string | null;
    status: string;
    steps: WorkflowStep[];
    assigned_user_id?: string | null;
    assigned_groups?: string[]; // line_group UUIDs
}

export interface WorkflowStep {
    id: string;
    name: string;
    description: string | null;
    step_order: number;
    step_type: string;
    config: Record<string, unknown> | null;
    // config fields surfaced for convenience:
    estimated_minutes?: number | null;
    suggested_role?: string | null;
    name_en?: string | null;
}

export interface WorkflowInstance {
    id: string;
    name: string;
    status: string;
    started_at: string;
    workflow: { name: string } | null;
    taskSummary: TaskSummary;
    assigned_user_id?: string | null;
    assigned_groups?: string[];
    store_id?: string | null;
}

export interface InstanceTask {
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
    assigned_to: string | null;
    workflow_step_id: string | null;
    notes: string | null;
    step_type: string | null;
    store_id: string | null;
    store: { id: string; name: string } | null;
    metadata: Record<string, unknown> | null;
    note1: string | null;
    note2: string | null;
    note3: string | null;
    trigger_actions: string[] | null;
    bucket: string;
    confirmation_required: boolean;
    confirmation_status: string | null;
    reminder_at: string | null;
}

export interface TaskConfirmation {
    id: string;
    task_id: string;
    approver_id: string;
    status: string;
    notes: string | null;
    responded_at: string | null;
    created_at: string;
}

export interface TaskSummary {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    blocked: number;
    overdue: number;
}

export interface TaskEdit {
    status: string;
    assigned_to: string | null;
    notes: string | null;
    due_date: string | null;
    planned_start: string | null;
    priority: string;
    store_id: string | null;
    note1: string | null;
    note2: string | null;
    note3: string | null;
    reminder_at: string | null;
}

export interface EditStepState {
    name: string;
    description: string;
    step_type: string;
    estimated_minutes: string;
    suggested_role: string;
    name_en: string;
    default_assignee_id: string;
    triggers: string[];
    default_priority: string;
    default_store_id: string;
    requires_confirmation: boolean;
    confirmation_approver_ids: string[];
    completion_notify_ids: string[];
}

export interface Employee {
    id: string;
    name: string;
}

export interface Store {
    id: string;
    name: string;
    store_code: string | null;
}

export interface ConfirmDialogState {
    msg: string;
    onConfirm: () => void;
}
