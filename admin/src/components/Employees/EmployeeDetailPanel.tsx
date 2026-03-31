import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { t, getLocale } from '../../lib/i18n';
import { useOrg } from '../../lib/OrgContext';
import {
    getTypeLabel,
    getLeaveTypeLabel, LEAVE_STATUS_COLOR,
    getAvailLabel, AVAIL_COLOR, getDaysOfWeek,
} from '../../lib/employeeHelpers';
import type {
    Employee, EditForm, Store, Company, Department, LineUser, LineGroup,
    ShiftTemplate, LeaveRequest, PerformanceReview, EmployeeAvailability,
    EmployeeDependent, PositionHistory, OnboardingTask, EmployeeSkill,
} from '../../types/employees';
import { EmployeeEditCard } from './EmployeeEditCard';

interface EmployeeDetailPanelProps {
    selected: Employee;
    employees: Employee[];
    stores: Store[];
    companies: Company[];
    departments: Department[];
    lineUsers: LineUser[];
    lineGroups: LineGroup[];
    shiftTemplates: ShiftTemplate[];
    editForm: EditForm | null;
    isDirty: boolean;
    patchForm: (patch: Partial<EditForm>) => void;
    saveEmployee: () => Promise<void>;
    leaves: LeaveRequest[];
    reviews: PerformanceReview[];
    availabilities: EmployeeAvailability[];
    dependents: EmployeeDependent[];
    positionHistory: PositionHistory[];
    skills: EmployeeSkill[];
    onboardingTasks: OnboardingTask[];
    onClose: () => void;
    loadLeaves: (userId: string) => Promise<void>;
    loadReviews: (userId: string) => Promise<void>;
    loadAvailabilities: (userId: string) => Promise<void>;
    loadDependents: (userId: string) => Promise<void>;
    loadPositionHistory: (userId: string) => Promise<void>;
    loadSkills: (userId: string) => Promise<void>;
    loadOnboardingTasks: (userId: string) => Promise<void>;
    mapLineUser: (empId: string, lineUserId: string | null) => Promise<void>;
    updateField: (id: string, field: string, value: any) => Promise<void>;
    generateCertificate: (emp: Employee) => void;
    doTransfer: (emp: Employee) => Promise<void>;
}

