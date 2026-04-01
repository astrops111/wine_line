---
name: scheduling-ai
description: >
  Implement or modify the AI auto-scheduler for Taiwan retail employee shift scheduling.
  This skill builds the `scheduling-ai` Supabase Edge Function and patches the frontend
  Scheduling.tsx payload. Use this skill whenever the user mentions AI scheduling, auto-scheduling,
  排班, shift generation, scheduling edge function, scheduling-ai, employee shift assignment,
  or wants to create/modify/debug the automated weekly schedule generator. Also use when the user
  asks about scheduling constraints, labor law compliance in scheduling, or the 七休一 rule
  in the context of shift generation.
---

# AI Auto-Scheduler Implementation Skill

You are implementing the `scheduling-ai` Supabase Edge Function and its frontend integration.
The complete PRD lives at `admin/docs/PRD-scheduling-ai.md` — read it first for full context.

## What This Skill Produces

Primary deliverable:
1. **Edge Function**: `supabase/functions/scheduling-ai/index.ts` — a Deno function that accepts scheduling data, calls DashScope Qwen 3.5 Plus, validates output with H1–H13 hard constraints + S1–S8 soft constraints, and returns shift assignments

The frontend payload (`Scheduling.tsx:324-356`) is already complete — no patching needed.

## Architecture Overview

```
Scheduling.tsx  →  POST /scheduling-ai  →  DashScope Qwen 3.5 Plus
                                         →  Server-side validation
                                         →  Retry if violations
                                         →  Return assignments + summary
```

**Algorithm**: LLM + post-validation loop (Option C from PRD).
Generate schedule with LLM, validate with constraint checker, retry once if violations found.

## Step 1: Read the PRD and Existing Code

Before writing any code:
1. Read `admin/docs/PRD-scheduling-ai.md` for the full specification (v1.1)
2. Read `supabase/functions/task-ai-agent/index.ts` as the template for DashScope integration pattern
3. Read `admin/src/pages/Scheduling.tsx` lines 324–382 for the current frontend contract (`runAiSchedule()`)
4. Read `admin/src/lib/schedulingValidation.ts` for the existing client-side validation (mirror this server-side)
5. Read `admin/src/types/scheduling.ts` for TypeScript interfaces
6. Read `references/constraint-rules.md` bundled with this skill for the exact validation logic (H1–H13, S1–S8)

## Step 2: Build the Edge Function

Create `supabase/functions/scheduling-ai/index.ts` following this structure:

```
1. CORS handler (copy pattern from task-ai-agent)
2. Parse request body — extract all fields (including working_hour_type, historical_assignments)
3. Create Supabase client and fetch additional context:
   a. employee_skills from employee_skills table
   b. monthly OT context from overtime_requests table
   c. store budget from stores table (default_labor_budget, hourly_rate_default)
   d. demand forecasts (optional, from demand-forecast function or daily_demand table)
4. Data preparation (Phase 1 from PRD) — build maps, determine dailyNormalCap, summarize history
5. Build LLM prompt (Phase 2 from PRD) — encode H1-H13 and S1-S8
6. Call DashScope Qwen 3.5 Plus
7. Parse JSON response (handle markdown code fences)
8. Validate assignments (Phase 4 from PRD) — pass all options including OT, skills, budget
9. If violations → retry once with violation feedback (Phase 5)
10. Calculate summary scores (Phase 6) — including budget utilization
11. Return response
```

### Critical Implementation Details

**DashScope API call pattern** (from existing edge functions):
```typescript
const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${Deno.env.get('DASHSCOPE_API_KEY')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'qwen3.5-plus',
    messages: [systemMessage, userMessage],
  }),
});
```

**JSON extraction from LLM response** (handle markdown wrapping):
```typescript
const text = data.choices[0].message.content;
const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
const parsed = match ? JSON.parse(match[1]) : JSON.parse(text);
```

### System Prompt Template

The system prompt must encode constraints in this exact priority order. Read `references/constraint-rules.md` for the full prompt template including all hard constraints (H1–H13) and soft constraints (S1–S8).

