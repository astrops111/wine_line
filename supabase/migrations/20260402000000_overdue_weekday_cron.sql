-- Split task-reminder cron into two schedules:
--   1. Every 15 min: reminder_at pre-due notifications only
--   2. Weekdays 8am Taipei (00:00 UTC): overdue notifications (repeating daily)

-- Helper for reminder-only calls
CREATE OR REPLACE FUNCTION public.trigger_task_reminder_reminders()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    project_url TEXT := 'https://kzawtuvmchhtdsokrjys.supabase.co';
    service_key TEXT;
    request_id  BIGINT;
BEGIN
    service_key := coalesce(
        current_setting('app.settings.service_role_key', true),
        current_setting('supabase.service_role_key', true)
    );

    SELECT net.http_post(
        url     := project_url || '/functions/v1/task-reminder',
        body    := '{"mode":"reminders"}'::jsonb,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(service_key, '')
        )
    ) INTO request_id;

    RETURN request_id;
END;
$$;

-- Helper for overdue-only calls
CREATE OR REPLACE FUNCTION public.trigger_task_reminder_overdue()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    project_url TEXT := 'https://kzawtuvmchhtdsokrjys.supabase.co';
    service_key TEXT;
    request_id  BIGINT;
BEGIN
    service_key := coalesce(
        current_setting('app.settings.service_role_key', true),
        current_setting('supabase.service_role_key', true)
    );

    SELECT net.http_post(
        url     := project_url || '/functions/v1/task-reminder',
        body    := '{"mode":"overdue"}'::jsonb,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(service_key, '')
        )
    ) INTO request_id;

    RETURN request_id;
END;
$$;

-- Replace old single cron with two separate schedules
DO $outer$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove old combined cron
        BEGIN PERFORM cron.unschedule('task_reminder_checker'); EXCEPTION WHEN OTHERS THEN NULL; END;

        -- 1. Every 15 min: pre-due reminders only
        BEGIN PERFORM cron.unschedule('task_reminder_reminders'); EXCEPTION WHEN OTHERS THEN NULL; END;
        PERFORM cron.schedule(
            'task_reminder_reminders',
            '*/15 * * * *',
            $$SELECT public.trigger_task_reminder_reminders()$$
        );

        -- 2. Weekdays 8am Taipei (00:00 UTC): overdue notifications
        BEGIN PERFORM cron.unschedule('task_overdue_weekday'); EXCEPTION WHEN OTHERS THEN NULL; END;
        PERFORM cron.schedule(
            'task_overdue_weekday',
            '0 0 * * 1-5',
            $$SELECT public.trigger_task_reminder_overdue()$$
        );
    END IF;
END$outer$;
