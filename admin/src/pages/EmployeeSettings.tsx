import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLocale } from '../lib/i18n';
import { useOrg } from '../lib/OrgContext';

type Tab = 'quick-setup' | 'number-rules' | 'leave-without-pay' | 'roster-query' | 'labor-roster' | 'labor-contracts';

interface Store { id: string; name: string; }
interface UserRecord {
    id: string; name: string; email: string | null; employee_type: string;
    store_id: string | null; position: string | null; status: string;
    employee_number: string | null; gender: string | null; birth_date: string | null;
    id_number: string | null; hire_date: string | null; department: string | null;
    insurance_date?: string | null;
    store?: { name: string } | null;
}
interface NumberRule {
    id: string; org_id: string; prefix: string; start_number: number;
    digits: number; separator: string; is_active: boolean;
}
interface LeaveRecord {
    id: string; org_id: string; user_id: string; start_date: string;
    end_date: string | null; reason: string | null; status: string;
    user?: { name: string } | null;
}
interface LaborContract {
    id: string; user_id: string; contract_type: string; start_date: string;
    end_date: string | null; terms: string | null; file_url: string | null;
    status: string;
    user?: { name: string } | null;
}

export function EmployeeSettings() {
    const zh = getLocale() === 'zh-TW';
    const { orgId } = useOrg();
    const [tab, setTab] = useState<Tab>('quick-setup');
    const [loading, setLoading] = useState(true);
    const [stores, setStores] = useState<Store[]>([]);
    const [employees, setEmployees] = useState<UserRecord[]>([]);

    useEffect(() => {
        Promise.all([
            supabase.from('stores').select('id, name').order('name').then(r => setStores(r.data || [])),
            supabase.from('users').select('id, name, email, employee_type, store_id, position, status, employee_number, gender, birth_date, id_number, hire_date, department, store:store_id(name)').eq('organization_id', orgId).order('name').then(r => setEmployees((r.data as any) || [])),
        ]).then(() => setLoading(false));
    }, [orgId]);

    const tabs: { key: Tab; label: string }[] = [
        { key: 'quick-setup', label: zh ? '帳號快速設定' : 'Quick Account Setup' },
        { key: 'number-rules', label: zh ? '員工編號規則設定' : 'Employee Number Rules' },
        { key: 'leave-without-pay', label: zh ? '留職停薪管理' : 'Leave Without Pay' },
        { key: 'roster-query', label: zh ? '名單查詢' : 'Employee Roster Query' },
        { key: 'labor-roster', label: zh ? '勞工名冊' : 'Labor Roster' },
        { key: 'labor-contracts', label: zh ? '勞動契約' : 'Labor Contracts' },
    ];

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>{zh ? '員工設定' : 'Employee Settings'}</h1>
                <p className="page-subtitle">{zh ? '帳號建立、編號規則、留停管理、名冊查詢與勞動契約' : 'Account setup, numbering rules, leave management, rosters and labor contracts'}</p>
            </div>

            <div className="tab-bar" style={{ marginBottom: '20px' }}>
                {tabs.map(t => (
                    <button key={t.key} className={`tab-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {loading ? <p className="loading-pulse">{zh ? '載入中...' : 'Loading...'}</p> : (
                <>
                    {tab === 'quick-setup' && <QuickSetupTab zh={zh} orgId={orgId} stores={stores} onRefresh={async () => {
                        const { data } = await supabase.from('users').select('id, name, email, employee_type, store_id, position, status, employee_number, gender, birth_date, id_number, hire_date, department, store:store_id(name)').eq('organization_id', orgId).order('created_at', { ascending: false });
                        setEmployees((data as any) || []);
                    }} />}
                    {tab === 'number-rules' && <NumberRulesTab zh={zh} orgId={orgId} />}
                    {tab === 'leave-without-pay' && <LeaveWithoutPayTab zh={zh} orgId={orgId} employees={employees} />}
                    {tab === 'roster-query' && <RosterQueryTab zh={zh} orgId={orgId} stores={stores} employees={employees} />}
                    {tab === 'labor-roster' && <LaborRosterTab zh={zh} orgId={orgId} employees={employees} />}
                    {tab === 'labor-contracts' && <LaborContractsTab zh={zh} orgId={orgId} employees={employees} />}
                </>
            )}
        </div>
    );
}

/* ─── Tab 1: Quick Account Setup ─── */
function QuickSetupTab({ zh, orgId, stores, onRefresh }: { zh: boolean; orgId: string; stores: Store[]; onRefresh: () => Promise<void> }) {
    const [form, setForm] = useState({ name: '', email: '', employee_type: 'full_time', store_id: '', position: '' });
    const [recentUsers, setRecentUsers] = useState<UserRecord[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { loadRecent(); }, [orgId]);

    const loadRecent = async () => {
        const { data } = await supabase.from('users')
            .select('id, name, email, employee_type, store_id, position, status, employee_number, store:store_id(name)')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(10);
        setRecentUsers((data as any) || []);
    };

    const createAccount = async () => {
        setError('');
        if (!form.name) { setError(zh ? '姓名為必填欄位' : 'Name is required'); return; }
        setSaving(true);
        // Auto-generate employee number
        const { data: maxNum } = await supabase.from('users').select('employee_number')
            .eq('organization_id', orgId).not('employee_number', 'is', null)
            .order('employee_number', { ascending: false }).limit(1);
        const lastNum = maxNum?.[0]?.employee_number?.replace(/[^0-9]/g, '') || '0';
        const nextNum = 'EMP-' + String(parseInt(lastNum, 10) + 1).padStart(3, '0');

        const { error: insertErr } = await supabase.from('users').insert({
            organization_id: orgId,
            name: form.name,
            email: form.email || null,
            employee_type: form.employee_type,
            store_id: form.store_id || null,
            position: form.position || null,
            employee_number: nextNum,
            status: 'active',
        });
        setSaving(false);
        if (insertErr) { setError(insertErr.message); return; }
        setForm({ name: '', email: '', employee_type: 'full_time', store_id: '', position: '' });
        await loadRecent();
        await onRefresh();
    };

    const typeLabel = (t: string) => {
        const map: Record<string, string> = {
            full_time: zh ? '全職' : 'Full-time',
            part_time: zh ? '兼職' : 'Part-time',
            contract: zh ? '約聘' : 'Contract',
        };
        return map[t] || t;
    };

    return (
        <div>
            <div className="card" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                    {zh ? '快速建立員工帳號' : 'Quick Create Employee Account'}
                </h3>
                {error && <div style={{ color: 'var(--accent-red)', fontSize: '13px', marginBottom: '10px' }}>{error}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                    <div>
                        <label className="detail-label">{zh ? '姓名' : 'Name'} *</label>
                        <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={zh ? '員工姓名' : 'Employee name'} />
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '電子郵件' : 'Email'}</label>
                        <input className="input-field" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '員工類型' : 'Employee Type'}</label>
                        <select className="input-field" value={form.employee_type} onChange={e => setForm({ ...form, employee_type: e.target.value })}>
                            <option value="full_time">{zh ? '全職' : 'Full-time'}</option>
                            <option value="part_time">{zh ? '兼職' : 'Part-time'}</option>
                            <option value="contract">{zh ? '約聘' : 'Contract'}</option>
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '門市' : 'Store'}</label>
                        <select className="input-field" value={form.store_id} onChange={e => setForm({ ...form, store_id: e.target.value })}>
                            <option value="">{zh ? '-- 選擇門市 --' : '-- Select Store --'}</option>
                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '職位' : 'Position'}</label>
                        <input className="input-field" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder={zh ? '例：店長' : 'e.g. Manager'} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button className="btn btn-primary" onClick={createAccount} disabled={saving}>
                        {saving ? (zh ? '建立中...' : 'Creating...') : (zh ? '建立帳號' : 'Create Account')}
                    </button>
                </div>
            </div>

            <div className="card">
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                    {zh ? '最近建立的帳號' : 'Recently Created Accounts'}
                </h3>
                {recentUsers.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{zh ? '暫無資料' : 'No data'}</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '編號' : 'No.'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '姓名' : 'Name'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '電子郵件' : 'Email'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '類型' : 'Type'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '門市' : 'Store'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '職位' : 'Position'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentUsers.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '8px 6px' }}>{u.employee_number || '-'}</td>
                                        <td style={{ padding: '8px 6px' }}>{u.name}</td>
                                        <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{u.email || '-'}</td>
                                        <td style={{ padding: '8px 6px' }}>{typeLabel(u.employee_type)}</td>
                                        <td style={{ padding: '8px 6px' }}>{(u.store as any)?.name || '-'}</td>
                                        <td style={{ padding: '8px 6px' }}>{u.position || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Tab 2: Employee Number Rules ─── */
function NumberRulesTab({ zh, orgId }: { zh: boolean; orgId: string }) {
    const [rules, setRules] = useState<NumberRule[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ prefix: 'EMP', start_number: '1', digits: '4', separator: '-' });

    useEffect(() => { loadRules(); }, [orgId]);

    const loadRules = async () => {
        const { data } = await supabase.from('employee_number_rules')
            .select('*').eq('org_id', orgId).order('created_at', { ascending: false });
        setRules(data || []);
    };

    const preview = () => {
        const num = String(Number(form.start_number) || 1).padStart(Number(form.digits) || 4, '0');
        return `${form.prefix}${form.separator}${num}`;
    };

    const saveRule = async () => {
        if (!form.prefix) return;
        const payload = {
            org_id: orgId,
            prefix: form.prefix,
            start_number: Number(form.start_number) || 1,
            digits: Number(form.digits) || 4,
            separator: form.separator,
            is_active: true,
        };
        if (editId) {
            await supabase.from('employee_number_rules').update(payload).eq('id', editId);
        } else {
            await supabase.from('employee_number_rules').insert(payload);
        }
        setForm({ prefix: 'EMP', start_number: '1', digits: '4', separator: '-' });
        setShowForm(false); setEditId(null);
        await loadRules();
    };

    const deleteRule = async (id: string) => {
        if (!confirm(zh ? '確定刪除此規則？' : 'Delete this rule?')) return;
        await supabase.from('employee_number_rules').delete().eq('id', id);
        await loadRules();
    };

    const startEdit = (r: NumberRule) => {
        setEditId(r.id);
        setForm({ prefix: r.prefix, start_number: String(r.start_number), digits: String(r.digits), separator: r.separator });
        setShowForm(true);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {zh ? `共 ${rules.length} 條規則` : `${rules.length} rule(s)`}
                </span>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm({ prefix: 'EMP', start_number: '1', digits: '4', separator: '-' }); }}>
                    {zh ? '新增規則' : 'Add Rule'}
                </button>
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                        {editId ? (zh ? '編輯規則' : 'Edit Rule') : (zh ? '新增編號規則' : 'Add Number Rule')}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{zh ? '前綴' : 'Prefix'} *</label>
                            <input className="input-field" value={form.prefix} onChange={e => setForm({ ...form, prefix: e.target.value })} placeholder="EMP" />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '分隔符' : 'Separator'}</label>
                            <input className="input-field" value={form.separator} onChange={e => setForm({ ...form, separator: e.target.value })} placeholder="-" />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '起始編號' : 'Start Number'}</label>
                            <input className="input-field" type="number" min="1" value={form.start_number} onChange={e => setForm({ ...form, start_number: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '位數' : 'Digits'}</label>
                            <input className="input-field" type="number" min="1" max="10" value={form.digits} onChange={e => setForm({ ...form, digits: e.target.value })} />
                        </div>
                    </div>
                    <div style={{ marginTop: '12px', padding: '10px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', fontSize: '14px' }}>
                        {zh ? '預覽：' : 'Preview: '}<strong>{preview()}</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                        <button className="btn btn-primary" onClick={saveRule}>{zh ? '儲存' : 'Save'}</button>
                        <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditId(null); }}>{zh ? '取消' : 'Cancel'}</button>
                    </div>
                </div>
            )}

            {rules.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '尚未設定編號規則' : 'No number rules configured'}
                </div>
            ) : (
                <div className="card">
                    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '前綴' : 'Prefix'}</th>
                                <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '分隔符' : 'Sep'}</th>
                                <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '起始' : 'Start'}</th>
                                <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '位數' : 'Digits'}</th>
                                <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '預覽' : 'Preview'}</th>
                                <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '狀態' : 'Status'}</th>
                                <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>{zh ? '操作' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '8px 6px' }}>{r.prefix}</td>
                                    <td style={{ padding: '8px 6px' }}>{r.separator || '-'}</td>
                                    <td style={{ padding: '8px 6px' }}>{r.start_number}</td>
                                    <td style={{ padding: '8px 6px' }}>{r.digits}</td>
                                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>{r.prefix}{r.separator}{String(r.start_number).padStart(r.digits, '0')}</td>
                                    <td style={{ padding: '8px 6px' }}>
                                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: r.is_active ? 'var(--accent-green-bg, #d4edda)' : 'var(--bg-tertiary)', color: r.is_active ? 'var(--accent-green, #28a745)' : 'var(--text-muted)' }}>
                                            {r.is_active ? (zh ? '啟用' : 'Active') : (zh ? '停用' : 'Inactive')}
                                        </span>
                                    </td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                        <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: '11px', marginRight: '4px' }} onClick={() => startEdit(r)}>✏️</button>
                                        <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--accent-red)' }} onClick={() => deleteRule(r.id)}>✕</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* ─── Tab 3: Leave Without Pay ─── */
function LeaveWithoutPayTab({ zh, orgId, employees }: { zh: boolean; orgId: string; employees: UserRecord[] }) {
    const [records, setRecords] = useState<LeaveRecord[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ user_id: '', start_date: '', end_date: '', reason: '', status: 'active' });

    useEffect(() => { loadRecords(); }, [orgId]);

    const loadRecords = async () => {
        const { data } = await supabase.from('leave_without_pay')
            .select('*, user:user_id(name)')
            .eq('org_id', orgId)
            .order('start_date', { ascending: false });
        setRecords((data as any) || []);
    };

    const saveRecord = async () => {
        if (!form.user_id || !form.start_date) return;
        const payload = {
            org_id: orgId,
            user_id: form.user_id,
            start_date: form.start_date,
            end_date: form.end_date || null,
            reason: form.reason || null,
            status: form.status,
        };
        if (editId) {
            await supabase.from('leave_without_pay').update(payload).eq('id', editId);
        } else {
            await supabase.from('leave_without_pay').insert(payload);
        }
        setForm({ user_id: '', start_date: '', end_date: '', reason: '', status: 'active' });
        setShowForm(false); setEditId(null);
        await loadRecords();
    };

    const deleteRecord = async (id: string) => {
        if (!confirm(zh ? '確定刪除此紀錄？' : 'Delete this record?')) return;
        await supabase.from('leave_without_pay').delete().eq('id', id);
        await loadRecords();
    };

    const startEdit = (r: LeaveRecord) => {
        setEditId(r.id);
        setForm({ user_id: r.user_id, start_date: r.start_date, end_date: r.end_date || '', reason: r.reason || '', status: r.status });
        setShowForm(true);
    };

    const statusLabel = (s: string) => {
        const map: Record<string, string> = { active: zh ? '留停中' : 'Active', ended: zh ? '已結束' : 'Ended' };
        return map[s] || s;
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {zh ? `共 ${records.length} 筆紀錄` : `${records.length} record(s)`}
                </span>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm({ user_id: '', start_date: '', end_date: '', reason: '', status: 'active' }); }}>
                    {zh ? '新增留停紀錄' : 'Add Leave Record'}
                </button>
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                        {editId ? (zh ? '編輯留停紀錄' : 'Edit Leave Record') : (zh ? '新增留停紀錄' : 'Add Leave Record')}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{zh ? '員工' : 'Employee'} *</label>
                            <select className="input-field" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}>
                                <option value="">{zh ? '-- 選擇員工 --' : '-- Select Employee --'}</option>
                                {employees.filter(e => e.status === 'active').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '開始日期' : 'Start Date'} *</label>
                            <input className="input-field" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '結束日期' : 'End Date'}</label>
                            <input className="input-field" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                            <select className="input-field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                <option value="active">{zh ? '留停中' : 'Active'}</option>
                                <option value="ended">{zh ? '已結束' : 'Ended'}</option>
                            </select>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="detail-label">{zh ? '原因' : 'Reason'}</label>
                            <input className="input-field" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder={zh ? '留停原因' : 'Reason for leave'} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                        <button className="btn btn-primary" onClick={saveRecord}>{zh ? '儲存' : 'Save'}</button>
                        <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditId(null); }}>{zh ? '取消' : 'Cancel'}</button>
                    </div>
                </div>
            )}

            {records.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '無留職停薪紀錄' : 'No leave without pay records'}
                </div>
            ) : (
                <div className="card">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '員工' : 'Employee'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '開始日期' : 'Start'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '結束日期' : 'End'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '原因' : 'Reason'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '狀態' : 'Status'}</th>
                                    <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>{zh ? '操作' : 'Actions'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '8px 6px' }}>{(r.user as any)?.name || '-'}</td>
                                        <td style={{ padding: '8px 6px' }}>{r.start_date}</td>
                                        <td style={{ padding: '8px 6px' }}>{r.end_date || '-'}</td>
                                        <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{r.reason || '-'}</td>
                                        <td style={{ padding: '8px 6px' }}>
                                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: r.status === 'active' ? '#fff3cd' : 'var(--bg-tertiary)', color: r.status === 'active' ? '#856404' : 'var(--text-muted)' }}>
                                                {statusLabel(r.status)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                            <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: '11px', marginRight: '4px' }} onClick={() => startEdit(r)}>✏️</button>
                                            <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--accent-red)' }} onClick={() => deleteRecord(r.id)}>✕</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Tab 4: Roster Query ─── */
function RosterQueryTab({ zh, orgId, stores, employees }: { zh: boolean; orgId: string; stores: Store[]; employees: UserRecord[] }) {
    const [filters, setFilters] = useState({ store_id: '', department: '', employee_type: '', status: '', hire_from: '', hire_to: '', keyword: '' });
    const [results, setResults] = useState<UserRecord[]>([]);
    const [searched, setSearched] = useState(false);

    const search = async () => {
        let q = supabase.from('users')
            .select('id, name, email, employee_type, store_id, position, status, employee_number, gender, birth_date, id_number, hire_date, department, store:store_id(name)')
            .eq('organization_id', orgId);
        if (filters.store_id) q = q.eq('store_id', filters.store_id);
        if (filters.department) q = q.ilike('department', `%${filters.department}%`);
        if (filters.employee_type) q = q.eq('employee_type', filters.employee_type);
        if (filters.status) q = q.eq('status', filters.status);
        if (filters.hire_from) q = q.gte('hire_date', filters.hire_from);
        if (filters.hire_to) q = q.lte('hire_date', filters.hire_to);
        if (filters.keyword) q = q.or(`name.ilike.%${filters.keyword}%,email.ilike.%${filters.keyword}%,employee_number.ilike.%${filters.keyword}%`);
        const { data } = await q.order('name');
        setResults((data as any) || []);
        setSearched(true);
    };

    const exportCSV = () => {
        if (results.length === 0) return;
        const headers = [
            zh ? '員工編號' : 'Employee No.',
            zh ? '姓名' : 'Name',
            zh ? '電子郵件' : 'Email',
            zh ? '類型' : 'Type',
            zh ? '門市' : 'Store',
            zh ? '部門' : 'Department',
            zh ? '職位' : 'Position',
            zh ? '狀態' : 'Status',
            zh ? '入職日期' : 'Hire Date',
        ];
        const typeLabel = (t: string) => ({ full_time: zh ? '全職' : 'Full-time', part_time: zh ? '兼職' : 'Part-time', contract: zh ? '約聘' : 'Contract' }[t] || t);
        const rows = results.map(u => [
            u.employee_number || '',
            u.name,
            u.email || '',
            typeLabel(u.employee_type),
            (u.store as any)?.name || '',
            u.department || '',
            u.position || '',
            u.status,
            u.hire_date || '',
        ]);
        const bom = '\uFEFF';
        const csv = bom + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `employee_roster_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    const typeLabel = (t: string) => ({ full_time: zh ? '全職' : 'Full-time', part_time: zh ? '兼職' : 'Part-time', contract: zh ? '約聘' : 'Contract' }[t] || t);

    return (
        <div>
            <div className="card" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                    {zh ? '進階搜尋' : 'Advanced Search'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                    <div>
                        <label className="detail-label">{zh ? '關鍵字' : 'Keyword'}</label>
                        <input className="input-field" value={filters.keyword} onChange={e => setFilters({ ...filters, keyword: e.target.value })} placeholder={zh ? '姓名/郵件/編號' : 'Name/Email/No.'} />
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '門市' : 'Store'}</label>
                        <select className="input-field" value={filters.store_id} onChange={e => setFilters({ ...filters, store_id: e.target.value })}>
                            <option value="">{zh ? '全部' : 'All'}</option>
                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '部門' : 'Department'}</label>
                        <input className="input-field" value={filters.department} onChange={e => setFilters({ ...filters, department: e.target.value })} placeholder={zh ? '部門名稱' : 'Department'} />
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '員工類型' : 'Type'}</label>
                        <select className="input-field" value={filters.employee_type} onChange={e => setFilters({ ...filters, employee_type: e.target.value })}>
                            <option value="">{zh ? '全部' : 'All'}</option>
                            <option value="full_time">{zh ? '全職' : 'Full-time'}</option>
                            <option value="part_time">{zh ? '兼職' : 'Part-time'}</option>
                            <option value="contract">{zh ? '約聘' : 'Contract'}</option>
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                        <select className="input-field" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
                            <option value="">{zh ? '全部' : 'All'}</option>
                            <option value="active">{zh ? '在職' : 'Active'}</option>
                            <option value="inactive">{zh ? '離職' : 'Inactive'}</option>
                        </select>
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '入職日期（起）' : 'Hire From'}</label>
                        <input className="input-field" type="date" value={filters.hire_from} onChange={e => setFilters({ ...filters, hire_from: e.target.value })} />
                    </div>
                    <div>
                        <label className="detail-label">{zh ? '入職日期（迄）' : 'Hire To'}</label>
                        <input className="input-field" type="date" value={filters.hire_to} onChange={e => setFilters({ ...filters, hire_to: e.target.value })} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button className="btn btn-primary" onClick={search}>{zh ? '搜尋' : 'Search'}</button>
                    <button className="btn btn-secondary" onClick={() => setFilters({ store_id: '', department: '', employee_type: '', status: '', hire_from: '', hire_to: '', keyword: '' })}>{zh ? '清除篩選' : 'Clear Filters'}</button>
                    {results.length > 0 && (
                        <button className="btn btn-secondary" onClick={exportCSV} style={{ marginLeft: 'auto' }}>
                            {zh ? '匯出 CSV' : 'Export CSV'}
                        </button>
                    )}
                </div>
            </div>

            {searched && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {zh ? `找到 ${results.length} 筆結果` : `${results.length} result(s) found`}
                        </span>
                    </div>
                    {results.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>{zh ? '無符合條件的員工' : 'No matching employees'}</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '編號' : 'No.'}</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '姓名' : 'Name'}</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '類型' : 'Type'}</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '門市' : 'Store'}</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '部門' : 'Dept'}</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '職位' : 'Position'}</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '狀態' : 'Status'}</th>
                                        <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '入職日期' : 'Hire Date'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map(u => (
                                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '8px 6px' }}>{u.employee_number || '-'}</td>
                                            <td style={{ padding: '8px 6px', fontWeight: 500 }}>{u.name}</td>
                                            <td style={{ padding: '8px 6px' }}>{typeLabel(u.employee_type)}</td>
                                            <td style={{ padding: '8px 6px' }}>{(u.store as any)?.name || '-'}</td>
                                            <td style={{ padding: '8px 6px' }}>{u.department || '-'}</td>
                                            <td style={{ padding: '8px 6px' }}>{u.position || '-'}</td>
                                            <td style={{ padding: '8px 6px' }}>
                                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: u.status === 'active' ? 'var(--accent-green-bg, #d4edda)' : '#f8d7da', color: u.status === 'active' ? 'var(--accent-green, #28a745)' : '#721c24' }}>
                                                    {u.status === 'active' ? (zh ? '在職' : 'Active') : (zh ? '離職' : 'Inactive')}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 6px' }}>{u.hire_date || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ─── Tab 5: Labor Roster ─── */
