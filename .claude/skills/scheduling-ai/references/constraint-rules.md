# Constraint Rules Reference

## Table of Contents
1. [Taiwan Labor Law — Hours & Break Rules](#taiwan-labor-law)
2. [Work Hours Calculation](#work-hours-calculation)
3. [System Prompt Template](#system-prompt-template)
4. [Validation Function](#validation-function)
5. [Scoring Functions](#scoring-functions)
6. [Decision Priority Hierarchy](#decision-priority-hierarchy)
7. [Edge Cases](#edge-cases)

---

## Taiwan Labor Law — Hours & Break Rules

All scheduling logic is governed by the Taiwan Labor Standards Act (勞基法).

### §30 — Maximum Working Hours

| Rule | Limit |
|------|-------|
| Regular work per day | **8 hours** |
| Total per day (incl. overtime) | **12 hours** |
| Regular work per week | **40 hours** |
| Monthly overtime cap | **46 hours** |

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
function validateDailyHours(start_time: string, end_time: string, break_minutes: number) {
  const [sh, sm] = start_time.split(':').map(Number);
  const [eh, em] = end_time.split(':').map(Number);
  const shiftMinutes = (eh * 60 + em) - (sh * 60 + sm);
  const workMinutes = shiftMinutes - break_minutes;
  const workHours = workMinutes / 60;
  return {
    workHours,
    regularHours: Math.min(workHours, 8),           // first 8h = regular pay
    overtimeHours: Math.max(0, workHours - 8),      // beyond 8h = overtime
    exceedsDaily: workHours > 12,                    // §30+§32: absolute max 12h/day
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
    - Regular work: max 8 hours per day (work hours = shift duration − break)
    - Total including overtime: max 12 hours per day
    - Monthly overtime: max 46 hours

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
    - Full-time employees get priority for hours up to their max
    - Part-time employees fill remaining gaps

S3. SCHEDULE CONSISTENCY:
    - If previous_week_assignments are provided, try to keep ~70% of the pattern stable
      (same employee on same day-of-week with similar shift)
    - Rotate weekend workers for fairness — if someone worked both Sat+Sun last week,
      try to give them at least one weekend day off this week

S4. FAIRNESS:
    - Distribute hours fairly across employees of the same type (full-time vs part-time)
    - Full-time employees get priority for hours
    - Part-time employees fill remaining gaps

S5. MINIMIZE OVERTIME:
    - Prefer spreading hours across more employees rather than concentrating and creating overtime

S6. USER INSTRUCTIONS:
    - Honor the manager's natural language instructions when they don't conflict with higher-priority constraints
    {userInstructions}

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

=== PREVIOUS WEEK ASSIGNMENTS (for consistency) ===
{previousWeekJSON or "No previous week data available."}

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
  shiftTemplates: ShiftTemplate[]
): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const templateTimes = new Set(
    shiftTemplates.map(t => `${t.start_time}-${t.end_time}-${t.break_minutes}`)
  );

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

    // H10: Daily hours cap (§30+§32)
    const dailyWorkMinutes = shiftMinutes - a.break_minutes;
    const dailyWorkHours = dailyWorkMinutes / 60;
    if (dailyWorkHours > 12) {
      violations.push({
        employee_id: a.user_id, employee_name: emp.name,
        type: 'daily_hours_exceeded', severity: 'error',
        message: `${emp.name}: ${a.date} 工時 ${dailyWorkHours.toFixed(1)}h 超過每日上限12h (§30+§32) / daily ${dailyWorkHours.toFixed(1)}h > 12h cap`
      });
    } else if (dailyWorkHours > 8) {
      warnings.push({
        type: 'daily_overtime', date: a.date,
        employee_id: a.user_id, employee_name: emp.name,
        severity: 'warning',
        message: `${emp.name}: ${a.date} 工時 ${dailyWorkHours.toFixed(1)}h (超過8h正常工時，${(dailyWorkHours - 8).toFixed(1)}h為加班) / ${(dailyWorkHours - 8).toFixed(1)}h daily overtime`
      });
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
1. LABOR LAW (absolute)        — 七休一 §36, 11h rest §34, break time §35, daily cap §30+§32
2. HARD BLOCKS (absolute)      — leave days, unavailable days, closed days
3. HOURS COMPLIANCE (absolute) — part-time ceiling (never exceed), full-time floor (warn if under 80%)
                                  work hours = shift − break (not raw shift duration)
4. STAFF COVERAGE (high)       — min employees per day
5. EMPLOYEE PREFERENCE (medium) — preferred days, position matching
6. SCHEDULE CONSISTENCY (medium) — pattern continuity with prev week
7. FAIRNESS ROTATION (low)     — weekend rotation, hour balancing
8. USER INSTRUCTIONS (low)     — natural language criteria (best effort)
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
