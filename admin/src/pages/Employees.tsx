import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

interface Employee {
    id: string; name: string; email: string | null; status: string;
    employee_type: string; store_id: string | null; hourly_wage: number | null;
    max_hours_per_week: number; phone: string | null; hire_date: string | null;
    position: string | null; avatar_url: string | null;
    department: string | null; department_id: string | null;
    company_id: string | null; line_group_id: string | null;
    is_line_manager: boolean; is_manager: boolean; reporting_to: string | null;
    store?: { name: string } | null;
    company?: { name: string } | null;
    roles?: { role_name: string }[];
    store_ids: string[];
    store_names: string[];
    // Name fields
    first_name: string | null; last_name: string | null; english_name: string | null;
    // Personal identity
    id_number: string | null; birth_date: string | null; gender: string | null;
    nationality: string | null; address: string | null;
    // Emergency contact
    emergency_contact_name: string | null; emergency_contact_phone: string | null;
    // Employment
    resign_date: string | null; termination_reason: string | null;
    job_grade: string | null; probation_end_date: string | null;
    // Banking
    bank_code: string | null; bank_account: string | null;
    // 勞保 Labor Insurance
    labor_ins_enrolled: boolean; labor_ins_grade: number | null;
    labor_ins_enrolled_date: string | null; labor_ins_withdraw_date: string | null;
    // 健保 Health Insurance
    health_ins_enrolled: boolean; health_ins_grade: number | null;
    health_ins_enrolled_date: string | null;
    // 勞退 Labor Pension
    labor_pension_enrolled: boolean; labor_pension_rate: number | null;
    // 特殊身分 Special Employment Identity
    special_identities: string[];
}
interface EmployeeDependent {
    id: string; relationship: string; name: string; id_number: string | null;
    birth_date: string | null; health_ins_enrolled: boolean; notes: string | null;
}
interface PositionHistory {
    id: string; change_type: string; effective_date: string;
    title: string | null; job_grade: string | null;
    department_name: string | null; store_name: string | null;
    employee_type: string | null; salary_type: string | null;
    base_salary: number | null; hourly_wage: number | null;
    role_allowance: number | null; meal_allowance: number | null; transport_allowance: number | null;
    reason: string | null; notes: string | null; created_at: string;
}
interface Company { id: string; name: string; }
interface LineUser { id: string; display_name: string; is_verified: boolean; user_id: string | null; }
interface LineGroup { id: string; group_name: string; }

interface Department {
    id: string;
    name: string;
    description: string | null;
    manager_user_id: string | null;
    line_group_ids: string[];
}
interface Store { id: string; name: string; store_code: string; }
interface LeaveRequest {
    id: string; user_id: string; start_date: string; end_date: string;
    leave_type: string; reason: string | null; status: string;
    total_days: number; is_paid: boolean;
}
interface PerformanceReview {
    id: string; user_id: string; reviewer_id: string | null;
    points: number; comment: string | null; review_date: string;
}
interface ShiftTemplate {
    id: string; store_id: string | null; name: string; start_time: string; end_time: string;
}
interface EmployeeAvailability {
    id: string; day_of_week: number; availability: string; preferred_shift_id: string | null; notes: string | null;
    shift_template?: ShiftTemplate;
}

const SPECIAL_IDENTITY_OPTIONS = [
    { value: 'disability', zh: '身心障礙者', en: 'Person with disability' },
    { value: 'low_income', zh: '中低收入戶', en: 'Low-middle income household' },
    { value: 'indigenous', zh: '原住民', en: 'Indigenous people' },
    { value: 'middle_aged', zh: '中高齡者 (45+)', en: 'Middle-aged/elderly (45+)' },
    { value: 'long_term_unemployed', zh: '長期失業者', en: 'Long-term unemployed' },
    { value: 'ex_offender', zh: '更生人', en: 'Ex-offender/rehabilitated' },
    { value: 'sole_breadwinner', zh: '獨力負擔家計者', en: 'Sole breadwinner' },
    { value: 'dv_victim', zh: '家庭暴力被害人', en: 'Domestic violence victim' },
    { value: 'reentry_woman', zh: '二度就業婦女', en: 'Women re-entering workforce' },
];