function LaborRosterTab({ zh, orgId, employees }: { zh: boolean; orgId: string; employees: UserRecord[] }) {
    const [roster, setRoster] = useState<UserRecord[]>([]);

    useEffect(() => { loadRoster(); }, [orgId]);

    const loadRoster = async () => {
        const { data } = await supabase.from('users')
            .select('id, name, email, employee_type, store_id, position, status, employee_number, gender, birth_date, id_number, hire_date, department, store:store_id(name)')
            .eq('organization_id', orgId)
            .eq('status', 'active')
            .order('employee_number');
        setRoster((data as any) || []);
    };

    const maskId = (id: string | null) => {
        if (!id || id.length < 4) return id || '-';
        return id.slice(0, 3) + '****' + id.slice(-3);
    };

    const genderLabel = (g: string | null) => {
        if (!g) return '-';
        const map: Record<string, string> = { male: zh ? '男' : 'Male', female: zh ? '女' : 'Female', other: zh ? '其他' : 'Other' };
        return map[g] || g;
    };

    const printRoster = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const title = zh ? '勞工名冊' : 'Labor Roster';
        const headers = [
            zh ? '員工編號' : 'No.',
            zh ? '姓名' : 'Name',
            zh ? '性別' : 'Gender',
            zh ? '出生日期' : 'Birth Date',
            zh ? '身分證字號' : 'ID Number',
            zh ? '入職日期' : 'Hire Date',
            zh ? '職位' : 'Position',
        ];
        const rows = roster.map(u => `<tr>${[
            u.employee_number || '-',
            u.name,
            genderLabel(u.gender),
            u.birth_date || '-',
            maskId(u.id_number),
            u.hire_date || '-',
            u.position || '-',
        ].map(c => `<td style="border:1px solid #ccc;padding:6px 8px">${c}</td>`).join('')}</tr>`).join('');
        printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th{background:#f5f5f5;border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px}td{font-size:13px}h1{font-size:18px}</style></head><body><h1>${title}</h1><p>${new Date().toLocaleDateString()}</p><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></body></html>`);
        printWindow.document.close();
        printWindow.print();
    };

    const exportCSV = () => {
        if (roster.length === 0) return;
        const headers = [
            zh ? '員工編號' : 'Employee No.',
            zh ? '姓名' : 'Name',
            zh ? '性別' : 'Gender',
            zh ? '出生日期' : 'Birth Date',
            zh ? '身分證字號' : 'ID Number',
            zh ? '入職日期' : 'Hire Date',
            zh ? '職位' : 'Position',
            zh ? '門市' : 'Store',
        ];
        const rows = roster.map(u => [
            u.employee_number || '', u.name, genderLabel(u.gender), u.birth_date || '',
            maskId(u.id_number), u.hire_date || '', u.position || '', (u.store as any)?.name || '',
        ]);
        const bom = '\uFEFF';
        const csv = bom + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `labor_roster_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {zh ? `在職員工 ${roster.length} 人` : `${roster.length} active employee(s)`}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={exportCSV}>{zh ? '匯出 CSV' : 'Export CSV'}</button>
                    <button className="btn btn-primary" onClick={printRoster}>{zh ? '列印名冊' : 'Print Roster'}</button>
                </div>
            </div>

            {roster.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '無在職員工資料' : 'No active employee data'}
                </div>
            ) : (
                <div className="card">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '員工編號' : 'No.'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '姓名' : 'Name'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '性別' : 'Gender'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '出生日期' : 'Birth Date'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '身分證字號' : 'ID Number'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '入職日期' : 'Hire Date'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '職位' : 'Position'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '門市' : 'Store'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roster.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '8px 6px', fontWeight: 500 }}>{u.employee_number || '-'}</td>
                                        <td style={{ padding: '8px 6px' }}>{u.name}</td>
                                        <td style={{ padding: '8px 6px' }}>{genderLabel(u.gender)}</td>
                                        <td style={{ padding: '8px 6px' }}>{u.birth_date || '-'}</td>
                                        <td style={{ padding: '8px 6px', fontFamily: 'monospace' }}>{maskId(u.id_number)}</td>
                                        <td style={{ padding: '8px 6px' }}>{u.hire_date || '-'}</td>
                                        <td style={{ padding: '8px 6px' }}>{u.position || '-'}</td>
                                        <td style={{ padding: '8px 6px' }}>{(u.store as any)?.name || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Tab 6: Labor Contracts ─── */
function LaborContractsTab({ zh, orgId, employees }: { zh: boolean; orgId: string; employees: UserRecord[] }) {
    const [contracts, setContracts] = useState<LaborContract[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ user_id: '', contract_type: 'indefinite', start_date: '', end_date: '', terms: '', file_url: '', status: 'active' });

    useEffect(() => { loadContracts(); }, [orgId]);

    const loadContracts = async () => {
        const { data } = await supabase.from('labor_contracts')
            .select('*, user:user_id(name)')
            .eq('org_id', orgId)
            .order('start_date', { ascending: false });
        setContracts((data as any) || []);
    };

    const saveContract = async () => {
        if (!form.user_id || !form.start_date) return;
        const payload = {
            org_id: orgId,
            user_id: form.user_id,
            contract_type: form.contract_type,
            start_date: form.start_date,
            end_date: form.end_date || null,
            terms: form.terms || null,
            file_url: form.file_url || null,
            status: form.status,
        };
        if (editId) {
            await supabase.from('labor_contracts').update(payload).eq('id', editId);
        } else {
            await supabase.from('labor_contracts').insert(payload);
        }
        setForm({ user_id: '', contract_type: 'indefinite', start_date: '', end_date: '', terms: '', file_url: '', status: 'active' });
        setShowForm(false); setEditId(null);
        await loadContracts();
    };

    const deleteContract = async (id: string) => {
        if (!confirm(zh ? '確定刪除此契約？' : 'Delete this contract?')) return;
        await supabase.from('labor_contracts').delete().eq('id', id);
        await loadContracts();
    };

    const startEdit = (c: LaborContract) => {
        setEditId(c.id);
        setForm({
            user_id: c.user_id, contract_type: c.contract_type, start_date: c.start_date,
            end_date: c.end_date || '', terms: c.terms || '', file_url: c.file_url || '', status: c.status,
        });
        setShowForm(true);
    };

    const contractTypeLabel = (t: string) => {
        const map: Record<string, string> = {
            definite: zh ? '定期' : 'Fixed-term',
            indefinite: zh ? '不定期' : 'Indefinite',
        };
        return map[t] || t;
    };

    const statusLabel = (s: string) => {
        const map: Record<string, string> = {
            active: zh ? '有效' : 'Active',
            expired: zh ? '已到期' : 'Expired',
            terminated: zh ? '已終止' : 'Terminated',
        };
        return map[s] || s;
    };

    const statusColor = (s: string) => {
        switch (s) {
            case 'active': return { bg: 'var(--accent-green-bg, #d4edda)', color: 'var(--accent-green, #28a745)' };
            case 'expired': return { bg: '#fff3cd', color: '#856404' };
            case 'terminated': return { bg: '#f8d7da', color: '#721c24' };
            default: return { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' };
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {zh ? `共 ${contracts.length} 份契約` : `${contracts.length} contract(s)`}
                </span>
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm({ user_id: '', contract_type: 'indefinite', start_date: '', end_date: '', terms: '', file_url: '', status: 'active' }); }}>
                    {zh ? '新增契約' : 'Add Contract'}
                </button>
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
                        {editId ? (zh ? '編輯契約' : 'Edit Contract') : (zh ? '新增勞動契約' : 'Add Labor Contract')}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                        <div>
                            <label className="detail-label">{zh ? '員工' : 'Employee'} *</label>
                            <select className="input-field" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}>
                                <option value="">{zh ? '-- 選擇員工 --' : '-- Select Employee --'}</option>
                                {employees.filter(e => e.status === 'active').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '契約類型' : 'Contract Type'}</label>
                            <select className="input-field" value={form.contract_type} onChange={e => setForm({ ...form, contract_type: e.target.value })}>
                                <option value="indefinite">{zh ? '不定期' : 'Indefinite'}</option>
                                <option value="definite">{zh ? '定期' : 'Fixed-term'}</option>
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '開始日期' : 'Start Date'} *</label>
                            <input className="input-field" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '結束日期' : 'End Date'}</label>
                            <input className="input-field" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '狀態' : 'Status'}</label>
                            <select className="input-field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                <option value="active">{zh ? '有效' : 'Active'}</option>
                                <option value="expired">{zh ? '已到期' : 'Expired'}</option>
                                <option value="terminated">{zh ? '已終止' : 'Terminated'}</option>
                            </select>
                        </div>
                        <div>
                            <label className="detail-label">{zh ? '檔案連結' : 'File URL'}</label>
                            <input className="input-field" value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })} placeholder="https://..." />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="detail-label">{zh ? '條款備註' : 'Terms / Notes'}</label>
                            <input className="input-field" value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} placeholder={zh ? '契約條款或備註' : 'Contract terms or notes'} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                        <button className="btn btn-primary" onClick={saveContract}>{zh ? '儲存' : 'Save'}</button>
                        <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditId(null); }}>{zh ? '取消' : 'Cancel'}</button>
                    </div>
                </div>
            )}

            {contracts.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {zh ? '無勞動契約資料' : 'No labor contracts'}
                </div>
            ) : (
                <div className="card">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '員工' : 'Employee'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '契約類型' : 'Type'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '開始日期' : 'Start'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '結束日期' : 'End'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '條款' : 'Terms'}</th>
                                    <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 600 }}>{zh ? '狀態' : 'Status'}</th>
                                    <th style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>{zh ? '操作' : 'Actions'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contracts.map(c => {
                                    const sc = statusColor(c.status);
                                    return (
                                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '8px 6px', fontWeight: 500 }}>{(c.user as any)?.name || '-'}</td>
                                            <td style={{ padding: '8px 6px' }}>{contractTypeLabel(c.contract_type)}</td>
                                            <td style={{ padding: '8px 6px' }}>{c.start_date}</td>
                                            <td style={{ padding: '8px 6px' }}>{c.end_date || '-'}</td>
                                            <td style={{ padding: '8px 6px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {c.terms || '-'}
                                            </td>
                                            <td style={{ padding: '8px 6px' }}>
                                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: sc.bg, color: sc.color }}>
                                                    {statusLabel(c.status)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                {c.file_url && (
                                                    <a href={c.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', marginRight: '6px', color: 'var(--accent-primary)' }}>
                                                        {zh ? '檔案' : 'File'}
                                                    </a>
                                                )}
                                                <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: '11px', marginRight: '4px' }} onClick={() => startEdit(c)}>✏️</button>
                                                <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: '11px', color: 'var(--accent-red)' }} onClick={() => deleteContract(c.id)}>✕</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
