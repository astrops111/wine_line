import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { logLLMUsage, extractTokensOpenAI } from "../_shared/llm-logger.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const apiKey = Deno.env.get('DASHSCOPE_API_KEY');
        if (!apiKey) {
            throw new Error('DASHSCOPE_API_KEY is not set');
        }

        const body = await req.json();
        const { prompt, context } = body;

        if (!prompt) {
            throw new Error('No prompt provided');
        }

        const systemMessage = {
            role: "system",
            content: `You are an AI assistant helping a manager modify tasks in their system. 
You can understand natural language descriptions and convert them into structured JSON actions to execute.

Available action types:
- CREATE_TASK: Create a new task.
  Payload must contain: { title: string, priority: "low"|"medium"|"high"|"urgent", assigned_to?: string (UUID), store_id?: string (UUID), workflow_instance_id?: string (UUID) }
- UPDATE_TASK: Update an existing task.
  Payload must contain: { id: string (UUID), ...fieldsToUpdate }
- DELETE_TASK: Delete a task.
  Payload must contain: { id: string (UUID) }

Your goal is to output ONLY VALID JSON in the following format:
\`\`\`json
{
  "summary": "我幫你新增了兩個盤點任務...", // A natural language explanation of what you are proposing (in Traditional Chinese)
  "actions": [
    {
      "type": "CREATE_TASK",
      "payload": { "title": "Check Inventory", "priority": "high" },
      "description": "新增盤點庫存任務",
      "description_en": "Add inventory check task"
    }
  ]
}
\`\`\`
Do not include any explanation outside the JSON code block. Only return the JSON.
`
        };

        const messages = [
            systemMessage,
            ...(context || []),
            { role: "user", content: prompt }
        ];

        const _llmStart = Date.now();
        const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'qwen3.5-plus',
                messages: messages,
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            logLLMUsage({ functionName: 'task-ai-agent', provider: 'dashscope', model: 'qwen3.5-plus', latencyMs: Date.now() - _llmStart, status: 'error', errorMessage: `${response.status}`, purpose: 'task' });
            throw new Error(`DashScope API Error: ${response.status} ${errBody}`);
        }

        const data = await response.json();
        const _tok = extractTokensOpenAI(data);
        logLLMUsage({ functionName: 'task-ai-agent', provider: 'dashscope', model: 'qwen3.5-plus', inputTokens: _tok.input, outputTokens: _tok.output, totalTokens: _tok.total, latencyMs: Date.now() - _llmStart, status: 'success', purpose: 'task' });
        const aiResponseText = data.choices[0].message.content;
        
        // Extract json from markdown
        const match = aiResponseText.match(/```json\n([\s\S]*?)\n```/) || aiResponseText.match(/```\n([\s\S]*?)\n```/);
        let parsedResult;
        try {
            parsedResult = match ? JSON.parse(match[1]) : JSON.parse(aiResponseText);
        } catch (e) {
            console.error('Failed to parse AI JSON', aiResponseText);
            throw new Error('AI returned an invalid response format.');
        }

        return new Response(JSON.stringify(parsedResult), {
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
