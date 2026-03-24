import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface Store { id: string; name: string; store_code: string; operating_hours: any; store_type: string; }
interface ShiftTemplate { id: string; store_id: string; name: string; start_time: string; end_time: string; break_minutes: number; color: string; }
interface Employee { id: string; name: string; position: string | null; employee_type: string; max_hours_per_week: number; store_id: string | null; }
interface ShiftAssignment { id: string; schedule_id: string; user_id: string; date: string; start_time: string; end_time: string; break_minutes: number; position: string | null; is_overtime: boolean; overtime_hours: number; status: string; shift_template_id: string | null; }
interface Schedule { id: string; store_id: string; week_start: string; status: string; generated_by: string; total_labor_hours: number; estimated_cost: number; violations: any[]; }
interface Availability { id: string; user_id: string; day_of_week: number; availability: string; notes: string | null; }
interface LaborViolation {
  employee_id: string;
  employee_name: string;
  type: 'consecutive_days' | 'short_rest';
  message: string;
  severity: 'warning' | 'error';
}
interface ShiftSwapRequest {
  id: string;
  organization_id: string;
  requester_id: string;
  target_id: string | null;
  requester_shift_id: string;
  target_shift_id: string | null;
  swap_type: 'swap' | 'give_away';
  reason: string | null;
  status: 'pending' | 'target_accepted' | 'approved' | 'rejected' | 'cancelled';
  manager_id: string | null;
  manager_note: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export function Scheduling() {
    const zh = getLocale() === 'zh-TW';
    const { orgId, currentUser } = useOrg();
    const [tab, setTab] = useState<'calendar' | 'settings' | 'preferences' | 'swaps'>('calendar');
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

    // Shift swap state
    const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>([]);
    const [swapLoading, setSwapLoading] = useState(false);
    const [showCreateSwap, setShowCreateSwap] = useState(false);
    const [swapForm, setSwapForm] = useState({ requester_id: '', requester_shift_id: '', target_id: '', swap_type: 'swap' as 'swap' | 'give_away', reason: '' });
    const [swapSaving, setSwapSaving] = useState(false);

    const dayNames = zh ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const loadSwaps = async () => {
        if (!orgId) return;
        setSwapLoading(true);
        const { data } = await supabase.from('shift_swap_requests').select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });
        setSwapRequests(data || []);
        setSwapLoading(false);
    };

    const createSwap = async () => {
        if (!swapForm.requester_id || !swapForm.requester_shift_id) return;
        setSwapSaving(true);
        await supabase.from('shift_swap_requests').insert({
            organization_id: orgId,
            requester_id: swapForm.requester_id,
            requester_shift_id: swapForm.requester_shift_id,
            target_id: swapForm.target_id || null,
            swap_type: swapForm.swap_type,
            reason: swapForm.reason || null,
            status: 'pending',
        });
        setSwapSaving(false);
        setShowCreateSwap(false);
        setSwapForm({ requester_id: '', requester_shift_id: '', target_id: '', swap_type: 'swap', reason: '' });
        loadSwaps();
    };

    const updateSwapStatus = async (id: string, status: string, note?: string) => {
        const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
        if (status === 'approved') {
            updates.manager_id = currentUser?.id ?? null;
            updates.approved_at = new Date().toISOString();
        }
        if (note) updates.manager_note = note;
        await supabase.from('shift_swap_requests').update(updates).eq('id', id);
        loadSwaps();
    };

    const getWeekDates = (): string[] => {
        const start = new Date(weekStart + 'T00:00:00');
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start); d.setDate(d.getDate() + i);
            return d.toISOString().split('T')[0];
        });
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
            supabase.from('users').select('id, name, position, employee_type, max_hours_per_week, store_id').eq('store_id', selectedStore).eq('status', 'active'),
            supabase.from('schedules').select('*').eq('store_id', selectedStore).eq('week_start', weekStart).single(),
            supabase.from('employee_availability').select('*').eq('store_id', selectedStore),
            supabase.from('leave_requests').select('*').eq('status', 'approved').lte('start_date', weekEndStr).gte('end_date', weekStart)
        ]).then(([shiftR, empR, schedR, availR, leaveR]) => {
            setShiftTemplates(shiftR.data || []);
            setEmployees(empR.data || []);
            setSchedule(schedR.data || null);
            setAvailability(availR.data || []);
            setLeaves(leaveR.data || []);
            if (schedR.data) {
                supabase.from('shift_assignments').select('*').eq('schedule_id', schedR.data.id).order('date').then(r => setAssignments(r.data || []));
            } else {
                setAssignments([]);
            }
        });
    }, [selectedStore, weekStart]);

    useEffect(() => { if (tab === 'swaps') loadSwaps(); }, [tab, orgId]);

    const changeWeek = (delta: number) => {
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + delta * 7);
        setWeekStart(d.toISOString().split('T')[0]);
    };

    const runAiSchedule = async () => {
        setAiLoading(true);
        try {
            const { data } = await supabase.functions.invoke('scheduling-ai', {
                body: {
                    store_id: selectedStore,
                    week_start: weekStart,
                    employees,
                    shift_templates: shiftTemplates,
                    leave_requests: leaves,
                    user_instructions: aiInstructions.trim() || undefined,
                }
            });
            if (data?.assignments) {
                const { data: sched } = await supabase.from('schedules').insert({
                    store_id: selectedStore, organization_id: orgId,
                    week_start: weekStart, status: 'draft', generated_by: 'ai',
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
            // Calculate previous week start
            const prevStart = new Date(weekStart + 'T00:00:00');
            prevStart.setDate(prevStart.getDate() - 7);
            const prevStartStr = prevStart.toISOString().split('T')[0];

            // Find previous week's schedule
            const { data: prevSchedule } = await supabase.from('schedules').select('*')
                .eq('store_id', selectedStore).eq('week_start', prevStartStr).single();

            if (!prevSchedule) {
                alert(zh ? '上週沒有排班記錄可以複製。' : 'No schedule found for the previous week to copy.');
                setCopyLoading(false);
                return;
            }

            // Get previous week's assignments
            const { data: prevAssignments } = await supabase.from('shift_assignments')
                .select('*').eq('schedule_id', prevSchedule.id);

            if (!prevAssignments || prevAssignments.length === 0) {
                alert(zh ? '上週排班沒有班次可複製。' : 'Previous week schedule has no shift assignments.');
                setCopyLoading(false);
                return;
            }

            // Create a new schedule for the current week
            const { data: newSched } = await supabase.from('schedules').insert({
                store_id: selectedStore,
                organization_id: orgId,
                week_start: weekStart,
                status: 'draft',
                generated_by: 'manual',
                total_labor_hours: prevSchedule.total_labor_hours || 0,
                estimated_cost: prevSchedule.estimated_cost || 0,
                notes: zh ? `複製自 ${prevStartStr} 週排班` : `Copied from week of ${prevStartStr}`,
            }).select().single();

            if (!newSched) {
                alert(zh ? '建立排班失敗。' : 'Failed to create schedule.');
                setCopyLoading(false);
                return;
            }

            // Shift dates forward by 7 days and insert new assignments
            const toInsert = prevAssignments.map((a: any) => {
                const oldDate = new Date(a.date + 'T00:00:00');
                oldDate.setDate(oldDate.getDate() + 7);
                const newDate = oldDate.toISOString().split('T')[0];
                return {
                    schedule_id: newSched.id,
                    user_id: a.user_id,
                    store_id: selectedStore,
                    date: newDate,
                    start_time: a.start_time,
                    end_time: a.end_time,
                    break_minutes: a.break_minutes,
                    position: a.position,
                    shift_template_id: a.shift_template_id,
                    is_overtime: a.is_overtime || false,
                    overtime_hours: a.overtime_hours || 0,
                    status: 'scheduled',
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
            const found = checkLaborLawViolations(assignments);
            if (found.length > 0) {
                setViolations(found);
                setPendingPublishId(targetId);
                setShowViolationModal(true);
                return;
            }
        }
        await supabase.from('schedules').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', targetId);
        setSchedule(prev => prev ? { ...prev, status: 'published' } : prev);
    };

    const setAvail = async (userId: string, dow: number, val: string) => {
        const existing = availability.find(a => a.user_id === userId && a.day_of_week === dow);
        if (existing) {
            await supabase.from('employee_availability').update({ availability: val }).eq('id', existing.id);
        } else {
            await supabase.from('employee_availability').insert({
                user_id: userId, store_id: selectedStore, day_of_week: dow, availability: val,
            });
        }
        const { data } = await supabase.from('employee_availability').select('*').eq('store_id', selectedStore);
        setAvailability(data || []);
    };

    function checkLaborLawViolations(assignmentList: any[]): LaborViolation[] {
        const violations: LaborViolation[] = [];

        // Group assignments by user_id
        const byUser: Record<string, any[]> = {};
        for (const a of assignmentList) {
            if (!byUser[a.user_id]) byUser[a.user_id] = [];
            byUser[a.user_id].push(a);
        }

        for (const [userId, userAssignments] of Object.entries(byUser)) {
            // Sort by date
            const sorted = [...userAssignments].sort((a, b) => a.date.localeCompare(b.date));
            const empName = sorted[0]?.user?.name || employees.find(e => e.id === userId)?.name || userId;

            // Check 七休一 rule: no more than 6 consecutive work days
            let consecutive = 1;
            for (let i = 1; i < sorted.length; i++) {
                const prev = new Date(sorted[i - 1].date);
                const curr = new Date(sorted[i].date);
                const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
                if (diffDays === 1) {
                    consecutive++;
                    if (consecutive >= 7) {
                        violations.push({
                            employee_id: userId,
                            employee_name: empName,
                            type: 'consecutive_days',
                            message: `${empName}: ${consecutive} 天連續上班 (七休一違規) / ${consecutive} consecutive days (violates mandatory rest day)`,
                            severity: 'error',
                        });
                    }
                } else {
                    consecutive = 1;
                }
            }

            // Check 11-hour rest interval between shifts
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];
                if (prev.end_time && curr.start_time) {
                    const prevEnd = new Date(`${prev.date}T${prev.end_time}`);
                    const currStart = new Date(`${curr.date}T${curr.start_time}`);
                    const restHours = (currStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);
                    if (restHours >= 0 && restHours < 11) {
                        violations.push({
                            employee_id: userId,
                            employee_name: empName,
                            type: 'short_rest',
                            message: `${empName}: ${prev.date} 至 ${curr.date} 休息僅 ${restHours.toFixed(1)} 小時 (需至少 11 小時) / Rest interval ${restHours.toFixed(1)}h (min 11h required)`,
                            severity: 'warning',
                        });
                    }
                }
            }
        }

        return violations;
    }

    const weekDates = getWeekDates();
    const templateMap = Object.fromEntries(shiftTemplates.map(s => [s.id, s]));
    const getAssignmentsForCell = (userId: string, date: string) => assignments.filter(a => a.user_id === userId && a.date === date);

    // New shift template form state
    const [newShift, setNewShift] = useState({ name: '', start_time: '09:00', end_time: '17:00', break_minutes: '60', color: '#6366f1' });
    const addShiftTemplate = async () => {
        if (!newShift.name) return;
        await supabase.from('shift_templates').insert({
            store_id: selectedStore, name: newShift.name, start_time: newShift.start_time,
            end_time: newShift.end_time, break_minutes: Number(newShift.break_minutes), color: newShift.color,
        });
        setNewShift({ name: '', start_time: '09:00', end_time: '17:00', break_minutes: '60', color: '#6366f1' });
        const { data } = await supabase.from('shift_templates').select('*').eq('store_id', selectedStore).order('start_time');
        setShiftTemplates(data || []);
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>📅 {t('schedule.title')}</h1>
                <p className="page-subtitle">{t('schedule.subtitle')}</p>
            </div>

            {/* Store selector */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="input-field" style={{ maxWidth: '240px' }} value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
                    {stores.map(s => <option key={s.id} value={s.id}>🏪 {s.name}</option>)}
                </select>
                <div className="tab-bar" style={{ marginBottom: 0 }}>
                    <button className={`tab-item ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>📅 {t('schedule.calendar')}</button>
                    <button className={`tab-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>⚙️ {t('schedule.store_settings')}</button>
                    <button className={`tab-item ${tab === 'preferences' ? 'active' : ''}`} onClick={() => setTab('preferences')}>👤 {t('schedule.preferences')}</button>
                    <button className={`tab-item ${tab === 'swaps' ? 'active' : ''}`} onClick={() => setTab('swaps')}>🔄 {zh ? '換班申請' : 'Shift Swaps'}</button>
                </div>
            </div>

            {loading ? <p className="loading-pulse">{t('common.loading')}</p> : tab === 'calendar' ? (
                /* ==================== CALENDAR TAB ==================== */
                <div>
                    {/* Week navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button className="btn btn-sm btn-secondary" onClick={() => changeWeek(-1)}>◀</button>
                            <span style={{ fontWeight: 600, fontSize: '15px', minWidth: '200px', textAlign: 'center' }}>
                                {weekDates[0]} ~ {weekDates[6]}
                            </span>
                            <button className="btn btn-sm btn-secondary" onClick={() => changeWeek(1)}>▶</button>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {schedule && (
                                <span className="badge" style={{ background: schedule.status === 'published' ? '#22c55e' : '#f59e0b', fontSize: '12px', padding: '3px 10px' }}>
                                    {schedule.status === 'published' ? (zh ? '✅ 已發佈' : '✅ Published') : (zh ? '📝 草稿' : '📝 Draft')}
                                </span>
                            )}
                            {schedule && schedule.status === 'draft' && (
                                <button className="btn btn-sm btn-primary" onClick={() => publishSchedule()}>📤 {t('schedule.publish')}</button>
                            )}
                            {!schedule && (
                                <button className="btn btn-sm btn-secondary" onClick={copyPreviousWeek} disabled={copyLoading}>
                                    {copyLoading ? '⏳...' : (zh ? '📋 複製上週' : '📋 Copy Last Week')}
                                </button>
                            )}
                            <button className="btn btn-sm" style={{ background: showAiPanel ? 'var(--accent-indigo)' : 'var(--bg-secondary)', color: showAiPanel ? '#fff' : 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} onClick={() => setShowAiPanel(!showAiPanel)}>
                                💡 {zh ? '排班條件' : 'AI Criteria'}
                            </button>
                            <button className="btn btn-primary" onClick={runAiSchedule} disabled={aiLoading}>
                                {aiLoading ? '⏳...' : '🤖 ' + t('schedule.ai_generate')}
                            </button>
                        </div>
                    </div>

                    {/* AI Criteria Panel */}
                    {showAiPanel && (
                        <div className="card" style={{ marginBottom: '16px', padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--accent-indigo)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <span style={{ fontSize: '14px', fontWeight: 600 }}>💡 {zh ? 'AI 排班條件 (自訂指令)' : 'AI Scheduling Criteria (Custom Instructions)'}</span>
                            </div>
                            <textarea
                                className="input-field"
                                value={aiInstructions}
                                onChange={e => setAiInstructions(e.target.value)}
                                placeholder={zh
                                    ? '輸入自訂排班條件，例如：\n• 週末至少安排 3 人\n• 王小明不要排早班\n• Amy 每週最多排 3 天\n• 確保每天都有資深員工值班'
                                    : 'Enter custom scheduling criteria, e.g.:\n• At least 3 staff on weekends\n• Do not schedule Amy on morning shifts\n• Max 3 days per week for part-timers\n• Ensure one senior staff per day'}
                                rows={4}
                                style={{ width: '100%', resize: 'vertical', fontSize: '13px' }}
                            />
                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                {zh ? '這些條件會傳送給 AI 排班引擎，用來產生更符合需求的班表。' : 'These instructions are passed to the AI scheduler to generate a schedule that matches your criteria.'}
                            </div>
                        </div>
                    )}

                    {/* Summary bar */}
                    {schedule && (
                        <div className="card" style={{ display: 'flex', gap: '24px', padding: '12px 18px', marginBottom: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
                            <span>⏱ {zh ? '總工時' : 'Total'}: <b>{schedule.total_labor_hours}h</b></span>
                            <span>💰 {zh ? '預估成本' : 'Est. Cost'}: <b>NT${Math.round(schedule.estimated_cost).toLocaleString()}</b></span>
                            <span>👥 {zh ? '員工' : 'Staff'}: <b>{employees.length}</b></span>
                            {(schedule.violations as any[])?.length > 0 && (
                                <span style={{ color: '#f43f5e' }}>⚠️ {(schedule.violations as any[]).length} {zh ? '個違規' : 'violations'}</span>
                            )}
                        </div>
                    )}

                    {/* Schedule grid */}
                    <div className="card" style={{ overflowX: 'auto', padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-primary)' }}>
                                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', minWidth: '120px' }}>
                                        {zh ? '員工' : 'Employee'}
                                    </th>
                                    {weekDates.map((d, i) => (
                                        <th key={d} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', minWidth: '100px' }}>
                                            <div>{dayNames[i]}</div>
                                            <div style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text-muted)' }}>{d.slice(5)}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {employees.length === 0 ? (
                                    <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        {zh ? '此門市尚無員工。請在「員工管理」中指派員工至此門市。' : 'No employees assigned to this store.'}
                                    </td></tr>
                                ) : employees.map(emp => (
                                    <tr key={emp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td style={{ padding: '8px 14px' }}>
                                            <div style={{ fontWeight: 600 }}>{emp.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {emp.position || '—'} · {emp.max_hours_per_week}h
                                            </div>
                                        </td>
                                        {weekDates.map(d => {
                                            const cellAssignments = getAssignmentsForCell(emp.id, d);
                                            return (
                                                <td key={d} style={{ padding: '4px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                                                    {cellAssignments.map(a => {
                                                        const tmpl = a.shift_template_id ? templateMap[a.shift_template_id] : null;
                                                        return (
                                                            <div key={a.id} style={{
                                                                background: tmpl?.color || '#6366f1', color: '#fff',
                                                                borderRadius: '4px', padding: '3px 6px', fontSize: '11px',
                                                                marginBottom: '2px', fontWeight: 500,
                                                            }}>
                                                                {a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}
                                                                {a.is_overtime && <span style={{ marginLeft: '3px' }}>⚠️</span>}
                                                            </div>
                                                        );
                                                    })}
                                                    {cellAssignments.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            ) : tab === 'settings' ? (
                /* ==================== STORE SETTINGS TAB ==================== */
                <div style={{ display: 'grid', gap: '20px' }}>
                    {/* Shift templates */}
                    <div className="card">
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                            🕐 {zh ? '班別設定' : 'Shift Templates'}
                        </h3>
                        {shiftTemplates.map(s => (
                            <div key={s.id} style={{
                                display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px',
                                background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', marginBottom: '6px',
                            }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                                <span style={{ fontWeight: 600, minWidth: '60px' }}>{s.name}</span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{zh ? '休息' : 'Break'}: {s.break_minutes}{zh ? '分' : 'min'}</span>
                                <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '2px 6px', color: 'var(--accent-red)' }}
                                    onClick={async () => { await supabase.from('shift_templates').delete().eq('id', s.id); const { data } = await supabase.from('shift_templates').select('*').eq('store_id', selectedStore).order('start_time'); setShiftTemplates(data || []); }}>✕</button>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                            <input className="input-field" value={newShift.name} onChange={e => setNewShift({ ...newShift, name: e.target.value })} placeholder={zh ? '班別名稱' : 'Shift name'} style={{ width: '100px' }} />
                            <input className="input-field" type="time" value={newShift.start_time} onChange={e => setNewShift({ ...newShift, start_time: e.target.value })} style={{ width: '100px' }} />
                            <input className="input-field" type="time" value={newShift.end_time} onChange={e => setNewShift({ ...newShift, end_time: e.target.value })} style={{ width: '100px' }} />
                            <input className="input-field" type="number" value={newShift.break_minutes} onChange={e => setNewShift({ ...newShift, break_minutes: e.target.value })} style={{ width: '70px' }} placeholder={zh ? '休息' : 'Break'} />
                            <input className="input-field" type="color" value={newShift.color} onChange={e => setNewShift({ ...newShift, color: e.target.value })} style={{ width: '42px', padding: '2px' }} />
                            <button className="btn btn-primary btn-sm" onClick={addShiftTemplate}>➕</button>
                        </div>
                    </div>

                    {/* Operating hours */}
                    <div className="card">
                        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>🏪 {zh ? '營業時間' : 'Operating Hours'}</h3>
                        {(() => {
                            const store = stores.find(s => s.id === selectedStore);
                            const hours = store?.operating_hours || {};
                            const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                            return dayKeys.map((dk, i) => (
                                <div key={dk} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <span style={{ fontWeight: 600, width: '36px', textAlign: 'center' }}>{dayNames[i]}</span>
                                    <span style={{ fontSize: '13px', color: hours[dk]?.open === 'closed' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                        {hours[dk]?.open === 'closed' ? (zh ? '休息日' : 'Closed') : `${hours[dk]?.open || '—'} – ${hours[dk]?.close || '—'}`}
                                    </span>
                                </div>
                            ));
                        })()}
                    </div>
                </div>

            ) : tab === 'preferences' ? (
                /* ==================== PREFERENCES TAB ==================== */
                <div className="card" style={{ overflowX: 'auto', padding: '0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-primary)' }}>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{zh ? '員工' : 'Employee'}</th>
                                {dayNames.map((d, i) => (
                                    <th key={i} style={{ padding: '10px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>{d}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {employees.length === 0 ? (
                                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {zh ? '此門市尚無員工' : 'No employees for this store'}
                                </td></tr>
                            ) : employees.map(emp => (
                                <tr key={emp.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    <td style={{ padding: '8px 14px', fontWeight: 600 }}>{emp.name}</td>
                                    {[1, 2, 3, 4, 5, 6, 0].map(dow => {
                                        const av = availability.find(a => a.user_id === emp.id && a.day_of_week === dow);
                                        const val = av?.availability || 'available';
                                        const icon = val === 'available' ? '✅' : val === 'preferred' ? '⭐' : '❌';
                                        const nextVal = val === 'available' ? 'preferred' : val === 'preferred' ? 'unavailable' : 'available';
                                        return (
                                            <td key={dow} style={{ padding: '6px', textAlign: 'center' }}>
                                                <button style={{
                                                    background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px',
                                                    padding: '6px 12px', cursor: 'pointer', fontSize: '16px',
                                                    opacity: val === 'unavailable' ? 0.4 : 1,
                                                }} onClick={() => setAvail(emp.id, dow, nextVal)} title={val}>
                                                    {icon}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '16px' }}>
                        <span>✅ {zh ? '可上班' : 'Available'}</span>
                        <span>⭐ {zh ? '偏好' : 'Preferred'}</span>
                        <span>❌ {zh ? '不可上班' : 'Unavailable'}</span>
                        <span style={{ marginLeft: 'auto' }}>{zh ? '點擊切換' : 'Click to toggle'}</span>
                    </div>
                </div>
            ) : (
                /* ==================== SHIFT SWAPS TAB ==================== */
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>🔄 {zh ? '換班 / 讓班申請' : 'Shift Swap / Give-away Requests'}</span>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowCreateSwap(true)}>
                            + {zh ? '新增申請' : 'New Request'}
                        </button>
                    </div>

                    {swapLoading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{zh ? '載入中...' : 'Loading...'}</div>
                    ) : swapRequests.length === 0 ? (
                        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔄</div>
                            {zh ? '目前無換班申請' : 'No shift swap requests'}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {swapRequests.map(sr => {
                                const requester = employees.find(e => e.id === sr.requester_id);
                                const target = sr.target_id ? employees.find(e => e.id === sr.target_id) : null;
                                const reqShift = assignments.find(a => a.id === sr.requester_shift_id);
                                const statusColors: Record<string, { bg: string; color: string }> = {
                                    pending:         { bg: '#fef9c3', color: '#a16207' },
                                    target_accepted: { bg: '#dbeafe', color: '#1d4ed8' },
                                    approved:        { bg: '#dcfce7', color: '#15803d' },
                                    rejected:        { bg: '#fee2e2', color: '#b91c1c' },
                                    cancelled:       { bg: '#f3f4f6', color: '#6b7280' },
                                };
                                const statusLabels: Record<string, { zh: string; en: string }> = {
                                    pending:         { zh: '待處理', en: 'Pending' },
                                    target_accepted: { zh: '對方已接受', en: 'Accepted' },
                                    approved:        { zh: '已核准', en: 'Approved' },
                                    rejected:        { zh: '已駁回', en: 'Rejected' },
                                    cancelled:       { zh: '已取消', en: 'Cancelled' },
                                };
                                const sc = statusColors[sr.status] ?? statusColors.pending;
                                const sl = statusLabels[sr.status] ?? statusLabels.pending;

                                return (
                                    <div key={sr.id} className="card" style={{ padding: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: 600 }}>{requester?.name ?? sr.requester_id.slice(0, 8)}</span>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                        {sr.swap_type === 'swap' ? (zh ? '↔ 換班' : '↔ Swap') : (zh ? '→ 讓班' : '→ Give away')}
                                                    </span>
                                                    {target && <span style={{ fontWeight: 600 }}>→ {target.name}</span>}
                                                    {!target && sr.swap_type === 'give_away' && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>({zh ? '開放認領' : 'Open'})</span>}
                                                </div>
                                                {reqShift && (
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                        📅 {reqShift.date} · {reqShift.start_time?.slice(0, 5)}–{reqShift.end_time?.slice(0, 5)}
                                                    </div>
                                                )}
                                                {sr.reason && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{zh ? '原因' : 'Reason'}: {sr.reason}</div>}
                                                {sr.manager_note && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{zh ? '主管備註' : 'Manager note'}: {sr.manager_note}</div>}
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    {new Date(sr.created_at).toLocaleString(zh ? 'zh-TW' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                                <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                                                    {zh ? sl.zh : sl.en}
                                                </span>
                                                {(sr.status === 'pending' || sr.status === 'target_accepted') && (
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button className="btn btn-sm" style={{ fontSize: '11px', padding: '2px 8px', background: '#dcfce7', color: '#15803d', border: 'none' }}
                                                            onClick={() => updateSwapStatus(sr.id, 'approved')}>
                                                            ✓ {zh ? '核准' : 'Approve'}
                                                        </button>
                                                        <button className="btn btn-sm" style={{ fontSize: '11px', padding: '2px 8px', background: '#fee2e2', color: '#b91c1c', border: 'none' }}
                                                            onClick={() => updateSwapStatus(sr.id, 'rejected')}>
                                                            ✕ {zh ? '駁回' : 'Reject'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Create Swap Modal */}
                    {showCreateSwap && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                            onClick={e => { if (e.target === e.currentTarget) setShowCreateSwap(false); }}>
                            <div className="card" style={{ padding: '24px', width: '100%', maxWidth: '480px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px' }}>{zh ? '新增換班申請' : 'New Shift Swap Request'}</h3>
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                                            {zh ? '申請人 *' : 'Requester *'}
                                        </label>
                                        <select className="input-field" value={swapForm.requester_id} onChange={e => setSwapForm(f => ({ ...f, requester_id: e.target.value }))}>
                                            <option value="">{zh ? '選擇員工' : 'Select'}</option>
                                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                                            {zh ? '要換的班次 *' : 'Shift to swap *'}
                                        </label>
                                        <select className="input-field" value={swapForm.requester_shift_id} onChange={e => setSwapForm(f => ({ ...f, requester_shift_id: e.target.value }))}>
                                            <option value="">{zh ? '選擇班次' : 'Select shift'}</option>
                                            {assignments.filter(a => a.user_id === swapForm.requester_id).map(a => (
                                                <option key={a.id} value={a.id}>{a.date} {a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                                            {zh ? '類型' : 'Type'}
                                        </label>
                                        <select className="input-field" value={swapForm.swap_type} onChange={e => setSwapForm(f => ({ ...f, swap_type: e.target.value as 'swap' | 'give_away' }))}>
                                            <option value="swap">{zh ? '換班 (與他人交換)' : 'Swap (exchange with someone)'}</option>
                                            <option value="give_away">{zh ? '讓班 (放棄此班)' : 'Give away (release shift)'}</option>
                                        </select>
                                    </div>
                                    {swapForm.swap_type === 'swap' && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                                                {zh ? '換班對象' : 'Swap with'}
                                            </label>
                                            <select className="input-field" value={swapForm.target_id} onChange={e => setSwapForm(f => ({ ...f, target_id: e.target.value }))}>
                                                <option value="">{zh ? '選擇員工 (可留空)' : 'Select (optional)'}</option>
                                                {employees.filter(e => e.id !== swapForm.requester_id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>
                                            {zh ? '原因' : 'Reason'}
                                        </label>
                                        <textarea className="input-field" rows={2} value={swapForm.reason} onChange={e => setSwapForm(f => ({ ...f, reason: e.target.value }))} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                                    <button className="btn btn-secondary" onClick={() => setShowCreateSwap(false)}>{zh ? '取消' : 'Cancel'}</button>
                                    <button className="btn btn-primary" onClick={createSwap} disabled={swapSaving || !swapForm.requester_id || !swapForm.requester_shift_id}>
                                        {swapSaving ? '...' : (zh ? '送出' : 'Submit')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Labor Law Violation Warning Modal */}
            {showViolationModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="card" style={{ maxWidth: '560px', width: '90%', padding: '28px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <h3 style={{ marginBottom: '16px', color: '#f59e0b' }}>
                            ⚠️ {zh ? '勞基法違規警示' : 'Labor Law Violations Detected'}
                        </h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            {zh ? '排班中發現以下違規，發布前請確認：' : 'The following violations were found in this schedule:'}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                            {violations.map((v, i) => (
                                <div key={i} style={{
                                    padding: '10px 14px',
                                    borderRadius: '6px',
                                    background: v.severity === 'error' ? 'rgba(244,63,94,0.1)' : 'rgba(245,158,11,0.1)',
                                    borderLeft: `3px solid ${v.severity === 'error' ? '#f43f5e' : '#f59e0b'}`,
                                    fontSize: '13px',
                                }}>
                                    {v.message}
                                </div>
                            ))}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '20px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={violationAcknowledged} onChange={e => setViolationAcknowledged(e.target.checked)} />
                            {zh ? '我了解上述違規，確認發布' : 'I acknowledge these violations and confirm publishing'}
                        </label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn btn-primary" disabled={!violationAcknowledged} onClick={() => {
                                setShowViolationModal(false);
                                setViolationAcknowledged(false);
                                if (pendingPublishId) publishSchedule(pendingPublishId, true);
                            }}>
                                {zh ? '確認發布' : 'Confirm Publish'}
                            </button>
                            <button className="btn btn-secondary" onClick={() => {
                                setShowViolationModal(false);
                                setViolationAcknowledged(false);
                                setPendingPublishId(null);
                            }}>
                                {zh ? '取消' : 'Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
