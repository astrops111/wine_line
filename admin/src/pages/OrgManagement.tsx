import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/OrgContext';
import { getLocale } from '../lib/i18n';
import { Employees } from './Employees';
import { LineManagement } from './LineManagement';
import type {
    Tab, Org, Subscription, Payment, Company, Store, Department, Employee,
    LineGroup, ObTemplate, Announcement,
} from '../types/orgManagement';
import { statusColors, planColors, getPlanLabel } from '../types/orgManagement';
import { CompanyTab } from '../components/OrgManagement/CompanyTab';
import { StoreTab } from '../components/OrgManagement/StoreTab';
import { DepartmentTab } from '../components/OrgManagement/DepartmentTab';
import type { DeptFormData } from '../components/OrgManagement/DepartmentTab';
import { BillingTab } from '../components/OrgManagement/BillingTab';
import { OrgChartTab } from '../components/OrgManagement/OrgChartTab';
import { TemplatesTab } from '../components/OrgManagement/TemplatesTab';
import type { TmplFormData } from '../components/OrgManagement/TemplatesTab';
import { AnnouncementsTab } from '../components/OrgManagement/AnnouncementsTab';
import type { AnnFormData } from '../components/OrgManagement/AnnouncementsTab';

export function OrgManagement() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = (searchParams.get('tab') as Tab) || 'dashboard';
    const [tab, setTab] = useState<Tab>(tabParam);

    // Sync URL -> state when user navigates via browser back/forward
    useEffect(() => { setTab((searchParams.get('tab') as Tab) || 'dashboard'); }, [searchParams]);

    const switchTab = (t: Tab) => {
        setTab(t);
        setSearchParams({ tab: t }, { replace: true });
    };

    // ── Primary state ──
    const [loading, setLoading] = useState(true);
    const [orgs, setOrgs] = useState<Org[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Org>>({});
    const [showCreateOrg, setShowCreateOrg] = useState(false);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [lineGroups, setLineGroups] = useState<LineGroup[]>([]);
    const [companyForm, setCompanyForm] = useState<Partial<Company>>({});
    const [obTemplates, setObTemplates] = useState<ObTemplate[]>([]);
    const [orgAnnouncements, setOrgAnnouncements] = useState<Announcement[]>([]);

    // ── Data loading ──
    useEffect(() => { loadOrgs(); }, []);
    useEffect(() => {
        if (orgId) {
            loadOrgDetails(orgId);
            loadDepartments();
            loadObTemplates();
            loadOrgAnnouncements();
            supabase.from('line_groups').select('id, group_name').then(r => setLineGroups(r.data || []));
        }
    }, [orgId]);

    async function loadOrgs() {
        setLoading(true);
        const { data } = await supabase.from('organizations').select('*').order('created_at');
        setOrgs(data || []);
        if (data && data.length > 0) {
            const current = data.find(o => o.id === orgId) || data[0];
            setSelectedOrg(current);
            loadOrgDetails(current.id);
        }
        setLoading(false);
    }

    async function loadOrgDetails(oid: string) {
        const [subRes, payRes, storeRes, compRes, empRes] = await Promise.all([
            supabase.from('org_subscriptions').select('*').eq('organization_id', oid).order('created_at', { ascending: false }),
            supabase.from('org_payments').select('*').eq('organization_id', oid).order('created_at', { ascending: false }),
            supabase.from('stores').select('*, company:companies(name)').eq('organization_id', oid).order('name'),
            supabase.from('companies').select('*').eq('organization_id', oid).order('name'),
            supabase.from('users').select('*, store:stores(name), company:companies(name)').eq('organization_id', oid).order('name'),
        ]);
        setSubscriptions(subRes.data || []);
        setPayments(payRes.data || []);
        setStores(storeRes.data || []);
        setCompanies(compRes.data || []);
        setEmployees(empRes.data || []);
    }

    async function loadDepartments() {
        const { data } = await supabase.from('departments').select('id, name, description, manager_user_id, company_id').eq('organization_id', orgId).order('name');
        if (!data) return;
        const { data: lgData } = data.length > 0
            ? await supabase.from('department_line_groups').select('department_id, line_group_id').in('department_id', data.map(d => d.id))
            : { data: [] };
        const lgMap: Record<string, string[]> = {};
        (lgData || []).forEach((r: any) => { lgMap[r.department_id] = lgMap[r.department_id] || []; lgMap[r.department_id].push(r.line_group_id); });
        setDepartments(data.map((d: any) => ({ ...d, line_group_ids: lgMap[d.id] || [] })));
    }

    async function loadObTemplates() {
        const { data } = await supabase.from('onboarding_templates').select('id, name, type, items, created_at').eq('organization_id', orgId).order('created_at');
        setObTemplates(data || []);
    }

    async function loadOrgAnnouncements() {
        const { data } = await supabase.from('announcements').select('id, title, content, priority, target_type, is_pinned, published_at, expires_at')
            .eq('organization_id', orgId).order('published_at', { ascending: false });
        setOrgAnnouncements(data || []);
    }

    // ── Org CRUD ──
    function selectOrg(org: Org) { setSelectedOrg(org); setEditMode(false); loadOrgDetails(org.id); }
    function startEdit() { if (!selectedOrg) return; setEditForm({ ...selectedOrg }); setEditMode(true); }

    async function saveOrg() {
        if (!selectedOrg) return;
        const { error } = await supabase.from('organizations').update({
            name: editForm.name, slug: editForm.slug, tax_id: editForm.tax_id,
            contact_person: editForm.contact_person, phone: editForm.phone,
            address: editForm.address, logo_url: editForm.logo_url,
            status: editForm.status, plan: editForm.plan,
            updated_at: new Date().toISOString(),
        }).eq('id', selectedOrg.id);
        if (error) alert(`Error: ${error.message}`);
        else { setEditMode(false); loadOrgs(); }
    }

    async function createOrg() {
        const { error } = await supabase.from('organizations').insert({
            name: editForm.name || (zh ? '新組織' : 'New Organization'),
            slug: editForm.slug || `org-${Date.now()}`,
            tax_id: editForm.tax_id, contact_person: editForm.contact_person,
            phone: editForm.phone, address: editForm.address, status: 'active', plan: 'free',
        });
        if (error) alert(`Error: ${error.message}`);
        else { setShowCreateOrg(false); setEditForm({}); loadOrgs(); }
    }

    async function archiveOrg(org: Org) {
        if (!confirm(zh ? `確定要封存「${org.name}」嗎？` : `Archive "${org.name}"?`)) return;
        await supabase.from('organizations').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', org.id);
        loadOrgs();
    }

    // ── Company CRUD (passed to CompanyTab) ──
    async function saveCompany(id?: string) {
        const payload = { organization_id: selectedOrg?.id, name: companyForm.name || (zh ? '新公司' : 'New Company'), status: companyForm.status || 'active' };
        const { error } = id
            ? await supabase.from('companies').update(payload).eq('id', id)
            : await supabase.from('companies').insert(payload);
        if (error) { alert((zh ? '儲存失敗：' : 'Save failed: ') + error.message); return; }
        setCompanyForm({});
        if (selectedOrg) loadOrgDetails(selectedOrg.id);
    }

    // ── Store CRUD (passed to StoreTab) ──
    async function handleSaveStore(editingStoreId: string, editStoreData: any) {
        const { error } = await supabase.from('stores').update({
            company_id: editStoreData.company_id || null,
            gps_lat: editStoreData.gps_lat ? parseFloat(editStoreData.gps_lat) : null,
            gps_lng: editStoreData.gps_lng ? parseFloat(editStoreData.gps_lng) : null,
            gps_radius_m: editStoreData.gps_radius_m || 200,
            clock_in_method: editStoreData.clock_in_method || 'any',
        }).eq('id', editingStoreId);
        if (error) { alert(error.message); return; }
        if (selectedOrg) loadOrgDetails(selectedOrg.id);
    }

    async function handleDeleteStore(id: string, name: string) {
        if (!confirm(zh ? `確定刪除門市「${name}」？相關資料也會一併移除。` : `Delete store "${name}"? Related data will also be removed.`)) return;
        const { error } = await supabase.from('stores').delete().eq('id', id);
        if (error) { alert((zh ? '刪除失敗：' : 'Delete failed: ') + error.message); return; }
        if (selectedOrg) loadOrgDetails(selectedOrg.id);
    }

    // ── Department CRUD (passed to DepartmentTab) ──
    async function handleCreateDepartment(form: DeptFormData) {
        if (!form.name.trim()) return;
        const { data } = await supabase.from('departments').insert({
            organization_id: orgId, name: form.name.trim(),
            description: form.description.trim() || null, manager_user_id: form.manager_user_id || null,
            company_id: form.company_id || null,
        }).select().single();
        if (data && form.line_group_ids.length > 0) {
            await supabase.from('department_line_groups').insert(form.line_group_ids.map(gid => ({ department_id: data.id, line_group_id: gid })));
        }
        await loadDepartments();
    }

    async function handleSaveDepartment(dept: Department, form: DeptFormData) {
        await supabase.from('departments').update({ name: form.name, description: form.description || null, manager_user_id: form.manager_user_id || null, company_id: form.company_id || null }).eq('id', dept.id);
        await supabase.from('department_line_groups').delete().eq('department_id', dept.id);
        if (form.line_group_ids.length > 0) {
            await supabase.from('department_line_groups').insert(form.line_group_ids.map(gid => ({ department_id: dept.id, line_group_id: gid })));
        }
        await loadDepartments();
    }

    async function handleDeleteDepartment(id: string) {
        if (!confirm(zh ? '確定要刪除此部門？' : 'Delete this department?')) return;
        await supabase.from('departments').delete().eq('id', id);
        await loadDepartments();
    }

    // ── Billing CRUD (passed to BillingTab) ──
    async function handleAddSubscription(form: Partial<Subscription>, editingSub: Subscription | null) {
        if (editingSub) {
            await supabase.from('org_subscriptions').update({
                plan: form.plan, status: form.status,
                price_monthly: Number(form.price_monthly),
                max_users: Number(form.max_users),
                max_stores: Number(form.max_stores),
                current_period_start: form.current_period_start || null,
                current_period_end: form.current_period_end || null,
                notes: form.notes || null,
            }).eq('id', editingSub.id);
        } else if (selectedOrg) {
            const { error } = await supabase.from('org_subscriptions').insert({
                organization_id: selectedOrg.id,
                plan: form.plan || 'starter',
                status: form.status || 'active',
                price_monthly: Number(form.price_monthly) || 0,
                max_users: Number(form.max_users) || 50,
                max_stores: Number(form.max_stores) || 5,
                current_period_start: form.current_period_start || null,
                current_period_end: form.current_period_end || null,
                notes: form.notes || null,
            });
            if (error) { alert(error.message); return; }
        }
        if (selectedOrg) loadOrgDetails(selectedOrg.id);
    }

    async function handleAddPayment(form: Partial<Payment>) {
        if (!selectedOrg) return;
        const { error } = await supabase.from('org_payments').insert({
            organization_id: selectedOrg.id,
            subscription_id: form.subscription_id || null,
            amount: Number(form.amount) || 0,
            currency: form.currency || 'TWD',
            status: form.status || 'paid',
            payment_method: form.payment_method || null,
            invoice_number: form.invoice_number || null,
            notes: form.notes || null,
            paid_at: form.paid_at || new Date().toISOString(),
        });
        if (error) { alert(error.message); return; }
        loadOrgDetails(selectedOrg.id);
    }

    // ── Templates CRUD (passed to TemplatesTab) ──
    async function handleCreateTemplate(form: TmplFormData) {
        if (!form.name.trim()) return;
        await supabase.from('onboarding_templates').insert({
            organization_id: orgId, name: form.name.trim(), type: form.type,
            items: form.items.map((it, i) => ({ ...it, due_days: it.due_days ? Number(it.due_days) : null, sort_order: i })),
        });
        await loadObTemplates();
    }

    async function handleDeleteTemplate(id: string) {
        if (!confirm(zh ? '確定刪除此範本？' : 'Delete this template?')) return;
        await supabase.from('onboarding_templates').delete().eq('id', id);
        await loadObTemplates();
    }

    // ── Announcements CRUD (passed to AnnouncementsTab) ──
    async function handleCreateAnnouncement(form: AnnFormData) {
        if (!form.title.trim() || !form.content.trim()) return;
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('announcements').insert({
            organization_id: orgId, title: form.title.trim(), content: form.content.trim(),
            priority: form.priority, target_type: form.target_type, is_pinned: form.is_pinned,
            author_id: user?.id || null, expires_at: form.expires_at || null,
        });
        await loadOrgAnnouncements();
    }

    async function handleDeleteAnnouncement(id: string) {
        if (!confirm(zh ? '確定刪除此公告？' : 'Delete this announcement?')) return;
        await supabase.from('announcements').delete().eq('id', id);
        await loadOrgAnnouncements();
    }

    // ── Tab definitions ──
    const tabDefs: { key: Tab; icon: string; label: string }[] = [
        { key: 'dashboard',   icon: '📊', label: zh ? '總覽'   : 'Dashboard' },
        { key: 'orgs',        icon: '🏢', label: zh ? '組織'   : 'Org' },
        { key: 'companies',   icon: '🏛️', label: zh ? '公司'   : 'Company' },
        { key: 'locations',   icon: '📍', label: zh ? '門市'   : 'Locations' },
        { key: 'departments', icon: '🗂', label: zh ? '部門'   : 'Departments' },
        { key: 'employees',   icon: '👥', label: zh ? '員工'   : 'Employees' },
        { key: 'line',          icon: '💬', label: 'LINE' },
        { key: 'orgchart',     icon: '🏛', label: zh ? '組織圖' : 'Org Chart' },
        { key: 'templates',    icon: '📋', label: zh ? '到離職範本' : 'Checklists' },
        { key: 'announcements', icon: '📢', label: zh ? '公告'   : 'Announcements' },
        { key: 'billing',      icon: '💳', label: zh ? '帳單'   : 'Billing' },
    ];

    // ── Helpers for Org tab ──
    function renderField(label: string, key: string, value: string, editable: boolean) {
        return (
            <div>
                <label className="detail-label">{label}</label>
                <input type="text" className="input-field" value={value} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} readOnly={!editable} />
            </div>
        );
    }

    function renderInfoRow(label: string, value: any) {
        return (
            <div>
                <div style={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>{label}</div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{value}</div>
            </div>
        );
    }

    // ── Loading state ──
    if (loading) return (
        <div className="fade-in">
            <div className="page-header"><h2>🏢 {zh ? '組織管理' : 'Org Management'}</h2></div>
            <div className="page-body"><p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p></div>
        </div>
    );

    // ── Render ──
    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>🏢 {zh ? '組織管理' : 'Org Management'}</h2>
                <p>{zh ? '管理組織、公司、門市、部門與員工' : 'Manage org, companies, locations, departments & people'}</p>
            </div>

            <div className="page-body">
                {/* Tab bar */}
                <div className="tab-bar" style={{ marginBottom: '20px' }}>
                    {tabDefs.map(td => (
                        <button key={td.key} className={`tab-item ${tab === td.key ? 'active' : ''}`} onClick={() => switchTab(td.key)}>
                            {td.icon} {td.label}
                        </button>
                    ))}
                </div>

                {/* ═══ DASHBOARD ═══ */}
                {tab === 'dashboard' && (
                    <div>
                        <div className="stats-grid" style={{ marginBottom: '24px' }}>
                            <div className="stat-card emerald">
                                <div className="stat-label">{zh ? '組織' : 'Orgs'}</div>
                                <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{orgs.filter(o => o.status === 'active').length}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{orgs.length} {zh ? '總計' : 'total'}</div>
                            </div>
                            <div className="stat-card blue">
                                <div className="stat-label">{zh ? '公司' : 'Companies'}</div>
                                <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{companies.length}</div>
                            </div>
                            <div className="stat-card purple">
                                <div className="stat-label">{zh ? '門市' : 'Locations'}</div>
                                <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{stores.filter(s => s.is_active).length}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{stores.length} {zh ? '總計' : 'total'}</div>
                            </div>
                            <div className="stat-card orange">
                                <div className="stat-label">{zh ? '部門' : 'Departments'}</div>
                                <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{departments.length}</div>
                            </div>
                            <div className="stat-card emerald">
                                <div className="stat-label">{zh ? '在職員工' : 'Active Staff'}</div>
                                <div className="stat-value" style={{ fontVariantNumeric: 'tabular-nums' }}>{employees.filter(e => e.status === 'active').length}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{employees.length} {zh ? '總計' : 'total'}</div>
                            </div>
                        </div>

                        {/* Org overview cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                            {orgs.map(org => {
                                const orgEmps = employees.filter(e => (e as any).organization_id === org.id);
                                const sub = subscriptions.find(s => s.organization_id === org.id && s.status === 'active');
                                return (
                                    <div key={org.id} className="card" role="button" tabIndex={0} style={{ cursor: 'pointer', borderColor: selectedOrg?.id === org.id ? 'var(--accent-primary)' : undefined }}
                                        onClick={() => { selectOrg(org); switchTab('orgs'); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOrg(org); switchTab('orgs'); } }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{org.name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{org.slug}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: statusColors[org.status]?.bg, color: statusColors[org.status]?.color }}>{org.status}</span>
                                                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: planColors[org.plan]?.bg, color: planColors[org.plan]?.color }}>{getPlanLabel(org.plan, zh)}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            <span>👥 {orgEmps.length} {zh ? '人' : 'staff'}</span>
                                            {sub && <span>💳 NT${sub.price_monthly.toLocaleString()}/mo</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ═══ ORG ═══ */}
                {tab === 'orgs' && (
                    <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px' }}>
                            <div className="card" style={{ padding: 0 }}>
                                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{zh ? '組織列表' : 'Organizations'}</span>
                                    <button onClick={() => { setShowCreateOrg(true); setEditForm({}); }} className="btn btn-sm btn-primary">+ {zh ? '新增' : 'Add'}</button>
                                </div>
                                <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
                                    {orgs.map(org => (
                                        <div key={org.id} onClick={() => selectOrg(org)} style={{
                                            padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--outline-variant)',
                                            background: selectedOrg?.id === org.id ? 'var(--accent-primary-dim)' : undefined,
                                            borderLeft: `3px solid ${selectedOrg?.id === org.id ? 'var(--accent-primary)' : 'transparent'}`,
                                        }}>
                                            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>{org.name}</div>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, background: statusColors[org.status]?.bg, color: statusColors[org.status]?.color }}>{org.status}</span>
                                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, background: planColors[org.plan]?.bg, color: planColors[org.plan]?.color }}>{getPlanLabel(org.plan, zh)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="card" style={{ padding: 0 }}>
                                {showCreateOrg ? (
                                    <>
                                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--outline-variant)' }}>
                                            <span style={{ fontWeight: 600, fontSize: '14px' }}>➕ {zh ? '新增組織' : 'Create Organization'}</span>
                                        </div>
                                        <div style={{ padding: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                            {renderField(zh ? '組織名稱' : 'Org Name', 'name', editForm.name || '', true)}
                                            {renderField('Slug', 'slug', editForm.slug || '', true)}
                                            {renderField(zh ? '統一編號' : 'Tax ID', 'tax_id', editForm.tax_id || '', true)}
                                            {renderField(zh ? '聯絡人' : 'Contact', 'contact_person', editForm.contact_person || '', true)}
                                            {renderField(zh ? '電話' : 'Phone', 'phone', editForm.phone || '', true)}
                                            {renderField(zh ? '地址' : 'Address', 'address', editForm.address || '', true)}
                                        </div>
                                        <div style={{ padding: '0 18px 18px', display: 'flex', gap: '8px' }}>
                                            <button className="btn btn-primary" onClick={createOrg}>{zh ? '建立' : 'Create'}</button>
                                            <button className="btn btn-secondary" onClick={() => setShowCreateOrg(false)}>{zh ? '取消' : 'Cancel'}</button>
                                        </div>
                                    </>
                                ) : selectedOrg ? (
                                    <>
                                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, fontSize: '14px' }}>
                                                {editMode ? `✏️ ${zh ? '編輯組織' : 'Edit Org'}` : `🏢 ${selectedOrg.name}`}
                                            </span>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <button className="btn btn-sm btn-secondary" onClick={() => switchTab('billing')}>
                                                    💳 {zh ? '查看帳單' : 'Billing'}
                                                </button>
                                                {!editMode
                                                    ? <button className="btn btn-sm btn-secondary" onClick={startEdit}>✏️ {zh ? '編輯' : 'Edit'}</button>
                                                    : <>
                                                        <button className="btn btn-sm btn-primary" onClick={saveOrg}>💾 {zh ? '儲存' : 'Save'}</button>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => setEditMode(false)}>{zh ? '取消' : 'Cancel'}</button>
                                                    </>
                                                }
                                                {selectedOrg.status !== 'archived' && !editMode && (
                                                    <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-orange)' }} onClick={() => archiveOrg(selectedOrg)}>📦</button>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ padding: '18px' }}>
                                            {editMode ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                                    {renderField(zh ? '組織名稱' : 'Name', 'name', editForm.name || '', true)}
                                                    {renderField('Slug', 'slug', editForm.slug || '', true)}
                                                    {renderField(zh ? '統一編號' : 'Tax ID', 'tax_id', editForm.tax_id || '', true)}
                                                    {renderField(zh ? '聯絡人' : 'Contact', 'contact_person', editForm.contact_person || '', true)}
                                                    {renderField(zh ? '電話' : 'Phone', 'phone', editForm.phone || '', true)}
                                                    {renderField(zh ? '地址' : 'Address', 'address', editForm.address || '', true)}
                                                    {renderField('Logo URL', 'logo_url', editForm.logo_url || '', true)}
                                                    <div>
                                                        <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                                                        <select className="input-field" value={editForm.status || 'active'} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                                                            <option value="active">{zh ? '啟用' : 'Active'}</option>
                                                            <option value="suspended">{zh ? '暫停' : 'Suspended'}</option>
                                                            <option value="archived">{zh ? '封存' : 'Archived'}</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">{zh ? '方案' : 'Plan'}</label>
                                                        <select className="input-field" value={editForm.plan || 'free'} onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}>
                                                            <option value="free">{zh ? '免費版' : 'Free'}</option>
                                                            <option value="starter">{zh ? '入門版' : 'Starter'}</option>
                                                            <option value="pro">{zh ? '專業版' : 'Pro'}</option>
                                                            <option value="enterprise">{zh ? '企業版' : 'Enterprise'}</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                    {renderInfoRow(zh ? '名稱' : 'Name', selectedOrg.name)}
                                                    {renderInfoRow('Slug', selectedOrg.slug)}
                                                    {renderInfoRow(zh ? '統一編號' : 'Tax ID', selectedOrg.tax_id || '—')}
                                                    {renderInfoRow(zh ? '聯絡人' : 'Contact', selectedOrg.contact_person || '—')}
                                                    {renderInfoRow(zh ? '電話' : 'Phone', selectedOrg.phone || '—')}
                                                    {renderInfoRow(zh ? '地址' : 'Address', selectedOrg.address || '—')}
                                                    {renderInfoRow(zh ? '狀態' : 'Status', <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, background: statusColors[selectedOrg.status]?.bg, color: statusColors[selectedOrg.status]?.color }}>{selectedOrg.status}</span>)}
                                                    {renderInfoRow(zh ? '方案' : 'Plan', <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, background: planColors[selectedOrg.plan]?.bg, color: planColors[selectedOrg.plan]?.color }}>{getPlanLabel(selectedOrg.plan, zh)}</span>)}
                                                    {renderInfoRow(zh ? '建立' : 'Created', new Date(selectedOrg.created_at).toLocaleDateString('zh-TW'))}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        {zh ? '請選擇或新增組織' : 'Select or create an organization'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ COMPANIES ═══ */}
                {tab === 'companies' && (
                    <CompanyTab
                        zh={zh}
                        companies={companies}
                        onSave={saveCompany}
                        companyForm={companyForm}
                        setCompanyForm={setCompanyForm}
                    />
                )}

                {/* ═══ LOCATIONS ═══ */}
                {tab === 'locations' && (
                    <StoreTab
                        zh={zh}
                        stores={stores}
                        companies={companies}
                        onSaveStore={handleSaveStore}
                        onDeleteStore={handleDeleteStore}
                    />
                )}

                {/* ═══ DEPARTMENTS ═══ */}
                {tab === 'departments' && (
                    <DepartmentTab
                        zh={zh}
                        departments={departments}
                        companies={companies}
                        employees={employees}
                        lineGroups={lineGroups}
                        onCreateDepartment={handleCreateDepartment}
                        onSaveDepartment={handleSaveDepartment}
                        onDeleteDepartment={handleDeleteDepartment}
                    />
                )}

                {/* ═══ EMPLOYEES ═══ */}
                {tab === 'employees' && <Employees />}

                {/* ═══ LINE ═══ */}
                {tab === 'line' && <LineManagement />}

                {/* ═══ ORG CHART ═══ */}
                {tab === 'orgchart' && <OrgChartTab zh={zh} employees={employees} />}

                {/* ═══ TEMPLATES ═══ */}
                {tab === 'templates' && (
                    <TemplatesTab
                        zh={zh}
                        obTemplates={obTemplates}
                        onCreateTemplate={handleCreateTemplate}
                        onDeleteTemplate={handleDeleteTemplate}
                    />
                )}

                {/* ═══ ANNOUNCEMENTS ═══ */}
                {tab === 'announcements' && (
                    <AnnouncementsTab
                        zh={zh}
                        announcements={orgAnnouncements}
                        onCreateAnnouncement={handleCreateAnnouncement}
                        onDeleteAnnouncement={handleDeleteAnnouncement}
                    />
                )}

                {/* ═══ BILLING ═══ */}
                {tab === 'billing' && (
                    <BillingTab
                        zh={zh}
                        orgs={orgs}
                        selectedOrg={selectedOrg}
                        subscriptions={subscriptions}
                        payments={payments}
                        onSelectOrg={selectOrg}
                        onAddSubscription={handleAddSubscription}
                        onAddPayment={handleAddPayment}
                    />
                )}

            </div>
        </div>
    );
}
