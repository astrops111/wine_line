# Constraint Rules Reference

## Table of Contents
1. [Taiwan Labor Law — Hours & Break Rules](#taiwan-labor-law)
2. [Work Hours Calculation](#work-hours-calculation)
3. [System Prompt Template](#system-prompt-template)
4. [Validation Function](#validation-function)
5. [Scoring Functions](#scoring-functions)
6. [Decision Priority Hierarchy](#decision-priority-hierarchy)
7. [Edge Cases](#edge-cases)

> **Last updated**: 2026-03-31 — Synced with codebase (`schedulingValidation.ts`, `Scheduling.tsx`).

---

## Taiwan Labor Law — Hours & Break Rules

All scheduling logic is governed by the Taiwan Labor Standards Act (勞基法).

### §30 — Maximum Working Hours

| Rule | Limit |
|------|-------|
| Regular work per day | **8 hours** (standard) / **10 hours** (變形工時) |
| Total per day (incl. overtime) | **12 hours** |
| Regular work per week | **40 hours** |

### §30-1 — Variable Working Hours (變形工時)

Certain industries (including retail, hospitality, healthcare) may adopt variable working hour arrangements (變形工時) under employer-employee agreement:

| Arrangement | Period | Daily Normal Cap | Weekly Cap | Notes |
|-------------|--------|-----------------|------------|-------|
| **Standard** | 1 week | 8h | 40h | Default for all |
| **2-week** (§30-1) | 2 weeks | **10h** | 48h (but avg 40h over 2 weeks) | Requires labor-management agreement |
| **4-week** (§30-1) | 4 weeks | **10h** | 48h (but avg 40h over 4 weeks) | Requires labor-management agreement |
| **8-week** (§30-1) | 8 weeks | **8h** | 48h (but avg 40h over 8 weeks) | Less common in retail |

**Impact on AI scheduler**: When `working_hour_type` is `2week` or `4week`, the daily normal cap extends from 8h to 10h. Hours between 8h and 10h are NOT overtime — they're redistributed regular hours. Only hours beyond 10h (or 12h total) count as overtime.

### §32-1 — Monthly & Quarterly Overtime Caps

| Rule | Limit |
|------|-------|
| Monthly overtime cap (base) | **46 hours** |
| Monthly overtime cap (with employer-employee agreement) | **54 hours** |
| Rolling 3-month total cap | **138 hours** |

**Important**: Monthly OT is cumulative across all weeks in a calendar month. The AI scheduler must consider existing OT hours from earlier weeks in the month when assigning new shifts. The `otContext` parameter provides:
- `monthly[user_id]`: OT hours already accumulated in current month
- `threeMonth[user_id]`: OT hours accumulated in current 3-month window

### §35 — Mandatory Break Time

The law requires: **30 minutes of break after every 4 continuous hours of work.**

There is no separate tier for shorter/longer shifts — the single rule is "4 hours continuous → 30 min break." In practice this means:

| Shift Duration | Work Segments | Minimum Break Required |
|----------------|---------------|----------------------|
| ≤ 4 hours | 1 segment | **0 min** (no break triggered) |
| > 4 hours to ≤ 8 hours | crosses 1 × 4h boundary | **30 min** |
| > 8 hours (standard day) | crosses 2 × 4h boundaries | **60 min** (2 × 30 min) |
| > 8 hours + overtime (up to 12h) | crosses 3 × 4h boundaries | **90 min** (3 × 30 min) |

**Important enforcement rules:**
- Break must **interrupt** the work period — cannot be tacked onto start/end of shift
- Multiple short breaks (e.g. 2 × 15 min) do **not** satisfy the 30-min requirement
- Employees **cannot waive** break time — it is non-negotiable

### §34 — Minimum Rest Between Shifts

- **11 hours** continuous rest between end of one shift and start of next (for rotational workers)
- Can be reduced to **8 hours** only with Central Authority approval

### Minimum Shift Duration

Taiwan law does **not** specify a minimum shift duration. There is no legal floor.

---

## Work Hours Calculation

**Actual work hours** (實際工時) = shift duration minus legally required break time.

This is the number that counts toward max_hours_per_week, overtime, and payroll.

### Formula

```typescript
function calcShiftHours(start_time: string, end_time: string, break_minutes: number) {
  const [sh, sm] = start_time.split(':').map(Number);
  const [eh, em] = end_time.split(':').map(Number);
  const shiftMinutes = (eh * 60 + em) - (sh * 60 + sm);  // total time at workplace
  const workMinutes = shiftMinutes - break_minutes;         // actual paid work time
  return {
    shiftMinutes,                          // total presence (e.g. 540 for 09:00–18:00)
    breakMinutes: break_minutes,           // deducted break (e.g. 60)
    workMinutes,                           // paid hours in minutes (e.g. 480)
    workHours: workMinutes / 60,           // paid hours decimal (e.g. 8.0)
  };
}
```

### §35 Compliance Check for Shift Templates

When validating or creating shift templates, verify break_minutes meets the legal minimum:

```typescript
function requiredBreakMinutes(shiftMinutes: number): number {
  // §35: 30 minutes break per 4 continuous hours of work
  if (shiftMinutes <= 240) return 0;         // ≤ 4h: no break required
  if (shiftMinutes <= 480) return 30;        // > 4h to ≤ 8h: 30 min
  if (shiftMinutes <= 720) return 60;        // > 8h to ≤ 12h: 60 min
  return 90;                                  // > 12h: 90 min (shouldn't happen, 12h is max)
}

function validateBreakCompliance(start_time: string, end_time: string, break_minutes: number) {
  const [sh, sm] = start_time.split(':').map(Number);
  const [eh, em] = end_time.split(':').map(Number);
  const shiftMinutes = (eh * 60 + em) - (sh * 60 + sm);
  const required = requiredBreakMinutes(shiftMinutes);
  return {
    compliant: break_minutes >= required,
    shiftMinutes,
    requiredBreak: required,
    actualBreak: break_minutes,
    deficit: Math.max(0, required - break_minutes),
  };
}
```

### §30 Daily Hours Check

```typescript
function validateDailyHours(
  start_time: string, end_time: string, break_minutes: number,
  working_hour_type: 'standard' | '2week' | '4week' | '8week' = 'standard'
) {
  const [sh, sm] = start_time.split(':').map(Number);
  const [eh, em] = end_time.split(':').map(Number);
  const shiftMinutes = (eh * 60 + em) - (sh * 60 + sm);
  const workMinutes = shiftMinutes - break_minutes;
  const workHours = workMinutes / 60;
  // Variable working hours: daily normal cap is 10h for 2week/4week
  const dailyNormalCap = (working_hour_type === '2week' || working_hour_type === '4week') ? 10 : 8;
  return {
    workHours,
    regularHours: Math.min(workHours, dailyNormalCap),
    overtimeHours: Math.max(0, workHours - dailyNormalCap),
    exceedsDaily: workHours > 12,                    // §30+§32: absolute max 12h/day
    dailyNormalCap,
  };
}

---

## System Prompt Template

Use this as the system message for the DashScope API call. Replace placeholders with actual data.

```
You are an AI shift scheduler for a Taiwan retail store. Generate a weekly shift schedule as a JSON array.

=== HARD CONSTRAINTS (must NOT violate) ===

H1. LEAVE BLOCKS: Never schedule an employee on a leave day.
    Leave days: {leaveMap}

H2. UNAVAILABLE DAYS: Never schedule an employee on a day they marked "unavailable" (❌).
    Unavailability: {availMap filtered to unavailable}

H3. MAX HOURS: Never exceed an employee's max_hours_per_week.

H4. 七休一 (Taiwan §36): No employee may work more than 6 consecutive days. They must have at least 1 rest day per 7-day span.

H5. REST INTERVAL (Taiwan §34): Minimum 11 hours continuous rest between the end of one shift and the start of the next shift for the same employee.

H6. SHIFT TEMPLATES ONLY: Only use start_time/end_time/break_minutes from the provided shift templates. Do not invent shift times.

H7. PART-TIME CEILING: Part-time employees' total weekly WORK hours must NOT exceed their max_hours_per_week. This is a strict ceiling.

H8. FULL-TIME FLOOR: Full-time employees should be scheduled ≥ 80% of their max_hours_per_week in WORK hours. If impossible due to leaves or availability, this becomes a warning rather than a violation.

H9. MANDATORY BREAK (Taiwan §35): Break time must meet legal minimums based on shift duration:
    - Shift ≤ 4 hours: no break required
    - Shift > 4 hours: ≥ 30 min break
    - Shift > 8 hours: ≥ 60 min break (2 × 30 min per 4h segment)
    Break time must interrupt the work period; it cannot be at shift start/end.
    Each shift template's break_minutes must satisfy this rule.

H10. DAILY HOURS CAP (Taiwan §30+§32):
    - Regular work: max {dailyNormalCap} hours per day (8h standard, 10h for 變形工時)
    - Total including overtime: max 12 hours per day
    Working hour type for this store: {workingHourType}

H11. MONTHLY OVERTIME CAP (Taiwan §32-1):
    - Monthly OT must not exceed 46 hours (base limit)
    - With employer-employee agreement: max 54 hours (hard cap)
    - Current month accumulated OT per employee: {monthlyOtMap}
    - The AI must account for existing OT when assigning new shifts

H12. QUARTERLY OVERTIME CAP (Taiwan §32-1):
    - Rolling 3-month OT total must not exceed 138 hours
    - Current 3-month accumulated OT per employee: {threeMonthOtMap}

H13. SKILL/CERTIFICATION MATCH:
    - If a shift template has required_skills, only assign employees who have ALL required skills
    - Employee skills: {employeeSkillsMap}
    - Shift template required skills: {templateSkillsMap}

=== HOURS CALCULATION RULE ===
WORK HOURS = (end_time − start_time) − break_minutes
This is the number that counts toward max_hours_per_week, overtime, and payroll.
Example: 09:00–18:00 with 60 min break = 9h shift − 1h break = 8h WORK hours.

=== SOFT CONSTRAINTS (optimize for, in priority order) ===

S1. STAFF COVERAGE:
    - Schedule ≥ {minStaffPerDay} employees every operating day
    - Schedule ≥ 1 employee with a position (senior/experienced) per day when possible
    - Do NOT schedule anyone on closed days: {closedDays}

S2. EMPLOYEE PREFERENCES:
    - Prefer scheduling employees on their "preferred" (⭐) days over merely "available" (✅) days
    - Match employee position to shift role when applicable
    - Match employee skills to shift template required_skills (H13 is hard; S2 optimizes for best match)
    - Full-time employees get priority for hours up to their max
    - Part-time employees fill remaining gaps

S3. SCHEDULE CONSISTENCY:
    - If previous_week_assignments are provided, try to keep ~70% of the pattern stable
      (same employee on same day-of-week with similar shift)
    - If historical_assignments (8 weeks) are provided, learn recurring patterns:
      * Which employees typically work which days of the week
      * Common shift assignment patterns per employee
      * Use these patterns as a baseline when no previous week data exists
    - Rotate weekend workers for fairness — if someone worked both Sat+Sun last week,
      try to give them at least one weekend day off this week
    - Use historical weekend count to ensure long-term fairness (not just week-to-week)

S4. FAIRNESS:
    - Distribute hours fairly across employees of the same type (full-time vs part-time)
    - Full-time employees get priority for hours
    - Part-time employees fill remaining gaps

S5. MINIMIZE OVERTIME:
    - Prefer spreading hours across more employees rather than concentrating and creating overtime
    - Be especially conservative when an employee is already near their monthly OT cap (H11/H12)

S6. USER INSTRUCTIONS:
    - Honor the manager's natural language instructions when they don't conflict with higher-priority constraints
    {userInstructions}

S7. LABOR BUDGET:
    - If a labor_budget is provided, try to keep estimated total cost ≤ budget
    - Estimated cost = total_work_hours × hourly_rate (default NT$196)
    - Budget is a soft target; staffing coverage (S1) takes priority over budget
    - Warn if projected cost exceeds budget or approaches threshold (90%)
    Budget: {laborBudget or "No budget set"}
    Hourly rate: {hourlyRate or 196}

S8. DEMAND-BASED STAFFING:
    - If demand_forecasts are provided, adjust daily staffing to match predicted demand
    - Each forecast includes: date, recommended_staff, confidence (0-1), reason
    - Higher confidence → weight the recommendation more heavily
    - Override min_staff_per_day with recommended_staff when forecast confidence > 0.7
    Forecasts: {demandForecasts or "No forecasts available"}

=== EMPLOYEE DATA ===
{employeesJSON}

=== SHIFT TEMPLATES ===
{templatesJSON}

=== AVAILABILITY MATRIX (day_of_week: 1=Mon, 2=Tue, ..., 0=Sun) ===
{availabilityMatrix}

=== LEAVE DATES THIS WEEK ===
{leaveDates}

=== STORE OPERATING HOURS ===
{operatingHours}

=== EMPLOYEE SKILLS ===
{employeeSkillsJSON or "No skill data available."}

=== SHIFT TEMPLATE REQUIRED SKILLS ===
{templateSkillsJSON or "No skill requirements on templates."}

=== PREVIOUS WEEK ASSIGNMENTS (for consistency) ===
{previousWeekJSON or "No previous week data available."}

=== HISTORICAL ASSIGNMENTS (8 weeks, for pattern learning) ===
{historicalSummaryJSON or "No historical data available."}
Note: This is a summary of assignment patterns over the past 8 weeks.
Use it to identify recurring patterns (e.g., "Employee A usually works Mon/Wed/Fri").

=== MONTHLY OVERTIME CONTEXT ===
{monthlyOtJSON or "No OT tracking data available."}

=== DEMAND FORECASTS ===
{demandForecastsJSON or "No demand forecasts available."}

=== LABOR BUDGET ===
{laborBudgetJSON or "No budget constraint."}

=== TARGET WEEK ===
Dates: {weekDates[0]} (Mon) to {weekDates[6]} (Sun)

=== OUTPUT FORMAT ===
Return ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "assignments": [
    {
      "user_id": "uuid-string",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "break_minutes": 60,
      "position": "string or null",
      "is_overtime": false,
      "overtime_hours": 0
    }
  ],
  "notes": "Bilingual summary: 中文說明\nEnglish explanation"
}
```

---

## Validation Function

```typescript
interface ValidationResult {
  valid: boolean;
  violations: Violation[];
  warnings: Warning[];
}

interface Violation {
  employee_id: string;
  employee_name: string;
  type: string;
  message: string;
  severity: 'error';
}

interface Warning {
  type: string;
  date?: string;
  employee_id?: string;
  employee_name?: string;
  message: string;
  severity: 'warning';
}

function validateSchedule(
  assignments: Assignment[],
  employees: Employee[],
  leaveMap: Record<string, Set<string>>,
  availMap: Record<string, Record<number, string>>,
  operatingDays: string[],
  closedDays: string[],
  minStaffPerDay: number,
  shiftTemplates: ShiftTemplate[],
  options?: {
    workingHourType?: 'standard' | '2week' | '4week' | '8week';
    employeeSkills?: Record<string, string[]>;
    otContext?: { monthly: Record<string, number>; threeMonth: Record<string, number> };
    laborBudget?: number;
    hourlyRate?: number;
    budgetAlertThreshold?: number;
    demandForecasts?: { date: string; recommended_staff: number; confidence: number }[];
  }
): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const templateTimes = new Set(
    shiftTemplates.map(t => `${t.start_time}-${t.end_time}-${t.break_minutes}`)
  );
  const templateMap = Object.fromEntries(shiftTemplates.map(t => [t.id, t]));

  // Variable working hours — daily normal cap
  const whType = options?.workingHourType || 'standard';
  const dailyNormalCap = (whType === '2week' || whType === '4week') ? 10 : 8;
  const empSkills = options?.employeeSkills || {};
  const otCtx = options?.otContext;

  // Group assignments by user
  const byUser: Record<string, Assignment[]> = {};
  for (const a of assignments) {
    if (!byUser[a.user_id]) byUser[a.user_id] = [];
    byUser[a.user_id].push(a);
  }

  // === ASSIGNMENT-LEVEL CHECKS ===
  for (const a of assignments) {
    const emp = empMap[a.user_id];

    // Validate user_id exists
    if (!emp) {
      violations.push({
        employee_id: a.user_id, employee_name: 'UNKNOWN',
        type: 'invalid_employee', severity: 'error',
        message: `Unknown employee ID: ${a.user_id}`
      });
      continue;
    }

    // H1: Leave conflict
    if (leaveMap[a.user_id]?.has(a.date)) {
      violations.push({
        employee_id: a.user_id, employee_name: emp.name,
        type: 'leave_conflict', severity: 'error',
        message: `${emp.name}: ${a.date} 已請假 / scheduled on leave day`
      });
    }

    // H2: Unavailable day
    const dow = new Date(a.date + 'T00:00:00').getDay(); // 0=Sun
    if (availMap[a.user_id]?.[dow] === 'unavailable') {
      violations.push({
        employee_id: a.user_id, employee_name: emp.name,
        type: 'unavailable_conflict', severity: 'error',
        message: `${emp.name}: ${a.date} 標記為不可上班 / scheduled on unavailable day`
      });
    }

    // H6: Shift template validation
    const key = `${a.start_time}-${a.end_time}-${a.break_minutes}`;
    if (!templateTimes.has(key)) {
      violations.push({
        employee_id: a.user_id, employee_name: emp.name,
        type: 'invalid_shift', severity: 'error',
        message: `${emp.name}: ${a.date} 班次 ${a.start_time}-${a.end_time} 不在班別模板中 / shift not in templates`
      });
    }

    // Closed day check
    if (closedDays.includes(a.date)) {
      violations.push({
        employee_id: a.user_id, employee_name: emp.name,
        type: 'closed_day', severity: 'error',
        message: `${emp.name}: ${a.date} 門市休息日 / store closed`
      });
    }

    // H9: Break time compliance (§35)
    const [ash, asm] = a.start_time.split(':').map(Number);
    const [aeh, aem] = a.end_time.split(':').map(Number);
    const shiftMinutes = (aeh * 60 + aem) - (ash * 60 + asm);
    const requiredBreak = shiftMinutes <= 240 ? 0 : shiftMinutes <= 480 ? 30 : 60;
    if (a.break_minutes < requiredBreak) {
      violations.push({
        employee_id: a.user_id, employee_name: emp.name,
        type: 'insufficient_break', severity: 'error',
        message: `${emp.name}: ${a.date} 休息 ${a.break_minutes}分 不足法定 ${requiredBreak}分 (§35) / break ${a.break_minutes}min < required ${requiredBreak}min`
      });
    }

    // H10: Daily hours cap (§30+§32), uses dailyNormalCap for 變形工時
    const dailyWorkMinutes = shiftMinutes - a.break_minutes;
    const dailyWorkHours = dailyWorkMinutes / 60;
    if (dailyWorkHours > 12) {
      violations.push({
        employee_id: a.user_id, employee_name: emp.name,
        type: 'daily_hours_exceeded', severity: 'error',
        message: `${emp.name}: ${a.date} 工時 ${dailyWorkHours.toFixed(1)}h 超過每日上限12h (§30+§32) / daily ${dailyWorkHours.toFixed(1)}h > 12h cap`
      });
    } else if (dailyWorkHours > dailyNormalCap) {
      warnings.push({
        type: 'daily_overtime', date: a.date,
        employee_id: a.user_id, employee_name: emp.name,
        severity: 'warning',
        message: `${emp.name}: ${a.date} 工時 ${dailyWorkHours.toFixed(1)}h (超過${dailyNormalCap}h正常工時，${(dailyWorkHours - dailyNormalCap).toFixed(1)}h為加班) / ${(dailyWorkHours - dailyNormalCap).toFixed(1)}h daily overtime`
      });
    }

    // H13: Skill/certification match
    if (a.shift_template_id) {
      const tmpl = templateMap[a.shift_template_id];
      if (tmpl?.required_skills && tmpl.required_skills.length > 0) {
        const skills = empSkills[a.user_id] || [];
        const missing = tmpl.required_skills.filter(s => !skills.includes(s));
        if (missing.length > 0) {
          violations.push({
            employee_id: a.user_id, employee_name: emp.name,
            type: 'skill_mismatch', severity: 'error',
            message: `${emp.name}: ${a.date} 缺少技能 ${missing.join(', ')} / missing skills: ${missing.join(', ')}`
          });
        }
      }
    }
  }

  // === PER-EMPLOYEE CHECKS ===
  for (const [userId, userAssignments] of Object.entries(byUser)) {
    const emp = empMap[userId];
    if (!emp) continue;

    const sorted = [...userAssignments].sort((a, b) => a.date.localeCompare(b.date));

    // Calculate total hours
    let totalHours = 0;
    for (const a of sorted) {
      const [sh, sm] = a.start_time.split(':').map(Number);
      const [eh, em] = a.end_time.split(':').map(Number);
      const workMinutes = (eh * 60 + em) - (sh * 60 + sm) - a.break_minutes;
      totalHours += workMinutes / 60;
    }

    // H3: Max hours exceeded
    if (totalHours > emp.max_hours_per_week) {
      violations.push({
        employee_id: userId, employee_name: emp.name,
        type: 'max_hours_exceeded', severity: 'error',
        message: `${emp.name}: ${totalHours.toFixed(1)}h 超過上限 ${emp.max_hours_per_week}h / exceeds max hours`
      });
    }

    // H7: Part-time strict ceiling
    if (emp.employee_type === 'part-time' && totalHours > emp.max_hours_per_week) {
      violations.push({
        employee_id: userId, employee_name: emp.name,
        type: 'part_time_exceeded', severity: 'error',
        message: `${emp.name}: 兼職工時 ${totalHours.toFixed(1)}h 超過上限 ${emp.max_hours_per_week}h / part-time ceiling exceeded`
      });
    }

    // H8: Full-time floor (warning only)
    const minHours = emp.max_hours_per_week * 0.8;
    if (emp.employee_type === 'full-time' && totalHours < minHours) {
      warnings.push({
        type: 'underutilized', employee_id: userId, employee_name: emp.name,
        severity: 'warning',
        message: `${emp.name}: 全職工時 ${totalHours.toFixed(1)}h 低於建議 ${minHours}h / full-time under 80%`
      });
    }

    // Overtime warning
    const standardHours = emp.employee_type === 'full-time' ? 40 : emp.max_hours_per_week;
    if (totalHours > standardHours) {
      warnings.push({
        type: 'overtime', employee_id: userId, employee_name: emp.name,
        severity: 'warning',
        message: `${emp.name}: ${(totalHours - standardHours).toFixed(1)}h 加班 / overtime`
      });
    }

    // H11 + H12: Monthly & Quarterly OT caps (§32-1)
    if (otCtx) {
      const weeklyOt = totalHours > standardHours ? totalHours - standardHours : 0;
      const monthlyTotal = (otCtx.monthly[userId] || 0) + weeklyOt;
      const threeMonthTotal = (otCtx.threeMonth[userId] || 0) + weeklyOt;

      if (monthlyTotal > 54) {
        violations.push({
          employee_id: userId, employee_name: emp.name,
          type: 'monthly_ot_hard_cap', severity: 'error',
          message: `${emp.name}: 月加班 ${monthlyTotal.toFixed(1)}h 超過絕對上限 54h (§32-1) / monthly OT ${monthlyTotal.toFixed(1)}h > 54h hard cap`
        });
      } else if (monthlyTotal > 46) {
        violations.push({
          employee_id: userId, employee_name: emp.name,
          type: 'monthly_ot_exceeded', severity: 'error',
          message: `${emp.name}: 月加班 ${monthlyTotal.toFixed(1)}h 超過上限 46h (§32-1) / monthly OT ${monthlyTotal.toFixed(1)}h > 46h cap`
        });
      } else if (monthlyTotal > 38) {
        warnings.push({
          type: 'monthly_ot_approaching', employee_id: userId, employee_name: emp.name,
          severity: 'warning',
          message: `${emp.name}: 月加班 ${monthlyTotal.toFixed(1)}h 接近上限 46h / monthly OT approaching 46h`
        });
      }

      if (threeMonthTotal > 138) {
        violations.push({
          employee_id: userId, employee_name: emp.name,
          type: 'quarterly_ot_exceeded', severity: 'error',
          message: `${emp.name}: 三個月加班 ${threeMonthTotal.toFixed(1)}h 超過上限 138h (§32-1) / 3-month OT > 138h`
        });
      }
    }

    // H4: 七休一 (consecutive days)
    let consecutive = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].date + 'T00:00:00');
      const curr = new Date(sorted[i].date + 'T00:00:00');
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        consecutive++;
        if (consecutive >= 7) {
          violations.push({
            employee_id: userId, employee_name: emp.name,
            type: 'consecutive_days', severity: 'error',
            message: `${emp.name}: ${consecutive} 天連續上班 (七休一違規) / ${consecutive} consecutive days`
          });
        }
      } else {
        consecutive = 1;
      }
    }

    // H5: 11-hour rest interval
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevEnd = new Date(`${prev.date}T${prev.end_time}`);
      const currStart = new Date(`${curr.date}T${curr.start_time}`);
      const restHours = (currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);
      if (restHours >= 0 && restHours < 11) {
        violations.push({
          employee_id: userId, employee_name: emp.name,
          type: 'short_rest', severity: 'error',
          message: `${emp.name}: ${prev.date}→${curr.date} 休息 ${restHours.toFixed(1)}h (需≥11h) / rest ${restHours.toFixed(1)}h < 11h`
        });
      }
    }
  }

  // === PER-DAY COVERAGE CHECKS ===
  for (const date of operatingDays) {
    const dailyStaff = assignments.filter(a => a.date === date);

    // S1: Minimum staff
    if (dailyStaff.length < minStaffPerDay) {
      warnings.push({
        type: 'understaffed', date, severity: 'warning',
        message: `${date}: ${dailyStaff.length}人值班 (需至少${minStaffPerDay}人) / ${dailyStaff.length} staff (need ${minStaffPerDay})`
      });
    }

    // S1: Senior coverage
    const hasSenior = dailyStaff.some(a => empMap[a.user_id]?.position);
    if (!hasSenior && employees.some(e => e.position)) {
      warnings.push({
        type: 'no_senior', date, severity: 'warning',
        message: `${date}: 無資深員工值班 / no senior staff`
      });
    }

    // S8: Demand-based staffing
    if (options?.demandForecasts) {
      const forecast = options.demandForecasts.find(f => f.date === date);
      if (forecast && forecast.confidence > 0.7 && dailyStaff.length < forecast.recommended_staff) {
        warnings.push({
          type: 'demand_understaffed', date, severity: 'warning',
          message: `${date}: ${dailyStaff.length}人值班，需求預測建議${forecast.recommended_staff}人 / ${dailyStaff.length} staff vs ${forecast.recommended_staff} recommended`
        });
      }
    }
  }

  // === BUDGET CHECK (S7) ===
  if (options?.laborBudget) {
    const rate = options.hourlyRate || 196;
    let totalH = 0;
    for (const a of assignments) {
      const [sh, sm] = a.start_time.split(':').map(Number);
      const [eh, em] = a.end_time.split(':').map(Number);
      totalH += ((eh * 60 + em) - (sh * 60 + sm) - a.break_minutes) / 60;
    }
    const cost = totalH * rate;
    const threshold = options.budgetAlertThreshold || 0.90;
    if (cost > options.laborBudget) {
      warnings.push({
        type: 'budget_exceeded', severity: 'warning',
        message: `人力成本 NT$${Math.round(cost).toLocaleString()} 超過預算 NT$${Math.round(options.laborBudget).toLocaleString()} / labor cost exceeds budget`
      });
    } else if (cost > options.laborBudget * threshold) {
      warnings.push({
        type: 'budget_approaching', severity: 'warning',
        message: `人力成本 NT$${Math.round(cost).toLocaleString()} 接近預算 (${Math.round(cost / options.laborBudget * 100)}%) / labor cost approaching budget`
      });
    }
  }

  return { valid: violations.length === 0, violations, warnings };
}
```

---

## Scoring Functions

### Preference Score (0.0–1.0)

```typescript
function calcPreferenceScore(
  assignments: Assignment[],
  availMap: Record<string, Record<number, string>>
): number {
  let total = 0;
  let score = 0;
  for (const a of assignments) {
    const dow = new Date(a.date + 'T00:00:00').getDay();
    const pref = availMap[a.user_id]?.[dow] || 'available';
    total++;
    if (pref === 'preferred') score += 1.0;
    else if (pref === 'available') score += 0.5;
    // unavailable = 0, should not happen
  }
  return total > 0 ? score / total : 0;
}
```

### Consistency Score (0.0–1.0)

```typescript
function calcConsistencyScore(
  assignments: Assignment[],
  previousWeek: PrevAssignment[] | null
): number {
  if (!previousWeek || previousWeek.length === 0) return 0;

  // Build prev-week map: user_id+dow → shift_template_id
  const prevMap = new Map<string, string>();
  for (const p of previousWeek) {
    const dow = new Date(p.date + 'T00:00:00').getDay();
    prevMap.set(`${p.user_id}-${dow}`, p.shift_template_id || `${p.start_time}-${p.end_time}`);
  }

  let matches = 0;
  for (const a of assignments) {
    const dow = new Date(a.date + 'T00:00:00').getDay();
    const key = `${a.user_id}-${dow}`;
    const prevShift = prevMap.get(key);
    if (prevShift) {
      const currShift = a.shift_template_id || `${a.start_time}-${a.end_time}`;
      if (currShift === prevShift) matches++;
    }
  }

  return assignments.length > 0 ? matches / assignments.length : 0;
}
```

---

## Decision Priority Hierarchy

When constraints conflict, resolve in this strict order:

```
1. LABOR LAW (absolute)         — 七休一 §36, 11h rest §34, break time §35, daily cap §30+§32,
                                   monthly OT §32-1 (46h/54h), quarterly OT (138h), 變形工時 §30-1
