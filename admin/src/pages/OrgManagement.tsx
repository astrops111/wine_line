import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/OrgContext';
import { getLocale } from '../lib/i18n';
import { Employees } from './Employees';
import { LineManagement } from './LineManagement';

type Tab = 'dashboard' | 'orgs' | 'companies' | 'locations' | 'departments' | 'employees' | 'line' | 'billing';

interface Org {
    id: string; name: string; slug: string; tax_id: string | null;
    contact_person: string | null; phone: string | null; address: string | null;
    logo_url: string | null; status: string; plan: string; settings: any; created_at: string;
}
interface Subscription {
    id: string; organization_id: string; plan: string; status: string;
    current_period_start: string | null; current_period_end: string | null;
    price_monthly: number; max_users: number; max_stores: number; notes: string | null; created_at: string;
}
interface Payment {
    id: string; organization_id: string; subscription_id: string | null;
    amount: number; currency: string; status: string; payment_method: string | null;
    invoice_number: string | null; paid_at: string | null; notes: string | null; created_at: string;
}
interface Company { id: string; organization_id: string; name: string; status: string; created_at: string; }
interface Store {
    id: string; name: string; store_code: string; address: string | null; phone: string | null;
    city: string | null; store_type: string; is_active: boolean; company_id: string | null;
    company?: { name: string } | null;
    gps_lat: number | null; gps_lng: number | null; gps_radius_m: number | null;
    clock_in_method: string | null;
}
interface Department {
    id: string; name: string; description: string | null; manager_user_id: string | null;
    line_group_ids: string[];
}
interface Employee {
    id: string; name: string; employee_type: string; store_id: string | null;
    company_id: string | null; department: string | null; department_id: string | null;
    position: string | null; status: string; is_manager: boolean;
    store?: { name: string } | null; company?: { name: string } | null;
    store_ids: string[]; store_names: string[];
}
interface LineGroup { id: string; group_name: string; }

