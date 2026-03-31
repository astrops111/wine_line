-- Task due date time + reminders
-- Changes due_date from DATE to TIMESTAMPTZ and adds reminder columns

ALTER TABLE public.tasks ALTER COLUMN due_date TYPE TIMESTAMPTZ USING due_date::TIMESTAMPTZ;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reminder_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tasks_reminder_pending ON public.tasks(reminder_at)
  WHERE reminder_at IS NOT NULL AND reminder_sent = false;

CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON public.tasks(due_date)
  WHERE due_date IS NOT NULL AND status NOT IN ('completed', 'cancelled');
