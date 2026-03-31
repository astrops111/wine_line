import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import type { Store, ShiftTemplate, Employee, ShiftAssignment, Schedule } from '../types/scheduling';

export function exportScheduleExcel(
  assignments: ShiftAssignment[],
  employees: Employee[],
  shiftTemplates: ShiftTemplate[],
  stores: Store[],
  selectedStore: string,
  weekStart: string,
  zh: boolean,
): void {
  if (!assignments.length) return;
  const templateMap = Object.fromEntries(shiftTemplates.map(s => [s.id, s]));
  const rows = assignments.map(a => {
    const emp = employees.find(e => e.id === a.user_id);
    const tmpl = a.shift_template_id ? templateMap[a.shift_template_id] : null;
    return {
      [zh ? '員工' : 'Employee']: emp?.name || a.user_id,
      [zh ? '日期' : 'Date']: a.date,
      [zh ? '開始時間' : 'Start']: a.start_time,
      [zh ? '結束時間' : 'End']: a.end_time,
      [zh ? '休息(分)' : 'Break(min)']: a.break_minutes,
      [zh ? '班別' : 'Shift']: tmpl?.name || '',
      [zh ? '加班' : 'OT']: a.is_overtime ? (zh ? '是' : 'Yes') : '',
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, zh ? '班表' : 'Schedule');
  const storeName = stores.find(s => s.id === selectedStore)?.name || 'store';
  XLSX.writeFile(wb, `schedule_${storeName}_${weekStart}.xlsx`);
}

export async function importScheduleExcel(
  file: File,
  employees: Employee[],
  schedule: Schedule | null,
  selectedStore: string,
  orgId: string | null,
  weekStart: string,
  zh: boolean,
  setSchedule: (s: Schedule) => void,
  setAssignments: (a: ShiftAssignment[]) => void,
): Promise<void> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
  if (!rows.length) { alert(zh ? '檔案無資料' : 'No data in file'); return; }

  // Map employee names to IDs
  const nameToId: Record<string, string> = {};
  for (const e of employees) nameToId[e.name] = e.id;

  // Create or reuse draft schedule
  let schedId = schedule?.id;
  if (!schedId) {
    const { data: sched } = await supabase.from('schedules').insert({
      store_id: selectedStore, organization_id: orgId,
      week_start: weekStart, status: 'draft', generated_by: 'manual',
    }).select().single();
    if (!sched) { alert(zh ? '建立排班失敗' : 'Failed to create schedule'); return; }
    schedId = sched.id;
    setSchedule(sched);
  }

  const nameKey = zh ? '員工' : 'Employee';
  const dateKey = zh ? '日期' : 'Date';
  const startKey = zh ? '開始時間' : 'Start';
  const endKey = zh ? '結束時間' : 'End';
  const breakKey = zh ? '休息(分)' : 'Break(min)';

  const toInsert = rows
    .filter(r => r[nameKey] && r[dateKey] && nameToId[r[nameKey]])
    .map(r => ({
      schedule_id: schedId!, user_id: nameToId[r[nameKey]], store_id: selectedStore,
      date: r[dateKey], start_time: r[startKey] || '09:00', end_time: r[endKey] || '17:00',
      break_minutes: Number(r[breakKey]) || 60,
    }));

  if (toInsert.length === 0) { alert(zh ? '無法匹配任何員工' : 'No matching employees found'); return; }
  await supabase.from('shift_assignments').insert(toInsert);
  const { data: assn } = await supabase.from('shift_assignments').select('*').eq('schedule_id', schedId).order('date');
  setAssignments(assn || []);
}