export function Employees({ initialMainTab = 'employees' }: { initialMainTab?: 'employees' | 'departments' } = {}) {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [lineUsers, setLineUsers] = useState<LineUser[]>([]);
    const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Employee | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({
        name: '', email: '', phone: '', employee_type: 'full_time', store_ids: [] as string[],
        company_id: '', department_id: '', position: '', hourly_wage: '', max_hours_per_week: '40', hire_date: '', reporting_to: '',
        first_name: '', last_name: '', english_name: '',
        id_number: '', birth_date: '', gender: '', nationality: 'TW', address: '',
        emergency_contact_name: '', emergency_contact_phone: '',
        job_grade: '', probation_end_date: '',
        bank_code: '', bank_account: '',
        special_identities: [] as string[],
    });
    const [createError, setCreateError] = useState('');
    const [filter, setFilter] = useState<'all' | 'full_time' | 'part_time'>('all');
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [showLeaveForm, setShowLeaveForm] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ start_date: '', end_date: '', leave_type: 'annual', reason: '' });

    const [reviews, setReviews] = useState<PerformanceReview[]>([]);
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [reviewForm, setReviewForm] = useState({ points: '100', comment: '', review_date: new Date().toISOString().split('T')[0] });

    const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
    const [availabilities, setAvailabilities] = useState<EmployeeAvailability[]>([]);
    const [showAvailForm, setShowAvailForm] = useState(false);
    const [availForm, setAvailForm] = useState({ day_of_week: 1, availability: 'available', preferred_shift_id: '', notes: '' });

    const [dependents, setDependents] = useState<EmployeeDependent[]>([]);
    const [showDependentForm, setShowDependentForm] = useState(false);
    const [depForm, setDepForm] = useState({ relationship: 'spouse', name: '', id_number: '', birth_date: '', health_ins_enrolled: false, notes: '' });

    const [positionHistory, setPositionHistory] = useState<PositionHistory[]>([]);
    const [showPosHistForm, setShowPosHistForm] = useState(false);
    const [posHistForm, setPosHistForm] = useState({ change_type: 'promotion', effective_date: '', title: '', job_grade: '', department_id: '', store_id: '', employee_type: 'full_time', salary_type: 'monthly', base_salary: '', hourly_wage: '', role_allowance: '', meal_allowance: '', transport_allowance: '', reason: '', notes: '' });

    type EditForm = {
        employee_type: string; store_ids: string[]; company_id: string;
        department: string; department_id: string; position: string; hourly_wage: string;
        max_hours_per_week: string; phone: string; hire_date: string; status: string;
        line_group_ids: string[]; is_manager: boolean; reporting_to: string;
        // Name fields
        first_name: string; last_name: string; english_name: string;
        // Personal
        id_number: string; birth_date: string; gender: string; nationality: string; address: string;
        emergency_contact_name: string; emergency_contact_phone: string;
        resign_date: string; termination_reason: string; job_grade: string; probation_end_date: string;
        // Banking
        bank_code: string; bank_account: string;
        // Insurance
        labor_ins_enrolled: boolean; labor_ins_grade: string;
        labor_ins_enrolled_date: string; labor_ins_withdraw_date: string;
        health_ins_enrolled: boolean; health_ins_grade: string; health_ins_enrolled_date: string;
        labor_pension_enrolled: boolean; labor_pension_rate: string;
        special_identities: string[];
    };
    const [editForm, setEditForm] = useState<EditForm | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [mainTab, setMainTab] = useState<'employees' | 'departments'>(initialMainTab);
    const [showCreateDept, setShowCreateDept] = useState(false);
    const [deptForm, setDeptForm] = useState({ name: '', description: '', manager_user_id: '', line_group_ids: [] as string[] });
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [editDeptForm, setEditDeptForm] = useState({ name: '', description: '', manager_user_id: '', line_group_ids: [] as string[] });

    const loadDepartments = async () => {
        const { data } = await supabase.from('departments').select('id, name, description, manager_user_id').eq('organization_id', orgId).order('name');
        if (!data) return;
        const deptIds = data.map((d: any) => d.id);
        const { data: lgData } = deptIds.length > 0
            ? await supabase.from('department_line_groups').select('department_id, line_group_id').in('department_id', deptIds)
            : { data: [] };
        const lgMap: Record<string, string[]> = {};
        (lgData || []).forEach((r: any) => {
            if (!lgMap[r.department_id]) lgMap[r.department_id] = [];
            lgMap[r.department_id].push(r.line_group_id);
        });
        setDepartments(data.map((d: any) => ({ ...d, line_group_ids: lgMap[d.id] || [] })));
    };

    const createDepartment = async () => {
        if (!deptForm.name.trim()) return;
        const { data } = await supabase.from('departments').insert({
            organization_id: orgId,
            name: deptForm.name.trim(),
            description: deptForm.description.trim() || null,
            manager_user_id: deptForm.manager_user_id || null,
        }).select().single();
        if (data && deptForm.line_group_ids.length > 0) {
            await supabase.from('department_line_groups').insert(
                deptForm.line_group_ids.map(gid => ({ department_id: data.id, line_group_id: gid }))
            );
        }
        setDeptForm({ name: '', description: '', manager_user_id: '', line_group_ids: [] });
        setShowCreateDept(false);
        await loadDepartments();
    };

    const saveDepartment = async () => {
        if (!editingDept || !editDeptForm.name.trim()) return;
        await supabase.from('departments').update({
            name: editDeptForm.name.trim(),
            description: editDeptForm.description.trim() || null,
            manager_user_id: editDeptForm.manager_user_id || null,
        }).eq('id', editingDept.id);
        await supabase.from('department_line_groups').delete().eq('department_id', editingDept.id);
        if (editDeptForm.line_group_ids.length > 0) {
            await supabase.from('department_line_groups').insert(
                editDeptForm.line_group_ids.map(gid => ({ department_id: editingDept.id, line_group_id: gid }))
            );
        }
        setEditingDept(null);
        await loadDepartments();
    };

    const deleteDepartment = async (id: string) => {
        await supabase.from('departments').delete().eq('id', id);
        await loadDepartments();
    };

    const loadEmployees = async () => {
        const { data } = await supabase.from('users').select('*, store:store_id(name), company:company_id(name)').order('name');
        if (!data) { setEmployees([]); return; }
        // Load multi-store assignments
        const [roleRes, usRes] = await Promise.all([
            supabase.from('user_roles').select('user_id, roles(role_name)'),
            supabase.from('user_stores').select('user_id, store_id, is_primary, store:stores(name)'),
        ]);
        const roleMap: Record<string, string[]> = {};
        (roleRes.data || []).forEach((r: any) => { roleMap[r.user_id] = roleMap[r.user_id] || []; roleMap[r.user_id].push(r.roles?.role_name); });
        const storeIdsMap: Record<string, string[]> = {};
        const storeNamesMap: Record<string, string[]> = {};
        (usRes.data || []).forEach((r: any) => {
            storeIdsMap[r.user_id] = storeIdsMap[r.user_id] || [];
            storeIdsMap[r.user_id].push(r.store_id);
            storeNamesMap[r.user_id] = storeNamesMap[r.user_id] || [];
            storeNamesMap[r.user_id].push(r.store?.name || r.store_id);
        });
        setEmployees(data.map((e: any) => ({
            ...e,
            roles: (roleMap[e.id] || []).map((r: string) => ({ role_name: r })),
            store_ids: storeIdsMap[e.id] || (e.store_id ? [e.store_id] : []),
            store_names: storeNamesMap[e.id] || (e.store?.name ? [e.store.name] : []),
        })));
    };

    const loadLeaves = async (userId: string) => {
        const { data } = await supabase.from('leave_requests').select('*')
            .eq('user_id', userId).order('start_date', { ascending: false });
        setLeaves(data || []);
    };

    const loadReviews = async (userId: string) => {
        const { data } = await supabase.from('performance_reviews').select('*')
            .eq('user_id', userId).order('review_date', { ascending: false });
        setReviews(data || []);
    };

    const loadUserLineGroups = async (userId: string) => {
        const { data } = await supabase.from('user_line_groups').select('line_group_id').eq('user_id', userId);
        setEditForm(prev => prev ? { ...prev, line_group_ids: data?.map((r: any) => r.line_group_id) || [] } : null);
    };

    const initEditForm = (emp: Employee) => {
        setEditForm({
            employee_type: emp.employee_type,
            store_ids: emp.store_ids || (emp.store_id ? [emp.store_id] : []),
            company_id: emp.company_id || '',
            department: emp.department || '',
            department_id: emp.department_id || '',
            position: emp.position || '',
            hourly_wage: emp.hourly_wage?.toString() || '',
            max_hours_per_week: emp.max_hours_per_week?.toString() || '40',
            phone: emp.phone || '',
            hire_date: emp.hire_date || '',
            status: emp.status,
            line_group_ids: [],
            is_manager: emp.is_manager || false,
            reporting_to: emp.reporting_to || '',
            first_name: emp.first_name || '',
            last_name: emp.last_name || '',
            english_name: emp.english_name || '',
            id_number: emp.id_number || '',
            birth_date: emp.birth_date || '',
            gender: emp.gender || '',
            nationality: emp.nationality || 'TW',
            address: emp.address || '',
            emergency_contact_name: emp.emergency_contact_name || '',
            emergency_contact_phone: emp.emergency_contact_phone || '',
            resign_date: emp.resign_date || '',
            termination_reason: emp.termination_reason || '',
            job_grade: emp.job_grade || '',
            probation_end_date: emp.probation_end_date || '',
            bank_code: emp.bank_code || '',
            bank_account: emp.bank_account || '',
            labor_ins_enrolled: emp.labor_ins_enrolled || false,
            labor_ins_grade: emp.labor_ins_grade?.toString() || '',
            labor_ins_enrolled_date: emp.labor_ins_enrolled_date || '',
            labor_ins_withdraw_date: emp.labor_ins_withdraw_date || '',
            health_ins_enrolled: emp.health_ins_enrolled || false,
            health_ins_grade: emp.health_ins_grade?.toString() || '',
            health_ins_enrolled_date: emp.health_ins_enrolled_date || '',
            labor_pension_enrolled: emp.labor_pension_enrolled || false,
            labor_pension_rate: emp.labor_pension_rate?.toString() || '6.00',
            special_identities: emp.special_identities || [],
        });
        setIsDirty(false);
    };

    const patchForm = (patch: Partial<EditForm>) => {
        setEditForm(prev => prev ? { ...prev, ...patch } : null);
        setIsDirty(true);
    };

    const saveEmployee = async () => {
        if (!selected || !editForm) return;
        // Resolve department name from selected department_id for the text field
        const deptName = editForm.department_id
            ? departments.find(d => d.id === editForm.department_id)?.name || editForm.department
            : editForm.department || null;
        const primaryStore = editForm.store_ids[0] || null;
        await supabase.from('users').update({
            employee_type: editForm.employee_type,
            store_id: primaryStore,
            company_id: editForm.company_id || null,
            department: deptName,
            department_id: editForm.department_id || null,
            position: editForm.position || null,
            hourly_wage: editForm.hourly_wage ? Number(editForm.hourly_wage) : null,
            max_hours_per_week: Number(editForm.max_hours_per_week) || 40,
            phone: editForm.phone || null,
            hire_date: editForm.hire_date || null,
            status: editForm.status,
            is_manager: editForm.is_manager,
            reporting_to: editForm.reporting_to || null,
            first_name: editForm.first_name || null,
            last_name: editForm.last_name || null,
            english_name: editForm.english_name || null,
            id_number: editForm.id_number || null,
            birth_date: editForm.birth_date || null,
            gender: editForm.gender || null,
            nationality: editForm.nationality || null,
            address: editForm.address || null,
            emergency_contact_name: editForm.emergency_contact_name || null,
            emergency_contact_phone: editForm.emergency_contact_phone || null,
            resign_date: editForm.resign_date || null,
            termination_reason: editForm.termination_reason || null,
            job_grade: editForm.job_grade || null,
            probation_end_date: editForm.probation_end_date || null,
            bank_code: editForm.bank_code || null,
            bank_account: editForm.bank_account || null,
            labor_ins_enrolled: editForm.labor_ins_enrolled,
            labor_ins_grade: editForm.labor_ins_grade ? Number(editForm.labor_ins_grade) : null,
            labor_ins_enrolled_date: editForm.labor_ins_enrolled_date || null,
            labor_ins_withdraw_date: editForm.labor_ins_withdraw_date || null,
            health_ins_enrolled: editForm.health_ins_enrolled,
            health_ins_grade: editForm.health_ins_grade ? Number(editForm.health_ins_grade) : null,
            health_ins_enrolled_date: editForm.health_ins_enrolled_date || null,
            labor_pension_enrolled: editForm.labor_pension_enrolled,
            labor_pension_rate: editForm.labor_pension_rate ? Number(editForm.labor_pension_rate) : null,
            special_identities: editForm.special_identities,
        }).eq('id', selected.id);

        await supabase.from('user_line_groups').delete().eq('user_id', selected.id);
        if (editForm.line_group_ids.length > 0) {
            await supabase.from('user_line_groups').insert(
                editForm.line_group_ids.map(gid => ({ user_id: selected.id, line_group_id: gid }))
            );
        }
        // Sync user_stores junction (multi-location)
        await supabase.from('user_stores').delete().eq('user_id', selected.id);
        if (editForm.store_ids.length > 0) {
            await supabase.from('user_stores').insert(
                editForm.store_ids.map((sid, i) => ({ user_id: selected.id, store_id: sid, is_primary: i === 0 }))
            );
        }
        setIsDirty(false);
        await loadEmployees();
    };

    const loadDependents = async (userId: string) => {
        const { data } = await supabase.from('employee_dependents').select('id, relationship, name, id_number, birth_date, health_ins_enrolled, notes').eq('user_id', userId).order('created_at');
        setDependents(data || []);
    };

    const createDependent = async () => {
        if (!selected || !depForm.name.trim()) return;
        await supabase.from('employee_dependents').insert({ organization_id: orgId, user_id: selected.id, relationship: depForm.relationship, name: depForm.name.trim(), id_number: depForm.id_number || null, birth_date: depForm.birth_date || null, health_ins_enrolled: depForm.health_ins_enrolled, notes: depForm.notes || null });
        setDepForm({ relationship: 'spouse', name: '', id_number: '', birth_date: '', health_ins_enrolled: false, notes: '' });
        setShowDependentForm(false);
        await loadDependents(selected.id);
    };

    const deleteDependent = async (id: string) => {
        if (!selected) return;
        await supabase.from('employee_dependents').delete().eq('id', id);
        await loadDependents(selected.id);
    };

    const loadPositionHistory = async (userId: string) => {
        const { data } = await supabase.from('employee_position_history').select('id, change_type, effective_date, title, job_grade, department_name, store_name, employee_type, salary_type, base_salary, hourly_wage, role_allowance, meal_allowance, transport_allowance, reason, notes, created_at').eq('user_id', userId).order('effective_date', { ascending: false });
        setPositionHistory(data || []);
    };

    const addPositionHistory = async () => {
        if (!selected || !posHistForm.effective_date) return;
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

    const loadAvailabilities = async (userId: string) => {
        const { data } = await supabase.from('employee_availability')
            .select('id, day_of_week, availability, preferred_shift_id, notes, shift_template:shift_templates(id, name, start_time, end_time)')
            .eq('user_id', userId).order('day_of_week', { ascending: true });
        // Clean up relationship format to match interface
        if (data) {
            setAvailabilities(data.map((d: any) => ({ ...d, shift_template: d.shift_template })));
        } else {
            setAvailabilities([]);
        }
    };

    useEffect(() => {
        if (!orgId) return;
        Promise.all([
            loadEmployees(),
            loadDepartments(),
            supabase.from('stores').select('id, name, store_code').order('name').then(r => setStores(r.data || [])),
            supabase.from('companies').select('id, name').order('name').then(r => setCompanies(r.data || [])),
            supabase.from('shift_templates').select('id, store_id, name, start_time, end_time').order('start_time').then(r => setShiftTemplates(r.data || [])),
            supabase.from('line_users').select('id, display_name, is_verified, user_id').then(r => setLineUsers(r.data || [])),
            supabase.from('line_groups').select('id, group_name').then(r => setLineGroups(r.data || []))
        ]).then(() => setLoading(false));
    }, [orgId]);

    useEffect(() => {
        if (selected) {
            loadLeaves(selected.id);
            loadReviews(selected.id);
            loadAvailabilities(selected.id);
            loadDependents(selected.id);
            loadPositionHistory(selected.id);
            initEditForm(selected);
            loadUserLineGroups(selected.id);
        } else {
            setLeaves([]);
            setReviews([]);
            setAvailabilities([]);
            setDependents([]);
            setPositionHistory([]);
            setEditForm(null);
            setIsDirty(false);
        }
    }, [selected?.id]);

    const createEmployee = async () => {
        if (!form.name) { setCreateError(zh ? '姓名為必填欄位' : 'Name is required'); return; }
        const primaryStore = form.store_ids[0] || null;
        const { data: newUser } = await supabase.from('users').insert({
            organization_id: orgId,
            name: form.name, email: form.email || null, phone: form.phone || null,
            employee_type: form.employee_type, store_id: primaryStore,
            company_id: form.company_id || null,
            department_id: form.department_id || null,
            department: departments.find(d => d.id === form.department_id)?.name || null,
            position: form.position || null, hourly_wage: form.hourly_wage ? Number(form.hourly_wage) : null,
            max_hours_per_week: Number(form.max_hours_per_week) || 40,
            hire_date: form.hire_date || null,
            first_name: form.first_name || null, last_name: form.last_name || null, english_name: form.english_name || null,
            id_number: form.id_number || null, birth_date: form.birth_date || null,
            gender: form.gender || null, nationality: form.nationality || null, address: form.address || null,
            emergency_contact_name: form.emergency_contact_name || null,
            emergency_contact_phone: form.emergency_contact_phone || null,
            reporting_to: form.reporting_to || null,
            job_grade: form.job_grade || null, probation_end_date: form.probation_end_date || null,
            bank_code: form.bank_code || null, bank_account: form.bank_account || null,
            special_identities: form.special_identities,
        }).select('id').single();
        if (newUser && form.store_ids.length > 0) {
            await supabase.from('user_stores').insert(
                form.store_ids.map((sid, i) => ({ user_id: newUser.id, store_id: sid, is_primary: i === 0 }))
            );
        }
        setForm({ name: '', email: '', phone: '', employee_type: 'full_time', store_ids: [], company_id: '', department_id: '', position: '', hourly_wage: '', max_hours_per_week: '40', hire_date: '', reporting_to: '', first_name: '', last_name: '', english_name: '', id_number: '', birth_date: '', gender: '', nationality: 'TW', address: '', emergency_contact_name: '', emergency_contact_phone: '', job_grade: '', probation_end_date: '', bank_code: '', bank_account: '', special_identities: [] });
        setCreateError('');
        setShowCreate(false);
        await loadEmployees();
    };

    const mapLineUser = async (empId: string, lineUserId: string | null) => {
        // Unmap existing
        await supabase.from('line_users').update({ user_id: null, is_verified: false }).eq('user_id', empId);
        if (lineUserId) {
            await supabase.from('line_users').update({ user_id: empId, is_verified: true }).eq('id', lineUserId);
        }
        await supabase.from('line_users').select('id, display_name, is_verified, user_id').then(r => setLineUsers(r.data || []));
    };

    const updateField = async (id: string, field: string, value: any) => {
        await supabase.from('users').update({ [field]: value }).eq('id', id);
        await loadEmployees();
        if (selected?.id === id) setSelected(prev => prev ? { ...prev, [field]: value } : null);
    };

    const createLeave = async () => {
        if (!selected || !leaveForm.start_date || !leaveForm.end_date) return;
        await supabase.from('leave_requests').insert({
            user_id: selected.id, store_id: selected.store_id,
            organization_id: orgId,
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
        if (selected) await loadLeaves(selected.id);
    };

    const createReview = async () => {
        if (!selected || !reviewForm.review_date || !reviewForm.points) return;
        const { data: { user } } = await supabase.auth.getUser();

        await supabase.from('performance_reviews').insert({
            user_id: selected.id,
            reviewer_id: user?.id || null,
            points: Number(reviewForm.points),
            comment: reviewForm.comment || null,
            review_date: reviewForm.review_date,
            organization_id: orgId
        });
        setReviewForm({ points: '100', comment: '', review_date: new Date().toISOString().split('T')[0] });
        setShowReviewForm(false);
        await loadReviews(selected.id);
    };

    const saveAvailability = async () => {
        if (!selected) return;

        await supabase.from('employee_availability').delete().eq('user_id', selected.id).eq('day_of_week', availForm.day_of_week);

        await supabase.from('employee_availability').insert({
            user_id: selected.id,
            store_id: selected.store_id || null,
            day_of_week: availForm.day_of_week,
            availability: availForm.availability,
            preferred_shift_id: availForm.preferred_shift_id || null,
            notes: availForm.notes || null
        });
        setAvailForm({ day_of_week: 1, availability: 'available', preferred_shift_id: '', notes: '' });
        setShowAvailForm(false);
        await loadAvailabilities(selected.id);
    };
    const deleteAvailability = async (id: string) => {
        if (!selected) return;
        await supabase.from('employee_availability').delete().eq('id', id);
        await loadAvailabilities(selected.id);
    };

    const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                if (!text) return;
                const rows = text.split('\n').filter(r => r.trim() !== '').map(row => row.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
                if (rows.length < 2) return alert(zh ? '無效的 CSV 檔案' : 'Invalid CSV file');
                const headers = rows[0];
                const insertData = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < headers.length) continue;
                    const obj: Record<string, any> = { organization_id: orgId };
                    headers.forEach((h, idx) => {
                        const val = row[idx];
                        if (h && val) {
                            if (h === 'hourly_wage' || h === 'max_hours_per_week' || h === 'labor_ins_grade' || h === 'health_ins_grade' || h === 'labor_pension_rate') obj[h] = Number(val);
                            else obj[h] = val;
                        }
                    });
                    if (obj.name) {
                        if (!obj.employee_type) obj.employee_type = 'full_time';
                        insertData.push(obj);
                    }
                }
                if (insertData.length > 0) {
                    const { data, error } = await supabase.from('users').insert(insertData).select('id, store_id');
                    if (error) throw error;
                    if (data) {
                        const storeLinks = data.filter(u => u.store_id).map(u => ({ user_id: u.id, store_id: u.store_id, is_primary: true }));
                        if (storeLinks.length > 0) {
                            await supabase.from('user_stores').insert(storeLinks);
                        }
                    }
                    alert(zh ? `成功匯入 ${insertData.length} 筆資料` : `Successfully imported ${insertData.length} employees`);
                    loadEmployees();
                } else {
                    alert(zh ? '沒有發現有效的員工記錄' : 'No valid employee records found');
                }
            } catch (err: any) {
                console.error(err);
                alert((zh ? '匯入失敗: ' : 'Import failed: ') + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const typeLabel: Record<string, string> = { full_time: zh ? '\u5168\u8077' : 'Full-time', part_time: zh ? '\u517c\u8077' : 'Part-time', contract: zh ? '\u7d04\u8058' : 'Contract' };
    const typeBadge: Record<string, string> = { full_time: '#22c55e', part_time: '#f59e0b', contract: '#6366f1' };
    const filteredEmployees = filter === 'all' ? employees : employees.filter(e => e.employee_type === filter);
    const leaveTypeLabel: Record<string, string> = {
        annual: zh ? '\u7279\u4f11' : 'Annual', personal: zh ? '\u4e8b\u5047' : 'Personal', sick: zh ? '\u75c5\u5047' : 'Sick',
        maternity: zh ? '\u7522\u5047' : 'Maternity', bereavement: zh ? '\u55aa\u5047' : 'Bereavement',
        unpaid: zh ? '\u7121\u85aa\u5047' : 'Unpaid', block_off: zh ? '\u6392\u9664\u65e5' : 'Block Off', other: zh ? '\u5176\u4ed6' : 'Other',
    };
    const leaveStatusColor: Record<string, string> = { pending: '#f59e0b', approved: '#22c55e', rejected: '#f43f5e', cancelled: '#666' };
    const availLabel: Record<string, string> = { available: zh ? '可排班' : 'Available', preferred: zh ? '偏好排班' : 'Preferred', unavailable: zh ? '不可排班' : 'Unavailable' };
    const availColor: Record<string, string> = { available: '#22c55e', preferred: '#3b82f6', unavailable: '#f43f5e' };
    const daysOfWeek = zh ? ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const getInitials = (name: string) => name.slice(0, 2);
    const getColor = (name: string) => {
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#22c55e', '#06b6d4', '#3b82f6'];
        return colors[name.charCodeAt(0) % colors.length];
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>👥 {t('employee.title')}</h2>
                <p>{t('employee.subtitle')}</p>
            </div>

            <div className="page-body">
            {/* Main tabs */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="tab-bar" style={{ marginBottom: 0 }}>
                    <button className={`tab-item ${mainTab === 'employees' ? 'active' : ''}`} onClick={() => setMainTab('employees')}>
                        👥 {zh ? '員工' : 'Employees'} ({employees.length})
                    </button>
                    <button className={`tab-item ${mainTab === 'departments' ? 'active' : ''}`} onClick={() => setMainTab('departments')}>
                        🏢 {zh ? '部門管理' : 'Departments'} ({departments.length})
                    </button>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {mainTab === 'employees'
                        ? (
                            <>
                                <label className="btn" style={{ background: '#fff', border: '1px solid var(--outline)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px' }}>
                                    📁 {zh ? '匯入 CSV' : 'Import CSV'}
                                    <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvImport} />
                                </label>
                                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>➕ {t('employee.create')}</button>
                            </>
                        )
                        : <button className="btn btn-primary" onClick={() => setShowCreateDept(true)}>➕ {zh ? '新增部門' : 'New Department'}</button>
                    }
                </div>
            </div>

            {/* Employee type filter (only in employees tab) */}
            {mainTab === 'employees' && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                {(['all', 'full_time', 'part_time'] as const).map(f => (
                    <button key={f} className={`tab-item ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}
                        style={{ fontSize: '12px', padding: '4px 12px' }}>
                        {f === 'all' ? (zh ? '全部' : 'All') : typeLabel[f]} ({f === 'all' ? employees.length : employees.filter(e => e.employee_type === f).length})
                    </button>
                ))}
            </div>
            )}

            {mainTab === 'employees' && (<>
            {showCreate && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>{'\u2795'} {t('employee.create')}</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{t('employee.name')} *</label>
                            <input className="input-field" value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setCreateError(''); }} placeholder={zh ? '\u59d3\u540d' : 'Name'} />
                            {createError && <span style={{ color: 'var(--color-error, #ef4444)', fontSize: '12px' }}>{createError}</span>}
                        </div>
                        <div>
                            <label className="detail-label">Email</label>
                            <input className="input-field" type="email" name="email" autoComplete="email" spellCheck={false} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.phone')}</label>
                            <input className="input-field" type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0912-345-678" />
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.type')}</label>
                            <select className="input-field" value={form.employee_type} onChange={e => setForm({ ...form, employee_type: e.target.value })}>
                                <option value="full_time">{typeLabel.full_time}</option>
                                <option value="part_time">{typeLabel.part_time}</option>
                                <option value="contract">{typeLabel.contract}</option>
                            </select>
                        </div>
                        <div style={{ gridColumn: '1/-1' }}>
                            <label className="detail-label">{t('employee.store')} ({zh ? '可多選' : 'multi-select'})</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                                {stores.map(s => {
                                    const checked = form.store_ids.includes(s.id);
                                    return (
                                        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`, background: checked ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)', cursor: 'pointer', fontSize: '12px', fontWeight: checked ? 600 : 400 }}>
                                            <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                                onChange={() => setForm(f => ({ ...f, store_ids: checked ? f.store_ids.filter(id => id !== s.id) : [...f.store_ids, s.id] }))} />
                                            {s.name}
                                        </label>
                                    );
                                })}
                                {stores.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{zh ? '尚無門市' : 'No stores'}</span>}
                            </div>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '公司' : 'Company'}</label>
                            <select className="input-field" value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })}>
                                <option value="">{zh ? '\u672a\u6307\u6d3e' : 'Unassigned'}</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '部門' : 'Department'}</label>
                            <select className="input-field" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                                <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.position')}</label>
                            <input className="input-field" list="positions-list" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder={zh ? '\u8F38\u5165\u6216\u9078\u64C7\u8077\u4F4D' : 'Enter or select position'} />
                            <datalist id="positions-list">
                                {Array.from(new Set(employees.map(e => e.position).filter(Boolean))).map(p => (
                                    <option key={p as string} value={p as string} />
                                ))}
                            </datalist>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '直屬主管' : 'Reporting To'}</label>
                            <select className="input-field" value={form.reporting_to} onChange={e => setForm({ ...form, reporting_to: e.target.value })}>
                                <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                                {employees.filter(e => e.is_manager || e.is_line_manager).map(e => <option key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ''}</option>)}
                                {employees.filter(e => !e.is_manager && !e.is_line_manager).length > 0 && (
                                    <optgroup label={zh ? '其他員工' : 'Other employees'}>
                                        {employees.filter(e => !e.is_manager && !e.is_line_manager).map(e => <option key={e.id} value={e.id}>{e.name}{e.position ? ` (${e.position})` : ''}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.wage')} (NT$)</label>
                            <input className="input-field" type="number" value={form.hourly_wage} onChange={e => setForm({ ...form, hourly_wage: e.target.value })} placeholder="183" />
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.max_hours')}</label>
                            <input className="input-field" type="number" value={form.max_hours_per_week} onChange={e => setForm({ ...form, max_hours_per_week: e.target.value })} placeholder="40" />
                        </div>
                        <div>
                            <label className="detail-label">{t('employee.hire_date')}</label>
                            <input className="input-field" type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} />
                        </div>
                    </div>

                    {/* Name fields */}
                    <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>👤 {zh ? '姓名欄位' : 'Name Fields'}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                            <div><label className="detail-label">{zh ? '姓' : 'Last Name'}</label><input className="input-field" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder={zh ? '王' : 'Smith'} /></div>
                            <div><label className="detail-label">{zh ? '名' : 'First Name'}</label><input className="input-field" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder={zh ? '小明' : 'John'} /></div>
                            <div><label className="detail-label">{zh ? '英文名' : 'English Name'}</label><input className="input-field" value={form.english_name} onChange={e => setForm({ ...form, english_name: e.target.value })} placeholder="John Smith" /></div>
                            <div><label className="detail-label">{zh ? '職等' : 'Job Grade'}</label><input className="input-field" value={form.job_grade} onChange={e => setForm({ ...form, job_grade: e.target.value })} placeholder="M1 / S3" /></div>
                        </div>
                    </div>

                    {/* Personal info */}
                    <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📋 {zh ? '個人資料' : 'Personal Info'}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                            <div><label className="detail-label">{zh ? '出生日期' : 'Birth Date'}</label><input className="input-field" type="date" value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} /></div>
                            <div><label className="detail-label">{zh ? '性別' : 'Gender'}</label>
                                <select className="input-field" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                                    <option value="">{zh ? '— 請選擇 —' : '— Select —'}</option>
                                    <option value="male">{zh ? '男' : 'Male'}</option>
                                    <option value="female">{zh ? '女' : 'Female'}</option>
                                    <option value="other">{zh ? '其他' : 'Other'}</option>
                                </select>
                            </div>
                            <div><label className="detail-label">{zh ? '國籍' : 'Nationality'}</label><input className="input-field" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} placeholder="TW" /></div>
                            <div><label className="detail-label">{zh ? '身分證字號' : 'ID Number'}</label><input className="input-field" value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} placeholder="A123456789" /></div>
                            <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '地址' : 'Address'}</label><input className="input-field" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder={zh ? '縣市 + 鄉鎮市區 + 路街…' : 'Full address'} /></div>
                        </div>
                    </div>

                    {/* Emergency contact */}
                    <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🚨 {zh ? '緊急聯絡人' : 'Emergency Contact'}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div><label className="detail-label">{zh ? '姓名' : 'Name'}</label><input className="input-field" value={form.emergency_contact_name} onChange={e => setForm({ ...form, emergency_contact_name: e.target.value })} placeholder={zh ? '緊急聯絡人姓名' : 'Contact name'} /></div>
                            <div><label className="detail-label">{zh ? '電話' : 'Phone'}</label><input className="input-field" value={form.emergency_contact_phone} onChange={e => setForm({ ...form, emergency_contact_phone: e.target.value })} placeholder="0912-345-678" /></div>
                        </div>
                    </div>

                    {/* Banking */}
                    <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏦 {zh ? '銀行帳戶' : 'Bank Account'}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                            <div><label className="detail-label">{zh ? '銀行代碼' : 'Bank Code'}</label><input className="input-field" value={form.bank_code} onChange={e => setForm({ ...form, bank_code: e.target.value })} placeholder="004" /></div>
                            <div><label className="detail-label">{zh ? '帳號' : 'Account No.'}</label><input className="input-field" value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })} placeholder="1234567890123" /></div>
                        </div>
                    </div>

                    {/* Special Employment Identity */}
                    <div style={{ borderTop: '1px solid var(--outline-variant)', marginTop: '14px', paddingTop: '14px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            🏷️ {zh ? '特殊身分類別' : 'Special Employment Identity'}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {SPECIAL_IDENTITY_OPTIONS.map(opt => {
                                const checked = form.special_identities.includes(opt.value);
                                return (
                                    <label key={opt.value} style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '4px 10px', borderRadius: '6px',
                                        border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                        background: checked ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)',
                                        cursor: 'pointer', fontSize: '12px', fontWeight: checked ? 600 : 400,
                                    }}>
                                        <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                            onChange={() => setForm(f => ({
                                                ...f,
                                                special_identities: checked
                                                    ? f.special_identities.filter(v => v !== opt.value)
                                                    : [...f.special_identities, opt.value]
                                            }))} />
                                        {zh ? opt.zh : opt.en}
                                    </label>
                                );
                            })}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                            {zh ? '依「就業服務法」及「身心障礙者權益保障法」定義之特殊身分類別（可複選）' : 'Per Employment Services Act & PRPD Act (multi-select)'}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                        <button className="btn btn-primary" onClick={createEmployee}>{t('common.save')}</button>
                        <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setCreateError(''); }}>{t('common.cancel')}</button>
                    </div>
                </div>
            )}

            {loading ? <p className="loading-pulse">{t('common.loading')}</p> : (
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ flex: selected ? '0 0 50%' : '1' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                            {filteredEmployees.map(emp => (
                                <div key={emp.id} className="card" role="button" tabIndex={0} style={{
                                    cursor: 'pointer', padding: '16px',
                                    borderColor: selected?.id === emp.id ? 'var(--accent-primary)' : undefined,
                                    transition: 'border-color 0.2s',
                                }} onClick={() => setSelected(emp)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(emp); } }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <div style={{
                                            width: '44px', height: '44px', borderRadius: '50%', background: getColor(emp.name),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: '16px', color: '#fff', flexShrink: 0,
                                        }}>{getInitials(emp.name)}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 600, fontSize: '14px' }}>{emp.name}</span>
                                                {emp.english_name && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{emp.english_name}</span>}
                                                <span className="badge" style={{ background: typeBadge[emp.employee_type] || '#666', fontSize: '11px', padding: '1px 8px' }}>
                                                    {typeLabel[emp.employee_type] || emp.employee_type}
                                                </span>
                                                <span className="badge" style={{ background: emp.status === 'active' ? '#22c55e55' : '#f43f5e55', color: emp.status === 'active' ? '#22c55e' : '#f43f5e', fontSize: '11px', padding: '1px 8px' }}>
                                                    {emp.status === 'active' ? (zh ? '\u5728\u8077' : 'Active') : (zh ? '\u96e2\u8077' : 'Inactive')}
                                                </span>
                                            </div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                {emp.company && <span>🏛️ {emp.company.name}</span>}
                                                {emp.department && <span>🏢 {emp.department}</span>}
                                                {(emp.position || emp.job_grade) && <span>🏷 {[emp.position, emp.job_grade ? `[${emp.job_grade}]` : null].filter(Boolean).join(' ')}</span>}
                                                {emp.store_names.length > 0 && <span>🏪 {emp.store_names.join(', ')}</span>}
                                                {emp.reporting_to && <span>👆 {employees.find(e => e.id === emp.reporting_to)?.name ?? '—'}</span>}
                                                {emp.hourly_wage && <span>{'\u{1F4B0}'} NT${emp.hourly_wage}/hr</span>}
                                                {emp.max_hours_per_week && <span>{'\u23F1'} {emp.max_hours_per_week}h/{zh ? '\u9031' : 'wk'}</span>}
                                            </div>
                                            {emp.special_identities && emp.special_identities.length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                                    {emp.special_identities.map(v => {
                                                        const opt = SPECIAL_IDENTITY_OPTIONS.find(o => o.value === v);
                                                        return (
                                                            <span key={v} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'var(--accent-primary-dim)', color: 'var(--accent-primary)', fontWeight: 500 }}>
                                                                {opt ? (zh ? opt.zh : opt.en) : v}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {selected && (
                        <div style={{ flex: '0 0 47%', minWidth: '320px' }} className="fade-in">
                            <div className="card" style={{ position: 'sticky', top: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                                        <div style={{
                                            width: '56px', height: '56px', borderRadius: '50%', background: getColor(selected.name),
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: '22px', color: '#fff',
                                        }}>{getInitials(selected.name)}</div>
                                        <div>
                                            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{selected.name}</h3>
                                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                {selected.position || (zh ? '\u672a\u8a2d\u5b9a\u8077\u4f4d' : 'No position')} {'\u00B7'} {typeLabel[selected.employee_type]}
                                            </div>
                                        </div>
                                    </div>
                                    <button className="btn btn-sm btn-secondary" onClick={() => setSelected(null)}>{'\u2715'}</button>
                                </div>

                                {editForm && (
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    <div>
                                        <label className="detail-label">{t('employee.type')}</label>
                                        <select className="input-field" value={editForm.employee_type} onChange={e => patchForm({ employee_type: e.target.value })}>
                                            <option value="full_time">{typeLabel.full_time}</option>
                                            <option value="part_time">{typeLabel.part_time}</option>
                                            <option value="contract">{typeLabel.contract}</option>
                                        </select>
                                    </div>
                                    <div style={{ gridColumn: '1/-1' }}>
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
                                            {stores.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{zh ? '尚無門市' : 'No stores'}</span>}
                                        </div>
                                        {editForm.store_ids.length > 1 && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>★ {zh ? '為主要門市（第一個勾選）' : 'Primary store (first selected)'}</div>}
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '公司' : 'Company'}</label>
                                        <select className="input-field" value={editForm.company_id} onChange={e => patchForm({ company_id: e.target.value })}>
                                            <option value="">{zh ? '未指派' : 'Unassigned'}</option>
                                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '部門' : 'Department'}</label>
                                        <select className="input-field" value={editForm.department_id} onChange={e => patchForm({ department_id: e.target.value, department: departments.find(d => d.id === e.target.value)?.name || '' })}>
                                            <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="detail-label">{t('employee.position')}</label>
                                        <input className="input-field" list="edit-positions-list" value={editForm.position} onChange={e => patchForm({ position: e.target.value })} placeholder={zh ? '輸入或選擇職位' : 'Enter or select position'} />
                                        <datalist id="edit-positions-list">
                                            {Array.from(new Set(employees.map(e => e.position).filter(Boolean))).map(p => (
                                                <option key={p as string} value={p as string} />
                                            ))}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '直屬主管' : 'Reporting To'}</label>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label className="detail-label">{t('employee.wage')} (NT$)</label>
                                            <input className="input-field" type="number" value={editForm.hourly_wage} onChange={e => patchForm({ hourly_wage: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="detail-label">{t('employee.max_hours')}</label>
                                            <input className="input-field" type="number" value={editForm.max_hours_per_week} onChange={e => patchForm({ max_hours_per_week: e.target.value })} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label className="detail-label">{t('employee.phone')}</label>
                                            <input className="input-field" value={editForm.phone} onChange={e => patchForm({ phone: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="detail-label">{t('employee.hire_date')}</label>
                                            <input className="input-field" type="date" value={editForm.hire_date} onChange={e => patchForm({ hire_date: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                                        <select className="input-field" value={editForm.status} onChange={e => patchForm({ status: e.target.value })}>
                                            <option value="active">{zh ? '在職' : 'Active'}</option>
                                            <option value="inactive">{zh ? '離職' : 'Inactive'}</option>
                                        </select>
                                    </div>
                                    {/* ── Names ── */}
                                    <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>👤 {zh ? '姓名' : 'Names'}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div><label className="detail-label">{zh ? '姓' : 'Last Name'}</label><input className="input-field" value={editForm.last_name} onChange={e => patchForm({ last_name: e.target.value })} /></div>
                                            <div><label className="detail-label">{zh ? '名' : 'First Name'}</label><input className="input-field" value={editForm.first_name} onChange={e => patchForm({ first_name: e.target.value })} /></div>
                                            <div><label className="detail-label">{zh ? '英文名' : 'English Name'}</label><input className="input-field" value={editForm.english_name} onChange={e => patchForm({ english_name: e.target.value })} /></div>
                                            <div><label className="detail-label">{zh ? '職等' : 'Job Grade'}</label><input className="input-field" value={editForm.job_grade} onChange={e => patchForm({ job_grade: e.target.value })} placeholder="M1 / S3" /></div>
                                        </div>
                                    </div>

                                    {/* ── Personal ── */}
                                    <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📋 {zh ? '個人資料' : 'Personal Info'}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
                                            <div><label className="detail-label">{zh ? '試用期結束' : 'Probation End'}</label><input className="input-field" type="date" value={editForm.probation_end_date} onChange={e => patchForm({ probation_end_date: e.target.value })} /></div>
                                            <div><label className="detail-label">{zh ? '離職日期' : 'Resign Date'}</label><input className="input-field" type="date" value={editForm.resign_date} onChange={e => patchForm({ resign_date: e.target.value })} /></div>
                                            <div style={{ gridColumn: '1/-1' }}><label className="detail-label">{zh ? '離職原因' : 'Termination Reason'}</label><input className="input-field" value={editForm.termination_reason} onChange={e => patchForm({ termination_reason: e.target.value })} /></div>
                                        </div>
                                    </div>

                                    {/* ── Emergency Contact ── */}
                                    <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🚨 {zh ? '緊急聯絡人' : 'Emergency Contact'}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div><label className="detail-label">{zh ? '姓名' : 'Name'}</label><input className="input-field" value={editForm.emergency_contact_name} onChange={e => patchForm({ emergency_contact_name: e.target.value })} /></div>
                                            <div><label className="detail-label">{zh ? '電話' : 'Phone'}</label><input className="input-field" value={editForm.emergency_contact_phone} onChange={e => patchForm({ emergency_contact_phone: e.target.value })} /></div>
                                        </div>
                                    </div>

                                    {/* ── Banking ── */}
                                    <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏦 {zh ? '銀行帳戶' : 'Bank Account'}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                                            <div><label className="detail-label">{zh ? '銀行代碼' : 'Bank Code'}</label><input className="input-field" value={editForm.bank_code} onChange={e => patchForm({ bank_code: e.target.value })} placeholder="004" /></div>
                                            <div><label className="detail-label">{zh ? '帳號' : 'Account No.'}</label><input className="input-field" value={editForm.bank_account} onChange={e => patchForm({ bank_account: e.target.value })} /></div>
                                        </div>
                                    </div>

                                    {/* ── Insurance ── */}
                                    <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏥 {zh ? '勞健保' : 'Insurance'}</div>
                                        <div style={{ display: 'grid', gap: '10px' }}>
                                            {/* 勞保 */}
                                            <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
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
                                            {/* 健保 */}
                                            <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{zh ? '全民健康保險' : 'Health Insurance'}</span>
                                                    <button onClick={() => patchForm({ health_ins_enrolled: !editForm.health_ins_enrolled })} style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: editForm.health_ins_enrolled ? 'var(--accent-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                                        <span style={{ position: 'absolute', top: '2px', left: editForm.health_ins_enrolled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                                                    </button>
                                                </div>
                                                {editForm.health_ins_enrolled && (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                        <div><label className="detail-label">{zh ? '投保級距' : 'Grade'}</label><input className="input-field" type="number" value={editForm.health_ins_grade} onChange={e => patchForm({ health_ins_grade: e.target.value })} /></div>
                                                        <div><label className="detail-label">{zh ? '加保日期' : 'Enrolled'}</label><input className="input-field" type="date" value={editForm.health_ins_enrolled_date} onChange={e => patchForm({ health_ins_enrolled_date: e.target.value })} /></div>
                                                    </div>
                                                )}
                                            </div>
                                            {/* 勞退 */}
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

                                    {/* ── Special Employment Identity ── */}
                                    <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            🏷️ {zh ? '特殊身分類別' : 'Special Identity'}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {SPECIAL_IDENTITY_OPTIONS.map(opt => {
                                                const checked = editForm.special_identities.includes(opt.value);
                                                return (
                                                    <label key={opt.value} style={{
                                                        display: 'flex', alignItems: 'center', gap: '5px',
                                                        padding: '4px 10px', borderRadius: '6px',
                                                        border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                                        background: checked ? 'var(--accent-primary-dim)' : 'var(--bg-secondary)',
                                                        cursor: 'pointer', fontSize: '12px', fontWeight: checked ? 600 : 400,
                                                    }}>
                                                        <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent-primary)' }}
                                                            onChange={() => patchForm({
                                                                special_identities: checked
                                                                    ? editForm.special_identities.filter(v => v !== opt.value)
                                                                    : [...editForm.special_identities, opt.value]
                                                            })} />
                                                        {zh ? opt.zh : opt.en}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        {editForm.special_identities.length > 0 && (
                                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                {zh ? `已選 ${editForm.special_identities.length} 項身分類別` : `${editForm.special_identities.length} identity(ies) selected`}
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '4px' }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={saveEmployee}
                                            disabled={!isDirty}
                                            style={{ opacity: isDirty ? 1 : 0.45 }}
                                        >
                                            {zh ? '更新員工資料' : 'Update Employee'}
                                        </button>
                                        {isDirty && (
                                            <span style={{ fontSize: '12px', color: 'var(--accent-warning, #f59e0b)' }}>
                                                ● {zh ? '有未儲存的變更' : 'Unsaved changes'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                )}
                            </div>

                            <div className="card" style={{ marginTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                                        {'\u{1F4CB}'} {zh ? '\u8ACB\u5047 / \u6392\u9664\u65E5\u671F' : 'Leave / Block-Off Dates'}
                                    </h4>
                                    <button className="btn btn-sm btn-primary" onClick={() => setShowLeaveForm(!showLeaveForm)}>
                                        {showLeaveForm ? '\u2715' : '\u2795'}
                                    </button>
                                </div>

                                {showLeaveForm && (
                                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '\u958B\u59CB\u65E5\u671F' : 'Start'}</label>
                                                <input className="input-field" type="date" value={leaveForm.start_date} onChange={e => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '\u7D50\u675F\u65E5\u671F' : 'End'}</label>
                                                <input className="input-field" type="date" value={leaveForm.end_date} onChange={e => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '\u985E\u578B' : 'Type'}</label>
                                                <select className="input-field" value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
                                                    {Object.entries(leaveTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '\u539F\u56E0' : 'Reason'}</label>
                                                <input className="input-field" value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder={zh ? '\u9078\u586B' : 'Optional'} />
                                            </div>
                                        </div>
                                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createLeave}>
                                            {zh ? '\u63D0\u4EA4' : 'Submit'}
                                        </button>
                                    </div>
                                )}

                                {leaves.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                                        {zh ? '\u5C1A\u7121\u8ACB\u5047\u7D00\u9304' : 'No leave requests'}
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                                        {leaves.map(lv => (
                                            <div key={lv.id} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                                                background: 'var(--bg-primary)', borderRadius: '6px', marginBottom: '4px', fontSize: '12px',
                                            }}>
                                                <span className="badge" style={{ background: leaveStatusColor[lv.status], fontSize: '10px', padding: '1px 6px' }}>
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

                            <div className="card" style={{ marginTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                                        📅 {zh ? '排班偏好' : 'Shift Preferences'}
                                    </h4>
                                    <button className="btn btn-sm btn-primary" onClick={() => setShowAvailForm(!showAvailForm)}>
                                        {showAvailForm ? '✕' : '➕'}
                                    </button>
                                </div>

                                {showAvailForm && (
                                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '星期' : 'Day of Week'}</label>
                                                <select className="input-field" value={availForm.day_of_week} onChange={e => setAvailForm({ ...availForm, day_of_week: Number(e.target.value) })}>
                                                    {daysOfWeek.map((day, idx) => (
                                                        <option key={idx} value={idx}>{day}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '意願' : 'Availability'}</label>
                                                <select className="input-field" value={availForm.availability} onChange={e => setAvailForm({ ...availForm, availability: e.target.value })}>
                                                    {Object.entries(availLabel).map(([k, v]) => (
                                                        <option key={k} value={k}>{v}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        {availForm.availability !== 'unavailable' && (
                                            <div style={{ marginTop: '8px' }}>
                                                <label className="detail-label">{zh ? '偏好時段 (選填)' : 'Preferred Timeslot (Optional)'}</label>
                                                <select className="input-field" value={availForm.preferred_shift_id} onChange={e => setAvailForm({ ...availForm, preferred_shift_id: e.target.value })}>
                                                    <option value="">{zh ? '無特定偏好' : 'No specific preference'}</option>
                                                    {shiftTemplates.filter(s => !s.store_id || s.store_id === selected.store_id).map(s => (
                                                        <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        <div style={{ marginTop: '8px' }}>
                                            <label className="detail-label">{zh ? '備註' : 'Notes'}</label>
                                            <input className="input-field" value={availForm.notes} onChange={e => setAvailForm({ ...availForm, notes: e.target.value })} placeholder={zh ? '例如: 只能做早班…' : 'e.g. Morning shift preferred…'} />
                                        </div>
                                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={saveAvailability}>
                                            {zh ? '儲存設定' : 'Save Preference'}
                                        </button>
                                    </div>
                                )}

                                {availabilities.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                                        {zh ? '尚無排班偏好設定' : 'No shift preferences set'}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {availabilities.map(av => (
                                            <div key={av.id} style={{
                                                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px',
                                                background: 'var(--bg-primary)', borderRadius: '6px', fontSize: '13px'
                                            }}>
                                                <span style={{ fontWeight: 600, width: '40px' }}>{daysOfWeek[av.day_of_week]}</span>
                                                <span className="badge" style={{ background: availColor[av.availability], fontSize: '11px', padding: '2px 6px', color: '#fff' }}>
                                                    {availLabel[av.availability] || av.availability}
                                                </span>
                                                {av.shift_template && (
                                                    <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                        {av.shift_template.name} ({av.shift_template.start_time.slice(0, 5)} - {av.shift_template.end_time.slice(0, 5)})
                                                    </span>
                                                )}
                                                {av.notes && (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                        "{av.notes}"
                                                    </span>
                                                )}
                                                <button className="btn btn-sm" style={{ marginLeft: 'auto', padding: '2px', color: 'var(--text-muted)' }} onClick={() => deleteAvailability(av.id)}>
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card" style={{ marginTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                                        🎯 {zh ? '績效評估' : 'Performance Reviews'}
                                    </h4>
                                    <button className="btn btn-sm btn-primary" onClick={() => setShowReviewForm(!showReviewForm)}>
                                        {showReviewForm ? '✕' : '➕'}
                                    </button>
                                </div>

                                {showReviewForm && (
                                    <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '評估日期' : 'Review Date'}</label>
                                                <input className="input-field" type="date" value={reviewForm.review_date} onChange={e => setReviewForm({ ...reviewForm, review_date: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '評分 (0-100)' : 'Points (0-100)'}</label>
                                                <input className="input-field" type="number" min="0" max="100" value={reviewForm.points} onChange={e => setReviewForm({ ...reviewForm, points: e.target.value })} />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '8px' }}>
                                            <label className="detail-label">{zh ? '評語 / 備註' : 'Comments'}</label>
                                            <textarea className="input-field" value={reviewForm.comment} onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })} placeholder={zh ? '輸入針對此員工的評語…' : 'Enter review comments…'} rows={3} style={{ resize: 'vertical' }} />
                                        </div>
                                        <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={createReview}>
                                            {zh ? '提交評估' : 'Submit Review'}
                                        </button>
                                    </div>
                                )}

                                {reviews.length === 0 ? (
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                                        {zh ? '尚無績效評估紀錄' : 'No performance reviews yet'}
                                    </div>
                                ) : (
                                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                                        {reviews.map(rev => (
                                            <div key={rev.id} style={{
                                                padding: '10px', background: 'var(--bg-primary)',
                                                borderRadius: '6px', marginBottom: '8px', fontSize: '13px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <span style={{ fontWeight: 600 }}>{rev.review_date}</span>
                                                    <span style={{ fontWeight: 700, color: rev.points >= 80 ? '#22c55e' : rev.points < 60 ? '#f43f5e' : '#f59e0b' }}>
                                                        {rev.points} / 100
                                                    </span>
                                                </div>
                                                {rev.comment && (
                                                    <div style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '6px', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                                                        {rev.comment}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="card" style={{ marginTop: '14px' }}>
                                <div style={{ marginBottom: '12px' }}>
                                    <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
                                        💬 {zh ? 'LINE 整合' : 'LINE Integration'}
                                    </h4>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{zh ? '綁定 LINE 帳號與群組，用於通知與簽到' : 'Bind LINE account and group for notifications and check-ins'}</div>
                                </div>

                                <div style={{ display: 'grid', gap: '12px' }}>
                                    {/* Personal LINE account binding */}
                                    <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                        <label className="detail-label">{zh ? '綁定個人 LINE 帳號' : 'Bind Personal LINE Account'}</label>
                                        <select
                                            className="input-field"
                                            value={lineUsers.find(u => u.user_id === selected.id)?.id || ''}
                                            onChange={e => mapLineUser(selected.id, e.target.value || null)}
                                        >
                                            <option value="">{zh ? '— 尚未綁定 —' : '— Unmapped —'}</option>
                                            {lineUsers.filter(u => !u.is_verified || u.user_id === selected.id).map(u => (
                                                <option key={u.id} value={u.id}>{u.display_name} {u.user_id === selected.id && (zh ? '(目前綁定)' : '(Current)')}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Multi-select LINE groups */}
                                    <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                        <label className="detail-label">{zh ? '所屬 LINE 群組（可多選）' : 'LINE Groups (multi-select)'}</label>
                                        {lineGroups.length === 0 ? (
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                                                {zh ? '尚無群組，請先讓機器人加入群組' : 'No groups yet — add bot to a group first'}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxHeight: '140px', overflowY: 'auto' }}>
                                                {lineGroups.map(g => {
                                                    const checked = editForm?.line_group_ids.includes(g.id) ?? false;
                                                    return (
                                                        <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', padding: '4px 0' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={e => {
                                                                    const ids = editForm?.line_group_ids ?? [];
                                                                    patchForm({ line_group_ids: e.target.checked ? [...ids, g.id] : ids.filter(id => id !== g.id) });
                                                                }}
                                                            />
                                                            <span>💬 {g.group_name}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {editForm && editForm.line_group_ids.length > 0 && (
                                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                {zh ? `已選 ${editForm.line_group_ids.length} 個群組` : `${editForm.line_group_ids.length} group(s) selected`}
                                            </div>
                                        )}
                                    </div>

                                    {/* Management toggle */}
                                    <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                                        <label className="detail-label">{zh ? 'LINE 管理員權限' : 'LINE Manager Access'}</label>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 500 }}>
                                                    {zh ? '管理員指令存取' : 'Manager command access'}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    {zh ? '開啟後可在 LINE 使用 /管理 全覽、排班、流程等指令' : 'Enables /manage commands in LINE: overview, scheduling, workflows'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => updateField(selected.id, 'is_line_manager', !(selected as any).is_line_manager)}
                                                style={{
                                                    width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                                                    background: (selected as any).is_line_manager ? 'var(--accent-primary, #6366f1)' : 'var(--border-color, #333)',
                                                    position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                                                }}
                                            >
                                                <span style={{
                                                    position: 'absolute', top: '2px',
                                                    left: (selected as any).is_line_manager ? '22px' : '2px',
                                                    width: '20px', height: '20px', borderRadius: '50%',
                                                    background: '#fff', transition: 'left 0.2s',
                                                }} />
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
                                                    <option value="spouse">{zh ? '配偶' : 'Spouse'}</option>
                                                    <option value="child">{zh ? '子女' : 'Child'}</option>
                                                    <option value="parent">{zh ? '父母' : 'Parent'}</option>
                                                    <option value="other">{zh ? '其他' : 'Other'}</option>
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
                                                    <option value="hire">{zh ? '入職' : 'Hire'}</option>
                                                    <option value="promotion">{zh ? '升職' : 'Promotion'}</option>
                                                    <option value="demotion">{zh ? '降職' : 'Demotion'}</option>
                                                    <option value="transfer">{zh ? '調職' : 'Transfer'}</option>
                                                    <option value="adjustment">{zh ? '薪資調整' : 'Salary Adjustment'}</option>
                                                    <option value="resign">{zh ? '離職' : 'Resign'}</option>
                                                </select>
                                            </div>
                                            <div><label className="detail-label">{zh ? '生效日期' : 'Effective Date'} *</label><input className="input-field" type="date" value={posHistForm.effective_date} onChange={e => setPosHistForm({ ...posHistForm, effective_date: e.target.value })} /></div>
                                            <div><label className="detail-label">{zh ? '職稱' : 'Title'}</label><input className="input-field" value={posHistForm.title} onChange={e => setPosHistForm({ ...posHistForm, title: e.target.value })} /></div>
                                            <div><label className="detail-label">{zh ? '職等' : 'Job Grade'}</label><input className="input-field" value={posHistForm.job_grade} onChange={e => setPosHistForm({ ...posHistForm, job_grade: e.target.value })} placeholder="M1 / S3" /></div>
                                            <div><label className="detail-label">{zh ? '部門' : 'Department'}</label>
                                                <select className="input-field" value={posHistForm.department_id} onChange={e => setPosHistForm({ ...posHistForm, department_id: e.target.value })}>
                                                    <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                                                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                                </select>
                                            </div>
                                            <div><label className="detail-label">{zh ? '門市' : 'Store'}</label>
                                                <select className="input-field" value={posHistForm.store_id} onChange={e => setPosHistForm({ ...posHistForm, store_id: e.target.value })}>
                                                    <option value="">{zh ? '— 未指派 —' : '— None —'}</option>
                                                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            </div>
                                            <div><label className="detail-label">{zh ? '雇用類型' : 'Emp. Type'}</label>
                                                <select className="input-field" value={posHistForm.employee_type} onChange={e => setPosHistForm({ ...posHistForm, employee_type: e.target.value })}>
                                                    <option value="full_time">{typeLabel.full_time}</option>
                                                    <option value="part_time">{typeLabel.part_time}</option>
                                                    <option value="contract">{typeLabel.contract}</option>
                                                </select>
                                            </div>
                                            <div><label className="detail-label">{zh ? '薪資類型' : 'Salary Type'}</label>
                                                <select className="input-field" value={posHistForm.salary_type} onChange={e => setPosHistForm({ ...posHistForm, salary_type: e.target.value })}>
                                                    <option value="monthly">{zh ? '月薪' : 'Monthly'}</option>
                                                    <option value="hourly">{zh ? '時薪' : 'Hourly'}</option>
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
                    )}
                </div>
            )}
            </>)}

            {/* ===== Departments Tab ===== */}
            {mainTab === 'departments' && (
                <div>
                    {/* Create form */}
                    {showCreateDept && (
                        <div className="card" style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>➕ {zh ? '新增部門' : 'New Department'}</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                <div>
                                    <label className="detail-label">{zh ? '部門名稱' : 'Name'} *</label>
                                    <input className="input-field" value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} placeholder={zh ? '例如：銷售部' : 'e.g. Sales'} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '描述' : 'Description'}</label>
                                    <input className="input-field" value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} placeholder={zh ? '選填' : 'Optional'} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '部門主管' : 'Manager'}</label>
                                    <select className="input-field" value={deptForm.manager_user_id} onChange={e => setDeptForm({ ...deptForm, manager_user_id: e.target.value })}>
                                        <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.is_manager ? ' ★' : ''}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ marginTop: '12px' }}>
                                <label className="detail-label">💬 {zh ? '關聯 LINE 群組' : 'LINE Groups'}</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                                    {deptForm.line_group_ids.map(gid => {
                                        const g = lineGroups.find(lg => lg.id === gid);
                                        return (
                                            <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '10px', padding: '2px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {g?.group_name || gid}
                                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }} onClick={() => setDeptForm({ ...deptForm, line_group_ids: deptForm.line_group_ids.filter(id => id !== gid) })}>✕</button>
                                            </span>
                                        );
                                    })}
                                </div>
                                <select className="input-field" style={{ width: 'auto' }} value=""
                                    onChange={e => { const v = e.target.value; if (v && !deptForm.line_group_ids.includes(v)) setDeptForm({ ...deptForm, line_group_ids: [...deptForm.line_group_ids, v] }); e.currentTarget.value = ''; }}>
                                    <option value="">➕ {zh ? '新增群組…' : 'Add group…'}</option>
                                    {lineGroups.filter(g => !deptForm.line_group_ids.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                <button className="btn btn-primary" onClick={createDepartment}>{t('common.save')}</button>
                                <button className="btn btn-secondary" onClick={() => setShowCreateDept(false)}>{t('common.cancel')}</button>
                            </div>
                        </div>
                    )}

                    {/* Department cards */}
                    {departments.length === 0 ? (
                        <div className="card">
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                                {zh ? '尚未建立任何部門。點擊「新增部門」開始。' : 'No departments yet. Click "New Department" to start.'}
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                            {departments.map(dept => {
                                const manager = employees.find(e => e.id === dept.manager_user_id);
                                const members = employees.filter(e => e.department_id === dept.id);
                                const isEditing = editingDept?.id === dept.id;
                                return (
                                    <div key={dept.id} className="card">
                                        {isEditing ? (
                                            <div>
                                                <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
                                                    <div>
                                                        <label className="detail-label">{zh ? '部門名稱' : 'Name'}</label>
                                                        <input className="input-field" value={editDeptForm.name} onChange={e => setEditDeptForm({ ...editDeptForm, name: e.target.value })} />
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">{zh ? '描述' : 'Description'}</label>
                                                        <input className="input-field" value={editDeptForm.description} onChange={e => setEditDeptForm({ ...editDeptForm, description: e.target.value })} placeholder={zh ? '選填' : 'Optional'} />
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">{zh ? '部門主管' : 'Manager'}</label>
                                                        <select className="input-field" value={editDeptForm.manager_user_id} onChange={e => setEditDeptForm({ ...editDeptForm, manager_user_id: e.target.value })}>
                                                            <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.is_manager ? ' ★' : ''}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">💬 {zh ? '關聯 LINE 群組' : 'LINE Groups'}</label>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                                            {editDeptForm.line_group_ids.map(gid => {
                                                                const g = lineGroups.find(lg => lg.id === gid);
                                                                return (
                                                                    <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '10px', padding: '2px 7px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                        {g?.group_name || gid}
                                                                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }} onClick={() => setEditDeptForm({ ...editDeptForm, line_group_ids: editDeptForm.line_group_ids.filter(id => id !== gid) })}>✕</button>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                        <select className="input-field" style={{ width: 'auto' }} value=""
                                                            onChange={e => { const v = e.target.value; if (v && !editDeptForm.line_group_ids.includes(v)) setEditDeptForm({ ...editDeptForm, line_group_ids: [...editDeptForm.line_group_ids, v] }); e.currentTarget.value = ''; }}>
                                                            <option value="">➕ {zh ? '新增…' : 'Add…'}</option>
                                                            {lineGroups.filter(g => !editDeptForm.line_group_ids.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button className="btn btn-primary btn-sm" onClick={saveDepartment}>{t('common.save')}</button>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingDept(null)}>{t('common.cancel')}</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                                    <div>
                                                        <h3 style={{ fontSize: '15px', fontWeight: 600 }}>🏢 {dept.name}</h3>
                                                        {dept.description && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{dept.description}</p>}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => { setEditingDept(dept); setEditDeptForm({ name: dept.name, description: dept.description || '', manager_user_id: dept.manager_user_id || '', line_group_ids: dept.line_group_ids }); }}>✏️</button>
                                                        <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => deleteDepartment(dept.id)}>🗑</button>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '56px', flexShrink: 0 }}>{zh ? '主管' : 'Manager'}</span>
                                                        {manager
                                                            ? <span style={{ fontWeight: 500 }}>👤 {manager.name}{manager.is_manager ? <span style={{ color: 'var(--accent-yellow)', marginLeft: '4px' }}>★</span> : ''}</span>
                                                            : <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>—</span>
                                                        }
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '56px', flexShrink: 0 }}>{zh ? '成員' : 'Members'}</span>
                                                        <span style={{ background: 'var(--accent-primary-dim)', color: 'var(--accent-primary)', borderRadius: '8px', padding: '1px 8px', fontSize: '12px', fontWeight: 600 }}>
                                                            {members.length} {zh ? '人' : 'members'}
                                                        </span>
                                                    </div>
                                                    {dept.line_group_ids.length > 0 && (
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '56px', flexShrink: 0, paddingTop: '2px' }}>LINE</span>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                {dept.line_group_ids.map(gid => {
                                                                    const g = lineGroups.find(lg => lg.id === gid);
                                                                    return <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '1px 7px', fontSize: '11px' }}>💬 {g?.group_name || gid}</span>;
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {members.length > 0 && (
                                                        <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '8px', marginTop: '2px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                            {members.map(e => (
                                                                <span key={e.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)', borderRadius: '12px', padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: getColor(e.name), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>{e.name[0]}</span>
                                                                    {e.name}
                                                                    {e.is_manager && <span style={{ color: 'var(--accent-yellow)', fontSize: '10px' }}>★</span>}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            </div>{/* closes page-body */}
        </div>
    );
}
