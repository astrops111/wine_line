import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logLLMUsage, extractTokensOpenAI, extractTokensAnthropic } from "../_shared/llm-logger.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DASHSCOPE_API_KEY = Deno.env.get('DASHSCOPE_API_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ── LLM fallback: Qwen → Gemini Flash → Claude Sonnet ───────────────────────
async function callLLM(systemPrompt: string, userContent: string): Promise<{ text: string; model: string }> {
    // 1. Qwen via DashScope
    if (DASHSCOPE_API_KEY) {
        const _s1 = Date.now();
        try {
            const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'qwen3.5-plus',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userContent },
                    ],
                }),
            });
            if (resp.ok) {
                const data = await resp.json();
                const text = data.choices?.[0]?.message?.content || '';
                if (text) {
                    const t = extractTokensOpenAI(data);
                    logLLMUsage({ functionName: 'summarize-history', provider: 'dashscope', model: 'qwen3.5-plus', inputTokens: t.input, outputTokens: t.output, totalTokens: t.total, latencyMs: Date.now() - _s1, status: 'success', purpose: 'summarize' });
                    return { text, model: 'qwen3.5-plus' };
                }
            }
            logLLMUsage({ functionName: 'summarize-history', provider: 'dashscope', model: 'qwen3.5-plus', latencyMs: Date.now() - _s1, status: 'fallback', errorMessage: `${resp.status}`, purpose: 'summarize' });
            console.warn(`Qwen failed (${resp.status}), trying Gemini`);
        } catch (e) {
            logLLMUsage({ functionName: 'summarize-history', provider: 'dashscope', model: 'qwen3.5-plus', latencyMs: Date.now() - _s1, status: 'error', errorMessage: String(e), purpose: 'summarize' });
            console.warn('Qwen error:', e);
        }
    }

    // 2. Gemini Flash
    if (GEMINI_API_KEY) {
        const _s2 = Date.now();
        try {
            const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GEMINI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gemini-2.5-flash',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userContent },
                    ],
                }),
            });
            if (resp.ok) {
                const data = await resp.json();
                const text = data.choices?.[0]?.message?.content || '';
                if (text) {
                    const t = extractTokensOpenAI(data);
                    logLLMUsage({ functionName: 'summarize-history', provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: t.input, outputTokens: t.output, totalTokens: t.total, latencyMs: Date.now() - _s2, status: 'success', purpose: 'summarize' });
                    return { text, model: 'gemini-2.5-flash' };
                }
            }
            logLLMUsage({ functionName: 'summarize-history', provider: 'gemini', model: 'gemini-2.5-flash', latencyMs: Date.now() - _s2, status: 'fallback', errorMessage: `${resp.status}`, purpose: 'summarize' });
            console.warn(`Gemini failed (${resp.status}), trying Claude`);
        } catch (e) {
            logLLMUsage({ functionName: 'summarize-history', provider: 'gemini', model: 'gemini-2.5-flash', latencyMs: Date.now() - _s2, status: 'error', errorMessage: String(e), purpose: 'summarize' });
            console.warn('Gemini error:', e);
        }
    }

    // 3. Claude Sonnet
    if (ANTHROPIC_API_KEY) {
        const _s3 = Date.now();
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 4096,
                system: systemPrompt,
                messages: [{ role: 'user', content: userContent }],
            }),
        });
        if (resp.ok) {
            const data = await resp.json();
            const text = data.content?.[0]?.text || '';
            if (text) {
                const t = extractTokensAnthropic(data);
                logLLMUsage({ functionName: 'summarize-history', provider: 'anthropic', model: 'claude-sonnet-4-6', inputTokens: t.input, outputTokens: t.output, totalTokens: t.total, latencyMs: Date.now() - _s3, status: 'success', purpose: 'summarize' });
                return { text, model: 'claude-sonnet-4-6' };
            }
        }
        const errBody = await resp.text();
        logLLMUsage({ functionName: 'summarize-history', provider: 'anthropic', model: 'claude-sonnet-4-6', latencyMs: Date.now() - _s3, status: 'error', errorMessage: `${resp.status}`, purpose: 'summarize' });
        throw new Error(`Claude API Error: ${resp.status} ${errBody}`);
    }

    throw new Error('No AI provider available');
}

// ── Parse JSON from LLM response (handles markdown fences) ──────────────────
function parseJSON(raw: string): any {
    let cleaned = raw.trim();
    // Strip markdown fences
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(cleaned);
}

