# PRD: AI Auto-Scheduler (`scheduling-ai` Edge Function)

**Version**: 1.1
**Date**: 2026-03-31
**Status**: Draft
**Route**: `/scheduling` → 🤖 AI 自動排班 button

---

## Objective

Build the `scheduling-ai` Supabase Edge Function that receives store context, employee data, shift templates, leave requests, availability preferences, and natural-language instructions — then returns a complete weekly shift schedule that satisfies hard labor-law constraints and soft manager preferences.

---

## Strategy Team

### Business Context
- Taiwan retail stores need weekly schedules for 5–30 employees per store
- Manual scheduling takes managers 1–3 hours per week, is error-prone, and often violates labor law
- AI scheduling reduces manager overhead to review-and-publish (< 15 min)
- Must comply with Taiwan Labor Standards Act (勞基法 §35, §36) to avoid fines up to NT$1M

### ROI
| Metric | Before | After |
|--------|--------|-------|
| Scheduling time/week | 1–3 hours | < 15 min review |
| Labor law violations | Caught at publish (reactive) | Prevented at generation (proactive) |
| Employee satisfaction | Manual preference handling | Automated preference optimization |
| Labor cost optimization | None | AI minimizes overtime, balances hours |

---

## Product Team

### User Flow

```
Manager selects store → selects week → (optional) enters AI criteria
    ↓
Clicks "🤖 AI 自動排班"
    ↓
Frontend calls scheduling-ai edge function with payload
    ↓
AI generates assignments (2–8 seconds)
    ↓
Frontend inserts schedule (draft) + shift_assignments
    ↓
Calendar renders color-coded shifts
    ↓
Manager reviews → clicks "📤 發佈"
    ↓
checkLaborLawViolations() runs client-side
    ↓
Published (or acknowledged with violations)
```

### Input Payload (from Scheduling.tsx:324–356)

```typescript
{
  store_id: string,                    // UUID — selected retail store
  week_start: string,                  // "YYYY-MM-DD" — Monday of target week
  employees: Employee[],               // active employees assigned to store
  shift_templates: ShiftTemplate[],    // store-specific shift types (may include required_skills[])
  leave_requests: LeaveRequest[],      // approved leaves overlapping the week
  availability: Availability[],        // per-employee day-of-week preferences ✅⭐❌
  operating_hours: object,             // store operating hours by day (open/closed + times)
  working_hour_type: string,           // 'standard' | '2week' | '4week' — 變形工時 setting
  previous_week_assignments: any[],    // last week's shifts for consistency
  historical_assignments: any[],       // 8 weeks of historical shifts for pattern learning
  user_instructions?: string           // natural-language criteria from 💡 panel
}
```

> **Frontend payload status**: All fields above are already sent by `runAiSchedule()` in the current codebase. Additional context (employee_skills, monthly OT, demand forecasts, budget) is computed in the edge function or passed by the validation context.

### Expected Output (from Scheduling.tsx:175–194)

```typescript
{
  assignments: {
    user_id: string,
    date: string,             // "YYYY-MM-DD"
    start_time: string,       // "HH:MM"
    end_time: string,         // "HH:MM"
    break_minutes: number,
    position: string | null,
    is_overtime: boolean,
    overtime_hours: number
  }[],
  summary: {
    total_hours: number,      // sum of all work hours (excl. breaks)
    estimated_cost: number    // NT$ estimate based on hours × implied rate
  },
  violations: {
    employee_id: string,
    employee_name: string,
    type: "consecutive_days" | "short_rest",
    message: string,
    severity: "warning" | "error"
  }[],
  notes: string               // AI reasoning summary (bilingual)
}
```

### Acceptance Criteria

**Hard constraints (must pass)**
1. Returns valid `assignments[]` for every working day in the week
2. No employee is scheduled on an approved leave day
3. No employee is scheduled on a day marked `unavailable`
4. No employee exceeds `max_hours_per_week`
5. No `consecutive_days >= 7` violations generated (七休一)
6. No `short_rest < 11h` violations generated unless unavoidable

**Hours compliance**
7. Full-time employees (`employee_type = 'full-time'`) must be scheduled ≥ `min_hours_per_week` (derived as `max_hours_per_week × 0.8` or configurable) — warn if under-scheduled
8. Part-time employees (`employee_type = 'part-time'`) must NOT exceed `max_hours_per_week` — hard violation if exceeded
9. Total weekly hours per employee tracked; overtime flagged when exceeding standard hours (40h full-time / per-employee max)

