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
                logLLMUsage({ functionName: 'doc-flow-analyzer', provider: 'dashscope', model: 'qwen3.5-plus', inputTokens: t.input, outputTokens: t.output, totalTokens: t.total, latencyMs: Date.now() - _s, status: 'success', purpose: 'document' });
                return data.choices[0].message.content;
            }
            logLLMUsage({ functionName: 'doc-flow-analyzer', provider: 'dashscope', model: 'qwen3.5-plus', latencyMs: Date.now() - _s, status: 'fallback', errorMessage: `${resp.status}`, purpose: 'document' });
            console.warn(`DashScope failed (${resp.status}), trying Gemini fallback`);
        } catch (e) {
            logLLMUsage({ functionName: 'doc-flow-analyzer', provider: 'dashscope', model: 'qwen3.5-plus', latencyMs: Date.now() - _s, status: 'error', errorMessage: String(e), purpose: 'document' });
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
        logLLMUsage({ functionName: 'doc-flow-analyzer', provider: 'gemini', model: 'gemini-2.5-flash', latencyMs: Date.now() - _s2, status: 'error', errorMessage: `${resp.status}`, purpose: 'document' });
        throw new Error(`Gemini API Error: ${resp.status} ${errBody}`);
    }
    const data = await resp.json();
    const t = extractTokensOpenAI(data);
    logLLMUsage({ functionName: 'doc-flow-analyzer', provider: 'gemini', model: 'gemini-2.5-flash', inputTokens: t.input, outputTokens: t.output, totalTokens: t.total, latencyMs: Date.now() - _s2, status: 'success', purpose: 'document' });
    return data.choices[0].message.content;
}

// ── JSON extraction helper ────────────────────────────────────────────────────
function extractJSON(text: string): any {
    const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    try {
        return match ? JSON.parse(match[1]) : JSON.parse(text);
    } catch {
        // Try extracting first {...} block
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
        const { page_manifest } = body as { page_manifest: any[] };

        if (!page_manifest || page_manifest.length === 0) {
            throw new Error('page_manifest is required');
        }

        const BATCH_SIZE = 5;
        const allFlows: any[] = [];

        for (let i = 0; i < page_manifest.length; i += BATCH_SIZE) {
            const batch = page_manifest.slice(i, i + BATCH_SIZE);

            const systemPrompt = `你是一個 HRM 系統文件分析助手。根據提供的頁面清單，為每個頁面提取使用者操作流程。

輸出格式（只回傳 JSON，不加說明）：
{
  "flows": [
    {
      "page_route": "/route",
      "page_name": "English Name",
      "page_name_zh": "中文名稱",
      "category": "HR|Workflows|System|LIFF",
      "flows": [
        {
          "flow_id": "route_slug_flow_01",
          "flow_name": "流程名稱（繁體中文）",
          "flow_name_en": "Flow Name (English)",
          "actor": "Admin|Manager|Employee|HR",
          "steps": ["步驟1：...", "步驟2：...", "步驟3：..."],
          "steps_en": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
          "outcome": "完成後的結果（繁體中文）",
          "outcome_en": "Result after completion (English)"
        }
      ]
    }
  ]
}

規則：每頁提取 2-4 個主要流程；步驟要具體、可操作，使用動詞開頭；只回傳 JSON，不加任何說明文字`;

            const userPrompt = `請分析以下 ${batch.length} 個系統頁面，為每個頁面提取操作流程：
${JSON.stringify(batch, null, 2)}`;

            const rawText = await callLLM(systemPrompt, userPrompt);

            let parsed: any;
            try {
                parsed = extractJSON(rawText);
            } catch (e) {
                console.error('Failed to parse flow-analyzer JSON for batch', i, rawText.slice(0, 500));
                throw new Error(`Flow analyzer returned invalid JSON for batch ${i}: ${e}`);
            }

            allFlows.push(...(parsed.flows || []));

            if (i + BATCH_SIZE < page_manifest.length) {
                await new Promise((r) => setTimeout(r, 500));
            }
        }

        return new Response(JSON.stringify({ flows: allFlows }), {
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
