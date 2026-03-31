-- ============================================================
-- LINE Messaging: Groups, Messages, Logs, Summaries, Cron Jobs
-- Consolidates: line_logging_and_enhanced_tasks, line_daily_summaries,
--   daily_summary_cron, daily_summary_24h, tiered_summaries
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- SECTION 1: LINE Groups (master table)
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.line_groups (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    line_group_id   TEXT        NOT NULL UNIQUE,
    group_name      TEXT        NOT NULL,
    group_type      TEXT        NOT NULL DEFAULT 'general',
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    joined_at       TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_groups_line_id ON public.line_groups(line_group_id);

ALTER TABLE public.line_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_line_groups" ON public.line_groups;
CREATE POLICY "allow_all_line_groups" ON public.line_groups FOR ALL
    USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- SECTION 2: LINE Messages
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.line_messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    line_user_id    TEXT        NOT NULL,
    display_name    TEXT,
    message_text    TEXT        NOT NULL,
    source_type     TEXT        NOT NULL DEFAULT 'user',
    direction       TEXT        NOT NULL DEFAULT 'incoming',
    group_id        TEXT,
    event_type      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_messages_user    ON public.line_messages(line_user_id);
CREATE INDEX IF NOT EXISTS idx_line_messages_group   ON public.line_messages(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_line_messages_created ON public.line_messages(created_at DESC);

ALTER TABLE public.line_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_line_messages" ON public.line_messages;
CREATE POLICY "allow_all_line_messages" ON public.line_messages FOR ALL
    USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- SECTION 3: LINE Command Logs
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.line_command_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    line_user_id        TEXT        NOT NULL,
    display_name        TEXT,
    command_matched     TEXT        NOT NULL,
    raw_input           TEXT        NOT NULL,
    source_type         TEXT        NOT NULL DEFAULT 'user',
    group_id            TEXT,
    success             BOOLEAN     NOT NULL DEFAULT true,
    error_message       TEXT,
    created_entity_type TEXT,
    created_entity_id   UUID,
    metadata            JSONB,
    execution_ms        INTEGER,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_command_logs_user    ON public.line_command_logs(line_user_id);
CREATE INDEX IF NOT EXISTS idx_command_logs_cmd     ON public.line_command_logs(command_matched);
CREATE INDEX IF NOT EXISTS idx_command_logs_created ON public.line_command_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_logs_errors  ON public.line_command_logs(success) WHERE success = false;

ALTER TABLE public.line_command_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_line_command_logs" ON public.line_command_logs;
CREATE POLICY "allow_all_line_command_logs" ON public.line_command_logs FOR ALL
    USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- SECTION 4: LINE Error Logs
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.line_error_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    line_user_id    TEXT,
    source_type     TEXT,
    group_id        TEXT,
    error_type      TEXT        NOT NULL,
    error_message   TEXT        NOT NULL,
    error_stack     TEXT,
    context         JSONB,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_type    ON public.line_error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON public.line_error_logs(created_at DESC);

ALTER TABLE public.line_error_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_line_error_logs" ON public.line_error_logs;
CREATE POLICY "allow_all_line_error_logs" ON public.line_error_logs FOR ALL
    USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- SECTION 5: Daily Summaries
-- ════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════
-- SECTION 6: Weekly + Monthly Summaries (tiered)
-- ════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.line_weekly_summaries (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id         TEXT        NOT NULL,
    group_name       TEXT,
    week_start       DATE        NOT NULL,
    week_end         DATE        NOT NULL,
    message_count    INTEGER     NOT NULL DEFAULT 0,
    unique_users     INTEGER     DEFAULT 0,
    user_names       TEXT[],
    summary_text     TEXT        NOT NULL DEFAULT '',
    key_decisions    TEXT[],
    action_items     TEXT[],
    recurring_topics TEXT[],
    context          JSONB,
    created_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (group_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_group ON public.line_weekly_summaries(group_id);
CREATE INDEX IF NOT EXISTS idx_weekly_summaries_week  ON public.line_weekly_summaries(week_start DESC);
ALTER TABLE public.line_weekly_summaries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "allow_all_line_weekly_summaries" ON public.line_weekly_summaries FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.line_monthly_summaries (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id         TEXT        NOT NULL,
    group_name       TEXT,
    summary_month    DATE        NOT NULL,
    message_count    INTEGER     NOT NULL DEFAULT 0,
    unique_users     INTEGER     DEFAULT 0,
    user_names       TEXT[],
    summary_text     TEXT        NOT NULL DEFAULT '',
    key_decisions    TEXT[],
    action_items     TEXT[],
    recurring_topics TEXT[],
    notable_events   TEXT[],
    context          JSONB,
    created_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (group_id, summary_month)
);
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_group ON public.line_monthly_summaries(group_id);
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_month ON public.line_monthly_summaries(summary_month DESC);
ALTER TABLE public.line_monthly_summaries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "allow_all_line_monthly_summaries" ON public.line_monthly_summaries FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ════════════════════════════════════════════════════════════
-- SECTION 7: Functions — Daily Summary Generation
-- ════════════════════════════════════════════════════════════

-- Overload 1: by date
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

-- Overload 2: by timestamp range (24h window)
CREATE OR REPLACE FUNCTION public.generate_daily_summary(
    range_start TIMESTAMPTZ,
    range_end   TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    summary_count INTEGER := 0;
    summary_date_val DATE := (range_start AT TIME ZONE 'Asia/Taipei')::date;
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
          AND m.created_at >= range_start
          AND m.created_at < range_end
          AND c.id IS NULL
        GROUP BY m.group_id
        HAVING COUNT(*) > 0
    LOOP
        INSERT INTO public.line_daily_summaries
            (group_id, group_name, summary_date, message_count, unique_users, user_names, summary_text, context)
        VALUES (
            rec.group_id,
            (SELECT g.group_name FROM public.line_groups g WHERE g.line_group_id = rec.group_id LIMIT 1),
            summary_date_val,
            rec.msg_count,
            rec.uniq_users,
            rec.names,
            LEFT(rec.summary, 10000),
            jsonb_build_object(
                'generated_at', now(),
                'message_count', rec.msg_count,
                'range_start', range_start,
                'range_end', range_end
            )
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


-- ════════════════════════════════════════════════════════════
-- SECTION 8: Functions — Tiered Summary Trigger + Pruning
-- ════════════════════════════════════════════════════════════

-- pg_net trigger: calls edge function via HTTP POST
CREATE OR REPLACE FUNCTION public.trigger_summary_edge_function(tier TEXT)
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
        url     := project_url || '/functions/v1/summarize-history',
        body    := jsonb_build_object('tier', tier),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(service_key, '')
        )
    ) INTO request_id;

    RETURN request_id;
END;
$$;

-- Pruning: removes raw messages + daily summaries older than 90 days
CREATE OR REPLACE FUNCTION public.prune_old_line_data()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    cutoff_date DATE := (CURRENT_DATE - INTERVAL '90 days')::date;
    deleted_messages INTEGER := 0;
    deleted_dailies  INTEGER := 0;
BEGIN
    DELETE FROM public.line_messages m
    WHERE m.created_at::date <= cutoff_date
      AND m.group_id IS NOT NULL
      AND EXISTS (
          SELECT 1 FROM public.line_monthly_summaries ms
          WHERE ms.group_id = m.group_id
            AND ms.summary_month = date_trunc('month', m.created_at::date)::date
      );
    GET DIAGNOSTICS deleted_messages = ROW_COUNT;

    DELETE FROM public.line_daily_summaries d
    WHERE d.summary_date <= cutoff_date
      AND EXISTS (
          SELECT 1 FROM public.line_monthly_summaries ms
          WHERE ms.group_id = d.group_id
            AND ms.summary_month = date_trunc('month', d.summary_date)::date
      );
    GET DIAGNOSTICS deleted_dailies = ROW_COUNT;

    RETURN deleted_messages + deleted_dailies;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- SECTION 9: Cron Jobs
-- ════════════════════════════════════════════════════════════

DO $outer$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Daily: 7:00 AM Asia/Taipei = 23:00 UTC, past 24 hours
        BEGIN PERFORM cron.unschedule('daily_line_summary'); EXCEPTION WHEN OTHERS THEN NULL; END;
        PERFORM cron.schedule(
            'daily_line_summary',
            '0 23 * * *',
            $$SELECT public.generate_daily_summary(now() - interval '24 hours', now())$$
        );

        -- Weekly: Sunday 23:00 UTC = Monday 7:00 AM Taipei
        BEGIN PERFORM cron.unschedule('weekly_line_summary'); EXCEPTION WHEN OTHERS THEN NULL; END;
        PERFORM cron.schedule(
            'weekly_line_summary',
            '0 23 * * 0',
            $$SELECT public.trigger_summary_edge_function('weekly')$$
        );

        -- Monthly: 1st of month 00:30 UTC = 8:30 AM Taipei
        BEGIN PERFORM cron.unschedule('monthly_line_summary'); EXCEPTION WHEN OTHERS THEN NULL; END;
        PERFORM cron.schedule(
            'monthly_line_summary',
            '30 0 1 * *',
            $$SELECT public.trigger_summary_edge_function('monthly')$$
        );

        -- Pruning: 2nd of month 02:00 UTC = 10:00 AM Taipei
        BEGIN PERFORM cron.unschedule('prune_old_line_data'); EXCEPTION WHEN OTHERS THEN NULL; END;
        PERFORM cron.schedule(
            'prune_old_line_data',
            '0 2 2 * *',
            $$SELECT public.prune_old_line_data()$$
        );
    END IF;
END$outer$;


-- ════════════════════════════════════════════════════════════
-- SECTION 10: Help Articles (LINE features documentation)
-- ════════════════════════════════════════════════════════════

INSERT INTO public.help_articles (title, title_en, content, content_en, category, tags, page_route)
VALUES
(
  '在群組中新增任務',
  'Create Tasks from Group Chat',
  '## 群組快速新增任務

您可以直接在 LINE 群組中建立任務，機器人會私訊您確認細節。

### 觸發方式
在群組中輸入以下任一格式：
- `新增任務 [任務標題]`
- `@linebot 新增任務 [任務標題]`

例如：`新增任務 補充紅酒庫存`

### 建立流程
1. **選擇工作流程** — 輸入編號選擇，或「跳過」不關聯流程
2. **設定截止日** — 輸入日期（YYYY-MM-DD、MM/DD）或中文（明天、後天、下週一、3天後），或「跳過」
3. **設定提醒** — 選擇截止前1天、截止前2小時，或「跳過」
4. **選擇負責人**（僅管理員）— 輸入編號或姓名指定負責人，或「自己」
5. **確認建立** — 輸入「確認」完成建立，或「取消」放棄

### 注意事項
- 任何步驟中輸入「取消」可隨時中止
- 非管理員建立的任務會自動指派給自己
- 管理員可以將任務指派給其他員工
- 從群組觸發時，任務建立完成後會通知群組',
  '## Create Tasks from Group Chat

You can create tasks directly from a LINE group chat. The bot will DM you to confirm details.

### Trigger Commands
Type one of the following in a group:
- `新增任務 [task title]`
- `@linebot 新增任務 [task title]`

Example: `新增任務 Restock red wine`

### Creation Flow
1. **Select Workflow** — Enter a number to select, or "跳過" (skip) to skip
2. **Set Due Date** — Enter date (YYYY-MM-DD, MM/DD) or Chinese relative dates (明天, 後天, 下週一, 3天後), or "跳過"
3. **Set Reminder** — Choose "截止前1天" (1 day before), "截止前2小時" (2 hours before), or "跳過"
4. **Select Owner** (managers only) — Enter number or name, or "自己" (myself)
5. **Confirm** — Enter "確認" to create, or "取消" to cancel

### Notes
- Type "取消" at any step to abort
- Non-managers are auto-assigned as owner
- Managers can assign tasks to other employees
- When triggered from a group, the group receives a confirmation message',
  'LINE Bot',
  ARRAY['任務', '新增', '群組', 'task', 'create', 'group', '@linebot'],
  '/line'
),
(
  '個人聊天新增任務（進階）',
  'Enhanced Task Creation in Personal Chat',
  '## 私訊進階新增任務

在與機器人的私訊中，您可以使用進階流程新增任務。

### 指令
輸入：`/任務 新增 [任務標題]`

例如：`/任務 新增 準備季度報告`

### 流程說明
提供任務標題後，機器人會依序詢問：
1. **工作流程** — 是否關聯到某個進行中的工作流程
2. **截止日期** — 支援多種格式（YYYY-MM-DD、MM/DD、明天、後天、下週一、X天後）
3. **提醒設定** — 截止前提醒通知
4. **負責人**（管理員專屬）— 可指派給其他員工

每個步驟都可以「跳過」，最後確認後建立任務。

### 快速建立
如果不需要設定額外資訊，使用 LIFF App 的新增任務表單可以更快速地建立。',
  '## Enhanced Task Creation in Personal Chat

In personal chat with the bot, you can create tasks with an enhanced multi-step flow.

### Command
Type: `/任務 新增 [task title]`

Example: `/任務 新增 Prepare quarterly report`

### Flow
After providing the title, the bot asks step by step:
1. **Workflow** — Associate with a running workflow
2. **Due Date** — Supports YYYY-MM-DD, MM/DD, 明天, 後天, 下週一, X天後
3. **Reminder** — Pre-deadline reminder notification
4. **Owner** (managers only) — Assign to another employee

Each step can be skipped. Confirm at the end to create the task.

### Quick Create
For faster creation without extra options, use the LIFF App new task form.',
  'LINE Bot',
  ARRAY['任務', '新增', '私訊', 'task', 'create', 'personal', 'enhanced'],
  '/line-task-create'
),
(
  'LINE Bot 訊息記錄與指令記錄',
  'LINE Bot Message and Command Logging',
  '## 訊息與指令記錄系統

系統會自動記錄所有 LINE Bot 的對話與指令執行情況。

### 訊息記錄 (line_messages)
- 記錄所有收到和發出的訊息
- 包含：使用者、訊息內容、來源（個人/群組）、方向（收/發）
- 群組中的所有訊息都會被記錄（包括未觸發指令的訊息）

### 指令記錄 (line_command_logs)
- 記錄每次指令的執行情況
- 包含：匹配的指令名稱、原始輸入、成功/失敗、執行時間（毫秒）
- 失敗的指令會記錄錯誤訊息
- 建立任務等操作會記錄所建立的實體 ID

### 錯誤記錄 (line_error_logs)
- 記錄所有錯誤：資料庫錯誤、LINE API 錯誤、未處理的例外
- 包含：錯誤類型、錯誤訊息、堆疊追蹤、上下文資訊
- 用於系統監控與除錯

### 查看記錄
目前記錄可透過 Supabase Dashboard 直接查詢對應的資料表。',
  '## Message and Command Logging System

The system automatically logs all LINE Bot conversations and command executions.

### Message Logs (line_messages)
- Records all incoming and outgoing messages
- Fields: user, message content, source (personal/group), direction (in/out)
- All group messages are logged, including those that don''t trigger commands

### Command Logs (line_command_logs)
- Records every command execution
- Fields: matched command name, raw input, success/failure, execution time (ms)
- Failed commands include error messages
- Task creation and similar operations log the created entity ID

### Error Logs (line_error_logs)
- Records all errors: DB errors, LINE API errors, unhandled exceptions
- Fields: error type, error message, stack trace, context
- Used for system monitoring and debugging

### Viewing Logs
Currently, logs can be queried directly via Supabase Dashboard on the corresponding tables.',
  'LINE Bot',
  ARRAY['記錄', '日誌', 'log', 'message', 'command', 'error', '監控'],
  '/line-logs'
)
ON CONFLICT (page_route) DO UPDATE SET
  title = EXCLUDED.title,
  title_en = EXCLUDED.title_en,
  content = EXCLUDED.content,
  content_en = EXCLUDED.content_en,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  updated_at = now();
