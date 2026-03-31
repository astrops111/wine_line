import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { logLLMUsage, extractTokensOpenAI } from "../_shared/llm-logger.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── LLM helper: DashScope (Qwen) → Gemini fallback ────────────────────────────
async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    const dashKey = Deno.env.get('DASHSCOPE_API_KEY');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ];

    if (dashKey) {
        const _s = Date.now();
        try {
            const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${dashKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'qwen3.5-plus', messages }),
            });
            if (resp.ok) {
                const data = await resp.json();
                const t = extractTokensOpenAI(data);
                logLLMUsage({ functionName: 'doc-content-gen', provider: 'dashscope', model: 'qwen3.5-plus', inputTokens: t.input, outputTokens: t.output, totalTokens: t.total, latencyMs: Date.now() - _s, status: 'success', purpose: 'document' });
                return data.choices[0].message.content;
            }
            logLLMUsage({ functionName: 'doc-content-gen', provider: 'dashscope', model: 'qwen3.5-plus', latencyMs: Date.now() - _s, status: 'fallback', errorMessage: `${resp.status}`, purpose: 'document' });
            console.warn(`DashScope failed (${resp.status}), trying Gemini fallback`);
        } catch (e) {
            logLLMUsage({ functionName: 'doc-content-gen', provider: 'dashscope', model: 'qwen3.5-plus', latencyMs: Date.now() - _s, status: 'error', errorMessage: String(e), purpose: 'document' });
            console.warn('DashScope error, trying Gemini fallback:', e);
        }
    }

    if (!geminiKey) throw new Error('No AI provider available: DASHSCOPE_API_KEY invalid and GEMINI_API_KEY not set');
    const _s2 = Date.now();
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${geminiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-2.5-flash', messages }),
    });
    if (!resp.ok) {
        const errBody = await resp.text();
        logLLMUsage({ functionName: 'doc-content-gen', provider: 'gemini', model: 'gemini-2.5-flash', latencyMs: Date.now() - _s2, status: 'error', errorMessage: `${resp.status}`, purpose: 'document' });
        throw new Error(`Gemini API Error: ${resp.status} ${errBody}`);
    }
    const data = await resp.json();
    const t = extractTokensOpenAI(data);
    logLLMUsage({ functionName: 'doc-content-gen', provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: t.input, outputTokens: t.output, totalTokens: t.total, latencyMs: Date.now() - _s2, status: 'success', purpose: 'document' });
    return data.choices[0].message.content;
}

function extractJSON(text: string): any {
    const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    try {
        return match ? JSON.parse(match[1]) : JSON.parse(text);
    } catch {
        const objMatch = text.match(/\{[\s\S]*\}/);
        if (objMatch) return JSON.parse(objMatch[0]);
        throw new Error('Could not extract valid JSON from response');
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { flows } = body as { flows: any[] };

        if (!flows || flows.length === 0) {
            throw new Error('flows array is required');
        }

        const articles: any[] = [];

        for (const pageFlow of flows) {
            const flowDescZh = pageFlow.flows
                .map((f: any, idx: number) =>
                    `### 流程 ${idx + 1}：${f.flow_name}\n操作者：${f.actor}\n步驟：\n${f.steps.map((s: string, si: number) => `${si + 1}. ${s}`).join('\n')}\n完成結果：${f.outcome}`
                )
                .join('\n\n');

            const flowDescEn = pageFlow.flows
                .map((f: any, idx: number) =>
                    `### Flow ${idx + 1}: ${f.flow_name_en}\nActor: ${f.actor}\nSteps:\n${f.steps_en.map((s: string, si: number) => `${si + 1}. ${s}`).join('\n')}\nOutcome: ${f.outcome_en}`
                )
                .join('\n\n');

            const systemPrompt = `你是 HRM 系統的技術文件撰寫員，負責為系統說明中心撰寫完整的操作指南。

要求：
- 使用 Markdown 格式，包含 ## 標題、清單、注意事項區塊
- 繁體中文版要自然流暢，英文版要完整正式
- 每篇文章需包含：頁面說明、操作流程步驟、注意事項、常見問題
- 文章長度：中文 400-600 字，英文 300-500 words

輸出格式（只回傳 JSON，不加說明）：
{
  "title": "頁面操作指南（繁體中文）",
  "title_en": "Page Operation Guide (English)",
  "content": "## 頁面說明\\n\\n...(完整 Markdown 內容，zh-TW)...",
  "content_en": "## Overview\\n\\n...(Complete Markdown content, English)...",
  "category": "HR|Workflows|System|LIFF",
  "tags": ["繁中標籤1", "繁中標籤2"],
  "tags_en": ["tag1", "tag2"]
}`;

            const userPrompt = `頁面：${pageFlow.page_name_zh}（${pageFlow.page_name}）
路由：${pageFlow.page_route}
類別：${pageFlow.category}

流程分析（繁體中文）：
${flowDescZh}

流程分析（英文）：
${flowDescEn}

請撰寫完整的雙語操作指南。`;

            let articleData: any;
            try {
                const rawText = await callLLM(systemPrompt, userPrompt);
                articleData = extractJSON(rawText);
            } catch (e) {
                console.error('Failed to generate article for', pageFlow.page_route, e);
                // Fallback: minimal article from flow descriptions
                articleData = {
                    title: `${pageFlow.page_name_zh} 操作指南`,
                    title_en: `${pageFlow.page_name} Guide`,
                    content: `## 說明\n\n${flowDescZh}`,
                    content_en: `## Overview\n\n${flowDescEn}`,
                    category: pageFlow.category,
                    tags: [pageFlow.page_name_zh],
                    tags_en: [pageFlow.page_name],
                };
            }

            articles.push({ ...articleData, page_route: pageFlow.page_route });

            // 300ms throttle between pages
            await new Promise((r) => setTimeout(r, 300));
        }

        return new Response(JSON.stringify({ articles }), {
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
