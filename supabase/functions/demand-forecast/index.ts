import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { logLLMUsage, extractTokensOpenAI } from "../_shared/llm-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { store_id, week_start, historical_data } = await req.json();
    if (!store_id || !week_start) {
      return new Response(JSON.stringify({ error: 'store_id and week_start required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // historical_data: array of { date, revenue, transactions, foot_traffic, weather, is_holiday }
    const history = historical_data || [];

    // Build week dates
    const dates: string[] = [];
    const ws = new Date(week_start + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    // If no historical data, return simple defaults
    if (history.length === 0) {
      const defaults = dates.map(date => ({
        date,
        recommended_staff: 3,
        confidence: 0,
        reason: 'No historical data available',
      }));
      return new Response(JSON.stringify({ forecasts: defaults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build LLM prompt with historical data
    const systemPrompt = `You are a demand forecasting assistant for a retail store in Taiwan.
Given historical daily demand data, predict the recommended number of staff for each day of the upcoming week.
Consider patterns like:
- Day-of-week trends (weekends typically busier)
- Revenue/transaction trends
- Holiday effects
- Weather impact

Return ONLY valid JSON (no markdown) in this format:
{
  "forecasts": [
    { "date": "YYYY-MM-DD", "recommended_staff": N, "confidence": 0.0-1.0, "reason": "brief explanation" }
  ]
}`;

    const userPrompt = `Historical data (last ${history.length} days):
${JSON.stringify(history.slice(-60), null, 2)}

Predict staffing needs for these dates: ${dates.join(', ')}

Current day-of-week pattern from data:
${(() => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayRevs: Record<number, number[]> = {};
  for (const h of history) {
    const dow = new Date(h.date + 'T00:00:00').getDay();
    if (!dayRevs[dow]) dayRevs[dow] = [];
    if (h.revenue) dayRevs[dow].push(h.revenue);
  }
  return Object.entries(dayRevs).map(([dow, revs]) =>
    `${dayNames[Number(dow)]}: avg revenue NT$${Math.round(revs.reduce((a: number, b: number) => a + b, 0) / revs.length)}, ${revs.length} data points`
  ).join('\n');
})()}`;

    const apiKey = Deno.env.get('DASHSCOPE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'DASHSCOPE_API_KEY not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const _llmStart = Date.now();
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen3.5-plus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    const data = await response.json();
    if (response.ok) {
      const _tok = extractTokensOpenAI(data);
      logLLMUsage({ functionName: 'demand-forecast', provider: 'dashscope', model: 'qwen3.5-plus', inputTokens: _tok.input, outputTokens: _tok.output, totalTokens: _tok.total, latencyMs: Date.now() - _llmStart, status: 'success', purpose: 'forecast' });
    } else {
      logLLMUsage({ functionName: 'demand-forecast', provider: 'dashscope', model: 'qwen3.5-plus', latencyMs: Date.now() - _llmStart, status: 'error', errorMessage: `${response.status}`, purpose: 'forecast' });
    }
    const text = data.choices?.[0]?.message?.content || '';

    // Parse JSON from LLM response (handle markdown wrapping)
    const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    const parsed = match ? JSON.parse(match[1]) : JSON.parse(text);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
