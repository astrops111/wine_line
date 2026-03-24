import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── 23-page manifest ──────────────────────────────────────────────────────────
const PAGE_MANIFEST = [
    { route: '/', name: 'Dashboard', name_zh: '儀表板', category: 'System',
      description: 'Aggregated task/workflow/HR stats; pending leave/OT/punch-correction badges' },
    { route: '/manager-dashboard', name: 'Manager Dashboard', name_zh: '營運看板', category: 'System',
      description: 'Real-time store ops: open tasks, active workflows, staff on shift' },
    { route: '/hr-dashboard', name: 'HR Dashboard', name_zh: 'HR 報表', category: 'HR',
      description: 'Monthly attendance reports, absence risk alerts, export CSV/PDF' },
    { route: '/time-tracker', name: 'Time Tracker', name_zh: '打卡追蹤', category: 'HR',
      description: 'Clock-in/out records (4 tabs): today punch, history, LINE binding, correction approval' },
    { route: '/leave-management', name: 'Leave Management', name_zh: '請假管理', category: 'HR',
      description: 'Submit/approve/reject leave requests, leave balance tracking per type per year' },
    { route: '/overtime-requests', name: 'Overtime Requests', name_zh: '加班申請', category: 'HR',
      description: 'Pre/post overtime filings, pay vs compensatory type, manager approval workflow' },
    { route: '/payroll', name: 'Payroll Management', name_zh: '薪資管理', category: 'HR',
      description: 'Payroll run creation, salary structure config, Taiwan labor/health insurance brackets, payslip send' },
    { route: '/scheduling', name: 'Scheduling', name_zh: '排班', category: 'HR',
      description: '3-tab: weekly shift calendar (AI auto-schedule), store settings, employee shift preferences' },
    { route: '/holidays', name: 'Holidays', name_zh: '假日管理', category: 'HR',
      description: 'National/company/custom holidays with pay multipliers; affects payroll and scheduling' },
    { route: '/shift-rules', name: 'Shift Rules', name_zh: '排班規則', category: 'HR',
      description: 'Labor law compliance rules: min rest hours between shifts, consecutive day limits, weekly hour caps' },
    { route: '/workflow-management', name: 'Workflow Management', name_zh: '流程管理', category: 'Workflows',
      description: '4-tab hub: dashboard overview, workflow templates (AI-generated), tasks, checklists' },
    { route: '/employees', name: 'Employees', name_zh: '員工管理', category: 'HR',
      description: 'Employee CRUD, multi-store assignment, departments, LINE binding, roles, avatar upload' },
    { route: '/line', name: 'LINE Management', name_zh: 'LINE 管理', category: 'System',
      description: 'LINE user list, verification status, LINE group management for notifications' },
    { route: '/notifications', name: 'Notifications', name_zh: '通知', category: 'System',
      description: 'Broadcast messages to LINE groups or individual users' },
    { route: '/triggers', name: 'Triggers', name_zh: '觸發器', category: 'System',
      description: 'Automated event triggers: define event → action rules (e.g. task complete → LINE notify)' },
    { route: '/users', name: 'Users', name_zh: '系統使用者', category: 'System',
      description: 'Admin user accounts, role assignments (admin/manager/hr/staff), auth management' },
    { route: '/admin', name: 'Admin Settings', name_zh: '系統設定', category: 'System',
      description: 'Organization-level config, LINE webhook URL, API key management, integrations' },
    { route: '/org-management', name: 'Org Management', name_zh: '組織管理', category: 'System',
      description: '8-tab hub: organizations, companies, store locations, departments, employees, LINE groups, billing' },
    { route: '/liff/app', name: 'LIFF Employee App', name_zh: '員工 LIFF App', category: 'LIFF',
      description: 'Mobile LINE app: GPS/WiFi clock-in/out, weekly schedule view, hours summary, leave request, payslip, preferences' },
];

