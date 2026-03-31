import { useRef, useState } from 'react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { t } from '../../lib/i18n';
import { DraggableChip, DroppableCell, TrashZone, DraggableTemplate } from './DragDropHelpers';
import type {
  Store, ShiftTemplate, Employee, ShiftAssignment, Schedule,
  ScheduleTemplate, DemandForecast,
} from '../../types/scheduling';

export interface ScheduleCalendarTabProps {
  zh: boolean;
  stores: Store[];
  selectedStore: string;
  shiftTemplates: ShiftTemplate[];
  employees: Employee[];
  schedule: Schedule | null;
  assignments: ShiftAssignment[];
  weekDates: string[];
  dayNames: string[];
  scheduleTemplates: ScheduleTemplate[];
  forecasts: DemandForecast[];
  forecastLoading: boolean;
  showAiPanel: boolean;
  aiInstructions: string;
  aiLoading: boolean;
  copyLoading: boolean;
  calendarView: 'table' | 'timeline';
  ctrlHeld: boolean;
  quickAddCell: { userId: string; date: string } | null;
  // Callbacks
  onChangeWeek: (delta: number) => void;
  onSetCalendarView: (v: 'table' | 'timeline') => void;
  onSetShowAiPanel: (v: boolean) => void;
  onSetAiInstructions: (v: string) => void;
  onRunAiSchedule: () => void;
  onCopyPreviousWeek: () => void;
  onLoadTemplate: (id: string) => void;
  onPublishSchedule: () => void;
  onSetShowSaveTemplate: (v: boolean) => void;
  onExportExcel: () => void;
  onImportExcel: (file: File) => void;
  onFetchForecast: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onSetActiveDragId: (id: string | null) => void;
  activeDragId: string | null;
  onSetQuickAddCell: (v: { userId: string; date: string } | null) => void;
  onAddShiftFromTemplate: (templateId: string, userId: string, date: string) => void;
}

