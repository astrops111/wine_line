// ── LINE Logs Types ──────────────────────────────────────────────────────────

export interface LineMessage {
  id: string;
  line_user_id: string;
  display_name: string | null;
  message_text: string;
  source_type: string;
  direction: string;
  group_id: string | null;
  event_type: string | null;
  created_at: string;
}

export interface CommandLog {
  id: string;
  line_user_id: string;
  display_name: string | null;
  command_matched: string;
  raw_input: string;
  source_type: string;
  group_id: string | null;
  success: boolean;
  error_message: string | null;
  created_entity_type: string | null;
  created_entity_id: string | null;
  metadata: Record<string, unknown> | null;
  execution_ms: number | null;
  created_at: string;
}

export interface ErrorLog {
  id: string;
  line_user_id: string | null;
  source_type: string | null;
  group_id: string | null;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

export interface DailySummary {
  id: string;
  group_id: string;
  group_name: string | null;
  summary_date: string;
  message_count: number;
  unique_users: number | null;
  user_names: string[] | null;
  summary_text: string;
  context: Record<string, unknown> | null;
  created_at: string;
}

export interface WeeklySummary {
  id: string;
  group_id: string;
  group_name: string | null;
  week_start: string;
  week_end: string;
  message_count: number;
  unique_users: number | null;
  user_names: string[] | null;
  summary_text: string;
  key_decisions: string[] | null;
  action_items: string[] | null;
  recurring_topics: string[] | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

export interface MonthlySummary {
  id: string;
  group_id: string;
  group_name: string | null;
  summary_month: string;
  message_count: number;
  unique_users: number | null;
  user_names: string[] | null;
  summary_text: string;
  key_decisions: string[] | null;
  action_items: string[] | null;
  recurring_topics: string[] | null;
  notable_events: string[] | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

export interface LineGroup {
  id: string;
  group_name: string;
  line_group_id: string;
}

export type Tab = 'summary' | 'messages' | 'commands' | 'errors';
export type SummaryView = 'daily' | 'weekly' | 'monthly';
