-- ============================================================
-- Migration: LINE Bot Logging + Enhanced Task Creation
-- Created: 2026-03-28
-- Tables: line_messages, line_command_logs, line_error_logs
-- ============================================================

-- ── Table 0: line_groups ──────────────────────────────────────
-- Master table for LINE groups/rooms the bot has joined

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


-- ── Table 1: line_messages ─────────────────────────────────────
-- Stores ALL messages (incoming + outgoing) in LINE conversations

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


-- ── Table 2: line_command_logs ─────────────────────────────────
-- Tracks every command the LINE bot routes and executes

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


-- ── Table 3: line_error_logs ───────────────────────────────────
-- Captures all errors: DB failures, LINE API errors, unhandled exceptions

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


-- ── Help Articles: New Features Documentation ──────────────────

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
