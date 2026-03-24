import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WorkflowSuggestion = {
  name: string;
  name_en: string;
  description: string;
  description_en: string;
  estimated_days: number;
  steps: SuggestedStep[];
  summary: string;
  summary_en: string;
};

type SuggestedStep = {
  step_order: number;
  name: string;
  name_en: string;
  step_type: string;
  estimated_minutes: number;
  suggested_role: string;
  description: string;
  owner_name: string;
  trigger_refs: string[];
  trigger_step_orders: number[];
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function extractSheetInfo(url: string): { id: string; gid: string } | null {
  const idMatch = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = url.match(/[?&]gid=([0-9]+)/);
  return { id: idMatch[1], gid: gidMatch ? gidMatch[1] : "0" };
}

function mapRole(owner: string): string {
  const val = owner.trim().toLowerCase();
  if (["營運", "operations"].some(k => val.includes(k))) return "operations";
  if (["主管", "manager", "經理"].some(k => val.includes(k))) return "manager";
  if (["管理員", "admin"].some(k => val.includes(k))) return "admin";
  return "staff";
}

function buildFromSheet(name: string, sheetUrl: string, csv: string): WorkflowSuggestion {
  const rows = parseCsv(csv).filter(r => r.some(v => v.trim() !== ""));
  if (rows.length < 2) {
    throw new Error("Sheet is empty or has no data rows.");
  }
  const header = rows[0].map(h => h.trim());
  const idx = (key: string) => header.findIndex(h => h === key);
  const idxNo = idx("NO") >= 0 ? idx("NO") : idx("No");
  const idxItem = idx("項目") >= 0 ? idx("項目") : idx("任務名稱");
  const idxOwner = idx("負責人");
  const idxStatus = idx("狀態");
  const idxNote1 = idx("備註1");
  const idxNote2 = idx("備註2");
  const idxNote3 = idx("備註3");
  const idxTrig1 = idx("Trigger1");
  const idxTrig2 = idx("Trigger2");
  const idxTrig3 = idx("Trigger3");

  if (idxItem === -1) {
    throw new Error("Sheet header missing '項目' or '任務名稱' column.");
  }

  const dataRows = rows.slice(1);

  // ── Pass 1: build NO-value → stepOrder and item-name → stepOrder lookup maps ──
  const noToOrder: Record<string, number> = {};
  const nameToOrder: Record<string, number> = {};
  dataRows.forEach((r, i) => {
    const noRaw = (idxNo >= 0 ? r[idxNo] : "").trim();
    const stepOrder = Number(noRaw) || i + 1;
    const item = (r[idxItem] || "").trim().toLowerCase();
    if (noRaw) noToOrder[noRaw] = stepOrder;
    // also map the numeric string of stepOrder itself as a key
    noToOrder[String(stepOrder)] = stepOrder;
    if (item) nameToOrder[item] = stepOrder;
  });

  function resolveTrigger(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    // 1. exact NO match
    if (noToOrder[t] !== undefined) return noToOrder[t];
    // 2. numeric – try parsing and look up step order
    const num = parseInt(t);
    if (!isNaN(num)) {
      if (noToOrder[String(num)] !== undefined) return noToOrder[String(num)];
      return num; // fallback: treat the number itself as step_order
    }
    // 3. case-insensitive item name match (full or partial)
    const tl = t.toLowerCase();
    if (nameToOrder[tl] !== undefined) return nameToOrder[tl];
    const partialKey = Object.keys(nameToOrder).find(k => k.includes(tl) || tl.includes(k));
    if (partialKey) return nameToOrder[partialKey];
    return null;
  }

  // ── Pass 2: build steps with resolved trigger_step_orders ──
  const steps: SuggestedStep[] = dataRows.map((r, i) => {
    const noRaw = idxNo >= 0 ? r[idxNo] : "";
    const stepOrder = Number(noRaw.trim()) || i + 1;
    const item = r[idxItem] || "";
    const owner = idxOwner >= 0 ? r[idxOwner] || "" : "";
    const status = idxStatus >= 0 ? r[idxStatus] || "" : "";
    const notes = [idxNote1, idxNote2, idxNote3]
      .filter(n => n >= 0)
      .map(n => r[n] || "")
      .filter(v => v.trim() !== "");
    const rawTriggers = [idxTrig1, idxTrig2, idxTrig3]
      .filter(n => n >= 0)
      .map(n => r[n] || "")
      .filter(v => v.trim() !== "");

    const resolvedOrders = rawTriggers
      .map(t => resolveTrigger(t))
      .filter((n): n is number => n !== null);

    const descParts = [
      owner ? `負責人: ${owner}` : "",
      status ? `狀態: ${status}` : "",
      notes.length ? `備註: ${notes.join(" / ")}` : "",
      rawTriggers.length ? `觸發: ${rawTriggers.join(" / ")}` : "",
    ].filter(Boolean);

    return {
      step_order: stepOrder,
      name: item.trim(),
      name_en: item.trim(),
      step_type: "task",
      estimated_minutes: 30,
      suggested_role: owner ? mapRole(owner) : "staff",
      description: descParts.join(" | "),
      owner_name: owner.trim(),
      trigger_refs: rawTriggers,         // raw values for display
      trigger_step_orders: resolvedOrders, // resolved step_order numbers for frontend
    };
  }).filter(s => s.name.length > 0);

  steps.sort((a, b) => a.step_order - b.step_order);

  // Build rich summary stats
  const stepsWithOwner = steps.filter(s => s.owner_name.trim() !== "");
  const stepsWithTriggers = steps.filter(s => s.trigger_step_orders.length > 0);

  const roleCounts: Record<string, number> = {};
  for (const s of steps) {
    roleCounts[s.suggested_role] = (roleCounts[s.suggested_role] || 0) + 1;
  }
  const roleZh: Record<string, string> = { staff: "人員", manager: "主管", admin: "管理員", operations: "營運" };
  const roleBreakdownZh = Object.entries(roleCounts).map(([r, n]) => `${roleZh[r] || r} ${n}`).join("、");
  const roleBreakdownEn = Object.entries(roleCounts).map(([r, n]) => `${n} ${r}`).join(", ");

  const triggerLines = stepsWithTriggers.slice(0, 5).map(s =>
    `步驟${s.step_order}→步驟${s.trigger_step_orders.join(",")}`
  );
  const triggerLinesEn = stepsWithTriggers.slice(0, 5).map(s =>
    `Step${s.step_order}→Step${s.trigger_step_orders.join(",")}`
  );
  const moreTriggers = stepsWithTriggers.length > 5 ? `…等${stepsWithTriggers.length}組` : "";
  const moreTriggersEn = stepsWithTriggers.length > 5 ? ` +${stepsWithTriggers.length - 5} more` : "";

  const summaryParts = [
    `已依照 Google Sheet 建立 ${steps.length} 個步驟。`,
    stepsWithOwner.length > 0
      ? `負責人：${stepsWithOwner.length} 個步驟已指定（${roleBreakdownZh}）。`
      : `角色分配：${roleBreakdownZh}。`,
    stepsWithTriggers.length > 0
      ? `觸發關係：${triggerLines.join(" | ")}${moreTriggers}。`
      : `步驟為線性順序執行。`,
  ];
  const summaryPartsEn = [
    `Created ${steps.length} steps from Google Sheet.`,
    stepsWithOwner.length > 0
      ? `Assignees: ${stepsWithOwner.length} steps have owners (${roleBreakdownEn}).`
      : `Roles: ${roleBreakdownEn}.`,
    stepsWithTriggers.length > 0
      ? `Triggers: ${triggerLinesEn.join(" | ")}${moreTriggersEn}.`
      : `Steps run sequentially.`,
  ];

  return {
    name,
    name_en: name,
    description: `依據 Google Sheet 任務清單產生（共 ${steps.length} 步）`,
    description_en: `Generated from Google Sheet task list (${steps.length} steps)`,
    estimated_days: Math.max(1, Math.ceil(steps.length / 2)),
    steps,
    summary: summaryParts.join(" "),
    summary_en: summaryPartsEn.join(" "),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { prompt, strict, source_sheet_url } = body;
    if (!prompt) throw new Error("No prompt provided");

    const apiKey = Deno.env.get("DASHSCOPE_API_KEY");

    if (strict && source_sheet_url) {
      const info = extractSheetInfo(source_sheet_url);
      if (!info) throw new Error("Invalid Google Sheet URL.");
      const csvUrl = `https://docs.google.com/spreadsheets/d/${info.id}/export?format=csv&gid=${info.gid}`;
      const resp = await fetch(csvUrl);
      if (!resp.ok) throw new Error(`Failed to fetch sheet CSV: ${resp.status}`);
      const csv = await resp.text();
      const suggestion = buildFromSheet("開店流程", source_sheet_url, csv);

      // AI trigger analysis: for steps that have no explicit triggers from the sheet,
      // ask the LLM to infer which follow-up steps each step should trigger.
      if (apiKey) {
        const stepsNeedingTriggers = suggestion.steps.filter(s => s.trigger_step_orders.length === 0);
        if (stepsNeedingTriggers.length > 0) {
          const stepList = suggestion.steps
            .map(s => `步驟${s.step_order}: ${s.name}`)
            .join("\n");
          try {
            const aiResp = await fetch(
              "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "qwen3.5-plus",
                  messages: [
                    {
                      role: "system",
                      content:
                        "你是一個工作流程分析助理。根據步驟名稱分析每個步驟完成後應觸發哪些後續步驟。只回傳 JSON，不加任何解說。",
                    },
                    {
                      role: "user",
                      content:
                        `以下是工作流程步驟清單，請分析每個步驟完成後應觸發哪些後續步驟（可多個）。` +
                        `最後一個步驟不需要觸發任何步驟。` +
                        `只回傳以下格式的 JSON（key 為步驟編號字串，value 為後續步驟編號陣列）：\n` +
                        `{"triggers":{"1":[2],"2":[3],"3":[4,5]}}\n\n步驟清單：\n${stepList}`,
                    },
                  ],
                }),
              }
            );
            if (aiResp.ok) {
              const aiData = await aiResp.json();
              const aiText: string = aiData.choices[0].message.content;
              const clean = aiText
                .replace(/```json\n?/g, "")
                .replace(/```\n?/g, "")
                .trim();
              const triggerMap: { triggers: Record<string, number[]> } = JSON.parse(clean);
              let aiTriggeredCount = 0;
              for (const step of suggestion.steps) {
                if (step.trigger_step_orders.length === 0) {
                  const suggested = triggerMap.triggers[String(step.step_order)];
                  if (suggested && Array.isArray(suggested) && suggested.length > 0) {
                    step.trigger_step_orders = suggested;
                    aiTriggeredCount++;
                  }
                }
              }
              if (aiTriggeredCount > 0) {
                // Append AI trigger info to summary
                suggestion.summary += ` AI 自動分析補充了 ${aiTriggeredCount} 個步驟的觸發關係。`;
                suggestion.summary_en += ` AI auto-analyzed and added triggers for ${aiTriggeredCount} steps.`;
              }
            }
          } catch (_e) {
            // AI trigger analysis failed — fall through, sheet-explicit triggers still used
          }
        }
      }

      return new Response(JSON.stringify({ workflow: suggestion }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Fallback to LLM if no sheet provided
    if (!apiKey) throw new Error("DASHSCOPE_API_KEY is not set");

    const systemMessage = {
      role: "system",
      content:
        `You are an AI assistant that designs workflows. Output ONLY valid JSON.
Required JSON format:
{
  "workflow": {
    "name": "...",
    "name_en": "...",
    "description": "...",
    "description_en": "...",
    "estimated_days": 10,
    "summary": "...",
    "summary_en": "...",
    "steps": [
      {
        "step_order": 1,
        "name": "...",
        "name_en": "...",
        "step_type": "task",
        "estimated_minutes": 30,
        "suggested_role": "staff",
        "description": "...",
        "owner_name": "",
        "trigger_step_orders": []
      }
    ]
  }
}
Rules:
- "trigger_step_orders": array of step_order values that should start after this step completes. Empty array = sequential (next step by order). Use for parallel or branching flows.
- "suggested_role": one of "staff", "manager", "admin", "operations"
- "owner_name": name of responsible person if known, otherwise empty string
Return JSON only, no code fences.`,
    };

    const messages = [systemMessage, { role: "user", content: prompt }];
    const response = await fetch(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen3.5-plus",
          messages,
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`DashScope API Error: ${response.status} ${errBody}`);
    }

    const data = await response.json();
    const aiResponseText = data.choices[0].message.content;
    return new Response(aiResponseText, {
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
