-- ============================================================
-- Task Management: Attachments, Project Tasks, Sync Triggers
-- Consolidates: task_attachments, project_tasks,
--   project_notify_trigger
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: Task Attachments (storage bucket + metadata)
-- ════════════════════════════════════════════════════════════

-- Storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'task-attachments', 'task-attachments', false, 52428800,
    ARRAY[
        'application/pdf','image/jpeg','image/png','image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain','text/csv'
    ]
) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "task_attachments_select" ON storage.objects
    FOR SELECT USING (bucket_id = 'task-attachments');
CREATE POLICY "task_attachments_insert" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'task-attachments');
CREATE POLICY "task_attachments_delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'task-attachments');

-- Metadata table
CREATE TABLE IF NOT EXISTS public.task_attachments (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id       UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    file_name     TEXT        NOT NULL,
    storage_path  TEXT        NOT NULL,
    file_size     INTEGER,
    mime_type     TEXT,
    uploaded_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON public.task_attachments(task_id);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_task_attachments" ON public.task_attachments
    FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- SECTION 2: Project Tasks (3-way sync: Sheet A, Sheet B, LINE)
-- ════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.project_tasks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_no         INTEGER     NOT NULL UNIQUE,
    name            TEXT        NOT NULL,
    assignee        TEXT,
    planned_start   DATE,
    planned_end     DATE,
    actual_end      DATE,
    status          TEXT        NOT NULL DEFAULT '未開始',
    note1           TEXT,
    note2           TEXT,
    note3           TEXT,
    trigger1        TEXT,
    trigger2        TEXT,
    trigger3        TEXT,
    sync_source     TEXT        NOT NULL DEFAULT 'manual',
    synced_at       TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_no     ON public.project_tasks(task_no);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON public.project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assign ON public.project_tasks(assignee);

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "allow_all_project_tasks" ON public.project_tasks
        FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE  public.project_tasks IS 'Store-setup project tasks synced with Google Sheets A/B and LINE';
COMMENT ON COLUMN public.project_tasks.sync_source IS 'Origin of last update: sheet_a | line | manual | seed';
COMMENT ON COLUMN public.project_tasks.task_no IS 'Matches Sheet A "NO" column and Sheet B "任務" column';


-- ════════════════════════════════════════════════════════════
-- SECTION 3: Project Task Functions + Triggers
-- ════════════════════════════════════════════════════════════

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_project_tasks_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_tasks_updated_at
    BEFORE UPDATE ON public.project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.set_project_tasks_updated_at();

-- pg_net trigger: call Apps Script Web App when LINE updates a row
CREATE OR REPLACE FUNCTION public.notify_sheets_on_project_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    request_id  BIGINT;
    apps_script_url TEXT := 'https://script.google.com/macros/s/AKfycbwnF4rYPOmErzBOB9PbNx53vjRQrgw7x4Wj2is4TzkXL-1rZzMUJvF1RtyifJMeRu-X/exec';
    payload     JSONB;
BEGIN
    -- Only fire for LINE-originated changes (prevents Sheet A -> DB -> Sheet A loops)
    IF NEW.sync_source <> 'line' THEN
        RETURN NEW;
    END IF;

    payload := jsonb_build_object(
        'action',      'sync_from_db',
        'task_no',     NEW.task_no,
        'name',        COALESCE(NEW.name, ''),
        'assignee',    COALESCE(NEW.assignee, ''),
        'planned_end', COALESCE(NEW.planned_end::text, ''),
        'actual_end',  COALESCE(NEW.actual_end::text, ''),
        'status',      COALESCE(NEW.status, ''),
        'note1',       COALESCE(NEW.note1, ''),
        'updated_at',  NOW()::text
    );

    SELECT extensions.http_post(
        url     := apps_script_url,
        body    := payload,
        headers := jsonb_build_object('Content-Type', 'application/json')
    ) INTO request_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_tasks_sync_sheets
    AFTER INSERT OR UPDATE ON public.project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_sheets_on_project_task();

-- Trigger: send LINE notification when Sheet A updates a project task
CREATE OR REPLACE FUNCTION public.notify_line_on_sheet_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    request_id  BIGINT;
    project_url TEXT := 'https://kzawtuvmchhtdsokrjys.supabase.co';
    service_key TEXT;
    payload     JSONB;
    changes     JSONB := '{}'::jsonb;
BEGIN
    -- Only fire for Sheet A originated changes
    IF NEW.sync_source <> 'sheet_a' THEN
        RETURN NEW;
    END IF;

    -- Build changes object (compare old vs new for updates)
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            changes := changes || jsonb_build_object('狀態', COALESCE(NEW.status, ''));
        END IF;
        IF OLD.actual_end IS DISTINCT FROM NEW.actual_end THEN
            changes := changes || jsonb_build_object('實際完成日', COALESCE(NEW.actual_end::text, ''));
        END IF;
        IF OLD.planned_end IS DISTINCT FROM NEW.planned_end THEN
            changes := changes || jsonb_build_object('應完成日期', COALESCE(NEW.planned_end::text, ''));
        END IF;
        IF OLD.note1 IS DISTINCT FROM NEW.note1 THEN
            changes := changes || jsonb_build_object('進度說明', COALESCE(NEW.note1, ''));
        END IF;
        IF OLD.assignee IS DISTINCT FROM NEW.assignee THEN
            changes := changes || jsonb_build_object('負責人', COALESCE(NEW.assignee, ''));
        END IF;
        IF OLD.name IS DISTINCT FROM NEW.name THEN
            changes := changes || jsonb_build_object('項目名稱', COALESCE(NEW.name, ''));
        END IF;
        -- Skip if nothing actually changed
        IF changes = '{}'::jsonb THEN
            RETURN NEW;
        END IF;
    ELSE
        -- INSERT: mark as new task
        changes := jsonb_build_object('新增任務', NEW.name);
    END IF;

    service_key := coalesce(
        current_setting('app.settings.service_role_key', true),
        current_setting('supabase.service_role_key', true)
    );

    payload := jsonb_build_object(
        'task_no',  NEW.task_no,
        'name',     COALESCE(NEW.name, ''),
        'assignee', COALESCE(NEW.assignee, ''),
        'changes',  changes
    );

    SELECT extensions.http_post(
        url     := project_url || '/functions/v1/project-notify',
        body    := payload,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(service_key, '')
        )
    ) INTO request_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_tasks_line_notify
    AFTER INSERT OR UPDATE ON public.project_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_line_on_sheet_update();
