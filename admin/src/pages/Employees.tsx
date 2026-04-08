import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { t, getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';
import { getTypeLabel, handleCsvImport } from '../lib/employeeHelpers';
import type {
    Employee, EditForm, Store, Company, Department, LineUser, LineGroup,
    ShiftTemplate, LeaveRequest, PerformanceReview, EmployeeAvailability,
    EmployeeDependent, PositionHistory, OnboardingTask, EmployeeSkill, DeptForm,
} from '../types/employees';
import { EmployeeCreateForm } from '../components/Employees/EmployeeCreateForm';
import { EmployeeDetailPanel } from '../components/Employees/EmployeeDetailPanel';
import { EmployeeListGrid } from '../components/Employees/EmployeeListGrid';
import { DepartmentTab } from '../components/Employees/DepartmentTab';

export function Employees({ initialMainTab = 'employees' }: { initialMainTab?: 'employees' | 'departments' } = {}) {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const typeLabel = getTypeLabel(zh);

    // ── Primary state ──
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [lineUsers, setLineUsers] = useState<LineUser[]>([]);
    const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);
    const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Employee | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [filter, setFilter] = useState<'all' | 'full_time' | 'part_time'>('all');
    const [storeFilter, setStoreFilter] = useState<string[]>([]);  // empty = all
    const [showStoreDropdown, setShowStoreDropdown] = useState(false);
    const [search, setSearch] = useState('');

    // Detail panel data
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [reviews, setReviews] = useState<PerformanceReview[]>([]);
    const [availabilities, setAvailabilities] = useState<EmployeeAvailability[]>([]);
    const [dependents, setDependents] = useState<EmployeeDependent[]>([]);
    const [positionHistory, setPositionHistory] = useState<PositionHistory[]>([]);
    const [skills, setSkills] = useState<EmployeeSkill[]>([]);
    const [onboardingTasks, setOnboardingTasks] = useState<OnboardingTask[]>([]);

    // Edit form
    const [editForm, setEditForm] = useState<EditForm | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    // Tab navigation
    const [mainTab, setMainTab] = useState<'employees' | 'departments'>(initialMainTab);
    const [showCreateDept, setShowCreateDept] = useState(false);

    // ── Data loaders ──
    const loadDepartments = async () => {
        const { data } = await supabase.from('departments').select('id, name, description, manager_user_id, company_id').eq('organization_id', orgId).order('name');
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

    const loadEmployees = async () => {
        const { data } = await supabase.from('users').select('*, store:store_id(name), company:company_id(name)').order('name');
        if (!data) { setEmployees([]); return; }
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

    const loadAvailabilities = async (userId: string) => {
        const { data } = await supabase.from('employee_availability')
            .select('id, day_of_week, availability, preferred_shift_id, notes, shift_template:shift_templates(id, name, start_time, end_time)')
            .eq('user_id', userId).order('day_of_week', { ascending: true });
        if (data) {
            setAvailabilities(data.map((d: any) => ({ ...d, shift_template: d.shift_template })));
        } else {
            setAvailabilities([]);
        }
    };

    const loadDependents = async (userId: string) => {
        const { data } = await supabase.from('employee_dependents').select('id, relationship, name, id_number, birth_date, health_ins_enrolled, notes').eq('user_id', userId).order('created_at');
        setDependents(data || []);
    };

    const loadPositionHistory = async (userId: string) => {
        const { data } = await supabase.from('employee_position_history').select('id, change_type, effective_date, title, job_grade, department_name, store_name, employee_type, salary_type, base_salary, hourly_wage, role_allowance, meal_allowance, transport_allowance, reason, notes, created_at').eq('user_id', userId).order('effective_date', { ascending: false });
        setPositionHistory(data || []);
    };

    const loadSkills = async (userId: string) => {
        const { data } = await supabase.from('employee_skills').select('id, skill_name, proficiency, certified_at, expires_at').eq('user_id', userId).order('skill_name');
        setSkills(data || []);
    };

    const loadOnboardingTasks = async (userId: string) => {
        const { data } = await supabase.from('onboarding_tasks').select('id, type, title, description, due_date, status, completed_at, sort_order')
            .eq('user_id', userId).order('sort_order');
        setOnboardingTasks(data || []);
    };

    const loadUserLineGroups = async (userId: string) => {
        const { data } = await supabase.from('user_line_groups').select('line_group_id').eq('user_id', userId);
        setEditForm(prev => prev ? { ...prev, line_group_ids: data?.map((r: any) => r.line_group_id) || [] } : null);
    };

    // ── Edit form helpers ──
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

    // ── Save employee (edit) ──
    const saveEmployee = async () => {
        if (!selected || !editForm) return;
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
        await supabase.from('user_stores').delete().eq('user_id', selected.id);
        if (editForm.store_ids.length > 0) {
            await supabase.from('user_stores').insert(
                editForm.store_ids.map((sid, i) => ({ user_id: selected.id, store_id: sid, is_primary: i === 0 }))
            );
        }
        // OE-3: Auto-create offboarding tasks when status changes to inactive
        if (editForm.status === 'inactive' && selected.status === 'active') {
            const { data: templates } = await supabase.from('onboarding_templates').select('id, items')
                .eq('organization_id', orgId).eq('type', 'offboarding');
            if (templates && templates.length > 0) {
                const resignDate = editForm.resign_date ? new Date(editForm.resign_date + 'T00:00:00') : new Date();
                const tasks = templates.flatMap((tmpl: any) =>
                    (tmpl.items as any[]).map((item: any, idx: number) => ({
                        organization_id: orgId, user_id: selected.id, template_id: tmpl.id,
                        type: 'offboarding', title: item.title, description: item.description || null,
                        due_date: item.due_days ? new Date(resignDate.getTime() + item.due_days * 86400000).toISOString().split('T')[0] : null,
                        sort_order: idx,
                    }))
                );
                if (tasks.length > 0) await supabase.from('onboarding_tasks').insert(tasks);
            }
        }
        setIsDirty(false);
        await loadEmployees();
    };

    // ── Other actions ──
    const mapLineUser = async (empId: string, lineUserId: string | null) => {
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

    const generateCertificate = (emp: Employee) => {
        const companyName = emp.company?.name || '公司';
        const certContent = [
            '',
            zh ? '服　務　證　明　書' : 'CERTIFICATE OF EMPLOYMENT',
            '',
            zh ? `茲證明 ${emp.name} 先生/女士（身分證字號：${emp.id_number || '________'}）`
               : `This is to certify that ${emp.name} (ID: ${emp.id_number || '________'})`,
            zh ? `自 ${emp.hire_date || '____年__月__日'} 起至 ${emp.resign_date || '在職中'}`
               : `has been employed from ${emp.hire_date || '____'} to ${emp.resign_date || 'present'}`,
            zh ? `擔任本公司 ${emp.position || '________'} 一職。`
               : `in the position of ${emp.position || '________'}.`,
            '',
            zh ? `特此證明。` : 'This certificate is issued upon request.',
            '',
            `${companyName}`,
            zh ? `中華民國 ${new Date().getFullYear() - 1911} 年 ${new Date().getMonth() + 1} 月 ${new Date().getDate()} 日`
               : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        ].join('\n');
        const w = window.open('', '_blank', 'width=600,height=500');
        if (w) {
            w.document.write(`<pre style="font-family:serif;font-size:16px;line-height:2;padding:40px;white-space:pre-wrap">${certContent}</pre>`);
            w.document.title = zh ? '服務證明書' : 'Certificate of Employment';
        }
    };

    const doTransfer = async (emp: Employee) => {
        const targetStoreId = prompt(zh ? '請輸入目標門市 ID（或從門市列表複製）' : 'Enter target store ID');
        if (!targetStoreId) return;
        const targetStore = stores.find(s => s.id === targetStoreId);
        const storeName = targetStore?.name || targetStoreId;
        await supabase.from('users').update({ store_id: targetStoreId }).eq('id', emp.id);
        await supabase.from('employee_position_history').insert({
            organization_id: orgId, user_id: emp.id,
            change_type: 'transfer',
            effective_date: new Date().toISOString().slice(0, 10),
            store_name: storeName,
            reason: zh ? `調動至 ${storeName}` : `Transferred to ${storeName}`,
        });
        alert(zh ? `已調動至 ${storeName}` : `Transferred to ${storeName}`);
        await loadEmployees();
        setSelected(null);
    };

    // ── Department CRUD (delegated to DepartmentTab but DB logic stays here) ──
    const createDepartment = async (form: DeptForm) => {
        const { data } = await supabase.from('departments').insert({
            organization_id: orgId,
            name: form.name.trim(),
            description: form.description.trim() || null,
            manager_user_id: form.manager_user_id || null,
            company_id: form.company_id || null,
        }).select().single();
        if (data && form.line_group_ids.length > 0) {
            await supabase.from('department_line_groups').insert(
                form.line_group_ids.map(gid => ({ department_id: data.id, line_group_id: gid }))
            );
        }
        await loadDepartments();
    };

    const saveDepartment = async (dept: Department, form: DeptForm) => {
        await supabase.from('departments').update({
            name: form.name.trim(),
            description: form.description.trim() || null,
            manager_user_id: form.manager_user_id || null,
            company_id: form.company_id || null,
        }).eq('id', dept.id);
        await supabase.from('department_line_groups').delete().eq('department_id', dept.id);
        if (form.line_group_ids.length > 0) {
            await supabase.from('department_line_groups').insert(
                form.line_group_ids.map(gid => ({ department_id: dept.id, line_group_id: gid }))
            );
        }
        await loadDepartments();
    };

    const deleteDepartment = async (id: string) => {
        await supabase.from('departments').delete().eq('id', id);
        await loadDepartments();
    };

    // ── Effects ──
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
            loadSkills(selected.id);
            loadOnboardingTasks(selected.id);
            initEditForm(selected);
            loadUserLineGroups(selected.id);
        } else {
            setLeaves([]);
            setReviews([]);
            setAvailabilities([]);
            setDependents([]);
            setPositionHistory([]);
            setSkills([]);
            setOnboardingTasks([]);
            setEditForm(null);
            setIsDirty(false);
        }
    }, [selected?.id]);

    // Close overlay on Escape
    useEffect(() => {
        if (!selected) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selected]);

    // ── Derived data ──
    const filteredEmployees = employees.filter(e => {
        if (filter !== 'all' && e.employee_type !== filter) return false;
        if (storeFilter.length > 0 && !e.store_ids.some(sid => storeFilter.includes(sid))) return false;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            const haystack = [e.name, e.english_name, e.employee_number, e.phone, e.email, e.position, e.department, ...e.store_names].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });

    // ── Render ──
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
                                    <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleCsvImport(e, orgId, zh, loadEmployees)} />
                                </label>
                                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>➕ {t('employee.create')}</button>
                            </>
                        )
                        : <button className="btn btn-primary" onClick={() => setShowCreateDept(true)}>➕ {zh ? '新增部門' : 'New Department'}</button>
                    }
                </div>
            </div>

            {/* Employee filters (only in employees tab) */}
            {mainTab === 'employees' && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Search */}
                <div style={{ position: 'relative' }}>
                    <input className="input-field" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder={zh ? '搜尋姓名、電話、職位...' : 'Search name, phone, position...'}
                        style={{ fontSize: '12px', padding: '5px 12px 5px 30px', width: '200px' }} />
                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
                </div>
                {/* Type filter */}
                <div style={{ display: 'flex', gap: '6px' }}>
                    {(['all', 'full_time', 'part_time'] as const).map(f => (
                        <button key={f} className={`tab-item ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}
                            style={{ fontSize: '12px', padding: '4px 12px' }}>
                            {f === 'all' ? (zh ? '全部' : 'All') : typeLabel[f]} ({f === 'all' ? employees.length : employees.filter(e => e.employee_type === f).length})
                        </button>
                    ))}
                </div>

                {/* Store multi-select filter */}
                <div style={{ position: 'relative' }}>
                    <button className="btn btn-sm" onClick={() => setShowStoreDropdown(!showStoreDropdown)}
                        style={{
                            fontSize: '12px', padding: '4px 12px',
                            background: storeFilter.length > 0 ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                            color: storeFilter.length > 0 ? '#fff' : 'var(--text-primary)',
                            border: '1px solid var(--outline-variant)',
                        }}>
                        🏪 {zh ? '門市' : 'Store'}
                        {storeFilter.length > 0 && ` (${storeFilter.length})`}
                        <span style={{ marginLeft: '4px', fontSize: '10px' }}>▼</span>
                    </button>
                    {showStoreDropdown && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowStoreDropdown(false)} />
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, marginTop: '4px', zIndex: 100,
                                background: 'var(--bg-primary)', border: '1px solid var(--outline-variant)',
                                borderRadius: 'var(--radius-md)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                minWidth: '200px', maxHeight: '280px', overflowY: 'auto', padding: '6px 0',
                            }}>
                                {/* Select all / clear */}
                                <button style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                    padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer',
                                    fontSize: '12px', fontWeight: 600, color: 'var(--accent-primary)',
                                    borderBottom: '1px solid var(--outline-variant)',
                                }} onClick={() => {
                                    if (storeFilter.length === stores.length) setStoreFilter([]);
                                    else setStoreFilter(stores.map(s => s.id));
                                }}>
                                    <input type="checkbox" readOnly
                                        checked={storeFilter.length === stores.length && stores.length > 0}
                                        ref={el => { if (el) el.indeterminate = storeFilter.length > 0 && storeFilter.length < stores.length; }}
                                        style={{ accentColor: 'var(--accent-primary)', pointerEvents: 'none' }} />
                                    {storeFilter.length === stores.length ? (zh ? '取消全選' : 'Deselect All') : (zh ? '全選' : 'Select All')}
                                </button>
                                {stores.map(s => {
                                    const checked = storeFilter.includes(s.id);
                                    return (
                                        <button key={s.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                            padding: '6px 14px', border: 'none', background: checked ? 'var(--accent-primary-dim)' : 'none',
                                            cursor: 'pointer', fontSize: '12px', color: 'var(--text-primary)', textAlign: 'left',
                                        }} onClick={() => {
                                            setStoreFilter(prev => checked ? prev.filter(id => id !== s.id) : [...prev, s.id]);
                                        }}>
                                            <input type="checkbox" readOnly checked={checked}
                                                style={{ accentColor: 'var(--accent-primary)', pointerEvents: 'none' }} />
                                            {s.name}
                                        </button>
                                    );
                                })}
                                {storeFilter.length > 0 && (
                                    <button style={{
                                        width: '100%', padding: '6px 14px', border: 'none', background: 'none',
                                        cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)',
                                        borderTop: '1px solid var(--outline-variant)', marginTop: '2px',
                                    }} onClick={() => { setStoreFilter([]); setShowStoreDropdown(false); }}>
                                        ✕ {zh ? '清除篩選' : 'Clear filter'}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Active filter count */}
                {storeFilter.length > 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {zh ? `顯示 ${filteredEmployees.length} 筆` : `Showing ${filteredEmployees.length}`}
                    </span>
                )}
            </div>
            )}

            {mainTab === 'employees' && (<>
            {showCreate && (
                <EmployeeCreateForm
                    stores={stores}
                    companies={companies}
                    departments={departments}
                    employees={employees}
                    onClose={() => setShowCreate(false)}
                    onCreated={loadEmployees}
                />
            )}

            {loading ? <p className="loading-pulse">{t('common.loading')}</p> : (
                <EmployeeListGrid
                    employees={filteredEmployees}
                    allEmployees={employees}
                    selected={selected}
                    onSelect={setSelected}
                />
            )}

            {/* Employee detail overlay */}
            {selected && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
                }}>
                    {/* Backdrop */}
                    <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                        backdropFilter: 'blur(2px)',
                    }} onClick={() => setSelected(null)} />
                    {/* Panel */}
                    <div className="fade-in" style={{
                        position: 'relative', zIndex: 1,
                        width: '90%', maxWidth: '720px', maxHeight: '90vh',
                        overflowY: 'auto', marginTop: '3vh',
                        background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                        padding: '0',
                    }}>
                        <EmployeeDetailPanel
                            selected={selected}
                            employees={employees}
                            stores={stores}
                            companies={companies}
                            departments={departments}
                            lineUsers={lineUsers}
                            lineGroups={lineGroups}
                            shiftTemplates={shiftTemplates}
                            editForm={editForm}
                            isDirty={isDirty}
                            patchForm={patchForm}
                            saveEmployee={saveEmployee}
                            leaves={leaves}
                            reviews={reviews}
                            availabilities={availabilities}
                            dependents={dependents}
                            positionHistory={positionHistory}
                            skills={skills}
                            onboardingTasks={onboardingTasks}
                            onClose={() => setSelected(null)}
                            loadLeaves={loadLeaves}
                            loadReviews={loadReviews}
                            loadAvailabilities={loadAvailabilities}
                            loadDependents={loadDependents}
                            loadPositionHistory={loadPositionHistory}
                            loadSkills={loadSkills}
                            loadOnboardingTasks={loadOnboardingTasks}
                            mapLineUser={mapLineUser}
                            updateField={updateField}
                            generateCertificate={generateCertificate}
                            doTransfer={doTransfer}
                        />
                    </div>
                </div>
            )}
            </>)}

            {/* ===== Departments Tab ===== */}
            {mainTab === 'departments' && (
                <DepartmentTab
                    departments={departments}
                    employees={employees}
                    companies={companies}
                    lineGroups={lineGroups}
                    showCreateDept={showCreateDept}
                    setShowCreateDept={setShowCreateDept}
                    createDepartment={createDepartment}
                    saveDepartment={saveDepartment}
                    deleteDepartment={deleteDepartment}
                />
            )}
            </div>{/* closes page-body */}
        </div>
    );
}
