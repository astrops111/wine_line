-- Schedule task-reminder edge function via pg_cron
-- Checks for overdue tasks and pending reminders every 15 minutes

-- Helper function: calls task-reminder edge function via pg_net HTTP POST
CREATE OR REPLACE FUNCTION public.trigger_task_reminder()
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

    SELECT extensions.http_post(
        url     := project_url || '/functions/v1/task-reminder',
        body    := '{}'::jsonb,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(service_key, '')
        )
    ) INTO request_id;

    RETURN request_id;
END;
$$;

-- Schedule: every 15 minutes
DO $outer$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN PERFORM cron.unschedule('task_reminder_checker'); EXCEPTION WHEN OTHERS THEN NULL; END;
        PERFORM cron.schedule(
            'task_reminder_checker',
            '*/15 * * * *',
            $$SELECT public.trigger_task_reminder()$$
        );
    END IF;
END$outer$;