const WEEKLY_SYSTEM_PROMPT = `你是一位專業的工作溝通分析師。你會收到一週的 LINE 群組每日訊息摘要，需要整理成一份週報。

請以繁體中文回覆，回傳嚴格的 JSON 格式（不要加 markdown 標記）：
{
  "summary_text": "本週群組重點摘要（300-500字，段落分明）",
  "key_decisions": ["決策1", "決策2"],
  "action_items": ["待辦1（含負責人/期限若有）", "待辦2"],
  "recurring_topics": ["重複出現的主題1", "主題2"]
}

重點：
- summary_text 應涵蓋本週主要討論方向與結論
- key_decisions 僅列出明確的決定事項
- action_items 列出具體待辦、指派工作、或期限承諾
- recurring_topics 列出本週多次被提到的主題
- 若某欄位無資料，回傳空陣列 []
- 勿編造不在原文中的資訊`;

const MONTHLY_SYSTEM_PROMPT = `你是一位專業的工作溝通分析師。你會收到一個月內的 LINE 群組每週摘要，需要整理成一份月報。

請以繁體中文回覆，回傳嚴格的 JSON 格式（不要加 markdown 標記）：
{
  "summary_text": "本月群組重點摘要（500-800字，段落分明）",
  "key_decisions": ["重大決策1", "重大決策2"],
  "action_items": ["重要待辦1", "待辦2"],
  "recurring_topics": ["月度反覆主題1", "主題2"],
  "notable_events": ["重要事件/數字/日期1", "事件2"]
}

重點：
- summary_text 應涵蓋本月主要趨勢與整體方向
- key_decisions 僅列出影響較大的決定
- action_items 列出仍需追蹤的重要待辦
- recurring_topics 列出整月反覆出現的關注議題
- notable_events 列出值得記錄的重要事件、數字、日期
- 若某欄位無資料，回傳空陣列 []
- 勿編造不在原文中的資訊`;

// ── Weekly summary handler ──────────────────────────────────────────────────
async function handleWeekly(groupFilter?: string) {
    // Last Monday to last Sunday
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun
    const lastSunday = new Date(now);
    lastSunday.setUTCDate(now.getUTCDate() - (dayOfWeek === 0 ? 7 : dayOfWeek));
    lastSunday.setUTCHours(0, 0, 0, 0);
    const lastMonday = new Date(lastSunday);
    lastMonday.setUTCDate(lastSunday.getUTCDate() - 6);

    const weekStart = lastMonday.toISOString().split('T')[0];
    const weekEnd = lastSunday.toISOString().split('T')[0];

    let query = supabase
        .from('line_daily_summaries')
        .select('*')
        .gte('summary_date', weekStart)
        .lte('summary_date', weekEnd)
        .order('summary_date', { ascending: true });

    if (groupFilter) query = query.eq('group_id', groupFilter);

    const { data: dailies, error } = await query;
    if (error) throw error;
    if (!dailies || dailies.length === 0) return { processed: 0, week: weekStart };

    // Group by group_id
    const groups: Record<string, typeof dailies> = {};
    for (const d of dailies) {
        if (!groups[d.group_id]) groups[d.group_id] = [];
        groups[d.group_id].push(d);
    }

    let processed = 0;
    for (const [groupId, entries] of Object.entries(groups)) {
        const totalMessages = entries.reduce((sum, e) => sum + (e.message_count || 0), 0);
        const allUsers = new Set<string>();
        const allNames: string[] = [];
        for (const e of entries) {
            if (e.user_names) for (const n of e.user_names) { allUsers.add(n); allNames.push(n); }
        }

        // Build concatenated daily text for LLM
        const dailyTexts = entries.map(e =>
            `=== ${e.summary_date} (${e.message_count} 則訊息) ===\n${(e.summary_text || '').slice(0, 3000)}`
        ).join('\n\n');

        const userContent = `群組：${entries[0].group_name || groupId}\n週期：${weekStart} ~ ${weekEnd}\n總訊息數：${totalMessages}\n\n${dailyTexts}`;

        try {
            const { text: llmResponse, model } = await callLLM(WEEKLY_SYSTEM_PROMPT, userContent);
            const parsed = parseJSON(llmResponse);

            await supabase.from('line_weekly_summaries').upsert({
                group_id: groupId,
                group_name: entries[0].group_name,
                week_start: weekStart,
                week_end: weekEnd,
                message_count: totalMessages,
                unique_users: allUsers.size,
                user_names: [...allUsers],
                summary_text: parsed.summary_text || '',
                key_decisions: parsed.key_decisions || [],
                action_items: parsed.action_items || [],
                recurring_topics: parsed.recurring_topics || [],
                context: { model, generated_at: new Date().toISOString(), daily_count: entries.length },
            }, { onConflict: 'group_id,week_start' });

            processed++;
        } catch (e) {
            console.error(`Weekly summary failed for group ${groupId}:`, e);
            // Insert a minimal record so we don't lose the data reference
            await supabase.from('line_weekly_summaries').upsert({
                group_id: groupId,
                group_name: entries[0].group_name,
                week_start: weekStart,
                week_end: weekEnd,
                message_count: totalMessages,
                unique_users: allUsers.size,
                user_names: [...allUsers],
                summary_text: `[LLM 摘要失敗] ${String(e).slice(0, 200)}`,
                key_decisions: [],
                action_items: [],
                recurring_topics: [],
                context: { error: String(e).slice(0, 500), generated_at: new Date().toISOString() },
            }, { onConflict: 'group_id,week_start' });
        }
    }

    return { processed, week: weekStart };
}