2. HARD BLOCKS (absolute)       — leave days, unavailable days, closed days
3. SKILL/CERT MATCH (absolute)  — employee must have all required_skills for assigned shift template
4. HOURS COMPLIANCE (absolute)  — part-time ceiling (never exceed), full-time floor (warn if under 80%)
                                   work hours = shift − break (not raw shift duration)
5. STAFF COVERAGE (high)        — min employees per day, demand forecast override when confidence > 0.7
6. EMPLOYEE PREFERENCE (medium) — preferred days, position matching, skill affinity
7. SCHEDULE CONSISTENCY (medium) — pattern continuity with prev week + historical 8-week patterns
8. BUDGET AWARENESS (medium)    — keep labor cost within budget (soft target)
9. FAIRNESS ROTATION (low)      — weekend rotation, hour balancing, long-term fairness via historical data
10. USER INSTRUCTIONS (low)     — natural language criteria (best effort)
```

---

## Edge Cases

| Case | Handling |
|------|----------|
| Empty employees array | Return error: "此門市尚無員工" |
| No shift templates | Return error: "請先在門市設定中新增班別" |
| All employees on leave for a day | 0 assignments for that day + understaffed warning |
| Store closed on a day | Skip entirely — no assignments |
| No previous week schedule | consistency_score = 0, skip consistency prompt section |
| LLM returns malformed JSON | Retry once; if still bad, return error |
| LLM hallucinates employee IDs | Filter out assignments with unknown user_ids before validation |
| LLM invents shift times | Caught by H6 validation → triggers retry |
| User instruction contradicts labor law | Labor law wins; explain in notes |
| Employee with 0 max_hours_per_week | Skip employee, note in response |
| All employees part-time | Distribute proportionally; warn if total coverage insufficient |
| Employee near monthly OT cap (>38h) | Reduce assignments to stay within 46h; note in warnings |
| Employee at 54h monthly OT hard cap | Do NOT assign any overtime shifts; hard violation |
| 3-month OT approaching 138h | Reduce this month's OT; warning at 120h, error at 138h |
| Store uses 變形工時 (2week/4week) | Daily normal cap = 10h (not 8h); hours 8-10h are NOT overtime |
| Shift requires skills employee lacks | Hard violation (H13); reassign to qualified employee |
| No employees have required skill | Assign anyway with warning; coverage > skill match |
| Labor budget exceeded | Warning only; coverage takes priority over budget |
| Demand forecast says 5 staff but only 3 available | Schedule all 3 + demand_understaffed warning |
| No historical data (new store) | Skip consistency/pattern logic; generate fresh schedule |
| Employee skills data unavailable | Skip H13 checks; treat all employees as qualified |