export function OrgManagement() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = (searchParams.get('tab') as Tab) || 'dashboard';
    const [tab, setTab] = useState<Tab>(tabParam);

    // Sync URL → state when user navigates via browser back/forward
    useEffect(() => { setTab((searchParams.get('tab') as Tab) || 'dashboard'); }, [searchParams]);

    const switchTab = (t: Tab) => {
        setTab(t);
        setSearchParams({ tab: t }, { replace: true });
    };

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
    const [showCreateCompany, setShowCreateCompany] = useState(false);
    const [companyForm, setCompanyForm] = useState<Partial<Company>>({});
    const [editingCompany, setEditingCompany] = useState<string | null>(null);

    // Store edit state
    const [editingStore, setEditingStore] = useState<string | null>(null);
    const [editStore, setEditStore] = useState<any>({});

    // Department state
    const [showCreateDept, setShowCreateDept] = useState(false);
    const [deptForm, setDeptForm] = useState({ name: '', description: '', manager_user_id: '', line_group_ids: [] as string[] });
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [editDeptForm, setEditDeptForm] = useState({ name: '', description: '', manager_user_id: '', line_group_ids: [] as string[] });

    // Billing state
    const [showAddSub, setShowAddSub] = useState(false);
    const [subForm, setSubForm] = useState<Partial<Subscription>>({ plan: 'starter', status: 'active', price_monthly: 0, max_users: 50, max_stores: 5, currency: 'TWD' } as any);
    const [showAddPayment, setShowAddPayment] = useState(false);
    const [payForm, setPayForm] = useState<Partial<Payment>>({ status: 'paid', currency: 'TWD', amount: 0, payment_method: 'bank_transfer' } as any);
    const [editingSub, setEditingSub] = useState<Subscription | null>(null);

    useEffect(() => { loadOrgs(); }, []);
    useEffect(() => {
        if (orgId) {
            loadOrgDetails(orgId);
            loadDepartments();
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
        const { data } = await supabase.from('departments').select('id, name, description, manager_user_id').eq('organization_id', orgId).order('name');
        if (!data) return;
        const { data: lgData } = data.length > 0
            ? await supabase.from('department_line_groups').select('department_id, line_group_id').in('department_id', data.map(d => d.id))
            : { data: [] };
        const lgMap: Record<string, string[]> = {};
        (lgData || []).forEach((r: any) => { lgMap[r.department_id] = lgMap[r.department_id] || []; lgMap[r.department_id].push(r.line_group_id); });
        setDepartments(data.map((d: any) => ({ ...d, line_group_ids: lgMap[d.id] || [] })));
    }

    async function createDepartment() {
        if (!deptForm.name.trim()) return;
        const { data } = await supabase.from('departments').insert({
            organization_id: orgId, name: deptForm.name.trim(),
            description: deptForm.description.trim() || null, manager_user_id: deptForm.manager_user_id || null,
        }).select().single();
        if (data && deptForm.line_group_ids.length > 0) {
            await supabase.from('department_line_groups').insert(deptForm.line_group_ids.map(gid => ({ department_id: data.id, line_group_id: gid })));
        }
        setDeptForm({ name: '', description: '', manager_user_id: '', line_group_ids: [] });
        setShowCreateDept(false);
        await loadDepartments();
    }

    async function saveDepartment() {
        if (!editingDept) return;
        await supabase.from('departments').update({ name: editDeptForm.name, description: editDeptForm.description || null, manager_user_id: editDeptForm.manager_user_id || null }).eq('id', editingDept.id);
        await supabase.from('department_line_groups').delete().eq('department_id', editingDept.id);
        if (editDeptForm.line_group_ids.length > 0) {
            await supabase.from('department_line_groups').insert(editDeptForm.line_group_ids.map(gid => ({ department_id: editingDept.id, line_group_id: gid })));
        }
        setEditingDept(null);
        await loadDepartments();
    }

    async function deleteDepartment(id: string) {
        await supabase.from('departments').delete().eq('id', id);
        await loadDepartments();
    }

    async function addSubscription() {
        if (!selectedOrg) return;
        const { error } = await supabase.from('org_subscriptions').insert({
            organization_id: selectedOrg.id,
            plan: subForm.plan || 'starter',
            status: subForm.status || 'active',
            price_monthly: Number(subForm.price_monthly) || 0,
            max_users: Number(subForm.max_users) || 50,
            max_stores: Number(subForm.max_stores) || 5,
            current_period_start: subForm.current_period_start || null,
            current_period_end: subForm.current_period_end || null,
            notes: subForm.notes || null,
        });
        if (error) { alert(error.message); return; }
        setShowAddSub(false);
        setSubForm({ plan: 'starter', status: 'active', price_monthly: 0, max_users: 50, max_stores: 5 } as any);
        loadOrgDetails(selectedOrg.id);
    }

    async function saveSubscription() {
        if (!editingSub) return;
        await supabase.from('org_subscriptions').update({
            plan: subForm.plan, status: subForm.status,
            price_monthly: Number(subForm.price_monthly),
            max_users: Number(subForm.max_users),
            max_stores: Number(subForm.max_stores),
            current_period_start: subForm.current_period_start || null,
            current_period_end: subForm.current_period_end || null,
            notes: subForm.notes || null,
        }).eq('id', editingSub.id);
        setEditingSub(null);
        if (selectedOrg) loadOrgDetails(selectedOrg.id);
    }

    async function addPayment() {
        if (!selectedOrg) return;
        const { error } = await supabase.from('org_payments').insert({
            organization_id: selectedOrg.id,
            subscription_id: payForm.subscription_id || null,
            amount: Number(payForm.amount) || 0,
            currency: payForm.currency || 'TWD',
            status: payForm.status || 'paid',
            payment_method: payForm.payment_method || null,
            invoice_number: payForm.invoice_number || null,
            notes: payForm.notes || null,
            paid_at: payForm.paid_at || new Date().toISOString(),
        });
        if (error) { alert(error.message); return; }
        setShowAddPayment(false);
        setPayForm({ status: 'paid', currency: 'TWD', amount: 0, payment_method: 'bank_transfer' } as any);
        loadOrgDetails(selectedOrg.id);
    }

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

    async function saveCompany(id?: string) {
        const payload = { organization_id: selectedOrg?.id, name: companyForm.name || (zh ? '新公司' : 'New Company'), status: companyForm.status || 'active' };
        if (id) await supabase.from('companies').update(payload).eq('id', id);
        else await supabase.from('companies').insert(payload);
        setShowCreateCompany(false); setEditingCompany(null); setCompanyForm({});
        if (selectedOrg) loadOrgDetails(selectedOrg.id);
    }

    async function updateStoreCompany(storeId: string, companyId: string | null) {
        await supabase.from('stores').update({ company_id: companyId }).eq('id', storeId);
        if (selectedOrg) loadOrgDetails(selectedOrg.id);
    }

    async function saveStore() {
        if (!editingStore) return;
        const { error } = await supabase.from('stores').update({
            company_id: editStore.company_id || null,
            gps_lat: editStore.gps_lat ? parseFloat(editStore.gps_lat) : null,
            gps_lng: editStore.gps_lng ? parseFloat(editStore.gps_lng) : null,
            gps_radius_m: editStore.gps_radius_m || 200,
            clock_in_method: editStore.clock_in_method || 'any',
        }).eq('id', editingStore);
        if (error) { alert(error.message); return; }
        setEditingStore(null);
        setEditStore({});
        if (selectedOrg) loadOrgDetails(selectedOrg.id);
    }

    const statusColors: Record<string, { bg: string; color: string }> = {
        active: { bg: '#22c55e20', color: '#22c55e' },
        suspended: { bg: '#f59e0b20', color: '#f59e0b' },
        archived: { bg: '#6b728020', color: '#6b7280' },
    };
    const planColors: Record<string, { bg: string; color: string; label: string }> = {
        free:       { bg: '#6b728020', color: '#6b7280', label: zh ? '免費版' : 'Free' },
        starter:    { bg: '#3b82f620', color: '#3b82f6', label: zh ? '入門版' : 'Starter' },
        pro:        { bg: '#8b5cf620', color: '#8b5cf6', label: zh ? '專業版' : 'Pro' },
        enterprise: { bg: '#f59e0b20', color: '#f59e0b', label: zh ? '企業版' : 'Enterprise' },
    };
    const payStatusColors: Record<string, { bg: string; color: string }> = {
        paid:     { bg: '#22c55e20', color: '#22c55e' },
        pending:  { bg: '#f59e0b20', color: '#f59e0b' },
        failed:   { bg: '#ef444420', color: '#ef4444' },
        refunded: { bg: '#6366f120', color: '#6366f1' },
    };

    const tabDefs: { key: Tab; icon: string; label: string }[] = [
        { key: 'dashboard',   icon: '📊', label: zh ? '總覽'   : 'Dashboard' },
        { key: 'orgs',        icon: '🏢', label: zh ? '組織'   : 'Org' },
        { key: 'companies',   icon: '🏛️', label: zh ? '公司'   : 'Company' },
        { key: 'locations',   icon: '📍', label: zh ? '門市'   : 'Locations' },
        { key: 'departments', icon: '🗂', label: zh ? '部門'   : 'Departments' },
        { key: 'employees',   icon: '👥', label: zh ? '員工'   : 'Employees' },
        { key: 'line',        icon: '💬', label: 'LINE' },
        { key: 'billing',     icon: '💳', label: zh ? '帳單'   : 'Billing' },
    ];

    if (loading) return (
        <div className="fade-in">
            <div className="page-header"><h2>🏢 {zh ? '組織管理' : 'Org Management'}</h2></div>
            <div className="page-body"><p className="loading-pulse">{zh ? '載入中...' : 'Loading...'}</p></div>
        </div>
    );

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
                                <div className="stat-value">{orgs.filter(o => o.status === 'active').length}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{orgs.length} {zh ? '總計' : 'total'}</div>
                            </div>
                            <div className="stat-card blue">
                                <div className="stat-label">{zh ? '公司' : 'Companies'}</div>
                                <div className="stat-value">{companies.length}</div>
                            </div>
                            <div className="stat-card purple">
                                <div className="stat-label">{zh ? '門市' : 'Locations'}</div>
                                <div className="stat-value">{stores.filter(s => s.is_active).length}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{stores.length} {zh ? '總計' : 'total'}</div>
                            </div>
                            <div className="stat-card orange">
                                <div className="stat-label">{zh ? '部門' : 'Departments'}</div>
                                <div className="stat-value">{departments.length}</div>
                            </div>
                            <div className="stat-card emerald">
                                <div className="stat-label">{zh ? '在職員工' : 'Active Staff'}</div>
                                <div className="stat-value">{employees.filter(e => e.status === 'active').length}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{employees.length} {zh ? '總計' : 'total'}</div>
                            </div>
                        </div>

                        {/* Org overview cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                            {orgs.map(org => {
                                const orgEmps = employees.filter(e => (e as any).organization_id === org.id);
                                const sub = subscriptions.find(s => s.organization_id === org.id && s.status === 'active');
                                return (
                                    <div key={org.id} className="card" style={{ cursor: 'pointer', borderColor: selectedOrg?.id === org.id ? 'var(--accent-primary)' : undefined }}
                                        onClick={() => { selectOrg(org); switchTab('orgs'); }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{org.name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{org.slug}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: statusColors[org.status]?.bg, color: statusColors[org.status]?.color }}>{org.status}</span>
                                                <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: planColors[org.plan]?.bg, color: planColors[org.plan]?.color }}>{planColors[org.plan]?.label}</span>
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
                                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{zh ? '組織列表' : 'Organizations'}</span>
                                    <button onClick={() => { setShowCreateOrg(true); setEditForm({}); }} className="btn btn-sm btn-primary">+ {zh ? '新增' : 'Add'}</button>
                                </div>
                                <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
                                    {orgs.map(org => (
                                        <div key={org.id} onClick={() => selectOrg(org)} style={{
                                            padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)',
                                            background: selectedOrg?.id === org.id ? 'var(--accent-primary-dim)' : undefined,
                                            borderLeft: `3px solid ${selectedOrg?.id === org.id ? 'var(--accent-primary)' : 'transparent'}`,
                                        }}>
                                            <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>{org.name}</div>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, background: statusColors[org.status]?.bg, color: statusColors[org.status]?.color }}>{org.status}</span>
                                                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, background: planColors[org.plan]?.bg, color: planColors[org.plan]?.color }}>{planColors[org.plan]?.label}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="card" style={{ padding: 0 }}>
                                {showCreateOrg ? (
                                    <>
                                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)' }}>
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
                                        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                                    {renderInfoRow(zh ? '方案' : 'Plan', <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, background: planColors[selectedOrg.plan]?.bg, color: planColors[selectedOrg.plan]?.color }}>{planColors[selectedOrg.plan]?.label}</span>)}
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
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>🏛️ {zh ? '公司管理' : 'Company Management'}</span>
                            <button className="btn btn-sm btn-primary" onClick={() => { setShowCreateCompany(!showCreateCompany); setCompanyForm({}); setEditingCompany(null); }}>
                                {showCreateCompany ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增' : 'Add'}`}
                            </button>
                        </div>
                        {showCreateCompany && (
                            <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '公司名稱' : 'Name'}</label>
                                        <input className="input-field" value={companyForm.name || ''} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                                        <select className="select" style={{ width: '100%' }} value={companyForm.status || 'active'} onChange={e => setCompanyForm({ ...companyForm, status: e.target.value })}>
                                            <option value="active">{zh ? '啟用' : 'Active'}</option>
                                            <option value="inactive">{zh ? '停用' : 'Inactive'}</option>
                                        </select>
                                    </div>
                                </div>
                                <button className="btn btn-primary btn-sm" style={{ marginTop: '10px' }} onClick={() => saveCompany(editingCompany || undefined)}>💾 {zh ? '儲存' : 'Save'}</button>
                            </div>
                        )}
                        <div style={{ padding: '12px 16px' }}>
                            {companies.length === 0
                                ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>{zh ? '尚無公司' : 'No companies yet'}</p>
                                : <table className="data-table">
                                    <thead><tr><th>{zh ? '名稱' : 'Name'}</th><th>{zh ? '狀態' : 'Status'}</th><th></th></tr></thead>
                                    <tbody>
                                        {companies.map(c => (
                                            <tr key={c.id}>
                                                <td style={{ fontWeight: 600 }}>{c.name}</td>
                                                <td><span className={`status-badge ${c.status === 'active' ? 'completed' : 'cancelled'}`}>{c.status === 'active' ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}</span></td>
                                                <td><button className="btn btn-sm btn-secondary" onClick={() => { setEditingCompany(c.id); setCompanyForm(c); setShowCreateCompany(true); }}>✏️</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            }
                        </div>
                    </div>
                )}

                {/* ═══ LOCATIONS ═══ */}
                {tab === 'locations' && (
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>📍 {zh ? '門市管理' : 'Locations'}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{stores.length} {zh ? '間' : 'total'}</span>
                        </div>
                        <div style={{ padding: '14px 16px' }}>
                            {stores.length === 0
                                ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>{zh ? '尚無門市' : 'No locations'}</p>
                                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '12px' }}>
                                    {stores.map(store => {
                                        const isEditingThis = editingStore === store.id;
                                        return (
                                            <div key={store.id} style={{ padding: '14px', borderRadius: '10px', background: 'var(--bg-primary)', border: `1px solid ${isEditingThis ? 'var(--accent-primary)' : 'var(--border-color)'}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{store.name}</div>
                                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{store.store_code}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                        <span className={`status-badge ${store.is_active ? 'completed' : 'cancelled'}`} style={{ fontSize: '10px' }}>
                                                            {store.is_active ? (zh ? '營業' : 'Active') : (zh ? '關閉' : 'Closed')}
                                                        </span>
                                                        {!isEditingThis
                                                            ? <button className="btn btn-sm btn-secondary" style={{ padding: '2px 7px' }} onClick={() => {
                                                                setEditingStore(store.id);
                                                                setEditStore({
                                                                    company_id: store.company_id || '',
                                                                    gps_lat: store.gps_lat || '',
                                                                    gps_lng: store.gps_lng || '',
                                                                    gps_radius_m: store.gps_radius_m || 200,
                                                                    clock_in_method: store.clock_in_method || 'any',
                                                                });
                                                            }}>✏️</button>
                                                            : <button className="btn btn-sm btn-secondary" style={{ padding: '2px 7px' }} onClick={() => { setEditingStore(null); setEditStore({}); }}>{zh ? '取消' : 'Cancel'}</button>
                                                        }
                                                    </div>
                                                </div>

                                                {isEditingThis ? (
                                                    <div>
                                                        <div style={{ marginBottom: '8px' }}>
                                                            <label className="detail-label">{zh ? '歸屬公司' : 'Company'}</label>
                                                            <select className="select" style={{ width: '100%', fontSize: '12px' }} value={editStore.company_id || ''} onChange={e => setEditStore({ ...editStore, company_id: e.target.value || null })}>
                                                                <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                            </select>
                                                        </div>

                                                        {/* GPS Clock-In Configuration */}
                                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                                                            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>
                                                                {zh ? 'GPS 打卡設定' : 'GPS Clock-In Config'}
                                                            </div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                                                <div>
                                                                    <label className="detail-label">{zh ? '緯度 (Lat)' : 'Latitude'}</label>
                                                                    <input
                                                                        className="input-field"
                                                                        type="number"
                                                                        step="0.000001"
                                                                        placeholder="25.033964"
                                                                        value={editStore.gps_lat || ''}
                                                                        onChange={e => setEditStore({ ...editStore, gps_lat: e.target.value })}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="detail-label">{zh ? '經度 (Lng)' : 'Longitude'}</label>
                                                                    <input
                                                                        className="input-field"
                                                                        type="number"
                                                                        step="0.000001"
                                                                        placeholder="121.564472"
                                                                        value={editStore.gps_lng || ''}
                                                                        onChange={e => setEditStore({ ...editStore, gps_lng: e.target.value })}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div style={{ marginTop: '10px' }}>
                                                                <label className="detail-label">{zh ? '允許半徑 (公尺)' : 'Allowed Radius (meters)'}</label>
                                                                <input
                                                                    className="input-field"
                                                                    type="number"
                                                                    min="50"
                                                                    max="2000"
                                                                    placeholder="200"
                                                                    value={editStore.gps_radius_m || 200}
                                                                    onChange={e => setEditStore({ ...editStore, gps_radius_m: parseInt(e.target.value) || 200 })}
                                                                />
                                                            </div>
                                                            <div style={{ marginTop: '10px' }}>
                                                                <label className="detail-label">{zh ? '打卡方式' : 'Clock-In Method'}</label>
                                                                <select
                                                                    className="input-field"
                                                                    value={editStore.clock_in_method || 'any'}
                                                                    onChange={e => setEditStore({ ...editStore, clock_in_method: e.target.value })}
                                                                >
                                                                    <option value="any">{zh ? '任意方式' : 'Any method'}</option>
                                                                    <option value="gps_required">{zh ? '必須 GPS' : 'GPS Required'}</option>
                                                                    <option value="gps_or_wifi">{zh ? 'GPS 或 WiFi' : 'GPS or WiFi'}</option>
                                                                </select>
                                                            </div>
                                                        </div>

                                                        <button className="btn btn-primary btn-sm" style={{ marginTop: '12px', width: '100%' }} onClick={saveStore}>
                                                            💾 {zh ? '儲存' : 'Save'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div style={{ marginBottom: '8px' }}>
                                                            <label className="detail-label">{zh ? '歸屬公司' : 'Company'}</label>
                                                            <select className="select" style={{ width: '100%', fontSize: '12px' }} value={store.company_id || ''} onChange={e => updateStoreCompany(store.id, e.target.value || null)}>
                                                                <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            {store.address && <span>📍 {store.address}</span>}
                                                            {store.city && <span>🏙 {store.city}</span>}
                                                            {store.phone && <span>📞 {store.phone}</span>}
                                                            <span>🏷 {store.store_type === 'headquarters' ? (zh ? '總部' : 'HQ') : (zh ? '零售' : 'Retail')}</span>
                                                            {(store.gps_lat || store.gps_lng) && (
                                                                <span style={{ color: 'var(--accent-primary)', fontSize: '11px' }}>
                                                                    🛰 {store.gps_lat}, {store.gps_lng} ({store.gps_radius_m || 200}m)
                                                                </span>
                                                            )}
                                                            {store.clock_in_method && store.clock_in_method !== 'any' && (
                                                                <span style={{ fontSize: '11px' }}>
                                                                    🔒 {store.clock_in_method === 'gps_required' ? (zh ? '必須 GPS' : 'GPS Required') : (zh ? 'GPS 或 WiFi' : 'GPS or WiFi')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            }
                        </div>
                    </div>
                )}

                {/* ═══ DEPARTMENTS ═══ */}
                {tab === 'departments' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                            <button className="btn btn-primary" onClick={() => setShowCreateDept(true)}>➕ {zh ? '新增部門' : 'New Department'}</button>
                        </div>

                        {showCreateDept && (
                            <div className="card" style={{ marginBottom: '16px' }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>➕ {zh ? '新增部門' : 'New Department'}</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '名稱' : 'Name'} *</label>
                                        <input className="input-field" value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} placeholder={zh ? '例如：銷售部' : 'e.g. Sales'} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '描述' : 'Description'}</label>
                                        <input className="input-field" value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '主管' : 'Manager'}</label>
                                        <select className="input-field" value={deptForm.manager_user_id} onChange={e => setDeptForm({ ...deptForm, manager_user_id: e.target.value })}>
                                            <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                            {employees.filter(e => e.is_manager).map(e => <option key={e.id} value={e.id}>{e.name} ★</option>)}
                                            {employees.filter(e => !e.is_manager).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ marginTop: '10px' }}>
                                    <label className="detail-label">💬 LINE {zh ? '群組' : 'Groups'}</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                                        {deptForm.line_group_ids.map(gid => {
                                            const g = lineGroups.find(lg => lg.id === gid);
                                            return <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '10px', padding: '2px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {g?.group_name}<button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }} onClick={() => setDeptForm({ ...deptForm, line_group_ids: deptForm.line_group_ids.filter(i => i !== gid) })}>✕</button>
                                            </span>;
                                        })}
                                    </div>
                                    <select className="input-field" style={{ width: 'auto' }} value="" onChange={e => { const v = e.target.value; if (v && !deptForm.line_group_ids.includes(v)) setDeptForm({ ...deptForm, line_group_ids: [...deptForm.line_group_ids, v] }); e.currentTarget.value = ''; }}>
                                        <option value="">➕ {zh ? '新增群組...' : 'Add group...'}</option>
                                        {lineGroups.filter(g => !deptForm.line_group_ids.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <button className="btn btn-primary" onClick={createDepartment}>{zh ? '儲存' : 'Save'}</button>
                                    <button className="btn btn-secondary" onClick={() => setShowCreateDept(false)}>{zh ? '取消' : 'Cancel'}</button>
                                </div>
                            </div>
                        )}

                        {departments.length === 0
                            ? <div className="card"><p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>{zh ? '尚未建立部門' : 'No departments yet'}</p></div>
                            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
                                {departments.map(dept => {
                                    const manager = employees.find(e => e.id === dept.manager_user_id);
                                    const members = employees.filter(e => e.department_id === dept.id);
                                    const isEditing = editingDept?.id === dept.id;
                                    return (
                                        <div key={dept.id} className="card">
                                            {isEditing ? (
                                                <div style={{ display: 'grid', gap: '10px' }}>
                                                    <div><label className="detail-label">{zh ? '名稱' : 'Name'}</label><input className="input-field" value={editDeptForm.name} onChange={e => setEditDeptForm({ ...editDeptForm, name: e.target.value })} /></div>
                                                    <div><label className="detail-label">{zh ? '描述' : 'Description'}</label><input className="input-field" value={editDeptForm.description} onChange={e => setEditDeptForm({ ...editDeptForm, description: e.target.value })} /></div>
                                                    <div>
                                                        <label className="detail-label">{zh ? '主管' : 'Manager'}</label>
                                                        <select className="input-field" value={editDeptForm.manager_user_id} onChange={e => setEditDeptForm({ ...editDeptForm, manager_user_id: e.target.value })}>
                                                            <option value="">{zh ? '— 未指定 —' : '— None —'}</option>
                                                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.is_manager ? ' ★' : ''}</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="detail-label">💬 LINE</label>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '5px' }}>
                                                            {editDeptForm.line_group_ids.map(gid => {
                                                                const g = lineGroups.find(lg => lg.id === gid);
                                                                return <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '10px', padding: '2px 7px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                    {g?.group_name}<button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }} onClick={() => setEditDeptForm({ ...editDeptForm, line_group_ids: editDeptForm.line_group_ids.filter(i => i !== gid) })}>✕</button>
                                                                </span>;
                                                            })}
                                                        </div>
                                                        <select className="input-field" style={{ width: 'auto' }} value="" onChange={e => { const v = e.target.value; if (v && !editDeptForm.line_group_ids.includes(v)) setEditDeptForm({ ...editDeptForm, line_group_ids: [...editDeptForm.line_group_ids, v] }); e.currentTarget.value = ''; }}>
                                                            <option value="">➕</option>
                                                            {lineGroups.filter(g => !editDeptForm.line_group_ids.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.group_name}</option>)}
                                                        </select>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button className="btn btn-primary btn-sm" onClick={saveDepartment}>{zh ? '儲存' : 'Save'}</button>
                                                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingDept(null)}>{zh ? '取消' : 'Cancel'}</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: '14px' }}>🗂 {dept.name}</div>
                                                            {dept.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{dept.description}</div>}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => { setEditingDept(dept); setEditDeptForm({ name: dept.name, description: dept.description || '', manager_user_id: dept.manager_user_id || '', line_group_ids: dept.line_group_ids }); }}>✏️</button>
                                                            <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => deleteDepartment(dept.id)}>🗑</button>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '52px' }}>{zh ? '主管' : 'Manager'}</span>
                                                            {manager ? <span>👤 {manager.name}{manager.is_manager ? ' ★' : ''}</span> : <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>—</span>}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '52px' }}>{zh ? '成員' : 'Members'}</span>
                                                            <span style={{ background: 'var(--accent-primary-dim)', color: 'var(--accent-primary)', borderRadius: '8px', padding: '1px 8px', fontSize: '12px', fontWeight: 600 }}>{members.length}</span>
                                                        </div>
                                                        {dept.line_group_ids.length > 0 && (
                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', width: '52px', paddingTop: '2px' }}>LINE</span>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                    {dept.line_group_ids.map(gid => {
                                                                        const g = lineGroups.find(lg => lg.id === gid);
                                                                        return <span key={gid} style={{ background: 'var(--accent-blue-dim)', color: 'var(--accent-blue)', borderRadius: '8px', padding: '1px 7px', fontSize: '11px' }}>💬 {g?.group_name || gid}</span>;
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {members.length > 0 && (
                                                            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '7px', marginTop: '2px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                {members.map(e => (
                                                                    <span key={e.id} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2px 8px', fontSize: '11px' }}>
                                                                        {e.name}{e.is_manager ? ' ★' : ''}
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
                        }
                    </div>
                )}

                {/* ═══ EMPLOYEES ═══ */}
                {tab === 'employees' && <Employees />}

                {/* ═══ LINE ═══ */}
                {tab === 'line' && <LineManagement />}

                {/* ═══ BILLING ═══ */}
                {tab === 'billing' && (
                    <div>
                        {/* Org selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                {zh ? '選擇組織：' : 'Organization:'}
                            </label>
                            <select className="select" style={{ minWidth: '220px' }}
                                value={selectedOrg?.id || ''}
                                onChange={e => { const o = orgs.find(x => x.id === e.target.value); if (o) selectOrg(o); }}>
                                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                            {selectedOrg && (
                                <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '5px', fontWeight: 600, background: planColors[selectedOrg.plan]?.bg, color: planColors[selectedOrg.plan]?.color }}>
                                    {planColors[selectedOrg.plan]?.label}
                                </span>
                            )}
                        </div>

                        {selectedOrg && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                                {/* ── Subscriptions ── */}
                                <div className="card" style={{ padding: 0 }}>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600, fontSize: '13px' }}>📋 {zh ? '訂閱方案' : 'Subscriptions'}</span>
                                        <button className="btn btn-sm btn-primary" onClick={() => { setShowAddSub(s => !s); setEditingSub(null); setSubForm({ plan: 'starter', status: 'active', price_monthly: 0, max_users: 50, max_stores: 5 } as any); }}>
                                            {showAddSub ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增' : 'Add'}`}
                                        </button>
                                    </div>

                                    {showAddSub && (
                                        <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '方案' : 'Plan'}</label>
                                                <select className="select" style={{ width: '100%' }} value={subForm.plan || 'starter'} onChange={e => setSubForm(f => ({ ...f, plan: e.target.value }))}>
                                                    <option value="free">{zh ? '免費版' : 'Free'}</option>
                                                    <option value="starter">{zh ? '入門版' : 'Starter'}</option>
                                                    <option value="pro">{zh ? '專業版' : 'Pro'}</option>
                                                    <option value="enterprise">{zh ? '企業版' : 'Enterprise'}</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                                                <select className="select" style={{ width: '100%' }} value={subForm.status || 'active'} onChange={e => setSubForm(f => ({ ...f, status: e.target.value }))}>
                                                    <option value="active">{zh ? '啟用' : 'Active'}</option>
                                                    <option value="cancelled">{zh ? '取消' : 'Cancelled'}</option>
                                                    <option value="expired">{zh ? '已過期' : 'Expired'}</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '月費 (NT$)' : 'Monthly (NT$)'}</label>
                                                <input type="number" className="input-field" value={subForm.price_monthly || 0} onChange={e => setSubForm(f => ({ ...f, price_monthly: Number(e.target.value) }))} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '最大用戶數' : 'Max Users'}</label>
                                                <input type="number" className="input-field" value={subForm.max_users || 50} onChange={e => setSubForm(f => ({ ...f, max_users: Number(e.target.value) }))} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '最大門市數' : 'Max Stores'}</label>
                                                <input type="number" className="input-field" value={subForm.max_stores || 5} onChange={e => setSubForm(f => ({ ...f, max_stores: Number(e.target.value) }))} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '到期日' : 'Period End'}</label>
                                                <input type="date" className="input-field" value={subForm.current_period_end?.slice(0, 10) || ''} onChange={e => setSubForm(f => ({ ...f, current_period_end: e.target.value }))} />
                                            </div>
                                            <div style={{ gridColumn: '1/-1' }}>
                                                <label className="detail-label">{zh ? '備註' : 'Notes'}</label>
                                                <input className="input-field" value={subForm.notes || ''} onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))} />
                                            </div>
                                            <div style={{ gridColumn: '1/-1' }}>
                                                <button className="btn btn-primary btn-sm" onClick={editingSub ? saveSubscription : addSubscription}>
                                                    💾 {zh ? '儲存' : 'Save'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ padding: '12px 16px' }}>
                                        {subscriptions.length === 0
                                            ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0', fontSize: '13px' }}>{zh ? '尚無訂閱' : 'No subscriptions'}</p>
                                            : subscriptions.map(sub => (
                                                <div key={sub.id} style={{ padding: '12px', borderRadius: '8px', marginBottom: '8px', background: 'var(--bg-secondary)', border: `1px solid ${sub.status === 'active' ? 'var(--accent-primary)' : 'var(--border-color)'}` }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                                        <div>
                                                            <span style={{ fontWeight: 700, fontSize: '14px', padding: '2px 8px', borderRadius: '5px', background: planColors[sub.plan]?.bg, color: planColors[sub.plan]?.color }}>
                                                                {planColors[sub.plan]?.label}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, background: sub.status === 'active' ? '#22c55e20' : '#f59e0b20', color: sub.status === 'active' ? '#22c55e' : '#f59e0b' }}>
                                                                {sub.status}
                                                            </span>
                                                            <button className="btn btn-sm btn-secondary" style={{ padding: '2px 8px' }} onClick={() => { setEditingSub(sub); setSubForm({ ...sub }); setShowAddSub(true); }}>✏️</button>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                        <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{zh ? '月費' : 'Monthly'}</div><strong>NT${sub.price_monthly.toLocaleString()}</strong></div>
                                                        <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{zh ? '用戶上限' : 'Max Users'}</div><strong>{sub.max_users}</strong></div>
                                                        <div><div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{zh ? '門市上限' : 'Max Stores'}</div><strong>{sub.max_stores}</strong></div>
                                                    </div>
                                                    {sub.current_period_end && (
                                                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                            {zh ? '到期' : 'Expires'}: {new Date(sub.current_period_end).toLocaleDateString('zh-TW')}
                                                        </div>
                                                    )}
                                                    {sub.notes && <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{sub.notes}</div>}
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>

                                {/* ── Payments ── */}
                                <div className="card" style={{ padding: 0 }}>
                                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600, fontSize: '13px' }}>💰 {zh ? '付款紀錄' : 'Payment History'}</span>
                                        <button className="btn btn-sm btn-primary" onClick={() => { setShowAddPayment(p => !p); setPayForm({ status: 'paid', currency: 'TWD', amount: 0, payment_method: 'bank_transfer' } as any); }}>
                                            {showAddPayment ? (zh ? '取消' : 'Cancel') : `+ ${zh ? '新增' : 'Log'}`}
                                        </button>
                                    </div>

                                    {showAddPayment && (
                                        <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div>
                                                <label className="detail-label">{zh ? '金額' : 'Amount'}</label>
                                                <input type="number" className="input-field" value={payForm.amount || 0} onChange={e => setPayForm(f => ({ ...f, amount: Number(e.target.value) }))} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '幣別' : 'Currency'}</label>
                                                <select className="select" style={{ width: '100%' }} value={payForm.currency || 'TWD'} onChange={e => setPayForm(f => ({ ...f, currency: e.target.value }))}>
                                                    <option value="TWD">TWD</option>
                                                    <option value="USD">USD</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                                                <select className="select" style={{ width: '100%' }} value={payForm.status || 'paid'} onChange={e => setPayForm(f => ({ ...f, status: e.target.value }))}>
                                                    <option value="paid">{zh ? '已付' : 'Paid'}</option>
                                                    <option value="pending">{zh ? '待付' : 'Pending'}</option>
                                                    <option value="failed">{zh ? '失敗' : 'Failed'}</option>
                                                    <option value="refunded">{zh ? '退款' : 'Refunded'}</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '付款方式' : 'Method'}</label>
                                                <select className="select" style={{ width: '100%' }} value={payForm.payment_method || 'bank_transfer'} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                                                    <option value="bank_transfer">{zh ? '銀行轉帳' : 'Bank Transfer'}</option>
                                                    <option value="credit_card">{zh ? '信用卡' : 'Credit Card'}</option>
                                                    <option value="cash">{zh ? '現金' : 'Cash'}</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '發票號碼' : 'Invoice #'}</label>
                                                <input className="input-field" value={payForm.invoice_number || ''} onChange={e => setPayForm(f => ({ ...f, invoice_number: e.target.value }))} />
                                            </div>
                                            <div>
                                                <label className="detail-label">{zh ? '付款日期' : 'Paid At'}</label>
                                                <input type="date" className="input-field" value={payForm.paid_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)} onChange={e => setPayForm(f => ({ ...f, paid_at: e.target.value }))} />
                                            </div>
                                            <div style={{ gridColumn: '1/-1' }}>
                                                <label className="detail-label">{zh ? '備註' : 'Notes'}</label>
                                                <input className="input-field" value={payForm.notes || ''} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
                                            </div>
                                            <div style={{ gridColumn: '1/-1' }}>
                                                <button className="btn btn-primary btn-sm" onClick={addPayment}>💾 {zh ? '儲存' : 'Save'}</button>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ padding: '4px 0' }}>
                                        {payments.length === 0
                                            ? <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px', fontSize: '13px' }}>{zh ? '尚無付款紀錄' : 'No payments yet'}</p>
                                            : <table className="data-table" style={{ fontSize: '12px' }}>
                                                <thead><tr>
                                                    <th>{zh ? '日期' : 'Date'}</th>
                                                    <th>{zh ? '金額' : 'Amount'}</th>
                                                    <th>{zh ? '方式' : 'Method'}</th>
                                                    <th>{zh ? '狀態' : 'Status'}</th>
                                                    <th>{zh ? '發票' : 'Invoice'}</th>
                                                </tr></thead>
                                                <tbody>
                                                    {payments.map(p => (
                                                        <tr key={p.id}>
                                                            <td>{p.paid_at ? new Date(p.paid_at).toLocaleDateString('zh-TW') : '—'}</td>
                                                            <td style={{ fontWeight: 600 }}>{p.currency} {p.amount.toLocaleString()}</td>
                                                            <td style={{ color: 'var(--text-muted)' }}>{p.payment_method || '—'}</td>
                                                            <td><span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, background: payStatusColors[p.status]?.bg, color: payStatusColors[p.status]?.color }}>{p.status}</span></td>
                                                            <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{p.invoice_number || '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        }
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );

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
}
