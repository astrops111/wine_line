import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
}

export const supabase = createClient(url, key);

export interface HelpArticle {
  page_route: string;    // UNIQUE key — matches help_articles.page_route
  category: string;
  title: string;         // zh-TW title
  title_en: string;
  tags: string[];
  content: string;       // zh-TW markdown
  content_en: string;
  generated_by?: string;
}

export interface AgentRun {
  type: string;
  status: 'running' | 'completed' | 'failed';
  articles_generated?: number;
  summary?: string;
}

export async function startAgentRun(type: string): Promise<string> {
  const { data, error } = await supabase
    .from('agent_runs')
    .insert({ type, status: 'running' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function finishAgentRun(
  id: string,
  status: 'completed' | 'failed',
  articles_generated: number,
  summary: string
) {
  await supabase
    .from('agent_runs')
    .update({ status, articles_generated, summary, completed_at: new Date().toISOString() })
    .eq('id', id);
}

export async function upsertArticles(articles: HelpArticle[]): Promise<number> {
  const { data, error } = await supabase
    .from('help_articles')
    .upsert(articles.map(a => ({ ...a, generated_by: 'doc-agent-cli' })), { onConflict: 'page_route' })
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