**Employee preferences**
10. Preferred days (`⭐`) are prioritized over merely available days (`✅`)
11. Natural-language `user_instructions` are honored when feasible
12. Employees with `position` set are matched to shifts requiring that position
13. Part-time hours distributed proportionally lower than full-time

**Staff coverage requirements**
11. Every operating day has ≥ `min_staff_per_day` employees scheduled (default: 1, configurable via `user_instructions`)
12. If store has `operating_hours` with a day marked `closed`, no shifts are generated for that day
13. At least one senior/experienced employee per day when available (soft)

**Schedule consistency**
14. When a previous week's schedule exists, the AI references it as a baseline to maintain pattern continuity (same employees on similar days/shifts when possible)
15. Employees who worked weekends last week should be rotated off weekends this week when feasible (fairness rotation)
16. Historical assignments (8 weeks) are used for pattern learning when available

**Variable working hours (變形工時)**
17. When `working_hour_type` is `2week` or `4week`, daily normal cap extends to 10h (hours between 8-10h are NOT overtime)
18. When `working_hour_type` is `standard`, daily normal cap remains 8h

**Monthly/Quarterly overtime (§32-1)**
19. Monthly OT must not exceed 46h (base) or 54h (with agreement — hard cap)
20. Rolling 3-month OT must not exceed 138h
21. AI considers existing month's OT when assigning new shifts

**Skill/certification matching**
22. Shift templates with `required_skills` only assigned to employees who have all required skills
23. Skill mismatch is a hard violation (H13) that triggers retry

**Budget awareness**
24. If store has `default_labor_budget`, AI tries to stay within budget (soft constraint)
25. Budget exceeded → warning, not hard block (coverage takes priority)

**Demand forecasting**
26. If demand forecasts are available, daily staffing adjusted to match predicted demand
27. High-confidence forecasts (>0.7) override default `min_staff_per_day`

**Non-functional**
28. Response time < 10 seconds (P95)
29. Bilingual `notes` field (zh-TW primary, English secondary)

---

## Architecture Team

### System Design

```
┌─────────────────┐        POST /scheduling-ai         ┌──────────────────────┐
│  Scheduling.tsx  │  ──────────────────────────────────▶│  scheduling-ai       │
│  (React)         │                                     │  (Deno Edge Fn)      │
└─────────────────┘                                     │                      │
                                                        │  1. Parse input      │
                                                        │  2. Build constraint │
                                                        │     matrix           │
                                                        │  3. Call LLM with    │
                                                        │     structured prompt│
                                                        │  4. Parse JSON output│
                                                        │  5. Validate against │
                                                        │     labor law rules  │
                                                        │  6. Return response  │
                                                        └──────────────────────┘
                                                                 │
                                                                 ▼
                                                        ┌──────────────────────┐
                                                        │  DashScope Qwen 3.5  │
                                                        │  (or Claude fallback)│
                                                        └──────────────────────┘
```

### Decision: AI Model Choice

| Option | Pros | Cons |
|--------|------|------|
| **DashScope Qwen 3.5 Plus** | Consistent with task-ai-agent, workflow-ai; low cost; fast | Less capable on complex constraint reasoning |
| Claude Opus | Best reasoning for constraint satisfaction | Higher cost, slower |
| Hybrid (Qwen → Claude fallback) | Cost-effective for simple weeks, robust for complex | Added complexity |

**Recommendation**: DashScope Qwen 3.5 Plus (consistent with existing edge functions). Escalate to Claude only if Qwen produces violations in the generated schedule.

### Decision: Algorithm Approach

| Option | Description | Trade-off |
|--------|-------------|-----------|
| **A. Pure LLM** | Send all data + constraints in prompt, LLM returns schedule JSON | Simple to build; relies on LLM reasoning quality |
| **B. Constraint solver + LLM** | Algorithmic CSP solver for hard constraints, LLM for soft preferences | Most robust; higher complexity |
| **C. LLM + post-validation loop** | LLM generates draft, code validates, LLM re-generates if violations | Good balance; self-correcting |

**Recommendation**: **Option C — LLM + post-validation loop**. Generate with LLM, validate with the same `checkLaborLawViolations()` logic server-side, and retry once if violations are found. This matches the project's "AI never directly mutates critical data" principle and keeps the implementation simple.

---

## Engineering Team

### File Structure

```
supabase/functions/scheduling-ai/
├── index.ts        # Main handler: CORS, parse, orchestrate, respond
└── (uses shared Deno imports only)
```

### Algorithm: Decision Logic (Step-by-Step)

#### Phase 1 — Data Preparation

