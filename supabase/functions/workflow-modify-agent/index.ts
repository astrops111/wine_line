import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("DASHSCOPE_API_KEY");
    if (!apiKey) {
      throw new Error("DASHSCOPE_API_KEY is not set");
    }

    const body = await req.json();
    const { prompt, context, workflow } = body;

    if (!prompt) {
      throw new Error("No prompt provided");
    }

    const systemMessage = {
      role: "system",
      content: `You are an AI assistant helping modify workflow templates.
You must return ONLY valid JSON. No explanations outside JSON.

You will receive the current workflow snapshot (name, description, steps).
Generate a list of actions to update the workflow.

Action types:
- UPDATE_WORKFLOW: update workflow properties.
  Payload: { name?: string, description?: string, status?: "draft"|"active"|"archived" }
- ADD_STEP: add a new workflow step.
  Payload: { name: string, step_order?: number, step_type?: "task"|"approval"|"notification"|"condition"|"checklist", description?: string }
- UPDATE_STEP: update an existing step.
  Payload: { id: string, name?: string, step_type?: string, description?: string }
- DELETE_STEP: remove a step.
  Payload: { id: string }
- MOVE_STEP: move a step up/down by one position.
  Payload: { id: string, direction: "up"|"down" }

Output format:
{
  "summary": "簡短摘要",
  "actions": [
    {
      "type": "ADD_STEP",
      "payload": { "name": "New Step", "step_order": 3 },
      "description": "新增步驟：New Step",
      "description_en": "Add step: New Step"
    }
  ]
}
`,
    };

    const messages = [
      systemMessage,
      ...(context || []),
      { role: "user", content: JSON.stringify({ prompt, workflow }) },
    ];

    const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3.5-plus",
        messages,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`DashScope API Error: ${response.status} ${errBody}`);
    }

    const data = await response.json();
    const aiResponseText = data.choices[0].message.content;

    const match = aiResponseText.match(/```json\n([\s\S]*?)\n```/) || aiResponseText.match(/```\n([\s\S]*?)\n```/);
    let parsedResult;
    try {
      parsedResult = match ? JSON.parse(match[1]) : JSON.parse(aiResponseText);
    } catch (_e) {
      console.error("Failed to parse AI JSON", aiResponseText);
      throw new Error("AI returned an invalid response format.");
    }

    return new Response(JSON.stringify(parsedResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
