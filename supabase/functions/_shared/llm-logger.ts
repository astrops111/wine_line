import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Cost rates: USD per 1M tokens ──────────────────────────────────────────
const COST_RATES: Record<string, { input: number; output: number }> = {
    'qwen3.5-plus':       { input: 0.30, output: 0.60 },
    'gemini-2.5-flash':   { input: 0.15, output: 0.60 },
    'claude-sonnet-4-6':  { input: 3.00, output: 15.00 },
    'claude-opus-4-6':    { input: 15.00, output: 75.00 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const rates = COST_RATES[model];
    if (!rates) return 0;
    return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

export interface LLMUsageParams {
    functionName: string;
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    latencyMs: number;
    status: 'success' | 'error' | 'fallback';
    errorMessage?: string;
    purpose?: string;
    metadata?: Record<string, unknown>;
}

// ── Fire-and-forget logger ─────────────────────────────────────────────────
export function logLLMUsage(params: LLMUsageParams): void {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return;

    const inputTokens = params.inputTokens ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const totalTokens = params.totalTokens ?? (inputTokens + outputTokens);
    const cost = estimateCost(params.model, inputTokens, outputTokens);

    const db = createClient(supabaseUrl, supabaseKey);
    db.from('llm_usage_logs').insert({
        function_name: params.functionName,
        provider: params.provider,
        model: params.model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        estimated_cost: cost,
        latency_ms: params.latencyMs,
        status: params.status,
        error_message: params.errorMessage,
        purpose: params.purpose,
        metadata: params.metadata,
    }).then(({ error }) => {
        if (error) console.warn('LLM usage log insert failed:', error.message);
    });
}

// ── Extract token counts from different API response formats ───────────────
export function extractTokensOpenAI(data: any): { input: number; output: number; total: number } {
    const usage = data?.usage;
    return {
        input: usage?.prompt_tokens ?? 0,
        output: usage?.completion_tokens ?? 0,
        total: usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
    };
}

export function extractTokensAnthropic(data: any): { input: number; output: number; total: number } {
    const usage = data?.usage;
    return {
        input: usage?.input_tokens ?? 0,
        output: usage?.output_tokens ?? 0,
        total: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    };
}