```
INPUT: store_id, week_start, employees[], shift_templates[], leave_requests[],
       availability[], operating_hours, working_hour_type, previous_week_assignments[]?,
       historical_assignments[]?, user_instructions?

ADDITIONAL CONTEXT (fetched by edge function from Supabase):
       employee_skills, monthly_ot_context, demand_forecasts, store.default_labor_budget

1. Build date array: [Mon, Tue, Wed, Thu, Fri, Sat, Sun] from week_start
2. Filter out closed days: check operating_hours — if day is "closed", exclude from scheduling
3. Build leave map: { user_id → Set<date> } from leave_requests
4. Build availability map: { user_id → { dow → "available"|"preferred"|"unavailable" } }
   - From availability[] passed in payload (fetched from employee_availability table)
   - Employees with no availability record default to "available" all days
5. Calculate shift durations: for each template, work_hours = (end - start - break) in hours
6. Calculate per-employee budget: remaining_hours = max_hours_per_week
7. Determine daily normal cap from working_hour_type:
   - 'standard' → 8h, '2week'/'4week' → 10h (變形工時 §30-1)
8. Build previous-week pattern map (if previous_week_assignments provided):
   { user_id → { day_of_week → shift_template_id } }
   - Used by LLM for schedule consistency (S3)
9. Summarize historical patterns (if historical_assignments provided — up to 8 weeks):
   - Per-employee: which days of week they typically work, average hours/week
   - Weekend rotation tracking: how many weekends each employee has worked recently
   - Used for long-term fairness and pattern learning
10. Derive min_staff_per_day:
    - If demand_forecasts available with confidence > 0.7, use recommended_staff
    - Else parse from user_instructions if specified (e.g. "每天至少2人" → 2)
    - Otherwise default to: ceil(employees.length / 3) or 1, whichever is greater
11. Classify employees: group by employee_type (full-time vs part-time)
    and by position (for role-based assignment)
12. Build employee skills map: { user_id → skill_name[] }
    - Fetch from employee_skills table
    - Cross-reference with shift_templates[].required_skills[]
13. Fetch monthly OT context:
    - monthly: { user_id → OT hours already used this month }
    - threeMonth: { user_id → OT hours used in rolling 3-month window }
14. Get labor budget: store.default_labor_budget and store.hourly_rate_default (default NT$183)
```

#### Phase 2 — LLM Prompt Construction

The system prompt encodes:

```
ROLE: You are an AI shift scheduler for a Taiwan retail store.

HARD CONSTRAINTS (must NOT violate):
  H1. Never schedule an employee on a leave day
  H2. Never schedule an employee on an "unavailable" day
  H3. Never exceed max_hours_per_week for any employee
  H4. 七休一: max 6 consecutive working days (§36)
  H5. 11-hour minimum rest between shifts (§34)
  H6. Only use shift templates provided (don't invent times)
  H7. Part-time employees: total weekly hours ≤ max_hours_per_week (strict ceiling)
  H8. Full-time employees: total weekly hours ≥ min_hours_threshold (max_hours × 0.8)
      - If impossible due to leaves/availability, flag as 'underutilized' warning
  H9. Break time must meet legal minimums per §35 (30min/4h segment)
  H10. Daily hours cap: regular ≤ dailyNormalCap (8h standard, 10h 變形工時), total ≤ 12h
  H11. Monthly OT ≤ 46h base / 54h hard cap (§32-1)
  H12. Rolling 3-month OT ≤ 138h (§32-1)
  H13. Shift templates with required_skills → only assign qualified employees

SOFT CONSTRAINTS (optimize for, in priority order):
  S1. STAFF COVERAGE: Meet min_staff_per_day threshold every operating day
      - Use demand_forecasts when confidence > 0.7
      - At least 1 senior employee (position != null) per day when possible
  S2. EMPLOYEE PREFERENCES: Prefer "preferred" (⭐) days over "available" (✅) days
      - Match employee position to shift role when applicable
      - Prefer employees with matching skills for skill-required shifts
      - Respect part-time vs full-time proportional hour distribution
  S3. SCHEDULE CONSISTENCY: Maintain pattern continuity with previous week + historical data
      - If previous_week_assignments provided, keep ~70% of pattern stable
      - Use historical_assignments (8 weeks) for long-term pattern learning
      - Rotate weekend workers for fairness across weeks (track via historical data)
  S4. FAIRNESS: Distribute hours fairly across employees of same type
  S5. Minimize overtime, especially for employees near monthly OT cap
  S6. Honor user_instructions when provided (natural language)
  S7. BUDGET: Try to keep total labor cost within store budget (soft target)
  S8. DEMAND: Adjust staffing levels to match demand forecasts

OUTPUT FORMAT: strict JSON array of assignments (schema provided)
```