// ── LLM helper: Claude → Gemini fallback ─────────────────────────────────────
async function callLLMForPlanning(userMessage: string): Promise<string> {
    const systemPrompt = `You are an orchestrator for an HRM admin panel multi-agent system.
Available agent teams:
- documentation: generate/update help center articles from codebase analysis
- dev: (future) code generation and bug fixing
- testing: (future) automated test creation and execution

Given a task description, return ONLY a JSON object:
{ "team": "documentation", "reasoning": "brief explanation" }`;

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
                    max_tokens: 256,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userMessage }],
                }),
            });
            if (resp.ok) {
                const data = await resp.json();
                return data.content?.[0]?.text || '{}';
            }
            console.warn(`Claude failed (${resp.status}), trying Gemini fallback`);
        } catch (e) {
            console.warn('Claude error, trying Gemini fallback:', e);
        }
    }

    // Fallback: Gemini
    if (!GEMINI_API_KEY) {
        return JSON.stringify({ team: 'documentation', reasoning: 'Default plan (no AI key configured)' });
    }
    try {
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GEMINI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-2.5-flash',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
            }),
        });
        if (resp.ok) {
            const data = await resp.json();
            return data.choices[0].message.content;
        }
    } catch {}
    return JSON.stringify({ team: 'documentation', reasoning: 'Default plan (all AI providers failed)' });
}

function extractJSON(text: string): any {
    const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    try {
        return match ? JSON.parse(match[1]) : JSON.parse(text);
    } catch {
        const objMatch = text.match(/\{[\s\S]*\}/);
        if (objMatch) return JSON.parse(objMatch[0]);
        return { team: 'documentation', reasoning: 'Fallback plan (parse error)' };
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { task = 'Generate full documentation for all HRM pages', requested_pages } = body;

        // 1. Plan with Claude → Gemini fallback
        const planText = await callLLMForPlanning(task);
        const plan = extractJSON(planText);

        // 2. Fetch active agents for the planned team
        const { data: agents, error: agentsError } = await supabase
            .from('agent_registry')
            .select('*')
            .eq('team_name', plan.team || 'documentation')
            .eq('status', 'active')
            .order('sort_order');

        if (agentsError) throw new Error(`Failed to fetch agents: ${agentsError.message}`);
        if (!agents || agents.length === 0) throw new Error(`No active agents found for team: ${plan.team}`);

        // 3. Create orchestration run
        const orchestrationId = crypto.randomUUID();
        const { error: insertError } = await supabase.from('agent_tasks').insert(
            agents.map((a: any) => ({
                orchestration_id: orchestrationId,
                agent_team: a.team_name,
                agent_name: a.agent_name,
                status: 'pending',
            }))
        );
        if (insertError) throw new Error(`Failed to create task rows: ${insertError.message}`);

        // 4. Pipeline: run agents sequentially (skip help-chatbot — on-demand only)
        const pipelineAgents = agents.filter((a: any) => a.agent_name !== 'help-chatbot');
        const pages = requested_pages || PAGE_MANIFEST;
        let pipelinePayload: any = { page_manifest: pages };

        for (const agent of pipelineAgents) {
            await supabase
                .from('agent_tasks')
                .update({ status: 'running', started_at: new Date().toISOString(), input: pipelinePayload })
                .eq('orchestration_id', orchestrationId)
                .eq('agent_name', agent.agent_name);

            try {
                const agentResp = await fetch(`${FUNCTIONS_BASE}/${agent.endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                    },
                    body: JSON.stringify(pipelinePayload),
                });

                if (!agentResp.ok) {
                    const errText = await agentResp.text();
                    throw new Error(`Agent ${agent.agent_name} responded with ${agentResp.status}: ${errText}`);
                }

                const agentOutput = await agentResp.json();
                if (agentOutput.error) throw new Error(`Agent ${agent.agent_name} error: ${agentOutput.error}`);

                await supabase
                    .from('agent_tasks')
                    .update({ status: 'completed', completed_at: new Date().toISOString(), output: agentOutput })
                    .eq('orchestration_id', orchestrationId)
                    .eq('agent_name', agent.agent_name);

                pipelinePayload = agentOutput;

            } catch (agentErr: any) {
                await supabase
                    .from('agent_tasks')
                    .update({ status: 'failed', error: agentErr.message, completed_at: new Date().toISOString() })
                    .eq('orchestration_id', orchestrationId)
                    .eq('agent_name', agent.agent_name);
                throw agentErr;
            }
        }

        // Mark help-chatbot as ready (not run in pipeline)
        await supabase
            .from('agent_tasks')
            .update({ status: 'completed', completed_at: new Date().toISOString(),
              output: { note: 'Ready for on-demand RAG queries' } })
            .eq('orchestration_id', orchestrationId)
            .eq('agent_name', 'help-chatbot');

        return new Response(JSON.stringify({
            orchestration_id: orchestrationId,
            team: plan.team,
            reasoning: plan.reasoning,
            agents_run: pipelineAgents.map((a: any) => a.agent_name),
            indexed_count: pipelinePayload.indexed_count,
            article_ids: pipelinePayload.article_ids,
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