export function ScheduleCalendarTab(props: ScheduleCalendarTabProps) {
  const {
    zh, stores, selectedStore, shiftTemplates, employees, schedule, assignments,
    weekDates, dayNames, scheduleTemplates, forecasts, forecastLoading,
    showAiPanel, aiInstructions, aiLoading, copyLoading,
    calendarView, ctrlHeld, quickAddCell,
    onChangeWeek, onSetCalendarView, onSetShowAiPanel, onSetAiInstructions,
    onRunAiSchedule, onCopyPreviousWeek, onLoadTemplate, onPublishSchedule,
    onSetShowSaveTemplate, onExportExcel, onImportExcel, onFetchForecast,
    onDragEnd, onSetActiveDragId, activeDragId,
    onSetQuickAddCell, onAddShiftFromTemplate,
  } = props;

  const excelInputRef = useRef<HTMLInputElement>(null);
  const templateMap = Object.fromEntries(shiftTemplates.map(s => [s.id, s]));
  const getAssignmentsForCell = (userId: string, date: string) =>
    assignments.filter(a => a.user_id === userId && a.date === date);

  return (
    <div>
      {/* Week navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-sm btn-secondary" aria-label={zh ? '上一週' : 'Previous week'} onClick={() => onChangeWeek(-1)}>◀</button>
          <span style={{ fontWeight: 600, fontSize: '15px', minWidth: '200px', textAlign: 'center' }}>
            {weekDates[0]} ~ {weekDates[6]}
          </span>
          <button className="btn btn-sm btn-secondary" aria-label={zh ? '下一週' : 'Next week'} onClick={() => onChangeWeek(1)}>▶</button>
          <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--outline-variant)', marginLeft: '8px' }}>
            <button onClick={() => onSetCalendarView('table')} style={{
              padding: '4px 10px', fontSize: '12px', border: 'none', cursor: 'pointer',
              background: calendarView === 'table' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
              color: calendarView === 'table' ? '#fff' : 'var(--text-secondary)',
            }} title={zh ? '表格檢視' : 'Table view'}>☰</button>
            <button onClick={() => onSetCalendarView('timeline')} style={{
              padding: '4px 10px', fontSize: '12px', border: 'none', cursor: 'pointer',
              background: calendarView === 'timeline' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
              color: calendarView === 'timeline' ? '#fff' : 'var(--text-secondary)',
            }} title={zh ? '時間軸檢視' : 'Timeline view'}>⏱</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {schedule && (
            <span className="badge" style={{ background: schedule.status === 'published' ? '#22c55e' : '#f59e0b', fontSize: '12px', padding: '3px 10px' }}>
              {schedule.status === 'published' ? (zh ? '✅ 已發佈' : '✅ Published') : (zh ? '📝 草稿' : '📝 Draft')}
            </span>
          )}
          {schedule && schedule.status === 'draft' && (
            <button className="btn btn-sm btn-primary" onClick={onPublishSchedule}>📤 {t('schedule.publish')}</button>
          )}
          {!schedule && (
            <>
              <button className="btn btn-sm btn-secondary" onClick={onCopyPreviousWeek} disabled={copyLoading}>
                {copyLoading ? '⏳…' : (zh ? '📋 複製上週' : '📋 Copy Last Week')}
              </button>
              {scheduleTemplates.length > 0 && (
                <select className="input-field" style={{ maxWidth: '160px', fontSize: '12px' }}
                  value="" onChange={e => { if (e.target.value) onLoadTemplate(e.target.value); }}>
                  <option value="">{zh ? '📂 載入範本' : '📂 Load Template'}</option>
                  {scheduleTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </>
          )}
          {schedule && assignments.length > 0 && (
            <button className="btn btn-sm btn-secondary" onClick={() => onSetShowSaveTemplate(true)}>
              💾 {zh ? '存為範本' : 'Save Template'}
            </button>
          )}
          <button className="btn btn-sm" style={{ background: showAiPanel ? 'var(--accent-indigo)' : 'var(--bg-secondary)', color: showAiPanel ? '#fff' : 'var(--text-primary)', border: '1px solid var(--outline-variant)' }} onClick={() => onSetShowAiPanel(!showAiPanel)}>
            💡 {zh ? '排班條件' : 'AI Criteria'}
          </button>
          {schedule && assignments.length > 0 && (
            <button className="btn btn-sm btn-secondary" onClick={onExportExcel}>
              📥 {zh ? '匯出 Excel' : 'Export Excel'}
            </button>
          )}
          <button className="btn btn-sm btn-secondary" onClick={() => excelInputRef.current?.click()}>
            📤 {zh ? '匯入 Excel' : 'Import Excel'}
          </button>
          <input ref={excelInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) { onImportExcel(f); e.target.value = ''; } }} />
          <button className="btn btn-primary" onClick={onRunAiSchedule} disabled={aiLoading}>
            {aiLoading ? '⏳…' : '🤖 ' + t('schedule.ai_generate')}
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
            onChange={e => onSetAiInstructions(e.target.value)}
            placeholder={zh
              ? '輸入自訂排班條件，例如：\n• 週末至少安排 3 人\n• 王小明不要排早班\n• Amy 每週最多排 3 天\n• 確保每天都有資深員工值班'
              : 'Enter custom scheduling criteria, e.g.:\n• At least 3 staff on weekends\n• Do not schedule Amy on morning shifts\n• Max 3 days per week for part-timers\n• Ensure one senior staff per day'}
            rows={4}
            style={{ width: '100%', resize: 'vertical', fontSize: '13px' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {zh ? '這些條件會傳送給 AI 排班引擎，用來產生更符合需求的班表。' : 'These instructions are passed to the AI scheduler to generate a schedule that matches your criteria.'}
            </div>
            <button className="btn btn-sm btn-secondary" onClick={onFetchForecast} disabled={forecastLoading} style={{ whiteSpace: 'nowrap' }}>
              {forecastLoading ? '⏳…' : '📈'} {zh ? '需求預測' : 'Demand Forecast'}
            </button>
          </div>
          {forecasts.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {forecasts.map(f => (
                <div key={f.date} style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)' }}
                  title={f.reason}>
                  <div style={{ fontWeight: 600 }}>{f.date.slice(5)}</div>
                  <div>👥 {f.recommended_staff} <span style={{ color: 'var(--text-muted)' }}>({Math.round(f.confidence * 100)}%)</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary bar */}
      {schedule && (() => {
        const store = stores.find(s => s.id === selectedStore);
        const rate = store?.hourly_rate_default || 183;
        const liveHours = assignments.reduce((sum, a) => {
          if (!a.start_time || !a.end_time) return sum;
          const [sh, sm] = a.start_time.split(':').map(Number);
          const [eh, em] = a.end_time.split(':').map(Number);
          return sum + ((eh * 60 + em) - (sh * 60 + sm) - (a.break_minutes || 0)) / 60;
        }, 0);
        const liveCost = liveHours * rate;
        const budget = schedule.labor_budget || store?.default_labor_budget;
        const pct = budget ? Math.round(liveCost / budget * 100) : 0;
        const budgetColor = !budget ? 'var(--text-secondary)' : pct > 100 ? '#f43f5e' : pct > 80 ? '#f59e0b' : '#22c55e';
        return (
          <div className="card" style={{ display: 'flex', gap: '24px', padding: '12px 18px', marginBottom: '16px', fontSize: '13px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>⏱ {zh ? '總工時' : 'Total'}: <b>{liveHours.toFixed(1)}h</b></span>
            <span>💰 {zh ? '預估成本' : 'Est. Cost'}: <b>NT${Math.round(liveCost).toLocaleString()}</b></span>
            {budget ? (
              <span style={{ color: budgetColor, fontWeight: 600 }}>
                📊 NT${Math.round(liveCost).toLocaleString()} / NT${Math.round(budget).toLocaleString()} ({pct}%)
              </span>
            ) : null}
            <span>👥 {zh ? '員工' : 'Staff'}: <b>{employees.length}</b></span>
            {(schedule.violations as any[])?.length > 0 && (
              <span style={{ color: '#f43f5e' }}>⚠️ {(schedule.violations as any[]).length} {zh ? '個違規' : 'violations'}</span>
            )}
          </div>
        );
      })()}

      {/* Schedule grid with DnD */}
      <DndContext onDragEnd={onDragEnd} onDragStart={e => onSetActiveDragId(e.active.id as string)}>
        {/* Template palette */}
        {shiftTemplates.length > 0 && (!schedule || schedule.status === 'draft') && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px',
            padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--outline-variant)', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {zh ? '📋 拖曳班次：' : '📋 Drag shifts:'}
            </span>
            {shiftTemplates.map(tmpl => (
              <DraggableTemplate key={tmpl.id} id={`tmpl::${tmpl.id}`}>
                <div style={{
                  background: tmpl.color || '#6366f1', color: '#fff',
                  borderRadius: '6px', padding: '4px 10px', fontSize: '12px',
                  fontWeight: 500, whiteSpace: 'nowrap',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }}>
                  {tmpl.name} {tmpl.start_time?.slice(0, 5)}–{tmpl.end_time?.slice(0, 5)}
                </div>
              </DraggableTemplate>
            ))}
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
              {zh ? '(Ctrl+拖曳=複製)' : '(Ctrl+drag=copy)'}
            </span>
          </div>
        )}

        {/* Timeline view */}
        {calendarView === 'timeline' && (
          <TimelineView
            zh={zh} weekDates={weekDates} dayNames={dayNames}
            employees={employees} assignments={assignments} templateMap={templateMap}
          />
        )}

        {/* Table view */}
        {calendarView === 'table' && (
          <div className="card" style={{ overflowX: 'auto', padding: '0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, borderBottom: 'none', minWidth: '120px' }}>
                    {zh ? '員工' : 'Employee'}
                  </th>
                  {weekDates.map((d, i) => {
                    const fc = forecasts.find(f => f.date === d);
                    return (
                      <th key={d} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, borderBottom: 'none', minWidth: '100px' }}>
                        <div>{dayNames[i]}</div>
                        <div style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text-muted)' }}>{d.slice(5)}</div>
                        {fc && <div style={{ fontWeight: 400, fontSize: '10px', color: '#6366f1' }} title={fc.reason}>📈 {fc.recommended_staff}</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {zh ? '此門市尚無員工。請在「員工管理」中指派員工至此門市。' : 'No employees assigned to this store.'}
                  </td></tr>
                ) : employees.map(emp => (
                  <tr key={emp.id} style={{ borderBottom: 'none' }}>
                    <td style={{ padding: '8px 14px' }}>
                      <div style={{ fontWeight: 600 }}>
                        {emp.name}
                        {emp.store_id !== selectedStore && <span style={{ fontSize: '10px', marginLeft: '4px', padding: '1px 4px', borderRadius: '4px', background: '#f59e0b', color: '#fff' }}>🏪 {stores.find(s => s.id === emp.store_id)?.name || ''}</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {emp.position || '—'} · {emp.max_hours_per_week}h
                      </div>
                    </td>
                    {weekDates.map(d => {
                      const cellAssignments = getAssignmentsForCell(emp.id, d);
                      const isDraft = schedule && schedule.status === 'draft';
                      return isDraft ? (
                        <DroppableCell key={d} id={`${emp.id}|${d}`}>
                          {cellAssignments.map(a => {
                            const tmpl = a.shift_template_id ? templateMap[a.shift_template_id] : null;
                            return (
                              <DraggableChip key={a.id} id={a.id}>
                                <div style={{
                                  background: tmpl?.color || '#6366f1', color: '#fff',
                                  borderRadius: '4px', padding: '3px 6px', fontSize: '11px',
                                  marginBottom: '2px', fontWeight: 500,
                                }}>
                                  {a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}
                                  {a.is_overtime && <span style={{ marginLeft: '3px' }}>⚠️</span>}
                                </div>
                              </DraggableChip>
                            );
                          })}
                          {cellAssignments.length === 0 && (
                            <div style={{ position: 'relative' }}>
                              <button
                                onClick={e => { e.stopPropagation(); onSetQuickAddCell({ userId: emp.id, date: d }); }}
                                style={{
                                  background: 'none', border: '1px dashed var(--outline-variant)',
                                  borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
                                  color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1,
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#6366f1'; (e.target as HTMLElement).style.color = '#6366f1'; }}
                                onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--outline-variant)'; (e.target as HTMLElement).style.color = 'var(--text-muted)'; }}
                                title={zh ? '點擊新增班次' : 'Click to add shift'}
                              >+</button>
                              {quickAddCell?.userId === emp.id && quickAddCell?.date === d && (
                                <div data-quick-add-popover style={{
                                  position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                                  zIndex: 100, marginTop: '4px', minWidth: '160px',
                                  background: 'var(--bg-card)', border: '1px solid var(--outline-variant)',
                                  borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                                  padding: '4px 0',
                                }}>
                                  <div style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    {zh ? '選擇班次' : 'Select Shift'}
                                  </div>
                                  {shiftTemplates.map(tmpl => (
                                    <button key={tmpl.id} onClick={e => {
                                      e.stopPropagation();
                                      onAddShiftFromTemplate(tmpl.id, emp.id, d);
                                      onSetQuickAddCell(null);
                                    }} style={{
                                      display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                                      padding: '6px 10px', background: 'none', border: 'none',
                                      cursor: 'pointer', fontSize: '12px', textAlign: 'left',
                                    }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                    >
                                      <span style={{
                                        width: '10px', height: '10px', borderRadius: '2px', flexShrink: 0,
                                        background: tmpl.color || '#6366f1',
                                      }} />
                                      <span>{tmpl.name}</span>
                                      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontSize: '11px' }}>
                                        {tmpl.start_time?.slice(0, 5)}–{tmpl.end_time?.slice(0, 5)}
                                      </span>
                                    </button>
                                  ))}
                                  {shiftTemplates.length === 0 && (
                                    <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                      {zh ? '尚無班次範本，請在設定中新增' : 'No templates. Add in Settings tab.'}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </DroppableCell>
                      ) : (
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
        )}

        {schedule && schedule.status === 'draft' && <TrashZone zh={zh} />}

        <DragOverlay>
          {activeDragId ? (() => {
            // Template drag overlay
            if (activeDragId.startsWith('tmpl::')) {
              const tmplId = activeDragId.replace('tmpl::', '');
              const tmpl = shiftTemplates.find(t => t.id === tmplId);
              if (!tmpl) return null;
              return (
                <div style={{
                  background: tmpl.color || '#6366f1', color: '#fff',
                  borderRadius: '6px', padding: '4px 10px', fontSize: '12px',
                  fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                }}>
                  + {tmpl.name} {tmpl.start_time?.slice(0, 5)}–{tmpl.end_time?.slice(0, 5)}
                </div>
              );
            }
            // Existing assignment drag overlay
            const a = assignments.find(x => x.id === activeDragId);
            if (!a) return null;
            const tmpl = a.shift_template_id ? templateMap[a.shift_template_id] : null;
            return (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <div style={{
                  background: tmpl?.color || '#6366f1', color: '#fff',
                  borderRadius: '4px', padding: '3px 6px', fontSize: '11px',
                  fontWeight: 500, boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}>
                  {a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}
                </div>
                {ctrlHeld && (
                  <div style={{
                    position: 'absolute', top: '-6px', right: '-6px',
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: '#22c55e', color: '#fff', fontSize: '11px',
                    fontWeight: 700, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', lineHeight: 1,
                  }}>+</div>
                )}
              </div>
            );
          })() : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/* ====== Timeline sub-component (kept internal to this file) ====== */
function TimelineView({ zh, weekDates, dayNames, employees, assignments, templateMap }: {
  zh: boolean;
  weekDates: string[];
  dayNames: string[];
  employees: Employee[];
  assignments: ShiftAssignment[];
  templateMap: Record<string, ShiftTemplate>;
}) {
  const HOUR_START = 6;
  const HOUR_END = 24;
  const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const HOUR_WIDTH = 50;
  const TIMELINE_WIDTH = HOURS.length * HOUR_WIDTH;
  const ROW_HEIGHT = 36;

  const timeToPos = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return ((h - HOUR_START) + m / 60) * HOUR_WIDTH;
  };
  const timeToWidth = (start: string, end: string) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let endMin = eh * 60 + em;
    const startMin = sh * 60 + sm;
    if (endMin <= startMin) endMin += 24 * 60;
    return ((endMin - startMin) / 60) * HOUR_WIDTH;
  };

  return (
    <div className="card" style={{ padding: '0', overflowX: 'auto' }}>
      {weekDates.map((date, dayIdx) => {
        const dayAssignments = assignments.filter(a => a.date === date);
        const empRows: { emp: typeof employees[0]; shifts: ShiftAssignment[] }[] = [];
        for (const emp of employees) {
          const shifts = dayAssignments.filter(a => a.user_id === emp.id);
          if (shifts.length > 0) empRows.push({ emp, shifts });
        }

        return (
          <div key={date} style={{ borderBottom: dayIdx < 6 ? '2px solid var(--outline-variant)' : 'none' }}>
            {/* Day header */}
            <div style={{
              display: 'flex', alignItems: 'center', padding: '8px 14px',
              background: 'var(--bg-primary)', borderBottom: '1px solid var(--outline-variant)',
              position: 'sticky', left: 0,
            }}>
              <span style={{ fontWeight: 700, fontSize: '14px', minWidth: '80px' }}>{dayNames[dayIdx]}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{date}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '12px' }}>
                {empRows.reduce((s, r) => s + r.shifts.length, 0)} {zh ? '個班次' : 'shifts'}
                {' · '}{empRows.length} {zh ? '人' : 'staff'}
              </span>
            </div>
            <div style={{ display: 'flex' }}>
              {/* Employee name column */}
              <div style={{ minWidth: '110px', flexShrink: 0, borderRight: '1px solid var(--outline-variant)' }}>
                <div style={{ height: '24px', borderBottom: '1px solid var(--border-color)' }} />
                {empRows.length === 0 ? (
                  <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {zh ? '無排班' : 'No shifts'}
                  </div>
                ) : empRows.map(({ emp }) => (
                  <div key={emp.id} style={{
                    height: `${ROW_HEIGHT}px`, padding: '0 10px',
                    display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-color)',
                  }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, lineHeight: 1.2 }}>{emp.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.2 }}>{emp.position || ''}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Timeline area */}
              <div style={{ overflowX: 'auto', flex: 1 }}>
                <div style={{ minWidth: `${TIMELINE_WIDTH}px` }}>
                  <div style={{ display: 'flex', height: '24px', borderBottom: '1px solid var(--border-color)' }}>
                    {HOURS.map(h => (
                      <div key={h} style={{
                        width: `${HOUR_WIDTH}px`, flexShrink: 0, textAlign: 'center',
                        fontSize: '10px', color: 'var(--text-muted)', lineHeight: '24px',
                        borderRight: '1px solid var(--border-color)',
                      }}>{String(h).padStart(2, '0')}:00</div>
                    ))}
                  </div>
                  {empRows.map(({ emp, shifts }) => (
                    <div key={emp.id} style={{
                      position: 'relative', height: `${ROW_HEIGHT}px`,
                      borderBottom: '1px solid var(--border-color)',
                    }}>
                      {HOURS.map(h => (
                        <div key={h} style={{
                          position: 'absolute', left: `${(h - HOUR_START) * HOUR_WIDTH}px`,
                          top: 0, bottom: 0, width: '1px',
                          background: 'var(--border-color)',
                        }} />
                      ))}
                      {shifts.map(a => {
                        const tmpl = a.shift_template_id ? templateMap[a.shift_template_id] : null;
                        const left = timeToPos(a.start_time || '09:00');
                        const width = timeToWidth(a.start_time || '09:00', a.end_time || '17:00');
                        const [sh, sm] = (a.start_time || '09:00').split(':').map(Number);
                        const [eh, em] = (a.end_time || '17:00').split(':').map(Number);
                        const durationH = ((eh * 60 + em) - (sh * 60 + sm) - (a.break_minutes || 0)) / 60;
                        return (
                          <div key={a.id} title={`${emp.name}: ${a.start_time?.slice(0, 5)}–${a.end_time?.slice(0, 5)} (${durationH.toFixed(1)}h)`}
                            style={{
                              position: 'absolute', left: `${left}px`, width: `${Math.max(width, 20)}px`,
                              top: '4px', bottom: '4px', borderRadius: '4px',
                              background: tmpl?.color || '#6366f1', color: '#fff',
                              fontSize: '10px', fontWeight: 500, padding: '0 5px',
                              display: 'flex', alignItems: 'center', gap: '3px',
                              overflow: 'hidden', whiteSpace: 'nowrap',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                              cursor: 'default',
                            }}>
                            {width > 60 && <span>{a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}</span>}
                            {width > 100 && <span style={{ opacity: 0.8 }}>({durationH.toFixed(1)}h)</span>}
                            {a.is_overtime && <span>⚠️</span>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