The user message includes:
- Employee list with types, positions, max hours
- Shift templates with times and break durations
- Leave dates per employee
- Availability matrix (7 days × N employees)
- Store operating hours (which days are open/closed, open/close times)
- Previous week's assignments (for consistency baseline) — if available
- Natural-language instructions (if any)
- Target week dates

#### Phase 3 — LLM Generation

- Call DashScope Qwen 3.5 Plus API
- Parse JSON from response (handle markdown code fence wrapping)
- Extract `assignments[]` array

#### Phase 4 — Server-Side Validation

Run labor law checks + coverage checks server-side:

```typescript
function validateSchedule(assignments, employees, leaveMap, availMap,
                          operatingDays, minStaffPerDay): ValidationResult {
  const violations = [];
  const warnings = [];

  // === Per-employee checks ===
  for (each employee) {
    const totalHours = sumWorkHours(employee assignments);

    // Check H1: leave conflicts
    // Check H2: unavailable day conflicts
    // Check H3: max_hours_per_week exceeded
    // Check H4: 七休一 (consecutive days >= 7)
    // Check H5: rest interval < 11 hours

    // Check H7: part-time ceiling
    if (employee.employee_type === 'part-time' && totalHours > employee.max_hours_per_week) {
      violations.push({ type: 'part_time_exceeded', severity: 'error',
        message: `${name}: 工時 ${totalHours}h 超過上限 ${employee.max_hours_per_week}h (兼職)` });
    }

    // Check H8: full-time floor
    const minHours = employee.max_hours_per_week * 0.8;
    if (employee.employee_type === 'full-time' && totalHours < minHours) {
      warnings.push({ type: 'underutilized', severity: 'warning',
        message: `${name}: 工時 ${totalHours}h 低於建議 ${minHours}h (全職應排滿)` });
    }

    // Check overtime
    const standardHours = employee.employee_type === 'full-time' ? 40 : employee.max_hours_per_week;
    if (totalHours > standardHours) {
      warnings.push({ type: 'overtime', severity: 'warning',
        message: `${name}: ${(totalHours - standardHours).toFixed(1)}h 加班` });
    }
  }

  // === Per-day coverage checks ===
  for (each date in operatingDays) {
    const dailyStaff = assignments.filter(a => a.date === date);
    // Check S1: minimum staff coverage
    if (dailyStaff.length < minStaffPerDay) {
      warnings.push({ type: 'understaffed', date,
        message: `${date}: ${dailyStaff.length}人值班 (需至少${minStaffPerDay}人)` });
    }
    // Check S1: senior coverage
    const hasSenior = dailyStaff.some(a =>
      employees.find(e => e.id === a.user_id)?.position);
    if (!hasSenior && employees.some(e => e.position)) {
      warnings.push({ type: 'no_senior', date,
        message: `${date}: 無資深員工值班` });
    }
  }

  // === Schedule on closed day check ===
  for (each assignment) {
    if (!operatingDays.includes(assignment.date)) {
      violations.push({ type: 'closed_day', ... });
    }
  }

  return { valid: violations.length === 0, violations, warnings };
}
```

#### Phase 5 — Self-Correction (if violations found)

If Phase 4 finds violations:
1. Append violations to conversation context
2. Ask LLM: "Fix these violations while maintaining coverage"
3. Parse new output → re-validate
4. Max 1 retry (fail gracefully with violations in response if still invalid)

#### Phase 6 — Summary Calculation

```typescript
total_hours = sum(assignments.map(a => workHours(a.start_time, a.end_time, a.break_minutes)))
estimated_cost = total_hours * AVG_HOURLY_RATE  // or per-employee if salary data available
```

### API Contract

**Request**: `POST /scheduling-ai`
```
Content-Type: application/json
Authorization: Bearer <supabase-anon-key>
```

**Response**: `200 OK`
```json
{
  "assignments": [...],
  "summary": {
    "total_hours": 168,
    "estimated_cost": 28560,
    "preference_score": 0.85,
    "consistency_score": 0.72,
    "coverage_met": true
  },
  "violations": [],
  "warnings": [
    { "type": "no_senior", "date": "2026-04-05", "message": "週六無資深員工值班" }
  ],
  "notes": "已根據員工偏好和班別模板排出本週班表。王小明安排在偏好日上班，週末維持3人值班。與上週班表維持72%一致性。\nGenerated weekly schedule based on employee preferences and shift templates. 72% consistency with last week."
}
```

