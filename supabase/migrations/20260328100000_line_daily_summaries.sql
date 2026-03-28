-- ============================================================
-- Migration: LINE Daily Summaries
-- Created: 2026-03-28
-- Table: line_daily_summaries
-- Function: generate_daily_summary(target_date)
-- ============================================================

-- ── Table: line_daily_summaries ──────────────────────────────
-- One row per group per day, summarizing non-command user messages

CREATE TABLE IF NOT EXISTS public.line_daily_summaries (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id        TEXT        NOT NULL,
    group_name      TEXT,
    summary_date    DATE        NOT NULL,
    message_count   INTEGER     NOT NULL DEFAULT 0,
    unique_users    INTEGER     DEFAULT 0,
    user_names      TEXT[],
    summary_text    TEXT        NOT NULL DEFAULT '',
    context         JSONB,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (group_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_group ON public.line_daily_summaries(group_id);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date  ON public.line_daily_summaries(summary_date DESC);

ALTER TABLE public.line_daily_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_line_daily_summaries" ON public.line_daily_summaries;
CREATE POLICY "allow_all_line_daily_summaries" ON public.line_daily_summaries FOR ALL
    USING (true) WITH CHECK (true);


-- ── Function: generate_daily_summary ─────────────────────────
-- Aggregates non-command incoming group messages for a given date,
-- upserts one summary row per group, returns number of summaries.

CREATE OR REPLACE FUNCTION public.generate_daily_summary(target_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    summary_count INTEGER := 0;
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT
            m.group_id,
            MAX(m.display_name) AS sample_name,
            COUNT(*)::INTEGER AS msg_count,
            COUNT(DISTINCT m.line_user_id)::INTEGER AS uniq_users,
            ARRAY_AGG(DISTINCT m.display_name) FILTER (WHERE m.display_name IS NOT NULL) AS names,
            STRING_AGG(
                '[' || TO_CHAR(m.created_at AT TIME ZONE 'Asia/Taipei', 'HH24:MI') || '] '
                || COALESCE(m.display_name, '?') || ': '
                || LEFT(m.message_text, 200),
                E'\n'
                ORDER BY m.created_at ASC
            ) AS summary
        FROM public.line_messages m
        LEFT JOIN public.line_command_logs c
            ON c.line_user_id = m.line_user_id
            AND c.created_at BETWEEN m.created_at - INTERVAL '2 seconds' AND m.created_at + INTERVAL '2 seconds'
        WHERE m.direction = 'incoming'
          AND m.group_id IS NOT NULL
          AND m.created_at::date = target_date
          AND c.id IS NULL  -- exclude messages that triggered commands
        GROUP BY m.group_id
        HAVING COUNT(*) > 0
    LOOP
        INSERT INTO public.line_daily_summaries (group_id, group_name, summary_date, message_count, unique_users, user_names, summary_text, context)
        VALUES (
            rec.group_id,
            (SELECT g.group_name FROM public.line_groups g WHERE g.line_group_id = rec.group_id LIMIT 1),
            target_date,
            rec.msg_count,
            rec.uniq_users,
            rec.names,
            LEFT(rec.summary, 10000),
            jsonb_build_object('generated_at', now(), 'message_count', rec.msg_count)
        )
        ON CONFLICT (group_id, summary_date) DO UPDATE SET
            group_name    = EXCLUDED.group_name,
            message_count = EXCLUDED.message_count,
            unique_users  = EXCLUDED.unique_users,
            user_names    = EXCLUDED.user_names,
            summary_text  = EXCLUDED.summary_text,
            context       = EXCLUDED.context,
            created_at    = now();

        summary_count := summary_count + 1;
    END LOOP;

    RETURN summary_count;
END;
$$;