export function EmployeeDetailPanel({
    selected, employees, stores, companies, departments, lineUsers, lineGroups, shiftTemplates,
    editForm, isDirty, patchForm, saveEmployee,
    leaves, reviews, availabilities, dependents, positionHistory, skills, onboardingTasks,
    onClose, loadLeaves, loadReviews, loadAvailabilities, loadDependents,
    loadPositionHistory, loadSkills, loadOnboardingTasks,
    mapLineUser, updateField, generateCertificate, doTransfer,
}: EmployeeDetailPanelProps) {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const typeLabel = getTypeLabel(zh);
    const leaveTypeLabel = getLeaveTypeLabel(zh);
    const availLabel = getAvailLabel(zh);
    const daysOfWeek = getDaysOfWeek(zh);

    // Local UI state
    const [showLeaveForm, setShowLeaveForm] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewForm, setReviewForm] = useState({ points: '100', comment: '', review_date: new Date().toISOString().split('T')[0] });
    const [showAvailForm, setShowAvailForm] = useState(false);
    const [availForm, setAvailForm] = useState({ day_of_week: 1, availability: 'available', preferred_shift_id: '', notes: '' });
    const [showDependentForm, setShowDependentForm] = useState(false);
    const [depForm, setDepForm] = useState({ relationship: 'spouse', name: '', id_number: '', birth_date: '', health_ins_enrolled: false, notes: '' });
    const [showPosHistForm, setShowPosHistForm] = useState(false);
    const [posHistForm, setPosHistForm] = useState({ change_type: 'promotion', effective_date: '', title: '', job_grade: '', department_id: '', store_id: '', employee_type: 'full_time', salary_type: 'monthly', base_salary: '', hourly_wage: '', role_allowance: '', meal_allowance: '', transport_allowance: '', reason: '', notes: '' });
    const [newSkill, setNewSkill] = useState({ skill_name: '', proficiency: 'basic' });

    // ── CRUD handlers ──
    const createLeave = async () => {
        if (!leaveForm.start_date || !leaveForm.end_date) return;
        await supabase.from('leave_requests').insert({
            user_id: selected.id, store_id: selected.store_id, organization_id: orgId,
            start_date: leaveForm.start_date, end_date: leaveForm.end_date,
            leave_type: leaveForm.leave_type, reason: leaveForm.reason || null,
            status: 'pending', is_paid: !['unpaid', 'block_off'].includes(leaveForm.leave_type),
        });
        setLeaveForm({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });
        setShowLeaveForm(false);
        await loadLeaves(selected.id);
    };
    const updateLeaveStatus = async (leaveId: string, status: string) => {
        await supabase.from('leave_requests').update({ status, approved_at: status === 'approved' ? new Date().toISOString() : null }).eq('id', leaveId);
        await loadLeaves(selected.id);
    };
    const createReview = async () => {
        if (!reviewForm.review_date || !reviewForm.points) return;
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('performance_reviews').insert({
            user_id: selected.id, reviewer_id: user?.id || null,
            points: Number(reviewForm.points), comment: reviewForm.comment || null,
            review_date: reviewForm.review_date, organization_id: orgId,
        });
        setReviewForm({ points: '100', comment: '', review_date: new Date().toISOString().split('T')[0] });
        setShowReviewForm(false);
        await loadReviews(selected.id);
    };
    const saveAvailability = async () => {
        await supabase.from('employee_availability').delete().eq('user_id', selected.id).eq('day_of_week', availForm.day_of_week);
        await supabase.from('employee_availability').insert({
            user_id: selected.id, store_id: selected.store_id || null,
            day_of_week: availForm.day_of_week, availability: availForm.availability,
            preferred_shift_id: availForm.preferred_shift_id || null, notes: availForm.notes || null,
        });
        setAvailForm({ day_of_week: 1, availability: 'available', preferred_shift_id: '', notes: '' });
        setShowAvailForm(false);
        await loadAvailabilities(selected.id);
    };
    const deleteAvailability = async (id: string) => {
        await supabase.from('employee_availability').delete().eq('id', id);
        await loadAvailabilities(selected.id);
    };
    const createDependent = async () => {
        if (!depForm.name.trim()) return;
        await supabase.from('employee_dependents').insert({ organization_id: orgId, user_id: selected.id, relationship: depForm.relationship, name: depForm.name.trim(), id_number: depForm.id_number || null, birth_date: depForm.birth_date || null, health_ins_enrolled: depForm.health_ins_enrolled, notes: depForm.notes || null });
        setDepForm({ relationship: 'spouse', name: '', id_number: '', birth_date: '', health_ins_enrolled: false, notes: '' });
        setShowDependentForm(false);
        await loadDependents(selected.id);
    };
    const deleteDependent = async (id: string) => {
        await supabase.from('employee_dependents').delete().eq('id', id);
        await loadDependents(selected.id);
    };
    const addPositionHistory = async () => {
        if (!posHistForm.effective_date) return;
        const deptName = departments.find(d => d.id === posHistForm.department_id)?.name || null;
        const storeName = stores.find(s => s.id === posHistForm.store_id)?.name || null;
        await supabase.from('employee_position_history').insert({
            organization_id: orgId, user_id: selected.id,
            change_type: posHistForm.change_type, effective_date: posHistForm.effective_date,
            title: posHistForm.title || null, job_grade: posHistForm.job_grade || null,
            department_id: posHistForm.department_id || null, department_name: deptName,
            store_id: posHistForm.store_id || null, store_name: storeName,
            employee_type: posHistForm.employee_type || null, salary_type: posHistForm.salary_type,
            base_salary: posHistForm.base_salary ? Number(posHistForm.base_salary) : null,
            hourly_wage: posHistForm.hourly_wage ? Number(posHistForm.hourly_wage) : null,
            role_allowance: posHistForm.role_allowance ? Number(posHistForm.role_allowance) : null,
            meal_allowance: posHistForm.meal_allowance ? Number(posHistForm.meal_allowance) : null,
            transport_allowance: posHistForm.transport_allowance ? Number(posHistForm.transport_allowance) : null,
            reason: posHistForm.reason || null, notes: posHistForm.notes || null,
        });
        setPosHistForm({ change_type: 'promotion', effective_date: '', title: '', job_grade: '', department_id: '', store_id: '', employee_type: 'full_time', salary_type: 'monthly', base_salary: '', hourly_wage: '', role_allowance: '', meal_allowance: '', transport_allowance: '', reason: '', notes: '' });
        setShowPosHistForm(false);
        await loadPositionHistory(selected.id);
    };
    const addSkill = async () => {
        if (!newSkill.skill_name.trim()) return;
        await supabase.from('employee_skills').insert({ user_id: selected.id, skill_name: newSkill.skill_name.trim(), proficiency: newSkill.proficiency });
        setNewSkill({ skill_name: '', proficiency: 'basic' });
        await loadSkills(selected.id);
    };
    const removeSkill = async (id: string) => {
        await supabase.from('employee_skills').delete().eq('id', id);
        await loadSkills(selected.id);
    };
    const toggleOnboardingTask = async (taskId: string, completed: boolean) => {
        await supabase.from('onboarding_tasks').update({
            status: completed ? 'completed' : 'pending',
            completed_at: completed ? new Date().toISOString() : null,
        }).eq('id', taskId);
        await loadOnboardingTasks(selected.id);
    };

    return (
        <div style={{ flex: '0 0 47%', minWidth: '320px' }} className="fade-in">
            {/* ── Header + Edit Form Card (extracted) ── */}
            <EmployeeEditCard
                selected={selected} employees={employees} stores={stores}
                companies={companies} departments={departments}
                editForm={editForm} isDirty={isDirty} patchForm={patchForm}
                saveEmployee={saveEmployee} onClose={onClose}
                generateCertificate={generateCertificate} doTransfer={doTransfer}
            />

            {/* GAP-12: Skills & Certifications */}
            <div className="card" style={{ marginTop: '14px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>
                    🏷️ {zh ? '技能 / 證照' : 'Skills / Certifications'}
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                    {skills.map(s => {
                        const colors: Record<string, string> = { basic: '#94a3b8', intermediate: '#6366f1', advanced: '#22c55e' };
                        return (
                            <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: colors[s.proficiency] || '#94a3b8', color: '#fff', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 500 }}>
                                {s.skill_name}
                                <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '12px' }} onClick={() => removeSkill(s.id)}>✕</button>
                            </span>
                        );
                    })}
                    {skills.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{zh ? '尚未新增技能' : 'No skills added'}</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input className="input-field" style={{ flex: 1, fontSize: '12px' }}
                        value={newSkill.skill_name} onChange={e => setNewSkill({ ...newSkill, skill_name: e.target.value })}
                        placeholder={zh ? '新增技能 (例如: 拉花、咖啡師)' : 'Add skill (e.g. latte art, barista)'}
                        onKeyDown={e => { if (e.key === 'Enter') addSkill(); }} />
                    <select className="input-field" style={{ width: '100px', fontSize: '12px' }}
                        value={newSkill.proficiency} onChange={e => setNewSkill({ ...newSkill, proficiency: e.target.value })}>
                        <option value="basic">{zh ? '基礎' : 'Basic'}</option>
                        <option value="intermediate">{zh ? '中級' : 'Intermediate'}</option>
                        <option value="advanced">{zh ? '進階' : 'Advanced'}</option>
                    </select>
                    <button className="btn btn-sm btn-primary" onClick={addSkill}>+</button>
                </div>
            </div>

            {/* OE-2/3: Onboarding/Offboarding Checklists */}
            {onboardingTasks.length > 0 && (() => {
                const onTasks = onboardingTasks.filter(t => t.type === 'onboarding');
                const offTasks = onboardingTasks.filter(t => t.type === 'offboarding');
                const renderChecklist = (tasks: typeof onboardingTasks, label: string) => {
                    if (tasks.length === 0) return null;
                    const completed = tasks.filter(t => t.status === 'completed').length;
                    const pct = Math.round((completed / tasks.length) * 100);
                    return (
                        <div className="card" style={{ marginTop: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{label}</h4>
                                <span style={{ fontSize: '12px', color: pct === 100 ? '#22c55e' : 'var(--text-muted)' }}>{completed}/{tasks.length} ({pct}%)</span>
                            </div>
                            <div className="progress-bar" style={{ marginBottom: '10px', height: '4px' }}>
                                <div className="progress-bar-fill" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : undefined }} />
                            </div>
                            {tasks.map(task => (
                                <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--outline-variant)' }}>
                                    <input type="checkbox" checked={task.status === 'completed'}
                                        onChange={e => toggleOnboardingTask(task.id, e.target.checked)}
                                        style={{ marginTop: '2px', accentColor: 'var(--accent-primary)' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '13px', textDecoration: task.status === 'completed' ? 'line-through' : 'none', color: task.status === 'completed' ? 'var(--text-muted)' : undefined }}>{task.title}</div>
                                        {task.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{task.description}</div>}
                                    </div>
                                    {task.due_date && <span style={{ fontSize: '11px', color: new Date(task.due_date) < new Date() && task.status !== 'completed' ? '#f43f5e' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{task.due_date}</span>}
                                </div>
                            ))}
                        </div>
                    );
                };
                return <>{renderChecklist(onTasks, zh ? '📋 到職清單' : '📋 Onboarding Checklist')}{renderChecklist(offTasks, zh ? '📋 離職清單' : '📋 Offboarding Checklist')}</>;
            })()}

            {/* ── Leave / Block-Off ── */}
            <div className="card" style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{'\u{1F4CB}'} {zh ? '\u8ACB\u5047 / \u6392\u9664\u65E5\u671F' : 'Leave / Block-Off Dates'}</h4>
                    <button className="btn btn-sm btn-primary" onClick={() => setShowLeaveForm(!showLeaveForm)}>{showLeaveForm ? '\u2715' : '\u2795'}</button>
                </div>
                {showLeaveForm && (
                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div><label className="detail-label">{zh ? '\u958B\u59CB\u65E5\u671F' : 'Start'}</label><input className="input-field" type="date" value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })} /></div>
                            <div><label className="detail-label">{zh ? '\u7D50\u675F\u65E5\u671F' : 'End'}</label><input className="input-field" type="date" value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })} /></div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                            <div><label className="detail-label">{zh ? '\u985E\u578B' : 'Type'}</label>
                                <select className="input-field" value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
                                    {Object.entries(leaveTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div><label className="detail-label">{zh ? '\u539F\u56E0' : 'Reason'}</label><input className="input-field" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder={zh ? '\u9078\u586B' : 'Optional'} /></div>
                        </div>
                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createLeave}>{zh ? '\u63D0\u4EA4' : 'Submit'}</button>
                    </div>
                )}
                {leaves.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>{zh ? '\u5C1A\u7121\u8ACB\u5047\u7D00\u9304' : 'No leave requests'}</div>
                ) : (
                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        {leaves.map(lv => (
                            <div key={lv.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '6px', marginBottom: '4px', fontSize: '12px' }}>
                                <span className="badge" style={{ background: LEAVE_STATUS_COLOR[lv.status], fontSize: '10px', padding: '1px 6px' }}>
                                    {lv.status === 'pending' ? (zh ? '\u5F85\u5BE9\u6838' : 'Pending') : lv.status === 'approved' ? (zh ? '\u5DF2\u6279\u6E96' : 'Approved') : lv.status === 'rejected' ? (zh ? '\u5DF2\u62D2\u7D55' : 'Rejected') : (zh ? '\u5DF2\u53D6\u6D88' : 'Cancelled')}
                                </span>
                                <span style={{ fontWeight: 600 }}>{leaveTypeLabel[lv.leave_type]}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{lv.start_date} ~ {lv.end_date}</span>
                                <span style={{ color: 'var(--text-muted)' }}>({lv.total_days}{zh ? '\u5929' : 'd'})</span>
                                {lv.status === 'pending' && (
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                                        <button className="btn btn-sm" style={{ padding: '1px 6px', fontSize: '11px', color: '#22c55e' }} onClick={() => updateLeaveStatus(lv.id, 'approved')}>{'\u2713'}</button>
                                        <button className="btn btn-sm" style={{ padding: '1px 6px', fontSize: '11px', color: '#f43f5e' }} onClick={() => updateLeaveStatus(lv.id, 'rejected')}>{'\u2715'}</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Shift Preferences ── */}
            <div className="card" style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>📅 {zh ? '排班偏好' : 'Shift Preferences'}</h4>
                    <button className="btn btn-sm btn-primary" onClick={() => setShowAvailForm(!showAvailForm)}>{showAvailForm ? '✕' : '➕'}</button>
                </div>
                {showAvailForm && (
                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div><label className="detail-label">{zh ? '星期' : 'Day of Week'}</label>
                                <select className="input-field" value={availForm.day_of_week} onChange={e => setAvailForm({ ...availForm, day_of_week: Number(e.target.value) })}>
                                    {daysOfWeek.map((day, idx) => (<option key={idx} value={idx}>{day}</option>))}
                                </select>
                            </div>
                            <div><label className="detail-label">{zh ? '意願' : 'Availability'}</label>
                                <select className="input-field" value={availForm.availability} onChange={e => setAvailForm({ ...availForm, availability: e.target.value })}>
                                    {Object.entries(availLabel).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                                </select>
                            </div>
                        </div>
                        {availForm.availability !== 'unavailable' && (
                            <div style={{ marginTop: '8px' }}><label className="detail-label">{zh ? '偏好時段 (選填)' : 'Preferred Timeslot (Optional)'}</label>
                                <select className="input-field" value={availForm.preferred_shift_id} onChange={e => setAvailForm({ ...availForm, preferred_shift_id: e.target.value })}>
                                    <option value="">{zh ? '無特定偏好' : 'No specific preference'}</option>
                                    {shiftTemplates.filter(s => !s.store_id || s.store_id === selected.store_id).map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div style={{ marginTop: '8px' }}><label className="detail-label">{zh ? '備註' : 'Notes'}</label><input className="input-field" value={availForm.notes} onChange={e => setAvailForm({ ...availForm, notes: e.target.value })} placeholder={zh ? '例如: 只能做早班…' : 'e.g. Morning shift preferred…'} /></div>
                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={saveAvailability}>{zh ? '儲存設定' : 'Save Preference'}</button>
                    </div>
                )}
                {availabilities.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>{zh ? '尚無排班偏好設定' : 'No shift preferences set'}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {availabilities.map(av => (
                            <div key={av.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '13px' }}>
                                <span style={{ fontWeight: 600, width: '40px' }}>{daysOfWeek[av.day_of_week]}</span>
                                <span className="badge" style={{ background: AVAIL_COLOR[av.availability], fontSize: '11px', padding: '2px 6px', color: '#fff' }}>{availLabel[av.availability] || av.availability}</span>
                                {av.shift_template && <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{av.shift_template.name} ({av.shift_template.start_time.slice(0, 5)} - {av.shift_template.end_time.slice(0, 5)})</span>}
                                {av.notes && <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>"{av.notes}"</span>}
                                <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '2px', color: 'var(--text-muted)' }} onClick={() => deleteAvailability(av.id)}>✕</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Performance Reviews ── */}
            <div className="card" style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>🎯 {zh ? '績效評估' : 'Performance Reviews'}</h4>
                    <button className="btn btn-sm btn-primary" onClick={() => setShowReviewForm(!showReviewForm)}>{showReviewForm ? '✕' : '➕'}</button>
                </div>
                {showReviewForm && (
                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div><label className="detail-label">{zh ? '評估日期' : 'Review Date'}</label><input className="input-field" type="date" value={reviewForm.review_date} onChange={e => setReviewForm({ ...reviewForm, review_date: e.target.value })} /></div>
                            <div><label className="detail-label">{zh ? '評分 (0-100)' : 'Points (0-100)'}</label><input className="input-field" type="number" min="0" max="100" value={reviewForm.points} onChange={e => setReviewForm({ ...reviewForm, points: e.target.value })} /></div>
                        </div>
                        <div style={{ marginTop: '8px' }}><label className="detail-label">{zh ? '評語 / 備註' : 'Comments'}</label><textarea className="input-field" value={reviewForm.comment} onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })} placeholder={zh ? '輸入針對此員工的評語…' : 'Enter review comments…'} rows={3} style={{ resize: 'vertical' }} /></div>
                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createReview}>{zh ? '提交評估' : 'Submit Review'}</button>
                    </div>
                )}
                {reviews.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>{zh ? '尚無績效評估紀錄' : 'No performance reviews yet'}</div>
                ) : (
                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        {reviews.map(rev => (
                            <div key={rev.id} style={{ padding: '10px', background: 'var(--bg-primary)', borderRadius: '6px', marginBottom: '8px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontWeight: 600 }}>{rev.review_date}</span>
                                    <span style={{ fontWeight: 700, color: rev.points >= 80 ? '#22c55e' : rev.points < 60 ? '#f43f5e' : '#f59e0b' }}>{rev.points} / 100</span>
                                </div>
                                {rev.comment && <div style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '6px', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{rev.comment}</div>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── LINE Integration ── */}
            <div className="card" style={{ marginTop: '14px' }}>
                <div style={{ marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>💬 {zh ? 'LINE 整合' : 'LINE Integration'}</h4>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '綁定 LINE 帳號與群組，用於通知與簽到' : 'Bind LINE account and group for notifications and check-ins'}</div>
                </div>
                <div style={{ display: 'grid', gap: '12px' }}>
                    <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                        <label className="detail-label">{zh ? '綁定個人 LINE 帳號' : 'Bind Personal LINE Account'}</label>
                        <select className="input-field" value={lineUsers.find(u => u.user_id === selected.id)?.id || ''} onChange={e => mapLineUser(selected.id, e.target.value || null)}>
                            <option value="">{zh ? '— 尚未綁定 —' : '— Unmapped —'}</option>
                            {lineUsers.filter(u => !u.is_verified || u.user_id === selected.id).map(u => (
                                <option key={u.id} value={u.id}>{u.display_name} {u.user_id === selected.id && (zh ? '(目前綁定)' : '(Current)')}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                        <label className="detail-label">{zh ? '所屬 LINE 群組（可多選）' : 'LINE Groups (multi-select)'}</label>
                        {lineGroups.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{zh ? '尚無群組，請先讓機器人加入群組' : 'No groups yet — add bot to a group first'}</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxHeight: '140px', overflowY: 'auto' }}>
                                {lineGroups.map(g => {
                                    const checked = editForm?.line_group_ids.includes(g.id) ?? false;
                                    return (
                                        <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', padding: '4px 0' }}>
                                            <input type="checkbox" checked={checked} onChange={e => {
                                                const ids = editForm?.line_group_ids ?? [];
                                                patchForm({ line_group_ids: e.target.checked ? [...ids, g.id] : ids.filter(id => id !== g.id) });
                                            }} />
                                            <span>💬 {g.group_name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        {editForm && editForm.line_group_ids.length > 0 && (
                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>{zh ? `已選 ${editForm.line_group_ids.length} 個群組` : `${editForm.line_group_ids.length} group(s) selected`}</div>
                        )}
                    </div>
                    <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                        <label className="detail-label">{zh ? 'LINE 管理員權限' : 'LINE Manager Access'}</label>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 500 }}>{zh ? '管理員指令存取' : 'Manager command access'}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{zh ? '開啟後可在 LINE 使用 /管理 全覽、排班、流程等指令' : 'Enables /manage commands in LINE: overview, scheduling, workflows'}</div>
                            </div>
                            <button onClick={() => updateField(selected.id, 'is_line_manager', !(selected as any).is_line_manager)}
                                style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: (selected as any).is_line_manager ? 'var(--accent-primary, #6366f1)' : 'var(--border-color, #333)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                <span style={{ position: 'absolute', top: '2px', left: (selected as any).is_line_manager ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Dependents ── */}
            <div className="card" style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>👨‍👩‍👧 {zh ? '眷屬' : 'Dependents'} ({dependents.length})</h4>
                    <button className="btn btn-sm btn-primary" onClick={() => setShowDependentForm(!showDependentForm)}>{showDependentForm ? '✕' : '➕'}</button>
                </div>
                {showDependentForm && (
                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div><label className="detail-label">{zh ? '關係' : 'Relationship'}</label>
                                <select className="input-field" value={depForm.relationship} onChange={e => setDepForm({ ...depForm, relationship: e.target.value })}>
                                    <option value="spouse">{zh ? '配偶' : 'Spouse'}</option><option value="child">{zh ? '子女' : 'Child'}</option>
                                    <option value="parent">{zh ? '父母' : 'Parent'}</option><option value="other">{zh ? '其他' : 'Other'}</option>
                                </select>
                            </div>
                            <div><label className="detail-label">{zh ? '姓名' : 'Name'} *</label><input className="input-field" value={depForm.name} onChange={e => setDepForm({ ...depForm, name: e.target.value })} /></div>
                            <div><label className="detail-label">{zh ? '身分證字號' : 'ID Number'}</label><input className="input-field" value={depForm.id_number} onChange={e => setDepForm({ ...depForm, id_number: e.target.value })} /></div>
                            <div><label className="detail-label">{zh ? '出生日期' : 'Birth Date'}</label><input className="input-field" type="date" value={depForm.birth_date} onChange={e => setDepForm({ ...depForm, birth_date: e.target.value })} /></div>
                            <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" id="dep-health" checked={depForm.health_ins_enrolled} onChange={e => setDepForm({ ...depForm, health_ins_enrolled: e.target.checked })} />
                                <label htmlFor="dep-health" style={{ fontSize: '13px', cursor: 'pointer' }}>{zh ? '眷屬健保投保' : 'Health insurance enrolled'}</label>
                            </div>
                            <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '備註' : 'Notes'}</label><input className="input-field" value={depForm.notes} onChange={e => setDepForm({ ...depForm, notes: e.target.value })} /></div>
                        </div>
                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createDependent}>{zh ? '新增眷屬' : 'Add Dependent'}</button>
                    </div>
                )}
                {dependents.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>{zh ? '尚無眷屬資料' : 'No dependents'}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {dependents.map(dep => (
                            <div key={dep.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '13px' }}>
                                <span className="badge" style={{ background: '#6366f155', color: '#6366f1', fontSize: '10px', padding: '1px 6px' }}>{zh ? { spouse: '配偶', child: '子女', parent: '父母', other: '其他' }[dep.relationship] || dep.relationship : dep.relationship}</span>
                                <span style={{ fontWeight: 600 }}>{dep.name}</span>
                                {dep.birth_date && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{dep.birth_date}</span>}
                                {dep.health_ins_enrolled && <span className="badge" style={{ background: '#22c55e33', color: '#22c55e', fontSize: '10px', padding: '1px 6px' }}>{zh ? '健保' : 'NHI'}</span>}
                                <button className="btn btn-sm" style={{ marginLeft: 'auto', color: 'var(--text-muted)', padding: '2px 6px' }} onClick={() => deleteDependent(dep.id)}>✕</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Position History ── */}
            <div className="card" style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>📋 {zh ? '異動紀錄' : 'Position History'} ({positionHistory.length})</h4>
                    <button className="btn btn-sm btn-primary" onClick={() => setShowPosHistForm(!showPosHistForm)}>{showPosHistForm ? '✕' : '➕'}</button>
                </div>
                {showPosHistForm && (
                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <div><label className="detail-label">{zh ? '異動類型' : 'Change Type'}</label>
                                <select className="input-field" value={posHistForm.change_type} onChange={e => setPosHistForm({ ...posHistForm, change_type: e.target.value })}>
                                    <option value="hire">{zh ? '入職' : 'Hire'}</option><option value="promotion">{zh ? '升職' : 'Promotion'}</option>
                                    <option value="demotion">{zh ? '降職' : 'Demotion'}</option><option value="transfer">{zh ? '調職' : 'Transfer'}</option>
                                    <option value="adjustment">{zh ? '薪資調整' : 'Salary Adjustment'}</option><option value="resign">{zh ? '離職' : 'Resign'}</option>
                                </select>
                            </div>
                            <div><label className="detail-label">{zh ? '生效日期' : 'Effective Date'} *</label><input className="input-field" type="date" value={posHistForm.effective_date} onChange={e => setPosHistForm({ ...posHistForm, effective_date: e.target.value })} /></div>
                            <div><label className="detail-label">{zh ? '職稱' : 'Title'}</label><input className="input-field" value={posHistForm.title} onChange={e => setPosHistForm({ ...posHistForm, title: e.target.value })} /></div>
                            <div><label className="detail-label">{zh ? '職等' : 'Job Grade'}</label><input className="input-field" value={posHistForm.job_grade} onChange={e => setPosHistForm({ ...posHistForm, job_grade: e.target.value })} placeholder="M1 / S3" /></div>
                            <div><label className="detail-label">{zh ? '部門' : 'Department'}</label>
                                <select className="input-field" value={posHistForm.department_id} onChange={e => setPosHistForm({ ...posHistForm, department_id: e.target.value })}>
                                    <option value="">{zh ? '— 未指派 —' : '— None —'}</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                            <div><label className="detail-label">{zh ? '門市' : 'Store'}</label>
                                <select className="input-field" value={posHistForm.store_id} onChange={e => setPosHistForm({ ...posHistForm, store_id: e.target.value })}>
                                    <option value="">{zh ? '— 未指派 —' : '— None —'}</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div><label className="detail-label">{zh ? '雇用類型' : 'Emp. Type'}</label>
                                <select className="input-field" value={posHistForm.employee_type} onChange={e => setPosHistForm({ ...posHistForm, employee_type: e.target.value })}>
                                    <option value="full_time">{typeLabel.full_time}</option><option value="part_time">{typeLabel.part_time}</option><option value="contract">{typeLabel.contract}</option>
                                </select>
                            </div>
                            <div><label className="detail-label">{zh ? '薪資類型' : 'Salary Type'}</label>
                                <select className="input-field" value={posHistForm.salary_type} onChange={e => setPosHistForm({ ...posHistForm, salary_type: e.target.value })}>
                                    <option value="monthly">{zh ? '月薪' : 'Monthly'}</option><option value="hourly">{zh ? '時薪' : 'Hourly'}</option>
                                </select>
                            </div>
                            {posHistForm.salary_type === 'monthly'
                                ? <div><label className="detail-label">{zh ? '月薪 (NT$)' : 'Base Salary'}</label><input className="input-field" type="number" value={posHistForm.base_salary} onChange={e => setPosHistForm({ ...posHistForm, base_salary: e.target.value })} /></div>
                                : <div><label className="detail-label">{zh ? '時薪 (NT$)' : 'Hourly Wage'}</label><input className="input-field" type="number" value={posHistForm.hourly_wage} onChange={e => setPosHistForm({ ...posHistForm, hourly_wage: e.target.value })} /></div>
                            }
                            <div><label className="detail-label">{zh ? '職務加給' : 'Role Allow.'}</label><input className="input-field" type="number" value={posHistForm.role_allowance} onChange={e => setPosHistForm({ ...posHistForm, role_allowance: e.target.value })} /></div>
                            <div><label className="detail-label">{zh ? '伙食津貼' : 'Meal Allow.'}</label><input className="input-field" type="number" value={posHistForm.meal_allowance} onChange={e => setPosHistForm({ ...posHistForm, meal_allowance: e.target.value })} /></div>
                            <div><label className="detail-label">{zh ? '交通津貼' : 'Transport Allow.'}</label><input className="input-field" type="number" value={posHistForm.transport_allowance} onChange={e => setPosHistForm({ ...posHistForm, transport_allowance: e.target.value })} /></div>
                            <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '異動原因' : 'Reason'}</label><input className="input-field" value={posHistForm.reason} onChange={e => setPosHistForm({ ...posHistForm, reason: e.target.value })} /></div>
                            <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '備註' : 'Notes'}</label><input className="input-field" value={posHistForm.notes} onChange={e => setPosHistForm({ ...posHistForm, notes: e.target.value })} /></div>
                        </div>
                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={addPositionHistory}>{zh ? '新增紀錄' : 'Add Record'}</button>
                    </div>
                )}
                {positionHistory.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>{zh ? '尚無異動紀錄' : 'No position history'}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {positionHistory.map(ph => {
                            const changeColors: Record<string, string> = { hire: '#22c55e', promotion: '#6366f1', demotion: '#f43f5e', transfer: '#f59e0b', adjustment: '#06b6d4', resign: '#666' };
                            const changeLabels: Record<string, string> = { hire: zh ? '入職' : 'Hire', promotion: zh ? '升職' : 'Promotion', demotion: zh ? '降職' : 'Demotion', transfer: zh ? '調職' : 'Transfer', adjustment: zh ? '薪資調整' : 'Adjustment', resign: zh ? '離職' : 'Resign' };
                            return (
                                <div key={ph.id} style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '8px', fontSize: '13px', borderLeft: `3px solid ${changeColors[ph.change_type] || '#666'}` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <span className="badge" style={{ background: changeColors[ph.change_type] || '#666', fontSize: '10px', padding: '1px 7px', color: '#fff' }}>{changeLabels[ph.change_type] || ph.change_type}</span>
                                        <span style={{ fontWeight: 600 }}>{ph.effective_date}</span>
                                        {ph.title && <span style={{ color: 'var(--text-secondary)' }}>{ph.title}</span>}
                                        {ph.job_grade && <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: '4px' }}>{ph.job_grade}</span>}
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '12px' }}>
                                        {ph.department_name && <span>🏢 {ph.department_name}</span>}
                                        {ph.store_name && <span>🏪 {ph.store_name}</span>}
                                        {ph.salary_type === 'monthly' && ph.base_salary != null && <span>💰 NT${ph.base_salary.toLocaleString()}/{zh ? '月' : 'mo'}</span>}
                                        {ph.salary_type === 'hourly' && ph.hourly_wage != null && <span>💰 NT${ph.hourly_wage}/hr</span>}
                                        {ph.role_allowance != null && ph.role_allowance > 0 && <span>+{zh ? '職務' : 'Role'} ${ph.role_allowance}</span>}
                                        {ph.meal_allowance != null && ph.meal_allowance > 0 && <span>+{zh ? '伙食' : 'Meal'} ${ph.meal_allowance}</span>}
                                        {ph.transport_allowance != null && ph.transport_allowance > 0 && <span>+{zh ? '交通' : 'Transport'} ${ph.transport_allowance}</span>}
                                    </div>
                                    {ph.reason && <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{ph.reason}"</div>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
