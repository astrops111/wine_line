import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ── LLM helper: Claude → Gemini fallback ─────────────────────────────────────
async function callLLMForChat(systemPrompt: string, messages: any[]): Promise<string> {
    // Try Claude first
    if (ANTHROPIC_API_KEY) {
        try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'claude-opus-4-6',
                    max_tokens: 1024,
                    system: systemPrompt,
                    messages,
                }),
            });
            if (resp.ok) {
                const data = await resp.json();
                return data.content?.[0]?.text || '';
            }
            console.warn(`Claude failed (${resp.status}), trying Gemini fallback`);
        } catch (e) {
            console.warn('Claude error, trying Gemini fallback:', e);
        }
    }

    // Fallback: Gemini
    if (!GEMINI_API_KEY) throw new Error('No AI provider available: ANTHROPIC_API_KEY not set/invalid and GEMINI_API_KEY not set');
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GEMINI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'gemini-2.5-flash',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
        }),
    });
    if (!resp.ok) {
        const errBody = await resp.text();
        throw new Error(`Gemini API Error: ${resp.status} ${errBody}`);
    }
    const data = await resp.json();
    return data.choices[0].message.content;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { question, locale = 'zh-TW', context: chatHistory = [] } = body;

        if (!question) throw new Error('question is required');
        const isZh = locale === 'zh-TW';

        // ── Step 1: FTS retrieval ───────────────────────────────
        const searchTerms = question
            .replace(/[，。？！、；：""''「」【】,?!;:"'[\]()]/g, ' ')
            .split(/\s+/)
            .filter((t: string) => t.length > 0)
            .join(' ');

        const [zhResult, enResult] = await Promise.all([
            supabase
                .from('help_articles')
                .select('id, title, title_en, content, content_en, category, page_route')
                .textSearch('fts_zh', searchTerms, { type: 'plain', config: 'simple' })
                .limit(4),
            supabase
                .from('help_articles')
                .select('id, title, title_en, content, content_en, category, page_route')
                .textSearch('fts_en', question, { type: 'plain', config: 'english' })
                .limit(4),
        ]);

        const seen = new Set<string>();
        const retrieved: any[] = [];
        for (const row of [...(zhResult.data || []), ...(enResult.data || [])]) {
            if (!seen.has(row.id)) { seen.add(row.id); retrieved.push(row); }
        }

        // Fallback: most recently updated articles
        if (retrieved.length === 0) {
            const { data: fallback } = await supabase
                .from('help_articles')
                .select('id, title, title_en, content, content_en, category, page_route')
                .order('updated_at', { ascending: false })
                .limit(3);
            retrieved.push(...(fallback || []));
        }

        // ── Step 2: Build context block ─────────────────────────
        const contextBlock = retrieved
            .slice(0, 5)
            .map((a) =>
                isZh
                    ? `【${a.title}】(路由：${a.page_route})\n${a.content.slice(0, 900)}`
                    : `[${a.title_en}] (Route: ${a.page_route})\n${a.content_en.slice(0, 900)}`
            )
            .join('\n\n---\n\n');

        // ── Step 3: LLM answer (Claude → Gemini fallback) ───────
        const systemPrompt = isZh
            ? `你是 AI LINE Bot HRM 系統的智慧客服助手。根據以下系統說明文件回答使用者的問題。
請提供具體、可操作的回答，包含清楚的步驟說明。
如果文件中沒有相關資訊，請誠實說明並建議聯絡系統管理員。

參考文件：
${contextBlock}`
            : `You are the AI LINE Bot HRM System help assistant. Answer user questions based on the documentation below.
Provide specific, actionable answers with clear step-by-step instructions.
If the answer is not in the documentation, honestly say so and suggest contacting the system administrator.

Reference documentation:
${contextBlock}`;

        const historyMessages = (chatHistory as any[])
            .filter((m) => m.role !== 'system' && !m.isLoading)
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content }));

        const answer = await callLLMForChat(systemPrompt, [
            ...historyMessages,
            { role: 'user', content: question },
        ]);

        return new Response(JSON.stringify({
            answer: answer || (isZh ? '抱歉，無法生成回答，請稍後再試。' : 'Sorry, unable to generate an answer. Please try again.'),
            sources: retrieved.slice(0, 5).map((a) => ({
                title: isZh ? a.title : a.title_en,
                page_route: a.page_route,
                category: a.category,
            })),
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
