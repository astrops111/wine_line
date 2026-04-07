import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logLLMUsage, extractTokensOpenAI } from "../_shared/llm-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Employee {
  id: string; name: string; position: string | null;
  employee_type: string; max_hours_per_week: number;
  can_open?: boolean; can_close?: boolean;
}
interface ShiftTemplate {
  id: string; name: string; start_time: string; end_time: string;
  break_minutes: number; color: string; required_skills?: string[];
  staffing_needs?: { skill: string; count: number }[];
}
interface Availability { user_id: string; day_of_week: number; availability: string; }
interface LeaveRequest { user_id: string; start_date: string; end_date: string; }
interface PrevAssignment {
  user_id: string; date: string; start_time: string;
  end_time: string; shift_template_id: string | null;
}
interface Assignment {
  user_id: string; date: string; start_time: string; end_time: string;
  break_minutes: number; position: string | null;
  is_overtime: boolean; overtime_hours: number;
  shift_template_id?: string | null;
}
interface Violation {
  employee_id: string; employee_name: string;
  type: string; message: string; severity: 'error';
}
interface Warning {
  type: string; date?: string; employee_id?: string;
  employee_name?: string; message: string; severity: 'warning';
}
interface DemandForecast {
  date: string; recommended_staff: number; confidence: number; reason?: string;
}
interface ValidationOptions {
  workingHourType?: 'standard' | '2week' | '4week' | '8week';
  employeeSkills?: Record<string, string[]>;
  otContext?: { monthly: Record<string, number>; threeMonth: Record<string, number> };
  laborBudget?: number;
  hourlyRate?: number;
  budgetAlertThreshold?: number;
  demandForecasts?: DemandForecast[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcWorkHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm) - breakMin) / 60;
}

function shiftMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function requiredBreak(shiftMin: number): number {
  if (shiftMin <= 240) return 0;
  if (shiftMin <= 480) return 30;
  if (shiftMin <= 720) return 60;
  return 90;
}

function getWeekDates(weekStart: string): string[] {
  const d = new Date(weekStart + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(d); dt.setDate(dt.getDate() + i);
    return dt.toISOString().split('T')[0];
  });
}

function buildLeaveMap(leaves: LeaveRequest[], weekDates: string[]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const l of leaves) {
    if (!map[l.user_id]) map[l.user_id] = new Set();
    for (const d of weekDates) {
      if (d >= l.start_date && d <= l.end_date) map[l.user_id].add(d);
    }
  }
  return map;
}

function buildAvailMap(avail: Availability[]): Record<string, Record<number, string>> {
  const map: Record<string, Record<number, string>> = {};
  for (const a of avail) {
    if (!map[a.user_id]) map[a.user_id] = {};
    map[a.user_id][a.day_of_week] = a.availability;
  }
  return map;
}

