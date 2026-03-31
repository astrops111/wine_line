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

Two deliverables:
1. **Edge Function**: `supabase/functions/scheduling-ai/index.ts` — a Deno function that accepts scheduling data, calls DashScope Qwen 3.5 Plus, validates output, and returns shift assignments
2. **Frontend Patch**: Updates to `admin/src/pages/Scheduling.tsx` — adds missing payload fields (availability, operating_hours, previous_week_assignments)

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
1. Read `admin/docs/PRD-scheduling-ai.md` for the full specification
2. Read `supabase/functions/task-ai-agent/index.ts` as the template for DashScope integration pattern
3. Read `admin/src/pages/Scheduling.tsx` lines 162–200 for the current frontend contract
4. Read `references/constraint-rules.md` bundled with this skill for the exact validation logic

## Step 2: Build the Edge Function

Create `supabase/functions/scheduling-ai/index.ts` following this structure:

```
1. CORS handler (copy pattern from task-ai-agent)
2. Parse request body — extract all fields
3. Data preparation (Phase 1 from PRD)
4. Build LLM prompt (Phase 2 from PRD)
5. Call DashScope Qwen 3.5 Plus
6. Parse JSON response (handle markdown code fences)
7. Validate assignments (Phase 4 from PRD)
8. If violations → retry once with violation feedback (Phase 5)
9. Calculate summary scores (Phase 6)
10. Return response
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

The system prompt must encode constraints in this exact priority order. Read `references/constraint-rules.md` for the full prompt template including all hard constraints (H1–H8) and soft constraints (S1–S6).

### Validation Function

The edge function must include a `validateSchedule()` function that checks:

**Hard violations** (block retry):
- H1: Employee scheduled on leave day
- H2: Employee scheduled on unavailable day
- H3: Employee exceeds max_hours_per_week
- H4: 七休一 — 7+ consecutive working days
- H5: Rest interval < 11 hours between shifts
- H7: Part-time exceeds max hours (strict ceiling)

**Warnings** (informational):
- H8: Full-time under 80% of max hours (underutilized)
- S1: Understaffed day (below min_staff_per_day)
- S1: No senior employee on a day
- Overtime detected

See `references/constraint-rules.md` for the complete validation pseudocode.

### Summary Scoring

After validation, compute:
- `total_hours`: sum of all (end_time - start_time - break_minutes) across assignments
- `estimated_cost`: total_hours × 170 (default NT$ hourly rate)
- `preference_score`: see Appendix B in PRD
- `consistency_score`: see Appendix C in PRD (0.0 if no previous week data)
- `coverage_met`: true if no understaffed warnings

## Step 3: Patch the Frontend

Update `admin/src/pages/Scheduling.tsx` `runAiSchedule()` function:

1. **Before the API call**, fetch previous week's assignments:
```typescript
const prevStart = new Date(weekStart + 'T00:00:00');
prevStart.setDate(prevStart.getDate() - 7);
const { data: prevSched } = await supabase.from('schedules').select('id')
  .eq('store_id', selectedStore)
  .eq('week_start', prevStart.toISOString().split('T')[0]).single();
const prevAssignments = prevSched
  ? (await supabase.from('shift_assignments')
      .select('user_id, date, start_time, end_time, shift_template_id')
      .eq('schedule_id', prevSched.id)).data
  : [];
```

2. **Extend the payload** to include three new fields:
```typescript
body: {
  store_id: selectedStore,
  week_start: weekStart,
  employees,
  shift_templates: shiftTemplates,
  leave_requests: leaves,
  availability,                                                    // ADD
  operating_hours: stores.find(s => s.id === selectedStore)?.operating_hours || {},  // ADD
  previous_week_assignments: prevAssignments || [],                 // ADD
  user_instructions: aiInstructions.trim() || undefined,
}
```

3. **Handle new response fields** — the response now includes `warnings[]` and extended `summary` with scores. Update the schedule insert to store warnings if the `schedules` table supports it, otherwise just store violations as before.

## Step 4: Verify

After implementation:
1. Check that the edge function handles all edge cases from the PRD (empty employees, no templates, malformed LLM response, etc.)
2. Verify the frontend payload includes all required fields
3. Confirm the validation function covers all H1–H8 checks and warning types
4. Ensure bilingual notes (zh-TW primary, English secondary)

## Common Pitfalls

- **Don't invent shift times**: The LLM must only use start_time/end_time pairs from the provided shift_templates. Validate this in the checker.
- **Don't hallucinate employee IDs**: Validate every user_id in the response against the input employees array.
- **Handle timezone**: All dates are date strings (YYYY-MM-DD), all times are time strings (HH:MM). No timezone conversion needed — everything is local Taiwan time.
- **Part-time ceiling is strict**: If a part-time employee's total hours exceed max_hours_per_week, it's a hard violation that triggers retry. Full-time under-scheduling is only a warning.
- **Previous week may not exist**: If no previous schedule found, set consistency_score to 0 and skip consistency logic in the prompt.
