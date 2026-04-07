import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';
import type { DragEndEvent } from '@dnd-kit/core';

import type {
  Store, ShiftTemplate, Employee, ShiftAssignment, Schedule,
  Availability, LaborViolation, ShiftSwapRequest, ScheduleTemplate,
  DemandForecast, SwapForm, OpenShiftForm,
} from '../types/scheduling';
import { checkLaborLawViolations, calcWorkHours } from '../lib/schedulingValidation';
import { exportScheduleExcel, importScheduleExcel } from '../lib/scheduleExcel';

import { ScheduleCalendarTab } from '../components/Scheduling/ScheduleCalendarTab';
import { StoreSettingsTab } from '../components/Scheduling/StoreSettingsTab';
import { PreferencesTab } from '../components/Scheduling/PreferencesTab';
import { ShiftSwapsTab } from '../components/Scheduling/ShiftSwapsTab';
import { AnalyticsTab } from '../components/Scheduling/AnalyticsTab';
import { SaveTemplateModal, ViolationModal } from '../components/Scheduling/SchedulingModals';

export function Scheduling() {
  const zh = getLocale() === 'zh-TW';
  const { orgId, currentUser } = useOrg();
  const [tab, setTab] = useState<'calendar' | 'settings' | 'preferences' | 'swaps' | 'analytics'>('calendar');
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiInstructions, setAiInstructions] = useState('');
  const [violations, setViolations] = useState<LaborViolation[]>([]);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [violationAcknowledged, setViolationAcknowledged] = useState(false);
  const [pendingPublishId, setPendingPublishId] = useState<string | null>(null);
  const [fixLoading, setFixLoading] = useState(false);

  // Shift swap state
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [showCreateSwap, setShowCreateSwap] = useState(false);
  const [swapForm, setSwapForm] = useState<SwapForm>({ requester_id: '', requester_shift_id: '', target_id: '', swap_type: 'swap', reason: '' });
  const [showOpenShiftForm, setShowOpenShiftForm] = useState(false);
  const [openShiftForm, setOpenShiftForm] = useState<OpenShiftForm>({ date: '', start_time: '09:00', end_time: '17:00', break_minutes: '60', reason: '' });
  const [swapSaving, setSwapSaving] = useState(false);

  const dayNames = zh ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // GAP-10: Schedule templates
  const [scheduleTemplates, setScheduleTemplates] = useState<ScheduleTemplate[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [quickAddCell, setQuickAddCell] = useState<{ userId: string; date: string } | null>(null);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [calendarView, setCalendarView] = useState<'table' | 'timeline'>('table');
  const [employeeSkills, setEmployeeSkills] = useState<Record<string, string[]>>({});
  const [forecasts, setForecasts] = useState<DemandForecast[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);

  // ============ HELPERS ============

  const getWeekDates = (): string[] => {
    const start = new Date(weekStart + 'T00:00:00');
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  };

  const weekDates = getWeekDates();

  const changeWeek = (delta: number) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().split('T')[0]);
  };

  const ensureDraftSchedule = async (): Promise<string | null> => {
    if (schedule) return schedule.id;
    const { data: sched } = await supabase.from('schedules').insert({
      store_id: selectedStore, organization_id: orgId,
      week_start: weekStart, status: 'draft', generated_by: 'manual',
    }).select().single();
    if (sched) { setSchedule(sched); return sched.id; }
    return null;
  };

  const addShiftFromTemplate = async (templateId: string, userId: string, date: string) => {
    const tmpl = shiftTemplates.find(t => t.id === templateId);
    if (!tmpl) return;
    const schedId = await ensureDraftSchedule();
    if (!schedId) return;
    const { data: newAssignment } = await supabase.from('shift_assignments').insert({
      schedule_id: schedId, user_id: userId, store_id: selectedStore,
      date, start_time: tmpl.start_time, end_time: tmpl.end_time,
      break_minutes: tmpl.break_minutes, shift_template_id: tmpl.id, status: 'scheduled',
    }).select().single();
    if (newAssignment) setAssignments(prev => [...prev, newAssignment]);
  };

  // ============ DATA FETCHING ============

  const loadSwaps = async () => {
    if (!orgId) return;
    setSwapLoading(true);
    const { data } = await supabase.from('shift_swap_requests').select('*')
      .eq('organization_id', orgId).order('created_at', { ascending: false });
    setSwapRequests(data || []);
    setSwapLoading(false);
  };

  useEffect(() => {
    supabase.from('stores').select('*').eq('store_type', 'retail').order('name')
      .then(r => {
        setStores(r.data || []);
        if (r.data?.[0]) setSelectedStore(r.data[0].id);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedStore) return;
    const weekEnd = new Date(weekStart + 'T00:00:00');
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    Promise.all([
      supabase.from('shift_templates').select('*').eq('store_id', selectedStore).order('start_time'),
      supabase.from('users').select('id, name, position, employee_type, max_hours_per_week, store_id, can_open, can_close').eq('store_id', selectedStore).eq('status', 'active'),
      supabase.from('schedules').select('*').eq('store_id', selectedStore).eq('week_start', weekStart).single(),
      supabase.from('employee_availability').select('*').eq('store_id', selectedStore),
      supabase.from('leave_requests').select('*').eq('status', 'approved').lte('start_date', weekEndStr).gte('end_date', weekStart)
    ]).then(async ([shiftR, empR, schedR, availR, leaveR]) => {
      setShiftTemplates(shiftR.data || []);
      const primaryEmps: Employee[] = empR.data || [];
      const primaryIds = new Set(primaryEmps.map(e => e.id));
      const { data: crossLinks } = await supabase.from('user_stores').select('user_id').eq('store_id', selectedStore);
      const crossIds = (crossLinks || []).map(l => l.user_id).filter(id => !primaryIds.has(id));
      let allEmps = primaryEmps;
      if (crossIds.length > 0) {
        const { data: crossEmps } = await supabase.from('users').select('id, name, position, employee_type, max_hours_per_week, store_id, can_open, can_close')
          .in('id', crossIds).eq('status', 'active');
        allEmps = [...primaryEmps, ...(crossEmps || [])];
      }
      setEmployees(allEmps);
      setSchedule(schedR.data || null);
      setAvailability(availR.data || []);
      setLeaves(leaveR.data || []);
      if (schedR.data) {
        supabase.from('shift_assignments').select('*').eq('schedule_id', schedR.data.id).order('date').then(r => setAssignments(r.data || []));
      } else {
        setAssignments([]);
      }
      if (empR.data && empR.data.length > 0) {
        const empIds = empR.data.map((e: any) => e.id);
        supabase.from('employee_skills').select('user_id, skill_name').in('user_id', empIds).then(r => {
          const map: Record<string, string[]> = {};
          for (const s of (r.data || [])) { if (!map[s.user_id]) map[s.user_id] = []; map[s.user_id].push(s.skill_name); }
          setEmployeeSkills(map);
        });
      }
    });
  }, [selectedStore, weekStart]);

  useEffect(() => { if (tab === 'swaps') loadSwaps(); }, [tab, orgId]);

  useEffect(() => {
    if (!selectedStore || !orgId) return;
    supabase.from('schedule_templates').select('id, name, description, assignments')
      .eq('store_id', selectedStore).eq('organization_id', orgId).order('created_at', { ascending: false })
      .then(r => setScheduleTemplates(r.data || []));
  }, [selectedStore, orgId]);

  // Ctrl key tracking for copy-drag
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(true); };
    const up = (e: KeyboardEvent) => { if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Close quick-add popover on Escape / click outside
  useEffect(() => {
    if (!quickAddCell) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setQuickAddCell(null); };
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-quick-add-popover]')) setQuickAddCell(null);
    };
    window.addEventListener('keydown', handler);
    setTimeout(() => window.addEventListener('click', clickHandler), 0);
    return () => { window.removeEventListener('keydown', handler); window.removeEventListener('click', clickHandler); };
  }, [quickAddCell]);

  // ============ BUSINESS LOGIC ============

  const fetchMonthlyOtHours = async (): Promise<{ monthly: Record<string, number>; threeMonth: Record<string, number> }> => {
    const weekDate = new Date(weekStart + 'T00:00:00');
    const monthStart = new Date(weekDate.getFullYear(), weekDate.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(weekDate.getFullYear(), weekDate.getMonth() + 1, 0).toISOString().split('T')[0];
    const threeMonthStart = new Date(weekDate.getFullYear(), weekDate.getMonth() - 2, 1).toISOString().split('T')[0];
    const { data } = await supabase.from('overtime_requests').select('user_id, ot_hours, request_date')
      .eq('status', 'approved').gte('request_date', threeMonthStart).lte('request_date', monthEnd);
    const monthly: Record<string, number> = {};
    const threeMonth: Record<string, number> = {};
    if (data) {
      for (const r of data) {
        threeMonth[r.user_id] = (threeMonth[r.user_id] || 0) + (r.ot_hours || 0);
        if (r.request_date >= monthStart) monthly[r.user_id] = (monthly[r.user_id] || 0) + (r.ot_hours || 0);
      }
    }
    return { monthly, threeMonth };
  };

  const runValidation = (assignmentList: ShiftAssignment[], otCtx?: { monthly: Record<string, number>; threeMonth: Record<string, number> }) => {
    return checkLaborLawViolations(assignmentList, {
      stores, selectedStore, shiftTemplates, employees, leaves,
      availability, schedule, employeeSkills, weekDates, zh, otContext: otCtx,
    });
  };

  const createSwap = async () => {
    if (!swapForm.requester_id || !swapForm.requester_shift_id) return;
    setSwapSaving(true);
    await supabase.from('shift_swap_requests').insert({
      organization_id: orgId, requester_id: swapForm.requester_id,
      requester_shift_id: swapForm.requester_shift_id,
      target_id: swapForm.target_id || null, swap_type: swapForm.swap_type,
      reason: swapForm.reason || null, status: 'pending',
    });
    setSwapSaving(false);
    setShowCreateSwap(false);
    setSwapForm({ requester_id: '', requester_shift_id: '', target_id: '', swap_type: 'swap', reason: '' });
    loadSwaps();
  };

  const createOpenShift = async () => {
    if (!openShiftForm.date || !openShiftForm.start_time || !openShiftForm.end_time) return;
    setSwapSaving(true);
    const schedId = schedule?.id;
    if (!schedId) { setSwapSaving(false); return; }
    const { data: tempShift } = await supabase.from('shift_assignments').insert({
      schedule_id: schedId, user_id: currentUser?.id ?? employees[0]?.id, store_id: selectedStore,
      date: openShiftForm.date, start_time: openShiftForm.start_time, end_time: openShiftForm.end_time,
      break_minutes: Number(openShiftForm.break_minutes) || 60, status: 'open',
    }).select().single();
    if (tempShift) {
      await supabase.from('shift_swap_requests').insert({
        organization_id: orgId, requester_id: currentUser?.id ?? employees[0]?.id,
        requester_shift_id: tempShift.id, swap_type: 'open_shift',
        reason: openShiftForm.reason || null, status: 'pending',
      });
    }
    setSwapSaving(false);
    setShowOpenShiftForm(false);
    setOpenShiftForm({ date: '', start_time: '09:00', end_time: '17:00', break_minutes: '60', reason: '' });
    loadSwaps();
    if (schedId) {
      const { data: assn } = await supabase.from('shift_assignments').select('*').eq('schedule_id', schedId).order('date');
      setAssignments(assn || []);
    }
  };

  const claimOpenShift = async (swapId: string, shiftId: string) => {
    if (!currentUser?.id) return;
    await supabase.from('shift_swap_requests').update({
      bid_user_id: currentUser.id, bid_at: new Date().toISOString(),
      status: 'target_accepted', updated_at: new Date().toISOString(),
    }).eq('id', swapId);
    await supabase.from('shift_assignments').update({ user_id: currentUser.id, status: 'scheduled' }).eq('id', shiftId);
    loadSwaps();
    if (schedule?.id) {
      const { data: assn } = await supabase.from('shift_assignments').select('*').eq('schedule_id', schedule.id).order('date');
      setAssignments(assn || []);
    }
  };

  const updateSwapStatus = async (id: string, status: string, note?: string) => {
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'approved') { updates.manager_id = currentUser?.id ?? null; updates.approved_at = new Date().toISOString(); }
    if (note) updates.manager_note = note;
    await supabase.from('shift_swap_requests').update(updates).eq('id', id);
    loadSwaps();
  };

  const setAvail = async (userId: string, dow: number, val: string) => {
    const existing = availability.find(a => a.user_id === userId && a.day_of_week === dow);
    if (existing) {
      await supabase.from('employee_availability').update({ availability: val }).eq('id', existing.id);
    } else {
      await supabase.from('employee_availability').insert({ user_id: userId, store_id: selectedStore, day_of_week: dow, availability: val });
    }
    const { data } = await supabase.from('employee_availability').select('*').eq('store_id', selectedStore);
    setAvailability(data || []);
  };

  const fetchForecast = async () => {
    setForecastLoading(true);
    try {
      const { data: histData } = await supabase.from('daily_demand').select('date, revenue, transactions, foot_traffic, weather, is_holiday')
        .eq('store_id', selectedStore).order('date', { ascending: false }).limit(90);
      const { data: result } = await supabase.functions.invoke('demand-forecast', {
        body: { store_id: selectedStore, week_start: weekStart, historical_data: (histData || []).reverse() },
      });
      if (result?.forecasts) setForecasts(result.forecasts);
    } catch (e) { console.error('Forecast error:', e); }
    setForecastLoading(false);
  };

  const runAiSchedule = async () => {
    setAiLoading(true);
    try {
      const prevStart = new Date(weekStart + 'T00:00:00');
      prevStart.setDate(prevStart.getDate() - 7);
      const prevStartStr = prevStart.toISOString().split('T')[0];
      const { data: prevSched } = await supabase.from('schedules').select('id')
        .eq('store_id', selectedStore).eq('week_start', prevStartStr).single();
      const prevAssignments = prevSched
        ? (await supabase.from('shift_assignments').select('user_id, date, start_time, end_time, shift_template_id').eq('schedule_id', prevSched.id)).data
        : [];
      const histStart = new Date(weekStart + 'T00:00:00');
      histStart.setDate(histStart.getDate() - 56);
      const { data: histScheds } = await supabase.from('schedules').select('id')
        .eq('store_id', selectedStore).gte('week_start', histStart.toISOString().split('T')[0]).lt('week_start', weekStart);
      let historicalAssignments: any[] = [];
      if (histScheds && histScheds.length > 0) {
        const schedIds = histScheds.map(s => s.id);
        const { data: histAssn } = await supabase.from('shift_assignments')
          .select('user_id, date, start_time, end_time, shift_template_id').in('schedule_id', schedIds);
        historicalAssignments = histAssn || [];
      }
      const { data } = await supabase.functions.invoke('scheduling-ai', {
        body: {
          store_id: selectedStore, week_start: weekStart, employees, shift_templates: shiftTemplates,
          leave_requests: leaves, availability,
          operating_hours: stores.find(s => s.id === selectedStore)?.operating_hours || {},
          working_hour_type: stores.find(s => s.id === selectedStore)?.working_hour_type || 'standard',
          previous_week_assignments: prevAssignments || [],
          historical_assignments: historicalAssignments,
          user_instructions: aiInstructions.trim() || undefined,
        }
      });
      if (data?.assignments) {
        const { data: sched } = await supabase.from('schedules').insert({
          store_id: selectedStore, organization_id: orgId, week_start: weekStart,
          status: 'draft', generated_by: 'ai',
          total_labor_hours: data.summary?.total_hours || 0,
          estimated_cost: data.summary?.estimated_cost || 0,
          violations: data.violations || [], notes: data.notes || '',
        }).select().single();
        if (sched) {
          const toInsert = data.assignments.map((a: any) => ({
            schedule_id: sched.id, user_id: a.user_id, store_id: selectedStore,
            date: a.date, start_time: a.start_time, end_time: a.end_time,
            break_minutes: a.break_minutes || 60, position: a.position,
            is_overtime: a.is_overtime || false, overtime_hours: a.overtime_hours || 0,
          }));
          await supabase.from('shift_assignments').insert(toInsert);
          setSchedule(sched);
          const { data: assn } = await supabase.from('shift_assignments').select('*').eq('schedule_id', sched.id).order('date');
          setAssignments(assn || []);
        }
      }
    } catch (err: any) {
      alert(zh ? '排班失敗: ' + err.message : 'Scheduling failed: ' + err.message);
    }
    setAiLoading(false);
  };

  const copyPreviousWeek = async () => {
    setCopyLoading(true);
    try {
      const prevStart = new Date(weekStart + 'T00:00:00');
      prevStart.setDate(prevStart.getDate() - 7);
      const prevStartStr = prevStart.toISOString().split('T')[0];
      const { data: prevSchedule } = await supabase.from('schedules').select('*')
        .eq('store_id', selectedStore).eq('week_start', prevStartStr).single();
      if (!prevSchedule) { alert(zh ? '上週沒有排班記錄可以複製。' : 'No schedule found for the previous week to copy.'); setCopyLoading(false); return; }
      const { data: prevAssignments } = await supabase.from('shift_assignments').select('*').eq('schedule_id', prevSchedule.id);
      if (!prevAssignments || prevAssignments.length === 0) { alert(zh ? '上週排班沒有班次可複製。' : 'Previous week schedule has no shift assignments.'); setCopyLoading(false); return; }
      const { data: newSched } = await supabase.from('schedules').insert({
        store_id: selectedStore, organization_id: orgId, week_start: weekStart,
        status: 'draft', generated_by: 'manual',
        total_labor_hours: prevSchedule.total_labor_hours || 0,
        estimated_cost: prevSchedule.estimated_cost || 0,
        notes: zh ? `複製自 ${prevStartStr} 週排班` : `Copied from week of ${prevStartStr}`,
      }).select().single();
      if (!newSched) { alert(zh ? '建立排班失敗。' : 'Failed to create schedule.'); setCopyLoading(false); return; }
      const toInsert = prevAssignments.map((a: any) => {
        const oldDate = new Date(a.date + 'T00:00:00');
        oldDate.setDate(oldDate.getDate() + 7);
        return {
          schedule_id: newSched.id, user_id: a.user_id, store_id: selectedStore,
          date: oldDate.toISOString().split('T')[0],
          start_time: a.start_time, end_time: a.end_time, break_minutes: a.break_minutes,
          position: a.position, shift_template_id: a.shift_template_id,
          is_overtime: a.is_overtime || false, overtime_hours: a.overtime_hours || 0, status: 'scheduled',
        };
      });
      await supabase.from('shift_assignments').insert(toInsert);
      setSchedule(newSched);
      const { data: assn } = await supabase.from('shift_assignments').select('*').eq('schedule_id', newSched.id).order('date');
      setAssignments(assn || []);
    } catch (err: any) {
      alert(zh ? '複製失敗: ' + err.message : 'Copy failed: ' + err.message);
    }
    setCopyLoading(false);
  };

  const publishSchedule = async (scheduleId?: string, acknowledged: boolean = false) => {
    const targetId = scheduleId ?? schedule?.id;
    if (!targetId) return;
    if (!acknowledged) {
      const otContext = await fetchMonthlyOtHours();
      const found = runValidation(assignments, otContext);
      if (found.length > 0) {
        setViolations(found);
        setPendingPublishId(targetId);
        setShowViolationModal(true);
        return;
      }
    }
    await supabase.from('schedules').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', targetId);
    setSchedule(prev => prev ? { ...prev, status: 'published' } : prev);

    // LINE notification
    try {
      const store = stores.find(s => s.id === selectedStore);
      await supabase.functions.invoke('hr-notify', {
        body: {
          type: 'schedule_published',
          details: {
            store_id: selectedStore, store_name: store?.name || '', week_start: weekStart,
            assignments: assignments.map(a => ({ user_id: a.user_id, date: a.date, start_time: a.start_time, end_time: a.end_time })),
            employees: employees.map(e => ({ id: e.id, name: e.name })),
          },
        },
      });
    } catch (e) { console.warn('Schedule notification failed (non-critical):', e); }

    // KPI metrics
    try {
      const store = stores.find(s => s.id === selectedStore);
      const rate = store?.hourly_rate_default || 183;
      let totalH = 0; let otH = 0;
      for (const a of assignments) {
        if (a.start_time && a.end_time) {
          totalH += calcWorkHours(a.start_time, a.end_time, a.break_minutes || 0);
          if (a.is_overtime) otH += a.overtime_hours || 0;
        }
      }
      await supabase.from('scheduling_kpis').upsert({
        organization_id: orgId, store_id: selectedStore, week_start: weekStart,
        ai_generated: schedule?.generated_by === 'ai', violations_at_publish: violations.length,
        total_hours: Math.round(totalH * 100) / 100, total_ot_hours: Math.round(otH * 100) / 100,
        labor_cost: Math.round(totalH * rate), employee_count: new Set(assignments.map(a => a.user_id)).size,
      }, { onConflict: 'store_id,week_start' });
    } catch (e) { console.warn('KPI recording failed (non-critical):', e); }
  };

  const handleAutoFix = async () => {
    if (!schedule) return;
    setFixLoading(true);
    try {
      const otContext = await fetchMonthlyOtHours();
      const errors = violations.filter(v => v.severity === 'error');
      const badIds = new Set<string>();
      const removedShifts: { date: string; start_time: string; end_time: string; break_minutes: number; employee_name: string }[] = [];
      for (const v of errors) {
        if (v.assignment_id && !badIds.has(v.assignment_id)) {
          badIds.add(v.assignment_id);
          const a = assignments.find(x => x.id === v.assignment_id);
          if (a) removedShifts.push({ date: a.date, start_time: a.start_time, end_time: a.end_time, break_minutes: a.break_minutes, employee_name: v.employee_name });
        }
      }
      if (badIds.size === 0) { setFixLoading(false); return; }
      for (const id of badIds) await supabase.from('shift_assignments').delete().eq('id', id);
      const goodAssignments = assignments.filter(a => !badIds.has(a.id));
      const gapLines = removedShifts.map(r => `${r.date} ${r.start_time}-${r.end_time} (removed from ${r.employee_name})`);
      const keepLines = goodAssignments.map(a => {
        const emp = employees.find(e => e.id === a.user_id);
        return `KEEP: ${emp?.name || a.user_id} on ${a.date} ${a.start_time}-${a.end_time}`;
      });
      const prevStart = new Date(weekStart + 'T00:00:00');
      prevStart.setDate(prevStart.getDate() - 7);
      const { data: prevSched } = await supabase.from('schedules').select('id')
        .eq('store_id', selectedStore).eq('week_start', prevStart.toISOString().split('T')[0]).single();
      const prevAssignments = prevSched
        ? (await supabase.from('shift_assignments').select('user_id, date, start_time, end_time, shift_template_id').eq('schedule_id', prevSched.id)).data
        : [];
      const { data } = await supabase.functions.invoke('scheduling-ai', {
        body: {
          store_id: selectedStore, week_start: weekStart, employees, shift_templates: shiftTemplates,
          leave_requests: leaves, availability,
          operating_hours: stores.find(s => s.id === selectedStore)?.operating_hours || {},
          working_hour_type: stores.find(s => s.id === selectedStore)?.working_hour_type || 'standard',
          previous_week_assignments: prevAssignments || [],
          user_instructions: ['CRITICAL: Some shifts were removed due to labor law violations. Find alternative staff to cover them.', '', 'GAPS TO FILL:', ...gapLines, '', 'CONFIRMED SHIFTS (do NOT change or remove these):', ...keepLines, '', 'Only add NEW assignments to cover the gaps above. Do NOT duplicate or remove confirmed shifts.'].join('\n'),
        },
      });
      if (data?.assignments?.length) {
        const goodKeys = new Set(goodAssignments.map(a => `${a.user_id}|${a.date}|${a.start_time}`));
        const newOnes = data.assignments.filter((a: any) => !goodKeys.has(`${a.user_id}|${a.date}|${a.start_time}`));
        if (newOnes.length > 0) {
          const toInsert = newOnes.map((a: any) => ({
            schedule_id: schedule.id, user_id: a.user_id, store_id: selectedStore,
            date: a.date, start_time: a.start_time, end_time: a.end_time,
            break_minutes: a.break_minutes || 60, position: a.position,
            is_overtime: a.is_overtime || false, overtime_hours: a.overtime_hours || 0,
          }));
          await supabase.from('shift_assignments').insert(toInsert);
        }
        const { data: refreshed } = await supabase.from('shift_assignments').select('*').eq('schedule_id', schedule.id).order('date');
        setAssignments(refreshed || []);
        const recheck = runValidation(refreshed || [], otContext);
        if (recheck.filter(v => v.severity === 'error').length === 0) {
          setShowViolationModal(false); setViolations([]); setPendingPublishId(null);
        } else {
          setViolations(recheck);
        }
      } else {
        const { data: refreshed } = await supabase.from('shift_assignments').select('*').eq('schedule_id', schedule.id).order('date');
        setAssignments(refreshed || []);
        setViolations(runValidation(refreshed || [], otContext));
      }
    } catch (err: any) {
      alert(zh ? '自動修復失敗: ' + err.message : 'Auto-fix failed: ' + err.message);
    }
    setFixLoading(false);
  };

  const handleFullRegenerate = async () => {
    if (schedule) {
      await supabase.from('shift_assignments').delete().eq('schedule_id', schedule.id);
      await supabase.from('schedules').delete().eq('id', schedule.id);
      setSchedule(null); setAssignments([]);
    }
    setShowViolationModal(false); setViolations([]); setViolationAcknowledged(false); setPendingPublishId(null);
    await runAiSchedule();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const [targetUserId, targetDate] = overId.split('|');
    if (activeId.startsWith('tmpl::')) {
      if (targetUserId === 'trash') return;
      await addShiftFromTemplate(activeId.replace('tmpl::', ''), targetUserId, targetDate);
      return;
    }
    if (!schedule || schedule.status === 'published') return;
    const assignment = assignments.find(a => a.id === activeId);
    if (!assignment) return;
    if (targetUserId === 'trash') {
      await supabase.from('shift_assignments').delete().eq('id', activeId);
      setAssignments(prev => prev.filter(a => a.id !== activeId));
      return;
    }
    if (assignment.user_id === targetUserId && assignment.date === targetDate) return;
    if (ctrlHeld) {
      const { data: copied } = await supabase.from('shift_assignments').insert({
        schedule_id: assignment.schedule_id, user_id: targetUserId, store_id: selectedStore,
        date: targetDate, start_time: assignment.start_time, end_time: assignment.end_time,
        break_minutes: assignment.break_minutes, shift_template_id: assignment.shift_template_id,
        is_overtime: assignment.is_overtime, overtime_hours: assignment.overtime_hours,
        position: assignment.position, status: 'scheduled',
      }).select().single();
      if (copied) setAssignments(prev => [...prev, copied]);
    } else {
      await supabase.from('shift_assignments').update({ user_id: targetUserId, date: targetDate }).eq('id', activeId);
      setAssignments(prev => prev.map(a => a.id === activeId ? { ...a, user_id: targetUserId, date: targetDate } : a));
    }
  };

  const saveAsTemplate = async () => {
    if (!templateName.trim() || !assignments.length) return;
    const weekDts = getWeekDates();
    const mondayDate = new Date(weekDts[0] + 'T00:00:00');
    const templateAssignments = assignments.map(a => {
      const aDate = new Date(a.date + 'T00:00:00');
      const dayOfWeek = Math.round((aDate.getTime() - mondayDate.getTime()) / (1000 * 60 * 60 * 24));
      return { day_of_week: dayOfWeek, user_id: a.user_id, start_time: a.start_time, end_time: a.end_time, break_minutes: a.break_minutes, shift_template_id: a.shift_template_id };
    });
    await supabase.from('schedule_templates').insert({
      organization_id: orgId, store_id: selectedStore,
      name: templateName.trim(), description: templateDesc.trim() || null,
      assignments: templateAssignments, created_by: currentUser?.id,
    });
    setShowSaveTemplate(false); setTemplateName(''); setTemplateDesc('');
    const { data } = await supabase.from('schedule_templates').select('id, name, description, assignments')
      .eq('store_id', selectedStore).eq('organization_id', orgId).order('created_at', { ascending: false });
    setScheduleTemplates(data || []);
  };

  const loadTemplate = async (templateId: string) => {
    const tmpl = scheduleTemplates.find(t => t.id === templateId);
    if (!tmpl) return;
    let schedId = schedule?.id;
    if (!schedId) {
      const { data: sched } = await supabase.from('schedules').insert({
        store_id: selectedStore, organization_id: orgId, week_start: weekStart,
        status: 'draft', generated_by: 'manual',
        notes: zh ? `從範本「${tmpl.name}」載入` : `Loaded from template "${tmpl.name}"`,
      }).select().single();
      if (!sched) return;
      schedId = sched.id; setSchedule(sched);
    }
    const weekDts = getWeekDates();
    const toInsert = (tmpl.assignments as any[]).map((a: any) => ({
      schedule_id: schedId!, user_id: a.user_id, store_id: selectedStore,
      date: weekDts[a.day_of_week] || weekDts[0], start_time: a.start_time, end_time: a.end_time,
      break_minutes: a.break_minutes || 60, shift_template_id: a.shift_template_id || null,
    })).filter(a => employees.some(e => e.id === a.user_id));
    if (toInsert.length > 0) await supabase.from('shift_assignments').insert(toInsert);
    const { data: assn } = await supabase.from('shift_assignments').select('*').eq('schedule_id', schedId).order('date');
    setAssignments(assn || []);
  };

  const handleExportExcel = () => {
    exportScheduleExcel(assignments, employees, shiftTemplates, stores, selectedStore, weekStart, zh);
  };

  const handleImportExcel = (file: File) => {
    importScheduleExcel(file, employees, schedule, selectedStore, orgId, weekStart, zh, setSchedule, setAssignments);
  };

  // ============ RENDER ============

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>📅 {t('schedule.title')}</h1>
        <p className="page-subtitle">{t('schedule.subtitle')}</p>
      </div>

      {/* Store selector + tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="input-field" style={{ maxWidth: '240px' }} value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
          {stores.map(s => <option key={s.id} value={s.id}>🏪 {s.name}</option>)}
        </select>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          <button className={`tab-item ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>📅 {t('schedule.calendar')}</button>
          <button className={`tab-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>⚙️ {t('schedule.store_settings')}</button>
          <button className={`tab-item ${tab === 'preferences' ? 'active' : ''}`} onClick={() => setTab('preferences')}>👤 {t('schedule.preferences')}</button>
          <button className={`tab-item ${tab === 'swaps' ? 'active' : ''}`} onClick={() => setTab('swaps')}>🔄 {zh ? '換班申請' : 'Shift Swaps'}</button>
          <button className={`tab-item ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>📊 {zh ? '分析報表' : 'Analytics'}</button>
        </div>
      </div>

      {loading ? <p className="loading-pulse">{t('common.loading')}</p> : tab === 'calendar' ? (
        <ScheduleCalendarTab
          zh={zh} stores={stores} selectedStore={selectedStore}
          shiftTemplates={shiftTemplates} employees={employees}
          schedule={schedule} assignments={assignments}
          weekDates={weekDates} dayNames={dayNames}
          scheduleTemplates={scheduleTemplates} forecasts={forecasts}
          forecastLoading={forecastLoading} showAiPanel={showAiPanel}
          aiInstructions={aiInstructions} aiLoading={aiLoading}
          copyLoading={copyLoading} calendarView={calendarView}
          ctrlHeld={ctrlHeld} quickAddCell={quickAddCell}
          activeDragId={activeDragId}
          onChangeWeek={changeWeek} onSetCalendarView={setCalendarView}
          onSetShowAiPanel={setShowAiPanel} onSetAiInstructions={setAiInstructions}
          onRunAiSchedule={runAiSchedule} onCopyPreviousWeek={copyPreviousWeek}
          onLoadTemplate={loadTemplate} onPublishSchedule={() => publishSchedule()}
          onSetShowSaveTemplate={setShowSaveTemplate}
          onExportExcel={handleExportExcel} onImportExcel={handleImportExcel}
          onFetchForecast={fetchForecast} onDragEnd={handleDragEnd}
          onSetActiveDragId={setActiveDragId} onSetQuickAddCell={setQuickAddCell}
          onAddShiftFromTemplate={addShiftFromTemplate}
        />
      ) : tab === 'settings' ? (
        <StoreSettingsTab
          zh={zh} stores={stores} selectedStore={selectedStore}
          shiftTemplates={shiftTemplates} dayNames={dayNames}
          onSetStores={setStores} onSetShiftTemplates={setShiftTemplates}
          allSkills={employeeSkills}
        />
      ) : tab === 'preferences' ? (
        <PreferencesTab
          zh={zh} employees={employees} availability={availability}
          dayNames={dayNames} onSetAvailability={setAvail}
        />
      ) : tab === 'swaps' ? (
        <ShiftSwapsTab
          zh={zh} employees={employees} assignments={assignments}
          schedule={schedule} swapRequests={swapRequests}
          swapLoading={swapLoading} swapSaving={swapSaving}
          showCreateSwap={showCreateSwap} showOpenShiftForm={showOpenShiftForm}
          swapForm={swapForm} openShiftForm={openShiftForm}
          currentUserId={currentUser?.id}
          onSetShowCreateSwap={setShowCreateSwap} onSetShowOpenShiftForm={setShowOpenShiftForm}
          onSetSwapForm={setSwapForm} onSetOpenShiftForm={setOpenShiftForm}
          onCreateSwap={createSwap} onCreateOpenShift={createOpenShift}
          onClaimOpenShift={claimOpenShift} onUpdateSwapStatus={updateSwapStatus}
        />
      ) : (
        <AnalyticsTab zh={zh} selectedStore={selectedStore} orgId={orgId} />
      )}

      {showSaveTemplate && (
        <SaveTemplateModal zh={zh} assignmentCount={assignments.length}
          templateName={templateName} templateDesc={templateDesc}
          onSetTemplateName={setTemplateName} onSetTemplateDesc={setTemplateDesc}
          onSave={saveAsTemplate} onClose={() => setShowSaveTemplate(false)} />
      )}

      {showViolationModal && (
        <ViolationModal zh={zh} violations={violations} fixLoading={fixLoading}
          aiLoading={aiLoading} violationAcknowledged={violationAcknowledged}
          pendingPublishId={pendingPublishId}
          onSetViolationAcknowledged={setViolationAcknowledged}
          onAutoFix={handleAutoFix} onRegenerate={handleFullRegenerate}
          onForcePublish={(id) => { setShowViolationModal(false); setViolationAcknowledged(false); publishSchedule(id, true); }}
          onClose={() => { setShowViolationModal(false); setViolationAcknowledged(false); setPendingPublishId(null); }} />
      )}
    </div>
  );
}