**Error**: `400 / 500`
```json
{ "error": "Missing required field: employees" }
```

### Edge Cases

| Case | Handling |
|------|----------|
| All employees on leave for a day | Return that day with 0 assignments + `understaffed` warning in response |
| Fewer employees than required coverage | Schedule available staff, flag understaffing in `warnings[]` |
| Contradicting user instructions | Honor hard constraints first, note conflicts in `notes` |
| No shift templates configured | Return error: "請先在門市設定中新增班別" |
| Employee has 0 max_hours_per_week | Skip employee, note in `notes` |
| LLM returns malformed JSON | Retry once; if still malformed, return error |
| Store closed on a day (e.g. Sunday) | Exclude from scheduling; no assignments generated |
| No previous week schedule exists | Skip consistency logic; generate from scratch |
| All employees are part-time | Distribute shifts proportionally; warn if total hours < coverage need |
| User instruction contradicts labor law | Labor law wins; note conflict in `notes` (e.g. "無法安排7天連續上班") |
| Employee with no availability records | Treat as "available" all days (default) |
| Employee near monthly OT cap (>38h) | Reduce assignments; warning at 38h, error at 46h/54h |
| 3-month OT approaching 138h | Reduce this month's OT; hard violation at 138h |
| Store uses 變形工時 (2week/4week) | Daily normal cap = 10h; hours 8-10h are NOT overtime |
| Shift requires skills employee lacks | Hard violation → reassign to qualified employee |
| No employees have required skill for a shift | Assign best available + warning; coverage > skills |
| Labor budget exceeded | Warning only; coverage takes priority |
| Demand forecast says 5 staff but only 3 available | Schedule all 3 + demand_understaffed warning |
| No historical assignments (new store) | Skip pattern learning; generate fresh |
| Employee skills table empty | Skip H13 checks; all employees treated as qualified |

---

## Data Team

### Tables Read (no writes — frontend handles inserts)

| Table | Fields Used | Purpose |
|-------|-------------|---------|
| `users` | id, name, position, employee_type, max_hours_per_week | Employee roster + role classification |
| `shift_templates` | id, name, start_time, end_time, break_minutes, color, required_skills | Available shifts + skill requirements |
| `leave_requests` | user_id, start_date, end_date, status | Block leave days |
| `employee_availability` | user_id, day_of_week, availability, notes | Preference matrix (✅⭐❌) |
| `stores` | operating_hours, working_hour_type, default_labor_budget, hourly_rate_default | Store config |
| `schedules` | previous + historical (8 weeks) | Consistency baseline + pattern learning |
| `shift_assignments` | previous + historical assignments | Pattern continuity reference |
| `employee_skills` | user_id, skill_name | Employee certifications/skills |
| `overtime_requests` | user_id, request_date, ot_hours | Monthly OT accumulation |
| `daily_demand` | date, revenue, transactions, foot_traffic | Demand forecasting input |

### Tables Written (by frontend after response)

| Table | Action |
|-------|--------|
| `schedules` | INSERT one row (status='draft', generated_by='ai') |
| `shift_assignments` | INSERT N rows (one per employee per scheduled day) |

### KPI Tracking (Future)

| Metric | How to Measure |
|--------|----------------|
| AI schedule acceptance rate | % of AI drafts published without modification |
| Violation rate | Avg violations per AI-generated schedule |
| Modification rate | # of manual edits after AI generation |
| Generation latency | P50/P95 response time of edge function |

---

## QA & Risk Team

### Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| T1 | 5 employees, no leaves, no constraints | Valid 7-day schedule within max hours |
| T2 | Employee on leave Mon–Wed | No assignments for that employee Mon–Wed |
| T3 | Employee unavailable on weekends | No Sat/Sun assignments for that employee |
| T4 | User instruction: "週末至少3人" | ≥ 3 employees scheduled Sat and Sun |
| T5 | Only 2 employees, 7-day coverage needed | Schedule both, ensure 七休一 compliance |
| T6 | Conflicting templates (night→morning) | 11-hour rest check catches violation |
| T7 | No shift templates | Returns error message |
| T8 | Empty employee list | Returns error message |
| T9 | LLM returns garbage | Retry once, then return error |
| T10 | 30 employees (large store) | Completes within 10s, valid schedule |

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM hallucination (invalid employee IDs) | Broken foreign keys | Validate all user_ids against input employee list |
| LLM generates times not in templates | Inconsistent display | Validate start/end times match a template |
| DashScope API downtime | Feature unavailable | Add Claude as fallback model |
| Prompt too long for large stores | Truncated context | Limit to essential fields; paginate if > 30 employees |
| Cost per invocation | Budget concern | Qwen 3.5 Plus is ~$0.002/call; acceptable |

