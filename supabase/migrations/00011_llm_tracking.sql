-- ============================================================
-- LLM Usage Tracking: Centralized API Cost Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.llm_usage_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    function_name   TEXT        NOT NULL,
    provider        TEXT        NOT NULL,
    model           TEXT        NOT NULL,
    input_tokens    INTEGER     DEFAULT 0,
    output_tokens   INTEGER     DEFAULT 0,
    total_tokens    INTEGER     DEFAULT 0,
    estimated_cost  NUMERIC(10,6) DEFAULT 0,
    latency_ms      INTEGER     DEFAULT 0,
    status          TEXT        DEFAULT 'success',
    error_message   TEXT,
    purpose         TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_created   ON public.llm_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_function  ON public.llm_usage_logs(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_provider  ON public.llm_usage_logs(provider, created_at DESC);

ALTER TABLE public.llm_usage_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "allow_all_llm_usage_logs" ON public.llm_usage_logs FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