function getClosedDays(operatingHours: Record<string, any>, weekDates: string[]): string[] {
  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const closed: string[] = [];
  for (let i = 0; i < 7; i++) {
    const info = operatingHours?.[dayKeys[i]];
    if (info?.open === 'closed' || info === 'closed') closed.push(weekDates[i]);
  }
  return closed;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateSchedule(
  assignments: Assignment[], employees: Employee[],
  leaveMap: Record<string, Set<string>>, availMap: Record<string, Record<number, string>>,
  operatingDays: string[], closedDays: string[], minStaff: number,
  templates: ShiftTemplate[], options?: ValidationOptions
): { valid: boolean; violations: Violation[]; warnings: Warning[] } {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const templateKeys = new Set(templates.map(t => `${t.start_time}-${t.end_time}-${t.break_minutes}`));
  const templateMap = Object.fromEntries(templates.map(t => [t.id, t]));

  // Variable working hours — daily normal cap
  const whType = options?.workingHourType || 'standard';
  const dailyNormalCap = (whType === '2week' || whType === '4week') ? 10 : 8;
  const empSkills = options?.employeeSkills || {};
  const otCtx = options?.otContext;

  const byUser: Record<string, Assignment[]> = {};
  for (const a of assignments) {
    if (!byUser[a.user_id]) byUser[a.user_id] = [];
    byUser[a.user_id].push(a);
  }

  // === Per-assignment checks ===
  for (const a of assignments) {
    const emp = empMap[a.user_id];
    if (!emp) {
      violations.push({ employee_id: a.user_id, employee_name: 'UNKNOWN', type: 'invalid_employee', severity: 'error',
        message: `Unknown employee ID: ${a.user_id}` });
      continue;
    }
    // H1: Leave
    if (leaveMap[a.user_id]?.has(a.date)) {
      violations.push({ employee_id: a.user_id, employee_name: emp.name, type: 'leave_conflict', severity: 'error',
        message: `${emp.name}: ${a.date} 已請假 / scheduled on leave day` });
    }
    // H2: Unavailable
    const dow = new Date(a.date + 'T00:00:00').getDay();
    if (availMap[a.user_id]?.[dow] === 'unavailable') {
      violations.push({ employee_id: a.user_id, employee_name: emp.name, type: 'unavailable_conflict', severity: 'error',
        message: `${emp.name}: ${a.date} 標記為不可上班 / scheduled on unavailable day` });
    }
    // H6: Template match
    const key = `${a.start_time}-${a.end_time}-${a.break_minutes}`;
    if (!templateKeys.has(key)) {
      violations.push({ employee_id: a.user_id, employee_name: emp.name, type: 'invalid_shift', severity: 'error',
        message: `${emp.name}: ${a.date} 班次 ${a.start_time}-${a.end_time} 不在班別模板中 / shift not in templates` });
    }
    // Closed day
    if (closedDays.includes(a.date)) {
      violations.push({ employee_id: a.user_id, employee_name: emp.name, type: 'closed_day', severity: 'error',
        message: `${emp.name}: ${a.date} 門市休息日 / store closed` });
    }
    // H9: Break compliance (§35)
    const sMins = shiftMinutes(a.start_time, a.end_time);
    const reqBreak = requiredBreak(sMins);
    if (a.break_minutes < reqBreak) {
      violations.push({ employee_id: a.user_id, employee_name: emp.name, type: 'insufficient_break', severity: 'error',
        message: `${emp.name}: ${a.date} 休息 ${a.break_minutes}分 不足法定 ${reqBreak}分 (§35) / break ${a.break_minutes}min < required ${reqBreak}min` });
    }
    // H10: Daily hours cap — uses dailyNormalCap for 變形工時
    const dailyWork = calcWorkHours(a.start_time, a.end_time, a.break_minutes);
    if (dailyWork > 12) {
      violations.push({ employee_id: a.user_id, employee_name: emp.name, type: 'daily_hours_exceeded', severity: 'error',
        message: `${emp.name}: ${a.date} 工時 ${dailyWork.toFixed(1)}h 超過每日上限12h (§30+§32)` });
    } else if (dailyWork > dailyNormalCap) {
      warnings.push({ type: 'daily_overtime', date: a.date, employee_id: a.user_id, employee_name: emp.name, severity: 'warning',
        message: `${emp.name}: ${a.date} 工時 ${dailyWork.toFixed(1)}h (超過${dailyNormalCap}h正常工時，${(dailyWork - dailyNormalCap).toFixed(1)}h為加班)` });
    }
    // H13: Skill/certification match
    if (a.shift_template_id) {
      const tmpl = templateMap[a.shift_template_id];
      if (tmpl?.required_skills && tmpl.required_skills.length > 0) {
        const skills = empSkills[a.user_id] || [];
        const missing = tmpl.required_skills.filter(s => !skills.includes(s));
        if (missing.length > 0) {
          violations.push({ employee_id: a.user_id, employee_name: emp.name, type: 'skill_mismatch', severity: 'error',
            message: `${emp.name}: ${a.date} 缺少技能 ${missing.join(', ')} / missing skills: ${missing.join(', ')}` });
        }
      }
    }
  }

  // === Per-employee checks ===
  for (const [userId, userA] of Object.entries(byUser)) {
    const emp = empMap[userId];
    if (!emp) continue;
    const sorted = [...userA].sort((a, b) => a.date.localeCompare(b.date));

    // Total work hours (break deducted)
    let totalHours = 0;
    for (const a of sorted) totalHours += calcWorkHours(a.start_time, a.end_time, a.break_minutes);

    // H3 + H7: Max hours / part-time ceiling
    if (totalHours > emp.max_hours_per_week) {
      const label = emp.employee_type === 'part-time' ? '兼職' : '';
      violations.push({ employee_id: userId, employee_name: emp.name,
        type: emp.employee_type === 'part-time' ? 'part_time_exceeded' : 'max_hours_exceeded', severity: 'error',
        message: `${emp.name}: ${label}工時 ${totalHours.toFixed(1)}h 超過上限 ${emp.max_hours_per_week}h` });
    }

    // H8: Full-time floor (warning)
    const minHrs = emp.max_hours_per_week * 0.8;
    if (emp.employee_type === 'full-time' && totalHours < minHrs) {
      warnings.push({ type: 'underutilized', employee_id: userId, employee_name: emp.name, severity: 'warning',
        message: `${emp.name}: 全職工時 ${totalHours.toFixed(1)}h 低於建議 ${minHrs}h (80%)` });
    }

    // Overtime warning
    const stdHrs = emp.employee_type === 'full-time' ? 40 : emp.max_hours_per_week;
    if (totalHours > stdHrs) {
      warnings.push({ type: 'overtime', employee_id: userId, employee_name: emp.name, severity: 'warning',
        message: `${emp.name}: ${(totalHours - stdHrs).toFixed(1)}h 加班 / overtime` });
    }

    // H11 + H12: Monthly & Quarterly OT caps (§32-1)
    if (otCtx) {
      const weeklyOt = totalHours > stdHrs ? totalHours - stdHrs : 0;
      const monthlyTotal = (otCtx.monthly[userId] || 0) + weeklyOt;
      const threeMonthTotal = (otCtx.threeMonth[userId] || 0) + weeklyOt;

      if (monthlyTotal > 54) {
        violations.push({ employee_id: userId, employee_name: emp.name, type: 'monthly_ot_hard_cap', severity: 'error',
          message: `${emp.name}: 月加班 ${monthlyTotal.toFixed(1)}h 超過絕對上限 54h (§32-1) / monthly OT > 54h hard cap` });
      } else if (monthlyTotal > 46) {
        violations.push({ employee_id: userId, employee_name: emp.name, type: 'monthly_ot_exceeded', severity: 'error',
          message: `${emp.name}: 月加班 ${monthlyTotal.toFixed(1)}h 超過上限 46h (§32-1) / monthly OT > 46h cap` });
      } else if (monthlyTotal > 38) {
        warnings.push({ type: 'monthly_ot_approaching', employee_id: userId, employee_name: emp.name, severity: 'warning',
          message: `${emp.name}: 月加班 ${monthlyTotal.toFixed(1)}h 接近上限 46h / monthly OT approaching 46h` });
      }

      if (threeMonthTotal > 138) {
        violations.push({ employee_id: userId, employee_name: emp.name, type: 'quarterly_ot_exceeded', severity: 'error',
          message: `${emp.name}: 三個月加班 ${threeMonthTotal.toFixed(1)}h 超過上限 138h (§32-1) / 3-month OT > 138h` });
      }
    }

    // H4: 七休一
    let consec = 1;
    for (let i = 1; i < sorted.length; i++) {
      const diff = (new Date(sorted[i].date + 'T00:00:00').getTime() - new Date(sorted[i - 1].date + 'T00:00:00').getTime()) / 86400000;
      if (diff === 1) { consec++; if (consec >= 7) {
        violations.push({ employee_id: userId, employee_name: emp.name, type: 'consecutive_days', severity: 'error',
          message: `${emp.name}: ${consec} 天連續上班 (七休一違規) / ${consec} consecutive days` });
      }} else { consec = 1; }
    }

    // H5: 11h rest interval
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = new Date(`${sorted[i - 1].date}T${sorted[i - 1].end_time}`);
      const currStart = new Date(`${sorted[i].date}T${sorted[i].start_time}`);
      const rest = (currStart.getTime() - prevEnd.getTime()) / 3600000;
      if (rest >= 0 && rest < 11) {
        violations.push({ employee_id: userId, employee_name: emp.name, type: 'short_rest', severity: 'error',
          message: `${emp.name}: ${sorted[i - 1].date}→${sorted[i].date} 休息 ${rest.toFixed(1)}h (需≥11h) / rest ${rest.toFixed(1)}h < 11h` });
      }
    }
  }

  // === Daily coverage checks (S1) ===
  for (const date of operatingDays) {
    const daily = assignments.filter(a => a.date === date);
    if (daily.length < minStaff) {
      warnings.push({ type: 'understaffed', date, severity: 'warning',
        message: `${date}: ${daily.length}人值班 (需至少${minStaff}人) / ${daily.length} staff (need ${minStaff})` });
    }
    const hasSenior = daily.some(a => empMap[a.user_id]?.position);
    if (!hasSenior && employees.some(e => e.position)) {
      warnings.push({ type: 'no_senior', date, severity: 'warning',
        message: `${date}: 無資深員工值班 / no senior staff` });
    }
    // S8: Demand-based staffing
    if (options?.demandForecasts) {
      const forecast = options.demandForecasts.find(f => f.date === date);
      if (forecast && forecast.confidence > 0.7 && daily.length < forecast.recommended_staff) {
        warnings.push({ type: 'demand_understaffed', date, severity: 'warning',
          message: `${date}: ${daily.length}人值班，需求預測建議${forecast.recommended_staff}人 / ${daily.length} staff vs ${forecast.recommended_staff} recommended` });
      }
    }
  }

  // === Budget check (S7) ===
  if (options?.laborBudget) {
    const rate = options.hourlyRate || 196;
    let totalH = 0;
    for (const a of assignments) totalH += calcWorkHours(a.start_time, a.end_time, a.break_minutes);
    const cost = totalH * rate;
    const threshold = options.budgetAlertThreshold || 0.90;
    if (cost > options.laborBudget) {
      warnings.push({ type: 'budget_exceeded', severity: 'warning',
        message: `人力成本 NT$${Math.round(cost).toLocaleString()} 超過預算 NT$${Math.round(options.laborBudget).toLocaleString()} / labor cost exceeds budget` });
    } else if (cost > options.laborBudget * threshold) {
      warnings.push({ type: 'budget_approaching', severity: 'warning',
        message: `人力成本 NT$${Math.round(cost).toLocaleString()} 接近預算 (${Math.round(cost / options.laborBudget * 100)}%) / labor cost approaching budget` });
    }
  }

  return { valid: violations.length === 0, violations, warnings };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function calcPreferenceScore(assignments: Assignment[], availMap: Record<string, Record<number, string>>): number {
  let total = 0, score = 0;
  for (const a of assignments) {
    const dow = new Date(a.date + 'T00:00:00').getDay();
    const pref = availMap[a.user_id]?.[dow] || 'available';
    total++;
    if (pref === 'preferred') score += 1.0;
    else if (pref === 'available') score += 0.5;
  }
  return total > 0 ? Math.round((score / total) * 100) / 100 : 0;
}

function calcConsistencyScore(assignments: Assignment[], prev: PrevAssignment[] | null): number {
  if (!prev || prev.length === 0) return 0;
  const prevMap = new Map<string, string>();
  for (const p of prev) {
    const dow = new Date(p.date + 'T00:00:00').getDay();
    prevMap.set(`${p.user_id}-${dow}`, p.shift_template_id || `${p.start_time}-${p.end_time}`);
  }
  let matches = 0;
  for (const a of assignments) {
    const dow = new Date(a.date + 'T00:00:00').getDay();
    const prevShift = prevMap.get(`${a.user_id}-${dow}`);
    if (prevShift && prevShift === `${a.start_time}-${a.end_time}`) matches++;
  }
  return assignments.length > 0 ? Math.round((matches / assignments.length) * 100) / 100 : 0;
}

// ─── LLM Prompt Builder ─────────────────────────────────────────────────────

function buildSystemPrompt(
  employees: Employee[], templates: ShiftTemplate[],
  leaveMap: Record<string, Set<string>>, availMap: Record<string, Record<number, string>>,
  operatingHours: Record<string, any>, prev: PrevAssignment[] | null,
  weekDates: string[], closedDays: string[], minStaff: number,
  promptOptions: {
    userInstructions?: string;
    historicalPatterns?: string;
    workingHourType?: string;
    dailyNormalCap?: number;
    employeeSkills?: Record<string, string[]>;
    otContext?: { monthly: Record<string, number>; threeMonth: Record<string, number> };
    demandForecasts?: DemandForecast[];
    laborBudget?: number;
    hourlyRate?: number;
    openCloseCapabilities?: Record<string, { can_open: boolean; can_close: boolean }>;
  }
): string {
  const {
    userInstructions, historicalPatterns, workingHourType = 'standard',
    dailyNormalCap = 8, employeeSkills, otContext, demandForecasts,
    laborBudget, hourlyRate = 196, openCloseCapabilities,
  } = promptOptions;

  // Format leave info
  const leaveInfo = Object.entries(leaveMap).map(([uid, dates]) => {
    const emp = employees.find(e => e.id === uid);
    return `${emp?.name || uid}: ${[...dates].join(', ')}`;
  }).join('\n    ') || 'None';

  // Format unavailable info
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const unavailInfo = Object.entries(availMap).map(([uid, dows]) => {
    const emp = employees.find(e => e.id === uid);
    const unavail = Object.entries(dows).filter(([, v]) => v === 'unavailable').map(([d]) => dowNames[Number(d)]);
    return unavail.length > 0 ? `${emp?.name || uid}: ${unavail.join(', ')}` : null;
  }).filter(Boolean).join('\n    ') || 'None';

  // Format availability matrix
  const availMatrix = employees.map(e => {
    const prefs = [1, 2, 3, 4, 5, 6, 0].map(dow => {
      const val = availMap[e.id]?.[dow] || 'available';
      return val === 'preferred' ? '⭐' : val === 'unavailable' ? '❌' : '✅';
    }).join(' ');
    return `${e.name} (${e.employee_type}, max ${e.max_hours_per_week}h): Mon${prefs}`;
  }).join('\n');

  // Format templates (include required skills and staffing needs)
  const tmplInfo = templates.map(t => {
    const work = calcWorkHours(t.start_time, t.end_time, t.break_minutes);
    const skills = t.required_skills?.length ? ` [requires: ${t.required_skills.join(', ')}]` : '';
    const needs = t.staffing_needs?.length
      ? ` [staffing: ${t.staffing_needs.map(n => `${n.skill}×${n.count}`).join(', ')}]`
      : '';
    return `${t.name} (id:${t.id}): ${t.start_time}-${t.end_time} (break ${t.break_minutes}min, work ${work.toFixed(1)}h)${skills}${needs}`;
  }).join('\n');

  // Format previous week
  const prevInfo = prev && prev.length > 0
    ? prev.map(p => {
        const emp = employees.find(e => e.id === p.user_id);
        return `${emp?.name || p.user_id}: ${p.date} ${p.start_time}-${p.end_time}`;
      }).join('\n')
    : 'No previous week data available.';

  // Format employee skills
  const skillsInfo = employeeSkills && Object.keys(employeeSkills).length > 0
    ? Object.entries(employeeSkills).map(([uid, skills]) => {
        const emp = employees.find(e => e.id === uid);
        return `${emp?.name || uid}: ${skills.join(', ')}`;
      }).join('\n')
    : 'No skill data available.';

  // Format open/close capabilities
  const openCloseInfo = openCloseCapabilities && Object.keys(openCloseCapabilities).length > 0
    ? (() => {
        const canOpen = Object.entries(openCloseCapabilities).filter(([, c]) => c.can_open).map(([uid]) => employees.find(e => e.id === uid)?.name || uid);
        const canClose = Object.entries(openCloseCapabilities).filter(([, c]) => c.can_close).map(([uid]) => employees.find(e => e.id === uid)?.name || uid);
        return `Can OPEN store: ${canOpen.length > 0 ? canOpen.join(', ') : 'None designated'}\nCan CLOSE store: ${canClose.length > 0 ? canClose.join(', ') : 'None designated'}`;
      })()
    : 'No open/close designations set.';

  // Format staffing needs summary
  const staffingNeedsInfo = templates.some(t => t.staffing_needs?.length)
    ? templates.filter(t => t.staffing_needs?.length).map(t =>
        `${t.name}: ${t.staffing_needs!.map(n => `${n.skill} ×${n.count}`).join(', ')}`
      ).join('\n')
    : 'No specific staffing requirements set.';

  // Format monthly OT context
  const otInfo = otCtx
    ? Object.entries(otCtx.monthly).map(([uid, hrs]) => {
        const emp = employees.find(e => e.id === uid);
        const threeM = otCtx.threeMonth[uid] || 0;
        return `${emp?.name || uid}: month=${hrs.toFixed(1)}h, 3-month=${threeM.toFixed(1)}h`;
      }).join('\n') || 'No OT data this period.'
    : 'No OT tracking data available.';

  // Format demand forecasts
  const forecastInfo = demandForecasts && demandForecasts.length > 0
    ? demandForecasts.map(f => `${f.date}: ${f.recommended_staff} staff (confidence ${(f.confidence * 100).toFixed(0)}%${f.reason ? ', ' + f.reason : ''})`).join('\n')
    : 'No demand forecasts available.';

  // Format budget
  const budgetInfo = laborBudget
    ? `Budget: NT$${Math.round(laborBudget).toLocaleString()}, Hourly rate: NT$${hourlyRate}`
    : 'No budget constraint.';

  return `You are an AI shift scheduler for a Taiwan retail store. Generate a weekly shift schedule as a JSON object.

=== HARD CONSTRAINTS (must NOT violate) ===

H1. LEAVE BLOCKS: Never schedule an employee on a leave day.
    Leave days:
    ${leaveInfo}

H2. UNAVAILABLE DAYS: Never schedule on a day marked "unavailable" (❌).
    Unavailability:
    ${unavailInfo}

H3. MAX HOURS: Never exceed an employee's max_hours_per_week. Work hours = shift duration − break time.

H4. 七休一 (Taiwan §36): Max 6 consecutive working days. At least 1 rest day per 7-day span.

H5. REST INTERVAL (Taiwan §34): Min 11 hours between end of one shift and start of next.

H6. SHIFT TEMPLATES ONLY: Only use these exact shift templates:
${tmplInfo}
Do NOT invent shift times. Use start_time, end_time, and break_minutes exactly as listed.
When assigning, include the shift_template_id so we can validate skill requirements.

H7. PART-TIME CEILING: Part-time employees' total weekly WORK hours must NOT exceed max_hours_per_week.

H8. FULL-TIME FLOOR: Full-time employees should be scheduled ≥ 80% of max_hours_per_week.

H9. MANDATORY BREAK (§35): Break must meet legal minimum:
    - Shift ≤ 4h: 0 min break
    - Shift > 4h: ≥ 30 min break
    - Shift > 8h: ≥ 60 min break

H10. DAILY HOURS CAP (§30+§32):
    - Regular work: max ${dailyNormalCap}h/day (${workingHourType === 'standard' ? '標準工時 standard' : `變形工時 ${workingHourType}`})
    - Total including overtime: max 12h/day
    ${dailyNormalCap === 10 ? 'Note: Hours between 8h-10h are redistributed regular hours, NOT overtime.' : ''}

H11. MONTHLY OVERTIME CAP (§32-1):
    - Monthly OT must not exceed 46h (base limit), or 54h with agreement (hard cap)
    - Consider accumulated OT from earlier this month when assigning

H12. QUARTERLY OVERTIME CAP (§32-1):
    - Rolling 3-month OT must not exceed 138h

H13. SKILL/CERTIFICATION MATCH:
    - If a shift template has required_skills, only assign employees who have ALL required skills
    - If no employees have the required skill, assign anyway with a note (coverage > skill match)

H14. STAFFING NEEDS: Each shift template may specify staffing_needs (skill × count).
    - For each shift on each day, assign at least the specified number of employees with each skill.
    - Example: if morning shift needs kitchen ×2 and cashier ×1, schedule at least 2 kitchen-skilled and 1 cashier-skilled employee.
    - If not enough skilled employees are available, assign best available and add a note.

H15. OPEN/CLOSE COVERAGE: The earliest shift each day MUST include at least 1 employee who can_open.
    The latest shift each day MUST include at least 1 employee who can_close.
    If no designated employees are available, assign anyway with a warning note.

=== HOURS CALCULATION ===
WORK HOURS = (end_time − start_time) − break_minutes
Example: 09:00–18:00 with 60 min break = 9h − 1h = 8h WORK hours.
This is the number that counts toward max_hours_per_week and overtime.

=== SOFT CONSTRAINTS (priority order) ===

S1. STAFF COVERAGE: ≥ ${minStaff} employees every operating day. ≥ 1 senior (has position) per day.
    Closed days (do NOT schedule): ${closedDays.length > 0 ? closedDays.join(', ') : 'None'}

S2. PREFERENCES: Prefer ⭐ days over ✅ days. Match employee skills to shift requirements.

S3. CONSISTENCY: Keep ~70% of previous week pattern stable. Rotate weekend workers fairly.

S4. FAIRNESS: Distribute hours fairly across employees of same type.

S5. MINIMIZE OVERTIME: Spread hours rather than concentrating. Be conservative near monthly OT caps.

S6. USER INSTRUCTIONS: ${userInstructions || 'None provided.'}

S7. LABOR BUDGET: ${budgetInfo}
    Budget is a soft target; coverage (S1) always takes priority over budget.

S8. DEMAND-BASED STAFFING:
    ${forecastInfo}
    When confidence > 70%, use recommended_staff to override minStaff for that day.

=== EMPLOYEE DATA ===
${JSON.stringify(employees.map(e => ({ id: e.id, name: e.name, position: e.position, type: e.employee_type, max_hours: e.max_hours_per_week })))}

=== AVAILABILITY MATRIX (Mon Tue Wed Thu Fri Sat Sun) ===
${availMatrix}

=== OPERATING HOURS ===
${JSON.stringify(operatingHours)}

=== EMPLOYEE SKILLS ===
${skillsInfo}

=== OPEN / CLOSE CAPABILITIES ===
${openCloseInfo}

=== STAFFING NEEDS PER SHIFT ===
${staffingNeedsInfo}

=== MONTHLY OVERTIME CONTEXT ===
${otInfo}

=== PREVIOUS WEEK ===
${prevInfo}

=== HISTORICAL PATTERNS (for consistency) ===
${historicalPatterns || 'No multi-week patterns available. Use previous week data only.'}

=== DEMAND FORECASTS ===
${forecastInfo}

=== LABOR BUDGET ===
${budgetInfo}

=== TARGET WEEK ===
${weekDates[0]} (Mon) to ${weekDates[6]} (Sun)

=== OUTPUT FORMAT ===
Return ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "assignments": [
    { "user_id": "uuid", "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM", "break_minutes": 60, "position": "string or null", "is_overtime": false, "overtime_hours": 0, "shift_template_id": "uuid or null" }
  ],
  "notes": "中文說明\\nEnglish explanation"
}`;
}

// ─── Historical Pattern Analysis ─────────────────────────────────────────────

function analyzeHistoricalPatterns(
  historicalAssignments: PrevAssignment[],
  employees: Employee[]
): string {
  if (!historicalAssignments || historicalAssignments.length === 0) {
    return 'No historical data available.';
  }

  const patterns: string[] = [];
  const byUser: Record<string, PrevAssignment[]> = {};
  for (const a of historicalAssignments) {
    if (!byUser[a.user_id]) byUser[a.user_id] = [];
    byUser[a.user_id].push(a);
  }

  // Count total weeks spanned
  const allDates = historicalAssignments.map(a => a.date).sort();
  const firstDate = new Date(allDates[0] + 'T00:00:00');
  const lastDate = new Date(allDates[allDates.length - 1] + 'T00:00:00');
  const weeksSpan = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) || 1;

  for (const [userId, assignments] of Object.entries(byUser)) {
    const emp = employees.find(e => e.id === userId);
    if (!emp) continue;

    // Day-of-week frequency
    const dowCount: Record<number, number> = {};
    let totalHours = 0;
    for (const a of assignments) {
      const dow = new Date(a.date + 'T00:00:00').getDay();
      dowCount[dow] = (dowCount[dow] || 0) + 1;
      if (a.start_time && a.end_time) {
        totalHours += calcWorkHours(a.start_time, a.end_time, 60);
      }
    }

    const avgHoursPerWeek = totalHours / weeksSpan;
    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const commonDays = Object.entries(dowCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([d, c]) => `${dowNames[Number(d)]}(${c}x)`)
      .join(', ');

    // Most common shift time
    const shiftFreq: Record<string, number> = {};
    for (const a of assignments) {
      if (a.start_time && a.end_time) {
        const key = `${a.start_time}-${a.end_time}`;
        shiftFreq[key] = (shiftFreq[key] || 0) + 1;
      }
    }
    const topShift = Object.entries(shiftFreq).sort((a, b) => b[1] - a[1])[0];

    // Weekend count for fairness
    const weekendDays = assignments.filter(a => {
      const d = new Date(a.date + 'T00:00:00').getDay();
      return d === 0 || d === 6;
    }).length;

    patterns.push(
      `- ${emp.name}: avg ${avgHoursPerWeek.toFixed(1)}h/week, common days: ${commonDays}${topShift ? `, usual shift: ${topShift[0]}` : ''}, weekends: ${weekendDays}x`
    );
  }

  return `Historical patterns (${weeksSpan} weeks, ${historicalAssignments.length} assignments):\n${patterns.join('\n')}`;
}

