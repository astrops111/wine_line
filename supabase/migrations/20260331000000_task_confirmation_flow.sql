-- Task Confirmation / Approval Flow
-- Adds structured confirmation tracking to tasks

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS confirmation_required     BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_status       TEXT,        -- 'pending' | 'approved' | 'rejected'
  ADD COLUMN IF NOT EXISTS confirmation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_notes        TEXT;

-- Task confirmation approvers (many-to-many: a task can require multiple approvers)
CREATE TABLE IF NOT EXISTS public.task_confirmations (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    approver_id  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
    notes        TEXT,
    responded_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE(task_id, approver_id)
);

CREATE INDEX IF NOT EXISTS idx_task_confirmations_task     ON public.task_confirmations(task_id);
CREATE INDEX IF NOT EXISTS idx_task_confirmations_approver ON public.task_confirmations(approver_id);
CREATE INDEX IF NOT EXISTS idx_task_confirmations_status   ON public.task_confirmations(status);

ALTER TABLE public.task_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_task_confirmations" ON public.task_confirmations
    FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tasks_confirmation_status ON public.tasks(confirmation_status)
    WHERE confirmation_required = true;
