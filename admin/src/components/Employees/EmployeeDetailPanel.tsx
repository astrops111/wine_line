import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { t, getLocale } from '../../lib/i18n';
import { useOrg } from '../../lib/OrgContext';
import {
    getTypeLabel,
    getLeaveTypeLabel, LEAVE_STATUS_COLOR,
    getAvailLabel, AVAIL_COLOR, getDaysOfWeek,
    SPECIAL_IDENTITY_OPTIONS,
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

type Tab = 'personal' | 'org' | 'skills' | 'schedule' | 'records';

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

    const [tab, setTab] = useState<Tab>('personal');

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
        await supabase.from('leave_requests').insert({ user_id: selected.id, store_id: selected.store_id, organization_id: orgId, start_date: leaveForm.start_date, end_date: leaveForm.end_date, leave_type: leaveForm.leave_type, reason: leaveForm.reason || null, status: 'pending', is_paid: !['unpaid', 'block_off'].includes(leaveForm.leave_type) });
        setLeaveForm({ start_date: '', end_date: '', leave_type: 'annual', reason: '' }); setShowLeaveForm(false); await loadLeaves(selected.id);
    };
    const updateLeaveStatus = async (leaveId: string, status: string) => { await supabase.from('leave_requests').update({ status, approved_at: status === 'approved' ? new Date().toISOString() : null }).eq('id', leaveId); await loadLeaves(selected.id); };
    const createReview = async () => {
        if (!reviewForm.review_date || !reviewForm.points) return;
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('performance_reviews').insert({ user_id: selected.id, reviewer_id: user?.id || null, points: Number(reviewForm.points), comment: reviewForm.comment || null, review_date: reviewForm.review_date, organization_id: orgId });
        setReviewForm({ points: '100', comment: '', review_date: new Date().toISOString().split('T')[0] }); setShowReviewForm(false); await loadReviews(selected.id);
    };
    const saveAvailability = async () => {
        await supabase.from('employee_availability').delete().eq('user_id', selected.id).eq('day_of_week', availForm.day_of_week);
        await supabase.from('employee_availability').insert({ user_id: selected.id, store_id: selected.store_id || null, day_of_week: availForm.day_of_week, availability: availForm.availability, preferred_shift_id: availForm.preferred_shift_id || null, notes: availForm.notes || null });
        setAvailForm({ day_of_week: 1, availability: 'available', preferred_shift_id: '', notes: '' }); setShowAvailForm(false); await loadAvailabilities(selected.id);
    };
    const deleteAvailability = async (id: string) => { await supabase.from('employee_availability').delete().eq('id', id); await loadAvailabilities(selected.id); };
    const createDependent = async () => {
        if (!depForm.name.trim()) return;
        await supabase.from('employee_dependents').insert({ organization_id: orgId, user_id: selected.id, relationship: depForm.relationship, name: depForm.name.trim(), id_number: depForm.id_number || null, birth_date: depForm.birth_date || null, health_ins_enrolled: depForm.health_ins_enrolled, notes: depForm.notes || null });
        setDepForm({ relationship: 'spouse', name: '', id_number: '', birth_date: '', health_ins_enrolled: false, notes: '' }); setShowDependentForm(false); await loadDependents(selected.id);
    };
    const deleteDependent = async (id: string) => { await supabase.from('employee_dependents').delete().eq('id', id); await loadDependents(selected.id); };
    const addPositionHistory = async () => {
        if (!posHistForm.effective_date) return;
        const deptName = departments.find(d => d.id === posHistForm.department_id)?.name || null;
        const storeName = stores.find(s => s.id === posHistForm.store_id)?.name || null;
        await supabase.from('employee_position_history').insert({
            organization_id: orgId, user_id: selected.id, change_type: posHistForm.change_type, effective_date: posHistForm.effective_date,
            title: posHistForm.title || null, job_grade: posHistForm.job_grade || null, department_id: posHistForm.department_id || null, department_name: deptName,
            store_id: posHistForm.store_id || null, store_name: storeName, employee_type: posHistForm.employee_type || null, salary_type: posHistForm.salary_type,
            base_salary: posHistForm.base_salary ? Number(posHistForm.base_salary) : null, hourly_wage: posHistForm.hourly_wage ? Number(posHistForm.hourly_wage) : null,
            role_allowance: posHistForm.role_allowance ? Number(posHistForm.role_allowance) : null, meal_allowance: posHistForm.meal_allowance ? Number(posHistForm.meal_allowance) : null,
            transport_allowance: posHistForm.transport_allowance ? Number(posHistForm.transport_allowance) : null, reason: posHistForm.reason || null, notes: posHistForm.notes || null,
        });
        setPosHistForm({ change_type: 'promotion', effective_date: '', title: '', job_grade: '', department_id: '', store_id: '', employee_type: 'full_time', salary_type: 'monthly', base_salary: '', hourly_wage: '', role_allowance: '', meal_allowance: '', transport_allowance: '', reason: '', notes: '' });
        setShowPosHistForm(false); await loadPositionHistory(selected.id);
    };
    const addSkill = async () => { if (!newSkill.skill_name.trim()) return; await supabase.from('employee_skills').insert({ user_id: selected.id, skill_name: newSkill.skill_name.trim(), proficiency: newSkill.proficiency }); setNewSkill({ skill_name: '', proficiency: 'basic' }); await loadSkills(selected.id); };
    const removeSkill = async (id: string) => { await supabase.from('employee_skills').delete().eq('id', id); await loadSkills(selected.id); };
    const toggleOnboardingTask = async (taskId: string, completed: boolean) => { await supabase.from('onboarding_tasks').update({ status: completed ? 'completed' : 'pending', completed_at: completed ? new Date().toISOString() : null }).eq('id', taskId); await loadOnboardingTasks(selected.id); };

    // ── Section style helpers ──
    const sectionLabel = (icon: string, label: string) => (
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{icon} {label}</div>
    );
    const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } as const;

    const tabs: { key: Tab; label: string }[] = [
        { key: 'personal', label: zh ? '個人資訊' : 'Personal' },
        { key: 'org', label: zh ? '組織' : 'Organization' },
        { key: 'skills', label: zh ? '技能' : 'Skills' },
        { key: 'schedule', label: zh ? '排班' : 'Schedule' },
        { key: 'records', label: zh ? '紀錄' : 'Records' },
    ];

    return (
        <div className="fade-in">
            {/* ── Sticky header ── */}
            <EmployeeEditCard
                selected={selected} editForm={editForm} isDirty={isDirty}
                saveEmployee={saveEmployee} onClose={onClose}
            />

            {/* ── Tab bar ── */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--outline-variant)', padding: '0 20px', background: 'var(--bg-primary)' }}>
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                        padding: '10px 16px', fontSize: '13px', fontWeight: tab === t.key ? 600 : 400,
                        color: tab === t.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        borderBottom: tab === t.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        marginBottom: '-2px', transition: 'all 0.15s',
                    }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Tab content ── */}
            <div style={{ padding: '20px' }}>

            {/* ════════ PERSONAL TAB ════════ */}
            {tab === 'personal' && editForm && (
            <div style={{ display: 'grid', gap: '16px' }}>
                {/* Names */}
                <div>
                    {sectionLabel('👤', zh ? '姓名' : 'Names')}
                    <div style={grid2}>
                        <div><label className="detail-label">{zh ? '姓' : 'Last Name'}</label><input className="input-field" value={editForm.last_name} onChange={e => patchForm({ last_name: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '名' : 'First Name'}</label><input className="input-field" value={editForm.first_name} onChange={e => patchForm({ first_name: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '英文名' : 'English Name'}</label><input className="input-field" value={editForm.english_name} onChange={e => patchForm({ english_name: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '職等' : 'Job Grade'}</label><input className="input-field" value={editForm.job_grade} onChange={e => patchForm({ job_grade: e.target.value })} placeholder="M1 / S3" /></div>
                    </div>
                </div>
                {/* Personal info */}
                <div>
                    {sectionLabel('📋', zh ? '個人資料' : 'Personal Info')}
                    <div style={grid2}>
                        <div><label className="detail-label">{zh ? '出生日期' : 'Birth Date'}</label><input className="input-field" type="date" value={editForm.birth_date} onChange={e => patchForm({ birth_date: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '性別' : 'Gender'}</label>
                            <select className="input-field" value={editForm.gender} onChange={e => patchForm({ gender: e.target.value })}>
                                <option value="">{zh ? '— 請選擇 —' : '— Select —'}</option>
                                <option value="male">{zh ? '男' : 'Male'}</option>
                                <option value="female">{zh ? '女' : 'Female'}</option>
                                <option value="other">{zh ? '其他' : 'Other'}</option>
                            </select>
                        </div>
                        <div><label className="detail-label">{zh ? '國籍' : 'Nationality'}</label><input className="input-field" value={editForm.nationality} onChange={e => patchForm({ nationality: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '身分證字號' : 'ID Number'}</label><input className="input-field" value={editForm.id_number} onChange={e => patchForm({ id_number: e.target.value })} /></div>
                        <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '地址' : 'Address'}</label><input className="input-field" value={editForm.address} onChange={e => patchForm({ address: e.target.value })} /></div>
                    </div>
                </div>
                {/* Emergency contact */}
                <div>
                    {sectionLabel('🚨', zh ? '緊急聯絡人' : 'Emergency Contact')}
                    <div style={grid2}>
                        <div><label className="detail-label">{zh ? '姓名' : 'Name'}</label><input className="input-field" value={editForm.emergency_contact_name} onChange={e => patchForm({ emergency_contact_name: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '電話' : 'Phone'}</label><input className="input-field" value={editForm.emergency_contact_phone} onChange={e => patchForm({ emergency_contact_phone: e.target.value })} /></div>
                    </div>
                </div>
                {/* Banking */}
                <div>
                    {sectionLabel('🏦', zh ? '銀行帳戶' : 'Bank Account')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                        <div><label className="detail-label">{zh ? '銀行代碼' : 'Bank Code'}</label><input className="input-field" value={editForm.bank_code} onChange={e => patchForm({ bank_code: e.target.value })} placeholder="004" /></div>
                        <div><label className="detail-label">{zh ? '帳號' : 'Account No.'}</label><input className="input-field" value={editForm.bank_account} onChange={e => patchForm({ bank_account: e.target.value })} /></div>
                    </div>
                </div>
                {/* Work permit (foreign workers) */}
                {selected.nationality && selected.nationality !== 'TW' && (
                <div>
                    {sectionLabel('🛂', zh ? '工作證資訊' : 'Work Permit')}
                    <div style={grid2}>
                        <div><label className="detail-label">{zh ? '工作證號碼' : 'Permit Number'}</label><input className="input-field" value={(editForm as any).work_permit_number || ''} onChange={e => patchForm({ work_permit_number: e.target.value } as any)} /></div>
                        <div><label className="detail-label">{zh ? '到期日' : 'Permit Expiry'}</label><input className="input-field" type="date" value={(editForm as any).work_permit_expiry || ''} onChange={e => patchForm({ work_permit_expiry: e.target.value } as any)} /></div>
                    </div>
                </div>
                )}
                {/* Special identity */}
                <div>
                    {sectionLabel('🏷️', zh ? '特殊身分類別' : 'Special Identity')}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {SPECIAL_IDENTITY_OPTIONS.map(opt => {
                            const checked = editForm.special_identities.includes(opt.value);
                            return (
                                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`, background: checked ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: checked ? 600 : 400 }}>
                                    <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                        onChange={() => patchForm({ special_identities: checked ? editForm.special_identities.filter(v => v !== opt.value) : [...editForm.special_identities, opt.value] })} />
                                    {zh ? opt.zh : opt.en}
                                </label>
                            );
                        })}
                    </div>
                </div>
            </div>
            )}

            {/* ════════ ORGANIZATION TAB ════════ */}
            {tab === 'org' && editForm && (
            <div style={{ display: 'grid', gap: '16px' }}>
                {/* Employment */}
                <div>
                    {sectionLabel('💼', zh ? '僱用資訊' : 'Employment')}
                    <div style={grid2}>
                        <div><label className="detail-label">{t('employee.type')}</label>
                            <select className="input-field" value={editForm.employee_type} onChange={e => patchForm({ employee_type: e.target.value })}>
                                <option value="full_time">{typeLabel.full_time}</option>
                                <option value="part_time">{typeLabel.part_time}</option>
                                <option value="contract">{typeLabel.contract}</option>
                            </select>
                        </div>
                        <div><label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                            <select className="input-field" value={editForm.status} onChange={e => patchForm({ status: e.target.value })}>
                                <option value="active">{zh ? '在職' : 'Active'}</option>
                                <option value="inactive">{zh ? '離職' : 'Inactive'}</option>
                            </select>
                        </div>
                        <div><label className="detail-label">{t('employee.phone')}</label><input className="input-field" value={editForm.phone} onChange={e => patchForm({ phone: e.target.value })} /></div>
                        <div><label className="detail-label">{t('employee.hire_date')}</label><input className="input-field" type="date" value={editForm.hire_date} onChange={e => patchForm({ hire_date: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '試用期結束' : 'Probation End'}</label><input className="input-field" type="date" value={editForm.probation_end_date} onChange={e => patchForm({ probation_end_date: e.target.value })} /></div>
                        <div><label className="detail-label">{zh ? '離職日期' : 'Resign Date'}</label><input className="input-field" type="date" value={editForm.resign_date} onChange={e => patchForm({ resign_date: e.target.value })} /></div>
                        <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '離職原因' : 'Termination Reason'}</label><input className="input-field" value={editForm.termination_reason} onChange={e => patchForm({ termination_reason: e.target.value })} /></div>
                    </div>
                </div>
                {/* Store / Company / Department */}
                <div>
                    {sectionLabel('🏪', zh ? '門市 / 公司 / 部門' : 'Store / Company / Department')}
                    <div style={{ marginBottom: '10px' }}>
                        <label className="detail-label">{t('employee.store')} ({zh ? '可多選' : 'multi-select'})</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                            {stores.map(s => {
                                const checked = editForm.store_ids.includes(s.id);
                                return (
                                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`, background: checked ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: checked ? 600 : 400 }}>
                                        <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                            onChange={() => patchForm({ store_ids: checked ? editForm.store_ids.filter(id => id !== s.id) : [...editForm.store_ids, s.id] })} />
                                        {s.name}
                                        {editForm.store_ids[0] === s.id && <span style={{ fontSize: '9px', color: 'var(--accent-primary)', marginLeft: '2px' }}>★</span>}
                                    </label>
                                );
                            })}
                        </div>
                        {editForm.store_ids.length > 1 && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>★ {zh ? '為主要門市' : 'Primary store'}</div>}
                    </div>
                    <div style={grid2}>
                        <div><label className="detail-label">{zh ? '公司' : 'Company'}</label>
                            <select className="input-field" value={editForm.company_id} onChange={e => {
                                const newCid = e.target.value;
                                const deptOk = departments.find(d => d.id === editForm.department_id && d.company_id === newCid);
                                patchForm({ company_id: newCid, ...(!deptOk ? { department_id: '', department: '' } : {}) });
                            }}>
                                <option value="">{zh ? '未指派' : 'Unassigned'}</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div><label className="detail-label">{zh ? '部門' : 'Department'}</label>
                            <select className="input-field" value={editForm.department_id} onChange={e => patchForm({ department_id: e.target.value, department: departments.find(d => d.id === e.target.value)?.name || '' })}>
                                <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                                {(editForm.company_id ? departments.filter(d => d.company_id === editForm.company_id) : departments).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div><label className="detail-label">{t('employee.position')}</label>
                            <input className="input-field" list="edit-positions-list" value={editForm.position} onChange={e => patchForm({ position: e.target.value })} placeholder={zh ? '輸入或選擇職位' : 'Enter or select position'} />
                            <datalist id="edit-positions-list">
                                {Array.from(new Set(employees.map(e => e.position).filter(Boolean))).map(p => <option key={p as string} value={p as string} />)}
                            </datalist>
                        </div>
                        <div><label className="detail-label">{zh ? '直屬主管' : 'Reporting To'}</label>
                            <select className="input-field" value={editForm.reporting_to} onChange={e => patchForm({ reporting_to: e.target.value })}>
                                <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                                {employees.filter(e => e.id !== selected?.id && (e.is_manager || e.is_line_manager)).map(e => <option key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ''}</option>)}
                                {employees.filter(e => e.id !== selected?.id && !e.is_manager && !e.is_line_manager).length > 0 && (
                                    <optgroup label={zh ? '其他員工' : 'Other employees'}>
                                        {employees.filter(e => e.id !== selected?.id && !e.is_manager && !e.is_line_manager).map(e => <option key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ''}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    </div>
                </div>
                {/* Compensation */}
                <div>
                    {sectionLabel('💰', zh ? '薪資' : 'Compensation')}
                    <div style={grid2}>
                        <div><label className="detail-label">{t('employee.wage')} (NT$)</label><input className="input-field" type="number" value={editForm.hourly_wage} onChange={e => patchForm({ hourly_wage: e.target.value })} /></div>
                        <div><label className="detail-label">{t('employee.max_hours')}</label><input className="input-field" type="number" value={editForm.max_hours_per_week} onChange={e => patchForm({ max_hours_per_week: e.target.value })} /></div>
                    </div>
                </div>
                {/* Insurance */}
                <div>
                    {sectionLabel('🏥', zh ? '勞健保' : 'Insurance')}
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {/* Labor ins */}
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editForm.labor_ins_enrolled ? '8px' : 0 }}>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '勞工保險' : 'Labor Insurance'}</span>
                                <button onClick={() => patchForm({ labor_ins_enrolled: !editForm.labor_ins_enrolled })} style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: editForm.labor_ins_enrolled ? 'var(--accent-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                    <span style={{ position: 'absolute', top: '2px', left: editForm.labor_ins_enrolled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                                </button>
                            </div>
                            {editForm.labor_ins_enrolled && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                    <div><label className="detail-label">{zh ? '投保級距' : 'Grade'}</label><input className="input-field" type="number" value={editForm.labor_ins_grade} onChange={e => patchForm({ labor_ins_grade: e.target.value })} /></div>
                                    <div><label className="detail-label">{zh ? '加保日期' : 'Enrolled'}</label><input className="input-field" type="date" value={editForm.labor_ins_enrolled_date} onChange={e => patchForm({ labor_ins_enrolled_date: e.target.value })} /></div>
                                    <div><label className="detail-label">{zh ? '退保日期' : 'Withdrawn'}</label><input className="input-field" type="date" value={editForm.labor_ins_withdraw_date} onChange={e => patchForm({ labor_ins_withdraw_date: e.target.value })} /></div>
                                </div>
                            )}
                        </div>
                        {/* Health ins */}
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editForm.health_ins_enrolled ? '8px' : 0 }}>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '全民健康保險' : 'Health Insurance'}</span>
                                <button onClick={() => patchForm({ health_ins_enrolled: !editForm.health_ins_enrolled })} style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: editForm.health_ins_enrolled ? 'var(--accent-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                    <span style={{ position: 'absolute', top: '2px', left: editForm.health_ins_enrolled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                                </button>
                            </div>
                            {editForm.health_ins_enrolled && (
                                <div style={grid2}>
                                    <div><label className="detail-label">{zh ? '投保級距' : 'Grade'}</label><input className="input-field" type="number" value={editForm.health_ins_grade} onChange={e => patchForm({ health_ins_grade: e.target.value })} /></div>
                                    <div><label className="detail-label">{zh ? '加保日期' : 'Enrolled'}</label><input className="input-field" type="date" value={editForm.health_ins_enrolled_date} onChange={e => patchForm({ health_ins_enrolled_date: e.target.value })} /></div>
                                </div>
                            )}
                        </div>
                        {/* Labor pension */}
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '勞工退休金' : 'Labor Pension'}</span>
                                <button onClick={() => patchForm({ labor_pension_enrolled: !editForm.labor_pension_enrolled })} style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: editForm.labor_pension_enrolled ? 'var(--accent-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                    <span style={{ position: 'absolute', top: '2px', left: editForm.labor_pension_enrolled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                                </button>
                            </div>
                            {editForm.labor_pension_enrolled && (
                                <div style={{ marginTop: '8px' }}><label className="detail-label">{zh ? '提繳率 (%)' : 'Rate (%)'}</label><input className="input-field" type="number" step="0.5" value={editForm.labor_pension_rate} onChange={e => patchForm({ labor_pension_rate: e.target.value })} /></div>
                            )}
                        </div>
                    </div>
                </div>
                {/* LINE Integration */}
                <div>
                    {sectionLabel('💬', zh ? 'LINE 整合' : 'LINE Integration')}
                    <div style={{ display: 'grid', gap: '10px' }}>
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <label className="detail-label">{zh ? '綁定個人 LINE 帳號' : 'Bind Personal LINE Account'}</label>
                            <select className="input-field" value={lineUsers.find(u => u.user_id === selected.id)?.id || ''} onChange={e => mapLineUser(selected.id, e.target.value || null)}>
                                <option value="">{zh ? '— 尚未綁定 —' : '— Unmapped —'}</option>
                                {lineUsers.filter(u => !u.is_verified || u.user_id === selected.id).map(u => (
                                    <option key={u.id} value={u.id}>{u.display_name} {u.user_id === selected.id && (zh ? '(目前綁定)' : '(Current)')}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <label className="detail-label">{zh ? '所屬 LINE 群組' : 'LINE Groups'}</label>
                            {lineGroups.length === 0 ? (
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{zh ? '尚無群組' : 'No groups yet'}</div>
                            ) : (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                    {lineGroups.map(g => {
                                        const checked = editForm?.line_group_ids.includes(g.id) ?? false;
                                        return (
                                            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`, background: checked ? 'var(--accent-primary-dim)' : 'transparent', cursor: 'pointer', fontSize: '12px' }}>
                                                <input type="checkbox" checked={checked} onChange={e => { const ids = editForm?.line_group_ids ?? []; patchForm({ line_group_ids: e.target.checked ? [...ids, g.id] : ids.filter(id => id !== g.id) }); }} />
                                                {g.group_name}
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 500 }}>{zh ? 'LINE 管理員權限' : 'LINE Manager Access'}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{zh ? '開啟後可在 LINE 使用管理指令' : 'Enables /manage commands in LINE'}</div>
                            </div>
                            <button onClick={() => updateField(selected.id, 'is_line_manager', !(selected as any).is_line_manager)}
                                style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: (selected as any).is_line_manager ? 'var(--accent-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                <span style={{ position: 'absolute', top: '2px', left: (selected as any).is_line_manager ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                            </button>
                        </div>
                    </div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => generateCertificate(selected)}>📄 {zh ? '服務證明' : 'Certificate'}</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => doTransfer(selected)}>🔄 {zh ? '跨店調動' : 'Transfer'}</button>
                </div>
            </div>
            )}

            {/* ════════ SKILLS TAB ════════ */}
            {tab === 'skills' && (
            <div style={{ display: 'grid', gap: '16px' }}>
                {/* Skills & Certifications */}
                <div>
                    {sectionLabel('🏷️', zh ? '技能 / 證照' : 'Skills / Certifications')}
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
                        <button className="btn btn-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--outline-variant)', fontWeight: 700, fontSize: '15px', lineHeight: 1, padding: '3px 10px' }} onClick={addSkill}>+</button>
                    </div>
                </div>
                {/* Open / Close */}
                <div>
                    {sectionLabel('🔑', zh ? '開 / 關店' : 'Open / Close Store')}
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!selected.can_open} style={{ accentColor: 'var(--accent-primary)' }}
                                onChange={async (e) => { await updateField(selected.id, 'can_open', e.target.checked); }} />
                            {zh ? '可開店' : 'Can Open'}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!selected.can_close} style={{ accentColor: 'var(--accent-primary)' }}
                                onChange={async (e) => { await updateField(selected.id, 'can_close', e.target.checked); }} />
                            {zh ? '可關店' : 'Can Close'}
                        </label>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        {zh ? 'AI 排班會優先安排有開/關店能力的員工於營業起始或結束時段' : 'AI scheduler will prefer open/close-capable employees for opening/closing shifts'}
                    </div>
                </div>
            </div>
            )}

            {/* ════════ SCHEDULE TAB ════════ */}
            {tab === 'schedule' && (
            <div style={{ display: 'grid', gap: '16px' }}>
                {/* Leave / Block-Off */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        {sectionLabel('📋', zh ? '請假 / 排除日期' : 'Leave / Block-Off')}
                        <button className="btn btn-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--outline-variant)', fontWeight: 700, fontSize: '15px', lineHeight: 1, padding: '3px 10px' }} onClick={() => setShowLeaveForm(!showLeaveForm)}>{showLeaveForm ? '✕' : '+'}</button>
                    </div>
                    {showLeaveForm && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                            <div style={grid2}>
                                <div><label className="detail-label">{zh ? '開始日期' : 'Start'}</label><input className="input-field" type="date" value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })} /></div>
                                <div><label className="detail-label">{zh ? '結束日期' : 'End'}</label><input className="input-field" type="date" value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })} /></div>
                                <div><label className="detail-label">{zh ? '類型' : 'Type'}</label>
                                    <select className="input-field" value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
                                        {Object.entries(leaveTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                                <div><label className="detail-label">{zh ? '原因' : 'Reason'}</label><input className="input-field" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder={zh ? '選填' : 'Optional'} /></div>
                            </div>
                            <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createLeave}>{zh ? '提交' : 'Submit'}</button>
                        </div>
                    )}
                    {leaves.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>{zh ? '尚無請假紀錄' : 'No leave requests'}</div>
                    ) : (
                        <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                            {leaves.map(lv => (
                                <div key={lv.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: '6px', marginBottom: '4px', fontSize: '12px' }}>
                                    <span className="badge" style={{ background: LEAVE_STATUS_COLOR[lv.status], fontSize: '10px', padding: '1px 6px' }}>
                                        {lv.status === 'pending' ? (zh ? '待審核' : 'Pending') : lv.status === 'approved' ? (zh ? '已批準' : 'Approved') : lv.status === 'rejected' ? (zh ? '已拒絕' : 'Rejected') : (zh ? '已取消' : 'Cancelled')}
                                    </span>
                                    <span style={{ fontWeight: 600 }}>{leaveTypeLabel[lv.leave_type]}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>{lv.start_date} ~ {lv.end_date}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>({lv.total_days}{zh ? '天' : 'd'})</span>
                                    {lv.status === 'pending' && (
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                                            <button className="btn btn-sm" style={{ padding: '1px 6px', fontSize: '11px', color: '#22c55e' }} onClick={() => updateLeaveStatus(lv.id, 'approved')}>✓</button>
                                            <button className="btn btn-sm" style={{ padding: '1px 6px', fontSize: '11px', color: '#f43f5e' }} onClick={() => updateLeaveStatus(lv.id, 'rejected')}>✕</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {/* Shift Preferences */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        {sectionLabel('📅', zh ? '排班偏好' : 'Shift Preferences')}
                        <button className="btn btn-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--outline-variant)', fontWeight: 700, fontSize: '15px', lineHeight: 1, padding: '3px 10px' }} onClick={() => setShowAvailForm(!showAvailForm)}>{showAvailForm ? '✕' : '+'}</button>
                    </div>
                    {showAvailForm && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                            <div style={grid2}>
                                <div><label className="detail-label">{zh ? '星期' : 'Day'}</label>
                                    <select className="input-field" value={availForm.day_of_week} onChange={e => setAvailForm({ ...availForm, day_of_week: Number(e.target.value) })}>
                                        {daysOfWeek.map((day, idx) => <option key={idx} value={idx}>{day}</option>)}
                                    </select>
                                </div>
                                <div><label className="detail-label">{zh ? '意願' : 'Availability'}</label>
                                    <select className="input-field" value={availForm.availability} onChange={e => setAvailForm({ ...availForm, availability: e.target.value })}>
                                        {Object.entries(availLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                    </select>
                                </div>
                            </div>
                            {availForm.availability !== 'unavailable' && (
                                <div style={{ marginTop: '8px' }}><label className="detail-label">{zh ? '偏好時段' : 'Preferred Shift'}</label>
                                    <select className="input-field" value={availForm.preferred_shift_id} onChange={e => setAvailForm({ ...availForm, preferred_shift_id: e.target.value })}>
                                        <option value="">{zh ? '無特定偏好' : 'No preference'}</option>
                                        {shiftTemplates.filter(s => !s.store_id || s.store_id === selected.store_id).map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})</option>)}
                                    </select>
                                </div>
                            )}
                            <div style={{ marginTop: '8px' }}><label className="detail-label">{zh ? '備註' : 'Notes'}</label><input className="input-field" value={availForm.notes} onChange={e => setAvailForm({ ...availForm, notes: e.target.value })} /></div>
                            <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={saveAvailability}>{zh ? '儲存' : 'Save'}</button>
                        </div>
                    )}
                    {availabilities.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>{zh ? '尚無排班偏好' : 'No preferences'}</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {availabilities.map(av => (
                                <div key={av.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '13px' }}>
                                    <span style={{ fontWeight: 600, width: '40px' }}>{daysOfWeek[av.day_of_week]}</span>
                                    <span className="badge" style={{ background: AVAIL_COLOR[av.availability], fontSize: '11px', padding: '2px 6px', color: '#fff' }}>{availLabel[av.availability] || av.availability}</span>
                                    {av.shift_template && <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{av.shift_template.name}</span>}
                                    {av.notes && <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{av.notes}"</span>}
                                    <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '2px', color: 'var(--text-muted)' }} onClick={() => deleteAvailability(av.id)}>✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* ════════ RECORDS TAB ════════ */}
            {tab === 'records' && (
            <div style={{ display: 'grid', gap: '16px' }}>
                {/* Onboarding/Offboarding */}
                {onboardingTasks.length > 0 && (() => {
                    const onTasks = onboardingTasks.filter(t => t.type === 'onboarding');
                    const offTasks = onboardingTasks.filter(t => t.type === 'offboarding');
                    const renderChecklist = (tasks: typeof onboardingTasks, label: string) => {
                        if (tasks.length === 0) return null;
                        const completed = tasks.filter(t => t.status === 'completed').length;
                        const pct = Math.round((completed / tasks.length) * 100);
                        return (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{label}</span>
                                    <span style={{ fontSize: '12px', color: pct === 100 ? '#22c55e' : 'var(--text-muted)' }}>{completed}/{tasks.length} ({pct}%)</span>
                                </div>
                                <div className="progress-bar" style={{ marginBottom: '8px', height: '4px' }}>
                                    <div className="progress-bar-fill" style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : undefined }} />
                                </div>
                                {tasks.map(task => (
                                    <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--outline-variant)' }}>
                                        <input type="checkbox" checked={task.status === 'completed'} onChange={e => toggleOnboardingTask(task.id, e.target.checked)} style={{ marginTop: '2px', accentColor: 'var(--accent-primary)' }} />
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
                    return <>{renderChecklist(onTasks, zh ? '📋 到職清單' : '📋 Onboarding')}{renderChecklist(offTasks, zh ? '📋 離職清單' : '📋 Offboarding')}</>;
                })()}

                {/* Performance Reviews */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        {sectionLabel('🎯', zh ? '績效評估' : 'Performance Reviews')}
                        <button className="btn btn-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--outline-variant)', fontWeight: 700, fontSize: '15px', lineHeight: 1, padding: '3px 10px' }} onClick={() => setShowReviewForm(!showReviewForm)}>{showReviewForm ? '✕' : '+'}</button>
                    </div>
                    {showReviewForm && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                            <div style={grid2}>
                                <div><label className="detail-label">{zh ? '評估日期' : 'Review Date'}</label><input className="input-field" type="date" value={reviewForm.review_date} onChange={e => setReviewForm({ ...reviewForm, review_date: e.target.value })} /></div>
                                <div><label className="detail-label">{zh ? '評分 (0-100)' : 'Points (0-100)'}</label><input className="input-field" type="number" min="0" max="100" value={reviewForm.points} onChange={e => setReviewForm({ ...reviewForm, points: e.target.value })} /></div>
                            </div>
                            <div style={{ marginTop: '8px' }}><label className="detail-label">{zh ? '評語' : 'Comments'}</label><textarea className="input-field" value={reviewForm.comment} onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })} rows={3} style={{ resize: 'vertical' }} /></div>
                            <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createReview}>{zh ? '提交' : 'Submit'}</button>
                        </div>
                    )}
                    {reviews.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>{zh ? '尚無紀錄' : 'No reviews'}</div>
                    ) : (
                        <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                            {reviews.map(rev => (
                                <div key={rev.id} style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '6px', marginBottom: '6px', fontSize: '13px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontWeight: 600 }}>{rev.review_date}</span>
                                        <span style={{ fontWeight: 700, color: rev.points >= 80 ? '#22c55e' : rev.points < 60 ? '#f43f5e' : '#f59e0b' }}>{rev.points}/100</span>
                                    </div>
                                    {rev.comment && <div style={{ color: 'var(--text-secondary)', padding: '4px 6px', background: 'var(--bg-primary)', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{rev.comment}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Dependents */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        {sectionLabel('👨‍👩‍👧', zh ? `眷屬 (${dependents.length})` : `Dependents (${dependents.length})`)}
                        <button className="btn btn-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--outline-variant)', fontWeight: 700, fontSize: '15px', lineHeight: 1, padding: '3px 10px' }} onClick={() => setShowDependentForm(!showDependentForm)}>{showDependentForm ? '✕' : '+'}</button>
                    </div>
                    {showDependentForm && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                            <div style={grid2}>
                                <div><label className="detail-label">{zh ? '關係' : 'Relationship'}</label>
                                    <select className="input-field" value={depForm.relationship} onChange={e => setDepForm({ ...depForm, relationship: e.target.value })}>
                                        <option value="spouse">{zh ? '配偶' : 'Spouse'}</option><option value="child">{zh ? '子女' : 'Child'}</option>
                                        <option value="parent">{zh ? '父母' : 'Parent'}</option><option value="other">{zh ? '其他' : 'Other'}</option>
                                    </select>
                                </div>
                                <div><label className="detail-label">{zh ? '姓名' : 'Name'} *</label><input className="input-field" value={depForm.name} onChange={e => setDepForm({ ...depForm, name: e.target.value })} /></div>
                                <div><label className="detail-label">{zh ? '身分證字號' : 'ID'}</label><input className="input-field" value={depForm.id_number} onChange={e => setDepForm({ ...depForm, id_number: e.target.value })} /></div>
                                <div><label className="detail-label">{zh ? '出生日期' : 'Birth Date'}</label><input className="input-field" type="date" value={depForm.birth_date} onChange={e => setDepForm({ ...depForm, birth_date: e.target.value })} /></div>
                                <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="checkbox" checked={depForm.health_ins_enrolled} onChange={e => setDepForm({ ...depForm, health_ins_enrolled: e.target.checked })} />
                                    <label style={{ fontSize: '13px', cursor: 'pointer' }}>{zh ? '眷屬健保投保' : 'Health ins. enrolled'}</label>
                                </div>
                            </div>
                            <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createDependent}>{zh ? '新增' : 'Add'}</button>
                        </div>
                    )}
                    {dependents.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>{zh ? '尚無眷屬' : 'No dependents'}</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {dependents.map(dep => (
                                <div key={dep.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '13px' }}>
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

                {/* Position History */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        {sectionLabel('📋', zh ? `異動紀錄 (${positionHistory.length})` : `Position History (${positionHistory.length})`)}
                        <button className="btn btn-sm" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--outline-variant)', fontWeight: 700, fontSize: '15px', lineHeight: 1, padding: '3px 10px' }} onClick={() => setShowPosHistForm(!showPosHistForm)}>{showPosHistForm ? '✕' : '+'}</button>
                    </div>
                    {showPosHistForm && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                            <div style={grid2}>
                                <div><label className="detail-label">{zh ? '異動類型' : 'Type'}</label>
                                    <select className="input-field" value={posHistForm.change_type} onChange={e => setPosHistForm({ ...posHistForm, change_type: e.target.value })}>
                                        <option value="hire">{zh ? '入職' : 'Hire'}</option><option value="promotion">{zh ? '升職' : 'Promotion'}</option>
                                        <option value="demotion">{zh ? '降職' : 'Demotion'}</option><option value="transfer">{zh ? '調職' : 'Transfer'}</option>
                                        <option value="adjustment">{zh ? '薪資調整' : 'Adjustment'}</option><option value="resign">{zh ? '離職' : 'Resign'}</option>
                                    </select>
                                </div>
                                <div><label className="detail-label">{zh ? '生效日期' : 'Date'} *</label><input className="input-field" type="date" value={posHistForm.effective_date} onChange={e => setPosHistForm({ ...posHistForm, effective_date: e.target.value })} /></div>
                                <div><label className="detail-label">{zh ? '職稱' : 'Title'}</label><input className="input-field" value={posHistForm.title} onChange={e => setPosHistForm({ ...posHistForm, title: e.target.value })} /></div>
                                <div><label className="detail-label">{zh ? '職等' : 'Grade'}</label><input className="input-field" value={posHistForm.job_grade} onChange={e => setPosHistForm({ ...posHistForm, job_grade: e.target.value })} placeholder="M1 / S3" /></div>
                                <div><label className="detail-label">{zh ? '部門' : 'Dept'}</label>
                                    <select className="input-field" value={posHistForm.department_id} onChange={e => setPosHistForm({ ...posHistForm, department_id: e.target.value })}>
                                        <option value="">—</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                                <div><label className="detail-label">{zh ? '門市' : 'Store'}</label>
                                    <select className="input-field" value={posHistForm.store_id} onChange={e => setPosHistForm({ ...posHistForm, store_id: e.target.value })}>
                                        <option value="">—</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                                    ? <div><label className="detail-label">{zh ? '月薪' : 'Salary'}</label><input className="input-field" type="number" value={posHistForm.base_salary} onChange={e => setPosHistForm({ ...posHistForm, base_salary: e.target.value })} /></div>
                                    : <div><label className="detail-label">{zh ? '時薪' : 'Hourly'}</label><input className="input-field" type="number" value={posHistForm.hourly_wage} onChange={e => setPosHistForm({ ...posHistForm, hourly_wage: e.target.value })} /></div>
                                }
                                <div><label className="detail-label">{zh ? '職務加給' : 'Role Allow.'}</label><input className="input-field" type="number" value={posHistForm.role_allowance} onChange={e => setPosHistForm({ ...posHistForm, role_allowance: e.target.value })} /></div>
                                <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '異動原因' : 'Reason'}</label><input className="input-field" value={posHistForm.reason} onChange={e => setPosHistForm({ ...posHistForm, reason: e.target.value })} /></div>
                            </div>
                            <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={addPositionHistory}>{zh ? '新增' : 'Add'}</button>
                        </div>
                    )}
                    {positionHistory.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>{zh ? '尚無異動紀錄' : 'No history'}</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {positionHistory.map(ph => {
                                const changeColors: Record<string, string> = { hire: '#22c55e', promotion: '#6366f1', demotion: '#f43f5e', transfer: '#f59e0b', adjustment: '#06b6d4', resign: '#666' };
                                const changeLabels: Record<string, string> = { hire: zh ? '入職' : 'Hire', promotion: zh ? '升職' : 'Promotion', demotion: zh ? '降職' : 'Demotion', transfer: zh ? '調職' : 'Transfer', adjustment: zh ? '薪調' : 'Adj.', resign: zh ? '離職' : 'Resign' };
                                return (
                                    <div key={ph.id} style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '13px', borderLeft: `3px solid ${changeColors[ph.change_type] || '#666'}` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span className="badge" style={{ background: changeColors[ph.change_type] || '#666', fontSize: '10px', padding: '1px 7px', color: '#fff' }}>{changeLabels[ph.change_type] || ph.change_type}</span>
                                            <span style={{ fontWeight: 600 }}>{ph.effective_date}</span>
                                            {ph.title && <span style={{ color: 'var(--text-secondary)' }}>{ph.title}</span>}
                                            {ph.job_grade && <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '1px 6px', borderRadius: '4px' }}>{ph.job_grade}</span>}
                                            {ph.department_name && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🏢 {ph.department_name}</span>}
                                            {ph.store_name && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🏪 {ph.store_name}</span>}
                                        </div>
                                        {ph.reason && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{ph.reason}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            )}

            </div>{/* closes tab content padding */}
        </div>
    );
}
