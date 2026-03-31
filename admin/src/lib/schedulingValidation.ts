import type {
  Store,
  ShiftTemplate,
  Employee,
  ShiftAssignment,
  Schedule,
  Availability,
  LaborViolation,
} from '../types/scheduling';

/** Calculate net work hours (break deducted) */
export function calcWorkHours(startTime: string, endTime: string, breakMinutes: number): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm) - breakMinutes) / 60;
}

/** Total shift minutes (before break deduction) */
function shiftMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

/** Required break minutes under Taiwan Labor Standards Act */
function requiredBreak(totalMinutes: number): number {
  return totalMinutes <= 240 ? 0 : totalMinutes <= 480 ? 30 : 60;
}

export interface ValidationContext {
  stores: Store[];
  selectedStore: string;
  shiftTemplates: ShiftTemplate[];
  employees: Employee[];
  leaves: any[];
  availability: Availability[];
  schedule: Schedule | null;
  employeeSkills: Record<string, string[]>;
  weekDates: string[];
  zh: boolean;
  otContext?: { monthly: Record<string, number>; threeMonth: Record<string, number> };
}

export function checkLaborLawViolations(
  assignmentList: ShiftAssignment[],
  ctx: ValidationContext,
): LaborViolation[] {
  const {
    stores, selectedStore, shiftTemplates, employees, leaves,
    availability, schedule, employeeSkills, weekDates, zh, otContext,
  } = ctx;

  const violations: LaborViolation[] = [];

  // Build lookup maps
  const store = stores.find(s => s.id === selectedStore);
  const opHours = store?.operating_hours || {};
  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const closedDays = new Set(weekDates.filter((_, i) => {
    const info = opHours[dayKeys[i]];
    return info?.open === 'closed' || info === 'closed';
  }));

  const leaveSet: Record<string, Set<string>> = {};
  for (const l of leaves) {
    if (!leaveSet[l.user_id]) leaveSet[l.user_id] = new Set();
    for (const d of weekDates) {
      if (d >= l.start_date && d <= l.end_date) leaveSet[l.user_id].add(d);
    }
  }

  const availMap: Record<string, Record<number, string>> = {};
  for (const a of availability) {
    if (!availMap[a.user_id]) availMap[a.user_id] = {};
    availMap[a.user_id][a.day_of_week] = a.availability;
  }

  const templateKeys = new Set(shiftTemplates.map(t => `${t.start_time}-${t.end_time}-${t.break_minutes}`));

  // Variable working hours -- daily normal cap
  const whType = store?.working_hour_type || 'standard';
  const dailyNormalCap = (whType === '2week' || whType === '4week') ? 10 : 8;

  // Group by user
  const byUser: Record<string, ShiftAssignment[]> = {};
  for (const a of assignmentList) {
    if (!byUser[a.user_id]) byUser[a.user_id] = [];
    byUser[a.user_id].push(a);
  }

  // === Per-assignment checks ===
  for (const a of assignmentList) {
    const emp = employees.find(e => e.id === a.user_id);
    const name = emp?.name || a.user_id.slice(0, 8);

    // H1: Leave conflict
    if (leaveSet[a.user_id]?.has(a.date)) {
      violations.push({ employee_id: a.user_id, employee_name: name, type: 'leave_conflict', severity: 'error',
        date: a.date, assignment_id: a.id,
        message: `${name}: ${a.date} ${zh ? '已請假，不應排班' : 'on leave, should not be scheduled'}` });
    }

    // H2: Unavailable day
    const dow = new Date(a.date + 'T00:00:00').getDay();
    if (availMap[a.user_id]?.[dow] === 'unavailable') {
      violations.push({ employee_id: a.user_id, employee_name: name, type: 'unavailable_conflict', severity: 'error',
        date: a.date, assignment_id: a.id,
        message: `${name}: ${a.date} ${zh ? '標記為不可上班' : 'marked unavailable'}` });
    }

    // Closed day
    if (closedDays.has(a.date)) {
      violations.push({ employee_id: a.user_id, employee_name: name, type: 'closed_day', severity: 'error',
        date: a.date, assignment_id: a.id,
        message: `${name}: ${a.date} ${zh ? '門市休息日' : 'store closed'}` });
    }

    // H6: Shift template match
    if (a.start_time && a.end_time) {
      const key = `${a.start_time}-${a.end_time}-${a.break_minutes}`;
      if (templateKeys.size > 0 && !templateKeys.has(key)) {
        violations.push({ employee_id: a.user_id, employee_name: name, type: 'invalid_shift', severity: 'warning',
          date: a.date, assignment_id: a.id,
          message: `${name}: ${a.date} ${a.start_time}-${a.end_time} ${zh ? '不在班別模板中' : 'not in shift templates'}` });
      }

      // GAP-12: Skill requirement check
      if (a.shift_template_id) {
        const tmpl = shiftTemplates.find(t => t.id === a.shift_template_id);
        if (tmpl?.required_skills && tmpl.required_skills.length > 0) {
          const empSkills = employeeSkills[a.user_id] || [];
          const missing = tmpl.required_skills.filter(s => !empSkills.includes(s));
          if (missing.length > 0) {
            violations.push({ employee_id: a.user_id, employee_name: name, type: 'skill_mismatch', severity: 'warning',
              date: a.date, assignment_id: a.id,
              message: `${name}: ${a.date} ${zh ? `缺少技能: ${missing.join(', ')}` : `missing skills: ${missing.join(', ')}`}` });
          }
        }
      }

      // H9: Break compliance
      const sMins = shiftMinutes(a.start_time, a.end_time);
      const needed = requiredBreak(sMins);
      const actualBreak = a.break_minutes || 0;
      if (actualBreak < needed) {
        violations.push({ employee_id: a.user_id, employee_name: name, type: 'insufficient_break', severity: 'error',
          date: a.date, assignment_id: a.id,
          message: `${name}: ${a.date} ${zh ? `休息 ${actualBreak}分 不足法定 ${needed}分 (§35)` : `break ${actualBreak}min < required ${needed}min (§35)`}` });
      }

      // H10: Daily hours cap
      const dailyWork = calcWorkHours(a.start_time, a.end_time, actualBreak);
      if (dailyWork > 12) {
        violations.push({ employee_id: a.user_id, employee_name: name, type: 'daily_hours_exceeded', severity: 'error',
          date: a.date, assignment_id: a.id,
          message: `${name}: ${a.date} ${zh ? `工時 ${dailyWork.toFixed(1)}h 超過每日上限 12h (§30)` : `${dailyWork.toFixed(1)}h exceeds daily 12h cap (§30)`}` });
      } else if (dailyWork > dailyNormalCap) {
        violations.push({ employee_id: a.user_id, employee_name: name, type: 'daily_overtime', severity: 'warning',
          date: a.date, assignment_id: a.id,
          message: `${name}: ${a.date} ${zh ? `工時 ${dailyWork.toFixed(1)}h，${(dailyWork - dailyNormalCap).toFixed(1)}h 為加班` : `${dailyWork.toFixed(1)}h (${(dailyWork - dailyNormalCap).toFixed(1)}h overtime)`}` });
      }
    }
  }

  // === Per-employee checks ===
  for (const [userId, userAssignments] of Object.entries(byUser)) {
    const emp = employees.find(e => e.id === userId);
    const name = emp?.name || userId.slice(0, 8);
    const sorted = [...userAssignments].sort((a, b) => a.date.localeCompare(b.date));

    // Total work hours
    let totalHours = 0;
    for (const a of sorted) {
      if (a.start_time && a.end_time) {
        totalHours += calcWorkHours(a.start_time, a.end_time, a.break_minutes || 0);
      }
    }

    if (emp) {
      // H3 + H7: Max hours / part-time ceiling
      if (totalHours > emp.max_hours_per_week) {
        const label = emp.employee_type === 'part-time' ? (zh ? '兼職' : 'Part-time') : '';
        const lastA = sorted[sorted.length - 1];
        violations.push({ employee_id: userId, employee_name: name,
          type: emp.employee_type === 'part-time' ? 'part_time_exceeded' : 'max_hours_exceeded', severity: 'error',
          date: lastA?.date, assignment_id: lastA?.id,
          message: `${name}: ${label}${zh ? `工時 ${totalHours.toFixed(1)}h 超過上限 ${emp.max_hours_per_week}h` : ` ${totalHours.toFixed(1)}h exceeds max ${emp.max_hours_per_week}h`}` });
      }

      // H8: Full-time floor (warning)
      const minHrs = emp.max_hours_per_week * 0.8;
      if (emp.employee_type === 'full-time' && totalHours < minHrs) {
        violations.push({ employee_id: userId, employee_name: name, type: 'underutilized', severity: 'warning',
          message: `${name}: ${zh ? `全職工時 ${totalHours.toFixed(1)}h 低於建議 ${minHrs}h (80%)` : `full-time ${totalHours.toFixed(1)}h below recommended ${minHrs}h (80%)`}` });
      }

      // Overtime warning
      const stdHrs = emp.employee_type === 'full-time' ? 40 : emp.max_hours_per_week;
      if (totalHours > stdHrs && totalHours <= emp.max_hours_per_week) {
        violations.push({ employee_id: userId, employee_name: name, type: 'overtime', severity: 'warning',
          message: `${name}: ${(totalHours - stdHrs).toFixed(1)}h ${zh ? '加班' : 'overtime'}` });
      }

      // Monthly OT cap check
      if (otContext) {
        const weeklyOt = totalHours > stdHrs ? totalHours - stdHrs : 0;
        const monthlyTotal = (otContext.monthly[userId] || 0) + weeklyOt;
        const threeMonthTotal = (otContext.threeMonth[userId] || 0) + weeklyOt;

        if (monthlyTotal > 54) {
          violations.push({ employee_id: userId, employee_name: name, type: 'monthly_ot_hard_cap', severity: 'error',
            message: `${name}: ${zh ? `月加班 ${monthlyTotal.toFixed(1)}h 超過絕對上限 54h (§32-1)` : `monthly OT ${monthlyTotal.toFixed(1)}h exceeds hard cap 54h (§32-1)`}` });
        } else if (monthlyTotal > 46) {
          violations.push({ employee_id: userId, employee_name: name, type: 'monthly_ot_exceeded', severity: 'error',
            message: `${name}: ${zh ? `月加班 ${monthlyTotal.toFixed(1)}h 超過上限 46h (§32-1)` : `monthly OT ${monthlyTotal.toFixed(1)}h exceeds cap 46h (§32-1)`}` });
        } else if (monthlyTotal > 38) {
          violations.push({ employee_id: userId, employee_name: name, type: 'monthly_ot_approaching', severity: 'warning',
            message: `${name}: ${zh ? `月加班 ${monthlyTotal.toFixed(1)}h 接近上限 46h` : `monthly OT ${monthlyTotal.toFixed(1)}h approaching 46h cap`}` });
        }

        if (threeMonthTotal > 138) {
          violations.push({ employee_id: userId, employee_name: name, type: 'quarterly_ot_exceeded', severity: 'error',
            message: `${name}: ${zh ? `三個月加班 ${threeMonthTotal.toFixed(1)}h 超過上限 138h (§32-1)` : `3-month OT ${threeMonthTotal.toFixed(1)}h exceeds 138h cap (§32-1)`}` });
        }
      }
    }

    // H4: Consecutive days
    let consecutive = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].date + 'T00:00:00');
      const curr = new Date(sorted[i].date + 'T00:00:00');
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        consecutive++;
        if (consecutive >= 7) {
          violations.push({ employee_id: userId, employee_name: name, type: 'consecutive_days', severity: 'error',
            date: sorted[i].date, assignment_id: sorted[i].id,
            message: `${name}: ${consecutive} ${zh ? '天連續上班 (七休一違規)' : `consecutive days (violates §36)`}` });
        }
      } else {
        consecutive = 1;
      }
    }

    // H5: 11-hour rest interval
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.end_time && curr.start_time) {
        const prevEnd = new Date(`${prev.date}T${prev.end_time}`);
        const currStart = new Date(`${curr.date}T${curr.start_time}`);
        const restHours = (currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);
        if (restHours >= 0 && restHours < 11) {
          violations.push({ employee_id: userId, employee_name: name, type: 'short_rest', severity: 'warning',
            date: curr.date, assignment_id: curr.id,
            message: `${name}: ${prev.date}→${curr.date} ${zh ? `休息僅 ${restHours.toFixed(1)}h (需≥11h §34)` : `rest ${restHours.toFixed(1)}h < 11h (§34)`}` });
        }
      }
    }
  }

  // === Coverage checks ===
  const minStaff = Math.max(1, Math.ceil(employees.length / 3));
  const operatingDays = weekDates.filter(d => !closedDays.has(d));
  for (const date of operatingDays) {
    const daily = assignmentList.filter((a: any) => a.date === date);
    if (daily.length < minStaff) {
      violations.push({ employee_id: '', employee_name: '', type: 'understaffed', severity: 'warning',
        date,
        message: `${date}: ${daily.length}${zh ? `人值班 (建議至少${minStaff}人)` : ` staff (recommend ≥${minStaff})`}` });
    }
    const hasSenior = daily.some((a: any) => employees.find(e => e.id === a.user_id)?.position);
    if (!hasSenior && employees.some(e => e.position)) {
      violations.push({ employee_id: '', employee_name: '', type: 'no_senior', severity: 'warning',
        date,
        message: `${date}: ${zh ? '無資深員工值班' : 'no senior staff scheduled'}` });
    }
  }

  // === GAP-6: Budget check ===
  if (schedule?.labor_budget || store?.default_labor_budget) {
    const budget = schedule?.labor_budget || store?.default_labor_budget || 0;
    const rate = store?.hourly_rate_default || 183;
    let totalH = 0;
    for (const a of assignmentList) {
      if (a.start_time && a.end_time) totalH += calcWorkHours(a.start_time, a.end_time, a.break_minutes || 0);
    }
    const cost = totalH * rate;
    const threshold = schedule?.budget_alert_threshold || 0.90;
    if (cost > budget) {
      violations.push({ employee_id: '', employee_name: '', type: 'budget_exceeded', severity: 'error',
        message: `${zh ? `人力成本 NT$${Math.round(cost).toLocaleString()} 超過預算 NT$${Math.round(budget).toLocaleString()}` : `Labor cost NT$${Math.round(cost).toLocaleString()} exceeds budget NT$${Math.round(budget).toLocaleString()}`}` });
    } else if (cost > budget * threshold) {
      violations.push({ employee_id: '', employee_name: '', type: 'budget_approaching', severity: 'warning',
        message: `${zh ? `人力成本 NT$${Math.round(cost).toLocaleString()} 接近預算 NT$${Math.round(budget).toLocaleString()} (${Math.round(cost / budget * 100)}%)` : `Labor cost NT$${Math.round(cost).toLocaleString()} approaching budget NT$${Math.round(budget).toLocaleString()} (${Math.round(cost / budget * 100)}%)`}` });
    }
  }

  return violations;
}