Key data sections in the prompt:
- Employee data, shift templates, availability, leave dates, operating hours
- Employee skills + template required skills (for H13)
- Monthly OT context (for H11/H12)
- Historical assignment patterns (for S3)
- Demand forecasts (for S8)
- Labor budget (for S7)
- Working hour type — determines dailyNormalCap (8h standard, 10h 變形工時)

### Validation Function

The edge function must include a `validateSchedule()` function that checks:

**Hard violations** (block retry):
- H1: Employee scheduled on leave day
- H2: Employee scheduled on unavailable day
- H3: Employee exceeds max_hours_per_week
- H4: 七休一 — 7+ consecutive working days
- H5: Rest interval < 11 hours between shifts
- H6: Shift times not in templates
- H7: Part-time exceeds max hours (strict ceiling)
- H9: Break time below legal minimum (§35)
- H10: Daily hours > 12h absolute cap
- H11: Monthly OT > 46h (or 54h hard cap) (§32-1)
- H12: 3-month OT > 138h (§32-1)
- H13: Employee lacks required skills for assigned shift

**Warnings** (informational):
- H8: Full-time under 80% of max hours (underutilized)
- H10: Daily hours > dailyNormalCap (overtime, not violation)
- S1: Understaffed day / no senior employee
- S7: Labor cost exceeds or approaching budget
- S8: Staffing below demand forecast recommendation
- Monthly OT approaching 46h cap (>38h)
- Overtime detected

See `references/constraint-rules.md` for the complete validation pseudocode.

### Summary Scoring

After validation, compute:
- `total_hours`: sum of all (end_time - start_time - break_minutes) across assignments
- `estimated_cost`: total_hours × hourly_rate (default NT$183 from store settings)
- `preference_score`: see Appendix B in PRD
- `consistency_score`: see Appendix C in PRD (0.0 if no previous week data)
- `coverage_met`: true if no understaffed warnings
- `budget_utilization`: estimated_cost / labor_budget (if budget available)

## Step 3: Frontend (Already Complete)

The frontend payload in `Scheduling.tsx:324-356` already sends all required fields:
- `availability`, `operating_hours`, `working_hour_type`
- `previous_week_assignments`, `historical_assignments` (8 weeks)
- `user_instructions`

No frontend patching needed. The edge function is the only deliverable.

## Step 4: Verify

After implementation:
1. Check that the edge function handles all edge cases from the PRD (empty employees, no templates, malformed LLM response, etc.)
2. Confirm the validation function covers all H1–H13 hard checks and S1–S8 soft checks
3. Verify monthly OT context is fetched and used in validation
4. Verify employee skills are fetched and cross-referenced with template required_skills
5. Ensure bilingual notes (zh-TW primary, English secondary)
6. Confirm 變形工時 daily cap is correctly applied (8h standard, 10h for 2week/4week)

## Common Pitfalls

- **Don't invent shift times**: The LLM must only use start_time/end_time pairs from the provided shift_templates. Validate this in the checker.
- **Don't hallucinate employee IDs**: Validate every user_id in the response against the input employees array.
- **Handle timezone**: All dates are date strings (YYYY-MM-DD), all times are time strings (HH:MM). No timezone conversion needed — everything is local Taiwan time.
- **Part-time ceiling is strict**: If a part-time employee's total hours exceed max_hours_per_week, it's a hard violation that triggers retry. Full-time under-scheduling is only a warning.
- **Previous week may not exist**: If no previous schedule found, set consistency_score to 0 and skip consistency logic in the prompt.
- **Monthly OT is cumulative**: The edge function must add this week's OT to existing monthly totals — not just check this week in isolation.
- **變形工時 changes the daily cap**: When `working_hour_type` is `2week` or `4week`, hours between 8-10h/day are NOT overtime. The validation must use the correct `dailyNormalCap`.
- **Skill data may be empty**: If `employee_skills` table has no rows, skip H13 checks entirely rather than blocking all assignments.
- **Budget is soft**: Never reject a schedule for exceeding budget. Just warn. Coverage always takes priority.