---

## Operations Team

### Monitoring

- Log every invocation: `store_id`, `employee_count`, `latency_ms`, `violation_count`, `retry_used`
- Alert if error rate > 5% over 1 hour
- Alert if P95 latency > 15 seconds

### Rollout Plan

| Phase | Scope | Gate |
|-------|-------|------|
| **MVP** | Single-store, single-week generation | This PRD |
| **Phase 2** | Multi-week batch generation, cost optimization with actual salary data | MVP metrics satisfactory |
| **Phase 3** | Employee self-service preferences via LIFF, auto-publish with zero violations | Phase 2 stable |

---

## Cross-Department Reviews

### Retail Operations ✅
- Managers need < 10s generation time (confirmed feasible with Qwen)
- Must handle "busy store" reality: understaffing, last-minute leaves
- Copy-last-week already exists as fallback if AI fails

### Finance ✅
- Estimated cost calculation uses hours × implied rate (good enough for MVP)
- Phase 2 should use actual salary data from `salary_structures` table
- Qwen API cost negligible (~$0.002/invocation)

### HR / Workforce ✅
- 七休一 and 11-hour rest enforced at generation time (proactive > reactive)
- Employee preferences respected via availability matrix
- Overtime flagged explicitly in output

### Integration ✅
- Follows existing DashScope Qwen pattern (consistent with task-ai-agent, workflow-ai)
- No new database tables required
- Frontend contract already defined in Scheduling.tsx

### Data ✅
- Output is measurable (hours, cost, violations)
- KPI tracking deferred to Phase 2

### Engineering ✅
- Single file implementation (~150–250 lines)
- Template available: `workflow-ai/index.ts`
- No new dependencies

---

## Conflicts & Trade-offs

| Conflict | Resolution |
|----------|------------|
| LLM reasoning quality vs. speed/cost | Use Qwen for MVP; retry loop compensates for weaker reasoning |
| Strict constraint compliance vs. coverage | Hard constraints always win; understaffing is flagged, not hidden |
| Natural-language flexibility vs. predictability | Instructions are "best effort"; hard constraints override user instructions |
| Server-side validation duplication | Intentional — edge function validates proactively, frontend validates reactively as safety net |
| Consistency vs. preference changes | If an employee changed their availability since last week, new preferences override consistency |
| Fairness rotation vs. coverage | Coverage wins — if only 2 people can work weekends, they work weekends regardless of rotation |
| Budget vs. coverage | Coverage wins — understaffing is worse than exceeding budget; budget is informational |
| Skill match vs. coverage | If no qualified employees available, assign anyway with warning; coverage > skill match |
| Demand forecast vs. available staff | Schedule all available staff; warn if below forecast recommendation |
| Monthly OT vs. coverage | If an employee is at the OT cap, do NOT assign more OT even if understaffed; use alternate staff |
| 變形工時 vs. standard rules | working_hour_type determines daily cap; once set, all calculations use that cap |

---

## Final Orchestrator Decision

**Build `scheduling-ai` as a single Deno Edge Function using:**
1. **DashScope Qwen 3.5 Plus** as primary LLM (consistent with existing functions)
2. **LLM + post-validation loop** architecture (Option C)
3. **Structured prompt** encoding hard constraints (labor law) and soft preferences
4. **Max 1 retry** if violations detected in generated schedule
5. **No new database tables** — reads employee/template/leave data from payload, frontend handles all writes

**Implementation priority**: This is the last missing piece of the scheduling module. Frontend is 100% complete and waiting for this function. Estimated scope: ~250 lines of TypeScript.

---

## Appendix A: Frontend Payload (Already Implemented)