// ─── LLM Call ────────────────────────────────────────────────────────────────

async function callLLM(apiKey: string, messages: { role: string; content: string }[]): Promise<any> {
  const _llmStart = Date.now();
  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen3.5-plus', messages }),
  });
  if (!response.ok) {
    const err = await response.text();
    logLLMUsage({ functionName: 'scheduling-ai', provider: 'dashscope', model: 'qwen3.5-plus', latencyMs: Date.now() - _llmStart, status: 'error', errorMessage: `${response.status}`, purpose: 'schedule' });
    throw new Error(`DashScope API Error: ${response.status} ${err}`);
  }
  const data = await response.json();
  const _tok = extractTokensOpenAI(data);
  logLLMUsage({ functionName: 'scheduling-ai', provider: 'dashscope', model: 'qwen3.5-plus', inputTokens: _tok.input, outputTokens: _tok.output, totalTokens: _tok.total, latencyMs: Date.now() - _llmStart, status: 'success', purpose: 'schedule' });
  const text = data.choices[0].message.content;

  // Extract JSON (handle markdown fencing)
  const match = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
  try {
    return match ? JSON.parse(match[1]) : JSON.parse(text);
  } catch {
    throw new Error('AI returned invalid JSON format');
  }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('DASHSCOPE_API_KEY');
    if (!apiKey) throw new Error('DASHSCOPE_API_KEY is not set');

    // Create Supabase client for additional data fetches
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      store_id, week_start, employees, shift_templates,
      leave_requests, availability, operating_hours,
      previous_week_assignments, user_instructions,
      historical_assignments, working_hour_type,
    } = body;

    // --- Input validation ---
    if (!employees || employees.length === 0) {
      throw new Error('此門市尚無員工 / No employees provided');
    }
    if (!shift_templates || shift_templates.length === 0) {
      throw new Error('請先在門市設定中新增班別 / No shift templates configured');
    }

    // --- Fetch additional context from Supabase ---

    // 1. Employee skills
    const employeeSkills: Record<string, string[]> = {};
    if (store_id) {
      const empIds = employees.map((e: Employee) => e.id);
      const { data: skillRows } = await supabase
        .from('employee_skills')
        .select('user_id, skill_name')
        .in('user_id', empIds);
      if (skillRows) {
        for (const row of skillRows) {
          if (!employeeSkills[row.user_id]) employeeSkills[row.user_id] = [];
          employeeSkills[row.user_id].push(row.skill_name);
        }
      }
    }

    // 1b. Open/close capabilities
    const openCloseCapabilities: Record<string, { can_open: boolean; can_close: boolean }> = {};
    if (store_id) {
      const empIds = employees.map((e: Employee) => e.id);
      const { data: userRows } = await supabase
        .from('users')
        .select('id, can_open, can_close')
        .in('id', empIds)
        .or('can_open.eq.true,can_close.eq.true');
      if (userRows) {
        for (const row of userRows) {
          openCloseCapabilities[row.id] = { can_open: !!row.can_open, can_close: !!row.can_close };
        }
      }
    }

    // 2. Monthly OT context — fetch overtime hours from earlier this month
    const otContext: { monthly: Record<string, number>; threeMonth: Record<string, number> } = {
      monthly: {}, threeMonth: {},
    };
    if (store_id && week_start) {
      const weekStartDate = new Date(week_start + 'T00:00:00');
      // Month start
      const monthStart = `${week_start.slice(0, 7)}-01`;
      // 3-month start
      const threeMonthAgo = new Date(weekStartDate);
      threeMonthAgo.setMonth(threeMonthAgo.getMonth() - 2);
      const threeMonthStart = `${threeMonthAgo.toISOString().split('T')[0].slice(0, 7)}-01`;

      // Get all schedules in this month before current week
      const { data: monthScheds } = await supabase
        .from('schedules').select('id')
        .eq('store_id', store_id)
        .gte('week_start', monthStart)
        .lt('week_start', week_start);

      if (monthScheds && monthScheds.length > 0) {
        const schedIds = monthScheds.map(s => s.id);
        const { data: monthAssn } = await supabase
          .from('shift_assignments')
          .select('user_id, start_time, end_time, break_minutes, is_overtime, overtime_hours')
          .in('schedule_id', schedIds);
        if (monthAssn) {
          for (const a of monthAssn) {
            if (a.overtime_hours > 0) {
              otContext.monthly[a.user_id] = (otContext.monthly[a.user_id] || 0) + a.overtime_hours;
            }
          }
        }
      }

      // Get all schedules in 3-month window before current week
      const { data: threeMonthScheds } = await supabase
        .from('schedules').select('id')
        .eq('store_id', store_id)
        .gte('week_start', threeMonthStart)
        .lt('week_start', week_start);

      if (threeMonthScheds && threeMonthScheds.length > 0) {
        const schedIds = threeMonthScheds.map(s => s.id);
        const { data: threeMonthAssn } = await supabase
          .from('shift_assignments')
          .select('user_id, overtime_hours')
          .in('schedule_id', schedIds);
        if (threeMonthAssn) {
          for (const a of threeMonthAssn) {
            if (a.overtime_hours > 0) {
              otContext.threeMonth[a.user_id] = (otContext.threeMonth[a.user_id] || 0) + a.overtime_hours;
            }
          }
        }
      }
    }

    // 3. Store budget and hourly rate
    let laborBudget: number | undefined;
    let hourlyRate = 196; // Taiwan minimum wage default
    if (store_id) {
      const { data: storeData } = await supabase
        .from('stores').select('default_labor_budget, hourly_rate_default')
        .eq('id', store_id).single();
      if (storeData) {
        if (storeData.default_labor_budget) laborBudget = storeData.default_labor_budget;
        if (storeData.hourly_rate_default) hourlyRate = storeData.hourly_rate_default;
      }
    }

    // 4. Demand forecasts (from daily_demand if available)
    let demandForecasts: DemandForecast[] = [];
    if (store_id && week_start) {
      const weekDatesForForecast = getWeekDates(week_start);
      const { data: forecastRows } = await supabase
        .from('daily_demand')
        .select('date, recommended_staff, confidence, reason')
        .eq('store_id', store_id)
        .gte('date', weekDatesForForecast[0])
        .lte('date', weekDatesForForecast[6])
        .not('recommended_staff', 'is', null);
      if (forecastRows && forecastRows.length > 0) {
        demandForecasts = forecastRows.map(r => ({
          date: r.date, recommended_staff: r.recommended_staff,
          confidence: r.confidence || 0.5, reason: r.reason || '',
        }));
      }
    }

    // --- Phase 1: Data preparation ---
    const weekDates = getWeekDates(week_start);
    const leaveMap = buildLeaveMap(leave_requests || [], weekDates);
    const availMap = buildAvailMap(availability || []);
    const closedDays = getClosedDays(operating_hours || {}, weekDates);
    const operatingDays = weekDates.filter(d => !closedDays.includes(d));
    const minStaff = Math.max(1, Math.ceil(employees.length / 3));

    // Filter out employees with 0 max hours
    const activeEmployees = employees.filter((e: Employee) => e.max_hours_per_week > 0);

    // Working hour type and daily normal cap
    const whType = working_hour_type || 'standard';
    const dailyNormalCap = (whType === '2week' || whType === '4week') ? 10 : 8;

    // Check if any OT context exists
    const hasOtContext = Object.keys(otContext.monthly).length > 0 || Object.keys(otContext.threeMonth).length > 0;

    // Analyze historical patterns
    const histPatterns = analyzeHistoricalPatterns(
      historical_assignments || [], activeEmployees
    );

    // --- Phase 2: Build LLM prompt ---
    const systemPrompt = buildSystemPrompt(
      activeEmployees, shift_templates, leaveMap, availMap,
      operating_hours || {}, previous_week_assignments || null,
      weekDates, closedDays, minStaff, {
        userInstructions: user_instructions,
        historicalPatterns: histPatterns,
        workingHourType: whType,
        dailyNormalCap,
        employeeSkills: Object.keys(employeeSkills).length > 0 ? employeeSkills : undefined,
        otContext: hasOtContext ? otContext : undefined,
        demandForecasts: demandForecasts.length > 0 ? demandForecasts : undefined,
        laborBudget,
        hourlyRate,
        openCloseCapabilities: Object.keys(openCloseCapabilities).length > 0 ? openCloseCapabilities : undefined,
      }
    );

    // --- Phase 3: Call LLM ---
    let result = await callLLM(apiKey, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Generate the shift schedule for week ${weekDates[0]} to ${weekDates[6]}. Return only JSON.` },
    ]);

    let assignments: Assignment[] = result.assignments || [];
    let notes: string = result.notes || '';

    // Filter out hallucinated employee IDs
    const validIds = new Set(activeEmployees.map((e: Employee) => e.id));
    assignments = assignments.filter(a => validIds.has(a.user_id));

    // Build validation options
    const validationOpts: ValidationOptions = {
      workingHourType: whType,
      employeeSkills: Object.keys(employeeSkills).length > 0 ? employeeSkills : undefined,
      otContext: hasOtContext ? otContext : undefined,
      laborBudget,
      hourlyRate,
      demandForecasts: demandForecasts.length > 0 ? demandForecasts : undefined,
    };

    // --- Phase 4: Validate ---
    let validation = validateSchedule(
      assignments, activeEmployees, leaveMap, availMap,
      operatingDays, closedDays, minStaff, shift_templates, validationOpts
    );

    // --- Phase 5: Retry once if violations ---
    if (!validation.valid) {
      const violationSummary = validation.violations.map(v => `- ${v.message}`).join('\n');
      try {
        const retryResult = await callLLM(apiKey, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate the shift schedule for week ${weekDates[0]} to ${weekDates[6]}. Return only JSON.` },
          { role: 'assistant', content: JSON.stringify(result) },
          { role: 'user', content: `The schedule has these violations — fix them while maintaining coverage:\n${violationSummary}\n\nReturn the corrected full JSON.` },
        ]);

        let retryAssignments: Assignment[] = retryResult.assignments || [];
        retryAssignments = retryAssignments.filter(a => validIds.has(a.user_id));

        const retryValidation = validateSchedule(
          retryAssignments, activeEmployees, leaveMap, availMap,
          operatingDays, closedDays, minStaff, shift_templates, validationOpts
        );

        // Use retry result if it's better (fewer violations)
        if (retryValidation.violations.length < validation.violations.length) {
          assignments = retryAssignments;
          validation = retryValidation;
          notes = retryResult.notes || notes;
        }
      } catch (retryErr) {
        console.error('Retry failed:', retryErr);
      }
    }

    // --- Phase 6: Calculate summary ---
    let totalHours = 0;
    for (const a of assignments) {
      totalHours += calcWorkHours(a.start_time, a.end_time, a.break_minutes);
    }
    totalHours = Math.round(totalHours * 10) / 10;

    const estimatedCost = Math.round(totalHours * hourlyRate);
    const prefScore = calcPreferenceScore(assignments, availMap);
    const consistScore = calcConsistencyScore(assignments, previous_week_assignments || null);
    const coverageMet = !validation.warnings.some(w => w.type === 'understaffed');
    const budgetUtilization = laborBudget ? Math.round((estimatedCost / laborBudget) * 100) / 100 : undefined;

    const response = {
      assignments,
      summary: {
        total_hours: totalHours,
        estimated_cost: estimatedCost,
        preference_score: prefScore,
        consistency_score: consistScore,
        coverage_met: coverageMet,
        budget_utilization: budgetUtilization,
      },
      violations: validation.violations,
      warnings: validation.warnings,
      notes,
    };

    return new Response(JSON.stringify(response), {
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