// ── Monthly summary handler ─────────────────────────────────────────────────
async function handleMonthly(groupFilter?: string) {
    // Previous calendar month
    const now = new Date();
    const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonth = new Date(firstOfThisMonth);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const summaryMonth = lastMonth.toISOString().split('T')[0]; // e.g. 2026-02-01
    const monthEnd = new Date(firstOfThisMonth);
    monthEnd.setUTCDate(monthEnd.getUTCDate() - 1);
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    let query = supabase
        .from('line_weekly_summaries')
        .select('*')
        .gte('week_start', summaryMonth)
        .lte('week_start', monthEndStr)
        .order('week_start', { ascending: true });

    if (groupFilter) query = query.eq('group_id', groupFilter);

    const { data: weeklies, error } = await query;
    if (error) throw error;
    if (!weeklies || weeklies.length === 0) return { processed: 0, month: summaryMonth };

    // Group by group_id
    const groups: Record<string, typeof weeklies> = {};
    for (const w of weeklies) {
        if (!groups[w.group_id]) groups[w.group_id] = [];
        groups[w.group_id].push(w);
    }

    let processed = 0;
    for (const [groupId, entries] of Object.entries(groups)) {
        const totalMessages = entries.reduce((sum, e) => sum + (e.message_count || 0), 0);
        const allUsers = new Set<string>();
        for (const e of entries) {
            if (e.user_names) for (const n of e.user_names) allUsers.add(n);
        }

        // Build concatenated weekly summaries for LLM
        const weeklyTexts = entries.map(e => {
            const parts = [
                `=== 第 ${e.week_start} ~ ${e.week_end} 週 (${e.message_count} 則訊息) ===`,
                e.summary_text || '',
            ];
            if (e.key_decisions?.length) parts.push(`決策：${e.key_decisions.join('；')}`);
            if (e.action_items?.length) parts.push(`待辦：${e.action_items.join('；')}`);
            if (e.recurring_topics?.length) parts.push(`重複主題：${e.recurring_topics.join('；')}`);
            return parts.join('\n');
        }).join('\n\n');

        const monthLabel = `${lastMonth.getUTCFullYear()}-${String(lastMonth.getUTCMonth() + 1).padStart(2, '0')}`;
        const userContent = `群組：${entries[0].group_name || groupId}\n月份：${monthLabel}\n總訊息數：${totalMessages}\n\n${weeklyTexts}`;

        try {
            const { text: llmResponse, model } = await callLLM(MONTHLY_SYSTEM_PROMPT, userContent);
            const parsed = parseJSON(llmResponse);

            await supabase.from('line_monthly_summaries').upsert({
                group_id: groupId,
                group_name: entries[0].group_name,
                summary_month: summaryMonth,
                message_count: totalMessages,
                unique_users: allUsers.size,
                user_names: [...allUsers],
                summary_text: parsed.summary_text || '',
                key_decisions: parsed.key_decisions || [],
                action_items: parsed.action_items || [],
                recurring_topics: parsed.recurring_topics || [],
                notable_events: parsed.notable_events || [],
                context: { model, generated_at: new Date().toISOString(), weekly_count: entries.length },
            }, { onConflict: 'group_id,summary_month' });

            processed++;
        } catch (e) {
            console.error(`Monthly summary failed for group ${groupId}:`, e);
            await supabase.from('line_monthly_summaries').upsert({
                group_id: groupId,
                group_name: entries[0].group_name,
                summary_month: summaryMonth,
                message_count: totalMessages,
                unique_users: allUsers.size,
                user_names: [...allUsers],
                summary_text: `[LLM 摘要失敗] ${String(e).slice(0, 200)}`,
                key_decisions: [],
                action_items: [],
                recurring_topics: [],
                notable_events: [],
                context: { error: String(e).slice(0, 500), generated_at: new Date().toISOString() },
            }, { onConflict: 'group_id,summary_month' });
        }
    }

    return { processed, month: summaryMonth };
}

// ── Main handler ────────────────────────────────────────────────────────────
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { tier, group_id } = body;

        if (!tier || !['weekly', 'monthly'].includes(tier)) {
            return new Response(JSON.stringify({ error: 'tier must be "weekly" or "monthly"' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let result;
        if (tier === 'weekly') {
            result = await handleWeekly(group_id);
        } else {
            result = await handleMonthly(group_id);
        }

        return new Response(JSON.stringify({ ok: true, tier, ...result }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        console.error('summarize-history error:', err);
        return new Response(JSON.stringify({ error: err.message || String(err) }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
