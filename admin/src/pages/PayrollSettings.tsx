import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AccountingCode {
    id: string; org_id: string; code: string; name_zh: string; name_en: string;
    category: string; is_active: boolean; sort_order: number;
}

interface AttendanceBonusRule {
    id: string; org_id: string; store_id: string | null;
    late_deduction_per_minute: number; absent_deduction_per_day: number;
    early_leave_deduction: number; unexcused_absence_deduction: number;
    monthly_bonus_amount: number; require_zero_late: boolean;
    require_zero_absent: boolean; require_zero_early_leave: boolean;
    late_tolerance_count: number; include_part_time: boolean;
}

interface PayGroup {
    id: string; org_id: string; group_name: string; pay_day: number;
    pay_frequency: string; bank_account: string; description: string;
    is_default: boolean; is_active: boolean; member_count?: number;
}

interface PayGroupMember {
    pay_group_id: string; user_id: string;
}

interface SimpleEmployee {
    id: string; name: string; store_id: string | null;
}

// ─── Default accounting codes ────────────────────────────────────────────────

const DEFAULT_CODES: Omit<AccountingCode, 'id' | 'org_id'>[] = [
    { code: '6110', name_zh: '薪資支出', name_en: 'Salary Expense', category: 'salary', is_active: true, sort_order: 1 },
    { code: '6120', name_zh: '加班費', name_en: 'Overtime Pay', category: 'salary', is_active: true, sort_order: 2 },
    { code: '6130', name_zh: '獎金', name_en: 'Bonus', category: 'salary', is_active: true, sort_order: 3 },
    { code: '6140', name_zh: '津貼', name_en: 'Allowance', category: 'allowance', is_active: true, sort_order: 4 },
    { code: '6210', name_zh: '勞保費', name_en: 'Labor Insurance', category: 'insurance', is_active: true, sort_order: 5 },
    { code: '6220', name_zh: '健保費', name_en: 'Health Insurance', category: 'insurance', is_active: true, sort_order: 6 },
    { code: '6230', name_zh: '勞退提繳', name_en: 'Pension Contribution', category: 'insurance', is_active: true, sort_order: 7 },
    { code: '6310', name_zh: '所得稅', name_en: 'Income Tax', category: 'tax', is_active: true, sort_order: 8 },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export function PayrollSettings() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();

    const [tab, setTab] = useState<'codes' | 'attendance' | 'paygroups'>('codes');

    // ── Tab 1: Accounting Codes ──────────────────────────────────────────────
    const [codes, setCodes] = useState<AccountingCode[]>([]);
    const [codesLoading, setCodesLoading] = useState(true);
    const [codeFilter, setCodeFilter] = useState('all');
    const [showCodeForm, setShowCodeForm] = useState(false);
    const [editCodeId, setEditCodeId] = useState<string | null>(null);
    const [codeForm, setCodeForm] = useState({ code: '', name_zh: '', name_en: '', category: 'salary', sort_order: '0' });

    // ── Tab 2: Attendance Bonus Rules ────────────────────────────────────────
    const [rules, setRules] = useState<AttendanceBonusRule | null>(null);
    const [rulesLoading, setRulesLoading] = useState(true);
    const [rulesSaving, setRulesSaving] = useState(false);
    const [rulesForm, setRulesForm] = useState({
        late_deduction_per_minute: '0', absent_deduction_per_day: '0',
        early_leave_deduction: '0', unexcused_absence_deduction: '0',
        monthly_bonus_amount: '1000', require_zero_late: true,
        require_zero_absent: true, require_zero_early_leave: true,
        late_tolerance_count: '0', include_part_time: false,
    });

    // ── Tab 3: Pay Groups ────────────────────────────────────────────────────
    const [payGroups, setPayGroups] = useState<PayGroup[]>([]);
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [editGroupId, setEditGroupId] = useState<string | null>(null);
    const [groupForm, setGroupForm] = useState({ group_name: '', pay_day: '5', pay_frequency: 'monthly', bank_account: '', description: '', is_default: false });
    const [employees, setEmployees] = useState<SimpleEmployee[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [groupMembers, setGroupMembers] = useState<PayGroupMember[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);

    // ─── Data Loading ────────────────────────────────────────────────────────

    useEffect(() => {
        if (!orgId) return;
        if (tab === 'codes') loadCodes();
        if (tab === 'attendance') loadRules();
        if (tab === 'paygroups') { loadPayGroups(); loadEmployees(); }
    }, [tab, orgId]);

    // ── Accounting Codes ─────────────────────────────────────────────────────

    async function loadCodes() {
        setCodesLoading(true);
        const { data } = await supabase.from('accounting_codes')
            .select('*').eq('org_id', orgId).order('sort_order');
        setCodes(data || []);
        setCodesLoading(false);
    }

    async function seedDefaults() {
        const payload = DEFAULT_CODES.map(c => ({ ...c, org_id: orgId }));
        await supabase.from('accounting_codes').insert(payload);
        await loadCodes();
    }

    async function saveCode() {
        if (!codeForm.code || !codeForm.name_zh) return;
        const payload = {
            org_id: orgId, code: codeForm.code, name_zh: codeForm.name_zh,
            name_en: codeForm.name_en || null, category: codeForm.category,
            is_active: true, sort_order: Number(codeForm.sort_order) || 0,
        };
        if (editCodeId) {
            await supabase.from('accounting_codes').update(payload).eq('id', editCodeId);
        } else {
            await supabase.from('accounting_codes').insert(payload);
        }
        resetCodeForm();
        await loadCodes();
    }

    async function deleteCode(id: string) {
        if (!confirm(zh ? '確定刪除此會計科目？' : 'Delete this accounting code?')) return;
        await supabase.from('accounting_codes').delete().eq('id', id);
        await loadCodes();
    }

    async function toggleCodeActive(c: AccountingCode) {
        await supabase.from('accounting_codes').update({ is_active: !c.is_active }).eq('id', c.id);
        await loadCodes();
    }

    function startEditCode(c: AccountingCode) {
        setEditCodeId(c.id);
        setCodeForm({ code: c.code, name_zh: c.name_zh, name_en: c.name_en || '', category: c.category, sort_order: String(c.sort_order) });
        setShowCodeForm(true);
    }

    function resetCodeForm() {
        setShowCodeForm(false);
        setEditCodeId(null);
        setCodeForm({ code: '', name_zh: '', name_en: '', category: 'salary', sort_order: '0' });
    }

    // ── Attendance Bonus Rules ───────────────────────────────────────────────

    async function loadRules() {
        setRulesLoading(true);
        const { data } = await supabase.from('attendance_bonus_rules')
            .select('*').eq('org_id', orgId).is('store_id', null).maybeSingle();
        if (data) {
            setRules(data);
            setRulesForm({
                late_deduction_per_minute: String(data.late_deduction_per_minute ?? 0),
                absent_deduction_per_day: String(data.absent_deduction_per_day ?? 0),
                early_leave_deduction: String(data.early_leave_deduction ?? 0),
                unexcused_absence_deduction: String(data.unexcused_absence_deduction ?? 0),
                monthly_bonus_amount: String(data.monthly_bonus_amount ?? 1000),
                require_zero_late: data.require_zero_late ?? true,
                require_zero_absent: data.require_zero_absent ?? true,
                require_zero_early_leave: data.require_zero_early_leave ?? true,
                late_tolerance_count: String(data.late_tolerance_count ?? 0),
                include_part_time: data.include_part_time ?? false,
            });
        }
        setRulesLoading(false);
    }

    async function saveRules() {
        setRulesSaving(true);
        const payload = {
            org_id: orgId, store_id: null,
            late_deduction_per_minute: Number(rulesForm.late_deduction_per_minute) || 0,
            absent_deduction_per_day: Number(rulesForm.absent_deduction_per_day) || 0,
            early_leave_deduction: Number(rulesForm.early_leave_deduction) || 0,
            unexcused_absence_deduction: Number(rulesForm.unexcused_absence_deduction) || 0,
            monthly_bonus_amount: Number(rulesForm.monthly_bonus_amount) || 0,
            require_zero_late: rulesForm.require_zero_late,
            require_zero_absent: rulesForm.require_zero_absent,
            require_zero_early_leave: rulesForm.require_zero_early_leave,
            late_tolerance_count: Number(rulesForm.late_tolerance_count) || 0,
            include_part_time: rulesForm.include_part_time,
        };
        if (rules?.id) {
            await supabase.from('attendance_bonus_rules').update(payload).eq('id', rules.id);
        } else {
            await supabase.from('attendance_bonus_rules').insert(payload);
        }
        setRulesSaving(false);
        await loadRules();
    }

    // ── Pay Groups ───────────────────────────────────────────────────────────

    async function loadPayGroups() {
        setGroupsLoading(true);
        const { data } = await supabase.from('pay_groups')
            .select('*').eq('org_id', orgId).order('is_default', { ascending: false });
        // Load member counts
        if (data && data.length > 0) {
            const ids = data.map(g => g.id);
            const { data: members } = await supabase.from('pay_group_members')
                .select('pay_group_id, user_id').in('pay_group_id', ids);
            const countMap: Record<string, number> = {};
            (members || []).forEach((m: PayGroupMember) => {
                countMap[m.pay_group_id] = (countMap[m.pay_group_id] || 0) + 1;
            });
            data.forEach(g => { g.member_count = countMap[g.id] || 0; });
        }
        setPayGroups(data || []);
        setGroupsLoading(false);
    }

    async function loadEmployees() {
        const { data } = await supabase.from('users')
            .select('id, name, store_id').eq('organization_id', orgId).eq('is_active', true).order('name');
        setEmployees(data || []);
    }

    async function saveGroup() {
        if (!groupForm.group_name) return;
        const payload = {
            org_id: orgId, group_name: groupForm.group_name,
            pay_day: Number(groupForm.pay_day) || 5,
            pay_frequency: groupForm.pay_frequency,
            bank_account: groupForm.bank_account || null,
            description: groupForm.description || null,
            is_default: groupForm.is_default, is_active: true,
        };
        if (editGroupId) {
            await supabase.from('pay_groups').update(payload).eq('id', editGroupId);
        } else {
            await supabase.from('pay_groups').insert(payload);
        }
        resetGroupForm();
        await loadPayGroups();
    }

    async function deleteGroup(id: string) {
        if (!confirm(zh ? '確定刪除此發薪群組？' : 'Delete this pay group?')) return;
        await supabase.from('pay_group_members').delete().eq('pay_group_id', id);
        await supabase.from('pay_groups').delete().eq('id', id);
        if (selectedGroupId === id) { setSelectedGroupId(null); setGroupMembers([]); }
        await loadPayGroups();
    }

    async function toggleGroupActive(g: PayGroup) {
        await supabase.from('pay_groups').update({ is_active: !g.is_active }).eq('id', g.id);
        await loadPayGroups();
    }

    function startEditGroup(g: PayGroup) {
        setEditGroupId(g.id);
        setGroupForm({
            group_name: g.group_name, pay_day: String(g.pay_day),
            pay_frequency: g.pay_frequency, bank_account: g.bank_account || '',
            description: g.description || '', is_default: g.is_default,
        });
        setShowGroupForm(true);
    }

    function resetGroupForm() {
        setShowGroupForm(false);
        setEditGroupId(null);
        setGroupForm({ group_name: '', pay_day: '5', pay_frequency: 'monthly', bank_account: '', description: '', is_default: false });
    }

    async function selectGroup(id: string) {
        setSelectedGroupId(id);
        setMembersLoading(true);
        const { data } = await supabase.from('pay_group_members')
            .select('pay_group_id, user_id').eq('pay_group_id', id);
        setGroupMembers(data || []);
        setMembersLoading(false);
    }

    async function addMember(userId: string) {
        if (!selectedGroupId) return;
        await supabase.from('pay_group_members').insert({ pay_group_id: selectedGroupId, user_id: userId });
        await selectGroup(selectedGroupId);
        await loadPayGroups();
    }

    async function removeMember(userId: string) {
        if (!selectedGroupId) return;
        await supabase.from('pay_group_members').delete().eq('pay_group_id', selectedGroupId).eq('user_id', userId);
        await selectGroup(selectedGroupId);
        await loadPayGroups();
    }

    // ─── Category helpers ────────────────────────────────────────────────────

    const categoryLabel: Record<string, string> = {
        salary: zh ? '薪資' : 'Salary',
        allowance: zh ? '津貼' : 'Allowance',
        deduction: zh ? '扣款' : 'Deduction',
        tax: zh ? '稅務' : 'Tax',
        insurance: zh ? '保險' : 'Insurance',
    };

    const categoryIcon: Record<string, string> = {
        salary: '💰', allowance: '🎁', deduction: '📉', tax: '🏛', insurance: '🛡',
    };

    const freqLabel: Record<string, string> = {
        monthly: zh ? '月薪' : 'Monthly',
        'semi-monthly': zh ? '半月薪' : 'Semi-Monthly',
        weekly: zh ? '週薪' : 'Weekly',
    };

    const filteredCodes = codeFilter === 'all' ? codes : codes.filter(c => c.category === codeFilter);
    const allCategories = [...new Set(codes.map(c => c.category))];
    const memberUserIds = new Set(groupMembers.map(m => m.user_id));

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>⚙️ {zh ? '薪資設定' : 'Payroll Settings'}</h1>
                <p className="page-subtitle">{zh ? '會計科目、出勤獎金規則、發薪群組設定' : 'Accounting codes, attendance bonus rules, pay group setup'}</p>
            </div>

            {/* Tab bar */}
            <div className="tab-bar" style={{ marginBottom: '20px' }}>
                <button className={`tab-item ${tab === 'codes' ? 'active' : ''}`} onClick={() => setTab('codes')}>
                    📋 {zh ? '會計科目編號管理' : 'Accounting Codes'}
                </button>
                <button className={`tab-item ${tab === 'attendance' ? 'active' : ''}`} onClick={() => setTab('attendance')}>
                    🎯 {zh ? '出勤異常及全勤獎金規則設定' : 'Attendance Bonus Rules'}
                </button>
                <button className={`tab-item ${tab === 'paygroups' ? 'active' : ''}`} onClick={() => setTab('paygroups')}>
                    👥 {zh ? '發薪群組設定' : 'Pay Group Setup'}
                </button>
            </div>

            {/* ═══════════════════════ Tab 1: Accounting Codes ═══════════════════════ */}
            {tab === 'codes' && (
                <div>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => { resetCodeForm(); setShowCodeForm(true); }}>
                            ➕ {zh ? '新增科目' : 'Add Code'}
                        </button>
                        {codes.length === 0 && !codesLoading && (
                            <button className="btn btn-secondary" onClick={seedDefaults}>
                                📥 {zh ? '匯入預設科目' : 'Import Defaults'}
                            </button>
                        )}
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            📊 {codes.length} {zh ? '個科目' : 'codes'}
                        </span>
                    </div>

                    {/* Category filter */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <button className={`btn btn-sm ${codeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCodeFilter('all')}>
                            {zh ? '全部' : 'All'} ({codes.length})
                        </button>
                        {allCategories.map(cat => (
                            <button key={cat} className={`btn btn-sm ${codeFilter === cat ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCodeFilter(cat)}>
                                {categoryIcon[cat] || '📌'} {categoryLabel[cat] || cat} ({codes.filter(c => c.category === cat).length})
                            </button>
                        ))}
                    </div>

                    {/* Add/Edit form */}
                    {showCodeForm && (
                        <div className="card" style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                                {editCodeId ? (zh ? '✏️ 編輯科目' : '✏️ Edit Code') : (zh ? '➕ 新增科目' : '➕ Add Code')}
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                <div>
                                    <label className="detail-label">{zh ? '科目編號' : 'Code'} *</label>
                                    <input className="input-field" value={codeForm.code} onChange={e => setCodeForm({ ...codeForm, code: e.target.value })} placeholder="6110" />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '中文名稱' : 'Chinese Name'} *</label>
                                    <input className="input-field" value={codeForm.name_zh} onChange={e => setCodeForm({ ...codeForm, name_zh: e.target.value })} placeholder={zh ? '薪資支出' : 'Salary Expense'} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '英文名稱' : 'English Name'}</label>
                                    <input className="input-field" value={codeForm.name_en} onChange={e => setCodeForm({ ...codeForm, name_en: e.target.value })} placeholder="Salary Expense" />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '分類' : 'Category'}</label>
                                    <select className="input-field" value={codeForm.category} onChange={e => setCodeForm({ ...codeForm, category: e.target.value })}>
                                        <option value="salary">{categoryLabel.salary}</option>
                                        <option value="allowance">{categoryLabel.allowance}</option>
                                        <option value="deduction">{categoryLabel.deduction}</option>
                                        <option value="tax">{categoryLabel.tax}</option>
                                        <option value="insurance">{categoryLabel.insurance}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '排序' : 'Sort Order'}</label>
                                    <input className="input-field" type="number" value={codeForm.sort_order} onChange={e => setCodeForm({ ...codeForm, sort_order: e.target.value })} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                <button className="btn btn-primary" onClick={saveCode}>{zh ? '儲存' : 'Save'}</button>
                                <button className="btn btn-secondary" onClick={resetCodeForm}>{zh ? '取消' : 'Cancel'}</button>
                            </div>
                        </div>
                    )}

                    {/* Codes table */}
                    {codesLoading ? (
                        <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                    ) : filteredCodes.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            {zh ? '尚無會計科目。點擊「匯入預設科目」快速建立。' : 'No accounting codes. Click "Import Defaults" to get started.'}
                        </div>
                    ) : (
                        <div className="card" style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 12px' }}>{zh ? '編號' : 'Code'}</th>
                                        <th style={{ padding: '10px 12px' }}>{zh ? '名稱' : 'Name'}</th>
                                        <th style={{ padding: '10px 12px' }}>{zh ? '分類' : 'Category'}</th>
                                        <th style={{ padding: '10px 12px' }}>{zh ? '排序' : 'Sort'}</th>
                                        <th style={{ padding: '10px 12px' }}>{zh ? '狀態' : 'Status'}</th>
                                        <th style={{ padding: '10px 12px' }}>{zh ? '操作' : 'Actions'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCodes.map(c => (
                                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: c.is_active ? 1 : 0.5 }}>
                                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{c.code}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                {zh ? c.name_zh : (c.name_en || c.name_zh)}
                                                {c.name_en && zh && <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '6px' }}>{c.name_en}</span>}
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '10px', background: 'var(--bg-secondary)' }}>
                                                    {categoryIcon[c.category] || '📌'} {categoryLabel[c.category] || c.category}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{c.sort_order}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <span style={{ color: c.is_active ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                                                    {c.is_active ? '✅' : '⏸️'} {c.is_active ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => startEditCode(c)}>✏️</button>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => toggleCodeActive(c)}>
                                                        {c.is_active ? '⏸️' : '▶️'}
                                                    </button>
                                                    <button className="btn btn-sm btn-secondary" onClick={() => deleteCode(c.id)} style={{ color: 'var(--accent-danger)' }}>🗑</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════ Tab 2: Attendance Bonus Rules ═══════════════════ */}
            {tab === 'attendance' && (
                <div>
                    {rulesLoading ? (
                        <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '20px' }}>
                            {/* Attendance anomaly deductions */}
                            <div className="card">
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
                                    ⚠️ {zh ? '出勤異常扣款設定' : 'Attendance Anomaly Deductions'}
                                </h3>
                                <div style={{ display: 'grid', gap: '14px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '遲到扣款（每分鐘 NT$）' : 'Late Deduction (NT$/min)'}</label>
                                        <input className="input-field" type="number" min="0" value={rulesForm.late_deduction_per_minute}
                                            onChange={e => setRulesForm({ ...rulesForm, late_deduction_per_minute: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '缺勤扣款（每日 NT$）' : 'Absent Deduction (NT$/day)'}</label>
                                        <input className="input-field" type="number" min="0" value={rulesForm.absent_deduction_per_day}
                                            onChange={e => setRulesForm({ ...rulesForm, absent_deduction_per_day: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '早退扣款（每次 NT$）' : 'Early Leave Deduction (NT$/incident)'}</label>
                                        <input className="input-field" type="number" min="0" value={rulesForm.early_leave_deduction}
                                            onChange={e => setRulesForm({ ...rulesForm, early_leave_deduction: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '無故缺勤扣款（NT$）' : 'Unexcused Absence Deduction (NT$)'}</label>
                                        <input className="input-field" type="number" min="0" value={rulesForm.unexcused_absence_deduction}
                                            onChange={e => setRulesForm({ ...rulesForm, unexcused_absence_deduction: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Perfect attendance bonus */}
                            <div className="card">
                                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>
                                    🏆 {zh ? '全勤獎金設定' : 'Perfect Attendance Bonus'}
                                </h3>
                                <div style={{ display: 'grid', gap: '14px' }}>
                                    <div>
                                        <label className="detail-label">{zh ? '每月全勤獎金（NT$）' : 'Monthly Bonus Amount (NT$)'}</label>
                                        <input className="input-field" type="number" min="0" value={rulesForm.monthly_bonus_amount}
                                            onChange={e => setRulesForm({ ...rulesForm, monthly_bonus_amount: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="detail-label">{zh ? '遲到容許次數（每月）' : 'Late Tolerance Count (per month)'}</label>
                                        <input className="input-field" type="number" min="0" value={rulesForm.late_tolerance_count}
                                            onChange={e => setRulesForm({ ...rulesForm, late_tolerance_count: e.target.value })} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={rulesForm.require_zero_late}
                                                onChange={e => setRulesForm({ ...rulesForm, require_zero_late: e.target.checked })} />
                                            {zh ? '要求零遲到' : 'Require zero late'}
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={rulesForm.require_zero_absent}
                                                onChange={e => setRulesForm({ ...rulesForm, require_zero_absent: e.target.checked })} />
                                            {zh ? '要求零缺勤' : 'Require zero absent'}
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={rulesForm.require_zero_early_leave}
                                                onChange={e => setRulesForm({ ...rulesForm, require_zero_early_leave: e.target.checked })} />
                                            {zh ? '要求零早退' : 'Require zero early leave'}
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={rulesForm.include_part_time}
                                                onChange={e => setRulesForm({ ...rulesForm, include_part_time: e.target.checked })} />
                                            {zh ? '包含兼職人員' : 'Include part-time employees'}
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {!rulesLoading && (
                        <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                            <button className="btn btn-primary" onClick={saveRules} disabled={rulesSaving}>
                                {rulesSaving ? (zh ? '儲存中…' : 'Saving…') : (zh ? '💾 儲存設定' : '💾 Save Settings')}
                            </button>
                            {!rules && (
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                                    {zh ? '尚未設定規則，儲存後將自動建立。' : 'No rules configured yet. Saving will create them.'}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════ Tab 3: Pay Groups ═══════════════════════════ */}
            {tab === 'paygroups' && (
                <div>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-primary" onClick={() => { resetGroupForm(); setShowGroupForm(true); }}>
                            ➕ {zh ? '新增群組' : 'Add Group'}
                        </button>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            📊 {payGroups.length} {zh ? '個群組' : 'groups'} · {payGroups.reduce((s, g) => s + (g.member_count || 0), 0)} {zh ? '位成員' : 'members'}
                        </span>
                    </div>

                    {/* Add/Edit form */}
                    {showGroupForm && (
                        <div className="card" style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                                {editGroupId ? (zh ? '✏️ 編輯群組' : '✏️ Edit Group') : (zh ? '➕ 新增群組' : '➕ Add Group')}
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                <div>
                                    <label className="detail-label">{zh ? '群組名稱' : 'Group Name'} *</label>
                                    <input className="input-field" value={groupForm.group_name}
                                        onChange={e => setGroupForm({ ...groupForm, group_name: e.target.value })} placeholder={zh ? '正職月薪組' : 'Full-time Monthly'} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '發薪日（1-31）' : 'Pay Day (1-31)'}</label>
                                    <input className="input-field" type="number" min="1" max="31" value={groupForm.pay_day}
                                        onChange={e => setGroupForm({ ...groupForm, pay_day: e.target.value })} />
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '發薪頻率' : 'Pay Frequency'}</label>
                                    <select className="input-field" value={groupForm.pay_frequency}
                                        onChange={e => setGroupForm({ ...groupForm, pay_frequency: e.target.value })}>
                                        <option value="monthly">{freqLabel.monthly}</option>
                                        <option value="semi-monthly">{freqLabel['semi-monthly']}</option>
                                        <option value="weekly">{freqLabel.weekly}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="detail-label">{zh ? '銀行帳號' : 'Bank Account'}</label>
                                    <input className="input-field" value={groupForm.bank_account}
                                        onChange={e => setGroupForm({ ...groupForm, bank_account: e.target.value })} placeholder="012-345678901234" />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label className="detail-label">{zh ? '說明' : 'Description'}</label>
                                    <input className="input-field" value={groupForm.description}
                                        onChange={e => setGroupForm({ ...groupForm, description: e.target.value })} placeholder={zh ? '選填說明…' : 'Optional description…'} />
                                </div>
                            </div>
                            <div style={{ marginTop: '12px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={groupForm.is_default}
                                        onChange={e => setGroupForm({ ...groupForm, is_default: e.target.checked })} />
                                    {zh ? '設為預設群組' : 'Set as default group'}
                                </label>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                <button className="btn btn-primary" onClick={saveGroup}>{zh ? '儲存' : 'Save'}</button>
                                <button className="btn btn-secondary" onClick={resetGroupForm}>{zh ? '取消' : 'Cancel'}</button>
                            </div>
                        </div>
                    )}

                    {/* Groups table + member panel */}
                    {groupsLoading ? (
                        <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                    ) : payGroups.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            {zh ? '尚無發薪群組。點擊「新增群組」建立第一個。' : 'No pay groups yet. Click "Add Group" to create one.'}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: selectedGroupId ? '1fr 1fr' : '1fr', gap: '20px' }}>
                            {/* Groups list */}
                            <div className="card" style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                                            <th style={{ padding: '10px 12px' }}>{zh ? '群組名稱' : 'Group'}</th>
                                            <th style={{ padding: '10px 12px' }}>{zh ? '發薪日' : 'Pay Day'}</th>
                                            <th style={{ padding: '10px 12px' }}>{zh ? '頻率' : 'Frequency'}</th>
                                            <th style={{ padding: '10px 12px' }}>{zh ? '成員' : 'Members'}</th>
                                            <th style={{ padding: '10px 12px' }}>{zh ? '狀態' : 'Status'}</th>
                                            <th style={{ padding: '10px 12px' }}>{zh ? '操作' : 'Actions'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payGroups.map(g => (
                                            <tr key={g.id} style={{
                                                borderBottom: '1px solid var(--border-color)',
                                                opacity: g.is_active ? 1 : 0.5,
                                                background: selectedGroupId === g.id ? 'var(--bg-secondary)' : undefined,
                                                cursor: 'pointer',
                                            }} onClick={() => selectGroup(g.id)}>
                                                <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                                                    {g.group_name}
                                                    {g.is_default && <span style={{ marginLeft: '6px', fontSize: '11px', padding: '1px 6px', borderRadius: '8px', background: 'var(--accent-primary)', color: '#fff' }}>{zh ? '預設' : 'Default'}</span>}
                                                </td>
                                                <td style={{ padding: '10px 12px' }}>{zh ? `每月 ${g.pay_day} 日` : `Day ${g.pay_day}`}</td>
                                                <td style={{ padding: '10px 12px' }}>{freqLabel[g.pay_frequency] || g.pay_frequency}</td>
                                                <td style={{ padding: '10px 12px' }}>👤 {g.member_count || 0}</td>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{ color: g.is_active ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                                                        {g.is_active ? '✅' : '⏸️'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => startEditGroup(g)}>✏️</button>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => toggleGroupActive(g)}>
                                                            {g.is_active ? '⏸️' : '▶️'}
                                                        </button>
                                                        <button className="btn btn-sm btn-secondary" onClick={() => deleteGroup(g.id)} style={{ color: 'var(--accent-danger)' }}>🗑</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Member assignment panel */}
                            {selectedGroupId && (
                                <div className="card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                        <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                                            👥 {zh ? '群組成員' : 'Group Members'}
                                            <span style={{ fontWeight: 400, fontSize: '13px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                                {payGroups.find(g => g.id === selectedGroupId)?.group_name}
                                            </span>
                                        </h3>
                                        <button className="btn btn-sm btn-secondary" onClick={() => { setSelectedGroupId(null); setGroupMembers([]); }}>✕</button>
                                    </div>

                                    {membersLoading ? (
                                        <p className="loading-pulse">{zh ? '載入中…' : 'Loading…'}</p>
                                    ) : (
                                        <>
                                            {/* Current members */}
                                            {groupMembers.length > 0 && (
                                                <div style={{ marginBottom: '16px' }}>
                                                    <label className="detail-label">{zh ? '已加入成員' : 'Current Members'} ({groupMembers.length})</label>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                                        {groupMembers.map(m => {
                                                            const emp = employees.find(e => e.id === m.user_id);
                                                            return (
                                                                <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: '6px', background: 'var(--bg-secondary)', fontSize: '13px' }}>
                                                                    <span>👤 {emp?.name || m.user_id}</span>
                                                                    <button className="btn btn-sm btn-secondary" onClick={() => removeMember(m.user_id)} style={{ color: 'var(--accent-danger)', padding: '2px 8px' }}>
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Available employees */}
                                            <label className="detail-label">{zh ? '可加入員工' : 'Available Employees'}</label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '250px', overflowY: 'auto' }}>
                                                {employees.filter(e => !memberUserIds.has(e.id)).length === 0 ? (
                                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
                                                        {zh ? '所有員工已加入此群組' : 'All employees are in this group'}
                                                    </span>
                                                ) : (
                                                    employees.filter(e => !memberUserIds.has(e.id)).map(e => (
                                                        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px' }}>
                                                            <span>👤 {e.name}</span>
                                                            <button className="btn btn-sm btn-primary" onClick={() => addMember(e.id)} style={{ padding: '2px 10px' }}>
                                                                ➕
                                                            </button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