The `runAiSchedule()` in [Scheduling.tsx:324-356](admin/src/pages/Scheduling.tsx#L324-L356) sends the complete payload:

```typescript
body: {
  store_id: selectedStore,
  week_start: weekStart,
  employees,
  shift_templates: shiftTemplates,
  leave_requests: leaves,
  availability,                                                                  // ✅ employee_availability[]
  operating_hours: stores.find(s => s.id === selectedStore)?.operating_hours || {}, // ✅ store hours
  working_hour_type: stores.find(s => s.id === selectedStore)?.working_hour_type || 'standard', // ✅ 變形工時
  previous_week_assignments: prevAssignments || [],                               // ✅ prev week
  historical_assignments: historicalAssignments,                                   // ✅ 8 weeks history
  user_instructions: aiInstructions.trim() || undefined,
}
```

**Additional context fetched by the edge function** (not sent by frontend):
- `employee_skills` — queried from `employee_skills` table using employee IDs
- `otContext` — computed from `overtime_requests` table for monthly/3-month OT tracking
- `demand_forecasts` — if `demand-forecast` edge function is available
- `labor_budget` — from `stores.default_labor_budget` and `stores.hourly_rate_default`

---

## Appendix B: Preference Scoring Model

The AI generates a `preference_score` (0.0–1.0) measuring how well the schedule respects employee preferences:

```
preference_score = matched_preferences / total_scheduling_decisions

Where:
  matched_preference = employee scheduled on a "preferred" (⭐) day    → +1.0
  neutral            = employee scheduled on an "available" (✅) day   → +0.5
  mismatch           = employee scheduled on no-preference day          → +0.0
  violation          = employee scheduled on "unavailable" (❌) day    → -1.0 (should never happen)
```

**Example**: 5 employees × 5 days = 25 decisions. 15 on preferred days, 10 on available days:
`(15×1.0 + 10×0.5) / 25 = 0.80`

---

## Appendix C: Consistency Scoring Model

The `consistency_score` (0.0–1.0) measures pattern continuity with the previous week:

```
consistency_score = matching_slots / total_slots

Where:
  matching_slot = same employee assigned to same day-of-week with same shift template
  total_slots   = number of assignments in the new schedule
```

**Note**: Consistency is a soft goal. The score is informational — it helps managers understand how stable the schedule is week-over-week. A score of 0.6–0.8 is healthy (stable but not rigid). Below 0.4 suggests major disruption (many leaves, changed availability). Above 0.9 may indicate the AI is not rotating fairly.

---

## Appendix D: Decision Priority Hierarchy

When constraints conflict, the AI resolves in this strict order:

```
 1. LABOR LAW (absolute)         — 七休一 §36, 11h rest §34, break §35, daily cap §30+§32,
                                    monthly OT §32-1 (46h/54h), quarterly OT (138h), 變形工時 §30-1
 2. HARD BLOCKS (absolute)       — leave days, unavailable days, closed days
 3. SKILL/CERT MATCH (absolute)  — employee must have all required_skills for assigned shift
 4. HOURS COMPLIANCE (absolute)  — part-time ceiling, full-time floor (warn at 80%)
 5. STAFF COVERAGE (high)        — min employees per day, demand forecast override
 6. EMPLOYEE PREFERENCE (medium) — preferred days, position matching, skill affinity
 7. SCHEDULE CONSISTENCY (medium) — prev week continuity + 8-week historical patterns
 8. BUDGET AWARENESS (medium)    — keep labor cost within budget (soft target)
 9. FAIRNESS ROTATION (low)      — weekend rotation, hour balancing, long-term fairness
10. USER INSTRUCTIONS (low)      — natural language criteria (best effort)
```

If a user instruction contradicts labor law (e.g. "排王小明7天"), the AI:
1. Ignores the conflicting part
2. Schedules the employee for max 6 consecutive days
3. Explains in `notes`: "無法安排王小明連續7天上班（七休一規定），已安排6天。"

---

## Appendix E: Competitive Gap Analysis

**Date**: 2026-03-29
**Systems analyzed**: 104企業大師, MAYO/Apollo HR, NUEIP, Femas HR, Deputy, When I Work, 7shifts

### Our Competitive Advantages

| Advantage | Nearest Competitor |
|---|---|
| LLM-based auto-scheduling with natural language instructions | Deputy (beta AI chat only) |
| Self-correcting auto-fix loop (remove violations → AI finds replacements) | None |
| Full regeneration fallback | None |
| H1-H10 Taiwan labor law validation (most comprehensive) | Taiwan competitors check compliance but less granularly |
| 3-tier preference system with scoring (available/preferred/unavailable → 0.0-1.0) | All others use binary available/unavailable |
| Consistency scoring (0.0-1.0 week-over-week) | None expose this |
| Bilingual AI reasoning notes (zh-TW + EN) | None |
| Documented 8-level priority hierarchy | None |

### Identified Gaps (Prioritized)

#### HIGH PRIORITY

**GAP-1: No 變形工時 (Variable Working Hours)**
- All Taiwan competitors (104, MAYO, NUEIP, Femas) support 2/4/8-week variable working hour arrangements permitted under Taiwan Labor Standards Act for designated industries.
- Under 4-week variable hours, daily limit extends to 10h without overtime. Without this, our system flags false violations.
- **Impact**: Critical for Taiwan market — many retail/hospitality businesses legally use variable-hour arrangements.

**GAP-2: No Schedule Notification to Employees**
- NUEIP pushes schedule screenshots to LINE after publication. Deputy/When I Work/7shifts send push/SMS/email.
- Our system publishes but has no mechanism to notify employees.
- **Impact**: Employees must actively check for schedules.
- **Effort**: Low — LIFF infrastructure already exists.

**GAP-3: No Open Shift Marketplace / Bidding**
- 7shifts: full "Open Shift" marketplace where employees bid on posted shifts. Deputy: broadcasts to qualified staff. When I Work: open shift pools.
- Our shift swap only supports direct requests between specific employees.
- **Impact**: No efficient way for employees to self-select into open shifts after cancellations or sick calls.

**GAP-4: No Monthly Overtime Cap Tracking (46h/54h)**
- Taiwan law limits monthly overtime to 46h (extendable to 54h with agreement, 3-month 138h cap).
- Our system tracks weekly hours but does not accumulate monthly overtime across weeks.
- **Impact**: Risk of cumulative overtime violations spanning multiple weeks.
- **Effort**: Low.

#### MEDIUM PRIORITY

**GAP-5: No Demand Forecasting / POS Integration**
- Deputy and 7shifts use POS data + weather + events to forecast customer demand and align staffing.
- Our system schedules based on availability and manager instructions only.
- **Impact**: Cannot optimize staffing to actual business demand.
- **Effort**: High — requires POS integration.

**GAP-6: No Real-Time Labor Cost Budgeting**
- Deputy: real-time wage costs per schedule being built. 7shifts: labor cost as % of projected sales with budget thresholds.
- Our system only shows basic `estimated_cost` in AI output summary.
- **Impact**: Managers cannot make cost-informed scheduling decisions.

**GAP-7: No Drag-and-Drop Schedule Editor**
- Deputy, 7shifts, When I Work, NUEIP (2025) all have drag-and-drop interfaces.
- Our system renders a calendar grid but does not support drag-and-drop editing.
- **Impact**: Manual adjustments after AI generation require more clicks.

**GAP-8: No Excel Import/Export**
- 104, MAYO, NUEIP, Femas all support Excel schedule import for migration from manual systems.
- **Impact**: Harder onboarding for businesses transitioning from spreadsheet-based scheduling.

**GAP-9: No Multi-Location Cross-Staffing**
- Deputy supports cross-location staff sharing with float pools. Femas supports cross-branch scheduling.
- Our system schedules one store at a time.
- **Impact**: Multi-store chains cannot share staff across locations for demand spikes.

#### LOWER PRIORITY

**GAP-10: No Schedule Template Library**
- 7shifts / When I Work let managers save and reuse named schedule templates (e.g., "Holiday week", "Summer staffing").
- We have "copy previous week" but no named templates.

**GAP-11: No Historical ML Learning**
- 7shifts analyzes 8-10 previous weeks to learn patterns. We reference only the immediately previous week.

**GAP-12: No Skill/Certification-Based Scheduling**
- Deputy / When I Work use multi-tag qualifications per shift (e.g., "barista certified", "cash register trained").
- We only have a single `position` field.

**GAP-13: No KPI Dashboard / Analytics**
- Deputy offers Analytics+. 7shifts provides labor efficiency reports.
- No way to measure AI schedule acceptance rate, modification rate, or overtime trends.

### Recommended Roadmap

| Phase | Gap | Feature | Effort |
|-------|-----|---------|--------|
| v1.1 | GAP-4 | Monthly overtime cap tracking (46h/54h) | Low |
| v1.1 | GAP-2 | LINE schedule push notification after publish | Low |
| v1.2 | GAP-1 | 變形工時 support (2/4/8-week variable hours) | Medium |
| v1.2 | GAP-3 | Open shift marketplace (post + bid + claim) | Medium |
| v1.3 | GAP-8 | Excel import/export | Low-Medium |
| v1.3 | GAP-10 | Named schedule templates | Low |
| v2.0 | GAP-7 | Drag-and-drop schedule editor | Medium-High |
| v2.0 | GAP-6 | Labor cost budgeting with thresholds | Medium |
| v2.0 | GAP-12 | Multi-skill/certification tagging | Medium |
| v3.0 | GAP-5 | Demand forecasting + POS integration | High |
| v3.0 | GAP-9 | Multi-location cross-staffing | High |
| v3.0 | GAP-11 | Historical ML learning (8-10 weeks) | Medium |
| v3.0 | GAP-13 | KPI dashboard + analytics | Medium |
